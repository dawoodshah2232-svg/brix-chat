# Brix Chat — API reference

*Local phase: every method below is implemented in `src/lib/api.ts`, backed by
this browser's localStorage. The same method names, shapes, and envelopes carry
over to HTTP later — see "Future HTTP mapping" at the bottom. All wording is
original.*

## Conventions (local and future)

- Every call is async and resolves to a `{ data }` envelope.
- Lists resolve to `{ data: { items, next_cursor } }` (cursor pagination).
- Failures throw `ApiError` with a machine-readable `code` and an HTTP-style
  `status` (400 validation, 404 not found, 409 conflict, 422 invalid input,
  500 internal).
- Timestamps are ISO-8601 strings; ids are prefixed (`prop_`, `conv_`, `msg_`,
  `wh_`, `key_`, …).

## Properties (websites)

| Method | Purpose |
|---|---|
| `api.properties.list()` | List all websites in the workspace |
| `api.properties.get(id)` | Property detail |
| `api.properties.getByPublicKey(key)` | Resolve a property from its public `bx_…` key (what the widget uses) |
| `api.properties.create({ name, domain })` | Register a website; generates its public key |
| `api.properties.update(id, patch)` | Rename, change domain, toggle secure mode |
| `api.properties.regenerateKey(id)` | Issue a new public key (old snippets stop working) |
| `api.properties.remove(id)` | Delete a website |

## Widget config

| Method | Purpose |
|---|---|
| `api.widget.getConfig(propertyId)` | Current widget appearance/behavior |
| `api.widget.updateConfig(propertyId, patch)` | Colors, position, greeting, branding, pre-chat form |

## Conversations

| Method | Purpose |
|---|---|
| `api.conversations.list({ propertyId, status, tag, q, cursor, limit })` | Filtered conversation list |
| `api.conversations.get(id)` | Full conversation with messages |
| `api.conversations.startSession(propertyId, visitor)` | Open a widget session (visitor name/email/page) |
| `api.conversations.sendMessage(id, { sender, text, kind, metadata })` | Append a message (`visitor` / `agent` / `ai` / `system`) |
| `api.conversations.assign(id, { agent_id, department })` | Assign to an agent or department |
| `api.conversations.setStatus(id, status)` | `open` / `closed` / `spam` / `missed` |
| `api.conversations.setTags(id, tags)` | Replace the tag set |
| `api.conversations.addNote(id, { author, text })` | Internal note (never shown to visitors) |
| `api.conversations.setRating(id, 1–5)` | Post-chat satisfaction rating |
| `api.conversations.markRead(id)` | Clear the unread counter |

## Contacts

| Method | Purpose |
|---|---|
| `api.contacts.list({ q, tag, cursor, limit })` | Search the mini-CRM |
| `api.contacts.get(id)` | Contact detail |
| `api.contacts.create(input)` | Create a contact |
| `api.contacts.update(id, patch)` | Update fields |
| `api.contacts.remove(id)` | Delete a contact |

## Agents / team

| Method | Purpose |
|---|---|
| `api.agents.list()` | Team members with roles |
| `api.agents.invite({ display_name, role })` | Add a member; returns a one-time passcode (local-only: share it directly — email invites arrive with the backend phase) |
| `api.agents.update(id, patch)` | Change role, name, online flag |
| `api.agents.remove(id)` | Remove a member |

Roles: `admin` (everything) · `developer` (keys + webhooks, no chat content) · `agent` (chats only) · `viewer` (read-only).

Phase-2 member directory (exact §9 surface, same roles):

| Method | Purpose |
|---|---|
| `api.members.list()` | Members, newest first |
| `api.members.create(displayName, role, passcode)` | Add a member with an explicit passcode |
| `api.members.update(id, patch)` | Change role, name, color, … |
| `api.members.remove(id)` | Remove a member |
| `api.members.login(displayName, passcode)` | Verify credentials; returns the member or throws |
| `api.members.setPasscode(id, passcode)` | Rotate a member's passcode |
| `api.members.touchLogin(id)` | Record a login timestamp |
| `api.members.setStatus(id, status)` | `online` / `away` / `offline` |

## Tickets

| Method | Purpose |
|---|---|
| `api.tickets.list(opts?)` | Filter by `{ status, priority, assignee, q }` + cursor pagination |
| `api.tickets.get(id)` | Ticket detail |
| `api.tickets.create(input)` | Open a ticket: `{ property_id, subject, message, requester_name, requester_email, priority?, tags? }` |
| `api.tickets.update(id, patch)` | Edit subject, status, priority, tags, … |
| `api.tickets.assign(id, agentId)` | Assign to an agent |
| `api.tickets.setPriority(id, p)` | `low` / `medium` / `high` / `urgent` |
| `api.tickets.bulk(ids, action, agentId?)` | `resolve` / `assign` / `spam` across many tickets |
| `api.tickets.fromConversation(convId, input)` | Create a ticket linked to a chat (escalation path) |

Ticket shape: `{ id, property_id, subject, message, requester_name, requester_email,
status, priority, assignee_id, sla_due, conversation_id, tags, created_at, updated_at }`.
SLA breaches emit the `ticket.sla_breached` webhook.

## Knowledge base

| Method | Purpose |
|---|---|
| `api.kb.list({ status })` | Articles, newest first |
| `api.kb.search(q)` | Search published articles |
| `api.kb.get(id)` | Article detail |
| `api.kb.create({ title, body, category, status })` | New article (slug auto-generated) |
| `api.kb.update(id, patch)` | Edit an article |
| `api.kb.remove(id)` | Delete an article |

## Canned responses

| Method | Purpose |
|---|---|
| `api.canned.list()` | All shortcuts |
| `api.canned.create({ shortcut, title, body })` | New canned response |
| `api.canned.update(id, patch)` | Edit |
| `api.canned.remove(id)` | Delete |

## Webhooks

| Method | Purpose |
|---|---|
| `api.webhooks.list(propertyId?)` | Endpoints, optionally per website |
| `api.webhooks.get(id)` | Endpoint detail |
| `api.webhooks.create({ property_id, url, events, enabled })` | New endpoint; returns the secret **once** |
| `api.webhooks.update(id, patch)` | URL, events, enabled, auto-disable |
| `api.webhooks.rotateSecret(id)` | New secret, shown once |
| `api.webhooks.remove(id)` | Delete endpoint + its delivery log |
| `api.deliveries.list(webhookId, { limit })` | Delivery attempts, newest first |
| `api.deliveries.testFire(webhookId, event)` | Build the exact signed payload that *would* be POSTed and log it as a `test` delivery. Local-only: no request leaves the browser. |

Event catalog: `chat.started`, `chat.ended`, `chat.transcript`, `message.created`,
`message.received`, `conversation.assigned`, `conversation.status_changed`, `ticket.created`,
`ticket.status_changed`, `contact.created`, `contact.updated`,
`satisfaction.received`, `widget.opened`. See `docs/WEBHOOKS.md` for signing.

## API keys

| Method | Purpose |
|---|---|
| `api.apiKeys.list()` | Keys (prefix only, never the full key) |
| `api.apiKeys.create({ name, scopes })` | New key; returns the full key **once** |
| `api.apiKeys.rotate(id)` | New key value, shown once |
| `api.apiKeys.revoke(id)` | Immediately disable |
| `api.apiKeys.remove(id)` | Delete the record |

Scopes (pick per key): `properties:read/write`, `conversations:read/write`,
`contacts:read/write`, `tickets:read/write`, `kb:read/write`,
`webhooks:read/write`, `metrics:read`.

## Metrics

| Method | Purpose |
|---|---|
| `api.metrics.chats({ days })` | Daily totals + missed counts |
| `api.metrics.responseTimes()` | Avg + p95 first-response time |
| `api.metrics.satisfaction()` | Rating distribution + CSAT % |
| `api.metrics.tickets()` | Ticket counts by status |

## Audit

| Method | Purpose |
|---|---|
| `api.auditLog.list({ limit })` | Admin action trail, newest first |

All mutating admin calls (properties, keys, webhooks, team, …) append to the
audit log automatically with the current actor name.

---

## Phase-2 content & admin APIs

These ship with the phase-2 data API (local now, HTTP later). The Admin console
consumes them through a structural adapter; where an endpoint has not landed
yet, the console falls back to a clearly-labelled browser-local store.

### Blog

| Method | Purpose |
|---|---|
| `api.blog.list(publishedOnly?)` | Paginated posts, newest first |
| `api.blog.getBySlug(slug)` | Single post by slug |
| `api.blog.create(input)` | `{ slug, title, excerpt, body, tags, author, published, reading_mins, category_id? }` |
| `api.blog.update(id, patch)` | Partial update |
| `api.blog.delete(id)` | Delete a post |

### Help docs

| Method | Purpose |
|---|---|
| `api.helpDocs.list()` | All guides, ordered |
| `api.helpDocs.getBySlug(slug)` | Single guide by slug |
| `api.helpDocs.create(input)` | `{ slug, title, body, category, order, category_id?, published? }` |
| `api.helpDocs.update(id, patch)` | Partial update |
| `api.helpDocs.delete(id)` | Delete a guide |

### Contact messages

| Method | Purpose |
|---|---|
| `api.contactMessages.create({ name, email, subject, message })` | From the public contact form |
| `api.contactMessages.list()` | Inbox, newest first |
| `api.contactMessages.markRead(id)` | Mark as read |

### Status page entries

| Method | Purpose |
|---|---|
| `api.statusEntries.list()` | Public status entries |
| `api.statusEntries.create({ title, detail, state })` | `state`: `operational` / `degraded` / `incident` |
| `api.statusEntries.delete(id)` | Remove an entry |

### Property settings (incl. branding)

| Method | Purpose |
|---|---|
| `api.propertySettings.get(propertyId)` | Full settings incl. branding keys |
| `api.propertySettings.patch(propertyId, patch)` | Schemaless merge — extra keys persist |

Branding keys (white-label): `logo_data_url`, `brand_name`, `tagline`,
`accent_color`, `custom_domain` (disabled until the backend phase),
`custom_subdomain` (e.g. `acme` → `acme.brixchat.com`; path routing
`/kb/:propertyKey` works now, subdomain mapping activates with the backend
phase). Routing key: `default_department_id` (“when chat starts → route to
department X”).

### Departments

| Method | Purpose |
|---|---|
| `api.departments.list(propertyId)` | Departments of one property |
| `api.departments.create(propertyId, input)` | `{ name, description?, agent_ids?, routing_mode?, hours_override?, offline_behavior? }` |
| `api.departments.update(id, patch)` | Partial update |
| `api.departments.delete(id)` | Delete a department |
| `api.routing.routeChat(propertyId, departmentId?)` | Simulated routing — returns `{ agent_id, department_id }` per the department's routing mode |

`routing_mode`: `round-robin` (dealt out in rotation) · `least-busy` (fewest
open chats) · `first-available` (whoever picks up first).
`offline_behavior`: `ticket` (create a ticket) · `message` (take a message) ·
`hide` (hide the widget). `hours_override`: per-day `{ day, open, close }`
(empty times = closed), or `null` to inherit property hours.

### Categories

| Method | Purpose |
|---|---|
| `api.categories.list(scope, propertyId?)` | `scope`: `kb` / `canned` / `tickets` |
| `api.categories.create(scope, propertyId, name, color?)` | New category |
| `api.categories.update(id, patch)` | Rename / recolor (`{ name?, color? }`) |
| `api.categories.delete(id)` | Delete; clears `category_id` references on tickets, articles, canned replies |

### Ratings

| Method | Purpose |
|---|---|
| `api.ratings.create(input)` | `{ property_id, conversation_id?, agent_id?, kind: 'csat' \| 'nps', score, comment? }` — CSAT 1–5, NPS 0–10; fires `rating.created` and raises a low-rating notification (CSAT ≤ 2, NPS ≤ 6) |
| `api.ratings.list({ property_id?, agent_id?, kind?, from?, to?, limit? })` | Filtered ratings, newest first |
| `api.ratings.summary(propertyId, days?)` | `{ csat_avg, csat_count, nps_score, nps_count, promoters, passives, detractors, trend: [{ day, csat_avg, nps_avg, count }] }` |

### Copilot / security / data

| Method | Purpose |
|---|---|
| `api.copilotSettings.get()` / `.patch(patch)` | Tone, autosuggest, summarize, translate, sources, provider |
| `api.securitySettings.get()` / `.patch(patch)` | `session_timeout_mins`, `passcode_min_len`, `passcode_expiry_days` |
| `api.dataSettings.get()` / `.patch(patch)` | `retention_days`, `auto_purge` |
| `api.dataExport()` | Full workspace JSON download |
| `api.dataImport(json)` | Restore from an export file |
| `api.dataReset()` | Wipe local workspace data (confirmed) |

### Integrations & unanswered questions

| Method | Purpose |
|---|---|
| `api.integrations.list()` / `.patch(id, patch)` | Third-party connectors; secrets stay obfuscated, backend-phase ones are disabled locally |
| `api.unanswered.list()` | Questions the bot could not answer |
| `api.unanswered.dismiss(id)` | Dismiss a question |
| `api.unanswered.promote(id)` | Promote a question into a help article draft |

### Plays & goals

| Method | Purpose |
|---|---|
| `api.plays.list()` / `.create(name, steps)` / `.delete(id)` | One-click automation macros (reply/tag/assign/priority/note) |
| `api.goals.list()` / `.create(name, event, revenue)` / `.delete(id)` | Tracked conversion goals |
| `api.goals.funnel(days)` | Visitors → chats → goal completions + revenue |

### Audit search (§9)

| Method | Purpose |
|---|---|
| `api.audit.search({ actor?, action?, from?, to?, cursor?, limit? })` | Filtered admin action trail |

---

## Future HTTP mapping

When the backend phase ships, these local methods map 1:1 onto REST endpoints
under `https://api.brixchat.com/v1`, authenticated with
`Authorization: Bearer <api-key>` and per-key scopes:

| HTTP | Local method |
|---|---|
| `GET /v1/properties` | `api.properties.list()` |
| `POST /v1/properties` | `api.properties.create()` |
| `GET /v1/properties/{id}` | `api.properties.get()` |
| `PATCH /v1/properties/{id}` | `api.properties.update()` |
| `POST /v1/properties/{id}/regenerate-key` | `api.properties.regenerateKey()` |
| `DELETE /v1/properties/{id}` | `api.properties.remove()` |
| `GET /v1/properties/{id}/widget` | `api.widget.getConfig()` |
| `PATCH /v1/properties/{id}/widget` | `api.widget.updateConfig()` |
| `GET /v1/properties/{id}/conversations` | `api.conversations.list()` |
| `GET /v1/conversations/{id}` | `api.conversations.get()` |
| `POST /v1/conversations/{id}/messages` | `api.conversations.sendMessage()` |
| `POST /v1/conversations/{id}/assign` | `api.conversations.assign()` |
| `POST /v1/conversations/{id}/status` | `api.conversations.setStatus()` |
| `POST /v1/conversations/{id}/tags` | `api.conversations.setTags()` |
| `POST /v1/conversations/{id}/notes` | `api.conversations.addNote()` |
| `GET /v1/properties/{id}/contacts` | `api.contacts.list()` |
| `GET /v1/contacts/{id}` | `api.contacts.get()` |
| `POST /v1/contacts` / `PATCH /v1/contacts/{id}` | `api.contacts.create/update` |
| `GET /v1/properties/{id}/agents` | `api.agents.list()` |
| `POST /v1/properties/{id}/invites` | `api.agents.invite()` |
| `PATCH /v1/agents/{id}` | `api.agents.update()` |
| `GET /v1/properties/{id}/tickets` | `api.tickets.list()` |
| `POST /v1/tickets` | `api.tickets.create()` |
| `GET/POST /v1/properties/{id}/articles` | `api.kb.list/create` |
| `GET/PATCH/DELETE /v1/articles/{id}` | `api.kb.get/update/remove` |
| `GET /v1/articles/search?q=` | `api.kb.search()` |
| `GET/POST /v1/properties/{id}/canned` | `api.canned.list/create` |
| `PATCH/DELETE /v1/canned/{id}` | `api.canned.update/remove` |
| `GET/POST /v1/properties/{id}/webhooks` | `api.webhooks.list/create` |
| `PATCH/DELETE /v1/webhooks/{id}` | `api.webhooks.update/remove` |
| `GET /v1/webhooks/{id}/deliveries` | `api.deliveries.list()` |
| `GET/POST /v1/properties/{id}/api-keys` | `api.apiKeys.list/create` |
| `POST /v1/api-keys/{id}/rotate` | `api.apiKeys.rotate()` |
| `POST /v1/api-keys/{id}/revoke` | `api.apiKeys.revoke()` |
| `GET /v1/properties/{id}/metrics/chats` | `api.metrics.chats()` |
| `GET /v1/properties/{id}/metrics/response-times` | `api.metrics.responseTimes()` |
| `GET /v1/properties/{id}/metrics/satisfaction` | `api.metrics.satisfaction()` |
| `GET /v1/properties/{id}/metrics/tickets` | `api.metrics.tickets()` |
| `GET/POST /v1/blog` | `api.blog.list/create` |
| `GET/PATCH/DELETE /v1/blog/{id}` | `api.blog.getBySlug/update/delete` |
| `GET/POST /v1/help` | `api.helpDocs.list/create` |
| `GET/PATCH/DELETE /v1/help/{id}` | `api.helpDocs.getBySlug/update/remove` |
| `GET/POST /v1/contact-messages` | `api.contactMessages.list/create` |
| `POST /v1/contact-messages/{id}/read` | `api.contactMessages.markRead()` |
| `GET/POST /v1/status` | `api.statusEntries.list/create` |
| `DELETE /v1/status/{id}` | `api.statusEntries.delete()` |
| `GET/PATCH /v1/properties/{id}/settings` | `api.propertySettings.get/patch` |
| `GET/POST /v1/departments?property_id=` | `api.departments.list/create` |
| `PATCH/DELETE /v1/departments/{id}` | `api.departments.update/delete` |
| `POST /v1/routing/route` | `api.routing.routeChat()` |
| `GET/POST /v1/categories?scope=` | `api.categories.list/create` |
| `PATCH/DELETE /v1/categories/{id}` | `api.categories.update/delete` |
| `GET/POST /v1/ratings` | `api.ratings.list/create` |
| `GET /v1/ratings/summary?property_id=` | `api.ratings.summary()` |
| `GET/PATCH /v1/copilot-settings` | `api.copilotSettings.get/patch` |
| `GET/PATCH /v1/security-settings` | `api.securitySettings.get/patch` |
| `GET/PATCH /v1/data-settings` | `api.dataSettings.get/patch` |
| `GET /v1/data-export` · `POST /v1/data-import` · `POST /v1/data-reset` | `api.dataExport` / `api.dataImport` / `api.dataReset` |
| `GET/PATCH /v1/integrations` | `api.integrations.list/patch` |
| `GET /v1/unanswered` | `api.unanswered.list()` |
| `POST /v1/unanswered/{id}/dismiss` · `/promote` | `api.unanswered.dismiss` / `api.unanswered.promote` |
| `GET/POST /v1/plays` | `api.plays.list/create` |
| `DELETE /v1/plays/{id}` | `api.plays.delete()` |
| `GET/POST /v1/goals` | `api.goals.list/create` |
| `DELETE /v1/goals/{id}` | `api.goals.delete()` |
| `GET /v1/goals/funnel` | `api.goals.funnel()` |
| `GET /v1/audit?actor=&action=&from=&to=` | `api.audit.search()` |

Conventions for the HTTP API: JSON everywhere; success wraps in `{ data }`;
errors return `{ error: { code, message } }` with 400/401/403/404/409/422/429;
cursor pagination via `?cursor=&limit=` with `next_cursor` in the response;
rate limits published per key with `429` + `Retry-After` on exceed.
