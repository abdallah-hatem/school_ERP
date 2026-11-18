# Events and transactions

Which events the API emits, who emits them, who listens, and where every transaction opens and
closes. Written from the code on `dev` (2026-11-18). The rules behind it are in
`docs/ARCHITECTURE.md` → How modules talk to each other and → Transactions and the audit log.

## How to update this file

**Every PR that adds, renames or removes an event or a listener, or changes a transaction boundary,
updates this file in the same PR** (owner, 2026-11-18). That means:

- a new event constant in `packages/shared/src/events.ts` → a new `###` section under Events
  catalogue, and a row in the summary;
- a new emit site (a file that injects `EventEmitter2`) or a new `@OnEvent` listener → named, with
  its file path, in its event's section;
- a new `withTransaction`, `afterCommit.inTransaction`, `afterCommit.transaction`, `afterCommit.run`,
  `Propagation.RequiresNew` or `$transaction` → its file path in the Transactions map.

`apps/api/src/common/events/events-doc.spec.ts` checks this in CI: it fails when an event, an emit
site, a listener or a transaction site is missing here, or when this file names one that no longer
exists. Its message says what to add. Keep the `###` heading format: `` `Group.KEY` — `'name'` ``.

Mechanism in one paragraph: events are NestJS `EventEmitter2`, **in memory** (`EventEmitterModule.forRoot()`
in `apps/api/src/app.module.ts`, default options: no wildcards, no persistence). A lost event (a
crash after the commit, a failing listener) is not retried. `AfterCommit.run(fn)`
(`apps/api/src/database/transactions.ts`) queues `fn` until the transaction opened by
`AfterCommit.transaction` commits, drops it on rollback, and logs (never rethrows) a failure. With
`emitAsync` the after-commit flush awaits the listeners, so the HTTP response waits for them; with
`emit` it does not.

## Summary

| Event | Emitted by | Listeners | After commit? | Call | Planned kind |
|---|---|---|---|---|---|
| `employee.hired` | hr / `EmployeesService.create` | none | **no — inside the transaction** (gap 1) | `emit` | not classified yet |
| `employee.updated` | hr / `EmployeesService` update, photo, reactivate | none | **no — inside the transaction** (gap 1) | `emit` | not classified yet |
| `employee.deactivated` | hr / `EmployeesService.deactivate` | none | **no — inside the transaction** (gap 1) | `emit` | must-deliver |
| `payroll.approved` | hr / `PayrollService.approve` | accounting / `PayrollApprovedListener` | yes, `AfterCommit.run` | `emit` | must-deliver (as `hr.payroll.approved`) |
| `settings.changed` | core / `SettingsService.writeValues`, `SettingsHistory.record` | none | yes, `AfterCommit.run` | `emitAsync` | fire-and-forget |
| `core.user.sessions_ended` | core / `UserAccountsService` deactivate, temporary password | core/auth / `SessionsEndedListener` | yes, `AfterCommit.run` | `emitAsync` | fire-and-forget |

## Events catalogue

All payload types live in `packages/shared/src/events.ts` (exported from `@school-erp/shared`).
"Planned kind" is the approved events + outbox design (`docs/BUILD_LOG.md` → Next up → Events +
outbox): must-deliver if losing it leaves data wrong or someone not told; else fire-and-forget.

### `HrEvent.EMPLOYEE_HIRED` — `'employee.hired'`

| | |
|---|---|
| Payload | `EmployeeHiredEvent` `{ employeeId, at }` (`at` = emit time, ISO) |
| Emitted by | hr — `EmployeesService.create` via its private `emit()`, `apps/api/src/modules/hr/employees/services/employees.service.ts` |
| When | a new employee row and its `hr.employee.create` audit entry are written |
| Inside or after the transaction | **inside**: `emit()` is called in the `afterCommit.inTransaction` callback, not through `AfterCommit.run` — it fires before the commit and even if the transaction then rolls back (gap 1). The seed's creates go the same way. |
| Call | `emit` (listeners not awaited) |
| Delivery today / planned | in memory / not classified yet (no listener) — classify with the first listener |
| Listeners | none (the API e2e spies on it, `apps/api/test/hr-employees.e2e-spec.ts`) |

### `HrEvent.EMPLOYEE_UPDATED` — `'employee.updated'`

| | |
|---|---|
| Payload | `EmployeeUpdatedEvent` `{ employeeId, at }` — typed as `EmployeeHiredEvent` at the emit site (same shape) |
| Emitted by | hr — `EmployeesService.update`, `setPhoto`, `removePhoto` and `reactivate` (through `setStatus`), `apps/api/src/modules/hr/employees/services/employees.service.ts` |
| When | an edit, a new or removed photo, a reactivation. `update` emits even when nothing changed (gap 3); `removePhoto` with no photo and `setStatus` to the same status emit nothing |
| Inside or after the transaction | **inside** (gap 1), as for `employee.hired` |
| Call | `emit` |
| Delivery today / planned | in memory / not classified yet (no listener) |
| Listeners | none |

### `HrEvent.EMPLOYEE_DEACTIVATED` — `'employee.deactivated'`

| | |
|---|---|
| Payload | `EmployeeDeactivatedEvent` `{ employeeId, at }` |
| Emitted by | hr — `EmployeesService.deactivate` → `setStatus`, `apps/api/src/modules/hr/employees/services/employees.service.ts` |
| When | the status changes ACTIVE → INACTIVE (already inactive: nothing emitted) |
| Inside or after the transaction | **inside** (gap 1) |
| Call | `emit` |
| Delivery today / planned | in memory / **must-deliver** (approved design) |
| Listeners | none yet. Planned: academics unassigns the teacher; notifications |

### `HrEvent.PAYROLL_APPROVED` — `'payroll.approved'`

| | |
|---|---|
| Payload | `PayrollApprovedEvent` `{ runId, month, totals: PayrollTotals, approvedById, at }` (`PayrollTotals` in `packages/shared/src/types/payroll-totals.ts`; `at` = the run's `approvedAt`) |
| Emitted by | hr — `PayrollService.approve`, `apps/api/src/modules/hr/payroll/services/payroll.service.ts` |
| When | a DRAFT run is recalculated, locked as APPROVED and its `hr.payroll.approve` entry written |
| Inside or after the transaction | after: `await this.afterCommit.run(() => this.events.emit(...))` inside `afterCommit.inTransaction` (the `@Audited` request transaction) |
| Call | `emit` — the flush does not await the listener; the response can return before accounting has written the taxes (gap 4) |
| Delivery today / planned | in memory / **must-deliver**, renamed `hr.payroll.approved` |
| Listeners | accounting — `PayrollApprovedListener.record`, `apps/api/src/modules/accounting/payroll/listeners/payroll-approved.listener.ts` |
| What it does | `AccountingPayrollService.recordApprovedRun(runId)` (`apps/api/src/modules/accounting/payroll/services/accounting-payroll.service.ts`): reads HR's approved lines, works out insurance, income tax and fund with the tax rule in force at the approval, writes `accounting_payroll_runs` + lines and an `accounting.payroll.record` entry (no actor) |
| Its transaction | its own: `txHost.withTransaction(Propagation.RequiresNew, …)` — the run, its lines and the entry commit together |
| Idempotent | yes — returns early when the HR run is already recorded, and the unique `hrRunId` / `month` make a second insert a no-op (P2002 → null) |
| If it fails | caught and logged by the listener; HR's approval stands. `AccountingPayrollService.getMonth` works the month out the first time it is read (the late path), with the same answer |

### `SettingsEvent.CHANGED` — `'settings.changed'`

| | |
|---|---|
| Payload | `SettingsChangedEvent` `{ scope, key, oldValue, newValue, changedById, changedAt }`, one event per changed key |
| Emitted by | core — `SettingsService.writeValues` (behind `setValues`, `updateSchool`, `setLogo`; called by `HrSettingsService.update`, `AccountingSettingsService.update` and the seed), `apps/api/src/core/settings/settings.service.ts`; and `SettingsHistory.record` (stages, departments, job titles, penalty groups, violations), `apps/api/src/core/settings/settings-history.ts` |
| When | a school / HR / accounting setting, or a list or catalogue item, really changed (an unchanged save emits nothing) |
| Inside or after the transaction | after: `AfterCommit.run`. The history row is already written in the change's own transaction; the event is only a notice |
| Call | `emitAsync` (awaited by the after-commit flush) |
| Delivery today / planned | in memory / fire-and-forget (cache refresh later) |
| Listeners | none since #105 (the history listener was removed). The API e2e subscribes to check it fires (`apps/api/test/hr-settings.e2e-spec.ts`) (gap 2) |

### `CoreEvent.USER_SESSIONS_ENDED` — `'core.user.sessions_ended'`

| | |
|---|---|
| Payload | `UserSessionsEndedEvent` `{ userId, reason: 'deactivated' \| 'temporary_password', at }` |
| Emitted by | core — `UserAccountsService.deactivate` and `setTemporaryPassword` via `endSessions`, `apps/api/src/core/users/user-accounts.service.ts` |
| When | an active user is deactivated, or an admin sets a temporary password |
| Inside or after the transaction | after: `AfterCommit.run`, queued in the `@Audited` request transaction (a rollback ends nothing) |
| Call | `emitAsync` |
| Delivery today / planned | in memory / fire-and-forget |
| Listeners | core/auth — `SessionsEndedListener.revoke`, `apps/api/src/core/auth/listeners/sessions-ended.listener.ts` |
| What it does | `RefreshTokensRepository.revokeAllOf(userId, at)` — revokes every unrevoked refresh token of the user |
| Its transaction | none: one `updateMany` on the plain client (it runs after the commit, so `txHost.tx` is not in a transaction) |
| Idempotent | yes — only rows with `revoked_at` null are touched |
| If it fails | caught and logged. A deactivated user is still locked out (every request and every refresh re-reads the user). After a temporary password the old sessions would survive until their refresh tokens expire |

## Transactions map

How a write gets its transaction:

- **`@Audited` handlers** — `AuditedInterceptor` (`apps/api/src/core/audit/interceptors/audited.interceptor.ts`)
  runs the whole handler in `afterCommit.transaction(...)`: one transaction with an after-commit
  queue, 15 s timeout. Everything below joins it.
- **`afterCommit.inTransaction(fn)`** — joins that transaction, or (outside a request: the seed)
  opens one with its own after-commit queue. Used where the service must record in its own write's
  transaction whoever calls it.
- **`txHost.withTransaction(fn)`** — joins the open transaction or opens a plain one (no
  after-commit queue). Used by repositories for multi-row writes.
- **`Propagation.RequiresNew`** — a separate transaction that commits on its own.
- **`txHost.tx`** — the repositories that join: audit entries, refresh tokens, grants, roles,
  stages, school settings, users, employees, the HR lists, payroll runs, penalties, lateness,
  accounting. Repositories still on `DatabaseService` (`apps/api/src/common/repositories/base.repository.ts`
  and its users, `apps/api/src/modules/hr/month-lock/repositories/month-lock.repository.ts`) run
  outside any transaction.

| Where | Operation | How | Written inside | After commit |
|---|---|---|---|---|
| `apps/api/src/database/transactions.ts` | `AfterCommit.transaction` / `inTransaction` / `run` | defines them | — | runs the queue in order, logs failures |
| `apps/api/src/core/audit/interceptors/audited.interceptor.ts` | every `@Audited` handler | `afterCommit.transaction` | the handler's writes + its `audit.record()`; `AUDIT_NOT_RECORDED` rolls all back | the queued work |
| `apps/api/src/core/audit/audit.service.ts` | `audit.record()` | requires an open transaction (throws `AuditOutsideTransactionError`) | one `audit_entries` row | — |
| `apps/api/src/core/auth/services/auth.service.ts` | sign-in, sign-out | request transaction (`@Audited`) | `recordSignIn`, refresh token, `core.auth.sign_in` / `sign_out` entry | — |
| `apps/api/src/core/auth/services/auth.service.ts` | failed sign-in | `Propagation.RequiresNew` | the `core.auth.sign_in_failed` entry — its own transaction because the request's rolls back with the 401 | — |
| `apps/api/src/core/auth/repositories/refresh-tokens.repository.ts` | token refresh (`rotate`) | `databaseService.$transaction` (not CLS; `@NotAudited`) | the new token + marking the old one used | — |
| `apps/api/src/core/users/user-accounts.service.ts` | create, update, deactivate, reactivate, temporary password, change password | request transaction (`@Audited`) | the user + roles + the `core.user.*` entry | `core.user.sessions_ended` (deactivate, temporary password) |
| `apps/api/src/core/roles/roles.service.ts` | role create, update, delete | request transaction (`@Audited`) | the role + grants + the `core.role.*` entry | — |
| `apps/api/src/core/settings/settings.service.ts` | `writeValues` (school settings, logo, HR and accounting settings) | `txHost.withTransaction` (joins the request's) | the changed keys + one entry for the owner's action | `settings.changed` per changed key |
| `apps/api/src/core/settings/repositories/school-setting.repository.ts` | `upsertMany` | `txHost.withTransaction` | every key or none | — |
| `apps/api/src/core/settings/settings-history.ts` | `SettingsHistory.record` | inside the caller's transaction | the list / catalogue history entry | `settings.changed` when the value changed |
| `apps/api/src/core/school-structure/stages.service.ts` | stage create, update | `afterCommit.inTransaction` | the stage + its history entry | `settings.changed` |
| `apps/api/src/modules/hr/lists/services/list-items.service.ts` | department / job title create, update | `afterCommit.inTransaction` | the item + its history entry | `settings.changed` |
| `apps/api/src/modules/hr/penalties/services/penalty-catalogue.service.ts` | penalty group, violation create, update | `afterCommit.inTransaction` | the group / violation (+ levels) + its history entry | `settings.changed` |
| `apps/api/src/modules/hr/employees/services/employees.service.ts` | create, update, set / remove photo, deactivate, reactivate | `afterCommit.inTransaction` | the employee + its `hr.employee.*` entry (the photo file is saved before, outside any rollback) | old photo file removed (`AfterCommit.run`); the `employee.*` events are **not** after commit (gap 1) |
| `apps/api/src/modules/hr/employees/repositories/employees.repository.ts` | `createWithCode` | `txHost.withTransaction` | the `EMP-nnnn` counter bump + the employee | — |
| `apps/api/src/modules/hr/staff-attendance/services/lateness.service.ts` | `put` (save a month) | `afterCommit.inTransaction` | the month's minutes + one `hr.lateness.save` entry | — |
| `apps/api/src/modules/hr/staff-attendance/repositories/lateness.repository.ts` | `upsertMany` | `txHost.withTransaction` | all entries or none | — |
| `apps/api/src/modules/hr/payroll/services/payroll.service.ts` | create, recalculate, approve, add / remove adjustment | `afterCommit.inTransaction` | the run / lines / adjustment + its `hr.payroll.*` entry | `payroll.approved` (approve) |
| `apps/api/src/modules/hr/payroll/repositories/payroll-runs.repository.ts` | `createRun`, `replaceLines`, `addAdjustment`, `deleteAdjustment` | `txHost.withTransaction` | the run and lines; each claims the DRAFT row first | — |
| `apps/api/src/modules/hr/penalties/repositories/penalty-records.repository.ts` | `createRecord`, `approve` | `txHost.withTransaction` (its own: the endpoints are still `@NotAudited('wired in T29')`) | the record under the employee + violation lock (once-per-day check) | — |
| `apps/api/src/modules/accounting/settings/accounting-settings.service.ts` | `update` | `txHost.withTransaction` (joins the request's) | the tax-rule keys via `setValues` + a new tax-rule version | `settings.changed` (queued by `setValues`) |
| `apps/api/src/modules/accounting/payroll/services/accounting-payroll.service.ts` | `recordApprovedRun` | `Propagation.RequiresNew` — it runs from the listener or the late read path, never inside HR's transaction | the accounting run + lines + `accounting.payroll.record` entry | — |
| `apps/api/src/modules/accounting/payroll/repositories/accounting-payroll.repository.ts` | `create` | `txHost.withTransaction` (joins the above) | the run + its lines; a duplicate returns null | — |

## Known gaps

Found while writing this file. Each fix is one line; most land with the `DomainEvents.publish` work.

1. **The `employee.*` events fire inside the transaction.** `EmployeesService.emit()` calls
   `this.events.emit` directly in the `afterCommit.inTransaction` callback, so the event goes out
   before the commit and also when the request then rolls back (a later failure, `AUDIT_NOT_RECORDED`).
   Fix: `void this.afterCommit.run(() => this.events.emit(event, payload))` in `emit()`.
2. **Events nobody listens to:** `employee.hired`, `employee.updated`, `employee.deactivated`,
   `settings.changed`. Harmless today. Fix: keep them (planned consumers: academics, notifications,
   cache refresh); classify `employee.hired` / `employee.updated` when the first listener lands.
3. **`employee.updated` fires on a save that changed nothing** (`update` always emits; the photo and
   status paths don't). Fix: emit only when `employeeAuditSnapshot(before)` and `(after)` differ.
4. **`emit` vs `emitAsync` mixed.** `payroll.approved` and `employee.*` use `emit` (a listener's
   promise is not awaited; accounting may still be writing when HR's response returns);
   `settings.changed` and `core.user.sessions_ended` use `emitAsync` (the response waits). Fix: one
   rule in `DomainEvents.publish` (fire-and-forget awaited after commit; must-deliver via the outbox).
5. **Names off the convention** `<module>.<thing>.<past-tense>`: `employee.*` and `payroll.approved`
   lack the `hr.` prefix, `settings.changed` the module. Fix: rename in the DomainEvents move
   (`hr.payroll.approved` is already planned).
6. **One payload type for three events:** the private `emit()` types every `employee.*` payload as
   `EmployeeHiredEvent`. Fix: the name→payload map in `packages/shared`.
7. **`AfterCommit.run` inside a plain `txHost.withTransaction`** (one not opened by
   `AfterCommit.transaction`) finds no queue and runs at once — inside the transaction. Not hit
   today (every emit is reached through the interceptor or `inTransaction`), but
   `AccountingSettingsService.update` called outside a request would. Fix: `AfterCommit.run` throws
   when a transaction is open without a queue, or the service uses `afterCommit.inTransaction`.
8. **Uploaded files outlive a rollback:** `setLogo` and `EmployeesService.setPhoto` save the file
   before the write commits; a rolled-back request leaves it on disk. Fix: remove the new file in a
   rollback hook, or a nightly sweep of unreferenced files.
9. **Token refresh uses `databaseService.$transaction`**, outside the CLS transaction (deliberate:
   not audited). Fix, if it ever must be audited: `txHost.withTransaction`.

## Planned

Approved 2026-11-18, starting after the scheduled-jobs PR (#109) merges — see `docs/BUILD_LOG.md`
→ Next up → **Events + outbox**:

- `DomainEvents.publish(name, payload, { mustDeliver? })` in core, typed by one name→payload map in
  `packages/shared`; always after commit; every emit above moves to it; lint bans `EventEmitter2`
  outside it.
- Must-deliver events (`hr.payroll.approved`, `employee.deactivated`, every notification event) go
  through an `outbox_events` row written in the same transaction, delivered per listener
  (`outbox_deliveries`): a nudge after commit plus a 30 s poll, retries, dead after 10 failures.
- Listeners become idempotent through a base class that records handled event ids.

When that lands, this file's columns "Call" and "Delivery today" change for every event.
