// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGapRouter } from './route-gap.js';
import { createGapsManager } from './gaps.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('GapRouter', () => {
  let wsDir: string;
  let mockGitHub: {
    findExistingIssue: ReturnType<typeof vi.fn>;
    createIssue: ReturnType<typeof vi.fn>;
    commentOnIssue: ReturnType<typeof vi.fn>;
    containsPII: ReturnType<typeof vi.fn>;
  };
  let mockSuggestions: { isDuplicateSuggestion: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentidy-route-gap-'));
    fs.mkdirSync(path.join(wsDir, '_gaps'), { recursive: true });
    fs.mkdirSync(path.join(wsDir, '_suggestions'), { recursive: true });
    mockGitHub = {
      findExistingIssue: vi.fn().mockResolvedValue(null),
      createIssue: vi.fn().mockResolvedValue(99),
      commentOnIssue: vi.fn().mockResolvedValue(undefined),
      containsPII: vi.fn().mockReturnValue(false),
    };
    mockSuggestions = {
      isDuplicateSuggestion: vi.fn().mockReturnValue(false),
    };
  });

  afterEach(() => {
    fs.rmSync(wsDir, { recursive: true, force: true });
  });

  it('creates GitHub issue for code fixType gap', async () => {
    fs.writeFileSync(
      path.join(wsDir, '_gaps', 'gaps.md'),
      '## 2026-03-14 — MFA TOTP\n\n**Problème:** Cannot login\n**Impact:** Blocks automation\n**Fix type:** code\n**Sanitized title:** MFA TOTP\n**Sanitized:** Cannot authenticate with MFA TOTP\n\n---\n',
    );
    const gapsManager = createGapsManager(wsDir);
    const router = createGapRouter({ gapsManager, gitHub: mockGitHub, suggestionsDir: path.join(wsDir, '_suggestions') });
    await router.routeNewGaps();

    expect(mockGitHub.createIssue).toHaveBeenCalledWith(expect.objectContaining({
      sanitizedTitle: 'MFA TOTP',
      sanitizedBody: 'Cannot authenticate with MFA TOTP',
    }));
  });

  it('comments on existing issue instead of creating duplicate', async () => {
    fs.writeFileSync(
      path.join(wsDir, '_gaps', 'gaps.md'),
      '## 2026-03-14 — MFA TOTP\n\n**Problème:** New info about MFA\n**Impact:** Blocks\n**Fix type:** code\n**Sanitized title:** MFA TOTP\n**Sanitized:** New context about MFA TOTP limitation\n\n---\n',
    );
    mockGitHub.findExistingIssue.mockResolvedValue({ number: 42, title: 'MFA TOTP' });
    const gapsManager = createGapsManager(wsDir);
    const router = createGapRouter({ gapsManager, gitHub: mockGitHub, suggestionsDir: path.join(wsDir, '_suggestions') });
    await router.routeNewGaps();

    expect(mockGitHub.createIssue).not.toHaveBeenCalled();
    expect(mockGitHub.commentOnIssue).toHaveBeenCalledWith(42, expect.stringContaining('New context about MFA TOTP'));
  });

  it('creates suggestion for config fixType gap', async () => {
    fs.writeFileSync(
      path.join(wsDir, '_gaps', 'gaps.md'),
      '## 2026-03-14 — Hook misconfigured\n\n**Problème:** Hook blocks legit action\n**Impact:** Needs manual workaround\n**Suggestion:** Adjust hook config\n**Fix type:** config\n\n---\n',
    );
    const gapsManager = createGapsManager(wsDir);
    const router = createGapRouter({ gapsManager, gitHub: mockGitHub, suggestionsDir: path.join(wsDir, '_suggestions'), isDuplicateSuggestion: mockSuggestions.isDuplicateSuggestion });
    await router.routeNewGaps();

    const files = fs.readdirSync(path.join(wsDir, '_suggestions'));
    expect(files).toHaveLength(1);
    expect(mockGitHub.createIssue).not.toHaveBeenCalled();
  });

  it('skips external fixType gaps', async () => {
    fs.writeFileSync(
      path.join(wsDir, '_gaps', 'gaps.md'),
      '## 2026-03-14 — Third party down\n\n**Problème:** External API unavailable\n**Impact:** Cannot process\n**Fix type:** external\n\n---\n',
    );
    const gapsManager = createGapsManager(wsDir);
    const router = createGapRouter({ gapsManager, gitHub: mockGitHub, suggestionsDir: path.join(wsDir, '_suggestions') });
    await router.routeNewGaps();

    expect(mockGitHub.createIssue).not.toHaveBeenCalled();
  });

  it('skips gaps that already have a githubIssueNumber', async () => {
    fs.writeFileSync(
      path.join(wsDir, '_gaps', 'gaps.md'),
      '## 2026-03-14 — Already tracked\n\n**Problème:** Something\n**Impact:** Something\n**Fix type:** code\n**Sanitized title:** Already tracked\n**Sanitized:** Something\n**GitHub Issue:** #42\n\n---\n',
    );
    const gapsManager = createGapsManager(wsDir);
    const router = createGapRouter({ gapsManager, gitHub: mockGitHub, suggestionsDir: path.join(wsDir, '_suggestions') });
    await router.routeNewGaps();

    expect(mockGitHub.createIssue).not.toHaveBeenCalled();
    expect(mockGitHub.findExistingIssue).not.toHaveBeenCalled();
  });

  it('skips gaps that already have a suggestionSlug', async () => {
    fs.writeFileSync(
      path.join(wsDir, '_gaps', 'gaps.md'),
      '## 2026-03-14 — Already suggested\n\n**Problème:** Something\n**Impact:** Something\n**Fix type:** config\n**Suggestion slug:** fix-already-abc\n\n---\n',
    );
    const gapsManager = createGapsManager(wsDir);
    const router = createGapRouter({ gapsManager, gitHub: mockGitHub, suggestionsDir: path.join(wsDir, '_suggestions') });
    await router.routeNewGaps();

    const files = fs.readdirSync(path.join(wsDir, '_suggestions'));
    expect(files).toHaveLength(0);
  });
});
