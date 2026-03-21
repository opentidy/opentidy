// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ModuleInfo, PermissionLevel, ModulePermissionLevel, ToolDef } from '@opentidy/shared';
import ModuleIcon from '../../shared/ModuleIcon';

interface ModuleCardProps {
  module: ModuleInfo;
  onEnable: (name: string) => void;
  onDisable: (name: string) => void;
  onConfigure: (name: string) => void;
  onInstall?: (name: string) => void;
  permissionLevels?: ModulePermissionLevel;
  onPermissionChange?: (name: string, key: 'safe' | 'critical' | string, level: PermissionLevel) => void;
  savingPermission?: boolean;
}

const LEVELS: PermissionLevel[] = ['allow', 'ask', 'block'];

function levelColor(level: PermissionLevel) {
  if (level === 'allow') return { text: 'text-green', dot: 'bg-green', ring: 'border-green bg-green' };
  if (level === 'ask') return { text: 'text-yellow-400', dot: 'bg-yellow-400', ring: 'border-yellow-400 bg-yellow-400' };
  return { text: 'text-red', dot: 'bg-red', ring: 'border-red bg-red' };
}

export default function ModuleCard({ module, onEnable, onDisable, onConfigure, onInstall, permissionLevels, onPermissionChange, savingPermission }: ModuleCardProps) {
  const { t } = useTranslation();
  const [permExpanded, setPermExpanded] = useState(false);

  const needsSetup = module.setup?.needsAuth || (module.setup?.configFields?.length ?? 0) > 0;
  const isInstalled = module.enabled;
  const isBroken = isInstalled && module.ready === false;

  const tp = module.toolPermissions;
  const safeDefs: ToolDef[] = (tp?.safe ?? []) as ToolDef[];
  const criticalDefs: ToolDef[] = (tp?.critical ?? []) as ToolDef[];
  const allDefs = [...safeDefs, ...criticalDefs];
  const hasPermissions = isInstalled && !isBroken && permissionLevels && onPermissionChange && allDefs.length > 0;
  const hasOverrides = permissionLevels?.overrides && Object.keys(permissionLevels.overrides).length > 0;
  const isCustom = hasPermissions && !!hasOverrides;

  const hasCaps = module.components.mcpServers.length > 0 || module.components.skills.length > 0 || module.components.receivers.length > 0;

  function handleInstallClick() {
    if (needsSetup && onInstall) onInstall(module.name);
    else onEnable(module.name);
  }

  function getPermSummary(): { label: string; level: PermissionLevel } {
    if (!permissionLevels) return { label: t('settings.levelDesc.allow'), level: 'allow' };
    if (isCustom) return { label: t('settings.permCustom'), level: permissionLevels.critical };
    if (permissionLevels.safe === permissionLevels.critical) {
      return { label: t(`settings.levelDesc.${permissionLevels.safe}`), level: permissionLevels.safe };
    }
    // Mixed: show the more restrictive level (critical)
    return { label: t(`settings.levelDesc.${permissionLevels.critical}`), level: permissionLevels.critical };
  }

  function getToolLevel(def: ToolDef): PermissionLevel {
    if (permissionLevels?.overrides?.[def.tool]) return permissionLevels.overrides[def.tool];
    const isSafe = safeDefs.some(d => d.tool === def.tool);
    return isSafe ? (permissionLevels?.safe ?? 'allow') : (permissionLevels?.critical ?? 'ask');
  }

  function getGroupKey(def: ToolDef): 'safe' | 'critical' {
    return safeDefs.some(d => d.tool === def.tool) ? 'safe' : 'critical';
  }

  function handleRadioClick(def: ToolDef, level: PermissionLevel) {
    onPermissionChange!(module.name, def.tool, level);
  }

  return (
    <div className={`rounded-xl border transition-colors flex flex-col ${
      isBroken
        ? 'bg-card border-red/20'
        : isInstalled
          ? 'bg-card border-border'
          : 'bg-surface border-border/60 border-dashed opacity-55'
    }`}>
      {/* Header */}
      <div className="p-4 pb-0">
        <div className="flex items-center gap-3">
          <ModuleIcon name={module.name} size={26} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{module.label}</span>
              {isBroken && (
                <span className="text-[9px] font-semibold text-red bg-red/10 px-1.5 py-0.5 rounded">{t('setup.broken')}</span>
              )}
            </div>
          </div>
          {/* Action */}
          {module.core ? (
            <span className="text-[10px] font-medium text-text-tertiary">{t('setup.required')}</span>
          ) : isBroken ? (
            <button type="button" onClick={handleInstallClick}
              className="rounded-md bg-yellow-600 px-3 py-1 text-[11px] font-medium text-white hover:opacity-90">
              {t('setup.reinstall')}
            </button>
          ) : isInstalled ? (
            <button type="button" onClick={() => onDisable(module.name)}
              className="text-[11px] text-text-tertiary hover:text-red transition-colors">
              {t('setup.uninstall')}
            </button>
          ) : (
            <button type="button" onClick={handleInstallClick}
              className="rounded-md bg-accent px-3.5 py-1 text-[11px] font-medium text-white hover:opacity-90">
              {t('setup.install')}
            </button>
          )}
        </div>
        <p className="text-[11px] text-text-tertiary mt-1 leading-relaxed">{module.description}</p>
      </div>

      {/* Capabilities + Permissions */}
      <div className="p-4 pt-3 flex-1 flex flex-col gap-3">
        {/* Capabilities */}
        {hasCaps && (
          <div className="flex flex-col gap-1">
            {module.components.mcpServers.length > 0 && (
              <div className="flex items-start gap-2 text-[11px]">
                <span className="shrink-0 text-[8px] font-bold uppercase tracking-wider text-accent/50 bg-accent/6 px-1.5 py-0.5 rounded mt-px">MCP</span>
                <span className="text-text-tertiary">{t(`settings.mcp.${module.name}`, { defaultValue: t('settings.mcp.default', { label: module.label }) })}</span>
              </div>
            )}
            {module.components.skills.length > 0 && (
              <div className="flex items-start gap-2 text-[11px]">
                <span className="shrink-0 text-[8px] font-bold uppercase tracking-wider text-purple-400/60 bg-purple-400/6 px-1.5 py-0.5 rounded mt-px">Skill</span>
                <span className="text-text-tertiary">{t(`settings.skill.${module.name}`, { defaultValue: t('settings.skill.default', { label: module.label }) })}</span>
              </div>
            )}
            {module.components.receivers.length > 0 && (
              <div className="flex items-start gap-2 text-[11px]">
                <span className="shrink-0 text-[8px] font-bold uppercase tracking-wider text-green/60 bg-green/6 px-1.5 py-0.5 rounded mt-px">Recv</span>
                <span className="text-text-tertiary">{t(`settings.receiver.${module.name}`, { defaultValue: t('settings.receiver.default', { label: module.label }) })}</span>
              </div>
            )}
          </div>
        )}

        {/* Permissions — collapsible radio matrix */}
        {hasPermissions && (() => {
          const summary = getPermSummary();
          const sc = levelColor(summary.level);
          return (
            <div>
              <button
                type="button"
                onClick={() => setPermExpanded(!permExpanded)}
                className="flex items-center gap-2 w-full text-left"
              >
                <span className="text-[10px] font-semibold text-text-tertiary">{t('settings.permissionsTitle')}</span>
                <span className={`flex items-center gap-1 text-[10px] font-medium ${sc.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                  {summary.label}
                </span>
                {isCustom && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-400/8 text-yellow-400/80 font-medium">{t('settings.permCustom')}</span>
                )}
                <svg className={`ml-auto w-3 h-3 text-text-tertiary transition-transform ${permExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              </button>

              {permExpanded && (
                <div className="mt-2 rounded-lg border border-border overflow-hidden text-[11px]">
                  <div className="grid grid-cols-[1fr_52px_52px_52px] border-b border-border bg-surface/30">
                    <span className="px-3 py-1.5 text-[9px] font-semibold text-text-tertiary">{t('settings.permTool')}</span>
                    {LEVELS.map(l => (
                      <span key={l} className={`text-center py-1.5 text-[9px] font-semibold ${levelColor(l).text}`}>
                        {t(`settings.levelDesc.${l}`)}
                      </span>
                    ))}
                  </div>
                  {allDefs.map((def, i) => {
                    const current = getToolLevel(def);
                    const groupKey = getGroupKey(def);
                    const groupLevel = groupKey === 'safe' ? permissionLevels.safe : permissionLevels.critical;
                    const overridden = permissionLevels.overrides?.[def.tool] != null;
                    return (
                      <div key={def.tool} className={`grid grid-cols-[1fr_52px_52px_52px] ${
                        i < allDefs.length - 1 ? 'border-b border-border/30' : ''
                      } ${overridden ? 'bg-yellow-400/[0.03]' : ''}`}>
                        <span className={`px-3 py-1.5 ${overridden ? 'text-text font-medium' : 'text-text-secondary'}`}>{def.label}</span>
                        {LEVELS.map(l => (
                          <button key={l} type="button" disabled={savingPermission}
                            onClick={() => handleRadioClick(def, l)}
                            className="flex items-center justify-center py-2 px-2 hover:bg-white/[0.04] disabled:opacity-40 cursor-pointer">
                            <span className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                              current === l
                                ? `${levelColor(l).ring} shadow-[inset_0_0_0_2px_var(--color-card)]`
                                : 'border-border'
                            }`} />
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* Not-installed: tool preview */}
        {!isInstalled && allDefs.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {allDefs.map(def => (
              <span key={def.tool} className="text-[10px] px-2 py-0.5 rounded bg-surface border border-border text-text-tertiary">{def.label}</span>
            ))}
          </div>
        )}
      </div>

      {module.health === 'error' && module.healthError && (
        <div className="px-4 pb-3 text-[11px] text-red">{module.healthError}</div>
      )}
    </div>
  );
}
