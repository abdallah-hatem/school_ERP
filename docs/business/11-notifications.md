# §11 Notifications

Telling staff, inside the ERP, that something waits for them or is due. Spec:
`docs/specs/2026-11-18-notifications.md`. **Partly built** — the mechanism is built (who is told,
grouping, never twice, done approvals, access, preferences, retention); nothing sends a notification
yet (HR's come next) and the screens are Planned (layout option A, below).

## What and how

- **DECIDED** (owner, 2026-11-18) — One channel for now: **in the app**. A bell shows how many
  notifications are unread and opens the list. Email, WhatsApp and SMS are Planned, and adding one
  must not change how any module decides what to send.
- **DECIDED** (owner, 2026-11-18) — **The bell opens a short list over the page** (all, or unread
  only), with "Mark all as read" and a link to the notification settings; on a phone the list
  fills the screen. The screens show only notifications in the app — no other channel is mentioned
  anywhere.
- **DECIDED** (owner, 2026-11-18) — Recipients are **staff users** now. Parents and students are
  Planned.
- **DECIDED** — A person sees only their own notifications. Nobody, the System admin included, reads
  someone else's.
- **GUESS** — Each notification reads as a short sentence in the person's language (Arabic or
  English, with the right plural form), says when it happened, and opens the record it is about.
  Switching language shows old notifications in the new language too.
- **GUESS** — The bell updates within a minute, and as soon as the person comes back to the tab.

## Who is told what

- **DECIDED** (owner, 2026-11-18) — Recipients are chosen by **what they may do**, not by role
  name: whoever may approve penalties is told about penalties waiting, within the employees they
  cover (their stage, their team, or the whole school — §2).
- **GUESS** — The person who caused the event isn't told about it (recording a penalty you may
  approve yourself sends you nothing).
- **DECIDED** (owner, 2026-11-18) — First notifications (who gets each is §2's GUESS roles):

| Notification | Who gets it | When | Goes away when |
|---|---|---|---|
| Penalty waiting for your approval | Whoever may approve penalties for that employee (§2) | A penalty is recorded | It is approved or cancelled, by anyone |
| Payroll ready to approve | Whoever may approve payroll | A draft month is calculated and has no pending penalties | It is approved (or a pending penalty appears in the month again) |
| Contract ends soon | Whoever may edit that employee | 30 days, and again 7 days, before the contract ends | The contract is extended, or the employee is deactivated |
| Probation ends soon | Whoever may edit that employee | 7 days before the employee's probation end date | The date passes or moves, or the employee is deactivated |
| Lateness not entered | Whoever may enter lateness | From the 25th, while the month's lateness was never saved | The month is saved, or its payroll is approved |
| Payroll not prepared | Whoever may prepare payroll | From the 28th, while the month has no payroll run | A run is created |
| Payroll still a draft | Whoever may approve payroll | From the 28th, while the month's run is a draft | It is approved |

- **GUESS** — When an approval is done by one person, everyone else who was told sees it as done
  ("Approved by Laila Hassan") and it no longer counts as unread.
- **DECIDED** (owner, 2026-11-18) — Many of one kind at once make **one notification** that groups
  them ("12 contracts end within 30 days", "3 penalties waiting for your approval") and opens into
  the list of them. One on its own reads as itself. Once read, the next one starts a new
  notification.
- **DECIDED** (owner, 2026-11-18) — **Probation** is a date on each employee's record (§3): filled
  with the hire date plus the school's default probation length (3 months, a setting; 0 means no
  probation) and editable. The reminder follows the employee's date.
- **DECIDED** (owner, 2026-11-18) — Lateness must be entered **by the 25th** and payroll prepared and
  approved **by the 28th** of the month; both days are settings. GUESS until the school confirms
  the days.

## Reminders

- **DECIDED** (owner, 2026-11-18) — Reminders are checked every day by the system on its own.
- **GUESS** — The check runs at 07:00 school time (Cairo). "Today" and "this month" are the school's.
  A check day past the month's end means the month's last day (the 31st → 28 February).
- **DECIDED** — A reminder is never sent twice for the same thing. If the system was down on the
  day, the next day's check sends it once.
- **GUESS** — A month counts as having its lateness entered once it was saved, even with all zeros.

## Preferences

- **DECIDED** (owner, 2026-11-18) — Each person chooses, **per kind of notification and per
  channel**, what they receive. The school sets the **defaults** in Settings. Some kinds can't be
  turned off.
- **DECIDED** (owner, 2026-11-18) — On screen, each kind of notification is **one switch** (on or
  off) for the person, in My account → Notifications; Settings → Notifications has the same list for
  the school's defaults. A kind that can't be turned off shows as on and can't be changed.
- **DECIDED** (owner, 2026-11-18) — "Waiting for your approval" can't be turned off: approvals
  depend on it. Reminders can.
- **GUESS** — Turning a kind off stops new ones; notifications already received stay.
- **DECIDED** (owner, 2026-11-18) — Settings → Notifications: the System admin changes the school's
  defaults and how long notifications are kept; the HR manager sees them read-only. The reminder timings are HR rules (§7), changed
  by whoever may change HR rules.

| Setting | Default | Source |
|---|---|---|
| Remind before a contract ends | 30 days, and again 7 days | DECIDED (owner, 2026-11-18) |
| Default probation length (fills a new employee's probation end) | 3 months (0 = no probation) | DECIDED (owner, 2026-11-18) |
| Remind before probation ends | 7 days | GUESS |
| Lateness due by (day of the month) | 25 | DECIDED setting; day GUESS until the school confirms |
| Payroll prepared and approved by (day of the month) | 28 | DECIDED setting; day GUESS until the school confirms |
| Keep read notifications | 90 days | DECIDED (owner, 2026-11-18) |
| Keep done approvals | 30 days | DECIDED (owner, 2026-11-18) |
| Keep any notification at most | 365 days (old ones are removed every night) | DECIDED (owner, 2026-11-18) |

## Access

- **DECIDED** (§2) — A notification never shows more than its reader may see. Someone who loses the
  right to approve, or whose stage or team no longer covers the employee, no longer sees those
  notifications (they leave the list and the count). Opening one shows "This page isn't here", as
  for any record outside their reach.
- **GUESS** — Payroll notifications show the month's net only to someone who may see the school's
  payroll totals (§2).

## Not the audit log

- **DECIDED** — Notifications are not the activity log (§9): they are personal, and old ones are
  deleted. The change that caused one is recorded in the log as usual; reading or marking a
  notification read is not recorded. Changing one's own preferences, the school's defaults and the
  reminder timings is recorded (they are settings).
