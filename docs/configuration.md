# Configuration

OpenTidy stores its configuration in `~/.config/opentidy/config.json`. This file is created automatically by `opentidy setup` but can be edited manually.

Override the config path with the `OPENTIDY_CONFIG_PATH` environment variable.

## Config file structure

```json
{
  "version": 1,
  "telegram": {
    "botToken": "123456:AABB...",
    "chatId": "987654321",
    "userId": ""
  },
  "auth": {
    "bearerToken": "your-64-char-hex-token"
  },
  "server": {
    "port": 5175,
    "appBaseUrl": "http://localhost:5175"
  },
  "workspace": {
    "dir": "",
    "lockDir": "/tmp/opentidy-locks"
  },
  "update": {
    "autoUpdate": true,
    "checkInterval": "6h",
    "notifyBeforeUpdate": true,
    "delayBeforeUpdate": "5m",
    "keepReleases": 3
  },
  "claudeConfig": {
    "dir": ""
  }
}
```

## Sections

### Telegram

| Key | Type | Description |
|-----|------|-------------|
| `botToken` | string | Telegram bot token from @BotFather |
| `chatId` | string | Chat ID where notifications are sent |
| `userId` | string | (Optional) Your Telegram user ID for filtering |

OpenTidy uses Telegram for push notifications: checkpoint alerts, task completions, error reports. Each notification includes a link to the web dashboard.

**Setting up a bot:**
1. Open Telegram, search for @BotFather
2. Send `/newbot`, follow the prompts
3. Copy the bot token
4. Send any message to your bot, then run `opentidy setup telegram` to auto-detect the chat ID

### Authentication

| Key | Type | Description |
|-----|------|-------------|
| `bearerToken` | string | Bearer token for API authentication |

All API requests must include `Authorization: Bearer <token>`. The token is auto-generated during setup. The web dashboard uses this token to communicate with the backend.

### Server

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `port` | number | `5175` | HTTP server port |
| `appBaseUrl` | string | `http://localhost:5175` | Base URL for links in notifications |

If you're using a Cloudflare Tunnel, set `appBaseUrl` to your public URL (e.g., `https://opentidy.yourdomain.com`) so that Telegram notification links work correctly.

### Workspace

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `dir` | string | `./workspace` | Path to the workspace directory |
| `lockDir` | string | `/tmp/opentidy-locks` | Directory for PID lock files |

The workspace directory contains all tasks, suggestions, gaps, and audit logs. It's created automatically on first run.

### Update

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `autoUpdate` | boolean | `true` | Automatically install updates |
| `checkInterval` | string | `"6h"` | How often to check for updates |
| `notifyBeforeUpdate` | boolean | `true` | Send a Telegram notification before updating |
| `delayBeforeUpdate` | string | `"5m"` | Wait time between notification and update |
| `keepReleases` | number | `3` | Number of previous releases to keep for rollback |

Updates are checked against GitHub Releases. When an update is available, `opentidy update` runs `brew upgrade opentidy` with health checks and automatic rollback on failure.

### Claude Code config

| Key | Type | Description |
|-----|------|-------------|
| `dir` | string | Path to the isolated Claude Code config directory |

OpenTidy uses a separate Claude Code configuration (`CLAUDE_CONFIG_DIR`) so that its sessions don't interfere with your personal Claude Code setup. This directory contains `settings.json`, `CLAUDE.md`, and auth credentials.

The config template is at `apps/backend/config/claude/` in the source tree.

## Environment variables

| Variable | Description |
|----------|-------------|
| `OPENTIDY_CONFIG_PATH` | Override config file location |
| `PORT` | Override server port (takes precedence over config) |
| `SWEEP_INTERVAL_MS` | Cron sweep interval in milliseconds (default: 3600000 = 1h) |

## Cloudflare Tunnel

Cloudflare Tunnel provides secure remote access without opening ports. Configuration is managed by `cloudflared` itself at `~/.cloudflared/config.yml`.

```yaml
tunnel: opentidy
credentials-file: ~/.cloudflared/opentidy.json

ingress:
  - hostname: opentidy.yourdomain.com
    service: http://localhost:5175
  - service: http_status:404
```

Run `opentidy setup cloudflare` for guided setup, or configure manually:

```bash
cloudflared tunnel login
cloudflared tunnel create opentidy
cloudflared tunnel route dns opentidy opentidy.yourdomain.com
cloudflared service install
```

## Workspace structure

The workspace directory is OpenTidy's runtime data store:

```
workspace/
├── CLAUDE.md               # Global prompt for all sessions (level 1)
├── <task-id>/
│   ├── CLAUDE.md            # Per-task prompt (level 2, auto-generated)
│   ├── state.md             # Task state, progress, next steps
│   ├── checkpoint.md        # Human input needed (when applicable)
│   ├── .session-id          # Claude Code session ID for resume
│   └── artifacts/           # Files produced by Claude (PDFs, etc.)
├── _suggestions/            # Tasks suggested by Claude, awaiting approval
├── _gaps/
│   └── gaps.md              # Limitations detected by Claude
├── _audit/
│   └── actions.log          # All external actions logged
└── _memory/                 # Cross-session memory
```

## Next steps

- [Getting Started](getting-started.md): installation and first task
- [Architecture](architecture.md): how the components work together
- [Security](security.md): hooks and audit system
