// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

// tests/launcher/checkup.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCheckup } from './sweep.js';
import type { MemoryEntry } from '@opentidy/shared';
import fs from 'fs';
import path from 'path';
import os from 'os';

function makeMockAdapter() {
  return {
    name: 'claude' as const,
    binary: 'claude',
    instructionFile: 'CLAUDE.md',
    configEnvVar: 'CLAUDE_CONFIG_DIR',
    experimental: false,
    buildArgs: vi.fn(({ systemPrompt, instruction }: any) => ['-p', '--system-prompt', systemPrompt, instruction]),
    getEnv: vi.fn(() => ({})),
    readSessionId: vi.fn(() => null),
    writeConfig: vi.fn(),
  };
}

function makeMockSpawnAgent(response: string) {
  return vi.fn().mockReturnValue({
    promise: Promise.resolve(response),
    kill: vi.fn(),
    pid: undefined,
    trackId: undefined,
  });
}

describe('Checkup', () => {
  let wsDir: string;

  beforeEach(() => {
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentidy-ws-'));
    // Create a few tasks
    for (const id of ['invoices-acme', 'insurance-report']) {
      const dir = path.join(wsDir, id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'state.md'), `# ${id}\nSTATUS : IN_PROGRESS`);
    }
    fs.mkdirSync(path.join(wsDir, '_suggestions'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(wsDir, { recursive: true, force: true });
  });

  function makeMockLauncher(activeTaskIds: string[] = []) {
    return {
      launchSession: vi.fn().mockResolvedValue(undefined),
      listActiveSessions: vi.fn().mockReturnValue(activeTaskIds.map(id => ({ taskId: id }))),
    };
  }

  // E2E-CRN-01
  it('launches sessions for tasks returned by Claude', async () => {
    const mockLauncher = makeMockLauncher();
    const checkup = createCheckup({
      launcher: mockLauncher,
      workspaceDir: wsDir,
      intervalMs: 3600_000,
      spawnAgent: makeMockSpawnAgent(JSON.stringify({ launch: ['invoices-acme'], suggestions: [] })),
      adapter: makeMockAdapter(),
    });
    const result = await checkup.runCheckup();
    expect(mockLauncher.launchSession).toHaveBeenCalledWith('invoices-acme');
    expect(result.launched).toEqual(['invoices-acme']);
  });

  it('skips active sessions instead of sending messages', async () => {
    const mockLauncher = makeMockLauncher(['invoices-acme']);
    const checkup = createCheckup({
      launcher: mockLauncher,
      workspaceDir: wsDir,
      intervalMs: 3600_000,
      spawnAgent: makeMockSpawnAgent(JSON.stringify({ launch: ['invoices-acme'], suggestions: [] })),
      adapter: makeMockAdapter(),
    });
    const result = await checkup.runCheckup();
    expect(mockLauncher.launchSession).not.toHaveBeenCalled();
    expect(result.launched).toEqual([]);
  });

  it('launches inactive task and skips active task', async () => {
    const mockLauncher = makeMockLauncher(['invoices-acme']);
    const checkup = createCheckup({
      launcher: mockLauncher,
      workspaceDir: wsDir,
      intervalMs: 3600_000,
      spawnAgent: makeMockSpawnAgent(JSON.stringify({ launch: ['invoices-acme', 'insurance-report'], suggestions: [] })),
      adapter: makeMockAdapter(),
    });
    const result = await checkup.runCheckup();
    expect(mockLauncher.launchSession).toHaveBeenCalledWith('insurance-report');
    expect(mockLauncher.launchSession).not.toHaveBeenCalledWith('invoices-acme');
    expect(result.launched).toEqual(['insurance-report']);
  });

  // E2E-CRN-05
  it('checkup calls writeSuggestion for suggestions', async () => {
    const mockLauncher = makeMockLauncher();
    const mockWriteSuggestion = vi.fn().mockReturnValue('timesheet-manquant-abc123');
    const checkup = createCheckup({
      launcher: mockLauncher,
      workspaceDir: wsDir,
      intervalMs: 3600_000,
      spawnAgent: makeMockSpawnAgent(JSON.stringify({
        launch: [],
        suggestions: [{ title: 'Timesheet manquant', urgency: 'normal', why: 'Pas de timesheet juin' }],
      })),
      adapter: makeMockAdapter(),
      writeSuggestion: mockWriteSuggestion,
    });

    const result = await checkup.runCheckup();
    expect(result.suggestions).toBe(1);
    expect(mockWriteSuggestion).toHaveBeenCalledWith(
      { title: 'Timesheet manquant', urgency: 'normal', why: 'Pas de timesheet juin' },
      'checkup',
    );
  });

  // E2E-CRN-02, E2E-LCH-08
  it('skips locked tasks (lock checked by launcher internally)', async () => {
    const mockLauncher = makeMockLauncher();
    const checkup = createCheckup({
      launcher: mockLauncher,
      workspaceDir: wsDir,
      intervalMs: 3600_000,
      spawnAgent: makeMockSpawnAgent(JSON.stringify({ launch: ['invoices-acme'], suggestions: [] })),
      adapter: makeMockAdapter(),
    });
    const result = await checkup.runCheckup();
    expect(mockLauncher.launchSession).toHaveBeenCalledWith('invoices-acme');
    expect(result.launched).toEqual(['invoices-acme']);
  });

  // E2E-CRN-06
  it('does nothing when no tasks need action', async () => {
    const mockLauncher = makeMockLauncher();
    const checkup = createCheckup({
      launcher: mockLauncher,
      workspaceDir: wsDir,
      intervalMs: 3600_000,
      spawnAgent: makeMockSpawnAgent(JSON.stringify({ launch: [], suggestions: [] })),
      adapter: makeMockAdapter(),
    });
    const result = await checkup.runCheckup();
    expect(mockLauncher.launchSession).not.toHaveBeenCalled();
    expect(result.launched).toEqual([]);
    expect(result.suggestions).toBe(0);
  });

  it('getStatus includes nextRun', () => {
    const mockLauncher = makeMockLauncher();
    const checkup = createCheckup({
      launcher: mockLauncher,
      workspaceDir: wsDir,
      intervalMs: 3600_000,
      spawnAgent: makeMockSpawnAgent('{}'),
      adapter: makeMockAdapter(),
    });
    const status = checkup.getStatus();
    expect(status.nextRun).toBeTruthy();
    expect(status.result).toBe('pending');
  });

  it('nextRun updates after runCheckup', async () => {
    const mockLauncher = makeMockLauncher();
    const checkup = createCheckup({
      launcher: mockLauncher,
      workspaceDir: wsDir,
      intervalMs: 3600_000,
      spawnAgent: makeMockSpawnAgent(JSON.stringify({ launch: [], suggestions: [] })),
      adapter: makeMockAdapter(),
    });
    await checkup.runCheckup();
    const afterRun = checkup.getStatus();
    expect(afterRun.lastRun).toBeTruthy();
    expect(afterRun.nextRun).toBeTruthy();
    // nextRun should be ~1h after lastRun
    const diff = new Date(afterRun.nextRun!).getTime() - new Date(afterRun.lastRun!).getTime();
    expect(diff).toBe(3600_000);
  });

  it('records notification after checkup with recap', async () => {
    const mockLauncher = makeMockLauncher();
    const mockNotificationStore = { record: vi.fn() };
    const mockSse = { emit: vi.fn() };
    const checkup = createCheckup({
      launcher: mockLauncher,
      workspaceDir: wsDir,
      intervalMs: 3600_000,
      spawnAgent: makeMockSpawnAgent(JSON.stringify({
        launch: ['invoices-acme'],
        suggestions: [{ title: 'Timesheet', urgency: 'normal', why: 'Missing' }],
      })),
      adapter: makeMockAdapter(),
      notificationStore: mockNotificationStore,
      sse: mockSse,
      writeSuggestion: vi.fn().mockReturnValue('timesheet-abc'),
    });

    await checkup.runCheckup();

    expect(mockNotificationStore.record).toHaveBeenCalledWith({
      message: 'Checkup completed: 1 session launched, 1 suggestion created',
      link: '/',
    });
    expect(mockSse.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'notification:sent', data: { source: 'checkup' } }),
    );
  });

  it('records "nothing to report" when checkup finds nothing', async () => {
    const mockLauncher = makeMockLauncher();
    const mockNotificationStore = { record: vi.fn() };
    const checkup = createCheckup({
      launcher: mockLauncher,
      workspaceDir: wsDir,
      intervalMs: 3600_000,
      spawnAgent: makeMockSpawnAgent(JSON.stringify({ launch: [], suggestions: [] })),
      adapter: makeMockAdapter(),
      notificationStore: mockNotificationStore,
    });

    await checkup.runCheckup();

    expect(mockNotificationStore.record).toHaveBeenCalledWith({
      message: 'Checkup completed: nothing to report',
      link: '/',
    });
  });

  // E2E-EDGE-01
  it.todo('handles event arriving during checkup');

  // E2E-EDGE-10
  it.todo('detects dormant task (no session for 2 weeks)');
});

describe('Checkup, memory context', () => {
  let wsDir: string;

  const memoryEntries: MemoryEntry[] = [
    {
      filename: 'contacts.md',
      category: 'contacts',
      created: '2026-01-01',
      updated: '2026-03-10',
      description: 'Important contacts',
      content: 'ligne1\nligne2\nligne3\nligne4\nligne5',
    },
    {
      filename: 'preferences.md',
      category: 'preferences',
      created: '2026-02-15',
      updated: '2026-03-12',
      description: 'User preferences',
      content: 'pref-a\npref-b\npref-c',
    },
  ];

  beforeEach(() => {
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentidy-ws-'));
    fs.mkdirSync(path.join(wsDir, '_suggestions'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(wsDir, { recursive: true, force: true });
  });

  function captureSystemPrompt(entries: MemoryEntry[]): { adapter: ReturnType<typeof makeMockAdapter>; checkup: ReturnType<typeof createCheckup> } {
    const adapter = makeMockAdapter();
    const checkup = createCheckup({
      launcher: {
        launchSession: vi.fn().mockResolvedValue(undefined),
        listActiveSessions: vi.fn().mockReturnValue([]),
      },
      workspaceDir: wsDir,
      intervalMs: 3600_000,
      spawnAgent: makeMockSpawnAgent(JSON.stringify({ launch: [], suggestions: [] })),
      adapter,
      memoryManager: { readAllFiles: () => entries },
    });
    return { adapter, checkup };
  }

  it('includes "Global memory" section when memoryManager has files', async () => {
    const { adapter, checkup } = captureSystemPrompt(memoryEntries);
    await checkup.runCheckup();

    const callArgs = adapter.buildArgs.mock.calls[0][0];
    expect(callArgs.systemPrompt).toContain('## Global memory (persistent context)');
  });

  it('does not include memory section when memoryManager has no files', async () => {
    const { adapter, checkup } = captureSystemPrompt([]);
    await checkup.runCheckup();

    const callArgs = adapter.buildArgs.mock.calls[0][0];
    expect(callArgs.systemPrompt).not.toContain('Global memory');
    expect(callArgs.systemPrompt).toContain('Checkup mode');
  });

  it('includes category and description from memory files', async () => {
    const { adapter, checkup } = captureSystemPrompt(memoryEntries);
    await checkup.runCheckup();

    const callArgs = adapter.buildArgs.mock.calls[0][0];
    expect(callArgs.systemPrompt).toContain('[contacts] Important contacts');
    expect(callArgs.systemPrompt).toContain('[preferences] User preferences');
  });

  it('includes last 3 lines of each file content', async () => {
    const { adapter, checkup } = captureSystemPrompt(memoryEntries);
    await checkup.runCheckup();

    const callArgs = adapter.buildArgs.mock.calls[0][0];
    // contacts.md has 5 lines → last 3 are ligne3, ligne4, ligne5
    expect(callArgs.systemPrompt).toContain('ligne3 ligne4 ligne5');
    expect(callArgs.systemPrompt).not.toContain('ligne1');
    // preferences.md has exactly 3 lines → all included
    expect(callArgs.systemPrompt).toContain('pref-a pref-b pref-c');
  });
});
