# Recent changes

- 2026-11-18 — What each role sees (§2, P4, owner: "I still see salaries, all employees, every
  detail"): stage and team limits and salary visibility are now enforced. A stage head sees only
  their stage's employees, a direct manager only their team — in every list, count, picker,
  penalty, lateness and payroll line and in the activity log; anyone else's record shows "This page
  isn't here". Without the salary permission there is no salary, insured salary or bank detail
  anywhere (cards, profile, form, payroll lines, payslips, activity log); the principal keeps the
  school's payroll totals. Tabs, sections, buttons, dashboard tiles and pages show only to those who
  may use them.

- 2026-11-18 — Penalties, once per day (§4, §7, owner): each violation has a **Once per day**
  setting, on by default; with it on, a second penalty for the same violation, employee and date is
  refused while the first is pending or approved (a cancelled one frees the day), checked at
  recording and again at approval. Off for violations that repeat within a day (late to class,
  leaving a task early, not attending a class…). Settings → Penalty catalogue gets the switch, a
  "Can repeat in a day" badge, and a search box (both languages, group names too, Clear filters);
  the record-penalty picker also finds violations by group name.
- 2026-11-18 — Same-day penalties (§4, owner): "earlier" is by violation date, then by when the
  penalty was recorded, so repeats on one day climb levels (1, 2, 3…) instead of all being level 1.
  The preview counts every approved penalty already on that date.

- 2026-11-18 — Employees (§3, owner): new groups on the employee record — social insurance (status,
  number, registration date, insured salary; required when insured, cleared when not), bank account
  (bank, account number, Egyptian IBAN), emergency contact and qualification. Payroll's use of
  insurance and bank details stays Planned and is Tamer's (§6). Employees can have a photo (PNG, JPG
  or WebP, up to 2 MB, signed-in only); without one they show a neutral silhouette, not initials.
- 2026-11-18 — Users, Roles and My account screens (§2, P3): Administration → **Users** (add, edit,
  give roles, link an employee, set a temporary password, deactivate) and **Roles** (each role's
  permissions, and for permissions about employees whose records they cover); **My account** for
  everyone. A temporary password is now enforced: the person must choose their own before using the
  app. The last System admin still can't lose the role or be deactivated — the screen says why.
  Permissions about the whole school (settings, lists, running payroll) always cover everyone.
- 2026-11-18 — Direct managers (§3, §7, owner): job titles get a **Manages people** switch in
  Settings; the Direct manager picker lists only active employees with such a title; an employee
  whose manager no longer qualifies keeps them (flagged "No longer in a managing role"); choosing a
  new non-manager is refused.

- 2026-11-17 — Audit log screens (T30): Administration → **Activity** (everything, by day, with
  filters) and a **History** tab on each employee. Settings → Change history moved to Activity: the
  Settings screen links to it, filtered to settings.

- 2026-11-17 — Roles as data (§2, P2): the starting roles now exist and can be changed without code;
  the HR admin became **System admin + HR manager**; a user can hold several roles; only the System
  admin manages users and roles; the last System admin can't lose the role or be deactivated;
  deactivating a user (or giving them a temporary password) signs them out everywhere at once.
  Not yet enforced: salary visibility and stage/team limits (P4), the "change your temporary
  password" prompt (P3).
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
