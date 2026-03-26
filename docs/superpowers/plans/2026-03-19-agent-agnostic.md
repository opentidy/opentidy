# Agent-Agnostic Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple OpenTidy from Claude Code CLI so users can choose their AI agent (Claude, Gemini, Copilot) via a unified adapter interface.

**Architecture:** Adapter pattern in `src/shared/agents/`. A single `spawn-agent.ts` replaces `spawn-claude.ts`. Each agent implements `AgentAdapter` via a factory function. Only Claude adapter is fully implemented; Gemini/Copilot are stubs. Guardrails, instructions, and MCP config are unified formats translated by adapters at setup time.

**Tech Stack:** TypeScript, Zod, Vitest, factory functions (no classes)

**Spec:** `docs/superpowers/specs/2026-03-19-agent-agnostic-design.md`

---

### Task 1: Add agent types to shared package

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Add AgentName type and AgentAdapter interface**

In `packages/shared/src/types.ts`, add after the existing types:

```typescript
// === Agent Abstraction ===
export type AgentName = 'claude' | 'gemini' | 'copilot';

export interface SpawnOpts {
  mode: 'autonomous' | 'interactive' | 'one-shot';
  cwd: string;
  systemPrompt?: string;
  instruction?: string;
  resumeSessionId?: string;
  allowedTools?: string[];
  outputFormat?: 'text' | 'json' | 'stream-json';
  pluginDir?: string;
  skipPermissions?: boolean;
}

export interface SetupOpts {
  guardrails: GuardrailRule[];
  mcpServices: McpConfig;
  configDir: string;
}

export interface GuardrailRule {
  event: 'pre-tool' | 'post-tool' | 'stop' | 'session-end';
  type: 'prompt' | 'command' | 'http';
  match: string | { tool: string; input_contains: string };
  prompt?: string;
  command?: string;
  url?: string;
}

export interface AgentAdapter {
  readonly name: AgentName;
  readonly binary: string;
  readonly instructionFile: string;
  readonly configEnvVar: string;
  readonly experimental: boolean;

  buildArgs(opts: SpawnOpts): string[];
  getEnv(): Record<string, string>;
  readSessionId(dossierDir: string): string | null;
  writeConfig(opts: SetupOpts): void;
}
```

- [ ] **Step 2: Rename Claude-specific types to be agent-generic**

Rename in `packages/shared/src/types.ts`:
- `ClaudeProcessType` → `AgentProcessType`
- `ClaudeProcessStatus` → `AgentProcessStatus`
- `ClaudeProcess` → `AgentProcess`
- In `Session` interface: `claudeSessionId` → `agentSessionId`

Keep the same values — the type names change, not the content.

- [ ] **Step 3: Update OpenTidyConfig to use agentConfig**

Replace `claudeConfig` in the `OpenTidyConfig` interface:

```typescript
// Before:
claudeConfig: {
  dir: string;
};

// After:
agentConfig: {
  name: AgentName;
  configDir: string;
};
```

- [ ] **Step 4: Re-export old names as aliases for backward compat during migration**

```typescript
/** @deprecated Use AgentProcessType */
export type ClaudeProcessType = AgentProcessType;
/** @deprecated Use AgentProcessStatus */
export type ClaudeProcessStatus = AgentProcessStatus;
/** @deprecated Use AgentProcess */
export type ClaudeProcess = AgentProcess;
```

- [ ] **Step 5: Build shared package to verify types compile**

Run: `pnpm --filter @opentidy/shared build`
Expected: Build succeeds with no errors

- [ ] **Step 6: Commit**

```
feat(shared): add agent abstraction types (AgentAdapter, AgentName, SpawnOpts)
```

---

### Task 2: Create Claude adapter

**Files:**
- Create: `apps/backend/src/shared/agents/types.ts`
- Create: `apps/backend/src/shared/agents/claude.ts`
- Create: `apps/backend/src/shared/agents/claude.test.ts`

- [ ] **Step 1: Write the failing tests for Claude adapter**

Create `apps/backend/src/shared/agents/claude.test.ts` with tests for:
- Correct metadata (name, binary, instructionFile, configEnvVar, experimental=false)
- `buildArgs()` with mode='one-shot' + systemPrompt → includes `-p`, `--system-prompt`, `--strict-mcp-config`, `--mcp-config` with `{}`
- `buildArgs()` with allowedTools → includes `--allowedTools` with comma-joined values
- `buildArgs()` with outputFormat='text' → includes `--output-format text`
- `buildArgs()` with mode='autonomous' + resumeSessionId + skipPermissions → includes `--resume`, `--dangerously-skip-permissions`
- `buildArgs()` with mode='interactive' → does NOT include `-p`, includes `--dangerously-skip-permissions`
- `buildArgs()` with pluginDir → includes `--plugin-dir`
- `getEnv()` returns `{ CLAUDE_CONFIG_DIR: configDir }`
- `readSessionId()` returns null for nonexistent dir

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opentidy/backend exec vitest run src/shared/agents/claude.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create the adapter types re-export**

Create `apps/backend/src/shared/agents/types.ts`:

```typescript
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

export type { AgentAdapter, AgentName, SpawnOpts, SetupOpts, GuardrailRule } from '@opentidy/shared';
```

- [ ] **Step 4: Implement Claude adapter**

Create `apps/backend/src/shared/agents/claude.ts` with factory function `createClaudeAdapter(configDir: string): AgentAdapter`.

Key implementation details:
- `buildArgs()`: always starts with `['--strict-mcp-config', '--mcp-config', '{}']`. Adds `-p` for one-shot/autonomous. Adds `--dangerously-skip-permissions` when `skipPermissions=true`. Adds `--system-prompt`, `--output-format`, `--allowedTools`, `--plugin-dir`, `--resume` based on opts. When `allowedTools` is set, uses `--` separator before instruction.
- `getEnv()`: returns `{ CLAUDE_CONFIG_DIR: configDir }`
- `readSessionId()`: reads `.session-id` file from dossierDir, returns null if not found
- `writeConfig()`: translates `GuardrailRule[]` to Claude-native `hooks.json` format (pre-tool → PreToolUse, post-tool → PostToolUse, with type mapping prompt/command/http). Writes to `configDir/hooks/hooks.json`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @opentidy/backend exec vitest run src/shared/agents/claude.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```
feat(backend): add Claude adapter implementing AgentAdapter interface
```

---

### Task 3: Create agent registry

**Files:**
- Create: `apps/backend/src/shared/agents/registry.ts`
- Create: `apps/backend/src/shared/agents/registry.test.ts`
- Create: `apps/backend/src/shared/agents/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/src/shared/agents/registry.test.ts` with tests for:
- Defaults to 'claude' when no config/env/flag
- Uses `OPENTIDY_AGENT` env var override
- Uses `configAgent` when provided
- `flagAgent` takes priority over `configAgent`
- Env var takes highest priority over both
- Throws on unknown agent name
- Throws "not yet implemented" for gemini/copilot

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @opentidy/backend exec vitest run src/shared/agents/registry.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement registry**

Create `apps/backend/src/shared/agents/registry.ts` with function `resolveAgent(opts: ResolveOpts): AgentAdapter`.

Resolution order: `OPENTIDY_AGENT` env → `flagAgent` → `configAgent` → fallback 'claude'.
Uses `path.join(opts.configDir, 'agents', agentName)` for the agent-specific config dir.
Claude → `createClaudeAdapter()`. Gemini/Copilot → throw "not yet implemented".

- [ ] **Step 4: Create barrel export**

Create `apps/backend/src/shared/agents/index.ts` exporting `resolveAgent`, `createClaudeAdapter`, and all types.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @opentidy/backend exec vitest run src/shared/agents/registry.test.ts`
Expected: All PASS

- [ ] **Step 6: Commit**

```
feat(backend): add agent registry with resolution order (env > flag > config > claude)
```

---

### Task 4: Create spawn-agent.ts (replace spawn-claude.ts)

**Files:**
- Create: `apps/backend/src/shared/spawn-agent.ts`
- Create: `apps/backend/src/shared/spawn-agent.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/src/shared/spawn-agent.test.ts` with tests for:
- Spawns using `adapter.binary` (not hardcoded 'claude')
- Passes `adapter.getEnv()` to spawn env
- Calls tracker lifecycle (start → markRunning → complete/fail)
- Handles process exit code 0 → resolve with stdout
- Handles non-zero exit → reject with error
- Handles kill before start

Mock `child_process.spawn` to return a controllable event emitter.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @opentidy/backend exec vitest run src/shared/spawn-agent.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement spawn-agent.ts**

Create `apps/backend/src/shared/spawn-agent.ts`. This is a refactored version of `spawn-claude.ts` with 3 changes:
1. Takes `adapter: AgentAdapter` in deps instead of `claudeConfigDir`
2. Uses `adapter.binary` in `spawn()` call instead of hardcoded `'claude'`
3. Uses `adapter.getEnv()` for env vars instead of hardcoded `CLAUDE_CONFIG_DIR`
4. Does NOT inject `--strict-mcp-config` (that's now the adapter's responsibility in `buildArgs()`)
5. Uses `AgentProcessType` instead of `ClaudeProcessType`
6. Log prefix: `[spawn-agent]` with `[${adapter.name}]` suffix

Exports: `createSpawnAgent(deps)`, `createSpawnAgentSimple(deps)`, types `SpawnAgentOptions`, `SpawnAgentHandle`, `SpawnAgentFn`.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @opentidy/backend exec vitest run src/shared/spawn-agent.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```
feat(backend): add spawn-agent.ts — agent-agnostic process spawner
```

---

### Task 5: Create guardrails.json unified format

**Files:**
- Create: `plugins/opentidy-hooks/guardrails.json`
- Modify: `plugins/opentidy-hooks/hooks/hooks.json` (becomes generated, add comment)

- [ ] **Step 1: Convert existing hooks.json to unified guardrails.json**

Read the current `plugins/opentidy-hooks/hooks/hooks.json` (Claude-native format with PreToolUse, PostToolUse, Stop, SessionEnd sections). Convert each entry to the unified format and write to `plugins/opentidy-hooks/guardrails.json`. Map: `PreToolUse` → `event: 'pre-tool'`, `PostToolUse` → `event: 'post-tool'`, `Stop` → `event: 'stop'`, `SessionEnd` → `event: 'session-end'`.

- [ ] **Step 2: Add a generated header to hooks.json**

Add a comment or separate file noting that `hooks/hooks.json` is now generated by `adapter.writeConfig()` from `guardrails.json` and should not be edited by hand.

- [ ] **Step 3: Add test for Claude adapter writeConfig round-trip**

In `apps/backend/src/shared/agents/claude.test.ts`, add a test that passes known `GuardrailRule[]` to `writeConfig()` and verifies the output `hooks.json` matches the expected Claude-native format. Include pre-tool prompt, pre-tool command, post-tool http, stop command, and session-end http rules.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @opentidy/backend exec vitest run src/shared/agents/claude.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```
feat(backend): add unified guardrails.json format with Claude adapter translation
```

---

### Task 6: Create instruction file generator (replaces claude-md.ts)

**Files:**
- Create: `apps/backend/src/features/sessions/instruction-file.ts`
- Create: `apps/backend/src/features/sessions/instruction-file.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/backend/src/features/sessions/instruction-file.test.ts` with tests for:
- Writes `INSTRUCTIONS.md` source file to dossier dir
- Copies content to the agent-native filename (CLAUDE.md, GEMINI.md, AGENTS.md)
- Content includes dossier title, objective, trigger, confirm mode, end of work instructions
- Cleans up stale instruction files from other agents (e.g., if switching from Claude to Gemini, removes CLAUDE.md but keeps INSTRUCTIONS.md)

Mock `fs` module.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opentidy/backend exec vitest run src/features/sessions/instruction-file.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement instruction file generator**

Create `apps/backend/src/features/sessions/instruction-file.ts` with function `generateDossierInstructions(opts)`.

The function:
1. Generates content (same as current `generateDossierClaudeMd()`)
2. Writes `INSTRUCTIONS.md` to the dossier dir (source of truth)
3. Copies `INSTRUCTIONS.md` to the adapter's native filename (e.g., `CLAUDE.md`)
4. Cleans up stale instruction files from other agents (`ALL_INSTRUCTION_FILES = ['CLAUDE.md', 'GEMINI.md', 'AGENTS.md']`)

For workspace-level (level 1): existing `workspace/CLAUDE.md` should be migrated to `workspace/INSTRUCTIONS.md` with a copy to the native name. This migration runs once in `opentidy setup` (Task 9).

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @opentidy/backend exec vitest run src/features/sessions/instruction-file.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```
feat(backend): add agent-agnostic instruction file generator (replaces claude-md.ts)
```

---

### Task 7: Migrate callers to use spawn-agent

**Files:**
- Modify: `apps/backend/src/features/triage/classify.ts`
- Modify: `apps/backend/src/features/checkup/sweep.ts`
- Modify: `apps/backend/src/features/dossiers/title.ts`
- Modify: `apps/backend/src/memory/agents.ts`
- Modify: `apps/backend/src/features/sessions/launch.ts`
- Modify: `apps/backend/src/index.ts` (or boot/ — wherever deps are wired)
- Modify: corresponding test files for mock updates

This task does NOT change any behavior — it replaces `spawnClaude` with `spawnAgent` and uses `adapter.buildArgs()` instead of hardcoded CLI flags.

- [ ] **Step 1: Update classify.ts**

Replace `createClaudeRunner` → `createAgentRunner`. The function now receives `adapter` in deps and uses `adapter.buildArgs({ mode: 'one-shot', systemPrompt, instruction })` to build args instead of hardcoded `['-p', '--system-prompt', ...]`. Update log from `claude -p` to generic. Update import from `spawnClaude` to `spawnAgent`.

- [ ] **Step 2: Update sweep.ts**

Replace hardcoded `['-p', '--system-prompt', ..., '--allowedTools', 'Read,Glob,Grep,Write', '--', prompt]` with `adapter.buildArgs({ mode: 'one-shot', systemPrompt, instruction, allowedTools: ['Read','Glob','Grep','Write'] })`. Update import.

- [ ] **Step 3: Update title.ts**

Replace `['-p', '--output-format', 'text', '--system-prompt', ..., instruction]` with `adapter.buildArgs({ mode: 'one-shot', systemPrompt, instruction, outputFormat: 'text' })`. Update import.

- [ ] **Step 4: Update agents.ts (memory)**

Replace `['-p', '--allowedTools', 'Read,Write,Glob', '--system-prompt', ..., '--', userPrompt]` with `adapter.buildArgs({ mode: 'one-shot', systemPrompt, instruction, allowedTools: ['Read','Write','Glob'] })`. Update import.

- [ ] **Step 5: Update launch.ts**

Add `adapter: AgentAdapter` to the `createLauncher` deps interface. Then replace `buildClaudeCommand()`:
- Use `adapter.buildArgs({ mode: 'interactive', skipPermissions: true, pluginDir, resumeSessionId, instruction })` to get args
- Construct tmux command: `cd ${dossierDir} && ${adapter.binary} ${args.map(a => quote(a)).join(' ')}`
- Replace `readSessionId()` local helper with `adapter.readSessionId()`
- Replace `generateDossierClaudeMd()` with `generateDossierInstructions({ instructionFile: adapter.instructionFile })`

- [ ] **Step 6: Update dependency wiring**

Where `createSpawnClaude()` is called with deps, replace with `createSpawnAgent({ adapter: resolveAgent(...), ... })`. The adapter comes from `resolveAgent()` using the loaded config. Thread the same adapter to `createLauncher()` deps.

- [ ] **Step 7: Update test files**

Update test mocks in corresponding test files: rename mock functions from `spawnClaude` to `spawnAgent`, update any expectations that reference 'claude' in log messages.

- [ ] **Step 8: Run all backend tests**

Run: `pnpm --filter @opentidy/backend test`
Expected: All tests PASS

- [ ] **Step 9: Commit**

```
refactor(backend): migrate all callers from spawn-claude to spawn-agent
```

---

### Task 8: Rename database and tracker references

**Files:**
- Rename: `apps/backend/src/shared/claude-tracker.ts` → `apps/backend/src/shared/agent-tracker.ts`
- Rename: `apps/backend/src/shared/claude-semaphore.ts` → `apps/backend/src/shared/agent-semaphore.ts`
- Modify: `apps/backend/src/shared/database.ts`
- Update all imports

- [ ] **Step 1: Rename claude-semaphore.ts to agent-semaphore.ts**

`git mv` the file. Update internal names: `createClaudeSemaphore` → `createAgentSemaphore`, `ClaudeSemaphore` → `AgentSemaphore`.

- [ ] **Step 2: Rename claude-tracker.ts to agent-tracker.ts**

`git mv` the file. Update `createClaudeTracker` → `createAgentTracker`. Update log prefix from `[claude-tracker]` to `[agent-tracker]`.

- [ ] **Step 3: Add database migration for table rename**

In `database.ts`, add migration to rename `claude_processes` → `agent_processes` and `claude_session_id` → `agent_session_id` in the sessions table. Use try/catch since columns/tables may already be renamed.

- [ ] **Step 4: Update all imports across the codebase**

Find and update all files importing from `claude-semaphore` or `claude-tracker`.

- [ ] **Step 5: Run all tests**

Run: `pnpm --filter @opentidy/backend test`
Expected: All PASS

- [ ] **Step 6: Commit**

```
refactor(backend): rename claude-specific infra to agent-generic (tracker, semaphore, db table)
```

---

### Task 9: Update config loader and setup CLI

**Files:**
- Modify: `apps/backend/src/shared/config.ts`
- Modify: `apps/backend/src/cli/setup.ts` (or `setup/` directory)

- [ ] **Step 1: Update config.ts DEFAULT_CONFIG**

Replace `claudeConfig: { dir: '' }` with `agentConfig: { name: 'claude', configDir: '' }`.

Add backward compat migration in `loadConfig()`: if loaded config has `claudeConfig` but no `agentConfig`, migrate and save.

- [ ] **Step 2: Add agent selection to setup**

In the setup CLI, add an "agent" module that:
1. Lists available agents (claude = stable, gemini/copilot = experimental with warning)
2. Saves to `config.json` as `agentConfig.name`
3. Creates the isolated config directory `~/.config/opentidy/agents/<name>/`
4. Calls `adapter.writeConfig()` to generate native hooks/settings from `guardrails.json`
5. Migrates workspace-level `CLAUDE.md` → `INSTRUCTIONS.md` (copies content, writes native file for active agent)

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @opentidy/backend test`
Expected: All PASS

- [ ] **Step 4: Commit**

```
feat(backend): add agent selection to config and setup wizard
```

---

### Task 10: Update opentidy doctor

**Files:**
- Modify: `apps/backend/src/cli/doctor.ts`

- [ ] **Step 1: Add agent binary check to doctor**

Add a check that:
1. Resolves the active agent from config
2. Verifies the binary exists (use `execFile` from `child_process` — NOT `exec`)
3. Warns if experimental
4. Checks that the agent config directory exists and has hooks generated

- [ ] **Step 2: Run doctor tests**

Run: `pnpm --filter @opentidy/backend exec vitest run tests/cli.test.ts`
Expected: PASS (update mocks if needed)

- [ ] **Step 3: Commit**

```
feat(cli): add agent binary and config validation to opentidy doctor
```

---

### Task 11: Delete deprecated files and clean up aliases

**Files:**
- Delete: `apps/backend/src/shared/spawn-claude.ts`
- Delete: `apps/backend/src/features/sessions/claude-md.ts`
- Modify: `packages/shared/src/types.ts` (remove deprecated aliases)
- Modify: `apps/backend/src/server.ts` and any frontend files importing `ClaudeProcess`

- [ ] **Step 1: Verify no remaining imports of old files**

Search for `spawn-claude`, `claude-md`, `ClaudeProcess` across `apps/backend/src/` AND `apps/web/src/`. Expected: only the deprecated aliases in `packages/shared/src/types.ts`. Update any remaining references in `server.ts` or frontend files to use `AgentProcess`.

- [ ] **Step 2: Delete deprecated files**

Remove `spawn-claude.ts` and `claude-md.ts`.

- [ ] **Step 3: Remove deprecated type aliases from shared**

Remove the `ClaudeProcessType`, `ClaudeProcessStatus`, `ClaudeProcess` aliases from `packages/shared/src/types.ts`.

- [ ] **Step 4: Run full test suite**

Run: `pnpm test && pnpm --filter @opentidy/shared build`
Expected: All PASS, build succeeds

- [ ] **Step 5: Commit**

```
chore(backend,shared): remove deprecated claude-specific files and type aliases
```

---

### Task 12: Update documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/specification.md`

- [ ] **Step 1: Update CLAUDE.md references**

Replace references to `spawn-claude.ts` with `spawn-agent.ts`. Add agent selection info. Update key paths section.

- [ ] **Step 2: Update specification.md**

Add a section about agent abstraction: supported agents, adapter pattern, how to add a new agent.

- [ ] **Step 3: Commit**

```
docs: update documentation for agent-agnostic architecture
```
