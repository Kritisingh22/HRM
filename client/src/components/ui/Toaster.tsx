/* ============================================================
   Toaster — bottom-right feedback stack fed by ToastContext.
   ============================================================ */
import { useToast } from '@/context/ToastContext';

export function Toaster() {
  const { toasts, dismiss } = useToast();
  if (!toasts.length) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast${t.kind === 'error' ? ' error' : t.kind === 'success' ? ' success' : ''}`}
          role="status"
          onClick={() => dismiss(t.id)}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
