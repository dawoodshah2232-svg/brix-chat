// Brix Chat — webhook-dispatcher
//
// Two modes:
//   POST { event, property_id?, data, event_id? }  (service_role only)
//     → finds enabled webhooks subscribed to `event`, inserts one
//       webhook_deliveries row per endpoint, then flushes the queue.
//   POST { retry: true }  (service_role only)
//     → flushes pending deliveries (this is what the cron sweeper calls).
//
// Delivery contract (see docs/WEBHOOKS.md):
//   Signature = hex(HMAC-SHA256(secret, "<timestamp>.<raw_body>"))
//   Headers: Content-Type, X-Brix-Event, X-Brix-Event-Id, X-Brix-Timestamp,
//            X-Brix-Delivery-Attempt, X-Brix-Signature
// Retries: up to 5 attempts over ~24h (1m, 10m, 1h, 6h backoff), then `dead`.
// A webhook with 10 consecutive failures is auto-disabled.
// Queue claiming is concurrency-safe via the `claim_pending_webhook_deliveries`
// RPC (SELECT ... FOR UPDATE SKIP LOCKED) — see supabase/README.md for the SQL.

import {
  HttpError,
  errorResponse,
  handleCors,
  json,
  postWithTimeout,
  requireServiceRole,
  serviceClient,
} from "../_shared/http.ts";

const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_SECONDS = [60, 600, 3600, 21600]; // after attempts 1..4 ≈ 24h window
const MAX_CONSECUTIVE_FAILURES = 10;
const DELIVERY_TIMEOUT_MS = 10_000;
const CLAIM_BATCH_SIZE = 50;

type Delivery = {
  id: string;
  webhook_id: string;
  event: string;
  event_id: string;
  property_id: string | null;
  payload: Record<string, unknown>;
  attempt_count: number;
};

type Webhook = {
  id: string;
  url: string;
  secret: string;
  enabled: boolean;
  consecutive_failures: number | null;
};

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sign(secret: string, timestamp: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
  return hex(sig);
}

async function loadWebhooks(client: ReturnType<typeof serviceClient>, ids: string[]): Promise<Map<string, Webhook>> {
  const map = new Map<string, Webhook>();
  if (!ids.length) return map;
  const { data, error } = await client
    .from("webhooks")
    .select("id, url, secret, enabled, consecutive_failures")
    .in("id", ids);
  if (error) throw new HttpError(500, "webhooks_load_failed", error.message);
  for (const w of data ?? []) map.set(w.id, w as Webhook);
  return map;
}

async function attemptOne(
  client: ReturnType<typeof serviceClient>,
  d: Delivery,
  hook: Webhook,
): Promise<{ delivered: boolean; attempts: number; httpStatus: number | null; error: string | null }> {
  const attempt = d.attempt_count + 1;
  const rawBody = JSON.stringify(d.payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await sign(hook.secret, timestamp, rawBody);

  const { res, latencyMs, error } = await postWithTimeout(
    hook.url,
    {
      "Content-Type": "application/json",
      "X-Brix-Event": d.event,
      "X-Brix-Event-Id": d.event_id,
      "X-Brix-Timestamp": timestamp,
      "X-Brix-Delivery-Attempt": String(attempt),
      "X-Brix-Signature": signature,
    },
    rawBody,
    DELIVERY_TIMEOUT_MS,
  );

  const httpStatus = res ? res.status : null;
  const delivered = !!res && res.status >= 200 && res.status < 300;
  const attempts = attempt;
  const status = delivered ? "delivered" : attempts >= MAX_ATTEMPTS ? "dead" : "failed";
  const lastError = delivered
    ? null
    : error ?? `HTTP ${httpStatus}`;
  const nextAttemptAt =
    delivered || status === "dead"
      ? null
      : new Date(Date.now() + RETRY_DELAYS_SECONDS[attempts - 1] * 1000).toISOString();

  const { error: updErr } = await client
    .from("webhook_deliveries")
    .update({
      attempt_count: attempts,
      status,
      http_status: httpStatus,
      latency_ms: latencyMs,
      last_error: lastError,
      next_attempt_at: nextAttemptAt,
      claimed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", d.id);
  if (updErr) throw new HttpError(500, "delivery_update_failed", updErr.message);

  // Per-endpoint failure accounting → auto-disable after N consecutive failures.
  if (delivered) {
    await client.from("webhooks").update({ consecutive_failures: 0 }).eq("id", hook.id);
  } else {
    const fails = (hook.consecutive_failures ?? 0) + 1;
    const patch: Record<string, unknown> = { consecutive_failures: fails };
    if (fails >= MAX_CONSECUTIVE_FAILURES) {
      patch.enabled = false;
      patch.disabled_reason = `Auto-disabled after ${fails} consecutive delivery failures`;
    }
    await client.from("webhooks").update(patch).eq("id", hook.id);
  }

  return { delivered, attempts, httpStatus, error: lastError };
}

async function flushQueue(client: ReturnType<typeof serviceClient>) {
  // Concurrency-safe claim: the RPC updates + returns due rows with
  // SELECT ... FOR UPDATE SKIP LOCKED, so parallel sweepers never double-send.
  const { data: claimed, error } = await client.rpc("claim_pending_webhook_deliveries", {
    batch_size: CLAIM_BATCH_SIZE,
  });
  if (error) throw new HttpError(500, "queue_claim_failed", error.message);

  const deliveries = (claimed ?? []) as Delivery[];
  const hooks = await loadWebhooks(client, [...new Set(deliveries.map((d) => d.webhook_id))]);

  let delivered = 0;
  let failed = 0;
  let dead = 0;
  for (const d of deliveries) {
    const hook = hooks.get(d.webhook_id);
    if (!hook || !hook.enabled) {
      await client
        .from("webhook_deliveries")
        .update({
          status: "dead",
          last_error: "webhook missing or disabled",
          claimed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", d.id);
      dead++;
      continue;
    }
    const r = await attemptOne(client, d, hook);
    if (r.delivered) delivered++;
    else if (r.attempts >= MAX_ATTEMPTS) dead++;
    else failed++;
  }
  return { processed: deliveries.length, delivered, failed, dead };
}

async function enqueue(
  client: ReturnType<typeof serviceClient>,
  body: Record<string, unknown>,
) {
  const { event, property_id = null, data, event_id = crypto.randomUUID() } = body;
  if (!event || typeof event !== "string") {
    throw new HttpError(400, "invalid_event", "body.event (string) is required");
  }
  if (typeof data !== "object" || data === null) {
    throw new HttpError(400, "invalid_data", "body.data (object) is required");
  }

  let q = client.from("webhooks").select("id").eq("enabled", true).contains("events", [event]);
  if (property_id) q = q.eq("property_id", property_id);
  const { data: hooks, error } = await q;
  if (error) throw new HttpError(500, "webhooks_load_failed", error.message);

  const payload = {
    event,
    event_id,
    property_id,
    timestamp: new Date().toISOString(),
    data,
  };
  const now = new Date().toISOString();
  const rows = (hooks ?? []).map((h: { id: string }) => ({
    webhook_id: h.id,
    event,
    event_id,
    property_id,
    payload,
    status: "pending",
    next_attempt_at: now,
  }));
  if (rows.length) {
    const { error: insErr } = await client.from("webhook_deliveries").insert(rows);
    if (insErr) throw new HttpError(500, "deliveries_insert_failed", insErr.message);
  }

  const flushed = await flushQueue(client);
  return { enqueued: rows.length, event, event_id, ...flushed };
}

async function handler(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    if (req.method === "GET") {
      return json({ ok: true, function: "webhook-dispatcher", now: new Date().toISOString() });
    }
    if (req.method !== "POST") {
      return json({ error: { code: "method_not_allowed", message: "Use POST" } }, 405);
    }
    requireServiceRole(req);

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) throw new HttpError(400, "invalid_json", "Request body must be JSON");

    const client = serviceClient();
    if (body.retry === true) {
      const flushed = await flushQueue(client);
      return json({ data: { mode: "retry_sweep", ...flushed } });
    }
    if (body.event) {
      const result = await enqueue(client, body);
      return json({ data: result });
    }
    throw new HttpError(400, "invalid_body", "Provide { event, property_id?, data } or { retry: true }");
  } catch (err) {
    return errorResponse(err);
  }
}

// The edge runtime invokes this handler.
Deno.serve(handler);
