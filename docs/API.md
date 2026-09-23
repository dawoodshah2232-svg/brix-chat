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

## Tickets

| Method | Purpose |
|---|---|
| `api.tickets.list({ status })` | Tickets by status |
| `api.tickets.get(id)` | Ticket detail |
| `api.tickets.create({ subject, requester_name, requester_email, message, property_id })` | Open a ticket (offline forms and missed chats land here) |
| `api.tickets.setStatus(id, status)` | `new` / `open` / `resolved` |

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
`conversation.assigned`, `conversation.status_changed`, `ticket.created`,
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

Conventions for the HTTP API: JSON everywhere; success wraps in `{ data }`;
errors return `{ error: { code, message } }` with 400/401/403/404/409/422/429;
cursor pagination via `?cursor=&limit=` with `next_cursor` in the response;
rate limits published per key with `429` + `Retry-After` on exceed.
