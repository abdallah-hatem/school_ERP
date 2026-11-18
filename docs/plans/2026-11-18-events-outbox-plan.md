# Plan — Events + outbox (2026-11-18)

Spec: the owner-approved design in `docs/BUILD_LOG.md` → Next up → **Events + outbox** (2026-11-18,
recorded in #108) and the Known gaps in `docs/EVENTS.md` (#114). No business section changes: this is
how modules talk (`docs/ARCHITECTURE.md` → How modules talk to each other). One PR,
`feature/events-outbox`, into `dev`. Accounting / payroll parts are Tamer's to review.

## Spec

1. **`DomainEvents.publish(name, payload, options)`** in `core/events`, the only way to send an
   event. Names and payloads come from one map in `packages/shared` (`DomainEventMap`); a wrong name
   or payload fails typecheck, and so does a must-deliver event published without
   `{ mustDeliver: true }` (or a fire-and-forget one with it). Always after commit: inside a
   transaction it queues on `AfterCommit`; outside one it runs at once.
2. **`AfterCommit.run` inside a transaction with no after-commit queue** (a plain
   `txHost.withTransaction` opened outside a request) **throws** instead of running inside the
   transaction (EVENTS gap 7). `AccountingSettingsService.update` moves to `afterCommit.inTransaction`.
   `AfterCommit.onRollback(fn)` is added for files written before the commit (gap 8).
3. **Fire-and-forget**: listeners are providers marked `@OnDomainEvent(name)` with a `handle(payload)`;
   after the commit each runs in turn, awaited, its error logged, never failing the request.
4. **Must-deliver (outbox)**: `outbox_events` (id, seq, name, payload JSON, created_at, status
   `pending | delivered | dead`) and `outbox_deliveries` (id, event_id, listener, status, attempts,
   next_attempt_at, last_error, delivered_at; unique (event_id, listener)), written in the publisher's
   transaction — one delivery row per `@OutboxListener` of that event known at boot.
   - **Nudge**: after the commit, that event's deliveries are delivered at once (awaited).
   - **Poll**: job `outbox.deliver` every 30 s (`*/30 * * * * *`), run **without** the job advisory
     lock (`lock: false`): SKIP LOCKED is the concurrency control, and the lock's transaction would
     hold a pooled connection while deliveries need another. It writes `job_runs` only when it
     delivered or failed something (`run()` returns `'idle'` otherwise).
   - **Claim**: one short transaction, `SELECT … FOR UPDATE OF d SKIP LOCKED` on due pending rows in
     creation order (`e.seq`), then a 5-minute lease (`next_attempt_at = now + 5 min`) so no other
     pass takes them; commit. Then each is delivered in order.
   - **Deliver** (the idempotent wrapper every `@OutboxListener` gets): one transaction (with an
     after-commit queue) that first marks the delivery delivered —
     `UPDATE … SET status='delivered' WHERE id = $1 AND status = 'pending'` — and stops when that
     touched nothing (already handled: a redelivery is a no-op), then runs the listener's
     `handle(payload, ctx)`; the listener's writes join this transaction, so the work and the
     "handled" mark commit together. One connection at a time; no `RequiresNew` inside.
   - **Failure**: the transaction rolls back; then `attempts + 1`, `last_error`,
     `next_attempt_at = now + 10 s / 1 min / 5 min / 30 min / 2 h…` (after failure 1, 2, 3, 4, 5+);
     at **10 failures** the delivery and its event are `dead` (logged; a system notification later).
   - **Admin**: `GET /outbox/deliveries?status=dead` (paged) and `POST /outbox/deliveries/:id/retry`
     (`core.outbox.manage`, `@Audited('core.outbox.retry')`): a dead delivery back to pending, due now,
     nudged after the commit. Not dead → 409 `OUTBOX_NOT_DEAD`.
   - **Cleanup**: job `outbox.cleanup` nightly at 03:30: deletes delivered events older than 30 days
     (their deliveries cascade); dead and pending ones stay.
5. **Moves**: `payroll.approved` → `hr.payroll.approved` (must-deliver; accounting's
   `PayrollApprovedListener` becomes an `@OutboxListener`; `recordApprovedRun` joins the delivery's
   transaction instead of `RequiresNew`; `getMonth`'s late path stays as the second guard).
   `employee.deactivated` → `hr.employee.deactivated` (must-deliver, no listener yet).
   `employee.hired` / `employee.updated` → `hr.employee.hired` / `hr.employee.updated`,
   fire-and-forget, own payloads, `updated` only when the employee changed (with the changed fields).
   `settings.changed` → `core.settings.changed` and `core.user.sessions_ended`: fire-and-forget.
6. **Scans**: no file imports `@nestjs/event-emitter` (the package is removed) or calls `.emit(` /
   `.emitAsync(` outside `core/events`; every `Propagation.RequiresNew` and plain-client write
   (`DatabaseService`) is on an allowlist that says why it doesn't run while a request transaction
   holds a connection (gap 11).
7. **Gap 10**: `POST /account/password` becomes `@NotAudited` (reason given); the service writes the
   new password and its `core.user.change_password` entry in one `afterCommit.inTransaction`, and the
   wrong-password path holds no transaction — at most one connection per step, as sign-in.
8. **Gap 8**: the new logo / photo file is removed when the write rolls back
   (`afterCommit.onRollback`); the old photo is removed only after the commit (as today).

## Tasks

| # | Task | Class |
|---|---|---|
| E1 | `packages/shared/src/events.ts`: renamed constants, `DomainEventMap`, `MUST_DELIVER_EVENTS`, new payloads | logic |
| E2 | `AfterCommit`: throw without a queue, `onRollback` | logic |
| E3 | `core/events`: `DomainEvents`, `@OnDomainEvent`, `@OutboxListener`, registry | logic |
| E4 | Outbox tables + migration; repository (claim, deliver, fail, retry, cleanup) | logic |
| E5 | `OutboxDelivery` (nudge, deliver one, retry schedule, dead), jobs `outbox.deliver`, `outbox.cleanup`; `JobDefinition.lock`, `'idle'` | logic |
| E6 | Admin endpoints, permission `core.outbox.manage`, action `core.outbox.retry`, entity `outbox_delivery`, error code, EN/AR | logic |
| E7 | Move every emit and listener; accounting listener (Tamer reviews) | logic |
| E8 | Gaps 8, 10, 11 | logic |
| E9 | Docs: ARCHITECTURE events section, EVENTS.md, build log; events-doc test follows the new mechanism | docs |

## Edge cases (expected outcome — source)

1. Publish inside a transaction that rolls back → no event, no listener run, no outbox row (design: "always after commit"; rollback drops the queue).
2. Publish inside a plain `txHost.withTransaction` with no queue → throws (gap 7).
3. Publish outside any transaction → fire-and-forget runs now; must-deliver writes its rows in their own transaction and nudges now (design).
4. A fire-and-forget listener throws → logged; the other listeners still run; the request succeeds (design: "errors logged, never failing the request").
5. A must-deliver event with no listener → event row `delivered` at once, no deliveries (design; cleaned after 30 days).
6. An outbox listener throws → delivery stays pending, attempts 1, retried 10 s later; the request succeeds (design retry schedule).
7. Failures 1…10 → next try after 10 s, 1 min, 5 min, 30 min, 2 h, 2 h…; the 10th → `dead`, event `dead`, logged (design).
8. Two worker passes at once (two containers, or nudge + poll) → SKIP LOCKED + lease: each delivery handled once (design).
9. A crash after the listener committed but before anything else → impossible to double: the mark is in the listener's transaction; a redelivery finds it delivered → no-op (design: idempotent listeners).
10. A delivery whose listener no longer exists → a failure ("no listener"), retried, then dead (removing a listener is a code change; the admin sees it).
11. Admin retries a delivery that isn't dead → 409 `OUTBOX_NOT_DEAD`; unknown id → 404; retry → pending, due now, audited with status dead → pending; a rolled-back retry leaves it dead (audit rule).
12. Cleanup → delivered events older than 30 days gone with their deliveries; dead, pending and newer delivered ones kept (design).
13. Payroll approved → taxes written by the outbox delivery in the same transaction as its delivered mark; if delivery failed, `GET /accounting/payroll/:month` still works them out (Tamer's late path, second guard).
14. Employee saved with nothing changed → no `hr.employee.updated` (gap 3); reactivate → `updated` with `status`.
15. Photo / logo upload whose request rolls back → the new file is deleted; the old photo is deleted only after a commit (gap 8).
16. Wrong current password on `POST /account/password` → 400, counted; 5th → locked (429 after) with its `core.auth.locked_out` entry; no request transaction held meanwhile (gap 10).
