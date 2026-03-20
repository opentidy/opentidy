// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

// TODO: migrate to module system
import { describe, it } from 'vitest';

describe.skip('generateClaudeSettings (legacy CLI setup)', () => {
  it('generates settings with no MCP servers when none configured', () => {});
  it('includes gmail MCP when enabled', () => {});
  it('includes camoufox MCP when enabled', () => {});
  it('adds wacli Bash permission when whatsapp has no mcpServerPath', () => {});
  it('includes whatsapp MCP when mcpServerPath is set', () => {});
  it('includes all MCPs when all configured', () => {});
});

describe.skip('generateClaudeMd (legacy CLI setup)', () => {
  it('replaces user info placeholders', () => {});
  it('sets French language', () => {});
  it('handles missing user info gracefully', () => {});
});
