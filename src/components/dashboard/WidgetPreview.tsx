// Brix Chat — live widget preview for the branding studio.
// Renders a miniature chat window using the property's branding settings.

import type { PropertySettings } from '../../lib/api';

export default function WidgetPreview({ settings }: { settings: PropertySettings }) {
  const color = settings.widget_color || '#4f46e5';
  const dark = settings.theme === 'dark';
  const bg = dark ? '#0f172a' : '#ffffff';
  const panel = dark ? '#1e293b' : '#f1f5f9';
  const ink = dark ? '#f1f5f9' : '#0f172a';
  const sub = dark ? '#94a3b8' : '#64748b';

  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-100">
      <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 bg-white border-b border-slate-200">
        Live preview
      </div>
      <div className="p-6 flex items-end justify-center min-h-72" style={{ background: panel }}>
        <div className="w-64 rounded-2xl shadow-2xl overflow-hidden" style={{ background: bg }}>
          <div className="px-4 py-3 flex items-center gap-2.5" style={{ background: color }}>
            {settings.logo_data_url ? (
              <img src={settings.logo_data_url} alt="" className="w-8 h-8 rounded-lg object-contain bg-white/20" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-white/20 grid place-items-center text-white font-black">
                {(settings.brand_name || 'B')[0]}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-white text-sm font-bold truncate">{settings.brand_name || 'Your brand'}</div>
              <div className="text-white/75 text-[11px] truncate">{settings.tagline || ''}</div>
            </div>
          </div>
          <div className="p-3 space-y-2">
            <div className="max-w-[85%] rounded-2xl rounded-tl-md px-3 py-2 text-xs" style={{ background: panel, color: ink }}>
              {settings.greeting_online}
            </div>
            <div className="ml-auto max-w-[75%] rounded-2xl rounded-tr-md px-3 py-2 text-xs text-white" style={{ background: color }}>
              Hi! Do you ship internationally?
            </div>
            <div className="max-w-[85%] rounded-2xl rounded-tl-md px-3 py-2 text-xs" style={{ background: panel, color: ink }}>
              We do — 2–4 days across the region.
            </div>
          </div>
          <div className="px-3 py-2.5 border-t flex items-center gap-2" style={{ borderColor: panel }}>
            <div className="flex-1 rounded-full px-3 py-1.5 text-xs" style={{ background: panel, color: sub }}>
              Write a message…
            </div>
            <div className="w-7 h-7 rounded-full grid place-items-center text-white text-xs" style={{ background: color }}>
              ➤
            </div>
          </div>
        </div>
      </div>
      <div className="px-3 py-2 text-[11px] text-slate-500 bg-white border-t border-slate-200 flex justify-between">
        <span>Position: {settings.widget_position}</span>
        <span>Launcher: {settings.launcher_style}</span>
      </div>
    </div>
  );
}
