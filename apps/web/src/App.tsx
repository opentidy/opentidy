// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Toaster } from 'sonner';
import Layout from './shared/Layout';
import ErrorBoundary from './shared/ErrorBoundary';
import Home from './features/home/Home';
import TaskDetail from './features/tasks/TaskDetail';
import Terminal from './features/terminal/Terminal';
import Nouveau from './features/nouveau/Nouveau';
import Ameliorations from './features/ameliorations/Ameliorations';
import SchedulePage from './features/schedule/SchedulePage';
import Memory from './features/memory/Memory';
import Settings from './features/settings/Settings';
import ModulesPage from './features/modules/ModulesPage';
import AgentsPage from './features/agents/AgentsPage';

import PermissionsPage from './features/permissions/PermissionsPage';
import SetupWizard from './features/setup/SetupWizard';
import { useStore } from './shared/store';

function SetupGuard({ children }: { children: React.ReactNode }) {
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/setup/status')
      .then((res) => res.json())
      .then((data) => setSetupComplete(data.setupComplete ?? false))
      .catch(() => setSetupComplete(false));
  }, []);

  if (setupComplete === null) return null;
  if (!setupComplete) return <Navigate to="/setup" replace />;
  return <>{children}</>;
}

function ResetOverlay() {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-bg">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-text-tertiary border-t-accent" />
      <p className="mt-4 text-sm text-text-secondary">{t('toolbox.resetting')}</p>
    </div>
  );
}

export default function App() {
  const resetting = useStore((s) => s.resetting);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        {resetting && <ResetOverlay />}
        <Toaster theme="dark" position="bottom-right" />
        <Routes>
          <Route path="/setup" element={<SetupWizard />} />
          <Route
            element={
              <SetupGuard>
                <Layout />
              </SetupGuard>
            }
          >
            <Route path="/" element={<Home />} />

            <Route path="/task/:id" element={<TaskDetail />} />
            <Route path="/terminal" element={<Terminal />} />
            <Route path="/nouveau" element={<Nouveau />} />
            <Route path="/ameliorations" element={<Ameliorations />} />
            <Route path="/schedule" element={<SchedulePage />} />
            <Route path="/memory" element={<Memory />} />
            <Route path="/modules" element={<ModulesPage />} />
            <Route path="/permissions" element={<PermissionsPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
