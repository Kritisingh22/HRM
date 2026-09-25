/* Generic modal dialog for forms. Reuses the existing confirm-dialog scrim/panel
 * styling (.cd-scrim/.cd-modal) so it matches the theme. Escape or a backdrop
 * click closes it; the panel is a labelled dialog for accessibility. */
import { useEffect } from 'react';

export default function Modal({ open, title, onClose, children, size = 'lg' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="cd-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'cd-modal ' + size} role="dialog" aria-modal="true" aria-labelledby="ws-modal-title">
        <div className="ws-modal-head">
          <h2 id="ws-modal-title" className="cd-title">{title}</h2>
          <button type="button" className="ws-modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
