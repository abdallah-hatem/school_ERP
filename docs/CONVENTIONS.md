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
A machine that shouldn't run the unit tests (several agents at once heat it up) opts out with
`git config ci.skipUnitTests true` in its clone; CI still runs them on every PR.
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
- [ ] Events sent only through `DomainEvents.publish` (after the commit); must-deliver ones (`MUST_DELIVER_EVENTS`) through the outbox; listeners idempotent; `docs/EVENTS.md` updated.
- [ ] Added/changed an event, listener or transaction boundary → `docs/EVENTS.md` updated in the
      same PR; the events-doc test (`apps/api/src/common/events/events-doc.spec.ts`) checks it.
- [ ] Every new endpoint declares who may use it: `@Permission('<key>')` (or, rarely,
  `@SignedIn()` / `@Public()`) — see Permissions below.
- [ ] Every new write endpoint (POST / PATCH / PUT / DELETE) is `@Audited('<action>')` and calls
  `audit.record()` for that action in its service, or is `@NotAudited('<reason>')` (see below).
- [ ] `docs/BUSINESS_LOGIC.md` updated in the same PR if a business rule changed.
- [ ] A business change? Add **one new file** `docs/business/recent-changes/YYYY-MM-DD-NNN-<slug>.md`
      (never edit `00-recent-changes.md` or another PR's file).
- [ ] **Don't edit `docs/BUILD_LOG.md`** in a feature or fix PR. Put a short "Log entry" section in the
      PR body instead; whoever merges the PR writes the build log from it (see The PR).
- [ ] UI changes: screenshots. New or visually changed screens: EN/AR × phone/desktop (light only).
- [ ] Changed a component → updated its skeleton in the same PR, and the skeleton spec passes
      (the `23-skeletons` smoke spec, on CI; owner, 2026-11-18). A new main block gets the same
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

**No placeholders left (T29, T31).** The temporary `@NotAudited('wired in T28')` /
`('wired in T29')` markers from the audit foundation are all wired; the scan test
(`audit-declarations.spec.ts`) fails on any `@NotAudited('wired in …')`. `@NotAudited` is only for
writes deliberately not recorded, with the real reason.

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

## Security: origins, uploads, limits (2026-11-22)

`docs/ARCHITECTURE.md` → Security has the whole picture. When you add:

- **A new external origin the browser loads from** (a script, font, image host, analytics, a map, a
  direct API call): add it to the right directive in `contentSecurityPolicy`
  (`apps/web/src/lib/security-headers.ts`) and its test, in the same PR — otherwise the browser
  blocks it and the smoke spec `34-security-headers` fails on the violation. Never add
  `'unsafe-inline'` to `script-src` or drop the nonce; a third-party script goes through
  `next/script`, which carries the nonce.
- **A new upload type**: its signature goes in `detectImageType` (or a sibling for non-images), its
  rules in `packages/shared` (`maxBytes`, `mimeTypes`), and a unit test with a real file and a
  renamed one. Never trust the name or the browser's type, and never serve an uploaded document
  type a browser runs (HTML, SVG): convert it, as SVG logos are converted to PNG.
- **A new upload folder**: its owning module registers it with `FileFolders.register(<FOLDER>, {
  owner, canOpen })` on start (as `HrFileAccess` does) — `canOpen` finds the record through the
  stored link and applies that record's view permission and scope; outside it the file is 404.
  A sensitive document folder (contracts, medical, legal, investigations) also sets `permission`
  and an `onOpen` that records the opening in the audit log. Storage refuses an unregistered folder
  and `file-folders.guard.spec.ts` fails CI on one.
- **An endpoint that signs in, changes a password, exports or uploads**: `@RateLimit('auth',
  subject)` — `subject` names the account the attempt is about (the email typed, the user, the
  target user) — or `@RateLimit('heavy')` (`common/rate-limit`), next to its `@Permission`. Never a
  low limit per IP alone: a whole school may share one IP (an office NAT, its own server); count by
  account or user, with only a high per-IP ceiling. New limits are env values with their defaults
  in `env.validation.ts`, `.env.example` and the Security table.

## Lists: the server pages, searches, filters, sorts and totals (owner, 2026-11-21)

**No list is paged, filtered, sorted or searched in the browser — anywhere.** Every table, card
list and picker over database records asks the API for one page: `page`, `limit`, `search`, its
filters and order are query parameters, the repository runs the query, and the screen shows exactly
the page it got. Figures over "all N" (a month's totals, a group's subtotals, a summary line) are
worked out by the API over the whole filtered set and sent with the page — never summed in the
browser from a fully loaded list.

- **Screens:** the search, filters and page live in the URL (`?q`/`?search`, `?page`, `?limit`,
  filters); typing is debounced; the list dims and the search box spins while the next page loads.
- **Pickers:** a `SelectField` / `FilterSelect` / `Combobox` over records gets `server`
  (`useServerOptions`): the API answers each typed search (one page of 20) and the chosen record's
  name comes from the record or from the API (`?ids=` / `?id=`). Only short **code** lists (an enum)
  may be filtered by the combobox itself.
- **Search** (owner, 2026-11-22): every table a list searches gets the two generated columns
  `search_text` / `search_compact` (`search_fold` of its searched columns) with their trigram
  indexes, in its migration and as read-only fields in the Prisma schema (and `SEARCH_OMIT`), and its
  repository searches only through the shared helper (`searchWhere`, or `findAllWithPagination`'s
  `search`) — never `contains` / `mode: 'insensitive'` or `ILIKE` on name columns
  (`docs/ARCHITECTURE.md` → Search). The app never writes the search columns.
- **Exports** (Excel, print / PDF, the bank sheet) cover the whole set, read from the API — never
  the page on screen.
- **Guards:** `DataTable` throws outside production when handed more rows than its page size
  (`assertServerPage`), and `apps/web/src/test/server-lists.guard.test.ts` fails on the client-side
  idioms (the text matcher, case-folded `includes`, page slices, page counts or totals from an
  array's length, `.sort(`) outside its allow-list — static config from code or one record's own
  parts, each with its reason. A new exception needs that reason; a list of records never qualifies.

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
- **Merging (CLAUDE.md rule 5, 2026-11-20):** into `dev`, the owner or Claude on his behalf — green
  CI and a `CODEOWNERS` approval. Claude merges its own checked PRs with the admin bypass, and
  reviews, approves and merges other contributors' PRs when clean. `testing`, `production` and
  `demo`: the owner only.
- **The build log has one writer: whoever merges** (owner, 2026-11-18). Right after a merge into
  `dev`, the merger adds the PR's log entry (and updates Next up) in a small docs-only PR. Parallel
  PRs all appending to the same spot of `docs/BUILD_LOG.md` (or `00-recent-changes.md`) is what made
  them conflict; with one writer and one file per business change they don't. At the start of each
  session, compare the log with the PRs merged into `dev` and add any entry that's missing.

## Where tests run

Lint, typecheck and unit tests run locally and in CI. Smoke specs and API e2e run locally for the
team as usual. **On the owner's machine they run on GitHub CI only** (owner, 2026-11-21): a marker file
`~/.config/school-erp/e2e-ci-only` makes `pnpm smoke`, the Playwright config and the API e2e setup
refuse to start there unless `GITHUB_ACTIONS=true` — which also covers every Claude agent on that
machine. A failure is fixed from CI's logs and artifacts. Review screenshots come from a short headless
capture script on a throwaway stack, not the suites.

**Streamed pages: read only after the stream settles** (2026-11-22). Next.js streams a page's content
after its shell: the content arrives as a hidden copy (`<div hidden id="S:0">`) and React swaps it in
on the next animation frame. Until then the same element exists twice. A one-shot read
(`textContent()`, `evaluate()`, a strict `getByText`) that lands in that gap fails with "resolved to 2
elements"; the gap is longer on busy CI runners and grows with more data. That is why it never showed
locally and appeared on #222 only once its seed added two users. Every smoke spec therefore calls
`settleStreams()` (`apps/web/e2e/support/stream.ts`), which makes each `goto` wait until no hidden
`S:` copy is left (10 s; longer is a real bug and fails with the page and ids), and logs the longest
wait per file. Prefer retrying assertions (`toHaveText`, `toHaveCount`) for values anyway. Image checks
ignore images inside a hidden streamed copy and lazy images below the fold (neither loads until shown).

**Tests create data the way the app does** (2026-11-22): through the API, or a shared fixture that
applies the same rules — not by writing rows straight to the database, unless the test is about the
database itself. A row the API would refuse (a violation with no levels) breaks other screens in ways
that look like app bugs (#229's penalties search returned 500 only because its test made one).

## Review

What reviewers check:

1. The rules match the business doc.
2. Layers: no Prisma outside repositories and `database/`, no rules in controllers, no reaching into
   another module's repository.
3. Reuse: nothing written twice.
4. Permissions enforced on the backend, not just hidden in the UI.
5. Edge cases tested, including a cross-user/permission test for id endpoints.
6. i18n and RTL: both languages, logical classes, nothing hardcoded.
7. Shared building blocks, not hand-rolled copies: money and number inputs go through `MoneyField` /
   `MoneyInput` / `GroupedNumberInput`, tables through `DataTable`, search through `SearchInput`.
8. Every new screen is looked at in its **loading** state too, not only loaded: the skeleton traces the
   whole page — header buttons, status pills, tabs, filters — and the route is listed in the skeleton
   shape check (`apps/web/e2e/support/skeletons.ts`). Screenshots in the PR show loaded and loading.

How:

- **An independent review on every feature before merge** (owner, 2026-11-23): a fresh agent that wrote
  none of it reads the diff cold — read-only, never switching a checkout — and reports findings ranked
  by severity with the exact path to each (access control, business rules, leaks). The author checks
  each in the code; real ones are fixed with a test that fails without the fix, the rest go to the
  owner.
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
