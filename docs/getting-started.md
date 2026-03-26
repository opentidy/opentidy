# Getting Started

This guide walks you through installing OpenTidy, running the setup wizard, and creating your first task.

## Prerequisites

- **Node.js** >= 22 (`node --version` to check)
- **Claude Code** CLI installed and working (`claude --version`)
- **Claude Max subscription** (OpenTidy uses Claude Code sessions, not the API)
- **Telegram** account (for notifications)

## Installation

```bash
curl -fsSL https://opentidy.com/install.sh | bash
```

This handles everything: Homebrew, Node.js 22, the `opentidy` formula, setup wizard, and background service. Safe to re-run.

To uninstall:

```bash
curl -fsSL https://opentidy.com/install.sh | bash -s -- --uninstall
# or
opentidy uninstall
```

## Setup

Run the interactive setup wizard:

```bash
opentidy setup
```

The wizard uses an arrow-key menu to configure each module. You can run individual modules or set up everything at once.

### Modules

#### 1. Telegram

OpenTidy sends you notifications via Telegram (task completed, checkpoint reached, errors).

You'll need:
- A Telegram bot (create one via [@BotFather](https://t.me/BotFather))
- A chat ID (the wizard auto-detects it after you send a message to your bot)

#### 2. API Authentication

A bearer token is auto-generated for securing the API. Save it; you'll need it for the web dashboard.

#### 3. Claude Code

OpenTidy runs Claude Code sessions in an isolated config directory (separate from your personal Claude Code config). The wizard:
- Copies the config template
- Opens a browser for OAuth authentication

#### 4. Cloudflare Tunnel (optional)

If you want to access OpenTidy remotely (e.g., from your phone), the wizard sets up a Cloudflare Tunnel. You'll need:
- A free Cloudflare account
- A domain added to Cloudflare
- `cloudflared` installed (`brew install cloudflared`)

#### 5. macOS Permissions (macOS only)

On macOS, OpenTidy can use AppleScript to interact with Messages, Mail, Calendar, and other native apps. The wizard triggers each permission prompt so you can authorize them.

### Re-running setup

The wizard is modular and rerunnable. Already-configured modules show a checkmark. You can re-run any individual module:

```bash
opentidy setup telegram    # just Telegram
opentidy setup cloudflare  # just Cloudflare
opentidy setup --all       # re-run everything
```

## Starting OpenTidy

The installer starts OpenTidy as a background service automatically. You can also manage it manually:

```bash
brew services start opentidy     # start background service
brew services stop opentidy      # stop background service
brew services restart opentidy   # restart background service
```

Or via the CLI:

```bash
opentidy start       # start
opentidy stop        # stop
opentidy restart     # restart
```

Logs are available at `$(brew --prefix)/var/log/opentidy.log` or via `opentidy logs`.

### Verify it's running

```bash
opentidy status    # service state, version, uptime
opentidy doctor    # verify deps, config, permissions, connectivity
```

## Your first task

Once OpenTidy is running, open the web dashboard (default: `http://localhost:5175`).

### Creating a task

1. Click **New Task** in the dashboard
2. Describe what you want done, e.g.: *"Check my inbox for unpaid invoices from the last 3 months and list them"*
3. Optionally enable **Confirm mode**, which makes Claude ask for approval before any external action (sending emails, submitting forms)
4. Submit

OpenTidy creates a workspace directory, generates an initial `state.md`, and launches an autonomous Claude Code session.

### What happens next

- Claude works autonomously in the background
- The dashboard shows live progress via real-time updates
- If Claude needs your input, it creates a **checkpoint**. You'll get a Telegram notification with a link to the dashboard
- When done, the task status changes to **completed**

### Taking over

If you want to interact directly with Claude on a task:

1. Open the task in the dashboard
2. Click **Take Over**. This switches from autonomous mode to an interactive terminal
3. Talk to Claude directly in the embedded terminal
4. When done, click **Hand Back**. Claude resumes autonomous work

## CLI commands

| Command | Description |
|---------|-------------|
| `opentidy start` | Start the backend server |
| `opentidy setup` | Interactive setup wizard |
| `opentidy doctor` | Verify dependencies, config, and connectivity |
| `opentidy status` | Service state, version, uptime |
| `opentidy logs` | Tail log files |
| `opentidy update` | Check and apply updates |
| `opentidy uninstall` | Remove service, config, and data |

## Next steps

- [Configuration](configuration.md): all configuration options explained
- [Architecture](architecture.md): how OpenTidy works under the hood
- [Security](security.md): security model and hooks system
