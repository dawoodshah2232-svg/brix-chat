// Brix Chat — Workspace settings.
import { useState } from 'react';
import { useStore } from '../lib/store';
import type { Settings as SettingsData, TeamMember } from '../lib/types';
import { copyText } from '../lib/utils';
import { Avatar, Button, Card, Input, Label, Select, Textarea, Toggle, useConfirm } from '../components/ui';

const COLOR_PRESETS = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#0b1020'];
const MEMBER_COLORS = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
const EMBED_CODE = `<script src="https://dawoodshah2232-svg.github.io/brix-chat/widget.js" data-key="demo"></script>`;

const BUBBLE_CLASS: Record<SettingsData['widget']['bubble'], string> = {
  round: 'rounded-full',
  pill: 'rounded-2xl',
  square: 'rounded-md',
};

function SectionTitle({ children }: { children: string }) {
  return <h2 className="text-base font-display font-bold text-slate-900">{children}</h2>;
}

export default function Settings() {
  const store = useStore();
  const { confirm, dialog } = useConfirm();
  const s = store.data.settings;
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
    <div className="space-y-5 max-w-5xl">
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
              <div className="text-xs text-slate-400 mb-2">Position: {w.position.replace('-', ' ')}</div>
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
                      <div className="flex-1 bg-white border border-slate-200 px-3 py-2 text-xs text-slate-400"
                        style={{ borderRadius: w.radius }}>Type a message…</div>
                      <div className="px-3 py-2 text-xs text-white font-bold grid place-items-center"
                        style={{ background: w.color, borderRadius: w.radius }}>➤</div>
                    </div>
                  </div>
                  {w.showBranding && <div className="text-center text-[10px] text-slate-400 py-1.5 bg-white border-t border-slate-100">Powered by Brix Chat</div>}
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
            <div key={h.day} className="flex items-center gap-3 py-2.5">
              <span className="w-24 text-sm font-semibold text-slate-800">{h.day}</span>
              <input type="time" value={h.from} onChange={(e) => updateHour(i, { from: e.target.value })}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm disabled:opacity-40" disabled={!h.enabled} />
              <span className="text-slate-400 text-sm">to</span>
              <input type="time" value={h.to} onChange={(e) => updateHour(i, { to: e.target.value })}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm disabled:opacity-40" disabled={!h.enabled} />
              <div className="ml-auto"><Toggle checked={h.enabled} onChange={(v) => updateHour(i, { enabled: v })} label={h.day} /></div>
            </div>
          ))}
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
          <span className="text-xs text-slate-500">Widget loads from GitHub Pages · key <code className="font-mono bg-slate-100 px-1 rounded">demo</code></span>
        </div>
      </Card>

      {/* Danger zone */}
      <Card className="p-6 border-rose-200">
        <h2 className="text-base font-display font-bold text-rose-700">Danger zone</h2>
        <div className="flex items-center justify-between mt-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Reset demo data</div>
            <div className="text-xs text-slate-500">Restore all conversations, visitors and settings to the seed demo state.</div>
          </div>
          <Button variant="danger" onClick={() => confirm({
            title: 'Reset demo data',
            body: 'All demo data will be replaced with the seed state. Your login stays. Continue?',
            action: () => store.resetDemo(),
          })}>Reset</Button>
        </div>
      </Card>

      {dialog}
    </div>
  );
}
