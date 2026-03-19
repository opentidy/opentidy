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
      expect(manager.containsPII('Contact john@personal-email.test')).toBe(true);
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
        sanitizedTitle: 'Contact john@personal-email.test for access',
        sanitizedBody: 'Need to reach john@personal-email.test',
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
