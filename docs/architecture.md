# Architecture

OpenTidy is a lightweight orchestration layer around Claude Code. The core insight: Claude Code already has everything needed to be a powerful autonomous agent — browser automation, filesystem access, MCP tools, session resume. OpenTidy just provides the infrastructure to let it work independently on persistent tasks.

## Design principles

1. **Speed doesn't matter.** Administrative tasks take days, not seconds. No latency optimization, no priority queues. Focus on result quality.

2. **Claude Code is the execution engine.** Not the API. Not an agent framework. Claude Code sessions with full tool access — browser, filesystem, MCP servers, skills.

3. **The intelligence is in Claude, not the code.** The backend contains zero business logic, zero decision-making, zero routing intelligence. It's plumbing: receive events, spawn Claude, persist state. Claude decides what to do.

4. **No interruption — isolated parallelism.** Each task gets its own Claude Code session. Sessions run in parallel without interfering. A new event doesn't interrupt an ongoing session — it spawns a new one.

5. **The assistant works quietly in the background.** Hybrid event-driven + cron model. Events trigger work, periodic sweeps catch what events miss.

6. **Self-improving.** When Claude can't do something, it logs the gap. Over time, these gaps become a natural backlog of improvements driven by real usage.

## System overview

```
┌────────────────────────────────────────────────────────────────────┐
│                          WEB APP                                    │
│                                                                    │
│  - Active tasks + status                                             │
│  - Approve/reject actions                                          │
│  - Give instructions / create tasks                                 │
│  - Interactive terminal (take over a session)                      │
│  - Notifications history                                           │
│                                                                    │
└────────────────────────┬───────────────────────────────────────────┘
                         │ API
                         ▼
┌────────────────────────────────────────────────────────────────────┐
│                        BACKEND                                     │
│                                                                    │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐                        │
│  │ RECEIVER │  │ LAUNCHER │  │ STATE MGR │                        │
│  │          │  │          │  │           │                        │
│  │ Webhooks │  │ Spawns   │  │ Reads/    │                        │
│  │ Crons    │  │ Claude   │  │ writes    │                        │
│  │ App web  │  │ sessions │  │ tasks      │                        │
│  └────┬─────┘  └────┬─────┘  └─────┬─────┘                        │
│       │              │              │                               │
│  ┌────┴──────────────┴──────────────┴──────┐                       │
│  │           INFRASTRUCTURE                │                       │
│  │  - Event dedup (content hash)           │                       │
│  │  - Resource locks (PID-based)           │                       │
│  │  - Crash recovery                       │                       │
│  │  - SSE event emitter                    │                       │
│  └─────────────────────────────────────────┘                       │
│                                                                    │
│  ┌─────────────────────────────────────────┐                       │
│  │         NOTIFICATIONS (Telegram)        │                       │
│  │  Push → user (links to web app)         │                       │
│  └─────────────────────────────────────────┘                       │
│                                                                    │
└────────────────────────┬───────────────────────────────────────────┘
                         │ spawns
                         ▼
┌────────────────────────────────────────────────────────────────────┐
│          CLAUDE CODE SESSIONS (autonomous + interactive)            │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ GUARDRAILS (PreToolUse Hooks)                                │  │
│  │                                                              │  │
│  │ Intercept EVERY tool call BEFORE execution.                  │  │
│  │ Claude cannot bypass them.                                   │  │
│  │ Independent mini-Claude verifier (type: "prompt").           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  Session 1: "invoices-2025"                                        │
│    context: workspace/invoices-2025/state.md                       │
│    tools: Gmail MCP, browser, filesystem                           │
│                                                                    │
│  Session 2: "insurance-report"                                     │
│    context: workspace/insurance-report/state.md                    │
│    tools: browser, password manager                                │
│                                                                    │
│  (N sessions in parallel, fully isolated)                          │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

## Components

### Receiver

The receiver ingests events from all sources and routes them to the right task.

**Event sources:**

| Type | Source | Examples |
|------|--------|----------|
| Push | Gmail webhook | New email received |
| Poll | SMS/messaging watchers | New message |
| Cron | Periodic sweep | "Check tasks, advance what you can" |
| User | Web app | "List my unpaid invoices from last 3 months" |
| User | Telegram | Reply to a checkpoint notification |

**Deduplication:** Every event is hashed. Duplicates are silently dropped.

**Triage:** Claude does the routing (not code). A one-shot `claude -p` call receives the event content plus the full `state.md` of every active task. Claude determines which task(s) the event belongs to, whether to suggest a new task, or whether to ignore it.

```
claude -p --system-prompt "Triage mode. Respond in JSON only." \
  "Active tasks (full state.md content):\n\n--- invoices ---\n...\n\nEvent:\nEmail from billing@example.com: March invoice"
```

Response (one of three cases):
```json
{ "taskIds": ["invoices-2025"] }
{ "suggestion": { "title": "...", "urgency": "normal", "source": "gmail", "why": "..." } }
{ "ignore": true, "reason": "marketing spam" }
```

**Key rule:** Claude never creates tasks. Only the user can create a task (via the web app) or approve a suggestion.

### Launcher

The launcher manages Claude Code session lifecycle. Two execution modes:

**Autonomous mode (default):** Claude runs as a Node.js child process.

```bash
claude -p --output-format stream-json --dangerously-skip-permissions \
  [--resume <session-id>] "<instruction>"
```

- Process exit = reliable end-of-session signal
- stdout is NDJSON (stream events for the frontend)
- Post-session agent runs automatically after exit (memory extraction, gap detection)
- Working directory is set to the task's workspace folder

**Interactive mode ("Take Over"):** For when the user wants to talk to Claude directly.

1. User clicks "Take Over" in the web app
2. Backend kills the autonomous child process
3. Launches `claude --resume <session-id>` in tmux
4. User interacts via ttyd (terminal embedded in the web app)
5. "Hand Back" kills tmux and relaunches autonomous mode

**Context loading:** Two-level CLAUDE.md system.

- **Level 1** — `workspace/CLAUDE.md` (global, shared by all sessions): identity, work style, security rules, available tools, expected formats
- **Level 2** — `workspace/<task>/CLAUDE.md` (auto-generated per launch): task objective, confirm mode, triggering event, relevant contacts

Claude Code automatically loads CLAUDE.md files from the working directory and parents. This persists across `--resume`.

**Parallelism:** Multiple child processes run simultaneously, each on a different task. PID-based locks in `/tmp/opentidy-locks/` prevent two sessions from working on the same task.

**Crash recovery:** On startup, the backend reconciles in two passes:
1. Check for surviving tmux sessions (interactive mode)
2. Scan workspace for orphaned tasks that are still "in progress" and relaunch them

### Workspace

Each task is a directory in `workspace/` with markdown files. No database for state — human-readable files that Claude can also read and write.

```
workspace/
├── invoices-2025/
│   ├── state.md          # current state, next steps, condensed history
│   ├── checkpoint.md     # waiting for user: what, why, options
│   └── artifacts/        # produced files (PDFs, screenshots, etc.)
│
├── _suggestions/         # tasks suggested by Claude, awaiting approval
│   └── overdue-payment.md
│
├── _gaps/
│   └── gaps.md           # limitations detected by Claude
│
└── _audit/
    └── actions.log       # every external action logged
```

#### state.md (the core)

This is Claude's memory for a task. It contains everything needed to resume work in a new session.

```markdown
# Invoice Tracking 2025

## Objective
Verify that all monthly invoices have been sent to the client.

## Current State
STATUS: IN PROGRESS
Last action: 2026-03-13

## Completed
- Jan 2025: invoice #2025-001 sent on 02/05
- Feb 2025: invoice #2025-002 sent on 03/03

## Remaining
- Apr 2025: timesheet found (152h), invoice to create
- May 2025: timesheet MISSING — email sent to client on 03/12

## Waiting For
Email sent to billing@example.com on 03/12 for May timesheet.
Follow up if no response by 2026-03-16.

## Contacts
- Client billing: billing@example.com
```

Claude manages the size of state.md itself — condensing old entries when the file grows too large.

#### The "Waiting For" section

An optional section in state.md, written by Claude when it can't progress because it's waiting for external information (email reply, document, third-party confirmation).

**Role in the system:**
- **Triage** uses it to match incoming events to the right task
- **Sweep** respects it — doesn't relaunch a waiting task unless a follow-up date has passed
- **Launcher** clears it automatically when relaunching a session
- **Web app** displays the first line on the task card

#### checkpoint.md

When Claude needs the user's input, it writes a checkpoint:

```markdown
# Checkpoint — Awaiting Validation

## What I Did
Created 2 invoices for April and May 2025.

## What I Need From You
Validate the invoices before sending.

## Details
- April invoice: 152h x $80 = $12,160 → artifacts/invoice-2025-04.pdf
- May invoice: 160h x $80 = $12,800 → artifacts/invoice-2025-05.pdf

## Options
1. [Send both] → I'll email them to billing@example.com
2. [Modify] → tell me what to change
3. [Cancel] → I'll wait for your instructions
```

### Notifications

Telegram serves as a push notification channel with links to the web app. Not an interaction channel — all actions happen in the web app.

**Types:**
- "April invoice ready for review → [View in app]"
- "Blocked on example.com (MFA required) → [Intervene]"
- "Follow-up email sent to client for May timesheet"

### Suggestions

Claude can't create tasks, but it can suggest them. Suggestions are stored in `workspace/_suggestions/` as markdown files.

**Sources:**
- Incoming event with no matching task
- Sweep observation (deadline, follow-up needed)
- Opportunistic discovery while working on another task

**Urgency levels:** `urgent` (deadline approaching), `normal` (handle when possible), `low` (opportunity).

In the web app, suggestions appear on the home page with two actions: "Create Task" or "Dismiss".

### Gaps (self-improvement)

When Claude can't accomplish something, it logs it in `workspace/_gaps/gaps.md`:

```markdown
## 2026-03-14 — Login to example.com
Problem: The site requires MFA via a mobile authenticator app.
Impact: Cannot complete the annual report.
Suggestion: Add TOTP code reading capability.
```

These gaps form a natural backlog of improvements, visible in the web app's "Improvements" page.

## Module system

Modules extend OpenTidy's capabilities. Each module lives in `apps/backend/modules/<name>/module.json` and declares its tools, permissions, and integration pattern.

### Three levels

**Level 1 — JSON-only MCP** (`module.json` with `mcpServers`):
The simplest pattern. The backend configures the declared MCP server in the agent's session. No custom code needed.
Examples: browser (Camoufox), password-manager, email.

**Level 2 — JSON + receiver.ts** (`module.json` with `receiver`):
Adds event ingestion. The receiver watches an external source and feeds events into triage. The MCP server (if any) is configured separately.
Examples: modules that only need to ingest external events.

**Level 3 — JSON + daemon.ts** (`module.json` with `daemon`):
A long-running process managed by the backend lifecycle. The daemon receives a `ModuleContext` that provides: `emit()` for pushing events into triage, `registerTool()` for exposing MCP tools, `logger` for prefixed logging, `onShutdown()` for cleanup, and `dataDir` for persistent storage. Daemon tools are registered on the built-in OpenTidy MCP server — the agent sees them as `mcp__opentidy__<tool_name>`.
Examples: WhatsApp (Baileys — one WebSocket handles both incoming messages and outgoing tool calls).

### Daemon lifecycle

Daemons for enabled modules start at boot and stop on disable. Crash recovery uses exponential backoff. The lifecycle API exposes `restartDaemon(name)` for manual recovery.

## Data flow

### Event → Action

```
1. Gmail webhook → Receiver gets "email from billing@example.com"
2. Receiver dedup → not a duplicate → creates event
3. Triage (claude -p one-shot) → matches to "invoices-2025" task
4. Launcher spawns autonomous Claude session (child process)
5. Claude:
   a. Reads email (Gmail MCP)
   b. Reads workspace/invoices-2025/state.md
   c. Prepares response with attachments
   d. Calls gmail.reply(...)
      → PreToolUse hook fires automatically
      → Mini-Claude verifies: "coherent reply, known recipient → ALLOW"
   e. Email sent, PostToolUse logs the action
   f. Updates state.md
6. Process exits → handleAutonomousExit()
7. Notification → Telegram if relevant
```

### Periodic sweep

```
1. setInterval fires → Launcher runs claude -p sweep
2. Claude sweep:
   a. Reads workspace/*/state.md
   b. Identifies tasks needing action (deadlines, follow-ups)
   c. Creates suggestions if needed
   d. Returns JSON list of tasks to launch
3. Backend parses → spawns focused autonomous sessions
4. Each session works independently
```

### User instruction

```
1. User opens web app → "List my unpaid invoices from the last 3 months"
2. Backend creates task workspace/unpaid-invoices/ + initial state.md
3. Launcher spawns Claude with the instruction
4. Claude works autonomously
5. If blocked → checkpoint.md → Telegram notification → user intervenes
6. If done → state.md updated → notification
```

## Session lifecycle

### Autonomous mode

```
Spawn child process → Claude works → Process exit
                                         │
                              handleAutonomousExit()
                                         │
                    ┌────────────┬────────┴──────────┐
                    ▼            ▼                    ▼
               COMPLETED     BLOCKED              IN PROGRESS
               notify user   checkpoint.md        may relaunch
                             notify user           on next sweep
```

### Interactive mode

```
User clicks "Take Over"
    → Kill autonomous child process
    → Launch tmux session with --resume
    → User interacts via ttyd in web app
    → User clicks "Hand Back"
    → Kill tmux
    → Relaunch autonomous mode
```

### Post-session agent

After each autonomous process exit:
1. Read state.md → determine status (completed / blocked / in progress)
2. Cleanup: release lock, cancel timers, emit SSE events
3. If transcript was substantial → launch memory extraction agent
4. Send appropriate notifications

## Tech stack

| Component | Choice | Why |
|-----------|--------|-----|
| Backend | Node.js + Hono | Lightweight, TypeScript, fast startup |
| Frontend | React 19 + Vite | SPA with real-time SSE updates |
| Shared types | pnpm workspace package | Single source of truth for TypeScript types + Zod schemas |
| Sessions | Claude Code CLI | Full tool access, session resume, MCP support |
| Notifications | Telegram (grammy) | Push notifications with links |
| Remote access | Cloudflare Tunnel | Secure, no open ports |
| Locks | PID files in /tmp | Simple, crash-recoverable |
| Process management | LaunchAgent (macOS) / systemd (Linux) | Auto-restart, boot start |

## Next steps

- [Security](security.md) — hooks, guardrails, and audit system in detail
- [Configuration](configuration.md) — all config options
- [Specification](specification.md) — full product specification
