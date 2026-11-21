# Events and transactions

Which events the API publishes, who publishes them, who listens, how each is delivered, and where
every transaction opens and closes. Written from the code on `feature/events-outbox` (2026-11-18).
The rules behind it are in `docs/ARCHITECTURE.md` → How modules talk to each other and →
Transactions and the audit log; the plan is `docs/plans/2026-11-18-events-outbox-plan.md`.

## How to update this file

**Every PR that adds, renames or removes an event or a listener, or changes a transaction boundary,
updates this file in the same PR** (owner, 2026-11-18). That means:

- a new event constant in `packages/shared/src/events.ts` (and its `DomainEventMap` entry) → a new
  `###` section under Events catalogue, with its **Kind** row, and a row in the summary;
- a new publish site (a file that injects `DomainEvents`) or a new listener (`@OnDomainEvent` or
  `@OutboxListener`) → named, with its file path, in its event's section;
- a new `withTransaction`, `afterCommit.inTransaction`, `afterCommit.transaction`, `afterCommit.run`,
  `afterCommit.onRollback`, `Propagation.RequiresNew` or `$transaction` → its file path in the
  Transactions map.

`apps/api/src/common/events/events-doc.spec.ts` checks this in CI: it fails when an event, a publish
site, a listener or a transaction site is missing here, when an event's Kind row disagrees with
`MUST_DELIVER_EVENTS`, or when this file names one that no longer exists. Its message says what to
add. Keep the `###` heading format: `` `Group.KEY` — `'name'` ``.

## The mechanism

- **One way to send an event:** `DomainEvents.publish(name, payload, options)`
  (`apps/api/src/core/events/domain-events.ts`). Names and payloads come from one map,
  `DomainEventMap` in `packages/shared/src/events.ts`: a wrong name or payload fails typecheck, and
  so does a must-deliver event without `{ mustDeliver: true }` (or a fire-and-forget one with it).
  NestJS's `EventEmitter2` is gone (not even a dependency); `apps/api/src/core/events/events-usage.spec.ts`
  fails on any use of it, or on a `.emit(` / `.emitAsync(` outside `core/events`.
- **Always after the commit.** Inside a transaction the work is queued on `AfterCommit` and dropped
  if it rolls back; outside one it happens now. Inside a transaction **with no after-commit queue**
  (a plain `txHost.withTransaction` opened outside `AfterCommit`) `AfterCommit.run` — and so
  `publish` — throws `AfterCommitWithoutQueueError` instead of running inside the transaction.
- **Fire-and-forget** (cache refresh, notices): after the commit, each `@OnDomainEvent` listener of
  the event runs in turn, awaited (the response waits for them); a throw is logged and never fails
  the request; nothing is retried. Rule: anything whose loss leaves no data wrong and nobody untold.
- **Must-deliver** (`MUST_DELIVER_EVENTS`): if losing it leaves data wrong or someone not told. An
  `outbox_events` row (`id`, `seq`, `name`, `payload` JSON, `created_at`, `status`) and one
  `outbox_deliveries` row per `@OutboxListener` of the event known at boot (`event_id`, `listener`,
  `status`, `attempts`, `next_attempt_at`, `last_error`, `delivered_at`) are written **in the
  publisher's transaction** — the event exists exactly when the change does. Delivery
  (`apps/api/src/core/events/outbox-delivery.service.ts`):
  - **the nudge**: right after the commit, that event's deliveries are delivered — **started, not
    awaited** (`OutboxDelivery.nudgeSoon`): the request answers at once and never waits for an
    outbox listener (a stuck one, e.g. on a lock, can't hang HR's approval); delivery follows within
    milliseconds. It starts on the next turn of the event loop in a context of its own (`cls.run`
    with `ifNested: 'override'`), so it never sees the request's CLS store, transaction or user; a
    failure is logged (`nudge` itself never throws). `DomainEvents.idle()` waits for every nudge
    started so far — e2e tests call it (`outboxIdle(app)` in `apps/api/test/helpers/events.ts`)
    before checking a listener's work, and shutdown waits for it too;
  - **the poll**: job `outbox.deliver` every 30 s (`apps/api/src/core/events/outbox.jobs.ts`), the
    safety net (a crash, a retry coming due, a lease that ran out). It runs **without** the job
    advisory lock (`lock: false`): `FOR UPDATE SKIP LOCKED` is the concurrency control, and the
    lock's transaction would hold a connection while the deliveries need another. It writes
    `job_runs` only when it delivered or failed something (`'idle'` otherwise);
  - **claim**: one statement locks due pending rows `FOR UPDATE OF d SKIP LOCKED`, oldest event first
    (`seq`), and moves their `next_attempt_at` 5 minutes ahead (a lease) so no other pass takes them.
    "Due" is `next_attempt_at <=` the pass's start **plus 1 s** (`CLAIM_TOLERANCE_MS`, `claimDueBy`
    in `apps/api/src/core/events/outbox.pure.ts`): the poll's ticks wander by milliseconds, and a
    retry due at a tick is taken by that tick, not the next one 30 s later;
  - **deliver**: per row, one transaction (with its own after-commit queue, in a fresh request
    context) that first marks the delivery delivered — `UPDATE … WHERE status = 'pending'` — and
    stops if that touched nothing (already handled: **a redelivery is a no-op**), then runs the
    listener's `handle(payload, context)`, then marks the event delivered once every delivery is.
    The listener's writes join this transaction, so its work and the "handled" mark commit
    together. A second worker holding the same row waits on its lock and then finds it delivered;
  - **failure**: that transaction rolls back; then (one statement) `attempts + 1`, `last_error`,
    and the next try after 10 s, 1 min, 5 min, 30 min, then every 2 h — **counted from the claim**
    (the pass's start), not from the failure a few ms later, so a retry lands on a poll tick — counted
    only if nobody else touched the row since the claim. At **10 failures** the delivery and its
    event are `dead` (logged; a system notification to admins comes with notifications);
  - **`attempts` counts failures only**: a delivery delivered at its first try shows 0, one that
    failed twice and then went through shows 2 (being delivered doesn't add one). The dead-after-10
    rule counts these failures. The listener's `context.attempt` is the try number (`attempts + 1`);
  - **admin**: `GET /outbox/deliveries?status=dead` and `POST /outbox/deliveries/:id/retry`
    (`core.outbox.manage`, `@Audited('core.outbox.retry')`, `apps/api/src/core/events/outbox.controller.ts`):
    a dead delivery goes back to pending with its attempts kept (one more try; another failure
    makes it dead again), recorded dead → pending, and is nudged after the commit (not awaited: the
    response shows it pending);
  - **cleanup**: job `outbox.cleanup` nightly at 03:30 deletes delivered events older than 30 days
    with their deliveries; dead and pending ones stay.
- **Listeners** are providers marked `@OnDomainEvent(name)` or
  `@OutboxListener({ event, name })` (`apps/api/src/core/events/listeners.ts`), found at boot by
  `EventListeners` (`apps/api/src/core/events/event-listeners.ts`). An outbox listener's `name`
  (`<module>.<what>`) names its delivery rows; two with one name, or a listener of the wrong kind,
  fail at boot.
- **Connections**: no step holds one pooled connection while it waits for another — the claim is
  one statement, each delivery one transaction, a failure one statement after it. A listener must
  never open a `RequiresNew` (see the Transactions map and `apps/api/src/database/connections.spec.ts`).

## Summary

| Event | Published by | Listeners | Kind | When |
|---|---|---|---|---|
| `hr.employee.hired` | hr / `EmployeesService.create` | none | fire-and-forget | after commit |
| `hr.employee.updated` | hr / `EmployeesService` update, photo, reactivate | none | fire-and-forget | after commit, only when a field changed |
| `hr.employee.deactivated` | hr / `EmployeesService.deactivate` | none yet | must-deliver | outbox row in the change's transaction |
| `hr.payroll.approved` | hr / `PayrollService.approve` | accounting / `PayrollApprovedListener` | must-deliver | outbox row in the approval's transaction |
| `core.settings.changed` | core / `SettingsService.writeValues`, `SettingsHistory.record` | none | fire-and-forget | after commit, per changed key |
| `core.user.sessions_ended` | core / `UserAccountsService` deactivate, temporary password | core/auth / `SessionsEndedListener` | fire-and-forget | after commit |
| `core.notification.push_requested` | core / `NotificationsService.notify` (a new item for someone with alerts on a device) | core/notifications / `PushNotificationListener` | must-deliver | outbox row in the notifying change's transaction |

## Events catalogue

All payload types live in `packages/shared/src/events.ts` (exported from `@school-erp/shared`),
one per event in `DomainEventMap`.

### `HrEvent.EMPLOYEE_HIRED` — `'hr.employee.hired'`

| | |
|---|---|
| Kind | **fire-and-forget** |
| Payload | `EmployeeHiredEvent` `{ employeeId, hireDate, at }` (`hireDate` `YYYY-MM-DD`; `at` = publish time, ISO) |
| Published by | hr — `EmployeesService.create`, `apps/api/src/modules/hr/employees/services/employees.service.ts` |
| When | a new employee row and its `hr.employee.create` audit entry are written; sent after the commit (also for the seed's creates, which open their own transaction) |
| Listeners | none yet (planned: notifications). The API e2e records it (`apps/api/test/helpers/events.ts`) |

### `HrEvent.EMPLOYEE_UPDATED` — `'hr.employee.updated'`

| | |
|---|---|
| Kind | **fire-and-forget** |
| Payload | `EmployeeUpdatedEvent` `{ employeeId, fields, at }` — `fields`: the changed fields, named as in the audit snapshot (`departmentId` for the department; a reference counts when it points at another record) |
| Published by | hr — `EmployeesService.update`, `setPhoto`, `removePhoto` and `reactivate` (through `setStatus`), `apps/api/src/modules/hr/employees/services/employees.service.ts` |
| When | an edit, a new or removed photo, a reactivation (`fields: ['status']`) — **only when a field changed** (`changedEmployeeFields`); sent after the commit |
| Listeners | none yet |

### `HrEvent.EMPLOYEE_DEACTIVATED` — `'hr.employee.deactivated'`

| | |
|---|---|
| Kind | **must-deliver** |
| Payload | `EmployeeDeactivatedEvent` `{ employeeId, at }` |
| Published by | hr — `EmployeesService.deactivate` → `setStatus`, `apps/api/src/modules/hr/employees/services/employees.service.ts` |
| When | the status changes ACTIVE → INACTIVE (already inactive: nothing published). The outbox row is written in the change's transaction |
| Listeners | none yet, so the event is written `delivered` with no deliveries (cleaned after 30 days). Planned: academics unassigns the teacher; notifications |

### `HrEvent.PAYROLL_APPROVED` — `'hr.payroll.approved'`

| | |
|---|---|
| Kind | **must-deliver** |
| Payload | `PayrollApprovedEvent` `{ runId, month, totals: PayrollTotals, approvedById, at }` (`PayrollTotals` in `packages/shared/src/types/payroll-totals.ts`; `at` = the run's `approvedAt`) |
| Published by | hr — `PayrollService.approve`, `apps/api/src/modules/hr/payroll/services/payroll.service.ts` |
| When | a DRAFT run is recalculated, locked as APPROVED and its `hr.payroll.approve` entry written; the outbox row commits with them (the `@Audited` request transaction) |
| Listeners | accounting — `PayrollApprovedListener` (`accounting.payroll-taxes`), `apps/api/src/modules/accounting/payroll/listeners/payroll-approved.listener.ts` |
| What it does | `AccountingPayrollService.recordApprovedRun(runId)` (`apps/api/src/modules/accounting/payroll/services/accounting-payroll.service.ts`): reads HR's approved lines, works out insurance, income tax and fund with the tax rule in force at the approval, writes `accounting_payroll_runs` + lines and an `accounting.payroll.record` entry (no actor) |
| Its transaction | the delivery's: `recordApprovedRun` joins it (`txHost.withTransaction`, no `RequiresNew`), so the taxes, their entry and the delivered mark commit together |
| Idempotent | twice over — the outbox handles each (event, listener) once, and `recordApprovedRun` returns early when the HR run is already recorded (the unique `hrRunId` / `month`; losing that race aborts the delivery's transaction, which is retried and then finds the month recorded) |
| If it fails | rolled back and retried (10 s, 1 min, …; dead after 10, an admin can retry). HR's approval stands. `AccountingPayrollService.getMonth` still works a missing month out the first time it is read (the late path, kept as the second guard) |

### `SettingsEvent.CHANGED` — `'core.settings.changed'`

| | |
|---|---|
| Kind | **fire-and-forget** |
| Payload | `SettingsChangedEvent` `{ scope, key, oldValue, newValue, changedById, changedAt }`, one event per changed key |
| Published by | core — `SettingsService.writeValues` (behind `setValues`, `updateSchool`, `setLogo`; called by `HrSettingsService.update`, `AccountingSettingsService.update` and the seed), `apps/api/src/core/settings/settings.service.ts`; and `SettingsHistory.record` (stages, departments, job titles, penalty groups, violations), `apps/api/src/core/settings/settings-history.ts` |
| When | a school / HR / accounting setting, or a list or catalogue item, really changed (an unchanged save publishes nothing); sent after the commit. The history row is already written in the change's own transaction; the event is only a notice |
| Listeners | none since #105 (planned: a settings cache). The API e2e listens to check it is sent (`apps/api/test/hr-settings.e2e-spec.ts`, `apps/api/test/helpers/events.ts`) |

### `CoreEvent.USER_SESSIONS_ENDED` — `'core.user.sessions_ended'`

| | |
|---|---|
| Kind | **fire-and-forget** |
| Payload | `UserSessionsEndedEvent` `{ userId, reason: 'deactivated' \| 'temporary_password', at }` |
| Published by | core — `UserAccountsService.deactivate` and `setTemporaryPassword` via `endSessions`, `apps/api/src/core/users/user-accounts.service.ts` |
| When | an active user is deactivated, or an admin sets a temporary password; sent after the `@Audited` request transaction commits (a rollback ends nothing) |
| Listeners | core/auth — `SessionsEndedListener`, `apps/api/src/core/auth/listeners/sessions-ended.listener.ts` |
| What it does | `RefreshTokensRepository.revokeAllOf(userId, at)` — revokes every unrevoked refresh token of the user |
| Its transaction | none: one `updateMany` on the plain client (it runs after the commit, so `txHost.tx` is not in a transaction) |
| Idempotent | yes — only rows with `revoked_at` null are touched |
| If it fails | logged by `DomainEvents`. A deactivated user is still locked out (every request and every refresh re-reads the user). After a temporary password the old sessions would survive until their refresh tokens expire — acceptable for fire-and-forget (owner's design) |

### `NotificationEvent.PUSH_REQUESTED` — `'core.notification.push_requested'`

| | |
|---|---|
| Kind | **must-deliver** |
| Payload | `NotificationPushRequestedEvent` `{ notificationId, recipientId, at }` — ids only: the alert's words are read when it is sent |
| Published by | core — `NotificationsService.notify`, `apps/api/src/core/notifications/notifications.service.ts` |
| When | a new item reached a person's bell (a new notification, or one joining their open group), the server has VAPID keys, the type is on for them in the app (required types always), and they have at least one device with alerts on. The outbox row is written in the notifying change's transaction (HR's penalty / payroll transaction, a reminder job's, accounting's return): a rolled-back change sends no alert |
| Listeners | core/notifications — `PushNotificationListener` (`core.notifications.push`), `apps/api/src/core/notifications/push/push.listener.ts` |
| What it does | reads the notification as its reader sees it now (`NotificationInbox.findVisible`, N11 — nothing for one already read, handled or no longer visible), builds the alert per device in its language (`pushMessageFor`: the bell's title and line, never money or typed text), and sends it to each of the person's active devices through `PushSender` (`apps/api/src/core/notifications/push/push-sender.ts`: `web-push` encrypts and signs, `fetch` sends, 10 s timeout). Devices answering 404 / 410 are revoked (`expired`); the push delivery row (`notification_deliveries`, channel `push`) is marked `sent` / `failed` / `skipped` |
| Its transaction | the delivery's: the device and delivery bookkeeping (`apps/api/src/core/notifications/repositories/push-devices.repository.ts`, `txHost.tx`) commits with the delivered mark; no `RequiresNew` |
| Idempotent | each (event, listener) is handled once; a retry happens only when **no** device took the alert (429, 5xx, timeout — it throws, rolling its bookkeeping back), so no device gets a second copy |
| If it fails | retried (10 s, 1 min, 5 min, …; dead after 10). The notification is in the bell either way; a device that failed while another took it is logged and skipped this time |

## Transactions map

How a write gets its transaction:

- **`@Audited` handlers** — `AuditedInterceptor` (`apps/api/src/core/audit/interceptors/audited.interceptor.ts`)
  runs the whole handler in `afterCommit.transaction(...)`: one transaction with an after-commit
  queue, 15 s timeout. Everything below joins it.
- **`afterCommit.inTransaction(fn)`** — joins that transaction, or (outside a request: the seed, a
  job, a `@NotAudited` handler that records itself) opens one with its own queue. Used where the
  service must record in its own write's transaction whoever calls it.
- **`txHost.withTransaction(fn)`** — joins the open transaction or opens a plain one (no queue: an
  `afterCommit.run` or `publish` inside it throws). Used by repositories for multi-row writes.
- **`afterCommit.onRollback(fn)`** — work for when the open transaction rolls back (a file written
  before the commit is deleted again).
- **`Propagation.RequiresNew`** — a separate transaction that commits on its own; inside an open
  request transaction it needs a **second pooled connection** while the first is held. Allowed only
  where `apps/api/src/database/connections.spec.ts` lists it with its reason (today: the failed
  sign-in and lockout entries, whose callers hold no request transaction).
- **`txHost.tx`** — the repositories that join: audit entries, refresh tokens, grants, roles,
  stages, school settings, users, employees, the HR lists, payroll runs, penalties, lateness,
  accounting, the outbox, notifications. Plain-client writes (`DatabaseService`) are listed with their reasons in
  `apps/api/src/database/connections.spec.ts`; read-only repositories still on it
  (`apps/api/src/modules/hr/month-lock/repositories/month-lock.repository.ts`) run outside any transaction.

| Where | Operation | How | Written inside | After commit |
|---|---|---|---|---|
| `apps/api/src/database/transactions.ts` | `AfterCommit.transaction` / `inTransaction` / `run` / `onRollback` | defines them; `run` / `onRollback` throw in a transaction with no queue | — | runs the queue in order, logs failures; on rollback runs the rollback work |
| `apps/api/src/core/audit/interceptors/audited.interceptor.ts` | every `@Audited` handler | `afterCommit.transaction` | the handler's writes + its `audit.record()` + any outbox rows; `AUDIT_NOT_RECORDED` rolls all back | the queued work (events, nudges) |
| `apps/api/src/core/audit/audit.service.ts` | `audit.record()` | requires an open transaction (throws `AuditOutsideTransactionError`) | one `audit_entries` row | — |
| `apps/api/src/core/events/domain-events.ts` | `publish` | fire-and-forget: `afterCommit.run`; must-deliver: `afterCommit.inTransaction` (joins the caller's) | must-deliver: the `outbox_events` row + one `outbox_deliveries` row per listener | fire-and-forget listeners; the nudge (`nudgeSoon`: started, not awaited) |
| `apps/api/src/core/events/outbox-delivery.service.ts` | deliver one claimed delivery (nudge and poll) | `afterCommit.transaction` in a fresh request context, after a one-statement claim (`FOR UPDATE SKIP LOCKED` + lease, `apps/api/src/core/events/repositories/outbox.repository.ts`); a failure is recorded in one statement after the rollback | the delivered mark + the listener's writes + the event's status | the listener's own queued work |
| `apps/api/src/core/events/outbox-admin.service.ts` | `POST /outbox/deliveries/:id/retry` | request transaction (`@Audited`) via `afterCommit.inTransaction` | the delivery back to pending, the event to pending, the `core.outbox.retry` entry | the nudge |
| `apps/api/src/core/auth/services/auth.service.ts` | sign-in (`login`) | **no request transaction**: `POST /auth/login` is `@NotAudited` (with the reason); on success `afterCommit.inTransaction` | `recordSignIn`, the refresh token and the `core.auth.sign_in` entry, together | — |
| `apps/api/src/core/auth/services/auth.service.ts` | sign-out | request transaction (`@Audited`) | the revoked refresh token + `core.auth.sign_out` entry | — |
| `apps/api/src/core/auth/services/auth.service.ts` | failed sign-in (wrong password, or locked) | `Propagation.RequiresNew` (no outer transaction, so one connection) | the `core.auth.sign_in_failed` entry — its own transaction so it outlives the 401 / 429 | — |
| `apps/api/src/core/sign-in-limit/sign-in-limit.service.ts` | `recordFailure` when the attempt reaches the limit (sign-in and both password-change paths) | `Propagation.RequiresNew` (no outer transaction on either caller); a failure is logged, never turns the 401 into a 500 | the `core.auth.locked_out` entry | — |
| `apps/api/src/core/sign-in-limit/repositories/login-attempts.repository.ts` | count a wrong password, clear, unlock | the count: plain client, one atomic upsert, never in a transaction; clear / unlock join the caller's (`txHost.tx`) | the `login_attempts` row | — |
| `apps/api/src/core/notifications/notifications.service.ts` | `notify()` / `resolve()` / `openItems()` (modules send through them: HR's approvals, N2 — `apps/api/src/modules/hr/notifications/hr-notifications.service.ts`, in the penalty's / payroll's transaction; HR's reminders, N3 — resolved in HR's own change transactions and sent by `hr.reminders.daily`) | **joins the caller's** transaction and throws outside one (`NotificationOutsideTransactionError`, like `audit.record()`): a module's own change, or an outbox listener's delivery transaction; a job opens one with `afterCommit.inTransaction`. Opens none itself, so never a second connection | per recipient: a transaction-scoped advisory lock on the recipient's group (`pg_advisory_xact_lock`, `apps/api/src/core/notifications/repositories/notifications.repository.ts`), then the item (`ON CONFLICT DO NOTHING` on the dedupe key), a new notification and its `in_app` delivery when no open group exists; `resolve`: the items and the notifications left with none open | a `push` delivery `pending` (new notification) and the `core.notification.push_requested` outbox row, for a recipient with alerts on a device — sent after the commit by `PushNotificationListener` |
| `apps/api/src/core/notifications/notification-preferences.service.ts` | `PUT /notifications/preferences`, `PUT /settings/notifications` | request transaction (`@Audited`); the settings save goes through `SettingsService.setValues` (owner `notifications`), which joins it | the personal rows / the school defaults + the retention keys + one `core.notification_preferences.update` / `core.notification_settings.update` entry | `core.settings.changed` per changed retention key |
| `apps/api/src/core/notifications/push/push-devices.service.ts` | `POST /notifications/push-devices`, `POST /notifications/push-devices/unsubscribe`, `DELETE /notifications/push-devices/:id` | request transaction (`@Audited`) | the device row (`push_subscriptions`) + one `core.push_device.add` / `.remove` entry (turning alerts on again on one's own active device writes none) | — |
| `apps/api/src/core/notifications/push/push.listener.ts` | `PushNotificationListener.handle` | the outbox delivery's transaction (opens none) | devices marked used / revoked (`expired`), the notification's `push` delivery | — |
| `apps/api/src/core/notifications/notifications-purge.job.ts` | `core.notifications.purge` (02:30) | under the job's advisory lock; one `deleteMany` on `txHost.tx` (no transaction of its own) | — | — |
| `apps/api/src/core/jobs/repositories/job-runs.repository.ts` | `withLock` (every scheduled job run with `lock` on, via `JobRunner` in `apps/api/src/core/jobs/job-runner.service.ts`) | `db.$transaction` on the plain client (outside any request), holding `pg_try_advisory_xact_lock(hashtextextended('job:<name>', 0))` — released when the transaction ends, also if the process dies. `lock: false` jobs (the outbox's) run without it | the job's own work (e.g. `login-attempts.cleanup`) runs inside it; `job_runs` is written afterwards by `record`, outside it | — |
| `apps/api/src/core/auth/repositories/refresh-tokens.repository.ts` | token refresh (`rotate`) | `databaseService.$transaction` (not CLS; `@NotAudited`, deliberately — see Known gaps) | the new token + marking the old one used | — |
| `apps/api/src/core/users/user-accounts.service.ts` | create, update, deactivate, reactivate, unlock sign-in, temporary password | request transaction (`@Audited`) | the user + roles + the `core.user.*` entry (unlock: deletes the `login_attempts` row) | `core.user.sessions_ended` (deactivate, temporary password) |
| `apps/api/src/core/users/user-accounts.service.ts` | change own password (`POST /account/password`) | **no request transaction** (`@NotAudited`, with the reason): the checks, a wrong password's count and lockout hold no connection; then `afterCommit.inTransaction` | the new password + the `core.user.change_password` entry, together | — |
| `apps/api/src/core/roles/roles.service.ts` | role create, update, delete | request transaction (`@Audited`) | the role + grants + the `core.role.*` entry | — |
| `apps/api/src/core/settings/settings.service.ts` | `writeValues` (school settings, logo, HR and accounting settings); `setLogo` | `afterCommit.inTransaction` (joins the request's); the logo file is saved inside it with `afterCommit.onRollback` deleting it again | the changed keys + one entry for the owner's action | `core.settings.changed` per changed key |
| `apps/api/src/core/settings/repositories/school-setting.repository.ts` | `upsertMany` | `txHost.withTransaction` | every key or none | — |
| `apps/api/src/core/settings/settings-history.ts` | `SettingsHistory.record` | inside the caller's transaction | the list / catalogue history entry | `core.settings.changed` when the value changed |
| `apps/api/src/core/school-structure/stages.service.ts` | stage create, update | `afterCommit.inTransaction` | the stage + its history entry | `core.settings.changed` |
| `apps/api/src/modules/hr/lists/services/list-items.service.ts` | department / job title create, update | `afterCommit.inTransaction` | the item + its history entry | `core.settings.changed` |
| `apps/api/src/modules/hr/penalties/services/penalty-catalogue.service.ts` | penalty group, violation create, update | `afterCommit.inTransaction` | the group / violation (+ levels) + its history entry | `core.settings.changed` |
| `apps/api/src/modules/hr/employees/services/employees.service.ts` | create, update, set / remove photo, deactivate, reactivate | `afterCommit.inTransaction` | the employee + its `hr.employee.*` entry (+ the `hr.employee.deactivated` outbox row; a moved contract / probation end or a deactivation resolves its reminders, N3); a new photo file is deleted again on rollback (`afterCommit.onRollback`) | the old photo file removed (`afterCommit.run`); `hr.employee.hired` / `hr.employee.updated` |
| `apps/api/src/modules/hr/employees/repositories/employees.repository.ts` | `createWithCode` | `txHost.withTransaction` | the `EMP-nnnn` counter bump + the employee | — |
| `apps/api/src/modules/hr/staff-attendance/services/lateness.service.ts` | `put` (save a month) | `afterCommit.inTransaction` | the month's minutes + one `hr.lateness.save` entry + the month's lateness reminder resolved (N3) | — |
| `apps/api/src/modules/hr/reminders/hr-reminders.job.ts` | `hr.reminders.daily` (07:00 school time) | under the job's advisory lock; **one `afterCommit.inTransaction` per reminder type**, in turn (the lock's connection + one more, bounded — never two types at once) | per type: the open items (`openItems`), the facts (`apps/api/src/modules/hr/reminders/repositories/reminders.repository.ts`, on `txHost.tx`), the stale ones resolved, then the due ones sent (`notify`, dedupe keys) — a failing type rolls back alone and the run is recorded `failed` | — |
| `apps/api/src/modules/hr/staff-attendance/repositories/lateness.repository.ts` | `upsertMany` | `txHost.withTransaction` | all entries or none | — |
| `apps/api/src/modules/hr/payroll/services/payroll.service.ts` | create, recalculate, approve, add / remove adjustment | `afterCommit.inTransaction` | the run / lines / adjustment + its `hr.payroll.*` entry (+ the `hr.payroll.approved` outbox row; create resolves "not prepared", approve "still a draft" and the month's lateness reminder, N3; create / recalculate: the earlier "ready to approve" resolved and, with no pending penalty in the month, a new one sent; approve: "ready" resolved, N2) | the nudge (approve) |
| `apps/api/src/modules/hr/payroll/repositories/payroll-runs.repository.ts` | `createRun`, `replaceLines`, `addAdjustment`, `deleteAdjustment` | `txHost.withTransaction` | the run and lines; each claims the DRAFT row first | — |
| `apps/api/src/modules/hr/penalties/services/penalty-records.service.ts` | record, approve, cancel | `afterCommit.inTransaction` (joins the request's — `@Audited` since T29; the seed opens its own) | the record / its status + its `hr.penalty.*` entry; record: "waiting for approval" to its approvers and the month's open "ready to approve" resolved; approve / cancel of a pending one: "waiting" resolved for everyone (N2) | — |
| `apps/api/src/modules/hr/notifications/hr-notifications.service.ts` | HR's approval notifications (N2), called by the two rows above and, for `hr.payroll.returned_by_accounting`, by `PayrollService.returnFromAccounting` inside accounting's return transaction | opens none: `notify()` / `resolve()` join the penalty's or payroll's transaction, so a refused or rolled-back change tells no one; no `RequiresNew` | the notification rows (see `notifications.service.ts`) | — |
| `apps/api/src/modules/hr/penalties/repositories/penalty-records.repository.ts` | `createRecord`, `approve` | `txHost.withTransaction` (joins the service's) | the record under the employee + violation lock (once-per-day check) | — |
| `apps/api/src/modules/accounting/settings/accounting-settings.service.ts` | `update` | `afterCommit.inTransaction` (joins the request's; outside one it opens one with a queue, so the settings event can't fire inside it) | the tax-rule keys via `setValues` + a new tax-rule version | `core.settings.changed` (queued by `setValues`) |
| `apps/api/src/modules/accounting/payroll/services/accounting-payroll.service.ts` | `recordApprovedRun` | `txHost.withTransaction` — joins the outbox delivery's transaction; on the late read path (`getMonth`, no transaction) opens one | the accounting run + lines + `accounting.payroll.record` entry | — |
| `apps/api/src/modules/accounting/payroll/services/accounting-payroll.service.ts` | `returnToHr`, `finalize` (`POST /accounting/payroll/:month/return` · `/finalize`) | `afterCommit.inTransaction` (joins the `@Audited` request transaction). Locks the accounting month's row first, then HR's run, in both — the same order, so a return and a finalize racing wait instead of deadlocking | return: the month's row + lines dropped (only while not finalized), HR's run back to DRAFT with the reason through `PayrollService.returnFromAccounting` (+ its `hr.payroll.returned` entry and the `hr.payroll.returned_by_accounting` notification to HR's approvers, N2), the `accounting.payroll.return` entry; finalize: the row marked finalized, HR's run marked transferred through `PayrollService.markTransferred` (+ `hr.payroll.transferred`), the `accounting.payroll.finalize` entry. A refusal anywhere (409 `PAYROLL_FINALIZED` / `PAYROLL_NOT_APPROVED`) rolls all of it back | — |
| `apps/api/src/modules/accounting/payroll/repositories/accounting-payroll.repository.ts` | `create` | `txHost.withTransaction` (joins the above) | the run + its lines; a duplicate returns null | — |

## Known gaps

What is still open, each with an owner and a reason. Fixed in the events + outbox PR: the
`employee.*` events firing inside the transaction, `employee.updated` on a save with no change,
`emit` / `emitAsync` mixed, names off the convention, one payload type for three events,
`AfterCommit.run` inside a plain transaction, uploaded files surviving a rollback, the two-connection
risk on `POST /account/password`, and the `RequiresNew` rule (now a scan).

1. **Events nobody listens to yet:** `hr.employee.hired`, `hr.employee.updated`,
   `hr.employee.deactivated`, `core.settings.changed`. Harmless (a must-deliver one without a
   listener is written delivered at once). Owner: whoever builds the first consumer —
   notifications (the core mechanism landed in N1; HR's notifications, N2 / N3 — N3's reminders landed —, call `notify()` /
   `resolve()` in HR's own transactions, so HR's own events need no listener for them), academics (unassign on deactivation), a settings cache.
2. **Token refresh uses `databaseService.$transaction`**, outside the CLS transaction — deliberate:
   a refresh is not an audited action (D11) and holds no request transaction, so one connection.
   Owner: Abdallah, only if a refresh must ever be audited (then `txHost.withTransaction`).
3. **The old school logo file stays on disk** after a new one is saved (a photo's old file is
   deleted after the commit; the logo never did, and the rollback fix didn't change that). Owner:
   Abdallah — delete it after the commit like a photo, or sweep unreferenced files, if disk use
   ever matters.
4. **A dead delivery only logs.** The notifications mechanism exists now (core/notifications, N1),
   but no type tells admins about a dead delivery yet (a `core.*` type needs its texts and a
   decision on who receives it), and there is no screen for `GET /outbox/deliveries` yet (an admin
   uses the API). Owner: Abdallah.
5. **A listener added later doesn't get old events**: delivery rows are made per listener known when
   the event is published. A renamed outbox listener strands its pending rows (they fail as "no
   listener", then go dead, and can be retried after a fix). Owner: the listener's author — keep
   listener names stable.
