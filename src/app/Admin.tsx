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
import { Badge, Button, Card, EmptyState, Input, Label, Modal, Select, StatCard, Textarea, Toggle, useConfirm } from '../components/ui';
import { cx } from '../lib/utils';
import {
  asP2,
  fmtTs,
} from '../lib/contentSeed';
import type {
  ApiBlogPost2,
  ApiHelpArticle2,
  ApiContactMessage2,
  ApiStatusEntry2,
  ApiMember2,
  ApiRating2,
  RatingsSummary2,
  ApiDepartment2,
  DepartmentInput2,
  RoutingMode,
  OfflineBehavior,
  DayHours,
  ApiCategory2,
  CategoryKind,
  CategoryInput2,
  PropertySettings2,
  BlogSeed,
  HelpSeed,
} from '../lib/contentSeed';

type Tab = 'overview' | 'content' | 'properties' | 'branding' | 'ratings' | 'departments' | 'keys' | 'webhooks' | 'team' | 'audit' | 'install';

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'content', label: 'Content', icon: '📝' },
  { id: 'properties', label: 'Properties', icon: '🌐' },
  { id: 'branding', label: 'Branding', icon: '🎨' },
  { id: 'ratings', label: 'Ratings', icon: '⭐' },
  { id: 'departments', label: 'Departments', icon: '🏢' },
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
// Phase-2 admin additions (Worker B): overview, content, branding, ratings,
// departments + routing, categories, member profiles.
// Data flows through the phase-2 api surface in src/lib/api.ts, reached via
// the asP2() adapter in src/lib/contentSeed.ts (tolerant of bare-array or
// paginated list shapes).
// ---------------------------------------------------------------------------

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-5">
      <h2 className="font-display font-bold text-xl">{title}</h2>
      {sub && <p className="text-sm text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

/** Accept both bare-array and paginated { items } list shapes. */
function itemsOf<T>(data: { items: T[] } | T[] | null | undefined): T[] {
  if (!data) return [];
  return Array.isArray(data) ? data : (data.items ?? []);
}

/** True when the phase-2 endpoint isn't implemented by the runtime yet. */
function missingP2(e: unknown): boolean {
  return e instanceof ApiError && (e.code === 'not_implemented' || e.status === 501);
}

function useP2() {
  const api = useApi();
  return useMemo(() => asP2(api), [api]);
}

// ---- Category source (api.categories.*) ------------------------------------

interface CatSource {
  live: boolean;
  list(scope: CategoryKind): Promise<ApiCategory2[]>;
  create(scope: CategoryKind, name: string, color: string): Promise<ApiCategory2>;
  update(id: string, patch: Partial<CategoryInput2>): Promise<ApiCategory2>;
  remove(id: string): Promise<void>;
}

function useCatSource(propId: string): CatSource {
  const p2 = useP2();
  return useMemo<CatSource>(() => {
    if (typeof (p2 as unknown as { categories?: unknown }).categories === 'undefined') {
      const dead = async (): Promise<never> => { throw new ApiError('not_implemented', 'Categories API is not available yet.', 501); };
      return { live: false, list: dead, create: dead, update: dead, remove: dead };
    }
    return {
      live: true,
      list: async (scope) => itemsOf((await p2.categories.list(scope, propId || undefined)).data),
      create: async (scope, name, color) => (await p2.categories.create(scope, propId, name, color)).data,
      update: async (id, patch) => (await p2.categories.update(id, patch)).data,
      remove: async (id) => { await p2.categories.delete(id); },
    };
  }, [p2, propId]);
}

// ---- Department source (api.departments.*) ----------------------------------

interface DeptSource {
  live: boolean;
  list(): Promise<ApiDepartment2[]>;
  create(input: DepartmentInput2): Promise<ApiDepartment2>;
  update(id: string, patch: Partial<DepartmentInput2>): Promise<ApiDepartment2>;
  remove(id: string): Promise<void>;
}

function useDeptSource(propId: string): DeptSource {
  const p2 = useP2();
  return useMemo<DeptSource>(() => {
    if (typeof (p2 as unknown as { departments?: unknown }).departments === 'undefined') {
      const dead = async (): Promise<never> => { throw new ApiError('not_implemented', 'Departments API is not available yet.', 501); };
      return { live: false, list: dead, create: dead, update: dead, remove: dead };
    }
    return {
      live: true,
      list: async () => (await p2.departments.list(propId)).data,
      create: async (input) => (await p2.departments.create(propId, input)).data,
      update: async (id, patch) => (await p2.departments.update(id, patch)).data,
      remove: async (id) => { await p2.departments.delete(id); },
    };
  }, [p2, propId]);
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

function TeamTab({ refresh, readOnly }: { refresh: () => void; readOnly: boolean }) {
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
      <MemberProfiles readOnly={readOnly} />
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
// Overview — metric cards + setup checklist (spec T1.11)
// ---------------------------------------------------------------------------

function OverviewTab({ go }: { go: (t: Tab) => void }) {
  const api = useApi();
  const p2 = useP2();
  const [stats, setStats] = useState({ props: 0, members: 0, openTickets: 0, posts: 0, articles: 0, unreadContact: 0 });
  const [csat, setCsat] = useState<number | null>(null);
  const [nps, setNps] = useState<number | null>(null);
  const [branded, setBranded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [{ data: props }, { data: members }, tickets, { data: posts }, { data: articles }, { data: cm }] = await Promise.all([
          api.properties.list(),
          p2.members.list(),
          api.tickets.list({ status: 'open' }).catch(() => ({ data: { items: [] as unknown[] } })),
          p2.blog.list(false).catch(() => ({ data: [] as unknown[] })),
          p2.helpDocs.list().catch(() => ({ data: [] as unknown[] })),
          p2.contactMessages.list().catch(() => ({ data: [] as ApiContactMessage2[] })),
        ]);
        const propList = itemsOf(props);
        setStats({
          props: propList.length,
          members: itemsOf(members).length,
          openTickets: itemsOf(tickets.data).length,
          posts: itemsOf(posts).length,
          articles: itemsOf(articles).length,
          unreadContact: itemsOf(cm).filter((m: ApiContactMessage2) => !m.read).length,
        });
        const first = propList[0];
        if (first) {
          try {
            const { data: s } = await p2.ratings.summary(first.id, 30);
            setCsat(s.csat_avg);
            setNps(s.nps_score);
          } catch { /* ratings optional */ }
          try {
            const { data: ps } = await p2.propertySettings.get(first.id);
            setBranded(!!(ps.logo_data_url || (ps.brand_name && ps.brand_name !== 'Brix Chat')));
          } catch { /* branding optional */ }
        }
      } catch { /* overview is best-effort */ }
    })();
  }, [api, p2]);

  const checklist: Array<{ done: boolean; label: string; hint: string; tab: Tab }> = [
    { done: stats.props > 0, label: 'Property created', hint: 'A website connected to Brix Chat.', tab: 'properties' },
    { done: branded, label: 'Branding set', hint: 'Logo and brand name replace Brix Chat defaults.', tab: 'branding' },
    { done: stats.members > 1, label: 'Team invited', hint: 'More than one member in the workspace.', tab: 'team' },
    { done: stats.articles > 0, label: 'Help center stocked', hint: 'At least one help article published.', tab: 'content' },
    { done: csat !== null, label: 'First rating received', hint: 'A visitor completed the chat survey.', tab: 'ratings' },
  ];
  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <div>
      <SectionTitle title="Overview" sub="Workspace health at a glance." />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Properties" value={String(stats.props)} icon="🌐" tone="indigo" />
        <StatCard label="Team members" value={String(stats.members)} icon="👥" tone="cyan" />
        <StatCard label="Open tickets" value={String(stats.openTickets)} icon="🎫" tone="amber" />
        <StatCard label="CSAT (30d)" value={csat !== null ? `${csat.toFixed(1)} / 5` : '—'} icon="⭐" tone="green" />
        <StatCard label="NPS (30d)" value={nps !== null ? String(Math.round(nps)) : '—'} icon="📊" tone="indigo" />
        <StatCard label="Blog posts" value={String(stats.posts)} icon="✍️" tone="cyan" />
        <StatCard label="Help articles" value={String(stats.articles)} icon="📖" tone="green" />
        <StatCard label="Unread contact mail" value={String(stats.unreadContact)} icon="✉️" tone="rose" />
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-900">Setup checklist</h3>
          <span className="text-xs font-bold text-slate-500">{doneCount} of {checklist.length} done</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden mb-5">
          <div className="h-full rounded-full bg-gradient-to-r from-brix-500 to-cyan-400 transition-all" style={{ width: `${(doneCount / checklist.length) * 100}%` }} />
        </div>
        <div className="space-y-2.5">
          {checklist.map((c) => (
            <button key={c.label} onClick={() => go(c.tab)} className="w-full flex items-center gap-3 rounded-xl border border-slate-100 px-4 py-3 hover:border-brix-200 hover:bg-brix-50/50 text-left transition">
              <span className={cx('w-6 h-6 rounded-full grid place-items-center text-sm font-bold shrink-0', c.done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400')}>
                {c.done ? '✓' : '·'}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-bold text-slate-800">{c.label}</span>
                <span className="block text-xs text-slate-400">{c.hint}</span>
              </span>
              {!c.done && <span className="text-xs font-bold text-brix-600">Set up →</span>}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content — blog posts, help articles (+ KB categories), contact inbox, status
// ---------------------------------------------------------------------------

const emptyPost: BlogSeed = { slug: '', title: '', excerpt: '', body: '', tags: [], author: 'Brix Team', published: false, reading_mins: 3 };
const emptyHelp: HelpSeed = { slug: '', title: '', body: '', category: 'General', order: 0 };

function BlogManager({ readOnly }: { readOnly: boolean }) {
  const p2 = useP2();
  const { confirm, dialog } = useConfirm();
  const [posts, setPosts] = useState<ApiBlogPost2[]>([]);
  const [editing, setEditing] = useState<(BlogSeed & { id?: string }) | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const { data } = await p2.blog.list(false);
      setPosts(itemsOf(data));
    } catch (e) { setError(errMsg(e)); }
  };
  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!editing || !editing.title.trim() || !editing.slug.trim()) return;
    try {
      if (editing.id) await p2.blog.update(editing.id, editing);
      else await p2.blog.create(editing);
      setEditing(null);
      await load();
    } catch (e) { setError(errMsg(e)); }
  };

  const remove = (p: ApiBlogPost2) => {
    confirm({
      title: 'Delete post?', body: `"${p.title}" will be removed from /blog.`,
      action: async () => { await p2.blog.delete(p.id); await load(); },
    });
  };

  return (
    <div className="mb-10">
      {dialog}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-900">Blog posts <span className="text-xs font-semibold text-slate-400">/blog</span></h3>
        {!readOnly && <Button size="sm" onClick={() => setEditing({ ...emptyPost })}>+ New post</Button>}
      </div>
      {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}
      {posts.length === 0 ? (
        <EmptyState icon="✍️" title="No posts yet" hint="Write the first post for /blog." />
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900">{p.title}</span>
                    <Badge tone={p.published ? 'green' : 'amber'}>{p.published ? 'Published' : 'Draft'}</Badge>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">/blog/{p.slug} · {p.reading_mins} min read</div>
                </div>
                {!readOnly && (
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditing({ ...p, tags: [...p.tags] })}>Edit</Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(p)} className="text-rose-600">Delete</Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? 'Edit post' : 'New post'} wide>
        {editing && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>Title</Label><Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></div>
              <div><Label>Slug</Label><Input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-') })} className="font-mono" /></div>
            </div>
            <div><Label>Excerpt</Label><Textarea value={editing.excerpt} onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })} rows={2} /></div>
            <div><Label>Body (plain text / markdown)</Label><Textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={8} className="font-mono text-[13px]" /></div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div><Label>Author</Label><Input value={editing.author} onChange={(e) => setEditing({ ...editing, author: e.target.value })} /></div>
              <div><Label>Tags (comma separated)</Label><Input value={editing.tags.join(', ')} onChange={(e) => setEditing({ ...editing, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} /></div>
              <div><Label>Reading time (min)</Label><Input type="number" min={1} value={editing.reading_mins} onChange={(e) => setEditing({ ...editing, reading_mins: Number(e.target.value) || 3 })} /></div>
            </div>
            <div className="flex items-center justify-between">
              <Toggle checked={editing.published} onChange={(v) => setEditing({ ...editing, published: v })} label="Published" />
              <Button onClick={save} disabled={!editing.title.trim() || !editing.slug.trim()}>Save post</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function HelpManager({ readOnly }: { readOnly: boolean }) {
  const p2 = useP2();
  const api = useApi();
  const [propId, setPropId] = useState('');
  const catSrc = useCatSource(propId);
  const { confirm, dialog } = useConfirm();
  const [articles, setArticles] = useState<ApiHelpArticle2[]>([]);
  const [kbCats, setKbCats] = useState<ApiCategory2[]>([]);
  const [editing, setEditing] = useState<(HelpSeed & { id?: string }) | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const { data: pr } = await api.properties.list();
      setPropId(pr[0]?.id ?? '');
      const { data } = await p2.helpDocs.list();
      setArticles(itemsOf(data).sort((a, b) => a.order - b.order));
    } catch (e) { setError(errMsg(e)); }
  };
  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!propId || !catSrc.live) return;
    catSrc.list('kb').then(setKbCats).catch(() => setKbCats([]));
  }, [propId, catSrc]);

  const save = async () => {
    if (!editing || !editing.title.trim() || !editing.slug.trim()) return;
    try {
      if (editing.id) await p2.helpDocs.update(editing.id, editing);
      else await p2.helpDocs.create(editing);
      setEditing(null);
      await load();
    } catch (e) { setError(errMsg(e)); }
  };

  const remove = (a: ApiHelpArticle2) => {
    confirm({
      title: 'Delete article?', body: `"${a.title}" will be removed from /help.`,
      action: async () => { await p2.helpDocs.delete(a.id); await load(); },
    });
  };

  const catNames = [...new Set(articles.map((a) => a.category))];

  return (
    <div className="mb-10">
      {dialog}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-900">Help articles <span className="text-xs font-semibold text-slate-400">/help</span></h3>
        {!readOnly && <Button size="sm" onClick={() => setEditing({ ...emptyHelp })}>+ New article</Button>}
      </div>
      <p className="text-sm text-slate-500 mb-4">{articles.length} articles · {catNames.length} categories</p>
      {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}
      {articles.length === 0 ? (
        <EmptyState icon="📖" title="No articles yet" hint="Seed articles appear automatically on the help page, or create one here." />
      ) : (
        <div className="space-y-3">
          {articles.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900">{a.title}</span>
                    <Badge tone="indigo">{a.category}</Badge>
                    {a.category_id && kbCats.find((c) => c.id === a.category_id) && (
                      <Badge tone="cyan">{kbCats.find((c) => c.id === a.category_id)!.name}</Badge>
                    )}
                    <span className="text-xs text-slate-400">order {a.order}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">/help/{a.slug}</div>
                </div>
                {!readOnly && (
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditing({ ...a })}>Edit</Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(a)} className="text-rose-600">Delete</Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? 'Edit article' : 'New article'} wide>
        {editing && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>Title</Label><Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></div>
              <div><Label>Slug</Label><Input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-') })} className="font-mono" /></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Category label</Label>
                <Input value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} list="help-cat-names" />
                <datalist id="help-cat-names">{catNames.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div>
                <Label>KB category</Label>
                <Select
                  value={editing.category_id ?? ''}
                  onChange={(e) => {
                    const id = e.target.value;
                    const found = kbCats.find((c) => c.id === id);
                    setEditing({ ...editing, category_id: id || undefined, category: found ? found.name : editing.category });
                  }}
                >
                  <option value="">— none —</option>
                  {kbCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
                <p className="text-xs text-slate-400 mt-1">Links this article to a help-center category (managed below).</p>
              </div>
            </div>
            <div><Label>Body</Label><Textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={8} className="font-mono text-[13px]" /></div>
            <div className="flex items-center justify-between">
              <div className="w-32"><Label>Sort order</Label><Input type="number" value={editing.order} onChange={(e) => setEditing({ ...editing, order: Number(e.target.value) || 0 })} /></div>
              <Button onClick={save} disabled={!editing.title.trim() || !editing.slug.trim()}>Save article</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function ContactInbox({ readOnly }: { readOnly: boolean }) {
  const p2 = useP2();
  const [msgs, setMsgs] = useState<ApiContactMessage2[]>([]);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const { data } = await p2.contactMessages.list();
      setMsgs(itemsOf(data));
    } catch (e) { setError(errMsg(e)); }
  };
  useEffect(() => { void load(); }, []);

  const markRead = async (m: ApiContactMessage2) => {
    try {
      await p2.contactMessages.markRead(m.id);
      await load();
    } catch (e) { setError(errMsg(e)); }
  };

  const unread = msgs.filter((m) => !m.read).length;

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-900">Contact inbox {unread > 0 && <Badge tone="rose">{unread} unread</Badge>}</h3>
      </div>
      {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}
      {msgs.length === 0 ? (
        <EmptyState icon="✉️" title="No messages" hint="Submissions from /contact land here." />
      ) : (
        <div className="space-y-3">
          {msgs.map((m) => (
            <Card key={m.id} className={cx('p-4', !m.read && 'border-brix-200 bg-brix-50/40')}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900">{m.name}</span>
                    <span className="text-xs text-slate-400">{m.email}</span>
                    {!m.read && <Badge tone="rose">new</Badge>}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 font-semibold">{m.subject} · {fmtTs(m.created_at)}</div>
                  <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{m.message}</p>
                </div>
                {!readOnly && !m.read && (
                  <Button variant="ghost" size="sm" onClick={() => void markRead(m)}>Mark read</Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusManager({ readOnly }: { readOnly: boolean }) {
  const p2 = useP2();
  const { confirm, dialog } = useConfirm();
  const [entries, setEntries] = useState<ApiStatusEntry2[]>([]);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [state, setState] = useState<ApiStatusEntry2['state']>('operational');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const { data } = await p2.statusEntries.list();
      setEntries(itemsOf(data));
    } catch (e) { setError(errMsg(e)); }
  };
  useEffect(() => { void load(); }, []);

  const add = async () => {
    if (!title.trim()) return;
    try {
      await p2.statusEntries.create({ title: title.trim(), detail: detail.trim(), state });
      setTitle(''); setDetail('');
      await load();
    } catch (e) { setError(errMsg(e)); }
  };

  const remove = (e: ApiStatusEntry2) => {
    confirm({
      title: 'Delete status entry?', body: `"${e.title}" will be removed from /status.`,
      action: async () => { await p2.statusEntries.delete(e.id); await load(); },
    });
  };

  const tone = (s: ApiStatusEntry2['state']) => (s === 'operational' ? 'green' : s === 'degraded' ? 'amber' : 'rose') as 'green' | 'amber' | 'rose';

  return (
    <div>
      {dialog}
      <h3 className="font-bold text-slate-900 mb-4">Status page <span className="text-xs font-semibold text-slate-400">/status</span></h3>
      {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}
      {!readOnly && (
        <Card className="p-5 mb-5">
          <div className="grid sm:grid-cols-[1fr_180px] gap-3 mb-3">
            <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Scheduled maintenance" /></div>
            <div>
              <Label>State</Label>
              <Select value={state} onChange={(e) => setState(e.target.value as ApiStatusEntry2['state'])}>
                <option value="operational">Operational</option>
                <option value="degraded">Degraded</option>
                <option value="incident">Incident</option>
              </Select>
            </div>
          </div>
          <div className="mb-3"><Label>Detail</Label><Textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={2} /></div>
          <Button size="sm" onClick={() => void add()} disabled={!title.trim()}>Publish entry</Button>
        </Card>
      )}
      <div className="space-y-3">
        {entries.length === 0 && <EmptyState icon="🟢" title="No entries" hint="The status page shows all-operational by default." />}
        {entries.map((e) => (
          <Card key={e.id} className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge tone={tone(e.state)}>{e.state}</Badge>
                  <span className="font-bold text-slate-900">{e.title}</span>
                </div>
                {e.detail && <p className="text-sm text-slate-500 mt-1">{e.detail}</p>}
                <div className="text-xs text-slate-400 mt-1">{fmtTs(e.created_at)}</div>
              </div>
              {!readOnly && <Button variant="ghost" size="sm" onClick={() => remove(e)} className="text-rose-600">Delete</Button>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ContentTab({ readOnly }: { readOnly: boolean }) {
  return (
    <div>
      <SectionTitle title="Content" sub="Everything the public site shows: blog, help center, contact inbox, status page." />
      <Notice>
        <span><strong>Marketing content.</strong> Posts and articles you publish here appear on <span className="font-mono">/blog</span> and <span className="font-mono">/help</span> immediately. Seed content fills empty lists automatically on first visit.</span>
      </Notice>
      <BlogManager readOnly={readOnly} />
      <HelpManager readOnly={readOnly} />
      <ContactInbox readOnly={readOnly} />
      <StatusManager readOnly={readOnly} />
      <CategoriesManager readOnly={readOnly} />
    </div>
  );
}

const CAT_GROUPS: Array<{ scope: CategoryKind; label: string; hint: string }> = [
  { scope: 'kb', label: 'Help center categories', hint: 'Organize /help and /kb articles.' },
  { scope: 'canned', label: 'Canned-response categories', hint: 'Group saved replies in the agent panel.' },
  { scope: 'tickets', label: 'Ticket categories', hint: 'Classify support tickets.' },
];

function CategoriesManager({ readOnly }: { readOnly: boolean }) {
  const api = useApi();
  const { confirm, dialog } = useConfirm();
  const [props, setProps] = useState<ApiProperty[]>([]);
  const [propId, setPropId] = useState('');
  const cats = useCatSource(propId);
  const [byScope, setByScope] = useState<Record<CategoryKind, ApiCategory2[]>>({ kb: [], canned: [], tickets: [] });
  const [name, setName] = useState<Record<CategoryKind, string>>({ kb: '', canned: '', tickets: '' });
  const [color, setColor] = useState<Record<CategoryKind, string>>({ kb: '#4f46e5', canned: '#0ea5e9', tickets: '#f59e0b' });
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.properties.list();
        setProps(data);
        setPropId((p) => p || data[0]?.id || '');
      } catch (e) { setError(errMsg(e)); }
    })();
  }, [api]);

  const load = async () => {
    if (!propId || !cats.live) return;
    try {
      const [kb, canned, tickets] = await Promise.all([
        cats.list('kb'), cats.list('canned'), cats.list('tickets'),
      ]);
      setByScope({ kb, canned, tickets });
    } catch (e) {
      if (!missingP2(e)) setError(errMsg(e));
    }
  };
  useEffect(() => { void load(); }, [propId, cats.live]);

  const add = async (scope: CategoryKind) => {
    const n = name[scope].trim();
    if (!n || !propId) return;
    try {
      await cats.create(scope, n, color[scope]);
      setName((s) => ({ ...s, [scope]: '' }));
      await load();
    } catch (e) { setError(errMsg(e)); }
  };

  const remove = (c: ApiCategory2) => {
    confirm({
      title: 'Delete category?',
      body: `"${c.name}" will be removed. Items using it keep their content but lose the label.`,
      action: async () => { await cats.remove(c.id); await load(); },
    });
  };

  return (
    <div className="mt-8">
      {dialog}
      <SectionTitle title="Categories" sub="Labels for help articles, canned replies, and tickets. Assign them from each item's editor." />
      {!cats.live ? (
        <EmptyState icon="🏷️" title="Categories API not available yet" hint="api.categories.* lands with the phase-2 data API. This section renders automatically once it does." />
      ) : (
        <>
          <Card className="p-5 mb-4">
            <div className="max-w-sm">
              <Label>Property</Label>
              <Select value={propId} onChange={(e) => setPropId(e.target.value)}>
                {props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
          </Card>
          {error && <p className="text-sm text-rose-600 mb-4">{error}</p>}
          <div className="grid lg:grid-cols-3 gap-4">
            {CAT_GROUPS.map((g) => (
              <Card key={g.scope} className="p-5">
                <h3 className="font-bold text-slate-900">{g.label}</h3>
                <p className="text-xs text-slate-500 mb-4">{g.hint}</p>
                <div className="space-y-2 mb-4">
                  {byScope[g.scope].length === 0 && <p className="text-xs text-slate-400">No categories yet.</p>}
                  {byScope[g.scope].map((c) => (
                    <div key={c.id} className="flex items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                      <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: c.color }} />
                      <span className="text-sm font-semibold text-slate-700 flex-1 truncate">{c.name}</span>
                      {!readOnly && (
                        <button onClick={() => remove(c)} className="text-xs text-rose-500 hover:text-rose-700 font-semibold">Delete</button>
                      )}
                    </div>
                  ))}
                </div>
                {!readOnly && (
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={color[g.scope]}
                      onChange={(e) => setColor((s) => ({ ...s, [g.scope]: e.target.value }))}
                      className="w-9 h-9 rounded-lg border border-slate-200 p-1 bg-white shrink-0"
                      aria-label="Category color"
                    />
                    <Input
                      value={name[g.scope]}
                      onChange={(e) => setName((s) => ({ ...s, [g.scope]: e.target.value }))}
                      placeholder="New category name"
                      onKeyDown={(e) => { if (e.key === 'Enter') void add(g.scope); }}
                    />
                    <Button size="sm" onClick={() => void add(g.scope)} disabled={!name[g.scope].trim()}>Add</Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Branding — white-label controls per property (logo, name, colors, domain)
// ---------------------------------------------------------------------------

const PALETTES: Array<{ name: string; color: string; accent: string }> = [
  { name: 'Ocean', color: '#4f46e5', accent: '#0d9488' },
  { name: 'Forest', color: '#059669', accent: '#84cc16' },
  { name: 'Sunset', color: '#ea580c', accent: '#f59e0b' },
  { name: 'Royal', color: '#7c3aed', accent: '#ec4899' },
  { name: 'Slate', color: '#334155', accent: '#0ea5e9' },
  { name: 'Blush', color: '#e11d48', accent: '#f472b6' },
];

function BrandingTab({ readOnly }: { readOnly: boolean }) {
  const api = useApi();
  const p2 = useP2();
  const [props, setProps] = useState<ApiProperty[]>([]);
  const [propId, setPropId] = useState('');
  const [s, setS] = useState<PropertySettings2 | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [logoError, setLogoError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.properties.list();
        setProps(data);
        setPropId((p) => p || data[0]?.id || '');
      } catch (e) { setError(errMsg(e)); }
    })();
  }, [api]);

  useEffect(() => {
    if (!propId) return;
    (async () => {
      try {
        const { data } = await p2.propertySettings.get(propId);
        setS(data);
        setSaved(false);
      } catch (e) { setError(errMsg(e)); }
    })();
  }, [propId, p2]);

  const patch = (k: keyof PropertySettings2, v: string) => {
    setS((prev) => (prev ? { ...prev, [k]: v } : prev));
    setSaved(false);
  };

  const save = async () => {
    if (!s || !propId) return;
    try {
      await p2.propertySettings.patch(propId, {
        logo_data_url: s.logo_data_url, brand_name: s.brand_name, tagline: s.tagline,
        accent_color: s.accent_color, custom_domain: s.custom_domain,
        custom_subdomain: (s.custom_subdomain || '').trim().toLowerCase(),
        widget_color: s.widget_color,
      });
      setSaved(true);
    } catch (e) { setError(errMsg(e)); }
  };

  const onLogo = (f: File | undefined) => {
    setLogoError('');
    if (!f) return;
    if (f.size > 500 * 1024) { setLogoError('Logo must be under 500 KB.'); return; }
    const r = new FileReader();
    r.onload = () => patch('logo_data_url', String(r.result ?? ''));
    r.readAsDataURL(f);
  };

  const prop = props.find((p) => p.id === propId);

  return (
    <div>
      <SectionTitle title="Branding" sub="White-label each property: logo, name, colors, and domain." />
      <Notice>
        <span><strong>White-label.</strong> Branding applies to the widget and the property help center (<span className="font-mono">/kb/:key</span>) today. Path routing works now; subdomain mapping activates with the backend phase.</span>
      </Notice>
      {error && <p className="text-sm text-rose-600 mb-4">{error}</p>}

      <Card className="p-5 mb-5">
        <div className="max-w-sm">
          <Label>Property</Label>
          <Select value={propId} onChange={(e) => setPropId(e.target.value)}>
            {props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
      </Card>

      {!s ? (
        <EmptyState icon="🎨" title="Loading branding…" hint="Fetching property settings." />
      ) : (
        <div className="grid lg:grid-cols-2 gap-5">
          <div className="space-y-5">
            <Card className="p-5">
              <h3 className="font-bold text-slate-900 mb-4">Logo & name</h3>
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 grid place-items-center overflow-hidden shrink-0">
                  {s.logo_data_url ? (
                    <img src={s.logo_data_url} alt="Brand logo" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-2xl font-black text-slate-300">{(s.brand_name || prop?.name || 'B').charAt(0)}</span>
                  )}
                </div>
                {!readOnly && (
                  <div>
                    <label className="inline-block px-3.5 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold cursor-pointer hover:bg-slate-700">
                      Upload logo
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
                    </label>
                    {s.logo_data_url && (
                      <button onClick={() => patch('logo_data_url', '')} className="ml-2 text-xs font-semibold text-rose-600 hover:underline">Remove</button>
                    )}
                    <p className="text-xs text-slate-400 mt-1.5">PNG/SVG, under 500 KB. Stored in this browser.</p>
                    {logoError && <p className="text-xs text-rose-600 mt-1">{logoError}</p>}
                  </div>
                )}
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div><Label>Brand name</Label><Input value={s.brand_name} onChange={(e) => patch('brand_name', e.target.value)} placeholder={prop?.name} disabled={readOnly} /></div>
                <div><Label>Tagline</Label><Input value={s.tagline} onChange={(e) => patch('tagline', e.target.value)} placeholder="Chat with us — we reply fast." disabled={readOnly} /></div>
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="font-bold text-slate-900 mb-4">Colors</h3>
              <div className="flex flex-wrap gap-2 mb-4">
                {PALETTES.map((p) => (
                  <button
                    key={p.name}
                    disabled={readOnly}
                    onClick={() => { patch('widget_color', p.color); patch('accent_color', p.accent); }}
                    className={cx('flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold', s.widget_color === p.color ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300')}
                    title={`${p.name}: ${p.color} / ${p.accent}`}
                  >
                    <span className="flex -space-x-1">
                      <span className="w-4 h-4 rounded-full border border-white" style={{ background: p.color }} />
                      <span className="w-4 h-4 rounded-full border border-white" style={{ background: p.accent }} />
                    </span>
                    {p.name}
                  </button>
                ))}
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Primary color</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={s.widget_color} onChange={(e) => patch('widget_color', e.target.value)} disabled={readOnly} className="w-10 h-10 rounded-lg border border-slate-200 p-1 bg-white" />
                    <Input value={s.widget_color} onChange={(e) => patch('widget_color', e.target.value)} disabled={readOnly} className="font-mono" />
                  </div>
                </div>
                <div>
                  <Label>Accent color</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={s.accent_color || '#0d9488'} onChange={(e) => patch('accent_color', e.target.value)} disabled={readOnly} className="w-10 h-10 rounded-lg border border-slate-200 p-1 bg-white" />
                    <Input value={s.accent_color || ''} onChange={(e) => patch('accent_color', e.target.value)} disabled={readOnly} className="font-mono" />
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="font-bold text-slate-900 mb-1">Domain</h3>
              <p className="text-xs text-slate-500 mb-4">Custom domains arrive with the backend phase.</p>
              <div className="mb-4">
                <Label>Subdomain</Label>
                <div className="flex items-center gap-2">
                  <Input value={s.custom_subdomain || ''} onChange={(e) => patch('custom_subdomain', e.target.value.replace(/[^a-z0-9-]/gi, ''))} placeholder="acme" disabled={readOnly} className="font-mono" />
                  <span className="text-sm text-slate-400 font-mono shrink-0">.brixchat.com</span>
                </div>
                {(s.custom_subdomain || '').trim() && (
                  <p className="text-xs text-slate-400 mt-1.5">Preview: <span className="font-mono text-slate-600">{(s.custom_subdomain || '').trim().toLowerCase()}.brixchat.com</span> — mapping activates with the backend phase.</p>
                )}
              </div>
              <div>
                <Label>Custom domain</Label>
                <Input value={s.custom_domain || ''} disabled placeholder="support.acme.com" />
              </div>
              {!readOnly && (
                <div className="mt-5 flex items-center gap-3">
                  <Button onClick={() => void save()}>Save branding</Button>
                  {saved && <span className="text-sm font-semibold text-emerald-600">✓ Saved</span>}
                </div>
              )}
            </Card>
          </div>

          <div>
            <Card className="p-5 lg:sticky lg:top-6">
              <h3 className="font-bold text-slate-900 mb-1">Live preview</h3>
              <p className="text-xs text-slate-500 mb-4">How the widget bubble looks with this branding.</p>
              <div className="rounded-2xl bg-slate-100 p-8 grid place-items-center">
                <div className="w-full max-w-[240px] rounded-2xl bg-white shadow-xl overflow-hidden">
                  <div className="px-4 py-3 flex items-center gap-2.5" style={{ background: s.widget_color }}>
                    {s.logo_data_url ? (
                      <img src={s.logo_data_url} alt="" className="w-9 h-9 rounded-xl bg-white object-contain p-0.5" />
                    ) : (
                      <span className="w-9 h-9 rounded-xl bg-white/20 grid place-items-center text-white font-black">{(s.brand_name || prop?.name || 'B').charAt(0)}</span>
                    )}
                    <div className="min-w-0">
                      <div className="text-white font-bold text-sm truncate">{s.brand_name || prop?.name || 'Brand'}</div>
                      <div className="text-white/70 text-xs truncate">{s.tagline || 'We reply fast.'}</div>
                    </div>
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="rounded-xl rounded-tl-sm bg-slate-100 px-3 py-2 text-xs text-slate-700 w-fit">Hi there! 👋 How can we help?</div>
                    <div className="rounded-xl rounded-tr-sm px-3 py-2 text-xs text-white w-fit ml-auto" style={{ background: s.accent_color || s.widget_color }}>I need help with my order</div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function RatingsTab() {
  const api = useApi();
  const p2 = useP2();
  const [props, setProps] = useState<ApiProperty[]>([]);
  const [propId, setPropId] = useState('');
  const [summary, setSummary] = useState<RatingsSummary2 | null>(null);
  const [ratings, setRatings] = useState<ApiRating2[]>([]);
  const [members, setMembers] = useState<ApiMember2[]>([]);
  const [days, setDays] = useState(30);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.properties.list();
        setProps(data);
        setPropId((p) => p || data[0]?.id || '');
        const { data: m } = await p2.members.list();
        setMembers(itemsOf(m));
      } catch (e) { setError(errMsg(e)); }
    })();
  }, [api, p2]);

  const load = async () => {
    if (!propId) return;
    try {
      const { data: s } = await p2.ratings.summary(propId, days);
      setSummary(s);
      const { data: l } = await p2.ratings.list({ property_id: propId, limit: 100 });
      setRatings(itemsOf(l));
      setMissing(false);
    } catch (e) {
      if (missingP2(e)) setMissing(true);
      else setError(errMsg(e));
    }
  };
  useEffect(() => { void load(); }, [propId, days]);

  if (missing) {
    return (
      <div>
        <SectionTitle title="Ratings" sub="Customer satisfaction (CSAT) and NPS from post-chat surveys." />
        <EmptyState icon="⭐" title="Ratings API not available yet" hint="api.ratings.* lands with the phase-2 data API. This dashboard renders automatically once it does." />
      </div>
    );
  }

  const csat = summary?.csat_avg ?? null;
  const nps = summary?.nps_score ?? null;
  const maxTrend = Math.max(1, ...((summary?.trend ?? []).map((t) => t.count)));
  const memberName = (id: string | null) =>
    members.find((m) => m.id === id)?.display_name ?? 'Unassigned';

  const isLow = (r: ApiRating2) => (r.kind === 'csat' ? r.score <= 2 : r.score <= 6);
  const low = ratings.filter(isLow);
  const commented = ratings.filter((r) => r.comment.trim());

  const byAgent = (() => {
    const map = new Map<string, { name: string; count: number; csatSum: number; csatN: number }>();
    for (const r of ratings) {
      const key = r.agent_id ?? 'unassigned';
      const e = map.get(key) ?? { name: memberName(r.agent_id), count: 0, csatSum: 0, csatN: 0 };
      e.count += 1;
      if (r.kind === 'csat') { e.csatSum += r.score; e.csatN += 1; }
      map.set(key, e);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  })();

  const totalNps = (summary?.promoters ?? 0) + (summary?.passives ?? 0) + (summary?.detractors ?? 0);

  return (
    <div>
      <SectionTitle title="Ratings" sub="Customer satisfaction (CSAT) and NPS from the widget's two-step survey." />
      <Notice>
        <span><strong>Local mode.</strong> Ratings are collected by the widget survey (CSAT 1–5, then NPS 0–10) and stored in this browser until the backend phase. Low ratings also raise a notification.</span>
      </Notice>
      {error && <p className="text-sm text-rose-600 mb-4">{error}</p>}

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-2">
          <Label>Property</Label>
          <Select value={propId} onChange={(e) => setPropId(e.target.value)} className="w-48">
            {props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label>Window</Label>
          <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))} className="w-32">
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
          </Select>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="CSAT average" value={csat !== null ? `${csat.toFixed(1)} / 5` : '—'} delta={`${summary?.csat_count ?? 0} responses`} icon="⭐" tone="green" />
        <StatCard label="NPS" value={nps !== null ? String(Math.round(nps)) : '—'} delta={`${summary?.nps_count ?? 0} responses`} icon="📊" tone="indigo" />
        <StatCard label="Responses" value={String(ratings.length)} delta={`last ${days} days`} icon="💬" tone="cyan" />
        <StatCard label="Needs attention" value={String(low.length)} delta="CSAT ≤ 2 or NPS ≤ 6" icon="⚠️" tone="rose" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card className="p-5">
          <h3 className="font-bold text-slate-900 mb-1">CSAT trend</h3>
          <p className="text-xs text-slate-500 mb-4">Average satisfaction per day.</p>
          {(summary?.trend.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-400">No ratings in this window yet.</p>
          ) : (
            <div className="flex items-end gap-1.5 h-36">
              {summary!.trend.map((t) => (
                <div key={t.day} className="flex-1 flex flex-col items-center gap-1" title={`${t.day}: CSAT ${t.csat_avg !== null ? t.csat_avg.toFixed(1) : '—'} · NPS ${t.nps_avg !== null ? t.nps_avg.toFixed(0) : '—'} (${t.count})`}>
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-brix-600 to-cyan-400 min-h-[4px]"
                    style={{ height: `${(t.count / maxTrend) * 100}%`, opacity: t.csat_avg !== null && t.csat_avg < 3 ? 0.45 : 1 }}
                  />
                  <span className="text-[10px] text-slate-400 font-mono">{t.day.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="font-bold text-slate-900 mb-1">NPS gauge</h3>
          <p className="text-xs text-slate-500 mb-4">Promoters (9–10) minus detractors (0–6). −100 to +100.</p>
          {nps === null ? (
            <p className="text-sm text-slate-400">No NPS responses yet.</p>
          ) : (
            <div>
              <div className="relative h-4 rounded-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-500">
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1 h-7 bg-slate-900 rounded-full"
                  style={{ left: `${((nps + 100) / 200) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-slate-400 font-mono mt-1.5">
                <span>−100</span><span className="text-slate-900 font-bold text-sm">{Math.round(nps)}</span><span>+100</span>
              </div>
              {totalNps > 0 && (
                <div className="flex h-2.5 rounded-full overflow-hidden mt-4">
                  <div className="bg-emerald-500" style={{ width: `${(summary!.promoters / totalNps) * 100}%` }} title={`Promoters: ${summary!.promoters}`} />
                  <div className="bg-amber-400" style={{ width: `${(summary!.passives / totalNps) * 100}%` }} title={`Passives: ${summary!.passives}`} />
                  <div className="bg-rose-500" style={{ width: `${(summary!.detractors / totalNps) * 100}%` }} title={`Detractors: ${summary!.detractors}`} />
                </div>
              )}
              <div className="flex gap-4 text-xs text-slate-500 mt-2">
                <span><span className="font-bold text-emerald-600">{summary?.promoters ?? 0}</span> promoters</span>
                <span><span className="font-bold text-amber-600">{summary?.passives ?? 0}</span> passives</span>
                <span><span className="font-bold text-rose-600">{summary?.detractors ?? 0}</span> detractors</span>
              </div>
              <p className="text-xs text-slate-500 mt-3">
                {nps >= 50 ? 'Excellent — advocates far outweigh critics.' : nps >= 0 ? 'Healthy — more promoters than detractors.' : 'At risk — detractors outweigh promoters. Check the alerts below.'}
              </p>
            </div>
          )}
        </Card>
      </div>

      {low.length > 0 && (
        <Card className="p-5 mb-6 border-rose-200 bg-rose-50/50">
          <h3 className="font-bold text-rose-900 mb-3">⚠️ Low-rating alerts</h3>
          <div className="space-y-2.5">
            {low.slice(0, 8).map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone="rose">{r.kind === 'csat' ? `CSAT ${r.score}/5` : `NPS ${r.score}/10`}</Badge>
                <span className="text-slate-700">{memberName(r.agent_id)}</span>
                <span className="text-slate-400 text-xs">{fmtTs(r.created_at)}</span>
                {r.comment.trim() && <span className="text-slate-600 italic w-full">“{r.comment}”</span>}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h3 className="font-bold text-slate-900 mb-4">Per-agent ratings</h3>
          {byAgent.length === 0 ? (
            <p className="text-sm text-slate-400">No agent ratings yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-100">
                    <th className="py-2 pr-4 font-semibold">Agent</th>
                    <th className="py-2 pr-4 font-semibold">Responses</th>
                    <th className="py-2 font-semibold">CSAT avg</th>
                  </tr>
                </thead>
                <tbody>
                  {byAgent.map((a) => (
                    <tr key={a.name} className="border-b border-slate-50 last:border-0">
                      <td className="py-2.5 pr-4 font-semibold text-slate-800">{a.name}</td>
                      <td className="py-2.5 pr-4 text-slate-500">{a.count}</td>
                      <td className="py-2.5">
                        <span className={cx('font-bold', a.csatN > 0 && a.csatSum / a.csatN < 3 ? 'text-rose-600' : 'text-slate-800')}>
                          {a.csatN > 0 ? (a.csatSum / a.csatN).toFixed(1) : '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="font-bold text-slate-900 mb-4">Recent comments</h3>
          {commented.length === 0 ? (
            <p className="text-sm text-slate-400">No written feedback yet.</p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto slim-scroll">
              {commented.slice(0, 12).map((r) => (
                <div key={r.id} className="rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-3">
                  <p className="text-sm text-slate-700 italic">“{r.comment}”</p>
                  <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
                    <Badge tone={isLow(r) ? 'rose' : 'green'}>{r.kind === 'csat' ? `CSAT ${r.score}` : `NPS ${r.score}`}</Badge>
                    <span>{memberName(r.agent_id)}</span>
                    <span>·</span>
                    <span>{fmtTs(r.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Departments + routing (api.departments.*, api.routing.routeChat)
// ---------------------------------------------------------------------------

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const ROUTING_MODES: Array<{ id: RoutingMode; name: string; blurb: string }> = [
  { id: 'round-robin', name: 'Round robin', blurb: 'Chats are dealt out to agents one after another, in rotation — everyone gets a fair share.' },
  { id: 'least-busy', name: 'Least busy', blurb: 'Each new chat goes to the agent with the fewest open chats right now.' },
  { id: 'first-available', name: 'First available', blurb: 'The chat goes to whichever agent picks it up first — fastest response wins.' },
];

const OFFLINE_BEHAVIORS: Array<{ id: OfflineBehavior; name: string; blurb: string }> = [
  { id: 'ticket', name: 'Create a ticket', blurb: 'The visitor\'s message becomes a support ticket for the team.' },
  { id: 'message', name: 'Take a message', blurb: 'The visitor leaves a message; the team follows up later.' },
  { id: 'hide', name: 'Hide the widget', blurb: 'Visitors can\'t start a chat outside business hours.' },
];

function DayHoursEditor({ value, onChange }: { value: DayHours[]; onChange: (v: DayHours[]) => void }) {
  const set = (day: number, k: keyof DayHours, v: string | boolean) => {
    onChange(value.map((r) => (r.day === day ? { ...r, [k]: v } : r)));
  };
  return (
    <div className="space-y-1.5">
      {DAYS.map((name, day) => {
        const row = value.find((r) => r.day === day) ?? { day, open: '09:00', close: '18:00', closed: false };
        return (
          <div key={day} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2">
            <span className="w-10 text-sm font-bold text-slate-700">{name}</span>
            <Toggle checked={!row.closed} onChange={(v: boolean) => set(day, 'closed', !v)} label={row.closed ? 'Closed' : 'Open'} />
            {!row.closed && (
              <>
                <Input type="time" value={row.open} onChange={(e) => set(day, 'open', e.target.value)} className="w-28" />
                <span className="text-slate-400 text-sm">–</span>
                <Input type="time" value={row.close} onChange={(e) => set(day, 'close', e.target.value)} className="w-28" />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

const emptyDept: DepartmentInput2 & { useHours: boolean; hours: DayHours[] } = {
  name: '', description: '', agent_ids: [], routing_mode: 'round-robin',
  hours_override: null, offline_behavior: 'message',
  useHours: false,
  hours: DAYS.map((_, day) => ({ day, open: '09:00', close: '18:00', closed: day === 0 || day === 6 })),
};

function DepartmentsTab({ readOnly }: { readOnly: boolean }) {
  const api = useApi();
  const p2 = useP2();
  const { confirm, dialog } = useConfirm();
  const [props, setProps] = useState<ApiProperty[]>([]);
  const [propId, setPropId] = useState('');
  const depts = useDeptSource(propId);
  const [items, setItems] = useState<ApiDepartment2[]>([]);
  const [members, setMembers] = useState<ApiMember2[]>([]);
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<(typeof emptyDept & { id?: string }) | null>(null);
  const [simResult, setSimResult] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.properties.list();
        setProps(data);
        setPropId((p) => p || data[0]?.id || '');
        const { data: m } = await p2.members.list();
        setMembers(itemsOf(m));
        const d: Record<string, string> = {};
        for (const pr of data) {
          try {
            const { data: s } = await p2.propertySettings.get(pr.id);
            d[pr.id] = (s as PropertySettings2).default_department_id ?? '';
          } catch { /* keep empty */ }
        }
        setDefaults(d);
      } catch (e) {
        if (!missingP2(e)) setError(errMsg(e));
      }
    })();
  }, [api, p2]);

  const loadDepts = async (pid: string) => {
    if (!pid || !depts.live) return;
    try {
      setItems(await depts.list());
    } catch (e) {
      if (!missingP2(e)) setError(errMsg(e));
      setItems([]);
    }
  };
  useEffect(() => { void loadDepts(propId); }, [propId, depts.live]);

  /** Runtime hours (empty open/close = closed) -> editor hours (closed flag). */
  const toEditorHours = (h: ApiDepartment2['hours_override']): DayHours[] =>
    DAYS.map((_, day) => {
      const row = h?.find((x) => x.day === day);
      const closed = !row || !row.open || !row.close;
      return { day, open: row?.open || '09:00', close: row?.close || '18:00', closed };
    });
  /** Editor hours -> runtime hours (closed days get empty open/close). */
  const toRuntimeHours = (h: DayHours[]) =>
    h.map((x) => ({ day: x.day, open: x.closed ? '' : x.open, close: x.closed ? '' : x.close }));

  const save = async () => {
    if (!editing || !editing.name.trim() || !propId) return;
    setBusy(true); setError('');
    try {
      const input: DepartmentInput2 = {
        name: editing.name.trim(),
        description: (editing.description ?? '').trim(),
        agent_ids: editing.agent_ids ?? [],
        routing_mode: editing.routing_mode ?? 'round-robin',
        hours_override: editing.useHours ? toRuntimeHours(editing.hours) : null,
        offline_behavior: editing.offline_behavior ?? 'message',
      };
      if (editing.id) await depts.update(editing.id, input);
      else await depts.create(input);
      setEditing(null);
      await loadDepts(propId);
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  };

  const remove = (d: ApiDepartment2) => {
    confirm({
      title: 'Delete department?',
      body: `"${d.name}" will be removed. Chats will fall back to the property default routing.`,
      action: async () => { await depts.remove(d.id); await loadDepts(propId); },
    });
  };

  const setDefault = async (pid: string, deptId: string) => {
    try {
      await p2.propertySettings.patch(pid, { default_department_id: deptId } as Partial<PropertySettings2>);
      setDefaults((p) => ({ ...p, [pid]: deptId }));
    } catch (e) { setError(errMsg(e)); }
  };

  const simulate = async (d: ApiDepartment2) => {
    try {
      const { data: r } = await p2.routing.routeChat(propId, d.id);
      const agent = members.find((m) => m.id === r.agent_id);
      setSimResult((s) => ({
        ...s,
        [d.id]: r.agent_id ? `→ ${agent?.display_name ?? 'an agent'} (${modeName(d.routing_mode)})` : '→ no agent available right now',
      }));
    } catch (e) { setError(errMsg(e)); }
  };

  const toggleAgent = (id: string) => {
    if (!editing) return;
    const cur = editing.agent_ids ?? [];
    setEditing({ ...editing, agent_ids: cur.includes(id) ? cur.filter((a) => a !== id) : [...cur, id] });
  };

  const modeName = (id: RoutingMode) => ROUTING_MODES.find((m) => m.id === id)?.name ?? id;
  const offlineName = (id: OfflineBehavior) => OFFLINE_BEHAVIORS.find((m) => m.id === id)?.name ?? id;

  return (
    <div>
      {dialog}
      <SectionTitle title="Departments" sub="Organize agents into departments, each with its own routing, hours, and offline behavior." />
      {!depts.live ? (
        <EmptyState icon="🏢" title="Departments API not available yet" hint="api.departments.* lands with the phase-2 data API. This tab renders automatically once it does." />
      ) : (
        <>
          <Card className="p-5 mb-6">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Property</Label>
                <Select value={propId} onChange={(e) => setPropId(e.target.value)}>
                  {props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </div>
            </div>
          </Card>

          {error && <p className="text-sm text-rose-600 mb-4">{error}</p>}

          <Card className="p-5 mb-6">
            <h3 className="font-bold text-slate-900 mb-1">Routing rules</h3>
            <p className="text-xs text-slate-500 mb-4">
              When a chat starts, it is routed to the property's default department. The <em>routing mode</em> (round robin, least busy, first available) lives on each department below. Routing is simulated locally — live skill-based routing arrives with the backend phase.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              {props.map((p) => (
                <div key={p.id}>
                  <Label>{p.name} — default department</Label>
                  <Select value={defaults[p.id] ?? ''} onChange={(e) => void setDefault(p.id, e.target.value)} disabled={readOnly}>
                    <option value="">None (unassigned pool)</option>
                    {items.filter((d) => d.property_id === p.id).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </Select>
                </div>
              ))}
              {props.length === 0 && <p className="text-sm text-slate-400">No properties yet.</p>}
            </div>
          </Card>

          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-500">{items.length} departments</p>
            {!readOnly && propId && <Button size="sm" onClick={() => setEditing({ ...emptyDept, hours: emptyDept.hours.map((h) => ({ ...h })) })}>+ New department</Button>}
          </div>

          {items.length === 0 ? (
            <EmptyState icon="🏢" title="No departments yet" hint={readOnly ? '' : 'Create departments like Sales and Support, assign agents, and choose how chats are routed.'} />
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {items.map((d) => {
                const agents = members.filter((m) => d.agent_ids.includes(m.id));
                return (
                  <Card key={d.id} className="p-5">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <div className="font-bold text-slate-900 text-lg">{d.name}</div>
                        {d.description && <p className="text-sm text-slate-500 mt-0.5">{d.description}</p>}
                      </div>
                      {!readOnly && (
                        <div className="flex gap-1.5 shrink-0">
                          <Button variant="ghost" size="sm" onClick={() => setEditing({
                            id: d.id, name: d.name, description: d.description,
                            agent_ids: d.agent_ids, routing_mode: d.routing_mode,
                            offline_behavior: d.offline_behavior,
                            useHours: d.hours_override !== null,
                            hours: toEditorHours(d.hours_override),
                          })}>Edit</Button>
                          <Button variant="ghost" size="sm" onClick={() => remove(d)} className="text-rose-600">Delete</Button>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 mb-3">
                      <Badge tone="indigo">{modeName(d.routing_mode)}</Badge>
                      <Badge tone="slate">{offlineName(d.offline_behavior)} when offline</Badge>
                      {d.hours_override && <Badge tone="amber">Custom hours</Badge>}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      {agents.length === 0 ? (
                        <span className="text-xs text-slate-400">No agents assigned</span>
                      ) : agents.map((a) => (
                        <span key={a.id} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-full pl-1 pr-2.5 py-1">
                          <span className="w-5 h-5 rounded-full grid place-items-center text-white text-[9px] font-extrabold" style={{ background: a.color || '#4f46e5' }}>
                            {a.initials || a.display_name.slice(0, 2).toUpperCase()}
                          </span>
                          {a.display_name}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => void simulate(d)}>Simulate route</Button>
                      {simResult[d.id] && <span className="text-xs text-slate-500">{simResult[d.id]}</span>}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? 'Edit department' : 'New department'} wide>
            {editing && (
              <div className="space-y-5">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div><Label>Name</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Sales" /></div>
                  <div><Label>Description</Label><Input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="What this team handles" /></div>
                </div>
                <div>
                  <Label>Agents in this department</Label>
                  {members.length === 0 ? (
                    <p className="text-sm text-slate-400">No team members yet — invite them from the Team tab first.</p>
                  ) : (
                    <div className="grid sm:grid-cols-2 gap-2">
                      {members.map((m) => (
                        <label key={m.id} className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-3 py-2 text-sm cursor-pointer hover:border-slate-300">
                          <input type="checkbox" checked={(editing.agent_ids ?? []).includes(m.id)} onChange={() => toggleAgent(m.id)} className="w-4 h-4 accent-indigo-600" />
                          <span className="w-6 h-6 rounded-full grid place-items-center text-white text-[9px] font-extrabold shrink-0" style={{ background: m.color || '#4f46e5' }}>
                            {m.initials || m.display_name.slice(0, 2).toUpperCase()}
                          </span>
                          <span className="font-semibold text-slate-700">{m.display_name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <Label>Routing mode</Label>
                  <div className="grid sm:grid-cols-3 gap-2.5">
                    {ROUTING_MODES.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setEditing({ ...editing, routing_mode: m.id })}
                        className={cx(
                          'rounded-xl border p-3.5 text-left transition',
                          editing.routing_mode === m.id ? 'border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500' : 'border-slate-200 hover:border-slate-300',
                        )}
                      >
                        <div className="font-bold text-sm text-slate-900 mb-1">{m.name}</div>
                        <div className="text-xs text-slate-500 leading-relaxed">{m.blurb}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2.5 mb-3">
                    <Toggle checked={editing.useHours} onChange={(v: boolean) => setEditing({ ...editing, useHours: v })} />
                    <span className="text-sm font-semibold text-slate-700">Custom business hours for this department</span>
                  </div>
                  {editing.useHours ? (
                    <DayHoursEditor value={editing.hours} onChange={(h) => setEditing({ ...editing, hours: h })} />
                  ) : (
                    <p className="text-xs text-slate-400">Inherits the property's business hours.</p>
                  )}
                </div>
                <div>
                  <Label>When the department is offline</Label>
                  <div className="grid sm:grid-cols-3 gap-2.5">
                    {OFFLINE_BEHAVIORS.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => setEditing({ ...editing, offline_behavior: b.id })}
                        className={cx(
                          'rounded-xl border p-3.5 text-left transition',
                          editing.offline_behavior === b.id ? 'border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500' : 'border-slate-200 hover:border-slate-300',
                        )}
                      >
                        <div className="font-bold text-sm text-slate-900 mb-1">{b.name}</div>
                        <div className="text-xs text-slate-500 leading-relaxed">{b.blurb}</div>
                      </button>
                    ))}
                  </div>
                </div>
                {error && <p className="text-sm text-rose-600">{error}</p>}
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  <Button onClick={save} disabled={busy || !editing.name.trim()}>{busy ? 'Saving…' : 'Save department'}</Button>
                </div>
              </div>
            )}
          </Modal>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Member profiles — extended team profiles: job title, photo, departments
// (api.members.*). Shown across the dashboard and the widget.
// ---------------------------------------------------------------------------

const AVATAR_COLORS = ['#4f46e5', '#0891b2', '#059669', '#f59e0b', '#8b5cf6', '#e11d48', '#334155'];

function MemberProfileModal({ member, onClose, onSaved }: { member: ApiMember2; onClose: () => void; onSaved: () => void }) {
  const p2 = useP2();
  const api = useApi();
  const [propId, setPropId] = useState('');
  const deptSrc = useDeptSource(propId);
  const [departments, setDepartments] = useState<ApiDepartment2[]>([]);
  const [name, setName] = useState(member.display_name);
  const [jobTitle, setJobTitle] = useState(member.job_title ?? '');
  const [color, setColor] = useState(member.color);
  const [avatar, setAvatar] = useState<string | null>(member.avatar_data_url ?? null);
  const [deptIds, setDeptIds] = useState<string[]>(member.department_ids ?? []);
  const [role, setRole] = useState(member.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [imgError, setImgError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.properties.list();
        setPropId(data[0]?.id ?? '');
      } catch { /* departments stay empty */ }
    })();
  }, [api]);

  useEffect(() => {
    if (!propId || !deptSrc.live) return;
    deptSrc.list().then(setDepartments).catch(() => setDepartments([]));
  }, [propId, deptSrc]);

  const toggleDept = (id: string) => {
    setDeptIds((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  };

  const onFile = (f: File | undefined) => {
    setImgError('');
    if (!f) return;
    if (f.size > 300 * 1024) { setImgError('Photo must be under 300 KB.'); return; }
    const r = new FileReader();
    r.onload = () => setAvatar(String(r.result ?? ''));
    r.readAsDataURL(f);
  };

  const save = async () => {
    if (!name.trim()) { setError('Display name is required.'); return; }
    setBusy(true);
    setError('');
    try {
      await p2.members.update(member.id, {
        display_name: name.trim(), job_title: jobTitle.trim(), color,
        avatar_data_url: avatar, department_ids: deptIds, role,
      });
      onSaved();
      onClose();
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Profile — ${member.display_name}`} wide>
      <div className="space-y-5">
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl grid place-items-center text-white text-xl font-black overflow-hidden shrink-0" style={{ background: color }}>
            {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : member.initials}
          </div>
          {!avatar ? (
            <div>
              <div className="flex gap-1.5 mb-2">
                {AVATAR_COLORS.map((c) => (
                  <button key={c} onClick={() => setColor(c)} className={cx('w-7 h-7 rounded-full border-2', color === c ? 'border-slate-900' : 'border-transparent')} style={{ background: c }} aria-label={`Color ${c}`} />
                ))}
              </div>
              <label className="inline-block px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 cursor-pointer">
                Upload photo
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
              {imgError && <p className="text-xs text-rose-600 mt-1">{imgError}</p>}
            </div>
          ) : (
            <button onClick={() => setAvatar(null)} className="text-xs font-semibold text-rose-600 hover:underline">Remove photo</button>
          )}
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label>Display name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Job title</Label><Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Support lead" /></div>
        </div>
        <div>
          <Label>Role</Label>
          <Select value={role} onChange={(e) => setRole(e.target.value)} className="max-w-xs">
            {(Object.keys(ROLE_LABELS) as TeamRole[]).map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Departments</Label>
          {departments.length === 0 ? (
            <p className="text-xs text-slate-400">No departments yet — create them under Departments first.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {departments.map((d) => (
                <button
                  key={d.id}
                  onClick={() => toggleDept(d.id)}
                  className={cx('rounded-full border px-3.5 py-1.5 text-xs font-bold transition', deptIds.includes(d.id) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300')}
                >
                  {deptIds.includes(d.id) ? '✓ ' : ''}{d.name}
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-400 mt-1.5">Department membership drives chat routing and the Ratings per-agent table.</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save profile'}</Button>
        </div>
        <p className="text-xs text-slate-400">Job title, photo, and department memberships are stored on the member record and shown across the dashboard and widget.</p>
      </div>
    </Modal>
  );
}

function MemberProfiles({ readOnly }: { readOnly: boolean }) {
  const p2 = useP2();
  const [members, setMembers] = useState<ApiMember2[]>([]);
  const [editing, setEditing] = useState<ApiMember2 | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const { data } = await p2.members.list();
      setMembers(itemsOf(data));
    } catch (e) { setError(errMsg(e)); }
  };
  useEffect(() => { void load(); }, []);

  return (
    <div className="mt-10">
      <h3 className="font-bold text-slate-900 text-lg mb-1">Member profiles</h3>
      <p className="text-sm text-slate-500 mb-5">Job titles, photos, and department memberships — shown across the dashboard and the widget.</p>
      {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}
      {members.length === 0 ? (
        <EmptyState icon="👤" title="No members" hint="Members are created through the invite flow or login." />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {members.map((m) => (
            <Card key={m.id} className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl grid place-items-center text-white font-black overflow-hidden shrink-0" style={{ background: m.color }}>
                  {m.avatar_data_url ? <img src={m.avatar_data_url} alt="" className="w-full h-full object-cover" /> : m.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-900 truncate">{m.display_name}</div>
                  <div className="text-xs text-slate-400 truncate">{m.job_title || ROLE_LABELS[m.role as TeamRole] || m.role}{(m.department_ids?.length ?? 0) > 0 && ` · ${m.department_ids!.length} dept${m.department_ids!.length === 1 ? '' : 's'}`}</div>
                </div>
                {!readOnly && (
                  <Button variant="ghost" size="sm" onClick={() => setEditing(m)}>Edit profile</Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing && (
        <MemberProfileModal member={editing} onClose={() => setEditing(null)} onSaved={() => void load()} />
      )}
    </div>
  );
}


// ---------------------------------------------------------------------------
// Admin shell
// ---------------------------------------------------------------------------

export default function Admin() {
  const { session, logout } = useStore();
  const [tab, setTab] = useState<Tab>('overview');
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const readOnly = session?.role !== 'admin';

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
          {tab === 'overview' && <OverviewTab go={setTab} />}
          {tab === 'content' && <ContentTab readOnly={readOnly} />}
          {tab === 'properties' && <PropertiesTab refresh={refresh} />}
          {tab === 'branding' && <BrandingTab readOnly={readOnly} />}
          {tab === 'ratings' && <RatingsTab />}
          {tab === 'departments' && <DepartmentsTab readOnly={readOnly} />}
          {tab === 'keys' && <ApiKeysTab refresh={refresh} />}
          {tab === 'webhooks' && <WebhooksTab refresh={refresh} />}
          {tab === 'team' && <TeamTab refresh={refresh} readOnly={readOnly} />}
          {tab === 'audit' && <AuditTab />}
          {tab === 'install' && <InstallTab />}
        </main>
      </div>
    </div>
  );
}
