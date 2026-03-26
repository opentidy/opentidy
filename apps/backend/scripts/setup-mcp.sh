#!/usr/bin/env bash
# apps/backend/scripts/setup-mcp.sh
# Configures MCP servers needed by Claude Code sessions

set -euo pipefail

echo "=== OpenTidy MCP Server Setup ==="
echo "This configures MCP servers that Claude sessions use for job work."
echo ""

# Email (himalaya)
echo "1. Email Module (himalaya)"
echo "   The email module uses himalaya CLI for reading, searching, and sending emails."
echo "   Install himalaya: brew install himalaya"
echo "   Configure: himalaya account configure"
echo ""

# Camoufox MCP, anti-detection browser
echo "2. Camoufox MCP Server"
echo "   Install: claude mcp add camoufox -- python -m camoufox.mcp"
echo "   Requires: pip install camoufox[mcp]"
echo ""

# Bitwarden
echo "3. Bitwarden is available via /bitwarden skill (no MCP needed)"
echo ""

# Google Calendar
echo "4. Google Calendar MCP"
echo "   Install: claude mcp add google-calendar -- npx @anthropic-ai/google-calendar-mcp"
echo ""

echo "After installing, verify with: claude mcp list"
echo "MCP servers in ~/.claude/settings.json or opentidy/.claude/settings.json"
echo "will be available to all job sessions (Claude Code traverses parent dirs)."
