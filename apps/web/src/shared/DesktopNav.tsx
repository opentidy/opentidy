// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from './store';
import NavIcon from './NavIcon';

type NavItem = { to: string; icon: string; labelKey: string; unlockedKey: string | null; badgeKey?: string };

const sections: { labelKey: string; items: NavItem[] }[] = [
  {
    labelKey: '',
    items: [
      { to: '/', icon: 'home', labelKey: 'nav.home', unlockedKey: null },
      { to: '/suggestions', icon: 'suggestions', labelKey: 'nav.suggestions', unlockedKey: null, badgeKey: 'suggestions' },
      { to: '/schedule', icon: 'schedule', labelKey: 'nav.schedule', unlockedKey: null },
    ],
  },
  {
    labelKey: 'nav.sectionAgent',
    items: [
      { to: '/terminal', icon: 'terminal', labelKey: 'nav.terminal', unlockedKey: null },
      { to: '/ameliorations', icon: 'ameliorations', labelKey: 'nav.analyses', unlockedKey: 'ameliorations' as const },
      { to: '/memory', icon: 'memory', labelKey: 'nav.memory', unlockedKey: null },
      { to: '/modules', icon: 'modules', labelKey: 'nav.modules', unlockedKey: null },
    ],
  },
];

export default function DesktopNav() {
  const { t } = useTranslation();
  const { ameliorations, suggestions } = useStore();
  const hasContent: Record<string, boolean> = {
    ameliorations: ameliorations.length > 0,
  };
  const badgeCounts: Record<string, number> = {
    suggestions: suggestions.length,
  };

  return (
    <nav className="hidden md:flex flex-col w-[200px] bg-surface border-r border-border shrink-0">
      {/* Header */}
      <div className="px-5 pt-4 pb-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#48484a]">
          OpenTidy
        </span>
      </div>

      {/* Navigation sections */}
      <div className="flex flex-col flex-1">
        {sections.map((section, i) => (
          <div key={i}>
            {i > 0 && <div className="h-px bg-border-subtle mx-4 my-2" />}
            {section.labelKey && (
              <span className="block text-[11px] font-semibold uppercase tracking-[0.15em] text-[#48484a] px-5 mb-1">
                {t(section.labelKey)}
              </span>
            )}
            <div className="flex flex-col gap-0.5">
              {section.items.map(({ to, icon, labelKey, unlockedKey, badgeKey }) => {
                const locked = unlockedKey !== null && !hasContent[unlockedKey];
                const badge = badgeKey ? badgeCounts[badgeKey] ?? 0 : 0;
                return (
                  <NavLink
                    key={to}
                    to={to}
                    title={t(labelKey)}
                    onClick={locked ? (e) => e.preventDefault() : undefined}
                    aria-disabled={locked || undefined}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-3 py-2 mx-2 rounded-lg text-[13px] transition-colors duration-150 ${
                        isActive
                          ? 'bg-accent/[.08] text-text font-medium'
                          : 'text-text-tertiary hover:text-text-secondary'
                      } ${locked ? 'opacity-40 cursor-default' : ''}`
                    }
                  >
                    <div className="relative shrink-0 w-4 h-4 flex items-center justify-center">
                      <NavIcon icon={icon} />
                    </div>
                    <span className="truncate">{t(labelKey)}</span>
                    {badge > 0 && (
                      <span className="text-[9px] bg-card text-[#48484a] px-1.5 py-0.5 rounded-full ml-auto">
                        {badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Settings */}
      <div className="h-px bg-border-subtle mx-4 my-2" />
      <div className="pb-2">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-3 py-2 mx-2 rounded-lg text-[13px] transition-colors duration-150 ${
              isActive
                ? 'bg-accent/[.08] text-text font-medium'
                : 'text-text-tertiary hover:text-text-secondary'
            }`
          }
        >
          <div className="w-4 h-4 flex items-center justify-center shrink-0">
            <NavIcon icon="toolbox" />
          </div>
          <span className="truncate">{t('nav.settings')}</span>
        </NavLink>
      </div>

      {/* Search hint */}
      <div className="bg-card rounded-lg mx-3 mb-3 px-2.5 py-1.5 text-[11px] text-[#48484a] flex items-center gap-1.5">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="7" cy="7" r="4.5" />
          <line x1="10.5" y1="10.5" x2="14" y2="14" />
        </svg>
        <span>Search</span>
        <span className="ml-auto">&#8984;K</span>
      </div>
    </nav>
  );
}
