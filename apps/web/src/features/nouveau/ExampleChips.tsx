// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useTranslation } from 'react-i18next';

interface ExampleChipsProps {
  onSelect: (text: string) => void;
}

const examples = [
  { labelKey: 'nouveau.exampleSell', fullKey: 'nouveau.exampleSellFull' },
  { labelKey: 'nouveau.exampleInvoice', fullKey: 'nouveau.exampleInvoiceFull' },
  { labelKey: 'nouveau.exampleInsurance', fullKey: 'nouveau.exampleInsuranceFull' },
  { labelKey: 'nouveau.exampleDoctor', fullKey: 'nouveau.exampleDoctorFull' },
] as const;

export default function ExampleChips({ onSelect }: ExampleChipsProps) {
  const { t } = useTranslation();

  return (
    <div className="mb-4">
      <p className="text-xs text-text-tertiary mb-2">{t('nouveau.tryExample')}</p>
      <div className="flex flex-wrap gap-2">
        {examples.map(({ labelKey, fullKey }) => (
          <button
            key={labelKey}
            onClick={() => onSelect(t(fullKey))}
            className="px-3 py-1.5 rounded-full border border-border text-xs text-text-secondary hover:border-accent hover:text-accent transition-colors"
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
