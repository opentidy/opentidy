// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface WelcomeCardProps {
  onDismiss?: () => void;
}

const pillars = [
  { icon: '📋', titleKey: 'onboarding.pillarTasksTitle', descKey: 'onboarding.pillarTasksDescription' },
  { icon: '🤖', titleKey: 'onboarding.pillarAutoTitle', descKey: 'onboarding.pillarAutoDescription' },
  { icon: '✋', titleKey: 'onboarding.pillarControlTitle', descKey: 'onboarding.pillarControlDescription' },
] as const;

export default function WelcomeCard({ onDismiss }: WelcomeCardProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="bg-card border border-border rounded-2xl p-6 md:p-8 mb-8">
      <h2 className="text-lg font-bold text-text mb-2">{t('onboarding.welcomeTitle')}</h2>
      <p className="text-text-secondary text-sm mb-6">{t('onboarding.welcomeDescription')}</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {pillars.map(({ icon, titleKey, descKey }) => (
          <div key={titleKey} className="bg-bg rounded-xl p-4 text-center">
            <span className="text-2xl mb-2 block">{icon}</span>
            <p className="font-semibold text-text text-sm mb-1">{t(titleKey)}</p>
            <p className="text-text-tertiary text-xs">{t(descKey)}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/nouveau')}
          className="px-5 py-2.5 rounded-lg bg-green text-white text-sm font-medium hover:bg-green/90 transition-colors"
        >
          {t('onboarding.createFirstTask')}
        </button>
        <button
          onClick={onDismiss}
          className="text-sm text-text-tertiary hover:text-text-secondary transition-colors"
        >
          {t('onboarding.explore')}
        </button>
      </div>
    </div>
  );
}
