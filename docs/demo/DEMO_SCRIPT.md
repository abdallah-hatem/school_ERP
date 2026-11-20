# Demo script — HR module

The story we show a school, in order. Each step lists what to do and what must be true. The dry run
(`docs/CONVENTIONS.md` → Demo dry run) walks exactly this script; keep it in step with the product.

Demo data: the seed (`pnpm --filter api db:seed`) — about 40 employees, the school's penalty
catalogue, a month of penalties (some pending) and lateness, and a DRAFT payroll run for that month.
After `prisma migrate deploy` on an older demo database, **run the seed once more** (same
`SEED_ADMIN_PASSWORD`): it switches off "once per day" for the violations that repeat in a day,
marks the managing job titles and stores the principal's photo. It also adds the two same-day
"Late to class" penalties the old rule refused and recalculates the draft run; nothing else in the
month changes.

Before the demo, on the demo database:
- **Two more logins** (Administration → Users → Add user): an **HR officer** and an **Accountant**,
  each with their employee record picked under "Who is this person in HR?". The seed makes only
  the admin. Sign each in once to choose their password.
- **Two or three employees insured** (employee → Edit → Social insurance: Insured, number, date,
  insured salary) **before the month is approved**, so the Payroll taxes statement has an Insured
  table and an insurance share.

## 1. Sign in
- Open the app in Arabic (`/ar` — the default language is English). The sign-in page shows the school's logo and name before signing in.
- Wrong password → a clear Arabic message; correct password → the dashboard.

## 2. Dashboard
- Active headcount with the split by stage; this month's payroll (status + net); pending and
  approved penalties this month; quick links.
- The menu is grouped by module, in this order: Dashboard; School (المدرسة — Students, Academics,
  Attendance, Exams & grades, all marked "Soon"); HR (Employees, Penalties, Lateness, Payroll, then
  Leave & permissions marked "Soon"); Accounting (Approved pay — "الرواتب المعتمدة" in Arabic; its
  page is titled Approved payroll — Payroll taxes, then Fees marked "Soon"); Transport and Parent
  portal marked "Soon"; Administration (Settings, Activity, Users, Roles). The "Soon" rows are dimmed
  and do nothing when tapped — they show where the coming modules will live. The bell sits in the
  top bar; its **Notification settings** link opens My account → Notifications, where a switch
  saves at once (dimmed while saving, "Different from default" once changed). Settings →
  Notifications holds the school's defaults and saves with **Save**.
- Typing in a list's search (Employees, Penalties, Users, Activity, a run's lines): ✔ a small spinner
  takes the magnifier's place while the list reloads.
- Switch **ع ↔ EN**: the whole layout mirrors without a reload and stays on the same page.
- ✔ The browser tab reads "Dashboard · <school name>" (لوحة التحكم · <اسم المدرسة> in Arabic), like
  the sign-in page; the school name in the desktop sidebar is shown whole (up to two lines).

## 3. Penalties — the rules come from the school's own regulations
- Open **Record a penalty**. Pick an employee who already has approved penalties for a violation
  (search by name or code), pick that violation (grouped under the school's tables, in the school's
  own wording), keep today's date.
- The **live preview** shows the repeat level and the deduction from the catalogue
  (e.g. "4th time — 2 days"). ✔ It matches the regulation table.
- Record it **signed in as the HR officer** (second window) and Save (pending). Back as the admin:
  ✔ the bell shows "Penalty waiting for your approval" with the employee, violation and level;
  clicking it opens that penalty with **Approve** → approve. ✔ The bell item now reads "Approved by
  …". (Whoever records a penalty isn't notified about it — that is why the HR officer records it.)
  (Pick a pair with no pending penalty — not the seed's 15 Nov "Late to class" one — or approve
  that earlier one first: penalties are approved in date order.)
- Approve any other pending penalties of the month from the list's row menu (payroll can't be
  approved while any are pending). ✔ Where one employee has two pending for the same violation,
  the later one's **Approve** is greyed out with "Approve or cancel the … penalty for this
  violation first."; approve the earlier one, then the later one gets the next level.
- **A backdated penalty** (before the month is approved): record one for an employee who already has
  approved penalties for that violation, dated **before** them (e.g. EMP-0014, Unexcused absence,
  5 Nov). ✔ The form lists the approved penalties it would move up ("10 Nov 2026: level 2 → 3, Deduct
  0.5 day → Deduct 1 day") and says recording changes nothing. Approve it → ✔ the confirmation lists
  them again and its button reads **Approve and update 2 penalties**; after it, the list shows the
  new levels and the employee's **History** has a "Raised the level of the penalty …" entry for each.
  The draft run then says "Penalties changed since the last calculation" with **Recalculate now**
  (while a penalty of the month is still pending, the pending notice shows first). A date whose
  later penalties sit in an **approved** payroll month is refused under the date, naming the month.
- Open **Record a penalty** again with the same employee, violation and date. ✔ The preview says
  this violation counts once per day and the employee already has one on this date; Save moves the
  message under the date — ✔ it shows once, not twice. (Late to class is different: it can be recorded several times a day.)
- Settings → Penalty catalogue: type part of a violation's name in the search (Arabic, then
  English). ✔ Only matching violations show, their groups open, the match is marked; a word nothing
  has → "No violations match" with **Clear filters**. Violations that can repeat in a day carry a
  "Can repeat in a day" badge; their Edit dialog has the **Once per day** switch off.

## 4. Lateness
- Open the month. Type minutes for one employee (e.g. 90) — the days update while typing from the
  rule shown on the page (90 min → 0.75 day by default). Save.

## 5. Payroll — draft
- Open the month's run. No "pending penalties" warning should remain once they're approved
  (if the run was calculated before, it asks you to **Recalculate**).
- **Recalculate.** ✔ Check one line by hand: lateness amount = days × month salary ÷ day divisor
  (e.g. 0.75 × 20,000 ÷ 30 = 500.00).
- **Rows per page** under the lines → 500: ✔ every employee on one page; scrolling the lines keeps
  the column names on top, inside the card. Every payroll table (HR runs, a run, an employee's
  Payroll tab, Accounting → Approved payroll and its month, Payroll taxes) has the same picker (10–500).

## 6. Settings change the numbers (the key moment)
- Settings → HR rules: change a rule, e.g. grace minutes 0 → 30. The example line updates live
  (90 min → 0.25 day). Save. ✔ The last card, **Employees**, holds the default probation length
  (3 months); an employee's profile shows **Probation ends** under the hire date.
- Back on the draft run: ✔ a note says the HR rules changed since the last calculation, with
  **Recalculate now** (it goes once recalculated).
- **View change history** (top of Settings) → Activity, filtered to Settings: ✔ the grace-minutes
  change is at the top, with who made it and old → new (Administration → Activity shows it too).
  Activity also holds sign-ins (and failed ones), employee edits, the lists, lateness, payroll and
  penalties; an employee's **History** tab lists their edits ("Department: Science → Maths") and
  their penalties. ✔ Open the History of the employee from step 3: the penalty you recorded and
  approved is there twice — "Recorded a penalty for …" (the violation by name, the level, Pending)
  and "Approved the penalty for …" (Pending → Approved). ✔ On Activity, search the employee's code
  (e.g. EMP-0007): their entries and their penalties' show.
- Back to the run → **Recalculate** → ✔ the same employee's lateness drops (0.25 × 20,000 ÷ 30 =
  166.67) and the totals follow.
- The run's **History** tab (beside **Employees**): ✔ "Created the payroll run for …" (not on a
  run the seed made before the audit log existed), each **Recalculate** with only the totals that
  changed, before → after (net, penalties …), and any adjustment with the employee, "Addition",
  the amount in EGP and the reason — no codes or raw figures. ✔ The net after → equals the run's Net
  to pay tile. Switching tabs keeps the header (no flash).
- Put the rule back afterwards if the demo continues on the same data.

## 7. Approve
- **Approve payroll** → confirmation explains it recalculates once more and locks the month.
- After approval: read-only, **Export bank sheet** downloads an Excel file, each row has a payslip.
  ✔ The run's **History** tab now starts with "Approved the payroll run for …" (Draft → Approved).
  ✔ The sheet has the bank, account number and IBAN of each employee (empty where none is on file)
  and a **Total** row at the bottom equal to the run's net.

## 8. Payslip
- Open the payslip of the employee from step 3. ✔ Each penalty is listed with its level, days and
  amount, and they add up to the line's penalty total; lateness, adjustments and net match the line.
  ✔ Lateness shows the grace taken off, e.g. "130 minutes − 30 minutes grace = 100 minutes = 0.75
  day" (a run calculated before this change shows it after a Recalculate).
- Print → one A4 page, in Arabic and in English.
- Settings → **Accounting** (signed in as System admin or Accountant): the payroll tax rule —
  monthly slices, martyrs' fund, insurance share. ✔ The example receipt shows Net pay 10,000.00,
  + Income tax 1,017.00, + Martyrs' fund 5.51, then "Gross the school pays" EGP 11,022.51. Typing
  in the Net pay box groups as you type (`15000` → `15,000`) and completes to `15,000.00` on leaving
  it; the receipt then reads 2,267.78 · 8.64 · EGP 17,276.42. By hand: taxable 11,022.51; tax = 125 + 187.50 +
  (11,022.51 − 7,500) × 20% = 1,017.00; fund = 11,022.51 × 0.05% = 5.51; 11,022.51 − 1,017.00 −
  5.51 = 10,000.00 (the net is what the employee is paid).
- Sign in as the **Accountant** → ✔ Settings is in the menu and opens straight on Accounting, the
  only section listed; the rule can be changed. An HR officer opening `?section=accounting` → ✔
  lands on their first section, no error.
- Still as the Accountant, **Payroll taxes**: the year's twelve months. ✔ The month approved in
  step 7 shows *Approved* with its gross; a month HR hasn't approved shows *Draft in HR* (dashed);
  the rest say there is no payroll or that they haven't started. Open the approved month → the
  statement: ✔ net + insurance share + income tax + martyrs' fund = gross across the top, checked
  by hand; the Insured and Not insured tables each end with a subtotal, and the two subtotals add up
  to the gross. ✔ An insured line's insurance share = insured salary × 11% (6,500.00 → 715.00). ✔ The tax rule at the foot matches Settings → Accounting and says "Same as today's
  rule". **Excel** downloads the lines and a sheet with the rule; **Download PDF** prints the
  statement (landscape A4, no menu). An HR officer opening the Payroll taxes link → ✔ not found.
- Still as the Accountant, Accounting → **Approved payroll**: ✔ only the months HR approved, newest first,
  with net, insurance, taxes and gross. Open the month from step 7 → ✔ HR's figures, read only,
  one card per employee on every screen: salary, penalties, lateness, adjustments and net match
  HR's run, then insurance share, income tax, martyrs' fund, and the gross on the card's band.
  ✔ On two cards, net + insurance + tax + fund = gross by hand. The month's totals are the four
  tiles at the top (Net paid, Insurance share, Taxes, Gross); the Gross tile equals the Payroll
  taxes statement's gross. The printout / PDF ends with the "Month total · all 38" row. A draft month → ✔ not listed.
  ✔ The month says **Pending transfer**. **Return to HR** → the dialog won't confirm without a
  reason; give one → ✔ back on the list, the month gone. As HR: ✔ the bell says Accounting returned
  it (in Arabic too, a Latin reason reads whole), the runs list shows *Draft* + *Returned*, the run
  says "Returned by Accounting …" with the reason; Activity (as HR or the admin — the Accountant has
  no Activity) → ✔ the return on the month and on HR's run, "Pending transfer → Returned to HR" in
  words; fix something the reason names (e.g. lateness), **Recalculate**, approve it again → ✔ it is
  back in Accounting → Approved payroll, pending, the notice gone, and its net, taxes and gross are
  the new ones. As the Accountant, **Finalize** → ✔ *Finalized ·
  transferred*, Return and Finalize are gone; HR's run and runs list show *Finalized · transferred*.
- Click the employee's name (on the payslip, or in the run's "Employees this month") → ✔ their
  profile opens. Every employee name in the app does this (penalties, lateness, the run).
- Under the profile's name: ✔ **Signs in as: <user>** for the accountant's employee record (a link to
  the user), **No sign-in account** for most employees. Administration → Users: ✔ the list's
  **Employee record** column; a user's page asks **Who is this person in HR?** (pick their employee
  record — only roles limited to a stage, a team or themselves need it).
- On the profile, **Details** shows the social insurance, bank account, emergency contact and
  qualification cards. **Edit** → choose *Insured*: the insurance number, registration date and
  insured salary appear and are required; choose *Not insured*: they disappear and are cleared.
  ✔ The insured salary groups as you type (9,000.00). A wrong IBAN is refused with a clear message.
- The seeded principal (employee 1) shows his photo on his card and profile; every other employee
  shows a male or female silhouette. On **Edit** choose a photo (PNG, JPG or WebP, up to 2 MB),
  then **Upload photo**; **Remove photo** takes it off. Another file type is refused.

## 9. Phone
- Same app at phone width: top bar with the school name and the menu, drawer navigation, cards
  instead of tables, the payroll tiles readable without long scrolling; the bell opens as a
  full-screen sheet.
