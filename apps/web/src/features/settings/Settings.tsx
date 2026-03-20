// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ModulesPanel from './ModulesPanel';
import AgentsPanel from './AgentsPanel';
import SecurityPanel from './SecurityPanel';
import ServiceControlPanel from './ServiceControlPanel';
import DangerZonePanel from './DangerZonePanel';

type Section = 'modules' | 'agents' | 'security' | 'control' | 'danger';

const sections: { id: Section; labelKey: string; icon: string }[] = [
  { id: 'modules', labelKey: 'settings.modules', icon: 'module' },
  { id: 'agents', labelKey: 'settings.agents', icon: 'agent' },
  { id: 'security', labelKey: 'settings.security', icon: 'security' },
  { id: 'control', labelKey: 'settings.serviceControl', icon: 'control' },
  { id: 'danger', labelKey: 'settings.dangerZone', icon: 'danger' },
];

function SectionIcon({ icon, active }: { icon: string; active: boolean }) {
  const color = active ? '#3b82f6' : '#64748b';
  switch (icon) {
    case 'module':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27,6.96 12,12.01 20.73,6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
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
    case 'security':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case 'control':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
  const [active, setActive] = useState<Section>('modules');

  return (
    <div className="flex h-full">
      {/* Internal sidebar */}
      <div className="hidden md:flex flex-col w-52 border-r border-border p-4 shrink-0">
        <div className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-3">
          {t('settings.title')}
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
        {active === 'modules' && <ModulesPanel />}
        {active === 'agents' && <AgentsPanel />}
        {active === 'security' && <SecurityPanel />}
        {active === 'control' && <ServiceControlPanel />}
        {active === 'danger' && <DangerZonePanel />}
      </div>
    </div>
  );
}
