// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from './store';

const tabs = [
  { to: '/', icon: 'home', labelKey: 'nav.home', unlockedKey: null },
  { to: '/nouveau', icon: 'nouveau', labelKey: 'nav.new', unlockedKey: null },
  { to: '/schedule', icon: 'schedule', labelKey: 'nav.schedule', unlockedKey: null },
  { to: '/terminal', icon: 'terminal', labelKey: 'nav.terminal', unlockedKey: null },
  { to: '/ameliorations', icon: 'plus', labelKey: 'nav.analyses', unlockedKey: 'ameliorations' as const },
  { to: '/memory', icon: 'memory', labelKey: 'nav.memory', unlockedKey: null },
];

function TabIcon({ icon, active }: { icon: string; active: boolean }) {
  const color = active ? '#3b82f6' : '#6b7280';
  switch (icon) {
    case 'home':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9,22 9,12 15,12 15,22" />
        </svg>
      );
    case 'dossiers':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'nouveau':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      );
    case 'schedule':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    case 'terminal':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4,17 10,11 4,5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      );
    case 'plus':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      );
    case 'memory':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
          <line x1="10" y1="22" x2="14" y2="22" />
        </svg>
      );
    default:
      return null;
  }
}

export default function MobileNav() {
  const { t } = useTranslation();
  const { ameliorations } = useStore();
  const hasContent: Record<string, boolean> = {
    ameliorations: ameliorations.length > 0,
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex justify-around items-center h-16 z-50">
      {tabs.map(({ to, icon, labelKey, unlockedKey }) => {
        const locked = unlockedKey !== null && !hasContent[unlockedKey];
        return (
          <NavLink
            key={to}
            to={to}
            onClick={locked ? (e) => e.preventDefault() : undefined}
            aria-disabled={locked || undefined}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 text-[10px] ${
                isActive ? 'text-accent' : 'text-text-tertiary'
              } ${locked ? 'opacity-40 cursor-default' : ''}`
            }
          >
            {({ isActive }) => (
              <>
                <TabIcon icon={icon} active={isActive} />
                <span>{t(labelKey)}</span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
