# OpenTidy installer for Windows
$ErrorActionPreference = "Stop"

Write-Host "Installing OpenTidy..." -ForegroundColor Cyan

# Check for Node.js >= 22
try {
    $nodeVersion = (node --version) -replace '^v', ''
    $major = [int]($nodeVersion -split '\.')[0]
    if ($major -lt 22) {
        Write-Host "Error: Node.js >= 22 required (found v$nodeVersion)" -ForegroundColor Red
        Write-Host "Install from: https://nodejs.org/"
        exit 1
    }
} catch {
    Write-Host "Error: Node.js not found. Install from: https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Install via npm
npm install -g opentidy

Write-Host ""
Write-Host "OpenTidy installed! Run:" -ForegroundColor Green
Write-Host "  opentidy setup"
