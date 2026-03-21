// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

const svgProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export default function NavIcon({ icon }: { icon: string }) {
  switch (icon) {
    case 'home':
      return (
        <svg {...svgProps}>
          <path d="M2 6l6-4.5 6 4.5v7.5a1.2 1.2 0 0 1-1.2 1.2H3.2A1.2 1.2 0 0 1 2 13.5z" />
          <polyline points="6,15 6,9 10,9 10,15" />
        </svg>
      );
    case 'terminal':
      return (
        <svg {...svgProps}>
          <polyline points="3,11 6.5,7.5 3,4" />
          <line x1="8" y1="12.5" x2="13" y2="12.5" />
        </svg>
      );
    case 'schedule':
      return (
        <svg {...svgProps}>
          <rect x="2" y="3" width="12" height="12" rx="1.5" ry="1.5" />
          <line x1="10.5" y1="1.5" x2="10.5" y2="4.5" />
          <line x1="5.5" y1="1.5" x2="5.5" y2="4.5" />
          <line x1="2" y1="7" x2="14" y2="7" />
        </svg>
      );
    case 'ameliorations':
      return (
        <svg {...svgProps}>
          <path d="M9.5 1.5H4a1.5 1.5 0 0 0-1.5 1.5v11a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5V5.5z" />
          <polyline points="9.5,1.5 9.5,5.5 13.5,5.5" />
          <line x1="10.5" y1="9" x2="5.5" y2="9" />
          <line x1="10.5" y1="11.5" x2="5.5" y2="11.5" />
        </svg>
      );
    case 'memory':
      return (
        <svg {...svgProps}>
          <path d="M8 1.5a4.5 4.5 0 0 1 4.5 4.5c0 1.53-.77 2.88-1.94 3.7V11.5a1.2 1.2 0 0 1-1.2 1.2H6.64a1.2 1.2 0 0 1-1.2-1.2V9.7A4.49 4.49 0 0 1 3.5 6 4.5 4.5 0 0 1 8 1.5z" />
          <line x1="6.5" y1="14.5" x2="9.5" y2="14.5" />
        </svg>
      );
    case 'suggestions':
      return (
        <svg {...svgProps}>
          <path d="M14 10a1.2 1.2 0 0 1-1.2 1.2H5l-2.5 2.5V3.5A1.2 1.2 0 0 1 3.7 2.3h9.1A1.2 1.2 0 0 1 14 3.5z" />
        </svg>
      );
    case 'nouveau':
      return (
        <svg {...svgProps}>
          <line x1="8" y1="3.5" x2="8" y2="12.5" />
          <line x1="3.5" y1="8" x2="12.5" y2="8" />
        </svg>
      );
    case 'modules':
      return (
        <svg {...svgProps}>
          <path d="M14 10.5V5.5a1.2 1.2 0 0 0-.6-1.04l-4.5-2.6a1.2 1.2 0 0 0-1.2 0l-4.5 2.6A1.2 1.2 0 0 0 2.6 5.5v5a1.2 1.2 0 0 0 .6 1.04l4.5 2.6a1.2 1.2 0 0 0 1.2 0l4.5-2.6a1.2 1.2 0 0 0 .6-1.04z" />
          <polyline points="2.8,4.6 8,8 13.2,4.6" />
          <line x1="8" y1="14.5" x2="8" y2="8" />
        </svg>
      );
    case 'toolbox':
      return (
        <svg {...svgProps}>
          <path d="M9.8 4.2a.6.6 0 0 0 0 .85l1 1a.6.6 0 0 0 .85 0l2.45-2.45a3.9 3.9 0 0 1-5.16 5.16l-4.49 4.49a1.38 1.38 0 0 1-1.95-1.95l4.49-4.49A3.9 3.9 0 0 1 12.15 1.64L9.8 4.2z" />
        </svg>
      );
    default:
      return null;
  }
}
