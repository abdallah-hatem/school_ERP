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

**First month or two: Abdallah reviews every PR** while the patterns settle. After that, module
PRs need one developer review (Tamer ↔ Waleed, or Abdallah).

## Branches

- `production` — what the schools run. Changed only by release PRs.
- `dev` — default branch, integration, auto-deploys to the **dev** environment.
- Work branches cut from `dev`: `feature/<name>`, `fix/<name>`, `chore/<name>`.
- Commit messages: conventional (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- Never push straight to `dev` or `production`. Branch protection enforces it.

## Before opening a PR

- [ ] One task per PR, small — aim for under ~400 changed lines. Split big features.
- [ ] `lint`, `typecheck` and tests pass locally.
- [ ] Every new user-facing string exists in both `en` and `ar`.
- [ ] Schema changes include their migration. Never edit a migration that has been applied.
- [ ] No school name, school-specific rule or hardcoded setting in code.
- [ ] Nothing duplicated that already exists in `common/`, `shared/` or another module.
- [ ] Events emitted only after the write is committed; listeners are idempotent.
- [ ] `docs/BUSINESS_LOGIC.md` updated in the same PR if a business rule changed.
- [ ] UI changes: screenshots. New or visually changed screens: light/dark × EN/AR.

## The PR

- Targets `dev`. Title: `feat: <what it does>` (or `fix:` / `chore:`).
- Body (the template fills this in): what changed and why, the business rule (§ in the business
  doc), the test command and its result, the edge cases covered, screenshots.
- **(team rule)** Claude opens PRs but **does not merge them**. A human approval is required.

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
- The **author merges** after approval and green CI — **squash** into `dev`, delete the branch.

## Environments and QA

Three environments on our server: **dev**, **testing** and **prod** (see `docs/ARCHITECTURE.md` →
Hosting).

- Every merge to `dev` deploys to the **dev** environment. Operations (Hafez / Arousi) test each
  ticket there and report issues as new tickets.
- A broken dev environment is fixed on a new `fix/` branch and PR, never by pushing to `dev`.
- **testing** gets the release candidate before each release. It's where full QA, the school's
  review, and speed/load checks with realistic data happen.

## Releases

- Fixed rhythm, e.g. **every two weeks**.
- **Release candidate:** build `dev` as `vX.Y.Z-rc.N` and deploy it to **testing**. Fixes go through
  `dev` as usual and produce `rc.N+1`.
- Release PR: `dev` → `production`, title `release: <summary>`, with short release notes for the
  school. It must contain exactly the commit that passed on testing.
- Approvals: **Abdallah** (technical) + **Hafez or Arousi** (QA sign-off on testing).
- Merge with a **merge commit — never squash** `dev` into `production`.
- **(team rule)** No Vercel: the merge builds and tags a Docker image (`vX.Y.Z`) in CI, then each
  school's prod deployment is moved to that tag, school by school. Each runs its migrations first,
  and the rollout stops on the first failure.
- Record which version each school runs.

## Hotfixes

Same path, faster: `fix/<name>` → PR into `dev` → check on dev → rc on testing → release PR →
deploy. Never commit a fix straight to `production`.

## Tickets

- One shared board. The operations contact turns school requests into tickets.
- Abdallah sizes each ticket and classifies it: **setting**, **change to an existing module**, or
  **new module**.
- The weekly sync reviews the board.
