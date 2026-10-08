# Brix Chat — Coding Rules

AI agents working in this repo must follow these. Owner standing rules
apply on top.

## Stack (locked)

- Frontend: React 19 + Vite + TypeScript + Tailwind CSS v4 (CSS-first
  `@theme` tokens in `src/index.css`).
- Backend: **Laravel 10 — never upgrade** (owner standing rule). PHP 8.1+
  (`api/composer.json`: `laravel/framework ^10.10`, `sanctum ^3.3`).
- Database: **MySQL/MariaDB only** (cPanel hosting rule) —
  `mysql/schema.sql` + Laravel migrations. No Postgres/Supabase
  (`ea744ca` removed Supabase deliberately).
- Toolchain: `tsc -b && vite build` (frontend), PHPUnit 10 (backend),
  `oxlint` (frontend lint), `laravel/pint` (backend style).

## Conventions (from the existing docs)

- API envelopes: `{ "data": … }`, lists with `next_cursor`; errors
  `{ "error": { "code", "message" } }` — codes in `docs/PHP_API.md`.
- IDs: UUID v4 strings; cursor pagination = last item's `id`, no offsets.
- Timestamps: ISO-8601 UTC with milliseconds (`…Z`); keep the documented
  epoch-ms exceptions, do not "fix" them unilaterally.
- Auth: passcode min length 4 (login/set), 8–128 (invite accept);
  bcrypt hashes, never returned (`""`).
- Workspace scoping: every query must filter `workspace_id = :wid`;
  `developer` role must never touch chat content (see `docs/PHP_API.md`
  role matrix).

## Must do

- `git fetch origin` + pull latest `main` before starting any work.
- After editing: run the build (`npm run build`), lint (`npx oxlint`),
  backend tests where touched; `git diff --check`; report whether safe
  to deploy.
- Never claim success before verifying (build output / live check).
- Preserve existing working functionality; never reset/destroy work
  without explicit approval.
- Update `docs/TASKS.md` and `docs/MEMORY.md` as work completes.
- Keep reference docs accurate: `docs/API.md`, `docs/PHP_API.md`,
  `docs/WEBHOOKS.md`, `docs/CPANEL_DEPLOY.md`, `docs/SEO_CHECKLIST.md`.

## Must NOT do

- Never force-push; never `git reset --hard` without explicit approval.
- Never upgrade Laravel 10 (standing rule).
- Never add a non-MySQL backend or a Postgres/Supabase dependency.
- Never commit other people's uncommitted changes; only `git add` what
  the task owns.
- Never bypass workspace scoping or the role matrix in new endpoints.
- Never put secrets (`.env`, keys, passcodes) in commits.
- **Deploy note:** `.github/workflows/deploy-cpanel.yml` auto-deploys the
  backend on push to `main`, which conflicts with the owner's standing
  no-backend-auto-deploy rule — do not assume pushes go live; confirm
  with the owner (see `docs/ARCHITECTURE.md`).
