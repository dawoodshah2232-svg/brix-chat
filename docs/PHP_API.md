# Brix Chat — Plain-PHP REST API

Single-entry PHP 8 + PDO (MySQL/MariaDB) port of the Brix Chat backend. No
framework, no Composer — deployable on plain cPanel shared hosting.

- Entry point: `api/index.php` (clean URLs via `api/.htaccess`:
  `/api/<route>` → `index.php?route=<route>`).
- Dev/test: `php -S 127.0.0.1:8099 api/router.php` (the `.htaccess` does not
  apply to PHP's built-in server; `router.php` performs the same
  `/api/<route>` → `?route=` translation and never serves `config.php` raw).
- Config: copy `api/config.sample.php` to `api/config.php` (git-ignored) and
  fill in DB credentials + `APP_SECRET`.
- Schema: `mysql/schema.sql` (35 tables). The API follows it exactly.

## 1. Envelopes

Success: `{ "data": <T> }`. Lists: `{ "data": { "items": [...],
"next_cursor": "<id>" | null } }`.

Errors: `{ "error": { "code": "<code>", "message": "<msg>" } }` with HTTP
status. Codes: `validation` (422), `not_found` (404), `conflict` (409),
`unauthorized` (401), `gone` (410), `not_supported` (501), `not_configured`
(501), `supabase_error` (500), plus `ai_*` / `email_failed` for the AI and
email endpoints.

## 2. Pagination

Cursor-based. Cursor = last item's `id`. Query: `?cursor=<id>&limit=<n>`
(default 50, max 200). `next_cursor` = last item id when more rows remain,
else `null`. Tuple comparison on the sort key (no offset drift).

## 3. Timestamps & IDs

- All `*_at` fields: ISO-8601 UTC `2026-09-24T14:30:00.000Z` (milliseconds, `Z`).
- Exceptions (epoch-millisecond **numbers**): `ratings.created_at`,
  `departments.created_at`, `categories.created_at`.
- All IDs are UUID v4 strings. Client-supplied IDs are accepted verbatim on
  create (`{"id": "<uuid>", ...}`); otherwise the server mints one.

## 4. Auth

`POST /auth/login` with `{workspace, display_name, passcode}` returns a
bearer token. Pass it as `Authorization: Bearer <token>`.

Token format: `base64url({wid, mid, exp}).base64url(HMAC-SHA256(payload,
APP_SECRET))`, `exp` = now + 30 days. Payload values are UUIDs; `wid`/`mid`
are looked up on every request and the token is rejected if the workspace or
member no longer exists.

Passcodes are bcrypt-hashed (`member_credentials.passcode_hash`), min length
4 for login/set, 8–128 for invite accept. Never returned (always `""`).

### Role matrix (from the audited RLS design)

| role      | read | write | notes |
|-----------|------|-------|-------|
| admin     | ✓    | ✓     | full access incl. members, api-keys, webhooks, audit-log, invites |
| agent     | ✓    | ✓     | no member/admin surfaces |
| developer | ✓    | ✓     | **cannot read chat content** (conversations/messages/visitors/contact data) |
| viewer    | ✓    | ✗     | read-only |

Every query is workspace-scoped (`workspace_id = :wid`); cross-workspace
access returns 403/404.

### Public (no token) endpoints

- `POST /auth/login`, `POST /auth/logout`
- `POST /invites/accept` (the invite token is the credential)
- `GET /ai/copilot` (capability probe only)

Everything else requires a bearer token.

## 5. CORS

Only the configured `SITE_ORIGIN` receives `Access-Control-Allow-Origin`
(plus `http://localhost:*` dev origins when `APP_DEBUG=1`). `OPTIONS`
preflights return 204.

## 6. Endpoint reference

Auth column: `A` = any authenticated member, `W` = write permission required,
`admin` = admin role only. All paths are prefixed with `/api/`.

### auth
| Method | Path | Auth | Body / params | Response |
|--------|------|------|---------------|----------|
| POST | `/auth/login` | public | `{workspace, display_name, passcode}` | `{token, workspace, member}` |
| POST | `/auth/logout` | A | — | `{ok:true}` (client discards token) |
| GET | `/auth/me` | A | — | member |

### workspaces
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/workspaces` | admin | `{name, slug?}` (slug auto-derived, unique) |
| GET | `/workspaces/current` | A | caller's workspace |
| PATCH | `/workspaces/current` | admin | `{name?, slug?}` |
| DELETE | `/workspaces/current` | admin | refuses when members exist (409) |

### properties
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/properties` | A | `{items,next_cursor:null}` |
| POST | `/properties` | W | `{name, domain?, color?, ...}`; `public_key` = `bx_`+18 hex |
| GET | `/properties/:id` | A | |
| PATCH | `/properties/:id` | W | |
| DELETE | `/properties/:id` | W | |
| GET | `/properties/by-key/:publicKey` | A | public widget key lookup |
| POST | `/properties/:id/regenerate-key` | W | rotates `public_key` |
| GET | `/properties/:id/widget-config` | A | merged over defaults |
| PATCH | `/properties/:id/widget-config` | W | deep-merge patch |
| GET | `/properties/:id/settings` | A | branding + property_settings merged |
| PATCH | `/properties/:id/settings` | W | upserts both rows (create-on-first-write) |

Widget defaults: `color #4f46e5`, `position bottom-right`, `bubble round`,
`greeting`, `offline_text`, `agent_name "Support Team"`, `show_branding true`,
`prechat_form false`.

### conversations
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/conversations` | A | filters: `status, propertyId, departmentId, agentId, q, tag, unread`; cursor |
| POST | `/conversations` | W | `{property_id, name?, email?, page_url?, referrer?, tags?, priority?}`; auto-assigns Support dept; posts widget greeting |
| GET | `/conversations/:id` | A | hydrated (agent, department, notes, messages, tags) |
| PATCH | `/conversations/:id` | W | `{status?, priority?, department_id?, subject?}` |
| DELETE | `/conversations/:id` | W | |
| GET | `/conversations/:id/messages` | A | cursor, oldest-first |
| POST | `/conversations/:id/messages` | W | `{sender, text, kind?, metadata?}`; visitor msg → `unread+1`; any send reopens |
| GET | `/conversations/:id/notes` | A | `{items,next_cursor:null}` |
| POST | `/conversations/:id/notes` | W | `{text, author?}` |
| POST | `/conversations/:id/assign` | W | `{member_id?}` (null = unassign) |
| POST | `/conversations/:id/transfer` | W | `{to_member_id?|to_department_id?, note?}` |
| POST | `/conversations/:id/status` | W | `{status}` (+ close/reopen semantics) |
| POST | `/conversations/:id/close` | W | sets `closed_at` |
| POST | `/conversations/:id/reopen` | W | clears `closed_at` |
| POST | `/conversations/:id/tags` | W | `{tags[]}` normalized (trim/lower/dedupe) |
| POST | `/conversations/:id/rating` | W | `{score, comment?}` |
| POST | `/conversations/:id/read` | W | zeroes `unread` |

Developers receive 403 on chat-content reads (Pattern-A RLS rule).

### messages
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| PATCH | `/messages/:id` | W | `{text?}` edit own/agent messages |

### contacts & contact_events
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/contacts` | A | filters: `q, propertyId, tag`; cursor |
| POST | `/contacts` | W | `{property_id, name, email?, phone?, tags?}` |
| GET/PATCH/DELETE | `/contacts/:id` | A/W/W | |
| GET | `/contact-events` | A | `?contact_id=`; cursor |
| POST | `/contact-events` | W | `{contact_id, kind, data?}` |
| GET/PATCH/DELETE | `/contact-events/:id` | A/W/W | |

### tickets
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/tickets` | A | filters: `status, priority, assigneeId, q`; cursor |
| POST | `/tickets` | W | `{subject, conversation_id?, contact_id?, ...}` |
| GET/PATCH/DELETE | `/tickets/:id` | A/W/W | |
| POST | `/tickets/:id/status` | W | `{status}` |
| POST | `/tickets/:id/assign` | W | `{member_id?}` |
| POST | `/tickets/:id/priority` | W | `{priority}` |
| POST | `/tickets/bulk` | W | `{ids[], patch}` → `{updated:n}` |
| POST | `/tickets/from-conversation` | W | `{conversation_id}` |
| POST | `/tickets/:id/merge` | W | `{into_ticket_id}`; relationship kept via audit log (no `parent_id` column in schema) |
| POST | `/tickets/:id/split` | W | `{...}` new ticket; link via audit log |

### notifications
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/notifications` | A | `?unread=1`; cursor |
| POST | `/notifications/push` | W | `{member_id?, title, body, link?}` |
| POST | `/notifications/:id/read` | A | own notifications |
| POST | `/notifications/read-all` | A | |
| DELETE | `/notifications/:id` | A | |

### ratings
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/ratings` | W | `{conversation_id, member_id?, kind?, score, comment?}` |
| GET | `/ratings` | A | `?propertyId=`; cursor |
| GET | `/ratings/summary` | A | `?property_id=` required → `{avg, count}` |

### metrics
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/metrics/chats` | A | `?from&to` → volume by day |
| GET | `/metrics/response-times` | A | avg first-response / resolution |
| GET | `/metrics/satisfaction` | A | CSAT from ratings |
| GET | `/metrics/tickets` | A | by status/priority |

### departments
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/departments` | A | with `agent_ids[]` |
| POST | `/departments` | W | `{name, property_id?, routing_mode?, agent_ids?}` |
| GET/PATCH/DELETE | `/departments/:id` | A/W/W | PATCH syncs membership |

### categories (fan-out across kb/canned/ticket category tables)
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/categories?scope=kb\|canned\|tickets` | A | `created_at` = epoch millis |
| POST | `/categories` | W | `{scope, name, color?}` |
| PATCH | `/categories/:id?scope=` | W | |
| DELETE | `/categories/:id?scope=` | W | |

### saved_views / plays / goals
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/saved-views` | A | `{items,next_cursor:null}` |
| POST | `/saved-views` | W | `{name, filters}` |
| GET/PATCH/DELETE | `/saved-views/:id` | A/W/W | |
| GET | `/plays` | A | `{steps[]}` |
| POST | `/plays` | W | `{name, steps[]}` |
| GET/PATCH/DELETE | `/plays/:id` | A/W/W | |
| POST | `/plays/:id/run` | W | `{conversation_id?}` executes steps |
| GET | `/goals` | A | |
| POST | `/goals` | W | `{name, target?, ...}` |
| GET/PATCH/DELETE | `/goals/:id` | A/W/W | |
| POST | `/goals/:id/track` | W | `{value?}` → goal event |
| GET | `/goals/:id/funnel` | A | funnel aggregation |

### members
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/members` | A | hydrated (`department_ids[]`) |
| POST | `/members` | admin | `{display_name, role?, passcode?, ...}`; duplicate name → 409 |
| GET/PATCH/DELETE | `/members/:id` | A/admin/admin | DELETE refuses last member (422) |
| POST | `/members/:id/passcode` | admin/self | `{passcode}` min 4, bcrypt |
| POST | `/members/:id/status` | W | `{status}` online/away/offline |
| POST | `/members/:id/touch-login` | A | stamps `last_login_at` |

### integrations (10-provider registry)
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/integrations` | A | **all 10 registry providers** even with no row (`values={}`, `enabled=false`) |
| PATCH | `/integrations/:provider` | W | upserts on `(workspace_id, provider)`; `{values?, enabled?}` |

### unanswered_questions (aliases: `/unanswered`, `/unanswered_questions`)
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/unanswered` | A | `?includeDismissed=1`; cursor |
| POST | `/unanswered` | W | `{question, conversation_id}` — **conversation required** (schema NOT NULL `property_id`); identical question (case-insensitive, not dismissed) → `count+1` |
| POST | `/unanswered/:id/dismiss` | W | |
| POST | `/unanswered/:id/promote` | W | creates draft KB article + dismisses |

### audit-log (admin only)
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/audit-log` | admin | filters: `actor, action, from, to`; cursor |
| POST | `/audit-log` | admin | `{action, entity?, entity_id?, meta?}` append (caller stamped) |

Every mutation also appends a best-effort `audit_log` row (never fails the
primary write).

### kb (knowledge base)
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/kb/articles/search?q=` | A | published only, title+body, case-insensitive |
| GET | `/kb/articles` | A | filters: `status, category, propertyId`; cursor |
| POST | `/kb/articles` | W | `{title, body?, status?, category_id?|category?, property_id?}`; slug = slugified title + `-2`, `-3`… dedupe |
| GET/PATCH/DELETE | `/kb/articles/:id` | A/W/W | |
No `internal_only` column in the schema: draft status = internal-only.

### canned_responses (aliases: `/canned`, `/canned_responses`)
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/canned` | A | filters: `category, propertyId`; cursor |
| POST | `/canned` | W | `{title, body, shortcut?, category_id?, shared?}` |
| GET/PATCH/DELETE | `/canned/:id` | A/W/W | |

### triggers (alias: `/flows`)
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/triggers` | A | filters: `propertyId, kind` |
| POST | `/triggers` | W | `{name, kind, event?, condition_groups[], actions[], enabled?}` |
| GET/PATCH/DELETE | `/triggers/:id` | A/W/W | |

### api-keys (admin only; `key_hash` always `""`, never readable)
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api-keys` | admin | |
| POST | `/api-keys` | admin | `{name, scopes?}` → `{record, key}` — raw `bk_live_`+48hex shown **once** |
| GET | `/api-keys/:id` | admin | |
| GET | `/api-keys/:id/reveal` | admin | always `{key:null}` (nothing persisted) |
| POST | `/api-keys/:id/rotate` | admin | delete + re-insert preserving id/`created_at` → `{record, key}` |
| POST | `/api-keys/:id/revoke` | admin | |
| DELETE | `/api-keys/:id` | admin | |

### webhooks (admin)
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/webhooks` | admin | `secret` never returned (`secret_set` boolean only) |
| POST | `/webhooks` | admin | `{property_id **required**, url, events[], secret?, enabled?}` |
| GET/PATCH/DELETE | `/webhooks/:id` | admin | PATCH `secret` rotates; `null` clears |
| POST | `/webhooks/:id/dispatch` | admin | `{event, property_id?, data?, event_id?}` → enqueue + immediate flush → `{enqueued, attempted, delivered, failed}` |
| GET | `/webhooks/:id/deliveries` | admin | cursor |
| GET | `/webhook-deliveries` | admin | filters: `webhook_id, status`; cursor |
| GET | `/webhook-deliveries/:id` | admin | |

### invites (aliases: `/invites`, `/member_invites`; admin except accept)
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/invites` | admin | `{display_name, role?, email?}` → `{invite_id, invite_url, token, expires_at, email}` — token (16 chars, `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`) returned **once**; emailed when `MAIL_ENABLED=1` |
| GET | `/invites` | admin | pending/used list (token hashes only) |
| POST | `/invites/accept` | public | `{invite_id, token, passcode (8–128), display_name?}` — **atomic**: re-verifies unused/unexpired inside `SELECT … FOR UPDATE`; duplicate name → 409 |

### visitors
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/visitors` | A | filters: `property_id, online`; cursor |
| POST | `/visitors` | W | `{property_id, name?, email?, page_url?, custom_attributes?, ...}` |
| GET/PATCH/DELETE | `/visitors/:id` | A/W/W | PATCH touches `last_seen_at` |

### ai/copilot
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/ai/copilot` | public | `{ok, modes:[reply,summary,rewrite], providers:[openai,anthropic]}` |
| POST | `/ai/copilot` | A | `{prompt, mode?, tone?, provider?, context?}` → `{suggestion, provider, mode, tone}`. Needs `AI_API_KEY` (OpenAI) or `AI_ANTHROPIC_KEY` in config, else 501 `not_configured`. Maps provider errors: 401/403→`ai_auth_failed`, 429→`ai_rate_limited`, timeout→`ai_timeout`. |

### email
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/email/send` | W | `{to (1–50), subject, html?, text?}` → `{id}`. PHP `mail()` backend; needs `MAIL_ENABLED=1` + `MAIL_FROM`, else 501 `not_configured`. |

### updates (polling replacement for realtime)
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/updates?since=<ISO-8601>` | A | `{events:[{table, type: INSERT\|UPDATE, row}], server_time}` for conversations, messages, visitors changed since `since`. **PHP has no realtime transport — clients poll this endpoint** (e.g. every 5–15 s).

## 7. Webhook delivery

- Enqueue: enabled webhooks whose `events` contain the event (and `property_id`
  matches when given) get one `webhook_deliveries` row (`pending`,
  `next_attempt_at = now`).
- Dispatch: `POST /webhooks/:id/dispatch` enqueues + flushes immediately;
  `api/cron/webhook-retry.php` sweeps due deliveries.
- Signing: `X-Brix-Signature: sha256=<HMAC-SHA256(raw JSON body, secret)>`
  (only when a secret is set).
- Retry backoff: 1m → 10m → 1h → 6h; **dead after 5 attempts**; webhook
  **auto-disabled after 10 consecutive failures** (`auto_disable=1`).
- Every attempt is logged to `webhook_delivery_attempts`.

## 8. Cron jobs (cPanel)

Both are CLI-only (refuse to run over HTTP) and use a privileged DB path —
no member auth required:

```cron
*/5  * * * * /usr/bin/php /home/<user>/public_html/api/cron/webhook-retry.php >> /home/<user>/brix-webhooks.log 2>&1
*/15 * * * * /usr/bin/php /home/<user>/public_html/api/cron/sla-checker.php   >> /home/<user>/brix-sla.log 2>&1
```

- `webhook-retry.php`: claims due deliveries (`FOR UPDATE SKIP LOCKED`),
  HMAC-signs, delivers via cURL, applies backoff/dead-letter/auto-disable.
- `sla-checker.php`: flags `sla_breached` on overdue open tickets, emits a
  `ticket.sla_breached` event + optional assignee email (`MAIL_ENABLED=1`).

## 9. Widget auth story

There is no anonymous widget surface: the embeddable widget performs the
same authenticated calls (`properties.getByPublicKey`, `conversations`
start/send) with a member bearer token, exactly like the dashboard
transport. For a public website widget, provision a low-privilege member
(e.g. role `viewer`+write via a dedicated widget member, or a service
account) and embed its token in the widget bundle — or front the widget
paths with public-key-scoped tokens (not implemented; `secure_mode` on the
property is reserved for it).

## 10. Deviations from the Supabase transport (documented)

- `webhooks.property_id` is `NOT NULL` (FK) in `mysql/schema.sql`, so webhook
  create requires `property_id`; workspace-wide webhooks are not representable.
- `unanswered_questions` requires `conversation_id` (schema NOT NULL
  `property_id`); without one the API returns 501 `not_supported`.
- Ticket merge/split links live in `audit_log` (no `parent_id` column).
- KB `internal_only` ⇄ `status='draft'` (no dedicated column).
- Realtime: polling only (`GET /updates`); no websockets/SSE.
- Round-robin assignment counters stay client-side (localStorage), as before.
- `campaigns` table exists in the schema but campaign *sending* was never
  implemented upstream — no send worker here either.

## 11. Frontend transport (`VITE_API_URL`)

The React frontend (`src/lib/`) can use this PHP API as a drop-in transport
behind the same `BrixApi` interface the localStorage and Supabase transports
implement. Wiring lives in three files:

- `src/lib/php-client.ts` — low-level `fetch()` client: `{data}` unwrapping,
  `{items,next_cursor}` pagination, error mapping, Bearer <redacted> handling,
  and the `/updates` poller.
- `src/lib/api.ts` — `PhpBrixApi extends BrixApi` overrides every supported
  namespace with remote implementations (same signatures, same `{ data }`
  envelopes); `getTransport()` picks the transport.
- `src/lib/store.tsx` — login/session wiring, polling lifecycle, and
  `auth_expired` handling.

### Selection priority

`getTransport(workspace, actor)` picks, in order:

1. **Supabase** — when `VITE_SUPABASE_URL` **and** `VITE_SUPABASE_ANON_KEY`
   are both set.
2. **PHP API** — when `VITE_API_URL` is set (e.g.
   `VITE_API_URL=https://example.com/api`).
3. **localStorage** — the default when neither is set. The GitHub Pages /
   local demo behaves exactly as before; no `VITE_API_URL` means no network
   calls, no token, no polling.

### Realtime: 5-second polling

PHP has no realtime transport, so `ensurePhpPolling()` (started by the
`PhpBrixApi` constructor and armed by the store while a session exists)
polls `GET /updates?since=<ISO-8601>` roughly every **5 seconds** and feeds
`conversations` / `messages` / `visitors` events into the shared
`onRemoteChange` bus — the same callback behavior as the Supabase transport
(`api.ts` merges both buses into one `onRemoteChange()` export). Ticks are
skipped quietly until login (no token yet) and polling never throws: a failed
tick is retried on the next interval.

### Auth tokens

- `members.login()` calls `POST /auth/login`; the returned 30-day Bearer <redacted>
  is kept in the php-client singleton (**memory + `sessionStorage` only**,
  never localStorage — closing the tab ends the session) and sent as
  `Authorization: Bearer` on every other call.
- The client decodes the token's expiry locally and the server rejects
  lapsed/forged tokens with 401: both surface as
  `ApiError('auth_expired', …, 401)`.
- On `auth_expired` the transport dispatches a `brix:auth-expired` window
  event; the store drops the session (and the token) so the UI returns to
  the login screen and prompts for re-login. `logout()` clears the token too.
- Tokens are **workspace-scoped**: if the app instance targets a different
  workspace than the token was issued for, the token is discarded and
  `auth_expired` is raised. (Platform-admin cross-workspace viewing is not
  supported on this transport.)

### Failure behavior

`PhpBrixApi` wraps every remote call in `guardPhp()`: transport failures
(server unreachable, 5xx, …) fall back to the localStorage implementation
with a `console.warn`, exactly like the Supabase transport. Data errors
propagate — `validation` / `not_found` / `conflict` / `not_supported` /
`unauthorized` / `auth_expired` — never silently. Login is remote-first:
bad credentials (401/403) never fall back to the local demo.

### Known limitations of this transport

- Ticket `setParent` / `related` / `split` keep the localStorage
  implementation (parent/relation links are not representable server-side),
  exactly like the Supabase transport. `split` exists server-side but is not
  wired, to keep the override set identical across transports.
- `unanswered.add()` without a conversation throws 501 `not_supported`
  (the API requires `conversation_id`).
- `properties.enabled` is a local-only flag (no server column); updates strip
  it before PATCH.
- `ratings.summary()` is computed client-side from the remote ratings list
  (same math as the Supabase transport).
- `conversations.sendMessage()` maps the `ai` sender to `system` to match the
  server's rewrite.
