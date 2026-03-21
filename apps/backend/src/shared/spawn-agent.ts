// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { AgentProcessType, AgentAdapter } from '@opentidy/shared';
import { createAgentSemaphore } from './agent-semaphore.js';

interface SpawnAgentDeps {
  adapter: AgentAdapter;
  tracker?: {
    start(type: AgentProcessType, taskId?: string, pid?: number, description?: string): number;
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
  taskId?: string;
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
    const { args, cwd, type, taskId, description, onOutput } = opts;

    const trackId = deps.tracker?.start(type, taskId, undefined, description);

    let outputPath: string | undefined;
    if (deps.outputDir && trackId != null) {
      fs.mkdirSync(deps.outputDir, { recursive: true });
      const filename = taskId ? `${taskId}.jsonl` : `${type}-${trackId}.txt`;
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

      console.log(`[spawn-agent] starting ${type}${taskId ? ` (${taskId})` : ''} [${adapter.name}]`);

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
              data: { trackId, processType: type, taskId, content: text },
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
            console.log(`[spawn-agent] ${type} completed${taskId ? ` (${taskId})` : ''}`);
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
          console.log(`[spawn-agent] killing ${type}${taskId ? ` (${taskId})` : ''}`);
          proc.kill('SIGTERM');
        }
      },
      get pid() { return proc?.pid; },
      trackId: trackId ?? undefined,
    };
  };
}
