# Recent changes

- 2026-11-17 — Roles as data (§2, P2): the starting roles now exist and can be changed without code;
  the HR admin became **System admin + HR manager**; a user can hold several roles; only the System
  admin manages users and roles; the last System admin can't lose the role or be deactivated;
  deactivating a user (or giving them a temporary password) signs them out everywhere at once.
  Screens come next (P3); stage and team limits in HR after that (P4).
- 2026-11-17 — Audit log foundation (T27): Settings → Change history now reads the audit log; every
  earlier change is kept as it was. School settings, the logo and HR rules are saved together with
  their history entry (if the entry can't be saved, the change is refused); stages, lists and the
  catalogue follow in the next step.
- 2026-11-17 — Roles and permissions (§2): starting roles, approvers and salary visibility written as
  GUESS (owner asked Claude to answer until confirmed).
- 2026-11-17 — Audit log approved (§9): every change and sign-in recorded with who, when, before and
  after; saved together with the change; can't be edited or deleted; HR admin sees it. Settings
  history becomes part of it (§7).
- 2026-11-17 — First version of the business doc, for the foundation + HR demo. Sources: the
  school's HR scope page and staff internal regulations; payroll = basic salary minus deductions
  (owner's decision).
- 2026-11-17 — After the plan's alignment review: "earlier" penalties = earlier violation date; an
  approved penalty can be cancelled while its month is open; no penalties can be recorded in a locked
  month; investigations with days deduct pay; pending penalties follow catalogue edits; grace is
  subtracted before the hour steps; the day value isn't rounded on its own; payroll lines snapshot
  the employee. Times written 07:30 / 15:00.
- 2026-11-17 — Employees (T5 review): contract end defaults to one year after a given start; uses-bus
  defaults to no; hidden list items stay on employees who have them; repeated deactivate/reactivate
  changes nothing; required fields can't be cleared.
- 2026-11-17 — Settings (T4 review): the logo is public for the sign-in page; logo limits (PNG/JPG/SVG,
  2 MB) and name lengths; the change history covers school settings, HR rules, lists and the
  catalogue and can be viewed; history is written just after the change (GUESS).
- 2026-11-17 — Penalties (T7 review): retiring a group retires its violations; pending penalties can
  still be approved or cancelled after retirement or deactivation; preview ignores the month lock;
  rolling window boundary stated.
- 2026-11-17 — Payroll (T9 review): approve recalculates once more before locking; payslip lists
  zero-amount penalties and shows each penalty's share of the deduction; adjustments for employees
  no longer in the run are not applied (GUESS); dashboard defined; approval is announced for a future
  accounting module.
- 2026-11-17 — Default language is English (owner); a school can switch it to Arabic in Settings.
- 2026-11-17 — Settings (owner): work start and work end move in 30-minute steps (05:00 to 20:00 on
  the screen; any other minute is refused). Lists show 10 rows a page with no rows-per-page choice
  (the employees card grid shows 12).
