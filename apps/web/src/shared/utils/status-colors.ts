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
