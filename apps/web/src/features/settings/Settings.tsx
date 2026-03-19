// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../shared/store';
import McpServersPanel from './McpServersPanel';
import SkillsPanel from './SkillsPanel';
import MarketplacePanel from './MarketplacePanel';
import AgentsPanel from './AgentsPanel';
import DangerZonePanel from './DangerZonePanel';

type Section = 'mcp' | 'skills' | 'marketplace' | 'agents' | 'danger';

const sections: { id: Section; labelKey: string; icon: string }[] = [
  { id: 'mcp', labelKey: 'toolbox.mcpServers', icon: 'server' },
  { id: 'skills', labelKey: 'toolbox.skills', icon: 'skill' },
  { id: 'marketplace', labelKey: 'toolbox.marketplace', icon: 'store' },
  { id: 'agents', labelKey: 'toolbox.agentsSection', icon: 'agent' },
  { id: 'danger', labelKey: 'toolbox.dangerZone', icon: 'danger' },
];

function SectionIcon({ icon, active }: { icon: string; active: boolean }) {
  const color = active ? '#3b82f6' : '#64748b';
  switch (icon) {
    case 'server':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
          <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
          <line x1="6" y1="6" x2="6.01" y2="6" />
          <line x1="6" y1="18" x2="6.01" y2="18" />
        </svg>
      );
    case 'skill':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
        </svg>
      );
    case 'store':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9,22 9,12 15,12 15,22" />
        </svg>
      );
    case 'agent':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
          <path d="M9 15h6" />
        </svg>
      );
    case 'danger':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    default:
      return null;
  }
}

export default function Settings() {
  const { t } = useTranslation();
  const [active, setActive] = useState<Section>('mcp');

  return (
    <div className="flex h-full">
      {/* Internal sidebar */}
      <div className="hidden md:flex flex-col w-52 border-r border-border p-4 shrink-0">
        <div className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-3">
          {t('toolbox.title')}
        </div>
        <div className="space-y-1">
          {sections.map(({ id, labelKey, icon }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                active === id
                  ? 'bg-accent/10 text-accent font-medium'
                  : 'text-text-secondary hover:bg-card-hover'
              }`}
            >
              <SectionIcon icon={icon} active={active === id} />
              {t(labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile section tabs */}
      <div className="md:hidden flex border-b border-border w-full absolute top-0 left-0 bg-card z-10">
        {sections.map(({ id, labelKey, icon }) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors ${
              active === id
                ? 'text-accent border-b-2 border-accent'
                : 'text-text-tertiary'
            }`}
          >
            <SectionIcon icon={icon} active={active === id} />
            {t(labelKey)}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8 pt-16 md:pt-8">
        {active === 'mcp' && <McpServersPanel />}
        {active === 'skills' && <SkillsPanel />}
        {active === 'marketplace' && <MarketplacePanel />}
        {active === 'agents' && <AgentsPanel />}
        {active === 'danger' && <DangerZonePanel />}
      </div>
    </div>
  );
}
