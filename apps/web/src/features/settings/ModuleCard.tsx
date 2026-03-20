// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useTranslation } from 'react-i18next';
import type { ModuleInfo } from '@opentidy/shared';

interface ModuleCardProps {
  module: ModuleInfo;
  onEnable: (name: string) => void;
  onDisable: (name: string) => void;
  onConfigure: (name: string) => void;
  onInstall?: (name: string) => void;
}

const BADGE_LABELS: Record<string, string> = {
  mcpServers: 'MCP',
  skills: 'Skill',
  receivers: 'Receiver',
};

export default function ModuleCard({ module, onEnable, onDisable, onConfigure, onInstall }: ModuleCardProps) {
  const { t } = useTranslation();

  const badges = Object.entries(module.components)
    .filter(([, items]) => items.length > 0)
    .map(([key]) => BADGE_LABELS[key])
    .filter(Boolean);

  const needsSetup = module.setup?.needsAuth || (module.setup?.configFields?.length ?? 0) > 0;
  const isInstalled = module.enabled;

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
              {isInstalled && (
                <span className="flex items-center gap-1 text-xs font-medium text-green-400">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20,6 9,17 4,12" /></svg>
                  {t('setup.installed')}
                </span>
              )}
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
          {module.core ? (
            <span className="text-xs font-medium text-fg-muted">{t('setup.required')}</span>
          ) : isInstalled ? (
            <button
              type="button"
              onClick={() => onDisable(module.name)}
              className="shrink-0 rounded-lg border border-red-500/30 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
            >
              {t('setup.uninstall')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (needsSetup && onInstall) {
                  onInstall(module.name);
                } else {
                  onEnable(module.name);
                }
              }}
              className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              {t('setup.install')}
            </button>
          )}
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
