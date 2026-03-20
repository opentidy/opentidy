// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState } from 'react';
import { UserInfoStep } from './UserInfoStep';
import { AgentStep } from './AgentStep';
import { PermissionsStep } from './PermissionsStep';
import { ModulesStep } from './ModulesStep';
import { DoneStep } from './DoneStep';

type Step = 'user-info' | 'agent' | 'permissions' | 'modules' | 'done';

const STEPS: Step[] = ['user-info', 'agent', 'permissions', 'modules', 'done'];

export default function SetupWizard() {
  const [step, setStep] = useState<Step>('user-info');
  const [userInfo, setUserInfo] = useState({ name: '', language: navigator.language.startsWith('fr') ? 'fr' : 'en' });

  const stepIndex = STEPS.indexOf(step);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  const handleUserInfoNext = async (data: { name: string; language: string }) => {
    setUserInfo(data);
    try {
      await fetch('/api/setup/user-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch {
      // Best-effort — advance anyway
    }
    setStep('agent');
  };

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      {/* Progress bar */}
      <div className="h-1 w-full bg-border">
        <div
          className="h-full bg-accent transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Step dots */}
      <div className="flex justify-center gap-2 pt-6">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`h-2 w-2 rounded-full transition-colors ${
              i <= stepIndex ? 'bg-accent' : 'bg-border'
            }`}
          />
        ))}
      </div>

      {/* Step content */}
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        {step === 'user-info' && <UserInfoStep onNext={handleUserInfoNext} initialName={userInfo.name} initialLanguage={userInfo.language} />}
        {step === 'agent' && (
          <AgentStep onNext={() => setStep('permissions')} onBack={() => setStep('user-info')} />
        )}
        {step === 'permissions' && (
          <PermissionsStep onNext={() => setStep('modules')} onBack={() => setStep('agent')} />
        )}
        {step === 'modules' && (
          <ModulesStep onNext={() => setStep('done')} onBack={() => setStep('permissions')} />
        )}
        {step === 'done' && <DoneStep />}
      </div>
    </div>
  );
}
