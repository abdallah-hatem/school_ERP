# Conventions — branches, PRs, reviews, releases

These build on the `build-software` skill's flow. The two places we differ from it are marked
**(team rule)** and are also in `CLAUDE.md`.

## Ownership

| Area | Paths | Review by |
|---|---|---|
| Shared code | `apps/api/src/core/`, `common/`, `config/`, `database/`, `prisma/`, `apps/web/src/core/`, `shared/`, `lib/`, `packages/`, `deploy/`, `.github/`, `docker-compose.yml`, root `package.json` | Abdallah (enforced by `CODEOWNERS`) |
| Module code | `apps/api/src/modules/*`, `apps/web/src/modules/*`, their route pages | One other developer |

Grey areas:

- A module adding **its own new table** → module review, plus a look from Abdallah (schema).
- A module **changing another module's** service → shared-code review.
- **Adding a dependency** → Abdallah reviews.

Into `dev`, a PR needs only green CI (see Branches); reviews are asked for, not enforced. **First
month or two: ask Abdallah to review every PR** while the patterns settle, and always for shared
code. Releases into `testing` and `production` always need Abdallah's approval.

## Claude Code setup (once per clone)

Everyone uses the same skills, so Claude follows the same rules for all of us.

1. Open the repo in Claude Code and **trust the folder** when asked. That registers the
   `abdallah-hatem` skills marketplace from `.claude/settings.json`.
2. Install the skills for this project:
   ```bash
   claude plugin install abdallah-skills@abdallah-hatem --scope project
   ```
3. Start a new session (or run `/reload-plugins`). The skills then show up as `/abdallah-skills:<skill>`.
4. Keep the plugin updated, so everyone runs the same version.

The repo's `CLAUDE.md` overrides the skills where they differ, and it reaches everyone through git.
Personal Claude settings and memory stay personal; anything the team must follow goes in `CLAUDE.md`.

## Branches

Code moves one way: **`dev` → `testing` → `production`**. Each branch deploys its own environment.

- `dev` — default branch, integration, auto-deploys to the **dev** environment.
- `testing` — release candidate, auto-deploys to the **testing** environment. Changed only by a
  PR from `dev`.
- `production` — what the schools run. Changed only by a release PR from `testing`.
- Work branches cut from `dev`: `feature/<name>`, `fix/<name>`, `chore/<name>`.
- Commit messages: conventional (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- Branch protection (owner, 2026-11-17):

  | Branch | How code lands | Needs |
  |---|---|---|
  | your work branch | push freely (the pre-push hook runs `pnpm ci:local`) | — |
  | `dev` | a PR | **green CI**; no approval — the author merges when CI passes |
  | `testing`, `production` | a PR (`dev` → `testing`, `testing` → `production`) | **green CI and the owner's approval** |

  Nobody pushes straight to `dev`, `testing` or `production`, and they can't be force-pushed or
  deleted.

## Before opening a PR

**Local CI runs on every `git push`.** `pnpm install` sets up a pre-push hook that runs
`pnpm ci:local` — the exact checks CI runs (lint, typecheck, unit tests, module rules; ~1 minute,
faster when Turbo's cache hits). A failure stops the push and prints the error; full logs are in
`.ci-local/`. CI calls the same script, so passing locally means passing in CI. Before a PR that
touches the API, the database or a screen, also run `pnpm ci:local --full` (adds API e2e and the
smoke specs; needs Docker). Don't skip the hook with `--no-verify`; if it's wrong, fix the hook.
GitHub also runs API e2e and the smoke specs (desktop-en and phone-ar shards) on every PR. A PR
whose own changes are all docs (`docs/`, `design/mockups/`, any `*.md`) passes those two in seconds
without running them; lint, typecheck, unit tests and module rules still run in full.
Into `dev`, a PR merges once its own four checks pass; it doesn't have to be up to date with `dev`
(owner, 2026-11-18). The full suite then runs again on `dev` after every merge; if that run fails,
fixing `dev` comes before anything else. `testing`, `production` and `demo` still require an
up-to-date branch.

- [ ] **Your branch has the latest `dev` merged in** (owner, 2026-11-17): `git fetch origin && git
      merge origin/dev`, resolve conflicts, re-run the checks, then open the PR, so conflicts are
      solved on your branch. Later merges into `dev` don't make you update it again; `testing`,
      `production` and `demo` still refuse a branch that is behind. `pnpm ci:local` warns when it is.
- [ ] A new module? Its plan is in `docs/plans/` (see Plans below).
- [ ] One task per PR, small — aim for under ~400 changed lines. Split big features.
- [ ] The push went through the local CI hook (and `pnpm ci:local --full` for API, DB or UI changes).
- [ ] Every new user-facing string exists in both `en` and `ar`.
- [ ] Schema changes include their migration. Never edit a migration that has been applied.
- [ ] No school name, school-specific rule or hardcoded setting in code.
- [ ] Nothing duplicated that already exists in `common/`, `shared/` or another module.
- [ ] Events emitted only after the write is committed; listeners are idempotent.
- [ ] Added/changed an event, listener or transaction boundary → `docs/EVENTS.md` updated in the
      same PR; the events-doc test (`apps/api/src/common/events/events-doc.spec.ts`) checks it.
- [ ] Every new endpoint declares who may use it: `@Permission('<key>')` (or, rarely,
  `@SignedIn()` / `@Public()`) — see Permissions below.
- [ ] Every new write endpoint (POST / PATCH / PUT / DELETE) is `@Audited('<action>')` and calls
  `audit.record()` for that action in its service, or is `@NotAudited('<reason>')` (see below).
- [ ] Changed an **existing** write endpoint, or the service method behind it, that is still marked
  `@NotAudited('wired in T28')` / `('wired in T29')`? Wire its audit in this PR (see below).
- [ ] `docs/BUSINESS_LOGIC.md` updated in the same PR if a business rule changed.
- [ ] A business change? Add **one new file** `docs/business/recent-changes/YYYY-MM-DD-NNN-<slug>.md`
      (never edit `00-recent-changes.md` or another PR's file).
- [ ] **Don't edit `docs/BUILD_LOG.md`** in a feature or fix PR. Put a short "Log entry" section in the
      PR body instead; whoever merges the PR writes the build log from it (see The PR).
- [ ] UI changes: screenshots. New or visually changed screens: EN/AR × phone/desktop (light only).
- [ ] Changed a component → updated its skeleton in the same PR, and the skeleton spec passes
      (`pnpm smoke 23-skeletons`; owner, 2026-11-18). A new main block gets the same
      `data-skeleton-block` on both sides; a new screen with a skeleton is added to the spec
      (`docs/ARCHITECTURE.md` → Skeletons match their screens).

## Plans: a new module starts with one

A PR that adds a new module — a folder under `apps/api/src/modules/` or `apps/web/src/modules/` that
`dev` doesn't have — must include (or find on `dev`) a plan in `docs/plans/` whose file name contains
the module's name, e.g. `docs/plans/2026-11-18-accounting-plan.md`, with its **Spec** (link the spec
and the business section), its **Tasks** (with classes) and the **Edge cases** of the logic tasks —
the shape of `docs/plans/2026-11-17-audit-log-plan.md`. `pnpm ci:local` (push hook and CI) runs
`scripts/check-module-plans.sh` and fails without it. The check doesn't judge the plan; review does.

## Audit log: every write is an action

Every action that changes data or access is recorded in the audit log (§9, `docs/ARCHITECTURE.md` →
Transactions and the audit log). For a new write endpoint:

1. Pick its action key in `packages/shared/src/audit.ts` (`AUDIT_ACTIONS`). A new action: add the key
   (`<module>.<record>.<verb>`, e.g. `hr.employee.update`) with its module, entity type and kind,
   then its sentence under `actions.<key path>` in **both** `locales/en/audit.json` and
   `locales/ar/audit.json` (Arabic in the verbal-noun form, e.g. "تعديل بيانات الموظف {entity}"), and a
   label under `fields.` for any new field. The shared tests fail on a key without a sentence in either
   language, or a sentence without a key.
2. Put `@Audited('<action>')` on the controller handler.
3. In the service, inside the handler's transaction, call
   `audit.record({ action, entity: { type, id, label }, before, after })` — the repositories it
   writes with must use `TransactionHost` (`txHost.tx`) so the change and the entry commit together.
   Call it on the no-change path too (it writes nothing then).
4. Tests: the entry exists with the right action, record, actor and changed fields; a rolled-back
   change leaves none.

A write that is deliberately not recorded (e.g. a token refresh) gets `@NotAudited('<why>')`. A
handler with neither fails the controller scan in CI.

**Existing writes too (owner, 2026-11-18).** Some endpoints still carry the temporary
`@NotAudited('wired in T28')` / `('wired in T29')` placeholders from the audit foundation. Whoever
changes one of them — the handler or the service method behind it, for any reason (a new rule, a new
field, a fix) — wires its audit in the same PR: replace the placeholder with `@Audited('<action>')`,
call `audit.record()` in the service (both names: `label: { en, ar }`), add the test that the entry is
written. The placeholders are a to-do list for T28/T29, not a permission to skip.

## Permissions: every endpoint declares who may use it

A new endpoint is **`@Permission('<key>')` + `@Audited('<action>')`** (the audit one for writes).
The API refuses anything undeclared (403) and CI fails on it (`docs/ARCHITECTURE.md` → Permissions).

1. Use an existing key from `packages/shared/src/permissions.ts` (`PERMISSIONS`) when one fits —
   viewing a list and its records share `<area>.view`.
2. A new key: add it under its module (`<module>.<area>.<action>`, e.g. `hr.leave.approve`), then its
   `label` and `description` under `keys.<key path>` in **both** `locales/en/permissions.json` and
   `locales/ar/permissions.json` (Arabic in the verbal-noun form, e.g. "اعتماد الإجازات"). The shared
   tests fail on a key without both.
3. Put `@Permission('<key>')` on the handler (several keys: all are required). Import it from the
   core front door: `import { Permission } from '../../../../core/permissions'`.
4. In the web app, hide the action from users who can't use it: `<Can permission="<key>">` or
   `useCan()`, and give a menu item its `anyOf`. This is only the view — the guard still decides.
5. `@SignedIn()` (any signed-in user) and `@Public()` (no session) are rare and reviewed: the scan
   lists them, so adding one changes a test.

## Design changes: mockup first

- **Small** (a new field, a tweak inside the existing design system): build it, show screenshots.
- **Big** (a new screen type, a restyle, or changing how a screen lays out its content — a table
  becoming cards — or the navigation structure): make **three mockups** first (Arabic + English,
  phone + desktop), get the owner's pick, then build only that. Mockups live in `design/mockups/`.
- Whoever builds it — a developer or Claude — shows the mockups without being asked.

## The PR

- Targets `dev`. Title: `feat: <what it does>` (or `fix:` / `chore:`).
- Body (the template fills this in): what changed and why, the business rule (§ in the business
  doc), the test command and its result, the edge cases covered, screenshots.
- The body ends with a **Log entry**: two or three lines for the build log — what changed, decisions
  taken, anything left open.
- **Merging into `dev`:** green CI, no approval needed (CLAUDE.md rule 5); `testing` and `production`
  need the owner's approval and Claude never merges them.
- **The build log has one writer: whoever merges** (owner, 2026-11-18). Right after a merge into
  `dev`, the merger adds the PR's log entry (and updates Next up) in a small docs-only PR. Parallel
  PRs all appending to the same spot of `docs/BUILD_LOG.md` (or `00-recent-changes.md`) is what made
  them conflict; with one writer and one file per business change they don't. At the start of each
  session, compare the log with the PRs merged into `dev` and add any entry that's missing.

## Review

What reviewers check:

1. The rules match the business doc.
2. Layers: no Prisma outside repositories and `database/`, no rules in controllers, no reaching into
   another module's repository.
3. Reuse: nothing written twice.
4. Permissions enforced on the backend, not just hidden in the UI.
5. Edge cases tested, including a cross-user/permission test for id endpoints.
6. i18n and RTL: both languages, logical classes, nothing hardcoded.

How:

- Review within **one working day**.
- Mark comments **must fix** or **nit**. Nits don't block.
- Comments are about the code, not the person.
- Into `dev`: the **author merges** once CI is green (no approval required; ask for a review when
  you want one — always for changes to core or shared code). Merge commit, delete the branch.
- Into `testing` / `production`: the owner approves and merges.

## Environments and QA

Three environments on our server: **dev**, **testing** and **prod** (see `docs/ARCHITECTURE.md` →
Hosting).

- Every merge to `dev` deploys to the **dev** environment. Operations (Hafez / Arousi) test each
  ticket there and report issues as new tickets.
- A broken dev environment is fixed on a new `fix/` branch and PR, never by pushing to `dev`.
- Every merge to `testing` deploys to the **testing** environment. It's where full QA, the
  school's review, and speed/load checks with realistic data happen.

## Releases

- Fixed rhythm, e.g. **every two weeks**.
- **Release candidate:** PR `dev` → `testing`, title `rc: <summary>`. Approved by Abdallah. Merge
  with a **merge commit**. Problems found on testing are fixed through `dev` as usual, then
  `dev` → `testing` again.
- **Release:** PR `testing` → `production`, title `release: <summary>`, with short release notes for
  the school. It contains exactly what passed on testing.
- Approvals: **Abdallah** (technical) + **Hafez or Arousi** (QA sign-off on testing).
- Promotion PRs (`dev` → `testing`, `testing` → `production`) use a **merge commit — never squash**,
  so the three branches keep the same history.
- **(team rule)** No Vercel: the merge builds and tags a Docker image (`vX.Y.Z`) in CI, then each
  school's prod deployment is moved to that tag, school by school. Each runs its migrations first,
  and the rollout stops on the first failure.
- Record which version each school runs.
- **A release PR into `production` needs a passed dry run** (below) on the exact build being
  released. Link its record in the PR.

## Demo dry run (before every client demo and every release)

Automated tests prove the pieces work; a dry run proves the **story** works in front of a person.
It finds what tests don't: a warning that's out of date until you press another button, a picker
with no search, wrong Arabic grammar, a Save button nobody finds.

**When**
- Before every client demo (at least one day before, so there's time to fix).
- Before every release PR `testing` → `production`.
- After any change to a screen that is part of the demo script.

**Who:** the lead developer drives; one operations person (Hafez or Arousi) watches as "the
client" and notes anything confusing. Either can run it alone if needed.

**How**
1. Use a **copy** of the demo/testing database — never the real data you'll demo from or a school's
   production data. `docs/demo/DRY_RUN.md` has the commands.
2. Run the built app (production build, not dev mode), signed in as a normal user.
3. Walk the script in `docs/demo/DEMO_SCRIPT.md` step by step, **in Arabic first, then English**,
   then the key screens **on a phone width**.
4. **Check the numbers by hand** at each money step (day value, deductions, net, payslip totals).
5. Note every finding, however small, with the screen and what felt wrong.
6. Afterwards: delete the copy, stop the servers.

**Output**
- A record in `docs/demo/dry-runs/YYYY-MM-DD.md`: build (commit), who, what passed, findings.
- Each finding becomes a ticket (or an item in `docs/BUILD_LOG.md` → Next up) marked
  **must fix before the demo** or **later**. Must-fix items are fixed, then the affected steps are
  walked again.
- Update the script when the product changes, in the same PR as the change.

## Hotfixes

Same path, faster: `fix/<name>` → PR into `dev` → check on dev → `dev` → `testing` → check →
`testing` → `production`. Never commit a fix straight to `testing` or `production`.

## Tickets

- One shared board. The operations contact turns school requests into tickets.
- Abdallah sizes each ticket and classifies it: **setting**, **change to an existing module**, or
  **new module**.
- The weekly sync reviews the board.
