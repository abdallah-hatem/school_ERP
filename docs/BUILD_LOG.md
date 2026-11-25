# Build log

Run state for `build-software`. The log is updated the moment each step lands. Details for each
phase live in `docs/build-log/`.

- **Run mode:** Guided (chosen 2026-11-17).
- **Goal:** the foundation plus a thin real HR module for the client demo on **Sunday 2026-11-22**,
  run locally (hosting later).
- **Mode:** new app (the repo has docs only, no app code).
- **Design:** direction "Campus", picked from three mockups (`design/mockups/b-campus.html`, kept
  locally, not committed). Light theme only, responsive (desktop, tablet, phone), EN and AR.

- **Merging:** into `dev`, the owner or Claude for him (green CI + a CODEOWNERS approval; Claude uses
  the admin bypass for its own PRs and reviews, approves and merges Tamer's). `testing`,
  `production` and `demo`: the owner only (2026-11-20).

## Stages

| # | Stage | Status |
|---|---|---|
| 1 | Intake | done (architecture decided in `docs/ARCHITECTURE.md`; requirements from the HR department's document) |
| 2 | Spec + business doc | **approved** by the owner 2026-11-17 |
| 3 | Contract | done (in the spec) |
| 4 | Design system | Campus, teal + sunflower, light only; tokens go in code in T3 |
| 5 | Plan | `docs/plans/2026-11-17-hr-demo-plan.md` (18 tasks, 7 waves); review CONFLICTS fixed, re-review's 4 remaining items fixed |
| 6 | Build | **done** — T1–T17, T8b, T19 merged (#4–#26) |
| 7 | Verify | **done** — dev green (lint, typecheck, api 189 unit + 189 e2e, web 36 files, deps:check, smoke 10/10); UI audit (309 screenshots) → 1 blocker, 6 major, 4 minor, 5 nits → fixed in T20 (#28), after-screenshots checked |
| 8 | Ship | local demo ready on the seeded dev DB; hosting later; `dev` → `testing` → `production` promotion waits for the owner |

## Log

- 2026-11-17 — Run started (Guided). Design direction Campus chosen by the owner; dark mode dropped,
  responsive required. The HR requirements document (25 scanned pages, Arabic) is being extracted.
- 2026-11-17 — Requirements extracted (all 25 pages; kept locally in
  `docs/hr-requirements-source.local.md`, git-ignored). It covers attendance, leave, permissions,
  contracts and 72 penalty rules, but not salary calculation → payroll = basic minus deductions.
- 2026-11-17 — Spec `docs/specs/2026-11-17-hr-demo.md` and business doc (`docs/BUSINESS_LOGIC.md` +
  `docs/business/01–08`) written. **Waiting for the owner's approval** (stage 2 gate).
- 2026-11-17 — Owner approved the spec and the business doc, and confirmed the teal palette. The
  school's logo was downloaded to `design/assets/` (local only). Architecture updated: stages
  moved into `core/school-structure`, module rule settings live in their module, accounting added as
  Planned at the top of the module order.
- 2026-11-17 — Contract written into the spec; plan written (18 tasks, 7 waves). Alignment review
  on the plan started.
- 2026-11-17 — Alignment review: CONFLICTS (task classes, wave order, ~60 missing edge cases, 6
  doc gaps). Fixed: gaps settled as GUESS defaults (see `docs/business/00-recent-changes.md`), plan
  re-classed and re-ordered, cases added. Re-review started.
- 2026-11-17 — Wave 1: T1 (scaffold, schema, shared package) dispatched to a background agent on
  `feature/t1-scaffold`, base b532c32.
- 2026-11-17 — Re-review: 4 small items (rounding case, level-order case, month-lock placement →
  `hr/month-lock`, department snapshot on payroll lines) fixed; T1 told to add the department
  snapshot columns.
- 2026-11-17 — T1 verified by the main thread (lint 4/4, typecheck 4/4, tests green, deps:check
  clean; no client name, no `src/domains`, no dark tokens), rebased onto dev, merged as #4.
- 2026-11-17 — Wave 2 dispatched (base d9ee427): T2 auth, T3 design system + shell, T4 core settings
  + stages, T5 employees, T6 HR rules + domain + month lock. Settings history is event-driven
  (`settings.changed`, written by core's listener) so T4/T5/T6 run in parallel.
- 2026-11-17 — T6 verified + review ALIGNED → merged #6 (plan's custom-steps lateness case corrected:
  181 → 3.25, 241 → 3.5, per §5).
- 2026-11-17 — T5 verified; review DOC OUT OF DATE (4 undocumented behaviours) → §3 updated in the
  same PR → merged #7.
- 2026-11-17 — T4 done but holds duplicates of T5's pieces (pagination DTO, user decorator) and
  revealed that T6's HR settings write core's settings table directly (module-rule break). T4 sent
  back: rebase, keep T5's copies, route HR settings through core's `SettingsService`.
- 2026-11-17 — Wave 3 started: T7 penalties, T8 lateness (base f36a72f).
- 2026-11-17 — T3 (design system + shell) verified, checked in a browser at 1440/390 px in AR/EN (no
  horizontal scroll) → merged #9.
- 2026-11-17 — T4 rebased with T5's shared pieces kept and HR settings routed through core's
  `SettingsService`; review DOC OUT OF DATE → §2/§3/§7 updated → merged #10. Known: history rows are
  written just after the change (GUESS, Planned to tighten).
- 2026-11-17 — T8 (lateness) rebased (hr.module conflict resolved), e2e 105 green, review ALIGNED →
  merged #11. T13 (lateness screen) and T11 (employees screens) dispatched.
- 2026-11-17 — T2 (auth) rebased; added public `GET /settings/school/public` for the sign-in page and
  a `/files` rewrite; the sign-in form posts to a server action (no password in URLs). e2e 121
  green, review ALIGNED (refresh grace window recorded in the plan) → merged #12.
- 2026-11-17 — T7 (penalties) review DOC OUT OF DATE → §4 updated (retired groups, approving pending
  after retirement/deactivation, preview ignores the lock, rolling window boundary); e2e 148 green →
  merged #13. T9 (payroll) and T10 (settings screen) dispatched (base 6f9132c).
- 2026-11-17 — T13 lateness screen merged #15; T8b follow-up (lateness returns `locked` + departments,
  one month helper) merged #16.
- 2026-11-17 — T11 employees screens: sent back once for a year dropdown in the date picker and a
  phone rule as lenient as the API → merged #17.
- 2026-11-17 — T9 payroll: e2e 179 green; review DOC OUT OF DATE → §6 updated (approve recalculates
  before locking, payslip shares and zero-amount penalties, adjustments for removed employees not
  applied, dashboard) → merged #18. Wave 5 dispatched: T14, T15, T16.
- 2026-11-17 — T10 settings screen merged #19 (Arabic labels switched to Western digits per
  DESIGN.md). T15 dashboard merged #20. T12 penalties screens merged #21 (format.ts conflict: both
  helpers kept).
- 2026-11-17 — T16 seed: review ALIGNED; the 72-violation catalogue's Arabic now copied verbatim from
  the scanned regulations (69 names, 2 level corrections); seed updates names on re-run; client
  material only in git-ignored `apps/api/prisma/seed-data.local/` → merged #23. Local dev DB seeded;
  admin login in `CREDENTIALS.local.md` (git-ignored).
- 2026-11-17 — T14 payroll screens merged #24 (live-checked: 409 messages, approve block, xlsx, one-page
  A4 payslips EN/AR, no horizontal scroll).
- 2026-11-17 — T17 smoke specs (`pnpm smoke`: own DB, seed, API + web, 6 Playwright flows, servers
  stopped) — 6/6 re-run by the main thread → merged #25.
- 2026-11-17 — T19 polish (error language from the page locale, dashboard → run link, employee payroll
  history endpoint, adjustment `applied`, approved-run rules label, "All" selects, penalties table
  width, language switch guard) → smoke 6/6 on top → merged #26.
- 2026-11-17 — Verify: dev green end to end (see Stages). UI audit dispatched over every screen, light
  only, EN/AR, phone/tablet/desktop, against the seeded dev DB (writes only on a copy).
- 2026-11-17 — UI audit: 309 screenshots in `design/audit/` (local). Blocker: date picker month/year
  dropdowns not clickable. Major: Arabic date word order, clipped change history, phone pagination
  and payslip tables, RTL calendar chevrons, selects forced LTR. T20 fixed all 14 items (+ Arabic
  seed reasons), Playwright checks for the date picker, smoke 10/10 → merged #28. After-screenshots
  in `design/audit/after/`. The dev DB's four seeded reasons were switched to the Arabic text.
- 2026-11-17 — Demo dry run on a copy of the demo DB (`docs/demo/dry-runs/2026-11-17.md`): every
  figure matched by hand; six findings → fixed in T21 (Arabic "خصم يومين" dual and others). The dry
  run became part of the team flow (`CLAUDE.md` rule 8, `docs/CONVENTIONS.md`) → #29, #30.
- 2026-11-17 — Owner: mockups first for layout and navigation changes, unasked (`CLAUDE.md` rule 9,
  `CONVENTIONS.md`, skill design gate) → #31.
- 2026-11-17 — T22 option B (picked from mockups): module sidebar (full height) and employee
  profile cards, 12 per page → #33. English is the default language → #34.
- 2026-11-17 — T23: 10 per page with no rows-per-page control, toasts top-right, skeletons match
  the real layout, work times as 30-minute dropdowns; flaky payroll smoke fixed → #35.
- 2026-11-17 — T24 live comma grouping in money and minutes inputs, caret kept, real-browser spec
  → #36. T25 searchable pickers above 6 options, row actions in a ⋯ menu, add button plus in a soft
  badge (picked from mockups) → #37.
- 2026-11-17 — T26 clicking a number field selects the whole figure; a second click places the
  caret → smoke 21/21 → merged #38. Skill rules synced (abdallah-skills 1.62.3 → 1.62.9).
- 2026-11-17 — Mockups shared in `design/mockups/` (client name replaced by a placeholder); audit,
  logo and mockup screenshots stay local. `/design/` and `docs/DESIGN.md` are lead-owned; branch
  protection on dev, testing and production requires code-owner review → #41.
- 2026-11-17 — Local CI: `pnpm ci:local` on every push (pre-push hook), CI runs the same script → #43.
- 2026-11-17 — Audit log: spec approved, layout option B (timeline) picked; business §9 added; plan
  `docs/plans/2026-11-17-audit-log-plan.md` (T27–T31). T27 started.
- 2026-11-17 — Penalty catalogue groups start folded → #45. Employee profile: shared layout, header
  stays across tabs → #46. Roles/permissions spec written with GUESS answers.
- 2026-11-17 — T27 audit foundation merged → #48. Branch rules (owner): `dev` takes PRs with green CI
  and no approval; `testing` and `production` need green CI and the owner's approval. P1 permissions
  skeleton started; Tamer and Waleed are invited once P1 is merged.
- 2026-11-17 — P1 permissions skeleton merged → #50: 29 typed keys, `@Permission` / `@Public` /
  `@SignedIn`, a closed-by-default guard, CI scan, `can()` in the web app; HR admin holds every key.
  Ready for Tamer and Waleed (T28/T29).
- 2026-11-17 — Tamer (`Fawrama`) and Waleed (`AbdelrahmanHassib`) invited with Write → #52.
- 2026-11-17 — P2 roles as data merged → #53 (7 starting roles; admin = System admin + HR manager;
  users/roles API; review made §2 honest about P3/P4 gaps). T30 Activity page + employee History
  tab (option B) merged → #54; Settings → Change history replaced by a link to Activity.

- 2026-11-17 — Activity UI audit fixes (24 findings; calendar keeps 16px from edges) → #57. PRs must
  start from the latest dev (GitHub requires up-to-date branches; `ci:local` warns) → #56. Sticky
  Save/Cancel bar → #58; Save disabled until something changes → #59. Clickable employee names → #61.
  Paging scrolls to the list top → #63. Releases dev → testing → #60, #62.
- 2026-11-18 — "Manages people" job titles + managers-only Direct manager picker → #64. Cancelled
  penalties red → #65. Clear filters on every filtered list → #66. P3 Users / Roles / My account +
  forced new password (option A) → #67. Employee insurance, bank, emergency contact, qualification,
  photo → #68. Same-day penalty levels ordered by recording time → #69. Inactive pills grey → #70.
  Campus toasts + distinct Deactivate/Reactivate → #71. Once-per-day violations + searchable
  catalogue → #73. Set-password language switch + temporary-password pill → #74. Male/female
  avatars → #75, replaced by the classic default silhouettes → #77.
- 2026-11-18 — GitHub CI runs API e2e and desktop/phone smoke on every PR → #72; all four checks are
  required on dev, testing and production (owner). The desktop failures were Linux's 15px scrollbar.
- 2026-11-18 — P4 visibility merged → #76: scopes (own stage / own team / self) in HR, salary-type data
  hidden without `hr.employees.view_salary`, tabs/sections gated, out-of-scope → 404; review fixes
  included. Payroll run-page race (a stale navigation undid Approve) fixed in the app → #80.
- 2026-11-18 — Team rules: every write is audited — a T28/T29 placeholder is wired in the same PR as
  any change to it (CLAUDE.md, CONVENTIONS) → #79. A new module needs a plan in `docs/plans/` (CI) → #81.
  Tamer owns payroll and accounting decisions (owner). His #78 (payroll tax → new accounting module)
  is open: needs an accounting plan, the T29 payroll audit wiring and CLAUDE.md's module line.
- 2026-11-18 — Payroll run-page race fixed → #80. Audit-wiring rule in CLAUDE.md/CONVENTIONS → #79.
  New-module plan check in CI → #81 (fix: never makes a developer's clone shallow). CLAUDE.md module
  order: accounting exists for payroll taxes → #87.
- 2026-11-18 — Tamer's accounting stack (owner merges, not Tamer): #86 shared tax maths and #84
  accounting module + tax-rule API merged after review and all four checks; dev re-checked after each.
  #83 (Settings → Accounting) waits: the Accountant can't open Settings (page guard + sidebar lack
  `accounting.settings.view`; sections not filtered per permission). #85 (taxes on approval) waits: a
  missed month must use the rule and insurance as of approval, not today's. #78 is replaced by these.
- 2026-11-18 — Started: demo dry run on a copy of the demo DB (migrations since the 17th + the script
  in AR/EN/phone, money by hand); skeletons-match PR #88; a role-access smoke spec (every built-in
  role × every screen).
- 2026-11-18 — Role-access smoke spec merged → #89: one shared list (`packages/shared/src/screens.ts`)
  drives page guards, sidebar and Settings sections; real fixes: Settings lists only the viewer's
  sections, Users/Roles/Activity got page guards, "Edit rules" on the run only with `hr.settings.view`.
- 2026-11-18 — Demo dry run on a copy (`docs/demo/dry-runs/2026-11-18.md`) merged → #90: the script
  passes in AR, EN and phone; every money figure matched by hand. Blocker: run the seed once on the
  demo DB after `migrate deploy` (owner). Arabic plural counts and Arabic names on older Activity
  entries (read-time fallback, no backfill) fixed → #91.

- 2026-11-18 — Skeletons match their screens → #88: each skeleton is built from its screen's own
  parts (masked real forms, `SkeletonProse` for wrapping text, route groups so a page never shows a
  parent's skeleton); `23-skeletons*.spec.ts` compares skeleton and loaded blocks on desktop EN and
  phone AR (±8px). All four checks green; dev re-checked.
- 2026-11-18 — Roles leftovers (`fix/roles-leftovers`): every Settings section is read-only without
  its edit key (School, HR rules, lists, catalogue, as Accounting already was); payroll adjustments
  stay gated on `hr.payroll.adjust` (API already guarded and audited; now e2e-tested, and the web
  says why a draft's adjustments are read-only); Home without `hr.dashboard.view` is a welcome with
  the user's name and links to their screens (§2, GUESS). Who holds what is unchanged.

- 2026-11-18 — #88 leftovers fixed → #94: the Add user password is made once by the server screen
  (no hydration mismatch); the Users list uses the shared Clear filters.
- 2026-11-18 — Tamer's accounting stack done (owner merges): #83 Settings → Accounting (the
  Accountant opens it through the shared screen list; read-only without edit) and #85 taxes on
  approval (tax rule versions + insurance snapshot on HR's approved lines, so a month worked out
  late matches approval day) merged after review and all four checks; #85's docs conflicts with
  #83 resolved by us. #78 is replaced by the stack.
- 2026-11-18 — Merged after all four checks: #97 (Lateness and runs return the HR rules they use,
  so Principal/Accountant see them), #98 (roles leftovers), #99 (the eight dry-run fixes). Their
  run-page/docs conflicts with each other resolved by us, `ci:local` re-run on each merge.
- 2026-11-18 — CI: docs-only PRs pass API e2e and smoke in seconds without running them; lint,
  typecheck, unit tests and module rules always run; CI also runs on PRs into `demo` → #100.
- 2026-11-18 — `demo` branch cut from dev at 0d07713 (after #97–#101) and protected like testing
  (PR, four green checks, owner approval); Sunday's demo runs from it (ARCHITECTURE → Environments).
- 2026-11-18 — Team (owner): Waleed is paused for now; the work is split between Abdallah and
  Tamer. Waleed's T28 (audit wiring for auth, settings, employees, lists) moves to Abdallah.
- 2026-11-18 — Settings history written in the change's own transaction (no outbox needed): stages,
  departments, job titles, penalty groups and violations record through core's `SettingsHistory`
  inside their write, so a failed entry rolls the change back; the after-commit listener is gone and
  those ten endpoints are `@Audited` → `fix/settings-history-in-transaction`.
- 2026-11-18 — The "no stage" entry is a flag, not a name (`fix/none-stage-by-id`): `stages.is_no_stage`,
  set on the stage named "None" by its migration and by the seed (`StagesService.ensureNoStage`, no
  endpoint); the card band reads the flag. Was the only name check in api/web/shared/seed.
- 2026-11-18 — Merged: #105 settings history in the same transaction as the change (stages, lists,
  catalogue; their ten T28 endpoints now audited) and #104 the "no stage" entry found by a flag,
  not its English name (rebuilt on #105).
- 2026-11-18 — Decisions (owner): events + outbox design approved (nudge after commit + 30 s poll);
  notifications use option A (bell popover), in-app only in the UI (no Email/WhatsApp/SMS "Soon"),
  and the recommended answers to the spec's open questions (grouping, a per-employee probation end
  date, deadlines 25th/28th as settings, approvals always on, retention 90/30/365 days, contract
  reminders at 30 and 7 days, System admin edits Notifications settings) — recorded in #106.
- 2026-11-18 — Notifications spec, plan, §11 and the option A mockup merged → #106 (build waits for
  events + outbox).
- 2026-11-18 — CI (owner): PRs into `dev` no longer have to be up to date with `dev`; instead the
  full suite runs on `dev` after every merge → #111 (branch protection: dev strict off; testing,
  production and demo still strict). A red run on `dev` is fixed before anything else.
- 2026-11-18 — T28 merged → #107 (Abdallah): sign-in, sign-out and failed sign-in (same entry
  whether the email exists), employees (create/edit/deactivate/reactivate/photo, names instead of
  ids, salary hidden without the permission) and HR settings now on Activity; the employee History
  tab fills in; smoke History checks and the skeleton History comparison are full. Left: T29
  penalties (Tamer), then T31 (scan expects no placeholders, dry-run check, Activity search by
  employee code).
- 2026-11-18 — Login rate limiting (owner-approved rules) and the scheduled-jobs foundation: 5 wrong
  passwords in 15 minutes lock that account for 15 minutes (per account, `login_attempts`, one atomic
  upsert; 429 `TOO_MANY_ATTEMPTS`; sign-in and both password-change paths), admin unlock from Users
  (`POST /users/:id/unlock-sign-in`, audited), lockouts audited; `core/jobs` (`@nestjs/schedule`,
  advisory lock per job, `job_runs`) with the nightly `login-attempts.cleanup` at 03:00 Cairo →
  #109. Its concurrency test exposed pool starvation (a request transaction holding one connection
  while a `RequiresNew` audit write needs a second): sign-in now records itself in one transaction
  with the session. `POST /account/password` had the same risk — assigned to the events + outbox
  build (gap 10). Checked in the browser (EN/AR, desktop/phone): lockout message, locked pill,
  user-page notice and unlock all work; three small layout fixes are in progress.
- 2026-11-18 — `docs/EVENTS.md` (owner): every event (name, payload, emitter, listeners, after-commit
  or not, emit vs emitAsync, planned kind) and every transaction boundary, from the code; a unit
  test fails when the doc and the code disagree. Eleven gaps listed there (the `employee.*` events fire
  inside the transaction; four events have no listener; emit/emitAsync mixed) → #114. All are
  assigned to the events + outbox build except #9 (token refresh's own transaction, deliberate).
- 2026-11-18 — Events + outbox build started (owner, the approved design).
- 2026-11-18 — Docs flow (owner): the build log has one writer, whoever merges (PRs carry a "Log
  entry" in their body instead); business changes are one file each in
  `docs/business/recent-changes/`. Stops the docs-only conflicts between parallel PRs.
- 2026-11-18 — Layout fixes from the browser check → #116: on a phone the user page shows Status
  (with the sign-in lock and Unlock) first; Users cards put status pills on their own line so the
  email shows in full; toasts sit bottom-end on desktop (clear of header actions and the Save bar),
  full width under the top bar on a phone. Checked in screenshots (EN desktop, AR phone).
- 2026-11-18 — Events + outbox merged → #119: one typed `DomainEvents.publish()` (always after
  commit; `@nestjs/event-emitter` removed; a scan bans direct emits); must-deliver events go through
  `outbox_events`/`outbox_deliveries` (nudge after commit + 30 s poll, SKIP LOCKED, retries, dead
  after 10, admin retry `core.outbox.manage`, nightly cleanup); `hr.payroll.approved` →
  accounting is must-deliver (Tamer to review his listener; his late path stays). EVENTS.md gaps
  1, 3–8, 10, 11 fixed. Tested live before merge (jobs on, throwaway DB): approve → taxes 3 ms
  after commit; kill -9 mid-delivery and after commit both recovered by the poll, taxes once;
  job_runs only on work; retry schedule, dead after 10, admin retry audited, non-admin 403;
  no-op employee save publishes nothing.
- 2026-11-18 — Outbox follow-ups merged → #121: the nudge runs in the background after the
  response (approve no longer waits for accounting), retries count from the claiming pass with a
  1 s tolerance (on time), `attempts` counts failures only. Tested live before merge: approve
  returned in 0.05–0.09 s with accounting's table locked, taxes appeared once the lock was
  released (38/38 lines); normal approve delivered 6 ms after commit; retries at +10 s/+1 min/+5 min
  from each tick; dead after 10; admin retry answered in 9 ms and is audited.
- 2026-11-18 — Decided (owner): who sees Settings stays a role setting — a System admin removes
  "View school structure" / "View penalty catalogue" from Stage head or Direct manager in
  Administration → Roles if a school wants; no code change. Notifications N0 (probation end) and
  N1 (core) started.
- 2026-11-18 — Ownership (owner): Abdallah now does T29/T31 (penalties audit, Activity search),
  the accounting payroll-taxes screen, notifications and events/outbox; Tamer does the payroll-run
  rules snapshot and reviews his listener in #119. T29 started.
- 2026-11-18 — N0 merged → #124: each employee has a probation end date (default hire date +
  the HR setting `defaultProbationMonths`, 3, minus a day; editable, clearable, never before the
  hire date; existing employees backfilled); Settings → HR rules → Employees card. Business
  alignment review: aligned. Screens checked in EN desktop and AR phone on a throwaway DB (one Job
  card layout fix made).
- 2026-11-18 — N1 merged → #127: core notifications (`core/notifications`): tables for
  notifications, items, deliveries, school defaults and personal preferences; `notify`/`resolve`
  join the caller's transaction (or an outbox listener); recipients by permission + scope with
  modules registering scope resolvers; grouping per type per day while unread, dedupe, resolve for
  everyone, access re-checked on every read; preferences over school defaults, approvals locked on;
  nightly purge 90/30/365 days; permissions `core.notifications.view`/`.manage` granted by
  migration. API only — screens are N4. N2 (approvals), N3 (reminders) and N4 (screens) started.
- 2026-11-18 — Accounting payroll-taxes mockups (three options) → #129. Owner picked **C** (year
  board + printable statement), **with the draft state** on the board, and every table built from
  the shared `DataTable` (the mockup's tables were hand-drawn). The draft state needs a small
  read-only addition to accounting's API (through HR's exported payroll service) for Tamer to review.
  Build started.
- 2026-11-18 — T29 + T31 merged → #126: recording, approving and cancelling a penalty are on
  Activity (names, not ids; refused writes leave none); penalties show on the employee's History;
  Activity search finds entries by employee code (live lookup, older entries too); the audit scan
  now allows no "wired in" placeholder. Checked in screenshots (EN desktop, AR phone). Two display
  issues found, fixed in #135.
- 2026-11-18 — Activity display fixes merged → #135: no entry shows JSON any more (payroll and
  accounting totals as labelled lines, role permission changes as "View payroll: Everyone → Their
  stage"); payroll and lateness months in words ("November 2026" / "نوفمبر 2026"), never broken
  across lines; the AR phone results count sits outside the scrolling chip row. Checked in
  screenshots (EN desktop, AR phone).
- 2026-11-18 — N3 merged → #134: one daily job `hr.reminders.daily` (07:00 Cairo) sends contract
  ending (30 and 7 days), probation ending (7 days), lateness not entered (from the 25th), payroll
  not prepared / still a draft (from the 28th); resolved the moment the thing is done; dedupe keys +
  the job lock prevent repeats; recipients by permission and scope. Days are HR settings (shown in
  N4's Settings → Notifications). GUESS: past dates aren't chased; only the current month's
  lateness/payroll reminders are sent.
- 2026-11-18 — N4 merged → #137: the bell (unread count, refresh every minute and on focus),
  the list as a popover on desktop / full-screen sheet on a phone (grouped items, done states, mark
  all read), My account → Notifications (one switch per type, required ones locked, reset to the
  school default), Settings → Notifications (defaults, reminder timing, retention; System admin
  edits, HR manager reads; timings follow HR-rules editing). Checked in screenshots. The phone smoke
  spec's ambiguous heading locator fixed by us. Left for N2: a penalty notification opens that
  penalty; the full record → bell → approve smoke flow.
- 2026-11-19 — Accounting payroll taxes screen merged → #138 (option C): year board (approved /
  draft in HR / nothing yet), a printable statement per month with Insured / Not insured tables on
  the shared `DataTable` (new optional totals row), the tax rule used, Excel export and print/PDF;
  Accounting is live in the sidebar (Accountant, System admin). Accounting API gained read-only
  `GET /accounting/payroll/year/:year` (via HR's `PayrollService.runStatusesInYear`) and the month
  export — for Tamer to review. Checked in screenshots. Tamer can now start the payroll-run rules
  snapshot (merge dev first; N2 touches `payroll.service.ts`).
- 2026-11-19 — N2 merged → #131: approval notifications — a pending penalty tells whoever may
  approve it within their stage or team (not the recorder); a calculated payroll month with no
  pending penalty tells payroll approvers (net only for whole-school viewers); both resolve for
  everyone when one person acts. `/penalties?penalty=<id>` opens that penalty with Approve/Cancel;
  smoke covers record → bell → approve → "Approved by …". Notifications N0–N4 are done; N5
  (verify) next.
- 2026-11-19 — First visit opens in English → #142 (an old `/` → `/ar` redirect in next.config ran
  before the proxy and overrode the English default; smoke now checks a fresh visitor lands on /en).
  Toasts back at the top inline-end corner (top-right EN, top-left AR) → #143 (owner preferred it
  over #116's bottom corner).
- 2026-11-19 — Started: payroll taxes statement fixes (subtotal row to the table's right edge;
  pagination + search per group on screen, print/Excel complete) and a break-ui pass over every
  money screen with worst-case amounts (owner).
- 2026-11-19 — One avatar for every person → #147: user accounts no longer show initials (sidebar
  chip, Users list, My account, role holders, Activity's Person filter, the employee picker); a
  linked account shows its employee's photo or male/female silhouette, an unlinked one a neutral
  silhouette; inactive people greyed. Users, session and activity actors gained read-only
  `employee: { photoUrl, gender }`. Checked in screenshots (EN desktop, AR phone, tablet rail).
- 2026-11-19 — Payroll taxes statement and tables → #146: each group pages (10) with one search
  box, the subtotal covers the whole group ("Subtotal · all 24"), print/PDF and Excel list everyone;
  every DataTable's header, hover, hairlines and totals row now reach both card edges (an empty
  scrollbar gutter made them stop 10px short) — measured 0px on payroll runs, penalties, users and
  the statement, EN and AR. The Insured table switches to cards below 960px so it never scrolls
  sideways → #151.
- 2026-11-19 — Money worst-case pass (break-ui) → #149: amounts up to EGP 21,474,836.47 and month
  totals over EGP 146M checked on every money screen, EN/AR, 320–1440px and print; fixed the
  statement sum line (four terms + gross band between 740 and 960px — owner to look), `Money`
  wrapping, the run lines table (cards below 900px), card grids at 320–600px, the year board at
  320, "EGP" splitting from its amount in sentences, notification line caps.
- 2026-11-19 — Deleting roles → #148 (owner): System admin can't be deleted (and keeps every
  permission); every other role, starting or custom, can be deleted once nobody holds it ("Starting
  role" badge, a warning that future permissions won't reach a replacement); grant migrations skip a
  deleted role (replay test).
- 2026-11-19 — Money cap → #154 (owner): salary, insured salary and each payroll adjustment are at
  most EGP 1,000,000.00 a month — one shared constant `MAX_MONTHLY_PIASTRES`, enforced by the API
  DTOs and the web forms ("At most EGP 1,000,000.00 a month."). Removes the overflow #149 found.
  N5 (live notifications check) started.
- 2026-11-19 — N5 (live notifications check) passed all six flows: approvals by scope, grouping,
  deep link, resolve for everyone; reminders sent once, resolved when done, dedupe across runs and
  two containers; preferences and Settings → Notifications; access loss; bell/popover/sheet EN+AR;
  jobs and retention purge. Its four small findings fixed → #156: group titles count open items
  ("2 penalties waiting…", "3 penalties — all handled · Approved by …"); the Unread tab equals the
  bell count and refreshes after Mark all read; every role sees the school's name and logo (shell
  reads the public endpoint); AR phone preference switches aligned. Notifications N0–N5 done.
- 2026-11-19 — Fresh-clone setup → #158 (owner: it didn't run on a friend's PC): `pnpm run setup`
  (checks Node/pnpm/Docker, starts Postgres, creates the env files with generated secrets only if
  missing, builds shared, migrates, seeds once) and `pnpm dev` (API + web + shared watch together);
  root README with prerequisites, logins, ports and troubleshooting; ports/DB overridable for a second
  copy. Proven on a fresh clone (setup twice, dev, headless sign-in). Note: `pnpm setup` alone is
  pnpm's own command — use `pnpm run setup`.
- 2026-11-19 — Setup fix → #160: setup and `pnpm dev` stopped when `school-erp-db` had been
  created by another compose project (compose won't reuse the name); `start_db` now starts an
  existing container and uses `docker compose up` only when there is none. Proven on the owner's
  machine (setup ran, migrations applied, seed skipped, app up on 3000/3001).
- 2026-11-19 — Collapsible permissions → #162 (owner: "needs to be collapsable like Penalty
  catalogue"): a role's Core/HR/Accounting groups fold open and shut, start closed (open when they
  hold unsaved changes); "Turn all on/off" works on a closed group. Checked in screenshots (EN
  desktop, AR phone).
- 2026-11-19 — Dashboard with no tiles → #163 (owner: had "View the HR dashboard" but saw nothing):
  each tile also needs its screen's view permission (by design); a role with the dashboard but no
  tile now gets the welcome with its screens instead of an empty Home; the permission's text says
  so (EN/AR). Checked in screenshots.
- 2026-11-19 — Employee record → #165 (owner: "linked employee is kinda confusing"): the field is
  "Who is this person in HR?" ("Employee record" in lists; AR ملف الموظف) with a hint on why scoped
  roles need it; a non-blocking warning when a scoped role has none; "Signs in as" / "No sign-in
  account" on the employee profile (`signInAccount` on the API employee, through core's
  UsersService); the welcome no longer tells someone with a role to ask for one. Smoke caught two
  skeleton-height mismatches from the new rows; fixed in the skeletons, check unchanged. Checked
  in screenshots (EN desktop, AR phone).
- 2026-11-19 — Owner: refresh `demo` from `dev` → dev→demo PR #167 (green, waits for the owner's
  approval). Dry run → #168 (`docs/demo/dry-runs/2026-11-19.md`, DEMO_SCRIPT updated): AR, EN, phone
  on two DB copies; every money figure matched by hand (payslips, run totals, bank sheet, 76 tax
  lines). Must fix: (1) raw values in History/Activity → fixed in #169; (2–4) demo-database data,
  the owner's: re-run the seed (set SEED_ADMIN_PASSWORD to the current admin password first —
  the reseed resets it), remove "Test User" and "Test Role AR", insure 2–3 employees and add an HR
  officer and an Accountant login before the demo. 7 later items in the record.
- 2026-11-19 — Audit values → #169: History and Activity show insurance status and highest degree
  as labels, insured salary as money (EGP 6,500.00, counted as money and hidden without salary
  access), and a photo or school-logo change as "Photo added / changed / removed" — never a file
  name. Checked in screenshots (EN desktop, AR phone).
- 2026-11-20 — Owner: "for dev also require me only to merge", then "I allow you to merge for me as
  well" → `dev` protection needs one CODEOWNERS approval, so Tamer can't merge alone; Claude merges
  its own PRs with the admin bypass and reviews, approves and merges Tamer's. CLAUDE.md rule 5,
  CONVENTIONS, CODEOWNERS and learnings updated (#172).
- 2026-11-20 — Accounting → Approved payroll → #171 (Tamer; reviewed with screenshots, fixed on top by
  Claude with the owner's OK, approved and merged for him): months HR approved with the tax columns;
  Return to HR (reason; HR run back to draft, month unlocks, taxes dropped and redone on re-approval,
  HR approvers notified) and Finalize (transfer made, final); both audited on the accounting month
  and HR's run; Rows per page 10–500 with a sticky header on payroll tables (payroll APIs allow 500,
  every other list 100). Fixes: audit on HR's run, statuses in words, bidi of the reason, lock order,
  docs and e2e; the hr-payroll test now cleans its accounting rows. Owner kept the screen; sidebar
  label "Approved pay" (EN; the full name was cut off), page "Approved payroll".
- 2026-11-20 — Dry run of the steps #171 changed → #174 (`docs/demo/dry-runs/2026-11-20.md`, script
  wording): AR, EN, phone on DB copies; money matched by hand, including return → fix → re-approve.
  Must fix (code, in progress): the month's total row hidden inside the capped table (also the
  Payroll taxes subtotals); "Finalized · transferred" cuts the month name on a phone. Five later
  items folded into the same fix. Demo-database data steps still the owner's.
- 2026-11-20 — Dry-run fixes → #176: capped payroll tables keep their totals pinned at the bottom of
  the scroll box ("Month total · all N" on the Approved payroll month; Payroll taxes subtotals);
  HR's runs cards put status pills under the month (no truncation at 320–390); `dir="auto"` on every
  textarea; Activity → Module has Accounting; return/finalize use the status icon; the month title
  stays on one line. A smoke check failed in CI only (Linux scrollbar pushed 1440 under the 1100px
  cards point); spec runs at 1600.
- 2026-11-20 — Approved payroll month → #178 (owner, after screenshots of both layouts): cards on
  every screen width, and no Month total card on screen ("its already at the cards at the top" — the
  four tiles carry the totals); print and Excel/PDF keep the total row. The hidden-totals note moved
  under the tiles. DataTable gained `cardsBelow="always"` and `footerCard="none"`.
- 2026-11-20 — `demo` refreshed → #167 merged (dev → demo, merge commit `7543009`; owner: "merge it
  for me", with the admin bypass — a one-off, `demo`/`testing`/`production` stay the owner's). `demo`
  now equals `dev` at `625de6d`. Still the owner's before Sunday: re-run the seed (set
  SEED_ADMIN_PASSWORD first), remove "Test User" / "Test Role AR", insure 2–3 employees, add an HR
  officer and an Accountant login.
- 2026-11-20 — #181 (AbdelrahmanHassib, into `demo`: CI deploy of `demo` to Vercel + Neon) — the owner
  first confirmed he asked for it, then dropped Vercel ("never mind vercel lets remove it"): #181
  closed unmerged, CLAUDE.md rule 6 back to no Vercel (#182/#183 reverted here). The demo runs locally.
- 2026-11-20 — Search-field loader → #185 (owner: the cards just fade while results load; "add a
  small loader in the searchbar"): while a list refetches (typing, a filter, a tab or a page), a
  spinner takes the magnifier's place after ~180ms and stays ≥300ms; static under reduced motion;
  "Loading…" announced once; dropdowns get no spinner of their own; the dim stays. On Employees,
  Penalties, Users, Activity, Lateness and the payroll run lines; lists whose search filters loaded
  data don't refetch, so none there. DESIGN.md allows it as the second spinner. Rule added to the
  building-frontends skill (1.62.20). Checked in screenshots (EN desktop, AR phone).
- 2026-11-20 — Money inputs → #189 (owner: "each money input field must be auto updated like this
  10,000, in real time"): the Settings → Accounting example's Net pay was a hand-rolled input (from
  #83); now the shared engine via a new `MoneyInput` (MoneyField renders through it). Sweep: also the
  HR rules lateness example (minutes, grouped). A unit-test guard fails on any raw decimal/numeric
  input outside the shared form components. The example box is redesigned as a receipt (owner
  picked option A of three mockups): Net pay, + Income tax, + Martyrs' fund, Gross the school pays.

- 2026-11-20 — Run History tab → #188: the payroll run page has Employees | History tabs (header stays
  mounted); entries trimmed to what a person would write (approved: status + net; created: net +
  employees; recalculated: only changed totals; no "Need review", no "Totals ·" prefix), Activity
  the same. Penalties already showed on an employee's History (T29/T31) — the Next up item was stale.
- 2026-11-20 — Notifications loading → #190 (owner: "looks so bad, like no css"): the skeleton mask
  painted the switches' hidden native checkboxes (fixed for every SkeletonMask with switches/checkboxes);
  a saving switch now shows a pending state (new value, dimmed track, crisp thumb, extra clicks
  ignored) instead of looking locked or doing nothing. Before/after screenshots EN + AR.
- 2026-11-20 — Penalties approve in date order → #192 (owner found 19 + 20 Nov both at level 2 after
  approving 20 first; picked option 1 of 3): approving is refused (409 PENALTY_EARLIER_PENDING) while an
  earlier pending penalty of the same violation for the employee exists within the repeat window;
  checked under the same advisory lock as the level; Approve shows greyed with the reason; cancel
  always allowed; approved levels never recomputed (older pairs may share a level, noted in §4).
  CI caught 9 employees leaked by hr-approval-notifications' e2e (older bug) — cleanup fixed.
- 2026-11-20 — Sidebar coming modules → #194 (owner picked option C of three mockups): a locked School
  group (Students, Academics, Attendance, Exams & grades), Leave & permissions locked in HR, Fees locked
  in Accounting, Transport and Parent portal locked; Inventory removed. Locked items are never screens or
  links. Current (Phosphor) icons — the custom icon set is on hold (owner).
- 2026-11-20 — Owner: backdated penalty → **recount, telling them first** (heads-up when recording, an
  explicit "Approve and update N penalties" confirmation when approving; refused if a later one is in an
  approved payroll month). Built in #196.
- 2026-11-20 — Backdated penalty recount → #196 (owner: "recount but you tell them first"): approving a
  penalty dated before approved ones of the same violation/employee moves each later one (in its
  window) up one level with today's catalogue action; never down; capped at the last level. Heads-up
  on the record form, "Approve and update N penalties" confirmation, server requires the acknowledged
  list (409 UNCONFIRMED / CHANGED with the fresh list); refused naming the month if a later one is in
  an approved payroll month. One `hr.penalty.recount` History entry per moved penalty; draft runs show
  the recalculate notice (new `recounted_at`). CI caught a real race-order bug (losers now get
  NOT_PENDING) and a wrong test. Screenshots EN + AR.
- 2026-11-20 — `demo` refresh 2 → PR #198 (dev → demo, green, waits for the owner). Dry run of the
  changed steps → #199 (`docs/demo/dry-runs/2026-11-20-b.md`, script wording): AR, EN, phone on DB
  copies; money matched by hand (tax receipt, recounted deductions, run totals vs History vs
  Accounting). Must fix: run History empty right after Recalculate until a reload — being fixed with
  four later items (run empty-state text, approved-month refusal UI, Arabic count plural, recount
  entry label).
- 2026-11-20 — Dry-run 11-20b fixes → #201: History was stale after a write (apiFetch expired tags with
  `revalidateTag(tag,'default')`, which serves the old copy and never tells the browser) — now
  `updateTag` inside Server Actions (fallback `revalidateTag(tag,'max')`), so every tagged write refreshes
  at once; smoke test recalc → History without reload. Also: run-specific empty text, approved-month
  refusal hides the date hint and disables Save, recount labels "Penalty date"; the Arabic count was
  already plural (test added). `demo` PR #198 now carries all of it; waits for the owner's approval.
- 2026-11-21 — `demo` refreshed again → #198 merged (dev → demo, merge commit `2d95bac`; owner: "Yes,
  merge it", admin bypass, one-off). `demo` equals `dev`. Still the owner's before Sunday: re-run the
  seed (SEED_ADMIN_PASSWORD first), remove "Test User"/"Test Role AR", insure 2–3 employees, add an
  HR officer and an Accountant login.
- 2026-11-21 — PWA + push → #204 (owner: "we need to have it as pwa, with notifications and the logo is
  the school logo"): installable app named after the school with icons generated from the uploaded logo
  (sharp, versioned URLs); service worker caches static files only, never pages or API, with a branded
  offline page; Web Push channel (`push_subscriptions`, VAPID env generated by setup) sent after commit via
  the outbox, following each type's in-app switch, no money or reasons in payloads; "Alerts on this
  device" + My devices in My account; device add/remove audited. Needs HTTPS (or localhost); iOS push
  only after Add to Home Screen. Verified live up to a local push service; real FCM/APNs delivery and
  the OS banner not yet. CI's first smoke failure was the test (offline page auto-reloads), fixed.
- 2026-11-21 — Owner held the first client meeting; details to follow.
- 2026-11-21 — 12-hour time → #207 (owner: "all hour format should be 12h … pm and am"): one shared
  formatter (`formatClockTime`/`formatClockDateTime`, Cairo clock, EN `4:07 PM`, AR `4:07 م`/`9:30 ص`) used
  by Activity/History, Last sign-in, the bell, payroll approval time and work-hours settings; hand-rolled
  24-hour formatting removed. Stored formats unchanged.
- 2026-11-21 — Owner: review gaps → #206 (review checklist: shared inputs, loading states + skeleton
  registration). Owner rule: **no client-side paging/search/filter/sort anywhere** — the statement (#146,
  mine) and the Approved payroll month (#171) do it; being moved to the server with a CI guard.
- 2026-11-21 — Tab switches → #211: the selected marker cross-faded (`transition-colors` on the selected
  state) so the old tab looked selected for ~150 ms; now hover-only fade, Settings sections switch with
  `history.replaceState` (no server render), a new section/tab opens at its top, My account's header stays
  mounted, Activity's module switch moves on click; guard spec 30-tab-switch. Rules added to the
  building-frontends skill (1.62.22).
- 2026-11-21 — CI-only suites → #209/#210 (owner: "are agents running tests here locally ??? or on ci",
  then "for me but not for the team"): a marker `~/.config/school-erp/e2e-ci-only` on the owner's machine
  makes `pnpm smoke`, the Playwright config and the API e2e setup refuse to start outside GitHub Actions —
  so every agent on that machine is blocked; the team runs them locally. CONVENTIONS → Where tests run.
- 2026-11-21 — Skeleton headers + capped cards → #212 (owner: "no skeleton for the action buttons and
  status pill ???? isnt that a rule"): the Approved payroll pages (from #171) were never in the skeleton
  check; now registered, page headers mark breadcrumbs/pill/actions as skeleton blocks, a coverage guard
  fails on any unregistered `loading.tsx`; 6 routes' header skeletons fixed; the month's cards scroll in a
  capped box on tablet/desktop (flow on phones).
- 2026-11-21 — Server-side lists → #213 (owner rule: no client-side paging/search/filter/sort): the
  Approved payroll month, the statement, lateness, run lines, settings lists, the catalogue, roles/actors
  and every list picker now page/search/total on the API; DataTable refuses more rows than a page; a scan
  guard fails on browser-side list code (reasoned allow-list for static config). Lateness "loads the
  whole month" (Next up) is superseded. Arabic letter variants: done in #229.
- 2026-11-21 — Housekeeping (owner: "when worktrees are done we delete them right ?" / "what about the
  177 branches"): 50 merged worktrees removed (64 GB → ~4 GB), 168 merged remote branches and 188 local
  ones deleted; merges now use `--delete-branch` and remove the agent's worktree.
- 2026-11-21 — Sidebar keeps the current page in view → #215: on load and on navigation the active
  item scrolls into the sidebar's view (a prefetch no longer counts as a server render in the guard).
- 2026-11-21 — Sign-in redesign → #218 (owner: "too basic"; split layout S2, then real photos rejected —
  "I dont want real people photos just better ilustration quality" — then Q1 · Soft 3D picked, teacher
  redrawn): a teal panel with the school brand, headline and a soft-3D office illustration beside the
  form; stacks on phones; mirrors in Arabic; gentle motion off under reduce-motion. Form behaviour
  unchanged; `TextField` takes an optional leading icon. Mockup: `design/mockups/login-s2-quality.html`.
- 2026-11-21 — Dashboard charts → #220 (owner picked mockup A · Grid, "for now make it only visible to
  the system admin"): payroll cost trend, headcount by stage with joiners/leavers, penalties and lateness,
  deductions vs net, a 6/12-month switch, a Table view per chart, an empty state under two approved months.
  Behind the new permission `hr.dashboard.view_analytics` (System admin only; grantable in Roles). Employees
  now record `deactivated_on`; the seed approves May–October; the StatTile circle no longer covers the label.
- 2026-11-22 — Two-step penalties + multi-stage employees → #222 (owner: "record penalty => approve or
  reject (reasons) => hr approval or reject (reasons)"; an employee can teach in two stages, "he would
  have two bosses"): an employee has a main stage plus "also teaches in"; each penalty records the stage
  where it happened, and only that stage's head sees and reviews it (the other head isn't told). Flow:
  Pending stage review → Waiting for HR → Approved, or Rejected at either step with a required reason;
  only HR's approval sets the level and deduction (date order, backdated recount, approved-month lock
  move there). Skips to HR when the recorder or the penalised person is that stage's head, or the stage
  has none. New permission `hr.penalties.review` (Stage head, own stage); existing Pending became Waiting
  for HR. Also fixed: between 00:00 and 02:00 Cairo the API refused hires/penalties dated today (it
  used the server's UTC day). Smoke: a race with React's streamed reveal (a hidden `S:n` copy for a
  frame) made one-shot reads see two elements on CI; every spec now waits for the stream to settle —
  CONVENTIONS → Where tests run, and the build-software skill (1.62.23). Leave (Planned) will need
  every stage head, then HR.
- 2026-11-22 — Arabic-aware database search → #229 (owner: "typing احمد wont bring أحمد"; "what about
  spaces"): a `search_fold()` SQL function (the same rules as `searchKey`: case, accents, Arabic marks
  and tatweel, أإآٱ→ا, ى→ي, ة→ه, ؤ→و, ئ→ي, odd spaces) feeds generated `search_text`/`search_compact`
  columns with pg_trgm GIN indexes on 10 tables, kept up to date by Postgres. A query matches when every
  word appears (any order) or the query without spaces appears in the joined name (عبد الرحمن ⇄
  عبدالرحمن). Covers employees, users, roles, lists, activity, penalties and payroll lines; `%`/`_` are
  literal. A parity e2e keeps the SQL and JS folds identical. ARCHITECTURE → Search.
- 2026-11-22 — Security hardening → #232 (owner: "what about security"; "the school ips might be one"):
  helmet on the API; a nonce-based CSP plus Referrer/Permissions-Policy and frame blocking on the web
  app (zod set jitless so it needs no eval); rate limits — sign-in per account+IP (10/min) with a 200/min
  per-IP ceiling so a school behind one NAT is never locked out, 300/min per signed-in user, 20/min on
  exports and uploads, 429 in EN/AR; SVG logos converted to PNG (old ones on first view); stored files
  follow their record's permission and scope (a folder registry; 404 outside scope; logo and app icons
  public); gitleaks, an advisory `pnpm audit` and Dependabot in CI. ARCHITECTURE → Security.
- 2026-11-22 — Test data out of the app bundle → #233: `SEARCH_FIXTURE` moved to
  `@school-erp/shared/testing`; a guard fails if app code imports it.
- 2026-11-22 — Dependabot removed (owner chose "remove completely"): `.github/dependabot.yml` deleted and
  its 10 open upgrade PRs (#234–#244, GitHub Actions and npm) closed; upgrades by hand, the weekly `pnpm audit` flags
  vulnerabilities.
- 2026-11-23 — Access-control review (owner: "do 2"): a fresh agent that wrote none of the code read every
  endpoint cold. Found: user and role managers had no ceiling (could make themselves System admin, grant
  any permission), self-cancel of penalties, recording in another stage, password change not ending
  sessions, no payroll separation of duties, other-stage penalty details in level previews, and smaller
  leaks. Owner: "fix all" — no self-cancel; nobody adjusts or approves their own pay. Fixes in progress →
  #258; a second fresh review of #258 found more (the employee link bypassing the ceiling, own salary
  and lateness edits, unlock without a ceiling, own-record scope widening, token edge cases), being fixed
  on the same PR. Decided on the owner's behalf: a System admin may link their own employee record
  (otherwise a sole admin never can); nobody edits their own pay or lateness.
- 2026-11-23 — Process (owner: "lets add it after each feature"): after each feature, before merge, a
  fresh agent that didn't write it reviews the diff cold (read-only, never switches a checkout); real
  findings are fixed with a test each before merging. CONVENTIONS → Review; build-software skill 1.62.25.
- 2026-11-23 — #258 round 2 pushed: only a System admin sets employee links (a System admin may set
  their own; nobody changes their own roles); unlock under the ceiling; nobody edits their own pay,
  lateness, stage, other stages or manager; recount months and payroll counts follow the penalty's stage;
  a password change kills other sessions' access tokens at once; a refresh replay follows the rotation
  chain (two tabs never log out); row locks close check-then-write races; `no-store` check is
  case-insensitive. Left: adjustments made under an earlier employee link (only an admin can move a
  link now). A third fresh review is running before merge.
- 2026-11-23 — #258 third fresh review: no critical/high. Medium: a delegated user manager could still
  take over a same-scope account in another stage (ceilings compare scope labels, not reach), and an
  unlinked account escapes the own-pay rules. Low: lock ordering, a password-change race, row-lock
  strength, old tokens after reactivation. All sent back to be fixed on #258 (round 3), with CI's 2
  API e2e failures (last-admin edge case, "doubles on repeat"). Decided: acting on pay (adjust, approve,
  salary edits) needs the account linked to its employee record, System admin aside.
- 2026-11-23 — #258 round 3 pushed: only a System admin resets the password, changes the email or unlocks
  a linked account; a non-admin can't give an unlinked account a pay-acting role, and an unlinked
  non-admin can't adjust/approve payroll or edit pay; link changes show in the audit; role locks taken
  before the ceiling read; a password change revokes other sessions inside its transaction; lighter row
  locks; `sessions_valid_after` kills old tokens after deactivate/reactivate; CI's 2 e2e failures were
  test mistakes (no rule changed). Release note: pay users must be linked to their employee record. A
  final focused review is running before merge.
- 2026-11-23 — #258 final review of round 3: one High left — an unlinked account could still change its
  own lateness or act on its own penalty, and editing a role could hand pay powers to an unlinked
  holder. Plus lows: a few pay keys missing from the pay-role list, deactivate/temporary password
  ending sessions only after commit, the actor's own roles not locked. Sent back as round 4; release
  dry run gains a check listing pay users without an employee link.
- 2026-11-23 — #258 round 4 pushed: an unlinked non-admin can no longer change lateness or review,
  approve, reject or cancel a penalty; a role edit that makes a role pay-acting is refused while any
  holder is unlinked; the pay-role list gains penalty review and plain employee edit; deactivate and
  temporary passwords end sessions inside the transaction; the actor's own roles are locked before the
  ceiling check; new release check `apps/api/prisma/checks/unlinked-pay-accounts.ts` (DRY_RUN § 2b)
  lists pay users without an employee link. Final focused review running.
- 2026-11-23 — #258 final review of round 4: nothing above Low (a possible deadlock between two role
  edits, a message wording). Last polish round plus screenshots of the screens rounds 3–4 changed, then
  merge. Note: only a System admin can create or link HR-staff accounts now.
- 2026-11-23 — Access-control fixes merged → #258, after five fix rounds and four independent reviews
  (the last found nothing above Low) and a fully green CI. Release notes: accounts that act on pay must
  be linked to their employee record (run `apps/api/prisma/checks/unlinked-pay-accounts.ts`, DRY_RUN
  § 2b, and link the ones it lists); only a System admin creates or links HR-staff accounts; a
  password change from a session opened before this release signs that session out once. Also fixed:
  the Users table overflowing its card at 1440 with long names.
- 2026-11-23 — 404 and error pages → #267 (owner picked option 2, "big number"): a real-404 page for
  wrong addresses (Back to the dashboard / Sign in), the in-app "We couldn't find that page", one
  shared error screen for every page (Try again, Back, a reference code = the server error digest,
  logged by `onRequestError`), and a minimal `global-error`. Signed-out visits to unknown sections now
  show the 404 instead of sign-in. Independent review running before merge.
- 2026-11-23 — #267 merged (404 and error pages, option 2) after an independent review (nothing above
  Low; lows fixed: the sign-in section list now fails closed, odd addresses like `/x.php` get the
  localized 404 with CSP, one not-found wording, no-store asserted) and a CI fix: a wrong `/api/…` now
  answers JSON 404 (the fallback `global-not-found` could never run and was removed).
- 2026-11-24 — Roadmap written (`docs/ROADMAP.md`): every module from the client proposal (33) plus
  the clinic, layered by what each needs, with status and three tracks (HR, school, finance). Owner
  added the clinic (students and staff) and fingerprint attendance; planning only, nothing built.
- 2026-11-24 — Contracts spec `docs/specs/2026-11-24-contracts.md` approved by the owner as drafted
  (OPEN points take their defaults). Next: three mockups of the renewals page. Nothing built until
  the owner says build.
- 2026-11-24 — Contracts renewals page: owner picked mockup **A (table)** over B (board) and C (split
  view). Mockup on the `design` branch. Build waits for the owner's go.
- 2026-11-24 — Owner said build contracts. A background agent builds it on `feature/contracts`
  (spec + layout A); an independent review follows before merge.
- 2026-11-24 — Contracts PR #275 opened. Independent review found 7 should-fix items: writes
  checked only the view scope (not the manage scope); a renewed contract couldn't be ended; a
  reactivated employee could never get a new contract; the wrong school calendar for Feb–May starts;
  last season's open rows vanished on 1 June; `ON DELETE CASCADE` on contracts (now Restrict); the
  "40 of 38" tile. Plus nits (school's note hidden, `::date` casts, reminder re-arm on withdraw).
  API e2e and phone smoke failed on CI. All sent back to the build agent; the 10 indexes on
  `employee_contracts` stay (project rule: every foreign key and filtered column).
- 2026-11-24 — **Contracts (16) merged into `dev`** (PR #275, CI all green): contract history, the
  renewals page (layout A), notices, early termination, ending for other reasons (a renewed contract
  too — its renewal is cancelled, kept), New contract and Undo not-renewing, the school calendar in HR
  rules, renewal-season reminders, earlier seasons' open rows carried over. Every review finding
  fixed with a test; screens checked (EN desktop, AR phone, loading states). The builder ran out of
  context twice; a takeover agent overlapped it briefly and stopped without pushing.
- 2026-11-24 — Owner testing locally found: "Also teaches in" offered the main stage (fixed, PR #278:
  the API leaves out the main stage and chosen ones); the salary field didn't say net (PR #279: "Basic
  monthly salary (net)", hints for basic and insured salary). Both merged.
- 2026-11-24 — Owner decisions: **Grade** becomes a configured list in Settings like departments and
  job titles (being built, `feature/employee-grades`); a renewed contract that starts next June was
  shown "Current" with Renew on it → **Current = in force today, Upcoming otherwise, no decisions
  before a contract starts** (being built, `fix/contracts-current-upcoming`); Renew stays available
  whenever a contract is open (the 1 March reminder drives the season); System admins are refused on
  their own contract like everyone (kept).
- 2026-11-24 — New rule (owner: "very important"): specs, tests and reviews **walk each record through
  time** (today moving, paths back, boundary days). Added to the `build-software` skill (1.62.26). A
  read-only time-walk review of contracts found 2 blockers (a "To deactivate" row stays after a new
  contract or reactivation; deactivating while the last month's payroll is a draft drops that month's
  pay) and 13 should-fix items (mid-year hires' season and calendar, deactivating from the employee
  page leaves the contract active, approved early termination final at once, ends can't be backdated,
  timing tags go stale, history erased on withdraw, …) plus confusing tile counts. Queued as
  contracts round 3, after the Current/Upcoming fix.
- 2026-11-24 — Merged into `dev`, each after an independent review and green CI:
  - **#283 Contracts: Current = in force today, Upcoming otherwise** — no decisions on a contract
    that hasn't started (`CONTRACT_NOT_STARTED`); employee contract dates follow the contract in force
    (synced by every contract write, the 07:00 job and once at start-up, each move in History);
    reminders read the in-force contract; "Cancel contract" for an upcoming first contract; an old
    "To deactivate" row clears once a later contract exists (time-walk blocker B1); no one deactivates
    themselves (contracts or employees page). The time walk (31 May → 1 June, the daily job) runs on CI.
  - **#282 Employee grades** — a managed list in Settings → HR lists (renamed from "grades" to leave
    that name to academics); old text grades merged case- and space-insensitively; demo "Pay grade 1–4".
    Release note: rolling back past it means restoring the backup.
  - **#284 Payroll rules panel** — bullets, one fact each; "Edit in settings" and the other settings
    links open the exact card (`?section=&part=`).
  - **#285** — employee header "Not a system user" / "System user: <name>".
  - **#281** — per-clone opt-out of unit tests on push (`git config ci.skipUnitTests true`), set on the
    owner's machine only; the team still runs them. **#286** — CI prints a failing step's full log.
- 2026-11-24 — Contract templates: owner picked mockup **A (Word-style editor)** over B and C; spec
  `docs/specs/2026-11-24-contract-templates.md` approved as drafted (#288): one school signatory in
  settings, PDFs rendered on the server (headless Chromium in the API image). Build started on
  `feature/contract-templates`. The **signed copy** upload (several pages per contract, from the
  employee form, renew and New contract too) is being built on `feature/contract-signed-copy`, pulled
  out of contracts round 3 because the owner needs it now.
- 2026-11-25 — #292 merged: dev's smoke 27 failure fixed (the Users table sat 2–3px past its card on
  desktop; Status and Last sign-in columns narrowed). The check now names each column's width when it
  fails.
- 2026-11-25 — **#290 merged: signed copy of each contract.** Pages (PDF/photos, 10 MB each, at most
  30) on every contract, uploaded from the Contracts tab, renewals, Add employee, Renew and New contract;
  removed only with a reason; every open audited. Review fixes in the same PR: uploads go through their
  own route (`/api/upload/...`, session + origin + size checked before reading), so the global Server
  Action limit stays 3 MB; one upload component shared by contracts and Add employee; 429s retried and
  failed pages named. This also fixed uploads over 1 MB (employee photos) that had been failing.
- 2026-11-25 — **#291 merged: contract templates.** HR edits contract templates in a Word-style editor
  (field chips, optional phrases, Arabic and English, versions that never change), and prints any
  contract to a PDF made on the server; each printed copy is kept on its contract (row ⋯ → Print
  contract). Review fixes in the PR: the API image ships only the built app (no source; 2.35 → 1.69 GB),
  PDF renders time out and queue with limits (503 when busy), lists don't load full texts, one History
  entry per print. CI found a real bug on the way: a rename saved a new version (stored text came back
  with its keys reordered); fixed. A penalty-dialog unit test that failed just after midnight UTC now
  pins the date.
- 2026-11-25 — **#298 merged: signed copy on the Contracts page rows** (owner's request after local
  testing). Each row on HR → Contracts shows "Signed copy (n)" (opens the viewer) or "No signed copy",
  under the contract dates, on desktop and phone cards; a renewed row shows its own (old) contract's
  copy. The dates no longer wrap at 1440 px. One shared `SignedCopyEntry` serves this page and the
  profile tab.
- 2026-11-25 — **#300 merged: table skeletons guarded.** The owner found the employee Payroll tab's
  skeleton rows shorter than the table (Status drawn as a text line, not a pill), and the ±8px check let
  it pass. Now a guard test fails any table column whose cell isn't one plain line of text and has no
  `skeleton` (default-deny), and smoke compares table rows and cards within ±2px. The tighter check
  found 7 more mismatches (Roles, Users, Lateness, payroll runs and lines, Approved payroll, Payroll
  taxes, Employees cards, Contracts decision), all fixed in the skeletons. Also fixed: the Users table
  overflowing its card by 2–3px when an account shows several status pills (dev's intermittent smoke 27).
- 2026-11-25 — **#303 merged: Discard changes in the template editor** (owner's request). Next to Save;
  enabled only when a name, the default or a text differs from the saved version; asks first, then
  restores the saved version, clears undo, sends nothing. Found on the way: the editor's invisible empty
  line after a table counted as a change — ignored now.
- 2026-11-25 — **#307 merged: Direct manager picker shows "Name · Department"** (owner's request)
  instead of the employee code; search by name or code still works. The employee record's manager now
  carries their department (same query).
- 2026-11-26 — **#306 merged: "Grade" reads "Pay grade"** in English (owner's request): the employee
  field, the Settings list ("Pay grades"), History and permissions. Arabic keeps «الدرجة الوظيفية».
  Labels only; the data and rules are unchanged.
- 2026-11-26 — **#311 merged: penalty actions spec approved** by the owner as written, **no monthly
  cap** (net floored at 0 and flagged, as today), no mockups. Build started on `feature/penalty-actions`.

## Next up

- **Contracts round 3** (owner, 2026-11-24): fix the rest of the time-walk review's findings (B1 done in
  #283; next B2: deactivating while the last month's payroll is a draft drops that month's pay);
  mid-year hires' first contract ends 31 May (one season for everyone, GUESS).



- **Dropdowns open on the chosen option** (found reviewing #307, 2026-11-25): the shared select
  highlights its first row on open while the check mark is on the chosen one, so Enter right after
  opening changes the value. Being fixed in the shared component on `fix/select-highlights-selected`.
- **Penalty actions as school data** (owner, 2026-11-25): a Settings list of penalty actions (EN/AR
  names, hide/show), each with an effect type fixed in code — record only, deduct days, deduct a % of
  salary, deduct a fixed amount, investigation (± days) — and the school setting its numbers; no free
  formulas; raise actions stay record-only until raises exist; the seed loads today's actions so nothing
  changes. Spec written (#311: numbers on the catalogue level, snapshot at approval, % of the month's salary or
  basic, no new cap). No mockups: a new list in the existing Settings design plus fields on the
  existing level editor (owner, 2026-11-25: "if mockups unnecessary dont do it"). Approved
  2026-11-26 with no cap; being built on `feature/penalty-actions`.
- **Pentest with ARTEX** (owner, 2026-11-25): try https://github.com/BaaRai/ARTEX against the app
  later — on a throwaway or testing environment, never production. Not started.
- **Employee documents tab** (proposed 2026-11-24): ID copy, certificates, insurance forms.
- **Students module, then the clinic** (owner, 2026-11-24): the clinic treats students (and staff), so the
  students module (student records, guardians, class placement, on top of academics' basic structure)
  is planned first, then the clinic on top of it. Order in `docs/ROADMAP.md`; spec not written yet.
  Planning only until the owner says build.
- **Fingerprint scanner for staff arrival and leaving** (owner, 2026-11-24): staff attendance comes from
  the device and feeds lateness (§5). Open: device brand/model and how it connects.

- Pay buttons for unlinked HR accounts: hide or disable Approve / adjust / lateness edits with the
  reason, instead of refusing on click.
- Users table fits its card with no spare width since #258 (names and emails truncate); give it room
  (fewer columns on desktop, or cards below a width) before adding a column.
- Scope widening by editing others: an employee editor can set another employee's manager to
  themselves or move them into the editor's stage, widening their own team/stage reach (found by the
  #258 review, left out of that PR).
- Client proposal (kept outside the repo): add ownership/licence, payment schedule, timeline, VAT,
  acceptance, several campuses, academics in or out — owner to fill the blanks.
- Reselling: make the repo private before selling; a written IP agreement with the team; map each new
  school's rules to settings / data / fixed.
- Sign-in follow-ups (from #218): a show/hide eye on the password box (smoke helpers must first find
  the field with `{ exact: true }`); the filled-input look and button sheen from the mockup if wanted.

- Custom icon set drawn (`design/mockups/icon-set.html`, style G monoline + solid when selected) —
  **on hold** (owner, 2026-11-20).

- Outbox nits (from #121's live test, cosmetic): the "dead after 10 failures" log line always says
  10 (after an admin retry it's 11); a dead row still gets a `next_attempt_at`. A lock held longer
  than Prisma's 15 s transaction timeout counts as one failure, then the next tick delivers it.
- Payroll taxes follow-up: the "Approved in HR" stamp has no date
  (accounting doesn't store HR's approval time). The long phone statement is paged now (#146).
- Accounting settings, from the #84 review (optional): `AccountingSettingsService.update()` now
  reads inside the write's transaction, but two simultaneous saves can still overwrite each other
  (needs a row lock or a version check); the settings e2e checks the audit entry exists but not its
  before/after values.
- **Before Sunday (owner):** on the demo DB re-run the seed (set `SEED_ADMIN_PASSWORD` in
  `apps/api/.env` to the current admin password first — the reseed resets it); deactivate "Test User",
  delete "Test Role AR"; insure 2–3 employees; add an HR officer and an Accountant login. `demo` was
  refreshed at `625de6d` (#167); #185 (search loader) came after — refresh again if wanted.
- Payroll runs could keep a snapshot of the rules they were calculated with (**Tamer**, told 2026-11-18); today
  an approved run shows current rules.
- Dry-run follow-ups (2026-11-18): the eight polish items are fixed in #99. Still open: Activity
  search in Arabic doesn't find pre-17th entries; the lateness page itself doesn't show
  "minutes − grace" per row (the rule line names the grace).

- The client should check the Arabic penalty catalogue against the printed regulations (copied from the scans).

- Sign-in limit numbers (5 wrong passwords / 15-minute window / 15-minute lock) are core settings with
  no screen yet; add them to Settings → School if a school wants to change them.

- Hosting the demo on the Contabo server (owner: later; the demo runs locally — Vercel was
  considered and dropped, 2026-11-20).
- Audit log T28 (#107), T29 + T31 (#126) done; the T30 History follow-ups are done (#188). Optional CI ratchet that forbids touching an unwired endpoint (owner: docs only for now).

- Optional: column sorting on lists (paging/search are server-side since #213).
