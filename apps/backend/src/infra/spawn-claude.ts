import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { ClaudeProcessType } from '@opentidy/shared';
import { createClaudeSemaphore, type ClaudeSemaphore } from './claude-semaphore.js';

interface SpawnClaudeDeps {
  tracker?: {
    start(type: ClaudeProcessType, dossierId?: string, pid?: number, description?: string): number;
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
  claudeConfigDir?: string;
}

export interface SpawnClaudeOptions {
  args: string[];
  cwd: string;
  type: ClaudeProcessType;
  dossierId?: string;
  description?: string;
  /** Callback for each stdout chunk (raw text) */
  onOutput?: (chunk: string) => void;
}

export interface SpawnClaudeHandle {
  /** Resolves with full stdout when process exits with code 0 */
  promise: Promise<string>;
  /** Kill the process */
  kill: () => void;
  /** Process PID (available after spawn) */
  pid: number | undefined;
  /** Tracker ID in SQLite */
  trackId: number | undefined;
}

export type SpawnClaudeFn = (opts: SpawnClaudeOptions) => SpawnClaudeHandle;

/** Simplified signature for callers that just need Promise<string> (triage, title, checkup, memory) */
export type SpawnClaudeSimpleFn = (opts: SpawnClaudeOptions) => Promise<string>;

export function createSpawnClaude(deps: SpawnClaudeDeps): SpawnClaudeFn {
  const semaphore = createClaudeSemaphore(deps.maxConcurrent ?? 3);

  return function spawnClaude(opts: SpawnClaudeOptions): SpawnClaudeHandle {
    const { args, cwd, type, dossierId, description, onOutput } = opts;

    // Track immediately (status = queued/running)
    const trackId = deps.tracker?.start(type, dossierId, undefined, description);

    // Create output file
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
      // Wait for semaphore slot
      await semaphore.acquire();
      if (killed) {
        semaphore.release();
        throw new Error('Process killed before start');
      }

      console.log(`[spawn-claude] starting ${type}${dossierId ? ` (${dossierId})` : ''}`);

      return new Promise<string>((resolve, reject) => {
        proc = spawn('claude', args, {
          cwd,
          stdio: ['ignore', 'pipe', 'pipe'],
          ...(deps.claudeConfigDir ? { env: { ...process.env, CLAUDE_CONFIG_DIR: deps.claudeConfigDir } } : {}),
        });

        // Mark as running now that we have a PID
        if (trackId != null) deps.tracker?.markRunning?.(trackId, proc.pid);
        let stdout = '';
        let stderr = '';

        proc.stdout!.on('data', (chunk: Buffer) => {
          const text = chunk.toString();
          stdout += text;

          // Append to file
          if (outputPath) {
            try { fs.appendFileSync(outputPath, text); } catch {}
          }

          // SSE emit
          if (deps.sse && trackId != null) {
            deps.sse.emit({
              type: 'process:output',
              data: { trackId, processType: type, dossierId, content: text },
              timestamp: new Date().toISOString(),
            });
          }

          // Caller callback
          if (onOutput) onOutput(text);
        });

        proc.stderr!.on('data', (chunk: Buffer) => {
          stderr += chunk.toString();
        });

        proc.on('close', (code) => {
          semaphore.release();
          if (code !== 0 && !killed) {
            if (trackId != null) deps.tracker?.fail(trackId);
            console.error(`[spawn-claude] ${type} failed (code ${code}): ${stderr.slice(0, 200)}`);
            reject(new Error(`claude exited ${code}: ${stderr}`));
          } else {
            if (trackId != null) deps.tracker?.complete(trackId, code ?? 0);
            console.log(`[spawn-claude] ${type} completed${dossierId ? ` (${dossierId})` : ''}`);
            resolve(stdout);
          }
        });

        proc.on('error', (err) => {
          semaphore.release();
          if (trackId != null) deps.tracker?.fail(trackId);
          console.error(`[spawn-claude] ${type} spawn error:`, err.message);
          reject(err);
        });
      });
    })();

    return {
      promise,
      kill: () => {
        killed = true;
        if (proc && !proc.killed) {
          console.log(`[spawn-claude] killing ${type}${dossierId ? ` (${dossierId})` : ''}`);
          proc.kill('SIGTERM');
        }
      },
      get pid() { return proc?.pid; },
      trackId: trackId ?? undefined,
    };
  };
}

/** Convenience: for callers that just want await (triage, title, etc.) */
export function createSpawnClaudeSimple(deps: SpawnClaudeDeps): (opts: SpawnClaudeOptions) => Promise<string> {
  const spawnClaude = createSpawnClaude(deps);
  return (opts) => spawnClaude(opts).promise;
}

export function getSemaphoreStatus(deps: SpawnClaudeDeps): { running: number; queued: number; max: number } | null {
  return null; // TODO: expose from the singleton
}
