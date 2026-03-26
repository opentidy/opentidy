// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState, useEffect, useRef } from 'react';

interface HelpTooltipProps {
  text: string;
}

export default function HelpTooltip({ text }: HelpTooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex items-center">
      <button
        onClick={() => setOpen(!open)}
        className="w-4 h-4 rounded-full border border-text-tertiary/30 text-text-tertiary text-[12px] leading-none flex items-center justify-center hover:border-accent hover:text-accent transition-colors"
      >
        ?
      </button>
      {open && (
        <span className="absolute left-6 top-1/2 -translate-y-1/2 bg-card border border-border rounded-lg px-3 py-2 text-xs text-text-secondary shadow-lg whitespace-nowrap z-50">
          {text}
        </span>
      )}
    </span>
  );
}
