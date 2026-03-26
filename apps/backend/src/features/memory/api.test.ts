// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createApp, type AppDeps } from '../../server.js'
import { createMemoryManager } from './manager.js'
import { makeDeps } from '../../shared/test-helpers/mock-deps.js'
import { req } from '../../shared/test-helpers/mock-request.js'
import { useTmpDir } from '../../shared/test-helpers/tmpdir.js'

describe('Memory API routes', () => {
  const tmp = useTmpDir('opentidy-mem-test-')
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

  // ────────────────────────────────────────────
  // GET /api/memory
  // ────────────────────────────────────────────

  describe('GET /api/memory', () => {
    it('returns empty array when no memories exist', async () => {
      const res = await r.get('/api/memory')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([])
    })

    it('returns entries after creating memories', async () => {
      memoryManager.writeFile({
        filename: 'contacts.md',
        category: 'people',
        description: 'Contact list',
        content: '# Contacts\n- Alice',
      })
      memoryManager.writeFile({
        filename: 'passwords.md',
        category: 'security',
        description: 'Password policy',
        content: 'Use strong passwords.',
      })

      const res = await r.get('/api/memory')
      expect(res.status).toBe(200)
      const entries = await res.json()
      expect(entries).toHaveLength(2)

      const filenames = entries.map((e: any) => e.filename)
      expect(filenames).toContain('contacts.md')
      expect(filenames).toContain('passwords.md')
    })
  })

  // ────────────────────────────────────────────
  // GET /api/memory/:filename
  // ────────────────────────────────────────────

  describe('GET /api/memory/:filename', () => {
    it('returns 404 for non-existent file', async () => {
      const res = await r.get('/api/memory/does-not-exist.md')
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error).toBeDefined()
    })

    it('returns full memory entry with content', async () => {
      memoryManager.writeFile({
        filename: 'notes.md',
        category: 'general',
        description: 'General notes',
        content: 'Some important content here.',
      })

      const res = await r.get('/api/memory/notes.md')
      expect(res.status).toBe(200)
      const entry = await res.json()
      expect(entry.filename).toBe('notes.md')
      expect(entry.category).toBe('general')
      expect(entry.description).toBe('General notes')
      expect(entry.content).toBe('Some important content here.')
      expect(entry.created).toBeDefined()
      expect(entry.updated).toBeDefined()
    })
  })

  // ────────────────────────────────────────────
  // POST /api/memory
  // ────────────────────────────────────────────

  describe('POST /api/memory', () => {
    it('creates a new memory file and returns 201', async () => {
      const res = await r.post('/api/memory', {
        filename: 'new-file.md',
        category: 'test',
        description: 'Test file',
        content: 'Hello world',
      })
      expect(res.status).toBe(201)
      expect(await res.json()).toEqual({ ok: true })

      // Verify it actually exists via the manager
      const entry = memoryManager.readFile('new-file.md')
      expect(entry.content).toBe('Hello world')
      expect(entry.category).toBe('test')
    })

    it('returns error for missing required fields', async () => {
      const res = await r.post('/api/memory', {
        filename: 'bad.md',
        // missing category, description, content
      })
      // Zod validation failure → onError → 400
      expect(res.status).toBe(400)
    })

    it('rejects invalid filename format', async () => {
      const res = await r.post('/api/memory', {
        filename: 'UPPER_CASE.txt', // must be ^[a-z0-9-]+\.md$
        category: 'test',
        description: 'Test',
        content: 'x',
      })
      expect(res.status).toBe(400) // Zod regex validation fails
    })

    it('rejects filename without .md extension', async () => {
      const res = await r.post('/api/memory', {
        filename: 'no-extension',
        category: 'test',
        description: 'Test',
        content: 'x',
      })
      expect(res.status).toBe(400)
    })
  })

  // ────────────────────────────────────────────
  // PUT /api/memory/:filename
  // ────────────────────────────────────────────

  describe('PUT /api/memory/:filename', () => {
    it('updates existing file content', async () => {
      memoryManager.writeFile({
        filename: 'editable.md',
        category: 'general',
        description: 'Will be edited',
        content: 'Original content',
      })

      const res = await r.put('/api/memory/editable.md', {
        content: 'Updated content',
      })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })

      const entry = memoryManager.readFile('editable.md')
      expect(entry.content).toBe('Updated content')
      // Category and description preserved from existing
      expect(entry.category).toBe('general')
      expect(entry.description).toBe('Will be edited')
    })

    it('updates category and description when provided', async () => {
      memoryManager.writeFile({
        filename: 'meta-edit.md',
        category: 'old-cat',
        description: 'Old desc',
        content: 'Body text',
      })

      const res = await r.put('/api/memory/meta-edit.md', {
        content: 'New body',
        category: 'new-cat',
        description: 'New desc',
      })
      expect(res.status).toBe(200)

      const entry = memoryManager.readFile('meta-edit.md')
      expect(entry.content).toBe('New body')
      expect(entry.category).toBe('new-cat')
      expect(entry.description).toBe('New desc')
    })

    it('returns 404 for non-existent file', async () => {
      const res = await r.put('/api/memory/ghost.md', {
        content: 'nope',
      })
      // readFile throws → try/catch → 404
      expect(res.status).toBe(404)
    })
  })

  // ────────────────────────────────────────────
  // POST /api/memory/:filename/archive
  // ────────────────────────────────────────────

  describe('POST /api/memory/:filename/archive', () => {
    it('archives an existing file', async () => {
      memoryManager.writeFile({
        filename: 'to-archive.md',
        category: 'temp',
        description: 'Will be archived',
        content: 'Goodbye',
      })

      const res = await r.post('/api/memory/to-archive.md/archive')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })

      // File no longer in index
      const index = memoryManager.readIndex()
      expect(index.find((e) => e.filename === 'to-archive.md')).toBeUndefined()

      // File moved to _archived
      const archivedPath = path.join(tmp.path, '_memory', '_archived', 'to-archive.md')
      expect(fs.existsSync(archivedPath)).toBe(true)
    })

    it('returns 404 for non-existent file', async () => {
      const res = await r.post('/api/memory/nope.md/archive')
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error).toBeDefined()
    })
  })

  // ────────────────────────────────────────────
  // POST /api/memory/prompt
  // ────────────────────────────────────────────

  describe('POST /api/memory/prompt', () => {
    it('calls the prompt agent and returns ok', async () => {
      const res = await r.post('/api/memory/prompt', {
        text: 'Remember that my dentist is Dr. Smith',
      })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
      expect(memoryAgents!.runPromptAgent).toHaveBeenCalledWith(
        'Remember that my dentist is Dr. Smith'
      )
    })

    it('returns 503 when memoryAgents is not available', async () => {
      const appNoAgents = createApp(
        makeDeps({ memoryManager, memoryAgents: undefined, workspaceDir: tmp.path })
      )
      const r2 = req(appNoAgents)
      const res = await r2.post('/api/memory/prompt', { text: 'hello' })
      expect(res.status).toBe(503)
    })

    it('validates input: rejects empty text', async () => {
      const res = await r.post('/api/memory/prompt', { text: '' })
      // Zod min(1) fails → 400
      expect(res.status).toBe(400)
    })

    it('validates input: rejects missing text field', async () => {
      const res = await r.post('/api/memory/prompt', {})
      expect(res.status).toBe(400)
    })
  })

  // ────────────────────────────────────────────
  // Route ordering: /api/memory/prompt vs /:filename
  // ────────────────────────────────────────────

  describe('route ordering', () => {
    it('POST /api/memory/prompt does not collide with POST /api/memory/:filename/archive', async () => {
      // "prompt" should NOT be treated as a :filename
      const res = await r.post('/api/memory/prompt', {
        text: 'This should go to the prompt agent',
      })
      expect(res.status).toBe(200)
      expect(memoryAgents!.runPromptAgent).toHaveBeenCalled()
    })

    it('GET /api/memory/prompt.md reads a file named prompt.md (not the prompt route)', async () => {
      // Create a file literally named "prompt.md"
      memoryManager.writeFile({
        filename: 'prompt.md',
        category: 'test',
        description: 'A file named prompt',
        content: 'This is a file, not the agent.',
      })

      const res = await r.get('/api/memory/prompt.md')
      expect(res.status).toBe(200)
      const entry = await res.json()
      expect(entry.filename).toBe('prompt.md')
      expect(entry.content).toBe('This is a file, not the agent.')
    })
  })
})