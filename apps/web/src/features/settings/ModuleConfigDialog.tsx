// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ModuleInfo, ConfigField } from '@opentidy/shared';
import { TerminalDrawer } from '../../shared/TerminalDrawer';

interface ModuleConfigDialogProps {
  module: ModuleInfo;
  open: boolean;
  onClose: () => void;
  onSave: (name: string, config: Record<string, unknown>) => Promise<void>;
}

function buildInitialValues(fields: ConfigField[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    values[field.key] = '';
  }
  return values;
}

function PasswordInput({ value, onChange, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-card rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-tertiary border-none focus:outline-none focus:ring-1 focus:ring-accent pr-10"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors p-1"
      >
        {visible ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

function renderField(
  field: ConfigField,
  value: unknown,
  onChange: (key: string, value: unknown) => void,
) {
  const strValue = String(value ?? '');

  switch (field.type) {
    case 'password':
      return (
        <PasswordInput
          value={strValue}
          onChange={(v) => onChange(field.key, v)}
          placeholder={field.placeholder}
        />
      );
    case 'select':
      return (
        <select
          value={strValue}
          onChange={(e) => onChange(field.key, e.target.value)}
          className="w-full bg-card rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-tertiary border-none focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="">{field.placeholder || '---'}</option>
          {(field.options || []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    case 'text':
    default:
      return (
        <input
          type="text"
          value={strValue}
          onChange={(e) => onChange(field.key, e.target.value)}
          placeholder={field.placeholder}
          className="w-full bg-card rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-tertiary border-none focus:outline-none focus:ring-1 focus:ring-accent"
        />
      );
  }
}

export default function ModuleConfigDialog({
  module,
  open,
  onClose,
  onSave,
}: ModuleConfigDialogProps) {
  const { t } = useTranslation();
  const fields = module.setup?.configFields ?? [];
  const [values, setValues] = useState<Record<string, unknown>>(() => buildInitialValues(fields));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);

  if (!open) return null;

  function handleFieldChange(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSave(module.name, values);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
        <div
          className="bg-surface rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg font-semibold mb-4">
            {t('modules.configureTitle', { label: module.label })}
          </h3>

          {module.setup?.authCommand && (
            <button
              type="button"
              onClick={() => setTerminalOpen(true)}
              className="w-full mb-4 px-4 py-2.5 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors flex items-center justify-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4,17 10,11 4,5" />
                <line x1="12" y1="19" x2="20" y2="19" />
              </svg>
              {t('modules.connect')}
            </button>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {fields.map((field) => (
              <div key={field.key}>
                <label className="text-sm text-text-secondary">
                  {field.label}
                  {field.required && <span className="text-red ml-0.5">*</span>}
                </label>
                <div className="mt-1">
                  {renderField(field, values[field.key], handleFieldChange)}
                </div>
              </div>
            ))}

            {error && (
              <div className="text-red text-sm p-3 bg-red/10 rounded-lg">{error}</div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="bg-card text-text-secondary rounded-lg px-3.5 py-1.5 text-xs transition-colors"
              >
                {t('modules.cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="bg-accent text-white font-semibold rounded-lg px-3.5 py-1.5 text-xs disabled:opacity-50 transition-colors"
              >
                {submitting ? t('common.loading') : t('modules.save')}
              </button>
            </div>
          </form>
        </div>
      </div>

      {module.setup?.authCommand && (
        <TerminalDrawer
          open={terminalOpen}
          title={module.label}
          moduleName={module.name}
          onClose={() => setTerminalOpen(false)}
        />
      )}
    </>
  );
}
