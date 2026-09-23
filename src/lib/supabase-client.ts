// Brix Chat — Supabase client (transport layer).
//
// Lazy singleton: a client is created ONLY when both VITE_SUPABASE_URL and
// VITE_SUPABASE_ANON_KEY are present. No env vars => null => the app stays
// on its localStorage transport and never touches the network.
//
// SECURITY: the anon key is safe for the browser; the service-role key must
// NEVER be referenced in frontend code. If VITE_SUPABASE_SERVICE_ROLE_KEY
// is set we warn loudly and ignore it.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SERVICE_ROLE_ENV = 'VITE_SUPABASE_SERVICE_ROLE_KEY';

function readEnv(name: string): string | undefined {
  const v = (import.meta.env as Record<string, unknown>)[name];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

let warnedServiceRole = false;
function guardServiceRole(): void {
  if (warnedServiceRole) return;
  warnedServiceRole = true;
  if (readEnv(SERVICE_ROLE_ENV)) {
    // eslint-disable-next-line no-console
    console.warn(
      '[brix-chat] VITE_SUPABASE_SERVICE_ROLE_KEY is set but will be IGNORED. ' +
        'Service-role keys bypass RLS and must never ship in frontend code. ' +
        'Unset it and use VITE_SUPABASE_ANON_KEY only.',
    );
  }
}

/** True only when a usable Supabase backend is configured. */
export function isSupabaseEnabled(): boolean {
  guardServiceRole();
  return !!readEnv('VITE_SUPABASE_URL') && !!readEnv('VITE_SUPABASE_ANON_KEY');
}

let client: SupabaseClient | null = null;
let attempted = false;

/** Lazy singleton. Returns null when Supabase is not configured. */
export function getSupabase(): SupabaseClient | null {
  guardServiceRole();
  if (attempted) return client;
  attempted = true;
  const url = readEnv('VITE_SUPABASE_URL');
  const anon = readEnv('VITE_SUPABASE_ANON_KEY');
  if (!url || !anon) return null; // local-only mode
  client = createClient(url, anon, {
    // Persist the session so a future Supabase Auth sign-in (members linked
    // via members.auth_user_id) survives reloads — that is what unlocks the
    // RLS-authenticated table access the migrations were designed for.
    // Until such a sign-in exists this is a no-op: the app stays local-first.
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return client;
}

// ---------------------------------------------------------------------------
// Remote-change events (realtime → UI refresh)
// ---------------------------------------------------------------------------

export interface RemoteChange {
  /** 'conversations' | 'messages' | 'visitors' — the postgres table that changed. */
  table: 'conversations' | 'messages' | 'visitors';
  /** INSERT | UPDATE | DELETE */
  type: string;
  /** The new row (for INSERT/UPDATE) or old row (for DELETE). */
  row: Record<string, unknown>;
}

export type RemoteChangeListener = (change: RemoteChange) => void;

const listeners = new Set<RemoteChangeListener>();

/**
 * Subscribe to remote changes. UI keeps it simple: on any change, refetch
 * the affected list (e.g. conversations list / active thread) for the
 * property it is showing. The `row` carries `property_id` (conversations)
 * or `conversation_id` (messages) so the UI can ignore unrelated rows.
 *
 * Usage:
 *   const off = onRemoteChange((c) => { if (c.table === 'messages') reloadThread(); });
 *   // ... later: off()
 */
export function onRemoteChange(cb: RemoteChangeListener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function emitRemoteChange(change: RemoteChange): void {
  listeners.forEach((cb) => {
    try {
      cb(change);
    } catch (err) {
      // A bad listener must never break realtime for everyone else.
      // eslint-disable-next-line no-console
      console.warn('[brix-chat] onRemoteChange listener threw:', err);
    }
  });
}

let realtimeStarted = false;

/**
 * Start the realtime subscription (idempotent). Subscribes to INSERT/UPDATE/
 * DELETE on `conversations`, `messages` and `visitors` (the tables the
 * migration publishes to supabase_realtime) and forwards them to
 * onRemoteChange listeners. Called automatically by the Supabase transport;
 * no-op when Supabase is disabled.
 */
export function ensureBrixRealtime(): void {
  const sb = getSupabase();
  if (!sb || realtimeStarted) return;
  realtimeStarted = true;
  const forward = (table: RemoteChange['table']) => (payload: {
    eventType: string;
    new?: Record<string, unknown>;
    old?: Record<string, unknown>;
  }) => {
    emitRemoteChange({
      table,
      type: payload.eventType,
      row: (payload.new ?? payload.old ?? {}) as Record<string, unknown>,
    });
  };
  sb.channel('brix-chat-remote')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, forward('conversations'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, forward('messages'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'visitors' }, forward('visitors'))
    .subscribe();
}
