// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useTranslation } from 'react-i18next';

interface PlainTextOutputProps {
  raw: string;
}

/** Render plain-text output (non-JSONL processes: triage, checkup, memory).
 *  Extracts human-readable info from embedded JSON when present. */
export default function PlainTextOutput({ raw }: PlainTextOutputProps) {
  const { t } = useTranslation();
  // Separate prose from JSON blocks
  const prose = raw
    .replace(/```(?:json)?\s*[\s\S]*?```/g, '')
    .replace(/^\s*[[{][\s\S]*?[\]}]\s*$/gm, '')
    .trim();

  // Try to extract useful fields from any JSON in the output
  const jsonBlocks: Record<string, unknown>[] = [];
  // Match ```json ... ``` blocks
  for (const m of raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) {
    try { jsonBlocks.push(JSON.parse(m[1])); } catch { /* parse error expected */ }
  }
  // Match bare JSON objects
  if (jsonBlocks.length === 0) {
    for (const m of raw.matchAll(/(\{[\s\S]*?\})/g)) {
      try { jsonBlocks.push(JSON.parse(m[1])); } catch { /* parse error expected */ }
    }
  }

  // Extract human-readable fields from JSON
  const infos: { label: string; value: string }[] = [];
  for (const obj of jsonBlocks) {
    // Triage response
    if ('ignore' in obj && obj.ignore) infos.push({ label: 'Verdict', value: t('terminal.ignored') });
    if ('reason' in obj && typeof obj.reason === 'string') infos.push({ label: t('terminal.reason'), value: obj.reason });
    if ('jobIds' in obj && Array.isArray(obj.jobIds) && obj.jobIds.length > 0)
      infos.push({ label: 'Jobs', value: (obj.jobIds as string[]).join(', ') });
    // Checkup response
    if ('launch' in obj && Array.isArray(obj.launch))
      infos.push({ label: t('terminal.sessionsLaunched'), value: obj.launch.length > 0 ? (obj.launch as string[]).join(', ') : t('terminal.none') });
    if ('suggestions' in obj && Array.isArray(obj.suggestions))
      infos.push({ label: 'Suggestions', value: obj.suggestions.length > 0 ? (obj.suggestions as { title: string }[]).map(s => s.title).join(', ') : t('terminal.none') });
  }

  if (!prose && infos.length === 0) return <p className="text-text-tertiary italic">{t('terminal.noOutput')}</p>;

  return (
    <div className="space-y-3">
      {prose && <div className="text-text whitespace-pre-wrap">{prose}</div>}
      {infos.length > 0 && (
        <div className="space-y-1.5 mt-2">
          {infos.map((info, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="text-text-tertiary shrink-0 w-28">{info.label}</span>
              <span className="text-text-secondary">{info.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
