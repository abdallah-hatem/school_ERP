# 2026-11-20 — A backdated penalty recounts the later ones

A penalty's level counts the approved penalties of the same violation that come before it. A
penalty recorded with an **earlier date** than penalties already approved used to collide with
them: with 19 Nov (level 1) and 20 Nov (level 2) approved, recording and approving 18 Nov gave
level 1 again.

Now **approving** a backdated penalty moves each later approved penalty of the same violation and
employee (inside the repetition window) **up one level**, with that level's action and days from
the catalogue as it is today. So 18, 19 and 20 Nov become levels 1, 2 and 3, and the deductions of
19 and 20 Nov follow their new levels.

- **Before saving**, the record dialog says what approving it will change: "Approving this will
  raise the level of 2 approved penalties: 19 Nov 2026: level 1 → 2, Deduct 0.5 day → Deduct 1
  day …". Recording changes nothing.
- **When approving**, the confirmation lists the same changes and the button says "Approve and
  update 2 penalties". If the list changed meanwhile (another penalty approved or cancelled), the
  approval is refused and the dialog shows the new list to confirm again.
- If one of those penalties is in a month whose **payroll is approved**, the backdated penalty
  can't be recorded (the dialog says so before saving, naming the month), or approved if the month
  was approved after it was recorded. Corrections for an approved month go into the next month as
  adjustments.
- A penalty already on the last level stays there. Pending and cancelled penalties, other
  violations, other employees and penalties outside the repetition window don't change.
- Each moved penalty gets its own entry on the employee's History (level, action and days before →
  after). No notification is sent.
- A draft payroll run of a month with a moved penalty says "Penalties changed since the last
  calculation" and offers Recalculate.

Touches §4 (Recording a penalty) and §6 (The monthly run). Decided by the owner (2026-11-20).
