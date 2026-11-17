# §2 Roles

- **DECIDED** — Roles are data the school can change (no code). The demo's HR admin became
  **System admin + HR manager**. The System admin always has every permission, including users,
  roles and school settings.
- **DECIDED** — Every action requires a signed-in user. The only public things are the sign-in page
  and what it shows: the school's name, logo and default language.
- **DECIDED** — Users sign in with email and password. Accounts are created by a System admin (the
  first one by the system's setup); there is no self sign-up. A System admin can give a temporary
  password, which the user is asked to change; anyone can change their own password.
  *Interim (until P3): the temporary password is recorded as "must change", but nothing asks the
  user to change it yet.*
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
- **GUESS** — Salaries are seen only by System admin, HR manager, HR officer and Accountant.
  "Salaries" includes the employee's insured salary and bank details (§3).
- **GUESS** — A stage head sees only their stage's employees; a direct manager only their team.
  *Interim (until P4): the salary and stage/team limits above are not enforced in HR yet — every
  role that can view employees, penalties or payroll sees all of them, salaries included. Until P4,
  give real users only System admin, HR manager or HR officer.*
- **DECIDED** — The last System admin can't be removed or deactivated.
- **Planned** — Legal affairs, medical clinic and security desk roles, with their modules.
- **DECIDED** — Viewing the activity log is its own permission (§9): System admin, HR manager and
  principal hold it.
