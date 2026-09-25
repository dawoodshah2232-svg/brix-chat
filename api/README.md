# Brix Chat API (Laravel 10)

Backend for the Brix Chat SPA (`../src`). Every response is JSON:
`{ "data": ... }` on success, `{ "error": { "code", "message" } }` on failure.

## Setup (local, XAMPP)

```bash
cp .env.example .env          # set DB_*, APP_SECRET
php artisan key:generate
# base schema + demo data (workspaces acme/demo), then platform tables:
mysql -u root brix_chat < ../mysql/schema.sql
php artisan migrate
php artisan db:seed           # plans (+ admin if PLATFORM_ADMIN_* set)
php artisan brix:admin you@example.com   # create/reset a platform admin
php artisan serve --port=8099
```

The SPA reads `VITE_API_URL` (default `http://127.0.0.1:8099/api`).

## Two kinds of accounts

| Who | Login | Token | Routes |
|---|---|---|---|
| Platform admin (operator) | `POST /api/admin/auth/login` (email + password) | Sanctum, `platform_admins` table | `/api/admin/*` |
| Workspace member (client team) | `POST /api/auth/login` (workspace + name/email + passcode) | HMAC token (`App\Support\WorkspaceToken`) | everything else |

A workspace `owner` is the owner of *their* workspace only. They are never a
platform admin.

## Layout

- `routes/api.php`: all routes
- `app/Http/Controllers/AuthController.php`: workspace signup/login/me
- `app/Http/Controllers/Admin/*`: operator console API
- `app/Support/*`: tokens, workspace creation, stats, platform settings/audit
- `legacy/`: the original plain-PHP workspace API, reached through
  `LegacyApiController` for any route not matched above. Areas are being
  moved out of it into proper controllers one at a time.
