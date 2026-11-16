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
accounting        ← journal entries from approved payroll and fee payments (Planned)
```

- **Stages** (KG, Primary, Preparatory) are a list in `core/` ("school structure"). HR uses them now
  and academics and students later, so they sit below all three.
- **Settings ownership:** `core/settings` holds school-wide values (identity, hours, language). Each
  module owns its own rule settings (HR: lateness, payroll, penalty catalogue). The one Settings
  screen shows a section per module.
- **Accounting (Planned)** sits at the top. It listens to `payroll.approved` and `payment.recorded`
  and creates its own entries. No module below depends on it.

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

- Emit **after the write is committed**. Inside a `$transaction`, emit after it commits, never
  inside it. The foundation provides a helper for this.
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
│   │   ├── decorators/               ← @CurrentUser, @RequirePermission, @Public
│   │   ├── guards/                   ← auth, permission, feature-flag
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
│       ├── (auth)/login/  reset-password/
│       └── (dashboard)/              ← sidebar + topbar layout
│           ├── page.tsx
│           ├── students/  fees/  attendance/  exams/  settings/
│           └── transport/            ← hidden when the flag is off
├── lib/                              ← skill fetch wrapper
│   ├── api.ts                        ← apiFetch (server only)
│   ├── handleResponse.ts
│   └── callApi.ts
├── core/                             ← shared business pieces
│   ├── auth/                         ← session, current user, <Can permission="…">
│   ├── settings/                     ← settings, feature flags, branding → CSS variables
│   ├── navigation/                   ← sidebar menu, filtered by flags + permissions
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
- Branding (name, logo, colours) loads from settings into CSS variables.

### `packages/shared`

Plain TypeScript, no framework imports.

- Permission keys (`fees.refund`), setting keys and their value types, module/flag keys
- Default roles, shared enums (attendance status, payment method, student status…)
- zod schemas and API types (written at the contract stage)
- Locale files and design tokens

A change here affects both apps at once, so it is lead-reviewed.
