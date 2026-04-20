import { useCallback, useState } from 'react';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

interface ToastMessage {
  id: number;
  text: string;
  variant: ToastVariant;
}

let nextId = 0;

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const show = useCallback((text: string, variant: ToastVariant = 'success') => {
    const id = ++nextId;
    setToasts(prev => [...prev, { id, text, variant }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const success = useCallback((text: string) => show(text, 'success'), [show]);
  const error = useCallback((text: string) => show(text, 'error'), [show]);

  return { toasts, show, success, error };
}

const ICONS: Record<ToastVariant, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠',
};

export function ToastContainer({ toasts }: { toasts: ToastMessage[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.variant}`}>
          <span className="toast-icon">{ICONS[t.variant]}</span>
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
