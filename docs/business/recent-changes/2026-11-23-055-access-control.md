# 2026-11-23 — Access control tightened (security review)

Decided by the owner ("fix all", after an independent security review; §2, §3, §4, §6).

- **Nobody gives more than they hold (§2):** someone who manages users or roles without being a
  System admin can't give or take away the System admin role, can't change a System admin's account
  (edit, temporary password, deactivate, reactivate), gives or takes away only roles within their own
  permissions and reach, manages only accounts holding no more than they do, puts into a role only
  permissions they hold (same reach or narrower), and can't change a role they hold or one a System
  admin holds. Reach: everyone > their stage / their team > themselves only; a stage and a team don't
  cover each other. The Users and Roles screens grey these out with the reason.
- **Nobody changes their own roles or employee record (§2)**, a System admin included.
- **Changing your password signs you out everywhere else (§2)**; the device you changed it on stays
  signed in.
- **Nobody cancels their own penalty (§4)** — as nobody reviews, approves or rejects it.
- **A stage head records penalties only in their own stages (§4):** for a teacher shared with another
  stage, the record form offers only the head's stages.
- **No other stage's penalty is shown (§4):** the level still counts every stage, but the preview, the
  approve confirmation and "approve the earlier one first" name only penalties the person may see;
  the rest are counted ("And N approved penalties in other stages") or said to exist ("an earlier
  penalty in another stage"). Acting on a penalty of another stage now answers "This page isn't
  here", like opening it.
- **Payroll separation of duties (§6):** nobody adds or removes an adjustment on their own payroll
  line, and nobody approves a month in which they adjusted their own line. The run's creator may
  still approve it when they adjusted no line of their own.
- **Pending penalties on the payroll screen (§6)** count only the employees a stage- or team-limited
  viewer sees.
- **Insured salary (§2, §3):** someone who can't see an employee's salary can't set them "not
  insured" while they have an insured salary (that would clear it).
