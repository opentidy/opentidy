// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMemoryAgents } from './agents.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createMemoryManager } from './manager.js'

const mockSpawnAgent = vi.fn().mockReturnValue({
  promise: Promise.resolve('## Memory context\n\n- Test fact\n'),
  kill: vi.fn(),
  pid: undefined,
  trackId: undefined,
})

const mockAdapter = {
  name: 'claude' as const,
  binary: 'claude',
  instructionFile: 'CLAUDE.md',
  configEnvVar: 'CLAUDE_CONFIG_DIR',
  experimental: false,
  buildArgs: vi.fn(({ systemPrompt, instruction }: any) => ['-p', '--system-prompt', systemPrompt, instruction]),
  getEnv: vi.fn(() => ({})),
  readSessionId: vi.fn(() => null),
  writeConfig: vi.fn(),
}

describe('MemoryAgents', () => {
  let workspaceDir: string

  beforeEach(() => {
    workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opentidy-agents-test-'))
    const manager = createMemoryManager(workspaceDir)
    manager.ensureDir()
  })

  afterEach(() => {
    fs.rmSync(workspaceDir, { recursive: true, force: true })
  })

  describe('buildInjectionPrompt', () => {
    it('includes INDEX.md content and event context', () => {
      const agents = createMemoryAgents(workspaceDir, { spawnAgent: mockSpawnAgent, adapter: mockAdapter })
      const prompt = agents.buildInjectionPrompt({
        indexContent: '| test.md | business | 2026-03-16 | Test |',
        event: 'Email from Jean about closure',
        stateContent: 'Dossier actif',
      })
      expect(prompt).toContain('INDEX.md')
      expect(prompt).toContain('Email from Jean')
      expect(prompt).toContain('30 lines maximum')
    })
  })

  describe('buildExtractionPrompt', () => {
    it('includes transcript path and memory context', () => {
      const agents = createMemoryAgents(workspaceDir, { spawnAgent: mockSpawnAgent, adapter: mockAdapter })
      const prompt = agents.buildExtractionPrompt({
        transcriptPath: '/tmp/transcript.jsonl',
        indexContent: '| test.md | business | 2026-03-16 | Test |',
        dossierId: 'test-dossier',
        stateContent: 'IN_PROGRESS',
      })
      expect(prompt).toContain('/tmp/transcript.jsonl')
      expect(prompt).toContain('INDEX.md')
    })

    it('includes fixType and sanitization instructions in Mission 2', () => {
      const agents = createMemoryAgents(workspaceDir, { spawnAgent: mockSpawnAgent, adapter: mockAdapter })
      const prompt = agents.buildExtractionPrompt({
        transcriptPath: '/tmp/transcript.jsonl',
        indexContent: '| test.md | business | 2026-03-16 | Test |',
        dossierId: 'test-dossier',
        stateContent: 'IN_PROGRESS',
      })
      expect(prompt).toContain('**Fix type:**')
      expect(prompt).toContain('code|config|external')
      expect(prompt).toContain('**Sanitized title:**')
      expect(prompt).toContain('**Sanitized:**')
      expect(prompt).toContain('ZERO PII')
    })
  })

  describe('runExtraction with gap routing', () => {
    it('calls onGapsWritten callback after extraction', async () => {
      const onGapsWritten = vi.fn()
      const agents = createMemoryAgents(workspaceDir, {
        spawnAgent: mockSpawnAgent,
        adapter: mockAdapter,
        onGapsWritten,
      })

      await agents.runExtraction({
        transcriptPath: '/tmp/transcript.jsonl',
        indexContent: '',
        dossierId: 'test-dossier',
        stateContent: 'IN_PROGRESS',
      })

      expect(onGapsWritten).toHaveBeenCalled()
    })

    it('does not fail if onGapsWritten throws', async () => {
      const onGapsWritten = vi.fn().mockRejectedValue(new Error('GitHub API down'))
      const agents = createMemoryAgents(workspaceDir, {
        spawnAgent: mockSpawnAgent,
        adapter: mockAdapter,
        onGapsWritten,
      })

      // Should not throw
      await agents.runExtraction({
        transcriptPath: '/tmp/transcript.jsonl',
        indexContent: '',
        dossierId: 'test-dossier',
        stateContent: 'IN_PROGRESS',
      })

      expect(onGapsWritten).toHaveBeenCalled()
    })
  })

  describe('isTranscriptSubstantial', () => {
    it('returns false for short transcripts', () => {
      const agents = createMemoryAgents(workspaceDir, { spawnAgent: mockSpawnAgent, adapter: mockAdapter })
      const shortPath = path.join(workspaceDir, 'short.jsonl')
      fs.writeFileSync(shortPath, '{"type":"message"}\n{"type":"message"}\n')
      expect(agents.isTranscriptSubstantial(shortPath)).toBe(false)
    })

    it('returns true for long transcripts', () => {
      const agents = createMemoryAgents(workspaceDir, { spawnAgent: mockSpawnAgent, adapter: mockAdapter })
      const longPath = path.join(workspaceDir, 'long.jsonl')
      const lines = Array.from({ length: 25 }, (_, i) => `{"type":"message","num":${i}}`).join('\n')
      fs.writeFileSync(longPath, lines)
      expect(agents.isTranscriptSubstantial(longPath)).toBe(true)
    })
  })
})