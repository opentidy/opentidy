// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { AppDeps } from '../../server.js'

/**
 * Build a fully-stubbed AppDeps object.
 * Every field has a safe no-op default; pass `overrides` to replace any subset.
 */
export function makeDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    workspace: {
      listTaskIds: () => [],
      getTask: () => ({}) as any,
      taskManager: {
        createTask: () => {},
        createTaskFromSuggestion: () => {},
        completeTask: () => {},
        saveArtifact: () => {},
      },
      suggestionsManager: { listSuggestions: () => [], ignoreSuggestion: () => {} },
      gapsManager: { listGaps: () => [], markResolved: () => {}, markIgnored: () => {} },
    },
    launcher: {
      launchSession: async () => {},
      listActiveSessions: () => [],
      archiveSession: async () => {},
      sendMessage: async () => {},
    },
    hooks: { handleHook: () => ({ status: 'ok' }) },
    receiver: { handleGmailWebhook: async () => ({ accepted: true }) },
    checkup: {
      runCheckup: async () => ({ launched: [], suggestions: 0 }),
      getStatus: () => ({ lastRun: null, nextRun: null, result: '', launched: [], suggestions: 0 }),
    },
    notify: { notifySuggestion: async () => {} },
    sse: { emit: () => {}, addClient: () => {}, removeClient: () => {} },
    workspaceDir: '/tmp/opentidy-test',
    ...overrides,
  }
}
