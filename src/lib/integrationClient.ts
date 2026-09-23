// Brix Chat — integration connectivity client (phase 3, Worker D).
//
// Two modes, labeled honestly in the UI:
//   - 'local' (default): no Supabase configured. The Test button validates key
//     formats locally and explains what the backend will do. No network call.
//   - 'edge': VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set, so Supabase
//     is treated as enabled and the Test button pings the provider's Edge
//     Function with a side-effect-free dry run ({ dry_run: true } — every
//     documented function 400s on the missing real payload BEFORE touching a
//     provider API, so the ping never bills, sends, or posts anything).
//
// Endpoint names follow supabase/README.md (Worker B): ai-copilot,
// send-email, webhook-dispatcher. Providers with no documented function get
// local-format validation only, stated plainly. This module is deliberately
// self-contained (reads import.meta.env directly) so it never depends on
// another worker's in-progress files.

import { validateProvider, type FieldCheck, type IntegrationDef } from './integrations';

function readEnv(name: string): string {
  try {
    const v = (import.meta as unknown as { env?: Record<string, unknown> }).env?.[name];
    return typeof v === 'string' ? v.trim() : '';
  } catch {
    return '';
  }
}

/** Matches the transport's own rule: URL + anon key = backend enabled. */
export function supabaseEnabled(): boolean {
  return readEnv('VITE_SUPABASE_URL') !== '' && readEnv('VITE_SUPABASE_ANON_KEY') !== '';
}

function functionsBase(): string | null {
  const url = readEnv('VITE_SUPABASE_URL');
  return url ? url.replace(/\/+$/, '') + '/functions/v1' : null;
}

/** The assumed Edge Function URL for a provider's dry-run ping (null when
 *  local mode, or when no function is documented for the provider). */
export function edgeFunctionUrl(def: IntegrationDef): string | null {
  const base = functionsBase();
  return base && def.edgeFunction ? `${base}/${def.edgeFunction}` : null;
}

export interface IntegrationTestResult {
  mode: 'local' | 'edge';
  ok: boolean;
  checks: FieldCheck[];
  /** Honest one-line summary shown under the Test button. */
  summary: string;
  /** Extra detail (HTTP status, what was/wasn't verified). */
  detail?: string;
}

/**
 * Test a provider's stored credentials. Always validates formats locally
 * first; when Supabase is enabled AND a function is documented for the
 * provider, pings it with a dry run. Never reports a fake success — a
 * format-valid key is reported as exactly that, not as a live connection.
 */
export async function testIntegration(
  def: IntegrationDef,
  values: Record<string, string>,
): Promise<IntegrationTestResult> {
  const checks = validateProvider(def, values);
  const formatOk = checks.every((c) => c.ok);
  const url = supabaseEnabled() ? edgeFunctionUrl(def) : null;

  if (!formatOk) {
    return {
      mode: 'local',
      ok: false,
      checks,
      summary: 'Fix the fields marked below, then test again. No network call was made.',
      detail: url
        ? `Format validation only — the Edge Function (${url}) was not called.`
        : def.edgeFunction
          ? 'Format validation only. The live test pings the Edge Function once Supabase is connected (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY).'
          : 'Format validation only. No Edge Function is documented for this provider yet.',
    };
  }

  if (!url) {
    return {
      mode: 'local',
      ok: true,
      checks,
      summary: 'Key format valid (local check). No network call was made — this does not verify the credential with the provider.',
      detail: def.edgeFunction
        ? `Local stub — the live test will dry-run POST /functions/v1/${def.edgeFunction} once Supabase is connected.`
        : 'Local stub — no Edge Function is documented for this provider yet; live calls land with the backend phase.',
    };
  }

  // Supabase enabled + formats valid + documented function → honest dry-run ping.
  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 12000);
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: readEnv('VITE_SUPABASE_ANON_KEY') },
        body: JSON.stringify({ provider: def.id, dry_run: true }),
        signal: ctrl.signal,
      });
    } finally {
      window.clearTimeout(timer);
    }
    const body = (await res.json().catch(() => ({}))) as { code?: string; error?: string; message?: string };
    const code = body.code || body.error || '';
    if (res.ok) {
      return {
        mode: 'edge', ok: true, checks,
        summary: `Endpoint reachable — the function answered the dry run (HTTP ${res.status}). Key format is valid; the credential itself is verified on first real use.`,
        detail: `POST ${url} → HTTP ${res.status}${body.message ? ` — ${body.message}` : ''}`,
      };
    }
    if (res.status === 400 && code) {
      return {
        mode: 'edge', ok: true, checks,
        summary: `Endpoint reachable — it validated the request shape and refused the dry run (${code}) before touching any provider API. Key format is valid; nothing was billed, sent, or posted.`,
        detail: `POST ${url} → HTTP 400 (${code})`,
      };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        mode: 'edge', ok: true, checks,
        summary: 'Endpoint reachable, but it needs a signed-in dashboard session (user JWT) — the anonymous ping was refused as expected. Key format is valid.',
        detail: `POST ${url} → HTTP ${res.status}`,
      };
    }
    if (res.status === 404) {
      return {
        mode: 'edge', ok: false, checks,
        summary: 'The function is not deployed yet (HTTP 404). Key format is valid — deploy the function, then test again.',
        detail: `POST ${url} → HTTP 404`,
      };
    }
    return {
      mode: 'edge', ok: false, checks,
      summary: `Endpoint answered HTTP ${res.status}${code ? ` (${code})` : ''}. Key format is valid — check the function logs.`,
      detail: `POST ${url} → HTTP ${res.status}`,
    };
  } catch (e) {
    const reason = e instanceof DOMException && e.name === 'AbortError'
      ? 'timed out after 12s'
      : 'unreachable (network error or CORS)';
    return {
      mode: 'edge', ok: false, checks,
      summary: `Could not reach the Edge Function (${reason}). The key format itself is valid.`,
      detail: `POST ${url} failed: ${reason}`,
    };
  }
}
