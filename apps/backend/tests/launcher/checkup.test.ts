// tests/launcher/checkup.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCheckup } from '../../src/launcher/checkup.js';
import type { MemoryEntry } from '@opentidy/shared';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Checkup', () => {
  let wsDir: string;

  beforeEach(() => {
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentidy-ws-'));
    // Créer quelques dossiers
    for (const id of ['factures-sopra', 'exali-rapport']) {
      const dir = path.join(wsDir, id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'state.md'), `# ${id}\nSTATUT : EN COURS`);
    }
    fs.mkdirSync(path.join(wsDir, '_suggestions'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(wsDir, { recursive: true, force: true });
  });

  function makeMockLauncher(activeDossierIds: string[] = []) {
    return {
      launchSession: vi.fn().mockResolvedValue(undefined),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      listActiveSessions: vi.fn().mockReturnValue(activeDossierIds.map(id => ({ dossierId: id }))),
    };
  }

  // E2E-CRN-01
  it('launches sessions for dossiers returned by Claude', async () => {
    const mockLauncher = makeMockLauncher();
    const checkup = createCheckup({
      launcher: mockLauncher,
      workspaceDir: wsDir,
      intervalMs: 3600_000,
      runClaude: vi.fn().mockResolvedValue(JSON.stringify({ launch: ['factures-sopra'], suggestions: [] })),
    });
    const result = await checkup.runCheckup();
    expect(mockLauncher.launchSession).toHaveBeenCalledWith('factures-sopra');
    expect(result.launched).toEqual(['factures-sopra']);
  });

  it('sends message to active terminal instead of launching new session', async () => {
    const mockLauncher = makeMockLauncher(['factures-sopra']);
    const checkup = createCheckup({
      launcher: mockLauncher,
      workspaceDir: wsDir,
      intervalMs: 3600_000,
      runClaude: vi.fn().mockResolvedValue(JSON.stringify({ launch: ['factures-sopra'], suggestions: [] })),
    });
    const result = await checkup.runCheckup();
    expect(mockLauncher.sendMessage).toHaveBeenCalledWith('factures-sopra', 'Checkup: reprends ton travail, les conditions sont remplies.');
    expect(mockLauncher.launchSession).not.toHaveBeenCalled();
    expect(result.launched).toEqual(['factures-sopra']);
  });

  it('launches inactive dossier and sends message to active dossier', async () => {
    const mockLauncher = makeMockLauncher(['factures-sopra']);
    const checkup = createCheckup({
      launcher: mockLauncher,
      workspaceDir: wsDir,
      intervalMs: 3600_000,
      runClaude: vi.fn().mockResolvedValue(JSON.stringify({ launch: ['factures-sopra', 'exali-rapport'], suggestions: [] })),
    });
    const result = await checkup.runCheckup();
    expect(mockLauncher.sendMessage).toHaveBeenCalledWith('factures-sopra', 'Checkup: reprends ton travail, les conditions sont remplies.');
    expect(mockLauncher.launchSession).toHaveBeenCalledWith('exali-rapport');
    expect(mockLauncher.launchSession).not.toHaveBeenCalledWith('factures-sopra');
    expect(result.launched).toEqual(['factures-sopra', 'exali-rapport']);
  });

  // E2E-CRN-05
  it('checkup creates suggestions in _suggestions/', async () => {
    const mockLauncher = makeMockLauncher();
    const checkupResponse = JSON.stringify({
      launch: [],
      suggestions: [{ title: 'Timesheet manquant', urgency: 'normal', why: 'Pas de timesheet juin' }],
    });
    const checkup = createCheckup({
      launcher: mockLauncher,
      workspaceDir: wsDir,
      intervalMs: 3600_000,
      runClaude: vi.fn().mockResolvedValue(checkupResponse),
    });

    const result = await checkup.runCheckup();
    expect(result.suggestions).toBe(1);
    // Verify suggestion file was written to _suggestions/
    const files = fs.readdirSync(path.join(wsDir, '_suggestions'));
    expect(files.length).toBeGreaterThanOrEqual(1);
    const content = fs.readFileSync(path.join(wsDir, '_suggestions', files[0]), 'utf-8');
    expect(content).toContain('Timesheet manquant');
    expect(content).toContain('normal');
  });

  // E2E-CRN-02, E2E-LCH-08
  it('skips locked dossiers (lock checked by launcher internally)', async () => {
    const mockLauncher = makeMockLauncher();
    const checkup = createCheckup({
      launcher: mockLauncher,
      workspaceDir: wsDir,
      intervalMs: 3600_000,
      runClaude: vi.fn().mockResolvedValue(JSON.stringify({ launch: ['factures-sopra'], suggestions: [] })),
    });
    const result = await checkup.runCheckup();
    expect(mockLauncher.launchSession).toHaveBeenCalledWith('factures-sopra');
    expect(result.launched).toEqual(['factures-sopra']);
  });

  // E2E-CRN-06
  it('does nothing when no dossiers need action', async () => {
    const mockLauncher = makeMockLauncher();
    const checkup = createCheckup({
      launcher: mockLauncher,
      workspaceDir: wsDir,
      intervalMs: 3600_000,
      runClaude: vi.fn().mockResolvedValue(JSON.stringify({ launch: [], suggestions: [] })),
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
      runClaude: vi.fn().mockResolvedValue(JSON.stringify({ launch: [], suggestions: [] })),
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
      runClaude: vi.fn().mockResolvedValue(JSON.stringify({
        launch: ['factures-sopra'],
        suggestions: [{ title: 'Timesheet', urgency: 'normal', why: 'Missing' }],
      })),
      notificationStore: mockNotificationStore,
      sse: mockSse,
    });

    await checkup.runCheckup();

    expect(mockNotificationStore.record).toHaveBeenCalledWith({
      message: 'Checkup terminé — 1 session lancée, 1 suggestion créée',
      link: '/',
    });
    expect(mockSse.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'notification:sent', data: { source: 'checkup' } }),
    );
  });

  it('records "rien à signaler" when checkup finds nothing', async () => {
    const mockLauncher = makeMockLauncher();
    const mockNotificationStore = { record: vi.fn() };
    const checkup = createCheckup({
      launcher: mockLauncher,
      workspaceDir: wsDir,
      intervalMs: 3600_000,
      runClaude: vi.fn().mockResolvedValue(JSON.stringify({ launch: [], suggestions: [] })),
      notificationStore: mockNotificationStore,
    });

    await checkup.runCheckup();

    expect(mockNotificationStore.record).toHaveBeenCalledWith({
      message: 'Checkup terminé — rien à signaler',
      link: '/',
    });
  });

  // E2E-EDGE-01
  it.todo('handles event arriving during checkup');

  // E2E-EDGE-10
  it.todo('detects dormant dossier (no session for 2 weeks)');
});

describe('Checkup — memory context', () => {
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
      category: 'préférences',
      created: '2026-02-15',
      updated: '2026-03-12',
      description: 'Préférences utilisateur',
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

  function captureSystemPrompt(entries: MemoryEntry[]): { runClaude: ReturnType<typeof vi.fn>; checkup: ReturnType<typeof createCheckup> } {
    const runClaude = vi.fn().mockResolvedValue(JSON.stringify({ launch: [], suggestions: [] }));
    const checkup = createCheckup({
      launcher: {
        launchSession: vi.fn().mockResolvedValue(undefined),
        sendMessage: vi.fn().mockResolvedValue(undefined),
        listActiveSessions: vi.fn().mockReturnValue([]),
      },
      workspaceDir: wsDir,
      intervalMs: 3600_000,
      runClaude,
      memoryManager: { readAllFiles: () => entries },
    });
    return { runClaude, checkup };
  }

  it('includes "Mémoire globale" section when memoryManager has files', async () => {
    const { runClaude, checkup } = captureSystemPrompt(memoryEntries);
    await checkup.runCheckup();

    const args = runClaude.mock.calls[0][0] as string[];
    const systemPrompt = args[args.indexOf('--system-prompt') + 1];
    expect(systemPrompt).toContain('## Mémoire globale (contexte persistant)');
  });

  it('does not include memory section when memoryManager has no files', async () => {
    const { runClaude, checkup } = captureSystemPrompt([]);
    await checkup.runCheckup();

    const args = runClaude.mock.calls[0][0] as string[];
    const systemPrompt = args[args.indexOf('--system-prompt') + 1];
    expect(systemPrompt).not.toContain('Mémoire globale');
    expect(systemPrompt).toContain('Mode checkup');
  });

  it('includes category and description from memory files', async () => {
    const { runClaude, checkup } = captureSystemPrompt(memoryEntries);
    await checkup.runCheckup();

    const args = runClaude.mock.calls[0][0] as string[];
    const systemPrompt = args[args.indexOf('--system-prompt') + 1];
    expect(systemPrompt).toContain('[contacts] Important contacts');
    expect(systemPrompt).toContain('[préférences] Préférences utilisateur');
  });

  it('includes last 3 lines of each file content', async () => {
    const { runClaude, checkup } = captureSystemPrompt(memoryEntries);
    await checkup.runCheckup();

    const args = runClaude.mock.calls[0][0] as string[];
    const systemPrompt = args[args.indexOf('--system-prompt') + 1];
    // contacts.md has 5 lines → last 3 are ligne3, ligne4, ligne5
    expect(systemPrompt).toContain('ligne3 ligne4 ligne5');
    expect(systemPrompt).not.toContain('ligne1');
    // preferences.md has exactly 3 lines → all included
    expect(systemPrompt).toContain('pref-a pref-b pref-c');
  });
});
