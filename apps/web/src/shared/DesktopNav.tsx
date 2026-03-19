// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const links = [
  { to: '/', icon: 'home', labelKey: 'nav.home' },
  { to: '/terminal', icon: 'terminal', labelKey: 'nav.terminal' },
  { to: '/ameliorations', icon: 'ameliorations', labelKey: 'nav.analyses' },
  { to: '/memory', icon: 'memory', labelKey: 'nav.memory' },
];

function NavIcon({ icon, active }: { icon: string; active: boolean }) {
  const color = active ? '#3b82f6' : '#6b7280';
  switch (icon) {
    case 'home':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9,22 9,12 15,12 15,22" />
        </svg>
      );
    case 'dossiers':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'terminal':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4,17 10,11 4,5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      );
    case 'ameliorations':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14,2 14,8 20,8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
    case 'memory':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
          <line x1="10" y1="22" x2="14" y2="22" />
        </svg>
      );
    default:
      return null;
  }
}

export default function DesktopNav() {
  const { t } = useTranslation();
  return (
    <nav className="hidden md:flex flex-col items-center w-[60px] bg-card border-r border-border py-4 gap-6 shrink-0">
      <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center mb-4">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      </div>
      {links.map(({ to, icon, labelKey }) => (
        <NavLink
          key={to}
          to={to}
          title={t(labelKey)}
          className={({ isActive }) =>
            `flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
              isActive ? 'bg-accent/10' : 'hover:bg-card-hover'
            }`
          }
        >
          {({ isActive }) => <NavIcon icon={icon} active={isActive} />}
        </NavLink>
      ))}
      <div className="mt-auto">
        <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-sm font-bold text-white">
          L
        </div>
      </div>
    </nav>
  );
}