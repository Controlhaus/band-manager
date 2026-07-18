# Band Manager

A self-hosted web app for managing multiple music acts — auth & invitations,
act management, profiles, a song catalog, and a calendar with attendance and
setlists. Built with Next.js (App Router), PostgreSQL, Prisma, and better-auth;
deployed via Docker Compose behind Caddy (automatic HTTPS).

See [`docs/spec.md`](docs/spec.md) for the full specification.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, RSC, Server Actions) |
| Language | TypeScript (strict) |
| Database | PostgreSQL 16 + Prisma |
| Auth | better-auth (invite-only email/password) |
| UI | Tailwind CSS + shadcn/ui + lucide-react |
| Email | nodemailer (SMTP) |
| Reverse proxy | Caddy 2 |

---

## Local development

Requirements: Node 22, Docker (Docker Desktop, OrbStack, or colima).

```bash
# 1. Use Node 22
nvm use            # respects .nvmrc

# 2. Install deps
npm install

# 3. Start Postgres (published on 127.0.0.1:5433)
docker compose up -d db

# 4. Apply migrations and seed (bootstrap admin + demo data)
npm run migrate:dev
npm run seed

# 5. Run the dev server
npm run dev
```

Open http://localhost:3000 and sign in with the bootstrap superadmin from your
`.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`). A local `.env` is included for
development; the defaults are `admin@example.com` / `changeme-admin-123` with
`SEED_DEMO=true`.

> There is **no public signup** — the app is invite-only. The first account is
> the bootstrap superadmin created by the seed; everyone else joins via an
> invitation link.

### Useful scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build (`prisma generate` + `next build`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run migrate:dev` | Create/apply a dev migration |
| `npm run seed` | Idempotent seed |
| `npm test` | Vitest unit/integration tests |
| `npm run test:e2e` | Playwright smoke tests (desktop + mobile) |

---

## Testing

- **Unit/integration (Vitest):** the §4 capability matrix and the authorization
  guards, including READONLY rejection.
  ```bash
  npm test
  ```
- **E2E smoke (Playwright):** login, browse the catalog, open a calendar entry,
  set attendance, and open a setlist item in the side sheet — run once at a
  desktop viewport and once at mobile. Needs the app + seeded demo data.
  ```bash
  npx playwright install   # first time
  npm run test:e2e
  ```
- **Throwaway test DB:**
  ```bash
  docker compose -f docker-compose.test.yml up -d
  DATABASE_URL=postgresql://test:test@localhost:5434/test?schema=public \
    npx prisma migrate deploy && npm test
  ```

---

## Deployment (VPS, Docker Compose)

1. **DNS:** point an A record for your domain at the VPS IP.
2. **Configure env:** copy `.env.example` to `.env` and fill it in. In
   particular set:
   - `APP_URL=https://your.domain` and `APP_DOMAIN=your.domain` (must match the
     host in `APP_URL`)
   - `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET` (`openssl rand -hex 32`)
   - `SMTP_*` for invitation/reset emails
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` for the first login
3. **Launch:**
   ```bash
   docker compose up -d
   ```
   The `app` container waits for the database, runs `prisma migrate deploy`,
   seeds the bootstrap admin if needed, then starts. Caddy provisions TLS
   automatically.
4. **First login:** browse to `https://your.domain` and sign in with
   `ADMIN_EMAIL` / `ADMIN_PASSWORD`, then create acts and invite users.

Postgres is only reachable on the internal Compose network (plus a
localhost-only port mapping for host-side dev).

### Backups

`scripts/backup.sh` dumps the database (`pg_dump`) and tars the uploads volume,
keeping 14 days. Schedule it nightly with cron:

```cron
0 3 * * * cd /path/to/band-manager && ./scripts/backup.sh >> /var/log/band-backup.log 2>&1
```

### Restore

```bash
./scripts/restore.sh 2026-07-18_030000   # a backup stamp from ./backups
```

Stops `app`, recreates the database from the dump, restores the uploads volume,
then restarts `app` (migrations are a no-op on a restored DB).

### Orphaned file cleanup

```bash
npx tsx scripts/prune-orphan-files.ts
```

---

## Project layout

```
app/                 # routes (App Router) + server actions in app/actions/*
components/           # UI kit (components/ui) + feature components
lib/                  # prisma, auth, permissions, files, tz, rate-limit, …
prisma/               # schema, migrations, seed
scripts/              # backup / restore / prune
e2e/, tests/          # Playwright and Vitest
```

Authorization lives in one place — [`lib/permissions.ts`](lib/permissions.ts)
with the capability→role map in [`lib/roles.ts`](lib/roles.ts). Every server
action guards through it. New modules are added via the registry in
[`lib/modules.ts`](lib/modules.ts).
