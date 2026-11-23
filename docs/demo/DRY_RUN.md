# Running a dry run

The process is in `docs/CONVENTIONS.md` → Demo dry run. These are the commands. Run from the repo
root with Docker running.

## 1. Copy the database

```bash
docker start school-erp-db
docker exec school-erp-db dropdb -U postgres --if-exists school_erp_dryrun
docker exec school-erp-db createdb -U postgres -T school_erp school_erp_dryrun
```

`createdb -T` needs no open connections to the source database: stop any API that uses
`school_erp` first.

## 2. Build and start the app on the copy

```bash
pnpm install
pnpm --filter @school-erp/shared build
pnpm --filter api exec nest build
(cd apps/web && BASE_URL="http://localhost:4301" pnpm exec next build)
```

API on port 4301 (use your own `JWT_ACCESS_SECRET`; the uploads folder holds the school's logo):

```bash
cd apps/api && env NODE_ENV=development PORT=4301 DATABASE_URL="postgresql://postgres:postgres@localhost:5442/school_erp_dryrun?schema=public" CORS_ORIGIN="http://localhost:4300" UPLOADS_DIR="$PWD/uploads" JWT_ACCESS_SECRET="$(openssl rand -hex 24)" COOKIE_SECURE=false node dist/main.js
```

Web on port 4300 (second terminal):

```bash
cd apps/web && env BASE_URL="http://localhost:4301" PORT=4300 node node_modules/next/dist/bin/next start --port 4300
```

Open http://localhost:4300/ar and sign in with the login in `CREDENTIALS.local.md` (git-ignored).

## 2b. Release check: accounts acting on pay with no employee record

Since 2026-11-23 (security review), an account that isn't a System admin can't adjust or approve
payroll, enter lateness, review, approve or cancel penalties, or edit employees until it is linked
to its employee record (§6). List the accounts to link before the release, read-only, on the copy:

```bash
cd apps/api && env DATABASE_URL="postgresql://postgres:postgres@localhost:5442/school_erp_dryrun?schema=public" \
  pnpm exec ts-node --transpile-only prisma/checks/unlinked-pay-accounts.ts
```

It prints each account with the permissions concerned and exits 1 when there is any. Link each one
(Users → the account → "Who is this person in HR?", as a System admin), then run it against the
school's database right after the release too. Record the result in the dry run's notes.

## 3. Walk the script

Follow `docs/demo/DEMO_SCRIPT.md`: Arabic first, then English, then phone width (browser device
mode, 375–390 px). Check every ✔ by hand. Write findings as you go.

## 4. Clean up

Stop both servers (Ctrl+C), then:

```bash
docker exec school-erp-db dropdb -U postgres school_erp_dryrun
```

## 5. Record it

Add `docs/demo/dry-runs/YYYY-MM-DD.md` (copy the previous one as a template) and turn each
finding into a ticket or a `docs/BUILD_LOG.md` → Next up item marked **must fix** or **later**.
