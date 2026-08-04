Here's the complete specification. Stack choice: **Next.js (App Router) + PostgreSQL + better-auth**, single repository, deployed via Docker Compose with Caddy for automatic HTTPS — the least moving parts to maintain on a VPS, and auth is invite-only email/password with built-in reset flows (easiest for users, nothing external to configure beyond SMTP).

---

# Software Development Specification: "Band Manager" — Multi-Act Music Management App

## 1. Purpose & Scope

A self-hosted web application for managing multiple music acts (bands/ensembles). Core modules in v1: authentication & invitations, act management, user profiles, song catalog, calendar with attendance and setlists. Architecture must allow future modules (contacts, booking CRM, chat) without restructuring.

**Deployment target:** netcup VPS 2000 G11 (x86, Debian 12 or Ubuntu 24.04 assumed), Docker Compose, single node.

## 2. Instructions for the Coding Agent

- Produce a **complete, runnable application in one repository**. No placeholders, no TODOs, no mocked handlers.
- **Every interactive frontend element (form, button, toggle, sort header, drag handle, file input) must be wired to a real backend handler** (server action or route handler) that validates input, checks authorization, and persists to the database. Section 8 contains the mandatory element→handler mapping.
- Include: schema + migrations, seed script, all pages/components, all server actions, Dockerfile, docker-compose.yml, Caddyfile, `.env.example`, and a README with first-run instructions.
- All code in TypeScript, strict mode. All inputs validated with Zod on the server regardless of client-side validation.

## 3. Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15+, App Router, React Server Components, Server Actions |
| Language | TypeScript (strict) |
| Database | PostgreSQL 16 |
| ORM | Prisma (migrations via `prisma migrate`) |
| Auth | better-auth — email/password, invite-only signup, email verification, password reset, session cookies (httpOnly, secure, sameSite=lax) |
| UI | Tailwind CSS + shadcn/ui (Radix primitives), lucide-react icons |
| Tables | TanStack Table (server-driven sorting) |
| Email | nodemailer via SMTP (env-configured) |
| File storage | Local disk volume (`UPLOAD_DIR`), served through an authenticated route handler — never publicly |
| Runtime | Node 22, multi-stage Docker build |
| Reverse proxy / TLS | Caddy 2 (automatic Let's Encrypt) |

## 4. Roles & Authorization Model

Two authorization layers:

**Global role** (`users.globalRole`): `SUPERADMIN` | `USER`
- SUPERADMIN: full access to all acts, creates acts, invites any user to any act with any role, manages all users, can promote other SUPERADMINs.

**Per-act role** (`ActMembership.role`): `ADMIN` | `MEMBER` | `READONLY` — assigned per act individually.

| Capability | SUPERADMIN | Act ADMIN | MEMBER | READONLY |
|---|---|---|---|---|
| Create/delete acts | ✓ | – | – | – |
| Edit act settings | ✓ | ✓ | – | – |
| Invite users to the act / change member roles | ✓ | ✓ | – | – |
| Remove members from act | ✓ | ✓ | – | – |
| CRUD songs, versions, links, files | ✓ | ✓ | ✓ | – |
| CRUD calendar entries & setlists | ✓ | ✓ | ✓ | – |
| Set own attendance status | ✓ | ✓ | ✓ | ✓ |
| Add notes/attachments to entries | ✓ | ✓ | ✓ | – |
| View catalog, calendar, member list | ✓ | ✓ | ✓ | ✓ |
| Edit own profile | ✓ | ✓ | ✓ | ✓ |
| Track own rehearsed/performed status per song | ✓ | ✓ | ✓ | ✓ |

MEMBER permissions are marked TBD by the product owner — implement the set above as the default and store the capability checks in a single central policy module (`lib/permissions.ts`) so they can be adjusted in one place. Every server action must call `requireActRole(userId, actId, minRole)` or `requireSuperadmin(userId)` from this module before doing anything. Never rely on UI hiding for security.

## 5. Data Model (Prisma)

All tables get `id` (cuid), `createdAt`, `updatedAt` unless noted. Enum-like fields that must be **extensible** (attendance status, event type) are lookup tables, not DB enums.

```
User            id, email (unique), name, globalRole (SUPERADMIN|USER),
                emailVerified, passwordHash (managed by better-auth tables),
                + better-auth session/account tables as generated

UserProfile     userId (unique FK), instruments String[], skillLevel
                (BEGINNER|INTERMEDIATE|ADVANCED|PROFESSIONAL), equipment Json
                (array of {name, category, notes}), bio

Act             name, slug (unique), description, createdById

ActMembership   actId, userId, role (ADMIN|MEMBER|READONLY),
                @@unique([actId, userId])

Invitation      email, token (unique), invitedById, expiresAt, acceptedAt?,
                grants Json  -- [{actId, role}], one invite can cover multiple acts

Song            actId, title, artist, style, key?, tempoBpm?, durationSec?,
                lyrics? (text/markdown), notes?, status
                (IDEA|REHEARSING|REHEARSED|PERFORMED|RETIRED)

SongLink        songId, platform (SPOTIFY|YOUTUBE|APPLE_MUSIC|SOUNDCLOUD|OTHER),
                url, label?

SongVersion     songId, name (e.g. "Acoustic, key of G"), key?, notes?
                -- links and files may attach to a version via FileAsset/SongLink.versionId?

UserSongStatus  userId, songId, rehearsed Boolean, rehearsedAt?,
                performedCount Int default 0, lastPerformedAt?,
                @@unique([userId, songId])

EventType       actId? (null = global default), name, sortOrder
                -- seeded: Wedding, Corporate, Club, Festival, Private, Other

AttendanceStatus key (unique, e.g. "attending"), label, color, sortOrder
                -- seeded: attending, not_attending, unsure; extensible by adding rows

CalendarEntry   actId, kind (REHEARSAL|EVENT), eventTypeId? (required if EVENT),
                title, date, locationName?, locationAddress?, locationUrl?,
                loadInAt?, soundcheckAt?, downbeatAt?, loadOutAt?,
                notes? (markdown), createdById

Attendance      entryId, userId, statusKey (FK → AttendanceStatus),
                @@unique([entryId, userId])

Setlist         entryId, name (default "Set 1"), sortOrder

SetlistItem     setlistId, position, songId, songVersionId?, notes?

FileAsset       entityType (SONG|SONG_VERSION|CALENDAR_ENTRY), entityId,
                kind (LEAD_SHEET|LYRICS|ATTACHMENT|OTHER), filename, storagePath,
                mimeType, sizeBytes, uploadedById
```

Deletion rules: deleting an act cascades to all its data (confirm dialog requires typing act name). Deleting a song sets `SetlistItem.songId` handling: block deletion if referenced by any setlist, offer "retire" instead. Removing a user from an act keeps their historical attendance/status rows.

## 6. Application Structure & Routes

```
/login, /forgot-password, /reset-password/[token], /invite/[token]
/                      → redirect: superadmin → /admin, else → /acts
/acts                  → act switcher (cards of acts the user belongs to)
/acts/[slug]           → act dashboard (next events, recent songs, member list)
/acts/[slug]/songs     → song catalog table
/acts/[slug]/songs/[id]→ song detail (info, links, lyrics, lead sheets, versions)
/acts/[slug]/calendar  → month/list calendar view
/acts/[slug]/calendar/[entryId] → entry detail
/acts/[slug]/members   → members & roles (admin), invite form
/acts/[slug]/settings  → act settings (admin)
/profile               → own profile editor + per-song rehearsed/performed overview
/admin                 → superadmin: all acts, create act, all users, invitations
/api/files/[id]        → authenticated file download/stream (checks act membership)
/api/auth/[...all]     → better-auth handler
```

Global layout: sidebar with act switcher, module nav (Dashboard, Songs, Calendar, Members), user menu (Profile, Logout). Sidebar nav is data-driven from a module registry (see §10).

## 7. Feature Specifications

### 7.1 Auth & Invitations
- **No public signup.** Registration only via invitation token.
- Superadmin (and act admins, scoped to their act) create invitations: email + one or more `{act, role}` grants. Sends email with link `/invite/[token]`, expiry 14 days, resend + revoke supported.
- Invite acceptance: if email already has an account → login → memberships applied. Otherwise → set name + password → account created, email marked verified (invite proves ownership), memberships applied.
- Password reset via email. Rate limiting (in-memory or DB-backed): 5 attempts / 15 min per IP+email on login, reset, invite acceptance.
- First-run bootstrap: seed script creates SUPERADMIN from `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars if no user exists.

### 7.2 User Profile
- Fields: name, instruments (tag input, free text with suggestions), skill level (select), equipment (repeatable rows: name, category select [Instrument, Amp, PA, Lighting, Cables, Other], notes), bio.
- Read-only section "My songs": table across all the user's acts showing each song with rehearsed toggle and performed counter (`+1 performed` button, editable count) — writes to `UserSongStatus`.
- Profiles are visible to fellow act members (read-only) via the members page.

### 7.3 Song Catalog
- Table columns: Title, Artist, Style, Key, BPM, Duration, Status, My Rehearsed (✓/–), My Performed (count), Links (icons), Updated. **Every column sortable server-side** (asc/desc via URL search params, so sorted views are shareable), plus free-text search over title/artist and filters for style and status. Pagination at 50 rows.
- Song detail page: info form; streaming links list (platform icon + label, add/edit/delete); lyrics editor (markdown, rendered view + edit mode); lead sheet uploads (PDF/images, per song and per version); versions list (create version with name/key/notes, attach files/links to a version).
- Statuses: song-level status (act-wide) plus per-user rehearsed/performed tracking. Sorting by "Rehearsed"/"Performed" uses the current user's `UserSongStatus`.

### 7.4 Calendar
- Views: **month grid** and **list view** (toggle, persisted per user in localStorage). Entries color-coded: rehearsal vs. event (event type shown as badge).
- Entry create/edit form: kind (rehearsal/event), event type select (only when kind=event; act admins can manage the event-type list in act settings), title, date, location (name, address, optional map/URL — render address as a Google Maps link), the four times (load-in, soundcheck, downbeat, load-out; time pickers, all optional, validated non-decreasing order when multiple set), notes (markdown).
- **Attendance:** entry detail lists all current act members with their status chip. Each member can set only their own status via a segmented control (Attending / Not attending / Unsure — options rendered from the `AttendanceStatus` table so future statuses appear automatically). Admins see a summary count per status.
- **Setlists:** one or more per entry. Add setlist → add songs via searchable combobox over the act's catalog (optionally choosing a version) → reorder via drag-and-drop (persist positions) → per-item notes. Each setlist item is a **hyperlink that opens the song in a right-side sheet/drawer** (song info, lyrics, lead sheet preview) **with a full-screen toggle button** (expands the sheet to a full-viewport overlay; also a "open song page" link). Sheet supports next/previous navigation through the setlist.
- **Attachments & notes:** file upload list (any file type, size-limited) + markdown notes section on every entry.

### 7.5 Admin Area (superadmin)
- Acts: list all, create (name → slug auto), delete (typed confirmation).
- Users: list all with memberships, edit global role, deactivate user (blocks login), delete user.
- Invitations: list pending/expired/accepted, create with multi-act grants, resend, revoke.

## 8. Frontend Element → Backend Handler Mapping (mandatory)

Implement each handler as a named server action in `app/actions/<module>.ts` (or route handler where noted). Every handler: Zod-validate → auth check via `lib/permissions.ts` → DB operation → `revalidatePath` → typed result `{ok, error?}` surfaced as toast/inline error.

| UI element | Handler | Notes |
|---|---|---|
| Login form | better-auth `/api/auth` | route handler |
| Forgot/reset password forms | better-auth flows | sends SMTP mail |
| Invite acceptance form | `acceptInvitation` | token, name, password |
| Create invitation form | `createInvitation` | grants[]; scope-checked |
| Resend / revoke invite buttons | `resendInvitation`, `revokeInvitation` | |
| Create act form | `createAct` | superadmin only |
| Edit act settings form | `updateAct` | |
| Delete act button (typed confirm) | `deleteAct` | superadmin only |
| Change member role select | `updateMembershipRole` | |
| Remove member button | `removeMembership` | |
| Profile form (all fields incl. equipment rows) | `updateProfile` | |
| Rehearsed toggle / performed +1 / count edit | `setUserSongStatus` | upsert |
| Song create/edit form | `createSong`, `updateSong` | |
| Song delete/retire buttons | `deleteSong`, `retireSong` | block delete if in setlist |
| Add/edit/delete streaming link | `upsertSongLink`, `deleteSongLink` | URL validated per platform |
| Lyrics editor save | `updateSongLyrics` | |
| Lead sheet / attachment upload input | `uploadFile` (route handler, multipart) | mime+size validated, stored under `UPLOAD_DIR/<actId>/` |
| File delete button | `deleteFileAsset` | removes DB row + disk file |
| File download/preview link | `GET /api/files/[id]` | streams after membership check |
| Version create/edit/delete | `upsertSongVersion`, `deleteSongVersion` | |
| Catalog column sort headers / search / filters | server component reads searchParams | server-side ORDER BY whitelist |
| Calendar entry create/edit form | `createCalendarEntry`, `updateCalendarEntry` | time-order validation |
| Entry delete button | `deleteCalendarEntry` | confirm dialog |
| Attendance segmented control | `setAttendance` | own row only |
| Event type add/edit/delete (act settings) | `upsertEventType`, `deleteEventType` | block delete if referenced |
| Setlist add/rename/delete | `createSetlist`, `updateSetlist`, `deleteSetlist` | |
| Add song to setlist combobox | `addSetlistItem` | |
| Drag-and-drop reorder | `reorderSetlistItems` | positions array |
| Setlist item note edit / remove item | `updateSetlistItem`, `removeSetlistItem` | |
| Setlist item click | client: opens side sheet, fetches song via server component/route | no mutation |
| Full-screen toggle on sheet | client state only | |
| Entry notes save | `updateEntryNotes` | |
| Admin user role/deactivate/delete controls | `updateUserGlobalRole`, `setUserActive`, `deleteUser` | superadmin |
| Logout button | better-auth signout | |

## 9. Security Requirements

- All mutations behind authenticated sessions; server actions verify origin (Next.js default) — no state-changing GETs.
- Central authorization in `lib/permissions.ts`; every action begins with an auth guard. Write at least one test or runtime assertion per role tier.
- Uploads: allowlist mime types per kind (lead sheets: pdf/png/jpg; attachments: broad but block executables), max size `MAX_UPLOAD_MB` (default 25), filenames randomized on disk, original name stored in DB, files served only via the authenticated route with `Content-Disposition`.
- Passwords: better-auth defaults (scrypt/argon2), min length 10.
- Security headers via Next config/Caddy: HSTS, X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy, CSP (self + inline styles for Tailwind runtime needs).
- Rate limiting on auth endpoints (see 7.1). Postgres not exposed publicly (compose-internal network only).
- Secrets only via env; `.env` git-ignored; `.env.example` provided.

## 10. Extensibility Requirements

- **Module registry:** `lib/modules.ts` exports nav items + route prefixes; Contacts, Booking CRM, and Chat get commented stub entries demonstrating the pattern.
- Lookup tables (`AttendanceStatus`, `EventType`) instead of enums where the product owner flagged extensibility.
- `FileAsset` is polymorphic (`entityType`/`entityId`) so future modules attach files without schema changes.
- Keep server actions grouped per module; no cross-module imports except through `lib/`.
- Schema naming leaves room: e.g., `Contact`, `Booking`, `Message` names unused.

## 11. Deployment (netcup VPS 2000 G11)

**docker-compose.yml** with three services:

- `app`: multi-stage Node 22 build (`next build`, standalone output), runs migrations on start (`prisma migrate deploy`) then seeds bootstrap admin if DB empty; volume `uploads:/data/uploads`.
- `db`: `postgres:16-alpine`, volume `pgdata`, healthcheck; only on internal network.
- `caddy`: ports 80/443, Caddyfile reverse-proxying to `app:3000` for `$DOMAIN`, automatic TLS.

**.env.example:**
```
DOMAIN=band.example.com
DATABASE_URL=postgresql://band:${POSTGRES_PASSWORD}@db:5432/band
POSTGRES_PASSWORD=change-me
BETTER_AUTH_SECRET=generate-64-hex
APP_URL=https://band.example.com
SMTP_HOST= SMTP_PORT=587 SMTP_USER= SMTP_PASS= SMTP_FROM="Bandboard <noreply@example.com>"
ADMIN_EMAIL= ADMIN_PASSWORD=
UPLOAD_DIR=/data/uploads
MAX_UPLOAD_MB=25
```

**README must cover:** DNS A record → VPS IP, `docker compose up -d`, first login, and backups: nightly cron running `pg_dump` into a dated file plus tar of the uploads volume, retained 14 days (provide `scripts/backup.sh`).

## 12. Seed & Demo Data

Seed script creates: the bootstrap superadmin; the three attendance statuses; six default event types; optionally (flag `SEED_DEMO=true`) one demo act with 10 songs (varied styles/links), 3 members, 2 calendar entries (one rehearsal, one wedding gig with a 2-set setlist).

## 13. Acceptance Criteria (Definition of Done)

1. `docker compose up -d` on a clean VPS yields a working HTTPS app; bootstrap admin can log in.
2. Admin creates an act, invites a user by email with MEMBER role; invite email arrives; user registers via link and sees only that act.
3. READONLY user can view everything in their act and change only their attendance and profile; all mutation attempts are rejected server-side (verify with direct action invocation, not just hidden UI).
4. Catalog sorts correctly by every column server-side, including per-user rehearsed/performed.
5. Calendar entry with all four times, attendance by three users, a setlist of 5 songs reordered by drag-and-drop; clicking a setlist item opens the side sheet; full-screen toggle works; lead sheet PDF previews in the sheet.
6. File uploaded to an entry is downloadable by act members and returns 403 for non-members.
7. No dead controls: every button/form in the UI performs its mapped action from §8.

---

Two things worth flagging before you hand this to the coding agent: the spec pins the MEMBER permission set as a default you can change later in one file, and it interprets "rehearsed/performed" as per-user tracking (with a separate act-wide song status) — if you meant those as act-level flags only, tell the agent to drop `UserSongStatus` and sort on `Song.status` instead.


Here's the addendum resolving all blocking and non-blocking items. Append it to `spec.md` as §14 — the decisions are chosen for lowest maintenance, and I've flagged the two you might want to override (timezone scope, recurring events).

---

# 14. Spec Addendum — Resolved Decisions

This section overrides anything contradictory above.

## 14.1 Timezone & datetime modeling

- Every `Act` gets a required `timezone` field (IANA string, e.g. `Europe/Berlin`, default from `DEFAULT_TZ` env var, editable in act settings).
- `CalendarEntry.date` is removed as a separate concept. Store `startsAt` (required, UTC `DateTime`) plus `loadInAt`, `soundcheckAt`, `downbeatAt`, `loadOutAt` as optional full UTC `DateTime` columns. `downbeatAt`, when set, must equal or define `startsAt`; if only `startsAt` is set it represents the entry's nominal start.
- **Input/display:** all datetime pickers and all rendering convert to/from the act's timezone using `date-fns-tz`. No per-user timezones in v1.
- **Validation:** among whichever of the four times are set, enforce `loadInAt ≤ soundcheckAt ≤ downbeatAt ≤ loadOutAt` by direct UTC comparison (common reference, DST-safe).
- Calendar month grid buckets entries by their date in the act's timezone.

## 14.2 Markdown sanitization (mandatory)

All markdown (lyrics, entry notes, setlist item notes, bios) is rendered with `react-markdown` + `remark-gfm` + `rehype-sanitize` using the default schema. Raw HTML in markdown is stripped, never rendered. No `dangerouslySetInnerHTML` anywhere in the codebase. Links rendered from markdown get `rel="noopener noreferrer nofollow" target="_blank"`.

## 14.3 better-auth invite-only integration

- Disable the public email/password signup endpoint via better-auth config (`emailAndPassword.disableSignUp: true` or, if the installed version lacks the option, a `before` hook on the sign-up path returning 403).
- `acceptInvitation` is the **only** account-creation path. It creates the user through better-auth's server-side API (so hashing/session handling stay consistent), marks the email verified, then applies the invitation's membership grants in the same transaction.
- Add `User.isActive Boolean @default(true)`. Implement a better-auth `before`-sign-in hook rejecting inactive users, **and** a session-validation check in the shared `getSession()` wrapper in `lib/auth.ts` so existing sessions of deactivated users are cut off on their next request. All server actions and route handlers obtain the session exclusively through this wrapper.

## 14.4 Deletion & file cleanup rules (restated cleanly)

- **Song:** hard delete is blocked if any `SetlistItem` references the song or one of its versions; the UI then offers "Retire" (sets status `RETIRED`, hides from default catalog filter). If unreferenced, hard delete cascades to its `SongLink`, `SongVersion`, `UserSongStatus`, and `FileAsset` rows.
- **SongVersion:** blocked if referenced by a `SetlistItem`; otherwise deletes its file assets.
- **CalendarEntry:** delete cascades to `Attendance`, `Setlist`, `SetlistItem`, and its `FileAsset` rows.
- **FileAsset cleanup:** because `FileAsset` is polymorphic (no DB-level cascade), implement `lib/files.ts#deleteAssetsFor(entityType, entityId)` that deletes the DB rows and unlinks the disk files; every cascading delete above calls it inside the same operation. Disk unlink failures are logged, never block the transaction. Provide `scripts/prune-orphan-files.ts` that removes disk files with no matching `FileAsset` row (run manually or via cron).

## 14.5 Per-user catalog sorting (must be SQL-side)

Sorting/filtering by "My Rehearsed" / "My Performed" is implemented in the database, not in memory: left-join `UserSongStatus` scoped to the current user (`LEFT JOIN ... ON songId = s.id AND userId = $current`) and `ORDER BY` on `rehearsed` / `performedCount` with `NULLS LAST`, before pagination. Prisma's relational orderBy can't express this cleanly — use `prisma.$queryRaw` with a **whitelisted** sort-column map for this table (never interpolate user input into SQL identifiers). All other columns may use standard Prisma orderBy through the same whitelist mechanism.

## 14.6 Uploads: body size

`uploadFile` is a route handler reading the multipart stream directly; it enforces `MAX_UPLOAD_MB` itself and is excluded from any server-action body limits. Set `serverActions.bodySizeLimit: '2mb'` (server actions never receive files) and document in the Caddyfile `request_body max_size {$MAX_UPLOAD_MB}MB` so the proxy matches.

## 14.7 Slug collisions

`slugify(name)`; on collision append `-2`, `-3`, … Slugs are immutable after creation (renaming an act changes `name` only).

## 14.8 EventType scoping

- Global rows (`actId = null`) are managed by **superadmin only** (in `/admin`).
- Act admins manage only act-scoped rows in act settings. The event-type select for an entry shows global + that act's rows, act rows first.
- Deleting either kind is blocked while referenced by any `CalendarEntry` (offer nothing else; user must reassign entries first).

## 14.9 Attendance control renders dynamically

The attendance control is generated from the `AttendanceStatus` table ordered by `sortOrder`: segmented control for ≤3 statuses, automatically switching to a select dropdown for 4+. Status chips/colors come from the table's `color` field. No status keys hardcoded in components; the seeded keys may be referenced only in the seed script and admin summary ordering.

## 14.10 Test tooling

- **Vitest** for unit/integration: cover `lib/permissions.ts` (every role × capability from the §4 matrix) and direct server-action invocation for at least one mutation per module asserting READONLY rejection (satisfies acceptance criterion 3).
- **Playwright** for E2E smoke: login, create song, create calendar entry, set attendance, open setlist side sheet. Run against `docker compose -f docker-compose.test.yml` with a throwaway Postgres.
- `npm test` runs Vitest; `npm run test:e2e` runs Playwright. CI config out of scope.

## 14.11 Field nullability

Required: `Song.title`; `CalendarEntry.title`, `kind`, `startsAt`; `Act.name`; `User.name`, `email`; `Invitation.email`, `grants`. Everything else in §5 is optional/nullable, with these defaults: `Song.status = IDEA`, `UserProfile.skillLevel` nullable (user may leave unset), `Setlist.name = "Set 1"`, `Attendance` row absent = "no response" (shown as its own neutral chip, distinct from "unsure").

## 14.12 Mobile responsiveness (required)

The app must be fully usable on a 390 px viewport. Specifically: sidebar collapses to a bottom nav or hamburger; catalog table becomes a card list on small screens (title/artist/status + tap for detail); calendar defaults to list view on mobile; entry detail, attendance control, and the setlist side sheet (which becomes a full-screen sheet on mobile) are thumb-operable. Playwright smoke test runs once at mobile viewport.

## 14.13 Recurring events

**Out of scope for v1.** Add a "Duplicate entry" action on `CalendarEntry` (copies everything except attendance, prompts for new date) as the manual workaround. Schema needs no recurrence fields now.

## 14.14 Env consolidation

Single source of truth: `APP_URL`. Remove `DOMAIN` from app config — the Caddyfile derives the domain via `{$APP_DOMAIN}` set in `.env` only for Caddy, and better-auth's `baseURL` is set from `APP_URL`. Add `DEFAULT_TZ=Europe/Berlin`. README notes that `APP_DOMAIN` must match the host in `APP_URL`.

---

The two decisions you might want to override before handoff: **14.1** assumes one timezone per act rather than a single app-wide timezone (slightly more code, but survives a touring act or a DST edge without surprises), and **14.13** punts recurring rehearsals to a duplicate button — if your acts rehearse weekly, that's the first feature you'll miss, so say the word and I'll spec proper recurrence instead.


Here's §15. On the CSP question I've made the call for `'unsafe-inline'` scripts rather than nonce plumbing — reasoning at the end, easy to flip if you disagree.

---

# 15. Spec Addendum 2 — Final Resolutions

Overrides anything contradictory in §1–14.

## 15.1 File serving: inline preview vs. download

`GET /api/files/[id]`, after the membership check, sets headers as follows:

- **Previewable allowlist** — `application/pdf`, `image/png`, `image/jpeg`, `image/webp`: `Content-Disposition: inline; filename="..."` with the stored (DB) `mimeType` as `Content-Type`.
- **Everything else:** `Content-Disposition: attachment` and `Content-Type: application/octet-stream` regardless of stored mime type.
- Always: `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=3600`, filename RFC 5987-encoded.
- The `mimeType` stored at upload is determined server-side by sniffing magic bytes (`file-type` package), not trusted from the client; files failing the allowlist check for their declared kind (§9) are rejected at upload.
- The side sheet renders PDFs via `<object type="application/pdf" data="/api/files/[id]">` with a "Download" fallback link (no PDF.js dependency; browser-native rendering).

## 15.2 Exact CSP

Set via `next.config.ts` headers on all routes:

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' blob: data:;
object-src 'self';
frame-src 'self';
font-src 'self';
connect-src 'self';
media-src 'self';
frame-ancestors 'none';
base-uri 'self';
form-action 'self'
```

- `object-src 'self'` and `frame-src 'self'` exist for the same-origin PDF preview; `frame-ancestors 'none'` replaces the X-Frame-Options DENY requirement in §9 (keep both headers, they're compatible).
- **Decision — `'unsafe-inline'` for scripts, no nonces:** Next.js App Router injects inline bootstrap/hydration scripts; nonce-based CSP requires middleware plumbing that forces full dynamic rendering and is a common source of subtle breakage in generated codebases. Since all user-authored content is sanitized markdown (§14.2) with no `dangerouslySetInnerHTML` anywhere, inline-script injection has no vector in this app. Revisit nonces post-v1 if desired.
- No third-party origins: streaming links open as plain `<a target="_blank">` navigations (no embedded Spotify/YouTube players in v1), so no external domains appear in the CSP.

## 15.3 Superadmin lockout guards

In `deleteUser`, `updateUserGlobalRole` (demotion), and `setUserActive` (deactivation): before committing, count **other** users where `globalRole = SUPERADMIN AND isActive = true`; if zero, reject with a clear error ("At least one active superadmin is required"). Additionally, a superadmin may not demote or deactivate **themselves** even if others exist (prevents accidental self-lockout; another superadmin must do it). Self-deletion is likewise blocked for superadmins. Enforced in the server actions (not just UI), with unit tests for each guard.

## 15.4 Invitation hardening

- **Token:** 32 bytes from `crypto.randomBytes`, sent in the email link base64url-encoded; DB stores only its SHA-256 hash (`tokenHash` column, unique). Lookup on acceptance = hash the presented token, compare. Raw token is never persisted or logged.
- **Email normalization:** a single `normalizeEmail()` util (trim + lowercase) applied at invite creation, account creation, login, and password reset. The DB unique constraint operates on the normalized form.
- **Acceptance with existing account:** the logged-in user's normalized email must equal the invitation's email, else show "This invitation was issued to a different address" (no grants applied). Grants are applied via `ActMembership` **upsert**: existing membership keeps the **higher** of current vs. granted role (ADMIN > MEMBER > READONLY), never downgrades. Grants referencing a deleted act are silently skipped; the acceptance succeeds with the remaining grants and the summary screen lists what was applied.
- **Re-invite rules in `createInvitation`:**
  - Target email has a **pending, unexpired** invite → block; UI offers "Resend" or "Revoke and create new" instead.
  - Target is already a member of **every** act in the grants at an equal-or-higher role → block with "Already a member" message.
  - Otherwise proceed (acceptance dedupe handles overlap).
- **Acceptance is transactional:** user creation + email verification + membership grants + `acceptedAt` stamp in one DB transaction.

## 15.5 `startsAt` / `downbeatAt` — single rule

The entry form always has one required **Date & start time** field → `startsAt`. The four call-times (load-in, soundcheck, downbeat, load-out) are each optional. **If `downbeatAt` is set, it must equal `startsAt`** — the form implements this by making the downbeat field a read-only mirror of the start time with an "add downbeat to schedule" checkbox (checked = persist `downbeatAt = startsAt`). Ordering validation `loadInAt ≤ soundcheckAt ≤ startsAt ≤ loadOutAt` runs over whichever times are set. Calendar displays use `startsAt` exclusively.

## 15.6 Minor resolutions

- **Healthcheck:** `GET /api/health` returns `{status:"ok"}` after a `SELECT 1` against the DB (503 otherwise). Compose healthcheck on `app` curls it; Caddy has no readiness gating (it 502s harmlessly during the seconds of startup), but `app` `depends_on: db: condition: service_healthy`.
- **UserProfile lifecycle:** empty `UserProfile` row created inside the same transaction as account creation (`acceptInvitation` and bootstrap seed). `updateProfile` still upserts defensively; all reads tolerate a missing row.
- **Email send failures:** invite (and reset) rows persist even if SMTP fails; `createInvitation` returns `{ok:true, emailSent:false}` and the UI shows "Invitation created, but the email failed to send — use Resend." SMTP calls are outside the DB transaction.
- **Backup restore:** README gets a "Restore" section — stop `app`, `docker compose exec db psql -c 'DROP/CREATE DATABASE'`, pipe the dump in via `psql`, untar uploads into the volume, start `app` (migrations no-op on a restored DB). `scripts/restore.sh <backup-date>` provided alongside `backup.sh`.
- **Version pinning:** `package.json` pins **exact** versions (no `^`/`~`) for all dependencies; the agent pins whatever latest-stable it installs and commits the lockfile. Base images pinned by minor tag (`node:22-alpine`, `postgres:16-alpine`, `caddy:2-alpine`).
- **Seed idempotency:** all seed writes are upserts keyed on natural keys (`AttendanceStatus.key`, `EventType` name+actId, admin email); `SEED_DEMO` data guarded by an existence check on the demo act's slug. Re-running the seed is always safe.

---

The one judgment call to sanity-check: **15.2's `'unsafe-inline'` for scripts** trades a defense-in-depth layer for build reliability. Given sanitized markdown is the only user-content rendering path, the residual risk is low — but if this app will ever render third-party embeds (Spotify players, maps iframes), that's the moment to switch to nonces, and the spec says so. Also note 15.5 deliberately makes downbeat a mirror of start time rather than an independent field; if your acts treat "downbeat" and "event start" as different moments (e.g., doors vs. first note), tell me and I'll decouple them instead.

§16 below — items 1–3 plus the ordering-rule reconciliation, with the three nits pinned in one line each since they cost nothing. After this the spec is frozen; hand it off.

---

# 16. Spec Addendum 3 — Final Polish (spec frozen after this section)

Overrides anything contradictory in §1–15.

## 16.1 User deletion & authorship references

`deleteUser` behavior, encoded in the Prisma schema:

- **Cascade (user-owned data):** `UserProfile`, `ActMembership`, `UserSongStatus`, `Attendance`, better-auth session/account rows — `onDelete: Cascade`.
- **Preserve content, null the author:** `Act.createdById`, `CalendarEntry.createdById`, `FileAsset.uploadedById`, `Invitation.invitedById` — all nullable with `onDelete: SetNull`. Any UI that displays an author renders a null as "Deleted user". Songs, setlists, and setlist items carry no authorship columns in §5 — do not add any; they are act-owned and unaffected by user deletion.
- Pending invitations **created by** the deleted user survive (with null inviter); invitations **addressed to** the deleted user's email are revoked in the same transaction.
- The §15.3 last-superadmin guard runs before any of this.

## 16.2 AttendanceStatus management

**Confirmed: no admin UI or server action for `AttendanceStatus` in v1** — seed/SQL-only is intentional, and §8 stays as-is. To keep future edits safe, the schema and a documented invariant enforce: `key` is immutable once any `Attendance` row references it, and a status row may not be deleted while referenced (enforce via `onDelete: Restrict` on the FK; the key-immutability rule goes in a comment in `schema.prisma` and the README's "Extending" section, since no code path edits it in v1). Adding a fourth status is: insert a row with `key`, `label`, `color`, `sortOrder` — the UI adapts per §14.9.

## 16.3 Rate-limit store (DB-backed)

Resolving §7.1's open choice: rate limiting uses a `RateLimitBucket` table — `id`, `key` (unique; format `{scope}:{ip}:{email}` where scope ∈ `login|reset|invite_accept`), `windowStartsAt`, `count`. Fixed window: on each attempt, if `windowStartsAt` is older than 15 minutes, reset window and count; else increment; reject with 429 when count exceeds 5. Implemented as one upsert in `lib/rate-limit.ts`, called by the three auth flows. A daily cron line in the README (or the backup cron) deletes rows older than one day. Survives restarts and deploys; auditable by querying the table.

## 16.4 Canonical time-ordering rule (supersedes §14.1 wording)

One sentence, replacing both prior formulations: **Among whichever of `loadInAt`, `soundcheckAt`, `startsAt`, `loadOutAt` are present, enforce `loadInAt ≤ soundcheckAt ≤ startsAt ≤ loadOutAt` by UTC comparison; `downbeatAt`, when present, always equals `startsAt` (§15.5) and needs no separate validation.**

## 16.5 Clearing attendance

`setAttendance` accepts `statusKey: string | null`. Null deletes the caller's `Attendance` row, returning them to the derived "No response" state (§14.11). The UI exposes this as a small "Clear" affordance on the control, only visible when a status is set.

## 16.6 Suggestion sources

Both are data-derived, no static lists: the instruments tag-input suggests `SELECT DISTINCT` unnested values from `UserProfile.instruments` across the user's acts' members; the catalog style filter offers `SELECT DISTINCT style` over the current act's songs (nulls excluded). Empty data = empty suggestions, free-text entry always allowed.

---

# 17. Spec Addendum 4 — Booking Flow, Confirmations & Notifications

Extends §1–16; overrides where contradictory. Migration note for the agent: this is a **delta on the existing app** — write new Prisma migrations, do not regenerate the schema from scratch. All existing `CalendarEntry` rows migrate to `status = CONFIRMED`.

## 17.1 Data model additions

```
CalendarEntry   + status (TENTATIVE|CONFIRMED|CANCELLED, default CONFIRMED)
                + bookingGroupId? (FK, SetNull)
                + version Int default 1

BookingGroup    actId, title, customerName?, customerContact?, venueNotes?,
                responseDeadline? (UTC DateTime), status (OPEN|CONFIRMED|CANCELLED),
                createdById? (SetNull), confirmedEntryId? (SetNull)

AvailabilityResponse  entryId, userId, answer (AVAILABLE|NOT_AVAILABLE|MAYBE),
                respondedAt, @@unique([entryId, userId])  -- onDelete: Cascade both FKs

EntryAcknowledgement  entryId, userId, acknowledgedAt, versionAtAck Int,
                @@unique([entryId, userId])  -- Cascade both FKs

EntryChangeLog  entryId (Cascade), changedById? (SetNull), changedAt,
                changes Json  -- [{field, old, new}]; append-only, no update/delete path

Notification    userId (Cascade), type (BOOKING_POLL|NUDGE|DEADLINE_REMINDER|
                DATE_CONFIRMED|ENTRY_CHANGED|BOOKING_CANCELLED),
                title, body, linkPath, readAt?, createdAt

CalendarFeedToken  userId (unique, Cascade), tokenHash (unique), createdAt
```

`BookingGroup` is the future CRM seed — `customerName`/`customerContact` are plain optional strings in v1, replaced by a `Contact` FK when that module lands.

## 17.2 Lifecycle & rules

- **Create booking:** any ADMIN or MEMBER of the act (add "Create/confirm bookings & respond to polls: Admin ✓, Member ✓, Readonly – (respond only)" to the §4 matrix and `lib/permissions.ts`). Form: title, optional customer/venue fields, optional response deadline, and **1–n candidate dates**, each a full entry form (§7.4 fields). Candidates are created as `TENTATIVE` entries sharing the `bookingGroupId`; calendar renders them outlined with an "Option x/n" badge; setlists/attachments are allowed on tentative entries and survive confirmation.
- **Poll:** every act member (all roles) may set their own `AvailabilityResponse` per candidate — segmented control Available / Not available / Maybe, timestamp stored, shown in a per-option response matrix (member × option grid on the booking page) visible to the whole act. Responses editable until the group leaves `OPEN`.
- **Nudge:** button on the booking page (creator or any act admin) notifies members missing responses on ≥1 option. Automatic reminder fires once when `responseDeadline` is <48h away (see 17.5).
- **Confirm date:** any ADMIN or MEMBER picks the winning option → in one transaction: that entry `status = CONFIRMED`; sibling options `CANCELLED`; group `status = CONFIRMED` + `confirmedEntryId`; then attendance is seeded **bindingly**: AVAILABLE → `attending` **plus** an `EntryAcknowledgement` row (`acknowledgedAt = respondedAt` of the poll answer, `versionAtAck = 1`) — their poll answer *was* their commitment; NOT_AVAILABLE → `not_attending` + acknowledgement; MAYBE or no response → no attendance row, **pending**. All members are notified; pending members' notification and dashboard card say "Confirm your attendance".
- **Acknowledge:** `acknowledgeEntry` sets/updates the caller's attendance (required parameter: their status) and writes the acknowledgement with the entry's current `version`. Entry header shows *"Confirmed 4/6 · Pending: Alex, Sam"*; each name in the roster shows status + acknowledgement timestamp. `setAttendance` (§8) on a CONFIRMED entry now also upserts the acknowledgement — changing your status is itself an on-record act.
- **Change protection:** `updateCalendarEntry` on a CONFIRMED entry compares the **material fields** (`startsAt`, all call-times, location fields, `eventTypeId`, `kind`): if any changed, append `EntryChangeLog` rows, increment `version`, notify all members, and the entry banner shows "Changed since you confirmed" to every user whose `versionAtAck < version` — their roster chip flips to "re-confirm pending" (attendance status retained but visibly stale). Non-material edits (notes, setlists, attachments) log nothing and don't bump the version. The change log renders on the entry page (collapsible, oldest-first) and is immutable.
- **Cancel:** booking creator or act admin may cancel an OPEN group (all candidates → CANCELLED, members notified) or a CONFIRMED gig entry (status → CANCELLED, notified, change-logged). Cancelled entries hidden from the calendar by default behind a "Show cancelled" toggle.

## 17.3 Notifications (email + in-app)

- Every notification event writes a `Notification` row **and** sends an email (SMTP, existing config); email failures are logged and never block the transaction — the in-app row is the source of truth.
- In-app: bell icon in the header with unread count (server component, no polling in v1 — updates on navigation); dropdown lists latest 20 with read-state; "Mark all read"; each item links to `linkPath`. Full list page at `/notifications`.
- All notification templates state the act name, the entry title, and the **date/time rendered in the act's timezone** (§14.1).

## 17.4 ICS feed

- `/profile` gains a "Calendar feed" card: generate/regenerate a feed URL (`/api/ics/[token]`, 32-byte token, SHA-256 hash stored per §15.4 pattern; regenerating revokes the old). 
- The route (no session; token is the auth) returns an `text/calendar` VCALENDAR of all **CONFIRMED, non-cancelled** entries across the user's acts: UID = entry id, DTSTART/DTEND from `startsAt`/`loadOutAt` (fallback +3h), SUMMARY = `[Act] Title`, LOCATION, DESCRIPTION with call times, `SEQUENCE = version` so date changes propagate to subscribed calendars. TENTATIVE entries are excluded (held dates stay in-app only).

## 17.5 Scheduler

One `node-cron` job inside the app process (single node, per §11): every 15 minutes, find OPEN groups with `responseDeadline` within 48h **not yet reminded** (add `deadlineReminderSentAt?` to `BookingGroup`) and fire the DEADLINE_REMINDER notification to non-responders. Guarded by an env flag `ENABLE_SCHEDULER=true` so a future multi-container setup can pin it to one instance.

## 17.6 Handler mapping additions (§8 format)

| UI element | Handler |
|---|---|
| New booking form (incl. candidate date sub-forms) | `createBookingGroup` |
| Edit booking meta / add or remove candidate date | `updateBookingGroup`, `addBookingCandidate`, `removeBookingCandidate` |
| Availability segmented control (per option) | `setAvailability` (own row; null clears, §16.5 pattern) |
| Nudge button | `nudgeBooking` |
| Confirm-this-date button (typed-confirm dialog) | `confirmBookingDate` |
| Cancel booking / cancel confirmed gig | `cancelBookingGroup`, `cancelCalendarEntry` |
| Confirm-attendance card/button (pending members) | `acknowledgeEntry` |
| Bell dropdown open / mark read / mark all read | `markNotificationRead`, `markAllNotificationsRead` |
| Feed URL generate/regenerate/revoke | `rotateCalendarFeedToken`, `revokeCalendarFeedToken` |
| ICS subscription URL | `GET /api/ics/[token]` (route handler) |
| Change log expand | server-rendered, no mutation |

## 17.7 Acceptance criteria additions

8. A member creates a booking with three candidate dates; all act members see three outlined options in the calendar; the response matrix fills as members answer, timestamps visible.
9. Confirming option 2 cancels options 1 and 3, seeds attending + acknowledgement for everyone who answered Available, leaves Maybe-voters pending, and notifies all members (in-app row exists even if SMTP is down).
10. Moving the confirmed gig's `startsAt` bumps the version, writes a change-log row with old→new, shows "Changed since you confirmed" to prior acknowledgers, and updates the ICS feed with an incremented SEQUENCE.
11. The ICS URL imports into Google Calendar/Apple Calendar and shows only confirmed gigs; regenerating the token kills the old URL (404).
12. A READONLY user can answer polls and acknowledge, but every booking mutation (`createBookingGroup`, `confirmBookingDate`, etc.) is rejected server-side.

---

# 18. Spec Addendum 5 — Song Metadata Resolution, Streaming Links & Setlist Playlist Export

Extends §1–17; overrides where contradictory. **Migration note for the agent:** this is a delta on the existing app. Write new Prisma migrations; do not regenerate the schema. All existing `Song` rows migrate with new columns null and `resolutionStatus = UNRESOLVED`.

## 18.0 Problem statement

Today a user must hand-enter each song into the catalog (§7.3) and hand-add each streaming link (`SongLink`). The real-world workflow is: the act leader writes a setlist as plain text, builds an Apple Music playlist so everyone learns the same recording, then retypes all of it into the app. This section removes the retyping and makes "the same recording" enforceable at the data layer.

**Deliberate design decision:** the app does **not** read playlists from Spotify/Apple Music/YouTube. Playlist-read APIs require paid or reviewed developer agreements (Apple Music: $99/yr Developer Program; Spotify: Extended Quota Mode review). Instead the app resolves songs individually from free, no-account APIs and emits the setlist as shareable links. Do not implement playlist URL parsing or ingestion.

## 18.1 Scope

**In scope:** bulk text paste → song resolution → catalog; per-song multi-platform streaming links; artwork and 30-second preview on song detail; setlist link view and file exports; manual playlist URL storage per setlist.

**Non-goals for this delta (do not implement):** parsing pasted Spotify/Apple/YouTube playlist URLs; creating playlists on any platform via API; audio download or full playback; key/tempo detection (no free API exposes these — `Song.key` and `Song.tempoBpm` remain manual fields).

## 18.2 External services

All three require no account, no key, no signup, no fee.

| Service | Base | Auth | Limit | Used for |
|---|---|---|---|---|
| iTunes Search API | `https://itunes.apple.com` | none | unpublished; treat as 20 req/min, honor `Retry-After` | primary resolution, Apple Music URL, artwork, preview, metadata |
| Odesli / song.link | `https://api.song.link/v1-alpha.1` | none (optional key) | 10 req/min without a key | Spotify / YouTube / Tidal / Deezer URLs |
| MusicBrainz | `https://musicbrainz.org/ws/2` | none; **custom `User-Agent` required** | 1 req/sec, hard | canonical recording identity, ISRC, writer credits |

**iTunes sends no CORS headers.** Every call in this section is server-side only — route handlers, server actions, or the job runner. No browser `fetch` to any of these hosts.

## 18.3 Data model additions

```
Song            + appleTrackId       String?  @unique-per-act (see index below)
                + appleCollectionId  String?
                + isrc               String?
                + albumTitle         String?
                + releaseDate        DateTime?
                + artworkUrl         String?   -- Apple-hosted, hotlinked
                + previewUrl         String?   -- Apple-hosted, streamed
                + mbRecordingId      String?
                + mbWorkId           String?
                + writers            String[]  -- from MusicBrainz work relations
                + resolutionStatus   (UNRESOLVED|RESOLVED|MANUAL|FAILED) default UNRESOLVED
                + resolvedAt         DateTime?
                @@index([actId, appleTrackId])
                @@index([actId, isrc])

SongLink        platform enum gains: TIDAL, DEEZER, AMAZON_MUSIC, SONGLINK
                + source (MANUAL|ITUNES|ODESLI) default MANUAL
                @@unique([songId, versionId, platform, source])
                -- versionId already optional per §5; a null versionId means song-level

SongImportSession  actId, createdById? (SetNull), status (DRAFT|RESOLVING|REVIEW|
                COMMITTED|ABANDONED), rawInput Text, createdAt, committedAt?
                -- onDelete: Cascade from Act

SongImportLine  sessionId (Cascade), position Int, rawLine Text,
                parsedTitle?, parsedArtist?, parsedAlbumHint?,
                candidates Json,        -- normalized candidate array, see 18.9
                selectedCandidateIdx Int?,   -- null = skipped
                existingSongId?  (SetNull),  -- dedupe hit
                action (CREATE|LINK_EXISTING|SKIP|MANUAL) default CREATE,
                state (PENDING|RESOLVED|NO_MATCH|ERROR),
                errorMessage?
                @@unique([sessionId, position])

SetlistLink     setlistId (Cascade), platform (same enum), url, label?,
                createdById? (SetNull)
                -- manually pasted playlist URLs; see 18.12

EnrichmentJob   songId (Cascade), kind (ODESLI|MUSICBRAINZ),
                state (QUEUED|RUNNING|DONE|FAILED),
                attempts Int default 0, lastError?, runAfter DateTime,
                createdAt, completedAt?
                @@index([state, runAfter])
                @@unique([songId, kind])   -- one live job per song per kind; re-queue = upsert

ExternalLookupCache  provider (ITUNES|ODESLI|MUSICBRAINZ), cacheKey, payload Json,
                fetchedAt, expiresAt?
                @@unique([provider, cacheKey])
```

`SongLink.source` matters: re-running enrichment must replace `ODESLI`-sourced rows without touching rows a user added by hand.

## 18.4 Outbound HTTP layer

All external calls go through `lib/external/client.ts`. No adapter calls `fetch` directly.

**Throttle.** Per-provider in-memory token bucket (single node per §11, single Node process — in-memory is sufficient and state loss on restart is harmless because the job queue is DB-backed): iTunes 20/min, Odesli 10/min, MusicBrainz 1/sec. Requests queue rather than fail. Every request sets `User-Agent: BandManager/1.0 ( ${APP_URL} )` — required by MusicBrainz, courteous elsewhere.

**Timeouts and retries.** 10s timeout. Retry on 429/500/502/503/504 and network errors: 3 attempts, exponential backoff base 2s with jitter, honoring `Retry-After` when present. Never retry 400/401/403/404.

**Cache.** Read-through `ExternalLookupCache` keyed as follows — iTunes search: `search:${normalizedQuery}:${storefront}`, TTL 30 days. iTunes lookup by id: `lookup:${trackId}`, TTL 30 days. Odesli: `url:${appleTrackUrl}:${country}`, no expiry (results are stable). MusicBrainz: `isrc:${isrc}` or `recording:${normalizedQuery}`, TTL 90 days. A daily prune line in the existing backup cron (§16.3) deletes expired rows.

**Job runner.** Extend the existing `node-cron` scheduler (§17.5, gated by `ENABLE_SCHEDULER`) with a second job: every 30 seconds, claim up to 20 `EnrichmentJob` rows where `state = QUEUED AND runAfter <= now()`, ordered by `createdAt`, mark `RUNNING`, process through the throttled client, mark `DONE` or bump `attempts` with `runAfter = now() + 2^attempts minutes`. After 5 attempts, `FAILED` with `lastError`. Claiming uses `UPDATE ... WHERE state='QUEUED' ... RETURNING` so a future second instance can't double-claim. Jobs stuck in `RUNNING` for >10 minutes are reset to `QUEUED` at the start of each tick.

## 18.5 iTunes Search adapter — `lib/external/itunes.ts`

**Search:**
```
GET /search?term={encoded}&entity=song&limit=8&country={storefront}
```
`storefront` from `ITUNES_STOREFRONT` env (default `US`). Build `term` as `${artist} ${title}` when both parsed, else the raw line.

**Lookup by id** (for re-resolve and link repair):
```
GET /lookup?id={trackId}&entity=song&country={storefront}
```

**Field mapping**, `results[]` → internal `TrackCandidate`:

| iTunes field | Target |
|---|---|
| `trackName` | `title` |
| `artistName` | `artist` |
| `collectionName` | `albumTitle` |
| `trackTimeMillis` | `durationSec` = `Math.round(ms / 1000)` |
| `releaseDate` | `releaseDate` (ISO) |
| `trackId` | `appleTrackId` (store as string) |
| `collectionId` | `appleCollectionId` |
| `trackViewUrl` | `SongLink{platform: APPLE_MUSIC, source: ITUNES}` |
| `artworkUrl100` | `artworkUrl`, with `100x100` substituted to `400x400` in the path |
| `previewUrl` | `previewUrl` |
| `primaryGenreName` | `style` — **prefill only when the target song's `style` is empty**; never overwrite |
| `isStreamable` | if `false`, mark the candidate with a warning badge |

Discard results where `kind !== "song"`. iTunes does not return ISRC — that comes from MusicBrainz (18.7).

## 18.6 Odesli adapter — `lib/external/odesli.ts`

```
GET /links?url={encodeURIComponent(appleTrackViewUrl)}&userCountry={ODESLI_COUNTRY}
```

Send `?key=` only if `ODESLI_API_KEY` is set.

From `linksByPlatform`, write `SongLink` rows with `source = ODESLI` for: `spotify`, `youtube` or `youtubeMusic` (prefer `youtubeMusic`), `tidal`, `deezer`, `amazonMusic`. Also write the response's `pageUrl` as `platform: SONGLINK` — that's the universal link the setlist view uses as its default.

**Shortcut:** the song.link page URL is deterministic from the Apple track id — `https://song.link/i/{appleTrackId}`. Write that row synchronously at commit time so the setlist has a working universal link immediately; the enrichment job then fills in the individual platform rows. Users must not have to wait on a queued job to get a shareable link.

At 10 req/min a 40-song import takes ~4 minutes to fully enrich. That is acceptable because it is background work and results cache permanently.

## 18.7 MusicBrainz adapter — `lib/external/musicbrainz.ts`

**If the codebase already contains a MusicBrainz client with a rate limiter, reuse it and skip this subsection's implementation — only the field mapping below applies.** The attached spec contains no such client, so assume it must be written.

Tier 1, when an ISRC is already known (it won't be on first pass — this path exists for re-resolution and manual entry):
```
GET /ws/2/isrc/{isrc}?inc=recordings+artist-credits&fmt=json
```

Tier 2, the normal path, using the Apple-confirmed title/artist/duration:
```
GET /ws/2/recording/?query=recording:"{title}" AND artist:"{artist}" AND dur:[{d-3000} TO {d+3000}]&fmt=json&limit=5
```

Accept the top hit only when MusicBrainz's own `score >= 90` and the duration is within 5 seconds. Then fetch work relations for writers:
```
GET /ws/2/recording/{mbid}?inc=work-rels+artist-credits&fmt=json
```
followed by `GET /ws/2/work/{workMbid}?inc=artist-rels&fmt=json`, taking relations of type `composer` and `lyricist` into `Song.writers`.

Write `mbRecordingId`, `mbWorkId`, `writers`, and `isrc` (first ISRC on the recording, if present). **A MusicBrainz miss never fails anything** — the job completes `DONE` having written nothing. Apple metadata alone is a valid, complete song.

## 18.8 Bulk paste parser — `lib/import/parse.ts`

Pure function, no I/O, fully unit-testable. Input: raw multiline text. Output: `ParsedLine[]`.

Per line, in order:
1. Trim; skip empty lines and lines matching `^(set|SET)\s*\d+` or `^-{3,}$` (set separators — see the note below).
2. Strip leading enumeration: `^\s*(\d+[.):]|[-*•])\s+`.
3. Extract a trailing album hint: `\s*[\(\[]([^)\]]+)[\)\]]\s*$` → `parsedAlbumHint`, removed from the working string. Do **not** strip parentheticals containing `feat`, `ft.`, `remix`, `live`, `acoustic`, `reprise` — those are part of the title.
4. Split on the first occurrence of ` - `, ` – `, ` — `, ` | `, or ` by ` (case-insensitive for `by`).
5. If no separator: `parsedTitle` = whole string, `parsedArtist` = null.

**Artist/title ordering is not decided by the parser.** `Miles Davis - So What` and `So What - Miles Davis` are both valid and indistinguishable syntactically. The resolver (18.9) queries both orderings and lets the scores decide. Do not ask the user which format they used.

Set separators are detected and recorded in `SongImportLine` metadata but ignored — the standalone import targets the act catalog only. Importing directly into a set list (with version-aware duplicate handling) is specified separately in **§19**; it reuses this parser and the same review flow.

## 18.9 Resolution & scoring — `lib/import/resolve.ts`

For each parsed line:

1. **Dedupe check first, before any network call.** Look for an existing `Song` in the same act where normalized `title` and `artist` match. Normalization: lowercase, strip diacritics (`NFD` + strip combining marks), remove punctuation, collapse whitespace, expand `&`→`and`, unify `feat.`/`ft.`/`featuring`→`feat`. On hit, set `existingSongId`, `action = LINK_EXISTING`, `state = RESOLVED`, and skip the API call entirely. The user can override to `CREATE` in review.
2. **Query iTunes** with `${parsedArtist} ${parsedTitle}`. If a separator was found, also query the reversed ordering. Merge and dedupe candidates by `trackId`.
3. **Score** each candidate 0–1:
   - title similarity (Dice coefficient on bigrams of the normalized strings) × 0.45
   - artist similarity, same method × 0.35 — scored against `parsedArtist` in whichever ordering produced this candidate
   - album hint match, if present: 0.10 when `collectionName` normalized-contains the hint, else 0
   - result rank bonus: `0.10 × (1 - index/8)` — iTunes returns roughly by relevance and popularity
4. **Classify:**

| Condition | `state` | Review behavior |
|---|---|---|
| top score ≥ 0.85 and gap to second ≥ 0.15 | `RESOLVED` | pre-selected, collapsed row |
| top score ≥ 0.85, gap < 0.15 | `RESOLVED` | pre-selected but **expanded**, marked "similar matches" |
| 0.55 ≤ top score < 0.85 | `RESOLVED` | not pre-selected, expanded, all candidates shown |
| top score < 0.55, or zero results | `NO_MATCH` | manual entry row |
| API error after retries | `ERROR` | error text, retry button |

Persist the full candidate array (max 8, with all mapped fields) as `SongImportLine.candidates` so review renders without re-querying.

Resolution runs as a server action invoked once per session, iterating lines through the throttled client and updating rows as it goes. At 20 req/min, a 40-line paste with both orderings queried takes ~4 minutes; the review page polls session progress every 3 seconds and renders lines as they complete. Set `SongImportSession.status = RESOLVING` during, `REVIEW` after.

## 18.10 Import flow, routes and UI

New route: `/acts/[slug]/songs/import`. Reachable from an "Import songs" button beside "New song" on the catalog page (§7.3), visible to ADMIN and MEMBER only.

**Step 1 — Paste.** Single large textarea, placeholder showing accepted formats. Max 200 lines (reject above with a count). Submit → `createSongImportSession` → `resolveSongImportSession` → redirect to `/acts/[slug]/songs/import/[sessionId]`.

**Step 2 — Review.** One row per line. Each row shows the raw input, the selected candidate (artwork thumbnail, title, artist, album, year, duration, inline preview play button), and an action select: **Add to catalog** / **Link to existing** / **Skip** / **Enter manually**. Expanding a row shows all candidates as a radio list with the same details.

Version disambiguation is the point of this screen, not an afterthought. Album, release year, and duration are rendered at equal visual weight to the title, because a 4:32 live take and a 3:18 studio cut are different learning targets. The preview button is the fastest confirmation available — wire it to a single shared `<audio>` element that stops any other playing preview.

"Enter manually" swaps the row for inline title/artist/album fields; the resulting song is created with `resolutionStatus = MANUAL` and no external links. Originals and obscure recordings must have a path through this screen.

Footer: "Add N songs" (typed count, not a raw number — "Add 12 songs, link 3, skip 1"), and "Discard import".

**Step 3 — Commit.** `commitSongImportSession` runs one transaction:
- For each `CREATE` line: insert `Song` with mapped fields, `resolutionStatus = RESOLVED`, `status = IDEA` (per §14.11 default), plus the `APPLE_MUSIC` and deterministic `SONGLINK` rows.
- For each `LINK_EXISTING` line: if the existing song lacks `appleTrackId`, backfill Apple fields and links from the selected candidate; otherwise no-op.
- Enqueue `EnrichmentJob` rows (`ODESLI` and `MUSICBRAINZ`) for every created or backfilled song.
- Set session `COMMITTED`.

Then redirect to the catalog filtered to the new songs. Committing is idempotent: a session already `COMMITTED` rejects with a clear error rather than double-inserting.

Sessions in `DRAFT`/`REVIEW` older than 7 days are deleted by the daily cron.

## 18.11 Song detail additions (§7.3)

The song detail page gains a **Recording** card above the streaming links list:

- Artwork (400×400, Apple-hosted), title/artist/album/year/duration, preview player.
- **Required beneath the preview and artwork:** an Apple Music store badge linking to `trackViewUrl`, and the text "Preview provided courtesy of iTunes". See 18.14 — this is not optional styling.
- Writers (from MusicBrainz) when present, rendered as plain text.
- `resolutionStatus` chip. When `UNRESOLVED` or `MANUAL`, a **"Find recording"** button opens a search dialog (same candidate UI as import review, single row) → `resolveSingleSong`. Existing hand-entered songs get retrofitted through this.
- When `RESOLVED`: a **"Re-resolve"** button (same dialog, pre-filled) and an **"Unlink recording"** button that clears all Apple/MB fields, deletes `SongLink` rows with `source != MANUAL`, and sets `resolutionStatus = MANUAL`.
- Enrichment state indicator when an `EnrichmentJob` for the song is `QUEUED`/`RUNNING` ("Finding links on other platforms…"), and a "Retry" affordance when `FAILED`.

Manual `SongLink` add/edit/delete (§8) is unchanged and continues to work alongside resolved links. The links list groups by source with resolved links marked as such, so a user understands why deleting one might reappear after re-resolution.

## 18.12 Setlist playlist output

On the calendar entry detail page (§7.4), each `Setlist` gains a **Share** section.

**Link view (primary).** Each setlist item renders its platform links: a single "Open" button using the `SONGLINK` universal URL by default, with a small platform-icon row (Apple / Spotify / YouTube) for direct opens. Link resolution order per item: `SongLink` matching the item's `songVersionId` → song-level `SongLink` → nothing (show a muted "no link" marker). This makes version-specific links work, which is the whole reason `SongLink.versionId` exists.

Because each link points at a specific `appleTrackId`, this enforces "everyone learns the same recording" more strictly than a playlist link does — a playlist URL doesn't stop someone opening a different version in their own app.

**Copy tracklist.** Button copying `Artist - Title` lines, one per item, to the clipboard. This is the input format for Soundiiz and TuneMyMusic, which do free cross-platform playlist transfer, and the README should say so in a short "Making playlists" note.

**Export.** `GET /api/setlists/[id]/export?format=m3u|csv|txt`, route handler, membership-checked exactly like `/api/files/[id]` (§6):
- `m3u` — extended M3U, `#EXTINF:{durationSec},{artist} - {title}` followed by the best available URL.
- `csv` — position, title, artist, album, duration, key, tempo, apple_url, spotify_url, youtube_url, songlink_url, notes.
- `txt` — plain `Artist - Title` lines.

Filename `{act-slug}-{entry-date}-{setlist-name}.{ext}`, `Content-Disposition: attachment`.

**Manual playlist URLs.** A "Playlist links" sub-section on each setlist lets ADMIN/MEMBER paste a URL per platform → `SetlistLink`. This is where the act leader stores the Apple Music playlist they built by hand. Displayed as prominent buttons at the top of the setlist. URL validated per platform by hostname allowlist (`music.apple.com`, `open.spotify.com`, `music.youtube.com`/`youtube.com`, `tidal.com`, `deezer.com`) — reject anything else with a specific message rather than a generic invalid-URL error.

## 18.13 CSP and external assets — overrides §15.2

Apple artwork and previews are hotlinked from Apple's CDN, not cached locally. Amend the CSP directives:

```
img-src 'self' blob: data: https://*.mzstatic.com;
media-src 'self' https://audio-ssl.itunes.apple.com https://*.mzstatic.com;
```

All other directives in §15.2 stay exactly as written. In particular `connect-src 'self'` is unchanged — no browser code talks to any external API; every outbound call originates server-side. `frame-src`, `object-src`, and `script-src` are untouched: there are still no third-party embeds, no Spotify/YouTube players, and no external scripts.

**Do not download or cache artwork or preview audio to disk.** Beyond the terms question in 18.14, hotlinking keeps `FileAsset` and the uploads volume clean and means artwork stays current if Apple replaces it. If an artwork URL 404s, render the existing placeholder.

## 18.14 Apple attribution requirements (mandatory)

Apple's iTunes Search API terms permit use of promotional content — song previews and album art — only to promote store content, and require that it appear near an approved store badge linking into the store, with attribution for previews.

Concretely, the agent must implement:
- Artwork and preview player are rendered **only** in the Recording card (18.11) and the import review rows (18.10), never as generic decoration elsewhere in the app.
- An Apple Music badge linking to the song's `trackViewUrl` is rendered adjacent to both, in both locations.
- The string "Preview provided courtesy of iTunes" appears adjacent to any preview player.
- Previews are streamed from Apple's URL directly; never proxied, downloaded, or cached.

README gets an "Attribution" section stating these constraints so a future contributor doesn't strip them as visual clutter. This is a requirement of the terms, not a design preference — read Apple's current terms at `performance-partners.apple.com/search-api` before altering any of it.

## 18.15 Permissions additions (§4 matrix, `lib/permissions.ts`)

| Capability | SUPERADMIN | Act ADMIN | MEMBER | READONLY |
|---|---|---|---|---|
| Run song import (create/resolve/commit sessions) | ✓ | ✓ | ✓ | – |
| Resolve / re-resolve / unlink a song's recording | ✓ | ✓ | ✓ | – |
| Add/edit/delete setlist playlist links | ✓ | ✓ | ✓ | – |
| View recording data, links, previews; export setlists | ✓ | ✓ | ✓ | ✓ |

Import sessions are act-scoped: every action re-derives `actId` from the session row and calls `requireActRole`. A session id from another act must 403, not 404-by-accident.

## 18.16 Handler mapping additions (§8 format)

| UI element | Handler | Notes |
|---|---|---|
| Import paste form | `createSongImportSession` | max 200 lines |
| (automatic after create) | `resolveSongImportSession` | throttled; updates rows progressively |
| Review page progress poll | server component read | no mutation |
| Per-row candidate radio / action select | `updateSongImportLine` | selection + action + manual fields |
| Row "Retry" on `ERROR` | `retrySongImportLine` | |
| "Add N songs" button | `commitSongImportSession` | one transaction; idempotent |
| "Discard import" button | `abandonSongImportSession` | |
| "Find recording" / "Re-resolve" dialog | `resolveSingleSong` | search + select in one action |
| "Unlink recording" button | `unlinkSongRecording` | clears fields, deletes non-MANUAL links |
| Enrichment "Retry" | `requeueEnrichmentJob` | resets state to `QUEUED`, attempts to 0 |
| Setlist playlist link add/edit/delete | `upsertSetlistLink`, `deleteSetlistLink` | hostname allowlist |
| "Import Songs" (per set) paste form | `createSongImportSession` (with `targetSetId`) | requires `song:write` **and** `setlist:write` (§19) |
| Per-row "New version" recording picker | `resolveImportLineCandidates`, `updateSongImportLine` | lazy candidate fetch; action `NEW_VERSION` (§19) |
| "Copy tracklist" button | client clipboard only | no mutation |
| Setlist export links | `GET /api/setlists/[id]/export` | route handler, membership check |
| Preview play button | client `<audio>` only | no mutation |

## 18.17 Env additions

```
ITUNES_STOREFRONT=US
ODESLI_COUNTRY=US
ODESLI_API_KEY=            # optional; raises the 10 req/min limit
MUSIC_RESOLUTION_ENABLED=true
MUSICBRAINZ_CONTACT=       # email or URL, embedded in the User-Agent
```

`MUSIC_RESOLUTION_ENABLED=false` hides the import button and the resolve/re-resolve controls and short-circuits all adapters — the app must remain fully functional with manual entry only. The existing `ENABLE_SCHEDULER` flag additionally gates the enrichment job runner.

## 18.18 Failure modes

| Situation | Behavior |
|---|---|
| iTunes returns zero results | line → `NO_MATCH`, manual entry offered; never block the import |
| iTunes 429 / unreachable | line → `ERROR` with retry; other lines proceed |
| Odesli 429 or down | job backs off and retries; the deterministic `song.link/i/{id}` URL is already present, so the setlist stays usable |
| MusicBrainz miss or down | job completes `DONE` writing nothing; no user-visible failure |
| Artwork or preview URL 404 | placeholder image; hide the preview player |
| Whole external stack down | import surfaces "Song lookup is unavailable — you can still add songs manually" and links to the existing create form |

No external failure may ever roll back a commit or leave a song half-created. Apple fields are written synchronously; everything else is best-effort enrichment.

## 18.19 Testing

**Vitest, unit:**
- `lib/import/parse.ts` against a fixture of ≥40 lines covering both orderings, enumeration prefixes, album hints, preserved parentheticals (`(feat. X)`, `(Live)`), em/en dashes, titles containing dashes (`Rush - 2112 - Overture`), set separators, and empty lines.
- Scoring function: assert correct classification band for hand-built candidate sets, including the ambiguous-gap case.
- Normalization: diacritics, `&`/`and`, `ft.`/`feat.`.
- `lib/permissions.ts` for the four new capabilities × four role tiers (extends the §14.10 matrix test).

**Vitest, integration** with mocked HTTP (no live calls in the suite):
- Fixtured iTunes/Odesli/MusicBrainz responses → committed songs with expected links.
- Dedupe: importing a line matching an existing song produces `LINK_EXISTING`, not a duplicate.
- Idempotency: committing a `COMMITTED` session rejects.
- Direct invocation of `commitSongImportSession` and `upsertSetlistLink` as READONLY → rejected (satisfies the §13.3 pattern).
- Throttle: 30 queued iTunes calls complete without exceeding 20 in any rolling minute (fake timers).

**Playwright E2E** (mocked external hosts via route interception): paste three lines → review shows candidates → commit → songs appear in catalog with Apple links → setlist export downloads a non-empty M3U. Run once at the 390px mobile viewport per §14.12; the review rows must be usable there (stacked layout, artwork thumbnail, tap-to-expand).

**Live smoke, not in CI:** a `scripts/smoke-external.ts` that hits all three real APIs once and prints results, documented in the README. These are third-party services; they will change without notice, and this script is how a maintainer checks whether a breakage is theirs or Apple's.

## 18.20 Acceptance criteria (continuing from §17.7)

13. A MEMBER pastes a 10-line setlist in mixed formats (`Artist - Title`, `Title - Artist`, numbered, one with an album hint); the review page resolves every line, and at least the unambiguous ones are pre-selected with artwork and a playable preview.
14. Two candidate recordings of the same song with different albums and durations are visibly distinguishable in the review UI; selecting the live version stores that version's `appleTrackId` and duration.
15. Committing creates the songs with working Apple Music and song.link URLs immediately; within two minutes the enrichment job has added Spotify and YouTube links and, where matched, writers from MusicBrainz.
16. Re-importing the same list produces `LINK_EXISTING` for every line and creates zero duplicate songs.
17. A song with no catalog match falls through to manual entry and is created with `resolutionStatus = MANUAL` and no external links.
18. A setlist's share view shows per-song platform buttons; the M3U export downloads and opens in a desktop player; the CSV contains all resolved URLs; a pasted Apple Music playlist URL persists and renders as a button.
19. A READONLY user can view recording data, play previews, and export a setlist, but every mutation in §18.16 is rejected server-side.
20. Artwork and preview player each render with an Apple Music store badge adjacent and the iTunes attribution string present.
21. With `MUSIC_RESOLUTION_ENABLED=false`, the app builds and runs, import controls are absent, and manual song creation is unaffected.

## 18.21 Deferred

**Spotify playlist creation.** A Spotify developer account is free — no fee, no agreement comparable to Apple's — and playlist creation needs a one-time OAuth grant from the act leader (`playlist-modify-public`), plus Extended Quota Mode if the user base exceeds 25 people. Since every song already stores its Spotify URL, the implementation is one batched `POST /v1/playlists/{id}/tracks`. Deliberately out of this delta; the schema needs no changes to accommodate it later beyond a per-act OAuth token table.

**Apple Music playlist creation.** Requires paid Apple Developer Program enrollment for a MusicKit signing key. No free path exists. The `SetlistLink` manual-paste field (18.12) is the permanent answer unless that changes.

**Apple Music desktop copy-paste import.** On macOS, selecting all tracks in a playlist and copying yields tab-separated text (name, artist, album, time). Feeding that into the parser at 18.8 would import an existing playlist with one keyboard shortcut and no API at all. Cheap to add later since the parser exists; verify the exact clipboard format on the target macOS version first rather than assuming it.

---

Two calls worth sanity-checking before handoff. **18.13** amends a spec section that §16 declared frozen — if you'd rather not touch the CSP, the alternative is proxying artwork through an authenticated route and dropping previews entirely, which costs you the fastest way to confirm you've picked the right recording. **18.8** deliberately ignores set separators in the pasted text for the catalog-only import; importing pasted songs **directly into a set list** is now specified as **§19** below (per-set target, version-aware duplicate handling) rather than bolted onto §18.

---

# 19. Addendum 6 — Import songs into a set list (version-aware)

Extends the §18 paste-import so it can add pasted songs straight into an existing
set (the standalone Set List library, `SetList → SetListSet → SetEntry`). The
Songs-page import (§18.7) is unchanged. The whole §18 pipeline is reused — same
parser (§18.8), resolver/dedupe (§18.9), review page (§18.11) and commit — with a
nullable target and one new per-line action.

## 19.1 Entry point

Each set in the set-list editor gains an **"Import Songs"** button beside its
existing **Add Song** / **Add Album** buttons (per **set**, not per set list).
Visible to ADMIN/MEMBER only and gated by `MUSIC_RESOLUTION_ENABLED`. It opens a
paste dialog; on submit it calls `createSongImportSession({ actId, rawInput,
targetSetId })`, kicks off `resolveSongImportSession`, and navigates to the shared
review page. On commit (or discard) the user is returned to the set list, not the
catalog.

## 19.2 Target & set breaks

The target is a single `SetListSet`, stored as `SongImportSession.targetSetId`
(nullable; `onDelete: SetNull`). **Set-break markers are ignored** — every imported
song appends to the one targeted set, in paste order, after the current last
position. (Splitting a paste across multiple sets is out of scope; the parser still
records the markers.)

## 19.3 Resolution is library-first (unchanged)

Resolution still dedupes against the act catalog **before** any network call
(§18.9 step 1): a matching library song sets `existingSongId`, `action =
LINK_EXISTING`, and skips iTunes. iTunes is only queried for genuinely new lines —
and, lazily, for a duplicate line only when the user opts into "New version"
(19.4). We do **not** blanket-query the API for every pasted line.

## 19.4 Duplicate handling — the `NEW_VERSION` action

Because a song can have multiple `SongVersion`s ("same recording" per §18), a line
that matches an existing library song offers a choice in review:

- **Link existing** (`LINK_EXISTING`, the default): add the existing song to the
  set, create nothing. "It's already in the library — just use it."
- **New version** (`NEW_VERSION`, new `ImportLineAction` value): create a
  `SongVersion` on the existing song from the selected iTunes recording, and point
  the set entry at that version.

The **"New version"** option only appears on rows that already reference a library
song (`existingSongId` set). Selecting it lazily fetches candidates
(`resolveImportLineCandidates` — populates candidates without changing the
action/existing link), then the user picks a recording; the action is persisted
only once a recording is chosen (it requires one). At commit,
`createVersionFromCandidate` creates the version (name = the candidate's
album/collection, fallback `"Imported version"`) and writes its **version-level**
`SongLink` rows (Apple Music + the deterministic `song.link/i/{id}`, `versionId`
set). Async platform enrichment (Odesli/MusicBrainz → Spotify/YouTube) is
**song-keyed and NOT run for versions** in this delta — a new version gets Apple +
universal links immediately; wider platform fill for versions is deferred.

## 19.5 Set entries reference versions

`SetEntry` gains `songVersionId String?` (`onDelete: SetNull`, indexed), mirroring
the calendar `SetlistItem`. Commit appends one `SetEntry` per non-skipped line with
`{ songId, songVersionId }`:

| Review action | Set entry | Catalog effect |
|---|---|---|
| Add (`CREATE`) | new song, no version | new song + links + enrichment |
| Manual (`MANUAL`) | new song, no version | new manual song |
| Link existing (`LINK_EXISTING`) | existing song, no version | none (may backfill Apple fields if missing) |
| **New version (`NEW_VERSION`)** | existing song + **new version** | new `SongVersion` + version links |
| Skip (`SKIP`) | — | none |

The set-list editor shows a small version-name badge on entries that carry one, and
the set-list export (`GET /api/set-lists/[id]/export`) prefers a link matching the
entry's `songVersionId`, falling back to song-level — mirroring §18.12's per-item
resolution order.

## 19.6 Permissions

A targeted import creates catalog rows **and** mutates a set, so
`createSongImportSession` with a `targetSetId` and `commitSongImportSession` of a
targeted session require **both** `song:write` and `setlist:write`. Both are held
by ADMIN and MEMBER; READONLY has neither and is rejected server-side. The target
set is re-derived from the session and confirmed to belong to the session's act
(cross-act target ⇒ error).

## 19.7 Schema summary

- `enum ImportLineAction` += `NEW_VERSION`.
- `SongImportSession.targetSetId String?` → `SetListSet` (`onDelete: SetNull`).
- `SetEntry.songVersionId String?` → `SongVersion` (`onDelete: SetNull`, indexed).
- No new columns on `SongImportLine`; the version name is derived at commit.

## 19.8 Acceptance

1. A MEMBER clicks **Import Songs** on a set, pastes 10 mixed-format lines, reviews,
   and commits; the songs appear in that set in paste order and in the catalog.
2. A pasted line that already exists defaults to **Link existing** and adds the
   existing song with no duplicate; switching it to **New version**, picking a
   recording, and committing creates a `SongVersion` and the set entry uses it.
3. The set-list export includes the version's URL for a version-backed entry.
4. READONLY cannot import into a set (server-side 403); with
   `MUSIC_RESOLUTION_ENABLED=false` the **Import Songs** button is absent while
   Add Song / Add Album still work.