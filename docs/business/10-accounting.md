# §10 Accounting

Accounting sits on top of HR payroll. **HR payroll ends at the net** — what each employee is paid
(§6). Salaries are **net — grossed up** (owner, 2026-11-17): the school pays the employee's
social-insurance share, the income tax and the martyrs' fund **on top** of the net. Working those
out is accounting's job, not HR's (owner, 2026-11-18).

## Payroll taxes of an approved month

- **DECIDED** — When HR **approves** a month's payroll (§6), accounting works out, for every line
  of that run, what the school pays on top and the gross. It uses the **tax rule in force at that
  moment** and each employee's **insurance at that moment** (§3), and keeps them **frozen**: a later
  change to the tax rule or to an employee's insurance never changes an approved month.
- **DECIDED** — A draft month has nothing in accounting.
- **DECIDED** — A month is worked out once. If it couldn't be worked out at approval, it is the
  first time it is looked at — and it still comes out as at the approval: with the **tax rule in
  force when HR approved it** and the **insurance HR recorded on the approved lines** (§6), never
  today's rule or today's employee record (review of #85, 2026-11-18).
- **DECIDED** — Every change to the tax rule is kept, with the moment it took effect, so the rule
  in force at any approval can always be found.
- **DECIDED** (P4, §2) — Tax, insurance and gross are salary data: someone without the salary
  permission for an employee sees that employee's line without them, and the month's money totals
  only with every salary.

For each employee in the approved run:

1. **Net** — the approved line's net (§6), unchanged. This is what the employee is paid.
2. **Insurance share** = insured salary × the insurance rate (default 11%), for employees who are
   **insured**; 0 otherwise.
3. **Taxable amount** = the amount that, after its income tax and the martyrs' fund, leaves exactly
   the net: `taxable − income tax(taxable) − fund rate × (taxable + insurance share) = net`.
4. **Income tax** = the taxable amount taxed slice by slice (monthly slices, below); **martyrs'
   fund** = (taxable + insurance share) × the fund rate (default 0.05%).
5. **Gross** = net + insurance share + income tax + martyrs' fund — what the line costs the school.

- **DECIDED** — Money is in EGP, kept to the piastre.
- **GUESS** — The taxable amount is solved exactly and rounded once to the piastre, half up; income
  tax and the fund are each rounded once, half up. Gross is the exact sum of its parts, so a line
  always balances to the piastre (it can differ from the unrounded solution by a piastre or two).
- **DECIDED** — A net of 0 (floored, §6) has no income tax, but an insured employee's insurance
  share and its fund are still paid by the school.
- **GUESS** (to confirm with the school's accountant) — as in the school's previous HR system:
  monthly slices with no annual averaging, no separate personal exemption (it is the 0% slice), no
  "high income loses the lower slices" rule, no minimum or maximum insured salary, and the insurance
  share is not pro-rated for part-time work or a part month.

## The tax rule (Settings → Accounting)

| Setting | Default | Source |
|---|---|---|
| Income-tax slices (monthly) | 5,000 at 0%, next 1,250 at 10%, next 1,250 at 15%, next 10,833.33 at 20%, next 16,666.67 at 22.5%, the rest at 25% | GUESS — the previous HR system (Egypt's annual scale ÷ 12) |
| Martyrs' fund rate | 0.05% of the gross | GUESS — the previous HR system |
| Employee insurance share | 11% of the insured salary | GUESS — the previous HR system |

- **DECIDED** — The rule is validated as a whole: 1 to 10 slices; each has a width above 0 (to the
  piastre) except the last, which is open-ended ("the rest"); every rate is from 0 up to (not
  including) 100%, with at most 2 decimals; each slice's rate plus the fund rate stays under 100%.
  A rule that breaks any of these is refused and nothing is saved.
- **DECIDED** — The screen shows a live example: a net amount and the tax, fund and gross it costs
  under the rule being edited.
- **DECIDED** — Changes are recorded in the audit log like every other setting (§7, §9).

## Who

- **GUESS** — The Accountant and the System admin see and change the tax rule (§2) — in Settings →
  Accounting, which the Accountant opens from the menu; someone who may only view it sees it
  read-only — and see each approved month's payroll taxes.

## The payroll taxes screen (Accounting → Payroll taxes)

- **DECIDED** (owner, 2026-11-18) — **Option C** of the mockups (`design/mockups/accounting-taxes.html`):
  a **year board** and each month as a **printable statement**.
- **DECIDED** — The year board shows the year's twelve months, each **approved** (its gross, and
  the number of employees; it opens the statement), **draft in HR** (HR has a run that isn't
  approved yet — nothing in accounting until it is) or **nothing yet** ("no payroll in the system";
  a month still ahead: "not started"). Previous / next year, never past this year. A year with no
  approved month says so and points to HR payroll.
- **DECIDED** — The statement: the month's sum across the top — **net + insurance share + income
  tax + martyrs' fund = gross** — then the employees in two tables, **Insured** and **Not
  insured**, each with a **subtotal** row; at the foot, the tax rule the month was worked out with
  and how each line is worked out, with "Same as today's rule" (or "Today's rule is different")
  for someone who may view the rule in Settings.
- **DECIDED** — The tables are the app's shared tables (cards on a phone, like every list), not the
  mockup's drawn ones.
- **DECIDED** — **Excel**: the month's lines as the viewer sees them (one row each, with insurance,
  insured salary, net, insurance share, income tax, fund and gross; a total row only for someone who
  sees every salary) and a second sheet with the tax rule. **Download PDF**: the browser prints the
  statement on landscape A4, without the menu.
- **DECIDED** (P4, §2) — An employee outside the viewer's salary scope shows name, code and
  insurance status; the amounts are hidden ("Salary hidden"), and so are the month's totals, the
  sum line and the subtotals ("only for someone who sees every salary").
- **DECIDED** — Only the Accountant and the System admin open it (`accounting.payroll.view`); a
  school can grant it to another role in Roles. Anyone else gets the not-found page.

## Planned

- Journal entries from approved payroll (and later fee payments); the employer's insurance share.
