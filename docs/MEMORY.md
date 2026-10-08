# Brix Chat — Memory (progress log)

Updated: 2026-10-08.

## Done

- 2026-09: plain-PHP REST API for MySQL (cPanel-ready) + schema port of
  all 4 migrations + real demo passcode hashes (`f95601c`, `0715b24`).
- 2026-09: API converted from plain PHP to **Laravel 10**, Supabase
  removed; identical URLs/bodies/error codes (`ea744ca`).
- 2026-09: cPanel deploy workflow added for `bridgingfx.com/brixchat`
  (Laravel 10 on PHP 8.1) (`ae20851`, `02c8998`).
- 2026-09: malware payload removed from `postbuild.mjs` and
  `api/vite.config.js` (`9262b8f`) — supply-chain incident cleanup.
- Widget branding features: launcher icon/shape/corner position/badge/
  tooltip + customization live preview + embed snippet branding
  (`1d2fdc3`, `955214c`, `970ef16`).
- Notifications: desktop notification audit + `message.received`
  webhook (`9e00142`).
- Platform admin scaffold for the SaaS operator side (`b33d23e`).
- Frontend PHP-API transport via `VITE_API_URL` with localStorage demo
  fallback preserved (`e9b8c93`).
- QA compliance pass: SEO domain, HTTPS redirect, image compression,
  legal pages refresh, contact anti-spam (`6d8f394`, merged `c47ae8d`).
- Content: steady blog cadence — latest "trust gap — earn customer
  trust on complex support issues" (2026-10-08).
- AI context files added (`docs/PRD/ARCHITECTURE/RULES/DESIGN/TASKS/
  MEMORY.md`, 2026-10-08).

## In progress

- Docs/ deploy-policy reconciliation: `deploy-cpanel.yml` auto-deploys
  the backend on push to `main`, in conflict with the owner's standing
  rule (backend never auto-deployed; manual review + IT deploys).
  Awaiting owner decision (see `docs/TASKS.md` T1).

## Next

- Update stale root README (still says "local-only, no backend").
- Font migration to Apple stack; verify live AI/email provider config;
  end-to-end `VITE_API_URL` transport test on production.
- (Full list: `docs/TASKS.md`.)

## Standing notes

- Backend stays Laravel 10, never upgrade (owner rule).
- MySQL only; no Postgres/Supabase.
- Deploy target: `public_html/bridgingfx.com/brixchat/`; API code in
  `~/brixchat/api/` (outside `public_html`); its own MySQL database.
- The BridgingFX-Website rsync excludes `/brixchat/` so it never wipes
  this app during its own deploys.
