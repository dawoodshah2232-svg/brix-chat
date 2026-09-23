# Brix Chat — Supabase migrations

## What each file does

| File | Purpose |
|---|---|
| `001_brix_core.sql` | Full schema: 34 tables (workspaces, properties, members + member_credentials, departments, conversations, messages, conversation_notes, visitors, contacts, contact_events, goals, goal_events, campaigns, tickets + SLA, ratings, kb_categories/articles, canned_categories/responses, ticket_categories, triggers, notifications, saved_views, plays, unanswered_questions, webhooks, webhook_deliveries, api_keys, audit_log, branding, property_settings, integrations). UUID PKs, `created_at`/`updated_at` + `touch_updated_at()` trigger, indexes, RLS on every table, role-based policies, least-privilege grants, SECURITY DEFINER RPCs, realtime publication. |
| `002_seed_demo.sql` | Demo data: workspace `demo`, property `Demo Store` with public key `bx_demo_7f3a9c1e`, 3 members (Demo Agent/admin, Sara/agent, Omar/viewer), 2 departments (Sales, Support), branding + property settings, 1 sample conversation (3 messages), 1 ticket, 3 canned responses, 2 KB categories + 2 articles, 10 integration registry rows (disabled). Idempotent — skips if the demo workspace exists. |

## How to apply

**Option A — Supabase SQL editor** (dashboard → SQL editor → New query): paste `001_brix_core.sql`, run; then paste `002_seed_demo.sql`, run. Order matters.

**Option B — Supabase CLI** (from the repo root, after `supabase init` + `supabase link`):

```bash
supabase db push   # applies everything under supabase/migrations in order
```

## Rollback

- There is no automatic down-migration. To roll back 002, delete the demo workspace row — every table cascades from `workspaces` (`on delete cascade`), so `delete from workspaces where slug = 'demo'` removes all seeded rows.
- To roll back 001 (destructive, wipes all data): drop the tables in reverse dependency order, or simply `drop schema public cascade; create schema public;` on a scratch project. Never run this on a project with data you need.

## Security model (read before building on this)

- **RLS is enabled on every table.** Policies are workspace-scoped via `current_member_id()` (membership lookup: `members.auth_user_id` = JWT `sub`). Roles: `admin` / `agent` / `developer` / `viewer`.
  - Chat content (conversations, messages, notes, visitors, contacts, contact events): read by admin/agent/viewer; written by admin/agent only. **Developers are deliberately excluded** — they manage keys/webhooks, not conversations.
  - Operational tables (tickets, campaigns, KB, canned, triggers, …): read by all members; written by admin/agent/developer. Viewers are read-only everywhere.
  - members / properties / departments / branding / settings: admin-managed. Webhooks, API keys, integrations: admin + developer.
  - `audit_log`: admin read; writes only via the `log_audit()` RPC or service role. `member_credentials`: **no policies, no grants** — deny-all; only `member_login()` / `member_set_passcode()` touch it.
- **Secrets:** `member_credentials.passcode_hash` is bcrypt (pgcrypto). `api_keys` stores only the SHA-256 hash + prefix (`bk_live_…`); the raw key is shown once at creation and never persisted. `webhooks.secret_encrypted` and `integrations.config` must be app-layer encrypted before insert — the columns are excluded from (or never granted to) member SELECTs.
- **anon surface:** `EXECUTE` on `widget_start_conversation`, `widget_post_message`, `widget_end_conversation`, `widget_submit_rating`, `widget_create_ticket`, and `member_login` — nothing else. No direct table access for anon. `widget_post_message` **forces sender='visitor'** so the widget can never impersonate an agent, and validates the property's `bx_…` public key.
- **Known trade-offs:**
  - Passcode login (`member_login`) is brute-forceable for short numeric passcodes — rate-limit it at the edge / via an API gateway before exposing publicly.
  - Enum-like fields are TEXT + CHECK constraints (not PG enums) so new values don't need migrations; the app must validate values it writes.
  - Realtime is enabled for `conversations`, `messages`, `visitors` (RLS still applies per subscriber).

## After applying

1. Set the demo admin passcode (the seed stores a placeholder hash that can never authenticate):
   ```sql
   select public.member_set_passcode(
     (select id from members where display_name = 'Demo Agent'), '3456');
   ```
   Run as a workspace admin (or service role). Each member sets their own via the app afterwards.
2. Link dashboard users: set `members.auth_user_id = auth.users.id` when a user accepts an invite / signs up (or use the `create_workspace()` RPC for self-serve signup, which does this atomically).
3. Widget embed uses the property's `public_key` (`bx_…`) with the `widget_*` RPCs — never the service-role key in the browser.
