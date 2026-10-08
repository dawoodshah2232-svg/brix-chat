# Brix Chat — Tasks

Sequenced from repo state (git log + files). Small, checkable steps.

## Sequenced

- [ ] **T1.** Reconcile `deploy-cpanel.yml` with the owner's standing
  no-backend-auto-deploy rule (2026-10-07): decide backend deploys manual
  (IT colleague) vs keep auto; document the decision in
  `docs/CPANEL_DEPLOY.md`. — status: TODO, needs owner
- [ ] **T2.** Update root README: it still describes a "local-only, no
  backend" phase; the Laravel 10 + MySQL backend exists and deploys.
  — status: TODO
- [ ] **T3.** Font migration: move `--font-sans` to the Apple font stack
  per owner rule; keep Inter/Sora only where deliberately display.
  — status: TODO (see `docs/DESIGN.md`)
- [ ] **T4.** Decide contact/brand final state for live widget demo vs
  sales site (compare page, pricing) — currently demo passcode `3456`
  documented in README. — status: TODO
- [ ] **T5.** Confirm AI + email provider configuration for live
  (`api/config/brix.php`, AI keys, mail) — code gates them with
  `not_configured`; verify which are live on bridgingfx.com/brixchat.
  — status: TODO
- [ ] **T6.** Verify `VITE_API_URL` transport against production Laravel
  API (end-to-end: widget → API → MySQL → agent dashboard); document any
  fallback gaps in `docs/PHP_API.md`. — status: TODO
- [ ] **T7.** Close outstanding QA follow-ups from the compliance branch
  merge (`c47ae8d`) if any remain (SEO domain, contact anti-spam).
  — status: TODO, verify on live site
- [ ] **T8.** Evaluate remaining blog cadence/content pipeline vs
  conversion pages (pricing/compare) — content is flowing; confirm
  strategy with owner. — status: ongoing

## Completed (from git history)

- Laravel 10 conversion of the plain-PHP workspace API, Supabase
  removed (`ea744ca`)
- MySQL/MariaDB schema port + migrations (`f95601c`, `0715b24`)
- cPanel deploy workflow for `bridgingfx.com/brixchat` (`ae20851`)
- Malware payload removed from `postbuild.mjs` and `api/vite.config.js`
  (`9262b8f`) — origin of the 2026-09-30 supply-chain incident cleanup
  for this repo
- QA compliance pass: SEO domain, HTTPS redirect, image compression,
  legal pages, contact anti-spam (`6d8f394`, merged `c47ae8d`)
- Widget launcher branding: icon/shape/4-corner position/badge/tooltip
  + live preview (`1d2fdc3`, `955214c`, `970ef16`)
- Desktop notification audit + `message.received` webhook (`9e00142`)
- Platform admin (SaaS operator side) (`b33d23e`)
- PHP-API transport with localStorage fallback (`e9b8c93`)
- Content: regular blog articles through Oct 2026
