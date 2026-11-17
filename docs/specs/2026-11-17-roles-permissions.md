# Spec — Roles and permissions (core)

Status: **approved to build with Claude's answers marked GUESS** (owner, 2026-11-17: "you answer
those for now until we are sure"). Every GUESS below is shown to the owner and the client to confirm;
changing one later is data (role settings), not code. Feature mode, guided.

## Why

Today there is one role (HR admin) that can do everything. The client's approval chain needs
different people to see and do different things, and every new module must declare who may use
each endpoint from its first line of code.

## Two deliveries

1. **Skeleton (P1)** — lands right after the audit foundation (T27), before HR work starts:
   permission keys, `@Permission` / `@Public`, the global guard, the CI scan, `can()` in the web
   app. The HR admin holds every permission, so nothing changes for users.
2. **Full roles (P2–P4)** — built in core in parallel with HR work: roles as data, users screen,
   roles screen, scopes, password reset.

## Decisions

| # | Decision | Why |
|---|---|---|
| R1 | **Permissions** are typed keys in `packages/shared`, `<module>.<area>.<action>` (`hr.payroll.approve`), each with EN/AR label and description, grouped by module. | Typos fail typecheck; the roles screen lists them in both languages. |
| R2 | **Roles** are data: a role is a named set of permissions. A user can hold several roles; their permissions are the union. | Per-school differences come from data, never code. |
| R3 | One **global guard** in core checks every request. An endpoint declares `@Permission('key')` (or several, all required) or `@Public()`. No declaration → **refused** (closed by default). | Modules never write permission logic. |
| R4 | A **CI test** scans every controller: a handler with neither `@Permission` nor `@Public` fails the build. | New modules can't ship unguarded endpoints. |
| R5 | **Scopes** limit which rows a permission covers: `all`, `own_stage`, `own_team` (the employees whose direct manager is the user's linked employee), `self`. A role grants a permission with a scope. Core gives the module a `scopeFor(user, key)` helper; the module applies it in its repository query. | Only the module knows what "my team" means for its data. |
| R6 | The web app gets the user's permissions with the session; `can(key)` hides buttons, tabs and sidebar items. The guard is the protection, `can()` is only the view. | Nobody sees a button they can't use. |
| R7 | **Salary is its own permission** (`hr.employees.view_salary`): without it, salary fields are left out by the API, not just hidden. | Salaries are the most sensitive data in HR. |
| R8 | Role and user changes are audited (`core.role.*`, `core.user.*`). A user can't remove the last **System admin**. | No lock-out; every access change is traceable. |
| R9 | Users are created by a System admin (no self sign-up), may be linked to one employee, can be deactivated (sessions end at once). Admin can set a temporary password; users change their own password. | §2 already says accounts are created, not signed up for. |

## Starting roles (GUESS)

| Role | Can do | Scope |
|---|---|---|
| **System admin** | Everything, plus users, roles, school settings. | all |
| **HR manager** | All of HR: employees (incl. salary), lists, rules, catalogue; record, **approve** and cancel penalties; lateness; create, recalculate and **approve payroll**; bank sheet; Activity log. | all |
| **HR officer** | Employees (incl. salary), lateness, **record** penalties (stay pending), create and recalculate payroll drafts, adjustments. No approvals, no rules or catalogue edits. | all |
| **Accountant** | View payroll runs, payslips and bank sheet; view employees **with** salary. Nothing else. | all |
| **Principal / administrative director** | View employees (no salary), penalties, lateness, payroll totals; **approve** and cancel penalties; Activity log. | all |
| **Stage head** | View employees (no salary) and penalties; record penalties (pending). | own_stage |
| **Direct manager** | View their team (no salary) and its penalties; record penalties (pending). | own_team |
| **Employee** (self-service) | **Planned** — own profile, own payslips, requests. | self |

Approval answers (GUESS — the client's documents leave these open):
- **Penalty:** recorded by HR officer, stage head or direct manager → **approved by HR manager or
  principal**.
- **Payroll:** prepared by HR officer → **approved by HR manager**; the accountant views and exports.
- **Leave** (Planned): direct manager → HR manager.

The seeded `admin@school.local` becomes **System admin** + **HR manager**.

## Screens (P3)

- **Administration → Users**: list (10 per page, search), add / edit (name, email, roles, linked
  employee), deactivate / reactivate, set temporary password.
- **Administration → Roles**: list of roles; a role's page shows its permissions grouped by module
  with a scope per permission; add a custom role; built-in roles can be edited but not deleted.
- **My account**: change password.
- Layout: three mockups first (CLAUDE.md rule 9), owner picks.

## Edge cases

1. Endpoint without a declaration → CI fails; at run time → 403. — R3, R4
2. User with two roles → union of permissions; widest scope wins per key. — R2, R5
3. Direct manager opens an employee outside their team → 404 (not 403, so existence isn't leaked). — R5
4. Accountant requests an employee → salary fields absent from the response. — R7
5. Removing the last System admin's role or deactivating them → refused. — R8
6. Deactivated user with a live session → next request 401, refresh refused. — R9
7. Role's permissions changed → affected users get the new set on their next request (no re-login). — R2
8. Unknown permission key in the DB (removed in code) → ignored and reported in logs. — R1
9. Penalty approve by someone who can only record → 403; the button isn't shown. — R3, R6

## Plan sketch

- [x] **P1 skeleton** (`logic`, after T27) — done: keys + labels in shared, decorators, guard, CI scan,
  permissions in the session, `can()`; HR admin = all keys; every existing endpoint declared.
  Added in P1: a third declaration, `@SignedIn()` (any signed-in user, no key), for `/auth/me`,
  sign-out and opening an uploaded file — so a user holding no permission can still sign out.
- [ ] **P2 roles as data** (`logic`): roles / role_permissions / user_roles tables, seed the starting
  roles, scopes + `scopeFor`, salary filtering, last-admin rule, audit actions.
- [ ] **P3 screens** (`ui`, mockups first): Users, Roles, My account; sidebar items by `can()`.
- [ ] **P4 scopes in HR** (`logic`): apply `own_stage` / `own_team` in HR repositories.
