// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import after mocking
import * as api from './api';

function mockJsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('API client', () => {
  describe('GET endpoints', () => {
    it('fetchTasks calls GET /api/tasks', async () => {
      const tasks = [{ id: 'test', title: 'Test' }];
      mockFetch.mockReturnValue(mockJsonResponse(tasks));

      const result = await api.fetchTasks();

      expect(mockFetch).toHaveBeenCalledWith('/api/tasks', undefined);
      expect(result).toEqual(tasks);
    });

    it('fetchTask calls GET /api/task/:id', async () => {
      const task = { id: 'acme', title: 'Acme' };
      mockFetch.mockReturnValue(mockJsonResponse(task));

      const result = await api.fetchTask('acme');

      expect(mockFetch).toHaveBeenCalledWith('/api/task/acme', undefined);
      expect(result).toEqual(task);
    });

    it('fetchSuggestions calls GET /api/suggestions', async () => {
      mockFetch.mockReturnValue(mockJsonResponse([]));
      await api.fetchSuggestions();
      expect(mockFetch).toHaveBeenCalledWith('/api/suggestions', undefined);
    });

    it('fetchAmeliorations calls GET /api/ameliorations', async () => {
      mockFetch.mockReturnValue(mockJsonResponse([]));
      await api.fetchAmeliorations();
      expect(mockFetch).toHaveBeenCalledWith('/api/ameliorations', undefined);
    });

    it('fetchSessions calls GET /api/sessions', async () => {
      mockFetch.mockReturnValue(mockJsonResponse([]));
      await api.fetchSessions();
      expect(mockFetch).toHaveBeenCalledWith('/api/sessions', undefined);
    });

  });

  describe('POST endpoints', () => {
    it('createTask sends instruction', async () => {
      mockFetch.mockReturnValue(mockJsonResponse({ created: true }));

      await api.createTask('Test instruction');

      expect(mockFetch).toHaveBeenCalledWith('/api/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: 'Test instruction' }),
      });
    });

    it('resumeSession calls POST /api/task/:id/resume', async () => {
      mockFetch.mockReturnValue(mockJsonResponse({ resumed: true }));

      await api.resumeSession('acme');

      expect(mockFetch).toHaveBeenCalledWith('/api/task/acme/resume', { method: 'POST' });
    });

    it('sendInstruction sends instruction', async () => {
      mockFetch.mockReturnValue(mockJsonResponse({ launched: true }));

      await api.sendInstruction('acme', 'Do something');

      expect(mockFetch).toHaveBeenCalledWith('/api/task/acme/instruction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: 'Do something' }),
      });
    });

    it('approveSuggestion sends optional instruction', async () => {
      mockFetch.mockReturnValue(mockJsonResponse({ approved: true }));

      await api.approveSuggestion('tax-filing-2025', 'custom instruction');

      expect(mockFetch).toHaveBeenCalledWith('/api/suggestion/tax-filing-2025/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: 'custom instruction' }),
      });
    });

    it('ignoreSuggestion calls POST', async () => {
      mockFetch.mockReturnValue(mockJsonResponse({ ignored: true }));

      await api.ignoreSuggestion('test-slug');

      expect(mockFetch).toHaveBeenCalledWith('/api/suggestion/test-slug/ignore', { method: 'POST' });
    });

    it('timeoutSession calls POST', async () => {
      mockFetch.mockReturnValue(mockJsonResponse({ ok: true }));

      await api.timeoutSession('session-1');

      expect(mockFetch).toHaveBeenCalledWith('/api/session/session-1/timeout', { method: 'POST' });
    });

    it('resolveAmelioration calls POST', async () => {
      mockFetch.mockReturnValue(mockJsonResponse({ resolved: true }));

      await api.resolveAmelioration('1');

      expect(mockFetch).toHaveBeenCalledWith('/api/amelioration/1/resolve', { method: 'POST' });
    });

    it('triggerCheckup calls POST /api/checkup', async () => {
      mockFetch.mockReturnValue(mockJsonResponse({}));

      await api.triggerCheckup();

      expect(mockFetch).toHaveBeenCalledWith('/api/checkup', { method: 'POST' });
    });

    it('uploadFile sends FormData', async () => {
      mockFetch.mockReturnValue(Promise.resolve({ ok: true, json: () => Promise.resolve({ uploaded: true }) }));

      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      await api.uploadFile('acme', file);

      expect(mockFetch).toHaveBeenCalledWith('/api/task/acme/upload', {
        method: 'POST',
        body: expect.any(FormData),
      });
    });
  });

  describe('error handling', () => {
    it('throws on non-ok response', async () => {
      mockFetch.mockReturnValue(mockJsonResponse(null, 404));

      await expect(api.fetchTask('nonexistent')).rejects.toThrow('404');
    });

    it('throws on 500 response', async () => {
      mockFetch.mockReturnValue(mockJsonResponse(null, 500));

      await expect(api.fetchTasks()).rejects.toThrow('500');
    });
  });
});