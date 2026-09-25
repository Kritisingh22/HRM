/* App-wide toast notifications. Mounted once at the app root; any component calls
 * useToast().success('…') / .error('…'). Presentational only — reuses the theme's
 * colours (green/red/accent). Auto-dismisses; click to dismiss early. */
import { createContext, useContext, useState, useCallback, useMemo } from 'react';

const ToastCtx = createContext(null);
let counter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const remove = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((type, text) => {
    if (!text) return;
    const id = ++counter;
    setToasts((t) => [...t, { id, type, text }]);
    setTimeout(() => remove(id), 4000);
  }, [remove]);

  const api = useMemo(() => ({
    success: (t) => push('ok', t),
    error: (t) => push('err', t),
    info: (t) => push('info', t)
  }), [push]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="ws-toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={'ws-toast ' + t.type} onClick={() => remove(t.id)}>
            <span className="ws-toast-dot" aria-hidden="true" />{t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// Safe no-op fallback if used outside a provider (keeps components crash-free).
export const useToast = () => useContext(ToastCtx) || { success() {}, error() {}, info() {} };
