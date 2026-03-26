// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGapsManager } from './gaps.js';
import { createGapRouter } from './route-gap.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Actionable Gaps: Integration', () => {
  let wsDir: string;

  beforeEach(() => {
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentidy-integration-'));
    fs.mkdirSync(path.join(wsDir, '_gaps'), { recursive: true });
    fs.mkdirSync(path.join(wsDir, '_suggestions'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(wsDir, { recursive: true, force: true });
  });

  it('full flow: code gap → GitHub issue → gap updated with issue number', async () => {
    fs.writeFileSync(
      path.join(wsDir, '_gaps', 'gaps.md'),
      '## 2026-03-14 : TOTP support missing\n\n**Problème:** Cannot handle MFA TOTP\n**Impact:** Blocks portal automation\n**Catégorie:** capability\n**Fix type:** code\n**Sanitized title:** TOTP support missing\n**Sanitized:** Cannot authenticate on portals requiring MFA TOTP authentication\n**Source:** post-session\n\n---\n',
    );

    const gapsManager = createGapsManager(wsDir);
    const mockGitHub = {
      findExistingIssue: vi.fn().mockResolvedValue(null),
      createIssue: vi.fn().mockResolvedValue(77),
      commentOnIssue: vi.fn(),
      containsPII: vi.fn().mockReturnValue(false),
    };

    const router = createGapRouter({
      gapsManager,
      gitHub: mockGitHub,
      suggestionsDir: path.join(wsDir, '_suggestions'),
    });

    await router.routeNewGaps();

    // Verify issue was created
    expect(mockGitHub.createIssue).toHaveBeenCalledWith(expect.objectContaining({
      sanitizedTitle: 'TOTP support missing',
      sanitizedBody: 'Cannot authenticate on portals requiring MFA TOTP authentication',
      category: 'capability',
    }));

    // Verify gap was updated with issue number
    const updatedGaps = gapsManager.listGaps();
    expect(updatedGaps[0].githubIssueNumber).toBe(77);

    // Verify gap file contains the update
    const content = fs.readFileSync(path.join(wsDir, '_gaps', 'gaps.md'), 'utf-8');
    expect(content).toContain('**GitHub Issue:** #77');
  });

  it('full flow: config gap → suggestion file created → gap updated with slug', async () => {
    fs.writeFileSync(
      path.join(wsDir, '_gaps', 'gaps.md'),
      '## 2026-03-14 : Hook too strict\n\n**Problème:** PreToolUse hook blocks legitimate Bash commands\n**Impact:** Must manually intervene\n**Suggestion:** Whitelist common commands\n**Catégorie:** config\n**Fix type:** config\n**Source:** post-session\n\n---\n',
    );

    const gapsManager = createGapsManager(wsDir);
    const mockGitHub = {
      findExistingIssue: vi.fn(),
      createIssue: vi.fn(),
      commentOnIssue: vi.fn(),
      containsPII: vi.fn().mockReturnValue(false),
    };

    const router = createGapRouter({
      gapsManager,
      gitHub: mockGitHub,
      suggestionsDir: path.join(wsDir, '_suggestions'),
    });

    await router.routeNewGaps();

    // No GitHub issue for config gaps
    expect(mockGitHub.createIssue).not.toHaveBeenCalled();

    // Suggestion file created
    const suggestions = fs.readdirSync(path.join(wsDir, '_suggestions'));
    expect(suggestions).toHaveLength(1);
    const suggestionContent = fs.readFileSync(path.join(wsDir, '_suggestions', suggestions[0]), 'utf-8');
    expect(suggestionContent).toContain('Hook too strict');
    expect(suggestionContent).toContain('PreToolUse hook blocks');

    // Gap updated with suggestion slug
    const updatedGaps = gapsManager.listGaps();
    expect(updatedGaps[0].suggestionSlug).toBeDefined();
  });

  it('graceful degradation: gaps without fixType are ignored by router', async () => {
    fs.writeFileSync(
      path.join(wsDir, '_gaps', 'gaps.md'),
      '## 2026-03-14 : Old style gap\n\n**Problème:** Something\n**Impact:** Something\n\n---\n',
    );

    const gapsManager = createGapsManager(wsDir);
    const mockGitHub = {
      findExistingIssue: vi.fn(),
      createIssue: vi.fn(),
      commentOnIssue: vi.fn(),
      containsPII: vi.fn().mockReturnValue(false),
    };

    const router = createGapRouter({
      gapsManager,
      gitHub: mockGitHub,
      suggestionsDir: path.join(wsDir, '_suggestions'),
    });

    await router.routeNewGaps();

    // Nothing should happen
    expect(mockGitHub.createIssue).not.toHaveBeenCalled();
    expect(mockGitHub.findExistingIssue).not.toHaveBeenCalled();
    const suggestions = fs.readdirSync(path.join(wsDir, '_suggestions'));
    expect(suggestions).toHaveLength(0);
  });

  it('dedup: existing issue gets comment, not duplicate creation', async () => {
    fs.writeFileSync(
      path.join(wsDir, '_gaps', 'gaps.md'),
      '## 2026-03-19 : TOTP support missing\n\n**Problème:** Still cannot do MFA\n**Impact:** Same portal blocked\n**Fix type:** code\n**Sanitized title:** TOTP support missing\n**Sanitized:** Additional context: portal uses time-based codes only\n\n---\n',
    );

    const gapsManager = createGapsManager(wsDir);
    const mockGitHub = {
      findExistingIssue: vi.fn().mockResolvedValue({ number: 77, title: 'TOTP support missing' }),
      createIssue: vi.fn(),
      commentOnIssue: vi.fn(),
      containsPII: vi.fn().mockReturnValue(false),
    };

    const router = createGapRouter({
      gapsManager,
      gitHub: mockGitHub,
      suggestionsDir: path.join(wsDir, '_suggestions'),
    });

    await router.routeNewGaps();

    // Should comment, not create
    expect(mockGitHub.createIssue).not.toHaveBeenCalled();
    expect(mockGitHub.commentOnIssue).toHaveBeenCalledWith(77, 'Additional context: portal uses time-based codes only');

    // Gap updated with issue number
    const updatedGaps = gapsManager.listGaps();
    expect(updatedGaps[0].githubIssueNumber).toBe(77);
  });
});
