// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

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

const SELECT_CLASSES = "bg-transparent text-[10px] font-medium cursor-pointer appearance-none pr-3 bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%228%22%20height%3D%228%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23888%22%20stroke-width%3D%223%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[center_right] disabled:opacity-40";

function levelColor(level: PermissionLevel) {
  if (level === 'allow') return { text: 'text-green', dot: 'bg-green' };
  if (level === 'ask') return { text: 'text-yellow-400', dot: 'bg-yellow-400' };
  return { text: 'text-red', dot: 'bg-red' };
}

export default function ModuleCard({ module, onEnable, onDisable, onConfigure, onInstall, permissionLevels, onPermissionChange, savingPermission }: ModuleCardProps) {
  const { t } = useTranslation();

  const needsSetup = module.setup?.needsAuth || (module.setup?.configFields?.length ?? 0) > 0;
  const isInstalled = module.enabled;
  const isBroken = isInstalled && module.ready === false;

  const tp = module.toolPermissions;
  const safeDefs: ToolDef[] = (tp?.safe ?? []) as ToolDef[];
  const criticalDefs: ToolDef[] = (tp?.critical ?? []) as ToolDef[];
  const hasPermissions = isInstalled && !isBroken && permissionLevels && onPermissionChange && (safeDefs.length > 0 || criticalDefs.length > 0);

  function handleInstallClick() {
    if (needsSetup && onInstall) onInstall(module.name);
    else onEnable(module.name);
  }

  function getToolLevel(toolName: string, groupLevel: PermissionLevel): PermissionLevel {
    return permissionLevels?.overrides?.[toolName] ?? groupLevel;
  }

  function isOverridden(toolName: string): boolean {
    return permissionLevels?.overrides?.[toolName] != null;
  }

  function renderToolChip(def: ToolDef, groupKey: 'safe' | 'critical', groupLevel: PermissionLevel) {
    const effectiveLevel = getToolLevel(def.tool, groupLevel);
    const overridden = isOverridden(def.tool);
    const colors = levelColor(effectiveLevel);

    return (
      <span key={def.tool} className="group relative flex items-center gap-1 text-[11px] pl-1.5 pr-1 py-0.5 rounded bg-surface border border-border">
        <span className={`${overridden ? colors.dot : 'bg-green'} w-1.5 h-1.5 rounded-full`} />
        <span className={overridden ? 'text-text' : ''}>{def.label}</span>
        {/* Per-tool override dropdown */}
        <select
          value={overridden ? effectiveLevel : ''}
          disabled={savingPermission}
          onChange={(e) => {
            const val = e.target.value;
            if (val === '') {
              // Remove override — revert to group level
              if (permissionLevels?.overrides?.[def.tool]) {
                const newOverrides = { ...permissionLevels.overrides };
                delete newOverrides[def.tool];
                // Save without this override by setting group level explicitly
                onPermissionChange!(module.name, groupKey, groupLevel);
              }
            } else {
              onPermissionChange!(module.name, def.tool, val as PermissionLevel);
            }
          }}
          className={`${SELECT_CLASSES} w-4 opacity-0 group-hover:opacity-60 transition-opacity ${overridden ? '!opacity-100 ' + colors.text : ''}`}
          title={def.tool}
        >
          <option value="">{t('settings.levelDesc.inherit')}</option>
          <option value="allow">{t('settings.levelDesc.allow')}</option>
          <option value="ask">{t('settings.levelDesc.ask')}</option>
          <option value="block">{t('settings.levelDesc.block')}</option>
        </select>
      </span>
    );
  }

  function renderCapGroup(groupKey: 'safe' | 'critical', groupLevel: PermissionLevel, defs: ToolDef[]) {
    if (defs.length === 0) return null;
    const colors = levelColor(groupLevel);
    return (
      <div className="flex flex-col gap-1.5">
        <span className={`flex items-center gap-1.5 ${colors.text} text-[10px] font-medium`}>
          <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
          <select
            value={groupLevel}
            disabled={savingPermission}
            onChange={(e) => onPermissionChange!(module.name, groupKey, e.target.value as PermissionLevel)}
            className={`${SELECT_CLASSES} ${colors.text}`}
          >
            <option value="allow">{t('settings.levelDesc.allow')}</option>
            <option value="ask">{t('settings.levelDesc.ask')}</option>
            <option value="block">{t('settings.levelDesc.block')}</option>
          </select>
        </span>
        <div className="flex flex-wrap gap-1.5">
          {defs.map((def) => renderToolChip(def, groupKey, groupLevel))}
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl overflow-hidden border transition-colors flex flex-col ${
      isInstalled && !isBroken
        ? 'bg-card border-border'
        : isBroken
          ? 'bg-red/5 border-red/20'
          : 'bg-surface border-border border-dashed opacity-60'
    }`}>
      {/* Status strip */}
      <div className={`flex items-center justify-between px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide ${
        isBroken
          ? 'bg-red/10 text-red border-b border-red/20'
          : isInstalled
            ? 'text-green border-b border-border'
            : 'bg-card border-b border-border text-text-tertiary'
      }`}>
        <span>{isBroken ? t('setup.broken') : isInstalled ? t('setup.installed') : t('setup.available')}</span>
      </div>

      {/* Body */}
      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-center gap-3 mb-2">
          <ModuleIcon name={module.name} size={28} />
          <span className="font-semibold text-[15px]">{module.label}</span>
        </div>

        <p className="text-xs text-text-tertiary mb-3 leading-relaxed">{module.description}</p>

        {/* Capabilities — what this module contains and does */}
        {(module.components.mcpServers.length > 0 || module.components.skills.length > 0 || module.components.receivers.length > 0) && (
          <div className="mb-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">{t('settings.capabilities')}</span>
            <div className="flex flex-col gap-1.5 mt-1.5">
              {module.components.mcpServers.length > 0 && (
                <div className="flex items-start gap-2 text-[11px]">
                  <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-accent/60 bg-accent/8 px-1.5 py-0.5 rounded mt-px">MCP</span>
                  <span className="text-text-tertiary">{t(`settings.mcp.${module.name}`, { defaultValue: t('settings.mcp.default', { label: module.label }) })}</span>
                </div>
              )}
              {module.components.skills.length > 0 && (
                <div className="flex items-start gap-2 text-[11px]">
                  <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-purple-400/70 bg-purple-400/8 px-1.5 py-0.5 rounded mt-px">Skill</span>
                  <span className="text-text-tertiary">{t(`settings.skill.${module.name}`, { defaultValue: t('settings.skill.default', { label: module.label }) })}</span>
                </div>
              )}
              {module.components.receivers.length > 0 && (
                <div className="flex items-start gap-2 text-[11px]">
                  <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-green/70 bg-green/8 px-1.5 py-0.5 rounded mt-px">Receiver</span>
                  <span className="text-text-tertiary">{t(`settings.receiver.${module.name}`, { defaultValue: t('settings.receiver.default', { label: module.label }) })}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Capabilities grouped by permission level */}
        {hasPermissions && (
          <div className="flex flex-col gap-3 mb-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">{t('settings.permissionsTitle')}</span>
            {renderCapGroup('safe', permissionLevels.safe, safeDefs)}
            {renderCapGroup('critical', permissionLevels.critical, criticalDefs)}
          </div>
        )}

        {/* Not-installed modules: show tool labels as preview */}
        {!isInstalled && (safeDefs.length > 0 || criticalDefs.length > 0) && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {[...safeDefs, ...criticalDefs].map((def) => (
              <span key={def.tool} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-surface border border-border">
                <span className="text-text-tertiary text-[10px]">○</span>
                {def.label}
              </span>
            ))}
          </div>
        )}

        {/* Action — pinned to bottom */}
        <div className="flex justify-end mt-auto pt-2">
          {module.core ? (
            <span className="text-[11px] font-medium text-text-tertiary">{t('setup.required')}</span>
          ) : isBroken ? (
            <button type="button" onClick={handleInstallClick}
              className="rounded-lg bg-yellow-600 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
              {t('setup.reinstall')}
            </button>
          ) : isInstalled ? (
            <button type="button" onClick={() => onDisable(module.name)}
              className="text-xs text-text-tertiary hover:text-red transition-colors px-2 py-1">
              {t('setup.uninstall')}
            </button>
          ) : (
            <button type="button" onClick={handleInstallClick}
              className="rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-white hover:opacity-90">
              {t('setup.install')}
            </button>
          )}
        </div>
      </div>

      {module.health === 'error' && module.healthError && (
        <div className="px-4 pb-3 text-xs text-red">{module.healthError}</div>
      )}
    </div>
  );
}
