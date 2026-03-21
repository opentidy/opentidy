// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

interface ModuleIconProps {
  name: string;
  size?: number;
  className?: string;
}

export default function ModuleIcon({ name, size = 24, className }: ModuleIconProps) {
  const s = size;
  const shared = { width: s, height: s, viewBox: '0 0 24 24', className, fill: 'none' as const };

  switch (name) {
    case 'gmail':
      return (
        <svg {...shared} viewBox="0 0 24 24">
          <path d="M2 6a2 2 0 0 1 2-4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z" fill="#EA4335" fillOpacity="0.15" stroke="#EA4335" strokeWidth="1.5"/>
          <path d="M2 6l10 7 10-7" stroke="#EA4335" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );

    case 'whatsapp':
      return (
        <svg {...shared} viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12c0 1.77.46 3.43 1.27 4.88L2 22l5.27-1.24A9.93 9.93 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z" fill="#25D366" fillOpacity="0.15" stroke="#25D366" strokeWidth="1.5"/>
          <path d="M8.5 10.5c.5 1.5 1.5 3 3 4l1.5-1 2 1.5-.5 1.5c-3 .5-6.5-3-7-6l1.5-.5 1-1.5-1.5-2z" fill="#25D366" fillOpacity="0.3"/>
        </svg>
      );

    case 'browser':
      return (
        <svg {...shared} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" fill="#6366F1" fillOpacity="0.15" stroke="#6366F1" strokeWidth="1.5"/>
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z" stroke="#6366F1" strokeWidth="1.5"/>
        </svg>
      );

    case 'cloudflare':
      return (
        <svg {...shared} viewBox="0 0 24 24">
          <path d="M4 12a8 8 0 0 1 16 0" stroke="#F6821F" strokeWidth="1.5" strokeLinecap="round"/>
          <rect x="3" y="12" width="18" height="6" rx="3" fill="#F6821F" fillOpacity="0.15" stroke="#F6821F" strokeWidth="1.5"/>
          <path d="M7 15h10" stroke="#F6821F" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      );

    case 'telegram':
      return (
        <svg {...shared} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" fill="#2AABEE" fillOpacity="0.15" stroke="#2AABEE" strokeWidth="1.5"/>
          <path d="M7 12l3 3 7-7" stroke="#2AABEE" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );

    case 'imessage':
      return (
        <svg {...shared} viewBox="0 0 24 24">
          <path d="M12 3C7.03 3 3 6.58 3 11c0 2.1.87 4.02 2.3 5.46L4 21l4.1-1.84A10.7 10.7 0 0 0 12 20c4.97 0 9-3.58 9-8s-4.03-8-9-8z" fill="#34C759" fillOpacity="0.15" stroke="#34C759" strokeWidth="1.5"/>
        </svg>
      );

    case 'apple-mail':
      return (
        <svg {...shared} viewBox="0 0 24 24">
          <rect x="3" y="5" width="18" height="14" rx="2" fill="#007AFF" fillOpacity="0.15" stroke="#007AFF" strokeWidth="1.5"/>
          <path d="M3 7l9 6 9-6" stroke="#007AFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );

    case 'opentidy':
      return (
        <svg {...shared} viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="4" fill="#58A6FF" fillOpacity="0.15" stroke="#58A6FF" strokeWidth="1.5"/>
          <path d="M8 12l3 3 5-6" stroke="#58A6FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );

    default:
      return <span style={{ fontSize: size * 0.75, lineHeight: 1, display: 'inline-block', width: size, height: size, textAlign: 'center' }}>📦</span>;
  }
}
