// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { AgentProcessType } from '@opentidy/shared';
import type { AgentAdapter } from './agents/types.js';
import { createAgentSemaphore } from './agent-semaphore.js';

interface SpawnAgentDeps {
  adapter: AgentAdapter;
  tracker?: {
    start(type: AgentProcessType, dossierId?: string, pid?: number, description?: string): number;
    markRunning?(id: number, pid?: number): void;
    complete(id: number, exitCode: number): void;
    fail(id: number): void;
    setOutputPath?(id: number, path: string): void;
  };
  sse?: {
    emit(event: { type: string; data: Record<string, unknown>; timestamp: string }): void;
  };
  outputDir?: string;
  maxConcurrent?: number;
}

export interface SpawnAgentOptions {
  args: string[];
  cwd: string;
  type: AgentProcessType;
  dossierId?: string;
  description?: string;
  onOutput?: (chunk: string) => void;
}

export interface SpawnAgentHandle {
  promise: Promise<string>;
  kill: () => void;
  pid: number | undefined;
  trackId: number | undefined;
}

export type SpawnAgentFn = (opts: SpawnAgentOptions) => SpawnAgentHandle;

export function createSpawnAgent(deps: SpawnAgentDeps): SpawnAgentFn {
  const semaphore = createAgentSemaphore(deps.maxConcurrent ?? 3);
  const { adapter } = deps;

  return function spawnAgent(opts: SpawnAgentOptions): SpawnAgentHandle {
    const { args, cwd, type, dossierId, description, onOutput } = opts;

    const trackId = deps.tracker?.start(type, dossierId, undefined, description);

    let outputPath: string | undefined;
    if (deps.outputDir && trackId != null) {
      fs.mkdirSync(deps.outputDir, { recursive: true });
      const filename = dossierId ? `${dossierId}.jsonl` : `${type}-${trackId}.txt`;
      outputPath = path.join(deps.outputDir, filename);
      fs.writeFileSync(outputPath, '');
      deps.tracker?.setOutputPath?.(trackId, outputPath);
    }

    let proc: ReturnType<typeof spawn> | null = null;
    let killed = false;

    const promise = (async () => {
      await semaphore.acquire();
      if (killed) {
        semaphore.release();
        throw new Error('Process killed before start');
      }

      console.log(`[spawn-agent] starting ${type}${dossierId ? ` (${dossierId})` : ''} [${adapter.name}]`);

      return new Promise<string>((resolve, reject) => {
        const agentEnv = adapter.getEnv();
        proc = spawn(adapter.binary, args, {
          cwd,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, ...agentEnv },
        });

        if (trackId != null) deps.tracker?.markRunning?.(trackId, proc.pid);
        let stdout = '';
        let stderr = '';

        proc.stdout!.on('data', (chunk: Buffer) => {
          const text = chunk.toString();
          stdout += text;
          if (outputPath) {
            try { fs.appendFileSync(outputPath, text); } catch {}
          }
          if (deps.sse && trackId != null) {
            deps.sse.emit({
              type: 'process:output',
              data: { trackId, processType: type, dossierId, content: text },
              timestamp: new Date().toISOString(),
            });
          }
          if (onOutput) onOutput(text);
        });

        proc.stderr!.on('data', (chunk: Buffer) => {
          stderr += chunk.toString();
        });

        proc.on('close', (code) => {
          semaphore.release();
          if (code !== 0 && !killed) {
            if (trackId != null) deps.tracker?.fail(trackId);
            console.error(`[spawn-agent] ${type} failed (code ${code}): ${stderr.slice(0, 200)}`);
            reject(new Error(`${adapter.binary} exited ${code}: ${stderr}`));
          } else {
            if (trackId != null) deps.tracker?.complete(trackId, code ?? 0);
            console.log(`[spawn-agent] ${type} completed${dossierId ? ` (${dossierId})` : ''}`);
            resolve(stdout);
          }
        });

        proc.on('error', (err) => {
          semaphore.release();
          if (trackId != null) deps.tracker?.fail(trackId);
          console.error(`[spawn-agent] ${type} spawn error:`, err.message);
          reject(err);
        });
      });
    })();

    return {
      promise,
      kill: () => {
        killed = true;
        if (proc && !proc.killed) {
          console.log(`[spawn-agent] killing ${type}${dossierId ? ` (${dossierId})` : ''}`);
          proc.kill('SIGTERM');
        }
      },
      get pid() { return proc?.pid; },
      trackId: trackId ?? undefined,
    };
  };
}

export function createSpawnAgentSimple(deps: SpawnAgentDeps): (opts: SpawnAgentOptions) => Promise<string> {
  const spawnAgent = createSpawnAgent(deps);
  return (opts) => spawnAgent(opts).promise;
}
