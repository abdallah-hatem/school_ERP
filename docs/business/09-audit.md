# §9 Audit log

Who did what, to which record, and when — for the whole system. Spec:
`docs/specs/2026-11-17-audit-log.md`.

- **DECIDED** — Every action that changes data or access is recorded: sign-in, sign-out and failed
  sign-ins; a sign-in locked by too many wrong passwords (with the email typed, §2; attempts refused
  while locked count as failed sign-ins) and its unlock by a System admin; users (create, edit, deactivate, reactivate, temporary password, own password change)
  and roles (create, edit, delete); school settings, logo and stages; employees (create, edit, deactivate, reactivate);
  departments, job titles and employee grades; HR rules and the penalty catalogue; penalties (record, the stage
  review's approval, HR's approval, a rejection at either step, cancel — owner 2026-11-21); monthly lateness (per employee, minutes before and after); payroll runs (create,
  recalculate, approve) and adjustments (add, remove); contracts (every decision, §3) and their
  signed copy — a page added (its name, the number of pages before → after) or removed (with the
  reason; the file is kept) — owner 2026-11-24.
- **DECIDED** (spec 2026-11-24; owner 2026-11-24) — Opening a contract document is recorded, unlike
  other reads: a notice letter, a request, an end's attachment or a page of the signed copy, each
  opening an entry on the contract (who, when, which file). The viewer shows every page, so opening
  a two-page signed copy records two entries.
- **DECIDED** — Each entry keeps who did it (their name as it was then), when, from which IP and
  device, the record it touched, and only the fields that changed, each with the value before and
  after. Passwords and tokens are never recorded. A failed sign-in keeps the email that was typed.
- **DECIDED** — An entry is saved together with the change: if one fails, neither is kept. Since
  2026-11-18 (T28) this holds for sign-ins, settings, stages, departments, job titles, the penalty
  catalogue and employees too; monthly lateness, payroll and penalties since T29.
- **DECIDED** — A failed sign-in is recorded with the email as typed and no person; it reads the
  same whether or not the email belongs to an account, so neither the sign-in screen nor the log
  tells someone which emails exist. A token refresh (staying signed in) is not recorded.
- **DECIDED** — An employee's change shows the names of what was picked, not codes: "Department:
  Science → Maths", "Direct manager: Omar → Mona", as they were named then. A new photo, a status
  change and every edited field are entries on the employee's History tab.
- **DECIDED** — Employees added by the demo seed are recorded with no person ("System").
- **DECIDED** — A penalty's entries (recorded, approved, cancelled — one each) name the employee
  and the violation, not codes, with the date, the level ("2nd time"), the penalty and its days,
  and the status: approving shows "Pending → Approved" (and the level fixed at approval if it
  differs from the one at recording), cancelling the status and the reason. A refused penalty (the
  day already has one, the month's payroll is approved, already cancelled) leaves no entry.
  An employee's **History** tab lists their penalties too, for whoever may see that employee's
  penalties (§2). A penalty has no amount (it is days; payroll prices them), so nothing in it is
  hidden as salary.
- **DECIDED** (owner, 2026-11-20) — A payroll run has a **History** tab beside its employees: who
  created it, recalculated it, added or removed adjustments (the employee, type, amount and reason),
  approved it, and Accounting returning it or marking it transferred — with the same field and
  person filters as an employee's History, amounts in pounds and statuses in words. It is shown to
  whoever may open the run and read the activity log; like the run's entries on Activity, it needs
  the whole school's payroll (someone who sees only part of it gets "We couldn't find that page").
  An employee's History does not list lateness months or payroll runs: those entries hold several
  employees' figures at once.
- **DECIDED** (owner, 2026-11-20) — A run's figures in History and Activity read as a person would
  write them: **Created** shows the net and the number of employees; **Approved** shows Draft →
  Approved and the net; **Recalculated** shows only the figures that changed, before → after ("No
  change in totals" if none did). "Need review" is never shown. The log itself keeps every figure.
- **DECIDED** — Activity's search finds a person by name (either language) or by **employee code**
  (EMP-0007, any case): their own entries and their penalties'; and a payroll or lateness month by
  its month. Entries keep names; the code is looked up live, so older entries are found too.
- **DECIDED** — A month's lateness is one entry: one line per employee whose minutes changed,
  named, with the minutes before and after. Approving a payroll run is one entry with the run's
  totals, not one per employee.
- **DECIDED** — Entries can't be edited or deleted by anyone, and are kept forever (for now).
- **DECIDED** — Opening or reading something (a payslip, a profile) is not recorded — except a
  contract document (above).
- **DECIDED** (enforced, P4) — Whoever holds the "view activity log" permission (§2: System admin,
  HR manager, principal) sees the Activity page and the History tab — but only entries about
  records they may see (§2): an employee, their penalties, their lateness minutes and their payroll
  lines outside the viewer's stage or team are left out, and so are the people and counts on
  "Today at a glance" that come from them. The History of an employee they can't see shows "We
  couldn't find that page". Salary-type amounts (salaries, insured salary, bank details, payroll amounts)
  read "Changed (amount hidden)" for someone who can't see salaries; a payroll run's totals follow
  the Payroll screen (shown to whoever sees the whole school's payroll).
- **DECIDED** — Every entry reads in English and in Arabic, including entries made before a
  language switch. A record's name shows in the screen's language as it was at the time of the
  change — also for the settings and catalogue changes made before the log kept both names (those
  read the Arabic name from the change itself; the log is never rewritten).
