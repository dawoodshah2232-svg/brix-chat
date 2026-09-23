// Shared UI primitives — premium, minimal, original styling.

import { useState } from 'react';
import type { ReactNode } from 'react';
import { cx } from '../lib/utils';

export function Button({
  children, onClick, variant = 'primary', size = 'md', className, type = 'button', disabled,
}: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';
  size?: 'sm' | 'md' | 'lg'; className?: string; type?: 'button' | 'submit'; disabled?: boolean;
}) {
  const v = {
    primary: 'bg-brix-600 hover:bg-brix-700 text-white shadow-lg shadow-brix-600/25',
    secondary: 'bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 shadow-sm',
    ghost: 'text-slate-600 hover:bg-slate-100',
    danger: 'bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/25',
    dark: 'bg-ink-950 hover:bg-ink-800 text-white',
  }[variant];
  const s = {
    sm: 'px-3 py-1.5 text-xs rounded-lg', md: 'px-4 py-2.5 text-sm rounded-xl', lg: 'px-6 py-3.5 text-base rounded-xl',
  }[size];
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={cx('font-semibold transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none inline-flex items-center justify-center gap-2', v, s, className)}>
      {children}
    </button>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('bg-white rounded-2xl border border-slate-200/80 shadow-sm', className)}>{children}</div>;
}

export function Badge({ children, tone = 'slate', className }: { children: ReactNode; tone?: 'slate' | 'green' | 'amber' | 'rose' | 'indigo' | 'cyan'; className?: string }) {
  const t = {
    slate: 'bg-slate-100 text-slate-700', green: 'bg-emerald-100 text-emerald-800',
    amber: 'bg-amber-100 text-amber-800', rose: 'bg-rose-100 text-rose-800',
    indigo: 'bg-brix-100 text-brix-700', cyan: 'bg-cyan-100 text-cyan-800',
  }[tone];
  return <span className={cx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold', t, className)}>{children}</span>;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx('w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-brix-500/40 focus:border-brix-500 transition', props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx('w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-brix-500/40 focus:border-brix-500 transition', props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx('px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:ring-2 focus:ring-brix-500/40 focus:border-brix-500', props.className)} />;
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{children}</label>;
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={cx('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors', checked ? 'bg-brix-600' : 'bg-slate-300')}>
      <span className={cx('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', checked ? 'translate-x-6' : 'translate-x-1')} />
      {label && <span className="sr-only">{label}</span>}
    </button>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cx('relative bg-white rounded-2xl shadow-2xl w-full animate-fade-up max-h-[90vh] overflow-y-auto slim-scroll', wide ? 'max-w-3xl' : 'max-w-lg')}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="font-display font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">✕</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="text-center py-12 px-6">
      <div className="text-4xl mb-3">{icon}</div>
      <div className="font-semibold text-slate-800">{title}</div>
      {hint && <div className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">{hint}</div>}
    </div>
  );
}

export function StatCard({ label, value, delta, icon, tone = 'indigo' }: { label: string; value: string; delta?: string; icon: string; tone?: 'indigo' | 'green' | 'amber' | 'rose' | 'cyan' }) {
  const tones = {
    indigo: 'bg-brix-100 text-brix-600', green: 'bg-emerald-100 text-emerald-600',
    amber: 'bg-amber-100 text-amber-600', rose: 'bg-rose-100 text-rose-600', cyan: 'bg-cyan-100 text-cyan-600',
  }[tone];
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
          <div className="mt-1 text-3xl font-display font-extrabold text-slate-900">{value}</div>
          {delta && <div className="mt-1 text-xs font-medium text-emerald-600">{delta}</div>}
        </div>
        <div className={cx('w-10 h-10 rounded-xl grid place-items-center text-lg', tones)}>{icon}</div>
      </div>
    </Card>
  );
}

export function Tabs<T extends string>({ tabs, active, onChange }: { tabs: Array<{ id: T; label: string; count?: number }>; active: T; onChange: (t: T) => void }) {
  return (
    <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={cx('px-3.5 py-1.5 rounded-lg text-sm font-semibold transition',
            active === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 text-xs opacity-70">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ name, color, size = 'md' }: { name: string; color?: string; size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'w-7 h-7 text-[10px]', md: 'w-9 h-9 text-xs', lg: 'w-12 h-12 text-sm' }[size];
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className={cx('rounded-full grid place-items-center text-white font-bold shrink-0', s)}
      style={{ background: color ?? '#4f46e5' }}>{initials}</div>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? 'Search…'}
        className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-brix-500/40 focus:border-brix-500" />
    </div>
  );
}

// Simple confirm-action hook-free helper
export function useConfirm() {
  const [req, setReq] = useState<{ title: string; body: string; action: () => void } | null>(null);
  const dialog = req ? (
    <Modal open onClose={() => setReq(null)} title={req.title}>
      <p className="text-sm text-slate-600 mb-5">{req.body}</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setReq(null)}>Cancel</Button>
        <Button variant="danger" onClick={() => { req.action(); setReq(null); }}>Confirm</Button>
      </div>
    </Modal>
  ) : null;
  return { confirm: setReq, dialog };
}
