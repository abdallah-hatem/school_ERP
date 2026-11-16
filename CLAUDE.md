# School ERP — instructions for Claude

Read this file, then `docs/PROJECT.md`, `docs/ARCHITECTURE.md` and `docs/CONVENTIONS.md`, before
any work. This project uses the `build-software`, `building-backends` and `building-frontends`
skills. **Where this file differs from a skill, this file wins.**

## Overrides of the skill defaults

1. **Backend modules live in `apps/api/src/modules/<name>/`, not `src/domains/`.** Point the lint
   config's folder constants (the cross-domain import rule) at `src/modules/`.
2. **Frontend endpoints: one `apis.ts` per module** — `apps/web/src/modules/<name>/apis.ts`
   (`"use server"`), all built on the shared `apiFetch` in `src/lib/api.ts`. No single global
   `src/apis.ts`.
3. **`packages/shared` exists even though there is no mobile app.** It holds zod schemas, API
   types, permission / setting / module keys, enums, locale files and tokens.
4. **Frontend is split into `core/`, `shared/` and `modules/`** — see `docs/ARCHITECTURE.md`.
5. **PRs into `dev` are not merged by Claude.** Open the PR, then stop: a human approval is required
   (branch protection + `CODEOWNERS`). Merge only after approval and green CI.
6. **No Vercel. Our own Contabo VPS runs Coolify with three environments: dev, testing and prod.**
   Three branches, promoted one way: `dev` → `testing` → `production` (merge commits, never squash).
   `dev` and `testing` auto-deploy their environments. `production` builds a versioned Docker image
   in CI that is rolled out per school. Release PRs go from `testing` to `production`, not from `dev`. Ignore the skill's Vercel preview
   steps: run the smoke specs against dev, and the full checks against testing. Server setup follows
   `deploying-to-vps`; details are in `docs/ARCHITECTURE.md` → Hosting.
7. **Never cache pages at Cloudflare.** Only static files. Every page is per-user.

## Facts the skill cannot know

- **One deployment and one database per school.** No `school_id` anywhere. No branches/campuses for
  now (no `branch_id`) — keep data access in repositories so it can be added later.
- **Per-school differences come from settings and feature flags, never from code.** No school's
  name, rule or `if (school === ...)` in the code. Truly bespoke code goes in a
  `custom/<school-slug>` folder loaded only for that school — rare, and needs the lead's approval.
- **English and Arabic from day one.** Identical key sets in `en` and `ar`; logical RTL classes.
- **Self-hosted schools receive the built Docker image, never the source.**
- **Full domain modelling (`domain/` folder, pure rules, heavy unit tests) only in `fees`, `exams`
  and HR's payroll and penalties.** Other modules keep their logic in services.
- **Modules talk only through another module's exported service or through events.** Never import
  another module's repository. Reading other modules' tables is allowed; writing them is not.
- **Module order:** `core` ← `hr` ← `academics` ← `students` ← the rest (← `accounting`, Planned).
  Depend only downward, no cycles. HR is built first. An employee is not a user (optional link).
  Stages live in `core/school-structure`. Module rule settings live in their module.
- **Design:** direction "Campus", teal + sunflower palette, **light theme only** (no dark tokens, no
  theme toggle — overrides the skill's light/dark rule), fully responsive (desktop, tablet, phone),
  Arabic default with full RTL. Reference mockup: `design/mockups/b-campus.html` (local, not
  committed).
- **Client material** (school name, logo, the penalty regulations) is seed data only. It never goes
  in code or docs.
