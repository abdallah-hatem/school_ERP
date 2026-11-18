# Spec — payroll taxes in a new accounting module

Date: 2026-11-18 · Mode: build-software feature mode · Business: §10 (new), §6, §3, §2, §7 ·
Plan: `docs/plans/2026-11-18-accounting-plan.md` · Owner decisions: salaries **net — grossed up**
(2026-11-17); the taxes move from HR payroll to **accounting** (2026-11-18); approved 2026-11-18.

## What and for whom

HR payroll ends at the **net** (§6). Salaries are **net — grossed up** (owner, 2026-11-17): the school pays the
employee's insurance share, income tax and martyrs' fund on top. That is accounting's job (owner,
2026-11-18): a new `accounting` module, at the top of the module order, works them out **when HR
approves a month**, with the tax rule and each employee's insurance at that moment, and keeps them
frozen. The Accountant and System admin own the tax rule (Settings → Accounting) and see the
months' taxes (API only for now).

## Defaults

From the school's previous HR system (GUESS, to confirm with the accountant): monthly slices 5,000 →
0% · 1,250 → 10% · 1,250 → 15% · 10,833.33 → 20% · 16,666.67 → 22.5% · the rest → 25%; martyrs'
fund 0.05% of the gross; insurance share 11% of the insured salary (insured only).

## Rules

Exact text in `docs/business/10-accounting.md`. Gross-up: taxable `t` solves
`t − tax(t) − fund × (t + insurance) = net` slice by slice in integers, rounded half up once; gross
= net + insurance + tax + fund (always balances).

## Contract

- `GET /accounting/settings` → `{ payroll: { brackets: { width: Piastres | null; percent }[];
  martyrPercent; insurancePercent } }` (`accounting.settings.view`).
- `PATCH /accounting/settings` — `{ payroll?: Partial<…> }`; `brackets` replaces the table. Shape
  errors → 400 `VALIDATION_FAILED`; a merged rule that breaks §10 → 400 `INVALID_TAX_RULE`
  (`accounting.settings.edit`, audited `accounting.settings.update`).
- `GET /accounting/payroll` → approved months, newest first, with totals (paginated);
  `GET /accounting/payroll/:month` → the month's lines (net, insurance status and insured salary
  snapshot, insurance share, income tax, fund, gross), totals and the frozen rule. 404 for a month
  HR hasn't approved; 400 for a malformed month (`accounting.payroll.view`).
- Event: listens to `hr.payroll.approved` (must-deliver, through the outbox — `docs/EVENTS.md`); records `accounting.payroll.record` (system) in the audit
  log. Idempotent per HR run.

## Data

`accounting_payroll_runs` (HR run id and month unique, tax rule snapshot) and
`accounting_payroll_lines`. HR's `payroll_lines` are unchanged.

## Screens

Settings → **Accounting** (shown with `accounting.settings.view`): the tax rule — slices (the last is
"the rest"), fund and insurance rates — with a live example from the shared maths.

## Out of scope

A screen for the months' taxes (needs mockups), journal entries, the employer's insurance share,
insurance caps, annual settlement, per-employee exemptions.
