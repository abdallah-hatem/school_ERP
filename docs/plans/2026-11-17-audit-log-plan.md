# Plan — Audit log (2026-11-17)

Spec: `docs/specs/2026-11-17-audit-log.md` (decisions D1–D11, contract, edge cases 1–11). Business:
§9, §7, §2. Layout: option B in `design/mockups/audit-log.html`. Each task: own branch from `dev`,
background agent in its own worktree, one PR into `dev`, `pnpm ci:local --full` before the PR.

**Collision rule:** T27 creates the whole audit foundation, including **every v1 action key** with its
English and Arabic sentence in `packages/shared`. T28 and T29 only call `audit.record()` inside their
own modules' services and controllers; they add no keys (if one is missing, add it in a separate
commit touching only the registry and say so in the PR).

## Waves

| Wave | Tasks (parallel inside a wave) | Depends on |
|---|---|---|
| 1 | T27 core audit foundation (`logic`) | — |
| 2 | T28 wire core + HR people (`logic`) · T29 wire HR penalties, lateness, payroll (`logic`) · T30 screens (`ui`) | T27 (T30 also the employee-profile layout fix) |
| 3 | T31 verify: full suite, smoke, demo dry run on a copy, entries checked by hand | all |

## T27 — core audit foundation (`logic`) — ✅ done (PR `feature/t27-audit-core`)

- `audit_entries` table + migration + trigger rejecting UPDATE/DELETE (D8); indexes from the spec.
- Request-scoped transactions: `nestjs-cls` + `@nestjs-cls/transactional` (Prisma adapter) (D3);
  `AuditService.record()` writes through the current transaction and throws outside one (D2).
- Actor, IP, user agent, request id from the request context (D4); system/unknown actor allowed.
- Action registry in `packages/shared`: typed keys for every v1 action, module, entity type, and the
  EN/AR sentence templates and field labels (D5). Identical key sets in `en` and `ar`.
- `@Audited(action)` / `@NotAudited(reason)`; the controller-scan test (D6); the run-time check that an
  `@Audited` handler recorded its action (D6b).
- Changed-fields diff with secrets stripped, money in piastres (D7).
- Read API: `GET /audit`, `GET /audit/records/:entityType/:entityId` (filters, server paging).
- Settings history moves in (D9): migration copies `setting_changes` → `audit_entries`;
  `GET /settings/history` keeps its response shape but reads the audit log; the after-commit listener
  is replaced by a transactional `record()` in the settings service; `setting_changes` dropped once the
  copy is verified by a test.
- Every existing write handler gets `@NotAudited('wired in T28/T29')` **only temporarily**, so CI
  stays green; T28/T29 replace each one. The scan test lists them; T31 fails if any remain.

**Edge cases:** spec 1, 2, 3, 4, 8, 9, 10, 11, plus: an `@Audited` handler that throws records
nothing and still returns its own error; a request with no signed-in user (sign-in) records a null
actor; two writes in one request record two entries in order; a diff of equal values is empty.

## T28 — wire core + HR people (`logic`)

Auth (sign in, sign out, failed sign-in — spec 5), school settings, logo, stages; employees (create,
edit, deactivate, reactivate), departments, job titles, HR settings, penalty catalogue. One test per
action: the entry exists with the right action, record, actor and changed fields; a rolled-back
change leaves none.

**From T27:** HR settings are already recorded (`hr.settings.update`) by core's
`SettingsService.setValues`, in the write's transaction; to switch the handler to `@Audited`, make
the no-change path call `setValues` too (or `record()` with no changes). Stages, lists and the
catalogue still reach the log through core's temporary `SettingsHistoryListener` (after commit, own
transaction, history-key + whole-snapshot change, so Settings history reads as before): record them
in the write's transaction instead, then delete the listener and its `settings.changed` emits.
Repositories written to in an audited request must move to `TransactionHost` (`txHost.tx`).

## T29 — wire HR penalties, lateness, payroll (`logic`)

Penalties (record, approve, cancel); lateness month save (one entry, changed employees only — spec
7); payroll run create, recalculate, approve (one entry with totals — spec 6), adjustment add/remove.
Same tests as T28.

**From T27:** same repository move as T28. The HR repositories that open their own `$transaction`
(penalty records, payroll runs, lateness, employees) must switch to `txHost.withTransaction` so the
audit entry joins them.

## T30 — screens, option B (`ui`)

- Sidebar: new **Administration** group with Settings and **Activity**.
- Activity page: day-grouped timeline, sentence entries, inline first changes + "n more", filters
  side panel (date range, module switch, action chips, searchable person picker, today-at-a-glance),
  search, server paging 10 per page, empty state, skeleton matching the timeline; phone: filters
  behind one button.
- Employee profile **History** tab (inside the shared `[id]/layout.tsx`): the same timeline grouped
  by month, field and person filters.
- Settings → Change history unchanged for the user, on the audit API.
- EN/AR, RTL, phone + desktop. Smoke spec: make a change, see it on Activity and on the History tab.

**From T27:** entries of the settings actions keep the old history format — one change per key, the
field being the setting key (`school.workStart`) or the history key (`hr.departments`,
`lists.stages.<id>`) with whole snapshots — and `GET /settings/history` returns the old shape.
Field labels: `audit.fields.<field>` (stage keys: strip the id, use `fields.lists.stages`).

## T31 — verify

`pnpm ci:local --full`; no `@NotAudited('wired in …')` left; smoke; `DEMO_SCRIPT.md` updated for the
Activity page and dry-run on a copy; spot-check 10 entries by hand against what was done.
