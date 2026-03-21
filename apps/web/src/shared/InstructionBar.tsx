// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from './store';

interface InstructionBarProps {
  taskId: string;
}

export default function InstructionBar({ taskId }: InstructionBarProps) {
  const { t } = useTranslation();
  const [instruction, setInstruction] = useState('');
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { sendInstruction, uploadFile } = useStore();

  async function handleSend() {
    if (!instruction.trim() || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    try {
      await sendInstruction(taskId, instruction);
      setInstruction('');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(taskId, file);
    e.target.value = '';
  }

  return (
    <div className="sticky bottom-0 bg-surface border-t border-border px-3 py-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={t('instruction.placeholder')}
          className="flex-1 bg-card rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent border-none"
        />
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-7 h-7 bg-card rounded-md flex items-center justify-center text-text-tertiary hover:text-text-secondary transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <button
          onClick={handleSend}
          disabled={!instruction.trim() || sending}
          className="w-7 h-7 bg-accent rounded-md flex items-center justify-center disabled:opacity-40 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22,2 15,22 11,13 2,9" />
          </svg>
        </button>
      </div>
    </div>
  );
}