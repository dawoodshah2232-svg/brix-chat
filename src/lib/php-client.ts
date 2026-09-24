// Brix Chat — Plain-PHP REST API client (transport layer).
//
// Mirrors src/lib/supabase-client.ts 1:1:
//
//   isSupabaseEnabled()  ->  isPhpApiEnabled()
//   getSupabase()         ->  getPhpApi()
//   ensureBrixRealtime()  ->  ensurePhpPolling()
//   onRemoteChange / RemoteChange / RemoteChangeListener — the same event
//     shape as supabase-client (types shared); the PHP poller emits into a
//     transport-local bus and api.ts merges both buses into one
//     onRemoteChange() so UI subscribers never care which transport
//     produced the event.
//
// The client speaks the contract in docs/PHP_API.md: fetch() against
// VITE_API_URL (e.g. https://example.com/api), Bearer token from
// POST /auth/login, {data} envelopes, {items,next_cursor} pagination,
// {error:{code,message}} errors.
//
// SECURITY: the bearer token is a 30-day HMAC member session token. It lives
// in memory + sessionStorage only (never localStorage) so a closed tab ends
// the session. The token carries an expiry — when it lapses the client throws
// ApiError('auth_expired') so the UI can prompt for re-login.

import { ApiError } from './api';
import type { RemoteChange, RemoteChangeListener } from './supabase-client';

/** Transport-local remote-change bus for the PHP poller. api.ts merges this
 *  with the Supabase bus into the single exported onRemoteChange(). */
const phpListeners = new Set<RemoteChangeListener>();
export function onPhpRemoteChange(cb: RemoteChangeListener): () => void {
  phpListeners.add(cb);
  return () => {
    phpListeners.delete(cb);
  };
}
function emitPhpRemoteChange(change: RemoteChange): void {
  phpListeners.forEach((cb) => {
    try {
      cb(change);
    } catch {
      /* a broken subscriber must not break the poller */
    }
  });
}
export type { RemoteChange, RemoteChangeListener };

/** Loose PHP row — the transport maps these to the api.ts domain types. */
export type PhpRow = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface PhpPage<T> {
  items: T[];
  next_cursor: string | null;
}

export interface PhpLoginResult {
  token: string;
  workspace: PhpRow;
  member: PhpRow;
}

export interface PhpUpdateEvent {
  table: string;
  type: string;
  row: PhpRow;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_URL_ENV = 'VITE_API_URL';
const TOKEN_SS_KEY = 'brixchat_php_session_v1';

let baseUrlOverride: string | null = null;

function readEnv(name: string): string | undefined {
  // import.meta.env exists under Vite; under plain node it is undefined.
  const env = (import.meta as unknown as { env?: Record<string, unknown> } | undefined)?.env;
  const v = env?.[name];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/**
 * Test/dev hook: force the API base URL (e.g. http://127.0.0.1:8099/api).
 * In the app the URL always comes from the VITE_API_URL build var.
 */
export function configurePhpApi(baseUrl: string): void {
  baseUrlOverride = baseUrl.replace(/\/+$/, '');
  client = null;
}

function resolveBaseUrl(): string | null {
  if (baseUrlOverride) return baseUrlOverride;
  const v = readEnv(API_URL_ENV);
  return v ? v.replace(/\/+$/, '') : null;
}

/** True only when a PHP backend is configured (build-time VITE_API_URL or test override). */
export function isPhpApiEnabled(): boolean {
  return resolveBaseUrl() !== null;
}

// ---------------------------------------------------------------------------
// Token storage (memory + sessionStorage)
// ---------------------------------------------------------------------------

interface StoredSession {
  token: string;
  workspace: string;
}

let memToken: string | null = null;
let memWorkspace: string | null = null;

function readStoredSession(): StoredSession | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(TOKEN_SS_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    return s && typeof s.token === 'string' && s.token ? s : null;
  } catch {
    return null;
  }
}

function writeStoredSession(s: StoredSession | null): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (s) sessionStorage.setItem(TOKEN_SS_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(TOKEN_SS_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Decode the token's exp (seconds) -> ms, or null when unreadable. */
function tokenExpiryMs(token: string): number | null {
  try {
    const payload = token.split('.')[0];
    const json = JSON.parse(
      // atob is global in browsers and in node >= 16.
      atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { exp?: unknown };
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Clear the stored PHP session (logout / expired token). */
export function clearPhpToken(): void {
  memToken = null;
  memWorkspace = null;
  writeStoredSession(null);
  const c = client;
  if (c) c.forgetToken();
}

// ---------------------------------------------------------------------------
// Error mapping — PHP {error:{code,message}} + HTTP status -> ApiError
// ---------------------------------------------------------------------------

function phpError(status: number, code: string, message: string): ApiError {
  const msg = message || 'PHP API request failed.';
  switch (code) {
    case 'validation':
      return new ApiError('validation', msg, 422);
    case 'not_found':
    case 'gone':
      return new ApiError('not_found', msg, code === 'gone' ? 410 : 404);
    case 'conflict':
      return new ApiError('conflict', msg, 409);
    case 'not_supported':
    case 'not_configured':
      return new ApiError('not_supported', msg, 501);
    case 'unauthorized':
      return new ApiError('unauthorized', msg, status || 401);
    default:
      if (status === 401) return new ApiError('unauthorized', msg, 401);
      if (status === 403) return new ApiError('unauthorized', msg, 403);
      if (status === 404) return new ApiError('not_found', msg, 404);
      if (status === 422) return new ApiError('validation', msg, 422);
      if (status === 409) return new ApiError('conflict', msg, 409);
      return new ApiError('php_error', msg, status || 500);
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface PhpRequestOpts {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** false for the public endpoints (login, invite accept, copilot probe). */
  auth?: boolean;
}

export class PhpApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    // Rehydrate a surviving tab session.
    const s = readStoredSession();
    if (s) {
      memToken = s.token;
      memWorkspace = s.workspace;
      this.token = s.token;
    } else if (memToken) {
      this.token = memToken;
    }
  }

  get url(): string {
    return this.baseUrl;
  }

  /** A usable (non-expired) token is present. */
  hasToken(): boolean {
    const t = this.token ?? memToken;
    if (!t) return false;
    const exp = tokenExpiryMs(t);
    return exp === null || exp > Date.now();
  }

  /** Workspace slug the current token was issued for (if known). */
  get workspace(): string | null {
    return memWorkspace;
  }

  forgetToken(): void {
    this.token = null;
  }

  private authToken(): string | null {
    const t = this.token ?? memToken;
    if (!t) return null;
    const exp = tokenExpiryMs(t);
    if (exp !== null && exp <= Date.now()) {
      // Expired before we even hit the network — surface auth_expired now so
      // the UI can prompt for re-login instead of firing a doomed request.
      clearPhpToken();
      throw new ApiError('auth_expired', 'Your session has expired. Please sign in again.', 401);
    }
    return t;
  }

  /** Core request: JSON in, unwrapped {data} out, ApiError on failure. */
  async request<T>(path: string, opts: PhpRequestOpts = {}): Promise<T> {
    const method = (opts.method ?? 'GET').toUpperCase();
    let url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    if (opts.query) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
      }
      const s = qs.toString();
      if (s) url += `?${s}`;
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const useAuth = opts.auth !== false;
    const token = useAuth ? this.authToken() : null;
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
    } catch {
      throw new ApiError('php_unreachable', `Cannot reach the PHP API at ${this.baseUrl}.`, 503);
    }

    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      /* non-JSON body */
    }
    const body = (json ?? {}) as { data?: unknown; error?: { code?: string; message?: string } };

    if (!res.ok) {
      const code = body.error?.code ?? '';
      const message = body.error?.message ?? `Request failed (${res.status}).`;
      if (res.status === 401 && token) {
        // We sent a token and the server rejected it: expired, rotated
        // secret, or the member/workspace was deleted. Surface auth_expired
        // so the UI prompts for re-login instead of failing silently.
        clearPhpToken();
        throw new ApiError('auth_expired', 'Your session has expired. Please sign in again.', 401);
      }
      throw phpError(res.status, code, message);
    }
    return body.data as T;
  }

  private getData<T>(path: string, query?: PhpRequestOpts['query'], auth = true): Promise<T> {
    return this.request<T>(path, { query, auth });
  }

  private page<T>(path: string, query?: PhpRequestOpts['query']): Promise<PhpPage<T>> {
    return this.request<PhpPage<T>>(path, { query });
  }

  private postData<T>(path: string, body?: unknown, query?: PhpRequestOpts['query']): Promise<T> {
    return this.request<T>(path, { method: 'POST', body, query });
  }

  private patchData<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body });
  }

  private deleteData<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  // ---- auth ---------------------------------------------------------------
  auth = {
    login: async (workspace: string, passcode: string, displayName = ''): Promise<PhpLoginResult> => {
      const data = await this.request<PhpLoginResult>('/auth/login', {
        method: 'POST',
        auth: false,
        body: {
          workspace: workspace.trim().toLowerCase(),
          display_name: displayName.trim(),
          passcode,
        },
      });
      this.token = data.token;
      memToken = data.token;
      memWorkspace = workspace.trim().toLowerCase();
      writeStoredSession({ token: data.token, workspace: memWorkspace });
      return data;
    },
    logout: async (): Promise<void> => {
      try {
        await this.request('/auth/logout', { method: 'POST' });
      } finally {
        clearPhpToken();
      }
    },
    me: (): Promise<{ member: PhpRow; workspace: PhpRow }> => this.getData('/auth/me'),
  };

  // ---- workspaces ----------------------------------------------------------
  workspaces = {
    current: (): Promise<PhpRow> => this.getData('/workspaces/current'),
  };

  // ---- properties ----------------------------------------------------------
  properties = {
    list: async (): Promise<PhpRow[]> => (await this.page<PhpRow>('/properties')).items,
    get: (id: string): Promise<PhpRow> => this.getData(`/properties/${id}`),
    getByPublicKey: (publicKey: string): Promise<PhpRow> =>
      this.getData(`/properties/by-key/${encodeURIComponent(publicKey)}`),
    create: (input: Record<string, unknown>): Promise<PhpRow> => this.postData('/properties', input),
    patch: (id: string, patch: Record<string, unknown>): Promise<PhpRow> =>
      this.patchData(`/properties/${id}`, patch),
    remove: (id: string): Promise<{ deleted: boolean }> => this.deleteData(`/properties/${id}`),
    regenerateKey: (id: string): Promise<{ public_key: string }> =>
      this.postData(`/properties/${id}/regenerate-key`),
    getWidgetConfig: (id: string): Promise<PhpRow> => this.getData(`/properties/${id}/widget-config`),
    patchWidgetConfig: (id: string, patch: Record<string, unknown>): Promise<PhpRow> =>
      this.patchData(`/properties/${id}/widget-config`, patch),
    getSettings: (id: string): Promise<PhpRow> => this.getData(`/properties/${id}/settings`),
    patchSettings: (id: string, patch: Record<string, unknown>): Promise<PhpRow> =>
      this.patchData(`/properties/${id}/settings`, patch),
  };

  // ---- conversations -------------------------------------------------------
  conversations = {
    list: (filters?: Record<string, string | number | boolean | undefined | null>): Promise<PhpPage<PhpRow>> =>
      this.page('/conversations', filters),
    get: (id: string): Promise<PhpRow> => this.getData(`/conversations/${id}`),
    create: (input: Record<string, unknown>): Promise<PhpRow> => this.postData('/conversations', input),
    patch: (id: string, patch: Record<string, unknown>): Promise<PhpRow> =>
      this.patchData(`/conversations/${id}`, patch),
    remove: (id: string): Promise<{ deleted: boolean }> => this.deleteData(`/conversations/${id}`),
    messages: (id: string, query?: Record<string, string | number | undefined>): Promise<PhpPage<PhpRow>> =>
      this.page(`/conversations/${id}/messages`, query),
    sendMessage: (id: string, input: Record<string, unknown>): Promise<PhpRow> =>
      this.postData(`/conversations/${id}/messages`, input),
    notes: (id: string): Promise<PhpRow[]> => this.getData(`/conversations/${id}/notes`),
    addNote: (id: string, input: Record<string, unknown>): Promise<PhpRow> =>
      this.postData(`/conversations/${id}/notes`, input),
    assign: (id: string, memberId: string | null): Promise<PhpRow> =>
      this.postData(`/conversations/${id}/assign`, { member_id: memberId }),
    transfer: (id: string, target: Record<string, unknown>, note?: string): Promise<PhpRow> =>
      this.postData(`/conversations/${id}/transfer`, { ...target, note }),
    setStatus: (id: string, status: string): Promise<PhpRow> =>
      this.postData(`/conversations/${id}/status`, { status }),
    close: (id: string): Promise<PhpRow> => this.postData(`/conversations/${id}/close`),
    reopen: (id: string): Promise<PhpRow> => this.postData(`/conversations/${id}/reopen`),
    setTags: (id: string, tags: string[]): Promise<PhpRow> =>
      this.postData(`/conversations/${id}/tags`, { tags }),
    setRating: (id: string, score: number, comment?: string): Promise<PhpRow> =>
      this.postData(`/conversations/${id}/rating`, { score, comment }),
    markRead: (id: string): Promise<PhpRow> => this.postData(`/conversations/${id}/read`),
  };

  // ---- messages -------------------------------------------------------------
  messages = {
    patch: (id: string, patch: Record<string, unknown>): Promise<PhpRow> =>
      this.patchData(`/messages/${id}`, patch),
  };

  // ---- contacts --------------------------------------------------------------
  contacts = {
    list: (filters?: Record<string, string | number | undefined>): Promise<PhpPage<PhpRow>> =>
      this.page('/contacts', filters),
    get: (id: string): Promise<PhpRow> => this.getData(`/contacts/${id}`),
    create: (input: Record<string, unknown>): Promise<PhpRow> => this.postData('/contacts', input),
    patch: (id: string, patch: Record<string, unknown>): Promise<PhpRow> =>
      this.patchData(`/contacts/${id}`, patch),
    remove: (id: string): Promise<{ deleted: boolean }> => this.deleteData(`/contacts/${id}`),
  };

  contactEvents = {
    list: (contactId: string): Promise<PhpPage<PhpRow>> =>
      this.page('/contact-events', { contact_id: contactId }),
    create: (input: Record<string, unknown>): Promise<PhpRow> => this.postData('/contact-events', input),
    get: (id: string): Promise<PhpRow> => this.getData(`/contact-events/${id}`),
    patch: (id: string, patch: Record<string, unknown>): Promise<PhpRow> =>
      this.patchData(`/contact-events/${id}`, patch),
    remove: (id: string): Promise<{ deleted: boolean }> => this.deleteData(`/contact-events/${id}`),
  };

  // ---- tickets ------------------------------------------------------------------
  tickets = {
    list: (filters?: Record<string, string | number | undefined>): Promise<PhpPage<PhpRow>> =>
      this.page('/tickets', filters),
    get: (id: string): Promise<PhpRow> => this.getData(`/tickets/${id}`),
    create: (input: Record<string, unknown>): Promise<PhpRow> => this.postData('/tickets', input),
    patch: (id: string, patch: Record<string, unknown>): Promise<PhpRow> =>
      this.patchData(`/tickets/${id}`, patch),
    remove: (id: string): Promise<{ deleted: boolean }> => this.deleteData(`/tickets/${id}`),
    setStatus: (id: string, status: string): Promise<PhpRow> =>
      this.postData(`/tickets/${id}/status`, { status }),
    assign: (id: string, memberId: string | null): Promise<PhpRow> =>
      this.postData(`/tickets/${id}/assign`, { member_id: memberId }),
    setPriority: (id: string, priority: string): Promise<PhpRow> =>
      this.postData(`/tickets/${id}/priority`, { priority }),
    bulk: (ids: string[], patch: Record<string, unknown>): Promise<{ updated: number }> =>
      this.postData(`/tickets/bulk`, { ids, patch }),
    fromConversation: (conversationId: string): Promise<PhpRow> =>
      this.postData('/tickets/from-conversation', { conversation_id: conversationId }),
    merge: (id: string, targetId: string): Promise<PhpRow> =>
      this.postData(`/tickets/${id}/merge`, { target_id: targetId }),
    split: (id: string, input: Record<string, unknown>): Promise<PhpRow> =>
      this.postData(`/tickets/${id}/split`, input),
  };

  // ---- notifications ------------------------------------------------------------
  notifications = {
    list: (unreadOnly = false, query?: Record<string, string | number | undefined>): Promise<PhpPage<PhpRow>> =>
      this.page('/notifications', { ...query, ...(unreadOnly ? { unread: 1 } : {}) }),
    push: (input: Record<string, unknown>): Promise<PhpRow> => this.postData('/notifications/push', input),
    markRead: (id: string): Promise<PhpRow> => this.postData(`/notifications/${id}/read`),
    markAllRead: (): Promise<PhpRow> => this.postData('/notifications/read-all'),
    remove: (id: string): Promise<{ deleted: boolean }> => this.deleteData(`/notifications/${id}`),
  };

  // ---- ratings -------------------------------------------------------------------
  ratings = {
    create: (input: Record<string, unknown>): Promise<PhpRow> => this.postData('/ratings', input),
    list: (query?: Record<string, string | number | undefined>): Promise<PhpPage<PhpRow>> =>
      this.page('/ratings', query),
    summary: (propertyId: string): Promise<PhpRow> =>
      this.getData('/ratings/summary', { property_id: propertyId }),
  };

  // ---- metrics --------------------------------------------------------------------
  metrics = {
    chats: (days = 30): Promise<PhpRow[]> => this.getData('/metrics/chats', { days }),
    responseTimes: (): Promise<PhpRow> => this.getData('/metrics/response-times'),
    satisfaction: (): Promise<PhpRow> => this.getData('/metrics/satisfaction'),
    tickets: (): Promise<PhpRow> => this.getData('/metrics/tickets'),
  };

  // ---- departments -----------------------------------------------------------------
  departments = {
    list: (): Promise<PhpRow[]> => this.getData('/departments'),
    create: (input: Record<string, unknown>): Promise<PhpRow> => this.postData('/departments', input),
    get: (id: string): Promise<PhpRow> => this.getData(`/departments/${id}`),
    patch: (id: string, patch: Record<string, unknown>): Promise<PhpRow> =>
      this.patchData(`/departments/${id}`, patch),
    remove: (id: string): Promise<{ deleted: boolean }> => this.deleteData(`/departments/${id}`),
  };

  // ---- categories -------------------------------------------------------------------
  categories = {
    list: async (scope: string): Promise<PhpRow[]> => (await this.page<PhpRow>('/categories', { scope })).items,
    create: (input: Record<string, unknown>): Promise<PhpRow> => this.postData('/categories', input),
    patch: (id: string, scope: string, patch: Record<string, unknown>): Promise<PhpRow> =>
      this.patchData(`/categories/${id}`, { ...patch, scope }),
    remove: (id: string, scope: string): Promise<{ deleted: boolean }> =>
      this.request(`/categories/${id}?scope=${encodeURIComponent(scope)}`, { method: 'DELETE' }),
  };

  // ---- saved views --------------------------------------------------------------------
  savedViews = {
    list: async (): Promise<PhpRow[]> => (await this.page<PhpRow>('/saved-views')).items,
    create: (input: Record<string, unknown>): Promise<PhpRow> => this.postData('/saved-views', input),
    get: (id: string): Promise<PhpRow> => this.getData(`/saved-views/${id}`),
    patch: (id: string, patch: Record<string, unknown>): Promise<PhpRow> =>
      this.patchData(`/saved-views/${id}`, patch),
    remove: (id: string): Promise<{ deleted: boolean }> => this.deleteData(`/saved-views/${id}`),
  };

  // ---- plays ----------------------------------------------------------------------------
  plays = {
    list: async (): Promise<PhpRow[]> => (await this.page<PhpRow>('/plays')).items,
    create: (input: Record<string, unknown>): Promise<PhpRow> => this.postData('/plays', input),
    get: (id: string): Promise<PhpRow> => this.getData(`/plays/${id}`),
    patch: (id: string, patch: Record<string, unknown>): Promise<PhpRow> =>
      this.patchData(`/plays/${id}`, patch),
    remove: (id: string): Promise<{ deleted: boolean }> => this.deleteData(`/plays/${id}`),
    run: (id: string, conversationId: string): Promise<{ applied: string[] }> =>
      this.postData(`/plays/${id}/run`, { conversation_id: conversationId }),
  };

  // ---- goals ------------------------------------------------------------------------------
  goals = {
    list: async (): Promise<PhpRow[]> => (await this.page<PhpRow>('/goals')).items,
    create: (input: Record<string, unknown>): Promise<PhpRow> => this.postData('/goals', input),
    get: (id: string): Promise<PhpRow> => this.getData(`/goals/${id}`),
    patch: (id: string, patch: Record<string, unknown>): Promise<PhpRow> =>
      this.patchData(`/goals/${id}`, patch),
    remove: (id: string): Promise<{ deleted: boolean }> => this.deleteData(`/goals/${id}`),
    track: (id: string, conversationId: string | null, value?: number): Promise<PhpRow> =>
      this.postData(`/goals/${id}/track`, { conversation_id: conversationId, value }),
    funnel: (days = 30): Promise<PhpRow> => this.getData('/goals/funnel', { days }),
  };

  // ---- members ------------------------------------------------------------------------------
  members = {
    list: (): Promise<PhpRow[]> => this.getData('/members'),
    create: (input: Record<string, unknown>): Promise<PhpRow> => this.postData('/members', input),
    get: (id: string): Promise<PhpRow> => this.getData(`/members/${id}`),
    patch: (id: string, patch: Record<string, unknown>): Promise<PhpRow> =>
      this.patchData(`/members/${id}`, patch),
    remove: (id: string): Promise<{ deleted: boolean }> => this.deleteData(`/members/${id}`),
    setPasscode: (id: string, passcode: string): Promise<PhpRow> =>
      this.postData(`/members/${id}/passcode`, { passcode }),
    setStatus: (id: string, status: string): Promise<PhpRow> =>
      this.postData(`/members/${id}/status`, { status }),
    touchLogin: (id: string): Promise<PhpRow> => this.postData(`/members/${id}/touch-login`),
  };

  // ---- integrations ---------------------------------------------------------------------------
  integrations = {
    list: async (): Promise<PhpRow[]> => (await this.page<PhpRow>('/integrations')).items,
    patch: (provider: string, patch: Record<string, unknown>): Promise<PhpRow> =>
      this.patchData(`/integrations/${encodeURIComponent(provider)}`, patch),
  };

  // ---- unanswered -------------------------------------------------------------------------------
  unanswered = {
    list: (includeDismissed = false, query?: Record<string, string | number | undefined>): Promise<PhpPage<PhpRow>> =>
      this.page('/unanswered', { ...query, ...(includeDismissed ? { includeDismissed: 1 } : {}) }),
    create: (input: Record<string, unknown>): Promise<PhpRow> => this.postData('/unanswered', input),
    dismiss: (id: string): Promise<PhpRow> => this.postData(`/unanswered/${id}/dismiss`),
    promote: (id: string): Promise<PhpRow> => this.postData(`/unanswered/${id}/promote`),
  };

  // ---- audit log -----------------------------------------------------------------------------------
  auditLog = {
    list: (filters?: Record<string, string | number | undefined>): Promise<PhpPage<PhpRow>> =>
      this.page('/audit-log', filters),
    append: (input: Record<string, unknown>): Promise<PhpRow> => this.postData('/audit-log', input),
  };

  // ---- knowledge base ---------------------------------------------------------------------------------
  kb = {
    search: async (q: string): Promise<PhpRow[]> => (await this.page<PhpRow>('/kb/articles/search', { q })).items,
    list: (filters?: Record<string, string | number | undefined>): Promise<PhpPage<PhpRow>> =>
      this.page('/kb/articles', filters),
    create: (input: Record<string, unknown>): Promise<PhpRow> => this.postData('/kb/articles', input),
    get: (id: string): Promise<PhpRow> => this.getData(`/kb/articles/${id}`),
    patch: (id: string, patch: Record<string, unknown>): Promise<PhpRow> =>
      this.patchData(`/kb/articles/${id}`, patch),
    remove: (id: string): Promise<{ deleted: boolean }> => this.deleteData(`/kb/articles/${id}`),
  };

  // ---- canned responses ----------------------------------------------------------------------------------
  canned = {
    list: (filters?: Record<string, string | number | undefined>): Promise<PhpPage<PhpRow>> =>
      this.page('/canned', filters),
    create: (input: Record<string, unknown>): Promise<PhpRow> => this.postData('/canned', input),
    get: (id: string): Promise<PhpRow> => this.getData(`/canned/${id}`),
    patch: (id: string, patch: Record<string, unknown>): Promise<PhpRow> =>
      this.patchData(`/canned/${id}`, patch),
    remove: (id: string): Promise<{ deleted: boolean }> => this.deleteData(`/canned/${id}`),
  };

  // ---- triggers ---------------------------------------------------------------------------------------------
  triggers = {
    list: (filters?: Record<string, string | number | undefined>): Promise<PhpPage<PhpRow>> =>
      this.page('/triggers', filters),
    create: (input: Record<string, unknown>): Promise<PhpRow> => this.postData('/triggers', input),
    get: (id: string): Promise<PhpRow> => this.getData(`/triggers/${id}`),
    patch: (id: string, patch: Record<string, unknown>): Promise<PhpRow> =>
      this.patchData(`/triggers/${id}`, patch),
    remove: (id: string): Promise<{ deleted: boolean }> => this.deleteData(`/triggers/${id}`),
  };

  // ---- api keys --------------------------------------------------------------------------------------------------
  apiKeys = {
    list: async (): Promise<PhpRow[]> => (await this.page<PhpRow>('/api-keys')).items,
    create: (input: Record<string, unknown>): Promise<PhpRow> => this.postData('/api-keys', input),
    get: (id: string): Promise<PhpRow> => this.getData(`/api-keys/${id}`),
    reveal: (id: string): Promise<{ key: string | null }> => this.getData(`/api-keys/${id}/reveal`),
    rotate: (id: string): Promise<PhpRow> => this.postData(`/api-keys/${id}/rotate`),
    revoke: (id: string): Promise<PhpRow> => this.postData(`/api-keys/${id}/revoke`),
    remove: (id: string): Promise<{ deleted: boolean }> => this.deleteData(`/api-keys/${id}`),
  };

  // ---- webhooks -------------------------------------------------------------------------------------------------------
  webhooks = {
    list: async (): Promise<PhpRow[]> => (await this.page<PhpRow>('/webhooks')).items,
    create: (input: Record<string, unknown>): Promise<PhpRow> => this.postData('/webhooks', input),
    get: (id: string): Promise<PhpRow> => this.getData(`/webhooks/${id}`),
    patch: (id: string, patch: Record<string, unknown>): Promise<PhpRow> =>
      this.patchData(`/webhooks/${id}`, patch),
    remove: (id: string): Promise<{ deleted: boolean }> => this.deleteData(`/webhooks/${id}`),
    dispatch: (id: string, input: Record<string, unknown>): Promise<PhpRow> =>
      this.postData(`/webhooks/${id}/dispatch`, input),
    deliveries: (id: string, query?: Record<string, string | number | undefined>): Promise<PhpPage<PhpRow>> =>
      this.page(`/webhooks/${id}/deliveries`, query),
  };

  webhookDeliveries = {
    list: (filters?: Record<string, string | number | undefined>): Promise<PhpPage<PhpRow>> =>
      this.page('/webhook-deliveries', filters),
    get: (id: string): Promise<PhpRow> => this.getData(`/webhook-deliveries/${id}`),
  };

  // ---- invites ----------------------------------------------------------------------------------------------------------------
  invites = {
    create: (input: Record<string, unknown>): Promise<PhpRow> => this.postData('/invites', input),
    list: async (): Promise<PhpRow[]> => (await this.page<PhpRow>('/invites')).items,
    accept: (input: Record<string, unknown>): Promise<PhpRow> =>
      this.postData('/invites/accept', input),
  };

  // ---- visitors ------------------------------------------------------------------------------------------------------------------
  visitors = {
    list: (filters?: Record<string, string | number | undefined>): Promise<PhpPage<PhpRow>> =>
      this.page('/visitors', filters),
    create: (input: Record<string, unknown>): Promise<PhpRow> => this.postData('/visitors', input),
    get: (id: string): Promise<PhpRow> => this.getData(`/visitors/${id}`),
    patch: (id: string, patch: Record<string, unknown>): Promise<PhpRow> =>
      this.patchData(`/visitors/${id}`, patch),
    remove: (id: string): Promise<{ deleted: boolean }> => this.deleteData(`/visitors/${id}`),
  };

  // ---- ai copilot -------------------------------------------------------------------------------------------------------------------
  copilot = {
    probe: (): Promise<PhpRow> => this.getData('/ai/copilot', undefined, false),
    ask: (input: Record<string, unknown>): Promise<PhpRow> => this.postData('/ai/copilot', input),
  };

  // ---- email ----------------------------------------------------------------------------------------------------------------------------
  email = {
    send: (input: Record<string, unknown>): Promise<{ id: string }> => this.postData('/email/send', input),
  };

  // ---- updates (polling realtime) ----------------------------------------------------------------------------------------------------------
  updates = {
    since: (sinceIso: string): Promise<{ events: PhpUpdateEvent[]; server_time: string }> =>
      this.getData('/updates', { since: sinceIso }),
  };
}

let client: PhpApiClient | null = null;

/** Lazy singleton. Null when no PHP backend is configured. */
export function getPhpApi(): PhpApiClient | null {
  const base = resolveBaseUrl();
  if (!base) return null;
  if (!client) client = new PhpApiClient(base);
  return client;
}

// ---------------------------------------------------------------------------
// Polling realtime (replaces postgres_changes for the PHP transport)
// ---------------------------------------------------------------------------

let pollingStarted = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollSince: string | null = null;

const POLL_TABLES: ReadonlySet<string> = new Set(['conversations', 'messages', 'visitors']);

/**
 * Start polling GET /updates?since= (idempotent). Mirrors
 * ensureBrixRealtime(): every ~5s the client asks the PHP API for
 * conversation/message/visitor changes since the last poll and forwards them
 * into the shared onRemoteChange bus. Called automatically by the PHP
 * transport; no-op when the PHP backend is not configured or no session
 * token exists yet (ticks are skipped quietly until login).
 */
export function ensurePhpPolling(intervalMs = 5000): void {
  if (pollingStarted || !isPhpApiEnabled()) return;
  pollingStarted = true;
  pollSince = new Date().toISOString();
  const tick = async (): Promise<void> => {
    try {
      const api = getPhpApi();
      if (!api || !api.hasToken()) return; // not signed in — skip quietly
      const { events, server_time } = await api.updates.since(pollSince ?? new Date().toISOString());
      if (server_time) pollSince = server_time;
      for (const e of events ?? []) {
        if (!e || !POLL_TABLES.has(e.table)) continue;
        emitPhpRemoteChange({
          table: e.table as RemoteChange['table'],
          type: typeof e.type === 'string' && e.type ? e.type : 'UPDATE',
          row: (e.row ?? {}) as Record<string, unknown>,
        });
      }
    } catch {
      // Polling must never break the app: auth_expired and network blips
      // surface through the normal API calls (the store logs the user out on
      // auth_expired); the next tick simply retries.
    }
  };
  void tick();
  pollTimer = setInterval(tick, intervalMs);
  // Don't keep a node test process alive on the interval.
  const t = pollTimer as unknown as { unref?: () => void };
  if (typeof t.unref === 'function') t.unref();
}

/** Stop polling (tests / teardown). Idempotent. */
export function stopPhpPolling(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  pollingStarted = false;
  pollSince = null;
}
