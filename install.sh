#!/bin/bash
# Alfred installer
# Usage: curl -fsSL https://raw.githubusercontent.com/ldenblyd/alfred/main/install.sh | bash
#
# Idempotent: safe to re-run at any time.
set -euo pipefail

REPO="https://github.com/ldenblyd/alfred.git"
INSTALL_DIR="${ALFRED_INSTALL_DIR:-$HOME/Documents/alfred}"
REQUIRED_NODE_MAJOR=22

echo ""
echo "  ╔═══════════════════════════╗"
echo "  ║     Alfred Installer      ║"
echo "  ╚═══════════════════════════╝"
echo ""

# --- Ensure PATH includes common locations for this session ---
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:$PATH"

# --- Homebrew ---
if ! command -v brew &>/dev/null; then
  echo "  [1/8] Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Detect Homebrew prefix (Apple Silicon vs Intel)
  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
else
  echo "  [1/8] Homebrew — already installed"
fi

# --- Node.js LTS ---
echo "  [2/8] Installing Node.js LTS ($REQUIRED_NODE_MAJOR)..."

# Install node@22 if not present
if ! brew list "node@$REQUIRED_NODE_MAJOR" &>/dev/null; then
  brew install "node@$REQUIRED_NODE_MAJOR"
fi

# ALWAYS put node@22 first in PATH — overrides any system node
NODE_BIN="$(brew --prefix node@$REQUIRED_NODE_MAJOR)/bin"
export PATH="$NODE_BIN:$PATH"

# Persist in shell profile (idempotent — only adds if not already present)
ZSHRC="${ZDOTDIR:-$HOME}/.zshrc"
if [ -f "$ZSHRC" ] && grep -q "node@$REQUIRED_NODE_MAJOR" "$ZSHRC" 2>/dev/null; then
  echo "         node@$REQUIRED_NODE_MAJOR already in $ZSHRC"
elif [ -f "$ZSHRC" ]; then
  echo "export PATH=\"$NODE_BIN:\$PATH\"" >> "$ZSHRC"
  echo "         Added node@$REQUIRED_NODE_MAJOR to PATH in $ZSHRC"
else
  echo "export PATH=\"$NODE_BIN:\$PATH\"" >> "$ZSHRC"
  echo "         Created $ZSHRC with node@$REQUIRED_NODE_MAJOR PATH"
fi

# Verify correct version
NODE_VERSION="$(node --version)"
NODE_MAJOR="${NODE_VERSION%%.*}"
NODE_MAJOR="${NODE_MAJOR#v}"
if [ "$NODE_MAJOR" != "$REQUIRED_NODE_MAJOR" ]; then
  echo "  !!  Expected Node $REQUIRED_NODE_MAJOR but got $NODE_VERSION"
  echo "      $(which node)"
  echo "      Try: hash -r && node --version"
  exit 1
fi
echo "         Node: $NODE_VERSION ($(which node))"

# --- System dependencies ---
echo "  [3/8] Installing system dependencies..."
DEPS=(pnpm tmux ttyd python@3 cloudflared)
for dep in "${DEPS[@]}"; do
  if brew list "$dep" &>/dev/null; then
    echo "         $dep — already installed"
  else
    echo "         Installing $dep..."
    brew install "$dep"
  fi
done

# --- Claude Code CLI ---
echo "  [4/8] Installing Claude Code CLI..."
if command -v claude &>/dev/null; then
  echo "         Claude Code — already installed ($(claude --version 2>/dev/null | head -1))"
else
  curl -fsSL https://claude.ai/install.sh | bash
  export PATH="$HOME/.local/bin:$PATH"
  if ! grep -q '.local/bin' "$ZSHRC" 2>/dev/null; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$ZSHRC"
    echo "         Added ~/.local/bin to PATH in $ZSHRC"
  fi
fi

if ! command -v claude &>/dev/null; then
  echo "  !!  Claude Code not found after install. Check your PATH."
  exit 1
fi

# --- Camoufox (Python browser via pipx) ---
echo "  [5/8] Installing Camoufox..."
if ! command -v pipx &>/dev/null; then
  brew install pipx
  pipx ensurepath 2>/dev/null || true
  export PATH="$HOME/.local/bin:$PATH"
fi
if pipx list 2>/dev/null | grep -q camoufox; then
  echo "         Camoufox — already installed"
else
  pipx install camoufox 2>/dev/null || echo "         Camoufox install skipped (optional)"
  python3 -m camoufox fetch 2>/dev/null || true
fi

# --- Clone / update repo ---
echo "  [6/8] Setting up Alfred..."
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "         Repo exists, pulling latest..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  echo "         Cloning repo..."
  git clone "$REPO" "$INSTALL_DIR"
fi

# --- Build ---
echo "  [7/8] Building Alfred..."
cd "$INSTALL_DIR"

# Ensure native build scripts are approved (pnpm 10+ blocks them by default).
# The root package.json has pnpm.onlyBuiltDependencies but .npmrc is needed
# for some pnpm versions that read it from .npmrc instead.
if ! grep -q 'better-sqlite3' .npmrc 2>/dev/null; then
  echo "onlyBuiltDependencies=better-sqlite3,esbuild" >> .npmrc
  echo "         Approved native build scripts in .npmrc"
fi

# Install deps
pnpm install
pnpm build

# Verify native addons work (must cd into backend for pnpm monorepo node_modules resolution)
if ! (cd apps/backend && node -e "require('better-sqlite3')") 2>/dev/null; then
  echo "         Native addon not found — rebuilding..."
  pnpm rebuild better-sqlite3
  if ! (cd apps/backend && node -e "require('better-sqlite3')") 2>/dev/null; then
    echo "  !!  better-sqlite3 failed to build."
    echo "      Try: pnpm install --force"
    exit 1
  fi
fi
echo "         Native addons OK"

# --- Install LaunchAgent from template ---
echo "  [8/8] Installing LaunchAgent..."
PLIST_SRC="$INSTALL_DIR/com.lolo.assistant.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.lolo.assistant.plist"

# Unload existing agent if loaded (ignore errors — may not be loaded)
launchctl unload "$PLIST_DST" 2>/dev/null || true

# Expand template placeholders
sed -e "s|__INSTALL_DIR__|$INSTALL_DIR|g" \
    -e "s|__HOME__|$HOME|g" \
    "$PLIST_SRC" > "$PLIST_DST"
echo "         LaunchAgent installed at $PLIST_DST"

# --- Setup wizard ---
echo ""
./bin/alfred setup

echo ""
echo "  Installation complete!"
echo ""
echo "  Start Alfred:"
echo "    cd $INSTALL_DIR && ./bin/alfred start"
echo ""
echo "  Or use the LaunchAgent:"
echo "    launchctl load ~/Library/LaunchAgents/com.lolo.assistant.plist"
echo ""
echo "  Commands:"
echo "    ./bin/alfred status    — check if running"
echo "    ./bin/alfred doctor    — verify everything"
echo "    ./bin/alfred logs      — tail logs"
echo ""
