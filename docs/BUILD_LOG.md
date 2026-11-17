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
| 6 | Build | merged: T1 (#4), T6 (#6), T5 (#7). Running: T2, T3, T4 (finishing: dedupe + HR-settings fix), T7, T8 |
| 7 | Verify | — |
| 8 | Ship | local demo; hosting later |

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

## Next up

- Hosting the demo on the Contabo server (owner: later; local demo is the fallback).
- Roles, permissions and security section for `docs/ARCHITECTURE.md` (drafted in chat, not yet approved).
- Branch protection on `dev`, `testing` and `production` once CI exists.
