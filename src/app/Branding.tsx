// Brix Chat — Branding studio: logo, brand name, colors, widget chrome,
// with a live widget preview. Client-scoped per property.

import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Button, Card, Input, Label, Select, Toggle } from '../components/ui';
import { toast } from '../components/dashboard/Toasts';
import { useClientApi } from '../components/dashboard/useClientApi';
import WidgetPreview from '../components/dashboard/WidgetPreview';
import { LauncherChatIcon, LauncherHeadsetIcon, LauncherDotsIcon } from '../components/icons';
import type { ApiProperty, PropertySettings } from '../lib/api';

const ICON_CHOICES = [
  { id: 'chat' as const, label: 'Chat bubble', Icon: LauncherChatIcon },
  { id: 'headset' as const, label: 'Headset', Icon: LauncherHeadsetIcon },
  { id: 'dots' as const, label: 'Message dots', Icon: LauncherDotsIcon },
];

const POSITION_LABELS: Record<string, string> = {
  'bottom-right': 'Bottom right',
  'bottom-left': 'Bottom left',
  'top-right': 'Top right',
  'top-left': 'Top left',
};

// Sanitize an uploaded SVG: reject anything that isn't valid SVG, strip
// executable content, and return a data URL — or null when unsafe.
function sanitizeSvgText(text: string): string | null {
  if (!text || text.length > 50 * 1024) return null;
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  } catch {
    return null;
  }
  if (doc.querySelector('parsererror')) return null;
  const svg = doc.querySelector('svg');
  if (!svg) return null;
  svg.querySelectorAll('script, foreignObject').forEach((n) => n.remove());
  const all: Element[] = [svg, ...Array.from(svg.querySelectorAll('*'))];
  for (const el of all) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith('on') || value.includes('javascript:')) {
        el.removeAttribute(attr.name);
      }
    }
  }
  if (svg.querySelector('script, foreignObject')) return null;
  const serialized = new XMLSerializer().serializeToString(svg);
  if (!serialized || serialized.length > 60 * 1024) return null;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(serialized);
}

const PALETTES: Array<{ name: string; widget: string; accent: string }> = [
  { name: 'Indigo', widget: '#4f46e5', accent: '#4f46e5' },
  { name: 'Teal', widget: '#0d9488', accent: '#14b8a6' },
  { name: 'Emerald', widget: '#059669', accent: '#10b981' },
  { name: 'Sky', widget: '#0284c7', accent: '#38bdf8' },
  { name: 'Rose', widget: '#e11d48', accent: '#fb7185' },
  { name: 'Amber', widget: '#d97706', accent: '#fbbf24' },
  { name: 'Slate', widget: '#334155', accent: '#64748b' },
];

export default function Branding() {
  const { api } = useClientApi();
  const [props, setProps] = useState<ApiProperty[]>([]);
  const [propId, setPropId] = useState('');
  const [settings, setSettings] = useState<PropertySettings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!api) return;
    api.properties.list().then(({ data }) => {
      setProps(data);
      if (data.length && !propId) setPropId(data[0].id);
    }).catch(() => {});
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!api || !propId) return;
    setDirty(false);
    api.propertySettings.get(propId).then(({ data }) => setSettings(data)).catch(() => setSettings(null));
  }, [api, propId]);

  const set = (patch: Partial<PropertySettings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    setDirty(true);
  };

  const onLogo = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      toast.error('Please choose an image file.');
      return;
    }
    if (f.size > 512 * 1024) {
      toast.error('Logo must be under 512 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set({ logo_data_url: String(reader.result) });
    reader.readAsDataURL(f);
  };

  const onLauncherSvg = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.svg') && f.type !== 'image/svg+xml') {
      toast.error('Please choose an .svg file.');
      return;
    }
    if (f.size > 50 * 1024) {
      toast.error('SVG must be under 50 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const dataUrl = sanitizeSvgText(String(reader.result));
        if (!dataUrl) {
          toast.error('That SVG is invalid or unsafe — it was not used.');
          return;
        }
        set({ launcher_icon_svg: dataUrl });
        toast.success('Custom launcher icon added.');
      } catch {
        toast.error('Could not read that SVG file.');
      }
    };
    reader.onerror = () => toast.error('Could not read that SVG file.');
    reader.readAsText(f);
  };

  const save = async () => {
    if (!api || !settings || !propId) return;
    setBusy(true);
    try {
      const { data } = await api.propertySettings.patch(propId, settings);
      setSettings(data);
      setDirty(false);
      toast.success('Branding saved — the widget updates immediately.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save branding.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Branding studio</h1>
          <p className="text-sm text-slate-500 mt-1">Make the widget feel like your own product.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={propId} onChange={(e) => setPropId(e.target.value)} className="min-w-48">
            {props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Button onClick={save} disabled={!dirty || busy}>{busy ? 'Saving…' : 'Save branding'}</Button>
        </div>
      </div>

      {!settings ? (
        <Card className="p-8 text-center text-sm text-slate-500">Loading branding…</Card>
      ) : (
        <div className="grid lg:grid-cols-2 gap-5 items-start">
          <Card className="p-6 space-y-5">
            <div>
              <Label>Brand name</Label>
              <Input value={settings.brand_name} onChange={(e) => set({ brand_name: e.target.value })} placeholder="Acme Store" />
            </div>
            <div>
              <Label>Tagline</Label>
              <Input value={settings.tagline} onChange={(e) => set({ tagline: e.target.value })} placeholder="Quality gear, shipped fast." />
            </div>
            <div>
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                {settings.logo_data_url ? (
                  <img src={settings.logo_data_url} alt="Logo" className="w-12 h-12 rounded-xl object-contain border border-slate-200 bg-white" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-slate-100 grid place-items-center text-slate-500 text-xl">🖼</div>
                )}
                <label className="cursor-pointer">
                  <span className="inline-block px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-semibold text-slate-700">Upload logo</span>
                  <input type="file" accept="image/*" className="hidden" onChange={onLogo} />
                </label>
                {settings.logo_data_url && (
                  <button onClick={() => set({ logo_data_url: null })} className="text-sm text-rose-600 font-semibold hover:underline">Remove</button>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1.5">PNG or SVG, under 512 KB. Stored in this browser only.</p>
            </div>
            <div>
              <Label>Palette</Label>
              <div className="flex flex-wrap gap-2">
                {PALETTES.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => set({ widget_color: p.widget, accent_color: p.accent })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition ${settings.widget_color === p.widget ? 'border-brix-600 bg-brix-50 text-brix-800' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                  >
                    <span className="w-5 h-5 rounded-full" style={{ background: `linear-gradient(135deg, ${p.widget}, ${p.accent})` }} />
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Widget color</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={settings.widget_color} onChange={(e) => set({ widget_color: e.target.value })} className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer" />
                  <Input value={settings.widget_color} onChange={(e) => set({ widget_color: e.target.value })} className="font-mono text-xs" />
                </div>
              </div>
              <div>
                <Label>Accent color</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={settings.accent_color} onChange={(e) => set({ accent_color: e.target.value })} className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer" />
                  <Input value={settings.accent_color} onChange={(e) => set({ accent_color: e.target.value })} className="font-mono text-xs" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Theme</Label>
                <Select value={settings.theme} onChange={(e) => set({ theme: e.target.value })} className="w-full">
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="teal">Teal</option>
                </Select>
              </div>
              <div>
                <Label>Launcher style</Label>
                <Select value={settings.launcher_style} onChange={(e) => set({ launcher_style: e.target.value as 'bubble' | 'bar' })} className="w-full">
                  <option value="bubble">Bubble</option>
                  <option value="bar">Bar</option>
                </Select>
              </div>
            </div>
            <div>
              <Label>Widget position</Label>
              <Select value={settings.widget_position} onChange={(e) => set({ widget_position: e.target.value as PropertySettings['widget_position'] })} className="w-full">
                {Object.entries(POSITION_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Launcher icon</Label>
              <div className="flex flex-wrap items-center gap-2">
                {ICON_CHOICES.map(({ id, label, Icon }) => {
                  const active = settings.launcher_icon_svg == null && (settings.launcher_icon || 'chat') === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => set({ launcher_icon: id, launcher_icon_svg: null })}
                      title={label}
                      aria-label={label}
                      className={`w-12 h-12 rounded-xl border grid place-items-center transition ${active ? 'border-brix-600 bg-brix-50 text-brix-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                    >
                      <Icon className="w-6 h-6" />
                    </button>
                  );
                })}
                <label className="cursor-pointer">
                  <span className={`inline-flex items-center w-12 h-12 rounded-xl border grid place-items-center text-slate-500 transition ${settings.launcher_icon_svg ? 'border-brix-600 bg-brix-50 text-brix-700' : 'border-slate-200 hover:border-slate-300'}`} title="Upload SVG">
                    {settings.launcher_icon_svg ? (
                      <img src={settings.launcher_icon_svg} alt="Custom" className="w-6 h-6 object-contain" />
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6" aria-hidden>
                        <path d="M12 16V8M8 12h8" />
                        <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2" />
                      </svg>
                    )}
                  </span>
                  <input type="file" accept=".svg,image/svg+xml" className="hidden" onChange={onLauncherSvg} />
                </label>
                {settings.launcher_icon_svg && (
                  <button type="button" onClick={() => set({ launcher_icon_svg: null })} className="text-sm text-rose-600 font-semibold hover:underline">
                    Remove
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1.5">SVG only, under 50 KB. Unsafe content is stripped automatically.</p>
            </div>
            <div>
              <Label>Launcher shape</Label>
              <div className="inline-flex rounded-xl border border-slate-200 p-1 bg-slate-50">
                {(['circle', 'rounded'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => set({ launcher_shape: s })}
                    className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${(settings.launcher_shape || 'circle') === s ? 'bg-white text-brix-800 shadow' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {s === 'circle' ? 'Circle' : 'Rounded square'}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <Toggle label="Show unread badge" checked={settings.launcher_badge !== false} onChange={(v) => set({ launcher_badge: v })} />
              <Toggle label="Attention pulse animation" checked={settings.launcher_pulse !== false} onChange={(v) => set({ launcher_pulse: v })} />
            </div>
            <div>
              <Label>Greeting tooltip</Label>
              <Input
                value={settings.greeting_tooltip || ''}
                onChange={(e) => set({ greeting_tooltip: e.target.value })}
                placeholder="Need help? Chat with us…"
                maxLength={120}
              />
              <div className="mt-2 flex items-center gap-3">
                <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Show after</span>
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={1}
                  value={settings.greeting_tooltip_delay ?? 5}
                  onChange={(e) => set({ greeting_tooltip_delay: Number(e.target.value) })}
                  className="flex-1 accent-indigo-600"
                  aria-label="Tooltip delay in seconds"
                />
                <span className="text-xs font-bold text-slate-700 tabular-nums w-10 text-right">{settings.greeting_tooltip_delay ?? 5}s</span>
              </div>
              <p className="text-xs text-slate-500 mt-1.5">Appears after this many seconds (0–30). Leave the text empty to disable.</p>
            </div>
          </Card>
          <WidgetPreview settings={settings} />
        </div>
      )}
    </div>
  );
}
