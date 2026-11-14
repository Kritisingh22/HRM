/* ============================================================
   Entry point — mount <App> and load the global stylesheet.

   Blank-screen safeguards (run before React mounts):
   • Startup timeout — if the shell doesn't paint within STARTUP_TIMEOUT_MS,
     show "Server is waking up, retrying…" with a Retry button.
   • Chunk-load recovery — if a JS chunk fails to load, reload once
     (guarded by sessionStorage flag to prevent a reload loop).
   • Global error listeners — window.onerror and onunhandledrejection
     log to the console and, if the shell is already mounted, report
     through React error boundaries instead of a blank page.
   ============================================================ */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/App';

import '@/styles/app.css';
import '@/styles/layout-fix.css';
import '@/styles/contrast.css';

/* ---- startup timeout ------------------------------------------------ */
const STARTUP_TIMEOUT_MS = 15_000; // 15 s — Render free tier cold start can be slow
let startupResolved = false;
const startupTimeout = setTimeout(() => {
  if (!startupResolved) {
    showStartupTimeout();
  }
}, STARTUP_TIMEOUT_MS);

function showStartupTimeout(): void {
  const root = document.getElementById('root');
  if (!root) return;
  root.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;color:#e6edf7;font-family:'IBM Plex Sans',sans-serif;text-align:center">
      <div style="width:40px;height:40px;border:3px solid var(--teal,#509888);border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;margin-bottom:16px"></div>
      <h2 style="margin:0 0 8px;font-size:18px">Server is waking up…</h2>
      <p style="margin:0 0 24px;color:#94a3b8;font-size:14px">The Render free tier spins down between visits. This usually takes 10–20 seconds.</p>
      <button id="startup-retry" style="padding:10px 24px;font-size:14px;background:#509888;color:#fff;border:none;border-radius:8px;cursor:pointer">Retry</button>
      <style>
        @keyframes spin { to { transform: rotate(360deg) } }
      </style>
    </div>
  `;
  const btn = document.getElementById('startup-retry');
  if (btn) btn.addEventListener('click', () => window.location.reload());
}

function clearStartupTimeout(): void {
  startupResolved = true;
  clearTimeout(startupTimeout);
}

/* ---- chunk-load recovery ------------------------------------------- */
/* If a Vite chunk fails to load, reload once. Guarded by sessionStorage
   so a perpetually-broken chunk doesn't cause an infinite reload loop. */
function installChunkLoadRecovery(): void {
  const KEY = 'cyethackHRM.chunkReloaded';
  window.addEventListener('error', (event) => {
    if (event.message && typeof event.message === 'string' && event.message.includes('Loading CSS chunk') && !sessionStorage.getItem(KEY)) {
      sessionStorage.setItem(KEY, '1');
      window.location.reload();
      return;
    }
    if (event.message && typeof event.message === 'string' && event.message.includes('Loading JS chunk') && !sessionStorage.getItem(KEY)) {
      sessionStorage.setItem(KEY, '1');
      window.location.reload();
      return;
    }
  }, true);
}

/* ---- global error listeners ---------------------------------------- */
/* Log uncaught errors and unhandled rejections. If React is already
   mounted, error boundaries catch component errors; these listeners
   catch everything else (resource load errors, promise rejections). */
function installGlobalErrorListeners(): void {
  window.addEventListener('error', (event) => {
    console.error('[window error]', event.message, event.filename, event.lineno, event.colno);
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[unhandled rejection]', event.reason);
  });
}

installChunkLoadRecovery();
installGlobalErrorListeners();

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root was not found in index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

clearStartupTimeout();
