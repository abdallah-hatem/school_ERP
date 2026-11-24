# §3 Employees

## Lists

- **DECIDED** — **Stages:** Kindergarten, Primary, Preparatory, plus "None" for staff not tied to a
  stage (all four come from the seed). **Departments**, **job titles** and **employee grades** are lists the school manages in Settings (§7; employee grades: owner, 2026-11-24 — "grades" alone means school grades, academics).
- **DECIDED** (2026-11-18) — The **"no stage" entry** is one stage marked as such by the seed, not
  recognised by its name: the school can rename it (or call it anything in either language) and it
  keeps its role — employee cards still give it the neutral colour and leave it out of the stage
  colour order. At most one stage carries the mark, and no screen sets or moves it.
  Each item has an English and an Arabic name.
- **DECIDED** — A list item in use by an employee can't be deleted, only hidden from new choices.
- **DECIDED** — Hidden items are left out of lists unless asked for. An employee who already has a
  hidden item keeps it when their record is edited; only a newly chosen item must be visible.

- **DECIDED** (owner, 2026-11-18) — Each **job title** has a **Manages people** switch (off by
  default), set in Settings (§7). It marks the titles whose holders lead other staff — e.g.
  principal, vice principal, stage head, head of department, HR manager, administrative director.
- **DECIDED** (owner, 2026-11-24) — **Employee grades** are managed like departments and job titles (Settings
  → HR lists), by the same permissions: **View HR lists** to see them, **Manage HR lists** to add,
  rename, hide or show them (§2). Every change is in the audit log (§9).

## Direct managers

- **DECIDED** (owner, 2026-11-18) — The **Direct manager** picker on the employee form lists only
  active employees whose job title manages people, never the employee themself, plus "No direct
  manager". It can be searched by name or code.
- **DECIDED** (owner, 2026-11-18) — An employee whose manager **no longer qualifies** (the
  manager's job title changed, or the title's switch was turned off) **keeps that manager**: the
  picker still shows them, with the note "No longer in a managing role" — the same way a hidden
  department is kept and flagged. Unrelated edits save normally.
- **DECIDED** (owner, 2026-11-18) — Choosing someone whose job title doesn't manage people is
  refused ("The direct manager must hold a job title that manages people."), unless it is the
  employee's existing manager left unchanged. The other manager rules (active, not self, no loop)
  still apply.

## Employee record

| Field | Rule |
|---|---|
| Employee code | Assigned automatically, unique, never reused (e.g. `EMP-0001`). DECIDED (the client's "job code") |
| Full name, English and Arabic | Both required |
| National ID | Optional; if given, 14 digits and unique. GUESS |
| Gender, date of birth | Required. Date of birth used for the "over 50" annual-leave rule later. GUESS |
| Phone, email, address | Phone required; email optional; address optional |
| Hire date | Required; not in the future |
| Main stage, department, job title | Required (stage can be "None"). The main stage gives the card its colour and counts the person in the dashboard's headcount and payroll groups. DECIDED |
| Also teaches in | Optional: the employee's **other stages** besides the main one (never the main stage, each once; a newly picked stage must be shown). Shown as tags on the employee's page and card, edited in the employee form. DECIDED (owner, 2026-11-21) |
| Direct manager | Optional; must be another active employee whose job title **manages people** (see Direct managers); no one can be their own manager or create a loop |
| Grade | Optional, picked from the school's **Employee grades** list (Settings → HR lists, next to departments and job titles; e.g. "Pay grade 1"), like the other lists: each grade has an English and an Arabic name, a hidden grade is kept by the employees who have it but can't be newly chosen, and a grade is never deleted. Shown on the employee's page in the page's language. Grades typed as text before became list items: texts that differ only by spaces or case became one item, named after the most common spelling, the same text in both languages. DECIDED (owner, 2026-11-24; the client's regulations refer to grades) |
| Work system | Full-time, or part-time 4, 3 or 2 days a week. DECIDED |
| Basic salary | Monthly, in EGP, required, greater than 0 |
| Fingerprint ID | Optional; unique if given (for the device integration later) |
| Probation end | Optional date, on or after the hire date. Left empty on a new employee, it is filled with the hire date + the school's default probation length (§7, 3 months), the day before: hired 1 Sep → 30 Nov; a day the month lacks counts as its last (hired 30 Nov → 27 Feb, GUESS). Length 0 = no probation: left empty. Editable, and can be cleared (no probation). Changing the hire date doesn't move it (GUESS), but a hire date after it is refused. Changing the default length changes only employees added afterwards. Not salary-type: whoever sees the employee sees it (§2). Employees who existed before it was added got hire date + 3 months. The probation reminder (§11) follows it. DECIDED (owner, 2026-11-18) |
| Contract start / end | The **contract in force today** (see Contracts below; a renewal's next contract takes over on its first day, not when it is created). Set when the employee is added — filled automatically when left empty: 1 June – 31 May of the current contract year; if only a start is given, the end is one year later minus a day (e.g. 1 Sep 2026 → 31 Aug 2027). End after start. DECIDED (one-year fixed contract). Afterwards they change only through Contracts (renewing, ending), never on the employee form (owner, 2026-11-24) |
| Uses school bus | Yes / no, required (defaults to no) |
| Photo | Optional; PNG, JPG or WebP, up to 2 MB, shown square-cropped. Only signed-in users can open it. Without a photo the employee shows a neutral silhouette, never initials. DECIDED (owner, 2026-11-18) |
| Status | Active or inactive |

## Insurance, bank, emergency contact and qualification

**DECIDED** (owner, 2026-11-18) — four more groups on the employee record. Accounting takes the
employee's insurance share from the insurance status and insured salary as the approved payroll
line recorded them (§6, §10). The bank sheet of an approved run lists the bank details (§6);
paying by bank transfer is Planned.

| Group | Field | Rule |
|---|---|---|
| Social insurance | Status | Insured or not insured; required, defaults to not insured |
| | Insurance number | Digits only (up to 20); unique across employees; required when insured |
| | Registration date | Required when insured; not in the future |
| | Insured salary | Monthly, in EGP, kept to the piastre; required when insured, greater than 0 |
| Bank account | Bank name, account number | Optional |
| | IBAN | Optional; if given, an Egyptian IBAN: `EG` followed by 27 digits (spaces are ignored) |
| Emergency contact | Name, relationship | Optional |
| | Phone | Optional; same rules as the employee's phone |
| Qualification | Highest degree | Optional; one of none, secondary, diploma, bachelor's, master's, doctorate |
| | Major, university | Optional |
| | Graduation year | Optional; from 1950 to the current year |

- **DECIDED** — Choosing **not insured** clears the insurance number, registration date and insured
  salary; they are not kept for later.
- **DECIDED** — The employee's address (above) is the only address; the emergency contact has none.
- **DECIDED** — The insured salary and the bank details are salary-type data: they follow the same
  visibility rule as the basic salary (§2).
- **DECIDED** (enforced, P4) — Who sees the basic salary, insured salary and bank details, and
  which employees each role sees at all: §2 Roles.

## Several stages

- **DECIDED** (owner, 2026-11-21: "An employee can be a teacher at primary and secondary stage at the
  same time … he would have two bosses") — An employee has one required **main stage** and
  optional **other stages** ("Also teaches in").
- **DECIDED** (owner, 2026-11-21) — The main stage keeps every current use: the card's colour, the
  headcount by stage on the dashboard (each person counted **once**, by main stage), payroll
  grouping and the default display.
- **DECIDED** (owner, 2026-11-21) — A stage filter or search finds the employee under **every**
  stage they belong to, and each of those stages' heads sees them (§2).
- **DECIDED** (owner, 2026-11-21) — Each penalty records the stage where the violation happened,
  from the employee's stages (§4). Removing a stage from an employee later doesn't change the
  penalties already recorded there.

## Contracts

Spec `docs/specs/2026-11-24-contracts.md` (approved by the owner as drafted, 2026-11-24).

- **DECIDED** — A contract is one year, 1 June – 31 May, renewed only if both sides want it
  (regulations). It is kept forever; ending or replacing it never deletes it. Each employee has a
  list of contracts, one per contract year; the record's contract start / end are the current one.
- **DECIDED** (owner, 2026-11-24, bug found in testing) — **Current vs Upcoming.** The **current**
  contract is the one in force today (Cairo): started, its last day not passed, not cancelled. A
  contract that starts later — a renewal's next contract, or a new contract with a future start — is
  **Upcoming** ("Upcoming · starts 1 Jun 2027") until its first day. The employee's contract start /
  end (Details tab, reminders) name the contract in force — the latest one that has started, or,
  before any has, the first upcoming one; on the start day of the next contract they move to it (the
  daily reminders run, 07:00, and once when the app starts, so a deploy on 1 June doesn't leave them
  stale; a missed run is caught up by the next). Each such move is recorded in the employee's
  History by the system. Renewing in November therefore leaves 2026/27 current (Renewed) and
  2027/28 upcoming, and the dates stay 1 Jun 2026 – 31 May 2027 until 1 June 2027.
- **DECIDED** (owner, 2026-11-24) — **Decisions only once a contract has started.** Renewing, not
  renewing, recording the employee's notice and an early termination request are refused on an
  upcoming contract ("This contract hasn't started yet"); in a bulk renewal it is a refused row and
  nothing is renewed. Ending the contract in force still cancels the upcoming one. The "Contract
  ends soon" reminder follows the contract in force: a renewed one is decided, so no reminder for its
  end; from its first day the new contract is chased from its own end.
- **DECIDED** (owner, 2026-11-24) — A contract that hasn't started can't be ended on its own either;
  a renewal's next contract goes when the contract in force is ended. An upcoming contract that
  **isn't** a renewal — a new hire who never starts, a new contract with a future start — can be
  **cancelled** with a reason ("Cancel contract"): kept, shown as Cancelled, audited. A cancelled
  contract never counts as current, upcoming or for the employee's dates.
- **DECIDED** (owner, 2026-11-24) — "To deactivate" only while the employee has no later contract: a
  reactivated employee with a new contract leaves the list, and the old row isn't carried over.
- **DECIDED** (owner, 2026-11-24) — Nobody deactivates themselves (§2): not from "To deactivate"
  (their own contract), nor from their employee page ("You can't deactivate yourself").
- **GUESS** (2026-11-24) — The employee's Contracts tab names each contract by the contract year it
  **starts** in (1 Sep 2026 – 31 Aug 2027 reads 2026/27), with its exact dates beside it; the
  renewal screen still lists it in the season it ends in.
- **GUESS** — A contract's status: **Active** → **Renewed** (next year's contract exists) ·
  **Not renewed** (school's decision or the employee's notice; ends on its end date) ·
  **Ended early** (early termination or another reason; ends on the date given). One active
  contract per employee at a time; contracts never overlap.
- **GUESS** — Renewing keeps the salary, job and stage as they are on the record. A raise on renewal
  is payroll's annual raise (Planned), not this. Renewing creates next year's contract from the day
  after the end: 1 June – 31 May; a contract started mid-year (1 Sep – 31 Aug) keeps its own cycle
  and appears on the renewal screen of the year it ends. Many can be renewed at once — all or
  nothing: if one can't be (already renewed, inactive employee, a decision made), none is, and the
  screen lists the ones that can't.
- **GUESS** — The school decides each renewal; nothing renews by itself. A contract that reaches its
  end with no decision shows as **"Ended, no decision"** on the renewal screen until HR renews it or
  marks it not renewed. The employee stays active meanwhile (a mid-year start is common), and the
  contract-end reminder already chases it.
- **GUESS** — Not renewed → on the day after the end, the employee appears in a "To deactivate" list;
  HR deactivates them (one click, one or many). No automatic deactivation, because payroll for the
  last month may still be open. A contract of an earlier year that still needs action ("To
  deactivate", or "Ended, no decision") stays on the current season's screen, marked with its year,
  until it is handled — it doesn't disappear on 1 June.
- **GUESS** (review, 2026-11-24) — **The school changes its mind:** its own "not renewing" can be undone,
  with a reason, while the contract hasn't ended; the contract is undecided again and its
  contract-end reminder comes back. After the end, or for an employee who was **reactivated**, HR
  gives the employee a **new contract** — only an active employee with no active contract: from a
  start date (default 1 June of the current contract year) for one year, never overlapping their
  other contracts.
- **GUESS** — An employee's non-renewal notice is recorded by HR with the date it was received and
  the scanned letter. The regulations' window is the first day of term 2 to 30 April; a notice
  received **outside** it (before term 2 or after 30 April) is still recorded, marked **"Late"** or
  **"Early"** — the school decides case by case. A notice can be withdrawn while the contract is
  still active, with a reason.
- **DECIDED** (owner approved the default, 2026-11-24) — **Early termination** at the end of term 1:
  HR records the employee's request from the first day of term 1 until its last day ("not before
  this date"); approved, the contract ends on the last day of term 1 (exams included); rejected, it
  needs a reason, and a rejected request can't be approved later — a new request is needed. Leaving
  before that owes the compensation written in the contract; the system records it as a note, it
  doesn't calculate it.
- **GUESS** — Ending a contract for another reason (dismissal under Article 148, resignation by
  agreement, death, other) takes the reason, an end date (today or later, not before the contract
  start, not after its end) and a note; an attachment is optional. An end that would cut into a
  month whose payroll is approved is refused — the paid month stands. A contract already **renewed**
  can be ended too (a dismissal or death in April after the renewal): next year's contract, which
  hasn't started, is **cancelled** with it (kept, never deleted, shown as "Cancelled"). Ending a contract ends the
  employee's future reminders (contract, probation). Dismissal under Article 148 can later link to
  an investigation (Planned).
- **GUESS** — The school calendar (Settings, §7) gives a contract its dates: the notice window from
  the year whose term 2 falls inside the contract, the end of term 1 from the year whose term 1
  does (for a 1 June – 31 May contract, its own year for both). When the year's calendar isn't set, notices and
  early termination requests are still recorded, marked "Calendar not set", and the renewal screen
  shows a banner linking to the setting; an early termination is approved only once it's set.
- **DECIDED** (existing rule, §2) — Nobody acts on their own contract: renew, not renew, record a
  notice, decide an early termination or end it. A System admin neither.
- **DECIDED** (owner, 2026-11-24: "I can't upload a photo of the contract so I can see it for each
  employee") — **The signed copy.** Each contract can hold its signed copy as one or more files —
  PDF, JPG, PNG or WebP, each up to 10 MB, checked by their content (a renamed file is refused) —
  because a phone photo is one page each. The pages keep their upload order. Any contract may get
  one — past, current or upcoming; old contracts are scanned too — but not a cancelled one (it never
  started). Uploading and removing need **Manage contracts** covering that employee, never on one's
  own contract (an unlinked System admin may, like the other contract writes); viewing needs **View
  contracts** covering that employee (otherwise "We couldn't find that page"). Removing a page needs
  a reason and is soft: the file is kept, with who removed it, when and why, and the page no longer
  shows or opens. Files are never deleted. Every page added or removed is in the employee's History,
  and each page opened is recorded, like the decision letters. A renewal's new contract starts with
  no signed copy; the old one keeps its own.
- **GUESS** (2026-11-24) — Where it is added: the Contracts tab's ⋯ ("Upload signed copy") and its
  Documents column ("Signed copy (2)" / "No signed copy"), the renewal screen's ⋯, and optionally
  while adding an employee (attached to their first contract after saving), renewing one contract or
  making a new contract. Bulk renew has no upload. On a phone the picker offers the camera, the
  photos or a PDF.
- **GUESS** — Deemed resignation (Article 166: over 20 days' unexcused absence in a year or over 10
  in a row, after a registered warning) is **not** in this module; it needs attendance and comes
  with it.
- **DECIDED** — Every write is audited (contract created, renewed, not renewed or undone, notice
  recorded or withdrawn, early termination requested / approved / rejected, contract ended or
  cancelled, calendar changed, a page of the signed copy added or removed),
  and opening a contract document (a letter, an attachment, a page of the signed copy) is recorded too.
- **Screens** — the employee page's **Contracts** tab (the history and the actions on the current
  one) and **HR → Contracts**, the renewal season of one contract year: five tiles (ending this
  year, decided, not decided, notices received, to deactivate), the list with a decision per row,
  bulk renew; on a phone, cards and a bottom sheet.
- **Out of scope** — deemed resignation (with attendance), the annual raise on renewal (payroll),
  calculating compensation, employees sending notices themselves (self-service), investigations,
  part-time contracts.

## Rules

- **DECIDED** — An employee is never deleted. They are **deactivated**, keeping all history.
- **DECIDED** — Inactive employees are not included in new payroll runs and can't get new penalties
  or lateness entries.
- **GUESS** — Reactivating an employee is allowed.
- **DECIDED** (2026-11-21) — The record keeps the school day an employee was last deactivated — a
  leaver on the dashboard charts (§2) in that month; reactivating clears it.
- **DECIDED** — Deactivating an inactive employee, or reactivating an active one, changes nothing and
  reports success.
- **DECIDED** — A required field can't be cleared when editing.

- **DECIDED** (owner, 2026-11-19) — A basic salary and an insured salary are at most **EGP
  1,000,000.00 a month**; a payroll adjustment too (§6). Higher amounts are refused.
