# Alfred Deployment & Distribution Design

## Context

Alfred is an autonomous personal AI assistant running on a dedicated Mac Mini (24/7). It needs native macOS access (osascript, Messages.app, Mail.app, Screen Sharing, Accessibility) which rules out Docker. The owner will be abroad with no physical access — everything must be remotely manageable and self-updating. The project will be open source.

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                       Mac Mini                           │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Alfred (Hono backend + static SPA)                  │ │
│  │   - API :5175                                       │ │
│  │   - Claude Code sessions (child processes)          │ │
│  │   - Receiver (webhooks, SMS/Mail watchers)          │ │
│  │   - Hooks handler (PreToolUse security)             │ │
│  │   - Auto-updater (checks GitHub Releases)           │ │
│  │   - SQLite (workspace/_data/opentidy.db)              │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ tmux     │  │ ttyd     │  │ Camoufox │  │ Claude  │ │
│  │          │  │          │  │          │  │ Code CLI│ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
│                                                          │
│  ┌──────────────────────┐                               │
│  │ cloudflared          │                               │
│  │ (separate launchd    │                               │
│  │  service, not managed│                               │
│  │  by Alfred)          │                               │
│  └──────────────────────┘                               │
│                                                          │
│  Process management: launchd (via brew services)         │
└──────────────────────────────────────────────────────────┘
         │
         │ Cloudflare Tunnel
         │ (opentidy.yourdomain.com)
         │ Zero Trust auth
         ▼
    Any browser
    (app web + API)
```

## Single Machine

Everything runs on one Mac Mini — backend API, static frontend (Vite build served by Hono), Claude Code sessions, and all system integrations. No separate web server needed. The frontend build is bundled into the Homebrew package and served as static files.

## Distribution: Homebrew Tap

### Why Homebrew

- Standard macOS package manager (92% of Mac developers use it)
- Handles dependency resolution, native addon compilation, versioning
- Built-in LaunchAgent management via `brew services`
- Clean uninstall that respects pre-existing packages
- No Apple Developer Program needed (no code signing/notarization)
- Familiar to open source contributors

### Formula

Repository: `github.com/lolo/homebrew-alfred`

The release tarball is **pre-built** by CI (compiled TypeScript, vendored `node_modules`, built frontend). The formula installs pre-built artifacts — no compilation happens on the user's machine. This avoids Homebrew's sandbox network restrictions.

```ruby
class Alfred < Formula
  desc "Autonomous personal AI assistant powered by Claude Code"
  homepage "https://github.com/lolo/alfred"
  url "https://github.com/lolo/alfred/releases/download/v1.0.0/alfred-1.0.0.tar.gz"
  sha256 "abc123..."

  depends_on "node"
  depends_on "tmux"
  depends_on "ttyd"
  depends_on "python@3"  # for Camoufox

  def install
    # Tarball is pre-built by CI via `pnpm deploy`:
    # flat node_modules (no symlinks), compiled dist/, built web app
    libexec.install Dir["*"]
    bin.install_symlink libexec/"bin/tidy"
  end

  def postinstall
    # Camoufox (Python, anti-detection browser)
    system Formula["python@3"].opt_bin/"python3", "-m", "pip", "install", "--user", "camoufox"
    system Formula["python@3"].opt_bin/"python3", "-m", "camoufox", "fetch"
  end

  service do
    run [opt_bin/"alfred", "start"]
    keep_alive true
    working_dir var/"alfred"
    log_path var/"log/alfred.log"
    error_log_path var/"log/alfred-error.log"
    environment_variables ALFRED_HOME: var/"alfred",
                          PORT: "5175",
                          NODE_ENV: "production"
  end
end
```

### CLI Entrypoint

`bin/tidy` is a shell wrapper created during CI packaging:

```bash
#!/bin/sh
LIBEXEC="$(cd "$(dirname "$0")/../libexec" && pwd)"
exec node "$LIBEXEC/dist/index.js" "$@"
```

This dispatches to subcommands: `alfred start`, `alfred setup`, `alfred status`, `alfred doctor`, `alfred update`, `alfred logs`. The `--version` flag reads from the `VERSION` file in libexec. Subcommand routing is handled in `dist/index.js` via a minimal CLI parser (process.argv).

### Install Flow

```bash
# Step 1 — Install
brew tap lolo/alfred
brew install alfred

# Step 2 — Interactive setup (one-time)
alfred setup
# → Telegram bot token
# → Claude Code OAuth flow
# → Cloudflare Tunnel token
# → Creates workspace/, configures everything

# Step 3 — Start
brew services start alfred
```

### CLI Commands

```bash
alfred setup          # Initial config (Telegram, Claude, Cloudflare)
alfred start          # Start the backend (used by brew services)
alfred status         # Service state, version, uptime
alfred update         # Force an update now
alfred logs           # Tail logs
alfred doctor         # Verify deps, permissions, services, connectivity
brew services stop alfred     # Stop
brew services start alfred    # Start
brew services restart alfred  # Restart
brew uninstall alfred         # Clean uninstall
```

## CI/CD: GitHub Actions

### Release Pipeline

Triggered on push of a version tag (`v*`):

1. **Test** — `pnpm test` (backend vitest) + `pnpm test:e2e` (Playwright)
2. **Build** — `pnpm build` (TypeScript compile + Vite build for frontend)
3. **Package** — `pnpm install --prod` on macOS runner, then create tarball
4. **Release** — Publish to GitHub Releases with the tarball
5. **Update tap** — Auto-update the Homebrew formula in `lolo/homebrew-alfred` with new URL + SHA256

### Tarball Contents

The tarball is built on **macOS** (not Linux) to ensure native addons (better-sqlite3) are compiled for the right platform. Uses `pnpm deploy` to create a **flat `node_modules`** (no symlinks) suitable for distribution.

```
alfred-{version}/
├── dist/                    # Compiled backend (apps/backend/dist/)
├── web-dist/                # Built frontend (apps/web/dist/)
├── node_modules/            # Flat vendored deps (via pnpm deploy, no symlinks)
├── shared/                  # Compiled @opentidy/shared (packages/shared/dist/)
├── plugins/opentidy-hooks/    # Hooks plugin directory
├── config/claude/           # Claude Code config template (settings.json, CLAUDE.md)
├── bin/tidy               # Shell wrapper CLI entrypoint
├── opentidy-updater.sh        # Detached updater script
├── package.json
└── VERSION                  # Current version string for alfred --version
```

### Packaging Strategy (pnpm deploy)

pnpm workspaces use symlinks in `node_modules/` which break when tarred. The CI uses `pnpm deploy` to produce a standalone flat directory:

```bash
# In CI, after pnpm install && pnpm build:
pnpm --filter @opentidy/backend deploy ./release --prod
# This creates ./release/ with flat node_modules, no symlinks

# Then assemble the tarball:
cp -r apps/web/dist/ ./release/web-dist/
cp -r packages/shared/dist/ ./release/shared/
cp -r plugins/opentidy-hooks/ ./release/plugins/opentidy-hooks/
cp bin/tidy ./release/bin/tidy
cp opentidy-updater.sh ./release/
echo "${VERSION}" > ./release/VERSION
```

### GitHub Actions Workflow

```yaml
name: Release
on:
  push:
    tags: ['v*']
tasks:
  test:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install
      - run: pnpm test
      - run: pnpm build

  release:
    needs: test
    runs-on: macos-latest  # macOS for native addon compatibility (better-sqlite3)
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install
      - run: pnpm build
      - name: Package with pnpm deploy
        run: |
          VERSION=${GITHUB_REF_NAME#v}
          pnpm --filter @opentidy/backend deploy ./release --prod
          cp -r apps/web/dist/ ./release/web-dist/
          cp -r packages/shared/dist/ ./release/shared/
          cp -r plugins/opentidy-hooks/ ./release/plugins/opentidy-hooks/
          cp -r apps/backend/config/claude/ ./release/config/claude/
          mkdir -p ./release/bin && cp bin/tidy ./release/bin/tidy
          cp opentidy-updater.sh ./release/
          echo "$VERSION" > ./release/VERSION
          mv ./release alfred-$VERSION
          tar -czf alfred-$VERSION.tar.gz alfred-$VERSION/
      - uses: softprops/action-gh-release@v2
        with:
          files: alfred-*.tar.gz

  update-tap:
    needs: release
    runs-on: ubuntu-latest
    steps:
      - uses: dawidd6/action-homebrew-bump-formula@v4
        with:
          token: ${{ secrets.HOMEBREW_TAP_TOKEN }}
          tap: lolo/alfred
          formula: alfred
```

## Auto-Update System

### Architecture: Detached Updater Script

The auto-updater **cannot run inside the Alfred process** — `brew upgrade` replaces the binary and `brew services restart` kills the running process. Instead, Alfred spawns a **detached shell script** that outlives the parent process.

### Update Checker (inside Alfred backend)

- **Check interval**: Every 6 hours
- **Source**: GitHub Releases API (`GET /repos/lolo/alfred/releases/latest`)
- **Flow**:
  1. Compare current version with latest release tag
  2. If newer version available → notify via Telegram: "Alfred v1.4.0 disponible. Mise a jour auto dans 5min."
  3. Wait 5 minutes (allows the user to cancel via Telegram if needed)
  4. Spawn detached updater script and exit gracefully

### Detached Updater Script (`opentidy-updater.sh`)

Spawned as a background process (`nohup ... &`), runs independently of Alfred:

```bash
#!/bin/bash
# Arguments passed by Alfred when spawning: BOT_TOKEN, CHAT_ID, NEW_VERSION, PREV_VERSION
# PREV_VERSION is read from VERSION file before spawning

CACHE_DIR="$HOME/.cache/alfred/releases"

# Cache current formula + tarball for rollback before upgrading
cp "$(brew formula alfred)" "$CACHE_DIR/alfred-$PREV_VERSION.rb" 2>/dev/null

# Upgrade
brew upgrade alfred
brew services restart alfred

# Health check (retry 3 times, 10s apart)
for i in 1 2 3; do
  sleep 10
  if curl -sf http://localhost:5175/health > /dev/null; then
    # Notify success via Telegram API directly (not through Alfred)
    curl -s "https://api.telegram.org/bot$BOT_TOKEN/sendMessage" \
      -d "chat_id=$CHAT_ID&text=Alfred $NEW_VERSION en ligne"
    # Prune old releases (keep last 3)
    ls -t "$CACHE_DIR"/alfred-*.rb 2>/dev/null | tail -n +4 | xargs rm -f
    exit 0
  fi
done

# Rollback: reinstall from cached previous formula
if [ -f "$CACHE_DIR/alfred-$PREV_VERSION.rb" ]; then
  brew uninstall alfred
  brew install --formula "$CACHE_DIR/alfred-$PREV_VERSION.rb"
  brew services restart alfred
fi

# Notify failure
curl -s "https://api.telegram.org/bot$BOT_TOKEN/sendMessage" \
  -d "chat_id=$CHAT_ID&text=⚠ Update $NEW_VERSION echoue, rollback $PREV_VERSION"
```

### Rollback Strategy

Homebrew does not natively support `brew install alfred@{version}`. The rollback strategy uses **local release caching**:

- Alfred keeps the last 3 release tarballs in `~/.cache/alfred/releases/`
- On failed update, the updater script reinstalls from the cached previous tarball: `brew reinstall --formula ~/.cache/alfred/releases/alfred-{prev}.rb`
- The cache stores both the tarball and a copy of the formula with the correct URL/SHA pointing to the local file

### Configuration

```json
{
  "update": {
    "autoUpdate": true,
    "checkInterval": "6h",
    "channel": "stable",
    "notifyBeforeUpdate": true,
    "delayBeforeUpdate": "5m",
    "keepReleases": 3
  }
}
```

Users can disable auto-update (`autoUpdate: false`) and update manually with `alfred update`.

## Remote Access

### Cloudflare Tunnel

Exposes Alfred's API + web UI on a domain (e.g. `opentidy.yourdomain.com`):

- **Cloudflare Access (Zero Trust)** as first auth layer — only authenticated users reach the Mac Mini
- **Bearer token** as second auth layer in Hono middleware — for open source users without Cloudflare
- Handles: app web, API calls, SSE streams, GitHub webhook for instant deploys
- cloudflared runs as its own launchd service, not managed by Alfred

## Security

### Three layers

1. **Network** — Cloudflare Access (Zero Trust): nothing reaches the Mac Mini without authentication.

2. **Application** — Bearer token verified by Hono middleware on every API request. GitHub webhook verified via HMAC SHA-256 signature.

3. **Claude execution** — Hooks PreToolUse (type: "prompt") verify every sensitive action before execution. Claude cannot bypass or disable these hooks. Matchers: email send/reply, browser clicks/forms, curl POST, ssh, scp.

### Secrets Management

Secrets are configured during `alfred setup` and stored in:
- `~/.config/opentidy/config.json` (Telegram tokens, bearer token, update preferences)
- Cloudflare Tunnel credentials managed by `cloudflared` itself
- Claude Code auth via OAuth (no API keys)

Never committed to git. The `alfred doctor` command verifies secrets are properly configured.

**Migration note**: The current `com.opentidy.agent.plist` contains hardcoded Telegram tokens. This must be migrated to `~/.config/opentidy/config.json` and the plist updated to reference config via environment variables loaded by Alfred at startup. The exposed token in the committed plist should be rotated.

### Dependencies Not in Homebrew

- **Claude Code CLI** — installed during `alfred setup` via the official installer (`curl -fsSL https://claude.ai/install.sh | bash`). Verified by `alfred doctor`.
- **Cloudflare Tunnel (cloudflared)** — separate Homebrew formula (`brew install cloudflared`). Runs as its own launchd service, not managed by Alfred. Listed as a setup step, not a formula dependency (optional for users not using Cloudflare).

## Claude Code Configuration

### Isolation via `CLAUDE_CONFIG_DIR`

Alfred must NOT touch the user's personal `~/.claude/` config. All Claude Code sessions spawned by Alfred use an isolated config directory:

```bash
CLAUDE_CONFIG_DIR=~/.config/opentidy/claude-config claude -p ...
```

This gives Alfred its own settings, permissions, MCP servers, and CLAUDE.md — completely separate from the user's personal Claude Code setup.

### Config Directory Structure

```
~/.config/opentidy/claude-config/       # CLAUDE_CONFIG_DIR for Alfred sessions
├── settings.json                     # Permissions, MCP servers, allowed tools
├── settings.local.json               # User overrides (never overwritten by updates)
└── CLAUDE.md                         # Global prompt: Alfred's identity, rules, style
```

### Versioned Template in Repo

The default config ships with Alfred and evolves with the codebase:

```
apps/backend/config/claude/
├── settings.json                     # Template: default permissions, MCP servers
└── CLAUDE.md                         # Template: Alfred identity prompt
```

This template is the SSOT for what Claude Code sessions should look like. When a new MCP server is added, a permission is tweaked, or the system prompt evolves — it's a code change in the repo, versioned and reviewable.

### Config Lifecycle

**Initial setup (`alfred setup`):**
1. Copies template from `config/claude/` to `~/.config/opentidy/claude-config/`
2. Runs Claude Code OAuth flow (`claude auth login` with `CLAUDE_CONFIG_DIR` set) — interactive, one-time
3. Creates empty `settings.local.json` for user overrides

**On update (brew upgrade):**
1. Backend compares installed template version with current `settings.json`
2. If template has new entries (new MCP server, new permission) → merges them into the live `settings.json`
3. `settings.local.json` is **never touched** — user overrides always win
4. `CLAUDE.md` is replaced entirely from template (it's versioned, not user-edited)

**On each session spawn:**
1. Backend sets `CLAUDE_CONFIG_DIR=~/.config/opentidy/claude-config/` in the child process env
2. Claude Code loads settings + CLAUDE.md from this directory
3. Per-dossier `CLAUDE.md` (level 2) is generated in `workspace/<dossier-id>/CLAUDE.md` as before

**Verification (`alfred doctor`):**
- Checks `CLAUDE_CONFIG_DIR` exists and contains `settings.json`
- Validates Claude Code is authenticated (OAuth token present)
- Compares installed settings with template, warns if out of sync
- Verifies MCP servers declared in settings are reachable

### What Goes in `settings.json`

```json
{
  "permissions": {
    "allow": [
      "Read", "Write", "Edit", "Glob", "Grep",
      "Bash(npm:*)", "Bash(pnpm:*)", "Bash(git:*)",
      "Bash(osascript:*)", "Bash(open:*)",
      "mcp__camofox__*", "mcp__gmail__*"
    ],
    "deny": []
  },
  "mcpServers": {
    "camofox": { "command": "...", "args": [...] },
    "gmail": { "command": "...", "args": [...] }
  },
  "env": {
    "ALFRED_HOME": "/opt/homebrew/var/alfred"
  }
}
```

### User Customization

Users can override anything via `settings.local.json` without risk of it being overwritten:

```json
{
  "permissions": {
    "allow": ["mcp__slack__*"],
    "deny": ["Bash(rm:*)"]
  },
  "mcpServers": {
    "slack": { "command": "...", "args": [...] }
  }
}
```

Project-level overrides merge on top: `template settings.json` → `settings.local.json` → per-dossier context.

### Static File Serving

The backend must serve the built frontend as static files. This requires adding Hono `serveStatic` middleware pointing to the `web-dist/` directory. In dev mode, the Vite dev server continues to run separately with the existing proxy setup.

### Log Rotation

On a 24/7 machine, logs grow indefinitely. Alfred uses macOS `newsyslog` for rotation:

```
# /etc/newsyslog.d/alfred.conf (created by alfred setup)
/opt/homebrew/var/log/alfred.log     644  5  1024  *  J
/opt/homebrew/var/log/alfred-error.log  644  5  1024  *  J
```

Keeps 5 rotated files, rotates at 1MB, compresses old logs.

## Process Management

### launchd via Homebrew

`brew services start alfred` creates a LaunchAgent (`~/Library/LaunchAgents/homebrew.mxcl.alfred.plist`) that:

- Starts Alfred on boot
- Restarts on crash (`keep_alive: true`)
- Redirects stdout/stderr to log files
- Runs as the user (not root)

No PM2 needed — launchd is the native macOS process manager and is more reliable for a macOS daemon.

### Health & Recovery

- **Crash**: launchd restarts automatically (keep_alive)
- **Reboot**: launchd starts automatically (LaunchAgent)
- **Stuck process**: `alfred doctor` detects and reports; manual `brew services restart alfred`
- **Failed update**: auto-rollback to previous version + Telegram notification
- **Network loss**: Cloudflare Tunnel reconnects automatically

## Setup Script (optional convenience)

For users who want a one-liner:

```bash
curl -fsSL https://raw.githubusercontent.com/lolo/alfred/main/install.sh | bash
```

This script:
1. Checks/installs Homebrew if missing
2. Runs `brew tap lolo/alfred && brew install alfred`
3. Runs `alfred setup` (interactive)
4. Runs `brew services start alfred`

The script is optional — users can run the brew commands manually.

## Open Source Considerations

- **No vendor lock-in**: Cloudflare Access is optional (bearer token works standalone)
- **No Apple Developer Program**: no code signing or notarization needed
- **Standard tools**: Homebrew, launchd, Node.js — nothing exotic
- **Configurable**: all provider settings (Telegram, Claude, tunnel) are pluggable
- **Documentation**: `alfred doctor` validates the entire setup and provides actionable error messages
- **macOS permissions**: `alfred setup` guides user through required macOS permissions (Accessibility, Full Disk Access, Automation) with direct links to System Preferences panes

## Alternatives Considered

| Approach | Why not |
|---|---|
| Docker | Cannot access native macOS APIs (osascript, Messages.app, etc.) |
| Bun binary | better-sqlite3 native addon incompatible; system deps still need separate management |
| npm global | Claude Code abandoned this — fragile updates, permission issues, cache bugs |
| .pkg installer | Requires Apple Developer Program ($99/yr) for decent UX |
| Ansible | Overkill for single machine; adds a dependency most users don't have |
| Go/Rust wrapper | Two codebases, two languages — unjustified complexity |
