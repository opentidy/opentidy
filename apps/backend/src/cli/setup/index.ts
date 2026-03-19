// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

export { setupUserInfo } from './user-info.js';
export { setupTelegram } from './telegram.js';
export { setupAuth } from './auth.js';
export { setupGmail } from './gmail.js';
export { setupCamoufox } from './camoufox.js';
export { setupWhatsApp } from './whatsapp.js';
export { setupClaude, generateClaudeSettings, generateClaudeMd } from './claude.js';
export { setupTunnel } from './tunnel.js';
export { setupPermissions } from './permissions.js';
export { setupGitHub } from './github.js';
export { getModuleStatuses } from './status.js';
export type { ModuleStatus } from './status.js';
export { ask, closeRl } from './utils.js';
