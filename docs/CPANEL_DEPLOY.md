# Deploying Brix Chat to cPanel (bridgingfx.com/brixchat)

Every push to `main` runs `.github/workflows/deploy-cpanel.yml`: it builds the
dashboard, uploads the Laravel API over SSH, updates the database, and checks
the live site. This page is the one-time setup.

## What goes where

| Part | Server path | URL |
|---|---|---|
| Dashboard (built React app) | `public_html/bridgingfx.com/brixchat/` | https://bridgingfx.com/brixchat/ |
| API entry (link) | `public_html/bridgingfx.com/brixchat/backend` → `~/brixchat/api/public` | https://bridgingfx.com/brixchat/backend/api |
| API code, `.env`, logs | `~/brixchat/api/` (outside `public_html`, never web-readable) | none |
| Base schema | `~/brixchat/mysql/schema.sql` | none |
| Database | its own MySQL database (e.g. `cpuser_brixchat`) | none |

The bridgingfx.com site keeps its own folder, workflow and repository. Brix Chat
only touches the paths above, and uses its own database.

## 1. Stop the BridgingFX deploy from deleting Brix Chat

The BridgingFX-Website workflow uploads with `rsync --delete`, which removes
anything in `public_html/bridgingfx.com/` that is not part of that site's build,
including `brixchat/`. Add one exclude line to its **Upload to cPanel** step
(`.github/workflows/deploy-cpanel.yml` in BridgingFX-Website):

```yaml
          rsync -az --delete \
            --exclude '/brixchat/' \
            -e "ssh -i ~/.ssh/cpanel_key -p $CPANEL_PORT" \
            out/ "$CPANEL_USER@$CPANEL_HOST:$CPANEL_TARGET/"
```

Do this **before** the first Brix Chat deploy.

## 2. Database

cPanel → **MySQL Databases**:

1. Create a database, e.g. `brixchat` (cPanel shows it as `cpuser_brixchat`).
2. Create a user with a strong password.
3. Add the user to the database with **ALL PRIVILEGES**.

Leave it empty. The first deploy creates the tables (`php artisan
brix:install-schema`, then migrations). Later deploys only apply new
migrations; existing data is never overwritten. Demo workspaces are **not**
installed.

## 3. PHP 8.1

The API is Laravel 10 on PHP 8.1 (dependencies are locked for 8.1 in
`api/composer.json` → `config.platform.php`), on the web and on the command line.

- cPanel → **MultiPHP Manager**: `bridgingfx.com` must use PHP 8.1 or newer.
  The static bridgingfx.com site is unaffected by this.
- Check the command-line PHP over SSH (or cPanel → **Terminal**): `php -v`.
  If it is older than 8.1, find an 8.1 binary (usually
  `/opt/cpanel/ea-php81/root/usr/bin/php`) and set it as the repository
  variable `CPANEL_PHP` (step 6).

## 4. Create `~/brixchat/api/.env` (once)

Create the folder and file with cPanel **File Manager** (enable "Show hidden
files") or over SSH. Generate the two secrets on any machine with PHP:

```bash
php -r "echo 'base64:'.base64_encode(random_bytes(32)), PHP_EOL;"   # APP_KEY
php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"                   # APP_SECRET
```

```dotenv
APP_NAME="Brix Chat"
APP_ENV=production
APP_KEY=base64:...paste...
APP_DEBUG=false
APP_URL=https://bridgingfx.com/brixchat/backend

LOG_CHANNEL=daily
LOG_LEVEL=warning

DB_CONNECTION=mysql
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=cpuser_brixchat
DB_USERNAME=cpuser_brixchat
DB_PASSWORD=...

CACHE_DRIVER=file
SESSION_DRIVER=file
QUEUE_CONNECTION=sync

# Signs member logins. Keep it stable: changing it signs everyone out.
APP_SECRET=...paste...
SITE_ORIGIN=https://bridgingfx.com

# Optional
AI_API_KEY=
AI_ANTHROPIC_KEY=
MAIL_ENABLED=false
API_RATE_LIMIT=60

# First platform admin, created on the first deploy (remove afterwards)
PLATFORM_ADMIN_EMAIL=you@example.com
PLATFORM_ADMIN_PASSWORD=...
```

Set the file's permissions to `600`. The deploy never uploads or overwrites
`.env`; after editing it, re-run the workflow (it rebuilds the config cache).

## 5. SSH key for GitHub Actions

Use a key just for this repo, so it can be revoked on its own.

cPanel → **SSH Access** → **Manage SSH Keys** → **Generate a New Key**:
name `github_actions_brixchat`, type RSA 4096 (or Ed25519), no passphrase
(Actions cannot type one). Then **Manage** → **Authorize**, and
**View/Download** the private key.

Or generate it locally and import the public key:

```bash
ssh-keygen -t ed25519 -N "" -C github_actions_brixchat -f github_actions_brixchat
```

cPanel → **Import Key**: paste `github_actions_brixchat.pub` as the public key,
then **Authorize** it. Keep the private file out of the repository.

## 6. GitHub secrets and variables (brix-chat repo)

**Settings → Secrets and variables → Actions**.

Secrets (the same host/port/user values as BridgingFX-Website):

| Secret | Value |
|---|---|
| `CPANEL_HOST` | the server hostname |
| `CPANEL_PORT` | SSH port (`22` if unset) |
| `CPANEL_USER` | the cPanel username |
| `CPANEL_SSH_KEY` | the full private key from step 5 |

Variables (optional; defaults shown):

| Variable | Default |
|---|---|
| `BRIXCHAT_URL` | `https://bridgingfx.com/brixchat` |
| `BRIXCHAT_BASE_PATH` | `/brixchat/` |
| `BRIXCHAT_APP_DIR` | `brixchat` (under the home directory) |
| `BRIXCHAT_WEB_DIR` | `public_html/bridgingfx.com/brixchat` |
| `CPANEL_PHP` | `php` |

## 7. Scheduler (cron)

cPanel → **Cron Jobs**, every minute:

```
* * * * * cd $HOME/brixchat/api && php artisan schedule:run >/dev/null 2>&1
```

Use the full PHP 8.1 path instead of `php` if step 3 needed one. This delivers
webhook retries and flags overdue tickets (every 5 minutes).

## 8. Deploy

Push to `main`, or run the workflow from the **Actions** tab. It stops with a
clear message if `.env` is missing or PHP is too old. When it finishes:

- https://bridgingfx.com/brixchat/backend/api/health shows `{"data":{"ok":true,...}}`
- https://bridgingfx.com/brixchat/ loads the site; sign up or log in there.
- Platform admin: https://bridgingfx.com/brixchat/admin-login, or create one
  over SSH: `cd ~/brixchat/api && php artisan brix:admin you@example.com`.

## Troubleshooting

| Problem | Check |
|---|---|
| `/backend/api/health` is 403 or 404 | The `backend` link must exist (`ls -l ~/public_html/bridgingfx.com/brixchat`). If the host blocks symlinks, ask them to allow `SymLinksIfOwnerMatch`. |
| 500 on API calls | `~/brixchat/api/storage/logs/laravel-*.log`; usually `.env` database values. |
| Brix Chat vanished after a BridgingFX deploy | Step 1 is missing. |
| Deploy fails at "Update database" | Read the step log; migrations run inside maintenance mode, which is always lifted afterwards. |
