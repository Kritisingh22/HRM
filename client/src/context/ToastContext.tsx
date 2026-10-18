/* ============================================================
   Toast context — the portal's transient feedback channel.
   ============================================================ */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { gateToast, setToastEmitter } from '@/store/mutationGate';

export type ToastKind = 'info' | 'success' | 'error';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  toasts: ToastItem[];
  toast: (message: string, kind?: ToastKind) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = ++seq.current;
      setToasts((list) => [...list.slice(-3), { id, kind, message }]);
      window.setTimeout(() => dismiss(id), 3400);
    },
    [dismiss],
  );

  /* Page toasts for API mutations are held until the server confirms
     (see mutationGate); demo mode shows them immediately. */
  const toast = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      if (gateToast(message, kind)) return;
      show(message, kind);
    },
    [show],
  );

  useEffect(() => {
    setToastEmitter(({ message, kind }) => show(message, kind));
    return () => setToastEmitter(null);
  }, [show]);

  const value = useMemo(() => ({ toasts, toast, dismiss }), [toasts, toast, dismiss]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
