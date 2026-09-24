# Brix Chat — cPanel Deploy Guide (MySQL + PHP backend)

Run Brix Chat on standard cPanel shared hosting. No Node, no Composer, no Postgres —
just MySQL + PHP 8, which every cPanel host provides.

**What you get:** the full app (marketing site, client dashboard `/app`, platform admin
`/admin`, chat widget) backed by a real MySQL database and a plain-PHP REST API,
instead of browser localStorage.

**Time:** ~20 minutes if you have cPanel access.

---

## 0. What lives where

| Piece | Repo path | Goes to |
|---|---|---|
| Database schema + demo seed | `mysql/schema.sql` | Imported into MySQL via phpMyAdmin |
| PHP REST API | `api/` | `public_html/api/` on the host |
| API settings (secrets) | `api/config.php` (you create it) | `public_html/api/config.php` — never in git |
| Frontend (built site) | `dist/` after `npm run build` | `public_html/` on the host |

Login stays workspace + passcode. Demo data seeded by the SQL file:
**workspace `demo` / passcode `3456`** (platform admin) and **workspace `acme` / passcode `7890`**
(client dashboard). Change or delete these after your first login.

---

## 1. Create the MySQL database (cPanel)

1. cPanel → **MySQL® Databases** → create database, e.g. `brixchat`.
2. Same page → create a MySQL user, e.g. `brixchat`, with a strong password.
3. **Add User to Database** → grant **ALL PRIVILEGES**.
4. Note the exact names — cPanel usually prefixes them: `cpaneluser_brixchat`.

## 2. Import the schema (phpMyAdmin)

1. cPanel → **phpMyAdmin** → open your new database.
2. **Import** tab → choose the repo file `mysql/schema.sql` → **Go**.
3. It must finish with no errors. You should see **35 tables** (workspaces, members,
   conversations, messages, tickets, …) and 2 seeded workspaces (`demo`, `acme`).
4. The import is idempotent — re-importing will not duplicate the seed rows.

> `mysql/schema.sql` works on MySQL 8 and MariaDB 10.6+. If your host runs an older
> MySQL 5.7, JSON columns and CHECK constraints will fail — ask the host to move
> you to MySQL 8 (standard on current cPanel).

## 3. Upload the PHP API

1. Upload the whole repo `api/` folder to `public_html/api/` (File Manager or FTP).
   Required files: `index.php`, `.htaccess`, `router.php`, `config.sample.php`,
   `lib/*.php`, `cron/*.php`.
2. Copy `api/config.sample.php` → `api/config.php` **on the server** and edit it:
   - `DB_HOST` → usually `localhost` on cPanel (some hosts give a socket host;
     keep `127.0.0.1` only if `localhost` fails).
   - `DB_NAME`, `DB_USER`, `DB_PASS` → the values from step 1.
   - `APP_SECRET` → generate one: `php -r 'echo bin2hex(random_bytes(32)), PHP_EOL;'`
     (run in cPanel → Terminal, or locally). Rotating it later logs everyone out.
   - `SITE_ORIGIN` → your exact site URL, e.g. `https://chat.example.com`
     (no trailing slash). This is the only origin allowed to call the API.
   - Leave `APP_DEBUG` = 0 in production.
3. Sanity check in a browser: `https://YOURDOMAIN/api/auth/me` should return
   `{"error":{"code":"unauthorized",…}}` (401) — that means the router works.
   If you get a 404 or 500, see Troubleshooting below.

> `api/config.php` is git-ignored. Never commit it, never email it.

## 4. Build and upload the frontend

On your own machine (Node 20+):

```bash
cd brix-chat
VITE_API_URL=https://YOURDOMAIN/api npm run build
```

Upload the contents of `dist/` to `public_html/` (so `index.html` sits next to the
`api/` folder). The app now talks to your MySQL backend.

- The transport priority is: Supabase env vars → `VITE_API_URL` → localStorage.
  With `VITE_API_URL` baked in, the PHP/MySQL backend is used.
- The public demo at `dawoodshah2232-svg.github.io/brix-chat` is built **without**
  `VITE_API_URL`, so it keeps working on localStorage — untouched by this.

## 5. Cron jobs (cPanel → Cron Jobs)

| Job | Schedule | Command |
|---|---|---|
| SLA checker | every 15 min | `*/15 * * * * /usr/bin/php /home/USERNAME/public_html/api/cron/sla-checker.php >/dev/null 2>&1` |
| Webhook retries | every 5 min | `*/5 * * * * /usr/bin/php /home/USERNAME/public_html/api/cron/webhook-retry.php >/dev/null 2>&1` |

Replace `USERNAME` with your cPanel username and check the PHP path
(cPanel → **MultiPHP Manager** or `which php` in Terminal; commonly `/usr/bin/php`
or `/opt/cpanel/ea-php83/root/usr/bin/php`).

## 6. Optional: AI copilot and email

- **AI copilot** (`POST /api/ai/copilot`): set `AI_API_KEY` (OpenAI) or
  `AI_ANTHROPIC_KEY` in `config.php`. Without a key the endpoint honestly returns
  `501 not_configured` and the dashboard shows "connect AI provider".
- **Email** (`POST /api/email/send`): set `MAIL_ENABLED` = 1 and `MAIL_FROM`.
  Uses PHP `mail()` — works if your cPanel account can send mail; otherwise keep
  it 0 and the endpoint returns an honest 501.

## 7. Smoke test

1. Open `https://YOURDOMAIN/` → marketing site loads.
2. Log in workspace `demo` / passcode `3456` → platform admin opens.
3. Log in workspace `acme` / passcode `7890` → client dashboard opens.
4. In the dashboard: inbox lists the seeded Ayesha Khan conversation; open it,
   reply — the message persists (refresh the page, it is still there).
5. Tickets page shows the seeded refund ticket.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `/api/...` returns 404 | `api/.htaccess` must be uploaded (hidden files!). cPanel Apache needs `AllowOverride All` — standard on shared hosting; if 404s persist, check **Errors** in cPanel. |
| 500 on every API call | Open cPanel → **Errors** / `public_html/api/error_log`. Usual cause: wrong DB credentials or `config.php` PHP syntax error — run `php -l api/config.php`. |
| `SQLSTATE[HY000] [2002]` | DB host wrong — try `localhost` instead of `127.0.0.1` (or the reverse). |
| CORS error in browser console | `SITE_ORIGIN` must match the page origin exactly (`https://` vs `http://`, no trailing slash). |
| "Session expired" right after login | Server clock skew vs token expiry, or `APP_SECRET` changed — log in again. |
| Schema import errors about JSON/CHECK | Host MySQL is too old — move the account to MySQL 8 / MariaDB 10.6+. |
| Mail not sending | `MAIL_ENABLED` = 1 and the cPanel account must be allowed to send (some hosts throttle new accounts). |
| Widget on another site can't reach the API | Add that site's origin — the API only allows `SITE_ORIGIN`. For multiple sites, extend the CORS check in `api/index.php` (documented there). |

## Security notes

- `config.php` holds secrets — keep it out of git (already ignored) and out of backups you share.
- Passcodes are bcrypt hashes; demo passcodes `3456` / `7890` are public — set real
  passcodes for members after first login (Team page).
- API keys are shown once at creation (`bk_live_…`); only their SHA-256 hash is stored.
- There is no realtime socket on the PHP transport — the dashboard polls
  `GET /api/updates?since=` every ~5 seconds. This is normal shared-hosting behavior.
