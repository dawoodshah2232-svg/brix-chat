// Brix Chat — Workspace settings.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import type { Settings as SettingsData, TeamMember } from '../lib/types';
import { getApi } from '../lib/api';
import type { CopilotSettings, DataSettings, SecuritySettings } from '../lib/api';
import { copyText } from '../lib/utils';
import { Avatar, Button, Card, Input, Label, Select, Textarea, Toggle, useConfirm } from '../components/ui';
import ProfanitySection from '../components/dashboard/ProfanitySection';
import { DEFAULT_SLA_POLICIES, type SlaPolicy, type SlaPriority } from '../lib/sla';
import { DEFAULT_BOT_THRESHOLD, DEFAULT_HANDOFF_TIMEOUT_MINS } from '../lib/bot';
import { getTheme, setTheme, type Theme } from '../lib/theme';
import {
  TONES, EVENT_LABELS, loadNotifyPrefs, saveNotifyPrefs,
  playTone, desktopPermission, requestDesktopPermission, fireIncomingMessage,
  type NotifyPrefs, type NotifyEvent,
} from '../lib/sounds';
import { cx } from '../lib/utils';

const COLOR_PRESETS = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#0b1020'];
const MEMBER_COLORS = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
const EMBED_CODE = `<script>
  window.Brix_API = window.Brix_API || {};
</script>
<script async src="/widget.js" data-property="YOUR_PROPERTY_KEY"></script>`;

const BUBBLE_CLASS: Record<SettingsData['widget']['bubble'], string> = {
  round: 'rounded-full',
  pill: 'rounded-2xl',
  square: 'rounded-md',
};

function SectionTitle({ children }: { children: string }) {
  return <h2 className="text-base font-display font-bold text-slate-900">{children}</h2>;
}

const COPILOT_TONES = [
  { value: 'friendly', label: 'Friendly — warm and conversational' },
  { value: 'professional', label: 'Professional — polished and formal' },
  { value: 'concise', label: 'Concise — short and to the point' },
] as const;

const COPILOT_SOURCES = [
  { key: 'knowledge-base', label: 'Knowledge base articles' },
  { key: 'canned', label: 'Canned responses' },
  { key: 'history', label: 'Past conversation history' },
];

function AdvancedSettings({ workspace, actor }: { workspace: string; actor: string }) {
  const api = getApi(workspace, actor);
  const [copilot, setCopilot] = useState<CopilotSettings | null>(null);
  const [security, setSecurity] = useState<SecuritySettings | null>(null);
  const [dataCfg, setDataCfg] = useState<DataSettings | null>(null);
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const [c, s, d] = await Promise.all([
        api.copilotSettings.get(),
        api.securitySettings.get(),
        api.dataSettings.get(),
      ]);
      setCopilot(c.data);
      setSecurity(s.data);
      setDataCfg(d.data);
    })().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace]);

  const flash = (msg: string) => {
    setSaved(msg);
    setTimeout(() => setSaved(''), 2500);
  };

  const patchCopilot = async (p: Partial<CopilotSettings>) => {
    if (!copilot) return;
    const next = { ...copilot, ...p };
    setCopilot(next);
    await api.copilotSettings.patch(p);
    flash('Copilot settings saved');
  };

  const patchSecurity = async (p: Partial<SecuritySettings>) => {
    if (!security) return;
    const next = { ...security, ...p };
    setSecurity(next);
    await api.securitySettings.patch(p);
    flash('Security settings saved');
  };

  const patchData = async (p: Partial<DataSettings>) => {
    if (!dataCfg) return;
    const next = { ...dataCfg, ...p };
    setDataCfg(next);
    await api.dataSettings.patch(p);
    flash('Data settings saved');
  };

  const toggleSource = (key: string) => {
    if (!copilot) return;
    const has = copilot.sources.includes(key);
    patchCopilot({ sources: has ? copilot.sources.filter((x) => x !== key) : [...copilot.sources, key] });
  };

  const exportAll = async () => {
    const { data } = await api.dataExport();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `brixchat-${data.workspace}-${data.exported_at.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importAll = async (file: File) => {
    setBusy(true);
    try {
      const json = JSON.parse(await file.text());
      await api.dataImport(json);
      flash('Data imported — reloading');
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  if (!copilot || !security || !dataCfg) return null;

  return (
    <>
      {/* AI Copilot */}
      <Card className="p-6">
        <SectionTitle>AI Copilot</SectionTitle>
        <p className="text-sm text-slate-500 mt-1">How the writing assistant drafts replies, summaries and translations.</p>
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <div>
            <Label>Reply tone</Label>
            <Select value={copilot.tone} onChange={(e) => patchCopilot({ tone: e.target.value as CopilotSettings['tone'] })}>
              {COPILOT_TONES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>AI provider</Label>
            <Select value={copilot.provider} onChange={(e) => patchCopilot({ provider: e.target.value as CopilotSettings['provider'] })}>
              <option value="local">Local drafts (built-in, works now)</option>
              <option value="openai">OpenAI — key required (backend phase)</option>
              <option value="anthropic">Anthropic — key required (backend phase)</option>
            </Select>
            {copilot.provider !== 'local' && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                Provider keys activate with the backend phase. Add yours under Admin → AI &amp; integrations when live calls are enabled.
              </p>
            )}
          </div>
        </div>
        <div className="divide-y divide-slate-100 mt-3">
          {[
            { key: 'autosuggest' as const, label: 'Auto-suggest replies', hint: 'Offer a draft reply as visitors type' },
            { key: 'summarize' as const, label: 'Thread summaries', hint: 'One-click summary of long conversations' },
            { key: 'translate' as const, label: 'Auto-translate', hint: 'Translate messages for both sides' },
          ].map((r) => (
            <div key={r.key} className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">{r.label}</div>
                <div className="text-xs text-slate-500">{r.hint}</div>
              </div>
              <Toggle checked={copilot[r.key]} onChange={(v) => patchCopilot({ [r.key]: v })} label={r.label} />
            </div>
          ))}
        </div>
        <div className="mt-2">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Answer sources</div>
          <div className="flex flex-wrap gap-2">
            {COPILOT_SOURCES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => toggleSource(s.key)}
                aria-pressed={copilot.sources.includes(s.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                  copilot.sources.includes(s.key)
                    ? 'bg-brix-600 text-white border-brix-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {copilot.sources.includes(s.key) ? '✓ ' : ''}{s.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Security */}
      <Card className="p-6">
        <SectionTitle>Security</SectionTitle>
        <p className="text-sm text-slate-500 mt-1">Session and passcode policies for this workspace.</p>
        <div className="grid sm:grid-cols-3 gap-4 mt-4">
          <div>
            <Label>Session timeout (minutes)</Label>
            <Input
              type="number" min={15} max={4320} value={security.session_timeout_mins}
              onChange={(e) => patchSecurity({ session_timeout_mins: Math.max(15, Number(e.target.value) || 15) })}
            />
          </div>
          <div>
            <Label>Minimum passcode length</Label>
            <Input
              type="number" min={4} max={32} value={security.passcode_min_len}
              onChange={(e) => patchSecurity({ passcode_min_len: Math.min(32, Math.max(4, Number(e.target.value) || 4)) })}
            />
          </div>
          <div>
            <Label>Passcode expiry (days)</Label>
            <Input
              type="number" min={0} max={365} value={security.passcode_expiry_days}
              onChange={(e) => patchSecurity({ passcode_expiry_days: Math.max(0, Number(e.target.value) || 0) })}
            />
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-3">Set expiry to 0 to never expire passcodes. Changes apply to new logins.</p>
      </Card>

      {/* Data management */}
      <Card className="p-6">
        <SectionTitle>Data management</SectionTitle>
        <p className="text-sm text-slate-500 mt-1">Everything is stored locally in this browser. Export a backup, restore one, or set retention.</p>
        <div className="flex flex-wrap gap-3 mt-4">
          <Button variant="secondary" onClick={exportAll}>⬇ Export all data (JSON)</Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? 'Importing…' : '⬆ Import backup'}
          </Button>
          <input
            ref={fileRef} type="file" accept="application/json" className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importAll(f);
              e.target.value = '';
            }}
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-4 mt-5">
          <div>
            <Label>Keep history for (days)</Label>
            <Input
              type="number" min={30} max={3650} value={dataCfg.retention_days}
              onChange={(e) => patchData({ retention_days: Math.max(30, Number(e.target.value) || 30) })}
            />
          </div>
          <div className="flex items-end pb-1">
            <Toggle
              checked={dataCfg.auto_purge}
              onChange={(v) => patchData({ auto_purge: v })}
              label="Auto-purge old data"
            />
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          {dataCfg.auto_purge
            ? `Conversations and tickets older than ${dataCfg.retention_days} days are purged automatically on load.`
            : 'Auto-purge is off — old records are kept until you delete them.'}
        </p>
      </Card>

      {saved && (
        <div role="status" className="fixed bottom-6 right-6 z-50 rounded-xl bg-slate-900 text-white text-sm font-medium px-4 py-2.5 shadow-lg">
          ✓ {saved}
        </div>
      )}
    </>
  );
}

/* ---------- UX ELEVATION: appearance + sounds (localStorage-backed) ---------- */

function AppearanceSection({ agent }: { agent: string }) {
  const [theme, setThemeState] = useState<Theme>(() => getTheme(agent));
  const flip = (dark: boolean) => {
    const next: Theme = dark ? 'dark' : 'light';
    setTheme(agent, next);
    setThemeState(next);
  };
  return (
    <Card className="p-6">
      <SectionTitle>Appearance</SectionTitle>
      <p className="text-sm text-slate-500 mt-1 mb-2">Dashboard theme — saved per agent on this browser.</p>
      <div className="flex items-center justify-between py-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">{theme === 'dark' ? '🌙 Dark mode' : '☀️ Light mode'}</div>
          <div className="text-xs text-slate-500">Restyles the dashboard chrome and common surfaces. The widget keeps its own theme.</div>
        </div>
        <Toggle checked={theme === 'dark'} onChange={flip} label="Dark mode" />
      </div>
    </Card>
  );
}

function SoundNotifications({ agent }: { agent: string }) {
  const store = useStore();
  const [prefs, setPrefs] = useState<NotifyPrefs>(() => loadNotifyPrefs(agent));
  const [perm, setPerm] = useState<NotificationPermission>(() => desktopPermission());

  // Keep the store's bell prefs in sync so the topbar notification bell keeps
  // honoring the same sound + per-event choices.
  const update = (patch: Partial<NotifyPrefs>) => {
    const next: NotifyPrefs = { ...prefs, ...patch };
    setPrefs(next);
    saveNotifyPrefs(agent, next);
    store.updateSettings({
      notifySound: next.sound,
      notifyPrefs: {
        sound: next.sound,
        desktopBell: next.desktop,
        events: {
          ...(store.data.settings.notifyPrefs?.events ?? {}),
          'chat.message': next.events.newMessage,
          'chat.assigned': next.events.assigned,
          mention: next.events.mention,
        },
      },
    });
  };

  const setEvent = (k: NotifyEvent, v: boolean) => update({ events: { ...prefs.events, [k]: v } });

  const enableDesktop = async () => {
    setPerm(await requestDesktopPermission());
  };

  return (
    <Card className="p-6">
      <SectionTitle>Sounds &amp; notifications</SectionTitle>
      <p className="text-sm text-slate-500 mt-1 mb-2">
        Tones are generated live in your browser — no audio files, nothing to download. Saved per agent on this device.
      </p>
      <div className="divide-y divide-slate-100">
        <div className="flex items-center justify-between py-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">🔔 Notification sound</div>
            <div className="text-xs text-slate-500">Play a tone when a notification arrives</div>
          </div>
          <Toggle checked={prefs.sound} onChange={(v) => update({ sound: v })} label="Notification sound" />
        </div>

        {prefs.sound && (
          <div className="py-4 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Tone</Label>
                <div className="flex gap-2" role="radiogroup" aria-label="Notification tone">
                  {TONES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={prefs.tone === t.id}
                      title={t.hint}
                      onClick={() => { update({ tone: t.id }); playTone(t.id, prefs.volume); }}
                      className={cx(
                        'flex-1 px-3 py-2 rounded-xl text-sm font-semibold border transition',
                        prefs.tone === t.id
                          ? 'bg-brix-600 text-white border-brix-600 shadow-lg shadow-brix-600/25'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300',
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Volume · {Math.round(prefs.volume * 100)}%</Label>
                <input
                  type="range" min={0} max={100} value={Math.round(prefs.volume * 100)}
                  onChange={(e) => update({ volume: Number(e.target.value) / 100 })}
                  className="w-full accent-brix-600" aria-label="Notification volume"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => playTone(prefs.tone, prefs.volume)}>
                ▶ Preview tone
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => fireIncomingMessage(agent, 'Test visitor', 'Hi! Is anyone there? This is a simulated incoming message to test your sound + desktop settings.', '/app', { preview: true, messageId: `test-${Date.now()}` })}
              >
                ✉ Simulate incoming message
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between py-3 gap-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">🖥️ Desktop notifications</div>
            <div className="text-xs text-slate-500">
              Show a system notification even when this tab is in the background. Honest notes: your browser asks
              for permission first; if you blocked it, re-allow it in the browser&apos;s site settings — the button
              below can&apos;t override a block. Notifications only ever cover your own workspace&apos;s chats.
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {perm !== 'granted' && (
              <Button size="sm" variant="secondary" onClick={enableDesktop} disabled={perm === 'denied'}>
                {perm === 'denied' ? 'Blocked in browser' : 'Enable'}
              </Button>
            )}
            <Toggle checked={prefs.desktop && perm === 'granted'} onChange={(v) => update({ desktop: v })} label="Desktop notifications" />
          </div>
        </div>

        <div className="pt-4">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Notify me about</div>
          {(Object.keys(EVENT_LABELS) as NotifyEvent[]).map((k) => (
            <div key={k} className="flex items-center justify-between py-2.5">
              <div className="text-sm font-medium text-slate-700">{EVENT_LABELS[k]}</div>
              <Toggle checked={prefs.events[k]} onChange={(v) => setEvent(k, v)} label={EVENT_LABELS[k]} />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export default function Settings() {
  const store = useStore();
  const { confirm, dialog } = useConfirm();
  const s = store.data.settings;
  const agentName = store.session?.displayName ?? 'agent';
  const patchBot = (patch: Partial<NonNullable<SettingsData['bot']>>) =>
    store.updateSettings({
      bot: {
        confidenceThreshold: s.bot?.confidenceThreshold ?? DEFAULT_BOT_THRESHOLD,
        handoffTimeoutMins: s.bot?.handoffTimeoutMins ?? DEFAULT_HANDOFF_TIMEOUT_MINS,
        ...patch,
      },
    });
  const patchSla = (priority: SlaPriority, patch: Partial<SlaPolicy>) =>
    store.updateSettings({
      slaPolicies: (s.slaPolicies ?? DEFAULT_SLA_POLICIES).map((p) => (p.priority === priority ? { ...p, ...patch } : p)),
    });
  const w = s.widget;

  const setWidget = (patch: Partial<SettingsData['widget']>) =>
    store.updateSettings({ widget: { ...w, ...patch } });

  const [deptInput, setDeptInput] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<TeamMember['role']>('Agent');
  const [copied, setCopied] = useState(false);

  const addDepartment = () => {
    const d = deptInput.trim();
    if (!d || s.departments.includes(d)) return;
    store.updateSettings({ departments: [...s.departments, d] });
    setDeptInput('');
  };

  const removeDepartment = (d: string) =>
    store.updateSettings({ departments: s.departments.filter((x) => x !== d) });

  const addMember = () => {
    const name = newName.trim();
    if (!name) return;
    store.updateSettings({
      team: [...s.team, { name, role: newRole, online: true, color: MEMBER_COLORS[s.team.length % MEMBER_COLORS.length] }],
    });
    setNewName('');
  };

  const updateMember = (i: number, patch: Partial<TeamMember>) =>
    store.updateSettings({ team: s.team.map((m, j) => (j === i ? { ...m, ...patch } : m)) });

  const removeMember = (i: number) =>
    store.updateSettings({ team: s.team.filter((_, j) => j !== i) });

  const updateHour = (i: number, patch: Partial<SettingsData['hours'][number]>) =>
    store.updateSettings({ hours: s.hours.map((h, j) => (j === i ? { ...h, ...patch } : h)) });

  const copyEmbed = async () => {
    await copyText(EMBED_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-display font-extrabold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Widget, team, hours and product preferences</p>
      </div>

      {/* Widget appearance */}
      <Card className="p-6">
        <SectionTitle>Widget appearance</SectionTitle>
        <div className="grid lg:grid-cols-2 gap-8 mt-4">
          <div className="space-y-4">
            <div>
              <Label>Brand color</Label>
              <div className="flex items-center gap-2">
                {COLOR_PRESETS.map((c) => (
                  <button key={c} onClick={() => setWidget({ color: c })} aria-label={c}
                    className={`w-9 h-9 rounded-full border-2 transition ${w.color === c ? 'border-ink-950 scale-110' : 'border-transparent hover:scale-105'}`}
                    style={{ background: c }} />
                ))}
                <input type="color" value={w.color} onChange={(e) => setWidget({ color: e.target.value })}
                  className="w-9 h-9 rounded-full cursor-pointer border border-slate-200 p-0.5" title="Custom color" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Position</Label>
                <Select value={w.position} onChange={(e) => setWidget({ position: e.target.value as SettingsData['widget']['position'] })} className="w-full">
                  <option value="bottom-right">Bottom right</option>
                  <option value="bottom-left">Bottom left</option>
                </Select>
              </div>
              <div>
                <Label>Bubble style</Label>
                <Select value={w.bubble} onChange={(e) => setWidget({ bubble: e.target.value as SettingsData['widget']['bubble'] })} className="w-full">
                  <option value="round">Round</option>
                  <option value="pill">Pill</option>
                  <option value="square">Square</option>
                </Select>
              </div>
            </div>
            <div>
              <Label>Corner radius · {w.radius}px</Label>
              <input type="range" min={4} max={24} value={w.radius}
                onChange={(e) => setWidget({ radius: Number(e.target.value) })} className="w-full accent-brix-600" />
            </div>
            <div><Label>Agent name</Label><Input value={w.agentName} onChange={(e) => setWidget({ agentName: e.target.value })} /></div>
            <div><Label>Greeting message</Label><Input value={w.greeting} onChange={(e) => setWidget({ greeting: e.target.value })} /></div>
            <div><Label>Offline message</Label><Input value={w.offlineText} onChange={(e) => setWidget({ offlineText: e.target.value })} /></div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
              <span className="text-sm font-medium text-slate-700">Show "Powered by Brix Chat" branding</span>
              <Toggle checked={w.showBranding} onChange={(v) => setWidget({ showBranding: v })} label="Branding" />
            </div>
          </div>

          {/* Live preview */}
          <div>
            <Label>Live preview</Label>
            <div className="rounded-2xl bg-slate-100 border border-slate-200 p-4 h-[380px] relative overflow-hidden">
              <div className="text-xs text-slate-500 mb-2">Position: {w.position.replace('-', ' ')}</div>
              <div className="absolute left-4 right-4 bottom-4">
                <div className="bg-white shadow-xl border border-slate-200 overflow-hidden" style={{ borderRadius: w.radius }}>
                  <div className="px-4 py-3 flex items-center gap-2.5"
                    style={{ background: `linear-gradient(135deg, ${w.color}, ${w.color}dd)` }}>
                    <div className="w-8 h-8 rounded-full bg-white/25 grid place-items-center text-white text-xs font-bold">
                      {w.agentName.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <div>
                      <div className="text-white text-sm font-bold leading-tight">{w.agentName}</div>
                      <div className="text-white/80 text-[11px] flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-300" /> Online</div>
                    </div>
                  </div>
                  <div className="p-3 space-y-2 bg-slate-50">
                    <div className="bg-white border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm max-w-[85%]"
                      style={{ borderRadius: w.radius }}>{w.greeting}</div>
                    <div className="flex gap-2">
                      <div className="flex-1 bg-white border border-slate-200 px-3 py-2 text-xs text-slate-500"
                        style={{ borderRadius: w.radius }}>Type a message…</div>
                      <div className="px-3 py-2 text-xs text-white font-bold grid place-items-center"
                        style={{ background: w.color, borderRadius: w.radius }}>➤</div>
                    </div>
                  </div>
                  {w.showBranding && <div className="text-center text-[10px] text-slate-500 py-1.5 bg-white border-t border-slate-100">Powered by Brix Chat</div>}
                </div>
                <div className={`mt-3 w-12 h-12 ${w.position === 'bottom-right' ? 'ml-auto' : ''} ${BUBBLE_CLASS[w.bubble]} shadow-xl grid place-items-center text-white text-lg`}
                  style={{ background: w.color }}>💬</div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Departments */}
      <Card className="p-6">
        <SectionTitle>Departments</SectionTitle>
        <div className="flex flex-wrap gap-2 mt-4">
          {s.departments.map((d) => (
            <span key={d} className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full bg-brix-100 text-brix-700 text-sm font-semibold">
              {d}
              <button onClick={() => removeDepartment(d)} aria-label={`Remove ${d}`}
                className="w-5 h-5 grid place-items-center rounded-full hover:bg-brix-200 text-xs">✕</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2 mt-4 max-w-sm">
          <Input value={deptInput} onChange={(e) => setDeptInput(e.target.value)} placeholder="New department…" onKeyDown={(e) => e.key === 'Enter' && addDepartment()} />
          <Button onClick={addDepartment}>Add</Button>
        </div>
      </Card>

      {/* Team */}
      <Card className="p-6">
        <SectionTitle>Team</SectionTitle>
        <div className="divide-y divide-slate-100 mt-2">
          {s.team.map((m, i) => (
            <div key={`${m.name}-${i}`} className="flex items-center gap-3 py-3">
              <Avatar name={m.name} color={m.color} />
              <div className="flex-1">
                <div className="font-semibold text-slate-900 text-sm">{m.name}</div>
                <div className="text-xs text-slate-500 flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${m.online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  {m.online ? 'Online' : 'Offline'}
                </div>
              </div>
              <Select value={m.role} onChange={(e) => updateMember(i, { role: e.target.value as TeamMember['role'] })}>
                <option value="Admin">Admin</option>
                <option value="Agent">Agent</option>
              </Select>
              <Toggle checked={m.online} onChange={(v) => updateMember(i, { online: v })} label={`${m.name} online`} />
              <Button size="sm" variant="ghost" className="text-rose-600 hover:bg-rose-50" onClick={() => removeMember(i)}>✕</Button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-4 max-w-md">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Member name…" onKeyDown={(e) => e.key === 'Enter' && addMember()} />
          <Select value={newRole} onChange={(e) => setNewRole(e.target.value as TeamMember['role'])}>
            <option value="Admin">Admin</option>
            <option value="Agent">Agent</option>
          </Select>
          <Button onClick={addMember}>Add</Button>
        </div>
      </Card>

      {/* Online hours */}
      <Card className="p-6">
        <SectionTitle>Online hours</SectionTitle>
        <div className="divide-y divide-slate-100 mt-2">
          {s.hours.map((h, i) => (
            <div key={h.day} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
              <span className="w-24 text-sm font-semibold text-slate-800">{h.day}</span>
              <input type="time" value={h.from} onChange={(e) => updateHour(i, { from: e.target.value })}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm disabled:opacity-40 min-w-0" disabled={!h.enabled} />
              <span className="text-slate-500 text-sm">to</span>
              <input type="time" value={h.to} onChange={(e) => updateHour(i, { to: e.target.value })}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm disabled:opacity-40 min-w-0" disabled={!h.enabled} />
              <div className="ml-auto"><Toggle checked={h.enabled} onChange={(v) => updateHour(i, { enabled: v })} label={h.day} /></div>
            </div>
          ))}
        </div>
      </Card>

      <AppearanceSection agent={agentName} />
      <SoundNotifications agent={agentName} />

      {/* SLA policies */}
      <Card className="p-6">
        <SectionTitle>SLA policies</SectionTitle>
        <p className="text-sm text-slate-500 mt-1 mb-2">
          Response and resolution targets per ticket priority. When a ticket is created you can apply its
          policy to set the SLA due date automatically. Risk = due within 24 hours.
        </p>
        <div className="divide-y divide-slate-100">
          {(s.slaPolicies ?? DEFAULT_SLA_POLICIES).map((p) => (
            <div key={p.priority} className="flex items-center gap-3 py-3 flex-wrap">
              <div className="w-24 capitalize text-sm font-semibold text-slate-900">⚑ {p.priority}</div>
              <Toggle checked={p.enabled} onChange={(v) => patchSla(p.priority, { enabled: v })} label={`SLA policy for ${p.priority}`} />
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-slate-500">Respond in</span>
                <Input type="number" min={1} max={720} value={p.firstResponseHours} disabled={!p.enabled}
                  onChange={(e) => patchSla(p.priority, { firstResponseHours: Math.max(1, Number(e.target.value) || 1) })}
                  className="w-20" />
                <span className="text-xs text-slate-500">h · resolve in</span>
                <Input type="number" min={1} max={2160} value={p.resolveHours} disabled={!p.enabled}
                  onChange={(e) => patchSla(p.priority, { resolveHours: Math.max(1, Number(e.target.value) || 1) })}
                  className="w-20" />
                <span className="text-xs text-slate-500">h</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Bot & handoff */}
      <Card className="p-6">
        <SectionTitle>Bot & handoff</SectionTitle>
        <p className="text-sm text-slate-500 mt-1 mb-4">
          The bot answers from a keyword heuristic — confidence is an auto estimate, not AI certainty.
          Below the threshold a chat is routed to a human instead of auto-answered.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Confidence threshold (%)</Label>
            <Input
              type="number" min={0} max={100}
              value={s.bot?.confidenceThreshold ?? DEFAULT_BOT_THRESHOLD}
              onChange={(e) => patchBot({ confidenceThreshold: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
            />
            <p className="text-xs text-slate-500 mt-1">Bot replies scoring below this are handed to a human.</p>
          </div>
          <div>
            <Label>Handoff timeout (minutes)</Label>
            <Input
              type="number" min={1} max={240}
              value={s.bot?.handoffTimeoutMins ?? DEFAULT_HANDOFF_TIMEOUT_MINS}
              onChange={(e) => patchBot({ handoffTimeoutMins: Math.min(240, Math.max(1, Number(e.target.value) || 1)) })}
            />
            <p className="text-xs text-slate-500 mt-1">An AI-handled chat waiting this long for an agent is escalated.</p>
          </div>
        </div>
      </Card>

      {/* Sentiment & distress alerts */}
      <Card className="p-6">
        <SectionTitle>Sentiment & distress alerts</SectionTitle>
        <p className="text-sm text-slate-500 mt-1 mb-4">
          A keyword heuristic watches new visitor messages. Sentiment shown everywhere is an{' '}
          <span className="font-semibold">auto estimate</span> — not AI analysis.
        </p>
        <div className="divide-y divide-slate-100">
          <div className="flex items-center justify-between py-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">⚠ Distress alerts</div>
              <div className="text-xs text-slate-500">
                When triggered: auto-tag “distress”, raise priority to high, show a warning toast, write an audit entry
              </div>
            </div>
            <Toggle
              checked={s.distress?.enabled ?? true}
              onChange={(v) => store.updateSettings({ distress: { enabled: v, customWords: s.distress?.customWords ?? [] } })}
              label="Distress alerts"
            />
          </div>
          <div className="py-3">
            <Label>Custom distress words</Label>
            <p className="text-xs text-slate-500 mb-2">Comma-separated words or phrases that always trigger an alert, e.g. <code className="font-mono bg-slate-100 px-1 rounded">refund now, manager, terrible</code>.</p>
            <Input
              value={(s.distress?.customWords ?? []).join(', ')}
              onChange={(e) => store.updateSettings({
                distress: {
                  enabled: s.distress?.enabled ?? true,
                  customWords: e.target.value.split(',').map((w) => w.trim()).filter(Boolean),
                },
              })}
              placeholder="refund now, manager, …"
            />
          </div>
        </div>
      </Card>

      {/* Product toggles */}
      <Card className="p-6">
        <SectionTitle>Product</SectionTitle>
        <div className="divide-y divide-slate-100 mt-2">
          {([
            { key: 'whiteLabel', label: 'White label', hint: 'Remove all Brix Chat branding from the widget' },
            { key: 'aiEnabled', label: 'AI answers first', hint: 'Let the AI agent reply before a human picks up' },
            { key: 'notifySound', label: 'Notification sound', hint: 'Play a sound when a new message arrives' },
          ] as Array<{ key: 'whiteLabel' | 'aiEnabled' | 'notifySound'; label: string; hint: string }>).map((r) => (
            <div key={r.key} className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">{r.label}</div>
                <div className="text-xs text-slate-500">{r.hint}</div>
              </div>
              <Toggle checked={s[r.key]} onChange={(v) => store.updateSettings({ [r.key]: v })} label={r.label} />
            </div>
          ))}
        </div>
      </Card>

      {/* Embed code */}
      <Card className="p-6">
        <SectionTitle>Embed code</SectionTitle>
        <p className="text-sm text-slate-500 mt-1 mb-3">Paste this snippet before the closing <code className="font-mono text-xs bg-slate-100 px-1 rounded">&lt;/body&gt;</code> tag on your site.</p>
        <Textarea readOnly rows={2} value={EMBED_CODE} className="font-mono text-xs" />
        <div className="flex items-center gap-3 mt-3">
          <Button variant="secondary" onClick={copyEmbed}>{copied ? '✓ Copied' : 'Copy code'}</Button>
          <span className="text-xs text-slate-500">Use your property key from Properties → Install</span>
        </div>
      </Card>

      {/* Advanced: copilot, security, data */}
      {store.session && <AdvancedSettings workspace={store.effectiveWorkspaceId()} actor={store.session.displayName} />}

      {/* Conversation Operations: profanity filter */}
      <ProfanitySection />

      {/* Danger zone */}
      <Card className="p-6 border-rose-200">
        <h2 className="text-base font-display font-bold text-rose-700">Danger zone</h2>
        <div className="flex items-center justify-between mt-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Reset workspace data</div>
            <div className="text-xs text-slate-500">Restore conversations, visitors and settings to the initial seed state.</div>
          </div>
          <Button variant="danger" onClick={() => confirm({
            title: 'Reset workspace data',
            body: 'All workspace data will be replaced with the initial seed state. Your login stays. Continue?',
            action: () => store.resetDemo(),
          })}>Reset</Button>
        </div>
      </Card>

      {dialog}
    </div>
  );
}
