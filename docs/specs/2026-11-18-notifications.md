# Spec — Notifications (core mechanism, HR types)

Date: 2026-11-18 · Mode: build-software feature mode, guided · Business: §11 (new), §2, §4, §5, §6,
§7, §9 · Plan: `docs/plans/2026-11-18-notifications-plan.md` · Mockups:
`design/mockups/notifications.html` (three options, **owner to pick** before any screen is built).

Status: **draft for the owner.** No code until the owner approves this spec and picks a mockup
(CLAUDE.md rule 9: a new navigation element and a new panel are a design change).

Owner decisions (2026-11-18) this spec is built on:

- **Channel: in-app bell only** for now — an unread count and a list inside the ERP. Email, WhatsApp
  and SMS must be addable later as channels **without touching the modules that send**.
- **Recipients: staff users now, parents later.** A recipient must be able to become a parent or
  student contact later; only users are built.
- **First events:** **approvals waiting** (a penalty waiting for approval, a payroll month ready to
  approve — to whoever may approve, respecting `own_stage` / `own_team`) and **scheduled reminders**
  (contract or probation ending soon, lateness not entered for the month, payroll not run by a date)
  on the scheduled-jobs foundation in `apps/api/src/core/jobs/` (PR
  `feature/login-rate-limit-and-jobs`).
- **Preferences: per person, per type, per channel**; the school sets defaults in Settings; some
  types can't be turned off.

Markers as in `docs/BUSINESS_LOGIC.md`: **DECIDED** (owner), **GUESS** (our default, to confirm),
**OPEN** (not decided; the build doesn't depend on it, or the plan says which task waits).

## Why

Approvals stall because the approver doesn't know something is waiting: a stage head records a
penalty and the principal finds it days later; a payroll draft sits ready while the HR manager
waits to be told. Deadlines slip the same way — a contract ends, a month's lateness was never
entered, payroll isn't prepared by the day the bank needs it. Today the only way to know is to open
each screen and look.

## What it is

- One **notification** per recipient per event: a short sentence ("Penalty for Omar Khalil is
  waiting for your approval"), when it happened, and a link to the record.
- A **bell** in the app's top bar with the number of unread notifications, opening the list.
  Read / unread, mark all read, open the record.
- **Preferences** per person (My account → Notifications) and **school defaults** (Settings →
  Notifications), per type and per channel.
- **Not** the audit log (§9) and **not** app logging. See "Notifications and the audit log".

## Users and roles

| Who | What they get / can do |
|---|---|
| Every signed-in user | Their own notifications only; read / unread; mark all read; their own preferences. Nobody can see another person's notifications — not even the System admin. DECIDED (follows "per person") |
| Approvers of penalties (today: HR manager, principal, System admin — §2 GUESS) | "Penalty waiting for approval" for each pending penalty of an employee **inside their scope** of `hr.penalties.approve` |
| Approvers of payroll (today: HR manager, System admin) | "Payroll ready to approve", "Payroll not approved yet" |
| Payroll preparers (today: HR officer, HR manager, System admin) | "Payroll not prepared yet" |
| Lateness editors (today: HR officer, HR manager, System admin) | "Lateness not entered" |
| Employee editors (today: HR officer, HR manager, System admin) | "Contract ends soon", "Probation ends soon" — for employees inside their scope |
| Holders of the new permissions **View / Manage notification settings** (`core.notifications.view`: System admin and HR manager; `core.notifications.manage`: System admin — GUESS) | Settings → Notifications: the school's defaults per type and channel and the retention (read-only with view only) |
| Whoever may change HR rules (`hr.settings.edit`) | The reminder timings (days before a contract ends, the check days of the month) — they are HR rule settings (§7) |
| Parents / students | **Planned.** The recipient model allows a contact; nothing is built for them |

Recipients are chosen by **permission and scope**, never by role name: a custom role holding
`hr.penalties.approve` at `own_stage` gets its stage's penalty approvals, with no code change.

## Decisions

| # | Decision | Why |
|---|---|---|
| N1 | **`core/notifications` owns the mechanism**: tables, the recipient resolver, preferences, channels, the bell API, retention. **Each module owns its types** (keys, texts, deep links, who receives them) and sends through core's exported `NotificationsService` — never through core's repository. Core never imports a module. | Core is at the bottom of the module order (`docs/ARCHITECTURE.md` → Module order), so every module may call it; the dependency only points down. |
| N2 | Types are typed keys in `packages/shared/src/notifications.ts` (`NOTIFICATION_TYPES`), `<module>.<thing>.<event>` (`hr.penalty.awaiting_approval`), each with: module, category (`approval` / `reminder`), whether it can be turned off, its default channels, the permission its recipients need, and how its link is built. EN / AR texts in `locales/<lang>/notifications.json`. A missing text in either language fails the shared tests. | Same pattern as audit actions and permissions: typos fail typecheck, both languages always exist. |
| N3 | A notification stores the **type key and its values** (names in both languages as they were, counts, month), never a sentence. The sentence is drawn at read time in the reader's language, with plural forms (Arabic zero / one / two / few / many / other). | A language switch shows every notification, old ones included, in the new language — as the audit log does (§9). |
| N4 | **Sending is part of the change**: `notify()` writes the notification rows **in the current request transaction** (the change and its notifications commit or roll back together). Sending to an outside channel (later) happens **after the commit**, from the delivery rows (an outbox): a job picks up pending deliveries. | No "waiting for approval" for a penalty that rolled back; no lost notification when the process dies between commit and send; an outside channel can't slow down or fail the request. |
| N5 | **Recipients are resolved by core** from a permission and an optional subject: active users who hold the permission (any role, widest scope), minus the person who caused the event (GUESS: you aren't told about your own action). For a scope other than `all`, core asks the module that owns the subject whether the user's scope covers it, through a **`NotificationScopeResolver`** the module registers at start-up (HR: "is employee X in this user's stage / team?") — the same pattern as `AuditRecordAccess`. A scoped user with no linked employee receives nothing scoped. | Core can't know what "my team" means (R5), and must not import HR. |
| N6 | **Recipient is polymorphic**: `recipient_kind` (`user` now; `contact` Planned for parents / students) + `recipient_id`. Only `user` is built; the API, the bell and preferences are for users. | Parents later without reshaping the table. |
| N7 | **Channels are adapters** behind one interface (`NotificationChannel`: key, `send(delivery)`), registered in core. `in_app` is the only one built. Adding email / WhatsApp / SMS later = a new adapter + its key in `NOTIFICATION_CHANNELS` + its school setting (sender, credentials); no module changes, because modules never name a channel. | The owner's "add channels later without touching the modules". |
| N8 | **One delivery row per notification per enabled channel** (`notification_deliveries`: channel, status `pending` / `sent` / `failed` / `skipped`, attempts, last error, sent at). `in_app` is `sent` at once. A channel that is switched off for the person at send time gets no row. | One place to see what reached whom; retries for outside channels later. |
| N9 | **Dedupe by key**: a notification carries a `dedupe_key` built by its type (`contract_end:<employeeId>:<contractEnd>`, `lateness_missing:<month>`, `penalty:<penaltyId>`); a unique index on `(recipient_kind, recipient_id, type, dedupe_key)` makes a second send a no-op (`ON CONFLICT DO NOTHING`). | A reminder is never sent twice for the same thing — across restarts, two containers, a job run twice, or a retried request. |
| N10 | **Approvals resolve**: when the thing waiting is done (penalty approved or cancelled; run approved), the module calls `resolve(type, subject)`: every open notification for that subject, **for every recipient**, is marked resolved (who and when) and stops counting as unread. It stays in the list, greyed, reading "Approved by Laila Hassan". | The other approvers stop seeing a "waiting" that someone else already handled. |
| N11 | **Access is checked again when reading**: the list and the count re-check each approval / reminder against the reader's current permissions and scope (the same resolver as N5). A notification the reader may no longer see is **left out** of the list and the count (not deleted). Opening its link goes to the record's page, which answers "This page isn't here" like any record outside their scope (§2). | Losing a permission or a scope change must not leave names or counts behind in the bell. |
| N12 | The **bell polls**: the unread count every 60 seconds while the tab is visible, and on focus. GUESS. Live push (server-sent events) is Planned if polling proves too slow. | Simple, cacheless (every page is per-user, CLAUDE.md rule 7), fine for a school's numbers. |
| N13 | **Preferences**: effective = the type can't be turned off → on; else the person's own choice for that type and channel, if any; else the school's default; else the type's default. A person can only switch a channel the school has turned on (a channel not set up — email today — is shown "Coming soon"). | "Per person, per type, per channel; the school sets defaults; some types can't be turned off." |
| N14 | **Retention** (GUESS, settings): read notifications are deleted 90 days after they were read, resolved ones 30 days after they were resolved, and any notification after 365 days; a nightly job does it. Delivery rows go with their notification. | Notifications are a to-do list, not a record; the audit log is the record (§9). |
| N15 | **Reminder rules are HR settings** (module rule settings live in their module): days before a contract ends, days before probation ends, the probation length, the lateness check day, the payroll check day. They are shown in Settings → Notifications next to the school defaults (one screen), but saved and audited as HR rules. | ARCHITECTURE → "Module rule settings live in their module". |
| N16 | Reminders run from **one daily HR job** on the jobs foundation (07:00 school time, Africa/Cairo), protected by its advisory lock, logged in `job_runs`. The job is idempotent: it finds everything due **today or overdue** and sends with dedupe keys, so a missed day (server down) is caught up the next day, never twice. | Owner: reminders run on the jobs foundation; dedupe makes catch-up safe. |

## Entities

Business terms; the tables are a sketch for the plan.

### Notification type (catalogue, in code)

| Field | Meaning |
|---|---|
| key | `hr.penalty.awaiting_approval`, … |
| module | `hr` (later `fees`, `exams` …) |
| category | `approval` (something waits for the reader; resolves when done) or `reminder` (something is due) |
| can be turned off | yes / no (no → always on in-app; other channels still optional) |
| default channels | `in_app` on; others off |
| recipient permission | the permission the reader must hold (and whose scope must cover the subject) |
| link | the screen and record it opens |
| texts | title + body per language, with plural forms |

### Notification (one per recipient)

`id`, `type`, `recipient_kind` + `recipient_id`, `subject` (`entity_type`, `entity_id`, and
`employee_id` when the subject is about one employee — used for the scope re-check), `params`
(jsonb: the values for the sentence — names `{ en, ar }`, month, counts, dates), `dedupe_key`,
`batch_key` (the job run or request that made it: the list can collapse "12 contracts end soon"
from one run into one row), `actor_id` (who caused it; null for a reminder), `created_at`,
`read_at`, `resolved_at`, `resolved_by_name` (snapshot, `{ en, ar }`), `resolution`
(`approved` / `cancelled` / `done`).

Indexes: `(recipient_kind, recipient_id, created_at desc)`; partial `(recipient_kind,
recipient_id) where read_at is null and resolved_at is null` (the count); `(type, entity_type,
entity_id) where resolved_at is null` (resolve); unique `(recipient_kind, recipient_id, type,
dedupe_key)`.

### Delivery (one per notification per channel)

`notification_id`, `channel`, `status`, `attempts`, `last_error`, `sent_at`. Unique
`(notification_id, channel)`.

### Preferences

- **School default** (`notification_defaults`, core-owned): `type`, `channel`, `enabled`. Missing
  row → the type's default.
- **Personal** (`notification_preferences`): `user_id`, `type`, `channel`, `enabled`. Missing row
  → the school default. "Reset to school default" deletes the row.
- A type that can't be turned off ignores both for `in_app` (the switch is shown locked with
  "Required").

## The first types

| Key | Category | Off allowed? | To whom (permission, scope) | Sent when | Resolved when | Link | Dedupe key |
|---|---|---|---|---|---|---|---|
| `hr.penalty.awaiting_approval` | approval | **No** (GUESS) | `hr.penalties.approve` covering the employee | A penalty is recorded (pending) | It is approved or cancelled (by anyone) | Penalties, opened on that penalty | `penalty:<id>` |
| `hr.payroll.ready_to_approve` | approval | **No** (GUESS) | `hr.payroll.approve` (all) | A draft run is created or recalculated **and** the month has no pending penalties | The run is approved — or a pending penalty appears in the month again (then it's no longer ready; it is sent again when it is) | The payroll run | `payroll_ready:<month>:<calc #>` GUESS: one per calculation that makes it ready |
| `hr.contract.ending_soon` | reminder | Yes | `hr.employees.edit` covering the employee | An active employee's contract ends within **30 days** (setting) | The contract end moves out of the window, or the employee is deactivated | The employee's profile | `contract_end:<employeeId>:<contractEnd>` |
| `hr.probation.ending_soon` | reminder | Yes | `hr.employees.edit` covering the employee | An active employee's probation (hire date + **3 months**, setting) ends within **7 days** (setting) | The date passes, or the employee is deactivated | The employee's profile | `probation_end:<employeeId>:<probationEnd>` |
| `hr.lateness.not_entered` | reminder | Yes | `hr.lateness.edit` (all) | On or after day **25** (setting) of the month, the month's lateness has never been saved | The month's lateness is saved, or its payroll is approved | Lateness, that month | `lateness_missing:<month>` |
| `hr.payroll.not_prepared` | reminder | Yes | `hr.payroll.create` (all) | On or after day **28** (setting) of the month, the month has no payroll run | A run is created | Payroll | `payroll_missing:<month>` |
| `hr.payroll.not_approved` | reminder | Yes | `hr.payroll.approve` (all) | On or after day **28** (setting), the month's run is still a draft | The run is approved | The payroll run | `payroll_unapproved:<month>` |

- **GUESS** — Approval types can't be turned off in-app: the approval chain depends on them.
  Reminders can.
- **GUESS** — The person who caused the event isn't notified about it (an HR manager who records
  a penalty and may approve it gets no "waiting" for it).
- **GUESS** — One notification **per penalty**, not one digest ("5 penalties waiting"). The list
  collapses rows of one type made by the same run (`batch_key`) into one expandable row. **OPEN**
  (owner): a digest instead?
- **GUESS** — Probation is hire date + 3 months (the legal maximum in Egypt). The employee record has
  no probation field. **OPEN**: does the school use probation, and does it differ per employee
  (then it becomes an employee field)?
- **GUESS** — The lateness and payroll check days are for the **current** month (November's
  lateness is due by 25 November, its payroll by 28 November). A day past the month's end means its
  last day (31 → 28 February). **OPEN**: the real dates the school works to.
- **GUESS** — "Lateness entered" means the month was saved at least once, even with all zeros.
- **GUESS** — Contract end: 30 days before; probation: 7 days before. Since every contract ends
  on 31 May by default (§3), on 1 May each employee editor gets one reminder per employee — the
  collapsed row reads "38 contracts end within 30 days". **OPEN**: a second reminder closer to the
  date (e.g. 7 days)?
- **Planned** — More types belong to their modules as they are built: leave requests (direct
  manager, then HR manager), fees overdue (parents, later), exam marks missing, etc.

### Payroll "ready to approve" in detail

Sent from HR's payroll service inside the create / recalculate transaction when the month then has
no pending penalties. A penalty recorded later in that month resolves it (`done`) — the month is
not ready any more; the next recalculate that finds no pending penalties sends it again with a new
dedupe key. Approving the run resolves it as `approved`.

## Flows

### 1. An event to the bell

1. A module's service does its change in a transaction (e.g. HR records a penalty).
2. In the same transaction it calls `notifications.notify({ type, subject, params, dedupeKey,
   actorId })`.
3. Core resolves recipients (N5): active users holding the type's permission; scope checked by the
   registered resolver for that subject; the actor left out.
4. For each recipient: one notification row (`ON CONFLICT DO NOTHING` on the dedupe key), then one
   delivery row per channel enabled for that person (N13). `in_app` → `sent`.
5. Commit. Nothing is sent outside the app now; later channels pick their `pending` deliveries up
   from a job after the commit (N4).
6. The recipient's bell shows the new count on its next poll (≤ 60 s) or when the tab gets focus.

If the change fails, nothing is notified (same transaction). If a recipient lookup fails, the
change fails too (GUESS: correctness over availability, as the audit log). Zero recipients is fine
(nothing written): e.g. nobody holds the permission yet.

### 2. A reminder

1. The HR job `hr.reminders.daily` runs at 07:00 Cairo time (jobs foundation: advisory lock, one
   container wins; logged in `job_runs`).
2. It works out **today in the school's time zone**, then for each reminder type finds what is due
   today or overdue and not resolved (contracts ending within N days; months past their check day
   without lateness / run / approval).
3. It calls `notify()` per subject with its dedupe key; already-sent ones are no-ops (N9).
4. It resolves reminders whose condition no longer holds (contract renewed, lateness saved …),
   besides the module resolving them at the moment of the change.

### 3. Reading

- **Bell**: the number of unread, unresolved notifications the reader may still see (N11). Over 99
  → "99+".
- **List**: newest first, server-paged (20 per page), filter All / Unread, and by category (Needs
  action / Reminders). Each row: icon of its type, the sentence in the reader's language, how long
  ago ("3 min ago", "Yesterday 14:20" — school time zone), unread dot, resolved line.
- **Open** a notification → it is marked read and the app goes to its link. A link the reader
  can't open, or a record that no longer exists, shows the shell's "This page isn't here" —
  never anything from the record (§2). (HR records are never deleted, but the rule holds for later
  modules.)
- **Mark read / unread** one; **Mark all as read** — every unread notification of the reader
  created up to the moment the list was loaded (the request sends that moment, so one that arrives
  meanwhile stays unread).

### 4. Preferences

- **My account → Notifications** (every user): the types the person can receive (they hold the
  permission), grouped by module, with a switch per channel. `in_app` today; email, WhatsApp, SMS
  shown as "Coming soon". A type that can't be turned off shows a locked switch and "Required". A
  switch that differs from the school default shows "Reset to school default".
- **Settings → Notifications** (`core.notifications.view` to see it, read-only; `core.notifications.manage`
  to change it — GUESS: System admin changes, HR manager sees): the school default per type and channel; under it, the HR
  reminder timings (HR rule settings, `hr.settings.edit`).
- Turning a type off stops **new** notifications of that type on that channel; it doesn't delete
  those already received.

## Reminder settings (HR rules, §7)

| Setting | Default | Range | Source |
|---|---|---|---|
| Remind before a contract ends | 30 days | 1–120 | GUESS |
| Probation length | 3 months | 0 (no probation reminders) – 6 | GUESS |
| Remind before probation ends | 7 days | 1–60 | GUESS |
| Lateness check day (of each month) | 25 | 1–31 (past the month's end = its last day) | GUESS |
| Payroll check day (of each month) | 28 | 1–31 (same) | GUESS |

Core settings (Settings → Notifications): read notifications kept **90 days**, resolved **30 days**,
everything at most **365 days** (GUESS); the school's default per type and channel.

Changing a timing affects the next daily run only. A reminder already sent stays; one whose
condition no longer holds under the new timing is not withdrawn (GUESS — simpler; it resolves when
its own condition clears).

## Text (EN / AR, with plurals)

Stored as the type key + values; the web app draws them with the shared locale files. Names are
the snapshot in the reader's language. Arabic uses all six plural forms (`zero`, `one`, `two`,
`few`, `many`, `other`), as the existing counts do (`auth.json`).

| Type | English | Arabic |
|---|---|---|
| `hr.penalty.awaiting_approval` | **Penalty waiting for your approval** — {employee} · {violation}, level {level} | **جزاء في انتظار اعتمادك** — {employee} · {violation}، المرة {level} |
| — resolved | Approved by {name} / Cancelled by {name} | اعتمده {name} / ألغاه {name} |
| `hr.payroll.ready_to_approve` | **{month} payroll is ready to approve** — {count, plural, one {# employee} other {# employees}}, net {net} | **رواتب {month} جاهزة للاعتماد** — {count, plural, zero {لا موظفين} one {موظف واحد} two {موظفان} few {# موظفين} many {# موظفًا} other {# موظف}}، الصافي {net} |
| `hr.contract.ending_soon` | **{employee}'s contract ends {date}** — {days, plural, one {in # day} other {in # days}} | **ينتهي عقد {employee} في {date}** — {days, plural, zero {اليوم} one {بعد يوم واحد} two {بعد يومين} few {بعد # أيام} many {بعد # يومًا} other {بعد # يوم}} |
| — collapsed batch | {count, plural, one {# contract ends} other {# contracts end}} within {days} days | {count, plural, one {ينتهي عقد واحد} two {ينتهي عقدان} few {تنتهي # عقود} many {ينتهي # عقدًا} other {ينتهي # عقد}} خلال {days} يومًا |
| `hr.probation.ending_soon` | **{employee}'s probation ends {date}** | **تنتهي فترة اختبار {employee} في {date}** |
| `hr.lateness.not_entered` | **{month} lateness isn't entered yet** — payroll needs it | **لم يُدخَل تأخير شهر {month} بعد** — الرواتب تحتاج إليه |
| `hr.payroll.not_prepared` | **{month} payroll hasn't been prepared** | **لم يُعَدّ مسير رواتب {month} بعد** |
| `hr.payroll.not_approved` | **{month} payroll is still a draft** | **مسير رواتب {month} ما زال مسودة** |
| Bell | {count, plural, =0 {No unread notifications} one {# unread notification} other {# unread notifications}} | {count, plural, zero {لا إشعارات غير مقروءة} one {إشعار واحد غير مقروء} two {إشعاران غير مقروءين} few {# إشعارات غير مقروءة} many {# إشعارًا غير مقروء} other {# إشعار غير مقروء}} |

Money in a sentence goes through `formatMoney` (salary-type: the payroll-ready sentence shows the
net only to a reader who may see the run totals — every holder of `hr.payroll.approve` today; the
value is left out of `params` for anyone else, GUESS). Months read "November 2026" / "نوفمبر 2026";
figures are Latin digits in both languages (DESIGN.md).

## API (contract)

Envelope as everywhere (`ApiResponse<T>`; lists put `Paginated` paging in `meta`). Every route is
for the signed-in user's own notifications: the recipient comes from the token, never a parameter;
another person's notification id answers **404** (not 403).

| Route | Declared | Body / query | `data` |
|---|---|---|---|
| `GET /notifications` | `@SignedIn()` | `page`, `limit` ≤ 50 (default 20), `status=all\|unread`, `category=approval\|reminder` | `NotificationItem[]` + `meta` |
| `GET /notifications/unread-count` | `@SignedIn()` | — | `{ count: number }` |
| `POST /notifications/:id/read` | `@SignedIn()`, `@NotAudited('personal read state, not school data')` | — | `NotificationItem` |
| `POST /notifications/:id/unread` | same | — | `NotificationItem` |
| `POST /notifications/read-all` | same | `{ upTo: IsoDateTime }` | `{ updated: number }` |
| `GET /notifications/preferences` | `@SignedIn()` | — | `NotificationPreferences` |
| `PUT /notifications/preferences` | `@SignedIn()`, `@Audited('core.notification_preferences.update')` | `{ items: { type, channel, enabled: boolean \| null }[] }` (`null` = back to the school default) | `NotificationPreferences` |
| `GET /settings/notifications` | `@Permission('core.notifications.view')` GUESS (System admin, HR manager) | — | `NotificationSettings` |
| `PUT /settings/notifications` | `@Permission('core.notifications.manage')`, `@Audited('core.notification_settings.update')` | `{ defaults?: { type, channel, enabled }[]; retention?: { readDays, resolvedDays, maxDays } }` | `NotificationSettings` |
| HR reminder timings | existing `GET / PUT /hr/settings` (new keys under `hr.reminders.*`, `hr.settings.edit`, already `@Audited('hr.settings.update')`) | `{ reminders: { contractEndDays, probationMonths, probationEndDays, latenessCheckDay, payrollCheckDay } }` | the HR settings |

Shared types (`packages/shared/src/types/notifications.ts`):

```ts
type NotificationChannel = 'in_app' | 'email' | 'whatsapp' | 'sms';     // only in_app is live
type NotificationCategory = 'approval' | 'reminder';

interface NotificationItem {
  id: Uuid;
  type: NotificationTypeKey;            // 'hr.penalty.awaiting_approval'
  module: string;                       // 'hr'
  category: NotificationCategory;
  params: Record<string, unknown>;      // names as { en, ar }, month, counts, dates
  link: { screen: ScreenId; recordId?: Uuid; query?: Record<string, string> } | null;
  batchKey: string | null;
  batchSize: number;                    // > 1: the list may collapse the batch
  createdAt: IsoDateTime;
  readAt: IsoDateTime | null;
  resolved: { at: IsoDateTime; by: { en: string; ar: string } | null;
              resolution: 'approved' | 'cancelled' | 'done' } | null;
}

interface NotificationPreferences {
  channels: { channel: NotificationChannel; available: boolean }[];   // available = set up for the school
  types: {
    type: NotificationTypeKey; module: string; category: NotificationCategory;
    canTurnOff: boolean;
    channels: { channel: NotificationChannel; enabled: boolean; schoolDefault: boolean;
                personal: boolean | null; locked: boolean }[];
  }[];                                   // only the types the user can receive (holds the permission)
}

interface NotificationSettings {
  channels: { channel: NotificationChannel; available: boolean }[];
  defaults: { type: NotificationTypeKey; channel: NotificationChannel; enabled: boolean;
              locked: boolean }[];
  retention: { readDays: number; resolvedDays: number; maxDays: number };
}
```

Errors: `NOTIFICATION_TYPE_REQUIRED` (409, turning off a type that can't be), `CHANNEL_NOT_AVAILABLE`
(409, a channel the school hasn't set up), `VALIDATION_FAILED` (400). Unknown type keys in the body
→ 400.

Core's exported service (for modules, not HTTP):

```ts
notify(input: { type; subject: { entityType; entityId; employeeId? }; params; dedupeKey;
                actorId?: Uuid | null; batchKey?: string }): Promise<{ created: number }>;
resolve(input: { type; subject: { entityType; entityId }; resolution; byUserId?: Uuid | null }):
  Promise<{ resolved: number }>;
registerScopeResolver(entityType: string, resolver: NotificationScopeResolver): void;
```

`notify()` and `resolve()` run in the current transaction and throw outside one (like
`audit.record()`); a job opens its own.

## Where it lives (module order)

```
core/notifications   ← mechanism (tables, NotificationsService, channels, recipient resolver, bell API)
  ↑  (exported service + NotificationScopeResolver registry)
hr                   ← its types' keys, texts and links (shared), calls notify()/resolve() in its
                        services, registers the employee scope resolver, owns the reminder job and
                        its timing settings
  ↑
later modules        ← the same: own types, call core
```

- Area order inside core: `audit` ← `permissions` ← `roles` ← `users` ← **`notifications`** ←
  `auth` (notifications reads users and permissions; nothing in core depends on it). GUESS.
- The web app: `apps/web/src/core/notifications` (the bell in the app shell's top bar, the list,
  the preferences tab on My account, the Settings section). Types' texts and link builders are in
  `packages/shared`, so the web app needs no module code to draw them.
- `dependency-cruiser` already forbids core → modules; the new folder is covered.

## Notifications and the audit log

- **A notification is not an audit entry.** The audit log (§9) is the permanent, append-only record
  of changes; notifications are personal, deletable reminders of things to do. Nothing reads one to
  answer "who changed this".
- The change that **causes** a notification is audited as today (recording a penalty is
  `hr.penalty.record`); sending its notifications adds nothing to the log.
- Reading, marking read and mark-all-read are **not** recorded (`@NotAudited` with the reason:
  personal read state).
- Changing **one's own preferences** and the **school defaults / retention** are writes to settings
  and are `@Audited` (`core.notification_preferences.update`, `core.notification_settings.update`);
  the reminder timings are HR rules (`hr.settings.update`).
- The retention job deleting old notifications is not audited (no school data changes).

## Edge cases (with expected outcome)

1. A user loses `hr.penalties.approve` (role edited) → their open "waiting" notifications leave the
   list and the count on the next request; new ones aren't sent to them. Opening an old link →
   "This page isn't here" if they can't see penalties. — N5, N11
2. A stage head-scoped approver's stage changes, or the employee moves stage → re-check at read:
   notifications about employees now outside their scope disappear; the new stage's next events
   reach them. Past events are not re-sent to newly covered people (GUESS). — N11
3. A penalty is approved by the principal → the HR manager's "waiting" for it turns resolved
   ("Approved by …") and leaves the unread count; the same in every recipient's list. — N10
4. The same reminder found by two containers at once, or by the job re-run after a crash → one
   notification (advisory lock + unique dedupe key). — N9, N16
5. The server is down on the 25th → the 26th's run sends the lateness reminder (overdue is due);
   the 27th's sends nothing new. — N16
6. 00:30 Cairo on 1 December (22:30 UTC, 30 November) → "today" is 1 December; November's checks
   use November. — N16
7. The payroll check day is 31 → in February it fires on the 28th (29th in a leap year). — settings
8. A deleted / deactivated employee → open reminders about them resolve; no new ones. Records are
   never deleted in HR; if a later module's record is gone, the link shows "This page isn't here".
9. A type turned off by the person → no new in-app notification of it; existing ones stay. A type
   that can't be turned off → the switch is locked; the API refuses with `NOTIFICATION_TYPE_REQUIRED`.
10. Arabic UI → every notification, old ones included, reads in Arabic with the right plural form
    (1 موظف واحد, 2 موظفان, 3–10 موظفين, 11+ موظفًا). — N3
11. The penalty recording rolls back (e.g. once-per-day refusal) → no notification. — N4
12. The recorder could approve it themself → they get no "waiting" for their own penalty. — N5
13. Mark all as read while a new notification arrives → the new one stays unread (`upTo`). — Flow 3
14. Another user's notification id in `POST /notifications/:id/read` → 404. — API
15. Nobody holds the permission (fresh school) → the change succeeds, nothing is written. — Flow 1
16. A salary-blind approver of penalties (principal) → a payroll sentence never shows a net they
    can't see. — §2, Text

## Proposed business-doc edit

- New **§11 Notifications** (`docs/business/11-notifications.md`): what notifies whom, can't-turn-off
  types, preferences and defaults, reminder timings, dedupe, resolve, access, retention, not the
  audit log.
- **Index** line for §11 in `docs/BUSINESS_LOGIC.md`; a dated line in `00-recent-changes.md`.
- Later, with the build: §7 gets the reminder timings and Settings → Notifications; §2 the new
  permissions (`core.notifications.view` / `.manage`); §8 moves notifications from Planned to Built.

## Out of scope (this version)

- Email, WhatsApp, SMS and push (the channel adapters, sender settings, templates). Planned.
- Parents and students as recipients; a parent portal. Planned.
- Live push to the browser (SSE / WebSocket). Planned.
- Notifications about other modules (leave, fees, exams) — they come with their modules.
- A digest ("daily summary") per person. OPEN.
- Notifying the person a penalty is about (employee self-service is Planned).
- Free-text announcements to staff (the Planned `communication` module, which will send through
  core's notifications).
- Quiet hours, snooze, per-notification "remind me later".

## OPEN questions for the owner

1. **Which mockup** — A, B or C (`design/mockups/notifications.html`)?
2. **Digest or one per item** for penalties waiting (several recorded at once) and contract ends
   (every contract ends 31 May)? Default: one per item, collapsed in the list.
3. **Probation**: does the school use it, is it 3 months for everyone, or a field per employee?
4. **Real dates**: by which day must lateness be entered and payroll be prepared / approved?
   (Defaults 25th and 28th.)
5. **Can approvals be turned off?** Default: no (in-app). Reminders: yes.
6. **Retention**: 90 / 30 / 365 days OK?
7. **Contract reminder**: one at 30 days, or a second one closer to the date?
8. **Who sees Settings → Notifications**: System admin only (default), or HR manager too?
