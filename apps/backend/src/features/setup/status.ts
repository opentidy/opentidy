// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { OpenTidyConfig, AgentName, SetupStatus } from '@opentidy/shared';

export interface SetupDeps {
  loadConfig: () => OpenTidyConfig;
  checkAgentInstalled: (agent: AgentName) => boolean;
  checkAgentAuth: (agent: AgentName) => boolean;
}

const KNOWN_AGENTS: AgentName[] = ['claude', 'gemini', 'copilot'];

export function setupStatusRoute(deps: SetupDeps) {
  const app = new Hono();

  app.get('/setup/status', (c) => {
    console.log('[setup] GET /setup/status');
    const config = deps.loadConfig();

    const connectedAgents = KNOWN_AGENTS.filter(
      (a) => deps.checkAgentInstalled(a) && deps.checkAgentAuth(a),
    );

    const status: SetupStatus = {
      setupComplete: config.setupComplete ?? false,
      userInfo: {
        done: !!config.userInfo?.name,
      },
      agents: {
        done: connectedAgents.length > 0,
        connected: connectedAgents,
        active: config.agentConfig?.name ?? null,
      },
      permissions: {
        done: true,
        granted: [],
        missing: [],
      },
      services: {
        telegram: {
          status: config.modules?.telegram?.config?.botToken ? 'connected' : 'not_configured',
        },
        email: {
          status: config.modules?.email?.enabled ? 'connected' : 'not_configured',
        },
        whatsapp: {
          status: config.modules?.whatsapp?.enabled ? 'connected' : 'not_configured',
        },
        camoufox: {
          status: config.modules?.camoufox?.enabled ? 'connected' : 'not_configured',
        },
      },
    };

    return c.json(status);
  });

  return app;
}
