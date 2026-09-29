# TopShelf Inventory

Multi-tenant bar inventory management: stock counting with PIN-login stations,
purchase ordering, shift close-out, scheduling, reporting and forecasting.

- **Stack:** Next.js 14 (App Router) · TypeScript · PostgreSQL 15 · Tailwind / MUI
- **Tenancy:** every organization's data is scoped by `organization_id`; super
  admins manage the platform at `/super-admin`.

## Requirements

- Node.js 20 (18.17+ works)
- Docker (for PostgreSQL locally, and for production)

## Local development

```bash
cp .env.example .env.local        # then set JWT_SECRET (any value is fine locally)
npm install
npm run db:up                     # PostgreSQL in Docker on localhost:5433
npm run db:init                   # create the schema (refuses to touch a non-empty DB)
npm run create-super-admin -- you@example.com 'a-strong-password'
npm run dev                       # http://localhost:6050
```

Log in with the super-admin account, create or impersonate an organization,
and add users and locations from its admin pages.

Set `DISABLE_SCHEDULER=true` in `.env.local` if you don't want the background
jobs (report / alert emails) running while you develop.

## Configuration

| Variable | Required | Purpose |
|---|---|---|
| `JWT_SECRET` | **yes in production** | Signs session cookies. The app refuses to issue or accept sessions in production without it. Changing it logs everyone out. |
| `DATABASE_URL` | yes | PostgreSQL connection string. |
| `POSTGRES_PASSWORD` | Docker only | Password for the bundled Postgres container (applied when its volume is first created). |
| `NEXT_PUBLIC_APP_URL` | recommended | Public base URL used in email links. |
| `COOKIE_SECURE` | recommended | `true` when the site is served over HTTPS. |
| `DISABLE_SCHEDULER` | no | `true` disables the in-process background jobs. |

SMTP accounts, Twilio credentials, barcode lookup and forecasting settings are
configured at runtime by a super admin (stored in `system_settings`).

## Database

- `scripts/schema.sql` — base tables.
- `scripts/migrate.sql` — idempotent additions (safe to re-run any time).

| Task | Command |
|---|---|
| New, empty database | `npm run db:init` (applies schema.sql + migrate.sql) |
| Upgrade an existing database | `npm run db:migrate` |
| Wipe and recreate (destroys data) | `node scripts/init-postgres.js --force` |

Other files in `scripts/` are one-off maintenance and seeding utilities.

## Production (Docker)

```bash
cp .env.example .env              # set JWT_SECRET (long random value), POSTGRES_PASSWORD, NEXT_PUBLIC_APP_URL, COOKIE_SECURE=true
docker compose up -d --build
docker compose exec -T db psql -U postgres -d topshelf < scripts/migrate.sql
```

- The app listens on port **6050**; put nginx / TLS in front of it
  (`setup-ssl.sh`, `nginx-*.conf`).
- PostgreSQL (5433) and Adminer (8080) are bound to **localhost only**. Reach
  Adminer with an SSH tunnel: `ssh -L 8080:localhost:8080 <server>`.
- `scripts/deploy-linux.sh` pulls, rebuilds the containers and applies
  `migrate.sql`. First-time server setup: `scripts/deploy_linux_initial.sh`
  (pass `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` in the environment to
  create the first super admin).
- Timed jobs use the server clock; the Docker image runs in UTC.

A non-Docker deployment (`deploy.sh` → `start.sh` / `stop.sh`) is also
available; it runs `npm run build` and serves on port 5400.

## Background jobs

`src/instrumentation.ts` starts `src/lib/scheduler.ts` once per server process:
log cleanup, monthly invoicing, scheduled report emails, low-stock alerts and
shift-report emails. Run a single app instance, or set `DISABLE_SCHEDULER=true`
on all but one, so emails are not sent twice.

## Scripts

| Command | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js (port 6050) |
| `npm run lint` | ESLint (`next/core-web-vitals`) |
| `npm run typecheck` | TypeScript |
| `npm test` | Jest unit tests (`src/**/__tests__`) |
| `npm run test:e2e` | Playwright end-to-end tests (`tests/`, expects the app on :5400 and a manual login) |

## Project layout

```
src/
  middleware.ts        page-level auth and role routing
  instrumentation.ts   starts the background scheduler
  lib/                 db access, auth, email, scheduler, forecasting, security analysis
  components/          shared React components
  app/
    api/               route handlers (each file documents its endpoints)
    admin/             tenant admin pages
    super-admin/       platform admin pages
    inventory/         staff stock screen and shift close
    login, register, pin, o/[slug], orders/[token]   public pages
scripts/               schema, migrations, deploy and maintenance scripts
tests/                 Playwright specs
```

## Security model

- Sessions are HS256 JWTs in an httpOnly cookie, verified in the middleware and
  again in every API route via `getSession()`, which also rejects locked,
  deleted or force-logged-out users.
- PIN login only works on a device registered as a station
  (`/api/auth/station-token`) and only matches users of that station's
  organization. PINs are stored in plaintext by design so admins can view them.
- Only super admins can grant the `super_admin` permission or modify a
  super-admin account.
