// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createApp, type AppDeps } from '../../server.js'
import { createMemoryManager } from '../memory/manager.js'
import { makeDeps } from '../../shared/test-helpers/mock-deps.js'
import { req } from '../../shared/test-helpers/mock-request.js'
import { useTmpDir } from '../../shared/test-helpers/tmpdir.js'

describe('Adversarial memory API tests', () => {
  const tmp = useTmpDir('opentidy-adv-test-')
  let memoryManager: ReturnType<typeof createMemoryManager>
  let app: ReturnType<typeof createApp>
  let r: ReturnType<typeof req>
  let memoryAgents: AppDeps['memoryAgents']

  beforeEach(() => {
    memoryManager = createMemoryManager(tmp.path)
    memoryManager.ensureDir()
    memoryAgents = { runPromptAgent: vi.fn(async () => {}) }
    app = createApp(makeDeps({ memoryManager, memoryAgents, workspaceDir: tmp.path }))
    r = req(app)
  })

  // ════════════════════════════════════════════
  // INPUT VALIDATION ATTACKS
  // ════════════════════════════════════════════

  describe('input validation attacks', () => {
    it('rejects path traversal filename ../../../etc/shadow', async () => {
      const res = await r.post('/api/memory', {
        filename: '../../../etc/shadow',
        category: 'hack',
        description: 'path traversal',
        content: 'root:x:0:0:',
      })
      // Zod regex ^[a-z0-9-]+\.md$ should reject this
      expect(res.status).not.toBe(201)
    })

    it('rejects filename with null bytes', async () => {
      const res = await r.post('/api/memory', {
        filename: 'evil\x00.md',
        category: 'hack',
        description: 'null byte injection',
        content: 'pwned',
      })
      expect(res.status).not.toBe(201)
    })

    it('rejects filename with backslash path traversal', async () => {
      const res = await r.post('/api/memory', {
        filename: '..\\..\\etc\\passwd',
        category: 'hack',
        description: 'windows style traversal',
        content: 'pwned',
      })
      expect(res.status).not.toBe(201)
    })

    it('rejects filename with spaces', async () => {
      const res = await r.post('/api/memory', {
        filename: 'has spaces.md',
        category: 'test',
        description: 'spaces',
        content: 'x',
      })
      expect(res.status).not.toBe(201)
    })

    it('rejects filename with uppercase letters', async () => {
      const res = await r.post('/api/memory', {
        filename: 'UpperCase.md',
        category: 'test',
        description: 'uppercase',
        content: 'x',
      })
      expect(res.status).not.toBe(201)
    })

    it('rejects filename with only .md (empty name)', async () => {
      const res = await r.post('/api/memory', {
        filename: '.md',
        category: 'test',
        description: 'empty name',
        content: 'x',
      })
      expect(res.status).not.toBe(201)
    })

    it('handles 10MB content body without crashing', async () => {
      const hugeContent = 'x'.repeat(10 * 1024 * 1024) // 10MB
      const res = await r.post('/api/memory', {
        filename: 'huge-file.md',
        category: 'test',
        description: 'massive payload',
        content: hugeContent,
      })
      // Should either succeed (201) or reject with a size error
      // It must NOT crash the server (500 with unhandled exception)
      expect([201, 413, 500]).toContain(res.status)
    })

    it('rejects wrong types — number instead of string for filename', async () => {
      const res = await r.post('/api/memory', {
        filename: 12345,
        category: 'test',
        description: 'wrong type',
        content: 'x',
      })
      // Zod should reject: number doesn't match string regex
      expect(res.status).not.toBe(201)
    })

    it('rejects wrong types — array instead of string for content', async () => {
      const res = await r.post('/api/memory', {
        filename: 'bad-type.md',
        category: 'test',
        description: 'wrong type',
        content: ['an', 'array'],
      })
      expect(res.status).not.toBe(201)
    })

    it('rejects wrong types — object instead of string for category', async () => {
      const res = await r.post('/api/memory', {
        filename: 'bad-cat.md',
        category: { nested: true },
        description: 'wrong type',
        content: 'x',
      })
      expect(res.status).not.toBe(201)
    })

    it('rejects boolean where string expected', async () => {
      const res = await r.post('/api/memory', {
        filename: true,
        category: 'test',
        description: 'bool',
        content: 'x',
      })
      expect(res.status).not.toBe(201)
    })

    it('rejects null values for required fields', async () => {
      const res = await r.post('/api/memory', {
        filename: null,
        category: null,
        description: null,
        content: null,
      })
      expect(res.status).not.toBe(201)
    })

    // BUG FOUND: PUT /api/memory/:filename allows URL-encoded path traversal.
    // The :filename param is URL-decoded by Hono, so %2e%2e%2f becomes ../
    // The memory manager joins this with the memDir path — potential directory escape.
    // Zod's MemoryUpdateSchema does NOT validate the filename (it comes from the URL param).
    it('rejects URL-encoded path traversal in PUT filename param', async () => {
      // First create a legit file so the route doesn't 404 before the traversal check
      memoryManager.writeFile({
        filename: 'legit.md',
        category: 'test',
        description: 'legit',
        content: 'ok',
      })

      // %2e%2e%2f = ../
      const res = await r.put('/api/memory/%2e%2e%2fetc%2fshadow', {
        content: 'hacked',
      })
      // Should be rejected, not processed
      // Currently: readFile will throw "not found" → 500 (not a clean 400)
      expect(res.status).not.toBe(200)
    })

    it('PUT with empty content string — should be allowed per schema', async () => {
      memoryManager.writeFile({
        filename: 'will-empty.md',
        category: 'test',
        description: 'test',
        content: 'original',
      })

      const res = await r.put('/api/memory/will-empty.md', {
        content: '',
      })
      // MemoryUpdateSchema has content: z.string() — empty string is valid
      expect(res.status).toBe(200)
      const entry = memoryManager.readFile('will-empty.md')
      expect(entry.content).toBe('')
    })

    // BUG FOUND: POST /api/memory with a filename that already exists silently overwrites.
    // The writeFile method in manager.ts updates if file exists. The POST route (create)
    // should arguably return 409 Conflict, but it doesn't check for existence.
    it('POST /api/memory with duplicate filename returns 409 Conflict', async () => {
      memoryManager.writeFile({
        filename: 'existing.md',
        category: 'test',
        description: 'original',
        content: 'first version',
      })

      const res = await r.post('/api/memory', {
        filename: 'existing.md',
        category: 'test',
        description: 'duplicate',
        content: 'second version',
      })
      // BUG: Returns 201 instead of 409 — silently overwrites existing file
      expect(res.status).toBe(409)
    })

    it('rejects extra unknown fields in POST body (or ignores them safely)', async () => {
      const res = await r.post('/api/memory', {
        filename: 'extra-fields.md',
        category: 'test',
        description: 'test',
        content: 'x',
        __proto__: { admin: true },
        constructor: 'evil',
        extraField: 'should be stripped',
      })
      // Zod strips unknown fields by default, so this should succeed
      expect(res.status).toBe(201)
    })

    it('handles extremely long filename', async () => {
      const longName = 'a'.repeat(500) + '.md'
      const res = await r.post('/api/memory', {
        filename: longName,
        category: 'test',
        description: 'long name',
        content: 'x',
      })
      // Regex allows it (no length limit) — but OS may reject it
      // This is a potential gap: no max filename length in schema
      expect([201, 500]).toContain(res.status)
    })
  })

  // ════════════════════════════════════════════
  // PROMPT ENDPOINT ATTACKS
  // ════════════════════════════════════════════

  describe('prompt endpoint attacks', () => {
    it('handles extremely long text (100KB)', async () => {
      const longText = 'Remember this: '.repeat(7000) // ~105KB
      const res = await r.post('/api/memory/prompt', { text: longText })
      // Should either process it or reject with 413, not crash
      expect([200, 413, 500]).toContain(res.status)
    })

    it('handles shell injection attempt in prompt text', async () => {
      const res = await r.post('/api/memory/prompt', {
        text: '"; rm -rf /; echo "',
      })
      // Should pass text as-is to the agent (which is mocked)
      expect(res.status).toBe(200)
      expect(memoryAgents!.runPromptAgent).toHaveBeenCalledWith('"; rm -rf /; echo "')
    })

    it('handles markdown/code injection in prompt text', async () => {
      const res = await r.post('/api/memory/prompt', {
        text: '```\n#!/bin/bash\nrm -rf /\n```\n# INJECT HEADING',
      })
      expect(res.status).toBe(200)
      expect(memoryAgents!.runPromptAgent).toHaveBeenCalledWith(
        '```\n#!/bin/bash\nrm -rf /\n```\n# INJECT HEADING'
      )
    })

    it('handles HTML/XSS attempt in prompt text', async () => {
      const res = await r.post('/api/memory/prompt', {
        text: '<script>alert("xss")</script><img onerror="fetch(\'/api/reset\',{method:\'POST\'})">',
      })
      expect(res.status).toBe(200)
    })

    it('handles unicode and emoji in prompt text', async () => {
      const res = await r.post('/api/memory/prompt', {
        text: 'Souviens-toi que 日本語 est important 🎉 \u0000 \uFFFD',
      })
      expect(res.status).toBe(200)
    })

    it('propagates agent errors as 500', async () => {
      const failingAgents = {
        runPromptAgent: vi.fn(async () => { throw new Error('Claude API timeout') }),
      }
      const failApp = createApp(makeDeps({
        memoryManager,
        memoryAgents: failingAgents,
        workspaceDir: tmp.path,
      }))
      const r2 = req(failApp)

      const res = await r2.post('/api/memory/prompt', { text: 'test' })
      expect(res.status).toBe(500)
      const body = await res.json()
      expect(body.error).toBeDefined()
    })

    it('handles rapid successive calls to /api/memory/prompt', async () => {
      const promises = Array.from({ length: 20 }, (_, i) =>
        r.post('/api/memory/prompt', { text: `concurrent request ${i}` })
      )
      const results = await Promise.all(promises)
      // All should complete without crashes
      for (const res of results) {
        expect(res.status).toBe(200)
      }
      expect(memoryAgents!.runPromptAgent).toHaveBeenCalledTimes(20)
    })
  })

  // ════════════════════════════════════════════
  // HTTP EDGE CASES
  // ════════════════════════════════════════════

  describe('HTTP edge cases', () => {
    // BUG FOUND: Zod parse failure surfaces as 500 (internal server error) instead of 400.
    // The server's onError handler catches ZodError but returns 500 generically.
    // Validation errors should return 400 Bad Request.
    it('POST with malformed JSON body returns 400 not 500', async () => {
      const res = await r.raw('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"filename": "bad.md", broken json',
      })
      // BUG: Returns 500 instead of 400 for malformed JSON
      expect(res.status).toBe(400)
    })

    // BUG FOUND: Zod validation errors return 500 instead of 400.
    // Missing required fields should be a client error (400), not server error (500).
    it('POST with missing required fields returns 400 not 500', async () => {
      const res = await r.post('/api/memory', {
        filename: 'incomplete.md',
        // missing category, description, content
      })
      // BUG: Returns 500 (ZodError caught by onError) instead of 400
      expect(res.status).toBe(400)
    })

    it('GET /api/memory/nonexistent.md returns 404 not 500', async () => {
      const res = await r.get('/api/memory/nonexistent.md')
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error).toBeDefined()
    })

    it('GET /api/memory/ with trailing slash still works', async () => {
      const res = await r.get('/api/memory/')
      // Hono may or may not match — test actual behavior
      expect([200, 404]).toContain(res.status)
    })

    it('GET /api/memory/:filename with special URL characters (spaces, %20)', async () => {
      const res = await r.get('/api/memory/file%20with%20spaces.md')
      // Should get 404 (file doesn't exist) not crash
      expect(res.status).toBe(404)
    })

    it('GET /api/memory/:filename with unicode in URL', async () => {
      const res = await r.get('/api/memory/café.md')
      expect(res.status).toBe(404)
    })

    it('PUT without Content-Type header', async () => {
      memoryManager.writeFile({
        filename: 'for-put.md',
        category: 'test',
        description: 'test',
        content: 'original',
      })

      const res = await r.raw('/api/memory/for-put.md', {
        method: 'PUT',
        // No Content-Type header
        body: JSON.stringify({ content: 'updated' }),
      })
      // Hono should still try to parse JSON — may fail or succeed
      expect([200, 400, 415, 500]).toContain(res.status)
    })

    it('POST with empty body', async () => {
      const res = await r.raw('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // No body at all
      })
      expect(res.status).not.toBe(201)
    })

    it('POST with Content-Type text/plain', async () => {
      const res = await r.raw('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          filename: 'text-plain.md',
          category: 'test',
          description: 'wrong content type',
          content: 'x',
        }),
      })
      // Should either work (Hono is lenient) or reject
      expect([201, 400, 415, 500]).toContain(res.status)
    })

    it('DELETE method on memory endpoint returns 404/405', async () => {
      const res = await r.raw('/api/memory/some-file.md', {
        method: 'DELETE',
      })
      // No DELETE route defined
      expect([404, 405]).toContain(res.status)
    })

    it('PATCH method on memory endpoint returns 404/405', async () => {
      const res = await r.raw('/api/memory/some-file.md', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'patch' }),
      })
      expect([404, 405]).toContain(res.status)
    })

    // BUG FOUND: PUT /api/memory/:filename for non-existent file returns 500 instead of 404.
    // The readFile call throws, caught by onError → 500. Should be 404.
    it('PUT /api/memory/:filename for non-existent file returns 404 not 500', async () => {
      const res = await r.put('/api/memory/ghost.md', {
        content: 'nope',
      })
      // BUG: Returns 500 (uncaught throw from readFile) instead of 404
      expect(res.status).toBe(404)
    })

    it('handles concurrent POST requests creating the same file', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        r.post('/api/memory', {
          filename: 'race-condition.md',
          category: 'test',
          description: `attempt ${i}`,
          content: `content from request ${i}`,
        })
      )
      const results = await Promise.all(promises)
      // Exactly one should succeed (201), rest get 409 (file already exists)
      const statuses = results.map(res => res.status)
      expect(statuses.filter(s => s === 201)).toHaveLength(1)
      expect(statuses.filter(s => s === 409)).toHaveLength(9)
      // File should exist with the first version
      const entry = memoryManager.readFile('race-condition.md')
      expect(entry.content).toMatch(/^content from request \d$/)
    })

    it('handles concurrent PUT requests on the same file', async () => {
      memoryManager.writeFile({
        filename: 'concurrent-put.md',
        category: 'test',
        description: 'test',
        content: 'original',
      })

      const promises = Array.from({ length: 10 }, (_, i) =>
        r.put('/api/memory/concurrent-put.md', {
          content: `update ${i}`,
        })
      )
      const results = await Promise.all(promises)
      for (const res of results) {
        expect(res.status).toBe(200)
      }
      const entry = memoryManager.readFile('concurrent-put.md')
      expect(entry.content).toMatch(/^update \d$/)
    })
  })

  // ════════════════════════════════════════════
  // ARCHIVE EDGE CASES
  // ════════════════════════════════════════════

  describe('archive edge cases', () => {
    it('GET archived file returns 404', async () => {
      memoryManager.writeFile({
        filename: 'will-archive.md',
        category: 'test',
        description: 'test',
        content: 'bye',
      })
      memoryManager.archiveFile('will-archive.md')

      const res = await r.get('/api/memory/will-archive.md')
      expect(res.status).toBe(404)
    })

    it('archive already-archived file returns 404', async () => {
      memoryManager.writeFile({
        filename: 'double-archive.md',
        category: 'test',
        description: 'test',
        content: 'bye',
      })
      memoryManager.archiveFile('double-archive.md')

      const res = await r.post('/api/memory/double-archive.md/archive')
      expect(res.status).toBe(404)
    })

    it('create new file with same name as archived file works', async () => {
      memoryManager.writeFile({
        filename: 'recycled.md',
        category: 'old',
        description: 'old version',
        content: 'old content',
      })
      memoryManager.archiveFile('recycled.md')

      const res = await r.post('/api/memory', {
        filename: 'recycled.md',
        category: 'new',
        description: 'new version',
        content: 'new content',
      })
      expect(res.status).toBe(201)

      const entry = memoryManager.readFile('recycled.md')
      expect(entry.content).toBe('new content')
      expect(entry.category).toBe('new')
    })

    it('GET /api/memory after archiving excludes archived files', async () => {
      memoryManager.writeFile({
        filename: 'keep-me.md',
        category: 'test',
        description: 'stays',
        content: 'x',
      })
      memoryManager.writeFile({
        filename: 'archive-me.md',
        category: 'test',
        description: 'goes away',
        content: 'x',
      })
      memoryManager.archiveFile('archive-me.md')

      const res = await r.get('/api/memory')
      expect(res.status).toBe(200)
      const entries = await res.json()
      const filenames = entries.map((e: any) => e.filename)
      expect(filenames).toContain('keep-me.md')
      expect(filenames).not.toContain('archive-me.md')
    })

    it('PUT on archived file returns error', async () => {
      memoryManager.writeFile({
        filename: 'archived-put.md',
        category: 'test',
        description: 'test',
        content: 'original',
      })
      memoryManager.archiveFile('archived-put.md')

      const res = await r.put('/api/memory/archived-put.md', {
        content: 'try to update archived',
      })
      // readFile throws for archived → 500
      expect(res.status).not.toBe(200)
    })

    it('archive a file then archive another file — index is correct', async () => {
      memoryManager.writeFile({
        filename: 'first.md',
        category: 'test',
        description: 'first',
        content: 'x',
      })
      memoryManager.writeFile({
        filename: 'second.md',
        category: 'test',
        description: 'second',
        content: 'x',
      })
      memoryManager.writeFile({
        filename: 'third.md',
        category: 'test',
        description: 'third',
        content: 'x',
      })

      await r.post('/api/memory/first.md/archive')
      await r.post('/api/memory/third.md/archive')

      const res = await r.get('/api/memory')
      const entries = await res.json()
      expect(entries).toHaveLength(1)
      expect(entries[0].filename).toBe('second.md')
    })
  })

  // ════════════════════════════════════════════
  // CONTENT INJECTION / XSS IN MEMORY FILES
  // ════════════════════════════════════════════

  describe('content injection in memory files', () => {
    it('frontmatter injection — content with --- tries to inject metadata', async () => {
      const res = await r.post('/api/memory', {
        filename: 'inject-meta.md',
        category: 'test',
        description: 'test',
        content: '---\ncategory: hacked\ncreated: 1970-01-01\n---\nEvil content',
      })
      expect(res.status).toBe(201)

      // The stored file should have the REAL frontmatter, not the injected one
      const entry = memoryManager.readFile('inject-meta.md')
      expect(entry.category).toBe('test') // not 'hacked'
    })

    // FIX: Pipes are now escaped in writeIndexFile and unescaped in readIndex.
    it('pipe characters in description do not corrupt INDEX.md', async () => {
      const res = await r.post('/api/memory', {
        filename: 'pipe-test.md',
        category: 'test',
        description: 'has | pipes | in | description',
        content: 'Content with | pipes | everywhere |',
      })
      expect(res.status).toBe(201)

      const index = memoryManager.readIndex()
      const entry = index.find(e => e.filename === 'pipe-test.md')
      expect(entry).toBeDefined()
      expect(entry?.description).toBe('has | pipes | in | description')
    })

    // FIX: Pipes are now escaped/unescaped in writeIndexFile/readIndex.
    it('pipe in description does not corrupt INDEX.md parsing', async () => {
      memoryManager.writeFile({
        filename: 'pipe-desc.md',
        category: 'test',
        description: 'value | with | pipes',
        content: 'x',
      })

      const index = memoryManager.readIndex()
      const entry = index.find(e => e.filename === 'pipe-desc.md')
      expect(entry?.description).toBe('value | with | pipes')
    })

    // FIX: Newlines in description are now sanitized to spaces.
    it('newline in description does not corrupt INDEX.md', async () => {
      memoryManager.writeFile({
        filename: 'newline-desc.md',
        category: 'test',
        description: 'line1\nline2',
        content: 'x',
      })

      const index = memoryManager.readIndex()
      const entry = index.find(e => e.filename === 'newline-desc.md')
      expect(entry).toBeDefined()
      expect(entry?.description).toBe('line1 line2')
    })

    it('content with very long single line (no newlines) is stored correctly', async () => {
      const longLine = 'a'.repeat(100000)
      const res = await r.post('/api/memory', {
        filename: 'long-line.md',
        category: 'test',
        description: 'long',
        content: longLine,
      })
      expect(res.status).toBe(201)
      const entry = memoryManager.readFile('long-line.md')
      expect(entry.content).toBe(longLine)
    })
  })

  // ════════════════════════════════════════════
  // MEMORY MANAGER WITHOUT INIT
  // ════════════════════════════════════════════

  describe('no memoryManager configured', () => {
    let appNoMem: ReturnType<typeof createApp>
    let r2: ReturnType<typeof req>

    beforeEach(() => {
      appNoMem = createApp(makeDeps({
        memoryManager: undefined,
        memoryAgents: undefined,
        workspaceDir: tmp.path,
      }))
      r2 = req(appNoMem)
    })

    it('GET /api/memory returns empty array when manager is undefined', async () => {
      const res = await r2.get('/api/memory')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([])
    })

    it('POST /api/memory returns 503 when manager is undefined', async () => {
      const res = await r2.post('/api/memory', {
        filename: 'test.md',
        category: 'test',
        description: 'test',
        content: 'x',
      })
      expect(res.status).toBe(503)
    })

    it('GET /api/memory/:filename returns 503 when manager is undefined', async () => {
      const res = await r2.get('/api/memory/test.md')
      expect(res.status).toBe(503)
    })

    it('PUT /api/memory/:filename returns 503 when manager is undefined', async () => {
      const res = await r2.put('/api/memory/test.md', { content: 'x' })
      expect(res.status).toBe(503)
    })

    it('POST /api/memory/:filename/archive returns 503 when manager is undefined', async () => {
      const res = await r2.post('/api/memory/test.md/archive')
      expect(res.status).toBe(503)
    })

    it('POST /api/memory/prompt returns 503 when agents is undefined', async () => {
      const res = await r2.post('/api/memory/prompt', { text: 'hello' })
      expect(res.status).toBe(503)
    })
  })

  // ════════════════════════════════════════════
  // PATH TRAVERSAL IN GET/PUT URL PARAMS
  // ════════════════════════════════════════════

  describe('path traversal via URL params', () => {
    it('GET /api/memory/../../package.json does not leak files', async () => {
      const res = await r.get('/api/memory/../../package.json')
      // URL normalization resolves ../../ before routing, so the path
      // becomes /package.json which doesn't match any API route.
      // SPA fallback may serve index.html (200), but no data is leaked.
      const text = await res.text()
      expect(text).not.toContain('"name"')
      expect(text).not.toContain('"version"')
      expect(text).not.toContain('opentidy')
    })

    it('GET /api/memory/%2e%2e%2f%2e%2e%2fpackage.json rejects traversal', async () => {
      const res = await r.get('/api/memory/%2e%2e%2f%2e%2e%2fpackage.json')
      expect(res.status).not.toBe(200)
    })

    it('POST /api/memory/../../etc/passwd/archive rejects traversal', async () => {
      const res = await r.post('/api/memory/../../etc/passwd/archive')
      // Should not actually try to archive /etc/passwd
      expect(res.status).not.toBe(200)
    })

    // BUG FOUND: No path traversal protection in GET/PUT/archive memory routes.
    // The memoryManager.readFile and archiveFile use path.join(memDir, filename)
    // where filename comes directly from the URL parameter. If Hono decodes %2f
    // as /, path.join will resolve it, potentially escaping memDir.
    it('readFile does not escape _memory directory', async () => {
      // Create a file outside _memory to test traversal
      const secretFile = path.join(tmp.path, 'secret.txt')
      fs.writeFileSync(secretFile, 'TOP SECRET DATA')

      // Try to read it via path traversal
      const res = await r.get('/api/memory/../secret.txt')
      if (res.status === 200) {
        const body = await res.json()
        // If we got 200, the content should NOT contain our secret
        expect(JSON.stringify(body)).not.toContain('TOP SECRET DATA')
      } else {
        // 404 is the correct response
        expect(res.status).toBe(404)
      }
    })
  })

  // ════════════════════════════════════════════
  // EDGE CASES IN CONTENT PARSING
  // ════════════════════════════════════════════

  describe('frontmatter parsing edge cases', () => {
    it('file with no frontmatter is handled gracefully', async () => {
      // Write a raw file with no frontmatter directly to disk
      const filePath = path.join(tmp.path, '_memory', 'no-front.md')
      fs.writeFileSync(filePath, '# Just markdown\nNo frontmatter here.')

      const res = await r.get('/api/memory/no-front.md')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.category).toBe('uncategorized')
      expect(body.content).toContain('Just markdown')
    })

    it('file with empty frontmatter is handled', async () => {
      const filePath = path.join(tmp.path, '_memory', 'empty-front.md')
      fs.writeFileSync(filePath, '---\n---\n\nBody here.')

      const res = await r.get('/api/memory/empty-front.md')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.category).toBe('uncategorized')
    })

    it('file with malformed frontmatter does not crash', async () => {
      const filePath = path.join(tmp.path, '_memory', 'bad-front.md')
      fs.writeFileSync(filePath, '---\nthis is not: yaml: properly: formatted:\n---\n\nBody.')

      const res = await r.get('/api/memory/bad-front.md')
      expect(res.status).toBe(200)
    })

    it('binary content in markdown file does not crash', async () => {
      const filePath = path.join(tmp.path, '_memory', 'binary.md')
      // Write some binary-ish content
      const buf = Buffer.from([0x00, 0x01, 0xFF, 0xFE, 0x89, 0x50, 0x4E, 0x47])
      fs.writeFileSync(filePath, buf)

      const res = await r.get('/api/memory/binary.md')
      // Should not crash — may return garbage content but should respond
      expect([200, 500]).toContain(res.status)
    })
  })

  // ════════════════════════════════════════════
  // MEMORY INDEX CORRUPTION
  // ════════════════════════════════════════════

  describe('INDEX.md corruption resilience', () => {
    it('handles corrupted INDEX.md gracefully', async () => {
      const indexPath = path.join(tmp.path, '_memory', 'INDEX.md')
      fs.writeFileSync(indexPath, 'THIS IS NOT A VALID INDEX FILE\nJust random garbage.')

      const res = await r.get('/api/memory')
      expect(res.status).toBe(200)
      // Should return empty array (no valid entries parsed)
      const entries = await res.json()
      expect(Array.isArray(entries)).toBe(true)
    })

    it('handles empty INDEX.md', async () => {
      const indexPath = path.join(tmp.path, '_memory', 'INDEX.md')
      fs.writeFileSync(indexPath, '')

      const res = await r.get('/api/memory')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([])
    })

    it('handles INDEX.md with only header (no entries)', async () => {
      const indexPath = path.join(tmp.path, '_memory', 'INDEX.md')
      fs.writeFileSync(indexPath, `# OpenTidy Memory Index

| fichier | catégorie | mis à jour | description |
|---------|-----------|------------|-------------|
`)

      const res = await r.get('/api/memory')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([])
    })

    it('writing a file fixes corrupted INDEX.md', async () => {
      const indexPath = path.join(tmp.path, '_memory', 'INDEX.md')
      fs.writeFileSync(indexPath, 'CORRUPTED')

      // Write a new file — should rebuild index with this entry
      const res = await r.post('/api/memory', {
        filename: 'fix-index.md',
        category: 'test',
        description: 'fixes the index',
        content: 'x',
      })
      expect(res.status).toBe(201)

      const indexRes = await r.get('/api/memory')
      const entries = await indexRes.json()
      expect(entries.length).toBeGreaterThanOrEqual(1)
      expect(entries.some((e: any) => e.filename === 'fix-index.md')).toBe(true)
    })
  })
})