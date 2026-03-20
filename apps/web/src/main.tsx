// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { connectSSE } from './shared/store';
import './shared/i18n/i18n';
import './index.css';

const closeSSE = connectSSE();
// Cleanup SSE on hot-reload (Vite HMR)
if (import.meta.hot) {
  import.meta.hot.dispose(() => closeSSE());
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);