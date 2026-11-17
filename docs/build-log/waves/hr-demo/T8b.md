# T8b — Lateness extras

Branch `feature/t8b-lateness-extras` from `origin/dev` (`841b3f3`). Class: logic.

## Built

- **Contract** ("Monthly lateness — hr"): `GET /hr/lateness?month=` and `PUT /hr/lateness/:month`
  now return `{ locked, rows: [{ employee, department: { id, nameEn, nameAr }, minutes, days }] }`.
  `locked` comes from `MonthLockService.isMonthLocked(month)` (true once the month's payroll is
  APPROVED; a DRAFT run doesn't lock). The row fields `employee`, `minutes` and `days` are unchanged.
- `packages/shared/src/types/hr.ts`: `LatenessRow.department: NamedRef`, new `LatenessMonth`.
- api: `EmployeesService.listActiveWithDepartments()` (and the repository's
  `findActiveWithDepartments()`); `LatenessService.month(month)` → `{ locked, rows }`.
  `LatenessService.list(month)` still returns the rows array (now with `department`), and
  `EmployeesService.listActiveRefs()` is unchanged, so payroll (T9) can keep calling them.
- Month helpers: `apps/api/src/common/utils/dates.util.ts` no longer defines `isMonth` / `monthOf`.
  It re-exports them from `@school-erp/shared` (`packages/shared/src/months.ts`). The shared
  `monthOf` now takes `Date | IsoDate`. A `YYYY-MM-DD` string gives the month it is written in
  (what the api's version did). A `Date` gives its local-calendar month (unchanged for the web).
  No caller changed.
- web `modules/hr/lateness`: the board takes `locked` from the load and opens read-only (banner,
  pill, inputs disabled, Save hidden) without waiting for a 409. A successful save also takes
  `locked` from the response. The department column reads `row.department`. `GET_ACTIVE_EMPLOYEES`
  and the paged department lookup are gone, and so is the unused `lateness.noDepartment` key
  (removed in both en and ar).

## Tests

- e2e `hr-lateness`: `locked` false (no run, DRAFT run) / true (APPROVED run), PUT returns the same
  shape; each row carries its department `{ id, nameEn, nameAr }`. Existing cases adapted to
  `.rows`.
- unit: `LatenessService.month` locked false/true; rows carry the department. shared: `monthOf` on
  a `YYYY-MM-DD` string.
- web: opens locked on load (banner, read-only, no request); an open month shows no banner; each row
  shows its own department from the row.

## Doubts

- PUT's response follows GET's new shape (`{ locked, rows }`). The contract says it returns "the
  month's list", so the two stay the same.
