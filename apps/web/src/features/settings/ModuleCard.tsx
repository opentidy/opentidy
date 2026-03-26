// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useTranslation } from 'react-i18next';
import type { ModuleInfo, ToolDef } from '@opentidy/shared';
import ModuleIcon from '../../shared/ModuleIcon';

interface ModuleCardProps {
  module: ModuleInfo;
  onEnable: (name: string) => void;
  onDisable: (name: string) => void;
  onInstall?: (name: string) => void;
}

export default function ModuleCard({ module, onEnable, onDisable, onInstall }: ModuleCardProps) {
  const { t } = useTranslation();

  const needsSetup = module.setup?.needsAuth || (module.setup?.configFields?.length ?? 0) > 0;
  const isInstalled = module.enabled;
  const isBroken = isInstalled && module.ready === false;

  const tp = module.toolPermissions;
  const safeDefs: ToolDef[] = (tp?.safe ?? []) as ToolDef[];
  const criticalDefs: ToolDef[] = (tp?.critical ?? []) as ToolDef[];
  const allDefs = [...safeDefs, ...criticalDefs];

  const hasDaemon = !!module.components.daemon;
  const hasCaps = module.components.mcpServers.length > 0 || module.components.skills.length > 0 || module.components.receivers.length > 0 || (module.cli?.length ?? 0) > 0 || hasDaemon;

  function handleInstallClick() {
    if (needsSetup && onInstall) onInstall(module.name);
    else onEnable(module.name);
  }

  return (
    <div className={`rounded-xl border transition-colors flex flex-col ${
      isBroken
        ? 'bg-card border-red/20'
        : isInstalled
          ? 'bg-card border-border'
          : 'bg-surface border-border/60 border-dashed opacity-70'
    }`}>
      {/* Header */}
      <div className="p-4 pb-0">
        <div className="flex items-center gap-3">
          <ModuleIcon name={module.name} size={26} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{module.label}</span>
              {isBroken && (
                <span className="text-[11px] font-semibold text-red bg-red/10 px-1.5 py-0.5 rounded">{t('setup.broken')}</span>
              )}
            </div>
          </div>
          {/* Action */}
          {module.core ? (
            <span className="text-[12px] font-medium text-text-tertiary">{t('setup.required')}</span>
          ) : isBroken ? (
            <button type="button" onClick={handleInstallClick}
              className="rounded-md bg-yellow-600 px-3 py-1 text-[13px] font-medium text-white hover:opacity-90">
              {t('setup.reinstall')}
            </button>
          ) : isInstalled ? (
            <button type="button" onClick={() => onDisable(module.name)}
              className="text-[13px] text-text-tertiary hover:text-red transition-colors">
              {t('setup.uninstall')}
            </button>
          ) : (
            <button type="button" onClick={handleInstallClick}
              className="rounded-md bg-accent px-3.5 py-1 text-[13px] font-medium text-white hover:opacity-90">
              {t('setup.install')}
            </button>
          )}
        </div>
        <p className="text-[13px] text-text-secondary mt-1 leading-relaxed">{module.description}</p>
      </div>

      {/* Capabilities */}
      <div className="p-4 pt-3 flex-1 flex flex-col gap-3">
        {hasCaps && (
          <div className="flex flex-col gap-1.5">
            {module.components.mcpServers.map(s => (
              <div key={s.name} className="flex items-start gap-2 text-[13px]">
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-accent bg-accent/15 px-1.5 py-0.5 rounded mt-px">MCP</span>
                <span className="text-text font-medium">{s.name}</span>
                {s.package && <span className="text-text-secondary truncate">{s.package}</span>}
              </div>
            ))}
            {module.components.skills.map(s => (
              <div key={s.name} className="flex items-start gap-2 text-[13px]">
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-purple-400 bg-purple-400/15 px-1.5 py-0.5 rounded mt-px">Skill</span>
                <span className="text-text font-medium">{s.name}</span>
              </div>
            ))}
            {module.components.receivers.map(r => (
              <div key={r.name} className="flex items-start gap-2 text-[13px]">
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-green bg-green/15 px-1.5 py-0.5 rounded mt-px">Recv</span>
                <span className="text-text font-medium">{r.name}</span>
                <span className="text-text-secondary">{r.mode} · {r.source}</span>
              </div>
            ))}
            {module.cli?.map(name => (
              <div key={name} className="flex items-start gap-2 text-[13px]">
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-orange-400 bg-orange-400/15 px-1.5 py-0.5 rounded mt-px">CLI</span>
                <span className="text-text font-medium">{name}</span>
              </div>
            ))}
            {hasDaemon && module.components.daemon!.tools.map(label => (
              <div key={label} className="flex items-start gap-2 text-[13px]">
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-cyan-400 bg-cyan-400/15 px-1.5 py-0.5 rounded mt-px">Tool</span>
                <span className="text-text font-medium">{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Tool preview for non-installed modules */}
        {!isInstalled && allDefs.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {allDefs.map(def => (
              <span key={def.tool} className="text-[12px] px-2 py-0.5 rounded bg-surface border border-border text-text-secondary">{def.label}</span>
            ))}
          </div>
        )}
      </div>

      {module.health === 'error' && module.healthError && (
        <div className="px-4 pb-3 text-[13px] text-red">{module.healthError}</div>
      )}
    </div>
  );
}
