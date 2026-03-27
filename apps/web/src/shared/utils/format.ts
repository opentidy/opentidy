// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { differenceInMinutes, differenceInSeconds, format, isToday } from 'date-fns';

/**
 * Format elapsed time from startedAt to now.
 * Returns: "< 1 min", "12 min", "1h30m"
 */
export function formatDuration(startedAt: string): string {
  const mins = differenceInMinutes(Date.now(), new Date(startedAt));
  if (mins < 1) return '< 1 min';
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h${mins % 60}m`;
}

/**
 * Format elapsed time between two dates (or from startedAt to now).
 * Returns: "12s", "3m 45s", "3m"
 */
export function formatElapsed(startedAt: string, endedAt?: string): string {
  const start = new Date(startedAt);
  const end = endedAt ? new Date(endedAt) : new Date();
  const seconds = differenceInSeconds(end, start);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m${remaining > 0 ? ` ${remaining}s` : ''}`;
}

/**
 * Format a session date for display.
 * Today: "14:30", other days: "Mar 20 14:30"
 */
export function formatSessionDate(dateStr: string): string {
  const d = new Date(dateStr);
  const time = format(d, 'HH:mm');
  if (isToday(d)) return time;
  return `${format(d, 'MMM d')} ${time}`;
}

/**
 * Format a session duration (minutes-level granularity).
 * Returns: "< 1 min", "12m", "1h30m"
 */
export function formatSessionDuration(startedAt: string, endedAt?: string): string {
  const end = endedAt ? new Date(endedAt) : new Date();
  const mins = differenceInMinutes(end, new Date(startedAt));
  if (mins < 1) return '< 1 min';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}m`;
}
