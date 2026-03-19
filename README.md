<p align="center">
  <h1 align="center">OpenTidy</h1>
  <p align="center">
    <strong>The AI assistant that handles your admin while you sleep.</strong>
  </p>
  <p align="center">
    Autonomous · Local-first · Agent-agnostic · Open source
  </p>
  <p align="center">
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="License" /></a>
    <a href="https://github.com/opentidy/opentidy/actions"><img src="https://img.shields.io/github/actions/workflow/status/opentidy/opentidy/release.yml?branch=main" alt="CI" /></a>
    <a href="https://github.com/opentidy/opentidy/releases"><img src="https://img.shields.io/github/v/release/opentidy/opentidy" alt="Release" /></a>
  </p>
  <p align="center">
    <a href="#quick-start">Quick Start</a> ·
    <a href="docs/specification.md">Docs</a> ·
    <a href="docs/architecture.md">Architecture</a> ·
    <a href="docs/contributing.md">Contributing</a> ·
    <a href="https://github.com/opentidy/opentidy/discussions">Community</a>
  </p>
</p>

---

You know that pile of admin tasks you keep postponing? The invoices to check, the insurance forms to fill, the emails to follow up on. You tell yourself you'll deal with it this weekend. You never do.

**OpenTidy deals with it.**

It's not a chatbot. It's not a copilot. It's an autonomous assistant that runs in the background — receiving your emails, filling out forms, tracking deadlines, following up with people — and only pinging you when it genuinely needs your input.

## Quick start

```bash
brew tap opentidy/opentidy
brew install opentidy
opentidy setup       # interactive wizard — walks you through everything
opentidy start       # that's it, it's running
```

OpenTidy runs as a background service. Open the web dashboard at `localhost:4800` to see your dossiers, or just wait for Telegram notifications.

```bash
opentidy status      # is it running?
opentidy doctor      # is everything configured?
opentidy logs        # what's happening?
```

**Requirements:** Node.js >= 22 · [Claude Code](https://docs.anthropic.com/en/docs/claude-code) with Claude Max · A Telegram bot for notifications (the setup wizard guides you)

## Why OpenTidy

**Dossiers, not conversations.** Each task is a persistent dossier — like a real folder on a real assistant's desk. It lives for days or weeks. OpenTidy picks it up, works on it, puts it down when blocked, and picks it back up when the missing piece arrives. No chat history to scroll through, no context lost between sessions.

**Event-driven, not poll-based.** An email lands, a message arrives, a deadline hits — OpenTidy reacts immediately. It triages incoming events, routes them to the right dossier, and spawns a focused AI session to handle it. No heartbeat timers, no stale task lists.

**Full parallelism.** Each dossier gets its own isolated AI session. Ten dossiers, ten parallel sessions, each with only the context it needs. No shared state, no interference, no bottleneck.

**Guardrails the AI can't see.** Every sensitive action — sending an email, submitting a form, making a payment — is intercepted by system-level hooks *before* it happens. The AI doesn't know they exist, can't bypass them, can't argue with them. You define the rules once, they're enforced every time.

**Built for real-world browsing.** Agents, MCP servers, and skills are optimized for fully autonomous web navigation:
- **[Camoufox](https://camoufox.com)** — anti-detection Firefox browser, one isolated instance per session, undetectable by bot protection
- **Persistent profiles** — cookies and logins are preserved across sessions. Log in once, OpenTidy reuses the session forever
- **CAPTCHA solving** — optional solver integration, handles challenges without human intervention
- **Parallel browsing** — ten dossiers, ten independent browser instances, with shared session profiles for efficient navigation
- **Full page interaction** — click, fill forms, upload files, download documents, navigate multi-step flows

"Download all my invoices from every provider" is a one-line instruction. OpenTidy logs into each site, navigates to the billing section, downloads the PDFs, and organizes them in your dossier.

**Your CLI, your subscription, zero gray area.** OpenTidy doesn't wrap APIs, doesn't proxy tokens, doesn't reverse-engineer anything. It spawns the official CLI you already have installed — Claude Code, Gemini CLI, Copilot CLI — using your own subscription, exactly as the vendor intended. No API keys to manage, no token costs to monitor, no ToS to worry about. If you can run `claude` in your terminal, OpenTidy can use it.

**Agent-agnostic.** Claude Code today, Gemini CLI or Copilot CLI tomorrow. Swap your AI engine without changing your setup, your dossiers, or your guardrails.

**Self-improving.** When OpenTidy can't handle something, it logs the gap. Over time, these gaps become your natural backlog — driven by real usage, not guesswork.

## How it works

```
  Email / SMS / WhatsApp / You
           │
           ▼
     ┌───────────┐
     │  Receiver  │─── dedup + triage (which dossier?)
     └─────┬─────┘
           │
           ▼
     ┌───────────┐
     │  Launcher  │─── spawns an isolated AI session
     └─────┬─────┘
           │
           ▼
   ┌─────────────┐
   │  AI Session  │─── works autonomously (browse, email, files)
   │              │─── guardrail hooks intercept sensitive actions
   └─────┬───────┘
         │
         ▼
   ┌───────────┐
   │  Dossier   │─── state.md · artifacts · memory
   └─────┬─────┘
         │
         ▼
   Notification → "Done" or "I need your input"
```

When a session ends, a post-session agent extracts learnings into memory — so the next session on this dossier starts with full context.

## OpenTidy vs OpenClaw

[OpenClaw](https://github.com/openclaw/openclaw) popularized the local-first AI assistant. OpenTidy takes a different approach.

| | OpenTidy | OpenClaw |
|---|---|---|
| **Task model** | Persistent dossiers with state, checkpoints, and resume conditions | Chat messages + `HEARTBEAT.md` checklist |
| **Triggers** | Event-driven — reacts in real-time | Heartbeat polling (every 30 min) |
| **Parallelism** | Isolated session per dossier, all concurrent | Single agent per gateway |
| **Security** | System-level hooks, fail-closed, invisible to AI | DM pairing + allowlists |
| **Interface** | Web dashboard + Telegram notifications | Messaging apps as primary UI |
| **Agent** | Agent-agnostic (Claude, Gemini, Copilot) | Model-agnostic, single-agent |
| **Browser** | Camoufox (anti-detection, persistent sessions, parallel) | Chrome/Playwright (detectable, no session persistence) |
| **Improvement** | Automatic gap logging → natural backlog | Manual skill authoring |

**TL;DR** — OpenClaw is chat-first: you talk to it, it does things. OpenTidy is task-first: it receives events, manages dossiers, and only talks to you when it needs to. If you want to ask your AI to play Spotify, use OpenClaw. If you want an AI that silently processes your insurance claim over three weeks, use OpenTidy.

## Compatibility

### Operating systems

| OS | Status | Install method | Notes |
|---|---|---|---|
| **macOS** | ✅ Supported | `brew install opentidy` | Primary platform |
| **Linux** | 🚧 In progress | — | Planned for Homebrew on Linux |
| **Windows** | 🚧 In progress | — | WSL2 recommended when available |

### AI agents

OpenTidy is agent-agnostic — it spawns the CLI you already have installed, using your own subscription.

| Agent | Status | Subscription | Guardrails |
|---|---|---|---|
| **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)** | ✅ Supported | Claude Max / Pro | PreToolUse hooks (fail-closed) |
| **[Gemini CLI](https://github.com/google-gemini/gemini-cli)** | 🚧 In progress | Google AI / Vertex | Planned |
| **[GitHub Copilot CLI](https://docs.github.com/en/copilot)** | 🚧 In progress | Copilot subscription | Planned |

### Notification channels

| Channel | Status | Notes |
|---|---|---|
| **Telegram** | ✅ Supported | Bot notifications, completions, escalations |
| **Web dashboard** | ✅ Supported | Real-time SSE at `localhost:4800` |
| **WhatsApp** | 🚧 In progress | Receiver implemented, notifications planned |
| **Email** | 🚧 In progress | Gmail receiver implemented, notifications planned |

### Input receivers

| Source | Status | Notes |
|---|---|---|
| **Gmail** (webhook) | ✅ Supported | Incoming emails triaged to dossiers |
| **SMS** (macOS Messages) | ✅ Supported | Reads iMessage/SMS via Messages.app |
| **WhatsApp** (Camoufox) | 🚧 In progress | Browser-based reader |
| **Web app** (manual) | ✅ Supported | Create dossiers via the dashboard |

## Architecture

OpenTidy is a monorepo with three packages:

```
opentidy/
├── apps/backend/     # Hono API + daemon + CLI (TypeScript)
├── apps/web/         # React 19 SPA + Vite + Tailwind (TypeScript)
└── packages/shared/  # Types + Zod schemas
```

Both backend and frontend follow **Vertical Slice Architecture** — code organized by feature, not by layer. Each feature directory is self-contained: route, handler, logic, and tests in one place. [Read more →](docs/architecture.md)

## Documentation

- **[Getting Started](docs/getting-started.md)** — Installation, setup, your first dossier
- **[Configuration](docs/configuration.md)** — All options explained
- **[Architecture](docs/architecture.md)** — How it works under the hood
- **[Security](docs/security.md)** — Hooks, guardrails, audit system
- **[Specification](docs/specification.md)** — Full product spec
- **[Contributing](docs/contributing.md)** — Dev setup, tests, PR guidelines

## Contributing

We welcome contributions! Check out the [Contributing Guide](docs/contributing.md) to get started, or browse [good first issues](https://github.com/opentidy/opentidy/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

## License

**[AGPL-3.0](LICENSE)** — free to use, modify, and deploy. If you offer OpenTidy as a network service, you must publish your source code. For commercial licensing, [open an issue](https://github.com/opentidy/opentidy/issues) or start a [discussion](https://github.com/opentidy/opentidy/discussions).
