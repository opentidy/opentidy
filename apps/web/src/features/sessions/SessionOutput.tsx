// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSessionOutput } from '../../shared/store';

export function SessionOutput({ taskId }: { taskId: string }) {
  const { t } = useTranslation();
  const lines = useSessionOutput(taskId);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length]);

  return (
    <div className="h-full bg-bg font-mono text-sm overflow-y-auto p-4">
      {lines.length === 0 && (
        <p className="text-text-tertiary italic">{t('sessionOutput.waiting')}</p>
      )}
      {lines.map((line, i) => (
        <div key={i} className="flex gap-2 py-0.5">
          <span className="text-text-tertiary shrink-0 text-xs">{line.time}</span>
          {line.type === 'tool_use' ? (
            <span className="text-accent">▶ {line.content}</span>
          ) : (
            <span className="text-text whitespace-pre-wrap">{line.content}</span>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}