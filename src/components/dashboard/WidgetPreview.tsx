// Brix Chat — live widget preview for the branding studio.
// Renders a fake mini-website with the property's launcher, rendered exactly
// per settings: icon, shape, color, corner position, unread badge, attention
// pulse, greeting tooltip, and an openable mini chat window.

import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { PropertySettings } from '../../lib/api';
import { LauncherChatIcon, LauncherHeadsetIcon, LauncherDotsIcon } from '../icons';

type LauncherIcon = 'chat' | 'headset' | 'dots';

const ICONS: Record<LauncherIcon, (p: { className?: string }) => ReactElement> = {
  chat: (p) => <LauncherChatIcon className={p.className} />,
  headset: (p) => <LauncherHeadsetIcon className={p.className} />,
  dots: (p) => <LauncherDotsIcon className={p.className} />,
};

const POS_LABEL: Record<string, string> = {
  'bottom-right': 'Bottom right',
  'bottom-left': 'Bottom left',
  'top-right': 'Top right',
  'top-left': 'Top left',
};

function posClasses(pos: string): string {
  switch (pos) {
    case 'top-right':
      return 'top-3 right-3';
    case 'top-left':
      return 'top-3 left-3';
    case 'bottom-left':
      return 'bottom-3 left-3';
    default:
      return 'bottom-3 right-3';
  }
}

function isTop(pos: string): boolean {
  return pos === 'top-right' || pos === 'top-left';
}

function isRight(pos: string): boolean {
  return pos === 'top-right' || pos === 'bottom-right';
}

function LauncherIconGlyph({ settings }: { settings: PropertySettings }) {
  if (settings.launcher_icon_svg) {
    return <img src={settings.launcher_icon_svg} alt="" className="w-7 h-7 object-contain" />;
  }
  const key: LauncherIcon =
    settings.launcher_icon === 'headset' || settings.launcher_icon === 'dots' ? settings.launcher_icon : 'chat';
  const Cmp = ICONS[key];
  return <Cmp className="w-7 h-7 text-white" />;
}

function Launcher({ settings, unread, pulse }: { settings: PropertySettings; unread: number; pulse: boolean }) {
  const color = settings.widget_color || '#4f46e5';
  const showBadge = settings.launcher_badge !== false && unread > 0;
  const badgeText = unread > 9 ? '9+' : String(unread);
  const shape = settings.launcher_shape === 'rounded' ? 'rounded-2xl' : 'rounded-full';

  if (settings.launcher_style === 'bar') {
    return (
      <div className="relative flex items-center gap-2.5 pl-4 pr-5 py-3 rounded-full shadow-xl text-white font-bold text-sm" style={{ background: color }}>
        <LauncherIconGlyph settings={settings} />
        <span>{settings.brand_name || 'Chat with us'}</span>
        {showBadge && (
          <span className="absolute -top-1.5 -right-1.5 min-w-6 h-6 px-1 rounded-full bg-rose-600 text-white text-xs font-extrabold grid place-items-center border-2 border-white">
            {badgeText}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      {settings.launcher_pulse && pulse && (
        <span className="absolute inset-0 brix-launcher-ping" style={{ ['--brix-color' as string]: color }} />
      )}
      <div className={`w-14 h-14 ${shape} grid place-items-center shadow-xl cursor-pointer`} style={{ background: color }}>
        <LauncherIconGlyph settings={settings} />
      </div>
      {showBadge && (
        <span className="absolute -top-1.5 -right-1.5 min-w-6 h-6 px-1 rounded-full bg-rose-600 text-white text-xs font-extrabold grid place-items-center border-2 border-white">
          {badgeText}
        </span>
      )}
    </div>
  );
}

function MiniChatWindow({
  settings,
  onClose,
  flip,
  right,
}: {
  settings: PropertySettings;
  onClose: () => void;
  flip: boolean; // true when launcher is at the top: window opens below
  right: boolean; // launcher is on the right side: align window to the right
}) {
  const color = settings.widget_color || '#4f46e5';
  const dark = settings.theme === 'dark';
  const bg = dark ? '#0f172a' : '#ffffff';
  const panel = dark ? '#1e293b' : '#f1f5f9';
  const ink = dark ? '#f1f5f9' : '#0f172a';
  const sub = dark ? '#94a3b8' : '#64748b';

  return (
    <div
      className="absolute z-20 w-64 rounded-2xl shadow-2xl overflow-hidden animate-[brix-pop_0.18s_ease-out]"
      style={{ background: bg, [flip ? 'top' : 'bottom']: '4.5rem', ...(right ? { right: 0 } : { left: 0 }) }}
    >
      <div className="px-4 py-3 flex items-center gap-2.5" style={{ background: color }}>
        {settings.logo_data_url ? (
          <img src={settings.logo_data_url} alt="" className="w-8 h-8 rounded-lg object-contain bg-white/20" />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-white/20 grid place-items-center text-white font-black">
            {(settings.brand_name || 'B')[0]}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-white text-sm font-bold truncate">{settings.brand_name || 'Your brand'}</div>
          <div className="text-white/75 text-[11px] truncate">{settings.tagline || ''}</div>
        </div>
        <button onClick={onClose} aria-label="Close chat" className="text-white/80 hover:text-white text-lg leading-none px-1">
          ×
        </button>
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
  );
}

export default function WidgetPreview({ settings }: { settings: PropertySettings }) {
  const color = settings.widget_color || '#4f46e5';
  const [unread, setUnread] = useState(3);
  const [open, setOpen] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipForced, setTooltipForced] = useState<'auto' | 'shown' | 'hidden'>('auto');
  const timerRef = useRef<number | null>(null);

  const tooltipText = settings.greeting_tooltip || '';
  const delaySec = Math.min(30, Math.max(0, settings.greeting_tooltip_delay ?? 5));

  // Auto-show the tooltip after the configured delay; restart when the
  // text, delay, or position changes. Manual show/hide wins over the timer.
  useEffect(() => {
    setTooltipForced('auto');
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (!tooltipText) {
      setTooltipVisible(false);
      return;
    }
    if (delaySec === 0) {
      setTooltipVisible(true);
      return;
    }
    setTooltipVisible(false);
    timerRef.current = window.setTimeout(() => setTooltipVisible(true), delaySec * 1000);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [tooltipText, delaySec, settings.widget_position]);

  const showTooltip = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setTooltipForced('shown');
    setTooltipVisible(true);
  };
  const hideTooltip = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setTooltipForced('hidden');
    setTooltipVisible(false);
  };

  const pos = settings.widget_position || 'bottom-right';
  const top = isTop(pos);
  const right = isRight(pos);
  const accent = settings.accent_color || color;

  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-100">
      <style>{`
        @keyframes brix-launcher-ping {
          0% { transform: scale(1); opacity: 0.55; box-shadow: 0 0 0 0 var(--brix-color, #4f46e5); }
          70% { transform: scale(1.18); opacity: 0; box-shadow: 0 0 0 14px transparent; }
          100% { transform: scale(1); opacity: 0; }
        }
        .brix-launcher-ping {
          animation: brix-launcher-ping 2.4s cubic-bezier(0, 0, 0.2, 1) infinite;
          border-radius: 9999px;
          pointer-events: none;
        }
        @keyframes brix-pop {
          from { transform: translateY(8px) scale(0.97); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
      <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 bg-white border-b border-slate-200">
        Live preview
      </div>

      {/* Fake mini website */}
      <div className="relative overflow-hidden" style={{ minHeight: '26rem' }}>
        {/* Browser chrome */}
        <div className="bg-white border-b border-slate-200 px-3 py-2 flex items-center gap-2">
          <span className="flex gap-1.5">
            <i className="w-2.5 h-2.5 rounded-full bg-rose-400 block" />
            <i className="w-2.5 h-2.5 rounded-full bg-amber-400 block" />
            <i className="w-2.5 h-2.5 rounded-full bg-emerald-400 block" />
          </span>
          <span className="flex-1 bg-slate-100 rounded-full px-3 py-1 text-[11px] text-slate-500 truncate">
            {settings.brand_name ? `www.${settings.brand_name.toLowerCase().replace(/[^a-z0-9]+/g, '')}.com` : 'www.yourstore.com'}
          </span>
        </div>
        {/* Fake page content */}
        <div className="px-5 pt-5 pb-24 bg-gradient-to-b from-slate-50 to-slate-100">
          <div className="h-9 rounded-xl w-3/4" style={{ background: accent }} />
          <div className="mt-3 space-y-2 max-w-xs">
            <div className="h-2.5 rounded bg-slate-200 w-full" />
            <div className="h-2.5 rounded bg-slate-200 w-11/12" />
            <div className="h-2.5 rounded bg-slate-200 w-4/6" />
          </div>
          <div className="mt-4 flex gap-2">
            <div className="h-8 w-24 rounded-full" style={{ background: color }} />
            <div className="h-8 w-24 rounded-full border border-slate-300 bg-white" />
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 max-w-xs">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-xl bg-white border border-slate-200 p-2">
                <div className="h-8 rounded-lg bg-slate-100" />
                <div className="h-2 rounded bg-slate-200 mt-2 w-4/5" />
              </div>
            ))}
          </div>
        </div>

        {/* Launcher corner */}
        <div className={`absolute z-10 ${posClasses(pos)}`}>
          <div className="relative">
            {/* Greeting tooltip */}
            {tooltipVisible && tooltipText && tooltipForced !== 'hidden' && (
              <div
                className={`absolute z-10 max-w-52 w-max rounded-2xl px-3.5 py-2.5 text-xs font-medium text-white shadow-xl animate-[brix-pop_0.2s_ease-out] ${
                  top ? 'top-full mt-2.5' : 'bottom-full mb-2.5'
                } ${right ? 'right-0' : 'left-0'}`}
                style={{ background: color }}
              >
                {tooltipText}
                <span
                  className={`absolute w-2.5 h-2.5 rotate-45 ${top ? '-top-1' : '-bottom-1'} ${
                    right ? 'right-5' : 'left-5'
                  }`}
                  style={{ background: color }}
                />
              </div>
            )}
            <button onClick={() => setOpen((o) => !o)} aria-label="Toggle chat window" className="block">
              <Launcher settings={settings} unread={unread} pulse={!open} />
            </button>
            {open && <MiniChatWindow settings={settings} onClose={() => setOpen(false)} flip={top} right={right} />}
          </div>
        </div>
      </div>

      {/* Preview controls */}
      <div className="px-4 py-3 bg-white border-t border-slate-200 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-600">Unread</span>
          <button
            onClick={() => setUnread((u) => Math.max(0, u - 1))}
            className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-600"
            aria-label="Decrease unread count"
          >
            −
          </button>
          <span className="text-sm font-bold text-slate-800 tabular-nums w-6 text-center">{unread}</span>
          <button
            onClick={() => setUnread((u) => Math.min(12, u + 1))}
            className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-600"
            aria-label="Increase unread count"
          >
            +
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={showTooltip}
            disabled={!tooltipText}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-40"
          >
            Show tooltip
          </button>
          <button
            onClick={hideTooltip}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700"
          >
            Hide tooltip
          </button>
          <button
            onClick={() => setOpen((o) => !o)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
            style={{ background: color }}
          >
            {open ? 'Close widget' : 'Open widget'}
          </button>
        </div>
      </div>

      <div className="px-3 py-2 text-[11px] text-slate-500 bg-white border-t border-slate-200 flex justify-between flex-wrap gap-1">
        <span>Position: {POS_LABEL[pos] || pos}</span>
        <span>
          Launcher: {settings.launcher_style} · Icon: {settings.launcher_icon_svg ? 'custom' : settings.launcher_icon || 'chat'} · Shape:{' '}
          {settings.launcher_shape || 'circle'}
        </span>
      </div>
    </div>
  );
}
