import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMemoryAgents } from '../../src/memory/agents.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createMemoryManager } from '../../src/memory/manager.js'

const mockSpawnClaude = vi.fn().mockResolvedValue('## Contexte mémoire\n\n- Test fact\n')

describe('MemoryAgents', () => {
  let workspaceDir: string

  beforeEach(() => {
    workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-agents-test-'))
    const manager = createMemoryManager(workspaceDir)
    manager.ensureDir()
  })

  afterEach(() => {
    fs.rmSync(workspaceDir, { recursive: true, force: true })
  })

  describe('buildInjectionPrompt', () => {
    it('includes INDEX.md content and event context', () => {
      const agents = createMemoryAgents(workspaceDir, { spawnClaude: mockSpawnClaude })
      const prompt = agents.buildInjectionPrompt({
        indexContent: '| test.md | business | 2026-03-16 | Test |',
        event: 'Email from Jean about closure',
        stateContent: 'Dossier actif',
      })
      expect(prompt).toContain('INDEX.md')
      expect(prompt).toContain('Email from Jean')
      expect(prompt).toContain('30 lignes maximum')
    })
  })

  describe('buildExtractionPrompt', () => {
    it('includes transcript path and memory context', () => {
      const agents = createMemoryAgents(workspaceDir, { spawnClaude: mockSpawnClaude })
      const prompt = agents.buildExtractionPrompt({
        transcriptPath: '/tmp/transcript.jsonl',
        indexContent: '| test.md | business | 2026-03-16 | Test |',
      })
      expect(prompt).toContain('/tmp/transcript.jsonl')
      expect(prompt).toContain('INDEX.md')
    })
  })

  describe('isTranscriptSubstantial', () => {
    it('returns false for short transcripts', () => {
      const agents = createMemoryAgents(workspaceDir, { spawnClaude: mockSpawnClaude })
      const shortPath = path.join(workspaceDir, 'short.jsonl')
      fs.writeFileSync(shortPath, '{"type":"message"}\n{"type":"message"}\n')
      expect(agents.isTranscriptSubstantial(shortPath)).toBe(false)
    })

    it('returns true for long transcripts', () => {
      const agents = createMemoryAgents(workspaceDir, { spawnClaude: mockSpawnClaude })
      const longPath = path.join(workspaceDir, 'long.jsonl')
      const lines = Array.from({ length: 25 }, (_, i) => `{"type":"message","num":${i}}`).join('\n')
      fs.writeFileSync(longPath, lines)
      expect(agents.isTranscriptSubstantial(longPath)).toBe(true)
    })
  })
})
