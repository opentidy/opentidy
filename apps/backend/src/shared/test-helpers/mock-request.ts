// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { createApp, type AppDeps } from '../../server.js'
import { makeDeps } from './mock-deps.js'

/** Create a Hono app wired with makeDeps + optional overrides. */
export function createTestApp(overrides: Partial<AppDeps> = {}): ReturnType<typeof createApp> {
  return createApp(makeDeps(overrides))
}

/** Convenience request helper wrapping `app.request()`. */
export function req(app: ReturnType<typeof createApp>) {
  return {
    get: (urlPath: string) =>
      app.request(urlPath, { method: 'GET' }),
    post: (urlPath: string, body?: unknown) =>
      app.request(urlPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),
    put: (urlPath: string, body: unknown) =>
      app.request(urlPath, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    /** Send raw request with custom headers/body */
    raw: (urlPath: string, init: RequestInit) =>
      app.request(urlPath, init),
  }
}
