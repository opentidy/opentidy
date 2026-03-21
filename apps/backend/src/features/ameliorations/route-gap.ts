// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import fs from 'fs';
import path from 'path';
import type { Amelioration } from '@opentidy/shared';
import { generateSlug } from '../../shared/slug.js';

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
    }
  }

  async function routeCodeGap(gap: Amelioration): Promise<void> {
    if (gap.githubIssueNumber) return;
    if (!gap.sanitizedTitle || !gap.sanitizedBody) {
      console.warn(`[ameliorations] code gap "${gap.title}" missing sanitized fields, skipping`);
      return;
    }

    const existing = await deps.gitHub.findExistingIssue(gap.sanitizedTitle);

    if (existing) {
      await deps.gitHub.commentOnIssue(existing.number, gap.sanitizedBody);
      deps.gapsManager.updateGapFields(parseInt(gap.id), { githubIssueNumber: existing.number });
      console.log(`[ameliorations] commented on existing issue #${existing.number} for gap "${gap.title}"`);
    } else {
      const issueNumber = await deps.gitHub.createIssue({
        sanitizedTitle: gap.sanitizedTitle,
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
    if (gap.suggestionSlug) return;

    if (deps.isDuplicateSuggestion?.(gap.title)) {
      console.log(`[ameliorations] duplicate suggestion for "${gap.title}", skipping`);
      return;
    }

    const slug = generateSlug(gap.title);
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
