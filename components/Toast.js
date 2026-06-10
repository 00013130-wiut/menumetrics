'use client';

// Toast.js — lightweight pop-up notifications (success / error / info).
// ToastProvider wraps the signed-in app (in app/(app)/layout.js); any page calls
// useToast() to get { success, error, info } and fire a toast on save / delete /
// import. Toasts stack top-right and auto-dismiss. Empty messages are ignored so
// a "clear errors" call (passing '') doesn't pop a blank toast.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext({
  success: () => {},
  error: () => {},
  info: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

let idSeq = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((type, message) => {
    if (!message) return; // ignore empty/clear calls
    const id = ++idSeq;
    setToasts((t) => [...t, { id, type, message }]);
    return id;
  }, []);

  const api = {
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          maxWidth: 360,
        }}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const STYLES = {
  success: { color: '#2e6b43', bg: '#e7f2eb', border: '#cbe5d4', Icon: CheckCircle2 },
  error: { color: '#9c3b36', bg: '#f8e8e7', border: '#eccbc8', Icon: AlertTriangle },
  info: { color: '#345d85', bg: '#e7eff7', border: '#cfe0ef', Icon: Info },
};

function ToastItem({ toast, onClose }) {
  const s = STYLES[toast.type] || STYLES.info;
  const Icon = s.Icon;

  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        background: s.bg,
        border: `1px solid ${s.border}`,
        color: s.color,
        borderRadius: 12,
        padding: '11px 13px',
        boxShadow: '0 8px 30px rgba(40,30,20,.12)',
        fontSize: 13.5,
        animation: 'toastin 0.18s ease',
      }}
    >
      <Icon size={17} style={{ flex: 'none', marginTop: 1 }} />
      <div style={{ flex: 1, lineHeight: 1.45 }}>{toast.message}</div>
      <button
        onClick={onClose}
        aria-label="Dismiss"
        style={{ background: 'none', border: 'none', color: s.color, cursor: 'pointer', padding: 0, opacity: 0.7 }}
      >
        <X size={15} />
      </button>
    </div>
  );
}
