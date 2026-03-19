// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import os from 'os';
import path from 'path';

export interface ServiceFileOptions {
  platform: string;
  nodePath: string;
  cliPath: string;
  logDir: string;
}

export interface ServiceFileResult {
  filename: string;
  content: string;
  installPath: string;
  instructions: string;
}

function generatePlist(opts: ServiceFileOptions): ServiceFileResult {
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.opentidy.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>${opts.nodePath}</string>
    <string>${opts.cliPath}</string>
    <string>start</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${opts.logDir}/opentidy-stdout.log</string>
  <key>StandardErrorPath</key>
  <string>${opts.logDir}/opentidy-stderr.log</string>
</dict>
</plist>`;

  const installPath = path.join(os.homedir(), 'Library/LaunchAgents/com.opentidy.agent.plist');
  return {
    filename: 'com.opentidy.agent.plist',
    content,
    installPath,
    instructions: `cp com.opentidy.agent.plist ${installPath}\nlaunchctl load ${installPath}`,
  };
}

function generateSystemd(opts: ServiceFileOptions): ServiceFileResult {
  const content = `[Unit]
Description=OpenTidy Personal AI Assistant
After=network.target

[Service]
Type=simple
ExecStart=${opts.nodePath} ${opts.cliPath} start
Restart=on-failure
RestartSec=10
StandardOutput=append:${opts.logDir}/opentidy-stdout.log
StandardError=append:${opts.logDir}/opentidy-stderr.log

[Install]
WantedBy=default.target`;

  const installPath = path.join(os.homedir(), '.config/systemd/user/opentidy.service');
  return {
    filename: 'opentidy.service',
    content,
    installPath,
    instructions: `cp opentidy.service ${installPath}\nsystemctl --user daemon-reload\nsystemctl --user enable --now opentidy`,
  };
}

function generateWindowsService(opts: ServiceFileOptions): ServiceFileResult {
  const content = `# OpenTidy Windows Service installer (requires admin)
$serviceName = "OpenTidy"
$nodePath = "${opts.nodePath}"
$cliPath = "${opts.cliPath}"

New-Service -Name $serviceName -BinaryPathName "$nodePath $cliPath start" -DisplayName "OpenTidy AI Assistant" -StartupType Automatic -Description "OpenTidy Personal AI Assistant"
Start-Service $serviceName`;

  return {
    filename: 'install-service.ps1',
    content,
    installPath: path.join(os.homedir(), 'install-service.ps1'),
    instructions: 'Run as Administrator: powershell -ExecutionPolicy Bypass -File install-service.ps1',
  };
}

export function generateServiceFile(opts: ServiceFileOptions): ServiceFileResult {
  switch (opts.platform) {
    case 'darwin': return generatePlist(opts);
    case 'linux': return generateSystemd(opts);
    case 'win32': return generateWindowsService(opts);
    default: throw new Error(`Unsupported platform: ${opts.platform}`);
  }
}