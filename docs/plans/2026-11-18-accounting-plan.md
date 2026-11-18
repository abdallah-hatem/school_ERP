# Plan — accounting module, first slice: payroll taxes

Spec: `docs/specs/2026-11-18-payroll-tax.md` · Business: §10 (`docs/business/10-accounting.md`),
§6, §3, §2, §7 · Mode: build-software feature mode · Owner decisions: salaries are **net — grossed up**
(2026-11-17); taxes belong to **accounting**, not HR payroll (2026-11-18); worked out **on approval,
frozen**; the rule lives in **Settings → Accounting**; no accounting screen for the months yet
(2026-11-18).

## Spec (summary)

HR payroll ends at the net. The new `accounting` module — the top of the module order — owns:

- **The payroll tax rule**: monthly income-tax slices, the martyrs' fund rate and the employee's
  insurance share. Its defaults come from the school's previous HR system (GUESS, to confirm with
  the accountant).
- **Each approved month's payroll taxes.** When HR approves a month (`payroll.approved`),
  accounting works out each line's insurance share, income tax, martyrs' fund and gross. It uses
  the rule and the employees' insurance at that moment and keeps the result frozen.

Permissions: `accounting.settings.view` / `.edit` and `accounting.payroll.view`, for the Accountant
and the System admin. Tax, insurance and gross are salary data: they are hidden without
`hr.employees.view_salary`, as P4 does for HR payroll.

## Tasks

| PR | Task | Class | Depends on |
|---|---|---|---|
| A | Shared tax maths: `packages/shared/src/rules/payroll-tax.ts` (gross-up, income tax, fund, insurance share, `taxRuleIssues`), setting keys and defaults | `logic` | — |
| B | `accounting` module + tax-rule API: `GET/PATCH /accounting/settings`, permissions and Accountant grants, audit `accounting.settings.update`, module-order rule, §10 (rule) | `logic` | A |
| C | Settings → Accounting panel: slices ("the rest" last), fund, insurance share, live example from the shared maths, EN/AR | `ui` | B |
| D | Taxes on approval: listener on `payroll.approved`, `accounting_payroll_runs/lines`, `GET /accounting/payroll[/:month]`, salary visibility, audit `accounting.payroll.record`, §10 (calculation), §6 | `logic` | B, T29 |

| E | Payroll taxes screen (mockup option C): year board (`GET /accounting/payroll/year/:year`, drafts read through HR's `PayrollService`), the month's statement, Excel (`GET /accounting/payroll/:month/export`) and print, `DataTable` totals row, sidebar Accounting live, §10 (screen) | `ui` | D |

Later (not planned yet): journal entries, the employer's insurance share.

## Edge cases (expected outcome · source)

A — maths
- Net in the 0% slice, not insured → tax 0, fund on the gross, gross = net + fund · §10
- Net exactly at a slice's top → stays in that slice, no piastre off · §10
- Net in the open-ended 25% slice → solved there · §10
- Insured on 5,000.00 → insurance 550.00; gross − insurance − tax − fund = net exactly · §10
- Net 0 (floored), insured → insurance and its fund still paid; not insured → all 0 · §10
- All rates 0 → gross = net · §10
- Previous-system parity: 10,000.00 taxable → 812.50; 4,000.00 → 0 · §10

B — rule API
- An open-ended slice in the middle, a last slice with a width, or a slice rate + fund ≥ 100% (exactly 100% included) → 400 `INVALID_TAX_RULE`, nothing saved · §10
- A bad shape (unknown key, no slices, width 0 or fractional, rate 100 or 3 decimals, 11 slices) → 400 `VALIDATION_FAILED` · §10
- Without `accounting.settings.edit` → PATCH 403, nothing saved; without `.view` → GET 403 · §2
- An unchanged save writes nothing; a change is one audit entry in the accounting module · §9

C — panel
- Adding a slice puts it before "the rest"; saving sends the whole table and only the changed keys · §10
- Slice rate + fund ≥ 100% → inline error, example paused, Save disabled · §10
- Arabic messages; view-only users get no Save bar · §2

D — on approval
- Approve → one record per line with the expected numbers · §10
- The event twice → still one record (idempotent) · §10
- Rule or insurance changed after approval → the month unchanged · §10
- A draft month → 404 in accounting; a missed event → worked out on first read · §10
- Without `hr.employees.view_salary` → lines without money · §2 (P4)
- Without `accounting.payroll.view` → 403 · §2
