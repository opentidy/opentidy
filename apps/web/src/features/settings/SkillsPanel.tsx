// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { SkillsConfig, CuratedSkillState } from '@opentidy/shared';

const BASE = '/api';

async function fetchSkills(): Promise<SkillsConfig> {
  const res = await fetch(`${BASE}/skills`);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function toggleCurated(name: string): Promise<SkillsConfig> {
  const res = await fetch(`${BASE}/skills/curated/${name}/toggle`, { method: 'POST' });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function addUserSkill(body: { name: string; source: string; enabled: boolean }): Promise<SkillsConfig> {
  const res = await fetch(`${BASE}/skills/user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function removeUserSkill(name: string): Promise<SkillsConfig> {
  const res = await fetch(`${BASE}/skills/user/${name}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

function Toggle({ enabled, onClick }: { enabled: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-10 h-5 rounded-full relative transition-colors ${enabled ? 'bg-accent' : 'bg-border'}`}>
      <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${enabled ? 'right-0.5' : 'left-0.5'}`} />
    </button>
  );
}

export default function SkillsPanel() {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<SkillsConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSource, setNewSource] = useState('');

  useEffect(() => {
    fetchSkills().then(setSkills).catch(e => setError(e.message));
  }, []);

  async function handleToggle(name: string) {
    try { setSkills(await toggleCurated(name)); } catch (e) { setError((e as Error).message); }
  }

  async function handleRemove(name: string) {
    try { setSkills(await removeUserSkill(name)); } catch (e) { setError((e as Error).message); }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    try {
      const slug = newName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      setSkills(await addUserSkill({ name: slug, source: newSource, enabled: true }));
      setShowAdd(false);
      setNewName('');
      setNewSource('');
    } catch (e) { setError((e as Error).message); }
  }

  if (error && !skills) return <div className="text-red-500 text-sm p-3 bg-red-500/10 rounded-lg">{error}</div>;
  if (!skills) return <div className="text-text-tertiary text-sm animate-pulse">{t('common.loading')}</div>;

  const curatedEntries = Object.entries(skills.curated) as [string, CuratedSkillState][];
  const activeCount = curatedEntries.filter(([, s]) => s.enabled).length + skills.user.filter(s => s.enabled).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">{t('toolbox.skills')}</h2>
          <p className="text-xs text-text-tertiary">{t('toolbox.skillsActiveCount', { count: activeCount })}</p>
        </div>
      </div>

      {error && <div className="text-red-500 text-sm mb-4 p-3 bg-red-500/10 rounded-lg">{error}</div>}

      {/* Curated */}
      <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2">OpenTidy</h3>
      <div className="space-y-3 mb-6">
        {curatedEntries.map(([name, state]) => (
          <div key={name} className={`flex items-center gap-4 p-4 bg-bg rounded-lg border border-border transition-opacity ${!state.enabled ? 'opacity-60' : ''}`}>
            <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center text-accent text-sm font-mono font-bold">
              /{name.charAt(0)}
            </div>
            <div className="flex-1">
              <span className="font-medium">/{name}</span>
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent">{t('toolbox.skillBadge')}</span>
            </div>
            <Toggle enabled={state.enabled} onClick={() => handleToggle(name)} />
          </div>
        ))}
      </div>

      {/* User skills */}
      {skills.user.length > 0 && (
        <>
          <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2">{t('toolbox.userSkills')}</h3>
          <div className="space-y-3 mb-6">
            {skills.user.map((skill) => (
              <div key={skill.name} className="flex items-center gap-4 p-4 bg-bg rounded-lg border border-border">
                <div className="w-9 h-9 rounded-lg bg-card-hover flex items-center justify-center text-text-tertiary text-sm font-mono font-bold">
                  /{skill.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-medium">/{skill.name}</span>
                  <p className="text-xs text-text-tertiary truncate mt-0.5">{skill.source}</p>
                </div>
                <button onClick={() => handleRemove(skill.name)} className="text-xs text-red-400 hover:text-red-300 shrink-0">
                  {t('toolbox.remove')}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Add skill */}
      {showAdd ? (
        <form onSubmit={handleAdd} className="p-4 bg-bg border border-border rounded-lg space-y-3">
          <div>
            <label className="text-sm text-text-secondary">{t('toolbox.skillName')}</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} required
              className="w-full mt-1 px-3 py-2 bg-card border border-border rounded-lg text-sm"
              placeholder="my-skill" />
          </div>
          <div>
            <label className="text-sm text-text-secondary">{t('toolbox.skillSource')}</label>
            <input value={newSource} onChange={e => setNewSource(e.target.value)} required
              className="w-full mt-1 px-3 py-2 bg-card border border-border rounded-lg text-sm font-mono"
              placeholder="~/.claude/skills/my-skill" />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent/90">
              {t('toolbox.add')}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm rounded-lg hover:bg-card-hover">
              {t('common.cancel')}
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setShowAdd(true)} className="text-sm text-text-tertiary hover:text-accent flex items-center gap-1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          {t('toolbox.addSkill')}
        </button>
      )}
    </div>
  );
}
