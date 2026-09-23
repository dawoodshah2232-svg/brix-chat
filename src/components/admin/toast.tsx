// Brix Chat — admin toast system (local, no deps).
// ToastProvider wraps the admin area; useToast() pushes transient notifications.

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cx } from '../../lib/utils';

export type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

const ToastCtx = createContext<{ push: (tone: ToastTone, message: string) => void } | null>(null);

export function useToast(): { toast: (message: string) => void; toastError: (message: string) => void; toastInfo: (message: string) => void } {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  const toast = useCallback((message: string) => ctx.push('success', message), [ctx]);
  const toastError = useCallback((message: string) => ctx.push('error', message), [ctx]);
  const toastInfo = useCallback((message: string) => ctx.push('info', message), [ctx]);
  return { toast, toastError, toastInfo };
}

const ICONS: Record<ToastTone, string> = { success: '✓', error: '⚠', info: 'ℹ' };
const BAR: Record<ToastTone, string> = { success: 'bg-emerald-500', error: 'bg-rose-500', info: 'bg-brix-500' };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const push = useCallback((tone: ToastTone, message: string) => {
    const id = ++idRef.current;
    setToasts((t) => [...t.slice(-3), { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}`}</style>
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 items-end pointer-events-none" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-2.5 max-w-sm rounded-xl bg-ink-950 text-white pl-1 pr-4 py-1 shadow-2xl animate-[toastIn_0.25s_ease-out]"
          >
            <span className={cx('w-8 h-8 rounded-lg grid place-items-center text-white text-sm font-black shrink-0', BAR[t.tone])}>
              {ICONS[t.tone]}
            </span>
            <p className="text-[13px] font-semibold leading-snug">{t.message}</p>
            <button
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              className="ml-1 text-slate-400 hover:text-white text-sm leading-none"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
