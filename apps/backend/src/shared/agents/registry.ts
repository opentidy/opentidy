// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import path from 'path';
import type { AgentAdapter, AgentName } from './types.js';
import { createClaudeAdapter } from './claude.js';

interface ResolveOpts {
  configDir: string;
  configAgent?: AgentName;
  flagAgent?: AgentName;
}

const VALID_AGENTS: AgentName[] = ['claude', 'gemini', 'copilot'];

export function resolveAgent(opts: ResolveOpts): AgentAdapter {
  const envAgent = process.env.OPENTIDY_AGENT as AgentName | undefined;
  const agentName = envAgent ?? opts.flagAgent ?? opts.configAgent ?? 'claude';

  if (!VALID_AGENTS.includes(agentName)) {
    throw new Error(`Unknown agent "${agentName}". Valid agents: ${VALID_AGENTS.join(', ')}`);
  }

  const agentConfigDir = path.join(opts.configDir, 'agents', agentName);

  switch (agentName) {
    case 'claude':
      return createClaudeAdapter(agentConfigDir);

    case 'gemini':
      throw new Error('Agent "gemini" is not yet implemented (experimental). Use "claude" for now.');

    case 'copilot':
      throw new Error('Agent "copilot" is not yet implemented (experimental). Use "claude" for now.');
  }
}
