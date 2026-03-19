// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

// src/features/triage/classify.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createTriager, createClaudeRunner } from './classify.js';
import type { MemoryEntry } from '@opentidy/shared';

describe('Triager', () => {
  const dossiers = [
    { id: 'invoices-acme', title: 'Invoices Acme', status: 'IN_PROGRESS' as const },
    { id: 'insurance-report', title: 'Report Insurance', status: 'IN_PROGRESS' as const },
  ];

  // E2E-RCV-01
  it('routes event to matching dossier', async () => {
    const runClaude = vi.fn().mockResolvedValue('{ "dossierIds": ["invoices-acme"] }');
    const triager = createTriager({ runClaude, listDossiers: () => dossiers });
    const result = await triager.triage({ source: 'gmail', content: 'Email de billing@example-client.com: Invoice march' });
    expect(result.dossierIds).toEqual(['invoices-acme']);
    expect(result.suggestion).toBeUndefined();
  });

  // E2E-RCV-02
  it('creates suggestion when no dossier matches', async () => {
    const runClaude = vi.fn().mockResolvedValue('{ "suggestion": { "title": "Tax Filing 2025", "urgency": "normal", "source": "gmail", "why": "Nouveau sujet" } }');
    const triager = createTriager({ runClaude, listDossiers: () => dossiers });
    const result = await triager.triage({ source: 'gmail', content: 'Email de tax@example-authority.gov' });
    expect(result.dossierIds).toBeUndefined();
    expect(result.suggestion?.title).toBe('Tax Filing 2025');
  });

  // E2E-RCV-06
  it('routes event to multiple dossiers', async () => {
    const runClaude = vi.fn().mockResolvedValue('{ "dossierIds": ["invoices-acme", "insurance-report"] }');
    const triager = createTriager({ runClaude, listDossiers: () => dossiers });
    const result = await triager.triage({ source: 'gmail', content: 'Email from accountant: concerns Acme AND Insurance' });
    expect(result.dossierIds).toEqual(['invoices-acme', 'insurance-report']);
  });

  // E2E-RCV-07
  it('ignores spam', async () => {
    const runClaude = vi.fn().mockResolvedValue('{ "ignore": true, "reason": "spam marketing" }');
    const triager = createTriager({ runClaude, listDossiers: () => dossiers });
    const result = await triager.triage({ source: 'gmail', content: 'PROMO -50% SOLDES' });
    expect(result.ignore).toBe(true);
  });

  // E2E-RCV-08
  it('handles event for COMPLETED dossier', async () => {
    const dossiersWithTermine = [...dossiers, { id: 'old-task', title: 'Old', status: 'COMPLETED' as const }];
    const runClaude = vi.fn().mockResolvedValue('{ "suggestion": { "title": "Reopen old-task?", "urgency": "low", "source": "gmail", "why": "Completed dossier but new email" } }');
    const triager = createTriager({ runClaude, listDossiers: () => dossiersWithTermine });
    const result = await triager.triage({ source: 'gmail', content: 'Re: old task' });
    expect(result.suggestion).toBeDefined();
  });

  // E2E-SUG-03
  it('creates suggestion while working on another dossier', async () => {
    const runClaude = vi.fn().mockResolvedValue('{ "suggestion": { "title": "New thing", "urgency": "normal", "source": "gmail", "why": "Not related to active dossiers" } }');
    const triager = createTriager({ runClaude, listDossiers: () => dossiers });
    const result = await triager.triage({ source: 'gmail', content: 'Completely different subject' });
    expect(result.suggestion).toBeDefined();
  });

  // E2E-EDGE-09
  it('handles suggestion for just-created dossier', async () => {
    const runClaude = vi.fn().mockResolvedValue('{ "dossierIds": ["new-dossier"] }');
    const freshDossiers = [...dossiers, { id: 'new-dossier', title: 'New', status: 'IN_PROGRESS' as const }];
    const triager = createTriager({ runClaude, listDossiers: () => freshDossiers });
    const result = await triager.triage({ source: 'gmail', content: 'Re: new dossier' });
    expect(result.dossierIds).toEqual(['new-dossier']);
  });

  it('handles claude -p failure gracefully', async () => {
    const runClaude = vi.fn().mockRejectedValue(new Error('rate limited'));
    const triager = createTriager({ runClaude, listDossiers: () => dossiers });
    const result = await triager.triage({ source: 'gmail', content: 'some email' });
    // Fallback : creates a generic suggestion rather than losing the event
    expect(result.suggestion).toBeDefined();
  });
});

describe('createClaudeRunner — memory context', () => {
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

  async function captureSystemPrompt(entries: MemoryEntry[]): Promise<string> {
    const mockSpawnClaude = vi.fn().mockResolvedValue('{ "ignore": true, "reason": "test" }');
    const memoryManager = { readAllFiles: () => entries };
    const runClaude = createClaudeRunner('/tmp/test-workspace', { memoryManager, spawnClaude: mockSpawnClaude });
    await runClaude('test prompt');

    // spawnClaude is called with { args: ['-p', '--system-prompt', <systemPrompt>, <prompt>], ... }
    const callArgs = mockSpawnClaude.mock.calls[0][0];
    const cliArgs = callArgs.args as string[];
    const systemPromptIdx = cliArgs.indexOf('--system-prompt');
    return cliArgs[systemPromptIdx + 1];
  }

  it('includes "Global memory" section when memoryManager has files', async () => {
    const systemPrompt = await captureSystemPrompt(memoryEntries);
    expect(systemPrompt).toContain('## Global memory (persistent context)');
  });

  it('does not include memory section when memoryManager has no files', async () => {
    const systemPrompt = await captureSystemPrompt([]);
    expect(systemPrompt).not.toContain('Global memory');
    // Base triage prompt still present
    expect(systemPrompt).toContain('Triage mode');
  });

  it('includes category and description from memory files', async () => {
    const systemPrompt = await captureSystemPrompt(memoryEntries);
    expect(systemPrompt).toContain('[contacts] Important contacts');
    expect(systemPrompt).toContain('[preferences] User preferences');
  });

  it('includes last 3 lines of each file content', async () => {
    const systemPrompt = await captureSystemPrompt(memoryEntries);
    // contacts.md has 5 lines → last 3 are ligne3, ligne4, ligne5
    expect(systemPrompt).toContain('ligne3 ligne4 ligne5');
    expect(systemPrompt).not.toContain('ligne1');
    // preferences.md has exactly 3 lines → all included
    expect(systemPrompt).toContain('pref-a pref-b pref-c');
  });
});