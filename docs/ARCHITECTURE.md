# Brix Chat — Architecture

## Parts

| Part | Location | Stack | Deploy target |
|---|---|---|---|
| Marketing + dashboard + widget frontend | `src/` (Vite) | React 19, TS, Tailwind CSS v4 | `public_html/bridgingfx.com/brixchat/` (built `dist/`) |
| Workspace REST API | `api/` | Laravel 10, PHP 8.1, Sanctum | `~/brixchat/api/` (outside `public_html`); symlink `brixchat/backend` → `api/public` |
| Database schema | `mysql/schema.sql` + `api/database/migrations` | MySQL/MariaDB | its own DB (e.g. `cpuser_brixchat`) |
| Platform admin | `src/pages/AdminLogin.tsx`, `src/components/admin/`, `src/lib/admin-api.ts` | same frontend | same |

## Folders (frontend)

- `src/pages/` — marketing site: landing, pricing, features, compare,
  about, blog(+post), changelog, help, contact, legal.
- `src/widget/` — embeddable chat widget (standalone bundle, class-based
  dark mode via a `dark` class on the widget root).
- `src/app/` — agent dashboard (~25 views: Inbox, ChatThread, Visitors,
  Contacts, Tickets, Analytics, KnowledgeBase, Triggers, Flows, Campaigns,
  Team, Settings, Install, Branding, Developers, …).
- `src/lib/` — data layer: `api.ts` (localStorage-backed), `php-client.ts`
  (Laravel transport), `admin-api.ts`; auth, notifications, exports.
- `src/components/` — shared UI (`ui.tsx`), inline-SVG icon sets
  (`icons.tsx`, `dashboard/icons.tsx`), marketing blocks, Logo.

## Backend

- `api/app/Http/Controllers/Workspace/*` — workspace-scoped controllers.
  Every query filters `workspace_id = :wid`; token payload's `wid`/`mid`
  re-validated per request; workspace/member deletion invalidates tokens.
- Config in `api/config/brix.php`; env in `api/.env` (DB credentials,
  `APP_SECRET`, `SITE_ORIGIN`, AI keys, mail).
- Converted 2026-09 from the original plain-PHP API with identical URLs,
  bodies, responses and error codes (`ea744ca`).
- Envelopes: `{ "data": T }` / `{ "data": { "items": [...],
  "next_cursor": … } }`; errors `{ "error": { "code", "message" } }`.
- Tests: `api/tests` (PHPUnit 10); lint: frontend `oxlint`, backend
  `laravel/pint` available.

## Data flow

```
Visitor widget  ─┐
                 ├─►  (VITE_API_URL)  ─►  Laravel 10 API  ─►  MySQL
Agent dashboard ─┘         │  fallback: localStorage demo mode
Platform admin ────────────┘
```

Widget ↔ API uses bearer tokens issued per workspace member. AI and email
features are gated by configured keys (`not_configured` / `ai_*` /
`email_failed` error codes) — see `docs/API.md`, `docs/WEBHOOKS.md`.

## Deploy (auto)

Every push to `main` runs `.github/workflows/deploy-cpanel.yml`: builds
the dashboard, rsyncs it to `public_html/bridgingfx.com/brixchat/`,
uploads the Laravel API, applies the DB schema, health-checks the live
site. Preview: `npm run deploy` → gh-pages branch →
https://dawoodshah2232-svg.github.io/brix-chat/

> **Conflict to resolve:** this auto-deploys the *backend* on every push.
> The owner's standing rule (2026-10-07) is that backend code is NEVER
> auto-deployed — manual security review + manual deploy by his IT
> colleague. Reconcile with the owner before relying on this workflow.
