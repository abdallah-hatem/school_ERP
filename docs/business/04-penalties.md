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
- **DECIDED** (owner, 2026-11-21) — Each penalty records the **stage where the violation happened**,
  one of the employee's stages (§3). With one stage it fills in by itself; with several, the record
  form asks, from the employee's stages only. The penalty keeps its stage even if the employee's
  stages change later; that stage's head still reviews it.
- **DECIDED** (owner, 2026-11-21) — **Levels count across all stages**: the same person and the same
  violation, whatever stage each penalty was in.
- **DECIDED** — The system works out the **level**: 1 + the number of **approved** penalties for the
  same violation and the same employee inside the repetition window.
- **DECIDED** (owner, 2026-11-18) — "Earlier" follows the **violation date**, then **when the
  penalty was recorded**: an approved penalty counts if it is dated before this one, or on the same
  date and recorded before it. So four "Late to class" on one day, recorded and approved in order,
  are levels 1, 2, 3 and 4. A penalty not recorded yet (the preview) comes after every penalty
  already on its date. Pending and cancelled penalties never count. The level is computed again at
  approval and then fixed (approved levels are never recomputed — except by a backdated penalty,
  below).
- **DECIDED** (owner, 2026-11-20) — **Approve in date order.** A penalty can't be approved while an
  **earlier** penalty (same order as above: an earlier date, or the same date and recorded before
  it) of the **same violation** for the **same employee**, inside the repetition window, is still
  **pending**. The approval is refused with "Approve or cancel the 19 Nov 2026 penalty for this
  violation first." (naming the earliest such one), and the screens show Approve greyed out with
  that reason. Cancelling is always allowed (month lock aside). So 18 Nov approved, then 19 and
  20 Nov pending: 20 Nov waits; approving 19 Nov gives level 2, then 20 Nov level 3 — never two
  penalties on one level. The check runs inside the approval, under the same lock as the level, so
  two approvals at once can't both slip through. Penalties approved **before** this rule keep
  their levels, so older data may show two approved penalties with the same level.
- **DECIDED** (owner, 2026-11-20) — **A backdated penalty recounts the later ones.** A penalty
  recorded with a date **before** approved penalties of the same violation and employee (inside the
  repetition window) would otherwise collide with them: 19 Nov level 1 and 20 Nov level 2 approved,
  then 18 Nov recorded and approved → also level 1. So **approving** it moves each **later approved**
  penalty of that violation and employee — in the order above, and whose own repetition window holds
  the new date — **up one level**, with that level's action and days from the catalogue **as it is
  today** (the source every approval uses; the catalogue keeps no history): 18 → level 1, 19 → 2,
  20 → 3. A penalty already on the last level stays there (and isn't listed). Pending and cancelled
  penalties don't change (a pending one already shows today's count), nor do other violations, other
  employees, or penalties outside the window. A gap left by an earlier cancellation stays — the
  recount adds the one penalty, it doesn't renumber. This is the one exception to "approved levels
  are never recomputed". Recording the backdated penalty changes nothing; the move happens in the
  approval's own transaction, under the same lock as the level.
- **DECIDED** (owner, 2026-11-20) — **Told first, confirmed at approval.** The record dialog's
  preview says, before saving, "Approving this will raise the level of 2 approved penalties: 19 Nov
  2026: level 1 → 2, Deduct 0.5 day → Deduct 1 day; 20 Nov 2026: level 2 → 3, …". The approve
  confirmation lists the same changes and its button says "Approve and update 2 penalties". The
  approval carries that list: if approving would change approved penalties and the request didn't
  confirm them, or confirmed a list that is no longer what approving does (another penalty was
  approved or cancelled meanwhile), it is refused (409) with the fresh list, which the dialog shows to
  confirm again — a stale screen can't recount silently.
- **DECIDED** (owner, 2026-11-20) — **Not into an approved month.** If any later approved penalty
  that would move sits in a month whose payroll is approved, the backdated penalty can't be
  **recorded** — the preview says so as an error before saving, naming the month — and, should that
  month be approved after it was recorded, it can't be **approved** either (Approve is greyed out
  with the same reason). Corrections for an approved month go into the next month as adjustments
  (§6). It can still be cancelled.
- **DECIDED** (owner, 2026-11-20) — Each moved penalty gets its own History entry (its date, level, action and
  days before → after, and the date of the penalty whose approval moved it), on the employee's
  History next to the approval. No one is notified: no existing notification fits. A **draft**
  payroll run of a month with a moved penalty says "Penalties changed since the last calculation"
  and offers Recalculate (§6); approving the run recalculates anyway.
- **GUESS** — The repetition window is the **contract year** (1 June – 31 May). It's a setting (§7).
  The rolling-12-months option starts on the same date one year earlier, inclusive.
- **DECIDED** (owner, 2026-11-21) — **Two steps**: "record penalty => approve or reject (reasons) =>
  hr approval or reject (reasons)". Statuses: **Pending stage review** → the stage head of the
  penalty's stage approves (optional note) → **Waiting for HR**, or rejects (required reason) →
  **Rejected**; **Waiting for HR** → the HR manager or principal approves (optional note) →
  **Approved**, or rejects (required reason) → **Rejected**. **Only the HR approval sets the level
  and the deduction**: approve in date order, the backdated recount ("told first, confirmed at
  approval") and "not into an approved month" (below) are rules of the HR step. A reason is
  required to reject: not blank, at most 1,000 characters, any language. Rejected and cancelled
  penalties are final and never count. Penalties are never deleted.
- **DECIDED** (owner, 2026-11-21) — A penalty skips the stage review and goes **straight to Waiting
  for HR** when the **recorder is a stage head of the penalty's stage** (their recording counts as
  the review), when the **penalty's stage has no stage head**, or when the **penalised employee is
  themselves a stage head of that stage** (nobody reviews their own penalty — also when they recorded
  it). The penalty says why ("No stage review: …"). A school-wide reviewer (the System admin) heads no
  stage. A penalty recorded by the system itself (the demo seed) is nobody's review.
- **DECIDED** (owner, 2026-11-21) — Nobody reviews, approves or rejects a **penalty given to
  themselves**: a stage head or HR approver who is the penalised employee is refused, and the
  screens leave those buttons out for them.
- **DECIDED** (Claude, from the owner's edge case 3, 2026-11-21) — If a penalty waits for the stage
  review and its stage **no longer has a stage head** (the head left or lost the role), **HR may
  approve or reject it directly** from Pending stage review; the penalty says "has no stage head now:
  HR can approve or reject it directly". A new stage head of that stage can review it as usual.
- **DECIDED** (owner, 2026-11-21) — Two people acting on the same step at once: exactly one wins;
  the other is told it has moved on ("someone else acted on it first") and sees where it stands.
- **DECIDED** (owner, 2026-11-21) — Rejection reasons show on the penalty (list, details) and in its
  history; the recorder is notified (§11). Whoever must act next is notified (§11).
- **DECIDED** (owner, 2026-11-21) — Penalties pending before the two steps existed became **Waiting
  for HR** (nothing already pending needed a new review); approved and cancelled ones were left as
  they were.
- **DECIDED** — **Cancel** stays as before: with a required reason, while the penalty waits at
  either step or once approved (month lock aside), for whoever may cancel.
- **GUESS** — An **approved** penalty can also be cancelled with a reason while its month's payroll
  is not approved. Other approved penalties keep their fixed levels (nothing is recomputed). A
  cancelled penalty can't be approved or cancelled again.
- **DECIDED** — The level and action are fixed when the penalty is approved. Later catalogue edits
  don't change approved penalties. (Only a backdated penalty's approval moves them, above.)
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
- **DECIDED** — Penalties waiting at either step show the level, action and days the catalogue gives
  today. Editing the catalogue changes them, never approved ones.
- **DECIDED** (owner, 2026-11-21) — "Pending" in the rules above (approve in date order, once per
  day, payroll's "pending penalties", the dashboard) means **waiting at either step**: an earlier
  penalty still at the stage review blocks the HR approval of a later one, named by its date; a
  rejected one, like a cancelled one, frees the day and never blocks.
- **DECIDED** (owner, 2026-11-21) — Who approves penalties: the stage head of its stage, then HR
  (above). **OPEN** — whether an investigation is needed before a deduction.
- **OPEN** — Whether a monthly cap on penalty deductions applies under the labour law.
