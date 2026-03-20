// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './shared/Layout';
import Home from './features/home/Home';
import JobDetail from './features/jobs/JobDetail';
import Terminal from './features/terminal/Terminal';
import Nouveau from './features/nouveau/Nouveau';
import Ameliorations from './features/ameliorations/Ameliorations';
import SchedulePage from './features/schedule/SchedulePage';
import Memory from './features/memory/Memory';
import Settings from './features/settings/Settings';
import ModulesPage from './features/modules/ModulesPage';
import Suggestions from './features/suggestions/Suggestions';
import SetupWizard from './features/setup/SetupWizard';

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

export default function App() {
  return (
    <BrowserRouter>
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
          <Route path="/suggestions" element={<Suggestions />} />
          <Route path="/job/:id" element={<JobDetail />} />
          <Route path="/terminal" element={<Terminal />} />
          <Route path="/nouveau" element={<Nouveau />} />
          <Route path="/ameliorations" element={<Ameliorations />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/memory" element={<Memory />} />
          <Route path="/modules" element={<ModulesPage />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
