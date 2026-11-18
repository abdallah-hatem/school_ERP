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

## T28 — wire core + HR people (`logic`) — ✅ done (PR `feature/t28-audit-wiring`, Abdallah)

Done: sign-in, sign-out and failed sign-in (own transaction, the typed email as the record — no
account hint); employees (create, edit, deactivate, reactivate, photo upload / removal) with id
fields stored by name; HR settings through core's `setValues` on every save; the scan test now
expects no `wired in T28`. Stages, lists and the catalogue: #105 (settings history in the write's
transaction). Users, roles and password changes were already wired (P2).

Auth (sign in, sign out, failed sign-in — spec 5), school settings, logo, stages; employees (create,
edit, deactivate, reactivate), departments, job titles, HR settings, penalty catalogue. One test per
action: the entry exists with the right action, record, actor and changed fields; a rolled-back
change leaves none.

**Record names in both languages (UI audit fix, `fix/activity-ui`):** pass the record's two names as
the label — `entity: { type, id, label: { en: employee.nameEn, ar: employee.nameAr } }` (likewise
departments, job titles, penalty groups, violations, stages). Only records with one name (a user's
email, a payroll month `2026-11`) pass a string. Core's `historyAuditTarget` already does this for the
lists and catalogue; when T28 moves them off `SettingsHistoryListener`, keep passing both names.

**From T27:** HR settings are already recorded (`hr.settings.update`) by core's
`SettingsService.setValues`, in the write's transaction; to switch the handler to `@Audited`, make
the no-change path call `setValues` too (or `record()` with no changes). Stages, lists and the
catalogue still reach the log through core's temporary `SettingsHistoryListener` (after commit, own
transaction, history-key + whole-snapshot change, so Settings history reads as before): record them
in the write's transaction instead, then delete the listener and its `settings.changed` emits.
Repositories written to in an audited request must move to `TransactionHost` (`txHost.tx`).
**Done for stages, lists and the catalogue** (`fix/settings-history-in-transaction`): they record
through `SettingsHistory.record()` in their write's transaction, their repositories use `txHost.tx`,
their ten endpoints are `@Audited`, and the listener is deleted.

## T29 — wire HR penalties, lateness, payroll (`logic`)

Penalties (record, approve, cancel); lateness month save (one entry, changed employees only — spec
7); payroll run create, recalculate, approve (one entry with totals — spec 6), adjustment add/remove.
Same tests as T28. Labels: `{ en, ar }` where the record has two names (a penalty → the employee's
two names); the payroll run and lateness month are a month string (see T28's note).

**From T27:** same repository move as T28. The HR repositories that open their own `$transaction`
(penalty records, payroll runs, lateness, employees) must switch to `txHost.withTransaction` so the
audit entry joins them.

## T30 — screens, option B (`ui`) — ✅ done (PR `feature/t30-audit-screens`)

- Sidebar: new **Administration** group with Settings and **Activity**.
- Activity page: day-grouped timeline, sentence entries, inline first changes + "n more", filters
  side panel (date range, module switch, action chips, searchable person picker, today-at-a-glance),
  search, server paging 10 per page, empty state, skeleton matching the timeline; phone: filters
  behind one button.
- Employee profile **History** tab (inside the shared `[id]/layout.tsx`): the same timeline grouped
  by month, field and person filters.
- **Settings → Change history is removed** (owner, 2026-11-17): the section becomes a "View change
  history" link opening Activity filtered to Settings; delete the section, its API call and its
  tests (`GET /settings/history` goes too, once nothing uses it).
- Each entry shows the actor beside the sentence (T27 sentences leave the actor out).
- EN/AR, RTL, phone + desktop. Smoke spec: make a change, see it on Activity and on the History tab.

**From T27:** entries of the settings actions keep the old history format — one change per key, the
field being the setting key (`school.workStart`) or the history key (`hr.departments`,
`lists.stages.<id>`) with whole snapshots — and `GET /settings/history` returns the old shape.
Field labels: `audit.fields.<field>` (stage keys: strip the id, use `fields.lists.stages`).

## T31 — verify

`pnpm ci:local --full`; no `@NotAudited('wired in …')` left; `SettingsHistoryListener` and the
`settings.changed` history path are gone; smoke; `DEMO_SCRIPT.md` updated for the
Activity page and dry-run on a copy; spot-check 10 entries by hand against what was done.

**From T30:**
- ~~The smoke's employee History check asserts the empty state (`TODO(T28)`)~~ — done in T28: the
  specs edit the employee's grade and assert the entry at the top; the skeleton spec compares the
  History tab's pagination too (no more `data-skeleton-optional`).
- ~~`entityLabel` is one snapshot string~~ — done in `fix/activity-ui`: labels keep both names
  (`{ en, ar }`, column `entity_label_ar`); see T28's note for how callers pass them.
- ~~Employee field changes holding ids show the raw value~~ — done in T28: `departmentId`,
  `jobTitleId`, `stageId` and `managerId` are stored as `{ nameEn, nameAr }`.
- A penalty's entries are on the penalty, not on the employee: the employee History shows only
  `entityType=employee`. If penalties should appear there, record them with a link to the employee.
- "Open record" for a penalty goes to the Penalties list (there is no penalty page).
- The payroll run page has no History tab yet; `RecordHistoryScreen` (`core/audit/screens.tsx`) is
  ready for it.
