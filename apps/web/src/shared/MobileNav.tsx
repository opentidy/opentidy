// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from './store';

type TabItem = { to: string; icon: string; labelKey: string; unlockedKey: string | null; badgeKey?: string };

const tabs: TabItem[] = [
  { to: '/', icon: 'home', labelKey: 'nav.home', unlockedKey: null },
  { to: '/suggestions', icon: 'suggestions', labelKey: 'nav.suggestions', unlockedKey: null, badgeKey: 'suggestions' },
  { to: '/schedule', icon: 'schedule', labelKey: 'nav.schedule', unlockedKey: null },
  { to: '/modules', icon: 'modules', labelKey: 'nav.modules', unlockedKey: null },
];

const svgProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function TabIcon({ icon }: { icon: string }) {
  switch (icon) {
    case 'home':
      return (
        <svg {...svgProps}>
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9,22 9,12 15,12 15,22" />
        </svg>
      );
    case 'suggestions':
      return (
        <svg {...svgProps}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'nouveau':
      return (
        <svg {...svgProps}>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      );
    case 'schedule':
      return (
        <svg {...svgProps}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    case 'modules':
      return (
        <svg {...svgProps}>
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27,6.96 12,12.01 20.73,6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      );
    case 'terminal':
      return (
        <svg {...svgProps}>
          <polyline points="4,17 10,11 4,5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      );
    case 'ameliorations':
      return (
        <svg {...svgProps}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14,2 14,8 20,8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
    case 'memory':
      return (
        <svg {...svgProps}>
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
  const { ameliorations, suggestions } = useStore();
  const hasContent: Record<string, boolean> = {
    ameliorations: ameliorations.length > 0,
  };
  const badgeCounts: Record<string, number> = {
    suggestions: suggestions.length,
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex justify-around items-center h-16 z-50">
      {tabs.map(({ to, icon, labelKey, unlockedKey, badgeKey }) => {
        const locked = unlockedKey !== null && !hasContent[unlockedKey];
        const badge = badgeKey ? badgeCounts[badgeKey] ?? 0 : 0;
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
            <div className="relative">
              <TabIcon icon={icon} />
              {badge > 0 && (
                <span className="absolute -top-1 -right-2 min-w-[14px] h-3.5 flex items-center justify-center rounded-full bg-accent text-white text-[9px] font-bold px-1">
                  {badge}
                </span>
              )}
            </div>
            <span>{t(labelKey)}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
