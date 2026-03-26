# Agent-Agnostic Architecture Design

**Date:** 2026-03-19
**Status:** Approved
**Author:** Lolo + Claude

## Goal

Make OpenTidy agent-agnostic so users can choose their AI coding agent based on their existing subscription, while keeping the advantage of spawning official CLIs directly as subprocesses.

## Decisions

1. **User choice**: the user picks one agent at setup time, used globally for everything (sessions, triage, checkup, memory)
2. **Strict parity**: an agent is only supported if it covers 100% of required features: headless mode, structured output, session resume, system prompt injection, pre-tool hooks, MCP support
3. **Unified guardrails**: single `guardrails.json` source of truth, adapters translate to native hook format. **Fail-closed**: if a guardrail cannot be translated for an agent, the action is denied by default.
4. **Unified instructions**: single `INSTRUCTIONS.md` per workspace/dossier, adapters write the native file (`CLAUDE.md`, `GEMINI.md`, `AGENTS.md`)
5. **Unified MCP config**: single OpenTidy MCP definition, adapters generate native config
6. **Isolated config**: each agent gets its own config directory under `~/.config/opentidy/agents/<name>/`, fully isolated from the user's personal agent config. If an agent does not support config directory isolation via env var, it is disqualified.
7. **Multi-agent everywhere**: abstraction covers both autonomous (headless `-p`) and interactive (tmux) modes
8. **Global selection**: one agent for all tasks, no per-dossier override
9. **Dev override**: `OPENTIDY_AGENT=gemini` env var or `--agent gemini` CLI flag for development/testing
10. **Stability tiers**: Claude + macOS = stable; all other agents and OS = experimental
11. **Implement Claude first**: only the Claude adapter is implemented at launch. Other adapters are future work, gated on verified upstream feature availability.

## Agent Requirements (Strict Parity Checklist)

An agent CLI must support ALL of the following to qualify:

| # | Requirement | Why |
|---|---|---|
| 1 | Headless/non-interactive mode | Autonomous sessions, one-shot calls |
| 2 | Structured output (JSON/NDJSON) | Output parsing for triage, checkup |
| 3 | Session resume by ID | Multi-turn dossier sessions |
| 4 | System prompt injection (flag or file) | Triage, checkup, memory, title prompts |
| 5 | Pre-tool execution hooks (block/allow) | Security guardrails, non-negotiable |
| 6 | MCP server support | Gmail, Camoufox, WhatsApp integration |
| 7 | Config directory isolation via env var | User's personal config must never be touched |
| 8 | Permission bypass flag | OpenTidy uses hooks for security, not built-in permissions |

## Agent Status

### Implemented

| Agent | Binary | Status | Notes |
|---|---|---|---|
| **Claude Code** | `claude` | **Stable** | All 8 requirements met. `CLAUDE_CONFIG_DIR` for isolation. PreToolUse/PostToolUse hooks. `--system-prompt`, `--resume`, `--output-format stream-json`, `--dangerously-skip-permissions`. |

### Candidates (not yet implemented: requires upstream verification)

| Agent | Binary | Status | Gaps to verify |
|---|---|---|---|
| **Gemini CLI** | `gemini` | **Candidate** | Verify: headless `-p` flag, `--resume` semantics, BeforeTool/AfterTool hook format, config isolation env var, structured output format, permission bypass equivalent |
| **Copilot CLI** | `copilot` | **Candidate** | Verify: headless `-p` flag, `--resume` semantics, preToolUse/postToolUse hook format, config isolation mechanism, structured output format, permission bypass equivalent |
| **Codex CLI** | `codex` | **Future** | Missing: `--system-prompt` flag, pre-tool hooks (only SessionStart/Stop). Active development, may qualify later. |

### Disqualified

| Agent | Reason |
|---|---|
| Cursor | Proprietary ToS prohibits derivative works, incompatible with AGPL |
| Devin | Cloud VM, not a local subprocess |
| Windsurf | No CLI |
| Amazon Q | Headless mode not production-ready, no structured output |
| Aider | No session resume, no structured output, no hooks |
| Cline CLI | No formal pre-tool hook system |
| Goose | No structured output, no pre-tool hooks |
| OpenHands | No pre-tool hook system |
| SWE-agent | Research tool, not production agent |

## Architecture

### Adapter Interface

```typescript
// packages/shared/src/types.ts

type AgentName = 'claude' | 'gemini' | 'copilot'

interface SpawnOpts {
  mode: 'autonomous' | 'interactive' | 'one-shot'
  cwd: string
  systemPrompt?: string          // injected via --system-prompt or equivalent
  instruction?: string           // the prompt/task
  resumeSessionId?: string       // --resume <id>
  allowedTools?: string[]        // --allowedTools 'Read,Write,Glob'
  outputFormat?: 'text' | 'json' | 'stream-json'
  pluginDir?: string             // hooks plugin directory
  skipPermissions?: boolean      // --dangerously-skip-permissions or equivalent
}

interface SetupOpts {
  guardrails: GuardrailRule[]    // from guardrails.json
  mcpServices: McpConfig         // active MCP services (existing type)
  configDir: string              // agent-specific config dir
}

interface AgentAdapter {
  readonly name: AgentName
  readonly binary: string
  readonly instructionFile: string   // 'CLAUDE.md', 'GEMINI.md', 'AGENTS.md'
  readonly configEnvVar: string      // 'CLAUDE_CONFIG_DIR', etc.
  readonly experimental: boolean

  // Runtime
  buildArgs(opts: SpawnOpts): string[]
  getEnv(): Record<string, string>
  readSessionId(dossierDir: string): string | null

  // Setup-time (called by opentidy setup)
  writeConfig(opts: SetupOpts): void
}
```

Each adapter is a factory function (`createClaudeAdapter()`) returning this interface; consistent with OpenTidy's existing pattern.

### File Structure (VSA-compliant)

Agent abstraction is shared infrastructure, not a feature slice:

```
src/shared/agents/
├── types.ts              # AgentAdapter, SpawnOpts, SetupOpts, AgentName
├── registry.ts           # resolveAgent(): env → flag → config.json → fallback 'claude'
├── claude.ts             # createClaudeAdapter(). IMPLEMENTED
├── gemini.ts             # createGeminiAdapter(), STUB (throws "experimental, not yet implemented")
└── copilot.ts            # createCopilotAdapter(), STUB (throws "experimental, not yet implemented")

src/shared/
├── spawn-agent.ts        # replaces spawn-claude.ts, uses resolveAgent()
└── ...
```

Feature slices (`src/features/triage/`, `src/features/sessions/`, etc.) import `spawn-agent` instead of `spawn-claude`. They don't know or care which agent is running.

### Agent Resolution Order

```
OPENTIDY_AGENT env var → --agent CLI flag → config.json.agent → fallback 'claude'
```

`resolveAgent()` logs a warning at startup if the resolved agent is experimental.

### Config Isolation

```
~/.config/opentidy/
├── config.json            # { "agent": "claude", ... }
└── agents/
    ├── claude/            # CLAUDE_CONFIG_DIR=~/.config/opentidy/agents/claude/
    │   ├── settings.json
    │   ├── hooks/
    │   └── ...
    ├── gemini/            # <GEMINI_ENV_VAR>=~/.config/opentidy/agents/gemini/ (TBD)
    │   └── ...
    └── copilot/           # <COPILOT_ENV_VAR>=~/.config/opentidy/agents/copilot/ (TBD)
        └── ...
```

Each agent's config is generated by `adapter.writeConfig()` during `opentidy setup`. The user's personal agent config is never touched. The exact env var for Gemini and Copilot config isolation will be determined when those adapters are implemented; if the agent does not support config isolation, it cannot be supported.

### Unified Guardrails

Single source of truth for security rules:

```
plugins/opentidy-hooks/
├── guardrails.json       # unified format (maintained by hand)
└── hooks/hooks.json      # Claude native format (GENERATED by adapter.writeConfig())
```

Supported `event` values: `pre-tool`, `post-tool`, `stop`, `session-end`. This covers both tool-level guardrails and lifecycle hooks.

Format:

```json
{
  "rules": [
    {
      "event": "pre-tool",
      "type": "prompt",
      "match": "mcp__gmail__send|reply|draft",
      "prompt": "Verify this email action. DENY if it involves payment..."
    },
    {
      "event": "pre-tool",
      "type": "command",
      "match": { "tool": "Bash", "input_contains": "curl -X POST" },
      "command": "curl -s http://localhost:$PORT/api/hooks ..."
    },
    {
      "event": "session-end",
      "type": "http",
      "match": "*",
      "url": "http://localhost:$PORT/api/hooks"
    }
  ]
}
```

#### Guardrail Translation Contract

Each adapter must translate every rule in `guardrails.json` to its native format. The contract:

1. **`type: "prompt"` rules**: Claude spawns a mini-Claude verifier. Other agents must provide an equivalent independent verification mechanism (mini-agent, script-based check, or native equivalent). If the agent has no equivalent, the rule must be translated to a `type: "command"` that calls the OpenTidy backend for verification.
2. **Tool name matching**: `match` patterns use MCP tool naming (`mcp__<server>__<tool>`). Adapters must map to the agent's native tool naming if it differs.
3. **`type: "command"` rules**: these call the OpenTidy backend via HTTP. The adapter must translate the hook payload to the format expected by `POST /api/hooks` (fields: `hook_event_name`, `tool_name`, `tool_input`, `session_id`, `cwd`).
4. **Untranslatable rules**: if a guardrail rule cannot be translated for an agent, the adapter must **fail-closed**: deny the action by default. Silent fail-open is never acceptable.

Translation happens at **setup time** (`opentidy setup` calls `adapter.writeConfig()`). The generated native config is written to the agent's isolated config directory. Re-running setup regenerates it.

### Unified Instruction Files

Single `INSTRUCTIONS.md` is the source of truth for agent context:

- **Level 1 (workspace):** `workspace/INSTRUCTIONS.md`, identity, style, security rules
- **Level 2 (dossier):** generated before each session launch into `workspace/<dossier>/INSTRUCTIONS.md`

At spawn time (within the per-dossier lock), the adapter copies `INSTRUCTIONS.md` to the native filename:
- Claude: `CLAUDE.md`
- Gemini: `GEMINI.md`
- Copilot: `AGENTS.md`

The source `INSTRUCTIONS.md` is the only file maintained. The native copy is generated and may be overwritten at any spawn. Only the native file exists in each directory (no coexistence, the adapter removes stale files from other agents if present).

### Config Type Changes

```typescript
// packages/shared/src/types.ts

// Before (v1):
// claudeConfig: { dir: string }

// After (v2):
agentConfig: {
  name: AgentName       // 'claude' | 'gemini' | 'copilot'
  configDir: string     // ~/.config/opentidy/agents/<name>/
}
```

Backward compatibility: if `config.json` contains `claudeConfig` but no `agentConfig`, migration code in the config loader treats it as `{ name: 'claude', configDir: claudeConfig.dir }` and rewrites the config on next `opentidy setup`.

### Migration Path

1. `spawn-claude.ts` → `spawn-agent.ts`: `createSpawnAgent()` replaces `createSpawnClaude()`. Internally calls `resolveAgent()` to get the active adapter. Uses `adapter.buildArgs()` and `adapter.getEnv()` instead of hardcoded Claude flags.
2. All callers (classify.ts, sweep.ts, title.ts, agents.ts, launch.ts) update their import from `spawn-claude` to `spawn-agent`. Signature stays nearly identical.
3. Interactive mode: `launch.ts` uses `adapter.buildArgs({ mode: 'interactive', ... })` to construct the tmux command with the right binary.
4. `plugins/opentidy-hooks/hooks.json` becomes generated output. `guardrails.json` becomes the maintained source.
5. `config.json` gains `agentConfig` field, `claudeConfig` is migrated.
6. `opentidy setup` gains agent selection step (with experimental warnings).
7. `opentidy doctor` validates: agent binary exists, agent is authenticated, hooks config is generated, config isolation works.

### Stability Tiers

| Tier | Agents | OS | Meaning |
|---|---|---|---|
| **Stable** | Claude Code | macOS | Tested, production-ready |
| **Experimental** | Gemini CLI, Copilot CLI | macOS | Adapter stub exists, not implemented, requires upstream verification |
| **Experimental** | All | Linux, Windows (WSL) | macOS-only receivers disabled, rest works but experimental |

Enforced in code: `resolveAgent()` logs a warning at startup for experimental agents. `opentidy setup` shows a clear warning before confirming an experimental agent selection.

### Verification Checklist (per agent, before marking stable)

- [ ] All 8 parity requirements verified against actual CLI documentation
- [ ] All guardrail rules from `guardrails.json` correctly translated and tested
- [ ] `opentidy doctor` validates binary, auth, hooks, and config isolation
- [ ] Smoke test: one triage call + one autonomous session + one interactive session
- [ ] Audit log captures agent name alongside each action
- [ ] No security regression: payment guardrails block correctly

## Out of Scope

- Per-dossier agent selection
- Automatic fallback between agents
- Multi-agent in a single session (different agents for different tasks)
- BYOK/self-hosted model support
- Output format normalization layer (callers parse prompt output directly; the prompt contract produces the same JSON/text regardless of agent)
