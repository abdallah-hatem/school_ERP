# §4 Penalties

## Catalogue

- **DECIDED** — The school's penalty regulations are a **catalogue** the school can edit (§7):
  groups (the school's four tables: general table A, table B, general violations, educational
  violations), each holding **violations**, each with **levels 1 to 5** for the 1st to 5th time it
  happens.
- **DECIDED** — Each level has one **action**:
  - notice
  - warning
  - deduction of N days of pay (N can be ¼, ½, ¾, 1, 1¼, 1½, 2 … 5)
  - loss of half the annual raise, loss of the annual raise, raise deferred 3 months
  - pay cut by one annual raise, demotion, dismissal
  - referral to investigation, optionally with N days of pay deducted
- **DECIDED** — Some violations have fewer than 5 levels. Some say "doubles on repeat".
- **GUESS** — After the last defined level, the last level repeats. "Doubles on repeat" is stored as
  written text for the reviewer; the system doesn't double automatically in the demo.

## Recording a penalty

- **DECIDED** — HR records a penalty for an **active** employee: the violation, the date it happened
  (not in the future), and an optional note.
- **DECIDED** — The system works out the **level**: 1 + the number of **approved** penalties for the
  same violation and the same employee inside the repetition window.
- **GUESS** — "Earlier" means an earlier **violation date**, not an earlier approval: only approved
  penalties dated before this one count. The level is computed again at approval and then fixed.
- **GUESS** — The repetition window is the **contract year** (1 June – 31 May). It's a setting (§7).
  The rolling-12-months option starts on the same date one year earlier, inclusive.
- **DECIDED** — A new penalty starts as **pending**. HR **approves** it, or **cancels** it with a
  required reason. Penalties are never deleted.
- **GUESS** — An **approved** penalty can also be cancelled with a reason while its month's payroll
  is not approved. Other approved penalties keep their fixed levels (nothing is recomputed). A
  cancelled penalty can't be approved or cancelled again.
- **DECIDED** — The level and action are fixed when the penalty is approved. Later catalogue edits
  don't change approved penalties.
- **DECIDED** — Only approved penalties count toward the repeat level and toward payroll.
- **DECIDED** — An approved penalty whose action is a **day deduction**, or an **investigation with
  days**, reduces pay in the payroll of the **month the violation happened** (§6).
- **DECIDED** — Notice, warning, raise, pay-cut, demotion, dismissal, and investigation without days
  are **recorded only**. They don't change pay in this version (Planned).
- **DECIDED** (owner, 2026-11-18) — **Once per day.** Each violation has a *Once per day* setting
  (§7). When it is on, an employee can't get a second penalty for that violation on the **same
  date** while an earlier one on that date is pending or approved; the attempt is refused with a
  clear message ("This violation counts once per day…"), and the record dialog's preview says so
  before saving. A **cancelled** penalty doesn't block the day: once it is cancelled, the day can be
  recorded again.
- **DECIDED** (owner, 2026-11-18) — The rule is checked when a penalty is recorded and again when
  it is approved, together with the approval: if another penalty of the same violation, employee
  and date is already approved, the approval is refused (so two pending ones of the same day — for
  example recorded before the setting was turned on — can't both be approved; the other one can
  still be cancelled). Turning the setting on or off never changes penalties already recorded or
  approved.
- **DECIDED** (owner, 2026-11-18) — *Once per day* is **on** for every violation except those that
  genuinely happen several times a day — lateness to or leaving a class or an assigned task, not
  attending a class, task or exam committee, a missing substitute teacher: these can repeat within a
  day, and each occurrence is its own penalty. The school changes it per violation in Settings.
- **DECIDED** — Levels: a once-per-day violation has at most one counting penalty per date, so
  its level climbs one day at a time. How same-day penalties count toward each other's level only
  arises for violations that can repeat in a day.
- **DECIDED** — A penalty can't be recorded, approved or cancelled once the payroll of the month it
  is dated in is approved. Corrections go into the next month as adjustments (§6).
- **DECIDED** — A retired violation can't be used for new penalties. Retiring a **group** retires
  every violation in it.
- **DECIDED** — Retiring a violation or deactivating an employee blocks only *new* penalties. A
  penalty already pending can still be approved or cancelled.
- **DECIDED** — The preview (level and action before saving) saves nothing, so it ignores the month
  lock; recording, approving and cancelling respect it.
- **DECIDED** — Pending penalties show the level, action and days the catalogue gives today. Editing
  the catalogue changes pending penalties, never approved ones.
- **OPEN** — Who approves penalties, and whether an investigation is needed before a deduction.
- **OPEN** — Whether a monthly cap on penalty deductions applies under the labour law.
