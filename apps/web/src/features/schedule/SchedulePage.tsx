// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/20/solid';
import type { Schedule } from '@opentidy/shared';
import ScheduleEventModal from './ScheduleEventModal';

const API = import.meta.env.VITE_API_URL || '';

type ScheduleWithNext = Schedule & { nextRun: string | null };

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6AM-10PM
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function hashColor(str: string): { bg: string; border: string; text: string } {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return {
    bg: `hsla(${hue}, 50%, 50%, 0.12)`,
    border: `hsl(${hue}, 50%, 50%)`,
    text: `hsl(${hue}, 60%, 70%)`,
  };
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function formatMonth(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

function expandForWeek(schedules: ScheduleWithNext[], weekDays: Date[]) {
  const start = weekDays[0];
  const end = new Date(weekDays[6]);
  end.setHours(23, 59, 59);

  const events: Array<{ schedule: ScheduleWithNext; date: Date; hour: number; minute: number }> = [];

  for (const s of schedules) {
    if (s.createdBy === 'system') continue;

    if (s.type === 'once' && s.runAt) {
      const d = new Date(s.runAt);
      if (d >= start && d <= end) {
        events.push({ schedule: s, date: d, hour: d.getHours(), minute: d.getMinutes() });
      }
    } else if (s.type === 'recurring' && s.intervalMs) {
      const anchor = s.lastRunAt ? new Date(s.lastRunAt) : new Date(s.createdAt);
      let cursor = new Date(anchor.getTime());
      while (cursor < start) cursor = new Date(cursor.getTime() + s.intervalMs);
      let count = 0;
      while (cursor <= end && count < 100) {
        events.push({ schedule: s, date: new Date(cursor), hour: cursor.getHours(), minute: cursor.getMinutes() });
        cursor = new Date(cursor.getTime() + s.intervalMs);
        count++;
      }
    }
  }

  return events;
}

export default function SchedulePage() {
  const { t } = useTranslation();
  const [schedules, setSchedules] = useState<ScheduleWithNext[]>([]);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [editSchedule, setEditSchedule] = useState<Schedule | null>(null);

  const weekDays = getWeekDays(weekStart);
  const events = expandForWeek(schedules, weekDays);
  const systemSchedules = schedules.filter(s => s.createdBy === 'system');

  async function fetchSchedules() {
    const res = await fetch(`${API}/api/schedules`);
    if (res.ok) setSchedules(await res.json());
  }

  useEffect(() => { fetchSchedules(); }, []);

  useEffect(() => {
    const es = new EventSource(`${API}/api/events`);
    es.onmessage = (e) => {
      const event = JSON.parse(e.data);
      if (event.type?.startsWith('schedule:')) fetchSchedules();
    };
    return () => es.close();
  }, []);

  function prevWeek() { setWeekStart(w => { const d = new Date(w); d.setDate(d.getDate() - 7); return d; }); }
  function nextWeek() { setWeekStart(w => { const d = new Date(w); d.setDate(d.getDate() + 7); return d; }); }
  function goToday() { setWeekStart(getWeekStart(new Date())); }

  function handleEventClick(schedule: Schedule) {
    setEditSchedule(schedule);
  }

  function getEventsForSlot(dayIndex: number, hour: number) {
    return events.filter(e => {
      const dayMatch = isSameDay(e.date, weekDays[dayIndex]);
      return dayMatch && e.hour === hour;
    });
  }

  return (
    <div className="flex h-full flex-col p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-medium tracking-tight">
          <time dateTime={weekStart.toISOString().slice(0, 7)}>{formatMonth(weekStart)}</time>
        </h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-md border border-white/10">
            <button onClick={prevWeek} className="flex h-8 w-8 items-center justify-center rounded-l-md hover:bg-white/5 text-text-tertiary hover:text-text transition-colors">
              <ChevronLeftIcon className="size-4" />
            </button>
            <button onClick={goToday} className="hidden md:block px-3 text-xs font-medium text-text-secondary hover:bg-white/5 h-8 transition-colors">
              {t('common.today') || 'Today'}
            </button>
            <button onClick={nextWeek} className="flex h-8 w-8 items-center justify-center rounded-r-md hover:bg-white/5 text-text-tertiary hover:text-text transition-colors">
              <ChevronRightIcon className="size-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Week grid */}
      <div className="flex-1 overflow-auto rounded-lg border border-white/[0.06]">
        <div className="min-w-[640px]">
          {/* Day headers */}
          <div className="sticky top-0 z-10 grid grid-cols-[3.5rem_repeat(7,1fr)] border-b border-white/[0.06] bg-bg">
            <div />
            {weekDays.map((day, i) => (
              <div key={i} className="flex items-center justify-center py-2.5 text-center">
                <span className="text-[11px] text-text-tertiary uppercase tracking-wide">
                  {DAY_NAMES[i]}{' '}
                  <span className={`ml-1 inline-flex size-6 items-center justify-center rounded-full text-xs font-medium ${
                    isToday(day) ? 'bg-accent text-white' : 'text-text-secondary'
                  }`}>
                    {day.getDate()}
                  </span>
                </span>
              </div>
            ))}
          </div>

          {/* Time grid */}
          {HOURS.map(hour => (
            <div key={hour} className="grid grid-cols-[3.5rem_repeat(7,1fr)] border-b border-white/[0.03]">
              {/* Time label */}
              <div className="py-3 pr-2 text-right text-[10px] text-text-tertiary/60 tabular-nums -mt-2">
                {hour === 0 ? '12AM' : hour < 12 ? `${hour}AM` : hour === 12 ? '12PM' : `${hour - 12}PM`}
              </div>
              {/* Day columns */}
              {weekDays.map((day, dayIndex) => {
                const slotEvents = getEventsForSlot(dayIndex, hour);
                return (
                  <div
                    key={dayIndex}
                    className={`relative min-h-[3rem] border-l border-white/[0.03] ${
                      isToday(day) ? 'bg-accent/[0.03]' : ''
                    }`}
                  >
                    {slotEvents.map((ev, j) => {
                      const colors = ev.schedule.jobId ? hashColor(ev.schedule.jobId) : { bg: 'rgba(107,114,128,0.12)', border: '#6b7280', text: '#9ca3af' };
                      return (
                        <button
                          key={`${ev.schedule.id}-${j}`}
                          onClick={(e) => { e.stopPropagation(); handleEventClick(ev.schedule); }}
                          style={{ background: colors.bg, borderLeftColor: colors.border, color: colors.text }}
                          className="w-[calc(100%-4px)] mx-0.5 mt-0.5 px-2 py-1 rounded text-left text-[11px] font-medium border-l-[3px] hover:brightness-125 transition-all truncate"
                        >
                          <span className="opacity-60 tabular-nums text-[10px]">
                            {String(ev.hour).padStart(2, '0')}:{String(ev.minute).padStart(2, '0')}
                          </span>{' '}
                          {ev.schedule.label}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* System tasks footer */}
      {systemSchedules.length > 0 && (
        <div className="mt-3 flex items-center gap-3 px-1">
          <span className="text-[10px] uppercase tracking-widest text-text-tertiary/50 font-medium">{t('schedule.system')}</span>
          <div className="h-px flex-1 bg-white/[0.04]" />
          {systemSchedules.map(s => (
            <div key={s.id} className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
              <span className="w-1 h-1 rounded-full bg-green/60" />
              <span>{s.label}</span>
              {s.intervalMs && (
                <span className="text-text-tertiary/50">
                  {s.intervalMs >= 3600000 ? `${Math.round(s.intervalMs / 3600000)}h` : `${Math.round(s.intervalMs / 60000)}m`}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {editSchedule && (
        <ScheduleEventModal
          schedule={editSchedule}
          onClose={() => setEditSchedule(null)}
          onSaved={() => { setEditSchedule(null); fetchSchedules(); }}
        />
      )}
    </div>
  );
}
