# Build log

Run state for `build-software`. The log is updated the moment each step lands. Details for each
phase live in `docs/build-log/`.

- **Run mode:** Guided (chosen 2026-11-17).
- **Goal:** the foundation plus a thin real HR module for the client demo on **Sunday 2026-11-22**,
  run locally (hosting later).
- **Mode:** new app (the repo has docs only, no app code).
- **Design:** direction "Campus", picked from three mockups (`design/mockups/b-campus.html`, kept
  locally, not committed). Light theme only, responsive (desktop, tablet, phone), EN and AR.

- **Merging (temporary):** the owner allowed Claude to push and merge **verified** task PRs into
  `dev` until the demo on 2026-11-22 (2026-11-17). This overrides `CLAUDE.md` rule 5 for this build
  only; `testing` and `production` still need the owner.

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

## Next up

- **Accounting payroll taxes screen** — a page per approved month (net, insurance share, income tax,
  fund, gross per employee) and a sidebar entry: **mockups first** (CLAUDE.md rule 9). The API
  (`GET /accounting/payroll[/:month]`) is built. Tax defaults are GUESS until the accountant confirms.
- Accounting settings, from the #84 review (optional): `AccountingSettingsService.update()` now
  reads inside the write's transaction, but two simultaneous saves can still overwrite each other
  (needs a row lock or a version check); the settings e2e checks the audit entry exists but not its
  before/after values.
- **Before Sunday (owner):** on the demo DB run `prisma migrate deploy`, then `db:seed` once with the
  same `SEED_ADMIN_PASSWORD`. Until T28/T29 land, open Activity in the demo only for a settings change.
- Access decisions from #89: Principal/Accountant can't read HR rules on Lateness and the payroll run
  (recommended: the endpoints return the rule they used); should Stage head / Direct manager see
  Settings (Structure, Catalogue, read-only)?
- Dry-run follow-ups (2026-11-18): payslip doesn't say grace minutes were taken off; bank sheet lacks
  bank/account/IBAN and a total row; dashboard tab title lacks the school name; desktop sidebar cuts
  the Arabic school name; photo help text still says "neutral silhouette"; no Recalculate hint after
  HR rules change; phone cancelled-penalty card squeezes the name; once-per-day message shows twice.
  Activity search in Arabic doesn't find pre-17th entries.

- The client should check the Arabic penalty catalogue against the printed regulations (copied from the scans).

- Login rate limiting (T2 left it out; security baseline).
- Write the settings history in the same transaction as the change (outbox), instead of right after.

- Hosting the demo on the Contabo server (owner: later; local demo is the fallback).
- Audit log T28 (Waleed: auth, settings, employees, lists) and T29 (Tamer: penalties, lateness,
  payroll), then T31 verify. Optional CI ratchet that forbids touching an unwired endpoint (owner: docs only for now). Follow-ups from T30: id fields
  (`departmentId`) show raw ids unless T28 stores names; penalties don't appear on the employee's
  History; payroll run page has no History tab yet; smoke History check still asserts the empty
  state (`TODO(T28)`).

- Optional: server-side paging for lateness (loads the whole month today) and column sorting.
- The stage "None" band is detected by its English name; key it by an id instead.
- Small leftovers from #88: UserForm makes its temporary password during render (hydration
  mismatch); the Users list uses its own Clear filters instead of the shared one; the History tab's
  skeleton assumes entries, so it still jumps while History is empty (until T28).
