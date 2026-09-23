// Brix Chat — send-email
//
// POST { to, subject, html?, text? }  (authenticated dashboard calls, or
// service_role from other functions like invites / sla-checker)
//
// Sends via the Resend API. At least one of `html` / `text` is required.
// `to` may be a single address or an array of addresses.
//
// Secrets: RESEND_API_KEY, EMAIL_FROM (e.g. "Brix Chat <noreply@brixchat.com>")
// Optional: EMAIL_ALLOWED_SENDER_DOMAINS (comma-separated, e.g. "brixchat.com,mail.brixchat.com")
//   If set, the EMAIL_FROM domain MUST be on the allowlist or the send is refused.

import {
  HttpError,
  errorResponse,
  handleCors,
  json,
  postWithTimeout,
} from "../_shared/http.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_TIMEOUT_MS = 15_000;
const MAX_RECIPIENTS = 50;

async function handler(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    if (req.method === "GET") {
      return json({ ok: true, function: "send-email" });
    }
    if (req.method !== "POST") {
      return json({ error: { code: "method_not_allowed", message: "Use POST" } }, 405);
    }
    // JWT verification is enforced by the platform (verify_jwt = true in config.toml).
    // Internal callers (invites, sla-checker) pass the service_role key instead.

    const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
    if (!apiKey) throw new HttpError(500, "misconfigured", "RESEND_API_KEY is not set");
    const from = Deno.env.get("EMAIL_FROM") ?? "";
    if (!from) throw new HttpError(500, "misconfigured", "EMAIL_FROM is not set");

    // Sender domain allowlist check.
    const allowlist = (Deno.env.get("EMAIL_ALLOWED_SENDER_DOMAINS") ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (allowlist.length) {
      const m = from.match(/@([^>]+)>?$/);
      const domain = (m?.[1] ?? "").trim().toLowerCase();
      if (!allowlist.includes(domain)) {
        throw new HttpError(
          500,
          "sender_not_allowed",
          `EMAIL_FROM domain "${domain}" is not in EMAIL_ALLOWED_SENDER_DOMAINS`,
        );
      }
    }

    const body = (await req.json().catch(() => null)) as {
      to?: unknown;
      subject?: unknown;
      html?: unknown;
      text?: unknown;
    } | null;
    if (!body) throw new HttpError(400, "invalid_json", "Request body must be JSON");

    const recipients = Array.isArray(body.to) ? body.to : [body.to];
    if (recipients.length === 0 || recipients.length > MAX_RECIPIENTS) {
      throw new HttpError(400, "invalid_to", `Provide 1–${MAX_RECIPIENTS} recipient addresses`);
    }
    const to = recipients.map((r) => String(r ?? "").trim());
    for (const addr of to) {
      if (!EMAIL_RE.test(addr)) throw new HttpError(400, "invalid_to", `Invalid email address: ${addr}`);
    }

    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    if (!subject) throw new HttpError(400, "invalid_subject", "body.subject is required");

    const html = typeof body.html === "string" && body.html.trim() ? body.html : undefined;
    const text = typeof body.text === "string" && body.text.trim() ? body.text : undefined;
    if (!html && !text) {
      throw new HttpError(400, "invalid_body", "Provide at least one of body.html / body.text");
    }

    const { res, error } = await postWithTimeout(
      "https://api.resend.com/emails",
      { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      JSON.stringify({ from, to, subject, ...(html ? { html } : {}), ...(text ? { text } : {}) }),
      RESEND_TIMEOUT_MS,
    );
    if (error === "timeout") throw new HttpError(504, "email_timeout", "Email provider timed out");
    if (error) throw new HttpError(502, "email_provider_error", `Email provider unreachable: ${error}`);
    const r = res!;
    const resp = await r.json().catch(() => null);
    if (!r.ok) {
      throw new HttpError(502, "email_send_failed", resp?.message ?? `Email provider error: HTTP ${r.status}`);
    }

    console.log(JSON.stringify({ fn: "send-email", recipients: to.length, ok: true }));
    return json({ data: { id: resp?.id ?? null } });
  } catch (err) {
    return errorResponse(err);
  }
}

Deno.serve(handler);
