# §2 Roles

- **DECIDED** — Roles are data the school can change (no code). The demo's HR admin became
  **System admin + HR manager**. The System admin always has every permission, including users,
  roles and school settings.
- **DECIDED** — Every action requires a signed-in user. The only public things are the sign-in page
  and what it shows: the school's name, logo and default language.
- **DECIDED** — Users sign in with email and password. Accounts are created by a System admin (the
  first one by the system's setup); there is no self sign-up. A System admin can give a temporary
  password, which the user is asked to change; anyone can change their own password.
- **DECIDED** (enforced, P3) — Someone who signs in with a temporary password is taken straight to
  "Set a new password" and can do nothing else (except sign out) until they choose their own. The
  new password must be different from the temporary one. Changing it later from My account needs
  the current password.
- **DECIDED** — Deactivating a user, or giving them a temporary password, signs them out everywhere
  at once.
- **GUESS** (Claude's answers until the owner and client confirm; spec
  `docs/specs/2026-11-17-roles-permissions.md`) — Starting roles: **System admin**, **HR manager**,
  **HR officer**, **Accountant**, **Principal / administrative director**, **Stage head**, **Direct
  manager**; **Employee** self-service is Planned. A user may hold several roles. Roles are data the
  school can change.
- **GUESS** — A penalty is recorded by an HR officer, stage head or direct manager and **approved by
  the HR manager or principal**. Payroll is prepared by an HR officer and **approved by the HR
  manager**; the accountant views and exports it. Leave (Planned): direct manager, then HR manager.
- **GUESS** (enforced, P4) — Salaries are seen only by System admin, HR manager, HR officer and
  Accountant. "Salaries" includes the employee's insured salary and bank details (§3). Anyone else
  gets no salary at all — not on employee cards, the profile, the employee form, payroll lines,
  payslips or the activity log (which says "changed" without the amounts). The principal sees the
  payroll lines — names, codes, departments, days deducted, lateness minutes and flags — without any
  money, plus the run **totals** for the whole school (on the Payroll screen, the dashboard and the
  activity log alike), never one person's pay. Adding an employee needs to see
  every salary (the pay is set when adding); the bank sheet too.
- **GUESS** (enforced, P4) — A stage head sees only their stage's employees; a direct manager only
  the employees they directly manage. That covers every list, count, search, picker and dashboard
  figure, their penalties, lateness and payroll lines, and the activity log's entries about them.
  Opening anyone else shows "This page isn't here", as for a record that doesn't exist. Someone in
  such a role who isn't linked to an employee sees nobody. Each screen, tab, section and button is
  shown only to those who may use it.
- **GUESS** — The payroll tax rule (§10) belongs to the Accountant (view and change) and the
  System admin (owner, 2026-11-18).
- **GUESS** (enforced, 2026-11-18) — **Home** is the HR dashboard (headcount, this month's payroll,
  penalties, quick links) only for someone allowed to see it (System admin, HR manager, HR officer,
  principal). Anyone else — the Accountant, a stage head, a direct manager — gets a welcome with
  their name and a link to each screen they may open (the same screens as their menu, then My
  account), and no HR figures. Recommended by Claude, owner to confirm.
- **GUESS** (enforced, 2026-11-18) — Someone who may see a Settings section but not change it sees
  it read-only (§7): a stage head and a direct manager see Structure and the penalty catalogue, the
  principal sees the lists. They keep Settings in their menu for now (owner hasn't decided
  otherwise).
- **GUESS** (enforced, 2026-11-18) — Adding or removing a payroll adjustment needs its own
  permission ("Adjust payroll"), held by the System admin, HR manager and HR officer (§6). Anyone
  else who sees the run sees its adjustments without being able to change them.
- **DECIDED** — The last System admin can't be removed or deactivated.
- **Planned** — Legal affairs, medical clinic and security desk roles, with their modules.
- **DECIDED** — Viewing the activity log is its own permission (§9): System admin, HR manager and
  principal hold it.
