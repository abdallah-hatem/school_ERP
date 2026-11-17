# §2 Roles

- **DECIDED (demo)** — One role: **HR admin**. Can do everything in HR and Settings.
- **DECIDED** — Every action requires a signed-in user. The only public things are the sign-in page
  and what it shows: the school's name, logo and default language.
- **DECIDED** — Users sign in with email and password. Accounts are created by the system's setup
  (seed) for now; there is no self sign-up.
- **GUESS** (Claude's answers until the owner and client confirm; spec
  `docs/specs/2026-11-17-roles-permissions.md`) — Starting roles: **System admin**, **HR manager**,
  **HR officer**, **Accountant**, **Principal / administrative director**, **Stage head**, **Direct
  manager**; **Employee** self-service is Planned. A user may hold several roles. Roles are data the
  school can change.
- **GUESS** — A penalty is recorded by an HR officer, stage head or direct manager and **approved by
  the HR manager or principal**. Payroll is prepared by an HR officer and **approved by the HR
  manager**; the accountant views and exports it. Leave (Planned): direct manager, then HR manager.
- **GUESS** — Salaries are seen only by System admin, HR manager, HR officer and Accountant.
- **GUESS** — A stage head sees only their stage's employees; a direct manager only their team.
- **DECIDED** — The last System admin can't be removed or deactivated.
- **Planned** — Legal affairs, medical clinic and security desk roles, with their modules.
- **Planned** — A permission to view the activity log (§9).
