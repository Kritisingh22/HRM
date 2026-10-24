/* ============================================================
   Modal — scrim + dialog with a small focus trap, Escape to close
   and scrim click to dismiss, matching the original portal.
   ============================================================ */
import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';

export interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** wide dialog (forms with 2 columns, payslips…) */
  large?: boolean;
  labelledById?: string;
  className?: string;
}

export function Modal({ title, onClose, children, footer, large, className }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<Element | null>(null);

  useEffect(() => {
    lastFocus.current = document.activeElement;
    const node = modalRef.current;
    const focusables = () =>
      node
        ? Array.from(node.querySelectorAll<HTMLElement>('button,input,select,textarea,[tabindex]')).filter(
            (el) => el.offsetParent !== null || el === document.activeElement,
          )
        : [];
    const first = focusables()[0];
    if (first) first.focus();
    else node?.focus();

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        onClose();
        return;
      }
      if (ev.key !== 'Tab' || !node) return;
      const list = focusables();
      if (!list.length) return;
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      if (ev.shiftKey && document.activeElement === firstEl) {
        ev.preventDefault();
        lastEl.focus();
      } else if (!ev.shiftKey && document.activeElement === lastEl) {
        ev.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (lastFocus.current instanceof HTMLElement) lastFocus.current.focus();
    };
  }, [onClose]);

  return (
    <div
      className={className ? `scrim ${className}` : 'scrim'}
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className={`modal${large ? ' modal-lg' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn icon-btn-sm" aria-label="Close" onClick={onClose} type="button">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}
