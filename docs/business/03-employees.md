# §3 Employees

## Lists

- **DECIDED** — **Stages:** Kindergarten, Primary, Preparatory, plus "None" for staff not tied to a
  stage. **Departments** and **job titles** are lists the school manages in Settings (§7).
  Each item has an English and an Arabic name.
- **DECIDED** — A list item in use by an employee can't be deleted, only hidden from new choices.

## Employee record

| Field | Rule |
|---|---|
| Employee code | Assigned automatically, unique, never reused (e.g. `EMP-0001`). DECIDED (the client's "job code") |
| Full name, English and Arabic | Both required |
| National ID | Optional; if given, 14 digits and unique. GUESS |
| Gender, date of birth | Required. Date of birth used for the "over 50" annual-leave rule later. GUESS |
| Phone, email, address | Phone required; email optional; address optional |
| Hire date | Required; not in the future |
| Stage, department, job title | Required (stage can be "None") |
| Direct manager | Optional; must be another active employee; no one can be their own manager or create a loop |
| Grade | Optional text. DECIDED (the client's regulations refer to grades) |
| Work system | Full-time, or part-time 4, 3 or 2 days a week. DECIDED |
| Basic salary | Monthly, in EGP, required, greater than 0 |
| Fingerprint ID | Optional; unique if given (for the device integration later) |
| Contract start / end | Defaults to 1 June – 31 May of the current contract year; end after start. DECIDED (one-year fixed contract) |
| Uses school bus | Yes / no |
| Status | Active or inactive |

## Rules

- **DECIDED** — An employee is never deleted. They are **deactivated**, keeping all history.
- **DECIDED** — Inactive employees are not included in new payroll runs and can't get new penalties
  or lateness entries.
- **GUESS** — Reactivating an employee is allowed.
