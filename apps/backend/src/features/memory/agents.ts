// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import fs from 'node:fs'
import path from 'node:path'
import type { AgentProcessType, AgentAdapter } from '@opentidy/shared'
import type { SpawnAgentFn } from '../../shared/spawn-agent.js'
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
  taskId: string
  stateContent: string
}

export function createMemoryAgents(workspaceDir: string, deps: {
  spawnAgent: SpawnAgentFn;
  adapter: AgentAdapter;
  onGapsWritten?: () => Promise<void> | void;
}) {
  const memDir = path.join(workspaceDir, '_memory')
  const lock = createMemoryLock(memDir)
  const manager = createMemoryManager(workspaceDir)

  function buildInjectionPrompt(input: InjectionInput): string {
    return `You are OpenTidy's memory injection agent. Your role is to synthesize relevant information from memory for a work session.

## INDEX.md (available memory)
${input.indexContent}

## Triggering event
${input.event}

## Task state (state.md)
${input.stateContent}

## Instructions
1. Read the memory files that seem relevant to this task (use Read)
2. Synthesize the relevant information into a concise block
3. Return ONLY the block to inject, in the following format:

## Memory context (injected automatically — do not modify)
Last injection: ${new Date().toISOString().split('T')[0]}

- Relevant point 1
- Relevant point 2

## Constraints
- 30 lines maximum
- Only information relevant to the task
- If no memory is relevant, return "No relevant memory context."
- Prefer the most recent entries in case of conflict`
  }

  function buildExtractionPrompt(input: ExtractionInput): string {
    const today = new Date().toISOString().split('T')[0]
    return `You are OpenTidy's post-session agent. You do 3 things in a single pass after each completed session.

## Context
- Task: ${input.taskId}
- Transcript: ${input.transcriptPath}
- Current task state.md (below)

## State.md
${input.stateContent}

## INDEX.md (current memory)
${input.indexContent}

---

## YOUR 3 MISSIONS (all mandatory)

### Mission 1 — Memory
Extract new information to retain in global memory.

**To extract:**
- Business facts (company status, new contact, decision made)
- Lessons learned (failed approach, prefer X over Y)
- Temporal context (project on hold, client not responding)
- Corrections to previous information

**To ignore:**
- Execution details (commands run, files modified)
- What is already in memory and has not changed
- Purely technical information with no business value

**If something new:**
- Create or update files in ${memDir}/ (use Write)
- Update INDEX.md
- Each entry dated [${today}]
- Annotate contradictions with ⚠️

**Memory file format:**
\`\`\`
---
created: YYYY-MM-DD
updated: YYYY-MM-DD
category: business|contacts|context|lessons
description: One-line description
---

Free-form content with dated entries.
\`\`\`

### Mission 2 — Self-analyses (gaps)
Identify obstacles encountered during the session and generate ACTIONABLE analyses.

**Key criterion: only create a gap IF the user can act on it.** Examples:
- YES: missing access/credentials → the user can provide them
- YES: hook blocking a legitimate action → the user can adjust the config
- YES: broken or misconfigured MCP/tool → the user can fix it
- YES: inefficient process detected → the user can improve the workflow
- NO: theoretical limitation with no concrete impact
- NO: vague observation with no clear action
- NO: internal OpenTidy code bug (that goes in issues, not gaps)

**If actionable gaps are found:** append a structured block per gap in ${path.join(workspaceDir, '_gaps', 'gaps.md')} (append, do not delete anything).
Format for each gap:
\`\`\`
---

## ${today} — <Short clear title>

**Problem:** <What concretely happened>
**Impact:** <Business or operational consequence>
**Category:** <capability|access|config|process|data>
**Fix type:** <code|config|external>
**Sanitized title:** <PII-free short title — ONLY if fixType is code>
**Sanitized:** <PII-free one-line technical summary — ONLY if fixType is code>
**Recommended actions:**
- <Concrete action 1 the user can take>
- <Concrete action 2 (optional)>
**Task:** ${input.taskId}
**Session:** <session_id if found in transcript>
**Source:** post-session
\`\`\`

**Fix type rules:**
- \`code\`: the problem is in OpenTidy's source code (bug, missing feature, architectural limitation in the opentidy codebase itself)
- \`config\`: the problem is in Claude's configuration, prompts, hooks, or workspace setup
- \`external\`: the problem is an external limitation (third-party API, physical access, credentials the user must provide)
- The **Sanitized title** and **Sanitized** fields must contain ZERO PII — no names, emails, phone numbers, account IDs, company names, task context. Only the generic technical problem. If the gap cannot be described without PII, set fixType to \`external\` and omit the Sanitized fields.

**If nothing actionable → write nothing.** It's OK to find no gaps.

### Mission 3 — Log
Verify that the log in state.md reflects the work done in the transcript.
If the log is empty or incomplete compared to the transcript (actions performed but not noted):
- Update state.md by adding the missing entries in the \`## Log\` section
- Format: \`- ${today} : <action performed>\`
- Do not delete anything from the existing log, only append

---

## How to work
1. Read the transcript at ${input.transcriptPath} (use Read — it's a .jsonl file, each line is a JSON)
2. Read existing memory files if needed
3. Perform all 3 missions
4. If nothing to do for a mission, move on to the next`
  }

  function buildPromptAgentPrompt(text: string, indexContent: string): string {
    return `You are OpenTidy's memory agent. The user gives you a natural language instruction to add or modify memory.

## User instruction
"${text}"

## INDEX.md (current memory)
${indexContent}

## Instructions
1. Read existing memory files if needed (use Read)
2. Determine whether to create a new file or update an existing one
3. Write/update the file in ${memDir}/ (use Write)
4. Update INDEX.md

## Memory file format
\`\`\`
---
created: YYYY-MM-DD
updated: YYYY-MM-DD
category: business|contacts|context|lessons
description: One-line description
---

Free-form content with dated entries [YYYY-MM-DD].
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

  async function runAgent(systemPrompt: string, userPrompt: string, type?: AgentProcessType, description?: string): Promise<string> {
    const agentType = type ?? 'memory-extraction';
    const args = deps.adapter.buildArgs({
      mode: 'one-shot', cwd: workspaceDir, systemPrompt,
      instruction: userPrompt, allowedTools: ['Read', 'Write', 'Glob'],
    });
    return deps.spawnAgent({ args, cwd: workspaceDir, type: agentType, description }).promise;
  }

  async function runInjection(input: InjectionInput): Promise<string> {
    const prompt = buildInjectionPrompt(input)
    return runAgent(prompt, 'Analyze memory and generate the context block to inject.', 'memory-injection', 'Memory context injection')
  }

  async function runExtraction(input: ExtractionInput): Promise<void> {
    await lock.acquire()
    try {
      const prompt = buildExtractionPrompt(input)
      await runAgent(prompt, `Post-session analysis for task ${input.taskId}. Perform all 3 missions: memory, gaps, log.`, 'memory-extraction', 'Post-session memory extraction')

      // Route newly written gaps (GitHub Issues, suggestions)
      if (deps.onGapsWritten) {
        try {
          await deps.onGapsWritten()
        } catch (err) {
          console.error('[memory] gap routing failed (non-blocking):', (err as Error).message)
        }
      }
    } finally {
      lock.release()
    }
  }

  async function runPromptAgent(text: string): Promise<void> {
    const indexContent = manager.readIndexRaw()
    await lock.acquire()
    try {
      const prompt = buildPromptAgentPrompt(text, indexContent)
      await runAgent(prompt, text, 'memory-prompt', `Memory command: ${text.slice(0, 100)}`)
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