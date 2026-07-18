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
