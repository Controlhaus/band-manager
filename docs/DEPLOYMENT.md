# Deployment Guide

This guide covers deploying **Band Manager** to a single VPS with Docker
Compose and Caddy (automatic HTTPS), and — importantly — the **update path** for
shipping changes after you go live.

> **Is it ready to deploy?** Yes. The app builds cleanly, unit tests pass, and
> the Docker image has been verified to run a clean deploy (migrations → seed →
> healthy server → working login). Before going live you only need to supply
> real secrets, SMTP credentials, and your domain (below).

---

## 1. Prerequisites

- A VPS (the target is a netcup VPS 2000 G11, Debian 12 / Ubuntu 24.04) with a
  public IP.
- A domain name you control.
- Docker Engine + Docker Compose plugin installed on the VPS:
  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"   # then log out/in
  ```
- SMTP credentials (for invitation and password-reset emails).

---

## 2. DNS

Create an **A record** pointing your domain (e.g. `band.example.com`) at the
VPS's public IP. Caddy provisions a Let's Encrypt certificate automatically on
first boot, so the DNS must resolve before you start the stack.

---

## 3. Get the code onto the server

```bash
git clone <your-repo-url> band-manager
cd band-manager
```

---

## 4. Configure `.env`

Copy the example and fill it in:

```bash
cp .env.example .env
```

Set at least:

| Variable | Notes |
|---|---|
| `APP_URL` | `https://band.example.com` |
| `APP_DOMAIN` | `band.example.com` — **must** match the host in `APP_URL` |
| `POSTGRES_PASSWORD` | a strong password |
| `BETTER_AUTH_SECRET` | `openssl rand -hex 32` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | your mail provider |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | the bootstrap superadmin created on first run |
| `MAX_UPLOAD_MB` | upload size cap (default 25) |
| `DEFAULT_TZ` | default timezone for new acts |
| `SEED_DEMO` | leave `false` in production |

`.env` is git-ignored — keep it secret and back it up somewhere safe.

---

## 5. First deploy

```bash
docker compose up -d
```

On startup the `app` container automatically:
1. waits for the database to be healthy,
2. runs `prisma migrate deploy` (applies all migrations),
3. seeds the bootstrap superadmin + lookup data (idempotent),
4. starts the server.

Caddy then obtains TLS certificates and begins proxying.

### Verify

```bash
# App health (from the server)
curl -fsS http://localhost:3000/api/health   # {"status":"ok"}  (via the app container network)

docker compose logs -f app                    # watch startup / migrations / seed
```

Then browse to `https://band.example.com` and sign in with `ADMIN_EMAIL` /
`ADMIN_PASSWORD`. There is no public signup — invite everyone else from the app.

---

## 6. Updating the app (the update path) ⭐

You *will* find things to change after launch. The flow is designed to be
simple and safe.

### Standard update (code and/or database changes)

```bash
cd band-manager
git pull
docker compose build app        # rebuild the app image from the new code
docker compose up -d app         # recreate just the app container
```

That's it. When the new container starts, its entrypoint runs
`prisma migrate deploy`, so **any new database migrations are applied
automatically** — you don't run migrations by hand on the server. Postgres and
Caddy keep running untouched; only the app container is replaced (a few seconds
of downtime).

To update everything (e.g. after bumping base images):

```bash
git pull
docker compose build
docker compose up -d
```

### How database changes flow from dev → production

1. **Locally**, change `prisma/schema.prisma` and create a migration:
   ```bash
   npm run migrate:dev -- --name your_change
   ```
   This writes a new folder under `prisma/migrations/`.
2. **Commit** the schema change *and* the generated migration folder.
3. **On the server**, `git pull` + `docker compose build app` +
   `docker compose up -d app` — the entrypoint's `migrate deploy` applies the
   new migration. Never edit the DB by hand.

> Tip: additive migrations (new tables/columns) are safe to deploy live. For
> destructive changes (dropping/renaming columns), take a backup first (§7) and
> prefer a two-step "expand then contract" migration.

### Rollback

- **Code rollback:** check out the previous commit/tag and rebuild:
  ```bash
  git checkout <previous-tag>
  docker compose build app && docker compose up -d app
  ```
- **Database rollback:** Prisma migrations are forward-only. To undo a bad
  migration, restore the most recent backup (§8) and redeploy the previous
  code. This is why you take a backup before deploying destructive schema
  changes.

### Zero-ish-downtime note

`docker compose up -d app` recreates the container with a brief interruption
while it boots (migrations + server start — typically seconds). Caddy returns a
transient 502 during that window and recovers automatically. For a single-node
self-hosted app this is expected and acceptable; no orchestration is required.

---

## 7. Backups

`scripts/backup.sh` dumps the database and archives the uploads volume, keeping
14 days. Schedule it nightly with cron on the VPS:

```cron
0 3 * * * cd /home/youruser/band-manager && ./scripts/backup.sh >> /var/log/band-backup.log 2>&1
```

Back up your `.env` separately (it holds the secrets needed to read a backup).

---

## 8. Restore

```bash
cd band-manager
./scripts/restore.sh 2026-07-18_030000    # a stamp from ./backups
```

This stops `app`, recreates the database from the dump, restores the uploads
volume, and restarts `app` (migrations are a no-op on a restored DB).

---

## 9. Routine operations

| Task | Command |
|---|---|
| View app logs | `docker compose logs -f app` |
| View all logs | `docker compose logs -f` |
| Restart app only | `docker compose restart app` |
| Stop everything | `docker compose down` (keeps volumes) |
| DB shell | `docker compose exec db psql -U band band` |
| Prune orphaned upload files | `docker compose exec app node -e "…"` *(or run `scripts/prune-orphan-files.ts` locally against the DB)* |
| Check health | `docker compose exec app wget -qO- localhost:3000/api/health` |

### Security checklist before launch

- `BETTER_AUTH_SECRET` is a fresh 64-hex value (not the dev default).
- `POSTGRES_PASSWORD` changed from the default.
- `ADMIN_PASSWORD` is strong and changed after first login.
- SMTP configured so invitations and password resets actually send.
- The firewall exposes only 80/443 (Postgres stays on the internal network).
- `.env` is not committed and is backed up securely.

---

## 10. Troubleshooting

| Symptom | Check |
|---|---|
| TLS not issued | DNS A record resolves to the VPS; ports 80/443 open; `docker compose logs caddy`. |
| App container restarts | `docker compose logs app` — usually a bad `DATABASE_URL` or unreachable DB. |
| Invitations/resets don't arrive | SMTP vars; the app logs "SMTP not configured" if unset. Invites are still created and can be resent. |
| Migration failed on deploy | `docker compose logs app`; fix the migration locally, commit, redeploy. Restore from backup if needed. |
| Login rejected | Confirm you're using the current `ADMIN_EMAIL`; the bootstrap admin is only created when the DB has no users. |

---

## 11. Deploying onto the shared netcup server (Sendy + Webmin present)

The netcup server already runs **Sendy** behind a web server (Apache or Nginx)
that owns ports **80** and **443**, and **Webmin** manages the box. The default
stack in §5 ships its own **Caddy** on 80/443, which would collide with the
existing web server. The fix is simple: **don't run the bundled Caddy**. Instead
run only Postgres + the app, publish the app on a localhost-only port, and let
the server's existing web server reverse-proxy a new virtual host to it
(terminating TLS with your existing Let's Encrypt setup).

```
Internet ──▶ existing Apache/Nginx (:443, Let's Encrypt) ─┬─▶ Sendy (PHP)
                                                          └─▶ band.example.com ──▶ 127.0.0.1:3000 (app container)
                                                                                        └─▶ Postgres (internal only)
```

### 11.1 DNS

Add an **A record** for the app's hostname (e.g. `band.example.com`) pointing at
the **same** server IP that already serves Sendy.

### 11.2 Get the code and configure `.env`

Follow §3 and §4 as written, with these notes:

- `APP_URL` / `APP_DOMAIN` = your new hostname (`band.example.com`).
- The front web server terminates TLS, so the app itself only needs to be
  reachable on localhost. Keep everything else (secrets, SMTP, admin) the same.

> **SMTP:** Sendy is a bulk-email app (typically sending via Amazon SES), **not**
> a general SMTP relay — keep Band Manager's own `SMTP_*` settings for
> invitations and password resets. If you already have working SMTP credentials
> on the box, reuse those.

### 11.3 Run the stack without Caddy

Add an override file that publishes the app to localhost only (create it next to
`docker-compose.yml`):

```yaml
# docker-compose.shared.yml — run behind the server's existing web server.
services:
  app:
    ports:
      - "127.0.0.1:3000:3000"   # reachable only by the local reverse proxy
```

Then bring up **only** the `db` and `app` services (never `caddy`, so ports
80/443 stay with the existing server):

```bash
docker compose -f docker-compose.yml -f docker-compose.shared.yml up -d db app
```

> To avoid typing the file list every time, export it for your shell/session:
> ```bash
> export COMPOSE_FILE=docker-compose.yml:docker-compose.shared.yml
> ```
> Then the update path from §6 becomes `docker compose up -d db app` (again,
> naming the services so Caddy is never started). If port `5433` is already in
> use on the host, change the `db` mapping (or drop it — the app reaches the DB
> over the internal network regardless).

### 11.4 Add the reverse-proxy virtual host (via Webmin)

Create a new virtual host for `band.example.com` that proxies to
`http://127.0.0.1:3000`, then issue a Let's Encrypt certificate for it using your
existing method (Virtualmin's SSL/Let's Encrypt panel, or certbot). Raise the
upload limit to match `MAX_UPLOAD_MB` (default 25).

**Apache** (enable `proxy`, `proxy_http`, `headers`, `ssl` modules):

```apache
<VirtualHost *:443>
    ServerName band.example.com

    SSLEngine on
    # Point these at the cert your Let's Encrypt tooling issued:
    SSLCertificateFile      /etc/letsencrypt/live/band.example.com/fullchain.pem
    SSLCertificateKeyFile   /etc/letsencrypt/live/band.example.com/privkey.pem

    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "https"
    ProxyPass        / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/

    LimitRequestBody 26214400            # ~25 MB, match MAX_UPLOAD_MB
    Header always set Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
    Header always set X-Content-Type-Options "nosniff"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
</VirtualHost>

<VirtualHost *:80>
    ServerName band.example.com
    Redirect permanent / https://band.example.com/
</VirtualHost>
```

**Nginx** (if the box uses Nginx instead):

```nginx
server {
    listen 443 ssl;
    server_name band.example.com;

    ssl_certificate     /etc/letsencrypt/live/band.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/band.example.com/privkey.pem;

    client_max_body_size 25m;            # match MAX_UPLOAD_MB
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-Proto https;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Real-IP         $remote_addr;
    }
}

server {
    listen 80;
    server_name band.example.com;
    return 301 https://band.example.com$request_uri;
}
```

Reload the front web server after saving (Webmin has an "Apply/Restart" button;
or `systemctl reload apache2` / `systemctl reload nginx`). Sendy's own virtual
host is untouched — the two apps coexist on the same server, each on its own
hostname.

### 11.5 Verify

```bash
# App answers locally (behind the proxy):
curl -fsS http://127.0.0.1:3000/api/health          # {"status":"ok"}
# End-to-end through the front proxy + TLS:
curl -fsS https://band.example.com/api/health        # {"status":"ok"}
docker compose logs -f app                            # startup / migrations / seed
```

Then browse to `https://band.example.com` and sign in with `ADMIN_EMAIL` /
`ADMIN_PASSWORD`.

### 11.6 Notes for the shared box

- **Everything else in this guide still applies** — updates (§6), backups (§7),
  restore (§8), and routine ops (§9), just remember to name `db app` on
  `docker compose up` (or set `COMPOSE_FILE`) so Caddy never starts.
- **Postgres stays private:** the override binds the app to `127.0.0.1` and the
  DB to the internal network — nothing new is exposed publicly, so no firewall
  changes are needed beyond the 80/443 the server already allows.
- **Certificates:** renewals are handled by your existing Let's Encrypt tooling
  (Virtualmin/certbot), not by the app — the bundled Caddy is intentionally not
  running here.
