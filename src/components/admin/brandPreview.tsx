// Brix Chat — live branding preview.
// Renders a mini widget + help-center header from the UNSAVED draft settings,
// so branding changes are visible before saving.

import { useState } from 'react';
import { Card } from '../ui';
import { cx } from '../../lib/utils';
import type { PropertySettings2 } from '../../lib/contentSeed';

export function BrandPreviewPanel({ draft, propName }: { draft: PropertySettings2; propName: string }) {
  const [view, setView] = useState<'widget' | 'help'>('widget');
  const brandName = draft.brand_name || propName || 'Brix Chat';
  const color = draft.widget_color || '#e11d48';
  const accent = draft.accent_color || color;
  const dark = draft.theme === 'dark';

  return (
    <Card className="p-5 lg:sticky lg:top-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-900">Live preview</h3>
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-bold">
          {(['widget', 'help'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cx('px-3 py-1.5 rounded-md transition capitalize', view === v ? 'bg-white shadow text-slate-900' : 'text-slate-400')}
            >
              {v === 'widget' ? 'Widget' : 'Help center'}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-slate-400 mb-4">Shows your <strong>unsaved</strong> changes. Save to apply them.</p>

      {view === 'widget' ? (
        <div className={cx('rounded-2xl border border-slate-200 overflow-hidden h-80 flex flex-col', dark ? 'bg-slate-900' : 'bg-white')}>
          <div className="px-4 py-3 flex items-center gap-3" style={{ background: color }}>
            <div className="w-9 h-9 rounded-xl bg-white/20 grid place-items-center overflow-hidden shrink-0">
              {draft.logo_data_url ? (
                <img src={draft.logo_data_url} alt="" className="w-full h-full object-contain" />
              ) : (
                <span className="text-white font-black">{brandName.charAt(0)}</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-white font-bold text-sm truncate">{brandName}</div>
              <div className="text-white/70 text-[11px] truncate">{draft.tagline || 'Chat with us — we reply fast.'}</div>
            </div>
          </div>
          <div className={cx('flex-1 p-3 space-y-2', dark ? 'bg-slate-900' : 'bg-slate-50')}>
            <div className={cx('max-w-[80%] rounded-2xl rounded-tl-md px-3 py-2 text-[13px]', dark ? 'bg-slate-800 text-slate-100' : 'bg-white text-slate-700 shadow-sm')}>
              Hi {brandName.split(' ')[0]} visitor 👋 — how can we help?
            </div>
            <div className="max-w-[70%] ml-auto rounded-2xl rounded-tr-md px-3 py-2 text-[13px] text-white" style={{ background: color }}>
              Do you ship to Dubai?
            </div>
            <div className={cx('max-w-[80%] rounded-2xl rounded-tl-md px-3 py-2 text-[13px]', dark ? 'bg-slate-800 text-slate-100' : 'bg-white text-slate-700 shadow-sm')}>
              Yes — 2–3 working days across the UAE.
            </div>
          </div>
          <div className={cx('px-3 py-2.5 border-t flex gap-2', dark ? 'border-slate-800 bg-slate-900' : 'border-slate-100 bg-white')}>
            <div className={cx('flex-1 rounded-full px-4 py-2 text-[13px]', dark ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-400')}>
              Type a message…
            </div>
            <div className="w-9 h-9 rounded-full grid place-items-center text-white" style={{ background: color }}>➤</div>
          </div>
        </div>
      ) : (
        <div className={cx('rounded-2xl border border-slate-200 overflow-hidden h-80', dark ? 'bg-slate-900' : 'bg-white')}>
          <div className="px-5 py-6 text-center border-b" style={{ borderColor: '#e2e8f0', background: `linear-gradient(135deg, ${accent}14, transparent)` }}>
            <div className="flex items-center justify-center gap-2.5 mb-2">
              <div className="w-9 h-9 rounded-xl grid place-items-center overflow-hidden" style={{ background: accent }}>
                {draft.logo_data_url ? (
                  <img src={draft.logo_data_url} alt="" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-white font-black">{brandName.charAt(0)}</span>
                )}
              </div>
              <span className={cx('font-extrabold text-lg', dark ? 'text-white' : 'text-slate-900')}>{brandName}</span>
            </div>
            <p className={cx('text-sm', dark ? 'text-slate-400' : 'text-slate-500')}>{draft.tagline || 'Help center'}</p>
            <div className={cx('mt-4 mx-auto max-w-xs rounded-full px-4 py-2.5 text-sm flex items-center gap-2', dark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-400')}>
              🔍 Search articles…
            </div>
          </div>
          <div className="p-4 space-y-2">
            {['Getting started', 'Billing', 'Developers'].map((c) => (
              <div key={c} className={cx('rounded-xl border px-3.5 py-2.5 text-sm font-semibold flex justify-between items-center', dark ? 'border-slate-800 text-slate-200' : 'border-slate-100 text-slate-700')}>
                {c}
                <span style={{ color: accent }}>→</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-[11px] text-slate-400 mt-3">
        Theme: <strong className="capitalize">{draft.theme || 'light'}</strong> · Launcher position: <strong>{draft.widget_position}</strong>
      </p>
    </Card>
  );
}
