/* Reusable confirmation modal (no browser alert()). Escape or backdrop click =
 * cancel; the confirm button is focused on open for keyboard use. */
import { useEffect, useRef } from 'react';

export default function ConfirmDialog({ open, title, message, cancelText = 'Cancel', confirmText = 'Confirm', onCancel, onConfirm }) {
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    confirmRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="cd-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="cd-modal" role="dialog" aria-modal="true" aria-labelledby="cd-title">
        <h2 id="cd-title" className="cd-title">{title}</h2>
        {message && <p className="cd-msg">{message}</p>}
        <div className="cd-actions">
          <button className="btn ghost" onClick={onCancel}>{cancelText}</button>
          <button className="btn danger" ref={confirmRef} onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}
