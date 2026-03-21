// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useProcessOutput } from '../../shared/store';

interface LiveProcessOutputProps {
  trackId: number;
  processType?: string;
}

export default function LiveProcessOutput({ trackId, processType }: LiveProcessOutputProps) {
  const { t } = useTranslation();
  const output = useProcessOutput(trackId);
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [output]);

  return (
    <div className="h-full overflow-y-auto bg-[#0f0f11] rounded-lg p-3 font-mono text-xs text-text-secondary">
      {!output && processType && (
        <div className="text-text-tertiary italic">
          <p className="animate-pulse mb-2">{t('terminal.inProgress')}</p>
          <p className="text-xs">{t('terminal.outputAtEnd', { type: processType })}</p>
        </div>
      )}
      {!output && !processType && <p className="text-text-tertiary italic animate-pulse">{t('terminal.waiting')}</p>}
      <pre className="text-text whitespace-pre-wrap">{output}</pre>
      <div ref={bottomRef} />
    </div>
  );
}
