// Brix Chat — platform admin data layer (local-only).
//
// /admin is the PLATFORM ADMIN console (the Brix Chat operator). It sees
// EVERYTHING across all client workspaces. /app is the client dashboard,
// scoped to one workspace. Two products, two logins.
//
// Session contract (implemented in src/lib/store.tsx; the login UI + /app
// side are owned by the dashboard worker):
//   session = { memberId, workspaceId, displayName, role,
//               isPlatformAdmin, viewingWorkspaceId?, rememberMe, loggedInAt }
//   - demo / 3456 → primary member has role 'owner' → isPlatformAdmin → /admin
//   - acme / 7890 → normal client member → /app scoped to the acme workspace
//   - view-as: setViewingWorkspace(slug) then navigate to /app. The /app
//     shell renders a "Viewing as <name> — Exit view-as" banner (dashboard
//     worker). Exit clears viewingWorkspaceId (back in the admin topbar).
//   - EFFECTIVE WORKSPACE EVERYWHERE = viewingWorkspaceId ?? workspaceId.
//     Platform tabs below aggregate explicitly; everything else must use the
//     effective workspace so no client data leaks into the wrong scope.

import { getApi } from '../../lib/api';
import type { ApiProperty, AuditEntry } from '../../lib/api';
import type { SearchItem } from './search';

const LS_CLIENTS = 'brix.platform.v1.clients';
const LS_PLANS = 'brix.platform.v1.plans';
const LS_SETTINGS = 'brix.platform.v1.settings';
const LS_ERRORS = 'brix.platform.v1.errors';
const API_LS_KEY = 'brixchat_api_v1'; // mirrors LS_KEY in src/lib/api.ts

// ---------------------------------------------------------------------------
// Clients (workspaces)
// ---------------------------------------------------------------------------

export type ClientStatus = 'active' | 'trial' | 'suspended';

export interface ClientRecord {
  slug: string;
  name: string;
  planId: string;
  seats: number;
  status: ClientStatus;
  created_at: string;
  notes: string;
}

export interface PlanRecord {
  id: string;
  name: string;
  price: number; // USD / month
  seats: number;
  features: string[];
  created_at: string;
}

export interface PlatformSettings {
  platform_name: string;
  logo_data_url: string | null;
  session_timeout_mins: number;
  passcode_min_length: number;
  allow_signup: boolean;
}

export interface PlatformError {
  id: string;
  at: string;
  message: string;
  source: string;
}

const LS_AUDIT = 'brix.platform.v1.audit';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch { /* corrupted — reseed below */ }
  return fallback;
}

/** Returns false when the write failed (usually quota) so callers can warn the user. */
function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // storage full — reads still work
  }
}

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;

const DAY = 86400000;

function defaultPlans(): PlanRecord[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'starter', name: 'Starter', price: 29, seats: 3, created_at: now,
      features: ['3 agent seats', '1 property', 'Core chat widget', 'Knowledge base', 'Email support'],
    },
    {
      id: 'growth', name: 'Growth', price: 79, seats: 10, created_at: now,
      features: ['10 agent seats', '5 properties', 'AI copilot', 'Webhooks & API', 'Departments & routing', 'Priority support'],
    },
    {
      id: 'scale', name: 'Scale', price: 199, seats: 30, created_at: now,
      features: ['30 agent seats', 'Unlimited properties', 'Everything in Growth', 'SSO (backend phase)', 'Dedicated success manager'],
    },
  ];
}

function defaultClients(): ClientRecord[] {
  const now = Date.now();
  return [
    { slug: 'acme', name: 'Acme Store', planId: 'growth', seats: 10, status: 'active', created_at: new Date(now - 60 * DAY).toISOString(), notes: 'Seeded demo client.' },
    { slug: 'globex', name: 'Globex Corp', planId: 'scale', seats: 25, status: 'active', created_at: new Date(now - 120 * DAY).toISOString(), notes: '' },
    { slug: 'initech', name: 'Initech LLC', planId: 'starter', seats: 3, status: 'trial', created_at: new Date(now - 5 * DAY).toISOString(), notes: 'Trial ends soon — follow up.' },
  ];
}

function defaultSettings(): PlatformSettings {
  return {
    platform_name: 'Brix Chat',
    logo_data_url: null,
    session_timeout_mins: 480,
    passcode_min_length: 4,
    allow_signup: true,
  };
}

/** Seed the platform registry on first run. Idempotent. */
export function ensurePlatformSeed(): void {
  if (!localStorage.getItem(LS_PLANS)) write(LS_PLANS, defaultPlans());
  if (!localStorage.getItem(LS_CLIENTS)) write(LS_CLIENTS, defaultClients());
  if (!localStorage.getItem(LS_SETTINGS)) write(LS_SETTINGS, defaultSettings());
}

export function listClients(): ClientRecord[] {
  ensurePlatformSeed();
  return read<ClientRecord[]>(LS_CLIENTS, []);
}

export function saveClients(clients: ClientRecord[]): boolean {
  return write(LS_CLIENTS, clients);
}

/** Platform client status, for enforcing suspension at login. */
export function clientStatus(slug: string): ClientStatus | null {
  ensurePlatformSeed();
  return listClients().find((c) => c.slug === slug)?.status ?? null;
}

export function listPlans(): PlanRecord[] {
  ensurePlatformSeed();
  return read<PlanRecord[]>(LS_PLANS, []);
}

export function savePlans(plans: PlanRecord[]): boolean {
  return write(LS_PLANS, plans);
}

export function getPlatformSettings(): PlatformSettings {
  ensurePlatformSeed();
  return { ...defaultSettings(), ...read<Partial<PlatformSettings>>(LS_SETTINGS, {}) };
}

export function savePlatformSettings(s: PlatformSettings): boolean {
  return write(LS_SETTINGS, s);
}

export function planById(plans: PlanRecord[], id: string): PlanRecord | undefined {
  return plans.find((p) => p.id === id);
}

// ---------------------------------------------------------------------------
// Platform audit log — operator actions (suspend, plan changes, …). These are
// platform-level destructive actions outside any workspace DB, so they get
// their own trail that the Audit tab aggregates alongside workspace audits.
// ---------------------------------------------------------------------------

export interface PlatformAuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  entity: string;
  entity_id: string;
  meta: Record<string, unknown>;
}

export function logPlatformAudit(
  action: string,
  entity: string,
  entityId = '',
  meta: Record<string, unknown> = {},
  actor = 'platform operator',
): void {
  try {
    const entries = read<PlatformAuditEntry[]>(LS_AUDIT, []);
    entries.unshift({
      id: uid('paud'),
      at: new Date().toISOString(),
      actor,
      action,
      entity,
      entity_id: entityId,
      meta,
    });
    write(LS_AUDIT, entries.slice(0, 500));
  } catch { /* ignore */ }
}

export function getPlatformAudit(): PlatformAuditEntry[] {
  return read<PlatformAuditEntry[]>(LS_AUDIT, []);
}

export function clearPlatformAudit(): void {
  write(LS_AUDIT, []);
}

// ---------------------------------------------------------------------------
// Cross-workspace aggregation (explicit — the platform exception to scoping)
// ---------------------------------------------------------------------------

export interface ClientMetrics {
  chatsToday: number;
  messagesTotal: number;
  openChats: number;
  unassigned: number;
  csat: number | null;
}

const isToday = (iso: string) => {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};

export async function clientMetrics(slug: string): Promise<ClientMetrics> {
  const api = getApi(slug, 'platform');
  const empty: ClientMetrics = { chatsToday: 0, messagesTotal: 0, openChats: 0, unassigned: 0, csat: null };
  try {
    const [{ data }, propsRes] = await Promise.all([
      api.conversations.list({ limit: 200 }),
      api.properties.list().catch(() => ({ data: [] as { id: string }[] })),
    ]);
    const propId = (propsRes as { data?: { id: string }[] }).data?.[0]?.id;
    let summary: { data?: { csat_avg: number | null } } | null = null;
    if (propId) summary = await api.ratings.summary(propId).catch(() => null);
    const convs = ((data?.items ?? []) as Array<{ status: string; created_at: string; messages: unknown[]; agent_id: string | null }>);
    return {
      chatsToday: convs.filter((c) => isToday(c.created_at)).length,
      messagesTotal: convs.reduce((n, c) => n + (Array.isArray(c.messages) ? c.messages.length : 0), 0),
      openChats: convs.filter((c) => c.status === 'open').length,
      unassigned: convs.filter((c) => c.status === 'open' && !c.agent_id).length,
      csat: summary && typeof summary.data?.csat_avg === 'number' ? summary.data.csat_avg : null,
    };
  } catch {
    return empty;
  }
}

export interface PropertyRow {
  property: ApiProperty;
  workspaceSlug: string;
  workspaceName: string;
}

export async function allProperties(clients: ClientRecord[]): Promise<PropertyRow[]> {
  const rows: PropertyRow[] = [];
  await Promise.all(clients.map(async (c) => {
    try {
      const api = getApi(c.slug, 'platform');
      const { data } = await api.properties.list();
      const list = Array.isArray(data) ? data : [];
      list.forEach((p) => rows.push({ property: p, workspaceSlug: c.slug, workspaceName: c.name }));
    } catch { /* workspace db unreadable — skip */ }
  }));
  return rows.sort((a, b) => a.workspaceName.localeCompare(b.workspaceName));
}

export interface ScopedAuditEntry extends AuditEntry {
  workspaceSlug: string;
  workspaceName: string;
}

export async function aggregateAudit(clients: ClientRecord[], perWorkspaceLimit = 100): Promise<ScopedAuditEntry[]> {
  const out: ScopedAuditEntry[] = [];
  await Promise.all(clients.map(async (c) => {
    try {
      const api = getApi(c.slug, 'platform');
      const { data } = await api.auditLog.list({ limit: perWorkspaceLimit });
      (data?.items ?? []).forEach((e) => out.push({ ...e, workspaceSlug: c.slug, workspaceName: c.name }));
    } catch { /* skip */ }
  }));
  // Also include the operator workspace's own audit trail.
  try {
    const api = getApi('demo', 'platform');
    const { data } = await api.auditLog.list({ limit: perWorkspaceLimit });
    (data?.items ?? []).forEach((e) => out.push({ ...e, workspaceSlug: 'demo', workspaceName: 'Brix (operator)' }));
  } catch { /* skip */ }
  // Platform-level operator actions (suspend, plan changes…) live outside
  // workspace DBs — surface them here so destructive actions are traceable.
  getPlatformAudit().slice(0, perWorkspaceLimit).forEach((e) => {
    out.push({
      id: e.id, actor: e.actor, action: e.action, entity: e.entity,
      entity_id: e.entity_id, meta: e.meta, created_at: e.at,
      workspaceSlug: 'platform', workspaceName: 'Platform (operator actions)',
    });
  });
  return out.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

// ---------------------------------------------------------------------------
// System health: storage usage + client-side error log
// ---------------------------------------------------------------------------

/** Bytes currently used in localStorage by Brix keys. Local-only honesty:
 *  this measures THIS browser, not the fleet. */
export function storageUsage(): { bytes: number; keys: number } {
  let bytes = 0;
  let keys = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('brix')) continue;
      keys++;
      bytes += k.length + (localStorage.getItem(k) ?? '').length;
    }
  } catch { /* ignore */ }
  return { bytes, keys };
}

export function logPlatformError(message: string, source = 'console'): void {
  try {
    const errors = read<PlatformError[]>(LS_ERRORS, []);
    errors.unshift({ id: uid('err'), at: new Date().toISOString(), message: String(message).slice(0, 500), source });
    write(LS_ERRORS, errors.slice(0, 100));
  } catch { /* ignore */ }
}

export function getPlatformErrors(): PlatformError[] {
  return read<PlatformError[]>(LS_ERRORS, []);
}

export function clearPlatformErrors(): void {
  write(LS_ERRORS, []);
}

// ---------------------------------------------------------------------------
// Data management: export-all / reset
// ---------------------------------------------------------------------------

export function exportAllData(): Record<string, unknown> {
  let apiDb: unknown = {};
  try {
    apiDb = JSON.parse(localStorage.getItem(API_LS_KEY) ?? '{}');
  } catch { /* ignore */ }
  return {
    exported_at: new Date().toISOString(),
    product: 'brix-chat-platform',
    api_db: apiDb,
    platform: {
      clients: read(LS_CLIENTS, []),
      plans: read(LS_PLANS, []),
      settings: read(LS_SETTINGS, {}),
      audit: read(LS_AUDIT, []),
    },
  };
}

const RESET_KEYS = [API_LS_KEY, 'brixchat_v1', 'brixchat_session_v1', LS_CLIENTS, LS_PLANS, LS_SETTINGS, LS_ERRORS, LS_AUDIT];

export function resetAllData(): void {
  RESET_KEYS.forEach((k) => {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  });
  try { sessionStorage.clear(); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Platform command-palette index
// ---------------------------------------------------------------------------

export async function collectPlatformSearchItems(): Promise<SearchItem[]> {
  ensurePlatformSeed();
  const items: SearchItem[] = [];
  const clients = listClients();
  const plans = listPlans();
  clients.forEach((c) => {
    const plan = plans.find((p) => p.id === c.planId);
    items.push({
      kind: 'Client', id: c.slug, title: c.name,
      subtitle: `${c.slug} · ${plan?.name ?? c.planId} · ${c.status}`, tab: 'clients',
    });
  });
  plans.forEach((p) => {
    items.push({ kind: 'Plan', id: p.id, title: p.name, subtitle: `$${p.price}/mo · ${p.seats} seats`, tab: 'plans' });
  });
  try {
    const rows = await allProperties(clients);
    rows.forEach((r) => {
      items.push({
        kind: 'Property', id: r.property.id, title: r.property.name,
        subtitle: `${r.workspaceName} · ${r.property.domain}`, tab: 'properties',
      });
    });
  } catch { /* search stays useful without properties */ }
  try {
    const api = getApi('demo', 'platform');
    const { data } = await api.helpDocs.list();
    const docs = (data ?? []) as Array<{ id: string; title: string; slug: string }>;
    docs.slice(0, 50).forEach((d) => {
      items.push({ kind: 'Article', id: d.id, title: d.title, subtitle: `/help/${d.slug}`, tab: 'content' });
    });
  } catch { /* ignore */ }
  return items;
}
