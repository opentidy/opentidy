# Actionable Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make gaps actionable; code-related gaps create GitHub Issues, config-related gaps create suggestions.

**Architecture:** Extend the post-session extraction prompt so Claude classifies and sanitizes each gap. After Claude writes to `gaps.md`, the backend re-reads the file, parses new fields, and routes to GitHub API or the existing suggestion system. A new `github-issue.ts` module handles all GitHub API interaction via `fetch`.

**Tech Stack:** TypeScript, Vitest, Hono, GitHub REST API (v3), Zod

**Spec:** `docs/superpowers/specs/2026-03-19-actionable-gaps-design.md`

**Spec deviation:** The spec says existing GitHub issue titles should be injected into the extraction prompt for Claude to match. This plan simplifies: dedup is done post-write by the backend (`findExistingIssue`), which is more reliable than asking Claude. The prompt just tells Claude to write gaps; the backend handles dedup.

---

### Task 1: Add types and schema

**Files:**
- Modify: `packages/shared/src/types.ts:44-63`
- Modify: `packages/shared/src/schemas.ts`

- [ ] **Step 1: Write the failing test**

```bash
cd /Users/lolo/Documents/opentidy && pnpm --filter @opentidy/shared build
```

This is a type-only change; no runtime test needed. Verify the build succeeds after the change.

- [ ] **Step 2: Add `AmeliorationFixType` and new fields to `Amelioration`**

In `packages/shared/src/types.ts`, after line 47 (`AmeliorationCategory`), add:

```typescript
export type AmeliorationFixType = 'code' | 'config' | 'external';
```

Add 5 fields to the `Amelioration` interface (after `status` on line 62):

```typescript
  fixType?: AmeliorationFixType;
  sanitizedTitle?: string;
  sanitizedBody?: string;
  githubIssueNumber?: number;
  suggestionSlug?: string;
```

- [ ] **Step 3: Add `github` field to `OpenTidyConfig`**

In `packages/shared/src/types.ts`, add to `OpenTidyConfig` interface (after `receivers` on line 229):

```typescript
  github?: {
    token: string;
    owner?: string;  // defaults to 'opentidy'
    repo?: string;   // defaults to 'opentidy'
  };
```

- [ ] **Step 4: Add Zod schema**

In `packages/shared/src/schemas.ts`, add:

```typescript
export const AmeliorationFixTypeSchema = z.enum(['code', 'config', 'external']);
```

- [ ] **Step 5: Export new type from index**

In `packages/shared/src/index.ts`, verify `AmeliorationFixType` is re-exported (it should be automatic if `types.ts` is re-exported with `*`).

- [ ] **Step 6: Build and verify**

Run: `pnpm --filter @opentidy/shared build`
Expected: BUILD SUCCESS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/schemas.ts packages/shared/src/index.ts
git commit -m "feat(shared): add AmeliorationFixType and GitHub config types"
```

---

### Task 2: Extend gaps parser for new fields

**Files:**
- Modify: `apps/backend/src/features/ameliorations/gaps.ts:17-38`
- Modify: `apps/backend/src/features/ameliorations/gaps.test.ts`

- [ ] **Step 1: Write failing tests for new field parsing**

In `apps/backend/src/features/ameliorations/gaps.test.ts`, add:

```typescript
it('parses fixType and sanitized fields from structured format', () => {
  fs.writeFileSync(
    path.join(wsDir, '_gaps', 'gaps.md'),
    '## 2026-03-14. MFA TOTP limitation\n\n**Problème:** Cannot login with MFA\n**Impact:** Blocks automation\n**Suggestion:** Add TOTP support\n**Catégorie:** capability\n**Fix type:** code\n**Sanitized title:** MFA TOTP authentication not supported\n**Sanitized:** Cannot authenticate on portals requiring MFA TOTP.\n**GitHub Issue:** #42\n**Dossier:** insurance-report\n\n---\n',
  );
  const list = gaps.listGaps();
  expect(list).toHaveLength(1);
  expect(list[0].fixType).toBe('code');
  expect(list[0].sanitizedTitle).toBe('MFA TOTP authentication not supported');
  expect(list[0].sanitizedBody).toBe('Cannot authenticate on portals requiring MFA TOTP.');
  expect(list[0].githubIssueNumber).toBe(42);
});

it('parses config fixType with suggestion slug', () => {
  fs.writeFileSync(
    path.join(wsDir, '_gaps', 'gaps.md'),
    '## 2026-03-14. Hook misconfigured\n\n**Problème:** Hook blocks legit action\n**Impact:** Manual workaround needed\n**Catégorie:** config\n**Fix type:** config\n**Suggestion slug:** fix-hook-config-abc123\n\n---\n',
  );
  const list = gaps.listGaps();
  expect(list[0].fixType).toBe('config');
  expect(list[0].suggestionSlug).toBe('fix-hook-config-abc123');
  expect(list[0].githubIssueNumber).toBeUndefined();
});

it('handles gaps without new fields (backward compat)', () => {
  fs.writeFileSync(
    path.join(wsDir, '_gaps', 'gaps.md'),
    '## 2026-03-14. Old gap\n\n**Problème:** Something\n**Impact:** Something\n**Suggestion:** Something\n\n---\n',
  );
  const list = gaps.listGaps();
  expect(list[0].fixType).toBeUndefined();
  expect(list[0].sanitizedBody).toBeUndefined();
  expect(list[0].githubIssueNumber).toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @opentidy/backend vitest run src/features/ameliorations/gaps.test.ts`
Expected: FAIL (`fixType`, `sanitizedBody`, `githubIssueNumber` are not parsed.)

- [ ] **Step 3: Extend `parseStructuredSections` in `gaps.ts`**

In `apps/backend/src/features/ameliorations/gaps.ts`, add parsing inside `parseStructuredSections` (after `category` on line 28):

```typescript
import type { Amelioration, AmeliorationStatus, AmeliorationSource, AmeliorationCategory, AmeliorationFixType } from '@opentidy/shared';

// Fix existing parser to accept both English and French field names:
const problem = section.match(/\*\*(Problème|Problem):\*\*\s*(.+)/)?.[2]?.trim() ?? '';

// Inside parseStructuredSections, after the category line:
const fixType = (section.match(/\*\*Fix type:\*\*\s*(.+)/)?.[1]?.trim() || undefined) as AmeliorationFixType | undefined;
const sanitizedBody = section.match(/\*\*Sanitized:\*\*\s*(.+)/)?.[1]?.trim() || undefined;
const sanitizedTitle = section.match(/\*\*Sanitized title:\*\*\s*(.+)/)?.[1]?.trim() || undefined;
const githubIssueStr = section.match(/\*\*GitHub Issue:\*\*\s*#?(\d+)/)?.[1];
const githubIssueNumber = githubIssueStr ? parseInt(githubIssueStr, 10) : undefined;
const suggestionSlug = section.match(/\*\*Suggestion slug:\*\*\s*(.+)/)?.[1]?.trim() || undefined;
```

Add these fields to the return object on line 37:

```typescript
return { id: String(i), date, title, problem, impact, suggestion, actions, dossierId, sessionId, source, category, resolved: status === 'resolved', status, fixType, sanitizedTitle, sanitizedBody, githubIssueNumber, suggestionSlug };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @opentidy/backend vitest run src/features/ameliorations/gaps.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Write test for `updateGapFields`**

Add to `gaps.test.ts`:

```typescript
it('updates gap fields by index', () => {
  fs.writeFileSync(
    path.join(wsDir, '_gaps', 'gaps.md'),
    '## 2026-03-14. Test Gap\n\n**Problème:** X\n**Impact:** Y\n**Suggestion:** Z\n**Fix type:** code\n**Sanitized title:** Test Gap\n**Sanitized:** Test problem\n\n---\n',
  );
  gaps.updateGapFields(0, { githubIssueNumber: 42 });
  const list = gaps.listGaps();
  expect(list[0].githubIssueNumber).toBe(42);
});

it('updates gap with suggestion slug', () => {
  fs.writeFileSync(
    path.join(wsDir, '_gaps', 'gaps.md'),
    '## 2026-03-14. Config Gap\n\n**Problème:** X\n**Impact:** Y\n**Fix type:** config\n\n---\n',
  );
  gaps.updateGapFields(0, { suggestionSlug: 'fix-config-abc' });
  const list = gaps.listGaps();
  expect(list[0].suggestionSlug).toBe('fix-config-abc');
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `pnpm --filter @opentidy/backend vitest run src/features/ameliorations/gaps.test.ts`
Expected: FAIL (`updateGapFields` is not defined.)

- [ ] **Step 7: Implement `updateGapFields`**

In `gaps.ts`, add before the `return` statement:

```typescript
function updateGapFields(index: number, fields: { githubIssueNumber?: number; suggestionSlug?: string }): void {
  if (!fs.existsSync(gapsFile)) return;
  const content = fs.readFileSync(gapsFile, 'utf-8');
  const hasStructured = /^## \d{4}-\d{2}-\d{2}, /m.test(content);
  if (!hasStructured) return; // only structured format supports field updates

  const sections = content.split(/^---$/m).filter(s => s.trim());
  if (index >= sections.length) return;

  let section = sections[index];
  if (fields.githubIssueNumber != null) {
    section = section.replace(/\*\*GitHub Issue:\*\*.*\n?/, '');
    section = section.trimEnd() + `\n**GitHub Issue:** #${fields.githubIssueNumber}\n`;
  }
  if (fields.suggestionSlug != null) {
    section = section.replace(/\*\*Suggestion slug:\*\*.*\n?/, '');
    section = section.trimEnd() + `\n**Suggestion slug:** ${fields.suggestionSlug}\n`;
  }
  sections[index] = section;
  fs.writeFileSync(gapsFile, sections.join('\n---\n') + '\n');
  console.log(`[workspace] gap fields updated: index=${index}`);
}
```

Add `updateGapFields` to the return object.

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm --filter @opentidy/backend vitest run src/features/ameliorations/gaps.test.ts`
Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/features/ameliorations/gaps.ts apps/backend/src/features/ameliorations/gaps.test.ts
git commit -m "feat(backend): extend gaps parser with fixType, sanitized fields, and updateGapFields"
```

---

### Task 3: Create GitHub Issue module

**Files:**
- Create: `apps/backend/src/features/ameliorations/github-issue.ts`
- Create: `apps/backend/src/features/ameliorations/github-issue.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/backend/src/features/ameliorations/github-issue.test.ts`:

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGitHubIssueManager } from './github-issue.js';

const mockFetch = vi.fn();

describe('GitHubIssueManager', () => {
  let manager: ReturnType<typeof createGitHubIssueManager>;

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    manager = createGitHubIssueManager({
      token: 'ghp_test123',
      owner: 'opentidy',
      repo: 'opentidy',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('containsPII', () => {
    it('detects email addresses', () => {
      expect(manager.containsPII('Contact john@example.com')).toBe(true);
    });

    it('detects phone numbers', () => {
      expect(manager.containsPII('Call +33 6 12 34 56 78')).toBe(true);
      expect(manager.containsPII('Phone: 06 12 34 56 78')).toBe(true);
    });

    it('allows clean technical text', () => {
      expect(manager.containsPII('Cannot authenticate on portals requiring MFA TOTP')).toBe(false);
    });

    it('allows dates (not phone numbers)', () => {
      expect(manager.containsPII('Issue from 2026-03-14')).toBe(false);
    });

    it('allows URLs with example.com', () => {
      expect(manager.containsPII('See https://example.com/docs')).toBe(false);
    });
  });

  describe('findExistingIssue', () => {
    it('returns matching issue when title matches', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { number: 42, title: 'MFA TOTP not supported', state: 'open' },
          { number: 43, title: 'Rate limit on Gmail API', state: 'open' },
        ],
      });
      const result = await manager.findExistingIssue('MFA TOTP not supported');
      expect(result).toEqual({ number: 42, title: 'MFA TOTP not supported' });
    });

    it('returns null when no match', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { number: 42, title: 'MFA TOTP not supported', state: 'open' },
        ],
      });
      const result = await manager.findExistingIssue('Completely different issue');
      expect(result).toBeNull();
    });

    it('returns null on API error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
      const result = await manager.findExistingIssue('test');
      expect(result).toBeNull();
    });
  });

  describe('createIssue', () => {
    it('creates issue and returns number', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ number: 99 }),
      });
      const num = await manager.createIssue({
        sanitizedTitle: 'MFA TOTP not supported',
        sanitizedBody: 'Cannot authenticate on portals requiring MFA TOTP.',
        category: 'capability',
        source: 'post-session',
        date: '2026-03-14',
      });
      expect(num).toBe(99);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/opentidy/opentidy/issues',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('rejects when sanitized text contains PII', async () => {
      await expect(manager.createIssue({
        sanitizedTitle: 'Contact john@gmail.com for access',
        sanitizedBody: 'Need to reach john@gmail.com',
        category: 'access',
        source: 'post-session',
        date: '2026-03-14',
      })).rejects.toThrow('PII detected');
    });

    it('returns null on API error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 422, text: async () => 'Validation error' });
      const num = await manager.createIssue({
        sanitizedTitle: 'Test issue',
        sanitizedBody: 'Test body',
        category: 'capability',
        source: 'post-session',
        date: '2026-03-14',
      });
      expect(num).toBeNull();
    });
  });

  describe('commentOnIssue', () => {
    it('posts comment to existing issue', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      await manager.commentOnIssue(42, 'Additional context from new session.');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/opentidy/opentidy/issues/42/comments',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @opentidy/backend vitest run src/features/ameliorations/github-issue.test.ts`
Expected: FAIL (module does not exist.)

- [ ] **Step 3: Implement `github-issue.ts`**

Create `apps/backend/src/features/ameliorations/github-issue.ts`:

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { AmeliorationCategory, AmeliorationSource } from '@opentidy/shared';

interface GitHubIssueConfig {
  token: string;
  owner: string;
  repo: string;
}

interface SanitizedGap {
  sanitizedTitle: string;
  sanitizedBody: string;
  category?: AmeliorationCategory;
  source?: AmeliorationSource;
  date: string;
}

interface ExistingIssue {
  number: number;
  title: string;
}

// PII patterns, defense-in-depth check before creating public issues
const PII_PATTERNS = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,    // email (excluding example.com checked separately)
  /(?:\+\d{1,3}\s?)?\(?\d{2,4}\)?[\s.-]\d{2,4}[\s.-]\d{2,4}/, // phone (requires separators between groups)
  /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/,                      // SSN-like
];

export function createGitHubIssueManager(config: GitHubIssueConfig) {
  const baseUrl = `https://api.github.com/repos/${config.owner}/${config.repo}`;
  const headers = {
    'Authorization': `Bearer ${config.token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };

  function containsPII(text: string): boolean {
    // Strip known safe patterns before checking
    let cleaned = text.replace(/[\w.+-]+@example\.com/g, '');  // test fixture emails
    cleaned = cleaned.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '');  // ISO dates
    return PII_PATTERNS.some(pattern => pattern.test(cleaned));
  }

  async function findExistingIssue(sanitizedTitle: string): Promise<ExistingIssue | null> {
    try {
      const res = await fetch(`${baseUrl}/issues?labels=auto-gap&state=open&per_page=100`, { headers });
      if (!res.ok) {
        console.error(`[ameliorations] GitHub API error fetching issues: ${res.status}`);
        return null;
      }
      const issues = await res.json() as Array<{ number: number; title: string }>;
      const match = issues.find(i => i.title.toLowerCase() === sanitizedTitle.toLowerCase());
      return match ? { number: match.number, title: match.title } : null;
    } catch (err) {
      console.error('[ameliorations] GitHub API fetch error:', (err as Error).message);
      return null;
    }
  }

  async function createIssue(gap: SanitizedGap): Promise<number | null> {
    if (containsPII(gap.sanitizedTitle) || containsPII(gap.sanitizedBody)) {
      throw new Error('PII detected in sanitized gap content, refusing to create public issue');
    }

    const labels = ['auto-gap'];
    if (gap.category) labels.push(`category:${gap.category}`);

    const body = `**Problem:** ${gap.sanitizedBody}

---
*Automatically created by OpenTidy from gap detection.*
*Source: ${gap.source || 'unknown'} | Date: ${gap.date}*`;

    try {
      const res = await fetch(`${baseUrl}/issues`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title: gap.sanitizedTitle, body, labels }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(`[ameliorations] GitHub API error creating issue: ${res.status} ${text}`);
        return null;
      }
      const issue = await res.json() as { number: number };
      console.log(`[ameliorations] created GitHub issue #${issue.number}: ${gap.sanitizedTitle}`);
      return issue.number;
    } catch (err) {
      console.error('[ameliorations] GitHub API create error:', (err as Error).message);
      return null;
    }
  }

  async function commentOnIssue(issueNumber: number, comment: string): Promise<void> {
    try {
      const res = await fetch(`${baseUrl}/issues/${issueNumber}/comments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ body: comment }),
      });
      if (!res.ok) {
        console.error(`[ameliorations] GitHub API error commenting on #${issueNumber}: ${res.status}`);
      }
    } catch (err) {
      console.error('[ameliorations] GitHub API comment error:', (err as Error).message);
    }
  }

  return { containsPII, findExistingIssue, createIssue, commentOnIssue };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @opentidy/backend vitest run src/features/ameliorations/github-issue.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/features/ameliorations/github-issue.ts apps/backend/src/features/ameliorations/github-issue.test.ts
git commit -m "feat(backend): add GitHub Issue module for actionable gaps"
```

---

### Task 4: Create gap routing module

**Files:**
- Create: `apps/backend/src/features/ameliorations/route-gap.ts`
- Create: `apps/backend/src/features/ameliorations/route-gap.test.ts`

This module reads freshly written gaps and routes them to GitHub Issues or suggestions.

- [ ] **Step 1: Write failing tests**

Create `apps/backend/src/features/ameliorations/route-gap.test.ts`:

```typescript
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
  let mockGitHub: { findExistingIssue: ReturnType<typeof vi.fn>; createIssue: ReturnType<typeof vi.fn>; commentOnIssue: ReturnType<typeof vi.fn>; containsPII: ReturnType<typeof vi.fn> };
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
      '## 2026-03-14. MFA TOTP\n\n**Problème:** Cannot login\n**Impact:** Blocks automation\n**Fix type:** code\n**Sanitized title:** MFA TOTP\n**Sanitized:** Cannot authenticate with MFA TOTP\n\n---\n',
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
      '## 2026-03-14. MFA TOTP\n\n**Problème:** New info about MFA\n**Impact:** Blocks\n**Fix type:** code\n**Sanitized title:** MFA TOTP\n**Sanitized:** New context about MFA TOTP limitation\n\n---\n',
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
      '## 2026-03-14. Hook misconfigured\n\n**Problème:** Hook blocks legit action\n**Impact:** Needs manual workaround\n**Suggestion:** Adjust hook config\n**Fix type:** config\n\n---\n',
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
      '## 2026-03-14. Third party down\n\n**Problème:** External API unavailable\n**Impact:** Cannot process\n**Fix type:** external\n\n---\n',
    );
    const gapsManager = createGapsManager(wsDir);
    const router = createGapRouter({ gapsManager, gitHub: mockGitHub, suggestionsDir: path.join(wsDir, '_suggestions') });
    await router.routeNewGaps();

    expect(mockGitHub.createIssue).not.toHaveBeenCalled();
  });

  it('skips gaps that already have a githubIssueNumber', async () => {
    fs.writeFileSync(
      path.join(wsDir, '_gaps', 'gaps.md'),
      '## 2026-03-14. Already tracked\n\n**Problème:** Something\n**Impact:** Something\n**Fix type:** code\n**Sanitized title:** Already tracked\n**Sanitized:** Something\n**GitHub Issue:** #42\n\n---\n',
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
      '## 2026-03-14. Already suggested\n\n**Problème:** Something\n**Impact:** Something\n**Fix type:** config\n**Suggestion slug:** fix-already-abc\n\n---\n',
    );
    const gapsManager = createGapsManager(wsDir);
    const router = createGapRouter({ gapsManager, gitHub: mockGitHub, suggestionsDir: path.join(wsDir, '_suggestions') });
    await router.routeNewGaps();

    const files = fs.readdirSync(path.join(wsDir, '_suggestions'));
    expect(files).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @opentidy/backend vitest run src/features/ameliorations/route-gap.test.ts`
Expected: FAIL (module does not exist.)

- [ ] **Step 3: Implement `route-gap.ts`**

Create `apps/backend/src/features/ameliorations/route-gap.ts`:

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import fs from 'fs';
import path from 'path';
import type { Amelioration } from '@opentidy/shared';

interface GitHubIssueManager {
  findExistingIssue(title: string): Promise<{ number: number; title: string } | null>;
  createIssue(gap: { sanitizedTitle: string; sanitizedBody: string; category?: string; source?: string; date: string }): Promise<number | null>;
  commentOnIssue(issueNumber: number, comment: string): Promise<void>;
}

interface GapsManager {
  listGaps(): Amelioration[];
  updateGapFields(index: number, fields: { githubIssueNumber?: number; suggestionSlug?: string }): void;
}

interface GapRouterDeps {
  gapsManager: GapsManager;
  gitHub: GitHubIssueManager;
  suggestionsDir: string;
  isDuplicateSuggestion?: (title: string) => boolean;
}

export function createGapRouter(deps: GapRouterDeps) {

  async function routeNewGaps(): Promise<void> {
    const gaps = deps.gapsManager.listGaps();

    for (const gap of gaps) {
      if (!gap.fixType) continue;
      if (gap.status !== 'open') continue;

      if (gap.fixType === 'code') {
        await routeCodeGap(gap);
      } else if (gap.fixType === 'config') {
        routeConfigGap(gap);
      }
      // external → no action
    }
  }

  async function routeCodeGap(gap: Amelioration): Promise<void> {
    // Already tracked
    if (gap.githubIssueNumber) return;
    if (!gap.sanitizedTitle || !gap.sanitizedBody) {
      console.warn(`[ameliorations] code gap "${gap.title}" missing sanitized fields, skipping`);
      return;
    }

    const sanitizedTitle = gap.sanitizedTitle;
    const existing = await deps.gitHub.findExistingIssue(sanitizedTitle);

    if (existing) {
      // Complement existing issue with new context
      await deps.gitHub.commentOnIssue(existing.number, gap.sanitizedBody);
      deps.gapsManager.updateGapFields(parseInt(gap.id), { githubIssueNumber: existing.number });
      console.log(`[ameliorations] commented on existing issue #${existing.number} for gap "${gap.title}"`);
    } else {
      const issueNumber = await deps.gitHub.createIssue({
        sanitizedTitle,
        sanitizedBody: gap.sanitizedBody,
        category: gap.category,
        source: gap.source,
        date: gap.date,
      });
      if (issueNumber) {
        deps.gapsManager.updateGapFields(parseInt(gap.id), { githubIssueNumber: issueNumber });
      }
    }
  }

  function routeConfigGap(gap: Amelioration): void {
    // Already has a suggestion
    if (gap.suggestionSlug) return;

    // Check for duplicates
    if (deps.isDuplicateSuggestion?.(gap.title)) {
      console.log(`[ameliorations] duplicate suggestion for "${gap.title}", skipping`);
      return;
    }

    // Create suggestion file
    const slug = gap.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
      + '-' + Date.now().toString(36);
    const content = `# ${gap.title}

**Urgency:** normal
**Source:** post-session
**Date:** ${gap.date}

## Summary
${gap.problem}

## Why
${gap.impact}

## What I would do
${gap.suggestion || 'Adjust the configuration to resolve this issue.'}
`;
    fs.writeFileSync(path.join(deps.suggestionsDir, `${slug}.md`), content);
    deps.gapsManager.updateGapFields(parseInt(gap.id), { suggestionSlug: slug });
    console.log(`[ameliorations] created suggestion "${slug}" for config gap "${gap.title}"`);
  }

  return { routeNewGaps };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @opentidy/backend vitest run src/features/ameliorations/route-gap.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/features/ameliorations/route-gap.ts apps/backend/src/features/ameliorations/route-gap.test.ts
git commit -m "feat(backend): add gap router; routes code gaps to GitHub Issues, config gaps to suggestions"
```

---

### Task 5: Extend extraction prompt and wire routing

**Files:**
- Modify: `apps/backend/src/features/memory/agents.ts:63-159`
- Modify: `apps/backend/src/features/memory/agents.test.ts`

**Note:** The existing `buildExtractionPrompt` test is missing required `dossierId` and `stateContent` params. Fix it while modifying this file by adding the missing fields to match the `ExtractionInput` interface.

- [ ] **Step 1: Write failing test for new prompt fields**

In `apps/backend/src/features/memory/agents.test.ts`, add:

```typescript
describe('buildExtractionPrompt, actionable gaps', () => {
  it('includes fixType and sanitization instructions in Mission 2', () => {
    const agents = createMemoryAgents(workspaceDir, { spawnClaude: mockSpawnClaude })
    const prompt = agents.buildExtractionPrompt({
      transcriptPath: '/tmp/transcript.jsonl',
      indexContent: '| test.md | business | 2026-03-16 | Test |',
      dossierId: 'test-dossier',
      stateContent: 'IN_PROGRESS',
    })
    expect(prompt).toContain('**Fix type:**')
    expect(prompt).toContain('code|config|external')
    expect(prompt).toContain('**Sanitized title:**')
    expect(prompt).toContain('**Sanitized:**')
    expect(prompt).toContain('ZERO PII')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opentidy/backend vitest run src/features/memory/agents.test.ts`
Expected: FAIL (prompt does not contain the new fields.)

- [ ] **Step 3: Update `buildExtractionPrompt` Mission 2 section**

In `apps/backend/src/features/memory/agents.ts`, replace the Mission 2 gap format block (lines 126-142) with:

```typescript
\`\`\`
---

## ${today}: <Short clear title>

**Problem:** <What concretely happened>
**Impact:** <Business or operational consequence>
**Category:** <capability|access|config|process|data>
**Fix type:** <code|config|external>
**Sanitized title:** <PII-free short title. ONLY if fixType is code>
**Sanitized:** <PII-free one-line technical summary. ONLY if fixType is code>
**Recommended actions:**
- <Concrete action 1 the user can take>
- <Concrete action 2 (optional)>
**Dossier:** ${input.dossierId}
**Session:** <session_id if found in transcript>
**Source:** post-session
\`\`\`

**Fix type rules:**
- \`code\`: the problem is in OpenTidy's source code (bug, missing feature, architectural limitation in the opentidy codebase itself)
- \`config\`: the problem is in Claude's configuration, prompts, hooks, or workspace setup
- \`external\`: the problem is an external limitation (third-party API, physical access, credentials the user must provide)
- The **Sanitized** field must contain ZERO PII; no names, emails, phone numbers, account IDs, company names, dossier context. Only the generic technical problem. If the gap cannot be described without PII, set fixType to \`external\` and omit the Sanitized field.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opentidy/backend vitest run src/features/memory/agents.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/features/memory/agents.ts apps/backend/src/features/memory/agents.test.ts
git commit -m "feat(backend): extend extraction prompt with gap classification and sanitization"
```

---

### Task 6: Wire gap routing into `runExtraction`

**Files:**
- Modify: `apps/backend/src/features/memory/agents.ts:212-220`
- Modify: `apps/backend/src/features/memory/agents.test.ts`

- [ ] **Step 1: Write failing test**

In `apps/backend/src/features/memory/agents.test.ts`, add:

```typescript
describe('runExtraction with gap routing', () => {
  it('calls onGapsWritten callback after extraction', async () => {
    const onGapsWritten = vi.fn()
    const agents = createMemoryAgents(workspaceDir, {
      spawnClaude: mockSpawnClaude,
      onGapsWritten,
    })

    // Create a substantial transcript
    const transcriptPath = path.join(workspaceDir, 'transcript.jsonl')
    const lines = Array.from({ length: 25 }, (_, i) => `{"type":"message","num":${i}}`).join('\n')
    fs.writeFileSync(transcriptPath, lines)

    // Create dossier dir with state.md
    const dossierDir = path.join(workspaceDir, 'test-dossier')
    fs.mkdirSync(dossierDir, { recursive: true })
    fs.writeFileSync(path.join(dossierDir, 'state.md'), '# Test\nSTATUS: IN_PROGRESS')

    await agents.runExtraction({
      transcriptPath,
      indexContent: '',
      dossierId: 'test-dossier',
      stateContent: 'IN_PROGRESS',
    })

    expect(onGapsWritten).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opentidy/backend vitest run src/features/memory/agents.test.ts`
Expected: FAIL (`onGapsWritten` is not accepted/called.)

- [ ] **Step 3: Add `onGapsWritten` callback to `createMemoryAgents`**

In `agents.ts`, modify the deps interface and `runExtraction`:

```typescript
export function createMemoryAgents(workspaceDir: string, deps: {
  spawnClaude: SpawnClaudeSimpleFn;
  onGapsWritten?: () => Promise<void> | void;
}) {
```

In `runExtraction`, after the `await runAgent(...)` call:

```typescript
async function runExtraction(input: ExtractionInput): Promise<void> {
  await lock.acquire()
  try {
    const prompt = buildExtractionPrompt(input)
    await runAgent(prompt, `Post-session analysis for dossier ${input.dossierId}. Perform all 3 missions: memory, gaps, log.`, 'memory-extraction', 'Post-session memory extraction')

    // Route newly written gaps (GitHub Issues, suggestions)
    if (deps.onGapsWritten) {
      try {
        await deps.onGapsWritten()
      } catch (err) {
        console.error('[memory] gap routing failed (non-blocking):', (err as Error).message)
      }
    }
  } finally {
    lock.release()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opentidy/backend vitest run src/features/memory/agents.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/features/memory/agents.ts apps/backend/src/features/memory/agents.test.ts
git commit -m "feat(backend): wire onGapsWritten callback into runExtraction for gap routing"
```

---

### Task 7: Wire everything in bootstrap (`index.ts`)

**Files:**
- Modify: `apps/backend/src/index.ts`

- [ ] **Step 1: Read `index.ts` to understand current wiring**

Read `apps/backend/src/index.ts`; find where `createMemoryAgents` is called and where the config is loaded.

- [ ] **Step 2: Add GitHub Issue manager creation**

After the config loading and before `createMemoryAgents`, add:

```typescript
import { createGitHubIssueManager } from './features/ameliorations/github-issue.js';
import { createGapRouter } from './features/ameliorations/route-gap.js';

// GitHub Issue manager (optional, only if token configured)
const gitHubIssueManager = config.github?.token
  ? createGitHubIssueManager({
      token: config.github.token,
      owner: config.github.owner || 'opentidy',
      repo: config.github.repo || 'opentidy',
    })
  : null;
```

- [ ] **Step 3: Create gap router and pass as callback**

```typescript
const gapRouter = gitHubIssueManager
  ? createGapRouter({
      gapsManager: gapsManager,
      gitHub: gitHubIssueManager,
      suggestionsDir: path.join(WORKSPACE_DIR, '_suggestions'),
      isDuplicateSuggestion: suggestionsManager.isDuplicateSuggestion,
    })
  : null;

const memoryAgents = createMemoryAgents(WORKSPACE_DIR, {
  spawnClaude,
  onGapsWritten: gapRouter ? () => gapRouter.routeNewGaps() : undefined,
});
```

- [ ] **Step 4: Build and verify**

Run: `pnpm build`
Expected: BUILD SUCCESS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/index.ts
git commit -m "feat(backend): wire gap routing into bootstrap. GitHub Issues for code gaps"
```

---

### Task 8: Add GitHub token to setup wizard

**Files:**
- Create: `apps/backend/src/cli/setup/github.ts`
- Modify: `apps/backend/src/cli/setup/index.ts`
- Modify: `apps/backend/src/cli/setup.ts` (add to MODULES/MODULE_ORDER)
- Modify: `apps/backend/src/cli/setup/status.ts` (add to getModuleStatuses)

The setup wizard uses a modular architecture: one file per module in `apps/backend/src/cli/setup/`. Follow the pattern from `telegram.ts`.

- [ ] **Step 1: Create `github.ts` setup module**

Create `apps/backend/src/cli/setup/github.ts`:

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { loadConfig, saveConfig, getConfigPath } from '../../shared/config.js';
import { ask, info, success } from './utils.js';

export async function setupGitHub(): Promise<void> {
  const configPath = getConfigPath();
  const config = loadConfig(configPath);

  console.log('');
  console.log('  ┌─────────────────────────────────────┐');
  console.log('  │  GitHub (Actionable Gaps)             │');
  console.log('  └─────────────────────────────────────┘');
  console.log('');
  info('OpenTidy can create GitHub Issues from gaps detected during sessions.');
  info('This requires a Personal Access Token with "repo" scope.');
  console.log('');

  if (config.github?.token) {
    info(`Current token: ...${config.github.token.slice(-8)}`);
    const keep = await ask('  Keep current token? (Y/n) ');
    if (keep.toLowerCase() !== 'n') {
      success('GitHub config unchanged.');
      return;
    }
  }

  const token = await ask('  GitHub Personal Access Token: ');
  if (!token.trim()) {
    info('Skipped, no token provided.');
    return;
  }

  const owner = (await ask('  Repo owner (default: opentidy): ')).trim() || 'opentidy';
  const repo = (await ask('  Repo name (default: opentidy): ')).trim() || 'opentidy';

  config.github = { token: token.trim(), owner, repo };
  saveConfig(configPath, config);
  success('GitHub configured.');
}
```

- [ ] **Step 2: Export from `index.ts`**

Add to `apps/backend/src/cli/setup/index.ts`:

```typescript
export { setupGitHub } from './github.js';
```

- [ ] **Step 3: Add to MODULES and MODULE_ORDER in `setup.ts`**

Read `apps/backend/src/cli/setup.ts`, find where modules are registered (MODULES map and MODULE_ORDER array), and add `github` following the existing pattern.

- [ ] **Step 4: Add to `getModuleStatuses` in `status.ts`**

Read `apps/backend/src/cli/setup/status.ts`, add a status check for GitHub:

```typescript
github: {
  configured: !!config.github?.token,
  label: 'GitHub',
},
```

- [ ] **Step 5: Build and verify**

Run: `pnpm build`
Expected: BUILD SUCCESS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/cli/setup/github.ts apps/backend/src/cli/setup/index.ts apps/backend/src/cli/setup.ts apps/backend/src/cli/setup/status.ts
git commit -m "feat(cli): add GitHub token module to setup wizard"
```

---

### Task 9: Full integration test

**Files:**
- Create: `apps/backend/src/features/ameliorations/integration.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGapsManager } from './gaps.js';
import { createGapRouter } from './route-gap.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Actionable Gaps, Integration', () => {
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
    // Simulate Claude writing a gap with new fields
    fs.writeFileSync(
      path.join(wsDir, '_gaps', 'gaps.md'),
      '## 2026-03-14. TOTP support missing\n\n**Problème:** Cannot handle MFA TOTP\n**Impact:** Blocks portal automation\n**Catégorie:** capability\n**Fix type:** code\n**Sanitized title:** TOTP support missing\n**Sanitized:** Cannot authenticate on portals requiring MFA TOTP authentication\n**Source:** post-session\n\n---\n',
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
      '## 2026-03-14. Hook too strict\n\n**Problème:** PreToolUse hook blocks legitimate Bash commands\n**Impact:** Must manually intervene\n**Suggestion:** Whitelist common commands\n**Catégorie:** config\n**Fix type:** config\n**Source:** post-session\n\n---\n',
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

  it('graceful degradation: no GitHub manager → gaps written but no issues', async () => {
    fs.writeFileSync(
      path.join(wsDir, '_gaps', 'gaps.md'),
      '## 2026-03-14. Something\n\n**Problème:** X\n**Impact:** Y\n**Fix type:** code\n**Sanitized title:** Something\n**Sanitized:** Test\n\n---\n',
    );

    // Without a router, gaps just stay in the file
    const gapsManager = createGapsManager(wsDir);
    const gaps = gapsManager.listGaps();
    expect(gaps[0].fixType).toBe('code');
    expect(gaps[0].githubIssueNumber).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run integration tests**

Run: `pnpm --filter @opentidy/backend vitest run src/features/ameliorations/integration.test.ts`
Expected: ALL PASS

- [ ] **Step 3: Run full test suite**

Run: `pnpm test`
Expected: ALL PASS, no regressions.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/features/ameliorations/integration.test.ts
git commit -m "test(backend): add integration tests for actionable gaps flow"
```
