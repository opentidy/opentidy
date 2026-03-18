#!/usr/bin/env bash
# setup.sh — Alfred installation script for Mac Mini
# Usage: curl -fsSL <url>/setup.sh | bash  (or just ./setup.sh)
set -euo pipefail

ALFRED_DIR="$HOME/Documents/alfred"
PLIST_NAME="com.lolo.assistant"
PLIST_SRC="$ALFRED_DIR/$PLIST_NAME.plist"
PLIST_DST="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"
LOG_DIR="$HOME/Library/Logs"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${BLUE}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
error() { echo -e "${RED}[error]${NC} $*"; }

confirm() {
  echo ""
  read -rp "$(echo -e "${YELLOW}$1 [y/N]${NC} ")" ans
  [[ "$ans" =~ ^[Yy]$ ]]
}

# ─────────────────────────────────────────────────────────
# Part 1: Automated installation
# ─────────────────────────────────────────────────────────

echo ""
echo "=========================================="
echo "  Alfred — Setup Mac Mini"
echo "=========================================="
echo ""

# 1. Homebrew
if command -v brew &>/dev/null; then
  ok "Homebrew already installed"
else
  info "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Add Homebrew to PATH for this session
  eval "$(/opt/homebrew/bin/brew shellenv)"
  ok "Homebrew installed"
fi

# 2. Node.js
if command -v node &>/dev/null; then
  ok "Node.js already installed ($(node -v))"
else
  info "Installing Node.js via Homebrew..."
  brew install node
  ok "Node.js installed ($(node -v))"
fi

# 3. pnpm
if command -v pnpm &>/dev/null; then
  ok "pnpm already installed ($(pnpm -v))"
else
  info "Installing pnpm via corepack..."
  corepack enable
  corepack prepare pnpm@latest --activate
  ok "pnpm installed ($(pnpm -v))"
fi

# 4. Claude CLI
if command -v claude &>/dev/null; then
  ok "Claude CLI already installed"
else
  info "Installing Claude CLI via npm..."
  npm install -g @anthropic-ai/claude-code
  ok "Claude CLI installed"
fi

# 5. Claude OAuth login
info "Checking Claude authentication..."
if claude auth status &>/dev/null 2>&1; then
  ok "Claude already authenticated"
else
  warn "Claude not authenticated — launching OAuth login..."
  claude auth login
  ok "Claude authenticated"
fi

# 6. Camoufox
if command -v camoufox &>/dev/null || [ -d "$HOME/.camoufox" ]; then
  ok "Camoufox already installed"
else
  info "Installing Camoufox..."
  pip3 install camoufox
  python3 -m camoufox fetch || "$HOME/Library/Python/3.9/bin/camoufox" fetch || warn "Run 'camoufox fetch' manually after adding to PATH"
  ok "Camoufox installed"
fi

# 7. tmux
if command -v tmux &>/dev/null; then
  ok "tmux already installed"
else
  info "Installing tmux..."
  brew install tmux
  ok "tmux installed"
fi

# 8. cloudflared
if command -v cloudflared &>/dev/null; then
  ok "cloudflared already installed"
else
  info "Installing cloudflared..."
  brew install cloudflare/cloudflare/cloudflared
  ok "cloudflared installed"
fi

# 9. Clone repo (if not already present)
if [ -d "$ALFRED_DIR" ]; then
  ok "Alfred repo already exists at $ALFRED_DIR"
else
  info "Cloning Alfred repo..."
  git clone git@github.com:ldenblyd/alfred.git "$ALFRED_DIR"
  ok "Repo cloned"
fi

# 10. Install dependencies and build
info "Installing dependencies and building..."
cd "$ALFRED_DIR"
pnpm install
pnpm build
ok "Dependencies installed and project built"

# 11. Create workspace directory
mkdir -p "$ALFRED_DIR/workspace"
ok "Workspace directory ready"

# 12. Create log directory
mkdir -p "$LOG_DIR"

# 13. Install LaunchAgent
if [ -f "$PLIST_SRC" ]; then
  info "Installing LaunchAgent..."
  cp "$PLIST_SRC" "$PLIST_DST"
  ok "LaunchAgent installed at $PLIST_DST"
  warn "Edit $PLIST_DST to set TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_USER_ID"
else
  error "LaunchAgent plist not found at $PLIST_SRC"
  error "Create it first, then run: cp $PLIST_SRC $PLIST_DST"
fi

# 14. Cloudflare tunnel (informational)
echo ""
info "Cloudflare tunnel setup:"
echo "  1. cloudflared tunnel login"
echo "  2. cloudflared tunnel create alfred"
echo "  3. Configure tunnel to route to localhost:3001"
echo "  4. cloudflared service install"
echo ""

echo ""
echo "=========================================="
echo "  Part 1 complete — automated setup done"
echo "=========================================="
echo ""

# ─────────────────────────────────────────────────────────
# Part 2: Guided macOS permissions
# ─────────────────────────────────────────────────────────

if ! confirm "Continue with macOS permissions setup?"; then
  info "Skipping permissions setup. Run this script again to configure later."
  exit 0
fi

echo ""
echo "=========================================="
echo "  Part 2: macOS Permissions"
echo "=========================================="
echo ""
# Detect which terminal app to grant permissions to
if [[ "$TERM_PROGRAM" == "iTerm.app" ]]; then
  TERM_APP="iTerm"
elif [[ "$TERM_PROGRAM" == "Apple_Terminal" ]]; then
  TERM_APP="Terminal"
else
  TERM_APP="${TERM_PROGRAM:-Terminal}"
fi

info "Grant all permissions to ${TERM_APP}.app"
info "Child processes (Claude, tmux, node) inherit ${TERM_APP} permissions."
echo ""

# Helper: open a System Settings panel and wait for user confirmation
grant_permission() {
  local name="$1"
  local panel="$2"

  echo ""
  info "Opening: $name"
  open "$panel"
  echo ""
  read -rp "$(echo -e "${YELLOW}  Add ${TERM_APP}.app to $name, then press Enter to continue...${NC} ")"
  ok "$name — done"
}

# ── 1. Full Disk Access (files, databases, Mail, Safari data, Time Machine) ──
grant_permission "Full Disk Access" \
  "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"

# ── 2. Accessibility (UI scripting, AppleScript, browser control) ──
grant_permission "Accessibility" \
  "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"

# ── 3. Automation (control other apps via AppleScript/osascript) ──
echo ""
info "Opening: Automation"
open "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation"
echo ""
echo "  Grant ${TERM_APP}.app access to ALL apps listed, especially:"
echo "    - Google Chrome       (browser control, /navigate, /browser)"
echo "    - Safari              (browser fallback)"
echo "    - Messages            (iMessage/SMS via /sms)"
echo "    - Contacts            (contact lookup)"
echo "    - Calendar            (event management)"
echo "    - Finder              (file operations, Finder scripting)"
echo "    - System Events       (UI automation, keyboard, clicks)"
echo "    - System Preferences  (settings automation)"
echo "    - Mail                (email access)"
echo "    - Notes               (notes access)"
echo "    - Reminders           (reminders access)"
echo "    - Terminal / iTerm    (self-automation)"
echo ""
echo "  Tip: if an app isn't listed yet, it will appear after first use."
echo "       Come back here after your first /navigate or /sms to enable it."
echo ""
read -rp "$(echo -e "${YELLOW}  Enable all Automation permissions for ${TERM_APP}, then press Enter...${NC} ")"
ok "Automation — done"

# ── 4. Screen Recording (screenshots, screen capture, Playwright) ──
grant_permission "Screen Recording" \
  "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"

# ── 5. Input Monitoring (keyboard events) ──
grant_permission "Input Monitoring" \
  "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent"

# ── 6. Developer Tools (debugging, process attachment) ──
grant_permission "Developer Tools" \
  "x-apple.systempreferences:com.apple.preference.security?Privacy_DevTools"

# ── 7. App Management (install, update, delete apps) ──
grant_permission "App Management" \
  "x-apple.systempreferences:com.apple.preference.security?Privacy_AppBundles"

# ── 8. Files & Folders (Desktop, Documents, Downloads access) ──
echo ""
info "Files & Folders"
echo "  This is auto-granted per-folder on first access."
echo "  To pre-authorize, run these in ${TERM_APP}:"
echo "    ls ~/Desktop ~/Documents ~/Downloads"
echo "  Click 'Allow' on each popup."
echo ""
read -rp "$(echo -e "${YELLOW}  Press Enter to continue...${NC} ")"
ok "Files & Folders — done"

# ── 9. Disable Gatekeeper (Mac dédié, pas besoin de vérification apps) ──
echo ""
info "Disabling Gatekeeper (dedicated machine — skip app verification)"
if sudo spctl --master-disable 2>/dev/null; then
  ok "Gatekeeper disabled"
else
  warn "Need sudo to disable Gatekeeper. Run manually: sudo spctl --master-disable"
fi

# ── 10. Trigger automation permissions for key apps ──
echo ""
info "Triggering first-use permissions for common apps..."
echo "  (Click 'Allow' on any popup that appears)"
echo ""

# Chrome — triggers Automation permission request
osascript -e 'tell application "Google Chrome" to get name of window 1' 2>/dev/null && ok "  Chrome: authorized" || warn "  Chrome: grant permission when prompted"

# Messages — triggers Automation permission request
osascript -e 'tell application "Messages" to get name' 2>/dev/null && ok "  Messages: authorized" || warn "  Messages: grant permission when prompted"

# System Events — triggers Automation permission request
osascript -e 'tell application "System Events" to get name' 2>/dev/null && ok "  System Events: authorized" || warn "  System Events: grant permission when prompted"

# Finder
osascript -e 'tell application "Finder" to get name' 2>/dev/null && ok "  Finder: authorized" || warn "  Finder: grant permission when prompted"

echo ""
ok "Permissions setup complete"

echo ""
echo "=========================================="
echo "  Setup complete!"
echo "=========================================="
echo ""
info "Next steps:"
echo "  1. Edit LaunchAgent plist with Telegram credentials"
echo "  2. Load the agent:  launchctl load $PLIST_DST"
echo "  3. Verify:          tail -f ~/Library/Logs/alfred-stdout.log"
echo ""
ok "Alfred is ready."
