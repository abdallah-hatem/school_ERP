# §2 Roles

- **DECIDED** — Roles are data the school can change (no code). The demo's HR admin became
  **System admin + HR manager**. The System admin always has every permission, including users,
  roles and school settings.
- **DECIDED** — Every action requires a signed-in user. The only public things are the sign-in page
  and what it shows: the school's name, logo and default language.
- **DECIDED** — Users sign in with email and password. Accounts are created by a System admin (the
  first one by the system's setup); there is no self sign-up. A System admin can give a temporary
  password, which the user is asked to change; anyone can change their own password.
- **DECIDED** (enforced, P3) — Someone who signs in with a temporary password is taken straight to
  "Set a new password" and can do nothing else (except sign out) until they choose their own. The
  new password must be different from the temporary one. Changing it later from My account needs
  the current password.
- **DECIDED** — Deactivating a user, or giving them a temporary password, signs them out everywhere
  at once.
- **DECIDED** (owner, 2026-11-19) — A user account and an employee are separate: a user may have
  **one employee record** (who they are in HR), and an employee at most one account. The user form
  asks **"Who is this person in HR?"**; the users list calls it **Employee record** ("No employee
  record" when there is none). Only roles limited to *their stage*, *their team* or *themselves*
  need it: when such a role is picked without an employee record, the form warns "This person will
  see no records until you pick who they are in HR" — a warning, not a blocker. An employee's
  profile says **"System user: <name>"** (a link to the user's page for those who may open users)
  or **"Not a system user"** (owner, 2026-11-24), to anyone who may see the employee.

### Security: sign-in limits

- **DECIDED** (owner, 2026-11-18) — **5 wrong passwords within 15 minutes lock that account's
  sign-in for 15 minutes.** The count is per account (the email typed, in any letter case), never
  per computer or network. An email nobody has is counted and locked the same way, so the answer
  never tells whether an account exists. Wrong passwords for a deactivated account count too.
- **DECIDED** — While an account is locked, every sign-in is refused **without checking the
  password** — the right one too — with one message for every case: "Too many attempts. Try again
  in N minutes." (Arabic: "محاولات كثيرة جدًا. حاول مرة أخرى بعد N دقيقة", with the right plural
  form), N being the minutes left, rounded up.
- **DECIDED** — A correct sign-in before the limit clears the count. After 15 minutes without a lock
  the count starts over; when a lock ends, the right password signs in again.
- **DECIDED** — The forced "Set a new password" screen and the password change on My account have
  the same limit: refused while the account is locked, and a wrong current password counts as a
  wrong sign-in.
- **DECIDED** — A **System admin** (or anyone with "Manage users") can **unlock** an account early
  from its Users page: the list shows "Sign-in locked" (with the time it ends) and its ⋯ has
  **Unlock sign-in**; the user's page has the same button. The user can sign in at once.
- **DECIDED** — Lockouts and unlocks are recorded in the audit log (§9). The numbers (5 attempts,
  15-minute window, 15-minute lock) are school settings with those defaults (§7).
- **DECIDED** — Old counts are deleted every night at 03:00 school time, once both their 15 minutes
  and their lock ended more than a day ago.
- **GUESS** (Claude's answers until the owner and client confirm; spec
  `docs/specs/2026-11-17-roles-permissions.md`) — Starting roles: **System admin**, **HR manager**,
  **HR officer**, **Accountant**, **Principal / administrative director**, **Stage head**, **Direct
  manager**; **Employee** self-service is Planned. A user may hold several roles. Roles are data the
  school can change.
- **DECIDED** (owner, 2026-11-21) — A penalty is recorded by an HR officer, stage head or direct
  manager and goes through **two steps** (§4): the **stage head of the stage where it happened**
  approves it (optional note) or rejects it (required reason), then **HR** — the HR manager or the
  principal — approves it (optional note; this fixes the level and the deduction) or rejects it
  (required reason). The stage review is its own permission, **Review penalties (stage head)**: the
  Stage head holds it for their own stages; the System admin holds everything. The HR step stays
  **Approve penalties** (HR manager, principal). The HR manager does not hold the stage review.
  Cancelling stays as before (HR manager, principal). Nobody reviews, approves or rejects a penalty
  given to themselves — **nor cancels it** (owner, 2026-11-23).
- **GUESS** — Payroll is prepared by an HR officer and **approved by the HR manager**; the
  accountant views and exports it.
- **GUESS** (spec 2026-11-24, approved as drafted) — **Contracts** (§3): **View contracts** — the
  contract history and the renewal season — HR manager, HR officer and principal (whole school),
  stage head (their own stage; another stage's contract shows "We couldn't find that page").
  **Manage contracts** — renew, not renew, record notices, end early, decide early termination —
  HR manager (whole school). The **school calendar** is part of HR rules (changing HR rules).
  Nobody acts on their own contract — a System admin neither — so an account that manages
  contracts must be linked to its employee record, like pay and penalties. Roles stay editable by
  the admin, so these are only the starting defaults.
- **GUESS** (spec 2026-11-24-contract-templates, approved by the owner as drafted, 2026-11-24) —
  **Contract templates and printed copies** (§3): **Manage contract templates** (new, whole school)
  — create, edit, hide and show templates and set a work system's default — HR manager (and the
  System admin). **Print a contract** — Manage contracts plus View contracts covering the employee,
  as every contract write; a template with a salary field also needs **that employee's salary**
  (View salaries), otherwise it is refused, not printed blank. Never one's own contract. **Open a
  printed copy** — View contracts covering the employee, plus their salary for a copy that holds
  one; without it the copy is listed with no Open. **School address and signatory** — part of school
  settings (changing school settings).
- **DECIDED** (owner, 2026-11-23) — **Separation of duties in payroll** (§6): nobody adds or removes
  an adjustment on their own payroll line, and nobody approves a month in which they adjusted their
  own line. Whoever created the month's run may still approve it, as long as they adjusted no line of
  their own.
- **DECIDED** (owner, 2026-11-21; not built) — **Leave** (Planned) will need the approval of **every
  one** of the employee's stage heads (an employee can belong to several stages, §3), then HR. This
  records the decision only; leave isn't built.
- **GUESS** (enforced, P4) — Salaries are seen only by System admin, HR manager, HR officer and
  Accountant. "Salaries" includes the employee's insured salary and bank details (§3). Anyone else
  gets no salary at all — not on employee cards, the profile, the employee form, payroll lines,
  payslips or the activity log (which says "changed" without the amounts). The principal sees the
  payroll lines — names, codes, departments, days deducted, lateness minutes and flags — without any
  money, plus the run **totals** for the whole school (on the Payroll screen, the dashboard and the
  activity log alike), never one person's pay. Adding an employee needs to see
  every salary (the pay is set when adding); the bank sheet too. Someone who may edit an employee but
  not see their salary can't change it either — that includes setting them **not insured** while they
  have an insured salary, which would clear it (2026-11-23).
- **GUESS** (enforced, P4) — A stage head sees only their stage's employees; a direct manager only
  the employees they directly manage. **DECIDED** (owner, 2026-11-21): a user is tied to stages
  through their employee record — the linked employee's **main stage and their other stages** ("also
  teaches in", §3) — so a stage head of two stages sees the employees of both, and an employee of
  two stages is seen by both stages' heads. **Penalties go by the penalty's stage** (where the
  violation happened, §4), not the employee's: the head of an employee's other stage doesn't see,
  isn't notified about and can't act on a penalty from a stage that isn't theirs (opening it, or
  acting on it, shows "We couldn't find that page"). Where such a penalty changes what they can do with
  one of theirs — the level counts every stage — they are told only that one exists ("an earlier
  penalty for this violation, in another stage, is still waiting", "and N approved penalties in
  other stages"), never its date, level or month (§4). **DECIDED** (owner, 2026-11-23): a stage head records penalties
  only in their own stages — for a teacher shared with another stage, the record form offers only
  theirs. That covers every list, count, search, picker and dashboard
  figure, their penalties, lateness and payroll lines, and the activity log's entries about them.
  Opening anyone else shows "We couldn't find that page", as for a record that doesn't exist. Someone in
  such a role who has no employee record sees nobody. Each screen, tab, section and button is
  shown only to those who may use it.
- **GUESS** — The payroll tax rule (§10) belongs to the Accountant (view and change) and the
  System admin (owner, 2026-11-18).
- **GUESS** (enforced, 2026-11-18) — **Home** is the HR dashboard (headcount, this month's payroll,
  penalties, quick links) only for someone allowed to see it (System admin, HR manager, HR officer,
  principal). Anyone else — the Accountant, a stage head, a direct manager — gets a welcome with
  their name and a link to each screen they may open (the same screens as their menu, then My
  account), and no HR figures. Recommended by Claude, owner to confirm.
- **GUESS** (enforced, 2026-11-19) — Each dashboard tile needs the permission of the screen it comes
  from: headcount needs "View employees", the payroll tile "View payroll", the penalty tiles "View
  penalties". A role allowed to see the dashboard but none of those three gets the welcome above
  instead of an empty page. Recommended by Claude (owner found the empty page), owner to confirm.
- **DECIDED** (owner, 2026-11-21) — The dashboard's **charts** (payroll cost, headcount, penalties
  and lateness, deductions vs net, over 6 or 12 months; §6) need their own permission, **View the
  dashboard charts** (`hr.dashboard.view_analytics`): "for now make it only visible to the system
  admin". No starting role holds it but the System admin (who holds every permission); an admin can
  give it to any role. Each chart also needs its screen's permission and follows its scope (a stage
  head's charts count their stage), money only for those who see the payroll totals, and the
  deductions only with every salary (§10). Without it the dashboard is as before — no charts, no
  6 / 12 months switch.
- **GUESS** (enforced, 2026-11-18) — Someone who may see a Settings section but not change it sees
  it read-only (§7): a stage head and a direct manager see Structure and the penalty catalogue, the
  principal sees the lists. They keep Settings in their menu for now (owner hasn't decided
  otherwise).
- **GUESS** (enforced, 2026-11-18) — Adding or removing a payroll adjustment needs its own
  permission ("Adjust payroll"), held by the System admin, HR manager and HR officer (§6). Anyone
  else who sees the run sees its adjustments without being able to change them.
- **DECIDED** — The last System admin can't be removed or deactivated.
- **DECIDED** (owner, 2026-11-23, security review "fix all") — **Nobody gives more than they hold.**
  Someone who may manage users or roles but isn't a System admin:
  - can't give or take away the **System admin** role, and can't edit, give a temporary password to,
    deactivate or reactivate a **System admin's** account ("Only a System admin can …");
  - may give or take away only roles whose every permission they hold themselves, reaching no
    further than theirs, and may manage only accounts that hold no more than they do (so nobody can
    reset a stronger person's password and sign in as them);
  - may put into a role only permissions they hold, at the same reach or narrower; a role whose
    permissions reach beyond theirs they can't change (not even to remove one) or delete, and they
    can't change a role they hold themselves or one a System admin holds;
  - can't choose **who an account is in HR** (its employee record), on a new account or an existing
    one: "their stage", "their team" and "themselves only" are worked out from that record, so
    choosing it chooses whom the account reaches. Only a System admin links employee records
    (simpler than checking the employee against every reach; linking is rare admin work);
  - can't unlock a System admin's sign-in, or that of someone holding more than they do;
  - can't give a temporary password to, change the email of, or unlock the sign-in of **any account
    linked to an employee record** (third review, owner 2026-11-23). Comparing permissions isn't
    enough: "their stage" for the Primary head and for the Prep head look the same but reach
    different people, so signing in as the Prep head would reach Prep. Only a System admin does it;
    an account with no employee record (which reaches nobody through their stage, team or
    themselves, and can't act on pay — §6) they still may;
  - can't give an account with no employee record a role that acts on pay or penalties (adjusting or
    approving payroll, entering lateness, reviewing, approving or cancelling penalties, or editing
    employees), nor add such a permission to a role an unlinked account holds: "not your own" can't
    be checked without the record. A System admin links the account first. (Adding employees isn't
    on the list: it sets a new person's pay, never the adder's own.) In practice, since reviewing
    penalties and editing employees count, **only a System admin creates or links the accounts of
    HR staff** — stage heads, HR officers, HR managers and the principal: those roles all act on pay
    or penalties, and only a System admin links an account to its employee record.

  "Reaching no further": *everyone* covers every reach; *their stage* covers their stage and
  *themselves only*; *their team* covers their team and *themselves only*; *themselves only* covers
  only itself. A stage and a team don't cover each other. A System admin has no such limit. The
  screens grey out what can't be given, with the reason.
- **DECIDED** (owner, 2026-11-23) — **Nobody changes their own roles**, a System admin included:
  another administrator does it (the last-System-admin rule still applies to them). **Nor their own
  employee record** — except a System admin, who already reaches everyone, so the link widens
  nothing; a school's only System admin must be able to say who they are in HR. Their name and email
  anyone may change.
- **DECIDED** (owner, 2026-11-23) — **Nobody widens their own reach through HR**: editing their own
  employee record, they can't change its stages ("also teaches in" included) or its manager
  ("You can't change your own roles or employee record").
- **DECIDED** (owner, 2026-11-23) — **Changing your password signs you out everywhere else**, at once:
  every other signed-in device must sign in again with the new password; the one you changed it from
  stays signed in. (A device signed in before 2026-11-23 is signed out once after a password change,
  even the one that changed it.)
- **DECIDED** (owner, 2026-11-19) — **Any role but the System admin can be deleted once nobody holds
  it** — a starting role as well as a custom one. A role someone still holds can't be deleted: Delete
  says who still holds it ("3 users still hold it"), and the role must be taken away from them on
  their user pages first; there is no "move everyone to another role" step. The **System admin** can
  never be deleted and its permissions never change (it always holds every permission). On the
  Roles screen the starting roles carry a **"Starting role"** badge; deleting one warns that future
  updates add new permissions to starting roles automatically, and a role made to replace it won't
  get them. A deleted starting role stays deleted: updates don't bring it back. Deleting a role is
  recorded in the activity log (§9).
- **Planned** — Legal affairs, medical clinic and security desk roles, with their modules.
- **DECIDED** — Viewing the activity log is its own permission (§9): System admin, HR manager and
  principal hold it.
- **DECIDED** (owner, 2026-11-18) — Settings → Notifications (§11) has two permissions: **View
  notification settings** (System admin, HR manager) and **Manage notification settings** (System
  admin). Everyone sees and manages only their own notifications and their own preferences.
