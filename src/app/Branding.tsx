// Brix Chat — Branding studio: logo, brand name, colors, widget chrome,
// with a live widget preview. Client-scoped per property.

import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Button, Card, Input, Label, Select } from '../components/ui';
import { toast } from '../components/dashboard/Toasts';
import { useClientApi } from '../components/dashboard/useClientApi';
import WidgetPreview from '../components/dashboard/WidgetPreview';
import type { ApiProperty, PropertySettings } from '../lib/api';

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
                  <div className="w-12 h-12 rounded-xl bg-slate-100 grid place-items-center text-slate-400 text-xl">🖼</div>
                )}
                <label className="cursor-pointer">
                  <span className="inline-block px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-semibold text-slate-700">Upload logo</span>
                  <input type="file" accept="image/*" className="hidden" onChange={onLogo} />
                </label>
                {settings.logo_data_url && (
                  <button onClick={() => set({ logo_data_url: null })} className="text-sm text-rose-600 font-semibold hover:underline">Remove</button>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1.5">PNG or SVG, under 512 KB. Stored in this browser only.</p>
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
              <Select value={settings.widget_position} onChange={(e) => set({ widget_position: e.target.value as 'bottom-right' | 'bottom-left' })} className="w-full">
                <option value="bottom-right">Bottom right</option>
                <option value="bottom-left">Bottom left</option>
              </Select>
            </div>
          </Card>
          <WidgetPreview settings={settings} />
        </div>
      )}
    </div>
  );
}
