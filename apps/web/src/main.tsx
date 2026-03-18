import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { connectSSE } from './store';
import './i18n/i18n';
import './index.css';

const closeSSE = connectSSE();
// Cleanup SSE on hot-reload (Vite HMR)
if (import.meta.hot) {
  import.meta.hot.dispose(() => closeSSE());
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
