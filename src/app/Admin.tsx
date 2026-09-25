// Brix Chat — PLATFORM ADMIN console (/admin).
//
// The operator console for the whole platform. It has its own login and
// session (src/auth/AdminAuth.tsx) and reads everything from /api/admin/*
// (src/lib/admin-api.ts) — never from a workspace token or localStorage.
// View-as asks the server for a short-lived workspace token and opens the
// client dashboard (/workspace) with it; the admin session stays signed in.

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { ApiError } from '../lib/api';
import { adminApi } from '../lib/admin-api';
import type { AdminWorkspace, AdminProperty, AdminAuditEntry, ClientStatus, Overview, Plan, PlatformSettings, SystemInfo } from '../lib/admin-api';
import { useAdminAuth } from '../auth/AdminAuth';
import { Badge, Button, Card, EmptyState, Input, Label, Modal, PasswordInput, Select, StatCard, Textarea, Toggle, useConfirm } from '../components/ui';
import { cx } from '../lib/utils';
import { ToastProvider, useToast } from '../components/admin/toast';
import { Sparkline, BarChart, Donut } from '../components/admin/charts';
import { SavedFilterBar } from '../components/admin/savedFilters';
import { useAdminShortcuts, ShortcutsHelpModal } from '../components/admin/shortcuts';
import { exportCSV } from '../components/admin/importExport';
import { AdminCommandPalette } from '../components/admin/search';
import type { SearchItem, AdminTabId } from '../components/admin/search';
import { BlogManager, HelpManager, ContactInbox, StatusManager } from '../components/admin/contentManagers';
import { collectPlatformSearchItems } from '../components/admin/platform';

type Tab = AdminTabId;

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: '\u{1F4CA}' },
  { id: 'clients', label: 'Clients', icon: '\u{1F3E2}' },
  { id: 'properties', label: 'Properties', icon: '\u{1F310}' },
  { id: 'plans', label: 'Plans & billing', icon: '\u{1F4B3}' },
  { id: 'content', label: 'Content', icon: '\u{1F4DD}' },
  { id: 'system', label: 'System', icon: '⚙️' },
  { id: 'audit', label: 'Audit log', icon: '\u{1F4DC}' },
  { id: 'settings', label: 'Settings', icon: '\u{1F6E0}️' },
];

const STATUS_TONES: Record<ClientStatus, 'green' | 'indigo' | 'rose'> = { active: 'green', trial: 'indigo', suspended: 'rose' };
const PLAN_COLORS = ['#e11d48', '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6'];

// --- shared bits -----------------------------------------------------------------

const errMsg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Something went wrong.');

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function fmtWait(since: string | null): string {
  if (!since) return '—';
  const m = Math.floor((Date.now() - new Date(`${since.replace(' ', 'T')}Z`).getTime()) / 60000);
  if (m < 1) return '<1m';
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function CopyBtn({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); } catch { /* clipboard blocked */ }
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
    <div className="mb-5 flex gap-3 items-start rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5">
      <span className="text-lg">⚠️</span>
      <p className="text-[13px] leading-relaxed text-rose-900">{children}</p>
    </div>
  );
}

/** Flash-highlight a row when the command palette jumps to it. Rows opt in via id={`row-${id}`}. */
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

function MetricCard({ label, value, icon, spark, sparkColor }: {
  label: string; value: string; icon: string; spark?: number[]; sparkColor?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{label}</div>
          <div className="text-2xl font-black text-slate-900 mt-1 flex items-center gap-2">
            <span className="text-lg">{icon}</span>{value}
          </div>
        </div>
        {spark && spark.length > 0 && <Sparkline values={spark} color={sparkColor} className="mt-1 shrink-0" />}
      </div>
    </Card>
  );
}

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

/** Open a client workspace as its owner (short-lived server-issued token). */
function useViewAs() {
  const { startViewAs } = useStore();
  const navigate = useNavigate();
  const { toast, toastError } = useToast();
  return async (workspaceId: string, name: string) => {
    try {
      startViewAs(await adminApi.viewAs(workspaceId));
      toast(`Viewing as ${name}.`);
      navigate('/workspace/dashboard');
    } catch (e) {
      toastError(errMsg(e));
    }
  };
}

// --- overview --------------------------------------------------------------------

function OverviewTab({ jumpTo }: { jumpTo: (t: Tab) => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setData(await adminApi.overview());
      setError('');
    } catch (e) { setError(errMsg(e)); }
    setLoading(false);
  };

  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); }, 15000);
    return () => clearInterval(t);
  }, []);

  const chatsByDay = useMemo(() => (data?.chats_per_day ?? []).map((d, i, all) => ({
    label: i === all.length - 1 ? 'Today' : i === all.length - 2 ? 'Yesterday' : new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' }),
    value: d.count,
  })), [data]);

  const planDonut = useMemo(() => (data?.plans ?? [])
    .map((p, i) => ({ label: p.name, value: p.clients, color: PLAN_COLORS[i % PLAN_COLORS.length] }))
    .filter((s) => s.value > 0), [data]);

  const t = data?.totals;
  const checklist: Array<{ label: string; detail: string; cta: string; action: () => void }> = [];
  if (t && t.trial > 0) {
    checklist.push({
      label: `${t.trial} trial client${t.trial > 1 ? 's' : ''} need${t.trial > 1 ? '' : 's'} attention`,
      detail: data!.clients.filter((c) => c.status === 'trial').map((c) => c.name).join(', '),
      cta: 'Review clients', action: () => jumpTo('clients'),
    });
  }
  if (t && t.suspended > 0) {
    checklist.push({
      label: `${t.suspended} suspended client${t.suspended > 1 ? 's' : ''}`,
      detail: data!.clients.filter((c) => c.status === 'suspended').map((c) => c.name).join(', '),
      cta: 'Review', action: () => jumpTo('clients'),
    });
  }
  if (t && t.unassigned > 0) {
    checklist.push({
      label: `${t.unassigned} chat${t.unassigned > 1 ? 's' : ''} waiting with no agent`,
      detail: `Longest wait: ${fmtWait(t.oldest_unassigned_at)}`,
      cta: 'See clients', action: () => jumpTo('clients'),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Platform overview</h2>
          <p className="text-sm text-slate-500">Every client workspace at a glance. Refreshes every 15 seconds.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => { setLoading(true); void load(); }} disabled={loading}>
          {loading ? 'Refreshing…' : '↻ Refresh now'}
        </Button>
      </div>

      {error && <Notice>{error}</Notice>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Total clients" value={String(t?.clients ?? '—')} icon="🏢" tone="indigo" />
        <StatCard label="Active clients" value={String(t?.active ?? '—')} icon="✅" tone="green" delta={t && t.clients - t.active > 0 ? `${t.clients - t.active} trial/suspended` : undefined} />
        <StatCard label="Chats today" value={String(t?.chats_today ?? '—')} icon="💬" tone="cyan" />
        <StatCard label="MRR" value={t ? `$${t.mrr.toLocaleString()}` : '—'} icon="💰" tone="amber" />
        <StatCard label="CSAT avg" value={t?.csat != null ? t.csat.toFixed(1) : '—'} icon="⭐" tone="rose" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-bold text-slate-900 mb-1">Chats per day — all clients</h3>
          <p className="text-xs text-slate-500 mb-4">Last 7 days.</p>
          <BarChart data={chatsByDay} height={170} />
        </Card>
        <Card className="p-5">
          <h3 className="font-bold text-slate-900 mb-1">Clients by plan</h3>
          <p className="text-xs text-slate-500 mb-4">Distribution of the client base.</p>
          {planDonut.length > 0
            ? <Donut segments={planDonut} centerLabel="clients" centerValue={String(t?.clients ?? 0)} />
            : <EmptyState icon="📊" title="No plan data" hint="Assign plans in Clients." />}
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <h3 className="font-bold text-slate-900">Live operations</h3>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <MetricCard label="Open chats" value={String(t?.open_chats ?? '—')} icon="💬" />
          <MetricCard label="Unassigned queue" value={String(t?.unassigned ?? '—')} icon="📥" />
          <MetricCard label="Longest current wait" value={fmtWait(t?.oldest_unassigned_at ?? null)} icon="⏱️" />
          <MetricCard label="Chats today" value={String(t?.chats_today ?? '—')} icon="📈" spark={chatsByDay.map((d) => d.value)} sparkColor="#e11d48" />
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
              {(data?.clients ?? []).map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3 font-semibold text-slate-900">{c.name}</td>
                  <td className="py-2 pr-3">{c.stats.open_chats}</td>
                  <td className="py-2 pr-3">{c.stats.unassigned > 0 ? <Badge tone="amber">{c.stats.unassigned}</Badge> : '0'}</td>
                  <td className="py-2 pr-3"><Badge tone={STATUS_TONES[c.status]}>{c.status}</Badge></td>
                  <td className="py-2">{c.stats.chats_today}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-bold text-slate-900 mb-3">Needs attention</h3>
        {checklist.length === 0 ? (
          <p className="text-sm text-emerald-600 font-semibold">✓ All clear — nothing needs attention.</p>
        ) : (
          <ul className="space-y-3">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 p-3">
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
    </div>
  );
}

// --- clients ---------------------------------------------------------------------

const emptyClient = { name: '', plan_id: '', status: 'trial' as ClientStatus, owner_name: '', owner_email: '', owner_passcode: '' };

function ClientsTab({ highlightId, nonce }: { highlightId?: string; nonce: number }) {
  const { toast, toastError } = useToast();
  const { confirm, dialog } = useConfirm();
  const viewAs = useViewAs();
  const [clients, setClients] = useState<AdminWorkspace[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState('');
  const [planF, setPlanF] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saveName, setSaveName] = useState('');
  const [planModal, setPlanModal] = useState<{ ids: string[] } | null>(null);
  const [planChoice, setPlanChoice] = useState('');
  const [creating, setCreating] = useState<typeof emptyClient | null>(null);
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [cs, ps] = await Promise.all([adminApi.workspaces(), adminApi.plans()]);
      setClients(cs);
      setPlans(ps);
      setPlanChoice((prev) => prev || ps[0]?.id || '');
      setError('');
    } catch (e) { setError(errMsg(e)); }
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const flash = useRowFlash(highlightId, nonce);

  const filtered = useMemo(() => clients.filter((c) => {
    if (statusF && c.status !== statusF) return false;
    if (planF && c.plan_id !== planF) return false;
    if (q && !`${c.name} ${c.slug}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [clients, q, statusF, planF]);

  /** Apply the same patch to several clients; reload once at the end. */
  const patchMany = async (ids: string[], patch: Parameters<typeof adminApi.updateWorkspace>[1], done: string) => {
    const results = await Promise.allSettled(ids.map((id) => adminApi.updateWorkspace(id, patch)));
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    if (failed.length) toastError(errMsg(failed[0].reason));
    else toast(done);
    setSelected(new Set());
    await load();
  };

  const setStatus = (ids: string[], status: ClientStatus) =>
    patchMany(ids, { status }, `${ids.length} client${ids.length > 1 ? 's' : ''} ${status === 'suspended' ? 'suspended' : `set to ${status}`}.`);

  const askSuspend = (ids: string[]) => confirm({
    title: ids.length > 1 ? `Suspend ${ids.length} clients?` : 'Suspend client?',
    body: 'Suspended clients keep their data, but their team is signed out and cannot sign in. You can reactivate anytime.',
    action: () => { void setStatus(ids, 'suspended'); },
  });

  const applyPlan = async () => {
    if (!planModal || !planChoice) return;
    const plan = plans.find((p) => p.id === planChoice);
    await patchMany(planModal.ids, { plan_id: planChoice, ...(plan ? { seats: plan.seats } : {}) }, `Moved to ${plan?.name ?? planChoice}.`);
    setPlanModal(null);
  };

  const create = async () => {
    if (!creating) return;
    setFormError('');
    try {
      const plan = plans.find((p) => p.id === creating.plan_id);
      await adminApi.createWorkspace({ ...creating, plan_id: creating.plan_id || undefined, seats: plan?.seats });
      toast(`Client “${creating.name}” created.`);
      setCreating(null);
      await load();
    } catch (e) { setFormError(errMsg(e)); }
  };

  const toggleSel = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allSel = filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  return (
    <div className="space-y-4">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Clients</h2>
          <p className="text-sm text-slate-500">Every workspace on the platform. “View as” opens their dashboard as the workspace owner.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => exportCSV('brix-clients.csv', ['slug', 'name', 'plan', 'seats', 'status', 'created'], clients.map((c) => ({ slug: c.slug, name: c.name, plan: c.plan_id ?? '', seats: c.seats, status: c.status, created: c.created_at ?? '' })))}>Export CSV</Button>
          <Button size="sm" onClick={() => { setFormError(''); setCreating({ ...emptyClient, plan_id: plans[0]?.id ?? '' }); }}>+ New client</Button>
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
        <Card className="p-3 flex flex-wrap items-center gap-2 border-brix-200">
          <span className="text-sm font-bold text-slate-900">{selected.size} selected</span>
          <Button size="sm" variant="secondary" onClick={() => setPlanModal({ ids: [...selected] })}>Change plan…</Button>
          <Button size="sm" variant="secondary" onClick={() => { void setStatus([...selected], 'active'); }}>Activate</Button>
          <Button size="sm" variant="danger" onClick={() => askSuspend([...selected])}>Suspend</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
                <th className="py-3 pl-4 pr-2 w-10"><RowCheck checked={allSel} onChange={(v) => setSelected(v ? new Set(filtered.map((c) => c.id)) : new Set())} label="Select all" /></th>
                <th className="py-3 pr-3 font-semibold">Client</th>
                <th className="py-3 pr-3 font-semibold">Plan</th>
                <th className="py-3 pr-3 font-semibold">Seats</th>
                <th className="py-3 pr-3 font-semibold">Status</th>
                <th className="py-3 pr-3 font-semibold">Members</th>
                <th className="py-3 pr-3 font-semibold">Chats this month</th>
                <th className="py-3 pr-3 font-semibold">Open now</th>
                <th className="py-3 pr-3 font-semibold">Created</th>
                <th className="py-3 pr-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="py-10 text-center text-slate-500">Loading clients…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10}><EmptyState icon="🏢" title="No clients match" hint="Adjust the filters or add a client." /></td></tr>
              ) : filtered.map((c) => {
                const plan = plans.find((p) => p.id === c.plan_id);
                return (
                  <tr key={c.id} id={`row-${c.id}`} className={cx('border-b border-slate-100 last:border-0 hover:bg-slate-50', flash === c.id && 'bg-brix-50')}>
                    <td className="py-3 pl-4 pr-2"><RowCheck checked={selected.has(c.id)} onChange={() => toggleSel(c.id)} label={`Select ${c.name}`} /></td>
                    <td className="py-3 pr-3">
                      <div className="font-bold text-slate-900">{c.name}</div>
                      <div className="text-xs text-slate-500 font-mono">{c.slug}</div>
                    </td>
                    <td className="py-3 pr-3">{plan?.name ?? c.plan_id ?? '—'}</td>
                    <td className="py-3 pr-3">{c.seats}</td>
                    <td className="py-3 pr-3"><Badge tone={STATUS_TONES[c.status]}>{c.status}</Badge></td>
                    <td className="py-3 pr-3">{c.stats?.members ?? '—'}</td>
                    <td className="py-3 pr-3">{c.stats?.chats_month ?? '—'}</td>
                    <td className="py-3 pr-3">{c.stats?.open_chats ?? '—'}</td>
                    <td className="py-3 pr-3 text-slate-500 whitespace-nowrap">{fmtDate(c.created_at)}</td>
                    <td className="py-3 pr-4">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="secondary" disabled={c.status === 'suspended'} onClick={() => { void viewAs(c.id, c.name); }}>View as</Button>
                        <Button size="sm" variant="ghost" onClick={() => setPlanModal({ ids: [c.id] })}>Plan</Button>
                        {c.status === 'suspended'
                          ? <Button size="sm" variant="ghost" onClick={() => { void setStatus([c.id], 'active'); }}>Activate</Button>
                          : <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => askSuspend([c.id])}>Suspend</Button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={planModal !== null} onClose={() => setPlanModal(null)} title={planModal && planModal.ids.length > 1 ? `Change plan — ${planModal.ids.length} clients` : 'Change plan'}>
        <Label>Plan</Label>
        <Select value={planChoice} onChange={(e) => setPlanChoice(e.target.value)}>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — ${p.price}/mo · {p.seats} seats</option>)}
        </Select>
        <p className="text-xs text-slate-500 mt-2">Seats update to the plan default.</p>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={() => setPlanModal(null)}>Cancel</Button>
          <Button onClick={() => { void applyPlan(); }}>Apply plan</Button>
        </div>
      </Modal>

      <Modal open={creating !== null} onClose={() => setCreating(null)} title="New client">
        {creating && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void create(); }}>
            {formError && <p role="alert" className="text-sm text-rose-600">{formError}</p>}
            <div><Label>Company / workspace name</Label><Input required value={creating.name} onChange={(e) => setCreating({ ...creating, name: e.target.value })} placeholder="Acme Store" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Plan</Label>
                <Select value={creating.plan_id} onChange={(e) => setCreating({ ...creating, plan_id: e.target.value })}>
                  {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={creating.status} onChange={(e) => setCreating({ ...creating, status: e.target.value as ClientStatus })}>
                  <option value="trial">Trial</option>
                  <option value="active">Active</option>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Owner name</Label><Input required value={creating.owner_name} onChange={(e) => setCreating({ ...creating, owner_name: e.target.value })} /></div>
              <div><Label>Owner email</Label><Input required type="email" value={creating.owner_email} onChange={(e) => setCreating({ ...creating, owner_email: e.target.value })} /></div>
            </div>
            <div><Label>Owner passcode</Label><PasswordInput required value={creating.owner_passcode} onChange={(e) => setCreating({ ...creating, owner_passcode: e.target.value })} autoComplete="new-password" /></div>
            <p className="text-xs text-slate-500">Share the workspace login and passcode with the owner. They can change it in their settings.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setCreating(null)}>Cancel</Button>
              <Button type="submit">Create client</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

// --- properties (all workspaces, read-only) --------------------------------------

function PropertiesTab({ highlightId, nonce }: { highlightId?: string; nonce: number }) {
  const viewAs = useViewAs();
  const [rows, setRows] = useState<AdminProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    adminApi.properties().then(setRows).catch((e) => setError(errMsg(e))).finally(() => setLoading(false));
  }, []);

  const flash = useRowFlash(highlightId, nonce);
  const filtered = rows.filter((r) => !q || `${r.name} ${r.domain} ${r.workspace_name}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Properties</h2>
          <p className="text-sm text-slate-500">Every website with the chat widget, across all clients. Clients manage their own.</p>
        </div>
        <div className="w-64 max-w-full"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search properties…" /></div>
      </div>
      {error && <Notice>{error}</Notice>}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
                <th className="py-3 pl-4 pr-3 font-semibold">Property</th>
                <th className="py-3 pr-3 font-semibold">Client</th>
                <th className="py-3 pr-3 font-semibold">Domain</th>
                <th className="py-3 pr-3 font-semibold">Public key</th>
                <th className="py-3 pr-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-10 text-center text-slate-500">Loading properties…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5}><EmptyState icon="🌐" title="No properties" hint="Properties appear once clients add them." /></td></tr>
              ) : filtered.map((r) => (
                <tr key={r.id} id={`row-${r.id}`} className={cx('border-b border-slate-100 last:border-0 hover:bg-slate-50', flash === r.id && 'bg-brix-50')}>
                  <td className="py-3 pl-4 pr-3 font-bold text-slate-900">{r.name}</td>
                  <td className="py-3 pr-3">{r.workspace_name} <span className="text-xs text-slate-500 font-mono">{r.workspace_slug}</span></td>
                  <td className="py-3 pr-3 text-slate-500">{r.domain}</td>
                  <td className="py-3 pr-3 whitespace-nowrap"><span className="font-mono text-xs">{r.public_key}</span> <CopyBtn text={r.public_key} /></td>
                  <td className="py-3 pr-4 text-right"><Button size="sm" variant="secondary" onClick={() => { void viewAs(r.workspace_id, r.workspace_name); }}>Open client dashboard</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// --- plans & billing -------------------------------------------------------------

function PlansTab({ highlightId, nonce }: { highlightId?: string; nonce: number }) {
  const { toast, toastError } = useToast();
  const { confirm, dialog } = useConfirm();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [clients, setClients] = useState<AdminWorkspace[]>([]);
  const [editing, setEditing] = useState<(Partial<Plan> & { featuresText?: string }) | null>(null);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');

  const load = async () => {
    try {
      const [ps, cs] = await Promise.all([adminApi.plans(), adminApi.workspaces()]);
      setPlans(ps);
      setClients(cs);
    } catch (e) { setError(errMsg(e)); }
  };
  useEffect(() => { void load(); }, []);

  const flash = useRowFlash(highlightId, nonce);

  const save = async () => {
    if (!editing) return;
    const body = {
      name: (editing.name ?? '').trim(),
      price: Number(editing.price) || 0,
      seats: Number(editing.seats) || 1,
      features: (editing.featuresText ?? '').split('\n').map((f) => f.trim()).filter(Boolean),
    };
    setFormError('');
    try {
      if (editing.id) await adminApi.updatePlan(editing.id, body);
      else await adminApi.createPlan(body);
      toast(`Plan “${body.name}” saved.`);
      setEditing(null);
      await load();
    } catch (e) { setFormError(errMsg(e)); }
  };

  const remove = (p: Plan) => confirm({
    title: 'Delete plan?', body: `“${p.name}” will be removed from the catalog.`,
    action: () => {
      adminApi.deletePlan(p.id)
        .then(() => { toast('Plan deleted.'); return load(); })
        .catch((e) => toastError(errMsg(e)));
    },
  });

  const billable = clients.filter((c) => c.status !== 'suspended');
  const priceOf = (id: string | null) => plans.find((p) => p.id === id)?.price ?? 0;
  const mrr = billable.reduce((n, c) => n + priceOf(c.plan_id), 0);
  const planRows = plans.map((p, i) => {
    const onPlan = clients.filter((c) => c.plan_id === p.id);
    return { plan: p, clients: onPlan.length, mrr: onPlan.filter((c) => c.status !== 'suspended').length * p.price, color: PLAN_COLORS[i % PLAN_COLORS.length] };
  });

  return (
    <div className="space-y-6">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Plans & billing</h2>
          <p className="text-sm text-slate-500">The plan catalog and what each client pays. Card payments are not connected yet.</p>
        </div>
        <Button size="sm" onClick={() => { setFormError(''); setEditing({ name: '', price: 49, seats: 5, featuresText: '' }); }}>+ New plan</Button>
      </div>

      {error && <Notice>{error}</Notice>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="MRR" value={`$${mrr.toLocaleString()}`} icon="💰" tone="green" />
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
                  <tr key={r.plan.id} className="border-b border-slate-100 last:border-0">
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
          {planRows.some((r) => r.clients > 0)
            ? <Donut segments={planRows.filter((r) => r.clients > 0).map((r) => ({ label: r.plan.name, value: r.clients, color: r.color }))} centerLabel="clients" centerValue={String(clients.length)} />
            : <EmptyState icon="📊" title="No clients yet" hint="Clients appear here once added." />}
        </Card>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map((p) => (
          <Card key={p.id} className={cx('p-5', flash === p.id && 'ring-2 ring-brix-400')}>
            <div id={`row-${p.id}`} className="font-extrabold text-slate-900 text-lg">{p.name}</div>
            <div className="text-sm text-slate-500 mb-2"><span className="text-2xl font-extrabold text-slate-900">${p.price}</span>/mo · {p.seats} seats</div>
            <ul className="text-sm text-slate-600 space-y-1 mb-4">
              {p.features.map((f) => <li key={f} className="flex gap-2"><span className="text-emerald-500">✓</span>{f}</li>)}
            </ul>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => { setFormError(''); setEditing({ ...p, featuresText: p.features.join('\n') }); }}>Edit</Button>
              <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => remove(p)}>Delete</Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? 'Edit plan' : 'New plan'}>
        {editing && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            {formError && <p role="alert" className="text-sm text-rose-600">{formError}</p>}
            <div><Label>Name</Label><Input required value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Price (USD/mo)</Label><Input type="number" min={0} value={editing.price ?? 0} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} /></div>
              <div><Label>Seats</Label><Input type="number" min={1} value={editing.seats ?? 1} onChange={(e) => setEditing({ ...editing, seats: Number(e.target.value) })} /></div>
            </div>
            <div><Label>Features (one per line)</Label><Textarea value={editing.featuresText ?? ''} onChange={(e) => setEditing({ ...editing, featuresText: e.target.value })} rows={5} /></div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit">Save plan</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

// --- content (marketing site) ----------------------------------------------------

function ContentTab() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900">Content</h2>
        <p className="text-sm text-slate-500">The marketing site — blog, help center, contact inbox, status page.</p>
      </div>
      <Notice>Content is still saved in this browser only. It moves to the database in the next backend step.</Notice>
      <BlogManager readOnly={false} />
      <HelpManager readOnly={false} />
      <ContactInbox readOnly={false} />
      <StatusManager readOnly={false} />
    </div>
  );
}

// --- system ----------------------------------------------------------------------

function SystemTab() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { adminApi.system().then(setInfo).catch((e) => setError(errMsg(e))); }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900">System</h2>
        <p className="text-sm text-slate-500">Server and database health.</p>
      </div>
      {error && <Notice>{error}</Notice>}
      {info && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="p-5">
            <h3 className="font-bold text-slate-900 mb-3">Server</h3>
            <dl className="space-y-2 text-sm">
              {[
                ['Environment', info.environment],
                ['PHP', info.php],
                ['Laravel', info.laravel],
                ['Database', info.database],
                ['Database size', fmtBytes(info.database_bytes)],
                ['Failed webhooks', String(info.failed_webhooks)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><dt className="text-slate-500">{k}</dt><dd className="font-bold text-slate-900">{v}</dd></div>
              ))}
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Debug mode</dt>
                <dd>{info.debug ? <Badge tone={info.environment === 'production' ? 'rose' : 'amber'}>on</Badge> : <Badge tone="green">off</Badge>}</dd>
              </div>
            </dl>
            {info.debug && info.environment === 'production' && <p className="text-xs text-rose-600 mt-3 font-semibold">Turn APP_DEBUG off in production — it leaks error details.</p>}
          </Card>
          <Card className="p-5">
            <h3 className="font-bold text-slate-900 mb-3">Records</h3>
            <dl className="space-y-2 text-sm">
              {Object.entries(info.counts).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><dt className="text-slate-500">{k.replace(/_/g, ' ')}</dt><dd className="font-bold text-slate-900">{v.toLocaleString()}</dd></div>
              ))}
            </dl>
          </Card>
        </div>
      )}
    </div>
  );
}

// --- audit (platform-wide) -------------------------------------------------------

function AuditTab() {
  const [entries, setEntries] = useState<AdminAuditEntry[]>([]);
  const [q, setQ] = useState('');
  const [wsF, setWsF] = useState('');
  const [actionF, setActionF] = useState('');
  const [saveName, setSaveName] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi.audit(500).then(setEntries).catch((e) => setError(errMsg(e))).finally(() => setLoading(false));
  }, []);

  const workspaces = useMemo(() => {
    const m = new Map<string, string>();
    entries.forEach((e) => m.set(e.workspace_slug, e.workspace_name));
    return [...m.entries()];
  }, [entries]);
  const actions = useMemo(() => [...new Set(entries.map((e) => e.action))].sort(), [entries]);

  const filtered = useMemo(() => entries.filter((e) => {
    if (wsF && e.workspace_slug !== wsF) return false;
    if (actionF && e.action !== actionF) return false;
    if (q && !`${e.actor} ${e.action} ${e.entity} ${e.entity_id}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [entries, q, wsF, actionF]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900">Audit log</h2>
        <p className="text-sm text-slate-500">Operator actions and every client's audit trail, merged. Newest first.</p>
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
            <Label>Source</Label>
            <Select value={wsF} onChange={(e) => setWsF(e.target.value)}>
              <option value="">All</option>
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
                <th className="py-3 pr-3 font-semibold">Source</th>
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
                <tr><td colSpan={6}><EmptyState icon="📜" title="No entries" hint="Actions across the platform appear here." /></td></tr>
              ) : filtered.slice(0, 200).map((e) => (
                <Fragment key={e.id}>
                  <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => setExpanded((x) => (x === e.id ? null : e.id))}>
                    <td className="py-2.5 pl-4 pr-3 text-slate-500 whitespace-nowrap">{fmtDate(e.created_at)}</td>
                    <td className="py-2.5 pr-3"><Badge tone={e.workspace_slug === 'platform' ? 'amber' : 'indigo'}>{e.workspace_name}</Badge></td>
                    <td className="py-2.5 pr-3 font-semibold text-slate-900">{e.actor}</td>
                    <td className="py-2.5 pr-3 font-mono text-xs">{e.action}</td>
                    <td className="py-2.5 pr-3 text-slate-500">{e.entity}{e.entity_id ? ` · ${e.entity_id.slice(0, 12)}` : ''}</td>
                    <td className="py-2.5 pr-4 text-right text-slate-500">{expanded === e.id ? '▾' : '▸'}</td>
                  </tr>
                  {expanded === e.id && (
                    <tr className="bg-slate-50">
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

// --- settings (platform) ---------------------------------------------------------

function SettingsTab({ onSaved }: { onSaved: (s: PlatformSettings) => void }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<PlatformSettings | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { adminApi.settings().then(setDraft).catch((e) => setError(errMsg(e))); }, []);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError('');
    try {
      const saved = await adminApi.saveSettings({ ...draft, platform_name: draft.platform_name.trim() });
      setDraft(saved);
      onSaved(saved);
      toast('Platform settings saved.');
    } catch (e) { setError(errMsg(e)); }
    setSaving(false);
  };

  const onLogo = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 512 * 1024) { setError('Logo must be under 512 KB.'); return; }
    const r = new FileReader();
    r.onload = () => setDraft((d) => (d ? { ...d, logo_data_url: String(r.result) } : d));
    r.readAsDataURL(f);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900">Settings</h2>
        <p className="text-sm text-slate-500">Platform-level settings. Each client manages its own workspace settings.</p>
      </div>
      {error && <Notice>{error}</Notice>}
      {draft && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="p-5 space-y-4">
            <h3 className="font-bold text-slate-900">Platform</h3>
            <div><Label>Platform name</Label><Input value={draft.platform_name} onChange={(e) => setDraft({ ...draft, platform_name: e.target.value })} /></div>
            <div>
              <Label>Logo</Label>
              <div className="flex flex-wrap items-center gap-3">
                {draft.logo_data_url && <img src={draft.logo_data_url} alt="logo" className="w-10 h-10 rounded-xl object-contain bg-slate-100" />}
                <input type="file" accept="image/*" onChange={(e) => onLogo(e.target.files?.[0])} className="text-sm" />
                {draft.logo_data_url && <Button variant="ghost" size="sm" onClick={() => setDraft({ ...draft, logo_data_url: null })}>Remove</Button>}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div><div className="text-sm font-bold text-slate-900">Allow new signups</div><div className="text-xs text-slate-500">New companies can create a workspace themselves.</div></div>
              <Toggle checked={draft.allow_signup} onChange={(v) => setDraft({ ...draft, allow_signup: v })} label="Allow new signups" />
            </div>
          </Card>
          <Card className="p-5 space-y-4">
            <h3 className="font-bold text-slate-900">Security</h3>
            <div><Label>Session timeout (minutes)</Label><Input type="number" min={5} max={1440} value={draft.session_timeout_mins} onChange={(e) => setDraft({ ...draft, session_timeout_mins: Number(e.target.value) })} /></div>
            <div><Label>Minimum passcode length</Label><Input type="number" min={4} max={12} value={draft.passcode_min_length} onChange={(e) => setDraft({ ...draft, passcode_min_length: Number(e.target.value) })} /></div>
            <p className="text-xs text-slate-500">Applies to new passcodes (signup and new clients).</p>
          </Card>
          <div className="lg:col-span-2 flex justify-end">
            <Button onClick={() => { void save(); }} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- admin shell -----------------------------------------------------------------

function AdminInner() {
  const { admin, logout } = useAdminAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [highlightId, setHighlightId] = useState<string | undefined>(undefined);
  const [nonce, setNonce] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [items, setItems] = useState<SearchItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [platformName, setPlatformName] = useState('Brix Chat');
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => { adminApi.settings().then((s) => setPlatformName(s.platform_name)).catch(() => {}); }, []);

  // Coming back from view-as (console mounts again): end that short-lived
  // workspace session. Mount-only, so starting a new view-as isn't undone.
  const { session, exitViewAs } = useStore();
  useEffect(() => {
    if (session?.viewingWorkspaceId) exitViewAs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const jumpTo = (t: Tab, id?: string) => {
    setTab(t);
    setHighlightId(id);
    setNonce((n) => n + 1);
    setNavOpen(false);
    window.scrollTo({ top: 0 });
  };

  const openPalette = () => {
    setPaletteOpen(true);
    setItemsLoading(true);
    collectPlatformSearchItems().then(setItems).catch(() => setItems([])).finally(() => setItemsLoading(false));
  };

  const signOut = async () => {
    await logout();
    navigate('/admin-login', { replace: true });
  };

  useAdminShortcuts({ onGo: (t) => jumpTo(t as Tab), onSearch: openPalette, onHelp: () => setHelpOpen(true), enabled: true });

  const sidebar = (
    <>
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-brix-600 grid place-items-center font-extrabold text-lg">{platformName.charAt(0) || 'B'}</div>
          <div className="min-w-0">
            <div className="font-extrabold text-sm leading-tight truncate">{platformName}</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">Operator console</div>
          </div>
        </div>
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
        <button onClick={openPalette} className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-xs text-white/50 hover:text-white hover:bg-white/5"><span>⌘K</span> Search…</button>
        <button onClick={() => setHelpOpen(true)} className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-xs text-white/50 hover:text-white hover:bg-white/5"><span>?</span> Shortcuts</button>
        <button onClick={() => { void signOut(); }} className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-xs text-white/50 hover:text-white hover:bg-white/5">
          <span>⎋</span> <span className="truncate">Sign out ({admin?.email})</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="hidden lg:flex w-60 shrink-0 bg-ink-950 text-white flex-col sticky top-0 h-screen">{sidebar}</aside>
      {navOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setNavOpen(false)} />
          <aside className="relative w-64 h-full bg-ink-950 text-white flex flex-col">{sidebar}</aside>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
          <div className="px-4 sm:px-6 py-3 flex items-center gap-3">
            <button className="lg:hidden -ml-1 p-2 rounded-lg hover:bg-slate-100" onClick={() => setNavOpen(true)} aria-label="Open menu">☰</button>
            <span className="text-sm font-bold text-slate-900">{TABS.find((t) => t.id === tab)?.label}</span>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={openPalette}>⌘K Search</Button>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 max-w-7xl mx-auto">
          {tab === 'overview' && <OverviewTab jumpTo={jumpTo} />}
          {tab === 'clients' && <ClientsTab highlightId={highlightId} nonce={nonce} />}
          {tab === 'properties' && <PropertiesTab highlightId={highlightId} nonce={nonce} />}
          {tab === 'plans' && <PlansTab highlightId={highlightId} nonce={nonce} />}
          {tab === 'content' && <ContentTab />}
          {tab === 'system' && <SystemTab />}
          {tab === 'audit' && <AuditTab />}
          {tab === 'settings' && <SettingsTab onSaved={(s) => setPlatformName(s.platform_name)} />}
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
