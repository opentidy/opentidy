// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { create } from 'zustand';
import { useSyncExternalStore } from 'react';
import type { Task, Suggestion, Amelioration, Session, SessionHistoryEntry, SSEEventType, MemoryIndexEntry, MemoryEntry, AgentProcess } from '@opentidy/shared';
import * as api from './api';

export interface SessionOutputLine {
  type: string;
  content: string;
  time: string;
}

interface Store {
  tasks: Task[];
  suggestions: Suggestion[];
  ameliorations: Amelioration[];
  sessions: Session[];
  checkupStatus: { lastRun: string | null; nextRun: string | null; result: string } | null;
  memoryIndex: MemoryIndexEntry[];
  selectedMemory: MemoryEntry | null;
  memoryLoading: boolean;
  claudeProcesses: AgentProcess[];
  sessionHistory: SessionHistoryEntry[];
  loading: boolean;
  error: string | null;
  clearError: () => void;

  fetchMemoryIndex: () => Promise<void>;
  selectMemory: (filename: string) => Promise<void>;
  clearSelectedMemory: () => void;
  fetchClaudeProcesses: () => Promise<void>;
  fetchSessionHistory: (taskId: string) => Promise<void>;

  fetchTasks: () => Promise<void>;
  fetchSuggestions: () => Promise<void>;
  fetchAmeliorations: () => Promise<void>;
  fetchSessions: () => Promise<void>;
  fetchCheckupStatus: () => Promise<void>;

  createTask: (instruction: string) => Promise<void>;
  resumeSession: (id: string) => Promise<void>;
  sendInstruction: (id: string, instruction: string) => Promise<void>;
  uploadFile: (id: string, file: File) => Promise<void>;
  timeoutSession: (id: string) => Promise<void>;
  stopSession: (id: string) => Promise<void>;
  approveSuggestion: (slug: string, instruction?: string) => Promise<void>;
  ignoreSuggestion: (slug: string) => Promise<void>;
  completeTask: (id: string) => Promise<void>;
  setWaitingType: (id: string, type: 'user' | 'tiers') => Promise<void>;
  resolveAmelioration: (id: string) => Promise<void>;
  ignoreAmelioration: (id: string) => Promise<void>;
  triggerCheckup: () => Promise<void>;
  resetting: boolean;
  resetEverything: () => Promise<void>;
  launchTestTasks: () => Promise<void>;
}

// Wrap actions that should show errors in the UI
function withError(set: (s: Partial<Store>) => void, fn: () => Promise<void>): Promise<void> {
  return fn().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[store] action failed:', msg);
    set({ error: msg });
  });
}

// Mutable output stores, outside Zustand to avoid render storms
// Components subscribe via useSyncExternalStore hooks below
const _sessionOutputs = new Map<string, SessionOutputLine[]>();
const _processOutputs = new Map<number, string>();
let _outputVersion = 0;
const _outputListeners = new Set<() => void>();
function notifyOutputChange() {
  _outputVersion++;
  for (const cb of _outputListeners) cb();
}
function subscribeOutputs(cb: () => void) {
  _outputListeners.add(cb);
  return () => { _outputListeners.delete(cb); };
}
function getOutputVersion() { return _outputVersion; }

const EMPTY_LINES: SessionOutputLine[] = [];

export function useSessionOutput(taskId: string): SessionOutputLine[] {
  // Subscribe to force re-render on output changes, then read the mutable data
  useSyncExternalStore(subscribeOutputs, getOutputVersion);
  return _sessionOutputs.get(taskId) ?? EMPTY_LINES;
}

export function useProcessOutput(trackId: number): string {
  // Subscribe to force re-render on output changes
  useSyncExternalStore(subscribeOutputs, getOutputVersion);
  return _processOutputs.get(trackId) ?? '';
}

export const useStore = create<Store>((set, get) => ({
  tasks: [], suggestions: [], ameliorations: [], sessions: [], checkupStatus: null, loading: false,
  memoryIndex: [], selectedMemory: null, memoryLoading: false,
  claudeProcesses: [], sessionHistory: [],
  error: null,
  clearError: () => set({ error: null }),

  fetchMemoryIndex: async () => {
    try {
      set({ memoryLoading: true });
      set({ memoryIndex: await api.fetchMemoryIndex(), memoryLoading: false });
    } catch (err) {
      console.warn('[store] fetchMemoryIndex failed:', (err as Error).message);
      set({ memoryLoading: false });
    }
  },
  selectMemory: async (filename) => {
    try {
      set({ memoryLoading: true });
      set({ selectedMemory: await api.fetchMemoryFile(filename), memoryLoading: false });
    } catch (err) {
      console.warn('[store] selectMemory failed:', (err as Error).message);
      set({ memoryLoading: false });
    }
  },
  clearSelectedMemory: () => set({ selectedMemory: null }),
  fetchClaudeProcesses: async () => {
    try {
      set({ claudeProcesses: await api.fetchClaudeProcesses() });
    } catch (err) {
      console.warn('[store] fetchClaudeProcesses failed:', (err as Error).message);
    }
  },
  fetchSessionHistory: async (taskId: string) => {
    try {
      set({ sessionHistory: await api.fetchSessionHistory(taskId) });
    } catch (err) {
      console.warn('[store] fetchSessionHistory failed:', (err as Error).message);
    }
  },

  fetchTasks: async () => {
    try {
      set({ tasks: await api.fetchTasks() });
    } catch (err) {
      console.warn('[store] fetchTasks failed:', (err as Error).message);
    }
  },
  fetchSuggestions: async () => {
    try {
      set({ suggestions: await api.fetchSuggestions() });
    } catch (err) {
      console.warn('[store] fetchSuggestions failed:', (err as Error).message);
    }
  },
  fetchAmeliorations: async () => {
    try {
      set({ ameliorations: await api.fetchAmeliorations() });
    } catch (err) {
      console.warn('[store] fetchAmeliorations failed:', (err as Error).message);
    }
  },
  fetchSessions: async () => {
    try {
      set({ sessions: await api.fetchSessions() });
    } catch (err) {
      console.warn('[store] fetchSessions failed:', (err as Error).message);
    }
  },
  fetchCheckupStatus: async () => {
    try {
      set({ checkupStatus: await api.fetchCheckupStatus() });
    } catch (err) {
      console.warn('[store] fetchCheckupStatus failed:', (err as Error).message);
    }
  },

  createTask: (instruction) => withError(set, async () => { await api.createTask(instruction); await get().fetchTasks(); }),
  resumeSession: (id) => withError(set, async () => { await api.resumeSession(id); await get().fetchSessions(); }),
  sendInstruction: (id, instruction) => withError(set, async () => { await api.sendInstruction(id, instruction); await get().fetchTasks(); await get().fetchSessions(); }),
  uploadFile: (id, file) => withError(set, async () => { await api.uploadFile(id, file); await get().fetchTasks(); }),
  timeoutSession: (id) => withError(set, async () => { await api.timeoutSession(id); await get().fetchSessions(); }),
  stopSession: (id) => withError(set, async () => { await api.stopSession(id); await get().fetchSessions(); await get().fetchTasks(); }),
  approveSuggestion: (slug, instruction) => withError(set, async () => { await api.approveSuggestion(slug, instruction); await get().fetchSuggestions(); await get().fetchTasks(); }),
  ignoreSuggestion: (slug) => withError(set, async () => { await api.ignoreSuggestion(slug); await get().fetchSuggestions(); }),
  completeTask: (id) => withError(set, async () => { await api.completeTask(id); await get().fetchTasks(); await get().fetchSessions(); }),
  setWaitingType: (id, type) => withError(set, async () => { await api.setWaitingType(id, type); await get().fetchTasks(); await get().fetchSessions(); }),
  resolveAmelioration: (id) => withError(set, async () => { await api.resolveAmelioration(id); await get().fetchAmeliorations(); }),
  ignoreAmelioration: (id) => withError(set, async () => { await api.ignoreAmelioration(id); await get().fetchAmeliorations(); }),
  triggerCheckup: () => withError(set, async () => { await api.triggerCheckup(); }),
  resetting: false,
  resetEverything: async () => {
    set({ resetting: true });
    try {
      await api.resetEverything();
    } catch {
      // Backend may not restart in dev mode. Redirect anyway since config is already reset
    }
    window.location.href = '/setup';
  },
  launchTestTasks: () => withError(set, async () => {
    await api.launchTestTasks();
    await get().fetchTasks();
    await get().fetchSessions();
  }),
}));

type FetchFn = 'fetchSessions' | 'fetchTasks' | 'fetchClaudeProcesses' | 'fetchSuggestions' | 'fetchAmeliorations';

const SSE_FETCH_MAP: Partial<Record<SSEEventType, FetchFn[]>> = {
  'session:started': ['fetchSessions', 'fetchTasks', 'fetchClaudeProcesses'],
  'session:ended': ['fetchSessions', 'fetchTasks', 'fetchClaudeProcesses'],
  'session:idle': ['fetchSessions'],
  'session:active': ['fetchSessions'],
  'task:updated': ['fetchTasks', 'fetchSessions'],
  'task:completed': ['fetchTasks', 'fetchSessions'],
  'suggestion:created': ['fetchSuggestions'],
  'amelioration:created': ['fetchAmeliorations'],
  'system:reset': ['fetchTasks', 'fetchSessions', 'fetchSuggestions', 'fetchAmeliorations', 'fetchClaudeProcesses'],
};

// Debounced SSE refetch: batches rapid events into a single fetch round
const _pendingFetches = new Set<FetchFn>();
let _sseDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFetch(fns: FetchFn[]) {
  for (const fn of fns) _pendingFetches.add(fn);
  if (!_sseDebounceTimer) {
    _sseDebounceTimer = setTimeout(() => {
      _sseDebounceTimer = null;
      const store = useStore.getState();
      const batch = [..._pendingFetches];
      _pendingFetches.clear();
      for (const fn of batch) store[fn]();
    }, 300);
  }
}

export function connectSSE(): () => void {
  const es = new EventSource('/api/events');
  const eventTypes = Object.keys(SSE_FETCH_MAP) as SSEEventType[];
  let wasConnected = false;

  for (const type of eventTypes) {
    es.addEventListener(type, () => {
      const fns = SSE_FETCH_MAP[type];
      if (fns) scheduleFetch(fns);
    });
  }

  // Session output: mutable store, debounced notify
  let sessionOutputFlushTimer: ReturnType<typeof setTimeout> | null = null;
  es.addEventListener('session:output', (e: MessageEvent) => {
    try {
      const raw = JSON.parse(e.data);
      // SSE event format: { type: 'session:output', data: { taskId, event: { type, content } }, timestamp }
      const taskId: string = raw.data?.taskId ?? raw.taskId;
      const eventType: string = raw.data?.event?.type ?? raw.eventType ?? 'other';
      const content: string = raw.data?.event?.content ?? raw.content ?? '';
      const current = _sessionOutputs.get(taskId) ?? [];
      current.push({
        type: eventType,
        content,
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      });
      // Cap to last 500 lines to prevent memory leak on long sessions
      if (current.length > 500) current.splice(0, current.length - 500);
      _sessionOutputs.set(taskId, current);
      if (!sessionOutputFlushTimer) {
        sessionOutputFlushTimer = setTimeout(() => {
          sessionOutputFlushTimer = null;
          notifyOutputChange();
        }, 200);
      }
    } catch (err) {
      console.warn('[sse] failed to parse session:output event:', err);
    }
  });

  // Process output: mutable store, debounced notify
  let processOutputFlushTimer: ReturnType<typeof setTimeout> | null = null;
  es.addEventListener('process:output', (e: MessageEvent) => {
    try {
      const raw = JSON.parse(e.data);
      // SSE event format: { type: 'process:output', data: { trackId, content }, timestamp }
      const trackId: number = raw.data?.trackId ?? raw.trackId;
      const content: string = raw.data?.content ?? raw.content ?? '';
      let current = (_processOutputs.get(trackId) ?? '') + content;
      // Cap to last 500KB to prevent memory leak on long processes
      if (current.length > 512_000) current = current.slice(-512_000);
      _processOutputs.set(trackId, current);
      if (!processOutputFlushTimer) {
        processOutputFlushTimer = setTimeout(() => {
          processOutputFlushTimer = null;
          notifyOutputChange();
        }, 200);
      }
    } catch (err) {
      console.warn('[sse] failed to parse process:output event:', err);
    }
  });

  // On (re)connect, refetch everything to catch events missed during downtime
  es.addEventListener('open', () => {
    if (wasConnected) {
      console.log('[sse] reconnected, refetching all data');
    }
    wasConnected = true;
    // Always refetch on connect/reconnect. Fetch functions handle errors internally
    const store = useStore.getState();
    store.fetchTasks();
    store.fetchSessions();
    store.fetchSuggestions();
    store.fetchAmeliorations();
  });

  es.addEventListener('error', () => {
    console.warn('[sse] connection lost, will auto-reconnect');
  });

  return () => es.close();
}