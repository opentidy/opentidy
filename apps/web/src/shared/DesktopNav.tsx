// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from './store';

type NavItem = { to: string; icon: string; labelKey: string; unlockedKey: string | null; badgeKey?: string };

const sections: { labelKey: string; items: NavItem[] }[] = [
  {
    labelKey: '',
    items: [
      { to: '/', icon: 'home', labelKey: 'nav.home', unlockedKey: null },
      { to: '/suggestions', icon: 'suggestions', labelKey: 'nav.suggestions', unlockedKey: null, badgeKey: 'suggestions' },
      { to: '/schedule', icon: 'schedule', labelKey: 'nav.schedule', unlockedKey: null },
      { to: '/modules', icon: 'modules', labelKey: 'nav.modules', unlockedKey: null },
    ],
  },
  {
    labelKey: 'nav.sectionAgent',
    items: [
      { to: '/terminal', icon: 'terminal', labelKey: 'nav.terminal', unlockedKey: null },
      { to: '/ameliorations', icon: 'ameliorations', labelKey: 'nav.analyses', unlockedKey: 'ameliorations' as const },
      { to: '/memory', icon: 'memory', labelKey: 'nav.memory', unlockedKey: null },
      { to: '/settings', icon: 'toolbox', labelKey: 'nav.settings', unlockedKey: null },
    ],
  },
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

function NavIcon({ icon }: { icon: string }) {
  switch (icon) {
    case 'home':
      return (
        <svg {...svgProps}>
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9,22 9,12 15,12 15,22" />
        </svg>
      );
    case 'terminal':
      return (
        <svg {...svgProps}>
          <polyline points="4,17 10,11 4,5" />
          <line x1="12" y1="19" x2="20" y2="19" />
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
    case 'suggestions':
      return (
        <svg {...svgProps}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
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
    case 'toolbox':
      return (
        <svg {...svgProps}>
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      );
    default:
      return null;
  }
}

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
    <nav className="hidden md:flex flex-col w-[60px] lg:w-[220px] bg-card border-r border-border shrink-0">
      {/* Logo */}
      <div className="flex items-center justify-center lg:justify-start gap-3 h-14 px-3 lg:px-4 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <span className="hidden lg:block text-sm font-semibold text-text tracking-tight">
          OpenTidy
        </span>
      </div>

      {/* New job */}
      <div className="p-3">
        <NavLink
          to="/nouveau"
          className={({ isActive }) =>
            `flex items-center justify-center lg:justify-start gap-2 h-9 px-3 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-accent text-white'
                : 'bg-accent/10 text-accent hover:bg-accent/20'
            }`
          }
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span className="hidden lg:block">{t('nav.new')}</span>
        </NavLink>
      </div>

      {/* Navigation sections */}
      <div className="flex flex-col flex-1 px-3">
        {sections.map((section, i) => (
          <div key={i} className={i > 0 ? 'mt-2 pt-2 border-t border-border' : ''}>
            {section.labelKey && (
              <span className="hidden lg:block text-[11px] font-medium text-text-tertiary uppercase tracking-wider px-3 mb-1">
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
                      `relative flex items-center justify-center lg:justify-start gap-3 h-10 rounded-lg transition-colors text-sm ${
                        isActive
                          ? 'bg-accent/10 text-accent font-medium'
                          : 'text-text-secondary hover:bg-card-hover hover:text-text'
                      } ${locked ? 'opacity-40 cursor-default' : ''}`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-accent hidden lg:block" />
                        )}
                        <div className="relative shrink-0 w-5 h-5 flex items-center justify-center lg:ml-3">
                          <NavIcon icon={icon} />
                          {badge > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-accent text-white text-[10px] font-bold px-1 lg:hidden">
                              {badge}
                            </span>
                          )}
                        </div>
                        <span className="hidden lg:block truncate">{t(labelKey)}</span>
                        {badge > 0 && (
                          <span className="hidden lg:flex ml-auto items-center justify-center min-w-[20px] h-5 rounded-full bg-accent text-white text-[11px] font-bold px-1.5">
                            {badge}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* User */}
      <div className="p-3 border-t border-border">
        <NavLink
          to="/settings"
          className="flex items-center justify-center lg:justify-start gap-3 h-10 px-3 rounded-lg hover:bg-card-hover transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold shrink-0">
            L
          </div>
          <span className="hidden lg:block text-sm text-text-secondary truncate">Lolo</span>
        </NavLink>
      </div>
    </nav>
  );
}
