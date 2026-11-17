# §9 Audit log

Who did what, to which record, and when — for the whole system. Spec:
`docs/specs/2026-11-17-audit-log.md`.

- **DECIDED** — Every action that changes data or access is recorded: sign-in, sign-out and failed
  sign-ins; school settings, logo and stages; employees (create, edit, deactivate, reactivate);
  departments and job titles; HR rules and the penalty catalogue; penalties (record, approve,
  cancel); monthly lateness (per employee, minutes before and after); payroll runs (create,
  recalculate, approve) and adjustments (add, remove).
- **DECIDED** — Each entry keeps who did it (their name as it was then), when, from which IP and
  device, the record it touched, and only the fields that changed, each with the value before and
  after. Passwords and tokens are never recorded. A failed sign-in keeps the email that was typed.
- **DECIDED** — An entry is saved together with the change: if one fails, neither is kept.
  *Interim (until T28): changes to stages, departments, job titles and the penalty catalogue are
  still recorded right after they are saved, not together with them (§7). Sign-ins and HR records
  are not recorded yet (T28, T29).*
- **DECIDED** — Entries can't be edited or deleted by anyone, and are kept forever (for now).
- **DECIDED** — Opening or reading something (a payslip, a profile) is not recorded.
- **DECIDED** — The HR admin sees the Activity page (everything) and the History of each employee.
  **Planned** — a separate permission to view the activity log, when roles arrive (§2).
- **DECIDED** — Every entry reads in English and in Arabic, including entries made before a
  language switch.
