// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the api module
vi.mock('./api', () => ({
  fetchJobs: vi.fn().mockResolvedValue([{ id: 'acme', title: 'Acme' }]),
  fetchSuggestions: vi.fn().mockResolvedValue([{ slug: 'test', title: 'Test' }]),
  fetchAmeliorations: vi.fn().mockResolvedValue([]),
  fetchSessions: vi.fn().mockResolvedValue([{ id: 'opentidy-acme', status: 'active' }]),
  createJob: vi.fn().mockResolvedValue({ created: true }),
  resumeSession: vi.fn().mockResolvedValue({ resumed: true }),
  sendInstruction: vi.fn().mockResolvedValue({ launched: true }),
  uploadFile: vi.fn().mockResolvedValue({ uploaded: true }),
  approveSuggestion: vi.fn().mockResolvedValue({ approved: true }),
  ignoreSuggestion: vi.fn().mockResolvedValue({ ignored: true }),
  timeoutSession: vi.fn().mockResolvedValue({ ok: true }),
  resolveAmelioration: vi.fn().mockResolvedValue({ resolved: true }),
  triggerCheckup: vi.fn().mockResolvedValue({}),
}));

import { useStore, connectSSE } from './store';
import * as api from './api';

beforeEach(() => {
  // Reset store state
  useStore.setState({
    jobs: [],
    suggestions: [],
    ameliorations: [],
    sessions: [],
    loading: false,
  });
  vi.clearAllMocks();
});

describe('Zustand store', () => {
  describe('initial state', () => {
    it('starts with empty arrays', () => {
      const state = useStore.getState();
      expect(state.jobs).toEqual([]);
      expect(state.suggestions).toEqual([]);
      expect(state.ameliorations).toEqual([]);
      expect(state.sessions).toEqual([]);
      expect(state.loading).toBe(false);
    });
  });

  describe('fetch actions', () => {
    it('fetchJobs updates store with API data', async () => {
      await useStore.getState().fetchJobs();
      expect(api.fetchJobs).toHaveBeenCalled();
      expect(useStore.getState().jobs).toEqual([{ id: 'acme', title: 'Acme' }]);
    });

    it('fetchSuggestions updates store', async () => {
      await useStore.getState().fetchSuggestions();
      expect(api.fetchSuggestions).toHaveBeenCalled();
      expect(useStore.getState().suggestions).toEqual([{ slug: 'test', title: 'Test' }]);
    });

    it('fetchAmeliorations updates store', async () => {
      await useStore.getState().fetchAmeliorations();
      expect(api.fetchAmeliorations).toHaveBeenCalled();
      expect(useStore.getState().ameliorations).toEqual([]);
    });

    it('fetchSessions updates store', async () => {
      await useStore.getState().fetchSessions();
      expect(api.fetchSessions).toHaveBeenCalled();
      expect(useStore.getState().sessions).toEqual([{ id: 'opentidy-acme', status: 'active' }]);
    });

  });

  describe('mutation actions', () => {
    it('createJob calls API then refreshes jobs', async () => {
      await useStore.getState().createJob('New task', true);
      expect(api.createJob).toHaveBeenCalledWith('New task', true);
      expect(api.fetchJobs).toHaveBeenCalled();
    });

    it('resumeSession calls API then refreshes sessions', async () => {
      await useStore.getState().resumeSession('acme');
      expect(api.resumeSession).toHaveBeenCalledWith('acme');
      expect(api.fetchSessions).toHaveBeenCalled();
    });

    it('sendInstruction calls API without refresh', async () => {
      await useStore.getState().sendInstruction('acme', 'Do it', false);
      expect(api.sendInstruction).toHaveBeenCalledWith('acme', 'Do it', false);
    });

    it('approveSuggestion refreshes suggestions and jobs', async () => {
      await useStore.getState().approveSuggestion('test-slug', 'instruction');
      expect(api.approveSuggestion).toHaveBeenCalledWith('test-slug', 'instruction');
      expect(api.fetchSuggestions).toHaveBeenCalled();
      expect(api.fetchJobs).toHaveBeenCalled();
    });

    it('ignoreSuggestion refreshes suggestions', async () => {
      await useStore.getState().ignoreSuggestion('test-slug');
      expect(api.ignoreSuggestion).toHaveBeenCalledWith('test-slug');
      expect(api.fetchSuggestions).toHaveBeenCalled();
    });

    it('timeoutSession calls API and refreshes sessions', async () => {
      await useStore.getState().timeoutSession('session-1');
      expect(api.timeoutSession).toHaveBeenCalledWith('session-1');
      expect(api.fetchSessions).toHaveBeenCalled();
    });

    it('resolveAmelioration refreshes ameliorations', async () => {
      await useStore.getState().resolveAmelioration('1');
      expect(api.resolveAmelioration).toHaveBeenCalledWith('1');
      expect(api.fetchAmeliorations).toHaveBeenCalled();
    });

    it('triggerCheckup calls API', async () => {
      await useStore.getState().triggerCheckup();
      expect(api.triggerCheckup).toHaveBeenCalled();
    });

    it('uploadFile calls API', async () => {
      const file = new File(['test'], 'doc.pdf');
      await useStore.getState().uploadFile('acme', file);
      expect(api.uploadFile).toHaveBeenCalledWith('acme', file);
    });
  });

  describe('connectSSE', () => {
    let mockEventSource: { addEventListener: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
    let originalEventSource: typeof globalThis.EventSource;

    beforeEach(() => {
      vi.useFakeTimers();
      mockEventSource = {
        addEventListener: vi.fn(),
        close: vi.fn(),
      };
      originalEventSource = globalThis.EventSource;
      // @ts-expect-error — mock constructor
      globalThis.EventSource = vi.fn(() => mockEventSource);
    });

    afterEach(() => {
      vi.useRealTimers();
      globalThis.EventSource = originalEventSource;
    });

    it('creates EventSource pointing to /api/events', () => {
      connectSSE();
      expect(globalThis.EventSource).toHaveBeenCalledWith('/api/events');
    });

    it('registers listeners for all SSE event types', () => {
      connectSSE();
      const eventTypes = mockEventSource.addEventListener.mock.calls.map((c: unknown[]) => c[0]);
      expect(eventTypes).toContain('session:started');
      expect(eventTypes).toContain('session:ended');
      expect(eventTypes).toContain('session:idle');
      expect(eventTypes).toContain('session:active');
      expect(eventTypes).toContain('session:output');
      expect(eventTypes).toContain('process:output');
      expect(eventTypes).toContain('job:updated');
      expect(eventTypes).toContain('job:completed');
      expect(eventTypes).toContain('suggestion:created');
      expect(eventTypes).toContain('amelioration:created');
      // 8 SSE refresh map + 2 custom (session:output, process:output) + 'open' + 'error' = 12
      expect(eventTypes.length).toBe(12);
    });

    it('returns a cleanup function that closes the EventSource', () => {
      const cleanup = connectSSE();
      expect(typeof cleanup).toBe('function');
      cleanup();
      expect(mockEventSource.close).toHaveBeenCalled();
    });

    it('session:started event triggers fetchSessions after debounce', async () => {
      connectSSE();
      const call = mockEventSource.addEventListener.mock.calls.find((c: unknown[]) => c[0] === 'session:started');
      const handler = call[1] as () => void;
      handler();
      vi.advanceTimersByTime(300);
      expect(api.fetchSessions).toHaveBeenCalled();
    });

    it('job:updated event triggers fetchJobs after debounce', async () => {
      connectSSE();
      const call = mockEventSource.addEventListener.mock.calls.find((c: unknown[]) => c[0] === 'job:updated');
      const handler = call[1] as () => void;
      handler();
      vi.advanceTimersByTime(300);
      expect(api.fetchJobs).toHaveBeenCalled();
    });

    it('suggestion:created event triggers fetchSuggestions after debounce', async () => {
      connectSSE();
      const call = mockEventSource.addEventListener.mock.calls.find((c: unknown[]) => c[0] === 'suggestion:created');
      const handler = call[1] as () => void;
      handler();
      vi.advanceTimersByTime(300);
      expect(api.fetchSuggestions).toHaveBeenCalled();
    });

    it('amelioration:created event triggers fetchAmeliorations after debounce', async () => {
      connectSSE();
      const call = mockEventSource.addEventListener.mock.calls.find((c: unknown[]) => c[0] === 'amelioration:created');
      const handler = call[1] as () => void;
      handler();
      vi.advanceTimersByTime(300);
      expect(api.fetchAmeliorations).toHaveBeenCalled();
    });

  });
});