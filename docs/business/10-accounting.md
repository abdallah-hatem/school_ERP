# §10 Accounting

Accounting sits on top of HR payroll. **HR payroll ends at the net** — what each employee is paid
(§6). Salaries are **net — grossed up** (owner, 2026-11-17): the school pays the employee's
social-insurance share, the income tax and the martyrs' fund **on top** of the net. Working those
out is accounting's job, not HR's (owner, 2026-11-18). *Being built: the rule (this section) is
in; working each approved month out follows (plan `docs/plans/2026-11-18-accounting-plan.md`, D).*

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
- **The maths** (GUESS, to confirm with the accountant; as in the previous HR system): the taxable
  amount is the one that, after its income tax and the fund, leaves exactly the net; income tax is
  taken slice by slice; the fund is on the gross (taxable + insurance share); monthly slices, no
  annual averaging, no separate exemption, no insured-salary cap.
- **DECIDED** — Changes are recorded in the audit log like every other setting (§7, §9).

## Who

- **GUESS** — The Accountant and the System admin see and change the tax rule (§2) — in Settings →
  Accounting, which the Accountant opens from the menu. Someone who may only view it sees it
  read-only.

## Planned

- A screen for each approved month's payroll taxes (mockups first). Today they are available to
  the system but not shown.
- Journal entries from approved payroll (and later fee payments); the employer's insurance share.
