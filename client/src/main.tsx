/* ============================================================
   Entry point — mount <App> and load the global stylesheet.

   Blank-screen safeguards (run before React mounts):
   • Startup timeout — if the shell doesn't paint within STARTUP_TIMEOUT_MS,
     show "Server is waking up, retrying…" with a Retry button.
   • Unhandled-error guard — one recovery reload guarded by build‑version
     sessionStorage so a perpetually-broken chunk never loops.
   • Global error listeners — window.onerror and onunhandledrejection
     log to the console; the top‑level ErrorBoundary catches component
     errors and shows a recoverable card.
   ============================================================ */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/App';
import { useUnhandledErrors } from '@/store/errorStore';

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

/* ---- build version ------------------------------------------------- */
function readBuildVersion(): string {
  try {
    const el = document.querySelector('meta[name="build-version"]');
    if (el) return (el as HTMLMetaElement).content;
  } catch {
    /* ignore */
  }
  return 'dev';
}

const BUILD_VERSION = readBuildVersion();
const RELOAD_GUARD_KEY = 'cyethackHRM.chunkReloaded';
const RELOAD_GUARD_VERSION_KEY = 'cyethackHRM.chunkReloadedVersion';

function reloadGuardExpired(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_GUARD_VERSION_KEY) !== BUILD_VERSION;
  } catch {
    return true;
  }
}

function markReloadGuarded(): void {
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
    sessionStorage.setItem(RELOAD_GUARD_VERSION_KEY, BUILD_VERSION);
  } catch {
    /* ignore */
  }
}

/* ---- chunk-load recovery ------------------------------------------- */
function installChunkLoadRecovery(): void {
  const handleFailure = (failedUrl: string | undefined): void => {
    if (!failedUrl) return;
    const isChunkOrAsset =
      /\/assets\//.test(failedUrl) ||
      /\.js($|\?)/.test(failedUrl) ||
      /\.css($|\?)/.test(failedUrl) ||
      /Loading (JS|CSS) chunk/.test(failedUrl);
    if (!isChunkOrAsset) return;
    if (reloadGuardExpired() || !sessionStorage.getItem(RELOAD_GUARD_KEY)) {
      markReloadGuarded();
      // eslint-disable-next-line no-console
      console.warn('[chunk recovery] reloading after failed asset load:', failedUrl);
      window.location.reload();
    }
  };

  /* Resource load errors (e.g. 404 on /assets/Chunk-xyz.js). */
  window.addEventListener(
    'error',
    (event) => {
      const msg = event.message && typeof event.message === 'string' ? event.message : '';
      const filename = event.filename && typeof event.filename === 'string' ? event.filename : '';
      handleFailure(msg || filename || undefined);
    },
    true,
  );

  /* Rejected dynamic-import promises (e.g. React.lazy chunk fail). */
  window.addEventListener(
    'unhandledrejection',
    (event) => {
      const reason = event.reason;
      const url =
        reason &&
        typeof reason === 'object' &&
        'url' in reason
          ? String((reason as { url?: string }).url)
          : undefined;
      const message =
        reason && typeof reason === 'object' && 'message' in reason
          ? String((reason as { message?: string }).message)
          : String(reason ?? '');
      handleFailure(url || message || undefined);
    },
    true,
  );
}

/* ---- runtime error guard ------------------------------------------- */
function useUnhandledErrors(): {hasError: boolean; error: Error | null} {
  const [hasError, setHasError] = React.useState(false);
  const [savedError, setSavedError] = React.useState<Error | null>(null);
  React.useEffect(() => {
    const onError = (e: Event) => {
      const target = e.target as EventTarget;
      let message = '';
      if (target instanceof HTMLScriptElement) {
        message = 'Script error: ' + (target.error?.message || 'unknown');
      } else if (target instanceof HTMLLinkElement) {
        message = 'Style sheet error: ' + (target.error?.message || 'unknown');
      } else {
        const ev = e as any;
        message = ev.message || String(ev.reason);
      }
      const err = new Error(message);
      setSavedError(err);
      setHasError(true);
    };
    window.addEventListener('error', onError, true);
    window.addEventListener('unhandledrejection', (e) => {
      try {
        const err = new Error(
          String(e.reason instanceof Error ? e.reason.message : String(e.reason))
        );
        setSavedError(err);
        setHasError(true);
      } catch { /* ignore */ }
    }, true);
    return () => {
      window.removeEventListener('error', onError, true);
      window.removeEventListener('unhandledrejection', true);
    };
  }, []);
  return {hasError, error: savedError};
}

const errorState = useUnhandledErrors();

/* ---- global error listeners (supplementary, console-only) ---- */
function installGlobalErrorListeners(): void {
  window.addEventListener('error', (event) => {
    console.error('[window error]', event.message, event.filename, event.lineno, event.colno);
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[unhandled rejection]', event.reason);
  });
}
/* ----------------------------------------------------------- */

installChunkLoadRecovery();
installGlobalErrorListeners();

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root was not found in index.html');

createRoot(root).render(
  <StrictMode>
    {errorState.hasError ? (
      <div className="auth-card" style={{width:'100%',maxWidth:'440px',margin:'80px auto',padding:'24px'}}>
        <h2 style={{marginTop:0}}>Something went wrong</h2>
        <div style={{margin:'16px 0',color:'var(--text-2)',fontSize:'14px',lineHeight:1.5}}>
          <p>An unexpected error occurred while loading the application.</p>
          <pre style={{color:'var(--muted)',fontSize:'12px',whiteSpace:'pre-wrap',wordBreak:'break-word'}}>
{errorState.error?.message}</pre>
        </div>
        <div style={{marginTop:'24px'}}>
          <button className="btn btn-primary" onClick={() => window.location.reload()}
            style={{width:'100%',padding:'10px',fontSize:'14px'}}>
            Reload page
          </button>
        </div>
      </div>
    ) : (
      <App />
    )}
  </StrictMode>,
);

clearStartupTimeout();