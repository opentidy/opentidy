// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Schedule } from '@opentidy/shared';

const API = import.meta.env.VITE_API_URL || '';

const INTERVAL_UNITS = [
  { key: 'minutes', ms: 60_000 },
  { key: 'hours', ms: 3_600_000 },
  { key: 'days', ms: 86_400_000 },
  { key: 'weeks', ms: 604_800_000 },
] as const;

function msToUnit(ms: number): { value: number; unit: string } {
  for (let i = INTERVAL_UNITS.length - 1; i >= 0; i--) {
    const u = INTERVAL_UNITS[i];
    if (ms >= u.ms && ms % u.ms === 0) return { value: ms / u.ms, unit: u.key };
  }
  return { value: Math.round(ms / 60_000), unit: 'minutes' };
}

interface ScheduleEventModalProps {
  schedule: Schedule;
  onClose: () => void;
  onSaved: () => void;
}

export default function ScheduleEventModal({ schedule, onClose, onSaved }: ScheduleEventModalProps) {
  const { t } = useTranslation();

  const initialInterval = schedule.intervalMs ? msToUnit(schedule.intervalMs) : { value: 1, unit: 'hours' };

  const [runAt, setRunAt] = useState(schedule.runAt?.slice(0, 16) || '');
  const [intervalValue, setIntervalValue] = useState(String(initialInterval.value));
  const [intervalUnit, setIntervalUnit] = useState(initialInterval.unit);
  const [saving, setSaving] = useState(false);
  const isSystem = schedule.createdBy === 'system';

  function computeIntervalMs(): number {
    const unit = INTERVAL_UNITS.find(u => u.key === intervalUnit) || INTERVAL_UNITS[1];
    return parseInt(intervalValue) * unit.ms;
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch(`${API}/api/schedules/${schedule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runAt: schedule.type === 'once' ? new Date(runAt).toISOString() : undefined,
          intervalMs: schedule.type === 'recurring' ? computeIntervalMs() : undefined,
        }),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    await fetch(`${API}/api/schedules/${schedule.id}`, { method: 'DELETE' });
    onSaved();
  }

  const inputClass = 'w-full border border-white/[0.08] rounded-md px-3 py-2 bg-white/[0.03] text-text text-sm focus:outline-none focus:border-white/20 transition-colors';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#161920] border border-white/[0.08] rounded-xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <h2 className="text-sm font-medium text-text mb-1 tracking-tight">{schedule.label}</h2>
        <div className="flex items-center gap-2 mb-5">
          <span className="text-[13px] text-text-tertiary">
            {schedule.type === 'once' ? t('schedule.once') : t('schedule.recurring')}
          </span>
          {schedule.taskId && (
            <>
              <span className="text-text-tertiary/30">·</span>
              <span className="text-[13px] text-text-tertiary">{schedule.taskId}</span>
            </>
          )}
          <span className="text-text-tertiary/30">·</span>
          <span className="text-[12px] text-text-tertiary/50">{schedule.createdBy}</span>
        </div>

        {/* Timing (editable for non-system) */}
        {!isSystem && (
          <div className="flex flex-col gap-3 mb-4">
            {schedule.type === 'once' ? (
              <input type="datetime-local" value={runAt} onChange={e => setRunAt(e.target.value)} className={inputClass} />
            ) : (
              <div className="flex gap-2">
                <input
                  type="number" value={intervalValue} onChange={e => setIntervalValue(e.target.value)}
                  min="1" className={`${inputClass} w-20 text-center`}
                />
                <div className="flex gap-1 flex-1">
                  {INTERVAL_UNITS.map(u => (
                    <button key={u.key} type="button" onClick={() => setIntervalUnit(u.key)}
                      className={`flex-1 text-[12px] py-1.5 rounded-md border transition-colors ${
                        intervalUnit === u.key
                          ? 'border-white/20 bg-white/[0.06] text-text'
                          : 'border-white/[0.04] text-text-tertiary/60 hover:text-text-tertiary'
                      }`}>
                      {u.key.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {schedule.instruction && (
              <p className="text-[13px] text-text-tertiary/70 leading-relaxed">{schedule.instruction}</p>
            )}
          </div>
        )}

        {/* System schedule, read-only info */}
        {isSystem && schedule.intervalMs && (
          <p className="text-xs text-text-tertiary mb-4">
            {t('schedule.recurring')} · {schedule.intervalMs >= 3600000 ? `${Math.round(schedule.intervalMs / 3600000)}h` : `${Math.round(schedule.intervalMs / 60000)}m`}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-3 border-t border-white/[0.06]">
          {!isSystem && (
            <button onClick={handleSave} disabled={saving}
              className="flex-1 text-xs font-medium py-2 rounded-md bg-white/[0.08] text-text hover:bg-white/[0.12] transition-colors disabled:opacity-40">
              {saving ? '...' : t('common.confirm')}
            </button>
          )}
          {!isSystem && (
            <button onClick={handleDelete}
              className="text-xs px-3 py-2 rounded-md text-red/70 hover:text-red hover:bg-red/10 transition-colors">
              {t('schedule.delete')}
            </button>
          )}
          <button onClick={onClose}
            className={`text-xs px-3 py-2 rounded-md text-text-tertiary hover:text-text-secondary transition-colors ${isSystem ? 'flex-1' : ''}`}>
            {isSystem ? t('common.close') : t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
