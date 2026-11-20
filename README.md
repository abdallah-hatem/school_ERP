# School ERP

An English/Arabic ERP for schools — HR, payroll and penalties first — one deployment and one
database per school. Monorepo: `apps/api` (NestJS + Prisma + Postgres), `apps/web` (Next.js),
`packages/shared` (types, schemas, keys and locales used by both).

## Prerequisites

- **Node 20 or newer** — <https://nodejs.org/> (or `nvm install 22`).
- **pnpm 10** through Corepack, which ships with Node: `corepack enable`, then open a new terminal.
  The exact version is pinned in `package.json`.
- **Docker Desktop**, running — the database is a Postgres container.
- macOS or Linux. **On Windows use WSL 2** (Ubuntu) with Docker Desktop's WSL integration on, and
  clone the repo inside the WSL file system (`~/…`, not `/mnt/c/…`).

## Run it

```bash
pnpm run setup   # once per clone; safe to run again
pnpm dev         # every time — Ctrl+C stops it
```

Use **`pnpm run setup`**, not `pnpm setup`: bare `pnpm setup` is pnpm's own command (it edits your
shell profile) and never reaches this project.

`pnpm run setup` checks Node, pnpm and Docker, installs the dependencies, starts the database and
waits for it, creates `apps/api/.env` and `apps/web/.env.local` from their examples (only if they
don't exist yet, with a generated token secret and admin password), builds `packages/shared`,
applies the migrations and loads the demo data. `pnpm dev` starts the database if it is stopped,
then runs `packages/shared` (watch), the API (watch) and the web app together, each line prefixed
with the app it came from.

Then open <http://localhost:3000>.

### Signing in

| | |
|---|---|
| Email | `admin@school.local` (System admin + HR manager) |
| Password | `SEED_ADMIN_PASSWORD` in `apps/api/.env` — `grep SEED_ADMIN_PASSWORD apps/api/.env` |

The password is generated for your copy and never printed. Other accounts are created from the app
(Users).

### Ports

| What | Port | Change it with |
|---|---|---|
| Web app | 3000 | `WEB_PORT` |
| API | 3001 | `API_PORT` |
| Postgres (container `school-erp-db`) | 5442 | `DB_PORT` |

To run a second copy beside the first, give it its own ports and Docker names on the first setup:

```bash
DB_PORT=5452 API_PORT=4901 WEB_PORT=4900 COMPOSE_PROJECT_NAME=school-erp-2 pnpm run setup
```

The first run writes them to a git-ignored root `.env`, which `pnpm dev` and Docker Compose read
from then on. The `pnpm --filter api db:*` scripts use port 5442 unless `DB_PORT` is set.

## Hosted demo

After CI passes on a push to `demo`, GitHub Actions stages the API and web builds on Vercel, applies
pending Prisma migrations to the hosted demo database, and promotes the builds. It checks API
health and the web sign-in page after promotion.

Before merging the workflow, the repository owner sets up the `school-erp-demo` GitHub Actions
environment. Under **Deployment branches and tags**, select only the `demo` branch. Add these
settings to that environment:

| Setting | Name | Value |
| --- | --- | --- |
| Secret | `VERCEL_DEMO_TOKEN` | Deployment token scoped to the personal Hobby workspace |
| Secret | `DEMO_DATABASE_URL` | Direct Neon connection string for `school_erp_demo` with `sslmode=require` |
| Variable | `VERCEL_DEMO_SCOPE` | Personal Hobby workspace slug |
| Variable | `VERCEL_DEMO_API_PROJECT` | Existing Vercel API project ID |
| Variable | `VERCEL_DEMO_WEB_PROJECT` | Existing Vercel web project ID |
| Variable | `DEMO_API_URL` | Public API origin, including `https://` |
| Variable | `DEMO_WEB_URL` | Public web origin, including `https://` |

Keep application runtime credentials in the two Vercel projects. Make schema changes compatible
with the running app until the new builds are promoted. If a deployment fails after migration,
inspect the failed step and rerun the job. Prisma skips migrations it already applied.

## Docs

- [`docs/PROJECT.md`](docs/PROJECT.md) — what we are building, team, scope
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — modules, layers, hosting
- [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) — branches, PRs, reviews, releases
- [`docs/BUSINESS_LOGIC.md`](docs/BUSINESS_LOGIC.md) — the business rules
- [`CLAUDE.md`](CLAUDE.md) — the project rules for Claude Code (and a short list of facts for everyone)

## Tests

```bash
pnpm ci:local          # lint, typecheck, unit tests, module rules — what CI runs (also on git push)
pnpm ci:local --full   # adds API e2e and the Playwright smoke specs (needs Docker)
```

GitHub runs the API e2e and smoke specs on every pull request, so `pnpm ci:local` is usually enough
locally.

## Troubleshooting

**Port 5442, 3000 or 3001 is already in use.** Another program (or an earlier `pnpm dev`) holds it:
`lsof -i :3000` shows which. Stop it, or use other ports — see [Ports](#ports). After changing
`API_PORT` or `WEB_PORT` on an existing copy, also update `PORT` / `CORS_ORIGIN` in
`apps/api/.env` and `BASE_URL` in `apps/web/.env.local`.

**"Docker is not running".** Start Docker Desktop and wait until it says it is running, then run
the command again.

**`Failed to parse URL from /auth/login`** (on the sign-in page). The web app has no API address:
`apps/web/.env.local` is missing or has no `BASE_URL`. Run `pnpm run setup` (it creates the file),
or copy `apps/web/.env.example` to `apps/web/.env.local`, then restart `pnpm dev`.

**`Cannot find module '@school-erp/shared'`.** `packages/shared` hasn't been built:
`pnpm --filter @school-erp/shared build` (`pnpm run setup` and `pnpm dev` both do it).

**The API stops at boot with "JWT_ACCESS_SECRET must be at least 32 characters"** (or another
env error). `apps/api/.env` is missing or incomplete — `pnpm run setup` fills in what is missing.

**Start over with an empty database.** This deletes all local data:

```bash
docker compose down -v
pnpm run setup
```

**The school's own data isn't there.** The client's material (school name, logo, regulations)
lives in `apps/api/prisma/seed-data.local/`, which is never committed. Without it the seed loads
generic demo data — a placeholder school with demo employees — which is all a fresh clone needs.
Ask the lead for the folder if you need the real material, then run `pnpm run setup --reseed`.

**Reloading the demo data.** `pnpm run setup` skips the seed once the admin exists.
`pnpm run setup --reseed` runs it again: it adds whatever is missing and resets the admin's
password to `SEED_ADMIN_PASSWORD`.
