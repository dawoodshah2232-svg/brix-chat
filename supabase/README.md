# Brix Chat — Supabase backend setup (one page)

Production-ready backend code: 5 Edge Functions, zero real keys in this repo.
Nothing here is deployed yet — follow the steps below in order.

## 1. Create the Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Save the project URL and the **anon** + **service_role** keys
   (Settings → API). The service_role key bypasses all security rules — keep it server-side only.

## 2. Run the migrations

In the SQL Editor (or `supabase db push` with the CLI), run the project's
schema migrations in order. They must create at least these tables/columns
(the functions below depend on them):

| Table | Key columns |
|---|---|
| `webhooks` | `id, property_id, url, events text[], secret, enabled, consecutive_failures, disabled_reason` |
| `webhook_deliveries` | `id, webhook_id, event, event_id, property_id, payload jsonb, status, attempt_count, http_status, latency_ms, last_error, next_attempt_at, claimed_at` |
| `tickets` | existing Phase-2 columns **+ `sla_breached boolean default false`** |
| `members` | existing columns **+ `email, passcode_hash, passcode_salt`** |
| `member_invites` | `id, workspace_id, display_name, role, email, token_hash, token_salt, used_at, expires_at` |

Plus the concurrency-safe queue-claim RPC:

```sql
create or replace function claim_pending_webhook_deliveries(batch_size int default 50)
returns setof webhook_deliveries language plpgsql security definer as $$
begin
  return query
  update webhook_deliveries d set claimed_at = now()
  where d.id in (
    select id from webhook_deliveries
    where status in ('pending','failed')
      and next_attempt_at <= now()
      and (claimed_at is null or claimed_at < now() - interval '10 minutes')
    order by next_attempt_at asc limit batch_size
    for update skip locked
  )
  returning d.*;
end $$;
```

## 3. Deploy the functions

```bash
supabase link --project-ref <your-project-ref>
supabase functions deploy webhook-dispatcher ai-copilot send-email sla-checker invites
```

## 4. Set the secrets (server-side only — never commit these)

```bash
supabase secrets set \
  OPENAI_API_KEY=sk-... \
  ANTHROPIC_API_KEY=sk-ant-... \
  RESEND_API_KEY=re_... \
  EMAIL_FROM="Brix Chat <noreply@brixchat.com>" \
  EMAIL_ALLOWED_SENDER_DOMAINS=brixchat.com \
  INVITE_APP_URL=https://app.brixchat.com \
  SLA_EMAIL_ASSIGNEE=true \
  COPILOT_DEFAULT_PROVIDER=openai
```

`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are injected
by the platform automatically — do not set them manually.

## 5. Wire the frontend `.env`

```bash
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

⚠️ **The service_role key NEVER goes in the frontend.** It lives only in
Supabase secrets / server environments.

## 6. Enable Realtime + cron

- **Realtime:** Dashboard → Database → Replication → enable the tables the
  dashboard subscribes to (`conversations`, `messages`, `tickets`).
- **Cron** (Dashboard → Edge Functions → select function → Cron triggers):
  - `sla-checker` → `*/15 * * * *` (every 15 min, service_role auth)
  - webhook retry sweeper → `*/5 * * * *` (every 5 min):
    `POST https://<ref>.supabase.co/functions/v1/webhook-dispatcher`
    with `Authorization: Bearer <service_role key>` and body `{ "retry": true }`
  - pg_cron alternative: `select cron.schedule('sla-check', '*/15 * * * *', $$ select net.http_post(...) $$);`
    (needs the `pg_cron` + `pg_net` extensions).

## 7. Test checklist

- [ ] `deno check supabase/functions/*/index.ts` passes locally.
- [ ] POST `webhook-dispatcher` with a test event → endpoint receives the
      `X-Brix-*` headers and the signature verifies (see `docs/WEBHOOKS.md`).
- [ ] `ai-copilot` returns a suggestion; prompts never appear in function logs.
- [ ] `send-email` delivers; wrong sender domain is refused.
- [ ] Create an invite → email arrives → `/accept` creates the member;
      reusing the token returns `410`.
- [ ] An overdue ticket is marked breached and fires `ticket.sla_breached`.

---

### Required secrets

| Secret | Where to get it | Used by |
|---|---|---|
| `OPENAI_API_KEY` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | ai-copilot (OpenAI provider) |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API keys | ai-copilot (Anthropic provider) |
| `RESEND_API_KEY` | [resend.com/api-keys](https://resend.com/api-keys) | send-email |
| `EMAIL_FROM` | Your verified Resend sender, e.g. `Brix Chat <noreply@yourdomain.com>` | send-email |
| `EMAIL_ALLOWED_SENDER_DOMAINS` | Your own domain(s), comma-separated | send-email (sender allowlist) |
| `INVITE_APP_URL` | Your deployed app URL (invite links point here) | invites |
| `SLA_EMAIL_ASSIGNEE` | `true`/`false` — your choice | sla-checker |
| `COPILOT_DEFAULT_PROVIDER` | `openai` or `anthropic` — your choice | ai-copilot |

Only set the provider key(s) you actually use. `OPENAI_MODEL` /
`ANTHROPIC_MODEL` are optional overrides (defaults: `gpt-4o-mini` /
`claude-sonnet-4-6`).

### Function reference

| Function | Endpoint | Auth |
|---|---|---|
| `webhook-dispatcher` | POST `{ event, property_id?, data }` / `{ retry: true }` | service_role |
| `ai-copilot` | POST `{ prompt, context?, tone?, mode?, provider? }` | user JWT |
| `send-email` | POST `{ to, subject, html?, text? }` | user JWT / service_role |
| `sla-checker` | POST (no body needed) | service_role (cron) |
| `invites` | POST `/create` · POST `/accept` | service_role · public (token) |
