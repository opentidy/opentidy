// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

/** Task status → visual config (dot color, badge text/bg, i18n label key) */
export const taskStatusConfig: Record<string, { dot: string; badge: string; badgeBg: string; labelKey: string }> = {
  'IN_PROGRESS': { dot: 'bg-green', badge: 'text-green', badgeBg: 'bg-green/20', labelKey: 'status.inProgress' },
  'WAITING': { dot: 'bg-orange', badge: 'text-orange', badgeBg: 'bg-orange/20', labelKey: 'status.waiting' },
  'COMPLETED': { dot: 'bg-text-tertiary', badge: 'text-text-tertiary', badgeBg: 'bg-text-tertiary/20', labelKey: 'status.completed' },
};

/** Session status → dot color */
export const sessionStatusColors: Record<string, string> = {
  active: 'bg-green',
  idle: 'bg-accent',
  mfa: 'bg-orange',
  finished: 'bg-text-tertiary',
};

/** Session status → dot color + i18n label key */
export const sessionStatusConfig: Record<string, { dot: string; labelKey: string }> = {
  active: { dot: 'bg-green', labelKey: 'status.active' },
  idle: { dot: 'bg-accent', labelKey: 'status.waiting' },
};

/** Urgency → suggestion card styles (SuggestionCard component) */
export const urgencyColors: Record<string, { border: string; badge: string; badgeBg: string; dot: string }> = {
  urgent: { border: 'border-l-red', badge: 'text-red', badgeBg: 'bg-red/20', dot: 'bg-red' },
  normal: { border: 'border-l-accent', badge: 'text-accent', badgeBg: 'bg-accent/20', dot: 'bg-accent' },
  low: { border: 'border-l-text-tertiary', badge: 'text-text-tertiary', badgeBg: 'bg-text-tertiary/20', dot: 'bg-text-tertiary' },
};

/** Urgency → inline suggestion styles (Home page suggestions) */
export const urgencyStyles: Record<string, { dot: string; border: string; title: string }> = {
  urgent: { dot: 'bg-red shadow-[0_0_6px_rgba(255,69,58,0.4)]', border: 'border-red/30', title: 'text-red' },
  normal: { dot: 'bg-[#a78bfa]', border: 'border-[rgba(167,139,250,0.2)]', title: 'text-text' },
  low: { dot: 'bg-text-tertiary', border: 'border-border-subtle', title: 'text-text-secondary' },
};
