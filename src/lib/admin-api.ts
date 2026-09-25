// Brix Chat — platform admin API client (/api/admin/*).
//
// Completely separate from the workspace session: its own Sanctum token,
// its own storage key, its own requests. An admin session never touches the
// workspace bearer token, and vice versa.

import { ApiError } from './api';
import { phpBaseUrl } from './php-client';

const TOKEN_KEY = 'brix_admin_token_v1';

export interface AdminUser { id: number; name: string; email: string; last_login_at: string | null }

export type ClientStatus = 'active' | 'trial' | 'suspended';

export interface WorkspaceStats {
  chats_today: number;
  chats_month: number;
  open_chats: number;
  unassigned: number;
  oldest_unassigned_at: string | null;
  messages_total: number;
  members: number;
  properties: number;
  csat: number | null;
}

export interface AdminWorkspace {
  id: string;
  name: string;
  slug: string;
  plan_id: string | null;
  status: ClientStatus;
  seats: number;
  notes: string | null;
  created_at: string | null;
  stats?: WorkspaceStats | null;
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  seats: number;
  features: string[];
  sort_order: number;
}

export interface PlatformSettings {
  platform_name: string;
  logo_data_url: string | null;
  session_timeout_mins: number;
  passcode_min_length: number;
  allow_signup: boolean;
}

export interface Overview {
  totals: {
    clients: number; active: number; trial: number; suspended: number;
    chats_today: number; messages_total: number; open_chats: number; unassigned: number;
    csat: number | null; oldest_unassigned_at: string | null; mrr: number;
  };
  chats_per_day: Array<{ date: string; count: number }>;
  plans: Array<{ id: string; name: string; clients: number }>;
  clients: Array<Pick<AdminWorkspace, 'id' | 'name' | 'slug' | 'plan_id' | 'status'> & { stats: WorkspaceStats }>;
}

export interface AdminProperty {
  id: string; name: string; domain: string; public_key: string; created_at: string;
  workspace_id: string; workspace_name: string; workspace_slug: string;
}

export interface AdminAuditEntry {
  id: string; workspace_id: string | null; workspace_slug: string; workspace_name: string;
  actor: string; action: string; entity: string; entity_id: string;
  meta: Record<string, unknown>; created_at: string;
}

export interface SystemInfo {
  php: string; laravel: string; database: string; database_bytes: number;
  environment: string; debug: boolean; counts: Record<string, number>; failed_webhooks: number;
}

/** Payload of a workspace login — returned by view-as. */
export interface WorkspaceSessionPayload {
  token: string;
  workspace: { id: string; name: string; slug: string; status: ClientStatus };
  member: { id: string; display_name: string; role: string; email: string | null } & Record<string, unknown>;
}

// --- token storage --------------------------------------------------------------

function storages(): Storage[] {
  const out: Storage[] = [];
  try { out.push(localStorage); } catch { /* unavailable */ }
  try { out.push(sessionStorage); } catch { /* unavailable */ }
  return out;
}

export function getAdminToken(): string | null {
  for (const s of storages()) {
    const t = s.getItem(TOKEN_KEY);
    if (t) return t;
  }
  return null;
}

function setAdminToken(token: string | null, remember = true): void {
  for (const s of storages()) s.removeItem(TOKEN_KEY);
  if (!token) return;
  try { (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token); } catch { /* unavailable */ }
}

// --- transport ------------------------------------------------------------------

async function request<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const base = phpBaseUrl();
  if (!base) throw new ApiError('not_configured', 'App server is not configured (VITE_API_URL).', 501);
  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
  const token = init.auth === false ? null : getAdminToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${base}/admin${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError('php_unreachable', `Cannot reach the app server at ${base}.`, 503);
  }
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { code?: string; message?: string } };
  if (!res.ok) {
    if (res.status === 401 && token) {
      setAdminToken(null);
      window.dispatchEvent(new CustomEvent('brix:admin-auth-expired'));
    }
    throw new ApiError(json.error?.code ?? 'http_error', json.error?.message ?? `Request failed (${res.status}).`, res.status);
  }
  return json.data as T;
}

const get = <T>(p: string) => request<T>(p);
const send = <T>(method: string, p: string, body?: unknown) => request<T>(p, { method, body });

export const adminApi = {
  hasToken: () => getAdminToken() !== null,

  async login(email: string, password: string, remember: boolean): Promise<AdminUser> {
    const data = await request<{ token: string; admin: AdminUser }>('/auth/login', {
      method: 'POST', auth: false, body: { email: email.trim(), password, remember },
    });
    setAdminToken(data.token, remember);
    return data.admin;
  },
  me: () => get<{ admin: AdminUser }>('/auth/me').then((d) => d.admin),
  async logout(): Promise<void> {
    try { await send('POST', '/auth/logout'); } catch { /* token already gone */ }
    setAdminToken(null);
  },

  overview: () => get<Overview>('/overview'),
  properties: () => get<AdminProperty[]>('/properties'),
  audit: (limit = 300) => get<AdminAuditEntry[]>(`/audit?limit=${limit}`),
  system: () => get<SystemInfo>('/system'),
  settings: () => get<PlatformSettings>('/settings'),
  saveSettings: (patch: Partial<PlatformSettings>) => send<PlatformSettings>('PATCH', '/settings', patch),

  workspaces: () => get<AdminWorkspace[]>('/workspaces'),
  createWorkspace: (input: {
    name: string; slug?: string; plan_id?: string; status?: ClientStatus; seats?: number; notes?: string;
    owner_name: string; owner_email: string; owner_passcode: string;
  }) => send<AdminWorkspace>('POST', '/workspaces', input),
  updateWorkspace: (id: string, patch: Partial<Pick<AdminWorkspace, 'name' | 'plan_id' | 'status' | 'seats' | 'notes'>>) =>
    send<AdminWorkspace>('PATCH', `/workspaces/${id}`, patch),
  viewAs: (id: string) => send<WorkspaceSessionPayload>('POST', `/workspaces/${id}/impersonate`),

  plans: () => get<Plan[]>('/plans'),
  createPlan: (p: Pick<Plan, 'name' | 'price' | 'seats' | 'features'>) => send<Plan>('POST', '/plans', p),
  updatePlan: (id: string, p: Pick<Plan, 'name' | 'price' | 'seats' | 'features'>) => send<Plan>('PATCH', `/plans/${id}`, p),
  deletePlan: (id: string) => send<{ ok: true }>('DELETE', `/plans/${id}`),
};
