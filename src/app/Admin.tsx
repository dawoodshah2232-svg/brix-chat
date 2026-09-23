// Brix Chat — admin area (local-only).
// Properties, API keys, webhooks, team, audit log, install page.
// All data lives in this browser's localStorage via src/lib/api.ts.
// Role-gated: only admin / developer roles can open /admin.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import {
  API_SCOPES,
  WEBHOOK_EVENTS,
  getApi,
  ApiError,
} from '../lib/api';
import type {
  ApiKeyRecord,
  ApiProperty,
  ApiWebhook,
  ApiAgent,
  AuditEntry,
  ApiDelivery,
  SignedPayload,
  TeamRole,
  WidgetConfig,
} from '../lib/api';
import { Badge, Button, Card, EmptyState, Input, Label, Modal, Select, Toggle, useConfirm } from '../components/ui';
import { cx } from '../lib/utils';

type Tab = 'properties' | 'keys' | 'webhooks' | 'team' | 'audit' | 'install';

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'properties', label: 'Properties', icon: '🌐' },
  { id: 'keys', label: 'API keys', icon: '🔑' },
  { id: 'webhooks', label: 'Webhooks', icon: '🪝' },
  { id: 'team', label: 'Team', icon: '👥' },
  { id: 'audit', label: 'Audit log', icon: '📜' },
  { id: 'install', label: 'Install', icon: '🧩' },
];

const WIDGET_HOST = 'https://dawoodshah2232-svg.github.io/brix-chat';

function useApi() {
  const { session } = useStore();
  return useMemo(
    () => getApi(session?.workspace ?? 'demo', session?.displayName ?? 'system'),
    [session?.workspace, session?.displayName],
  );
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function CopyBtn({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
    >
      {done ? '✓ Copied' : label}
    </button>
  );
}

function Code({ text, maxH }: { text: string; maxH?: string }) {
  return (
    <pre
      className="text-xs font-mono bg-ink-950 text-slate-200 rounded-xl p-4 overflow-auto slim-scroll whitespace-pre-wrap break-all"
      style={maxH ? { maxHeight: maxH } : undefined}
    >
      {text}
    </pre>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 flex gap-3 items-start rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5">
      <span className="text-lg">💻</span>
      <p className="text-[13px] leading-relaxed text-amber-900">{children}</p>
    </div>
  );
}

function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Something went wrong.';
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

function snippetFor(p: ApiProperty): string {
  return `<script>
  window.Brix_API = window.Brix_API || {};
</script>
<script async src="${WIDGET_HOST}/widget.js" data-property="${p.public_key}"></script>`;
}

function PropertiesTab({ refresh }: { refresh: () => void }) {
  const api = useApi();
  const { confirm, dialog } = useConfirm();
  const [props, setProps] = useState<ApiProperty[]>([]);
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showSnippet, setShowSnippet] = useState<string | null>(null);

  const load = async () => {
    try {
      const { data } = await api.properties.list();
      setProps(data);
    } catch (e) {
      setError(errMsg(e));
    }
  };
  useEffect(() => { void load(); }, []);

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      await api.properties.create({ name, domain });
      setName('');
      setDomain('');
      await load();
      refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const regen = (p: ApiProperty) => {
    confirm({
      title: 'Regenerate public key?',
      body: `The old embed snippet for "${p.name}" will stop working. Continue?`,
      action: async () => {
        await api.properties.regenerateKey(p.id);
        await load();
        refresh();
      },
    });
  };

  const remove = (p: ApiProperty) => {
    confirm({
      title: 'Delete property?',
      body: `"${p.name}" and its widget config will be removed from this browser.`,
      action: async () => {
        await api.properties.remove(p.id);
        await load();
        refresh();
      },
    });
  };

  return (
    <div>
      {dialog}
      <h2 className="font-display font-bold text-xl mb-1">Properties</h2>
      <p className="text-sm text-slate-500 mb-6">Websites where the widget is installed. Each gets a public key for the embed snippet.</p>

      <Card className="p-5 mb-6">
        <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <Label>Site name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My store" />
          </div>
          <div>
            <Label>Domain</Label>
            <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" />
          </div>
          <Button onClick={create} disabled={busy || !name.trim()}>Add property</Button>
        </div>
        {error && <p className="text-sm text-rose-600 mt-3">{error}</p>}
      </Card>

      {props.length === 0 ? (
        <EmptyState icon="🌐" title="No properties yet" hint="Add your first website above." />
      ) : (
        <div className="space-y-4">
          {props.map((p) => (
            <Card key={p.id} className="p-5">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-900">{p.name}</div>
                  <div className="text-sm text-slate-500">{p.domain || 'No domain set'} · added {fmtDate(p.created_at)}</div>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <code className="text-xs font-mono bg-slate-100 rounded-lg px-2.5 py-1.5 text-slate-700">{p.public_key}</code>
                    <CopyBtn text={p.public_key} label="Copy key" />
                    {p.secure_mode && <Badge tone="indigo">secure mode</Badge>}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="ghost" onClick={() => setShowSnippet(p.id)}>Snippet</Button>
                  <Button variant="ghost" onClick={() => regen(p)}>Regenerate key</Button>
                  <Button variant="ghost" onClick={() => remove(p)} className="text-rose-600">Delete</Button>
                </div>
              </div>
              <Modal open={showSnippet === p.id} onClose={() => setShowSnippet(null)} title={`Embed snippet — ${p.name}`} wide>
                <p className="text-sm text-slate-500 mb-3">Paste this before the closing <code>&lt;/body&gt;</code> tag on every page.</p>
                <Code text={snippetFor(p)} />
                <div className="mt-4 flex justify-end">
                  <CopyBtn text={snippetFor(p)} label="Copy snippet" />
                </div>
              </Modal>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

function ApiKeysTab({ refresh }: { refresh: () => void }) {
  const api = useApi();
  const { confirm, dialog } = useConfirm();
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['conversations:read']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revealed, setRevealed] = useState<{ name: string; key: string } | null>(null);

  const load = async () => {
    const { data } = await api.apiKeys.list();
    setKeys(data);
  };
  useEffect(() => { void load(); }, []);

  const toggleScope = (s: string) => setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.apiKeys.create({ name, scopes });
      setRevealed({ name: data.record.name, key: data.key });
      setName('');
      setScopes(['conversations:read']);
      await load();
      refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const rotate = (k: ApiKeyRecord) => {
    confirm({
      title: 'Rotate key?',
      body: `The old key "${k.name}" stops working immediately.`,
      action: async () => {
        const { data } = await api.apiKeys.rotate(k.id);
        setRevealed({ name: data.record.name, key: data.key });
        await load();
        refresh();
      },
    });
  };

  const revoke = (k: ApiKeyRecord) => {
    confirm({
      title: 'Revoke key?',
      body: `"${k.name}" will stop working immediately.`,
      action: async () => {
        await api.apiKeys.revoke(k.id);
        await load();
        refresh();
      },
    });
  };

  const remove = (k: ApiKeyRecord) => {
    confirm({
      title: 'Delete key?',
      body: `Delete "${k.name}" permanently?`,
      action: async () => {
        await api.apiKeys.remove(k.id);
        await load();
        refresh();
      },
    });
  };

  return (
    <div>
      {dialog}
      <h2 className="font-display font-bold text-xl mb-1">API keys</h2>
      <p className="text-sm text-slate-500 mb-6">Server-to-server keys with granular scopes. The full key is shown once — lists show only the prefix.</p>
      <Notice>
        <span><strong>Local mode.</strong> Keys are generated and validated inside this browser only. They will authenticate real HTTP requests once the backend phase ships — the same key format and scopes carry over.</span>
      </Notice>

      <Card className="p-5 mb-6">
        <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end mb-4">
          <div>
            <Label>Key name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. bridgxapp.com backend" />
          </div>
          <Button onClick={create} disabled={busy || !name.trim() || scopes.length === 0}>Create key</Button>
        </div>
        <Label>Scopes</Label>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
          {API_SCOPES.map((s) => (
            <label key={s.name} className={cx('flex items-start gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer text-sm transition', scopes.includes(s.name) ? 'border-brix-500 bg-brix-50' : 'border-slate-200 hover:border-slate-300')}>
              <input type="checkbox" checked={scopes.includes(s.name)} onChange={() => toggleScope(s.name)} className="mt-1 accent-indigo-600" />
              <span>
                <span className="font-mono font-semibold text-[13px] text-slate-800">{s.name}</span>
                <span className="block text-xs text-slate-500">{s.description}</span>
              </span>
            </label>
          ))}
        </div>
        {error && <p className="text-sm text-rose-600 mt-3">{error}</p>}
      </Card>

      <Modal open={revealed !== null} onClose={() => setRevealed(null)} title="API key — copy it now" wide>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 mb-4">
          <p className="text-[13px] text-rose-900 font-medium">This is the only time the full key is shown. Store it somewhere safe.</p>
        </div>
        <Code text={revealed?.key ?? ''} />
        <div className="mt-4 flex justify-end gap-2">
          <CopyBtn text={revealed?.key ?? ''} label="Copy key" />
          <Button onClick={() => setRevealed(null)}>Done</Button>
        </div>
      </Modal>

      {keys.length === 0 ? (
        <EmptyState icon="🔑" title="No API keys yet" hint="Create your first key above." />
      ) : (
        <div className="space-y-3">
          {keys.map((k) => (
            <Card key={k.id} className={cx('p-4', k.revoked && 'opacity-60')}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900">{k.name}</span>
                    {k.revoked ? <Badge tone="rose">revoked</Badge> : <Badge tone="green">active</Badge>}
                  </div>
                  <code className="text-xs font-mono text-slate-500">{k.prefix}…</code>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {k.scopes.map((s) => (
                      <span key={s} className="text-[11px] font-mono bg-slate-100 text-slate-600 rounded-md px-2 py-0.5">{s}</span>
                    ))}
                  </div>
                  <div className="text-xs text-slate-400 mt-1.5">
                    {k.usage_count} calls · {k.last_used_at ? `last used ${fmtDate(k.last_used_at)}` : 'never used'} · created {fmtDate(k.created_at)}
                  </div>
                </div>
                <div className="flex gap-2">
                  {!k.revoked && <Button variant="ghost" onClick={() => rotate(k)}>Rotate</Button>}
                  {!k.revoked && <Button variant="ghost" onClick={() => revoke(k)} className="text-amber-700">Revoke</Button>}
                  <Button variant="ghost" onClick={() => remove(k)} className="text-rose-600">Delete</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

function WebhooksTab({ refresh }: { refresh: () => void }) {
  const api = useApi();
  const { confirm, dialog } = useConfirm();
  const [props, setProps] = useState<ApiProperty[]>([]);
  const [propId, setPropId] = useState('');
  const [hooks, setHooks] = useState<ApiWebhook[]>([]);
  const [deliveries, setDeliveries] = useState<Record<string, ApiDelivery[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<ApiWebhook | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ url: '', events: [] as string[], enabled: true });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [firing, setFiring] = useState<ApiWebhook | null>(null);
  const [fireEvent, setFireEvent] = useState('message.created');
  const [fireResult, setFireResult] = useState<SignedPayload | null>(null);
  const [fireBusy, setFireBusy] = useState(false);

  const load = async (pid: string) => {
    const { data } = await api.webhooks.list(pid || undefined);
    setHooks(data);
    const d: Record<string, ApiDelivery[]> = {};
    for (const w of data) {
      const r = await api.deliveries.list(w.id, { limit: 20 });
      d[w.id] = r.data.items;
    }
    setDeliveries(d);
  };

  useEffect(() => {
    (async () => {
      const { data } = await api.properties.list();
      setProps(data);
      const pid = data[0]?.id ?? '';
      setPropId(pid);
      if (pid) await load(pid);
    })();
  }, []);

  const changeProp = async (pid: string) => {
    setPropId(pid);
    if (pid) await load(pid);
    else setHooks([]);
  };

  const toggleEvent = (e: string) =>
    setForm((f) => ({ ...f, events: f.events.includes(e) ? f.events.filter((x) => x !== e) : [...f.events, e] }));

  const openCreate = () => {
    setForm({ url: '', events: ['message.created'], enabled: true });
    setCreating(true);
    setError('');
  };
  const openEdit = (w: ApiWebhook) => {
    setForm({ url: w.url, events: w.events, enabled: w.enabled });
    setEditing(w);
    setError('');
  };

  const saveForm = async () => {
    setBusy(true);
    setError('');
    try {
      if (editing) {
        await api.webhooks.update(editing.id, { url: form.url, events: form.events, enabled: form.enabled });
      } else {
        const { data } = await api.webhooks.create({ property_id: propId, url: form.url, events: form.events, enabled: form.enabled });
        setRevealedSecret(data.secret);
      }
      setEditing(null);
      setCreating(false);
      await load(propId);
      refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = async (w: ApiWebhook) => {
    await api.webhooks.update(w.id, { enabled: !w.enabled });
    await load(propId);
    refresh();
  };

  const toggleAutoDisable = async (w: ApiWebhook) => {
    await api.webhooks.update(w.id, { auto_disable: !w.auto_disable });
    await load(propId);
  };

  const rotateSecret = (w: ApiWebhook) => {
    confirm({
      title: 'Rotate webhook secret?',
      body: 'The old secret stops verifying immediately — update the receiver first.',
      action: async () => {
        const { data } = await api.webhooks.rotateSecret(w.id);
        setRevealedSecret(data.secret);
        await load(propId);
        refresh();
      },
    });
  };

  const remove = (w: ApiWebhook) => {
    confirm({
      title: 'Delete webhook?',
      body: `Remove ${w.url} and its delivery log?`,
      action: async () => {
        await api.webhooks.remove(w.id);
        await load(propId);
        refresh();
      },
    });
  };

  const testFire = async () => {
    if (!firing) return;
    setFireBusy(true);
    setFireResult(null);
    try {
      const { data } = await api.deliveries.testFire(firing.id, fireEvent);
      setFireResult(data.signed);
      await load(propId);
      refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setFireBusy(false);
    }
  };

  const statusTone = (s: string) => (s === 'delivered' ? 'green' : s === 'test' ? 'cyan' : s === 'pending' ? 'amber' : 'rose') as 'green' | 'cyan' | 'amber' | 'rose' | 'slate';

  return (
    <div>
      {dialog}
      <h2 className="font-display font-bold text-xl mb-1">Webhooks</h2>
      <p className="text-sm text-slate-500 mb-6">Push chat events to your own systems as they happen.</p>
      <Notice>
        <span><strong>Local mode.</strong> Configuration and the delivery log work fully here, but no real HTTP requests leave this browser yet — real delivery activates with the backend phase. Use <strong>Test fire</strong> to preview the exact signed payload your endpoint will receive.</span>
      </Notice>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="min-w-56">
          <Select value={propId} onChange={(e) => void changeProp(e.target.value)}>
            {props.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>
        <Button onClick={openCreate} disabled={!propId}>Add endpoint</Button>
      </div>

      {hooks.length === 0 ? (
        <EmptyState icon="🪝" title="No webhook endpoints" hint="Add one to start receiving events." />
      ) : (
        <div className="space-y-4">
          {hooks.map((w) => (
            <Card key={w.id} className="p-5">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold text-slate-900 break-all">{w.url}</span>
                    {w.enabled ? <Badge tone="green">enabled</Badge> : <Badge tone="slate">disabled</Badge>}
                    {w.consecutive_failures > 0 && <Badge tone="rose">{w.consecutive_failures} failures</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {w.events.map((e) => (
                      <span key={e} className="text-[11px] font-mono bg-indigo-50 text-indigo-700 rounded-md px-2 py-0.5">{e}</span>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-4 mt-3 text-[13px] text-slate-600">
                    <Toggle checked={w.enabled} onChange={() => void toggleEnabled(w)} label="Enabled" />
                    <Toggle checked={w.auto_disable} onChange={() => void toggleAutoDisable(w)} label="Auto-disable on repeated failures" />
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="ghost" onClick={() => { setFiring(w); setFireEvent(w.events[0] ?? 'message.created'); setFireResult(null); }}>Test fire</Button>
                  <Button variant="ghost" onClick={() => openEdit(w)}>Edit</Button>
                  <Button variant="ghost" onClick={() => rotateSecret(w)}>Rotate secret</Button>
                  <Button variant="ghost" onClick={() => remove(w)} className="text-rose-600">Delete</Button>
                </div>
              </div>

              {/* delivery log */}
              <div className="mt-4 border-t border-slate-100 pt-4">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Delivery log</div>
                {(deliveries[w.id] ?? []).length === 0 ? (
                  <p className="text-[13px] text-slate-400">No deliveries yet — fire a test to see the signed payload.</p>
                ) : (
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="bg-slate-50 text-left text-xs text-slate-500">
                          <th className="px-3 py-2 font-semibold">Time</th>
                          <th className="px-3 py-2 font-semibold">Event</th>
                          <th className="px-3 py-2 font-semibold">Status</th>
                          <th className="px-3 py-2 font-semibold">Attempts</th>
                          <th className="px-3 py-2 font-semibold">Event ID</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {(deliveries[w.id] ?? []).map((d) => (
                          <>
                            <tr key={d.id} className="border-t border-slate-100">
                              <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{fmtDate(d.created_at)}</td>
                              <td className="px-3 py-2 font-mono text-xs">{d.event}</td>
                              <td className="px-3 py-2"><Badge tone={statusTone(d.status)}>{d.status}</Badge></td>
                              <td className="px-3 py-2">{d.attempts}</td>
                              <td className="px-3 py-2 font-mono text-xs text-slate-400">{d.event_id.slice(0, 13)}…</td>
                              <td className="px-3 py-2 text-right">
                                <button onClick={() => setExpanded(expanded === d.id ? null : d.id)} className="text-xs font-semibold text-brix-600 hover:underline">
                                  {expanded === d.id ? 'Hide payload' : 'View payload'}
                                </button>
                              </td>
                            </tr>
                            {expanded === d.id && (
                              <tr key={`${d.id}-x`} className="border-t border-slate-100 bg-slate-50/60">
                                <td colSpan={6} className="px-3 py-3">
                                  {d.note && <p className="text-xs text-amber-700 mb-2">⚠️ {d.note}</p>}
                                  <Code text={JSON.stringify(d.payload, null, 2)} maxH="260px" />
                                </td>
                              </tr>
                            )}
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* create / edit modal */}
      <Modal open={creating || editing !== null} onClose={() => { setCreating(false); setEditing(null); }} title={editing ? 'Edit webhook' : 'Add webhook endpoint'} wide>
        <div className="space-y-4">
          <div>
            <Label>Endpoint URL</Label>
            <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://your-app.com/hooks/brix" />
          </div>
          <div>
            <Label>Subscribed events</Label>
            <div className="grid sm:grid-cols-2 gap-2 mt-2 max-h-64 overflow-y-auto slim-scroll pr-1">
              {WEBHOOK_EVENTS.map((e) => (
                <label key={e.name} className={cx('flex items-start gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer text-sm transition', form.events.includes(e.name) ? 'border-brix-500 bg-brix-50' : 'border-slate-200 hover:border-slate-300')}>
                  <input type="checkbox" checked={form.events.includes(e.name)} onChange={() => toggleEvent(e.name)} className="mt-1 accent-indigo-600" />
                  <span>
                    <span className="font-mono font-semibold text-[13px] text-slate-800">{e.name}</span>
                    <span className="block text-xs text-slate-500">{e.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <Toggle checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} label="Enabled" />
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setCreating(false); setEditing(null); }}>Cancel</Button>
            <Button onClick={saveForm} disabled={busy}>{editing ? 'Save changes' : 'Create endpoint'}</Button>
          </div>
        </div>
      </Modal>

      {/* revealed secret modal */}
      <Modal open={revealedSecret !== null} onClose={() => setRevealedSecret(null)} title="Webhook secret — copy it now">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 mb-4">
          <p className="text-[13px] text-rose-900 font-medium">Shown once. Use it to verify the X-Brix-Signature header.</p>
        </div>
        <Code text={revealedSecret ?? ''} />
        <div className="mt-4 flex justify-end gap-2">
          <CopyBtn text={revealedSecret ?? ''} label="Copy secret" />
          <Button onClick={() => setRevealedSecret(null)}>Done</Button>
        </div>
      </Modal>

      {/* test fire modal */}
      <Modal open={firing !== null} onClose={() => { setFiring(null); setFireResult(null); }} title="Test fire webhook" wide>
        <p className="text-sm text-slate-500 mb-4">
          Builds the <strong>exact signed payload</strong> that would be POSTed to <span className="font-mono text-xs">{firing?.url}</span>. No request leaves this browser yet.
        </p>
        <div className="flex gap-2 mb-4">
          <div className="flex-1">
            <Select value={fireEvent} onChange={(e) => setFireEvent(e.target.value)}>
              {(firing?.events ?? []).map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </Select>
          </div>
          <Button onClick={testFire} disabled={fireBusy}>{fireBusy ? 'Signing…' : 'Fire test'}</Button>
        </div>
        {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}
        {fireResult && (
          <div className="space-y-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1.5">Request headers</div>
              <Code text={Object.entries(fireResult.headers).map(([k, v]) => `${k}: ${v}`).join('\n')} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Request body</div>
                <CopyBtn text={fireResult.body} label="Copy body" />
              </div>
              <Code text={JSON.stringify(JSON.parse(fireResult.body), null, 2)} maxH="300px" />
            </div>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              ⚠️ Preview only — logged as a “test” delivery. Real HTTP delivery activates with the backend phase.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

const ROLE_LABELS: Record<TeamRole, string> = { admin: 'Admin', agent: 'Agent', developer: 'Developer', viewer: 'Viewer' };
const ROLE_HINTS: Record<TeamRole, string> = {
  admin: 'Full access: chats, settings, keys, webhooks, team.',
  agent: 'Answers chats. No admin screens.',
  developer: 'Manages keys and webhooks. No chat content.',
  viewer: 'Read-only access.',
};

function TeamTab({ refresh }: { refresh: () => void }) {
  const api = useApi();
  const { session } = useStore();
  const { confirm, dialog } = useConfirm();
  const [agents, setAgents] = useState<ApiAgent[]>([]);
  const [name, setName] = useState('');
  const [role, setRole] = useState<TeamRole>('agent');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revealed, setRevealed] = useState<{ name: string; passcode: string } | null>(null);

  const load = async () => {
    const { data } = await api.agents.list();
    setAgents(data);
  };
  useEffect(() => { void load(); }, []);

  const invite = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.agents.invite({ display_name: name, role });
      setRevealed({ name: data.agent.display_name, passcode: data.passcode });
      setName('');
      await load();
      refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const setRoleOf = async (a: ApiAgent, r: TeamRole) => {
    await api.agents.update(a.id, { role: r });
    await load();
    refresh();
  };

  const remove = (a: ApiAgent) => {
    confirm({
      title: 'Remove team member?',
      body: `Remove "${a.display_name}" from the team?`,
      action: async () => {
        await api.agents.remove(a.id);
        await load();
        refresh();
      },
    });
  };

  const roleTone = (r: TeamRole) => (r === 'admin' ? 'rose' : r === 'developer' ? 'indigo' : r === 'viewer' ? 'slate' : 'green') as 'rose' | 'indigo' | 'slate' | 'green';

  return (
    <div>
      {dialog}
      <h2 className="font-display font-bold text-xl mb-1">Team</h2>
      <p className="text-sm text-slate-500 mb-6">Who can access this workspace, and what they can do.</p>
      <Notice>
        <span><strong>Local mode.</strong> Members are stored in this browser. Email invites activate with the backend phase — for now, share the one-time passcode directly.</span>
      </Notice>

      <Card className="p-5 mb-6">
        <div className="grid sm:grid-cols-[1fr_180px_auto] gap-3 items-end">
          <div>
            <Label>Display name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sara Ahmed" />
          </div>
          <div>
            <Label>Role</Label>
            <Select value={role} onChange={(e) => setRole(e.target.value as TeamRole)}>
              {(Object.keys(ROLE_LABELS) as TeamRole[]).map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </Select>
          </div>
          <Button onClick={invite} disabled={busy || !name.trim()}>Invite member</Button>
        </div>
        <p className="text-xs text-slate-500 mt-2">{ROLE_HINTS[role]}</p>
        {error && <p className="text-sm text-rose-600 mt-3">{error}</p>}
      </Card>

      <Modal open={revealed !== null} onClose={() => setRevealed(null)} title="Member passcode — share it once">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 mb-4">
          <p className="text-[13px] text-rose-900 font-medium">
            <strong>{revealed?.name}</strong> logs in with workspace <strong>{session?.workspace}</strong> + this passcode. Shown once.
          </p>
        </div>
        <Code text={revealed?.passcode ?? ''} />
        <div className="mt-4 flex justify-end gap-2">
          <CopyBtn text={revealed?.passcode ?? ''} label="Copy passcode" />
          <Button onClick={() => setRevealed(null)}>Done</Button>
        </div>
      </Modal>

      <div className="space-y-3">
        {agents.map((a) => (
          <Card key={a.id} className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className={cx('w-2.5 h-2.5 rounded-full', a.online ? 'bg-emerald-500' : 'bg-slate-300')} title={a.online ? 'Online' : 'Offline'} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-900">{a.display_name}</span>
                  <Badge tone={roleTone(a.role)}>{ROLE_LABELS[a.role]}</Badge>
                  {a.display_name === session?.displayName && <Badge tone="cyan">you</Badge>}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {a.last_login_at ? `Last login ${fmtDate(a.last_login_at)}` : 'Never logged in'} · passcode ••••••
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select value={a.role} onChange={(e) => void setRoleOf(a, e.target.value as TeamRole)} aria-label="Change role">
                  {(Object.keys(ROLE_LABELS) as TeamRole[]).map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </Select>
                {a.display_name !== session?.displayName && (
                  <Button variant="ghost" onClick={() => remove(a)} className="text-rose-600">Remove</Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

function AuditTab() {
  const api = useApi();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await api.auditLog.list({ limit: 100 });
      setEntries(data.items);
    })();
  }, []);

  return (
    <div>
      <h2 className="font-display font-bold text-xl mb-1">Audit log</h2>
      <p className="text-sm text-slate-500 mb-6">Every admin action in this workspace — who did what, and when.</p>
      {entries.length === 0 ? (
        <EmptyState icon="📜" title="No audit entries yet" hint="Admin actions will appear here." />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-2.5 font-semibold">Time</th>
                <th className="px-4 py-2.5 font-semibold">Actor</th>
                <th className="px-4 py-2.5 font-semibold">Action</th>
                <th className="px-4 py-2.5 font-semibold">Entity</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <>
                  <tr key={e.id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{fmtDate(e.created_at)}</td>
                    <td className="px-4 py-2.5 font-semibold">{e.actor}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{e.action}</td>
                    <td className="px-4 py-2.5 text-slate-500">{e.entity}{e.entity_id ? ` · ${e.entity_id.slice(0, 12)}…` : ''}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => setExpanded(expanded === e.id ? null : e.id)} className="text-xs font-semibold text-brix-600 hover:underline">
                        {expanded === e.id ? 'Hide' : 'Details'}
                      </button>
                    </td>
                  </tr>
                  {expanded === e.id && (
                    <tr key={`${e.id}-x`} className="border-t border-slate-100 bg-slate-50/60">
                      <td colSpan={5} className="px-4 py-3">
                        <Code text={JSON.stringify(e.meta, null, 2)} maxH="200px" />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

const JS_API_REF: Array<{ title: string; code: string }> = [
  {
    title: 'Boot with a visitor identity',
    code: `BrixChat('boot', {
  property: 'bx_demo_7f3a9c1e',
  visitor: { name: 'Ayesha', email: 'ayesha@example.com' }
  // secure mode: visitor: { ..., hash: '<HMAC-SHA256(email, property_secret)>' }
});`,
  },
  {
    title: 'Show / hide / toggle the widget',
    code: `BrixChat.show();\nBrixChat.hide();\nBrixChat.toggle();`,
  },
  {
    title: 'Open / close the chat panel',
    code: `BrixChat.open();   // maximize the panel\nBrixChat.close();  // minimize to the bubble`,
  },
  {
    title: 'Visitor attributes, tags, events',
    code: `BrixChat.setAttributes({ plan: 'pro', cart_value: 149 });
BrixChat.addTags(['vip', 'checkout']);
BrixChat.removeTags(['vip']);
BrixChat.trackEvent('requested-quote', { value: 499 });`,
  },
  {
    title: 'Unread count + lifecycle events',
    code: `BrixChat.getUnreadCount(); // number

BrixChat.onReady(() => console.log('widget ready'));
BrixChat.onOpen(() => {});
BrixChat.onClose(() => {});
BrixChat.onChatStarted((c) => {});
BrixChat.onChatEnded((c) => {});
BrixChat.onMessageReceived((m) => {});
BrixChat.onUnreadCountChanged((n) => {});`,
  },
  {
    title: 'Reset on logout',
    code: `BrixChat.reset(); // clears the visitor session`,
  },
];

const DATA_ATTRS: Array<{ attr: string; desc: string }> = [
  { attr: 'data-property', desc: 'Public property key (required) — e.g. bx_demo_7f3a9c1e' },
  { attr: 'data-color', desc: 'Accent color override — e.g. #4f46e5' },
  { attr: 'data-position', desc: 'bottom-right (default) or bottom-left' },
  { attr: 'data-greeting', desc: 'Override the welcome message' },
  { attr: 'data-locale', desc: 'Widget language code — e.g. en, ar' },
];

function InstallTab() {
  const api = useApi();
  const [props, setProps] = useState<ApiProperty[]>([]);
  const [propId, setPropId] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await api.properties.list();
      setProps(data);
      if (data[0]) setPropId(data[0].id);
    })();
  }, []);

  const prop = props.find((p) => p.id === propId);
  const [widgetDefaults, setWidgetDefaults] = useState<WidgetConfig | null>(null);
  useEffect(() => {
    if (!propId) return;
    (async () => {
      const { data } = await api.widget.getConfig(propId);
      setWidgetDefaults(data);
    })();
  }, [propId]);

  return (
    <div>
      <h2 className="font-display font-bold text-xl mb-1">Install</h2>
      <p className="text-sm text-slate-500 mb-6">Put the widget on any website — yours, a client's, or a partner's like bridgxapp.com.</p>

      <Card className="p-5 mb-6">
        <Label>Website</Label>
        <div className="max-w-md mt-1.5">
          <Select value={propId} onChange={(e) => setPropId(e.target.value)}>
            {props.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — {p.public_key}</option>
            ))}
          </Select>
        </div>
        {prop && (
          <>
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mt-5 mb-1.5">1 · Paste this snippet</div>
            <Code text={snippetFor(prop)} />
            <div className="mt-3 flex justify-end">
              <CopyBtn text={snippetFor(prop)} label="Copy snippet" />
            </div>
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mt-5 mb-1.5">2 · Optional data-* overrides</div>
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-[13px]">
                <tbody>
                  {DATA_ATTRS.map((a) => (
                    <tr key={a.attr} className="border-t border-slate-100 first:border-t-0">
                      <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-800 whitespace-nowrap">{a.attr}</td>
                      <td className="px-4 py-2.5 text-slate-500">{a.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {widgetDefaults && (
              <p className="text-xs text-slate-400 mt-3">
                Dashboard defaults for this property: color <span className="font-mono">{widgetDefaults.color}</span> · position {widgetDefaults.position} · greeting “{widgetDefaults.greeting}”
              </p>
            )}
          </>
        )}
      </Card>

      <h3 className="font-display font-bold text-lg mb-3">JavaScript API quick reference</h3>
      <div className="grid lg:grid-cols-2 gap-4">
        {JS_API_REF.map((r) => (
          <Card key={r.title} className="p-5">
            <div className="font-semibold text-sm text-slate-900 mb-2.5">{r.title}</div>
            <Code text={r.code} />
          </Card>
        ))}
      </div>

      <Card className="p-5 mt-4">
        <div className="font-semibold text-sm text-slate-900 mb-2">Secure mode (identity verification)</div>
        <p className="text-[13px] text-slate-500 leading-relaxed">
          Enable <em>secure mode</em> per property, then sign the visitor's email on your server with
          <span className="font-mono text-xs"> HMAC-SHA256(email, property_secret) </span>
          and pass it as <span className="font-mono text-xs">visitor.hash</span> in <span className="font-mono text-xs">BrixChat('boot', …)</span>.
          The widget forwards the hash and marks the identity trusted once your server confirms it — so visitor names and emails can't be forged from the browser console.
          Server-side verification activates with the backend phase; the field is accepted and stored today.
        </p>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin shell
// ---------------------------------------------------------------------------

export default function Admin() {
  const { session, logout } = useStore();
  const [tab, setTab] = useState<Tab>('properties');
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  return (
    <div className="min-h-screen bg-slate-50 flex" key={tick}>
      <aside className="hidden md:flex w-64 shrink-0 bg-ink-950 flex-col">
        <div className="py-5 px-5">
          <Link to="/app" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brix-500 to-cyan-400 grid place-items-center text-white text-lg font-black">B</div>
            <div className="font-display font-extrabold text-white text-lg tracking-tight">Brix<span className="text-cyan-300">Chat</span></div>
          </Link>
          <div className="mt-2 text-[11px] font-bold uppercase tracking-widest text-amber-300/90">Admin console</div>
        </div>
        <nav className="flex-1 px-3 py-2 space-y-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cx(
                'w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition',
                tab === t.id ? 'bg-brix-600 text-white shadow-lg shadow-brix-600/30' : 'text-slate-300 hover:bg-white/5 hover:text-white',
              )}
            >
              <span className="text-base w-6 text-center">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10 space-y-2">
          <Link to="/app" className="block px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-300 bg-white/5 hover:bg-white/10">
            ← Back to dashboard
          </Link>
          <button onClick={logout} className="w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-300 bg-white/5 hover:bg-white/10 text-left">
            ⎋ Log out ({session?.displayName})
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="md:hidden sticky top-0 z-30 bg-ink-950 text-white px-4 py-3 flex items-center gap-2 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cx('shrink-0 px-3 py-1.5 rounded-lg text-[13px] font-semibold', tab === t.id ? 'bg-brix-600' : 'bg-white/10')}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </header>
        <main className="max-w-5xl mx-auto px-4 sm:px-8 py-8">
          {tab === 'properties' && <PropertiesTab refresh={refresh} />}
          {tab === 'keys' && <ApiKeysTab refresh={refresh} />}
          {tab === 'webhooks' && <WebhooksTab refresh={refresh} />}
          {tab === 'team' && <TeamTab refresh={refresh} />}
          {tab === 'audit' && <AuditTab />}
          {tab === 'install' && <InstallTab />}
        </main>
      </div>
    </div>
  );
}
