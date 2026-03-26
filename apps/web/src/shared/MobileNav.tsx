// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from './store';
import NavIcon from './NavIcon';

type TabItem = { to: string; icon: string; labelKey: string; badgeKey?: string };

const tabs: TabItem[] = [
  { to: '/', icon: 'home', labelKey: 'nav.home' },
  { to: '/schedule', icon: 'schedule', labelKey: 'nav.schedule' },
  { to: '/memory', icon: 'memory', labelKey: 'nav.memory' },
  { to: '/settings', icon: 'toolbox', labelKey: 'nav.settings' },
];

export default function MobileNav() {
  const { t } = useTranslation();
  const { suggestions } = useStore();
  const badgeCounts: Record<string, number> = {
    suggestions: suggestions.length,
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-border flex justify-around items-center h-16 z-50">
      {tabs.map(({ to, icon, labelKey, badgeKey }, i) => {
        const badge = badgeKey ? badgeCounts[badgeKey] ?? 0 : 0;
        const isCenter = i === 2;

        if (isCenter) {
          return (
            <span key="fab" className="flex flex-col items-center gap-1">
              <NavLink
                to="/nouveau"
                className="w-9 h-9 bg-accent rounded-full shadow-[0_4px_12px_rgba(10,132,255,0.25)] flex items-center justify-center -mt-4"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="3.5" x2="8" y2="12.5" />
                  <line x1="3.5" y1="8" x2="12.5" y2="8" />
                </svg>
              </NavLink>
            </span>
          );
        }

        return (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 text-[12px] ${
                isActive ? 'text-accent' : 'text-[#48484a]'
              }`
            }
          >
            <div className="relative">
              <NavIcon icon={icon} />
              {badge > 0 && (
                <span className="absolute -top-1 -right-2 min-w-[14px] h-3.5 flex items-center justify-center rounded-full bg-accent text-white text-[11px] font-bold px-1">
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
