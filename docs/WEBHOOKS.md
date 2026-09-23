# Brix Chat — Webhooks

*Local phase: configure endpoints, subscribe to events, and test-fire signed
payloads from Admin → Webhooks. Everything is stored in this browser; real HTTP
delivery activates with the backend phase. All wording is original.*

## What webhooks do

Webhooks push events from Brix Chat to your own systems the moment they happen —
a new chat starts, a message arrives, a ticket is created. Your endpoint receives
an HTTP POST with a JSON body and verifies it came from Brix Chat using the
signature header.

## Event catalog

| Event | Fires when | Payload highlights |
|---|---|---|
| `chat.started` | Visitor sends the first message of a chat | conversation id, visitor (name/email/country/city), page URL, referrer |
| `chat.ended` | Chat session ends | conversation id, duration, message count, agent |
| `chat.transcript` | Full transcript ready after a chat ends | conversation id, visitor, messages[] |
| `message.created` | Any new message (visitor, agent, or bot) | message id, conversation id, sender, text |
| `conversation.assigned` | Chat assigned to an agent or department | conversation id, assignee |
| `conversation.status_changed` | Status flips open / closed / spam / missed | conversation id, old/new status |
| `ticket.created` | New ticket (offline form, missed chat) | ticket id, subject, requester |
| `ticket.status_changed` | Ticket resolved or reopened | ticket id, old/new status |
| `ticket.sla_breached` | Ticket passes its SLA deadline unresolved | ticket id, SLA policy, overdue minutes |
| `campaign.sent` | A proactive campaign finishes sending | campaign id, audience size, sent/failed counts |
| `goal.completed` | Visitor completes a tracked goal | goal id, visitor, revenue (if set) |
| `contact.created` / `contact.updated` | Contact record changes | contact id, name, email |
| `satisfaction.received` | Visitor submits a post-chat rating | conversation id, rating 1–5 |
| `widget.rating` | Widget survey submitted (CSAT and/or NPS) | rating id, conversation id, agent, csat, nps, comment |
| `rating.created` | Any new rating stored via the ratings API | rating id, agent, csat, nps, comment, source |
| `widget.opened` | Visitor opens the chat widget | page URL, visitor |

Subscribe per endpoint in Admin → Webhooks (checkbox list). An endpoint only
receives the events it subscribes to.

## Request format

`POST` your URL with a JSON body:

```json
{
  "event": "message.created",
  "property_id": "prop_…",
  "timestamp": "2026-09-23T14:30:00.000Z",
  "data": {
    "message_id": "msg_…",
    "conversation_id": "conv_…",
    "sender": "visitor",
    "text": "Hi! Do you offer annual billing?"
  }
}
```

Headers on every delivery:

| Header | Meaning |
|---|---|
| `Content-Type` | `application/json` |
| `X-Brix-Event` | Event name, e.g. `message.created` |
| `X-Brix-Event-Id` | Stable UUID across retries — use it for idempotent processing |
| `X-Brix-Timestamp` | Unix timestamp of signing — reject stale deliveries |
| `X-Brix-Delivery-Attempt` | `1`, `2`, … |
| `X-Brix-Signature` | Hex HMAC-SHA256 signature (see below) |

## Verifying the signature

The signature is `HMAC-SHA256(secret, "<timestamp>.<raw_body>")`, hex-encoded,
where `<timestamp>` is the `X-Brix-Timestamp` value and `<raw_body>` is the
exact request bytes. Compare with a constant-time check and reject deliveries
older than ~5 minutes.

```js
// Node.js (express) example
import crypto from 'node:crypto';

const SECRET = process.env.BRIX_WEBHOOK_SECRET;

app.post('/hooks/brix', express.raw({ type: 'application/json' }), (req, res) => {
  const ts = req.headers['x-brix-timestamp'];
  const sig = req.headers['x-brix-signature'];
  if (!ts || !sig || Math.abs(Date.now() / 1000 - Number(ts)) > 300) {
    return res.status(401).end(); // stale or unsigned
  }
  const expected = crypto
    .createHmac('sha256', SECRET)
    .update(`${ts}.${req.body.toString('utf8')}`)
    .digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return res.status(401).end();
  }
  const { event, data } = JSON.parse(req.body.toString('utf8'));
  // ... handle the event (use X-Brix-Event-Id to dedupe retries)
  res.status(200).end();
});
```

## Delivery & retries (backend phase)

- Your endpoint must answer `2xx` within ~10 seconds; do heavy work
  asynchronously.
- Non-2xx responses and timeouts are retried with exponential backoff for up
  to 24 hours, then the delivery is marked dead and kept in the log.
- Endpoints that fail repeatedly are auto-disabled (toggle per endpoint in the
  dashboard) so one dead URL can't wedge the queue.
- Every attempt is recorded in Admin → Webhooks → delivery log with status,
  attempt count, HTTP status, and the payload.

## Local phase behavior

Today, Admin → Webhooks stores your configuration and signs payloads locally.
**Test fire** builds the exact headers + body your endpoint will receive and
logs it as a `test` delivery — no request leaves this browser. Rotate the
secret any time; the old one stops verifying immediately.
