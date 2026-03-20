// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useTranslation } from 'react-i18next';
import type { ModuleInfo } from '@opentidy/shared';

interface ModuleCardProps {
  module: ModuleInfo;
  onEnable: (name: string) => void;
  onDisable: (name: string) => void;
  onConfigure: (name: string) => void;
  onRemove?: (name: string) => void;
}

function HealthDot({ health }: { health?: 'ok' | 'error' | 'unknown' }) {
  const color =
    health === 'ok'
      ? 'bg-green-500'
      : health === 'error'
        ? 'bg-red-500'
        : 'bg-gray-500';

  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
        checked ? 'bg-accent' : 'bg-border'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  );
}

const BADGE_LABELS: Record<string, string> = {
  mcpServers: 'MCP',
  skills: 'Skill',
  receivers: 'Receiver',
};

export default function ModuleCard({ module, onEnable, onDisable, onConfigure, onRemove }: ModuleCardProps) {
  const { t } = useTranslation();

  const badges = Object.entries(module.components)
    .filter(([, items]) => items.length > 0)
    .map(([key]) => BADGE_LABELS[key])
    .filter(Boolean);

  const needsConfigure = module.setup?.needsAuth && !module.setup?.configured;

  return (
    <div className="p-4 bg-card rounded-lg border border-border transition-colors">
      <div className="flex items-center gap-4">
        {/* Icon + info */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {module.icon && (
            <span className="text-xl shrink-0" aria-hidden="true">{module.icon}</span>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{module.label}</span>
              <HealthDot health={module.health} />
            </div>

            <p className="text-xs text-text-tertiary mt-0.5 line-clamp-1">{module.description}</p>

            {badges.length > 0 && (
              <div className="flex items-center gap-1.5 mt-1.5">
                {badges.map((badge) => (
                  <span
                    key={badge}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium"
                  >
                    {badge}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 shrink-0">
          {needsConfigure && (
            <button
              type="button"
              onClick={() => onConfigure(module.name)}
              className="px-3 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
            >
              {t('modules.configure')}
            </button>
          )}

          {module.source === 'custom' && onRemove && (
            <button
              type="button"
              onClick={() => onRemove(module.name)}
              className="text-xs text-red-500 hover:text-red-400 transition-colors"
            >
              {t('modules.remove')}
            </button>
          )}

          <Toggle
            checked={module.enabled}
            onChange={(checked) => (checked ? onEnable(module.name) : onDisable(module.name))}
          />
        </div>
      </div>

      {module.health === 'error' && module.healthError && (
        <div className="mt-2 text-xs text-red-500 bg-red-500/10 px-3 py-1.5 rounded">
          {module.healthError}
        </div>
      )}
    </div>
  );
}
