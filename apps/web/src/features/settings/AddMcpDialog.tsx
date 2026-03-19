// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState } from 'react';
import type { McpConfigV2 } from '@opentidy/shared';

const BASE = '/api';

interface EnvVarDef {
  name: string;
  description?: string;
  isRequired?: boolean;
  isSecret?: boolean;
}

interface Preset {
  name: string;
  label: string;
  command: string;
  args: string;
  envVars: EnvVarDef[];
}

interface Props {
  preset?: Preset;
  onClose: () => void;
  onAdded: (mcp: McpConfigV2) => void;
}

export default function AddMcpDialog({ preset, onClose, onAdded }: Props) {
  const [name, setName] = useState(preset?.name || '');
  const [label, setLabel] = useState(preset?.label || '');
  const [command, setCommand] = useState(preset?.command || 'npx');
  const [args, setArgs] = useState(preset?.args || '');
  const [envValues, setEnvValues] = useState<Record<string, string>>(
    () => Object.fromEntries((preset?.envVars || []).map(v => [v.name, '']))
  );
  const [customEnv, setCustomEnv] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const envVarDefs = preset?.envVars || [];
  const isFromRegistry = !!preset;

  function updateEnvValue(key: string, value: string) {
    setEnvValues(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    // Build env object from structured inputs + custom textarea
    const envObj: Record<string, string> = {};
    for (const [k, v] of Object.entries(envValues)) {
      if (v.trim()) envObj[k] = v.trim();
    }
    for (const line of customEnv.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        envObj[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
      }
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    try {
      const res = await fetch(`${BASE}/mcp/marketplace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: slug,
          label: label || name,
          command,
          args: args.split(' ').filter(Boolean),
          permissions: [`mcp__${slug}__*`],
          source: isFromRegistry ? 'registry.modelcontextprotocol.io' as const : 'custom' as const,
          ...(Object.keys(envObj).length > 0 ? { env: envObj } : {}),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `${res.status}`);
      }

      const updated = await res.json();
      onAdded(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-1">
          {isFromRegistry ? 'Add from Registry' : 'Add Custom MCP Server'}
        </h3>
        {isFromRegistry && (
          <p className="text-xs text-text-tertiary mb-3">{preset.name}</p>
        )}

        <div className="bg-amber-500/10 text-amber-600 text-xs p-3 rounded-lg mb-4">
          {isFromRegistry
            ? 'This server comes from the MCP registry. OpenTidy does not verify community servers. Check the source code before enabling.'
            : 'Custom MCP servers run with full system access. Use at your own risk.'}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {!isFromRegistry && (
            <>
              <div>
                <label className="text-sm text-text-secondary">Name</label>
                <input value={name} onChange={e => setName(e.target.value)} required
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm"
                  placeholder="notion" />
              </div>
              <div>
                <label className="text-sm text-text-secondary">Label</label>
                <input value={label} onChange={e => setLabel(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm"
                  placeholder="Notion" />
              </div>
            </>
          )}

          <div>
            <label className="text-sm text-text-secondary">Command</label>
            <input value={command} onChange={e => setCommand(e.target.value)} required
              readOnly={isFromRegistry}
              className={`w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono ${isFromRegistry ? 'opacity-60' : ''}`} />
          </div>
          <div>
            <label className="text-sm text-text-secondary">Arguments</label>
            <input value={args} onChange={e => setArgs(e.target.value)}
              readOnly={isFromRegistry}
              className={`w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono ${isFromRegistry ? 'opacity-60' : ''}`} />
          </div>

          {/* Structured env vars from registry */}
          {envVarDefs.length > 0 && (
            <div>
              <label className="text-sm text-text-secondary">Required configuration</label>
              <div className="mt-1 space-y-2">
                {envVarDefs.map(v => (
                  <div key={v.name}>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-mono text-text-tertiary">{v.name}</span>
                      {v.isRequired && <span className="text-red-400 text-xs">*</span>}
                    </div>
                    {v.description && (
                      <p className="text-[10px] text-text-tertiary">{v.description}</p>
                    )}
                    <input
                      value={envValues[v.name] || ''}
                      onChange={e => updateEnvValue(v.name, e.target.value)}
                      type={v.isSecret ? 'password' : 'text'}
                      required={v.isRequired}
                      className="w-full mt-0.5 px-3 py-1.5 bg-background border border-border rounded-lg text-sm font-mono"
                      placeholder={v.isSecret ? '••••••••' : v.name}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Custom env for manual mode */}
          {!isFromRegistry && (
            <div>
              <label className="text-sm text-text-secondary">Environment variables (KEY=VALUE, one per line)</label>
              <textarea value={customEnv} onChange={e => setCustomEnv(e.target.value)} rows={3}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono"
                placeholder="API_KEY=..." />
            </div>
          )}

          {error && <div className="text-red-500 text-sm">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg hover:bg-card-hover">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50">
              {submitting ? 'Adding...' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
