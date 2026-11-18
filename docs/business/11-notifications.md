# §11 Notifications

Telling staff, inside the ERP, that something waits for them or is due. Spec:
`docs/specs/2026-11-18-notifications.md`. **Planned** — spec, plan and mockups are with the owner;
nothing is built until a mockup is picked.

## What and how

- **DECIDED** (owner, 2026-11-18) — One channel for now: **in the app**. A bell shows how many
  notifications are unread and opens the list. Email, WhatsApp and SMS are Planned, and adding one
  must not change how any module decides what to send.
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
- **GUESS** — First notifications:

| Notification | Who gets it | When | Goes away when |
|---|---|---|---|
| Penalty waiting for your approval | Whoever may approve penalties for that employee (§2) | A penalty is recorded | It is approved or cancelled, by anyone |
| Payroll ready to approve | Whoever may approve payroll | A draft month is calculated and has no pending penalties | It is approved (or a pending penalty appears in the month again) |
| Contract ends soon | Whoever may edit that employee | 30 days before the contract ends | The contract is extended, or the employee is deactivated |
| Probation ends soon | Whoever may edit that employee | 7 days before probation ends (probation: 3 months from the hire date) | The date passes, or the employee is deactivated |
| Lateness not entered | Whoever may enter lateness | From the 25th, while the month's lateness was never saved | The month is saved, or its payroll is approved |
| Payroll not prepared | Whoever may prepare payroll | From the 28th, while the month has no payroll run | A run is created |
| Payroll still a draft | Whoever may approve payroll | From the 28th, while the month's run is a draft | It is approved |

- **GUESS** — When an approval is done by one person, everyone else who was told sees it as done
  ("Approved by Laila Hassan") and it no longer counts as unread.
- **GUESS** — One notification per penalty; several of one kind from the same moment (e.g. every
  contract ending on 31 May) show as one row in the list ("38 contracts end within 30 days") that
  opens into the list of them. OPEN: a daily digest instead.
- **OPEN** — Whether the school uses probation, its length, and whether it differs per employee.
- **OPEN** — The real days by which lateness must be entered and payroll prepared and approved.

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
- **GUESS** — "Waiting for your approval" can't be turned off in the app: approvals depend on it.
  Reminders can. A channel the school hasn't set up (email today) shows as coming soon.
- **GUESS** — Turning a kind off stops new ones; notifications already received stay.
- **GUESS** — Settings → Notifications: the System admin changes the school's defaults and how long
  notifications are kept; the HR manager sees them. The reminder timings are HR rules (§7), changed
  by whoever may change HR rules.

| Setting | Default | Source |
|---|---|---|
| Remind before a contract ends | 30 days | GUESS |
| Probation length | 3 months (0 = no probation reminders) | GUESS |
| Remind before probation ends | 7 days | GUESS |
| Lateness check day of the month | 25 | GUESS |
| Payroll check day of the month | 28 | GUESS |
| Keep read notifications | 90 days | GUESS |
| Keep done approvals | 30 days | GUESS |
| Keep any notification at most | 365 days | GUESS |

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
