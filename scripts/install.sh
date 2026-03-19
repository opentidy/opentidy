#!/bin/bash
# OpenTidy installer for macOS and Linux
set -e

echo "Installing OpenTidy..."

# Check for Node.js >= 22
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR=$(node --version | sed 's/^v\([0-9]*\).*/\1/')
  if [ "$NODE_MAJOR" -lt 22 ]; then
    echo "Error: Node.js >= 22 required (found v$(node --version))"
    echo "Install from: https://nodejs.org/"
    exit 1
  fi
else
  echo "Error: Node.js not found. Install from: https://nodejs.org/"
  exit 1
fi

# Install via npm
npm install -g opentidy

echo ""
echo "OpenTidy installed! Run:"
echo "  opentidy setup"
