# Spec — payroll tax, martyrs' fund and social insurance

Date: 2026-11-18 · Mode: build-software feature mode · Business: §6, §7, §3 · Approved by the owner
(plan approval, 2026-11-18).

## What and for whom

HR admins set the **tax rule** in Settings → HR rules: the monthly income-tax brackets, the
martyrs' fund rate and the employee's social-insurance share. Payroll applies them to every line.
Salaries are **net — grossed up** (owner): the net (today's calculation) is what the employee is
paid; the school pays insurance, income tax and the fund on top, and the line shows a **gross**.

## Defaults

From the school's previous HR system (GUESS, to confirm with the accountant):

| Setting | Default |
|---|---|
| Brackets (monthly slices) | 5,000 → 0% · 1,250 → 10% · 1,250 → 15% · 10,833.33 → 20% · 16,666.67 → 22.5% · the rest → 25% |
| Martyrs' fund | 0.05% of the gross |
| Insurance share | 11% of the insured salary (insured employees only) |

## Rules (exact edit is in §6 steps 7–10 and §7)

1. Insurance share = insured → round(insured salary × rate), else 0.
2. Taxable `t` solves `t − tax(t) − fund × (t + insurance) = net` (slice by slice, exact, rounded
   half up once).
3. Income tax = round(Σ slice × rate); fund = round((t + insurance) × fund rate).
4. Gross = net + insurance + income tax + fund (always balances).
5. Adjustments re-gross the line; approved runs never change; lines from before have gross = net.

## Contract

- `GET /hr/settings` → `HrSettings` gains `tax: { brackets: { width: Piastres | null; percent }[];
  martyrPercent; insurancePercent }`.
- `PATCH /hr/settings` accepts `tax` (any subset; `brackets` replaces the table). Shape errors →
  400 `VALIDATION_FAILED`; a merged rule that breaks §7 → 400 `INVALID_TAX_RULE`.
- `PayrollLine` (and `Payslip`) gain `insuranceStatus`, `insuredSalary` (snapshot),
  `insuranceAmount`, `incomeTax`, `martyrTax`, `gross`; `PayrollTotals` gain the four sums.

## Screens

- Settings → HR rules: a "Tax and insurance" panel (bracket rows like the lateness steps, fund and
  insurance rates, a live example from the shared maths).
- Payroll run: tax & insurance and gross columns, gross total. Payslip: "Paid by the school" block.
  Rules panel: tax summary.

## Out of scope

Employer's insurance share, insurance caps, annual averaging / settlement, per-employee exemptions,
a per-employee gross/net salary type, bank-sheet changes.
