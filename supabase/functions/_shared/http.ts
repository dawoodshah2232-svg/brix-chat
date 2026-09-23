// Shared helpers for Brix Chat Edge Functions.
// Imported via relative paths (../_shared/http.ts) — no extra deploy step needed.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/** Returns a Response for OPTIONS preflight, or null to continue. */
export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }
  return null;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return json({ error: { code: err.code, message: err.message } }, err.status);
  }
  console.error("unhandled function error", err);
  return json({ error: { code: "internal", message: "Internal error" } }, 500);
}

export function env(name: string, required = true): string {
  const v = Deno.env.get(name) ?? "";
  if (required && !v) throw new HttpError(500, "misconfigured", `Missing secret: ${name}`);
  return v;
}

/** Constant-time string comparison (avoids trivial timing leaks). */
function constantTimeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

/** Service-role only. Called by DB webhooks, cron, and other functions — never by browsers. */
export function requireServiceRole(req: Request): void {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const auth = req.headers.get("Authorization") ?? "";
  const apiKey = req.headers.get("apikey") ?? "";
  if (!constantTimeEqual(auth, `Bearer ${key}`) && !constantTimeEqual(apiKey, key)) {
    throw new HttpError(401, "unauthorized", "This endpoint requires the service_role key");
  }
}

/** Supabase client with the service_role key (bypasses RLS — internal use only). */
export function serviceClient(): SupabaseClient {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Invoke another Edge Function in this project with the service_role key. */
export async function invokeFunction(name: string, body: unknown, timeoutMs = 15000): Promise<Response> {
  const url = `${env("SUPABASE_URL")}/functions/v1/${name}`;
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        apikey: key,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

/** POST with an abort timeout; used for outbound webhook/email/provider calls. */
export async function postWithTimeout(
  url: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number,
): Promise<{ res: Response | null; latencyMs: number; error: string | null }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { method: "POST", headers, body, signal: ctrl.signal });
    return { res, latencyMs: Date.now() - started, error: null };
  } catch (e) {
    const msg = e instanceof Error && e.name === "AbortError" ? "timeout" : String(e);
    return { res: null, latencyMs: Date.now() - started, error: msg };
  } finally {
    clearTimeout(t);
  }
}
