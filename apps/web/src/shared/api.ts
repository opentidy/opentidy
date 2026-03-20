// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { Job, Suggestion, Amelioration, Session, MemoryIndexEntry, MemoryEntry, ClaudeProcess } from '@opentidy/shared';

const BASE = '/api';

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// GET
export const fetchJobs = () => json<Job[]>('/jobs');
export const fetchJob = (id: string) => json<Job>(`/job/${id}`);
export const fetchSuggestions = () => json<Suggestion[]>('/suggestions');
export const fetchAmeliorations = () => json<Amelioration[]>('/ameliorations');
export const fetchSessions = () => json<Session[]>('/sessions');
export const fetchCheckupStatus = () => json<{ lastRun: string | null; nextRun: string | null; result: string; launched: string[]; suggestions: number }>('/checkup/status');

export const getArtifactUrl = (jobId: string, filename: string) =>
  `${BASE}/job/${encodeURIComponent(jobId)}/artifact/${encodeURIComponent(filename)}`;

export const getTerminalPort = async (sessionName: string): Promise<number | null> => {
  try {
    const res = await json<{ port: number }>(`/terminal/${sessionName}/port`);
    return res.port;
  } catch {
    return null;
  }
};

// POST
export const createJob = (instruction: string, confirm = false) =>
  json('/job', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instruction, confirm }) });
export const resumeSession = (id: string) =>
  json(`/job/${id}/resume`, { method: 'POST' });
export const sendInstruction = (id: string, instruction: string, confirm = false) =>
  json(`/job/${id}/instruction`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instruction, confirm }) });
export const uploadFile = (id: string, file: File) => {
  const form = new FormData(); form.append('file', file);
  return fetch(`${BASE}/job/${id}/upload`, { method: 'POST', body: form });
};
export const approveSuggestion = (slug: string, instruction?: string) =>
  json(`/suggestion/${slug}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instruction }) });
export const ignoreSuggestion = (slug: string) =>
  json(`/suggestion/${slug}/ignore`, { method: 'POST' });
export const timeoutSession = (id: string) =>
  json(`/session/${id}/timeout`, { method: 'POST' });
export const stopSession = (id: string) =>
  json(`/session/${id}/stop`, { method: 'POST' });
export const setWaitingType = (id: string, type: 'user' | 'tiers') =>
  json(`/job/${id}/waiting-type`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type }) });
export const completeJob = (id: string) =>
  json(`/job/${id}/complete`, { method: 'POST' });
export const resolveAmelioration = (id: string) =>
  json(`/amelioration/${id}/resolve`, { method: 'POST' });
export const ignoreAmelioration = (id: string) =>
  json(`/amelioration/${id}/ignore`, { method: 'POST' });
export const triggerCheckup = () =>
  json('/checkup', { method: 'POST' });
export const launchTestTasks = () =>
  json<{ launched: number; ids: string[] }>('/test-tasks', { method: 'POST' });

// Memory
export const fetchMemoryIndex = () => json<MemoryIndexEntry[]>('/memory');
export const fetchMemoryFile = (filename: string) => json<MemoryEntry>(`/memory/${filename}`);
export const createMemoryFile = (data: { filename: string; category: string; description: string; content: string }) =>
  json('/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
export const updateMemoryFile = (filename: string, data: { content: string; category?: string; description?: string }) =>
  json(`/memory/${filename}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
export const archiveMemoryFile = (filename: string) =>
  json(`/memory/${filename}/archive`, { method: 'POST' });
export const sendMemoryPrompt = (text: string) =>
  json('/memory/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });

export const fetchClaudeProcesses = (type?: string, limit = 100) => {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  params.set('limit', String(limit));
  return json<ClaudeProcess[]>(`/claude-processes?${params}`);
};

export const fetchProcessOutput = async (id: number): Promise<string> => {
  const res = await fetch(`${BASE}/claude-processes/${id}/output`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
};

export const resetEverything = async () => {
  await json('/reset', { method: 'POST' });
  // Backend exits after responding — wait for it to come back up
  const maxWait = 15_000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {}
  }
  throw new Error('Backend did not restart in time');
};