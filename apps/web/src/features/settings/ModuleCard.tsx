// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useTranslation } from 'react-i18next';
import type { ModuleInfo, PermissionLevel } from '@opentidy/shared';
import ModuleIcon from '../../shared/ModuleIcon';

interface ModuleCardProps {
  module: ModuleInfo;
  onEnable: (name: string) => void;
  onDisable: (name: string) => void;
  onConfigure: (name: string) => void;
  onInstall?: (name: string) => void;
  permissionLevel?: PermissionLevel;
  onPermissionChange?: (name: string, level: PermissionLevel) => void;
  savingPermission?: boolean;
}

export default function ModuleCard({ module, onEnable, onDisable, onConfigure, onInstall, permissionLevel, onPermissionChange, savingPermission }: ModuleCardProps) {
  const { t } = useTranslation();

  const needsSetup = module.setup?.needsAuth || (module.setup?.configFields?.length ?? 0) > 0;
  const isInstalled = module.enabled;
  const isBroken = isInstalled && module.ready === false;
  const showPermissions = isInstalled && !isBroken && permissionLevel != null && onPermissionChange;
  const capabilities = (module as any).capabilities as string[] | undefined;

  function handleInstallClick() {
    if (needsSetup && onInstall) onInstall(module.name);
    else onEnable(module.name);
  }

  const trustColor = permissionLevel === 'allow' ? 'text-green' : permissionLevel === 'confirm' ? 'text-yellow-400' : 'text-red';
  const dotColor = permissionLevel === 'allow' ? 'bg-green' : permissionLevel === 'confirm' ? 'bg-yellow-400' : 'bg-red';

  return (
    <div className={`rounded-xl overflow-hidden border transition-colors ${
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
            ? 'bg-green/8 text-green border-b border-green/15'
            : 'bg-card border-b border-border'
      }`}>
        <span>{isBroken ? t('setup.broken') : isInstalled ? t('setup.installed') : t('setup.available')}</span>
        {showPermissions && (
          <span className={`flex items-center gap-1.5 ${trustColor} font-medium normal-case tracking-normal`}>
            <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
            <select
              value={permissionLevel}
              disabled={savingPermission}
              onChange={(e) => onPermissionChange(module.name, e.target.value as PermissionLevel)}
              className="bg-transparent text-[10px] font-medium cursor-pointer appearance-none pr-3 bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%228%22%20height%3D%228%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23888%22%20stroke-width%3D%223%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[center_right] disabled:opacity-40"
            >
              <option value="allow">{t('settings.levelDesc.allow')}</option>
              <option value="confirm">{t('settings.levelDesc.confirm')}</option>
              <option value="ask">{t('settings.levelDesc.ask')}</option>
            </select>
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-4">
        {/* Header: icon + name */}
        <div className="flex items-center gap-3 mb-2">
          <ModuleIcon name={module.name} size={28} />
          <span className="font-semibold text-[15px]">{module.label}</span>
        </div>

        {/* Description */}
        <p className="text-xs text-text-tertiary mb-3 leading-relaxed">{module.description}</p>

        {/* Capabilities */}
        {capabilities && capabilities.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {capabilities.map((cap) => (
              <span key={cap} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-surface border border-border">
                <span className={isInstalled ? 'text-green text-[10px]' : 'text-text-tertiary text-[10px]'}>{isInstalled ? '✓' : '○'}</span>
                {cap}
              </span>
            ))}
          </div>
        )}

        {/* Action */}
        <div className="flex justify-end">
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
