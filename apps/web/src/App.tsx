// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './shared/Layout';
import Home from './features/home/Home';
import DossierDetail from './features/dossiers/DossierDetail';
import Terminal from './features/terminal/Terminal';
import Nouveau from './features/nouveau/Nouveau';
import Ameliorations from './features/ameliorations/Ameliorations';
import SchedulePage from './features/schedule/SchedulePage';
import Memory from './features/memory/Memory';
import Settings from './features/settings/Settings';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/dossier/:id" element={<DossierDetail />} />
          <Route path="/terminal" element={<Terminal />} />
          <Route path="/nouveau" element={<Nouveau />} />
          <Route path="/ameliorations" element={<Ameliorations />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/memory" element={<Memory />} />
          <Route path="/toolbox" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}