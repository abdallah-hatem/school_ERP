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
3. **Side effects go through events** (NestJS `EventEmitter`): fees emits `payment.recorded`,
   communication sends the SMS.
4. **Optional modules and features** (transport, library, payroll, penalties…) register themselves
   and are switched on by feature flag.
5. **No circular dependencies.** Dependencies point one way, down the module order below. If two
   modules need each other, the shared part moves lower.
6. **Full domain modelling only where the rules are heavy: `fees`, `exams`, and HR's payroll and
   penalties.** A `domain/` folder of pure functions (discounts, instalments, grade calculation,
   salary, insurance, tax, penalty rules), no Nest or Prisma inside, heavily unit tested.

### Module order

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
- **Accounting** sits at the top. It listens to `payroll.approved` (and later `payment.recorded`)
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

```ts
// hr
this.events.emit('employee.deactivated', { employeeId, at: new Date() });

// academics
@OnEvent('employee.deactivated')
async handle(e: EmployeeDeactivatedEvent) { await this.assignments.unassignAll(e.employeeId); }
```

- Emit **after the write is committed**. Inside a transaction, emit after it commits, never
  inside it: `AfterCommit.run(() => this.events.emit(...))` (see Transactions and the audit log).
- Names: `<module>.<thing>.<past-tense>`. Payload types live in `packages/shared`.
- Listeners are **idempotent** (safe to run twice) and log their failures.
- Events are in memory: fine for notifications and side effects. Side effects that must never be
  lost (invoices, payroll entries) get an **outbox** table when needed (see below).

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
  move a repository over when its writes must be audited (T28 / T29 move HR's).
- Never pass options to a nested `withTransaction`; only the request transaction sets them.
- **After-commit work** (events): `AfterCommit.run(fn)` queues `fn` until the open request
  transaction commits (dropped on rollback), or runs it at once when none is open.

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
  those older entries' Arabic names).
- Who (id + name snapshot), IP, user agent and request id come from the request (D4). `actor` is
  passed only where the request has no user yet (a successful sign-in) or none applies (`null`).
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
  (`modules/activity`) and each employee's **History** tab, built on `core/audit` in the web app;
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
  for real changes only; nothing records history from it. No outbox: the history row is core's own
  table written in the same transaction, and no other module needs the event to arrive.
- **Dates** on the audit screens are read in the school's time zone (`SCHOOL_TIME_ZONE`, Cairo, in
  `core/audit/lib/time.ts`): day headers, times and the date filter's day edges. Calendars start the
  week on Sunday in both languages (the school's working week, `WEEK_STARTS_ON`).
- **Change lines** (`changeRows`, `core/audit/lib/entry-text.ts`): a list item edited in place
  (`{ nameEn, nameAr, isActive, sortOrder }` before and after, same id) shows one line per changed
  part — "Violation · Name (Arabic)" — never "Strike → Strike"; a different item picked stays one line.
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
  from then on they are data. Built-in roles can be edited (names, permissions) but not deleted.
  The **System admin always holds every key** with scope `all`, whatever its rows say — a key added
  later reaches it without a migration, and its permission list can't be edited (no lock-out).
- **Union and scopes.** A user's permissions are the union of their roles' (edge case 2). Each grant
  has a **scope**: `all`, `own_stage` (the user's linked employee's stage), `own_team` (employees
  whose direct manager is the user's linked employee), `self`. Per key the widest scope wins, in
  that order (`widerScope` in shared; `own_stage` counts as wider than `own_team`).
- **Per request.** `PermissionsService` reads the user's roles once per request and caches them in
  the request context (CLS), so a change to a role or to a user's roles applies from the next
  request, with no new sign-in (edge case 7).
- **`scopeFor(user, key)`** (same service, exported from `core/permissions`) returns
  `{ scope, employeeId, stageId }` — the widest scope the user holds `key` with, plus their linked
  employee and its stage — or `null` when they don't hold it. The module that owns the data applies
  it in its repository query; a scoped user with no linked employee matches no rows. Core only
  answers the question.
- **Scopes in HR (P4).** `modules/hr/access`: `employee-scope.pure.ts` turns a `UserScope` into
  rows (`own_stage` → `stageId`, `own_team` → `managerId`, `self` → `id`, not held or unlinked →
  none) as a Prisma filter (`employeeWhere`) or a check (`inScope`); `HrAccessService` reads the
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
  `employees.user_id` was copied into it by the migration and was dropped in P4.
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
- Every user and role write is `@Audited` (`core.user.*`, `core.role.*`); passwords are never in the
  log (the entry says only that one was set or changed).
- Area order inside core: `audit` ← `permissions` ← `roles` ← `users` ← `auth`. `core/audit` reads
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

### Deliberate shortcuts

The core rules are standard modular-monolith practice: one front door per module, one-way
dependencies, no cycles, owner-only writes, events for side effects, heavy rules as pure tested
functions. In two places we are deliberately looser than the strict version. These are choices,
not mistakes:

| Our choice | Strict version | Why ours is fine here | Cost, and how to tighten later |
|---|---|---|---|
| Read other modules' tables directly | Only through the owner's API or a copied read model | One team, one database; saves a lot of code | A column change can break another module's query. Tests and review catch it. Move a hot spot behind a service if it keeps breaking |
| In-memory events, no outbox yet | Outbox table, so no event is ever lost | Fine for notifications; simpler to start | A crash between write and event loses the side effect. Add an outbox for critical events when needed |

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
- **Events HR emits** (for higher modules to react): `employee.hired`, `employee.deactivated`,
  `employee.updated`.

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
│   │   ├── auth/  users/  roles/
│   │   ├── settings/  feature-flags/  school-structure/
│   │   ├── audit/  notifications/  files/
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
├── events/                           ← emitted events + listeners/
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
│   └── academic-year/                ← year switcher, current-year context
├── shared/                           ← shared technical pieces
│   ├── components/ui/                ← shadcn kit
│   ├── components/layout/            ← Sidebar, Topbar, PageHeader, EmptyState
│   ├── components/form/              ← fields for react-hook-form + zod
│   ├── hooks/
│   ├── utils/                        ← formatting: dates, EGP, numbers per locale
│   └── providers/
├── store/                            ← Zustand stores
├── modules/
│   ├── hr/  academics/  students/  admissions/  attendance/
│   ├── fees/  exams/  communication/  transport/
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
- Branding (name, logo, colours) loads from settings into CSS variables.

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
- **Mark the main blocks.** The screen and its skeleton carry the same `data-skeleton-block="<name>"`
  on their main content blocks. The shared pieces already do: `PageHeader` (`header`), `DataTable`
  (`table`, `table-toolbar`, `table-head`, `table-row`, `table-card`), `Pagination`
  (`pagination`), `StatTile` (`tile`), `FormActionBar` (`form-actions`), `SectionPanel`
  (`section-panel`), `FormCard` (`form-card`); screens mark their own cards, panels and filters.
  Three optional attributes: `data-skeleton-each` on a list's items (a run of them counts once, as
  tall as its shortest item — how many arrive and whose name wraps is data),
  `data-skeleton-measure="width"` on a block whose height follows the data (a table, the timeline),
  and `data-skeleton-optional` around a block that exists only with data (the History tab's
  pagination) — use it sparingly; everything else must match. A `DataTable` whose phone cards grow
  with their text passes `cardHeightsVary` (penalties: long violation names).
- **Text that wraps is drawn as its own text.** A bar can't wrap, so where a loaded line usually
  wraps (a header description, a tile's sub line, the History sentence) the skeleton renders the
  same sentence — worded with typical values — through `SkeletonProse` (transparent text on a bar
  per line), and `StatTile` lays a typical figure out invisibly under its bar (`placeholder`).
- **The check:** `apps/web/e2e/23-skeletons.spec.ts` (desktop) and `23-skeletons-phone.spec.ts`
  (phone), in English and Arabic, one pass per screen (`e2e/support/skeletons.ts`). It opens the
  screen with JavaScript off — the server streams the skeleton first and the real content stays
  hidden — reads every visible block, then opens it normally and reads them again. Same blocks, same
  order, each width and height within ±8px (or ±5% above 160px), else it fails with the list of
  differences. A new screen with a skeleton is added to `SKELETON_SCREENS` there.
- **A nested route's skeleton is its parent boundary's on a hard load.** A `loading.tsx` wraps every
  route below it, and a first visit shows the outermost one. So lists live in a `(list)` route group
  (`employees/(list)`, `payroll/(list)`, `users/(list)`, `roles/(list)`) to keep their skeleton off
  `new` and `[id]`, and `employees/[id]/loading.tsx` draws the page being opened (the edit form, or
  the profile over the opened tab's skeleton).

### `packages/shared`

Plain TypeScript, no framework imports.

- Permission keys (`fees.refund`), setting keys and their value types, module/flag keys
- Default roles, shared enums (attendance status, payment method, student status…)
- zod schemas and API types (written at the contract stage)
- Locale files and design tokens

A change here affects both apps at once, so it is lead-reviewed.
