// Brix Chat — invites
//
// Team member invites.
//
// POST /create  (service_role only)
//   { display_name, role, email? }
//   → generates a one-time invite token (hashed at rest), stores the invite,
//     and emails the invite link via the send-email function when an email is
//     provided. Returns the token + link ONCE — it cannot be retrieved again.
//
// POST /accept  (public — the invite token is the credential)
//   { invite_id, token, display_name?, passcode }
//   → verifies the token, creates the member with the chosen display name and
//     passcode (passcode hashed at rest), and marks the invite used.
//     Invites expire after 7 days and are single-use.
//
// Roles: admin | developer | agent | viewer (see docs/API.md).

import {
  HttpError,
  errorResponse,
  handleCors,
  invokeFunction,
  json,
  requireServiceRole,
  serviceClient,
} from "../_shared/http.ts";

const ROLES = ["admin", "developer", "agent", "viewer"] as const;
const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // unambiguous, no look-alikes
const TOKEN_LENGTH = 16;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function randomToken(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join("");
}

function randomHex(bytes: number): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function hashSecret(salt: string, secret: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${salt}:${secret}`),
  );
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

function inviteLink(inviteId: string): string {
  const base = (Deno.env.get("INVITE_APP_URL") || "https://app.brixchat.com").replace(/\/+$/, "");
  return `${base}/invite/${inviteId}`;
}

async function createInvite(req: Request): Promise<Response> {
  requireServiceRole(req);
  const client = serviceClient();

  const body = (await req.json().catch(() => null)) as {
    display_name?: unknown;
    role?: unknown;
    email?: unknown;
  } | null;
  if (!body) throw new HttpError(400, "invalid_json", "Request body must be JSON");

  const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";
  if (displayName.length < 2 || displayName.length > 60) {
    throw new HttpError(400, "invalid_display_name", "display_name must be 2–60 characters");
  }
  const role = typeof body.role === "string" ? body.role : "";
  if (!ROLES.includes(role as (typeof ROLES)[number])) {
    throw new HttpError(400, "invalid_role", `role must be one of: ${ROLES.join(", ")}`);
  }
  const email = typeof body.email === "string" && body.email.trim() ? body.email.trim() : null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "invalid_email", "email is not a valid address");
  }

  const token = randomToken(TOKEN_LENGTH);
  const salt = randomHex(16);
  const tokenHash = await hashSecret(salt, token);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

  const { data, error } = await client
    .from("member_invites")
    .insert({
      display_name: displayName,
      role,
      email,
      token_hash: tokenHash,
      token_salt: salt,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error || !data) throw new HttpError(500, "invite_create_failed", error?.message ?? "insert failed");
  const inviteId = data.id as string;
  const link = inviteLink(inviteId);

  let emailStatus = "skipped";
  if (email) {
    try {
      const res = await invokeFunction("send-email", {
        to: email,
        subject: `You've been invited to Brix Chat`,
        text:
          `Hi ${displayName},\n\n` +
          `You've been invited to join the Brix Chat team as ${role}.\n\n` +
          `Accept your invite here: ${link}\n` +
          `One-time invite token: ${token}\n\n` +
          `This invite expires in 7 days and can only be used once.`,
        html:
          `<p>Hi ${escapeHtml(displayName)},</p>` +
          `<p>You've been invited to join the Brix Chat team as <strong>${escapeHtml(role)}</strong>.</p>` +
          `<p><a href="${escapeHtml(link)}">Accept your invite</a></p>` +
          `<p>One-time invite token: <code>${escapeHtml(token)}</code></p>` +
          `<p style="color:#666">This invite expires in 7 days and can only be used once.</p>`,
      });
      emailStatus = res.ok ? "sent" : `email_http_${res.status}`;
    } catch (e) {
      emailStatus = `email_error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  // Plaintext token is returned ONCE — only the hash is stored.
  console.log(JSON.stringify({ fn: "invites", action: "create", invite: inviteId, email: emailStatus }));
  return json({
    data: { invite_id: inviteId, invite_url: link, token, expires_at: expiresAt, email: emailStatus },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

async function acceptInvite(req: Request): Promise<Response> {
  const client = serviceClient();

  const body = (await req.json().catch(() => null)) as {
    invite_id?: unknown;
    token?: unknown;
    display_name?: unknown;
    passcode?: unknown;
  } | null;
  if (!body) throw new HttpError(400, "invalid_json", "Request body must be JSON");

  const inviteId = typeof body.invite_id === "string" ? body.invite_id : "";
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!inviteId || !token) {
    throw new HttpError(400, "invalid_invite", "invite_id and token are required");
  }

  const { data: invite, error } = await client
    .from("member_invites")
    .select("id, display_name, role, email, token_hash, token_salt, used_at, expires_at")
    .eq("id", inviteId)
    .maybeSingle();
  if (error) throw new HttpError(500, "invite_load_failed", error.message);
  if (!invite) throw new HttpError(404, "invite_not_found", "Invite not found");
  if (invite.used_at) throw new HttpError(410, "invite_used", "This invite has already been used");
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    throw new HttpError(410, "invite_expired", "This invite has expired");
  }

  const expected = await hashSecret(invite.token_salt as string, token);
  if (!constantTimeEqual(expected, invite.token_hash as string)) {
    throw new HttpError(401, "invalid_token", "Invite token is incorrect");
  }

  const displayName =
    typeof body.display_name === "string" && body.display_name.trim()
      ? body.display_name.trim()
      : String(invite.display_name);
  if (displayName.length < 2 || displayName.length > 60) {
    throw new HttpError(400, "invalid_display_name", "display_name must be 2–60 characters");
  }
  const passcode = typeof body.passcode === "string" ? body.passcode : "";
  if (passcode.length < 8 || passcode.length > 128) {
    throw new HttpError(400, "invalid_passcode", "passcode must be 8–128 characters");
  }

  const passcodeSalt = randomHex(16);
  const passcodeHash = await hashSecret(passcodeSalt, passcode);

  const { data: member, error: memErr } = await client
    .from("members")
    .insert({
      display_name: displayName,
      role: invite.role,
      email: invite.email,
      passcode_hash: passcodeHash,
      passcode_salt: passcodeSalt,
      status: "offline",
    })
    .select("id, display_name, role, email, status")
    .single();
  if (memErr || !member) throw new HttpError(500, "member_create_failed", memErr?.message ?? "insert failed");

  // Mark used only AFTER the member exists — single-use, and a failed accept keeps the invite valid.
  const { error: useErr } = await client
    .from("member_invites")
    .update({ used_at: new Date().toISOString() })
    .eq("id", inviteId)
    .is("used_at", null);
  if (useErr) {
    console.error(JSON.stringify({ fn: "invites", action: "accept", invite: inviteId, stage: "mark_used", error: useErr.message }));
  }

  console.log(JSON.stringify({ fn: "invites", action: "accept", invite: inviteId, member: member.id }));
  return json({ data: { member } });
}

async function handler(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const path = new URL(req.url).pathname.replace(/\/+$/, "");
    if (req.method === "GET") {
      return json({ ok: true, function: "invites", endpoints: ["POST /create", "POST /accept"] });
    }
    if (req.method !== "POST") {
      return json({ error: { code: "method_not_allowed", message: "Use POST" } }, 405);
    }
    if (path.endsWith("/create")) return await createInvite(req);
    if (path.endsWith("/accept")) return await acceptInvite(req);
    throw new HttpError(404, "not_found", "Use POST /create or POST /accept");
  } catch (err) {
    return errorResponse(err);
  }
}

Deno.serve(handler);
