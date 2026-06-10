'use client';

// Modal.js — a reusable centred dialog with a backdrop. Closes on Escape or a
// backdrop click. Used by the Menu page for the add/edit ingredient and dish
// forms (the recipe builder lives inside one of these).
import { useEffect } from 'react';

// Lightweight modal dialog. Closes on backdrop click or Escape.
export default function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Dialog'}
        style={wide ? { maxWidth: 680 } : undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="row-between" style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>
        {children}
        {footer && (
          <div
            className="row-between"
            style={{ marginTop: 20, justifyContent: 'flex-end', gap: 10 }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
