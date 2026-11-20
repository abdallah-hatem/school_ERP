# 2026-11-20 — Penalties are approved in date order

A penalty's level counts the approved penalties of the same violation that come before it. When
penalties were approved out of order, two could end up on the same level: with 18 Nov approved
(level 1), approving 20 Nov first gave level 2, and approving 19 Nov afterwards gave level 2 again.

Now a penalty **can't be approved while an earlier penalty of the same violation, for the same
employee, is still pending** ("earlier" is the same order the level uses: an earlier date, or the
same date and recorded earlier). Approve or cancel the earlier one first. So 18, 19 and 20 Nov
become levels 1, 2 and 3.

- On the penalties list, the employee's Penalties tab and the penalty a notification opens,
  **Approve** is shown greyed out with the reason: "Approve or cancel the 19 Nov 2026 penalty for
  this violation first." Cancel is still there.
- Cancelling is always allowed (unless the month's payroll is approved, as before).
- Other violations and other employees never block each other, and neither do penalties outside the
  repetition window (they don't count toward the level either).
- Penalties approved before this change keep their levels, even where two share one.

Touches §4 (Recording a penalty). Decided by the owner (2026-11-20).
