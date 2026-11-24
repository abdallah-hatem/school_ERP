# Architecture

Stack: NestJS + Prisma + Postgres (backend), Next.js App Router + Tailwind + shadcn/ui + Zustand
(frontend), Docker. Conventions follow the `building-backends` and `building-frontends` skills;
the differences are listed in `CLAUDE.md`.

## Deployment model

- **One codebase, one Docker image** (tagged by version, e.g. `v1.4.0`).
- **One deployment and one database per school.** Each school runs the same image with its own
  database and its own config (`deploy/schools/<school-slug>.env`).
- Works the same on **our server** (one Postgres server with one database per school, one app
  container set per school) or on **the school's server** (same image, their Postgres).
- **No `school_id`.** A database only ever holds one school.
- **No branches/campuses for now.** If a multi-branch school comes, `branch_id` is added as paid
  work. Keeping all data access in repositories keeps that change contained.
- **Migrations run per school** as a release step (Coolify's pre-deployment command; rolling out a
  version goes school by school and stops on the first failure) — never in the container's start
  command.
- **Backups per school**, so one school can be restored without touching others.
- Self-hosted schools receive the **built image, never the source**.
- Track which version each school runs.

## Hosting (VPS)

Setup follows the `deploying-to-vps` skill (Coolify + Traefik + Cloudflare, hardened server,
backups proven by a restore).

### Server

- **One Contabo VPS, rented from day one, on a monthly term.** Start at about 4 vCPU / 8 GB /
  100 GB (Contabo doesn't allow downgrades, so start small and upgrade).
- **EU region.** Measured ping from Egypt to Contabo EU: ~61 ms.
- **The first month is a trial.** We use it to measure speed and stability from Egypt. If it isn't
  good enough, we move to another provider or region before the first school goes live. The setup
  is portable: same images, same Coolify setup, restore the databases from backup, repoint DNS.

### Environments on the server

| Environment | Deployed from | Data | Used by |
|---|---|---|---|
| **dev** | every merge to the `dev` branch, automatically | seeded fake data, reset freely | developers + operations testing each ticket |
| **testing** | every merge to the `testing` branch (a PR from `dev`), automatically | realistic fake data at real volume (e.g. 2,000 students, a full year of payments) | operations QA, the school's review before a release, speed and load tests |
| **prod** | the `production` branch (`vX.Y.Z` image), one deployment per school | real school data | the schools |

- **The `demo` branch** (owner, 2026-11-18) holds what client demos run from: cut from a green `dev`
  after a demo dry run, so features still being built on `dev` never show in a demo. It is
  protected like `testing` and `production` (a PR, all four checks green and up to date, the
  owner's approval). A fix a demo needs lands in `dev` first, then reaches `demo` by a PR from
  `dev` (or a branch cut from `demo` for that one fix). Run it locally: check out `demo`,
  `prisma migrate deploy` on the demo database, then the seed once. No environment deploys it yet.
- **Each environment is its own Coolify project** with its own containers, env vars and databases.
- **Prod has its own Postgres container.** dev and testing share a separate one. A heavy test can
  never touch a school's data.
- **No real student data in dev or testing**, ever. Fake data only.
- **dev and testing get resource limits** (CPU/RAM per container) so they can't starve prod.
- **Images are built in CI** (GitHub Actions) and pushed to a registry (GitHub Container Registry).
  The server only pulls and runs them, so builds never compete with the schools for CPU.
- **Domains:** `dev.<domain>`, `testing.<domain>`, `<school-slug>.<domain>` (or the school's own
  domain pointed at us). dev and testing are `noindex` and behind a login (e.g. Cloudflare Access).
- **Revisit once real schools are on it:** moving prod to its own server is cheap insurance. One
  server is fine while there is no real data.

### Network and speed

- **Cloudflare proxy on from day one** for every environment, even for pages that are never cached.
  The TCP/TLS handshakes happen at a nearby Cloudflare data center, and Cloudflare carries traffic to
  the server over its own network on warm connections. That avoids the slow, lossy direct route
  from Egypt to a European server.
- **Cache only static files** (JS, CSS, fonts, images). **Never cache pages:** everything is
  per-user, and a cached page could show one user's data to another.
- **Postgres on the same server** as the app, so queries don't pay a network round trip.
- **App habits that matter more than the server:** paginate lists, index filtered columns, run
  independent queries with `Promise.all`, avoid N+1 queries, build heavy reports in the background,
  give every route a `loading.tsx`, and keep JS bundles lean.
- **Measure from Egypt, through the proxy, on `testing`** with realistic data. Target: common actions
  (open the student list, record a payment, enter marks) feel instant on click and finish in under
  ~1 s. Measure again whenever a school is added.

### Backups and monitoring

- **Each school's database is backed up nightly** to storage off the server (e.g. Cloudflare R2).
- **A backup counts only once a restore has been tested:** restore into a throwaway database and
  compare row counts. Do this before the first school goes live, then regularly.
- **Uptime monitor on each school's `/api/health`**, with alerts. Watch the server's CPU, RAM and
  disk, and upgrade before they become a problem.
- **`docs/SERVER.md`** records what is configured and why, and where each secret lives. Never the
  secret values themselves.

## Security

What protects the app beyond sign-in and permissions (2026-11-22). Sign-in itself: bcrypt
passwords, `httpOnly` `Secure` `SameSite=Lax` session cookies, refresh-token families, the
per-account lockout (Sign-in limits); every endpoint declares its permission (Permissions).

### Response headers

- **API** (`common/security/security-headers.ts`, helmet, set in `configureApp`):
  `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`
  (a JSON answer opened in a tab runs and loads nothing), `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Cross-Origin-Resource-Policy: same-site` (the web app — its own origin through the `/files`
  rewrite, or a sibling subdomain — still loads the logo and icons; other sites can't), no
  `X-Powered-By`. **HSTS only when the session cookies are `Secure`** (`COOKIE_SECURE`, default in
  production): a plain-http dev or CI server never sends it. The files routes keep their own policy
  (`default-src 'none'; style-src 'unsafe-inline'; sandbox`) and `nosniff`.
- **Web pages** (`src/proxy.ts`, `src/lib/security-headers.ts`): a **nonce-based CSP**, a fresh
  128-bit nonce per response, set on the response and on the render's request — Next reads the
  nonce from there and puts it on its own scripts, including the streamed reveal (`$RC`) and the
  RSC payload scripts. The policy (production; `<api>` = `API_PUBLIC_ORIGIN`, else `BASE_URL`'s
  origin):

  ```
  default-src 'self'; script-src 'self' 'nonce-<nonce>' 'strict-dynamic'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: <api>; font-src 'self'; connect-src 'self' <api>; worker-src 'self';
  manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
  ```

  `'unsafe-eval'` is added in development only (React's dev tools). **Why `style-src
  'unsafe-inline'`**: React renders `style={…}` as inline style attributes (chart sizes, sidebar
  widths, branding colours) and a nonce can't cover an attribute; styles run no script, so the
  script policy stays whole. **No eval in the browser:** zod probes `new Function` when a schema is
  built, which the policy reports as a violation on every page, so `src/instrumentation-client.ts`
  sets `z.config({ jitless: true })` before any app code (same validation, no probe). Every page is dynamic (it reads the session cookie), which a nonce
  needs — a statically prerendered page would carry no nonce and its scripts would be blocked.
- **Every web response** (`next.config.ts` `headers()`): `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`, no `X-Powered-By`.
- **The offline page** (`/offline.html`, a route handler outside the proxy) has its own policy:
  `default-src 'none'`, its one script by nonce, inline style, `data:` images. The service worker
  stores it with that header, so the stored nonce still matches its script.
- **Checked by:** `security.e2e-spec.ts` (API headers), `src/lib/security-headers.test.ts` and
  `src/proxy.test.ts` (the policy, the nonce on request and response), and the smoke spec
  `34-security-headers.spec.ts`: sign-in, the dashboard, employees, penalties, payroll, settings and
  activity load with the policy on the response, every inline script carrying its nonce, no
  `securitypolicyviolation` event, no console error, no broken image, the service worker registered.

### Rate limits

`@nestjs/throttler` behind our own guard (`common/rate-limit`), registered after `JwtAuthGuard` so
a signed-in caller is counted by user. Over a limit → **429 `TOO_MANY_REQUESTS`** in the usual
envelope, `params.count` = seconds to wait (EN/AR plural message in `errors.json`, which the web
app's `apiErrorText` shows), plus a `Retry-After-<bucket>` header. Counts are in memory — one API
process per school; a second replica would need a shared store.

**A whole school may share one public IP** (owner, 2026-11-22): an office NAT in front of our VPS,
or the app on the school's own server. So nothing people do in normal use is counted per IP alone
at a low limit — the 8 AM rush, dozens of teachers signing in within minutes, must never lock the
staff out. Accounts are counted per account; the per-IP figures are high ceilings a NAT full of
staff never reaches and a script trying many accounts (password spraying) does.

| Bucket | Routes | Counted by | Default per 60 s | Env |
|---|---|---|---|---|
| `global` | every route but `/health` | the signed-in user | 300 | `RATE_LIMIT_GLOBAL` |
| `global` (signed out) | the sign-in page's calls, the logo, the app icons | client IP | 1200 | `RATE_LIMIT_GLOBAL_IP` |
| `auth` | `POST /auth/login` · `POST /account/password` · `POST /users/:id/password` | the email typed + IP · the user + IP · the target user + IP | 10 | `RATE_LIMIT_AUTH` |
| `authIp` | those three and `POST /auth/refresh` together | client IP | 200 | `RATE_LIMIT_AUTH_IP` |
| `refresh` | `POST /auth/refresh` | the session (a hash of its refresh token); IP without one | 60 | `RATE_LIMIT_REFRESH` |
| `heavy` | the payroll exports (`/accounting/payroll/:month/export`, `/hr/payroll-runs/:id/bank-sheet`), logo and photo uploads | the user (IP signed out) | 20 | `RATE_LIMIT_HEAVY` |

The window is `RATE_LIMIT_TTL_SECONDS` (60); once over, the caller waits out the window. A
bucket's count spans all its routes (key = bucket + caller). A route names whose attempt it is
with `@RateLimit('auth', subject)` (the email is normalised like the lockout's). **Layers on
sign-in:** `auth` stops hammering one account from one place; the **per-account lockout** (5 wrong
in 15 min, the email alone, any IP) stops guessing one password from many places; `authIp` stops
one place trying many accounts. Why by user once signed in: every page the web app renders reaches
the API from the web server's own address, so counting by IP would make the whole school one
caller. Why the signed-out ceiling is high: every device at the school loads the sign-in page, the
logo and the app icons in the same few minutes. The e2e and smoke suites run with limits nobody
reaches (one test user on 127.0.0.1, much faster than a person — `test/setup-env.ts`,
`scripts/smoke.sh`); `security.e2e-spec.ts` sets its own limits and tests them (30 staff signing in
from one IP all get in; 11 rapid sign-ins on one email → 429).

### Who the client is (proxies)

- **`TRUST_PROXY`** (API, unset = none) is Express's `trust proxy`. Unset, the client IP is the
  socket's and `X-Forwarded-For` is ignored — a caller can't pick its own IP. Set it only where a
  proxy sets that header. `true` is refused at boot (it trusts any client).
- The web server forwards the browser's `X-Forwarded-For` and `CF-Connecting-IP` on its own API calls
  (`clientAddressHeaders` in `apiFetch` and the token refresh), so sign-in counts the person's IP,
  not the web server's.
- **`TRUST_CLOUDFLARE`** (default off): take the IP from `CF-Connecting-IP`, and only on requests
  whose socket peer is a trusted proxy. Safe **only** when the server's public ports accept nothing
  but Cloudflare (the `deploying-to-vps` firewall); otherwise anyone could send the header.
- **On our server** (Cloudflare → Traefik → web → API on Docker networks): `TRUST_PROXY=loopback,
  uniquelocal` and `TRUST_CLOUDFLARE=true`. A school's own server without Cloudflare:
  `TRUST_PROXY` naming its proxy, Cloudflare off.

### Sessions and the fetch cache (security review, 2026-11-23)

- **Refresh-token reuse grace** (`REFRESH_REUSE_GRACE_SECONDS`, default **10 s**, max 120): a rotated
  refresh token used again inside it — parallel requests refreshing with the same cookie — gets the
  **very pair its first use got**, never a new one. The successor refresh token is derived from the
  used one with HMAC-SHA-512 under the signing secret (`TokensService.successorOf`), so it can be
  given again without being stored in the clear; the access token is signed as of the rotation
  (`iat` = the token's `used_at`), so it is the same string too. A parallel refresh that loses the
  claim (the row's `used_at` is set first, inside the rotation's transaction) answers with the
  winner's pair. When the successor was itself rotated already (two tabs refreshing in turn), the
  replay follows the chain (up to 10 links) to the live token and answers with it, as of the rotation
  that issued it — two tabs never sign the user out. A revoked or broken link → 401, without
  revoking the sign-in. After the window a reuse is theft: the whole family is revoked (401).
- **Access tokens name their sign-in** (`fam`: the refresh-token family). A password change
  (`POST /account/password`) ends every other sign-in of the user — `core.user.sessions_ended` with
  `keepFamilyId`, after the change commits — and keeps the caller's. Their access tokens stop **at
  once** (L-1): every request loads the user with `password_changed_at` (the same read as before), and
  a token issued before it (`iat`) is accepted only while its family still has a live refresh token
  (`TokensService.stillValid`, one indexed lookup, only for such older tokens; the file middleware
  does the same). This also ends the old access tokens after a temporary password. The cut-off is
  the later of `password_changed_at` and `sessions_valid_after`, which deactivate and reactivate set:
  a reactivated user's tokens from before stay dead (their families were revoked). The other
  sign-ins' refresh tokens are revoked **inside** the password change's transaction (third review
  L2: `SessionRevocation`, which core/auth registers on start, since core/users can't depend on
  it); the `core.user.sessions_ended` event still follows for logging and other listeners. A token issued
  before `fam` existed (before 2026-11-23) can't say which sign-in it is: after a password change it
  is refused once, the caller included, who signs in again.
- **No per-user answer in Next's data cache.** Next 16 without `cacheComponents` (ours) caches no
  `fetch` by default, and `next: { tags }` alone doesn't opt in — but `apiFetch` doesn't rely on that:
  any request carrying a session is `cache: 'no-store'` and loses any `revalidate`
  (`withCachePolicy`, `apps/web/src/lib/fetch-cache.ts`). Tags stay, so a write's `updateTag` still
  refreshes the page, which then fetches afresh. Only public requests (the sign-in page's school name
  and logo, the app icons) may be cached. `fetch-cache.test.ts` guards it: the policy, no
  `use cache` / `unstable_cache` / route `revalidate` or `fetchCache` in `src`, no `cacheComponents`
  in `next.config.ts`, and no `fetch()` to the API outside `apiFetch` (and the token refresh).

### Uploads

- **Checked by their bytes** (`detectImageType`, the magic numbers: PNG, JPEG, WebP, an `<svg` root),
  never the name; the declared type must be an allowed one **and** agree with the bytes —
  a renamed file is refused with the usual 400 `INVALID_FILE_TYPE`. Size is capped while the file
  streams in (413 `FILE_TOO_LARGE`). Files are stored under a name we make and served with the type
  of what was detected, `nosniff` and the files policy.
- **SVG logos are converted to PNG on upload** (`svg-logo.ts`, sharp/librsvg): the longest side
  drawn at 1024 px; an SVG declaring entities, or one that can't be drawn, is refused (400). We chose
  conversion over sanitising because nothing needs the vector (the sign-in page shows a few hundred
  pixels; the app icons are PNGs drawn from it) and a sanitiser is a filter to keep up to date,
  while a PNG can't carry script, event handlers, `foreignObject` or external references. librsvg
  runs no script and loads no URL.
- **Logos stored as SVG before this** keep working, lazily: the logo route answers `….svg` with a
  PNG drawn on first request and kept beside it (`logo-<id>-svg.png`); the SVG is never served.
  The next upload replaces it with a PNG for good.

### Files follow their record

A stored file opens for exactly the people who may see the record it belongs to (owner,
2026-11-22). Only the logo and the app icons are public (`PUBLIC_FILE_FOLDERS`, their own routes).

- **A registry of folders** (`core/settings/files/file-folders.ts`, `FileFolders`): every other
  folder is registered by the module that owns its records, on start, with its `owner`, a
  `canOpen(user, url)` check, and optionally an extra `permission` and an `onOpen` hook. Core can't
  import a module (Module order), so the module registers — HR's `HrFileAccess`, like
  `HrAuditAccess` for the audit log.
- **`GET /files/:folder/:name`** (signed in): an unknown folder, a missing extra permission, or
  `canOpen` saying no → **404**, the answer the record itself gives (never 403, so existence isn't
  confirmed). Headers stay `Cache-Control: private, no-store`, `nosniff` and the files policy.
- **`employee-photos`** → the employee: the photo is found through the stored link
  (`employees.photo_url`, indexed), never by taking the file name apart; it opens when
  `hr.employees.view` covers that employee for the user (their scope: all, own stage, own team,
  self) — the rule for opening the employee — **or when it is the user's own linked employee** (the
  avatar in their top bar, even without `hr.employees.view`). A replaced photo belongs to nobody: 404.
  Where a screen shows a photo the viewer may not open (a manager outside their scope on a
  profile), `PersonAvatar` falls back to the silhouette.
- **Sensitive documents** (contracts, medical, legal, investigations — none stored yet) register
  their folder the same way, with `permission` (an extra key on top of seeing the record; not held
  → 404) and `onOpen`, which records the opening in the audit log in a transaction of its own (a
  failed record refuses the opening).
- **Nothing is stored where nobody could open it:** `FileStorageService.save` refuses an
  unregistered folder, and the unit guard `file-folders.guard.spec.ts` fails CI on a
  `files.save(<FOLDER>, …)` whose folder is neither public nor registered.
- **Checked by:** `file-access.e2e-spec.ts` (a stage head: their stage's photos, 404 for another
  stage's; self: own photo only; no permission: 404; signed out: 401; unknown folder: 404; the logo
  public), `file-folders.spec.ts` (the registry) and the guard.

### Scanning (`.github/workflows/security.yml`)

- **`pnpm audit --prod --audit-level=high`** on every PR, on `dev` and weekly — advisory
  (`continue-on-error`) while the known high findings (inside the Prisma CLI's config loader) wait
  for an upstream fix; make it blocking then.
- **gitleaks** on every PR (its commits), on `dev` and weekly (the whole history). Reviewed false
  positives are allowlisted by fingerprint in `.gitleaksignore` (test fixtures only — a real secret
  is rotated and removed from history, never allowlisted).
- **No Dependabot** (owner, 2026-11-22): removed — no automatic upgrade PRs. Dependency upgrades are
  done by hand; the weekly `pnpm audit` run is where known vulnerabilities surface, so read it and
  upgrade what it flags.

## Per-school differences

Never in code. In order of preference:

| Kind of difference | Where it goes |
|---|---|
| Different rules (grading, fees, terms, discounts) | Settings table, per school |
| Feature on for some schools only | Feature flag / module toggle |
| Branding, labels, which fields show | Settings + theme (CSS variables) |
| A new module for one school | A normal module in the codebase, switched on by flag for that school |
| Truly unique code nobody else will want | `custom/<school-slug>` — rare, lead approves |

Rule of thumb: what the school sets once a year or less is a setting; what changes daily is data.

### Settings catalogue (starting list — confirm after the stakeholder meeting)

- **Identity:** name (EN/AR), logo, colours, contact details, letterhead, stamp/signature images,
  default language (each user can pick their own).
- **Academic structure:** curriculum type, stages and grades offered, year and term dates, number of
  terms, working days, holidays, class naming, max class size, periods per day and their times.
- **Grading and exams:** grading scale, pass marks, exam types and weights, total calculation,
  report card template, rounding, retakes.
- **Fees:** fee items, amounts per grade, instalment plans, discounts (siblings, staff children,
  merit), late penalties and grace days, blocking report cards when unpaid, currency, receipt
  numbering, tax, accepted payment methods, refund policy.
- **Attendance:** daily or per period, statuses, what counts as late, absence limits, parent alerts.
- **Admissions:** required documents, age cut-off rules, entrance test/interview, stages.
- **Communication:** which notifications go out, channels (SMS, WhatsApp, email, push), sender name,
  templates (EN/AR).
- **Users and permissions:** roles, what each role can see and do, who approves what.
- **Modules on/off:** transport, library, inventory, canteen, payroll, penalties, parent portal,
  online payments. (HR's employee records are always on, because academics depends on them.)

Fees and grading differ the most between schools.

## Code architecture: modular monolith

One app per school, organised by business area. Not microservices (each school would become 6–10
services to run), not full DDD (most of the system is well-understood CRUD).

### Module rules

1. A module talks to another **only through its exported service** (`index.ts`) or through
   **events**. Never import another module's repository. Reading other modules' tables is allowed;
   writing them is not (see Table ownership).
2. **Each module owns its tables.** Only the fees module writes fee tables.
3. **Side effects go through events** (`DomainEvents.publish`, core/events): fees publishes
   `fees.payment.recorded`, communication sends the SMS.
4. **Optional modules and features** (transport, library, payroll, penalties…) register themselves
   and are switched on by feature flag.
5. **No circular dependencies.** Dependencies point one way, down the module order below. If two
   modules need each other, the shared part moves lower.
6. **Full domain modelling only where the rules are heavy: `fees`, `exams`, and HR's payroll and
   penalties.** A `domain/` folder of pure functions (discounts, instalments, grade calculation,
   salary, insurance, tax, penalty rules), no Nest or Prisma inside, heavily unit tested.

### Module order

This is the order in code. The order modules are **built** in is `docs/ROADMAP.md`.

```
common            ← technical helpers (no business)
  ↑
core              ← auth, users, roles/permissions, settings, flags, audit, notifications, files,
  ↑                  school structure (stages)
hr                ← employees, departments, job titles, contracts, staff attendance, leave,
  ↑                  penalties, payroll
academics         ← years, terms, grades, classes, subjects, teacher assignments (→ hr employees)
  ↑
students          ← students, guardians, enrolment
  ↑
admissions · attendance · fees · exams · communication · transport
  ↑
accounting        ← the payroll tax rule and the payroll taxes of approved months (built); journal
                     entries from approved payroll and fee payments (Planned)
```

- **Stages** (KG, Primary, Preparatory) are a list in `core/` ("school structure"). HR uses them now
  and academics and students later, so they sit below all three. The "no stage" entry is the stage
  with `isNoStage` (set by the seed and its migration, never by an endpoint); code never matches a
  stage by name.
- **Settings ownership:** `core/settings` holds school-wide values (identity, hours, language). Each
  module owns its own rule settings (HR: lateness, payroll, penalty catalogue; accounting: the payroll
  tax rule). The one Settings screen shows a section per module.
- **Accounting** sits at the top. It listens to `hr.payroll.approved` (must-deliver, through the
  outbox; later `fees.payment.recorded`)
  and creates its own records — today each approved month's payroll taxes, idempotent per HR run,
  worked out with the tax-rule version in force at the approval (`accounting_tax_rule_versions`)
  and the insurance HR's approved lines snapshot, so a late calculation gives the same answer; its pure tax maths live in `packages/shared/src/rules/payroll-tax.ts`. It
  reads other modules only through their exported services. No module below depends on it
  (`.dependency-cruiser.cjs` enforces it). Plan: `docs/plans/2026-11-18-accounting-plan.md`.

- A module may depend only on modules **below** it, through their `index.ts`. Lower modules
  never know about higher ones: they emit events, and higher modules react.
- **The order is today's best guess, not a permanent law.** It lives in the `dependency-cruiser`
  config, and changing it is a reviewed PR. What never changes: **no cycles, front doors only,
  only the owner writes.**
- Keep dependencies thin:
  - reference other modules' records **by ID**
  - read data when only data is needed
  - use events when a lower module must trigger work in a higher one

### How modules talk to each other

Three ways, each for a different situation.

**1. Service call: "I need an answer now."** The caller imports the other module's exported service
through its `index.ts` and calls it. Synchronous, **downward only**.

```ts
// modules/hr/hr.module.ts
@Module({ providers: [EmployeesService, EmployeesRepository], exports: [EmployeesService] })
export class HrModule {}

// modules/academics/services/teacher-assignments.service.ts
import { EmployeesService } from '@/modules/hr';   // front door only

const employee = await this.employees.getActiveById(dto.employeeId);
```

Use it to get data with the owner's rules applied, or to ask the owner to change its own data.

**2. Event: "something happened; whoever cares can react."** The lower module announces it and
doesn't know who listens. This is how a lower module triggers work in a higher one.

**Every event, its publishers and listeners, and every transaction boundary: `docs/EVENTS.md`**
(kept in step with the code by `apps/api/src/common/events/events-doc.spec.ts`). The design (owner,
2026-11-18): `docs/plans/2026-11-18-events-outbox-plan.md`.

```ts
// hr — inside the deactivation's transaction
await this.events.publish(
  HrEvent.EMPLOYEE_DEACTIVATED,
  { employeeId, at: new Date().toISOString() },
  { mustDeliver: true },
);

// academics — a must-deliver listener, handled once per event
@OutboxListener({ event: HrEvent.EMPLOYEE_DEACTIVATED, name: 'academics.unassign-teacher' })
@Injectable()
export class UnassignOnDeactivation implements OutboxEventListener<typeof HrEvent.EMPLOYEE_DEACTIVATED> {
  async handle(e: EmployeeDeactivatedEvent) { await this.assignments.unassignAll(e.employeeId); }
}
```

- **One way to send an event: `DomainEvents.publish(name, payload, options)`** (`core/events`,
  global). Names and payloads come from one map in `packages/shared` (`DomainEventMap`): a wrong
  name or payload fails typecheck. Nobody uses NestJS's `EventEmitter2` or calls `.emit(` — a scan
  fails the build (`core/events/events-usage.spec.ts`).
- **Always after the commit.** Inside a transaction `publish` queues on `AfterCommit` (dropped on
  rollback); outside one it runs now; inside a plain `txHost.withTransaction` (no queue) it throws.
- Names: `<module>.<thing>.<past-tense>` (`hr.payroll.approved`, `core.settings.changed`).
- **Two kinds — rule: if losing it leaves data wrong or someone not told, it is must-deliver**
  (`MUST_DELIVER_EVENTS`; the wrong `options` fail typecheck):
  - **Fire-and-forget** (`@OnDomainEvent(name)` listeners): in memory, after the commit, each listener
    awaited in turn; a throw is logged and never fails the request; not retried. Cache refreshes,
    notices (`core.settings.changed`, `core.user.sessions_ended`, `hr.employee.hired` / `updated`).
  - **Must-deliver** (`@OutboxListener({ event, name })` listeners): the **outbox**. An
    `outbox_events` row and one `outbox_deliveries` row per listener are written **in the change's
    transaction**; delivered by a nudge started right after the commit (not awaited: the response
    never waits for an outbox listener; tests wait with `DomainEvents.idle()`) and by the
    `outbox.deliver` poll every 30 s (claims with `FOR UPDATE SKIP LOCKED`, creation order, due up
    to 1 s after the pass's start); retried after 10 s, 1 min, 5 min, 30 min, then every 2 h,
    counted from the claim; **dead after 10 failures** (`attempts` counts failures only; logged; an
    admin retries it with
    `POST /outbox/deliveries/:id/retry`, `core.outbox.manage`, audited). Delivered events are
    deleted after 30 days (`outbox.cleanup`); dead ones are kept. `hr.payroll.approved`,
    `hr.employee.deactivated`, and every notification event.
- **Listeners are idempotent.** An outbox listener's `handle` runs in the delivery's transaction,
  which first marks that (event, listener) delivered — a redelivery finds it marked and does
  nothing — so the listener's writes (through `txHost.tx`) and the mark commit together; a throw rolls
  both back. A listener never opens a `RequiresNew` (a second pooled connection while the delivery's
  is held). Fire-and-forget listeners must be safe to run twice on their own.

**3. Read: "I just need to show data."** A repository may read other modules' tables for lists,
display and reports. **Never for writes.**

| Situation | Use |
|---|---|
| Need an answer or rule check from a lower module | Service call |
| Change another module's data | Service call (the owner writes) |
| Something happened; others may react | Event |
| Lower module must trigger a higher one | Event |
| Show or report another module's data | Read in your repository |

### Transactions and the audit log

**Request-scoped transactions** (`apps/api/src/database/transactions.ts`, audit spec D3).
`nestjs-cls` keeps one context per request (with a request id: the incoming `x-request-id`, or a new
UUID) and `@nestjs-cls/transactional` with the Prisma adapter keeps the open transaction in it.

- A repository that must join its caller's transaction injects `TransactionHost<DbAdapter>` and
  uses `txHost.tx` (the transaction client inside one, the plain client outside). Its multi-row
  writes use `txHost.withTransaction(...)`, which joins an open transaction or opens one.
  Repositories still on `DatabaseService` keep working but always run outside any transaction —
  move a repository over when its writes must be audited (#105 moved stages, the HR lists and the
  penalty catalogue; T28 refresh tokens and employees; T29 penalties, lateness and payroll — every
  write endpoint is now `@Audited`, or `@NotAudited` with a real reason).
- Never pass options to a nested `withTransaction`; only the request transaction sets them.
- **After-commit work** (events): `AfterCommit.run(fn)` queues `fn` until the open transaction
  commits (dropped on rollback), or runs it at once when none is open. Inside a transaction opened
  without a queue (a plain `txHost.withTransaction` outside a request) it **throws**
  (`AfterCommitWithoutQueueError`): open it with `afterCommit.inTransaction` instead.
  `AfterCommit.onRollback(fn)` is the opposite: work for a rollback (a file written for the change
  is deleted again — the logo, an employee's photo).
- **One pooled connection at a time.** Nothing may hold a connection while it waits for another: an
  `@Audited` handler holds the request transaction's for the whole request, so under it no
  `Propagation.RequiresNew` and no write on the plain client (#109's starvation).
  `src/database/connections.spec.ts` lists every `RequiresNew` and plain-client write with why it is
  safe; a new one fails until it is justified there. `POST /auth/login` and `POST /account/password`
  are `@NotAudited` for this reason and record their own entries in one `afterCommit.inTransaction`.

**The audit log** (`core/audit`, §9). One append-only table, `audit_entries`, written by every
module through core's exported `AuditService` — never through its repository.

- `audit.record({ action, entity: { type, id, label }, before?, after?, changes? })` writes **in the
  current transaction** and throws outside one (D2): the entry commits or rolls back with the change.
- **`label` keeps both names** when the record has them: `label: { en: nameEn, ar: nameAr }` (stages,
  departments, job titles, penalty groups, violations, roles, employees). It is stored as
  `entity_label` (English, or the only name) + `entity_label_ar` (Arabic, null when the same), and the
  API returns `entityLabel: { en, ar }`; the timeline shows the screen's language. A plain string (a
  user's name or email, a payroll month) reads the same in both. Entries written before
  `entity_label_ar` existed have it null. They are never backfilled — the table is append-only, and
  the record's *current* Arabic name may postdate the entry (a rename since), which would rewrite
  history. Instead `readLabel` (`audit.pure.ts`) reads the Arabic name at read time from the entry's
  own snapshot: those entries are list and catalogue edits whose one change holds the whole item, so
  its `nameAr` is the name as it was then (used only when its `nameEn` is the stored label). Anything
  else reads as its one label in both languages. Search (`q`) matches either stored name (so not
  those older entries' Arabic names), or a record the owning module matches by a field the entry
  doesn't store (below).
- **Related records and search** (`AuditRecordAccess`, where HR also says who may see what): a
  module registers, at start-up, a parent's related records — `registerRelated(employee, penalty,
  id → the employee's penalty ids)`, so a History (`GET /audit/records/…`, its `/fields` and
  `/audit/actors?entityType&entityId`) lists the record's entries and its related records', each
  still filtered by the viewer's scope — and search resolvers — `registerSearch(type, q → ids)`:
  HR matches an employee by code and a penalty by its employee's code, so Activity's "name or code"
  search (and its day totals) finds them. Both are read live from the owning module's tables at
  query time: entries never store the code or the link, so nothing is duplicated, renamed codes
  can't go stale and older entries are found too (the log is never rewritten). Core never imports
  HR: HR calls core's registry.
- Who (id + name snapshot), IP, user agent and request id come from the request (D4). `actor` is
  passed only where the request has no user yet (a successful sign-in) or none applies (`null`).
- **A service records in its own write's transaction** even when called outside a request (the
  seed): it wraps the write in `AfterCommit.inTransaction(...)`, which joins the request's
  transaction or opens one. An employee entry written by the seed has no actor ("System").
- **A failed sign-in** (spec 5, `AuthService`) is recorded in a transaction of its own
  (`Propagation.RequiresNew`), since the request's rolls back with the 401. Its record is the typed
  email (normalised) as id and label, never a user id — the same entry whether or not the email
  belongs to an account — with no actor and no password.
- **Employee entries** store the record as `employeeAuditSnapshot` (`hr/employees`) builds it: dates
  as `YYYY-MM-DD`, money in piastres, and the stage, department, job title and direct manager by
  their two names under their id fields (`departmentId: { nameEn, nameAr }`), so the timeline reads
  "Department: Science → Maths" and a later rename never rewrites the entry. Salary-type values are
  stored and hidden at read time (`hideSalaryValues`, P4).
- Only changed fields are stored, each `{ field, before, after }`; secrets (password hashes,
  tokens, anything matching the deny list in `audit.pure.ts`) are dropped at any depth; money stays
  in piastres; `id` / `createdAt` / `updatedAt` are ignored (D7). Equal before and after write
  nothing.
- Append-only in the database: a trigger refuses `UPDATE`, `DELETE` and `TRUNCATE` (D8). Tests can't
  clean the table up — they read entries after a mark (`test/helpers/history.ts`).
- `actor_id` is not a foreign key, so deleting a user never touches the log (edge case 4).
- Actions are typed keys in `packages/shared/src/audit.ts` (`AUDIT_ACTIONS`: module, entity type,
  kind); their EN / AR sentences and field labels are in `locales/<lang>/audit.json` (D5). Entries
  store keys and values, never sentences.
- **Every write endpoint declares its audit** (D6): `@Audited('<action>')` or
  `@NotAudited('<reason>')`. `src/core/audit/audit-declarations.spec.ts` scans every controller and
  fails when a POST / PATCH / PUT / DELETE handler has neither.
- `@Audited` handlers run — validation included — in one transaction opened by the global
  `AuditedInterceptor`. If the handler succeeds without having called `record()` for that action,
  the request fails with `AUDIT_NOT_RECORDED` (500) and everything rolls back (D6b). A handler that
  throws keeps its own error and its entries roll back with it. A save with nothing changed still
  calls `record()` (with no changes): nothing is written, the check passes.
- Read API (`@Permission('core.audit.view')`): `GET /audit` (page, limit ≤ 100, actorId, module,
  action — one or several, comma-separated — from inclusive / to exclusive as ISO instants, q on the
  record label) and `GET /audit/records/:entityType/:entityId` (page, limit, actorId, field), newest
  first, server-paged; plus `GET /audit/summary?from&to` (entries, people, money entries, failed
  sign-ins — Activity's "today at a glance"), `GET /audit/day-totals?<the GET /audit filters>&periods=
  <from>/<to>,…` (≤ 31 periods → one count each, in order: Activity's day headers count the whole
  school day for the filters, not the page), `GET /audit/actors[?entityType&entityId]` (the
  person pickers) and `GET /audit/records/:entityType/:entityId/fields` (the History field filter).
  "Money" entries are payroll actions or changes to `AUDIT_MONEY_FIELDS` (`packages/shared`).
- **Settings history** (D9) lives in the audit log. The screens (T30): Administration → **Activity**
  (`modules/activity`), each employee's **History** tab and each payroll run's **History** tab
  (`/payroll/<id>/history`: every `hr.payroll.*` entry is filed against the run — create,
  recalculate, adjustments, approve, returned by Accounting, transferred), built on `core/audit` in
  the web app. The run page is a `(run)` layout (header, notices, tabs; the whole run read once and
  shared with the tabs through `useRunState`) over its Employees and History tabs, like the employee
  profile; the Employees tab reads the run again only when the URL filters its lines;
  Settings has no history section of its own — "View change history" opens Activity with
  `module=settings` (the settings actions of both modules). `GET /settings/history` was removed.
  The old `setting_changes` rows were copied by the T27 migration (same id, value, person, time).
  **History is written in the change's own transaction** — never after it, so a crash between the
  two can't lose it. School, HR and accounting settings: `SettingsService.setValues` writes the keys
  and their entry together. Lists and catalogue (stages, departments, job titles, penalty groups,
  violations): the owning service wraps its write in `AfterCommit.inTransaction` and calls core's
  exported `SettingsHistory.record({ scope, key, oldValue, newValue, changedById })` inside it — the
  entry keeps the old history shape (the history key as the field, whole snapshots as before /
  after, both names as the label), and a failing entry rolls the change back. Their repositories
  use `txHost.tx` so they join that transaction. `settings.changed` still fires, after the commit,
  for real changes only; nothing records history from it. Fire-and-forget, not the outbox: the
  history row is core's own table written in the same transaction, and no other module needs the
  event to arrive.
- **Dates** on the audit screens are read in the school's time zone (`SCHOOL_TIME_ZONE`, Cairo, in
  `core/audit/lib/time.ts`): day headers, times and the date filter's day edges. Calendars start the
  week on Sunday in both languages (the school's working week, `WEEK_STARTS_ON`).
- **Change lines** (`changeRows`, `core/audit/lib/entry-text.ts`): a list item edited in place
  (`{ nameEn, nameAr, isActive, sortOrder }` before and after, same id) shows one line per changed
  part — "Violation · Name (Arabic)" — never "Strike → Strike"; a different item picked stays one line.
  Any other object value is split into one line per part that changed, never shown as JSON: a payroll
  run's `totals` as plain figures, "Net", "Employees" (`AUDIT_TOTAL_PARTS` in shared: order, money or
  count; labels under `audit.totals.*`) — display only, the entry keeps every part: creating a run
  shows Net and Employees, approving it Status then Net, a recalculation only the figures that
  changed ("No change in totals" when none did); "Need review" never shows (`TOTALS_SHOWN`), a role's `permissions` as "Permissions · View payroll: Everyone → Their
  stage". A `totals` the viewer may not see (R7) stays one "changed" line.
  A month record (payroll run, its taxes, a lateness month — labelled `2026-11`) reads in the
  sentence as the app prints a month, "November 2026" / "نوفمبر 2026" (`recordLabel`), on one line.
- **Filters** on both audit screens: a side panel on wide screens (first in the page's tab order,
  drawn in the second column), else one Filters button opening `AuditFiltersSheet` — from the
  bottom on a phone, from the inline-end edge on a tablet.

### Permissions

Who may call each endpoint (`core/permissions`, spec `docs/specs/2026-11-17-roles-permissions.md`,
P1). Mirrors the audit log: typed keys in `packages/shared`, a declaration on every handler, a CI
scan and a run-time check.

- **Keys** are typed in `packages/shared/src/permissions.ts` (`PERMISSIONS`), `<module>.<area>.<action>`
  (`hr.payroll.approve`), grouped by module. Each has an EN / AR label and description in
  `locales/<lang>/permissions.json` (`keys.<key>.label` / `.description`); the shared tests fail on a
  key without both, or a label without a key. A typo in a key fails typecheck.
- **Every handler declares who may use it**, one of:
  - `@Permission('key', ...)` — the user must hold **all** the keys;
  - `@SignedIn()` — any signed-in user, for what every account needs (`/auth/me`, sign-out, opening
    an uploaded file);
  - `@Public()` — no session: only sign-in, refresh, the sign-in page's school name and logo, and
    `/health` (§2).
  A class-level declaration covers the handlers that declare nothing themselves.
- **The global `PermissionGuard`** (`APP_GUARD`, registered in `app.module.ts` right after
  `JwtAuthGuard`, so 401 always comes before 403) is **closed by default**: no declaration, or more
  than one, → 403. `src/core/permissions/permission-declarations.spec.ts` scans every controller
  (with `common/testing/controller-scan.ts`, shared with the audit scan) and fails CI on the same
  handlers.
- **What a user holds** comes from one place, `PermissionsService.permissionsFor(user)` in
  `core/permissions`; the guard and `/auth/me` only call it. See Roles as data below.

### Roles as data

Roles are rows, not code (spec P2, R2 / R5 / R8 / R9). A school changes them through the Roles API
(screens in P3); nothing in the code names a school's roles.

- **Tables** (owned by `core/roles`): `roles` (key, name EN / AR, `built_in`, `sort_order`),
  `role_permissions` (role, permission key, scope) and `user_roles`. The permission key is text,
  not an enum: a key removed from the code stays stored, and is ignored and logged when read
  (edge case 8).
- **Starting roles** are `BUILT_IN_ROLES` in `packages/shared/src/roles.ts` (the spec's table, GUESS):
  System admin, HR manager, HR officer, Accountant, Principal, Stage head, Direct manager. The P2
  migration copied them into the tables once and gave every HR admin **System admin + HR manager**;
  from then on they are data. Built-in roles can be edited (names, permissions) and, once nobody
  holds them, deleted like a custom role — except the System admin (owner, 2026-11-19). A migration
  that grants a new key to starting roles must `JOIN "roles"` on the key (never assume the role
  exists), so it skips a deleted one; `test/deleted-starting-roles-migration.e2e-spec.ts` replays
  every migration after the roles one with the starting roles deleted.
  The **System admin always holds every key** with scope `all`, whatever its rows say — a key added
  later reaches it without a migration, and its permission list can't be edited (no lock-out).
- **Union and scopes.** A user's permissions are the union of their roles' (edge case 2). Each grant
  has a **scope**: `all`, `own_stage` (the user's linked employee's stages — main and "also
  teaches in", owner 2026-11-21), `own_team` (employees
  whose direct manager is the user's linked employee), `self`. Per key the widest scope wins, in
  that order (`widerScope` in shared; `own_stage` counts as wider than `own_team`).
- **Per request.** `PermissionsService` reads the user's roles once per request and caches them in
  the request context (CLS), so a change to a role or to a user's roles applies from the next
  request, with no new sign-in (edge case 7).
- **`scopeFor(user, key)`** (same service, exported from `core/permissions`) returns
  `{ scope, employeeId, stageId, stageIds }` — the widest scope the user holds `key` with, plus
  their linked employee, its main stage and all its stages (`employee_stages`) — or `null` when they don't hold it. The module that owns the data applies
  it in its repository query; a scoped user with no linked employee matches no rows. Core only
  answers the question.
- **Scopes in HR (P4).** `modules/hr/access`: `employee-scope.pure.ts` turns a `UserScope` into
  rows (`own_stage` → the employee's main or other stage in the user's stages, `own_team` →
  `managerId`, `self` → `id`, not held or unlinked → none) as a Prisma filter (`employeeWhere`) or a
  check (`inScope`). **Penalties go by the penalty's own stage** (`penaltyWhere` / `penaltyInScope`,
  §4 two steps): a stage head sees and acts on the penalties recorded in their stages, not those of
  an employee's other stage; the notification resolver for penalties asks the same; `HrAccessService` reads the
  request's user from the request context (outside a request — seed, listeners — everything is
  covered). HR services pass the filter to their repositories on every row-scoped read and check
  the action's own key on writes keyed by an employee; outside → 404 (edge case 3). On those writes
  the scope check runs **before** the other checks (`EmployeesService.assertScopeFirst`), so a scoped
  user never gets a 400 / 409 that tells them an employee outside their scope exists; an edit also
  can't point at a manager the user can't see or move the employee out of the editor's scope.
  School-wide work (calculating payroll, the month lock) is never scoped.
- **Salary (R7, P4).** Without `hr.employees.view_salary` covering the employee, HR leaves the
  salary-type fields out (`EMPLOYEE_SALARY_FIELDS`, `PAYROLL_LINE_MONEY_FIELDS`, adjustment amounts)
  and sets `salaryVisible: false` (shared `SalaryVisibility`); the fields are optional in the shared
  types, so the web app must handle their absence (`Money` draws `—` for `undefined`). Run totals:
  see `PayrollRunSummary` in shared. The audit log hides salary-type values (`AUDIT_SALARY_FIELDS`,
  `hidden: true`) unless the viewer holds the key at scope `all`.
- **Audit entries about scoped records.** Core can't know HR's scopes, so `core/audit` exposes
  `AuditRecordAccess`: HR registers, per entity type, which ids the viewer may see (employees and
  penalties by scope; lateness months and payroll runs, whose entries carry several employees'
  figures, only at scope `all`). Activity, its day totals, the people picker and "Today at a glance"
  leave the rest out, and a record's History answers 404. A payroll run's `totals` stay visible to
  an `hr.payroll.view` holder at scope `all`, as on the Payroll screen.
- **Linked employee.** `users.employee_id` (unique, core-owned) is the link (R9). HR's older
  `employees.user_id` was copied into it by the migration and was dropped in P4. On screen it is the
  user's **employee record** ("Who is this person in HR?"). HR's `Employee` carries
  `signInAccount` (`{ id, name }` or null) for the profile's "Signs in as" line, read through core's
  exported `UsersService.accountOfEmployee` — HR never reads the users table itself.
- **The `users.role` enum column is gone** (P3 migration `users_drop_role_add_sign_in`): access
  comes only from `user_roles`, the access token carries only the user's id, the user chip shows the
  names of their roles and every signed-in user's home is the dashboard (`homeFor(locale)`). Without
  `hr.dashboard.view` the dashboard route renders a welcome instead (`WelcomeView`: the user's name and
  a link per screen they may open, from `SIDEBAR_SCREENS` + `canOpenScreen`, then My account).
- **Forced password change** (R9, P3). A temporary password (set on Add user or by "Set temporary
  password") sets `users.must_change_password`. `AuthUser.mustChangePassword` comes with the user on
  every request (and in the sign-in response and `/auth/me`). While it is set, the global
  `PermissionGuard` answers **403 `PASSWORD_CHANGE_REQUIRED`** to everything except the routes
  marked `@AllowedBeforePasswordChange()` — `GET /auth/me`, `POST /auth/logout` and
  `POST /account/password` (a CI scan pins that list). On that call the current password is not
  asked for (the sign-in just proved the temporary one), but the new one must differ from it
  (`SAME_PASSWORD`). The web app sends such a user to `/<locale>/set-password` right after sign-in,
  and the dashboard layout redirects there from any screen, keeping `?next=` to land on afterwards.
- **Sign-in facts.** `users.last_sign_in_at` is written on each successful sign-in and
  `users.password_changed_at` whenever a password is set or changed; the Users list and My account
  show them.
- **Row-level permissions.** Only the permissions about particular employees
  (`ROW_SCOPED_PERMISSIONS` in shared: employees, salaries, penalties, lateness, payroll view) take a
  scope other than `all`; the Roles API refuses the rest (`INVALID_SCOPE`) and the role page shows
  "Whole school" for them.
- **Users API** (`core/users`, `core.users.view` / `core.users.manage`): list (paged, search on name
  or email, status), get, create (temporary password, roles, linked employee), edit, deactivate /
  reactivate, set a temporary password; `POST /account/password` (`@SignedIn`) changes your own.
  P3 added `?roleId=` (the role filter, a role's holders), `GET /users/employee-options`
  (`core.users.manage`: the linked-employee picker, searched on the server, with the account each
  employee already has) and `GET /account` (`@SignedIn`: My account).
  Deactivating or setting a temporary password emits `core.user.sessions_ended` after the commit;
  `core/auth` revokes the user's refresh tokens. The access token is refused at once anyway, since
  every request re-reads the user (edge case 6).
- **Roles API** (`core/roles`, `core.roles.view` / `core.roles.manage`): list (paged), get, create a
  custom role (generated key `custom_<hex>`), edit names and permissions (the set is replaced),
  delete a custom role nobody holds.
- **Last System admin** (R8, edge case 5): removing the role from, or deactivating, the last active
  System admin is refused (`LAST_SYSTEM_ADMIN`, 409). The check locks the System admin role row for
  the rest of the transaction, so two such changes at once can't both pass.
- **The access ceiling** (security review H1/H2, owner 2026-11-23). What a non-System-admin may give
  is what they hold: `PermissionsService.heldGrants` (every grant of every role, not only the widest)
  checked by `grantWithinCeiling` / `firstGrantOverCeiling` (shared, `rules/grant-ceiling.ts`). Scopes
  form a partial order — `all` covers everything; `own_stage` covers itself and `self`; `own_team`
  covers itself and `self`; `self` only itself; stage and team don't cover each other. Users: the
  System admin role, or any action on a System admin's account → 403 `SYSTEM_ADMIN_ONLY`; a role
  given or taken away, or an account managed, beyond the ceiling → 403 `GRANT_EXCEEDS_OWN`; one's own
  `roleIds` or `employeeId` (anyone, a System admin too) → 403 `OWN_ACCESS_CHANGE`. Roles: a grant
  beyond the ceiling → `GRANT_EXCEEDS_OWN`; editing a role one holds → `ROLE_HELD_BY_YOU`; one a
  System admin holds (or the System admin role) → `ROLE_HELD_BY_SYSTEM_ADMIN`; the ceiling covers the
  role's current grants and its new ones (removing one beyond theirs is refused too) and deleting it.
  Unlocking a sign-in is under the same ceiling as deactivating. **Employee links** (H-1): only a
  System admin sets or changes `employeeId`, on create or update (`EMPLOYEE_LINK_ADMIN_ONLY`) — the
  stage, team and self scopes are anchored to the linked employee, so a link is access; checking the
  employee against every scoped grant would be finer but needs HR's scope rules in core, so the simple
  rule was picked. A System admin may change their own link (they reach everyone already), never their
  own roles. **Races** (L-6, L1): every check on a user first locks their `users` row (`lockUser`) and
  then, `FOR SHARE`, the rows of the roles they hold and the roles about to be given (`lockTarget` /
  `lockForGiving`) — before any grant is read for the ceiling; `setRolesOf` takes the same locks. A
  role edit or delete locks the role's row (`lockRole`) before its held-by checks. The exclusive
  locks are `FOR NO KEY UPDATE` (third review L3): they still conflict with `FOR SHARE`, but not with
  the key-share lock a foreign-key insert takes, so signing in (a refresh token for that user) or
  giving that role to someone else isn't held up. **Takeover** (third review M1): the ceiling compares
  scope labels, not reach (the Primary head's `own_stage` is not the Prep head's), so a
  non-System-admin can't set a temporary password, change the email or unlock any account linked to
  an employee (`LINKED_ACCOUNT_ADMIN_ONLY`). **Pay needs a link** (M2): a non-System-admin can't give
  an unlinked account a role that `actsOnPay` (shared `PAY_AND_PENALTY_KEYS`: payroll adjust /
  approve, lateness edit, penalties review / approve / cancel, employees edit;
  `UNLINKED_PAY_ROLE`), nor add such a permission to a role an unlinked account holds; and HR
  refuses an unlinked non-admin's payroll adjustment or approval, pay-field edit, lateness change and
  penalty review / approval / rejection / cancellation (`HrAccessService.assertLinkedForPay`,
  `ACCOUNT_NOT_LINKED`). The release check `apps/api/prisma/checks/unlinked-pay-accounts.ts`
  (`docs/demo/DRY_RUN.md` 2b) lists the accounts to link. The actor's own role rows are locked
  `FOR SHARE` before their ceiling is read (users first, then roles). Deactivating, a temporary
  password and a password change all revoke the refresh tokens inside their own transaction
  (`SessionRevocation`, one registered revoker). The user snapshot in the log names the linked employee
  (`employeeId: { id, nameEn, nameAr }`, the names with the code), so a link change reads before →
  after. The web greys these out from the session (`giveCeiling`: keys only — the API also
  checks scopes).
- Every user and role write is `@Audited` (`core.user.*`, `core.role.*`); passwords are never in the
  log (the entry says only that one was set or changed).
- Area order inside core: `audit` ← `permissions` ← `roles` ← `users` ← `auth`, and `audit` ← `settings` ← `sign-in-limit` ← `users`, `auth`; `jobs` depends on no other area (a job lives in its own area and only uses `@ScheduledJob`); `audit`, `permissions`, `settings` ← `notifications` (no other area imports it — `.dependency-cruiser.cjs`). `core/audit` reads
  an actor's name from `users` itself, so it depends on no other core area.
- **Screens (P3, option A of `design/mockups/access.html`)** — `apps/web/src/modules/access`:
  Administration → **Users** (`core.users.view`; table with search, role and status filters, 10 per
  page, ⋯ Edit / Set temporary password / Deactivate / Reactivate), **Add user** and a user's page
  as full pages (searchable role checklist with the last System admin's role locked and the reason,
  searchable linked-employee picker, Status and Password cards, sticky Save bar disabled until a
  change; read-only without `core.users.manage`), **Roles** (`core.roles.view`; kind, permission
  count, holders; Duplicate, Delete for a custom role nobody holds) and a role's page (names EN/AR,
  permissions grouped by module with a switch and an inline scope, who holds it; the System admin
  read-only). **My account** (`/account`, every user, opened from the user chip): name, email,
  roles, linked employee, sign-in facts and Change password. The forced **Set a new password** page
  is `core/auth` (`/set-password`).
- **The web app** gets the keys with the session: `GET /auth/me` returns `SessionUser`
  (`AuthUser` + `permissions` + `roles`). The dashboard layout reads it on the server and passes it to
  `SessionProvider`; `can(user, key)`, `useCan()` and `<Can permission="…">` in
  `apps/web/src/core/auth` hide menu items and action buttons. **`can()` is only the view** — the
  guard is the protection, and a hidden button's endpoint still refuses the call. **Who may open
  each page is one list, `SCREENS` in `packages/shared/src/screens.ts`** (route → the options that
  open it; Settings opens for anyone who may view one of `SETTINGS_SECTION_ACCESS`'s sections). Every
  page under `(dashboard)` calls `await requireScreen('<id>')` (server; any one of the options opens
  it), the sidebar (`nav-items.ts`), the dashboard's Settings quick link and the Settings section
  list read the same entries, and `e2e/24-role-access.spec.ts` signs in as each built-in role and
  checks the whole matrix. `screen-guards.test.ts` fails on a page without the guard. A page the
  viewer can't open renders the shell's not-found screen (`(dashboard)/not-found.tsx`) — the same
  screen as a record outside their scope, so it never tells whether something exists (P4). A new
  page or Settings section: add it to `SCREENS` / `SETTINGS_SECTION_ACCESS` first. Tabs, sections,
  card fields, quick links and dashboard tiles are gated the same way, and their skeletons follow.

### Sign-in limits

Wrong-password counting per account (`core/sign-in-limit`, owner 2026-11-18, §2). **Per account**
— the rate limits on sign-in (per email + IP, and a high per-IP ceiling; Security → Rate limits) sit on top of it.

- **Rule.** `security.login.maxAttempts` wrong passwords within `security.login.windowMinutes` lock
  that account's sign-in for `security.login.lockMinutes` — core settings, defaults 5 / 15 / 15
  (`SETTING_DEFAULTS`, each read as at least 1; no screen yet).
- **Table** `login_attempts` (email PK, `failed_count`, `window_started_at`, `locked_until`; index on
  `window_started_at`), keyed by the **lower-cased email typed**. An email nobody has gets a row too,
  so the answer never says whether an account exists. No foreign key to `users`.
- **One atomic write per wrong password**: `INSERT … ON CONFLICT (email) DO UPDATE` — a window that
  started more than `windowMinutes` ago, or whose lock has ended, starts over at 1; the attempt
  whose count reaches the limit sets `locked_until` (so concurrent attempts are all counted and lock
  once). Timestamps go in as UTC `timestamp(3)` literals, never depending on the connection's time
  zone. That write uses the plain client, outside the request's transaction, so a wrong current
  password on the `@Audited` `POST /account/password` stays counted when the request rolls back;
  the repository's other calls join the caller's transaction (`txHost.tx`).
- **While locked**, `POST /auth/login` and `POST /account/password` (both the forced new-password
  path and My account) answer **429 `TOO_MANY_ATTEMPTS`** before any password is checked, with
  `params: { count: <minutes left, rounded up> }` in the envelope. A correct sign-in deletes the row;
  so does a verified current password on a password change. Sign-in never deletes stale rows — the
  nightly `login-attempts.cleanup` job does (below).
- **Coded errors with values.** `CodedException.withParams(status, code, params)` carries `params`
  to the envelope; the filter's `translateError(code, lang, params)` fills `{name}` slots and picks a
  plural form by `params.count` (`Intl.PluralRules`), so `errors.json` may hold a six-form plural
  message like the web app's. The web's `apiErrorText` passes `params` to `t()` the same way.
- **Audit.** The attempt that locks records `core.auth.locked_out` — keyed by the email typed, like
  T28's `core.auth.sign_in_failed`, so the entry is the same whether an account has that email; no
  actor on sign-in — in **its own transaction** (`Propagation.RequiresNew`), so it stays though the
  request fails; a failure to record is logged, never turned into a 500. Every sign-in attempt that
  fails is also a `core.auth.sign_in_failed` — wrong ones and those refused while locked (429).
- **No request transaction around a sign-in.** `POST /auth/login` is `@NotAudited` (with the reason):
  `AuthService.login` writes `core.auth.sign_in` in one transaction with the session it issues
  (`afterCommit.inTransaction`), and the failure path's entries and count in their own. An
  `@Audited` login held a pooled connection for the request while those writes waited for another;
  with as many concurrent wrong passwords as the pool has connections (5 on CI's 2 vCPUs) every
  request starved: they failed waiting for a connection (Prisma pool / transaction timeouts, which the
  filter answers as a 4xx) — the e2e "concurrent wrong passwords" case (12 at once) guards it.
  `POST /account/password` stays `@Audited`, so a wrong current password still needs a
  second connection while its request holds one — acceptable for one person's own password, but
  the same reason applies if it ever sees bulk traffic.
- **Unlock.** `POST /users/:id/unlock-sign-in` (`core.users.manage`, `@Audited('core.user.unlock_sign_in')`,
  change `lockedUntil` → `null`; nothing written when it wasn't locked). `UserAccount.lockedUntil` is
  set while a lock holds; the Users list shows "Sign-in locked" and ⋯ → Unlock sign-in, the user's
  page a notice with the button.

### Scheduled jobs

Work on a clock — backups, reminders, reports (`core/jobs`, `@nestjs/schedule` + `cron`).

- **A job** is a provider in its own module, marked `@ScheduledJob({ name, cron })` and implementing
  `JobHandler.run()`. `name` is `<area>.<what>`, unique (a duplicate fails at boot); `cron` is read on
  the **school's clock**, `SCHOOL_TIME_ZONE` (`Africa/Cairo`, `packages/shared`; a time-zone setting
  can replace it later). `JobRunner` finds every marked provider at boot (`DiscoveryService`);
  `JobScheduler` puts each on its clock through `@nestjs/schedule`'s `SchedulerRegistry`
  (`waitForCompletion`, so a slow run isn't overlapped in one container).
- **Single run across containers.** Every run first takes a Postgres advisory lock keyed by the job
  name — `pg_try_advisory_xact_lock(hashtextextended('job:<name>', 0))`, the transaction-scoped form
  of `pg_try_advisory_lock`, held by a transaction open for the run (up to 60 minutes). It is released
  when the transaction ends, also if the process dies, and can't be left behind on a pooled
  connection. A container that doesn't get the lock skips the run (`skipped`, nothing recorded).
  A job that is safe to run in two containers at once declares `lock: false` and runs without it —
  the outbox's jobs, which claim rows with `FOR UPDATE SKIP LOCKED`; the lock's transaction would
  otherwise hold a pooled connection for the whole run while the job's work needs another.
- **`job_runs`** (job name, `started_at`, `finished_at`, `status` `success` | `failed`, `error` text):
  one row per run that took the lock. A failing job is logged and recorded with its error (stack, cut
  to 4,000 characters); a failure to take the lock or to record is logged too. A job never throws
  into the API. A run whose `run()` returns `'idle'` (nothing to do — a frequent poll) is not
  recorded.
- **Tests.** Jobs are on their clocks only when `jobs.enabled` (env `JOBS_ENABLED`, default on, **off
  under `NODE_ENV=test`**), so unit and e2e tests never run one by itself. A test runs one by name:
  `app.get(JobRunner).run('<name>')` → `'success' | 'failed' | 'skipped' | 'idle'`.
- **Jobs today:** `login-attempts.cleanup` (`core/sign-in-limit`), nightly at 03:00 school time:
  deletes `login_attempts` rows whose window and lock both ended more than a day ago.
  `outbox.deliver` (`core/events`, every 30 s, `lock: false`): delivers due outbox deliveries.
  `outbox.cleanup` (`core/events`, 03:30, `lock: false`): deletes delivered events older than 30 days.
  `core.notifications.purge` (`core/notifications`, 02:30): deletes expired notifications (below).
  `hr.reminders.daily` (`modules/hr/reminders`, 07:00): HR's reminders — contracts and probation
  ending soon, lateness not entered, payroll not prepared / still a draft (Notifications → HR's
  reminders).

### Notifications

The in-app bell (`core/notifications`, §11, spec `docs/specs/2026-11-18-notifications.md`, plan
`docs/plans/2026-11-18-notifications-plan.md`). **Core owns the mechanism; each module owns its
types** and sends through core's exported `NotificationsService` — core never imports a module.

- **Types** are typed keys in `packages/shared/src/notifications.ts` (`NOTIFICATION_TYPES`,
  `<module>.<thing>.<event>`): module, category (`approval` / `reminder`), `canTurnOff` (approvals
  can't be turned off, owner 2026-11-18), default channels, the permission a recipient needs, a
  dedupe prefix and a link builder (a `SCREENS` id + record / query). Texts in
  `locales/<lang>/notifications.json` (`types.<key>.name` / `title` / `body` / `group`, six plural
  forms on `count`); the shared tests fail on a type without them. A notification stores the type key
  and its values (names as `{ en, ar }`), never a sentence (N3). `NotificationTypes` in core is the
  registry (`register` adds one — the tests' test-only type).
- **Sending.** `notify({ type, subject: { entityType, entityId, employeeId? }, params, dedupeKey,
  actorId?, groupKey? })` (or `paramsFor(userId)` instead of `params` when a value depends on the
  reader — asked once per new item) and `resolve({ type, subject, resolution, byUserId? })` write in the
  **current** transaction and throw outside one (`NotificationOutsideTransactionError`), like
  `audit.record()`: a module calls them inside its own change's transaction, so the change and its
  notifications commit or roll back together (N4). A module reacting to *another* module's event does
  it in a must-deliver `@OutboxListener`, whose delivery transaction they join (idempotent through the
  dedupe keys). A job wraps them in `afterCommit.inTransaction`.
- **Recipients (N5)**: active users holding the type's permission through any role (the System admin
  holds every key), at their widest scope (`PermissionsService.scopeFor`), minus the actor (GUESS).
  Scope `all` covers everything; another scope needs the user's linked employee (none → nothing
  scoped, R5) and the **`NotificationScopeResolver`** the module registered for the subject's entity
  type with `registerScopeResolver` — a scoped holder with no resolver makes `notify()` throw (never
  "send to everyone"). Zero recipients is fine.
- **Tables.** `notifications` (recipient kind + id — `user` now, a parent `contact` later, no foreign
  key —, type, group key, actor, `updated_at` = latest item, `read_at`, `resolved_at`),
  `notification_items` (subject, `params` jsonb, dedupe key, resolution, the resolver's name
  `{ en, ar }`; unique `(recipient_kind, recipient_id, type, dedupe_key)`), `notification_deliveries`
  (one per channel enabled when it was made; `in_app` is `sent` at once), `notification_defaults`
  (the school's, per type and channel) and `notification_preferences` (each person's).
- **Dedupe and grouping (N9, N17).** Per recipient, under a transaction-scoped advisory lock on
  (recipient, type, group key): an item whose dedupe key exists is a no-op; otherwise it joins the
  recipient's open (unread, unresolved) notification of the type and group key (default: today on
  the school's clock, `schoolDayOf`), or starts a new one. The unique index settles a race across
  group keys (the loser drops the notification it made). Recipients go in id order, so two
  transactions take the locks in one order.
- **Resolve (N10)**: every open item of the type about the subject, for every recipient, gets
  `resolved_at`, the resolution and who did it (their linked employee's two names, else the account
  name); a notification left with no open item is resolved and stops counting.
- **Reading (N11).** Every route is the signed-in user's own (`@SignedIn`; the recipient comes from
  the token; another person's id → 404): `GET /notifications` (page, limit ≤ 50, `status=all|unread`,
  `category`), `GET /notifications/unread-count`, `POST /notifications/:id/read` / `unread`,
  `POST /notifications/read-all` (`{ upTo }`: only those whose latest item came by then).
  `status=unread` is the count's rule (unread, unresolved, an open item the reader may see), so the
  Unread tab and the bell always agree. Each read
  re-checks every item against the reader's **current** permission and scope with the same resolver;
  an item they may no longer see is left out of `items`, `openCount` and the count (the row stays), and
  a notification with none left is absent (and 404 on read). Read state is `@NotAudited('personal
  read state, not school data')`.
- **Preferences (N13)**: effective = can't be turned off → on in the app; else the person's choice;
  else the school's default; else the type's. `GET` / `PUT /notifications/preferences` (`@SignedIn`,
  `@Audited('core.notification_preferences.update')`; `enabled: null` deletes the personal row) and
  `GET /settings/notifications` (`core.notifications.view`: System admin, HR manager) / `PUT`
  (`core.notifications.manage`: System admin; `@Audited('core.notification_settings.update')` — the
  school defaults and the retention keys, one entry through `SettingsService.setValues`, owner
  `notifications`). A switch's audit line is `<type>:<channel>`, before → after. Errors:
  `NOTIFICATION_TYPE_REQUIRED` (409), `CHANNEL_NOT_AVAILABLE` (409, anything but `in_app`), unknown
  type → 400. A person with the type off in the app gets no notification at all (GUESS).
- **Channels (N7)**: `NotificationChannelAdapter` (`key`, `available()`, how a delivery starts) in
  `channels.ts`: `InAppChannel` and `PushChannel` (live with the VAPID keys; below). Email / WhatsApp
  / SMS later = an adapter, a value in `NOTIFICATION_CHANNELS` and an after-commit sender — no module
  changes. Per-type switches exist for `NOTIFICATION_PREFERENCE_CHANNELS` only (`in_app`); push
  follows the type's in-app switch (`preferenceChannelOf`) — a `push` choice is 409
  `CHANNEL_NOT_AVAILABLE`.
- **Retention (N14)**: core settings `notifications.retention.readDays` / `resolvedDays` / `maxDays`
  (90 / 30 / 365, each 1–3650); the nightly `core.notifications.purge` (02:30, advisory lock) deletes
  what is past them, with items and deliveries. Not audited.
- **HR's reminders (N3, `modules/hr/reminders`).** The daily job `hr.reminders.daily` (07:00 school
  time, advisory lock) works out **today on the school's clock** (`schoolDayOf`), reads the timings
  (HR settings `hr.reminders.*`: contract 30 and 7 days, probation 7 days, lateness check day 25,
  payroll check day 28) and, **one `afterCommit.inTransaction` per type in turn**, the type's open
  items (`NotificationsService.openItems`) and HR's facts. The pure `reminders.pure.ts` decides what
  is due (today or overdue — a missed day is caught up once) and which open items no longer hold;
  those are resolved `done` (`resolve` with a `dedupeKey` for one reminder of a subject: the 30-day
  contract item when the 7-day one is sent), then the due ones are sent. Dedupe keys
  `contract_end:<employee>:<date>:<days>`, `probation_end:<employee>:<date>`,
  `lateness_missing:<month>`, `payroll_missing:<month>`, `payroll_unapproved:<month>`; contract items
  group per school day and window (`2027-05-01:30`). A check day past the month's end is its last
  day. HR's services resolve at the change too, in their own transactions (`HrRemindersService`): a
  moved contract / probation end, a deactivation, a saved lateness month, a created run, an
  approved run ("Approved by …"). Subjects: `employee` and `penalty` (N2) (scoped through `HrNotificationScopes` with
  HR's stage / team rule), `lateness_month`, `payroll_month`, `payroll_run` (whole-school: a scoped
  holder is never told).
- **Screens (N4, option A of `design/mockups/notifications.html`)** — `apps/web/src/core/notifications`:
  the **bell** beside the language switch in the shell (both the phone top bar and the desktop row
  draw one; `NotificationInbox` in `AppShell` holds their one state, so one poll), the unread count
  polled every 60 s while the tab is visible and on focus (`99+`), and the list — a popover anchored
  to the bell from 768px, a full-screen `Sheet` (`side="full"`) below — with All / Unread, the latest
  20, groups opening into their items, deep links (`linkHref`: `SCREENS` path + record + query),
  done rows and Mark all as read (`upTo` = the newest the list showed; on Unread the list is asked
  again at once, as after reading one there — a group being opened stays until the next load). A
  group's title counts its open items (`openCount`); all handled, `types.<key>.groupDone`. Sentences are drawn in
  `lib/text.ts` from the type key and values (names `{ en, ar }`, months, dates, money with its
  label); a single item reads from its own values. **My account → Notifications**
  (`/account/notifications`, `SCREENS.accountNotifications`; My account's routes are `account/(profile)`
  and `account/notifications`, each with its skeleton) is `TypeSwitchList`: one switch per type,
  grouped by module and category, required ones locked, each change saved at once and put back on
  failure, "Reset to school default" (`enabled: null`). **Settings → Notifications**
  (`modules/settings`, `SETTINGS_SECTION_ACCESS.notifications = 'core.notifications.view'`) is the
  same list for the defaults plus the reminder timing (HR rules: `PUT /hr/settings`,
  `hr.settings.edit`) and the retention; defaults and retention follow `core.notifications.manage`,
  so the HR manager sees them read-only. In-app only: no other channel appears in the UI.
- **HR's approvals (N2)** — `modules/hr/notifications/hr-notifications.service.ts`, called by the
  penalty and payroll services inside their own write's transaction (no `RequiresNew`).
  `hr.penalty.awaiting_approval` (subject `penalty` + its `employeeId`, dedupe `penalty:<id>`) on
  record; resolved `approved` / `cancelled` (pending only). `hr.payroll.ready_to_approve` (subject
  `payroll_run`, dedupe `payroll_ready:<month>:<calculatedAt>`) after create / recalculate with no
  pending penalty in the month, the previous one resolved `done` first; resolved `done` by a penalty
  recorded in the month, `approved` on approval ("still a draft" is the reminders'). Its `net` is
  per reader through `notify({ paramsFor })` — only for a holder of `hr.payroll.view` at `all` (R7);
  absent otherwise. `hr.payroll.returned_by_accounting` (subject `payroll_run`, dedupe
  `payroll_returned:<runId>:<returned at>`, one item per return, required — it can't be turned off)
  to the holders of `hr.payroll.approve` when Accounting returns an approved month (§10), sent in
  accounting's return transaction with the month and the reason (`{reason}` is isolated with
  FSI/PDI when the sentence is drawn, like any typed text); resolved `approved` when the run is
  approved again. A `penalty` subject is scoped by `HrNotificationScopes` with the employee rule,
  on the penalty's employee **as the employee is now** (a stage move takes it from the old stage's
  approver). The Penalties screen opens the
  linked penalty (`?penalty=<id>`: its month's list with `PenaltyDetailsDialog` over it; unknown or
  out of scope → not found).

### Installable app and push

The ERP installs as an app and sends Web Push alerts (owner, 2026-11-21; §11 → Push alerts;
`docs/business/recent-changes/2026-11-21-050-pwa-and-push.md`). Web: `apps/web/src/core/pwa`, the
service worker `apps/web/public/sw.js`. API: `core/notifications/push`, the icons in `core/settings`.

- **Manifest** — `GET /manifest.webmanifest?lang=en|ar` (a route handler, `app/manifest.webmanifest`),
  linked per language by the root layout: the school's name in that language and its logo's icons,
  from the public settings endpoint the shell uses (`getSchoolBranding`) — never a hard-coded school.
  `id` and `scope` `/`, `start_url` `/<lang>`, `display: standalone`, colours `APP_THEME` (the
  `--primary` / `--background` tokens; a test keeps them equal). The layout also sets the favicon,
  the Apple touch icon, `apple-mobile-web-app-capable` / `-title` / status bar, and `theme-color`.
- **Icons** — `GET /files/app-icon/<name>?v=<version>` (public, `FilesController`), `APP_ICONS`:
  192 and 512 (`any`: the logo on white), maskable 512 and the Apple touch icon 180 (the logo on a
  white disc in a teal square, inside the safe zone), favicon 32, and a generic white badge 96 for
  Android's status bar. `AppIconsService` draws each with **sharp once per logo** and keeps it in
  `uploads/app-icon/<version>-<name>`; later requests read the file. The version is a hash of the
  logo's URL (`appIconVersion`, shared: each upload has a new file name), so a new logo means new
  URLs; responses are `public, max-age=31536000, immutable` and a URL without `v` is a 404. No logo
  (or an unreadable one) → a generic mortarboard icon. Old versions' files are deleted when a new one
  is first drawn.
- **Service worker** (`/sw.js`, scope `/`, registered by `ServiceWorkerRegistrar` in the root
  layout, production builds only, `updateViaCache: 'none'`). **Pages (navigations) always come
  from the network** (navigation preload); only a failed fetch shows the cached offline page of the
  path's language (`/offline.html?lang=…`, a route handler with the school's name and its icon
  inlined — nothing personal, the one HTML it stores). **API calls, server actions and anything
  not a GET are never touched.** Cache-first only for content-hashed static files: `/_next/static/`
  (JS, CSS, fonts) and `/files/app-icon/…?v=` — at most 300 entries. CLAUDE.md rule 7's spirit:
  nothing per-user is ever stored. **Updates**: a changed `sw.js` installs in the background,
  `skipWaiting()`s, deletes old caches on activate and never `clients.claim()`s — open tabs keep
  working, the next load runs on it; since nothing it stores can go stale, there is no stale shell.
- **Push devices** — `push_subscriptions` (per user per browser: endpoint (unique), the browser's
  keys, browser / system from the user agent, the device's language, created / last used, revoked
  at and why — `removed`, `expired` (404 / 410), `replaced` (over `PUSH_DEVICES_MAX` = 20)).
  `GET /notifications/push-devices` (`{ available, publicKey, devices }`; a device carries an
  `endpointHash`, never its endpoint — the browser hashes its own to find "This device"),
  `POST /notifications/push-devices` (subscribe; https endpoints only in production),
  `POST /notifications/push-devices/unsubscribe` (`{ endpoint }`), `DELETE /notifications/push-devices/:id`
  — all `@SignedIn`, the person's own (another's id → 404). **Audited** (`core.push_device.add` /
  `.remove`): unlike read state (`@NotAudited`, personal), a device decides where the school's
  notifications (names, approvals waiting) are shown — the same reason per-type preferences are
  audited. Turning alerts on again on one's own active device (a language refresh) writes no entry.
- **Sending** — `notify()` adds a `push` delivery (`pending`) for a recipient who gets the type in
  the app and has an active device, and publishes the must-deliver `core.notification.push_requested`
  (`{ notificationId, recipientId }`) **in the change's transaction**; `PushNotificationListener`
  sends after the commit (outbox: retries, never blocks or fails the change). It reads the
  notification as the reader sees it **now** (`NotificationInbox.findVisible`, N11 — read, handled or
  no longer visible → nothing), writes the alert per device in its language (`pushMessageFor`: the
  bell's title and line, a group's count, the same deep link; **no money, no typed text** —
  `PUSH_HIDDEN_PARAMS`), and sends it through `PushSender` (`web-push` encrypts aes128gcm and signs
  VAPID; `fetch` with a 10 s timeout; TTL 1 day; `topic` = the notification, so a group's next alert
  replaces the last; urgency high for approvals). 404 / 410 → the device is revoked. Retried only
  when no device took it (429 / 5xx / timeout) — never a second copy to a device that got it.
- **VAPID keys** — env `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` /
  `https:`), all three or none (`vapidFrom`); none → push not available ("not set up on this
  server"). `pnpm run setup` generates a pair for a fresh clone; each environment has its own, never
  committed. Changing the pair invalidates every device (they must turn alerts on again).
- **Web** — My account → Notifications: `DeviceAlerts` above the per-type list (the switch, its
  states — `insecure`, `ios-install` (Safari on iPhone / iPad outside the Home Screen app),
  `unsupported`, `denied`, `not-configured` — and My devices); My account: `InstallApp` (the browser's
  `beforeinstallprompt`, kept by `install-prompt.ts`; the iOS steps; installed). Signing out
  (`forgetDeviceThenSubmit`) unsubscribes this browser first (≤ 2 s). Endpoints in
  `core/pwa/apis.ts`; the browser's abilities in `browser.ts` (tests stand in for any browser).
- **Needs https** (or `localhost`); iOS / iPadOS push only from the Home Screen app, 16.4+.

### Deliberate shortcuts

The core rules are standard modular-monolith practice: one front door per module, one-way
dependencies, no cycles, owner-only writes, events for side effects, heavy rules as pure tested
functions. In two places we are deliberately looser than the strict version. These are choices,
not mistakes:

| Our choice | Strict version | Why ours is fine here | Cost, and how to tighten later |
|---|---|---|---|
| Read other modules' tables directly | Only through the owner's API or a copied read model | One team, one database; saves a lot of code | A column change can break another module's query. Tests and review catch it. Move a hot spot behind a service if it keeps breaking |
| Fire-and-forget events stay in memory | Every event through the outbox | Only notices and cache refreshes are fire-and-forget; anything whose loss leaves data wrong or someone untold is must-deliver (outbox) | A crash between the commit and a fire-and-forget listener loses that side effect. Move the event to `MUST_DELIVER_EVENTS` if that ever matters |

The strict versions mainly pay off for systems that will be split into separate services, or that are
built by many teams. Neither applies here.

### HR module

The first module built, and the first demo for the client (payroll and penalties; details pending).

- **Placement:** right above `core`. HR depends on nothing but `core`, so it can be built, tested
  and demoed alone.
- **Employee ≠ user.** HR owns `employees`; `core` owns `users`. An employee can optionally be
  linked to a user account. Some staff (drivers, cleaners) never log in, and teachers are linked to
  classes and subjects later through academics.
- **Staff attendance lives in `hr`; student attendance lives in `attendance`.** Staff attendance
  feeds penalties and payroll; student attendance feeds parent alerts and reports. They change for
  different reasons, so they stay apart.
- **Payroll and penalties are heavy rules:** they go in HR's `domain/` folder as pure, unit-tested
  functions. Insurance and tax rules are confirmed with the school's accountant before they are
  built.
- **Known pressure point: payroll inputs from academics.** If teachers are paid for extra classes,
  substitutions or teaching load, payroll needs timetable data, which points upward. Handle it
  without a cycle, simplest first:
  1. **Read:** payroll reads teaching-load data from academics' tables (a read query, no code
     dependency).
  2. **Events:** academics emits `teaching.load.recorded`; HR stores what payroll needs in its own
     table.
  3. **Dependency inversion:** HR defines an interface ("extra paid hours for employee X this
     month"); academics implements and registers it.
- **Dashboard charts** (owner, 2026-11-21): `GET /hr/dashboard/analytics?months=6|12`
  (`hr.dashboard.view_analytics`), the query validated by the shared zod schema
  (`dashboardAnalyticsQuerySchema`, through `common/pipes/SchemaPipe`). The API works out every
  figure (`dashboard/analytics.pure.ts`, from aggregates in `DashboardAnalyticsRepository`, which
  also reads accounting's worked-out months — a read, never a write); each part follows its
  screen's permission and scope. The web draws them with small inline-SVG components
  (`modules/hr/dashboard/charts/`), no chart library.
- **Events HR publishes** (for higher modules to react): `hr.employee.hired`,
  `hr.employee.updated` (fire-and-forget), `hr.employee.deactivated` and `hr.payroll.approved`
  (must-deliver). Details: `docs/EVENTS.md`.

### Enforcing the module rules

These are enforced by tools that fail the build, not by memory. Set them up in the foundation,
before the first business module, so there are never old violations to clean up.

**1. Lint (fails in the editor and in CI).** Extends the house lint config, which already keeps
Prisma inside repositories and stops one module importing another's repository. Added boundary
rules (`eslint-plugin-boundaries` or `no-restricted-imports` patterns):

- A module imports another module **only through its `index.ts`**. Deep imports
  (`modules/students/repositories/...`, `modules/students/services/...`) are errors.
- Dependencies point downward only:
  - `modules/` may import `core/` and `common/`
  - `core/` may import `common/` but never `modules/`
  - `common/` imports neither `core/` nor `modules/`
- `packages/shared` imports no framework: no NestJS, React, Next.js or Prisma.
- The same rules apply to the frontend: `modules/` ↔ `index.ts` only; `core/` and `shared/` never
  import from `modules/`.
- The lint config's folder constants point at `src/modules/` (see `CLAUDE.md`).

**2. Dependency check in CI.** `dependency-cruiser` runs on every PR, backend and frontend:

- Fails on **circular dependencies**, between modules or inside one.
- Fails on any import that breaks the allowed direction (see Module order):
  `core` ← `hr` ← `academics` ← `students` ← the other business modules.
- Fails on imports of another module's internals (a second check behind the lint rules, in case a
  rule is disabled locally).
- Generates the module dependency graph as a CI artifact, for reviews and onboarding.

**3. NestJS module encapsulation.** Each module's `@Module({ exports: [...] })` lists only its
public services. Repositories, domain classes and internal services are never exported. If one
module tries to inject another module's repository, the app refuses to start, so tests and CI fail
too.

**Table ownership: "read anything, write only your own tables, through your own repository."**

- **Writes:** only the owning module writes its tables. This is already enforced because Prisma
  calls live only in repositories and repositories are never exported. To change another module's
  data, call that module's service.
- **Reads:** a repository may `include` or join other modules' tables **for reading**. A fees list
  showing student name and class is a normal query. Reports are read queries in the module that
  owns the report.
- **Cross-module writes:** call the other module's service. Use an event for side effects that can
  happen afterwards (notifications, SMS).
- **Lookup tables** (academic years, grades, classes, subjects) belong to `academics`. Everyone
  references them; only `academics` changes them. **Stages** belong to `core` (school structure),
  because HR needs them and sits below academics.
- **One `schema.prisma` file**, grouped by module under comment headers
  (`// ── fees ──`), so ownership is visible without splitting files. One migration history.
- **Migration conflicts:** before merging a PR with a migration, rebase on the latest `dev`. If
  `dev` has a newer migration, delete yours and regenerate it. One migration per PR; never edit a
  merged migration.

**4. CODEOWNERS and branch protection.** Changes to the lint config, the dependency-cruiser config,
`core/`, `common/`, `shared/`, `packages/` and the schema need the lead's approval, so nobody can
quietly loosen a rule.

### Where shared code goes

- **`core/`** — shared *business* foundation every module relies on (auth, users, roles,
  settings, feature flags, audit, notifications, files). Real modules, with tables.
- **`common/`** (backend) / **`shared/`** (frontend) — shared *technical* code with no business
  meaning (base repository, guards, decorators, filters, UI kit, API client, formatting).
- **Everything else stays in its module.** Code moves to `common/`/`shared/` only when a second
  module actually needs it.
- **`packages/shared`** — the only code shared by api and web.

### Search

One fold and one matching rule for every search, in the database and in memory (owner, 2026-11-22),
so "احمد" finds "أحمد", "عبدالرحمن" finds "عبد الرحمن" and "mona" finds "Moná".

- **The fold.** `searchKey` (`packages/shared/src/search.ts`) and the database's IMMUTABLE
  `search_fold(text)` (migration `20261122100000_search_fold`) do the same thing: NFD, drop Latin
  combining accents (every accented Latin letter that decomposes; ø, æ, ł, đ, ß, ı stay — no
  `unaccent` extension), Arabic marks U+064B–U+0670 and the tatweel; fold أ إ آ ٱ → ا, ى → ي,
  ة → ه, ؤ → و, ئ → ي; lower-case; every whitespace-like character (NBSP, tabs, newlines, the U+2000
  spaces) becomes a space and zero-width ones (U+200B–U+200F, U+FEFF) are dropped; runs collapse,
  ends are trimmed. The API e2e spec `search-fold.e2e-spec.ts` runs the shared `SEARCH_FIXTURE`
  through both and fails if they differ — change both, or neither.
- **The database keeps the search text itself.** Each searched table has two
  `GENERATED ALWAYS … STORED` columns: `search_text` = `search_fold` of its searched columns joined
  by spaces (employees: code and both names; users: name and email; roles, stages, departments, job
  titles and violations: both names; audit entries: the record's name in both languages; payroll and
  accounting payroll lines: code, both names, and national id on HR's), and `search_compact` = the
  same with every space removed. Each has a `pg_trgm` GIN index, so a contains search is indexed.
  Prisma declares them `String? @default(dbgenerated())`; the client omits them from every row
  (`SEARCH_OMIT` in `database.service.ts`) and the app never writes them (a unit test scans for it).
- **The matching rule** (`searchWhere` in `apps/api/src/common/repositories/search.ts`): fold the
  query with `searchKey` and split it into words; a row matches when **every word** is contained in
  `search_text` (any order, partial words), **or** the query without spaces is contained in
  `search_compact` (joined and split names, both directions). `%`, `_` and `\` are literal. It is a
  Prisma where fragment, nested under a relation for a search through one (penalties: the
  employee's or the violation's), and goes through `BaseRepository.findAllWithPagination`'s
  `search`; paging, totals and order stay in the same query. `searchSql` is the raw-SQL twin for an
  expression with no columns (the Activity people picker's latest name — a handful of rows, no
  index). Code-only look-ups (Activity finding records by employee code) use `codeContains`.
- **In memory** (a month's lateness, the penalty catalogue, a picker's own short option list),
  `matchesSearch` applies the same rule to the same fold.

## Repository layout

```
school-erp/
├── apps/
│   ├── api/                          ← NestJS
│   └── web/                          ← Next.js
├── packages/
│   └── shared/                       ← zod schemas, API types, keys, enums, locales, tokens
├── deploy/
│   ├── docker/                       ← Dockerfile.api, Dockerfile.web, production compose
│   ├── schools/                      ← _template.env, <school-slug>.env (not in the image)
│   └── scripts/                      ← new-school, deploy-school, deploy-all, backup-school
├── docs/
│   ├── PROJECT.md  ARCHITECTURE.md  CONVENTIONS.md
│   ├── BUSINESS_LOGIC.md             ← short index
│   ├── business/                     ← one file per business section
│   ├── DESIGN.md
│   ├── specs/
│   └── BUILD_LOG.md
├── .github/
│   ├── workflows/                    ← CI: lint, typecheck, test, build image
│   ├── CODEOWNERS
│   └── pull_request_template.md
├── docker-compose.yml                ← local development
├── CLAUDE.md
└── package.json                      ← workspaces
```

### Backend — `apps/api`

```
apps/api/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed/                         ← default settings, default roles
├── src/
│   ├── main.ts
│   ├── app.module.ts                 ← loads core + modules (optional ones by flag)
│   ├── config/                       ← env loading + validation (only place process.env is read)
│   ├── database/                     ← DatabaseService (Prisma)
│   ├── common/                       ← technical, no business
│   │   ├── repositories/             ← base.repository.ts
│   │   ├── interfaces/
│   │   ├── decorators/               ← @CurrentUser, @Public
│   │   ├── guards/                   ← JWT auth (the permission guard is core/permissions)
│   │   ├── filters/  interceptors/  pipes/
│   │   ├── errors/
│   │   ├── i18n/                     ← server messages (en, ar)
│   │   └── utils/                    ← pure: dates, money, numbers
│   ├── core/                         ← business foundation
│   │   ├── auth/  users/  roles/  sign-in-limit/
│   │   ├── settings/  feature-flags/  school-structure/
│   │   ├── audit/  jobs/  events/  notifications/  files/
│   │   └── core.module.ts
│   └── modules/
│       ├── hr/                       ← employees, departments, contracts, staff attendance,
│       │                               leave, penalties, payroll (built first)
│       ├── academics/                ← years, terms, grades, classes, subjects, teacher assignments
│       ├── students/                 ← students, guardians, enrollment
│       ├── admissions/
│       ├── attendance/               ← student attendance (staff attendance is in hr)
│       ├── fees/
│       ├── exams/                    ← exams, marks, report cards
│       ├── communication/            ← announcements, templates (uses core/notifications)
│       └── transport/                ← optional
└── test/e2e/
```

Inside a module (`modules/fees/`):

```
modules/fees/
├── fees.module.ts
├── index.ts                          ← public API: exports the services other modules may use
├── controllers/                      ← route, DTO, guard, delegate — no Prisma, no rules
├── services/                         ← business rules
├── domain/                           ← pure rules (fees + exams only)
├── interfaces/                       ← IFeePlansRepository, IPaymentsRepository
├── repositories/                     ← every Prisma call, extends BaseRepository
├── dto/                              ← class-validator request contracts
├── events/                           ← its listeners (events are published through core/events)
└── __tests__/
```

No `entities/` folder: row types come from `@prisma/client`.

### Frontend — `apps/web`

```
apps/web/src/
├── app/                              ← routes only, thin
│   └── [locale]/                     ← en | ar; layout sets dir and loads branding
│       ├── (auth)/login/  set-password/   ← sign-in; the forced new password (P3)
│       └── (dashboard)/              ← sidebar + topbar layout
│           ├── page.tsx
│           ├── students/  fees/  attendance/  exams/  settings/  activity/
│           └── transport/            ← hidden when the flag is off
├── lib/                              ← skill fetch wrapper
│   ├── api.ts                        ← apiFetch (server only)
│   ├── handleResponse.ts
│   └── callApi.ts
├── core/                             ← shared business pieces
│   ├── auth/                         ← session, current user, <Can permission="…">
│   ├── settings/                     ← settings, feature flags, branding → CSS variables
│   ├── navigation/                   ← sidebar menu, filtered by flags + permissions
│   ├── employees/                    ← EmployeeLink: every employee name opens the profile
│   │                                   (plain text without hr.employees.view)
│   ├── audit/                        ← activity log pieces: apis.ts (GET /audit…), timeline,
│   │                                   entry text (sentences, field labels), record History
│   ├── notifications/                ← the bell and its list, the per-type switch list,
│   │                                   My account → Notifications (§11, N4)
│   ├── pwa/                          ← the installable app: manifest, offline page, service worker
│   │                                   registration, Install app, Alerts on this device (§11)
│   └── academic-year/                ← year switcher, current-year context
├── shared/                           ← shared technical pieces
│   ├── components/ui/                ← shadcn kit, plus PersonAvatar: the one avatar for every
│   │                                   person (employees, and users through their linked employee)
│   ├── components/layout/            ← Sidebar, Topbar, PageHeader, EmptyState
│   ├── components/form/              ← fields for react-hook-form + zod
│   ├── hooks/
│   ├── utils/                        ← formatting: dates, EGP, numbers per locale
│   └── providers/
├── store/                            ← Zustand stores
├── modules/
│   ├── hr/  academics/  students/  admissions/  attendance/
│   ├── fees/  exams/  communication/  transport/
│   ├── accounting/                   ← Payroll (HR's approved months + taxes) and Payroll taxes (§10)
│   ├── settings/                     ← the Settings screen
│   ├── access/                       ← Users, Roles, My account (P3)
│   └── activity/                     ← the Activity screen (filters panel, today's counts, paging)
└── middleware.ts                     ← locale + auth routing
```

Inside a module (`modules/fees/`):

```
modules/fees/
├── index.ts                          ← public exports (pages, pickers other modules may use)
├── apis.ts                           ← "use server" endpoints, built on lib/api.ts
├── pages/                            ← page components rendered by app/ routes
├── components/
├── schemas/                          ← zod (or imported from packages/shared)
├── i18n/                             ← en.json, ar.json (identical keys)
└── types.ts
```

Frontend rules:

- Route files only render the module's page component.
- Modules import each other only through `index.ts`.
- Hide what is switched off (feature flags) and what the user may not do (`<Can>`); the backend
  still enforces both.
- RTL: logical classes only (`ms-`/`me-`, `start`/`end`); transforms and chevrons get explicit
  `[dir="rtl"]` overrides.
- Counts in text use plural forms: the message is `{ "zero", "one", "two", "few", "many", "other" }`
  (the same keys in `en` and `ar`; English only reads `one` / `other`) and `t(key, { count })` picks
  the form by the language's plural rules — "1 entry", "سجلان", "12 سجلًا".
- Small controls reach 44 × 44px on touch screens and phone widths with the `tap-target` utility (an
  invisible hit area; desktop density unchanged). Search boxes never show the browser's own "×".
- Every list with a search or filters has `ClearFilters` (`shared/components/form/filter-controls`,
  owner 2026-11-18): "Clear filters · n" at the toolbar's inline end and in its "No results" state,
  shown only while something narrows the list; one click resets the search, every filter and the
  page in one URL update and brings the list's top back into view. A period (a month) is not a filter.
- **Lists are the server's (owner, 2026-11-21; `docs/CONVENTIONS.md` → Lists).** The API pages,
  searches, filters, orders and totals every list; the browser shows the page it got. Plain lists
  answer `data` (the page) + `meta` (`total`, `page`, `limit`); a list whose screen also shows
  figures over the whole filtered set answers `ListPage` as `data` — `{ items, total, page, limit }`
  plus those figures: the accounting month's lines (`GET /accounting/payroll/:month/lines?search&
  insurance&page&limit` with `totals`, the statement's subtotals per group), the month's lateness
  (`GET /hr/lateness?month&search&page` with the month's `totals`), and a payroll run's lines
  (`GET /hr/payroll-runs/:id?…&page&limit`: `lines` + `linesPage`). Rows the service works out in
  memory (lateness days from today's rule) are paged with `pageOf` and searched with the shared
  matcher (Arabic letter variants folded); rows read straight from a table page in their repository.
  Lookup lists (stages, departments, job titles) answer the whole list without `page`/`limit`/
  `search`/`ids` and a page with them; pickers always ask for a page (`useServerOptions`, 20 a
  page). Print and Excel read every line from the API (pages of 500), not the page on screen.
  `DataTable` refuses more rows than its page size outside production (`assertServerPage`), and
  `src/test/server-lists.guard.test.ts` scans the app for client-side list idioms.
- Branding (name, logo, colours) loads from settings into CSS variables — for the shell, the
  dashboard and the tab titles always from `GET /settings/school/public` (`getSchoolBranding`), so a
  user without `core.settings.view` sees the school's name too; only the Settings screen reads
  `GET /settings/school`.

#### Skeletons match their screens (`data-skeleton-block`)

Every skeleton has the shape of the screen it stands in for, and a change to a component that
doesn't update its skeleton fails CI (owner, 2026-11-18).

- **Build skeletons from the screen itself.** A list or table screen takes `rows={undefined}` (or
  `entries`, `roles`…) for its first load and draws its own header, toolbar, filters, count, skeleton
  rows and pagination — the route's `loading.tsx` renders that component (`EmployeesList`,
  `UsersList`, `RolesList`, `ActivityView`, `PenaltiesList`, `LatenessBoard`, `RunsList`). A form
  renders itself under `SkeletonMask` with empty values (`EmployeePageSkeleton`, the settings
  forms). Hand-drawn skeletons are the exception and use the screen's own frames (`PageHeader`,
  `FormCard`, `DetailsCard`, `StatTile`, the payslip card).
- **Payroll tables: page size and sticky header** (owner, 2026-11-19). Every payroll table passes
  `pagination.pageSizes = PAYROLL_PAGINATION.pageSizes` (10–500) with `onLimitChange` (a "Rows per
  page" picker in `Pagination`) and `scrollHeight="screen"` (the table view scrolls inside a box of
  about the screen's height with sticky column names; print is unaffected). A table drawn as cards
  on every width (`cardsBelow="always"`, the Approved payroll month) caps its cards the same way from
  `md` up — the search above and the pagination below stay in sight — while a phone lets them flow
  with the page, since a scroll box inside a scrolling page is worse on a phone (owner,
  2026-11-21); a table's phone cards stay uncapped. The API's
  payroll lists (`GET /hr/payroll-runs`, `/hr/employees/:id/payroll-lines`, `/accounting/payroll`)
  take `PayrollPaginationQueryDto` (`limit` ≤ 500); every other list keeps `limit` ≤ 100.
- **Mark the main blocks.** The screen and its skeleton carry the same `data-skeleton-block="<name>"`
  on their main content blocks. The shared pieces already do: `PageHeader` (`header`, and inside it
  `header-breadcrumbs`, `header-status` and `header-actions` — so a skeleton missing the status pill
  or the buttons row, or drawing it at another width, fails; owner, 2026-11-21: draw them with
  `SkeletonPill` / `SkeletonButton` around the loaded wording and icon, which lays it out invisibly
  so the bar is as wide in every language, and trace the state most people open: a pending
  approved month, an approved run, an active employee), `DataTable`
  (`table`, `table-toolbar`, `table-head`, `table-row`, `table-card`, and with a `footer` totals row
  `table-foot` / `table-card-foot`), `Pagination`
  (`pagination`), `StatTile` (`tile`), `FormActionBar` (`form-actions`), `SectionPanel`
  (`section-panel`), `FormCard` (`form-card`); screens mark their own cards, panels and filters.
  Two optional attributes: `data-skeleton-each` on a list's items (a run of them counts once, as
  tall as its shortest item — how many arrive and whose name wraps is data), and
  `data-skeleton-measure="width"` on a block whose height follows the data (a table, the timeline);
  everything else must match (the History tab's pagination too, since T28 gives every record
  entries). A `DataTable` whose phone cards grow
  with their text passes `cardHeightsVary` (penalties: long violation names). A `DataTable` whose
  very presence is data — the payroll taxes statement's Insured / Not insured groups, either of
  which can be empty (an empty state) one month — passes `skeletonBlocks={false}` and is measured
  as part of the block around it (its pagination too, which an empty group doesn't draw).
- **Text that wraps is drawn as its own text.** A bar can't wrap, so where a loaded line usually
  wraps (a header description, a tile's sub line, the History sentence) the skeleton renders the
  same sentence — worded with typical values — through `SkeletonProse` (transparent text on a bar
  per line), and `StatTile` lays a typical figure out invisibly under its bar (`placeholder`).
- **The check:** `apps/web/e2e/23-skeletons.spec.ts` (desktop) and `23-skeletons-phone.spec.ts`
  (phone), in English and Arabic, one pass per screen (`e2e/support/skeletons.ts`). It opens the
  screen with JavaScript off — the server streams the skeleton first and the real content stays
  hidden — reads every visible block, then opens it normally and reads them again. Same blocks, same
  order, each width and height within ±8px (or ±5% above 160px), else it fails with the list of
  differences. A new screen with a skeleton is added to `SKELETON_SCREENS` and its `loading.tsx`
  folder to `SKELETON_ROUTES` (`e2e/support/skeleton-screens.ts`); the unit guard
  `src/test/skeleton-coverage.guard.test.ts` fails on any `loading.tsx` not listed there (the
  Approved payroll pages of #171 were missed until 2026-11-21).
- **A nested route's skeleton is its parent boundary's on a hard load.** A `loading.tsx` wraps every
  route below it, and a first visit shows the outermost one. So lists live in a `(list)` route group
  (`employees/(list)`, `payroll/(list)`, `users/(list)`, `roles/(list)`) to keep their skeleton off
  `new` and `[id]`, and `employees/[id]/loading.tsx` draws the page being opened (the edit form, or
  the profile over the opened tab's skeleton).

#### Error pages

Not found and error screens (owner's pick: option 2 of `design/mockups/error-pages.html` on the
`design` branch, "Big number, light art"; 2026-11-23). The art is fixed inline SVG
(`shared/components/errors/error-art.tsx`): a soft-3D teal "404" whose 0 is a sunflower ball, and a
calm sunflower "!" in a ring. Its float and sparkle stop under `prefers-reduced-motion`. Every screen
moves focus to its heading and sets the tab's title. The words live in `ui.errorPages` (EN/AR).

| What happened | File | Screen |
|---|---|---|
| A wrong address under `/<locale>/`, or with an extension (`/x.php` → `/en/x.php`) | `app/[locale]/[...missing]/page.tsx` → `app/[locale]/not-found.tsx` | Outside the shell: "Page not found", **404 status**. Back to the dashboard when signed in, Sign in when not (`hasLiveSession`, the proxy's own token check, with no API call) |
| An unknown `/api/…` (route handlers, never pages) | `app/api/[...missing]/route.ts` | A JSON 404 in the API's envelope (`{ success: false, error: 'NOT_FOUND' }`), `no-store` |
| A missing, out-of-scope or forbidden record or page | `app/[locale]/(dashboard)/not-found.tsx` | In the shell: "We couldn't find that page", the same words for all three. Status 200 once the page has streamed (Next can't change it then) |
| A dashboard page fails | `app/[locale]/(dashboard)/error.tsx` → `RouteError` | In the shell: "Something went wrong", Try again (`router.refresh()` + `reset()`), Back to the dashboard, the **reference code** with Copy. One boundary for every section |
| The sign-in pages fail | `app/[locale]/(auth)/error.tsx` | The same screen, without Back to the dashboard |
| The root layout fails | `app/global-error.tsx` | Standalone: its own `<html lang dir>` (from the first path segment), system fonts, one inline SVG, inline styles, a reload button. Nothing of the app's CSS, fonts or providers |

- **Signed out on an unknown section** (`/en/nope`): the proxy lets it through to the 404 (with Sign
  in) instead of sending the visitor to sign in. Known sections still go to sign in, so a deeper wrong
  address there (`/en/employees/x/y`) reveals nothing. The sections are `APP_SECTIONS`
  (`core/auth/routes.ts`). `routes.test.ts` fails closed: it knows every route group under
  `app/[locale]`, and each group's every top-level folder must be in `APP_SECTIONS` or in its public
  allow-list with a reason. A new group or section fails until someone decides. The smoke-only `e2e`
  section is in the list only in an e2e build. **No second redirect in the dashboard layout:** a null
  user there also means the API is unreachable, and sending that to sign in would loop (the proxy
  sends a live token back from sign-in to the dashboard); a refused session already goes through
  `apiFetch`'s 401 → refresh → sign in.
- **The reference code is Next's `error.digest`.** For an error thrown while rendering on the
  server, Next sends the browser only a digest, never the message. The web server logs the error
  under the same digest twice: Next's own log (the stack, then `digest: '<code>'`), and one JSON
  line from `src/instrumentation.ts` (`onRequestError`):
  `{"level":"error","msg":"web request error","digest":"<code>","method":…,"path":…,"route":…,"type":…}`.
  The path is logged without its query, and the message isn't repeated (Next's own line has it). **To find what a person quoted:** on the server,
  `docker logs <the school's web container> 2>&1 | grep '<code>'` (in Coolify, the web app's
  **Logs** tab, searched for the code). An error thrown in the browser has no digest. It gets a short
  random code (`C-XXXXXX`), which is logged to the browser console with the error
  (`[error-ref C-XXXXXX]`), so only a screenshot of the console ties it to the error.
- **Under the CSP:** every one of these pages is dynamic, so Next's scripts carry the nonce.
  `global-error` uses a `<style>` element and inline style attributes (`style-src 'unsafe-inline'`)
  and no inline event-handler attributes. Pages are never cached (`private, no-store`). The proxy
  sees every address but Next's internals, `/api/…`, `/files/…` and the app's own files with an
  extension (`favicon.ico`, `sw.js`, `manifest.webmanifest`, `offline.html`), so a missing `/x.php` gets
  the nonce CSP and its language. A static CSP for the skipped paths wouldn't work for pages: Next's
  inline bootstrap scripts need the per-response nonce. So no page is served there: `/api/…` is
  JSON (above), `/files/…` is the API's, `/_next/…` is Next's own.
- **No `global-not-found`:** `[locale]` matches every first segment and `[...missing]` every
  rest, so no address is ever unmatched and Next never uses one. A `notFound()` from the root layout
  itself (a first segment that isn't a language on a path the proxy skips, in practice only
  `/favicon.ico`) is Next's built-in 404; `experimental.globalNotFound` didn't change that (CI,
  #267), so it was removed.
- **Smoke-only pages** (`page.e2e.tsx`): `(dashboard)/e2e/server-error` (throws in the shell) and
  `(e2e)/e2e-root-error` (throws outside every boundary, so it reaches `global-error`). They are
  pages only when the build has `NEXT_PUBLIC_E2E_HOOKS=true` (`next.config.ts` → `pageExtensions`,
  set by `scripts/smoke.sh`). In every other build the files aren't routes, and the addresses are a
  plain 404. Checked by `e2e/35-error-pages*.spec.ts`.

### `packages/shared`

Plain TypeScript, no framework imports.

- Permission keys (`fees.refund`), setting keys and their value types, module/flag keys
- Default roles, shared enums (attendance status, payment method, student status…)
- zod schemas and API types (written at the contract stage)
- Locale files and design tokens

A change here affects both apps at once, so it is lead-reviewed.
