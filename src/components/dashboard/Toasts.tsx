// Brix Chat — lightweight toast system. Any page can call toast.success(...)
// after a mutation; <ToastHost /> lives once inside AppShell.

import { useEffect, useState } from 'react';
import { cx, uid } from '../../lib/utils';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  title: string;
  body?: string;
  tone: ToastTone;
}

type Listener = (t: Toast) => void;
const listeners = new Set<Listener>();

function push(title: string, body: string | undefined, tone: ToastTone) {
  const t: Toast = { id: uid('toast'), title, body, tone };
  listeners.forEach((l) => {
    try {
      l(t);
    } catch {
      /* ignore */
    }
  });
}

export const toast = {
  success: (title: string, body?: string) => push(title, body, 'success'),
  error: (title: string, body?: string) => push(title, body, 'error'),
  info: (title: string, body?: string) => push(title, body, 'info'),
};

const TONE_STYLE: Record<ToastTone, { bar: string; icon: string; iconBg: string }> = {
  success: { bar: 'bg-emerald-500', icon: '✓', iconBg: 'bg-emerald-100 text-emerald-700' },
  error: { bar: 'bg-rose-500', icon: '!', iconBg: 'bg-rose-100 text-rose-700' },
  info: { bar: 'bg-brix-500', icon: 'i', iconBg: 'bg-brix-100 text-brix-700' },
};

export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    const add = (t: Toast) => {
      setItems((xs) => [...xs.slice(-3), t]);
      window.setTimeout(() => {
        setItems((xs) => xs.filter((x) => x.id !== t.id));
      }, 4200);
    };
    listeners.add(add);
    return () => {
      listeners.delete(add);
    };
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-3rem)]" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className="relative overflow-hidden bg-white rounded-2xl border border-slate-200 shadow-2xl p-4 animate-fade-up"
        >
          <div className={cx('absolute left-0 top-0 bottom-0 w-1', TONE_STYLE[t.tone].bar)} />
          <div className="flex items-start gap-3 pl-1">
            <span
              className={cx(
                'w-7 h-7 rounded-full grid place-items-center text-sm font-bold shrink-0',
                TONE_STYLE[t.tone].iconBg,
              )}
            >
              {TONE_STYLE[t.tone].icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-slate-900">{t.title}</div>
              {t.body && <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{t.body}</div>}
            </div>
            <button
              onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}
              className="text-slate-300 hover:text-slate-500 text-xs shrink-0"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
