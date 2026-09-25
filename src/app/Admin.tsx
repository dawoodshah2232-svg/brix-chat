// Brix Chat — PLATFORM ADMIN console (/admin).
// Two products, two logins: /admin is the operator console (platform admin,
// role 'owner'). It sees platform-level workspace controls.
// /app is the client dashboard, scoped to one workspace (dashboard worker).
// Session model: { memberId, workspaceId, isPlatformAdmin, viewingWorkspaceId? }.
// View-as: a platform admin sets viewingWorkspaceId and jumps to /app; the
// /app shell renders the "Viewing as X — Exit view-as" banner. Effective
// workspace everywhere = viewingWorkspaceId ?? workspaceId. The tabs below
// aggregate explicitly across workspaces; nothing else may leak client data
// across scopes. Local-only: all data lives in this browser's localStorage.

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore, effectiveWorkspaceId } from '../lib/store';
import { getApi, ApiError } from '../lib/api';
import { Badge, Button, Card, EmptyState, Input, Label, Modal, PasswordInput, Select, StatCard, Textarea, Toggle, useConfirm } from '../components/ui';
import { cx } from '../lib/utils';
// Phase-4 admin elevation kit (all local, no new deps).
import { ToastProvider, useToast } from '../components/admin/toast';
import { Sparkline, BarChart, Donut } from '../components/admin/charts';
import { SavedFilterBar } from '../components/admin/savedFilters';
import { useAdminShortcuts, ShortcutsHelpModal } from '../components/admin/shortcuts';
import { ImportModal, exportCSV, exportJSON } from '../components/admin/importExport';
import { AdminCommandPalette } from '../components/admin/search';
import type { SearchItem, AdminTabId } from '../components/admin/search';
import { ScheduledReportsPanel } from '../components/admin/reports';
import { BlogManager, HelpManager, ContactInbox, StatusManager } from '../components/admin/contentManagers';
import {
  listClients, saveClients, listPlans, savePlans,
  getPlatformSettings, savePlatformSettings,
  allProperties, aggregateAudit, storageUsage,
  logPlatformError, getPlatformErrors, clearPlatformErrors,
  logPlatformAudit,
  exportAllData, resetAllData, collectPlatformSearchItems,
} from '../components/admin/platform';
import type {
  ClientRecord, PlanRecord, ClientStatus, PropertyRow, ScopedAuditEntry,
} from '../components/admin/platform';
import { INTEGRATION_REGISTRY } from '../lib/integrations';

type Tab = AdminTabId;

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: '\u{1F4CA}' },
  { id: 'clients', label: 'Clients', icon: '\u{1F3E2}' },
  { id: 'properties', label: 'Properties', icon: '\u{1F310}' },
  { id: 'plans', label: 'Plans & billing', icon: '\u{1F4B3}' },
  { id: 'content', label: 'Content', icon: '\u{1F4DD}' },
  { id: 'system', label: 'System', icon: '\u2699\uFE0F' },
  { id: 'audit', label: 'Audit log', icon: '\u{1F4DC}' },
  { id: 'settings', label: 'Settings', icon: '\u{1F6E0}\uFE0F' },
];

// --- shared bits -----------------------------------------------------------------


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


// ---------------------------------------------------------------------------
// Phase-2 admin additions (Worker B): overview, content, branding, ratings,
// departments + routing, categories, member profiles.
// Data flows through the phase-2 api surface in src/lib/api.ts, reached via
// the asP2() adapter in src/lib/contentSeed.ts (tolerant of bare-array or
// paginated list shapes).
// ---------------------------------------------------------------------------


/** Accept both bare-array and paginated { items } list shapes. */

/** True when the phase-2 endpoint isn't implemented by the runtime yet. */


/** Flash-highlight a row when the command palette jumps to it. Returns the
 *  currently-flashing row id (or null). Rows opt in via id={`row-${id}`}. */
function useRowFlash(highlightId: string | undefined, nonce: number): string | null {
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    if (!highlightId) return;
    setFlash(highlightId);
    const t1 = setTimeout(() => {
      document.getElementById(`row-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    const t2 = setTimeout(() => setFlash(null), 4000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [highlightId, nonce]);
  return flash;
}


/** Stat card with a mini sparkline trend. */
function MetricCard({ label, value, icon, spark, sparkColor, sub }: {
  label: string; value: string; icon: string; spark?: number[]; sparkColor?: string; sub?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{label}</div>
          <div className="text-2xl font-black text-slate-900 mt-1 flex items-center gap-2">
            <span className="text-lg">{icon}</span>{value}
          </div>
          {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
        </div>
        {spark && spark.length > 0 && <Sparkline values={spark} color={sparkColor} className="mt-1 shrink-0" />}
      </div>
    </Card>
  );
}

/** Checkbox for bulk selection rows. */
function RowCheck({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={label}
      className="w-4 h-4 rounded accent-brix-600 shrink-0 cursor-pointer"
    />
  );
}

// ---- Category source (api.categories.*) ------------------------------------


function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function lastNDayKeys(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(dayKey(d));
  }
  return out;
}

function fmtWait(ms: number): string {
  const m = Math.floor(ms / 60000);
  if (m < 1) return '<1m';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** P4-14 — Live operations monitor. Auto-refreshes every 5s and on window
 *  focus; honest label: local mode, no server push. */


// --- platform overview -----------------------------------------------------------------

interface ConvLite {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  agent_id: string | null;
  messageCount: number;
}

interface ClientOverview {
  client: ClientRecord;
  convs: ConvLite[];
  chatsToday: number;
  chatsMonth: number;
  messagesTotal: number;
  openChats: number;
  unassigned: number;
  csat: number | null;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

async function loadClientOverview(client: ClientRecord): Promise<ClientOverview> {
  const api = getApi(client.slug, 'platform');
  let convs: ConvLite[] = [];
  let csat: number | null = null;
  try {
    const { data } = await api.conversations.list({ limit: 200 });
    const items = data?.items ?? [];
    convs = (items as unknown as Array<Record<string, unknown>>).map((c) => ({
      id: String(c.id ?? ''),
      status: String(c.status ?? ''),
      created_at: String(c.created_at ?? ''),
      updated_at: String(c.updated_at ?? c.created_at ?? ''),
      agent_id: (c.agent_id as string | null) ?? null,
      messageCount: Array.isArray(c.messages) ? (c.messages as unknown[]).length : 0,
    }));
  } catch { /* treat as empty */ }
  try {
    const { data: props } = await api.properties.list();
    const propId = props?.[0]?.id;
    if (propId) {
      const s = await api.ratings.summary(propId);
      const avg = s?.data?.csat_avg;
      csat = typeof avg === 'number' ? avg : null;
    }
  } catch { /* no ratings */ }
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const today = convs.filter((c) => sameDay(new Date(c.created_at), now)).length;
  return {
    client,
    convs,
    chatsToday: today,
    chatsMonth: convs.filter((c) => new Date(c.created_at) >= monthStart).length,
    messagesTotal: convs.reduce((n, c) => n + c.messageCount, 0),
    openChats: convs.filter((c) => c.status === 'open').length,
    unassigned: convs.filter((c) => c.status === 'open' && !c.agent_id).length,
    csat,
  };
}

const PLAN_COLORS = ['#e11d48', '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6'];

function OverviewTab({ jumpTo }: { jumpTo: (t: Tab) => void }) {
  const [rows, setRows] = useState<ClientOverview[]>([]);
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [publishedPosts, setPublishedPosts] = useState<number | null>(null);
  const [errorCount, setErrorCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  const load = async () => {
    const clients = listClients();
    setPlans(listPlans());
    setErrorCount(getPlatformErrors().length);
    const data = await Promise.all(clients.map(loadClientOverview));
    setRows(data);
    try {
      const api = getApi('demo', 'platform');
      const { data } = await api.blog.list(true);
      setPublishedPosts(data?.length ?? 0);
    } catch { setPublishedPosts(null); }
    setLoading(false);
    setLastRefresh(Date.now());
  };

  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); }, 5000);
    const onFocus = () => { void load(); };
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, []);

  const totals = useMemo(() => {
    const chatsToday = rows.reduce((n, r) => n + r.chatsToday, 0);
    const messagesTotal = rows.reduce((n, r) => n + r.messagesTotal, 0);
    const openChats = rows.reduce((n, r) => n + r.openChats, 0);
    const unassigned = rows.reduce((n, r) => n + r.unassigned, 0);
    const csats = rows.map((r) => r.csat).filter((v): v is number => v !== null);
    const now = Date.now();
    const oldestUnassigned = rows.flatMap((r) => r.convs)
      .filter((c) => c.status === 'open' && !c.agent_id)
      .reduce((m, c) => Math.max(m, now - new Date(c.updated_at).getTime()), 0);
    return {
      clients: rows.length,
      active: rows.filter((r) => r.client.status === 'active').length,
      chatsToday, messagesTotal, openChats, unassigned,
      csat: csats.length ? csats.reduce((a, b) => a + b, 0) / csats.length : null,
      oldestWait: oldestUnassigned,
    };
  }, [rows]);

  const chatsByDay = useMemo(() => {
    const keys = lastNDayKeys(7);
    const labels = ['6d ago', '5d ago', '4d ago', '3d ago', '2d ago', 'Yesterday', 'Today'];
    return keys.map((k, i) => ({
      label: labels[i],
      value: rows.reduce((n, r) => n + r.convs.filter((c) => dayKey(new Date(c.created_at)) === k).length, 0),
    }));
  }, [rows]);

  const planDonut = useMemo(() => plans.map((p, i) => ({
    label: p.name,
    value: rows.filter((r) => r.client.planId === p.id).length,
    color: PLAN_COLORS[i % PLAN_COLORS.length],
  })).filter((s) => s.value > 0), [plans, rows]);

  const storage = useMemo(() => storageUsage(), [lastRefresh]);

  const checklist = useMemo(() => {
    const items: Array<{ label: string; detail: string; cta: string; action: () => void; done?: boolean }> = [];
    items.push({
      label: 'Connect Stripe for real billing',
      detail: 'Plan catalog and assignment are live locally. Card processing needs the backend phase.',
      cta: 'Open billing', action: () => jumpTo('plans'),
    });
    const trials = rows.filter((r) => r.client.status === 'trial');
    if (trials.length > 0) {
      items.push({
        label: `${trials.length} trial client${trials.length > 1 ? 's' : ''} need${trials.length > 1 ? '' : 's'} attention`,
        detail: trials.map((r) => r.client.name).join(', '),
        cta: 'Review clients', action: () => jumpTo('clients'),
      });
    }
    const suspended = rows.filter((r) => r.client.status === 'suspended');
    if (suspended.length > 0) {
      items.push({
        label: `${suspended.length} suspended client${suspended.length > 1 ? 's' : ''}`,
        detail: suspended.map((r) => r.client.name).join(', '),
        cta: 'Review', action: () => jumpTo('clients'),
      });
    }
    if (errorCount > 0) {
      items.push({
        label: `${errorCount} client-side error${errorCount > 1 ? 's' : ''} logged`,
        detail: 'This browser only — see System for details.',
        cta: 'Open system', action: () => jumpTo('system'),
      });
    }
    if (publishedPosts === 0) {
      items.push({
        label: 'No published blog posts',
        detail: 'The marketing blog is empty.',
        cta: 'Write one', action: () => jumpTo('content'),
      });
    }
    return items;
  }, [rows, errorCount, publishedPosts, jumpTo]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Platform overview</h2>
          <p className="text-sm text-slate-500">Every client workspace, at a glance. Local mode — data refreshes as you work, no server push.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => { setLoading(true); load().catch(() => {}).finally(() => setLoading(false)); }} disabled={loading}>
          {loading ? 'Refreshing…' : '↻ Refresh now'}
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Total clients" value={String(totals.clients)} icon="🏢" tone="indigo" />
        <StatCard label="Active clients" value={String(totals.active)} icon="✅" tone="green" delta={totals.clients - totals.active > 0 ? `${totals.clients - totals.active} trial/suspended` : undefined} />
        <StatCard label="Chats today" value={String(totals.chatsToday)} icon="💬" tone="cyan" />
        <StatCard label="Messages (sampled)" value={totals.messagesTotal.toLocaleString()} icon="✉️" tone="amber" />
        <StatCard label="CSAT avg" value={totals.csat !== null ? totals.csat.toFixed(1) : '—'} icon="⭐" tone="rose" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-bold text-slate-900 mb-1">Chats per day — all clients</h3>
          <p className="text-xs text-slate-500 mb-4">Last 7 days, aggregated across workspaces.</p>
          <BarChart data={chatsByDay} height={170} />
        </Card>
        <Card className="p-5">
          <h3 className="font-bold text-slate-900 mb-1">Clients by plan</h3>
          <p className="text-xs text-slate-500 mb-4">Distribution of the client base.</p>
          {planDonut.length > 0 ? (
            <Donut segments={planDonut} centerLabel="clients" centerValue={String(totals.clients)} />
          ) : (
            <EmptyState icon="📊" title="No plan data" hint="Add plans in Plans & billing." />
          )}
        </Card>
      </div>

      {/* Live ops — platform scope */}
      <Card className="p-5 border-brix-200">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <h3 className="font-bold text-slate-900">Live operations</h3>
          </div>
          <span className="text-xs text-slate-500">auto-refreshes every 5s · updates as you work — local mode, no server push</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <MetricCard label="Open chats" value={String(totals.openChats)} icon="💬" />
          <MetricCard label="Unassigned queue" value={String(totals.unassigned)} icon="📥" />
          <MetricCard label="Longest current wait" value={totals.unassigned > 0 ? fmtWait(totals.oldestWait) : '—'} icon="⏱️" />
          <MetricCard label="Chats today" value={String(totals.chatsToday)} icon="📈" spark={chatsByDay.map((d) => d.value)} sparkColor="#e11d48" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
                <th className="py-2 pr-3 font-semibold">Client</th>
                <th className="py-2 pr-3 font-semibold">Open</th>
                <th className="py-2 pr-3 font-semibold">Unassigned</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 font-semibold">Chats today</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.client.slug} className="border-b border-slate-50 last:border-0">
                  <td className="py-2 pr-3 font-semibold text-slate-900">{r.client.name}</td>
                  <td className="py-2 pr-3">{r.openChats}</td>
                  <td className="py-2 pr-3">{r.unassigned > 0 ? <Badge tone="amber">{r.unassigned}</Badge> : '0'}</td>
                  <td className="py-2 pr-3"><Badge tone={r.client.status === 'active' ? 'green' : r.client.status === 'trial' ? 'indigo' : 'rose'}>{r.client.status}</Badge></td>
                  <td className="py-2">{r.chatsToday}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-bold text-slate-900 mb-3">Setup checklist</h3>
          {checklist.length === 0 ? (
            <p className="text-sm text-emerald-600 font-semibold">✓ All clear — nothing needs attention.</p>
          ) : (
            <ul className="space-y-3">
              {checklist.map((c, i) => (
                <li key={i} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 p-3">
                  <div>
                    <div className="text-sm font-bold text-slate-900">{c.label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{c.detail}</div>
                  </div>
                  <Button size="sm" variant="secondary" onClick={c.action}>{c.cta}</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="font-bold text-slate-900 mb-3">System health <span className="text-xs font-semibold text-slate-500">this browser</span></h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">localStorage used</dt><dd className="font-bold text-slate-900">{(storage.bytes / 1048576).toFixed(2)} MB</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Brix keys</dt><dd className="font-bold text-slate-900">{storage.keys}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Workspace DBs</dt><dd className="font-bold text-slate-900">{rows.length + 1} <span className="font-normal text-slate-500">(clients + operator)</span></dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Logged errors</dt><dd className={cx('font-bold', errorCount > 0 ? 'text-amber-600' : 'text-emerald-600')}>{errorCount}</dd></div>
          </dl>
          <p className="text-xs text-slate-500 mt-3">Health reflects this browser's local data only. Multi-device/server monitoring arrives with the backend phase.</p>
        </Card>
      </div>
    </div>
  );
}

// --- clients ---------------------------------------------------------------------

const CLIENT_STATUS_TONES: Record<ClientStatus, 'green' | 'indigo' | 'rose'> = {
  active: 'green', trial: 'indigo', suspended: 'rose',
};

function ClientsTab({ highlightId, nonce }: { highlightId?: string; nonce: number }) {
  const { setViewingWorkspace } = useStore();
  const navigate = useNavigate();
  const { toast, toastError } = useToast();
  const { confirm, dialog } = useConfirm();
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [monthChats, setMonthChats] = useState<Record<string, number>>({});
  const [openChats, setOpenChats] = useState<Record<string, number>>({});
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState('');
  const [planF, setPlanF] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saveName, setSaveName] = useState('');
  const [planModal, setPlanModal] = useState<{ slugs: string[] } | null>(null);
  const [planChoice, setPlanChoice] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const cs = listClients();
      const ps = listPlans();
      setClients(cs);
      setPlans(ps);
      setPlanChoice((prev) => prev || ps[0]?.id || '');
      const overviews = await Promise.all(cs.map(loadClientOverview));
      const mc: Record<string, number> = {};
      const oc: Record<string, number> = {};
      overviews.forEach((o) => { mc[o.client.slug] = o.chatsMonth; oc[o.client.slug] = o.openChats; });
      setMonthChats(mc);
      setOpenChats(oc);
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong.'); }
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const flash = useRowFlash(highlightId, nonce);

  const filtered = useMemo(() => clients.filter((c) => {
    if (statusF && c.status !== statusF) return false;
    if (planF && c.planId !== planF) return false;
    if (q && !`${c.name} ${c.slug}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [clients, q, statusF, planF]);

  const persist = (next: ClientRecord[]) => {
    if (!saveClients(next)) {
      toastError('Could not save — browser storage is full. Free up space and try again.');
      return false;
    }
    setClients(next);
    return true;
  };

  const setStatus = (slugs: string[], status: ClientStatus) => {
    if (!persist(clients.map((c) => (slugs.includes(c.slug) ? { ...c, status } : c)))) return;
    slugs.forEach((slug) => {
      const c = clients.find((x) => x.slug === slug);
      logPlatformAudit(status === 'suspended' ? 'client.suspended' : 'client.reactivated', 'client', slug, {
        name: c?.name ?? slug,
        slugs: slugs.length,
      });
    });
    toast(`${slugs.length} client${slugs.length > 1 ? 's' : ''} ${status === 'suspended' ? 'suspended' : 'set to ' + status}.`);
    setSelected(new Set());
  };

  const askSuspend = (slugs: string[]) => {
    confirm({
      title: slugs.length > 1 ? `Suspend ${slugs.length} clients?` : 'Suspend client?',
      body: 'Suspended clients keep their data but their team cannot sign in. You can reactivate anytime.',
      action: () => setStatus(slugs, 'suspended'),
    });
  };

  const applyPlan = () => {
    if (!planModal || !planChoice) return;
    const plan = plans.find((p) => p.id === planChoice);
    if (!persist(clients.map((c) => {
      if (!planModal.slugs.includes(c.slug)) return c;
      return { ...c, planId: planChoice, seats: plan ? plan.seats : c.seats };
    }))) return;
    planModal.slugs.forEach((slug) => {
      const c = clients.find((x) => x.slug === slug);
      logPlatformAudit('client.plan_changed', 'client', slug, { name: c?.name ?? slug, plan: plan?.name ?? planChoice });
    });
    toast(`${planModal.slugs.length} client${planModal.slugs.length > 1 ? 's' : ''} moved to ${plan?.name ?? planChoice}.`);
    setPlanModal(null);
    setSelected(new Set());
  };

  const viewAs = (c: ClientRecord) => {
    setViewingWorkspace(c.slug);
    toast(`Viewing as ${c.name}.`);
    navigate('/app');
  };

  const toggleSel = (slug: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  };

  const allSel = filtered.length > 0 && filtered.every((c) => selected.has(c.slug));

  return (
    <div className="space-y-4">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Clients</h2>
          <p className="text-sm text-slate-500">Every workspace on the platform. “View as” opens their dashboard scoped to that workspace.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>Import CSV</Button>
          <Button variant="secondary" size="sm" onClick={() => exportCSV('brix-clients.csv', ['slug', 'name', 'plan', 'seats', 'status', 'created'], clients.map((c) => ({ slug: c.slug, name: c.name, plan: c.planId, seats: c.seats, status: c.status, created: c.created_at })))}>Export CSV</Button>
        </div>
      </div>

      {error && <Notice>{error}</Notice>}

      <SavedFilterBar
        scope="platform-clients" workspace="platform"
        current={{ q, status: statusF, plan: planF }}
        onApply={(v) => { setQ(v.q ?? ''); setStatusF(v.status ?? ''); setPlanF(v.plan ?? ''); }}
        saveName={saveName} setSaveName={setSaveName}
        hint="Filter clients, then name and save the set."
      />

      <Card className="p-4">
        <div className="grid sm:grid-cols-4 gap-3">
          <div><Label>Search</Label><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or slug…" /></div>
          <div>
            <Label>Status</Label>
            <Select value={statusF} onChange={(e) => setStatusF(e.target.value)}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="suspended">Suspended</option>
            </Select>
          </div>
          <div>
            <Label>Plan</Label>
            <Select value={planF} onChange={(e) => setPlanF(e.target.value)}>
              <option value="">All plans</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="ghost" size="sm" onClick={() => { setQ(''); setStatusF(''); setPlanF(''); }}>Clear</Button>
          </div>
        </div>
      </Card>

      {selected.size > 0 && (
        <Card className="p-3 flex flex-wrap items-center gap-2 border-brix-200 bg-brix-50/50">
          <span className="text-sm font-bold text-slate-900">{selected.size} selected</span>
          <Button size="sm" variant="secondary" onClick={() => setPlanModal({ slugs: [...selected] })}>Change plan…</Button>
          <Button size="sm" variant="secondary" onClick={() => setStatus([...selected], 'active')}>Activate</Button>
          <Button size="sm" variant="danger" onClick={() => askSuspend([...selected])}>Suspend</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
                <th className="py-3 pl-4 pr-2 w-10"><input type="checkbox" checked={allSel} onChange={(e) => setSelected(e.target.checked ? new Set(filtered.map((c) => c.slug)) : new Set())} aria-label="Select all" /></th>
                <th className="py-3 pr-3 font-semibold">Client</th>
                <th className="py-3 pr-3 font-semibold">Plan</th>
                <th className="py-3 pr-3 font-semibold">Seats</th>
                <th className="py-3 pr-3 font-semibold">Status</th>
                <th className="py-3 pr-3 font-semibold">Chats this month</th>
                <th className="py-3 pr-3 font-semibold">Open now</th>
                <th className="py-3 pr-3 font-semibold">Created</th>
                <th className="py-3 pr-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="py-10 text-center text-slate-500">Loading clients…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9}><EmptyState icon="🏢" title="No clients match" hint="Adjust the filters or import clients." /></td></tr>
              ) : filtered.map((c) => {
                const plan = plans.find((p) => p.id === c.planId);
                return (
                  <tr key={c.slug} className={cx('border-b border-slate-50 last:border-0 hover:bg-slate-50/60', flash === c.slug && 'bg-brix-50')}>
                    <td className="py-3 pl-4 pr-2"><RowCheck checked={selected.has(c.slug)} onChange={() => toggleSel(c.slug)} label={`Select ${c.name}`} /></td>
                    <td className="py-3 pr-3">
                      <div className="font-bold text-slate-900">{c.name}</div>
                      <div className="text-xs text-slate-500 font-mono">{c.slug}</div>
                    </td>
                    <td className="py-3 pr-3">{plan?.name ?? c.planId}</td>
                    <td className="py-3 pr-3">{c.seats}</td>
                    <td className="py-3 pr-3"><Badge tone={CLIENT_STATUS_TONES[c.status]}>{c.status}</Badge></td>
                    <td className="py-3 pr-3">{monthChats[c.slug] ?? '—'}</td>
                    <td className="py-3 pr-3">{openChats[c.slug] ?? '—'}</td>
                    <td className="py-3 pr-3 text-slate-500">{fmtDate(c.created_at)}</td>
                    <td className="py-3 pr-4">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => viewAs(c)}>View as</Button>
                        <Button size="sm" variant="ghost" onClick={() => setPlanModal({ slugs: [c.slug] })}>Plan</Button>
                        {c.status === 'suspended' ? (
                          <Button size="sm" variant="ghost" onClick={() => setStatus([c.slug], 'active')}>Activate</Button>
                        ) : (
                          <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => askSuspend([c.slug])}>Suspend</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={planModal !== null} onClose={() => setPlanModal(null)} title={planModal && planModal.slugs.length > 1 ? `Change plan — ${planModal.slugs.length} clients` : 'Change plan'}>
        <Label>Plan</Label>
        <Select value={planChoice} onChange={(e) => setPlanChoice(e.target.value)}>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — ${p.price}/mo · {p.seats} seats</option>)}
        </Select>
        <p className="text-xs text-slate-500 mt-2">Seats update to the plan default. Billing is local-only until Stripe is connected (backend phase).</p>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={() => setPlanModal(null)}>Cancel</Button>
          <Button onClick={applyPlan}>Apply plan</Button>
        </div>
      </Modal>

      <ImportModal
        open={importOpen} onClose={() => setImportOpen(false)} title="Import clients"
        template="slug,name,planId,seats,status\nacme,Acme Store,growth,10,active\n"
        validate={(r, rowNum) => {
          const slug = (r.slug ?? '').trim().toLowerCase();
          const name = (r.name ?? '').trim();
          if (!slug || !name) return `Row ${rowNum}: slug and name are required.`;
          if (r.planId && !plans.some((p) => p.id === r.planId.trim())) return `Row ${rowNum}: unknown plan "${r.planId}".`;
          if (r.status && !['active', 'trial', 'suspended'].includes(r.status.trim())) return `Row ${rowNum}: bad status "${r.status}".`;
          if (clients.some((c) => c.slug === slug)) return `Row ${rowNum}: client "${slug}" already exists.`;
          return null;
        }}
        onImport={async (rows) => {
          const next = [...clients];
          rows.forEach((r) => {
            next.push({
              slug: r.slug.trim().toLowerCase(),
              name: r.name.trim(),
              planId: r.planId?.trim() || 'starter',
              seats: Number(r.seats) || 3,
              status: (r.status?.trim() || 'trial') as ClientStatus,
              created_at: new Date().toISOString(),
              notes: '',
            });
          });
          if (!persist(next)) return;
          logPlatformAudit('client.imported', 'client', 'csv', { count: rows.length });
          toast(`Imported ${rows.length} client${rows.length === 1 ? '' : 's'}.`);
          setImportOpen(false);
        }}
      />
    </div>
  );
}

// --- properties (all workspaces, read-only) ------------------------------------------

function PropertiesTab({ highlightId, nonce }: { highlightId?: string; nonce: number }) {
  const { setViewingWorkspace } = useStore();
  const navigate = useNavigate();
  const [rows, setRows] = useState<PropertyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      setRows(await allProperties(listClients()));
      setLoading(false);
    })();
  }, []);

  const flash = useRowFlash(highlightId, nonce);
  const filtered = rows.filter((r) =>
    !q || `${r.property.name} ${r.property.domain} ${r.workspaceName}`.toLowerCase().includes(q.toLowerCase()));

  const openDashboard = (r: PropertyRow) => {
    setViewingWorkspace(r.workspaceSlug);
    navigate('/app');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Properties</h2>
          <p className="text-sm text-slate-500">Every chat property across all client workspaces. Read-only — clients manage their own.</p>
        </div>
        <div className="w-64"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search properties…" /></div>
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
                <th className="py-3 pl-4 pr-3 font-semibold">Property</th>
                <th className="py-3 pr-3 font-semibold">Workspace</th>
                <th className="py-3 pr-3 font-semibold">Domain</th>
                <th className="py-3 pr-3 font-semibold">Public key</th>
                <th className="py-3 pr-3 font-semibold">Status</th>
                <th className="py-3 pr-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-10 text-center text-slate-500">Loading properties…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6}><EmptyState icon="🌐" title="No properties" hint="Properties appear once clients add them." /></td></tr>
              ) : filtered.map((r) => (
                <tr key={r.property.id} className={cx('border-b border-slate-50 last:border-0 hover:bg-slate-50/60', flash === r.property.id && 'bg-brix-50')}>
                  <td className="py-3 pl-4 pr-3 font-bold text-slate-900">{r.property.name}</td>
                  <td className="py-3 pr-3">{r.workspaceName} <span className="text-xs text-slate-500 font-mono">{r.workspaceSlug}</span></td>
                  <td className="py-3 pr-3 text-slate-500">{r.property.domain}</td>
                  <td className="py-3 pr-3"><Code text={r.property.public_key} /> <CopyBtn text={r.property.public_key} /></td>
                  <td className="py-3 pr-3"><Badge tone={r.property.enabled ? 'green' : 'rose'}>{r.property.enabled ? 'enabled' : 'disabled'}</Badge></td>
                  <td className="py-3 pr-4 text-right"><Button size="sm" variant="secondary" onClick={() => openDashboard(r)}>Open client dashboard</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// --- plans & billing -------------------------------------------------------------------

function PlansTab({ highlightId, nonce }: { highlightId?: string; nonce: number }) {
  const { toast, toastError } = useToast();
  const { confirm, dialog } = useConfirm();
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [editing, setEditing] = useState<(Partial<PlanRecord> & { featuresText?: string }) | null>(null);
  const [stripeOpen, setStripeOpen] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setPlans(listPlans());
    setClients(listClients());
  };
  useEffect(load, []);

  const flash = useRowFlash(highlightId, nonce);
  const persist = (next: PlanRecord[]) => {
    if (!savePlans(next)) { toastError('Could not save — browser storage is full. Free up space and try again.'); return false; }
    setPlans(next);
    return true;
  };

  const openNew = () => setEditing({ name: '', price: 49, seats: 5, featuresText: '' });
  const openEdit = (p: PlanRecord) => setEditing({ ...p, featuresText: p.features.join('\n') });

  const save = () => {
    if (!editing || !editing.name?.trim()) { setError('Plan name is required.'); return; }
    const price = Number(editing.price) || 0;
    if (price < 0) { setError('Price cannot be negative.'); return; }
    const features = (editing.featuresText ?? '').split('\n').map((f) => f.trim()).filter(Boolean);
    setError('');
    if (editing.id) {
      if (!persist(plans.map((p) => (p.id === editing.id ? { ...p, name: editing.name!.trim(), price, seats: Number(editing.seats) || 1, features } : p)))) return;
      logPlatformAudit('plan.updated', 'plan', editing.id, { name: editing.name!.trim(), price });
      toast(`Plan “${editing.name!.trim()}” updated.`);
    } else {
      const id = editing.name!.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (plans.some((p) => p.id === id)) { setError('A plan with that name already exists.'); return; }
      if (!persist([...plans, { id, name: editing.name!.trim(), price, seats: Number(editing.seats) || 1, features, created_at: new Date().toISOString() }])) return;
      logPlatformAudit('plan.created', 'plan', id, { name: editing.name!.trim(), price });
      toast(`Plan “${editing.name!.trim()}” created.`);
    }
    setEditing(null);
  };

  const remove = (p: PlanRecord) => {
    const users = clients.filter((c) => c.planId === p.id);
    if (users.length > 0) {
      toastError(`Cannot delete — ${users.length} client${users.length > 1 ? 's' : ''} on this plan. Move them first.`);
      return;
    }
    confirm({
      title: 'Delete plan?', body: `“${p.name}” will be removed from the catalog.`,
      action: () => {
        if (!persist(plans.filter((x) => x.id !== p.id))) return;
        logPlatformAudit('plan.deleted', 'plan', p.id, { name: p.name });
        toast('Plan deleted.');
      },
    });
  };

  const billable = clients.filter((c) => c.status !== 'suspended');
  const mrr = billable.reduce((n, c) => n + (plans.find((p) => p.id === c.planId)?.price ?? 0), 0);
  const planRows = plans.map((p, i) => {
    const onPlan = clients.filter((c) => c.planId === p.id);
    const paying = onPlan.filter((c) => c.status !== 'suspended');
    return { plan: p, clients: onPlan.length, mrr: paying.length * p.price, color: ['#e11d48', '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b'][i % 5] };
  });

  return (
    <div className="space-y-6">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Plans & billing</h2>
          <p className="text-sm text-slate-500">The plan catalog is real locally. Card processing needs Stripe — backend phase.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setStripeOpen(true)}>Connect Stripe</Button>
          <Button size="sm" onClick={openNew}>+ New plan</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="MRR" value={`$${mrr.toLocaleString()}`} icon="💰" tone="green" delta="local-only figure" />
        <StatCard label="Billable clients" value={String(billable.length)} icon="🏢" tone="indigo" />
        <StatCard label="Plans" value={String(plans.length)} icon="📦" tone="cyan" />
        <StatCard label="Avg per client" value={billable.length ? `$${Math.round(mrr / billable.length)}` : '—'} icon="📊" tone="amber" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-bold text-slate-900 mb-1">Revenue by plan</h3>
          <p className="text-xs text-slate-500 mb-4">Monthly recurring revenue per plan (suspended clients excluded).</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
                  <th className="py-2 pr-3 font-semibold">Plan</th>
                  <th className="py-2 pr-3 font-semibold">Clients</th>
                  <th className="py-2 font-semibold text-right">MRR</th>
                </tr>
              </thead>
              <tbody>
                {planRows.map((r) => (
                  <tr key={r.plan.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 pr-3 font-bold text-slate-900">{r.plan.name} <span className="font-normal text-slate-500">${r.plan.price}/mo</span></td>
                    <td className="py-2 pr-3">{r.clients}</td>
                    <td className="py-2 text-right font-bold">${r.mrr.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="font-bold text-slate-900 mb-1">Clients per plan</h3>
          <p className="text-xs text-slate-500 mb-4">Including trials and suspended.</p>
          {planRows.some((r) => r.clients > 0) ? (
            <Donut segments={planRows.filter((r) => r.clients > 0).map((r) => ({ label: r.plan.name, value: r.clients, color: r.color }))} centerLabel="clients" centerValue={String(clients.length)} />
          ) : (
            <EmptyState icon="📊" title="No clients yet" hint="Clients appear here once added." />
          )}
        </Card>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map((p) => (
          <Card key={p.id} className={cx('p-5', flash === p.id && 'ring-2 ring-brix-400')}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <div className="font-extrabold text-slate-900 text-lg">{p.name}</div>
                <div className="text-sm text-slate-500"><span className="text-2xl font-extrabold text-slate-900">${p.price}</span>/mo · {p.seats} seats</div>
              </div>
            </div>
            <ul className="text-sm text-slate-600 space-y-1 mb-4">
              {p.features.map((f, i) => <li key={i} className="flex gap-2"><span className="text-emerald-500">✓</span>{f}</li>)}
            </ul>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => openEdit(p)}>Edit</Button>
              <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => remove(p)}>Delete</Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={editing !== null} onClose={() => { setEditing(null); setError(''); }} title={editing?.id ? 'Edit plan' : 'New plan'}>
        {editing && (
          <div className="space-y-4">
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <div><Label>Name</Label><Input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Price (USD/mo)</Label><Input type="number" min={0} value={editing.price ?? 0} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} /></div>
              <div><Label>Seats</Label><Input type="number" min={1} value={editing.seats ?? 1} onChange={(e) => setEditing({ ...editing, seats: Number(e.target.value) })} /></div>
            </div>
            <div><Label>Features (one per line)</Label><Textarea value={editing.featuresText ?? ''} onChange={(e) => setEditing({ ...editing, featuresText: e.target.value })} rows={5} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setEditing(null); setError(''); }}>Cancel</Button>
              <Button onClick={save}>Save plan</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={stripeOpen} onClose={() => setStripeOpen(false)} title="Connect Stripe">
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Card processing is not available in local mode. The plan catalog above, per-client
            assignment, and the MRR figures are fully functional locally — but no money moves
            until the backend phase wires up Stripe.
          </p>
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 font-semibold">
            BACKEND-PHASE — payments are stubbed, not connected.
          </div>
          <p className="text-xs text-slate-500">When the backend lands, this dialog becomes the Stripe OAuth connect flow (publishable key + webhook signing).</p>
          <div className="flex justify-end"><Button variant="secondary" onClick={() => setStripeOpen(false)}>Got it</Button></div>
        </div>
      </Modal>
    </div>
  );
}

// --- content (marketing site) ------------------------------------------------------------

function ContentTab() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900">Content</h2>
        <p className="text-sm text-slate-500">The Brix marketing site — blog, help center, contact inbox, status page.</p>
      </div>
      <BlogManager readOnly={false} />
      <HelpManager readOnly={false} />
      <ContactInbox readOnly={false} />
      <StatusManager readOnly={false} />
    </div>
  );
}

// --- system ----------------------------------------------------------------------

const PROVIDER_KEYS_LS = 'brix.platform.v1.provider_keys';

function providerKeys(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(PROVIDER_KEYS_LS) ?? '{}'); } catch { return {}; }
}

function SystemTab() {
  const { toast, toastError } = useToast();
  const { confirm, dialog } = useConfirm();
  const [errors, setErrors] = useState(getPlatformErrors());
  const [keys, setKeys] = useState<Record<string, string>>(providerKeys());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const storage = useMemo(() => storageUsage(), [errors]);

  const doExport = () => {
    exportJSON(`brix-platform-export-${new Date().toISOString().slice(0, 10)}.json`, exportAllData());
    toast('Platform export downloaded.');
  };

  const doReset = () => {
    confirm({
      title: 'Reset all workspace data?',
      body: 'Every workspace DB, the client registry, plans, settings and the error log in THIS browser will be wiped and rebuilt on reload. This cannot be undone.',
      action: () => { resetAllData(); window.location.reload(); },
    });
  };

  const saveKey = (id: string, explicit?: string) => {
    const v = (explicit ?? drafts[id] ?? '').trim();
    const next = { ...keys };
    if (v) next[id] = v; else delete next[id];
    try {
      localStorage.setItem(PROVIDER_KEYS_LS, JSON.stringify(next));
    } catch {
      toastError('Could not save — browser storage is full. Free up space and try again.');
      return;
    }
    setKeys(next);
    setDrafts((d) => ({ ...d, [id]: '' }));
    toast(v ? 'Provider key saved locally.' : 'Provider key removed.');
  };

  const masked = (v: string) => (v.length <= 8 ? '••••' : `${v.slice(0, 4)}••••${v.slice(-4)}`);

  return (
    <div className="space-y-6">
      {dialog}
      <div>
        <h2 className="text-xl font-extrabold text-slate-900">System</h2>
        <p className="text-sm text-slate-500">Data management, platform provider keys, error log, scheduled reports.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-bold text-slate-900 mb-1">Data management</h3>
          <p className="text-xs text-slate-500 mb-4">Everything lives in this browser's localStorage.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={doExport}>Export all (JSON)</Button>
            <Button variant="danger" size="sm" onClick={doReset}>Reset workspace data…</Button>
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">localStorage used</dt><dd className="font-bold">{(storage.bytes / 1048576).toFixed(2)} MB</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Brix keys</dt><dd className="font-bold">{storage.keys}</dd></div>
          </dl>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-slate-900">Error log</h3>
            {errors.length > 0 && <Button variant="ghost" size="sm" onClick={() => { clearPlatformErrors(); setErrors([]); toast('Error log cleared.'); }}>Clear</Button>}
          </div>
          <p className="text-xs text-slate-500 mb-3">Client-side errors captured in this browser. Server-side logging arrives with the backend phase.</p>
          {errors.length === 0 ? (
            <p className="text-sm text-emerald-600 font-semibold">✓ No errors logged.</p>
          ) : (
            <ul className="space-y-2 max-h-56 overflow-auto">
              {errors.map((e) => (
                <li key={e.id} className="text-xs rounded-lg bg-slate-50 border border-slate-100 p-2">
                  <div className="font-mono text-slate-700 break-words">{e.message}</div>
                  <div className="text-slate-500 mt-1">{e.source} · {fmtDate(e.at)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="font-bold text-slate-900 mb-1">Integrations registry</h3>
        <p className="text-xs text-slate-500 mb-4">Platform-level provider keys. Stored locally in this browser — a real vault arrives with the backend phase.</p>
        <div className="space-y-3">
          {INTEGRATION_REGISTRY.map((def) => {
            const saved = keys[def.id];
            return (
              <div key={def.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{def.name}</span>
                    {saved ? <Badge tone="green">configured</Badge> : <Badge tone="slate">not set</Badge>}
                  </div>
                  {saved && <div className="text-xs font-mono text-slate-500 mt-0.5">{masked(saved)}</div>}
                </div>
                <PasswordInput className="w-56" placeholder={saved ? 'Replace key…' : 'Paste key…'} value={drafts[def.id] ?? ''} onChange={(e) => setDrafts((d) => ({ ...d, [def.id]: e.target.value }))} />
                <Button size="sm" variant="secondary" onClick={() => saveKey(def.id)} disabled={!(drafts[def.id] ?? '').trim() && !saved}>
                  {saved ? 'Update' : 'Save'}
                </Button>
                {saved && <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => saveKey(def.id, '')}>Remove</Button>}
              </div>
            );
          })}
        </div>
      </Card>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="font-bold text-slate-900">Scheduled reports</h3>
          <Badge tone="amber">BACKEND-PHASE</Badge>
        </div>
        <p className="text-xs text-slate-500 mb-3">Schedules and run history work locally. Actual email delivery needs the backend mailer.</p>
        <ScheduledReportsPanel workspace="platform" />
      </div>
    </div>
  );
}

// --- audit (platform-wide) -----------------------------------------------------------------

function AuditTab() {
  const [entries, setEntries] = useState<ScopedAuditEntry[]>([]);
  const [q, setQ] = useState('');
  const [wsF, setWsF] = useState('');
  const [actionF, setActionF] = useState('');
  const [saveName, setSaveName] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setEntries(await aggregateAudit(listClients()));
      } catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong.'); }
      setLoading(false);
    })();
  }, []);

  const workspaces = useMemo(() => {
    const m = new Map<string, string>();
    entries.forEach((e) => m.set(e.workspaceSlug, e.workspaceName));
    return [...m.entries()];
  }, [entries]);

  const actions = useMemo(() => [...new Set(entries.map((e) => e.action))].sort(), [entries]);

  const filtered = useMemo(() => entries.filter((e) => {
    if (wsF && e.workspaceSlug !== wsF) return false;
    if (actionF && e.action !== actionF) return false;
    if (q) {
      const hay = `${e.actor} ${e.action} ${e.entity} ${e.entity_id}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [entries, q, wsF, actionF]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900">Audit log</h2>
        <p className="text-sm text-slate-500">Every workspace's audit trail, merged. Newest first.</p>
      </div>
      {error && <Notice>{error}</Notice>}

      <SavedFilterBar
        scope="platform-audit" workspace="platform"
        current={{ q, ws: wsF, action: actionF }}
        onApply={(v) => { setQ(v.q ?? ''); setWsF(v.ws ?? ''); setActionF(v.action ?? ''); }}
        saveName={saveName} setSaveName={setSaveName}
        hint="Filter the audit log, then name and save the set."
      />

      <Card className="p-4">
        <div className="grid sm:grid-cols-4 gap-3">
          <div><Label>Search</Label><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Actor, action, entity…" /></div>
          <div>
            <Label>Workspace</Label>
            <Select value={wsF} onChange={(e) => setWsF(e.target.value)}>
              <option value="">All workspaces</option>
              {workspaces.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Action</Label>
            <Select value={actionF} onChange={(e) => setActionF(e.target.value)}>
              <option value="">All actions</option>
              {actions.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="ghost" size="sm" onClick={() => { setQ(''); setWsF(''); setActionF(''); }}>Clear</Button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
                <th className="py-3 pl-4 pr-3 font-semibold">When</th>
                <th className="py-3 pr-3 font-semibold">Workspace</th>
                <th className="py-3 pr-3 font-semibold">Actor</th>
                <th className="py-3 pr-3 font-semibold">Action</th>
                <th className="py-3 pr-3 font-semibold">Entity</th>
                <th className="py-3 pr-4 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-10 text-center text-slate-500">Loading audit log…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6}><EmptyState icon="📜" title="No entries" hint="Actions across workspaces will appear here." /></td></tr>
              ) : filtered.slice(0, 200).map((e) => (
                <Fragment key={e.id}>
                  <tr className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 cursor-pointer" onClick={() => setExpanded((x) => (x === e.id ? null : e.id))}>
                    <td className="py-2.5 pl-4 pr-3 text-slate-500 whitespace-nowrap">{fmtDate(e.created_at)}</td>
                    <td className="py-2.5 pr-3"><Badge tone="indigo">{e.workspaceName}</Badge></td>
                    <td className="py-2.5 pr-3 font-semibold text-slate-900">{e.actor}</td>
                    <td className="py-2.5 pr-3 font-mono text-xs">{e.action}</td>
                    <td className="py-2.5 pr-3 text-slate-500">{e.entity}{e.entity_id ? ` · ${e.entity_id.slice(0, 12)}` : ''}</td>
                    <td className="py-2.5 pr-4 text-right text-slate-500">{expanded === e.id ? '▾' : '▸'}</td>
                  </tr>
                  {expanded === e.id && (
                    <tr className="bg-slate-50/70">
                      <td colSpan={6} className="py-3 px-4"><Code text={JSON.stringify(e.meta ?? {}, null, 2)} maxH="200px" /></td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 200 && <p className="text-xs text-slate-500 p-3">Showing 200 of {filtered.length} — refine the filters.</p>}
      </Card>
    </div>
  );
}

// --- settings (platform) -------------------------------------------------------------------

function SettingsTab() {
  const { toast, toastError } = useToast();
  const [draft, setDraft] = useState(getPlatformSettings());
  const [error, setError] = useState('');

  const save = () => {
    if (!draft.platform_name.trim()) { setError('Platform name is required.'); return; }
    if (draft.session_timeout_mins < 5 || draft.session_timeout_mins > 1440) { setError('Session timeout must be 5–1440 minutes.'); return; }
    if (draft.passcode_min_length < 4 || draft.passcode_min_length > 12) { setError('Passcode length must be 4–12.'); return; }
    setError('');
    if (!savePlatformSettings({ ...draft, platform_name: draft.platform_name.trim() })) {
      setError('Could not save — browser storage is full. Try a smaller logo or free up space.');
      toastError('Settings not saved — storage is full.');
      return;
    }
    toast('Platform settings saved.');
  };

  const onLogo = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 512 * 1024) { setError('Logo must be under 512 KB.'); return; }
    const r = new FileReader();
    r.onload = () => setDraft((d) => ({ ...d, logo_data_url: String(r.result) }));
    r.readAsDataURL(f);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900">Settings</h2>
        <p className="text-sm text-slate-500">Platform-level settings. Client workspace settings live in each client's dashboard.</p>
      </div>
      {error && <Notice>{error}</Notice>}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5 space-y-4">
          <h3 className="font-bold text-slate-900">Platform</h3>
          <div><Label>Platform name</Label><Input value={draft.platform_name} onChange={(e) => setDraft({ ...draft, platform_name: e.target.value })} /></div>
          <div>
            <Label>Logo</Label>
            <div className="flex items-center gap-3">
              {draft.logo_data_url && <img src={draft.logo_data_url} alt="logo" className="w-10 h-10 rounded-xl object-contain bg-slate-100" />}
              <input type="file" accept="image/*" onChange={(e) => onLogo(e.target.files?.[0])} className="text-sm" />
              {draft.logo_data_url && <Button variant="ghost" size="sm" onClick={() => setDraft({ ...draft, logo_data_url: null })}>Remove</Button>}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div><div className="text-sm font-bold text-slate-900">Allow new signups</div><div className="text-xs text-slate-500">New workspaces can self-register.</div></div>
            <Toggle checked={draft.allow_signup} onChange={(v) => setDraft({ ...draft, allow_signup: v })} label="" />
          </div>
          <div className="flex justify-end"><Button onClick={save}>Save settings</Button></div>
        </Card>
        <div className="space-y-4">
          <Card className="p-5 space-y-4">
            <h3 className="font-bold text-slate-900">Security</h3>
            <div><Label>Session timeout (minutes)</Label><Input type="number" min={5} max={1440} value={draft.session_timeout_mins} onChange={(e) => setDraft({ ...draft, session_timeout_mins: Number(e.target.value) })} /></div>
            <div><Label>Minimum passcode length</Label><Input type="number" min={4} max={12} value={draft.passcode_min_length} onChange={(e) => setDraft({ ...draft, passcode_min_length: Number(e.target.value) })} /></div>
            <p className="text-xs text-slate-500">Applies to newly set passcodes. Existing sessions are unaffected until re-login.</p>
            <div className="flex justify-end"><Button onClick={save}>Save settings</Button></div>
          </Card>
          <Card className="p-5">
            <h3 className="font-bold text-slate-900 mb-3">Live preview</h3>
            <div className="rounded-2xl bg-ink-950 text-white p-4 flex items-center gap-3">
              {draft.logo_data_url
                ? <img src={draft.logo_data_url} alt="" className="w-8 h-8 rounded-lg object-contain bg-white/10" />
                : <div className="w-8 h-8 rounded-lg bg-brix-600 grid place-items-center font-extrabold">B</div>}
              <div>
                <div className="font-extrabold text-sm">{draft.platform_name || 'Brix Chat'}</div>
                <div className="text-[11px] text-white/50 uppercase tracking-widest">Platform console</div>
              </div>
              <span className="ml-auto text-[10px] font-bold uppercase tracking-widest bg-brix-600 rounded-full px-2 py-0.5">Platform</span>
            </div>
            <p className="text-xs text-slate-500 mt-2">Preview updates as you edit — save to apply.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

// --- admin shell -------------------------------------------------------------------

function AdminInner() {
  const { session, logout, setViewingWorkspace } = useStore();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [highlightId, setHighlightId] = useState<string | undefined>(undefined);
  const [nonce, setNonce] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [items, setItems] = useState<SearchItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [platformName, setPlatformName] = useState(getPlatformSettings().platform_name);

  // Client-side error capture (this browser only).
  useEffect(() => {
    const onErr = (e: ErrorEvent) => logPlatformError(e.message || 'Unknown error', 'window.onerror');
    const onRej = (e: PromiseRejectionEvent) => logPlatformError(String(e.reason?.message ?? e.reason ?? 'Unhandled rejection'), 'unhandledrejection');
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    return () => { window.removeEventListener('error', onErr); window.removeEventListener('unhandledrejection', onRej); };
  }, []);

  useEffect(() => { setPlatformName(getPlatformSettings().platform_name); }, [tab]);

  const jumpTo = (t: Tab, id?: string) => {
    setTab(t);
    setHighlightId(id);
    setNonce((n) => n + 1);
    window.scrollTo({ top: 0 });
  };

  const openPalette = () => {
    setPaletteOpen(true);
    setItemsLoading(true);
    collectPlatformSearchItems()
      .then((list) => setItems(list))
      .catch(() => setItems([]))
      .finally(() => setItemsLoading(false));
  };

  useAdminShortcuts({
    onGo: (t) => jumpTo(t as Tab),
    onSearch: openPalette,
    onHelp: () => setHelpOpen(true),
    enabled: true,
  });

  if (!session || !session.isPlatformAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 grid place-items-center p-6">
        <Card className="p-8 max-w-md text-center">
          <div className="text-4xl mb-3">🛡️</div>
          <h1 className="text-lg font-extrabold text-slate-900 mb-2">Platform admin only</h1>
          <p className="text-sm text-slate-500 mb-5">
            The operator console needs a platform-admin session to continue.
          </p>
          <div className="flex justify-center gap-2">
            <Button variant="secondary" onClick={() => navigate('/login')}>Go to login</Button>
            {session && <Button variant="ghost" onClick={logout}>Sign out</Button>}
          </div>
        </Card>
      </div>
    );
  }

  const viewingSlug = session.viewingWorkspaceId;
  const viewingName = viewingSlug ? (listClients().find((c) => c.slug === viewingSlug)?.name ?? viewingSlug) : null;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* operator sidebar */}
      <aside className="w-60 shrink-0 bg-ink-950 text-white flex flex-col min-h-screen sticky top-0 h-screen">
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brix-600 grid place-items-center font-extrabold text-lg">B</div>
            <div>
              <div className="font-extrabold text-sm leading-tight">{platformName}</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">Operator console</div>
            </div>
          </div>
          <span className="mt-3 inline-block text-[10px] font-bold uppercase tracking-widest bg-brix-600 rounded-full px-2.5 py-1">Platform</span>
        </div>
        <nav className="flex-1 overflow-auto p-3 space-y-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => jumpTo(t.id)}
              className={cx(
                'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition',
                tab === t.id ? 'bg-brix-600 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white',
              )}
            >
              <span className="text-base w-5 text-center">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10 space-y-1">
          <button onClick={openPalette} className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-xs text-white/50 hover:text-white hover:bg-white/5">
            <span>⌘K</span> Search…
          </button>
          <button onClick={() => setHelpOpen(true)} className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-xs text-white/50 hover:text-white hover:bg-white/5">
            <span>?</span> Shortcuts
          </button>
          <button onClick={logout} className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-xs text-white/50 hover:text-white hover:bg-white/5">
            <span>⎋</span> Sign out ({session.displayName})
          </button>
        </div>
      </aside>

      {/* main */}
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200">
          <div className="px-6 py-3 flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest bg-ink-950 text-white rounded-full px-2.5 py-1">Platform</span>
            <span className="text-sm font-bold text-slate-900">{TABS.find((t) => t.id === tab)?.label}</span>
            {viewingName && (
              <span className="ml-2 inline-flex items-center gap-2 text-xs font-bold bg-amber-100 text-amber-800 rounded-full pl-3 pr-1.5 py-1">
                Viewing as {viewingName}
                <button
                  onClick={() => setViewingWorkspace(null)}
                  className="bg-white/70 hover:bg-white rounded-full px-2 py-0.5 font-bold"
                  title="Exit view-as"
                >
                  Exit ✕
                </button>
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-slate-500 hidden sm:block">effective workspace: <span className="font-mono font-bold text-slate-600">{effectiveWorkspaceId(session)}</span></span>
              <Button variant="secondary" size="sm" onClick={openPalette}>⌘K Search</Button>
            </div>
          </div>
        </header>

        <main className="p-6 max-w-7xl mx-auto">
          {tab === 'overview' && <OverviewTab jumpTo={jumpTo} />}
          {tab === 'clients' && <ClientsTab highlightId={highlightId} nonce={nonce} />}
          {tab === 'properties' && <PropertiesTab highlightId={highlightId} nonce={nonce} />}
          {tab === 'plans' && <PlansTab highlightId={highlightId} nonce={nonce} />}
          {tab === 'content' && <ContentTab />}
          {tab === 'system' && <SystemTab />}
          {tab === 'audit' && <AuditTab />}
          {tab === 'settings' && <SettingsTab />}
        </main>
      </div>

      <AdminCommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={items}
        loading={itemsLoading}
        onJump={(t, id) => { setPaletteOpen(false); jumpTo(t, id); }}
      />
      <ShortcutsHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

export default function Admin() {
  return (
    <ToastProvider>
      <AdminInner />
    </ToastProvider>
  );
}
