# Contracts — spec (approved by the owner as drafted, 2026-11-24)

Roadmap module (16), the part not built yet. Source: the school's regulations, contract pages
(employment relationship, Article 166, resignation and non-renewal notes). Status of each rule:
DECIDED (owner), GUESS (my default, change it if wrong), OPEN (needs an answer). The owner approved
the spec as drafted, so each OPEN point takes its stated default.

## What exists today

Each employee has one **contract start / end** on their record (default 1 June – 31 May), and a
reminder 30 and 7 days before the end (§11). Renewing means editing the dates by hand, which
overwrites the old contract: there is no history, no renewal decision, no notice, no termination.

## What it adds

1. **Contract history.** Each employee has a list of contracts, one per contract year. The record's
   start/end become "the current contract". Old contracts are kept, never deleted.
2. **Renewal season.** One screen per contract year: every employee whose contract ends this year,
   with the decision for each — renew, not renewing (school's decision), or the employee gave
   notice. Renewing creates next year's contract (1 June – 31 May). Many at once is allowed.
3. **Employee's non-renewal notice.** HR records the written notice: the date it was received and
   the scanned letter. The regulations' window is the first day of term 2 to 30 April.
4. **Early termination at the end of term 1.** HR records the employee's request and approves or
   rejects it with a reason. Approved → the contract ends on the last day of term 1 (exams
   included).
5. **Ending a contract early for other reasons** — dismissal under Article 148, resignation by
   agreement, death, other — with the reason, the date and an attachment.
6. **The school calendar per contract year** (Settings → HR): first day of term 1, last day of
   term 1 (exams included), first day of term 2, the non-renewal deadline (30 April). The notice
   window and early termination read these dates.
7. **Reminders** (§11) for the renewal season, below.

## Rules — the exact edit to §3 (employees), new section "Contracts"

- **DECIDED** — A contract is one year, 1 June – 31 May, renewed only if both sides want it
  (regulations). It is kept forever; ending or replacing it never deletes it.
- **GUESS** — A contract's status: **Active** → **Renewed** (next year's contract exists) ·
  **Not renewed** (school's decision or the employee's notice; ends on its end date) ·
  **Ended early** (early termination or another reason; ends on the date given). One active
  contract per employee at a time; contracts never overlap.
- **GUESS** — Renewing keeps the salary, job and stage as they are on the record. A raise on renewal
  is payroll's annual raise (Planned), not this.
- **GUESS** — The school decides each renewal; nothing renews by itself. A contract that reaches its
  end with no decision shows as **"Ended, no decision"** on the renewal screen until HR renews it or
  marks it not renewed. The employee stays active meanwhile (a mid-year start is common), and the
  contract-end reminder already chases it.
- **GUESS** — Not renewed → on the day after the end, the employee appears in a "To deactivate" list;
  HR deactivates them (one click, one or many). No automatic deactivation, because payroll for the
  last month may still be open.
- **GUESS** — An employee's non-renewal notice received **outside** the window (before term 2 or after
  30 April) is still recorded, marked **"Late"** or **"Early"**. The regulations don't say what
  happens then; the school decides case by case. A notice can be withdrawn while the contract is
  still active, with a reason.
- **OPEN** — Early termination: may the request be handed in **only on** the first day of term 1, or
  **from** that day on (the regulations say "not before this date")? My default: from that day until
  the last day of term 1.
- **GUESS** — An approved early termination ends the contract on the last day of term 1. Leaving
  before that owes the compensation written in the contract; the system records it as a note, it
  doesn't calculate it.
- **GUESS** — Ending a contract for another reason takes a reason type, an end date (today or later,
  not before the contract start) and a note; an attachment is optional. Dismissal under Article 148
  can later link to an investigation (Planned).
- **DECIDED** (existing rule, §2) — Nobody acts on their own contract: renew, not renew, record a
  notice, decide an early termination or end it. A System admin neither.
- **GUESS** — Deemed resignation (Article 166: over 20 days' unexcused absence in a year or over 10
  in a row, after a registered warning) is **not** in this module; it needs attendance and comes
  with it.
- **DECIDED** — Every write is audited (contract created, renewed, not renewed, notice recorded or
  withdrawn, early termination requested / approved / rejected, contract ended, calendar changed).

## Who can do it — exact edit to §2

- **View contracts** (`hr.contracts.view`) — scopes all / own stage / own team. HR manager, HR
  officer, principal (all); stage head (own stage). GUESS
- **Manage contracts** (`hr.contracts.manage`) — renew, not renew, record notices, end early,
  decide early termination. HR manager (all). GUESS
- **School calendar** — part of HR settings (`hr.settings.manage`). GUESS
- Roles stay editable by the admin, so these are only the seeded defaults.

## Reminders — exact edit to §11

| Notification | Who | When | Goes away when |
|---|---|---|---|
| Renewal decisions due | Whoever may manage contracts | From 1 March, while contracts ending 31 May have no decision | Every one has a decision |
| Non-renewal window opens | Whoever may manage contracts | The first day of term 2 | Read |
| Non-renewal window closes soon | Whoever may manage contracts | 7 days before 30 April | Read |
| Early termination waiting | Whoever may manage contracts | A request is recorded | It is approved or rejected |

The existing "Contract ends soon" reminder stays; it goes away also when a renewal decision is made.
Timings are settings, like the existing reminders (GUESS: 1 March, 7 days).

## Screens

- **Employee page → Contracts tab** (new tab): the history (year, dates, status, who decided, when),
  and the actions on the current one. Built from the existing tabs and tables.
- **HR → Contracts (Renewals)** — new page type: the contract year picker, tiles (ending this year,
  decided, not decided, notices received, to deactivate), and the list with a decision per row and
  bulk renew. **Layout: option A, table** (owner, 2026-11-24) — five tiles, filters, one row per
  employee with a decision pill and its next action, a ⋯ menu for the other decisions, a "Renew
  selected" bar; on phone cards and a bottom sheet. Mockup `design/mockups/contracts-renewals.html`
  on the `design` branch.
- **Settings → HR → School calendar** — the four dates per contract year.
- Paged, searched and sorted by the API, as every list.

## API (sketch)

- `GET /hr/contracts?year=&status=&decision=&stageId=&q=&page=` — the renewal list, with totals.
- `GET /hr/employees/:id/contracts` — one employee's history.
- `POST /hr/contracts/renew` `{ contractIds[] }` — bulk renew, all or nothing, with the reason per
  refused row.
- `POST /hr/contracts/:id/not-renewed` `{ by: SCHOOL | EMPLOYEE, receivedOn?, note?, fileId? }`
- `POST /hr/contracts/:id/notice/withdraw` `{ reason }`
- `POST /hr/contracts/:id/early-termination` `{ requestedOn, note?, fileId? }`, then
  `/approve` · `/reject` `{ reason }`
- `POST /hr/contracts/:id/end` `{ reason, endsOn, note, fileId? }`
- `GET/PUT /hr/settings/school-calendar/:year`

## Data

- New table `employee_contracts` (employee, start, end, status, decision by / at, notice received
  on, end reason, end date, note, file). The employee's `contract_start` / `contract_end` stay as
  the current contract, written only by this module.
- Migration: each existing employee gets one contract row from their current dates.
- School calendar: one row per contract year in HR settings. When academics (academic years) is
  built, it takes these dates over.

## Edge cases

1. Renewing an employee who is already renewed → refused, "already renewed".
2. Renewing an inactive employee → refused.
3. Bulk renew with one refused row → nothing is renewed; the refused rows are listed.
4. Two HR users renewing the same contract at once → one wins, the other gets "already renewed".
5. Contract started mid-year (1 Sep) → its end is 31 August; renewal creates 1 Sep – 31 Aug (GUESS:
   keeps its own cycle), and it appears on the renewal screen of the year it ends.
6. A notice dated before term 2 or after 30 April → recorded, marked Early / Late.
7. The calendar for the year isn't set → notices and early termination can be recorded, but marked
   "calendar not set"; the renewal screen shows a banner linking to the setting.
8. Early termination approved, then the employee withdraws → OPEN; default: a rejected / withdrawn
   request can't be re-approved, a new request is needed.
9. Ending a contract with an end date before a payroll month already approved → refused (the paid
   month stands).
10. Ending a contract → the employee's future reminders (contract, probation) go away.
11. Acting on your own contract → refused (OWN_CONTRACT).
12. A stage head trying to manage → refused; viewing another stage → not found.
13. Changing the contract dates by hand on the employee form → no longer possible; they change only
    through this module.
14. Penalty repetition window (contract year, §4) is unchanged; it keeps using 1 June – 31 May.

## Out of scope

Deemed resignation (with attendance) · the annual raise on renewal (payroll) · calculating
compensation · employees sending notices themselves (self-service portal) · investigations · part-time
contracts (with part-time work).
