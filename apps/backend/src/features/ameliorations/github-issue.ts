// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { AmeliorationCategory, AmeliorationSource } from '@opentidy/shared';

interface GitHubIssueConfig {
  token: string;
  owner: string;
  repo: string;
}

export interface SanitizedGap {
  sanitizedTitle: string;
  sanitizedBody: string;
  category?: AmeliorationCategory;
  source?: AmeliorationSource;
  date: string;
}

export interface ExistingIssue {
  number: number;
  title: string;
}

// PII patterns — defense-in-depth check before creating public issues
const PII_PATTERNS = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,    // email
  /(?:\+\d{1,3}\s?)?\(?\d{2,4}\)?[\s.-]\d{2,4}[\s.-]\d{2,4}/, // phone
  /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/,                       // SSN-like
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
      throw new Error('PII detected in sanitized gap content — refusing to create public issue');
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
