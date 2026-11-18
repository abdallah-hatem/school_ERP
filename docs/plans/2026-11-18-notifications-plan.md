# Plan — Notifications (2026-11-18)

Spec: `docs/specs/2026-11-18-notifications.md` (decisions N1–N17, owner answers of 2026-11-18,
types table, contract, edge cases 1–20). Business: §11 (new), §2, §4, §5, §6, §7, §9. Layout: **option A · Bell popover**, picked by the
owner (2026-11-18), in `design/mockups/notifications.html`; the UI shows the in-app channel only. Each task: own branch from `dev`,
background agent in its own worktree, one PR into `dev`, `pnpm ci:local --full` before the PR,
`git fetch origin && git merge origin/dev` before opening it.

**Prerequisites:** the spec decided by the owner (2026-11-18: option A and every OPEN answered);
the events + outbox work landed (owner: build after it); the jobs foundation (`apps/api/src/core/jobs/`,
PR `feature/login-rate-limit-and-jobs`) merged — N1's retention job and N3 use it. Assumed API
(GUESS until that PR lands; adjust the brief, not the design): a job is a provider method declared
with a cron and a key, run under a Postgres advisory lock per key (one container runs it), each run
logged in `job_runs` (key, started, finished, status, error), cron evaluated in `Africa/Cairo`.

**With events + outbox** (BUILD_LOG → Next up, owner 2026-11-18: every notification event is
must-deliver): a module that notifies about **its own** change calls `notify()` inside its
transaction (N4 — the rows commit with the change, nothing to lose). A module that reacts to
**another** module's event does it in a `DomainEvents` must-deliver listener (outbox), which calls
`notify()` in its own transaction — idempotent through the dedupe keys (N9). Outside channels later
read their pending deliveries the same way.

**Collision rule:** N1 creates the whole foundation, including **every v1 type key** with its EN and
AR texts and link builder in `packages/shared`, the new permission keys
(`core.notifications.view`, `core.notifications.manage`) and audit action keys
(`core.notification_preferences.update`, `core.notification_settings.update`). N2 and N3 only call
`notify()` / `resolve()` from HR services and the HR job, and add the HR reminder settings; they add
no type keys (a missing one goes in a separate commit touching only the registry, said in the PR).

## Waves

| Wave | Tasks (parallel inside a wave) | Depends on |
|---|---|---|
| 0 | Spec decided (owner, 2026-11-18) · events + outbox work landed · jobs foundation merged | — |
| 1 | N0 probation end on the employee record (`logic`, HR) · N1 core notifications foundation (`logic`, backend + shared) | wave 0 (N1 also the jobs PR for the purge job) |
| 2 | N2 HR approval notifications (`logic`, backend) · N3 HR reminders (`logic`, backend) · N4 screens (`ui`, frontend) | N1 (N3 also N0) |
| 3 | N5 verify | all |

N2 and N3 both touch HR services but different ones (N2: penalties, payroll runs; N3: a new
`hr/reminders` area, HR settings, employees' and lateness' save paths for `resolve()`); N3's
`resolve()` calls in the payroll service go in after N2 merges if both edit the same method — merge
`origin/dev` first.

## N0 — probation end on the employee record (`logic`, backend + frontend, HR) — ✅ done (PR `feature/n0-probation-end`)

Owner, 2026-11-18: probation is a per-employee date, filled with hire date + the school's default
probation length and editable. Business: §3 (Planned row, becomes DECIDED with this task), §11.

- Prisma: `employees.probation_end` (date, nullable) + migration; backfill every existing employee
  with hire date + the default length (3 months) — GUESS: past dates are harmless (reminders only
  look ahead).
- HR setting `hr.employees.defaultProbationMonths` (3; 0–6; 0 = no probation, the field is left
  empty), in `hr-settings-defaults.ts`, validated, recorded by `hr.settings.update`, shown in
  Settings → HR rules.
- Create: an empty probation end is filled with hire date + the default months minus one day
  (hired 1 Sep → 30 Nov, GUESS); a given one is kept. Edit: the field can be changed or cleared;
  changing the hire date doesn't move it (GUESS — the form shows the hint).
- Validation: on or after the hire date (`PROBATION_BEFORE_HIRE`, 400).
- **Audit:** the create / edit entries (`hr.employee.create` / `hr.employee.update`) include the
  field like every other employee field; if the employee endpoints are still
  `@NotAudited('wired in T28')`, wire them in this PR (CLAUDE.md: same PR as any change to them).
- **P4 rules:** not salary-type — shown to whoever sees the employee (§2), on the profile and the
  form; edited with `hr.employees.edit` covering the employee (scope first, `assertScopeFirst`);
  absent from nothing. Shared types + EN/AR labels.
- Employee form and profile: a date field "Probation ends" under Hire date, with the hint "Filled
  from the hire date; change it if this employee's probation differs."

**Edge cases** (expected outcome — source):

1. New employee hired 1 Sep with no probation end → saved as 30 Nov. — owner 2026-11-18, §3
2. New employee with a probation end given → kept as given. — §3
3. Default length 0 → a new employee's probation end stays empty; no reminder for them. — §11
4. Probation end before the hire date → 400 `PROBATION_BEFORE_HIRE`, nothing saved. — §3
5. Edit clears the field → saved empty; the open probation reminder is resolved (N3). — §11
6. Hire date edited → probation end unchanged. — GUESS
7. Changing the default length → only employees created afterwards; existing dates stay. — §7
8. Audit: an edit that changes only the probation end writes one `hr.employee.update` entry with
   that field, before and after; an edit that doesn't change it doesn't list it. — §9
9. A stage head (no edit right) sees the date on a stage employee's profile; a direct manager
   outside the team → "This page isn't here". — §2, P4
10. Migration backfill: every employee gets hire + 3 months; re-running the seed changes nothing. —
    owner 2026-11-18
11. Arabic: the label, hint and error read in Arabic; the date shows in the screen's language. —
    §1

## N1 — core notifications foundation (`logic`, backend + shared)

**Done** (`feature/n1-notifications-core`): `apps/api/src/core/notifications/`, migration
`20261119010000_notifications` (tables + the grants), every v1 type and its EN / AR texts in
`packages/shared`, the API below, the nightly purge. Edge cases 1–29 are tested in
`notifications.*.spec.ts` (unit) and `apps/api/test/notifications.e2e-spec.ts` (with a test-only
type), the grants in `apps/api/test/notifications-grant-migration.e2e-spec.ts`. Left to N4: the
`SETTINGS_SECTION_ACCESS` entry for Settings → Notifications (adding it without its screen would
break the Settings screen and the role-access smoke spec). Choices made here: `read-all` marks what
was last updated by `upTo` (a group that grew after it stays unread); the unread count counts
notifications with at least one open item the reader may see; an audit line for a switch is
`<type>:<channel>`; a locked switch sent "on" is ignored.

- Tables + migration: `notifications`, `notification_items`, `notification_deliveries`, `notification_defaults`,
  `notification_preferences`, the indexes and the unique dedupe index from the spec (Entities).
- `packages/shared/src/notifications.ts`: `NOTIFICATION_TYPES` (module, category, `canTurnOff`,
  default channels, recipient permission, link builder, dedupe-key builder), `NOTIFICATION_CHANNELS`
  (`in_app` only — the field stays so later channels add a value, not a new shape), the shared types
  (`NotificationItem`, `NotificationPreferences`, `NotificationSettings`); `locales/<lang>/
  notifications.json` with every type's texts and plural forms; shared tests: identical key sets,
  every type has both texts, every Arabic count has all six forms.
- `NotificationsService` (exported from `core/notifications`): `notify()`, `resolve()`,
  `registerScopeResolver()`; grouping (N17): an item joins the recipient's open, unread
  notification of the same type and group key, else a new one; runs in the current transaction (`TransactionHost`), throws outside one;
  `AfterCommit` for nothing yet (outside channels later).
- Recipient resolver: active users holding the type's permission through `PermissionsService`
  (widest scope per user; System admin always), actor left out, scoped grants checked through the
  registered `NotificationScopeResolver` for the subject's entity type; unlinked scoped user → none.
- Preference resolution (N13) and delivery rows (N8); `InAppChannel` adapter behind
  `NotificationChannel`.
- Read API (spec contract): list, unread count, read / unread / read-all, preferences GET / PUT,
  `GET / PUT /settings/notifications`; `@SignedIn` routes scoped to the token's user; read paths
  re-check access per item (N11) through the same resolver.
- Permission keys + EN/AR labels, given to System admin (manage, view) and HR manager (view — read-only, DECIDED) in
  `BUILT_IN_ROLES` and a data migration for the existing roles rows; `SCREENS` entries for the
  Settings → Notifications section (`SETTINGS_SECTION_ACCESS`).
- Audit keys + sentences; `@NotAudited('personal read state, not school data')` on read / unread /
  read-all; `@Audited` on both PUTs.
- Retention: core settings (`readDays` 90, `resolvedDays` 30, `maxDays` 365, validated 1–3650) and a
  nightly purge job (`core.notifications.purge`, 02:30 Cairo) on the jobs foundation.
- Area order in core: `notifications` after `users`, before `auth`; dependency-cruiser rule.

**Edge cases** (expected outcome — source):

1. `notify()` inside a transaction that rolls back → no notification, no delivery. — spec N4, edge 11
2. `notify()` called outside a transaction → throws (caught in tests, never silent). — N4
3. The same `notify()` twice (same recipient, type, dedupe key) → one row; second call reports
   `created: 0`. — N9, edge 4
4. Two transactions insert the same dedupe key at once → one row, neither fails. — N9
5. A user with two roles, one `all` and one `own_team` → treated as `all`. — §2, R2 / widest scope
6. A scoped user with no linked employee → receives no scoped notification. — §2, R5
7. A deactivated user → never a recipient; their unread count is not computed. — §2
8. The actor holds the permission → not a recipient. — N5 (GUESS)
9. Nobody holds the permission → zero rows, no error. — edge 15
10. No resolver registered for a scoped subject's entity type → throws at `notify()` (a programming
    error), not "send to everyone". — N5
11. List / count after the reader lost the permission → those items are absent from both; the row
    still exists. — N11, edge 1
12. List / count after a scope change → items about employees now outside the scope are absent. —
    N11, edge 2
13. `resolve()` → every open notification of that subject, for every recipient, gets `resolved_at`,
    `resolution`, the resolver's name `{ en, ar }`; it leaves the unread count. — N10, edge 3
14. `resolve()` with nothing open → `resolved: 0`, no error (idempotent). — N10
15. Another user's id on read / unread → 404. — contract, edge 14
16. Read-all with `upTo` → only notifications created at or before it are marked; a later one stays
    unread. — edge 13
17. Preferences: a type with `canTurnOff: false` set to off for `in_app` → 409
    `NOTIFICATION_TYPE_REQUIRED`; any channel but `in_app` → 409 `CHANNEL_NOT_AVAILABLE`; `null` →
    the personal row is deleted and the school default applies. — N13, edge 9
18. A type turned off for a person → `notify()` writes no notification for them on that channel
    (in-app off = no notification row at all — GUESS: an in-app-off person gets no row). — N13
19. School default changed → applies to people with no personal choice, from the next `notify()`. —
    N13
20. Preferences GET lists only types whose permission the user holds. — spec Flow 4
21. Unread count over 99 → the API returns the real number; the bell shows "99+". — Flow 3
22. Purge job (nightly): read > 90 days, resolved > 30 days, any > 365 days deleted, with their
    items and deliveries; unread and recent kept; two containers → one run (advisory lock). — N14,
    owner 2026-11-18
23. Params hold names `{ en, ar }`; an Arabic reader gets the Arabic sentence of an old notification
    made while they used English. — N3, edge 10
24. Arabic plural forms: 0, 1, 2, 3, 10, 11, 100 render the right form for every count text. —
    edge 10, §9 (Arabic wording, 2026-11-18)
25. The notification writes are not audit entries; PUT preferences / settings write one audit entry
    each, with only the changed items; read endpoints write none. — spec "Notifications and the audit
    log"
26. Grouping: a second item of the same type and group key for a recipient whose notification is
    still unread joins it (one notification, two items, count unchanged); after it is read, the
    next item makes a new notification. — N17
27. Group re-check: items the reader may no longer see are left out of `items` and `openCount`; a
    notification with none left is absent from the list and the count. — N11, N17
28. `resolve()` of one item in a group → `openCount` drops; the last one → the notification is
    resolved and leaves the unread count. — N10, N17
29. The HR manager opens Settings → Notifications → everything read-only; PUT → 403. The System
    admin can save. — owner 2026-11-18

## N2 — HR approval notifications (`logic`, backend)

- Register HR's `NotificationScopeResolver` for `employee` and `penalty` subjects (from
  `modules/hr/access`: `inScope`), and `payroll_run` (scope `all` only).
- Penalties service: on record (pending) → `notify('hr.penalty.awaiting_approval', subject penalty,
  employeeId, params { employee {en,ar}, violation {en,ar}, level }, dedupe `penalty:<id>`)` in the
  record transaction; on approve → `resolve(..., 'approved')`; on cancel of a pending one →
  `resolve(..., 'cancelled')`.
- Payroll service: after create / recalculate, if the month has no pending penalties →
  `notify('hr.payroll.ready_to_approve', subject run, params { month, count, net? }, dedupe
  `payroll_ready:<month>:<calculatedAt>`)`; approve → `resolve(..., 'approved')`; a penalty recorded
  in a month whose run has an open "ready" → `resolve(..., 'done')`.
- The net goes in `params` only for readers who see the run totals: core stores one row per
  recipient, so HR passes `params` per recipient through a `paramsFor(user)` callback (GUESS — or two
  variants; settle in the task).

**Edge cases** (expected outcome — source):

1. Stage head records a penalty for a Primary employee → the HR manager and principal (scope `all`)
   and an approver scoped to Primary get it; an approver scoped to Preparatory doesn't. — §2, §11
2. Direct-manager-scoped approver (custom role) → only for their team's employees. — §2 (own_team)
3. The HR manager records a penalty → the principal is told, the HR manager isn't. — §11 GUESS
4. The principal approves → the HR manager's notification reads "Approved by …" and leaves the
   count; no new notification. — §11, N10
5. Cancelled while pending → resolved as cancelled for everyone. — §4, N10
6. An approved penalty cancelled later → nothing (no open "waiting"). — §4
7. Recording refused (once-per-day, inactive employee, month approved) → no notification. — §4, N4
8. An approver loses `hr.penalties.approve` → their open ones vanish from the list and count; new
   penalties don't reach them. — §11 Access, N11
9. Employee moves stage after a penalty is recorded → the old stage's scoped approver no longer sees
   it; the new stage's scoped approver isn't told retroactively (GUESS). — N11
10. Deactivating the employee with a pending penalty → the notification stays (the penalty can still
    be approved, §4). — §4
11. Draft created while the month has pending penalties → no "ready"; the recalculate after the last
    approval → "ready" sent to `hr.payroll.approve` holders. — §6 ("can't be approved while it still
    has pending penalties")
12. Recalculated twice with nothing pending → the second calculation sends a new "ready" with a new
    dedupe key and the first is resolved as `done` (GUESS: only the latest stays open). — spec
13. A penalty recorded in a ready month → "ready" resolved as `done`. — spec, §6
14. Run approved → "ready" and "still a draft" resolved as approved. — §6, N10
15. A salary-blind reader never gets the net in the sentence. — §2, edge 16
16. Arabic: "رواتب نوفمبر 2026 جاهزة للاعتماد — 38 موظفًا"; 1 → "موظف واحد", 2 → "موظفان". — §11
17. Three penalties recorded before the approver opens the bell → one notification "3 penalties
    waiting for your approval"; approving them one by one lowers the open count; the last resolves
    it. — N17, owner 2026-11-18
18. Approval types can't be turned off: a preference PUT turning one off → 409; every approver gets
    them. — owner 2026-11-18

## N3 — HR reminders (`logic`, backend) — ✅ done (PR `feature/n3-hr-reminders`)

**Done:** HR settings `hr.reminders.*` (the second contract reminder fewer days than the first, else
400 `INVALID_REMINDER_DAYS`); `modules/hr/reminders` — `reminders.pure.ts`, the `hr.reminders.daily`
job (07:00 Cairo, one `afterCommit.inTransaction` per type in turn), `HrRemindersService` (resolves at
the change), `HrNotificationScopes` (`employee` by HR's scope rule; `lateness_month`,
`payroll_month`, `payroll_run` whole-school only). Core gained `resolve({ dedupeKey })` (one
reminder of a subject) and `openItems(type)`. Edge cases 1–18 are tested in `reminders.pure.spec.ts`,
`hr-reminders.job.spec.ts`, `hr-reminders.service.spec.ts`, the HR service specs and
`apps/api/test/hr-reminders.e2e-spec.ts` (+ `hr-settings.e2e-spec.ts` for edge 15). Choices: contract
items group per school day **and window** (`2027-05-01:30`), so the 30- and 7-day ones never share a
group; the job sends only the current month's lateness / payroll reminders (an open one from an
earlier month stays until done); a timing change never sends a second reminder of the same stage
for the same date; N2's `employee` / `payroll_run` resolvers, if registered again, must keep this
rule (one registration per entity type).


- HR settings keys `hr.reminders.contractEndDays` (30), `contractEndSecondDays` (7; 0 = none; less
  than the first), `probationEndDays` (7), `latenessCheckDay` (25), `payrollCheckDay` (28), validated
  (ranges in the spec), recorded by `hr.settings.update`; (the default probation length is N0's); defaults in `packages/shared/src/hr-settings-defaults.ts`.
- `modules/hr/reminders`: a pure `reminders.pure.ts` (given today in Cairo, the settings and the
  facts → the list of `{ type, subject, dedupeKey, params }` due, and the list to resolve), and a
  daily job `hr.reminders.daily` at 07:00 Cairo on the jobs foundation that reads the facts, calls
  the pure function and `notify()` / `resolve()` in one transaction per type.
- `resolve()` at the moment of the change too: employee contract end edited or employee
  deactivated (contract / probation), probation end edited or cleared, lateness month saved (lateness), run created (not prepared),
  run approved (still a draft). (The job also resolves what no longer holds, as a safety net.)
- Group key = the school day of the run, so one run's contract reminders for a recipient are one
  notification ("38 contracts end within 30 days") — N17. Probation dates come from the employee's
  `probation_end` (N0).

**Edge cases** (expected outcome — source):

1. Contract ends in 30 days → reminder today; in 31 days → none; ended yesterday → none (GUESS:
   overdue contracts are not chased). In 7 days → the second reminder (dedupe `…:7`), and the
   30-day item is resolved as done; second-reminder setting 0 → no second one. — owner 2026-11-18
2. Contract end changed to a later date outside the window → open reminder resolved; changed to
   another date inside the window → a new reminder (new dedupe key), old one resolved. — N9, §11
3. The job runs twice the same day (manual re-run, or two containers) → no second reminder. —
   N9, N16, edge 4
4. Server down on the check day → next day's run sends it once. — N16, edge 5
5. 00:30 Cairo on the 1st (still the previous day in UTC) → today is the 1st in Cairo; the job at
   07:00 Cairo evaluates the new month. — N16, edge 6
6. Check day 31 in February → fires on the 28th (29th in 2028). — spec, edge 7
7. Check day 25, lateness saved on the 20th (even all zeros) → no reminder. — §11 GUESS
8. Lateness saved after the reminder → resolved for every recipient. — N10
9. Month whose payroll is approved without lateness ever saved → lateness reminder resolved, none
   sent (the month is locked, §5). — §5, §6
10. No run by the 28th → "not prepared" to `hr.payroll.create` holders; a draft by the 28th → "still
    a draft" to `hr.payroll.approve` holders; approved before the 28th → nothing. — §11
11. Probation end 30 Nov (the employee's field, N0) → reminder on 23 Nov with 7 days; an empty
    probation end → no reminder; HR moves it to 31 Dec → the open item resolved, a new one on
    24 Dec. — owner 2026-11-18, §11
12. Deactivated employee → no reminder; open ones resolved. — §3, edge 8
13. A contract-end reminder for a stage employee reaches a scoped employee editor of that stage
    only (and every `all` holder). — §2
14. A person who turned "Contract ends soon" off → nothing for them; others still get it. — §11
    Preferences
15. Settings validation: check day 0 or 32, negative days, second contract reminder ≥ the first
    → 400. — spec settings
16. Changing a timing → takes effect at the next run; already-sent reminders stay. — spec GUESS
17. Every contract ending 31 May → on 1 May one grouped notification per editor with 38 items
    ("38 contracts end within 30 days"), on 24 May a second ("… within 7 days"). — N17, owner
    2026-11-18
18. A failed job run (database error) is logged in `job_runs` as failed, sends nothing half-way
    for that type (one transaction per type), and the next run catches up. — jobs foundation, N16

## N4 — screens (`ui`, frontend) — option A — ✅ done (PR `feature/n4-notification-screens`)

**Done:** the bell (`apps/web/src/core/notifications`), My account → Notifications
(`/account/notifications`) and Settings → Notifications (`modules/settings`, with its
`SETTINGS_SECTION_ACCESS` entry and icon). Choices made here: My account has two tabs, Profile
(sign-in details and password together, as before) and Notifications — the mockup's separate
Password tab isn't split out; the registry's seven types are seven rows (the mockup merged "not
prepared" and "still a draft" into one); the retention is its own card with all three values, next
to the reminder timing card (which also holds the default probation length); the HR manager can
still change the reminder timing there (HR rules, `hr.settings.edit`) while the defaults and the
retention are read-only for them; the list's footer link opens My account → Notifications. The
penalty landing (`?penalty=` opening that penalty) and the smoke flow "record → principal → approve
→ Approved by …" need N2; the smoke specs cover the bell, both preference screens and the HR
manager's read-only view (`e2e/25-notifications*.spec.ts`), and the skeleton spec has both screens.

- The bell in the app shell's top bar (desktop row beside the language switch; phone top bar), the
  unread count (polling 60 s while visible + on focus, `99+`), and the **popover** anchored to the
  bell (shadcn `Popover`, about 430 px, height capped, body scrolls): All / Unread tabs, the latest 20,
  grouped notifications ("12 contracts end within 30 days" → Show all → the items, each linking
  to its record), resolved rows
  ("Approved by …"), Mark all as read, a footer link to the notification settings, open → mark read
  + navigate + close. **Phone (< 768 px): the same list as a full-screen sheet** from the top bar's
  bell, with a close button and Mark all read in its header.
- My account → **Notifications** tab: a list of the types the user can receive, grouped by module
  and category, **one switch per type** (in-app; no other channel appears in the UI or its copy).
  Required types: switch on, locked, "Required". A switch that differs from the school default:
  "Changed from school default" + "Reset to school default" (sends `enabled: null`). Each change
  saves at once (optimistic, rolled back with the error on failure). Phone: one card per type with
  its switch.
- Settings → **Notifications** section: the same list of types with one default switch each
  ("On by default"; required ones locked), then **Reminder timing** (contract reminder, probation
  reminder, probation length, lateness check day, payroll check day — saved through HR settings)
  and **Keep read notifications** (retention), with the sticky Save bar (disabled until a change);
  read-only without the permission.
- Texts from `notifications.json` through the shared plural helper; links from the shared builder.
- Skeletons matching each list; empty states ("You're all caught up"); EN/AR, RTL, phone + desktop.
- Smoke spec: record a penalty as the HR officer, sign in as the principal, see the count, open the
  notification, land on the penalty; approve; the HR manager's row reads "Approved by …".

**Interaction cases:** open marks read, navigates and closes the popover; mark all read keeps a
newer one unread; the count updates on focus; an item whose link the user can't open shows the
not-found screen; a locked switch can't be toggled (and says "Required"); a failed toggle returns to
its previous state with the error; Reset to school default shows the school's value; double-click
Mark all sends one request; in RTL the popover aligns to the bell at the left edge; the phone sheet
traps focus and closes on ✕ / back; keyboard: bell reachable, Enter opens, Esc closes, focus returns
to the bell; opening the popover doesn't shift the page.

## N5 — verify

`pnpm ci:local --full`; every N1–N3 edge case ticked against its test by name; smoke; `ui-auditor`
over the bell, list, My account tab and Settings section (EN/AR, phone/tablet/desktop); a `break-ui`
pass (long Arabic names, 1 and 1,284 notifications, empty); `DEMO_SCRIPT.md` gets the bell step and
a dry run on a copy (CLAUDE.md rule 8); §11 moves from Planned to Built, §7 gets the reminder
timings and Settings → Notifications, §2 the new permissions, §8 updated.

## Alignment note (against `docs/BUSINESS_LOGIC.md`)

Checked by hand against §2, §3, §4, §5, §6, §7, §9 and the new §11 (2026-11-18):

- **§2 Roles / scopes** — recipients follow the permission and its scope (`own_stage`, `own_team`),
  with the "widest scope wins" and "unlinked scoped user sees nobody" rules; out-of-scope opens
  show "This page isn't here". Aligned. New permissions (`core.notifications.view` / `.manage`:
  System admin changes, HR manager views — DECIDED, owner 2026-11-18) must be added to §2 when N1
  lands.
- **§2 Salary** — the payroll sentence's net follows the run-totals rule (principal sees totals;
  others without `hr.payroll.view` at `all` don't). Aligned (N2 edge 15).
- **§4 Penalties** — pending → approved / cancelled is the only life cycle the approval notification
  follows; refused recordings send nothing; a deactivated employee's pending penalty can still be
  approved, so its notification stays. Aligned.
- **§6 Payroll** — "can't be approved while it has pending penalties" is exactly the "ready"
  condition; approval resolves it. Aligned.
- **§5 Lateness** — a month is locked once payroll is approved, so its lateness reminder resolves.
  Aligned.
- **§3 Employees** — contract end exists (default 31 May). **Probation end** is now a Planned
  employee field in §3 (owner, 2026-11-18); N0 builds it with its audit and P4 rules and moves the
  row to DECIDED. Aligned.
- **§7 Settings** — reminder timings are HR rules and are audited like every HR rule; core
  retention and defaults are new settings. §7's table gets the rows when N3 lands (doc follows the
  build in the same PR).
- **§9 Audit** — notifications are not entries; the writes that change settings or preferences are
  audited; read state is `@NotAudited` with its reason (CLAUDE.md: deliberately not recorded).
  Aligned.

Verdict: **ALIGNED**, with doc gaps to close in the build PRs (§2 permissions, §7 settings rows, §3
probation row to DECIDED). No OPEN business point left (owner, 2026-11-18). The
`business-alignment-reviewer` runs on this plan before N0 / N1 start, and after N0, N1, N2 and N3.
