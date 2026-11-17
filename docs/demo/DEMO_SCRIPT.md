# Demo script — HR module

The story we show a school, in order. Each step lists what to do and what must be true. The dry run
(`docs/CONVENTIONS.md` → Demo dry run) walks exactly this script; keep it in step with the product.

Demo data: the seed (`pnpm --filter api db:seed`) — about 40 employees, the school's penalty
catalogue, a month of penalties (some pending) and lateness, and a DRAFT payroll run for that month.

## 1. Sign in
- Open the app in Arabic. The sign-in page shows the school's logo and name before signing in.
- Wrong password → a clear Arabic message; correct password → the dashboard.

## 2. Dashboard
- Active headcount with the split by stage; this month's payroll (status + net); pending and
  approved penalties this month; quick links.
- Switch **ع ↔ EN**: the whole layout mirrors without a reload and stays on the same page.

## 3. Penalties — the rules come from the school's own regulations
- Open **Record a penalty**. Pick an employee who already has approved penalties for a violation
  (search by name or code), pick that violation (grouped under the school's tables, in the school's
  own wording), keep today's date.
- The **live preview** shows the repeat level and the deduction from the catalogue
  (e.g. "4th time — 2 days"). ✔ It matches the regulation table.
- Save (pending) → approve it from the list. Approve any other pending penalties of the month
  (payroll can't be approved while any are pending).
- Open **Record a penalty** again with the same employee, violation and date. ✔ The preview says
  this violation counts once per day and the employee already has one on this date; Save shows the
  same message under the date. (Late to class is different: it can be recorded several times a day.)
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

## 6. Settings change the numbers (the key moment)
- Settings → HR rules: change a rule, e.g. grace minutes 0 → 30. The example line updates live
  (90 min → 0.25 day). Save.
- **View change history** (top of Settings) → Activity, filtered to Settings: ✔ the grace-minutes
  change is at the top, with who made it and old → new (Administration → Activity shows it too).
- Back to the run → **Recalculate** → ✔ the same employee's lateness drops (0.25 × 20,000 ÷ 30 =
  166.67) and the totals follow.
- Put the rule back afterwards if the demo continues on the same data.

## 7. Approve
- **Approve payroll** → confirmation explains it recalculates once more and locks the month.
- After approval: read-only, **Export bank sheet** downloads an Excel file, each row has a payslip.

## 8. Payslip
- Open the payslip of the employee from step 3. ✔ Each penalty is listed with its level, days and
  amount, and they add up to the line's penalty total; lateness, adjustments and net match the line.
- Print → one A4 page, in Arabic and in English.
- Click the employee's name (on the payslip, or in the run's "Employees this month") → ✔ their
  profile opens. Every employee name in the app does this (penalties, lateness, Activity).
- On the profile, **Details** shows the social insurance, bank account, emergency contact and
  qualification cards. **Edit** → choose *Insured*: the insurance number, registration date and
  insured salary appear and are required; choose *Not insured*: they disappear and are cleared.
  ✔ The insured salary groups as you type (9,000.00). A wrong IBAN is refused with a clear message.
- The seeded principal (employee 1) shows his photo on his card and profile; every other employee
  shows a neutral silhouette. On **Edit** you can upload a photo (PNG, JPG or WebP, up to 2 MB)
  or remove it.

## 9. Phone
- Same app at phone width: top bar with the school name and the menu, drawer navigation, cards
  instead of tables, the payroll tiles readable without long scrolling.
