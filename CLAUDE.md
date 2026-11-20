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
5. **Into `dev`: the owner merges, and Claude merges for him** (owner, 2026-11-20). `dev` needs green
   CI and one `CODEOWNERS` approval, so other contributors (Tamer) can't merge on their own. Claude
   merges its own green, screen-checked PRs with `gh pr merge --admin` (they come from the owner's
   account, which can't approve itself), and reviews others' PRs — code plus screenshots — then
   approves and merges them when clean, or reports what must change. **Into `testing`, `production`
   and `demo`: only the owner** — Claude never merges there and never uses `--admin` there. Direct
   pushes are blocked. **Before opening any PR, merge the latest
   `origin/dev` into the branch** and resolve conflicts there (GitHub refuses branches that are
   behind). Every agent brief says so.
6. **No Vercel. Our own Contabo VPS runs Coolify with three environments: dev, testing and prod.**
   Three branches, promoted one way: `dev` → `testing` → `production` (merge commits, never squash).
   `dev` and `testing` auto-deploy their environments. `production` builds a versioned Docker image
   in CI that is rolled out per school. Release PRs go from `testing` to `production`, not from `dev`. Ignore the skill's Vercel preview
   steps: run the smoke specs against dev, and the full checks against testing. Server setup follows
   `deploying-to-vps`; details are in `docs/ARCHITECTURE.md` → Hosting.
7. **Never cache pages at Cloudflare.** Only static files. Every page is per-user.
8. **A demo dry run is part of Verify and of every release.** Before a client demo or a release PR
   `testing` → `production`, walk `docs/demo/DEMO_SCRIPT.md` on a **copy** of the database
   (`docs/demo/DRY_RUN.md`), Arabic then English then phone width, checking money by hand. Record it
   in `docs/demo/dry-runs/YYYY-MM-DD.md` and turn findings into fixes or Next-up items. Update the
   script in the same PR as any change to a screen it covers.
9. **Mockups first for layout and navigation changes.** Changing how a screen lays out its content
   (table → cards, list → board) or the navigation (sidebar groups/order) is a big design change:
   show mockups (three options, AR + EN, phone + desktop) **before** building, without being asked,
   and build only the picked option.

## Facts the skill cannot know

- **Every write is audited — new or existing.** Any endpoint that changes data or access is
  `@Audited('<action>')` and records it with `audit.record()` in its service (`docs/CONVENTIONS.md` →
  Audit log). An endpoint still marked `@NotAudited('wired in T28')` / `('wired in T29')` is wired in
  **the same PR** as any change to it or to the service method behind it — never left for later, even
  when the task is about something else (tax, a new field, a fix). `@NotAudited('<reason>')` is only
  for writes that are deliberately not recorded (e.g. a token refresh).

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
- **Module order:** `core` ← `hr` ← `academics` ← `students` ← the rest ← `accounting` (top). Accounting
  exists for payroll taxes only (worked out when HR approves a month, owned by Tamer — plan
  `docs/plans/2026-11-18-accounting-plan.md`); journal entries and the rest of accounting are Planned.
  Depend only downward, no cycles. HR is built first. An employee is not a user (optional link).
  Stages live in `core/school-structure`. Module rule settings live in their module.
- **Design:** direction "Campus", teal + sunflower palette, **light theme only** (no dark tokens, no
  theme toggle — overrides the skill's light/dark rule), fully responsive (desktop, tablet, phone),
  English default (owner, 2026-11-17), Arabic fully supported with RTL. Reference mockup: `design/mockups/b-campus.html` (committed, lead-owned;
  `design/audit/` and `design/assets/` stay local).
- **Client material** (school name, logo, the penalty regulations) is seed data only. It never goes
  in code or docs.
