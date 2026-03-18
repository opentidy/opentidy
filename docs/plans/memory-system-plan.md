# Memory System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Alfred a persistent global memory that sessions read on launch and write to on exit, editable by Lolo via the UI.

**Architecture:** Markdown files in `workspace/_memory/` with INDEX.md as compact index. Three agents: injection (session launch), extraction (session end via hook), prompt (UI natural language). File-based lockfile for concurrency.

**Tech Stack:** TypeScript, Hono, Zod, Vitest, React 19, Tailwind v4, Zustand

**Spec:** `docs/design/memory-system.md`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `apps/backend/src/memory/manager.ts` | Core memory file I/O (read/write INDEX.md, memory files, archive) |
| `apps/backend/src/memory/lock.ts` | File-based lock manager for `_memory/.lock` |
| `apps/backend/src/memory/agents.ts` | Spawn claude -p agents (injection, extraction, prompt) |
| `apps/backend/src/memory/index.ts` | Re-exports public API |
| `apps/backend/tests/memory/manager.test.ts` | Tests for memory manager |
| `apps/backend/tests/memory/lock.test.ts` | Tests for lock manager |
| `apps/backend/tests/memory/agents.test.ts` | Tests for agent spawning |
| `apps/web/src/pages/Memory.tsx` | Memory page (list + editor + prompt) |

### Modified files
| File | Change |
|------|--------|
| `packages/shared/src/types.ts` | Add MemoryEntry, MemoryIndex types |
| `packages/shared/src/schemas.ts` | Add Zod schemas for memory endpoints |
| `apps/backend/src/server.ts` | Add 6 memory API routes |
| `apps/backend/src/hooks/handler.ts` | handleSessionEnd → launch extraction agent |
| `apps/backend/src/launcher/session.ts` | After generateDossierClaudeMd → call injection agent |
| `apps/backend/src/receiver/triage.ts` | Include memory context in triage system prompt |
| `apps/backend/src/launcher/checkup.ts` | Include memory context in checkup prompt |
| `workspace/CLAUDE.md` | Add "don't write to _memory/" instruction |
| `apps/web/src/api.ts` | Add memory fetch functions |
| `apps/web/src/store.ts` | Add memory store slice |
| `apps/web/src/components/DesktopNav.tsx` | Add Mémoire nav link |
| `apps/web/src/components/MobileNav.tsx` | Add Mémoire nav link |
| `apps/backend/src/index.ts` | Create memory manager/agents, pass to deps |
| `apps/web/src/App.tsx` (or router config) | Add /memory route |
| `.gitignore` | Add exception for `workspace/_memory/` |

---

## Chunk 1: Core Memory Infrastructure (backend)

### Task 1: Shared types and schemas

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/schemas.ts`

- [ ] **Step 1: Add memory types to types.ts**

Add at end of file:

```typescript
export interface MemoryEntry {
  filename: string
  category: string
  created: string   // YYYY-MM-DD
  updated: string   // YYYY-MM-DD
  description: string
  content: string   // full markdown body (without frontmatter)
}

export interface MemoryIndexEntry {
  filename: string
  category: string
  updated: string
  description: string
}
```

- [ ] **Step 2: Add Zod schemas to schemas.ts**

Add at end of file:

```typescript
export const MemoryPromptSchema = z.object({
  text: z.string().min(1),
})

export const MemoryUpdateSchema = z.object({
  content: z.string(),
  category: z.string().optional(),
  description: z.string().optional(),
})

export const MemoryCreateSchema = z.object({
  filename: z.string().regex(/^[a-z0-9-]+\.md$/),
  category: z.string(),
  description: z.string(),
  content: z.string(),
})
```

- [ ] **Step 3: Build shared package**

Run: `cd /Users/lolo/Documents/alfred && pnpm --filter @alfred/shared build`
Expected: Build success

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/schemas.ts
git commit -m "feat(shared): add memory system types and schemas"
```

---

### Task 2: Memory lock manager

**Files:**
- Create: `apps/backend/src/memory/lock.ts`
- Create: `apps/backend/tests/memory/lock.test.ts`

- [ ] **Step 1: Write lock manager tests**

```typescript
// apps/backend/tests/memory/lock.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createMemoryLock } from '../../src/memory/lock.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('MemoryLock', () => {
  let tmpDir: string
  let lock: ReturnType<typeof createMemoryLock>

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-lock-test-'))
    lock = createMemoryLock(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('acquires and releases lock', async () => {
    await lock.acquire()
    expect(fs.existsSync(path.join(tmpDir, '.lock'))).toBe(true)
    await lock.release()
    expect(fs.existsSync(path.join(tmpDir, '.lock'))).toBe(false)
  })

  it('waits for lock to be released', async () => {
    await lock.acquire()
    const lock2 = createMemoryLock(tmpDir)

    // Release after 200ms
    setTimeout(() => lock.release(), 200)

    const start = Date.now()
    await lock2.acquire()
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(150)
    await lock2.release()
  })

  it('throws on timeout', async () => {
    await lock.acquire()
    const lock2 = createMemoryLock(tmpDir)
    await expect(lock2.acquire(500)).rejects.toThrow('timeout')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/lolo/Documents/alfred && pnpm --filter @alfred/backend test -- tests/memory/lock.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement lock manager**

```typescript
// apps/backend/src/memory/lock.ts
import fs from 'node:fs'
import path from 'node:path'

const RETRY_INTERVAL_MS = 200
const DEFAULT_TIMEOUT_MS = 5000

export function createMemoryLock(memoryDir: string) {
  const lockPath = path.join(memoryDir, '.lock')

  async function acquire(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' })
        return
      } catch {
        await new Promise(r => setTimeout(r, RETRY_INTERVAL_MS))
      }
    }
    throw new Error(`[memory] lock acquire timeout after ${timeoutMs}ms`)
  }

  function release(): void {
    try {
      fs.unlinkSync(lockPath)
    } catch {
      // Already released
    }
  }

  return { acquire, release }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/lolo/Documents/alfred && pnpm --filter @alfred/backend test -- tests/memory/lock.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/memory/lock.ts apps/backend/tests/memory/lock.test.ts
git commit -m "feat(memory): add file-based lock manager"
```

---

### Task 3: Memory manager (file I/O)

**Files:**
- Create: `apps/backend/src/memory/manager.ts`
- Create: `apps/backend/tests/memory/manager.test.ts`

- [ ] **Step 1: Write memory manager tests**

```typescript
// apps/backend/tests/memory/manager.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createMemoryManager } from '../../src/memory/manager.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('MemoryManager', () => {
  let workspaceDir: string
  let manager: ReturnType<typeof createMemoryManager>

  beforeEach(() => {
    workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-mem-test-'))
    manager = createMemoryManager(workspaceDir)
  })

  afterEach(() => {
    fs.rmSync(workspaceDir, { recursive: true, force: true })
  })

  describe('init', () => {
    it('creates _memory dir and empty INDEX.md', () => {
      manager.ensureDir()
      const memDir = path.join(workspaceDir, '_memory')
      expect(fs.existsSync(memDir)).toBe(true)
      expect(fs.existsSync(path.join(memDir, 'INDEX.md'))).toBe(true)
    })
  })

  describe('readIndex', () => {
    it('returns empty array when INDEX.md has no entries', () => {
      manager.ensureDir()
      expect(manager.readIndex()).toEqual([])
    })

    it('parses INDEX.md table rows', () => {
      manager.ensureDir()
      const content = `# Alfred Memory Index

| fichier | catégorie | mis à jour | description |
|---------|-----------|------------|-------------|
| test.md | business | 2026-03-16 | A test entry |
`
      fs.writeFileSync(path.join(workspaceDir, '_memory', 'INDEX.md'), content)
      const entries = manager.readIndex()
      expect(entries).toHaveLength(1)
      expect(entries[0]).toEqual({
        filename: 'test.md',
        category: 'business',
        updated: '2026-03-16',
        description: 'A test entry',
      })
    })
  })

  describe('readFile', () => {
    it('reads file with frontmatter', () => {
      manager.ensureDir()
      const content = `---
created: 2026-03-16
updated: 2026-03-16
category: business
---

Loaddr is active.

- [2026-03-16] Confirmed active
`
      fs.writeFileSync(path.join(workspaceDir, '_memory', 'test.md'), content)
      const entry = manager.readFile('test.md')
      expect(entry.category).toBe('business')
      expect(entry.created).toBe('2026-03-16')
      expect(entry.content).toContain('Loaddr is active')
    })

    it('throws for non-existent file', () => {
      manager.ensureDir()
      expect(() => manager.readFile('nope.md')).toThrow()
    })
  })

  describe('writeFile', () => {
    it('creates file with frontmatter and updates INDEX.md', () => {
      manager.ensureDir()
      manager.writeFile({
        filename: 'business-loaddr.md',
        category: 'business',
        description: 'Statut Loaddr',
        content: 'Loaddr is active.',
      })
      const file = manager.readFile('business-loaddr.md')
      expect(file.category).toBe('business')
      expect(file.content).toContain('Loaddr is active')

      const index = manager.readIndex()
      expect(index).toHaveLength(1)
      expect(index[0].filename).toBe('business-loaddr.md')
    })

    it('updates existing file and INDEX.md', () => {
      manager.ensureDir()
      manager.writeFile({
        filename: 'test.md',
        category: 'business',
        description: 'V1',
        content: 'First version',
      })
      manager.writeFile({
        filename: 'test.md',
        category: 'business',
        description: 'V2',
        content: 'Second version',
      })
      const index = manager.readIndex()
      expect(index).toHaveLength(1)
      expect(index[0].description).toBe('V2')
    })
  })

  describe('archiveFile', () => {
    it('moves file to _archived and removes from INDEX.md', () => {
      manager.ensureDir()
      manager.writeFile({
        filename: 'old.md',
        category: 'business',
        description: 'Old stuff',
        content: 'Outdated',
      })
      manager.archiveFile('old.md')

      expect(manager.readIndex()).toHaveLength(0)
      expect(fs.existsSync(path.join(workspaceDir, '_memory', '_archived', 'old.md'))).toBe(true)
      expect(fs.existsSync(path.join(workspaceDir, '_memory', 'old.md'))).toBe(false)
    })
  })

  describe('readAllFiles', () => {
    it('reads all memory files (excluding INDEX.md and _archived)', () => {
      manager.ensureDir()
      manager.writeFile({ filename: 'a.md', category: 'c1', description: 'd1', content: 'A' })
      manager.writeFile({ filename: 'b.md', category: 'c2', description: 'd2', content: 'B' })
      const all = manager.readAllFiles()
      expect(all).toHaveLength(2)
    })
  })

  describe('reconstructIndex', () => {
    it('rebuilds INDEX.md from file frontmatters', () => {
      manager.ensureDir()
      // Write files directly (no INDEX.md update)
      const memDir = path.join(workspaceDir, '_memory')
      fs.writeFileSync(path.join(memDir, 'a.md'), `---
created: 2026-03-16
updated: 2026-03-16
category: cat1
description: Desc A
---

Content A
`)
      // Corrupt INDEX.md
      fs.writeFileSync(path.join(memDir, 'INDEX.md'), 'corrupted')

      manager.reconstructIndex()
      const index = manager.readIndex()
      expect(index).toHaveLength(1)
      expect(index[0].filename).toBe('a.md')
      expect(index[0].description).toBe('Desc A')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/lolo/Documents/alfred && pnpm --filter @alfred/backend test -- tests/memory/manager.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement memory manager**

```typescript
// apps/backend/src/memory/manager.ts
import fs from 'node:fs'
import path from 'node:path'
import type { MemoryEntry, MemoryIndexEntry } from '@alfred/shared'

interface WriteFileInput {
  filename: string
  category: string
  description: string
  content: string
}

export function createMemoryManager(workspaceDir: string) {
  const memDir = path.join(workspaceDir, '_memory')
  const indexPath = path.join(memDir, 'INDEX.md')
  const archiveDir = path.join(memDir, '_archived')

  function ensureDir(): void {
    fs.mkdirSync(memDir, { recursive: true })
    fs.mkdirSync(archiveDir, { recursive: true })
    if (!fs.existsSync(indexPath)) {
      writeIndexFile([])
    }
  }

  function readIndex(): MemoryIndexEntry[] {
    if (!fs.existsSync(indexPath)) return []
    const raw = fs.readFileSync(indexPath, 'utf-8')
    const lines = raw.split('\n')
    const entries: MemoryIndexEntry[] = []
    for (const line of lines) {
      // Match table row: | filename | category | date | description |
      const match = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/)
      if (match && !match[1].includes('---') && match[1].trim() !== 'fichier') {
        entries.push({
          filename: match[1].trim(),
          category: match[2].trim(),
          updated: match[3].trim(),
          description: match[4].trim(),
        })
      }
    }
    return entries
  }

  function writeIndexFile(entries: MemoryIndexEntry[]): void {
    const header = `# Alfred Memory Index

| fichier | catégorie | mis à jour | description |
|---------|-----------|------------|-------------|
`
    const rows = entries
      .map(e => `| ${e.filename} | ${e.category} | ${e.updated} | ${e.description} |`)
      .join('\n')
    fs.writeFileSync(indexPath, header + rows + '\n')
  }

  function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
    const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
    if (!match) return { meta: {}, body: raw }
    const meta: Record<string, string> = {}
    for (const line of match[1].split('\n')) {
      const kv = line.match(/^(\w+):\s*(.+)$/)
      if (kv) meta[kv[1]] = kv[2]
    }
    return { meta, body: match[2].trim() }
  }

  function readFile(filename: string): MemoryEntry {
    const filePath = path.join(memDir, filename)
    if (!fs.existsSync(filePath)) {
      throw new Error(`[memory] file not found: ${filename}`)
    }
    const raw = fs.readFileSync(filePath, 'utf-8')
    const { meta, body } = parseFrontmatter(raw)
    return {
      filename,
      category: meta.category ?? 'uncategorized',
      created: meta.created ?? 'unknown',
      updated: meta.updated ?? 'unknown',
      description: meta.description ?? '',
      content: body,
    }
  }

  function writeFile(input: WriteFileInput): void {
    const today = new Date().toISOString().split('T')[0]
    const filePath = path.join(memDir, input.filename)
    const isNew = !fs.existsSync(filePath)
    const created = isNew ? today : parseFrontmatter(fs.readFileSync(filePath, 'utf-8')).meta.created ?? today

    const fileContent = `---
created: ${created}
updated: ${today}
category: ${input.category}
description: ${input.description}
---

${input.content}
`
    fs.writeFileSync(filePath, fileContent)

    // Update INDEX.md
    const entries = readIndex().filter(e => e.filename !== input.filename)
    entries.push({
      filename: input.filename,
      category: input.category,
      updated: today,
      description: input.description,
    })
    writeIndexFile(entries)
  }

  function archiveFile(filename: string): void {
    const src = path.join(memDir, filename)
    const dest = path.join(archiveDir, filename)
    if (!fs.existsSync(src)) {
      throw new Error(`[memory] file not found: ${filename}`)
    }
    fs.renameSync(src, dest)
    const entries = readIndex().filter(e => e.filename !== filename)
    writeIndexFile(entries)
  }

  function readAllFiles(): MemoryEntry[] {
    if (!fs.existsSync(memDir)) return []
    const files = fs.readdirSync(memDir).filter(f => f.endsWith('.md') && f !== 'INDEX.md')
    return files.map(f => readFile(f))
  }

  function readIndexRaw(): string {
    if (!fs.existsSync(indexPath)) return ''
    return fs.readFileSync(indexPath, 'utf-8')
  }

  function reconstructIndex(): void {
    if (!fs.existsSync(memDir)) return
    const files = fs.readdirSync(memDir).filter(f => f.endsWith('.md') && f !== 'INDEX.md')
    const entries: MemoryIndexEntry[] = []
    for (const f of files) {
      const raw = fs.readFileSync(path.join(memDir, f), 'utf-8')
      const { meta } = parseFrontmatter(raw)
      entries.push({
        filename: f,
        category: meta.category ?? 'uncategorized',
        updated: meta.updated ?? 'unknown',
        description: meta.description ?? f,
      })
    }
    writeIndexFile(entries)
  }

  return {
    ensureDir,
    readIndex,
    readFile,
    writeFile,
    archiveFile,
    readAllFiles,
    readIndexRaw,
    reconstructIndex,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/lolo/Documents/alfred && pnpm --filter @alfred/backend test -- tests/memory/manager.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/memory/manager.ts apps/backend/tests/memory/manager.test.ts
git commit -m "feat(memory): add memory manager for file I/O and INDEX.md"
```

---

### Task 4: Memory agents (injection, extraction, prompt)

**Files:**
- Create: `apps/backend/src/memory/agents.ts`
- Create: `apps/backend/tests/memory/agents.test.ts`

- [ ] **Step 1: Write agent tests**

```typescript
// apps/backend/tests/memory/agents.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMemoryAgents } from '../../src/memory/agents.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createMemoryManager } from '../../src/memory/manager.js'

// Mock execFile to avoid actually calling claude
vi.mock('node:child_process', () => ({
  execFile: vi.fn((_cmd, _args, _opts, cb) => {
    if (cb) cb(null, '## Contexte mémoire\n\n- Test fact\n', '')
    return { pid: 1234 }
  }),
}))

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
      const agents = createMemoryAgents(workspaceDir)
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
      const agents = createMemoryAgents(workspaceDir)
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
      const agents = createMemoryAgents(workspaceDir)
      const shortPath = path.join(workspaceDir, 'short.jsonl')
      fs.writeFileSync(shortPath, '{"type":"message"}\n{"type":"message"}\n')
      expect(agents.isTranscriptSubstantial(shortPath)).toBe(false)
    })

    it('returns true for long transcripts', () => {
      const agents = createMemoryAgents(workspaceDir)
      const longPath = path.join(workspaceDir, 'long.jsonl')
      const lines = Array.from({ length: 25 }, (_, i) => `{"type":"message","num":${i}}`).join('\n')
      fs.writeFileSync(longPath, lines)
      expect(agents.isTranscriptSubstantial(longPath)).toBe(true)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/lolo/Documents/alfred && pnpm --filter @alfred/backend test -- tests/memory/agents.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement memory agents**

```typescript
// apps/backend/src/memory/agents.ts
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createMemoryLock } from './lock.js'
import { createMemoryManager } from './manager.js'

const MIN_TRANSCRIPT_LINES = 20

interface InjectionInput {
  indexContent: string
  event: string
  stateContent: string
}

interface ExtractionInput {
  transcriptPath: string
  indexContent: string
}

export function createMemoryAgents(workspaceDir: string) {
  const memDir = path.join(workspaceDir, '_memory')
  const lock = createMemoryLock(memDir)
  const manager = createMemoryManager(workspaceDir)

  function buildInjectionPrompt(input: InjectionInput): string {
    return `Tu es l'agent d'injection mémoire d'Alfred. Ton rôle est de synthétiser les informations pertinentes de la mémoire pour une session de travail.

## INDEX.md (mémoire disponible)
${input.indexContent}

## Événement déclencheur
${input.event}

## État du dossier (state.md)
${input.stateContent}

## Instructions
1. Lis les fichiers mémoire qui te semblent pertinents pour cette tâche (utilise Read)
2. Synthétise les informations pertinentes en un bloc concis
3. Retourne UNIQUEMENT le bloc à injecter, au format suivant :

## Contexte mémoire (injecté automatiquement — ne pas modifier)
Dernière injection : ${new Date().toISOString().split('T')[0]}

- Point pertinent 1
- Point pertinent 2

## Contraintes
- 30 lignes maximum
- Que les infos pertinentes pour la tâche
- Si aucune mémoire n'est pertinente, retourne "Aucun contexte mémoire pertinent."
- Privilégie les entrées les plus récentes en cas de conflit`
  }

  function buildExtractionPrompt(input: ExtractionInput): string {
    return `Tu es l'agent d'extraction mémoire d'Alfred. Ton rôle est d'analyser le transcript d'une session terminée et d'en extraire les informations à retenir dans la mémoire globale.

## INDEX.md (mémoire actuelle)
${input.indexContent}

## Instructions
1. Lis le transcript de la session à ${input.transcriptPath} (utilise Read)
2. Lis les fichiers mémoire existants qui pourraient être concernés (utilise Read)
3. Identifie les nouvelles informations à retenir :
   - Faits business (changement de statut, nouveau contact, décision)
   - Leçons apprises (cette approche a échoué, préférer X à Y)
   - Contexte temporel (projet en pause, client ne répond plus)
   - Corrections (information précédente fausse)
4. NE PAS extraire :
   - Détails d'exécution (commandes lancées, fichiers modifiés)
   - Ce qui est déjà en mémoire et n'a pas changé
   - Informations purement techniques sans valeur business
5. Si quelque chose de nouveau est trouvé :
   - Crée ou mets à jour les fichiers dans ${memDir}/ (utilise Write)
   - Mets à jour INDEX.md
   - Chaque entrée datée [${new Date().toISOString().split('T')[0]}]
   - Annote les contradictions avec ⚠️
6. Si rien de nouveau → ne fais rien

## Format des fichiers mémoire
\`\`\`
---
created: YYYY-MM-DD
updated: YYYY-MM-DD
category: business|contacts|contexte|lecons
description: Une ligne de description
---

Contenu libre avec entrées datées.
\`\`\``
  }

  function buildPromptAgentPrompt(text: string, indexContent: string): string {
    return `Tu es l'agent mémoire d'Alfred. Lolo te donne une instruction en langage naturel pour ajouter ou modifier la mémoire.

## Instruction de Lolo
"${text}"

## INDEX.md (mémoire actuelle)
${indexContent}

## Instructions
1. Lis les fichiers mémoire existants si nécessaire (utilise Read)
2. Détermine s'il faut créer un nouveau fichier ou mettre à jour un existant
3. Écris/mets à jour le fichier dans ${memDir}/ (utilise Write)
4. Mets à jour INDEX.md

## Format des fichiers mémoire
\`\`\`
---
created: YYYY-MM-DD
updated: YYYY-MM-DD
category: business|contacts|contexte|lecons
description: Une ligne de description
---

Contenu libre avec entrées datées [YYYY-MM-DD].
\`\`\``
  }

  function isTranscriptSubstantial(transcriptPath: string): boolean {
    try {
      const content = fs.readFileSync(transcriptPath, 'utf-8')
      const lines = content.split('\n').filter(l => l.trim())
      return lines.length >= MIN_TRANSCRIPT_LINES
    } catch {
      console.warn('[memory] cannot read transcript, skipping extraction')
      return false
    }
  }

  async function runAgent(systemPrompt: string, userPrompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        'claude',
        ['-p', '--allowedTools', 'Read,Write,Glob', '--system-prompt', systemPrompt, userPrompt],
        { maxBuffer: 1024 * 1024 * 10, timeout: 120_000 },
        (err, stdout, stderr) => {
          if (err) {
            console.error('[memory] agent error:', stderr)
            reject(err)
          } else {
            resolve(stdout)
          }
        },
      )
    })
  }

  async function runInjection(input: InjectionInput): Promise<string> {
    const prompt = buildInjectionPrompt(input)
    return runAgent(prompt, 'Analyse la mémoire et génère le bloc de contexte à injecter.')
  }

  async function runExtraction(input: ExtractionInput): Promise<void> {
    await lock.acquire()
    try {
      const prompt = buildExtractionPrompt(input)
      await runAgent(prompt, 'Analyse le transcript et mets à jour la mémoire.')
    } finally {
      lock.release()
    }
  }

  async function runPromptAgent(text: string): Promise<void> {
    const indexContent = manager.readIndexRaw()
    await lock.acquire()
    try {
      const prompt = buildPromptAgentPrompt(text, indexContent)
      await runAgent(prompt, text)
    } finally {
      lock.release()
    }
  }

  return {
    buildInjectionPrompt,
    buildExtractionPrompt,
    buildPromptAgentPrompt,
    isTranscriptSubstantial,
    runInjection,
    runExtraction,
    runPromptAgent,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/lolo/Documents/alfred && pnpm --filter @alfred/backend test -- tests/memory/agents.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Create index re-export**

```typescript
// apps/backend/src/memory/index.ts
export { createMemoryLock } from './lock.js'
export { createMemoryManager } from './manager.js'
export { createMemoryAgents } from './agents.js'
```

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/memory/
git commit -m "feat(memory): add memory agents (injection, extraction, prompt)"
```

---

## Chunk 2: Backend Integration (hooks, launcher, triage, routes)

### Task 5: Integrate memory extraction into SessionEnd hook

**Files:**
- Modify: `apps/backend/src/hooks/handler.ts`

- [ ] **Step 1: Read current handler.ts**

Read `apps/backend/src/hooks/handler.ts` to understand current `handleSessionEnd()` implementation.

- [ ] **Step 2: Add memory extraction after session cleanup**

In `handleSessionEnd()`, after the existing cleanup logic, add:

```typescript
// After existing session end cleanup...

// Memory extraction
const transcriptPath = payload.transcript_path
if (transcriptPath && memoryAgents.isTranscriptSubstantial(transcriptPath)) {
  console.log('[hooks] launching memory extraction agent')
  const indexContent = memoryManager.readIndexRaw()
  memoryAgents.runExtraction({ transcriptPath, indexContent }).catch(err => {
    console.error('[hooks] memory extraction failed:', err)
  })
}
```

Note: `runExtraction` is fire-and-forget (`.catch` for error logging). The session end response doesn't wait for it.

- [ ] **Step 3: Add memoryManager and memoryAgents to handler dependencies**

Update the `HooksHandlerDeps` interface in `handler.ts`:

```typescript
interface HooksHandlerDeps {
  // ... existing deps
  memoryManager: ReturnType<typeof createMemoryManager>
  memoryAgents: ReturnType<typeof createMemoryAgents>
}
```

Then update `apps/backend/src/index.ts` to pass these when creating the hooks handler:

```typescript
const memoryManager = createMemoryManager(workspaceDir)
memoryManager.ensureDir()
const memoryAgents = createMemoryAgents(workspaceDir)

const hooksHandler = createHooksHandler({
  // ... existing deps
  memoryManager,
  memoryAgents,
})
```

- [ ] **Step 4: Run existing hook tests to check nothing is broken**

Run: `cd /Users/lolo/Documents/alfred && pnpm --filter @alfred/backend test`
Expected: All existing tests still PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/hooks/handler.ts
git commit -m "feat(hooks): trigger memory extraction on session end"
```

---

### Task 6: Integrate memory injection into launcher

**Files:**
- Modify: `apps/backend/src/launcher/session.ts`

- [ ] **Step 1: Read current session.ts**

Read `apps/backend/src/launcher/session.ts` to understand `launchSession()` and `generateDossierClaudeMd()`.

- [ ] **Step 2: Add injection after generateDossierClaudeMd**

After the call to `generateDossierClaudeMd()` and its `writeFileSync`, add:

```typescript
// After generateDossierClaudeMd writes the base CLAUDE.md...

// Memory injection
try {
  const indexContent = memoryManager.readIndexRaw()
  if (indexContent.trim()) {
    let stateContent = ''
    try { stateContent = fs.readFileSync(path.join(dossierDir, 'state.md'), 'utf-8') } catch {}
    const injectionResult = await memoryAgents.runInjection({
      indexContent,
      event: eventText,
      stateContent,
    })
    // Append memory context to CLAUDE.md
    const claudeMdPath = path.join(dossierDir, 'CLAUDE.md')
    fs.appendFileSync(claudeMdPath, '\n\n' + injectionResult)
    console.log('[launcher] memory context injected into', dossierId)
  }
} catch (err) {
  console.warn('[launcher] memory injection failed, continuing without:', err)
}
```

Memory injection failure is non-fatal — the session launches anyway without memory context.

- [ ] **Step 3: Add memory dependencies to launcher factory**

Update `createLauncher` to receive `memoryManager` and `memoryAgents`.

- [ ] **Step 4: Run existing tests**

Run: `cd /Users/lolo/Documents/alfred && pnpm --filter @alfred/backend test`
Expected: All existing tests still PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/launcher/session.ts
git commit -m "feat(launcher): inject memory context into dossier CLAUDE.md on session start"
```

---

### Task 7: Add memory context to triage and checkup

**Files:**
- Modify: `apps/backend/src/receiver/triage.ts`
- Modify: `apps/backend/src/launcher/checkup.ts`

- [ ] **Step 1: Read current triage.ts and checkup.ts**

Understand how system prompts are built for both.

- [ ] **Step 2: Add memory summary to triage system prompt**

In `triage.ts`, before the `claude -p` call, read INDEX.md and all memory files, then prepend a condensed summary to the system prompt:

```typescript
// Read memory context for triage
const memoryContext = memoryManager.readAllFiles()
  .map(f => `- [${f.category}] ${f.description}: ${f.content.split('\n').slice(-3).join(' ')}`)
  .join('\n')

const systemPromptWithMemory = `${TRIAGE_SYSTEM_PROMPT}

## Mémoire globale (contexte persistant)
${memoryContext || 'Aucune mémoire enregistrée.'}`
```

Use the last 3 lines of each file for recency. Keep it concise — triage needs quick context, not full history.

- [ ] **Step 3: Same for checkup.ts**

Add memory context to the checkup prompt in the same way.

- [ ] **Step 4: Run existing tests**

Run: `cd /Users/lolo/Documents/alfred && pnpm --filter @alfred/backend test`
Expected: All existing tests still PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/receiver/triage.ts apps/backend/src/launcher/checkup.ts
git commit -m "feat(triage): include memory context in triage and checkup prompts"
```

---

### Task 8: Add memory API routes

**Files:**
- Modify: `apps/backend/src/server.ts`

- [ ] **Step 1: Read current server.ts**

Understand existing route patterns, middleware, and how deps are passed.

- [ ] **Step 2: Add memory routes**

Add 6 endpoints following the existing patterns:

```typescript
// GET /api/memory — list all memory entries
app.get('/api/memory', async (c) => {
  const entries = memoryManager.readIndex()
  return c.json(entries)
})

// GET /api/memory/:filename — read one memory file
app.get('/api/memory/:filename', async (c) => {
  const { filename } = c.req.param()
  try {
    const entry = memoryManager.readFile(filename)
    return c.json(entry)
  } catch {
    return c.json({ error: 'Not found' }, 404)
  }
})

// POST /api/memory — create new memory file
app.post('/api/memory', async (c) => {
  const body = MemoryCreateSchema.parse(await c.req.json())
  memoryManager.writeFile(body)
  return c.json({ ok: true }, 201)
})

// PUT /api/memory/:filename — update memory file
app.put('/api/memory/:filename', async (c) => {
  const { filename } = c.req.param()
  const body = MemoryUpdateSchema.parse(await c.req.json())
  const existing = memoryManager.readFile(filename)
  memoryManager.writeFile({
    filename,
    category: body.category ?? existing.category,
    description: body.description ?? existing.description,
    content: body.content,
  })
  return c.json({ ok: true })
})

// POST /api/memory/:filename/archive — archive memory file
app.post('/api/memory/:filename/archive', async (c) => {
  const { filename } = c.req.param()
  try {
    memoryManager.archiveFile(filename)
    return c.json({ ok: true })
  } catch {
    return c.json({ error: 'Not found' }, 404)
  }
})

// POST /api/memory/prompt — natural language → create/update memory
app.post('/api/memory/prompt', async (c) => {
  const { text } = MemoryPromptSchema.parse(await c.req.json())
  console.log('[memory] processing prompt:', text)
  await memoryAgents.runPromptAgent(text)
  return c.json({ ok: true })
})
```

- [ ] **Step 3: Initialize memory manager and agents in server startup**

In the server setup section where deps are created:

```typescript
const memoryManager = createMemoryManager(workspaceDir)
memoryManager.ensureDir()
const memoryAgents = createMemoryAgents(workspaceDir)
```

Pass these to hook handler and launcher factories.

- [ ] **Step 4: Run all backend tests**

Run: `cd /Users/lolo/Documents/alfred && pnpm --filter @alfred/backend test`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/server.ts
git commit -m "feat(api): add memory CRUD and prompt endpoints"
```

---

### Task 9: Update workspace/CLAUDE.md

**Files:**
- Modify: `workspace/CLAUDE.md`

- [ ] **Step 1: Read current workspace/CLAUDE.md**

- [ ] **Step 2: Add memory restriction at end of file**

```markdown
## Mémoire système

Le système a une mémoire persistante dans `_memory/INDEX.md` et `_memory/*.md`.

**NE JAMAIS :**
- Créer ou modifier les fichiers dans `_memory/` directement
- Appeler des outils (Write, Edit, etc.) sur des fichiers dans `_memory/`
- Essayer d'ajouter des informations à la mémoire depuis ta session

La mémoire est gérée automatiquement :
- **Lue** au lancement de ta session (section "Contexte mémoire" dans ton CLAUDE.md)
- **Écrite** automatiquement à la fin de ta session par un agent dédié
- **Éditée** par Lolo via l'app web
```

- [ ] **Step 3: Commit**

```bash
git add workspace/CLAUDE.md
git commit -m "feat(workspace): add memory system instructions to level-1 prompt"
```

---

## Chunk 3: Frontend

### Task 10: API layer and store

**Files:**
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/store.ts`

- [ ] **Step 1: Read current api.ts and store.ts**

- [ ] **Step 2: Add memory API functions to api.ts**

```typescript
export const fetchMemoryIndex = () => json<MemoryIndexEntry[]>('/memory')
export const fetchMemoryFile = (filename: string) => json<MemoryEntry>(`/memory/${filename}`)
export const createMemoryFile = (data: { filename: string; category: string; description: string; content: string }) =>
  json('/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
export const updateMemoryFile = (filename: string, data: { content: string; category?: string; description?: string }) =>
  json(`/memory/${filename}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
export const archiveMemoryFile = (filename: string) =>
  json(`/memory/${filename}/archive`, { method: 'POST' })
export const sendMemoryPrompt = (text: string) =>
  json('/memory/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
```

- [ ] **Step 3: Add memory slice to store.ts**

```typescript
// In the store interface
memoryIndex: MemoryIndexEntry[]
selectedMemory: MemoryEntry | null
memoryLoading: boolean

fetchMemoryIndex: () => Promise<void>
selectMemory: (filename: string) => Promise<void>
clearSelectedMemory: () => void
```

```typescript
// In the create() body
memoryIndex: [],
selectedMemory: null,
memoryLoading: false,

fetchMemoryIndex: async () => {
  set({ memoryLoading: true })
  const entries = await fetchMemoryIndex()
  set({ memoryIndex: entries, memoryLoading: false })
},
selectMemory: async (filename) => {
  const entry = await fetchMemoryFile(filename)
  set({ selectedMemory: entry })
},
clearSelectedMemory: () => set({ selectedMemory: null }),
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/api.ts apps/web/src/store.ts
git commit -m "feat(web): add memory API layer and store"
```

---

### Task 11: Memory page

**Files:**
- Create: `apps/web/src/pages/Memory.tsx`
- Modify: `apps/web/src/components/DesktopNav.tsx` + `MobileNav.tsx`
- Modify: router config (App.tsx or routes file)

- [ ] **Step 1: Read existing page structure**

Read an existing page (e.g., `Home.tsx` or `Ameliorations.tsx`) to understand patterns: layout, data fetching, component structure.

- [ ] **Step 2: Read Sidebar and router config**

Understand how to add a new nav item and route.

- [ ] **Step 3: Create Memory.tsx**

Build the page with three sections:
1. **Prompt input** — textarea + submit button at the top
2. **Memory list** — table of INDEX.md entries with click-to-edit
3. **Editor panel** — when a memory is selected, show markdown editor + save/archive buttons

Follow existing page patterns (layout, data fetching with useEffect, store usage). Use existing Tailwind classes and component patterns.

Key interactions:
- Load: `useEffect → fetchMemoryIndex()`
- Click row: `selectMemory(filename)` → show editor
- Save: `updateMemoryFile(filename, content)` → refresh index
- Archive: `archiveMemoryFile(filename)` → refresh index
- Prompt submit: `sendMemoryPrompt(text)` → refresh index after

- [ ] **Step 4: Add nav link and route**

Add "Mémoire" to the `links` array in `DesktopNav.tsx` and `MobileNav.tsx`. Add `/memory` route pointing to `Memory.tsx`.

- [ ] **Step 5: Test manually**

Run: `cd /Users/lolo/Documents/alfred && pnpm dev`
Navigate to `/memory` in browser. Verify:
- Page loads without errors
- Empty state shows correctly
- Create a memory via prompt → appears in list
- Click to edit → editor opens
- Save changes → persisted
- Archive → removed from list

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/Memory.tsx apps/web/src/components/DesktopNav.tsx apps/web/src/components/MobileNav.tsx
git commit -m "feat(web): add Memory page with list, editor, and prompt input"
```

---

## Chunk 4: Bootstrap and end-to-end verification

### Task 12: Initialize memory directory and seed data

**Files:**
- Create: `workspace/_memory/INDEX.md`
- Create: `workspace/_memory/_archived/.gitkeep`

- [ ] **Step 1: Create _memory directory structure**

```bash
mkdir -p workspace/_memory/_archived
```

- [ ] **Step 2: Create initial INDEX.md**

```markdown
# Alfred Memory Index

| fichier | catégorie | mis à jour | description |
|---------|-----------|------------|-------------|
```

- [ ] **Step 3: Create _archived/.gitkeep**

```bash
touch workspace/_memory/_archived/.gitkeep
```

- [ ] **Step 4: Make sure _memory is NOT gitignored**

Check `.gitignore` — `workspace/` is gitignored but `workspace/CLAUDE.md` has an exception. Add exception for `_memory/` and its contents (both needed for git to track a directory inside an ignored parent):

```gitignore
# In .gitignore, add:
!/workspace/_memory/
!/workspace/_memory/**
```

- [ ] **Step 5: Commit**

```bash
git add workspace/_memory/ .gitignore
git commit -m "feat(memory): initialize memory directory structure"
```

---

### Task 13: End-to-end smoke test

- [ ] **Step 1: Start the backend**

Run: `cd /Users/lolo/Documents/alfred && pnpm dev`

- [ ] **Step 2: Test memory API endpoints**

```bash
# List (empty)
curl http://localhost:5174/api/memory

# Create via direct API
curl -X POST http://localhost:5174/api/memory \
  -H 'Content-Type: application/json' \
  -d '{"filename":"test-smoke.md","category":"test","description":"Smoke test","content":"This is a test memory."}'

# List (should show 1 entry)
curl http://localhost:5174/api/memory

# Read file
curl http://localhost:5174/api/memory/test-smoke.md

# Update
curl -X PUT http://localhost:5174/api/memory/test-smoke.md \
  -H 'Content-Type: application/json' \
  -d '{"content":"Updated content.\n\n- [2026-03-16] Added a line."}'

# Archive
curl -X POST http://localhost:5174/api/memory/test-smoke.md/archive
```

- [ ] **Step 3: Test prompt endpoint**

```bash
curl -X POST http://localhost:5174/api/memory/prompt \
  -H 'Content-Type: application/json' \
  -d '{"text":"retiens que les emails de fermeture de société sont des tests en ce moment"}'
```

Verify a new file was created in `workspace/_memory/` with appropriate frontmatter and content.

- [ ] **Step 4: Test memory page in UI**

Open `http://localhost:5173/memory` (or whatever port the web dev server uses).
Verify all interactions work.

- [ ] **Step 5: Clean up test data**

Remove `test-smoke.md` from `_memory/` if still present. Keep any file created by the prompt agent as a valid seed.

- [ ] **Step 6: Commit any final adjustments**

```bash
git add -A
git commit -m "chore(memory): finalize memory system integration"
```
