// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from './store';

interface InstructionBarProps {
  dossierId: string;
}

export default function InstructionBar({ dossierId }: InstructionBarProps) {
  const { t } = useTranslation();
  const [instruction, setInstruction] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { sendInstruction, uploadFile } = useStore();

  async function handleSend() {
    if (!instruction.trim() || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    try {
      await sendInstruction(dossierId, instruction, confirm);
      setInstruction('');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(dossierId, file);
    e.target.value = '';
  }

  return (
    <div className="sticky bottom-0 bg-card border-t border-border p-4">
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={t('instruction.placeholder')}
          className="flex-1 bg-bg border border-border rounded-lg px-4 py-2.5 text-sm text-text placeholder:text-text-tertiary outline-none focus:border-accent"
        />
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2.5 rounded-lg border border-border text-text-tertiary hover:bg-card-hover transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <button
          onClick={handleSend}
          disabled={!instruction.trim() || sending}
          className="px-4 py-2.5 rounded-lg bg-red text-white text-sm font-medium hover:bg-red/90 disabled:opacity-50 transition-colors"
        >
          {t('common.send')}
        </button>
      </div>
      <label className="flex items-center gap-2 mt-2 text-xs text-text-tertiary cursor-pointer">
        <input
          type="checkbox"
          checked={confirm}
          onChange={(e) => setConfirm(e.target.checked)}
          className="rounded border-border"
        />
        {t('instruction.confirmMode')}
      </label>
    </div>
  );
}