# Plan — Foundation + HR demo (2026-11-17)

Spec: `docs/specs/2026-11-17-hr-demo.md` (with the contract). Business: `docs/BUSINESS_LOGIC.md` §1–§8.
Each task runs on its own `feature/<name>` branch from `dev`, in a background agent with its own
worktree. One task, one commit, one PR into `dev`. Classes decide tests (`logic` / `ui` / `surface`).

**Collision rule:** the whole Prisma schema, the shared enums and keys, and the module skeletons are
created once in T1. Later tasks only add code inside their own folders, register their module
(additive), and add their own locale namespace files. That is what lets waves run in parallel.

## Waves

| Wave | Tasks (parallel inside a wave) | Depends on |
|---|---|---|
| 1 | T1 | — |
| 2 | T2 auth · T3 design + shell · T4 core settings · T5 employees · T6 HR rules + domain | T1 |
| 3 | T7 penalties · T8 lateness · T10 settings screen · T11 employees screens | T5, T6 / T5, T6 / T3, T4, T6 / T3, T5 |
| 4 | T9 payroll · T12 penalties screen · T13 lateness screen | T7, T8 / T3, T7 / T3, T8 |
| 5 | T14 payroll screens · T15 dashboard · T16 seed | T9 / T9 / T7, T9 |
| 6 | T17 smoke specs | all |
| 7 | T18 verify | all |

File check between parallel tasks: T5 and T6 both register providers in `hr.module.ts` (additive).
T7 and T8 both use `hr/domain` (created by T6, read-only for them). Frontend tasks each own their
`modules/<area>` folder and locale namespace; the sidebar entries are created by T3 for every
screen up front.

## Tasks

### T1 — Monorepo scaffold, schema and shared package (infra · surface)
- pnpm workspaces: `apps/api` (NestJS, house setup from `building-backends`: envelope interceptor,
  exception filter, global JWT guard + `@Public()`, ValidationPipe, ConfigModule with validation,
  `DatabaseService`, `BaseRepository`), `apps/web` (Next.js App Router, Tailwind, shadcn, the fetch
  wrapper from `building-frontends`), `packages/shared`.
- Root `docker-compose.yml`: Postgres on a host port offset from 5432 (pick 5442), named volume.
- **Full Prisma schema for every entity in the spec**, grouped by module comment headers, money as
  `Int` piastres, days as `Decimal(5,2)`, indexes on every foreign key and filtered column. One
  initial migration.
- `packages/shared`: enums (work system, gender, status, penalty action, penalty status, payroll
  status, adjustment type, repetition window, flags), setting keys, API types for every contract
  shape, error codes.
- Module skeletons: `core/{auth,users,settings,school-structure}`, `modules/hr/{employees,lists,
  penalties,staff-attendance,payroll,settings,domain}` with empty modules registered.
- House lint configs (api + web) with module-boundary rules pointed at `src/modules/`;
  `dependency-cruiser` config (no cycles, `core` never imports `modules`, front doors only); scripts
  `lint`, `typecheck`, `test`, `test:e2e`, `db:migrate`, `db:seed` in every app; GitHub Actions CI
  running lint, typecheck and unit tests.
- e2e harness reads `DATABASE_URL` and ports from env; `scripts/e2e-db.sh <n>` creates one test
  database per parallel agent.
- `.gitignore` covers `*.local.md`, `**/seed-data.local/`.
- Check: `pnpm install && pnpm lint && pnpm typecheck && pnpm test` green; `docker compose up -d`
  then `pnpm db:migrate` succeeds.

### T2 — Auth (backend + login page) (backend+frontend · logic)
Users table, bcrypt hashes, login / refresh / logout / me, access + refresh tokens in httpOnly
cookies, refresh rotation. Web: sign-in page (EN/AR), middleware redirects by session. Seed one HR
admin; logins in `CREDENTIALS.local.md`.
Edge cases:
- [ ] Wrong password → 401, generic message, no hint which field was wrong   (checklist: auth)
- [ ] Unknown email → same 401 as a wrong password   (checklist: auth)
- [ ] Email in different case → signs in   (checklist)
- [ ] Missing / malformed body → 400   (contract)
- [ ] Any non-public route without a cookie → 401   (§2: every action needs a signed-in user)
- [ ] Expired access token + valid refresh → refreshed transparently   (checklist)
- [ ] Reused (rotated) refresh token → 401   (checklist)
- [ ] Signed-in visitor opening `/login` → redirected to the dashboard; signed-out visitor opening
      any page → redirected to `/login`   (§2)

### T3 — Design system and app shell (frontend · ui)
Tokens from the Campus mockup (teal + sunflower, **light only**) as CSS variables mapped to Tailwind;
fonts with `next/font`: Plus Jakarta Sans, IBM Plex Sans Arabic, Tajawal; Phosphor duotone icons;
`docs/DESIGN.md` (feel, colour roles, type, motion, what to avoid). Shell: sidebar (desktop), icon rail
(tablet), top bar + drawer (phone), locale switch EN/ع with `dir`, school name and logo from
settings. Shared components: PageHeader, StatTile, StatusPill, DataTable that turns into cards under
740px, form fields (react-hook-form + zod), Dialog / Sheet, EmptyState, ErrorState, Skeleton, Money
and Days formatters, ConfirmDialog with required reason.
Interaction cases:
- [ ] Drawer: Esc / backdrop / link closes it, focus returns to the menu button
- [ ] Switching language flips direction without a reload and keeps the page
- [ ] DataTable: empty state, error state with retry, loading skeleton
- [ ] No horizontal scroll at 375px in either language

### T4 — Core settings and school structure (backend · logic)
`/settings/school` (typed values with defaults from §7), change history, logo upload (stored on
disk in dev, served from `/files`), `/stages` CRUD.
Edge cases:
- [ ] PATCH `workEnd` earlier than `workStart` → 400, nothing saved   (§7 validation)
- [ ] PATCH an unknown key → 400 (whitelist)   (contract)
- [ ] Every successful change writes one history row with old and new value and the user   (§7)
- [ ] Logo: wrong type → 400; over 2 MB → 413; valid → URL served   (contract)
- [ ] Stage names: missing Arabic or English → 400   (§3 lists)
- [ ] Hide a stage used by an employee → allowed (`isActive: false`); there is no delete route   (§3)

### T5 — HR lists and employees backend (backend · logic)
Departments, job titles (same shape as stages), employees CRUD, deactivate / reactivate, code
assignment `EMP-0001…` from a sequence.
Edge cases:
- [ ] Two employees created at the same time get different codes; codes never reused   (§3)
- [ ] National ID not 14 digits → 400; duplicate → 409   (§3)
- [ ] Duplicate fingerprint ID → 409   (§3)
- [ ] Hire date in the future → 400   (§3)
- [ ] Basic salary 0 or negative → 400; non-integer piastres → 400   (§3, contract)
- [ ] Direct manager = self → 400; manager chain loop (A→B→A) → 400; inactive manager → 400   (§3)
- [ ] Department / stage / job title id that doesn't exist or is hidden → 400   (§3)
- [ ] Deactivate → status inactive, record kept; there is no delete route   (§3 invariant)
- [ ] List filters (department, stage, status, work system) and search by code / EN name / AR name   (contract)
- [ ] Pagination: `limit` above 100 → 400   (contract)

### T6 — HR rule settings + domain rules (backend · logic)
`/hr/settings` with §7 defaults; pure functions in `hr/domain`: `latenessDays(minutes, rule)`,
`penaltyLevel(priorCount, levels)`, `monthSalary(basic, workSystem, partTime)`, `dayValue(...)`,
`lineNet(...)`, rounding helpers. No Nest or Prisma inside `domain/`.
Edge cases:
- [ ] Lateness 0 min → 0 days; 1 → 0.25; 60 → 0.25; 61 → 0.75; 120 → 0.75; 121 → 1.25; 180 → 1.25; 181 → 1.75   (§5 rule + GUESS)
- [ ] Grace 10 min: 10 → 0; 11 → 0.25   (§5)
- [ ] Penalty level: 0 prior → level 1; 4 prior with 5 levels → level 5; 7 prior → level 5 (last repeats); 3 levels and 5 prior → level 3   (§4 GUESS)
- [ ] Month salary: full-time 100%, PART_TIME_3 at 60% of 1,000,000 → 600,000   (§6)
- [ ] Day value 600,000 ÷ 30 = 20,000; ÷ 30 of 1,000,001 rounds half up to the piastre   (§6 rounding)
- [ ] Net floors at 0 and returns the `NET_FLOORED` flag   (§6 GUESS)
- [ ] Settings PATCH: percentages outside 1–100 → 400; divisor outside 1–31 → 400; days not in 0.25 steps → 400   (§7)

### T7 — Penalty catalogue and records (backend · logic)
Groups / violations / levels CRUD as in the contract; records: preview, create (pending), approve,
cancel.
Edge cases:
- [ ] `DEDUCT_DAYS` level without days, or days ≤ 0 → 400; `NOTICE` with days → 400   (contract)
- [ ] Levels with a gap (1, 3) or more than 5 → 400   (contract)
- [ ] Retiring a violation used by approved penalties → allowed; deleting is not possible   (§7)
- [ ] Penalty for an inactive employee → 409   (§3)
- [ ] Penalty dated in the future → 400   (§4)
- [ ] Level counts only APPROVED earlier records of the same violation for the same employee in the window; pending and cancelled ones don't count   (§4)
- [ ] Window = contract year: an approved record from 31 May doesn't count for a violation on 1 June   (§4 GUESS)
- [ ] Approve fixes level and action; editing the catalogue afterwards doesn't change it   (§4 invariant)
- [ ] Approve twice → 409; cancel an approved record → allowed with reason; cancel without reason → 400   (§4)
- [ ] Approve or cancel when that month's payroll is APPROVED → 409 `PAYROLL_APPROVED`   (§4 invariant)

### T8 — Monthly lateness (backend · logic)
`GET` / `PUT /hr/lateness/:month`.
Edge cases:
- [ ] Minutes negative, decimal or above 6,000 → 400   (§5)
- [ ] Entry for an inactive employee → 409   (§3)
- [ ] PUT for a month whose payroll is APPROVED → 409 `PAYROLL_APPROVED`   (§5 invariant)
- [ ] Response `days` follows the current rule; changing the rule changes the shown days   (§5, §7)
- [ ] Bad month format → 400   (contract)

### T9 — Payroll (backend · logic)
Runs, lines, adjustments, recalculate, approve, payslip data, bank sheet `.xlsx`, `payroll.approved`
event (no listener yet), dashboard endpoint.
Edge cases:
- [ ] Create a run → one line per active employee only   (§6)
- [ ] Second run for the same month → 409   (§6)
- [ ] Line: penalties counted only if APPROVED, `DEDUCT_DAYS` (or investigation with days), dated in the month   (§4, §6)
- [ ] Line: lateness days × day value; adjustments added / subtracted   (§6)
- [ ] Recalculate after a settings change → new numbers in the draft; employees deactivated since are removed, new ones added   (§6, §7)
- [ ] Adjustment: amount ≤ 0 → 400; reason missing → 400; on an approved run → 409   (§6)
- [ ] Approve with pending penalties in the month → 409 `PENDING_PENALTIES`   (§6)
- [ ] Approve → locked: recalculate / adjustments → 409; penalties and lateness of that month locked   (§6 invariant)
- [ ] Changing settings after approval doesn't change the approved run's numbers   (§7 invariant)
- [ ] Net floored at 0 and flagged; `PENDING_PENALTIES` flag on lines with pending penalties   (§6)
- [ ] Bank sheet on a draft run → 409; on an approved run → xlsx with code, names, national ID, net   (§6)
- [ ] Full flow: employee + penalty + lateness + adjustment → draft → approve → payslip numbers match by hand   (flow)

### T10 — Settings screen (frontend · ui)
Sections: School (name, logo, language, hours, days), School structure (stages), HR lists
(departments, job titles), HR rules (lateness steps, divisor, part-time %), Penalty catalogue editor
(groups → violations → levels), change history.
Interaction cases:
- [ ] Field errors shown inline in the current language; save disabled while invalid or saving
- [ ] Unsaved changes warning on leaving the page
- [ ] Saving the school name or logo updates the shell immediately
- [ ] Lateness rule editor shows a live example ("90 minutes → 0.75 days")

### T11 — Employees screens (frontend · ui)
List (search, filters, card view on phone), create / edit form, profile (details, penalties tab,
payroll tab), deactivate / reactivate.
Interaction cases:
- [ ] Server validation errors (duplicate national ID) map onto the field
- [ ] Manager picker excludes the employee and inactive employees
- [ ] Empty list and no-results states differ
- [ ] Double submit prevented

### T12 — Penalties screens (frontend · ui)
Record-a-penalty dialog with live preview of level and action, list (filters by month, status,
employee), approve, cancel with reason.
Interaction cases:
- [ ] Preview updates when employee, violation or date changes
- [ ] Cancel requires a reason; approve asks for confirmation
- [ ] `PAYROLL_APPROVED` error shown as a clear message

### T13 — Lateness screen (frontend · ui)
Month picker, table of active employees with a minutes input each, days column live from the rule,
save all.
Interaction cases:
- [ ] Days column updates while typing; invalid minutes highlighted
- [ ] Locked (read-only) when the month's payroll is approved

### T14 — Payroll screens (frontend · ui)
Runs list, create run, run page (as the mockup: tiles, table / cards, rules panel from HR
settings), adjustments dialog, recalculate, approve, payslip print view (EN/AR, print CSS), bank
sheet download.
Interaction cases:
- [ ] Approve blocked with a message when pending penalties exist
- [ ] After approve: actions hidden, read-only, bank sheet enabled
- [ ] Payslip prints on one A4 page in both languages

### T15 — Dashboard (frontend · ui)
Headcount, current payroll status, penalties this month, quick links.

### T16 — Seed data (infra · surface)
Lists, ~40 employees, the full penalty catalogue (4 groups, 72 violations), November 2026 lateness
for ~15 employees, ~10 penalty records (some repeated, some pending). **Client material** (school
name, logo, the catalogue text) lives in `apps/api/prisma/seed-data.local/` (git-ignored, shared
with the team separately) with a generic fallback in the repo, until the repo is private.

### T17 — Smoke specs (e2e)
Playwright, signs in as the seeded HR admin. Flows: sign in → employees list → record + approve a
penalty → lateness → create payroll → change a setting → recalculate → approve → payslip. Both
languages, desktop and phone viewport.

### T18 — Verify (stage 7)
Full suite, lint, typecheck green; each edge case above ticked against a named test; smoke passes;
UI audit over every screen (light only, LTR/RTL, phone and desktop); `break-ui` on employees and
payroll; findings fixed; build log updated.

## Owner check

The plan builds everything with agents. If Tamer and Waleed join, the natural split is: Tamer →
T5, T11, T10; Waleed → T6, T7, T9, T14; Abdallah → T1–T4, reviews.
