# Brix Chat — PRD

## What it is

Brix Chat is an embeddable live-chat widget platform with three parts:

1. **Chat widget** (`src/widget/`) — an embeddable website chat widget installed
   via a snippet; launcher icon/shape/4-corner position/badge/tooltip are
   brand-customizable with live preview (`src/app/Install.tsx`,
   `src/app/Branding.tsx`).
2. **Agent dashboard** (`src/app/`) — real-time inbox, visitors, contacts,
   tickets, analytics, knowledge base, canned responses, departments,
   triggers/flows, campaigns, quality/ratings, AI Copilot assist
   (`Copilot.tsx`), sentiment insights, smart routing.
3. **Marketing site** (`src/pages/`) — landing, pricing, features, compare,
   blog, changelog, help, contact, plus a platform-admin login
   (`AdminLogin.tsx`) for the SaaS operator side.

Live at **https://bridgingfx.com/brixchat/** (dashboard), API at
`…/brixchat/backend/api`.

## Users

- **Website visitors** — chat with a business through the widget.
- **Agents** — answer chats, tickets, campaigns; roles: `admin`, `agent`,
  `developer` (cannot read chat content), `viewer` (read-only).
- **Workspace owners** — configure widget branding, install snippet, manage
  team, API keys, webhooks, departments, knowledge base.
- **Platform operator** — SaaS-side admin (`b33d23e`, `AdminLogin.tsx`).

## Features (as implemented)

- Multi-workspace model; login by `{workspace, display_name, passcode}`,
  bcrypt-hashed passcodes; HMAC-signed bearer tokens, 30-day expiry.
- REST workspace API (Laravel 10, `api/app/Http/Controllers/Workspace/*`):
  conversations, messages, contacts, visitors, tickets, departments,
  categories, canned replies, triggers, flows, campaigns, knowledge base,
  ratings/feedback, webhooks, API keys, audit log, members/invites.
- Transport abstraction in the frontend: Laravel API via `VITE_API_URL`
  with localStorage demo fallback (`src/lib/api.ts`, `php-client.ts`).
- Webhooks (e.g. `message.received`), desktop notifications, transcript
  export, translation controls, reminders, AI Copilot + AI assist
  endpoints (configured keys; `ai_*` error codes).
- UUID v4 IDs everywhere, cursor-based pagination, ISO-8601 UTC timestamps
  (a few legacy epoch-ms fields — see `docs/PHP_API.md`).
- Marketing content engine: blog articles published regularly (git log shows
  a steady cadence through Oct 2026).

## What it is NOT (yet)

- The README still describes a "local-only, no backend" phase — that is
  **stale**: the Laravel 10 + MySQL backend exists and deploys to cPanel.
  README needs updating (TODO).
- No cross-device sync until workspaces are backed by the API (frontend
  still defaults to localStorage unless `VITE_API_URL` is set).
