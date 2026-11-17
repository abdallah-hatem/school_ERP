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

## Next up

- `pnpm smoke` in CI (needs Postgres + Chromium in the workflow).
- The client should check the Arabic penalty catalogue against the printed regulations (copied from the scans).

- Login rate limiting (T2 left it out; security baseline).
- Write the settings history in the same transaction as the change (outbox), instead of right after.

- Hosting the demo on the Contabo server (owner: later; local demo is the fallback).
- Roles, permissions and security section for `docs/ARCHITECTURE.md` (drafted in chat, not yet approved).
- Branch protection on `dev`, `testing` and `production` once CI exists.
- Optional: server-side paging for lateness (loads the whole month today) and column sorting.
- Employee profile shows the list's skeleton while loading (`employees/loading.tsx` wraps `[id]`).
- The stage "None" band is detected by its English name; key it by an id instead.
