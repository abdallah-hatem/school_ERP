# §11 Notifications

Telling staff, inside the ERP, that something waits for them or is due. Spec:
`docs/specs/2026-11-18-notifications.md`. **Partly built** — the mechanism is built (who is told,
grouping, never twice, done approvals, access, preferences, retention), and so are HR's **reminders**
(contracts, probation, lateness, payroll — below), its two **approvals** ("Penalty waiting for
your approval", "Payroll ready to approve"), and the **screens** (layout option A, below: the bell
and its list, My account → Notifications, Settings → Notifications).

## What and how

- **DECIDED** (owner, 2026-11-18) — One channel for now: **in the app**. A bell shows how many
  notifications are unread and opens the list. Email, WhatsApp and SMS are Planned, and adding one
  must not change how any module decides what to send. (2026-11-21: **push alerts** to the
  person's devices added — "Push alerts and the installed app" below.)
- **DECIDED** (owner, 2026-11-18) — **The bell opens a short list over the page** (all, or unread
  only), with "Mark all as read" and a link to the notification settings; on a phone the list
  fills the screen. The screens show only notifications in the app — no other channel is mentioned
  anywhere (except, since 2026-11-21, "Alerts on this device" on My account → Notifications).
- **DECIDED** (owner, 2026-11-18) — Recipients are **staff users** now. Parents and students are
  Planned.
- **DECIDED** — A person sees only their own notifications. Nobody, the System admin included, reads
  someone else's.
- **GUESS** — Each notification reads as a short sentence in the person's language (Arabic or
  English, with the right plural form), says when it happened, and opens the record it is about.
  Switching language shows old notifications in the new language too.
- **GUESS** — The bell updates within a minute, and as soon as the person comes back to the tab.
- **Built** (2026-11-18) — The bell sits beside the language switch and shows the unread count
  ("99+" past 99). Opening a notification marks it read and opens its record; a group ("3
  penalties waiting for your approval") opens into its items first, each opening its own record.
  "Mark all as read" leaves anything that arrived after the list was opened unread. Done ones stay
  in the list, greyed, with who did them ("Approved by Laila Hassan").
- **Built** (2026-11-19, from the live check) — A group's title counts **what still waits**: one of
  "3 penalties waiting for your approval" approved reads "2 penalties waiting for your approval",
  with the handled one still listed, struck through. With every item handled it reads "3 penalties
  — all handled", and "Approved by Laila Hassan" when one person approved them all (else "All
  done").
- **Built** (2026-11-19) — **Unread shows exactly what the bell counts**: unread notifications with
  something still waiting that the person may see. A done one that was never read is under All
  only. "Mark all as read", or reading one, takes it out of the open Unread list at once.
- **Built** (2026-11-19) — Everyone sees the school's name and logo in the app (side bar, top bar,
  dashboard, browser tab), whatever they may do; only the Settings screen needs the right to view
  settings.

## Push alerts and the installed app

- **DECIDED** (owner, 2026-11-21) — The ERP **installs as an app** (phone, tablet, computer), named
  after the school, with the school's logo as its icon (a generic icon without a logo). My account
  → Install app: the browser's own install dialog where it has one; on an iPhone or iPad the Add to
  Home Screen steps; nothing where the browser can't install. No banner asks.
- **DECIDED** (owner, 2026-11-21) — A second channel, **push**: what reaches a person's bell also
  arrives as an alert on each of their devices that has **Alerts on this device** on (My account →
  Notifications). The switch is per device; My devices lists them, each removable. It asks the
  browser's permission when turned on, never on its own.
- **DECIDED** (owner, 2026-11-21) — Alerts follow the per-kind switches (no second switch per kind);
  kinds that can't be turned off always come. Settings → Notifications has nothing new.
- **DECIDED** (owner, 2026-11-21) — An alert says what the bell says, in the device's language,
  opens the same page, and **never shows money** (a payroll month's net) — nor a typed reason.
- **GUESS** — An alert is sent once per new item; a group's alert is replaced by its next one (one
  alert per bell notification on the device). One already read or handled sends nothing.
- **GUESS** — Signing out turns that device's alerts off. A device the push service reports gone
  (the browser dropped it) is removed by itself. At most 20 devices per person; a 21st replaces the
  one unused longest.
- **GUESS** — Adding and removing a device are recorded in the Activity log (§9): a device decides
  where the school's notifications show, like the per-kind choices (recorded too). Reading isn't.
- **Limits** — Install and alerts need **https** (or `localhost`). On iPhone and iPad, alerts only
  work **after Add to Home Screen**, on iOS / iPadOS **16.4 or later**; the switch says so there.
  A device that is off gets the alert when it comes back, for up to a day.
- **Built** (2026-11-21) — Offline, a page shows "You're offline" with the school's name and Try
  again. Nothing personal is kept on the device.

## Who is told what

- **DECIDED** (owner, 2026-11-18) — Recipients are chosen by **what they may do**, not by role
  name: whoever may approve penalties is told about penalties waiting, within the employees they
  cover (their stage, their team, or the whole school — §2).
- **GUESS** — The person who caused the event isn't told about it (recording a penalty you may
  approve yourself sends you nothing).
- **DECIDED** (owner, 2026-11-18) — First notifications (who gets each is §2's GUESS roles):

| Notification | Who gets it | When | Goes away when |
|---|---|---|---|
| Penalty waiting for your review | The stage head(s) of the penalty's stage (§2, §4) — not the other stages' heads | A penalty is recorded for the stage review | It is reviewed (approved or rejected), approved by HR, or cancelled |
| Penalty waiting for your approval | Whoever may approve penalties at the HR step, for that penalty (§2) | A penalty is recorded straight to HR, or the stage head approves it | It is approved, rejected or cancelled, by anyone |
| Penalty you recorded was rejected | The person who recorded it (only them) | It is rejected at either step | Read (nothing to do) |
| Payroll ready to approve | Whoever may approve payroll | A draft month is calculated and has no pending penalties | It is approved (or a pending penalty appears in the month again) |
| Contract ends soon | Whoever may edit that employee | 30 days, and again 7 days, before the contract ends | The contract is extended, or the employee is deactivated |
| Probation ends soon | Whoever may edit that employee | 7 days before the employee's probation end date | The date passes or moves, or the employee is deactivated |
| Lateness not entered | Whoever may enter lateness | From the 25th, while the month's lateness was never saved | The month is saved, or its payroll is approved |
| Payroll not prepared | Whoever may prepare payroll | From the 28th, while the month has no payroll run | A run is created |
| Payroll still a draft | Whoever may approve payroll | From the 28th, while the month's run is a draft | It is approved |

- **GUESS** — When an approval is done by one person, everyone else who was told sees it as done
  ("Approved by Laila Hassan") and it no longer counts as unread.
- **DECIDED** — A penalty's notification is sent the moment it is recorded, together
  with the recording: a recording that is refused (the same violation twice in a day, an inactive
  employee, a month whose payroll is approved) tells no one. Approving or cancelling it marks it
  done for everyone; cancelling an already approved penalty changes nothing (there is nothing
  waiting). Deactivating the employee leaves it waiting: the penalty can still be approved (§4).
- **DECIDED** (owner, 2026-11-21; replaces the earlier GUESS) — A penalty belongs to the stage where
  it happened: if the employee moves to another stage afterwards, that stage's head (and any
  stage-scoped approver) still sees it; the new stage's isn't told about the old penalty (only about
  new ones).
- **DECIDED** (owner, 2026-11-21) — Each step tells **whoever must act next**, once, never the
  person who acted and never the penalised employee themselves: recording → the stage head(s) of the
  penalty's stage (or HR's approvers when it skips the review); the stage head's approval → HR's
  approvers; a rejection at either step → the recorder (without the reason: it shows on the penalty).
  Through the bell and push alerts, like every notification.
- **DECIDED** — "Payroll ready to approve" is sent when a draft month is created or
  recalculated and no penalty dated in that month is pending (§6: it can't be approved before).
  A penalty recorded in the month marks it done (the month isn't ready any more); the next
  recalculation with nothing pending sends it again. Approving the month marks it, and "Payroll
  still a draft", as approved.
- **GUESS** — Each calculation that leaves the month ready sends its own "ready" and marks the
  previous one done, so only the latest stays open.
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

**Built** (N3); they show in the bell (N4).

- **DECIDED** (owner, 2026-11-18) — Reminders are checked every day by the system on its own.
- **GUESS** — The check runs at 07:00 school time (Cairo). "Today" and "this month" are the school's.
  A check day past the month's end means the month's last day (the 31st → 28 February).
- **DECIDED** — A reminder is never sent twice for the same thing. If the system was down on the
  day, the next day's check sends it once.
- **GUESS** — A month counts as having its lateness entered once it was saved, even with all zeros.
- **DECIDED** (owner, 2026-11-18) — The first contract reminder is marked done when the second one
  (7 days before) is sent. With the second reminder set to 0 there is only one.
- **GUESS** — A contract that has already ended is not chased: its open reminder is marked done the
  day after the end, and none is sent for it. The same for a probation end that has passed.
- **GUESS** — A reminder goes away by itself as soon as the thing is done: the contract end or the
  probation end is changed (a new date inside the window gets a new reminder at the next daily
  check), the employee is deactivated, the month's lateness is saved, a payroll run is created, or
  the run is approved ("Approved by …"; approving also ends the month's lateness reminder, since the
  month is then locked, §5).
- **GUESS** — The lateness and payroll reminders are about the **current** month: from the check day
  to the month's end. One already sent stays until it is done, even into the next month; a month
  that was never reminded by its last day isn't reminded later.
- **GUESS** — Contract and probation reminders go to whoever may edit that employee (their stage or
  team, or the whole school, §2). Lateness and payroll reminders are about the whole school, so only
  people who may do that for the whole school get them.
- **GUESS** — Changing a timing takes effect at the next daily check; a reminder already sent stays
  (and isn't sent a second time under the new timing).

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
| Remind before a contract ends | 30 days (1–120), and again 7 days (0 = no second reminder; 0–60, fewer than the first) | DECIDED (owner, 2026-11-18) |
| Default probation length (fills a new employee's probation end) | 3 months (0 = no probation) | DECIDED (owner, 2026-11-18) |
| Remind before probation ends | 7 days (1–60) | GUESS |
| Lateness due by (day of the month) | 25 (1–31; past the month's end = its last day) | DECIDED setting; day GUESS until the school confirms |
| Payroll prepared and approved by (day of the month) | 28 (1–31; same) | DECIDED setting; day GUESS until the school confirms |
| Keep read notifications | 90 days | DECIDED (owner, 2026-11-18) |
| Keep done approvals | 30 days | DECIDED (owner, 2026-11-18) |
| Keep any notification at most | 365 days (old ones are removed every night) | DECIDED (owner, 2026-11-18) |

## Access

- **DECIDED** (§2) — A notification never shows more than its reader may see. Someone who loses the
  right to approve, or whose stage or team no longer covers the employee, no longer sees those
  notifications (they leave the list and the count). Opening one shows "We couldn't find that page", as
  for any record outside their reach.
- **GUESS** — Payroll notifications show the month's net only to someone who may see the school's
  payroll totals (§2): whoever sees payroll for the whole school (the HR manager, the principal,
  the accountant). Someone who may approve payroll but not see it reads the month and the number of
  employees only. Decided when the notification is sent.

## Not the audit log

- **DECIDED** — Notifications are not the activity log (§9): they are personal, and old ones are
  deleted. The change that caused one is recorded in the log as usual; reading or marking a
  notification read is not recorded. Changing one's own preferences, the school's defaults and the
  reminder timings is recorded (they are settings), and so is adding or removing a device for
  alerts (2026-11-21).
