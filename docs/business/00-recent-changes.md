# Recent changes

- 2026-11-18 — Notifications decisions (§11, §3, owner: "go with your recommended answers"): many of
  one kind at once make one grouped notification; probation becomes a date on each employee's
  record (hire date + 3 months by default, editable — Planned in §3); lateness due by the 25th and
  payroll by the 28th (settings); approvals can't be turned off; read notifications kept 90 days,
  done approvals 30, any at most 365; contract reminders at 30 and 7 days; Settings →
  Notifications changed by the System admin, seen by the HR manager.
- 2026-11-18 — Notifications (§11, new, owner): an in-app bell for staff — approvals waiting (penalties,
  payroll) for whoever may approve within their stage or team, and daily reminders (contract and
  probation ending, lateness not entered, payroll not prepared or approved), never sent twice.
  Preferences per person, kind and channel, with school defaults; approvals can't be turned off.
  Other channels and parents are Planned. Layout picked by the owner: the bell opens a short list
  over the page; each kind is one on/off switch on screen. Not built yet.
- 2026-11-18 — Demo dry-run polish (§6, §5, §4): the **bank sheet** now has each employee's bank,
  account number and IBAN, and a Total row. A **draft run** says when the lateness or payroll rules
  changed after its last calculation and offers Recalculate. The **payslip**'s lateness shows the
  grace taken off ("130 minutes − 30 minutes grace = 100 minutes = 0.75 day"). The once-per-day
  message shows once after Save (under the date). Every page's tab title names the school,
  the dashboard's included.
- 2026-11-18 — Roles leftovers (§2, §6, §7): **Home** without the dashboard permission (the
  Accountant, a stage head, a direct manager) is now a welcome with the person's name and a link to
  each screen they may open — no HR figures. **Settings** sections someone may view but not change
  are read-only everywhere (School, HR rules, Structure and lists, penalty catalogue, Accounting):
  no typing, no adding or removing, no Save. **Payroll adjustments** can be added or removed only
  with "Adjust payroll" (System admin, HR manager, HR officer — unchanged); others see them
  read-only, with the reason.
- 2026-11-18 — Rules on Lateness and payroll runs (§5, §6, owner): the Principal's Lateness screen
  now shows the days, and the Principal's and Accountant's payroll run shows "Rules applied" — the
  rules come with the lateness list and the run instead of from HR settings, which those roles
  still can't open. Only the rules each screen needs; no salaries. An approved run shows today's
  rules, labelled as such.
- 2026-11-18 — Payroll taxes frozen at approval, even when late (§10, §6, review of #85): a month
  whose taxes are worked out after its approval (a missed event) now uses the tax rule in force at
  the approval, not today's. Every change to the tax rule is kept with the moment it took effect.
  HR's approved lines also keep each employee's insurance status and insured salary, and
  accounting reads those instead of today's employee record.
- 2026-11-18 — Payroll taxes (§10, §6, §3, owner): when HR approves a month, accounting works out
  each employee's insurance share (11% of the insured salary, insured only), income tax on the
  monthly slices and the martyrs' fund (0.05%), paid by the school on top of the net, and the gross
  — frozen for that month. Salary data: hidden without the salary permission (§2). Read through
  the API for now (Accountant, System admin); the screen waits for mockups.
- 2026-11-18 — Settings access (§7, §10, review of the accounting panel): the Accountant now has
  Settings in the menu and lands on Accounting. Settings lists only the sections a user may view; a
  link to another section opens their first allowed one. Without the right to change the tax rule,
  it is shown read-only. The last slice's rate reads "Rate for the rest", and a new slice starts at
  the rate of the slice before it.
- 2026-11-18 — Arabic wording (§9, §1, demo dry run): counts agree with their noun in Arabic
  everywhere — "مخالفة واحدة", "مخالفتان", "10 مخالفات", "11 مخالفة", "38 موظفًا" (catalogue groups,
  employee list, lateness summary and grace, payslip lateness, the lateness example, earlier
  penalties, password length, unsaved rows). In Arabic, Activity now shows the Arabic name of
  settings and catalogue items changed before 2026-11-18 too ("تعديل المخالفة …" with its Arabic
  name, as it was then), instead of the English one.

- 2026-11-18 — Accounting (§10, §2, §7, owner): a new **accounting** module owns the payroll tax
  rule — monthly income-tax slices, the martyrs' fund and the employee's insurance share — since
  HR payroll ends at the net and salaries are net, grossed up (owner, 2026-11-17). Defaults from
  the school's previous HR system (GUESS — to confirm with the accountant). Accountant and System
  admin see and change it. Working each approved month out follows.
- 2026-11-18 — Audit log (§9, T29): penalties (record, approve, cancel), monthly lateness (one entry
  per saved month, a line per changed employee) and payroll runs (create, recalculate, approve with
  the totals; adjustments added and removed) are now recorded, together with the change.
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
