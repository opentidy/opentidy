<p align="center">
  <h1 align="center">OpenTidy</h1>
  <p align="center">
    <strong>Your personal AI assistant that actually does the work.</strong>
  </p>
  <p align="center">
    <a href="#quick-start">Quick Start</a> ·
    <a href="docs/getting-started.md">Documentation</a> ·
    <a href="docs/architecture.md">Architecture</a> ·
    <a href="CONTRIBUTING.md">Contributing</a>
  </p>
</p>

---

You know that pile of admin tasks you keep postponing? The invoices to check, the forms to fill out, the emails to follow up on, the documents to chase down. You tell yourself you'll deal with it this weekend. You never do.

**OpenTidy deals with it.**

It's not a chatbot. It's not a copilot waiting for your instructions. OpenTidy is an autonomous AI assistant that runs in the background, 24/7, managing your admin tasks from start to finish — opening emails, filling out forms, tracking deadlines, following up with people — and only pinging you when it genuinely needs your input.

## What makes it different

Most "AI assistants" are fancy chat interfaces. OpenTidy is fundamentally different:

- **Long-lived dossiers, not conversations.** Each task is a persistent dossier that lives for days or weeks. OpenTidy picks it up, works on it, puts it down, and picks it back up — just like a real assistant would.

- **Truly autonomous.** It doesn't wait for you to type. It receives events (emails, messages, schedules), triages them, routes them to the right dossier, and gets to work. You get a notification when it's done or when it needs you.

- **Claude does the thinking, the code does the plumbing.** No fragile decision trees, no rigid workflows, no prompt chains. Claude Code is the execution engine — with full access to browser, filesystem, and tools. The backend just handles infrastructure: event routing, locks, dedup, crash recovery.

- **Security guardrails that AI can't bypass.** PreToolUse hooks intercept every sensitive action (emails, payments, form submissions) *before* it happens. Claude doesn't know they exist, can't see them, can't skip them. You define the rules, they're enforced at the system level.

- **Self-improving.** When OpenTidy can't do something, it logs the gap. Over time, these gaps become your natural backlog of improvements — driven by real usage, not guesswork.

## How it works

```
  Email / SMS / Calendar / You
           │
           ▼
     ┌──────────┐
     │ Receiver  │──── dedup + triage (which dossier does this belong to?)
     └────┬─────┘
          │
          ▼
     ┌──────────┐
     │ Launcher  │──── spawns a focused Claude Code session per dossier
     └────┬─────┘
          │
          ▼
   ┌────────────┐
   │ Claude Code │──── works autonomously (browse, email, read/write files)
   │  session    │──── hooks intercept sensitive actions
   └────┬───────┘
        │
        ▼
  ┌────────────┐
  │  Workspace  │──── state.md, artifacts, memory — persistent across sessions
  └────┬───────┘
       │
       ▼
  Notification (Telegram) → "Done" or "I need your input"
```

Each dossier gets its own isolated Claude Code session with only the context it needs. Sessions can run in parallel without interfering with each other.

## Quick start

```bash
brew tap opentidy/opentidy
brew install opentidy
opentidy setup          # interactive wizard — Telegram, Claude auth, webhooks
opentidy start          # start the assistant
```

That's it. OpenTidy runs as a background service. Open the web dashboard to see your dossiers, or just let it work and wait for Telegram notifications.

```bash
opentidy status         # check if it's running
opentidy doctor         # verify everything is configured correctly
opentidy logs           # tail the logs
```

## Requirements

- **Node.js** >= 22
- **Claude Code** with an active Claude Max subscription
- **Telegram bot** (for notifications — setup wizard guides you through it)

## Documentation

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/getting-started.md) | Installation, setup, and your first dossier |
| [Configuration](docs/configuration.md) | All configuration options explained |
| [Architecture](docs/architecture.md) | How OpenTidy works under the hood |
| [Security](docs/security.md) | Security model, hooks, and audit system |
| [Specification](docs/specification.md) | Full product specification |
| [Contributing](docs/contributing.md) | Development setup, tests, and PR guidelines |

## Project status

OpenTidy is under active development. The core architecture is stable and working — dossier management, autonomous sessions, triage, hooks, and notifications are all functional. We're polishing rough edges and expanding capabilities based on real usage.

## Contributing

We welcome contributions! See our [Contributing Guide](docs/contributing.md) for development setup, coding conventions, and how to submit pull requests.

## License

Coming soon.
