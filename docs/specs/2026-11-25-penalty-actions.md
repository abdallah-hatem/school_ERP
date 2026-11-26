# Penalty actions — spec (approved by the owner, 2026-11-26)

Owner's request (2026-11-25): make penalty actions dynamic and seed them, and make "what an action
does to pay" dynamic too — a school-managed **Penalty actions** list, each action with **one effect
type** from a fixed set in code and numbers set by the school; **no free formulas**; the seed loads
today's actions exactly, so this school sees no change. Builds on §4 Penalties, §6 Payroll, §7
Settings, §9 Audit and §2 Roles. Status of each rule: DECIDED (the owner's brief above), GUESS (my
default — change it if wrong), OPEN (needs the owner; my default is given and is what gets built if
he doesn't answer). The proposed business-doc edits at the end were applied with the build
(feature/penalty-actions, 2026-11-26).

**Approved as written (owner, 2026-11-26: "Approve, no cap"):** every GUESS below stands, no mockups
(owner, 2026-11-25: "if mockups unnecessary dont do it"), and **no monthly cap** on penalty deductions.

## What exists today

- A catalogue level (§4) holds one **action** from a code enum (`PenaltyAction`: notice, warning,
  deduct days, referral to investigation, loss of half the annual raise, loss of the annual raise,
  raise deferred 3 months, pay cut by one annual raise, demotion, dismissal — **ten** values) and,
  for "deduct days" (required) or "investigation" (optional), a number of **days** in quarter steps.
  The action's names are fixed translations (`common.enums.penaltyAction.*`).
- A penalty copies level, action and days at recording, shows today's catalogue while it waits, and
  fixes them at the HR approval. Only the backdated recount moves an approved one (§4).
- Payroll (§6, `modules/hr/domain/payroll-line.ts`) sums the **days** of every approved deducting
  penalty dated in the month and prices them once: `round(days × salary for the month ÷ 30)`, half
  up to the piastre. Everything else costs 0. The payslip splits the line's penalty amount by days.
- A penalty holds **no money**: it is days, payroll prices them (§9).

The brief says "today's eleven kinds". The code has **ten**; §4 lists "referral to investigation,
optionally with N days" as one action. GUESS: ten rows, with investigation covering both "with" and
"without days" (as today and as the brief's own "Investigation: referral, optionally with days").

## What it adds

1. **A Penalty actions list** in **Settings → Penalty catalogue**, a card above the groups, managed
   like departments and job titles: English and Arabic names, hide / show, never deleted, every
   change audited and in the change history.
2. **Five effect types, fixed in code** — each action has one, chosen when it is added:
   **Record only**, **Deduct days of pay**, **Deduct a % of salary**, **Deduct a fixed amount**,
   **Referral to investigation** (optionally with days deducted).
3. **The numbers live on the catalogue level** (days, %, or EGP), as days do today; the action holds
   only its effect and, for a %, which salary it is a % of.
4. **A full snapshot on the penalty** at approval — the action's names, effect, salary base and
   numbers — so renaming or re-pricing never changes a past penalty or an approved payroll.
5. **Payroll prices each effect** (days as today; % and fixed amounts new), each with its payslip
   label in English and Arabic.
6. **A migration and seed** that turn today's ten enum values into ten rows with the same names, so
   every level, penalty, payslip and audit entry reads exactly as before.

## Decisions

### Where the numbers live — on the level (GUESS, recommended)

| | A. On the action ("Deduct ½ day", "Deduct 1 day" …) | **B. On the level (chosen)** |
|---|---|---|
| Actions list | ~25 rows (¼, ½, ¾, 1, 1¼, 1½, 2 … 5 days, each investigation variant, each %) | 10 rows today: the regulations' own words |
| Level editor | one picker | one picker + one number field — **today's layout** |
| Faithful to the regulations | they say "Deduct" with a number per level; A turns numbers into names | the level reads like the regulation: level 2 = Deduct days, 0.5 |
| Changing a number | add an action, hide the old one, re-pick on every level | edit the number on the level |
| Migration | days move into new action rows; levels re-point | days stay where they are |
| Recount heads-up | "Deduct ½ day → Deduct 1 day" (names) | the same text, from effect + number |

**Pick: B.** The action says *what kind of thing happens*; the level says *how much*. It keeps the
Settings list short and in the regulations' vocabulary, the catalogue editor exactly as it is (the
number field just changes its unit), and the migration trivial. The one qualitative parameter — for
a %, *which salary* — goes on the action ("Deduct % of basic salary"), because it is part of what the
action means, rarely varies per level, and keeps the level row to one number.

### Effect types (DECIDED set; validation GUESS)

| Effect (code) | The level's number | Allowed | Costs pay |
|---|---|---|---|
| `RECORD_ONLY` | none | — | no |
| `DEDUCT_DAYS` | days, **required** | quarter steps, more than 0 and at most 30 (§7's day rule) | yes |
| `DEDUCT_PERCENT` | percent, **required** | more than 0 and at most 100, up to two decimals (0.01 – 100) | yes |
| `DEDUCT_AMOUNT` | amount in EGP, **required** | more than 0 and at most EGP 1,000,000, to the piastre (the salary maximum) | yes |
| `INVESTIGATION` | days, **optional** | as `DEDUCT_DAYS` when given | only with days |

- **DECIDED** — No free formulas. A new effect type is code (a migration and a release).
- **DECIDED** — The raise actions (loss of half the raise, loss of the raise, raise deferred 3 months,
  pay cut by one raise), demotion and dismissal stay **Record only**. **Planned**: when the annual
  raise exists, a "raise" effect type in code, and the seeded raise actions move to it by migration.
- **GUESS** — **The salary base of a %** is one of two, both already named in §6:
  **Salary for the month** (basic salary × work-system %, §6 step 1 — what day deductions are priced
  from) or **Basic salary** (the employee's basic salary, before the part-time %). For a full-time
  employee they are equal. **"Gross" is not offered**: in §10 gross is net + insurance share + income
  tax + martyrs' fund, worked out by accounting *after* HR approves the month *from the net* — a %
  of it would change the net it is computed from. If the owner meant "salary with allowances",
  allowances are Planned (§6); a third base can be added in code then. Default for a new % action:
  **Salary for the month**.
- **GUESS** — An action's **effect and base are fixed once it is added**. Changing them would make
  every level using it invalid or silently re-price waiting penalties. To change what an action does,
  add a new one and hide the old one. Names, order and hidden / shown can change.

### Which salary a % uses — the payroll line's, at its last calculation (GUESS, recommended)

A % penalty stores the **percent**, never money. Payroll prices it from the **salary on the payroll
line of the month the violation happened**, at that run's last calculation — and approving a run
recalculates first (§6), so it is **the salary when that month's payroll is approved**. Why:

- It is how day deductions already work (days × the line's salary ÷ 30): one rule for both.
- The payslip shows that salary beside the deduction; 10% of a different figure would not add up.
- The line already snapshots the basic salary and work system; nothing else needs keeping.
- Pricing at penalty approval would put a salary-derived amount on the penalty, which stage heads
  and direct managers see without salary access (§2) — a leak, and two figures that drift.
- There is no pro-rata or effective date for a salary change (§6 GUESS), so the month has one salary.

### Caps — no cap; the existing net floor stands (DECIDED, owner 2026-11-26)

§4 already has "**OPEN** — Whether a monthly cap on penalty deductions applies under the labour law",
and §6 has the floor: net never goes below 0; a line whose deductions exceed its pay has net 0 and
is flagged **needs review** (`NET_FLOORED`). % and fixed amounts make a large deduction easier to set
up, so the question matters more now. **DECIDED (owner, 2026-11-26): no cap**, the floor and flag
as today, and the payroll line's flag says why ("Deductions exceed this month's pay — net set to
0"). If the owner confirms a legal cap (Egyptian labour law is commonly read as limiting penalty
deductions to five days' pay a month — the school's lawyer should confirm), it becomes an HR rule
in a follow-up: a cap in days of pay per month, the excess not deducted and shown on the payslip.

### Hiding an action that levels still use — they keep it (GUESS)

Like a hidden department (employees keep it, it can't be picked anew), a hidden action is **left out
of the level editor's picker**, and **levels that already use it keep it and keep working**: new
penalties on those levels still get it, and the regulation keeps applying until the school edits
those levels. Hiding asks first when it is in use: "Used on 12 levels in 9 violations. They keep it;
it can't be picked for other levels." Saving a violation whose unchanged level holds a hidden action
is fine; picking a hidden action for a level is refused (`PENALTY_ACTION_HIDDEN`). Shown again, it is
pickable again. Why not refuse hiding while in use: the school would first have to edit dozens of
violations, and hiding exists precisely to stop new use without touching the old.

## Users and permissions — no new key (GUESS)

- **Manage penalty actions** (add, rename, reorder, hide, show) — `hr.penalty_catalogue.manage`
  (existing: HR manager and System admin). The actions are the catalogue's vocabulary and edited
  beside it; a separate key would let someone change what a level does without the right to edit
  the catalogue.
- **See the list** — `hr.penalty_catalogue.view` (existing: HR manager, HR officer, principal, stage
  heads, direct managers and the System admin, §2). Read-only for those without manage (§7: no Add,
  no menus).
- A % or fixed amount on a level or a penalty is **catalogue data, not salary**: shown to whoever
  sees the catalogue or the penalty. The **priced** deduction (EGP taken from this employee) is
  payroll data and follows the payroll and salary rules (§2, §6) as today.
- Roles stay editable by the admin; these are the starting defaults.

## Data

- **New enum `PenaltyEffect`**: `RECORD_ONLY`, `DEDUCT_DAYS`, `DEDUCT_PERCENT`, `DEDUCT_AMOUNT`,
  `INVESTIGATION`. **New enum `PenaltySalaryBase`**: `MONTH_SALARY`, `BASIC_SALARY`.
- **New table `penalty_actions`** — `id`, `code` (text, nullable, unique: the seeded ones' system key
  `NOTICE` … `DISMISSAL`; null for actions the school adds — used only by the seed, the migration
  and the dashboard's chart kinds, never for a rule), `name_en`, `name_ar` (required, up to 100,
  each unique case-insensitively among all actions, hidden ones included), `effect`
  (`PenaltyEffect`), `percent_base` (`PenaltySalaryBase`, required for `DEDUCT_PERCENT`, null
  otherwise — a check constraint), `sort_order`, `is_active`, `created_at`, `updated_at`, and the
  database-kept `search_text` / `search_compact` (docs/ARCHITECTURE.md → Search). Never deleted.
- **`violation_levels`** — `action` (enum) becomes `action_id` (→ `penalty_actions`, `ON DELETE
  RESTRICT`); `days` stays; new `percent` (`numeric(5,2)`, null) and `amount` (int piastres, null).
  Exactly the number the action's effect asks for is set (checked by the shared rule; the API
  refuses anything else).
- **`penalty_records`** — `action` (enum) becomes `action_id` (→ `penalty_actions`, `RESTRICT`)
  plus the **snapshot**: `action_name_en`, `action_name_ar`, `effect`, `percent_base`, `days`
  (exists), `percent`, `amount`. Written at recording, refreshed whenever a waiting penalty is
  shown (today's catalogue, as now), and **fixed at the HR approval**, names included. Only the
  backdated recount rewrites a fixed snapshot (that level's action and numbers from today's
  catalogue — the existing exception). No salary, no priced amount on the penalty.
- **`payroll_lines`** — new `penalty_days_amount` (int piastres, default 0): the day-priced part of
  `penalty_amount` (days of `DEDUCT_DAYS` and `INVESTIGATION`). `penalty_amount` stays the line's
  whole penalty deduction. `penalty_days` stays the days total.
- **Shared** (`packages/shared`): `PenaltyEffect`, `PenaltySalaryBase`, `SEEDED_PENALTY_ACTIONS`
  (code, effect, names in EN / AR — generic regulation words, not client material);
  `levelValueProblem(effect, level)` replacing `levelDaysProblem`; `PenaltyAction` (the enum
  constant) is kept only as the seeded **codes**, and `common.enums.penaltyAction.*` stays in both
  locales so audit entries and change history written before the move still read (the log is never
  rewritten, §9).

## Payroll — how each effect becomes a deduction (GUESS; the rounding is §6's)

For one employee's line in month M (penalties **approved** and **dated in M**, as today):

1. **Days part** = `round(Σ days × salary for the month ÷ divisor)` — the days of every
   `DEDUCT_DAYS` and `INVESTIGATION`-with-days penalty, summed in quarters, priced **once**
   (unchanged). Stored as `penalty_days_amount`.
2. **% part** = for **each** `DEDUCT_PERCENT` penalty, `round(base × percent ÷ 100)`, where base is
   the line's **salary for the month** or its **basic salary** (the line's snapshot), each rounded
   half up to the piastre on its own, then summed. Integer maths: `base × hundredths-of-a-percent ÷
   10,000`. Example: 2.5% of 9,999.99 → 999,999 × 250 ÷ 10,000 = 24,999.975 → **EGP 250.00**.
3. **Fixed part** = Σ `amount` of each `DEDUCT_AMOUNT` penalty (already piastres; no rounding).
4. **Penalty deductions** (`penalty_amount`) = days part + % part + fixed part.
5. **Net** = salary for the month − penalty deductions − lateness deductions + adjustments, never
   below 0 (`NET_FLOORED`), as §6.

- `RECORD_ONLY` and `INVESTIGATION` without days cost 0 and are listed on the payslip with 0 (§6).
- **Payslip amounts** per penalty: a days penalty gets its share of the **days part** (its days ÷
  the line's days × `penalty_days_amount` — today's rule, now over the days part only); a % penalty
  its own `round(base × percent ÷ 100)`; a fixed one its amount. Only the day shares can differ from
  the total by a piastre; the line total is what is paid. Old lines: `penalty_days_amount` is
  backfilled with `penalty_amount` (only days existed), so their payslips read as before.
- **Draft runs**: a catalogue edit never touches a draft (approved penalties are fixed; waiting ones
  don't count). The existing "Penalties changed since the last calculation" (§6) also covers a
  recount that changes a penalty's effect.

### Labels — on the payslip, the penalties list, details, preview and History (GUESS)

The three deducting effects read as **what they take** (the number is the point, and today's
"Deduct 1 day" stays word for word); record-only and investigation read as the action's **name**:

| Effect | English | Arabic |
|---|---|---|
| Record only | `{name}` — "Warning" | `{name}` — "إنذار" |
| Deduct days | "Deduct {days}" — "Deduct 0.5 day", "Deduct 2 days" | "خصم {days}" — "خصم نصف يوم"، "خصم يومين" (today's `formatDayCount`, oblique) |
| Deduct % (month) | "Deduct {percent}% of the salary for the month" | "خصم {percent}% من أجر الشهر" |
| Deduct % (basic) | "Deduct {percent}% of the basic salary" | "خصم {percent}% من الأجر الأساسي" |
| Deduct amount | "Deduct EGP {amount}" — "Deduct EGP 200" | "خصم {amount} جنيه" — "خصم 200 جنيه" |
| Investigation | `{name}`; with days "{name}, {days} deducted" | `{name}`؛ مع أيام "{name} مع خصم {days}" |

`{name}` is the snapshot in the screen's language (the payslip's language when printed). Percents
print with up to two decimals and no trailing zeros (10, 2.5, 12.75); amounts with thousands
separators, piastres only when not zero (shared formatter). Western digits, as the rest of the app.

## API

Penalty actions — `hr.penalty_catalogue.view` to read, `hr.penalty_catalogue.manage` to write:

- `GET /hr/penalty-actions?includeHidden=&search=&page=&limit=` — paged and searched by the API
  (Settings), or the whole visible list without `page` (the level editor's picker). Item:
  `{ id, code, nameEn, nameAr, effect, percentBase, sortOrder, isActive, levelsUsing, violationsUsing }`.
- `POST /hr/penalty-actions` `{ nameEn, nameAr, effect, percentBase?, sortOrder? }` —
  `@Audited('hr.penalty_action.create')`.
- `PATCH /hr/penalty-actions/:id` `{ nameEn?, nameAr?, sortOrder?, isActive? }` —
  `@Audited('hr.penalty_action.update')` (rename, reorder, hide, show). No DELETE.

DTO rules: names trimmed, required, up to 100; `percentBase` required for `DEDUCT_PERCENT`, refused
otherwise; `effect` / `percentBase` in a PATCH → 400.

Catalogue (existing endpoints, changed shapes): a level is
`{ level, actionId, days?, percent?, amount? }` in `POST /hr/penalty-groups/:groupId/violations` and
`PATCH /hr/violations/:id`; `GET /hr/penalty-groups` returns each level's action as
`{ id, nameEn, nameAr, effect, percentBase, isActive }` with its numbers.

Penalties (existing endpoints, changed shapes): `action` becomes
`{ id, nameEn, nameAr, effect, percentBase }` (the snapshot when fixed, today's catalogue while
waiting), plus `days`, `percent`, `amount`. `PenaltyRecountChange.before / after` and the payslip's
penalties carry the same fields (the payslip adds `amount` priced, for salary viewers only).

New error codes (both locales, `errors.*`):

| Code | Status | When | English |
|---|---|---|---|
| `PENALTY_ACTION_NAME_TAKEN` | 409 | a name in use by another action, either language, hidden ones included | "Another action already has this name." |
| `PENALTY_ACTION_EFFECT_LOCKED` | 400 | a PATCH sends `effect` or `percentBase` | "An action's effect can't be changed. Add a new action and hide this one." |
| `PENALTY_ACTION_HIDDEN` | 400 | a level picks a hidden action it didn't already have | "This action is hidden. Show it in Penalty actions first, or pick another." |
| `PENALTY_ACTION_NOT_FOUND` | 400 | a level names an action that doesn't exist | "Pick an action from the list." |
| `INVALID_LEVELS` (existing) | 400 | new problems: `PERCENT_REQUIRED`, `PERCENT_INVALID`, `AMOUNT_REQUIRED`, `AMOUNT_INVALID`, `VALUE_NOT_ALLOWED` (replaces `DAYS_NOT_ALLOWED`) | per problem, below |

## Screens (EN / AR, desktop, tablet, phone)

- **Settings → Penalty catalogue → Penalty actions** (new card above the groups, `&part=actions`):
  the managed-list pattern of departments — columns **Name** (other language under it), **Effect**
  ("Record only", "Deduct days", "Deduct % of the salary for the month", …), **Used on** ("12 levels"),
  a "Hidden" pill; **Show hidden**; **Add action**; a ⋯ per row (**Rename**, **Hide** / **Show**).
  Paged by the API. Read-only for viewers without manage. Phone: rows as the list's existing cards.
- **Add action dialog**: English name, Arabic name, **Effect** — five radio choices, each with a
  one-line explanation (below) — and, for **Deduct a %**, **Of which salary** (Salary for the month /
  Basic salary). A note: "The effect can't be changed later." **Rename** opens the names dialog the
  lists already use; the effect shows read-only.
- **Violation dialog** (existing, levels unchanged in layout): the **Action** select lists the
  visible actions in the list's order (a hidden one appears only on the level that already has it,
  marked "(hidden)"); the **number field** beside it follows the action's effect — **Days** (suffix
  "days", as today), **Percent** (suffix "%", hint "of the salary for the month" / "of the basic
  salary"), **Amount** (the shared `MoneyField`, "EGP", thousands grouped live) — or disabled with
  "No number" for Record only, "Optional" for investigation. A link **Manage actions** (for managers)
  opens the card. Switching a level's action keeps a typed number only when the unit is the same.
- **Catalogue rows, record-penalty preview, penalty details, the penalties table, recount heads-up,
  payslip, History and Activity** use the labels above.
- **Dashboard chart "approved penalties by kind"** (§6): kinds become **Notice & warning** (the
  seeded `NOTICE` / `WARNING` codes), **Pay deductions** (days, %, fixed — and investigation with
  days), **Other**. GUESS; today investigation-with-days falls in "Other" — moved to deductions
  since it costs pay.

**Mockups (CLAUDE.md rule 9): not needed, in my view.** The new card is the existing managed-list
layout in an existing section; the violation dialog keeps its level row (number · action select ·
one number field · remove) and only the number field's unit changes. No screen changes how it lays
out its content and no navigation changes. If the owner wants to see it first, one quick screenshot
pair (EN desktop dialog, AR phone card) from a scratch build would do.

### Copy (EN / AR)

| Key | English | Arabic |
|---|---|---|
| card title | Penalty actions | إجراءات الجزاءات |
| card description | What a catalogue level can do. Each action has one effect; the numbers are set on each level. | ما يمكن أن تفعله درجة في لائحة الجزاءات. لكل إجراء أثر واحد، وتُحدد الأرقام في كل درجة. |
| add | Add action | إضافة إجراء |
| effect.RECORD_ONLY | Record only — kept on the employee's file, no change to pay | تسجيل فقط — يُحفظ في ملف الموظف دون أثر على الأجر |
| effect.DEDUCT_DAYS | Deduct days of pay — each level sets the days | خصم أيام من الأجر — تحدد كل درجة عدد الأيام |
| effect.DEDUCT_PERCENT | Deduct a % of salary — each level sets the % | خصم نسبة من الأجر — تحدد كل درجة النسبة |
| effect.DEDUCT_AMOUNT | Deduct a fixed amount — each level sets the amount in EGP | خصم مبلغ ثابت — تحدد كل درجة المبلغ بالجنيه |
| effect.INVESTIGATION | Referral to investigation — each level may add days deducted | إحالة للتحقيق — يمكن أن تضيف كل درجة أيام خصم |
| base label | Of which salary | من أي أجر |
| base.MONTH_SALARY | Salary for the month (after the part-time %) | أجر الشهر (بعد نسبة الدوام الجزئي) |
| base.BASIC_SALARY | Basic salary | الأجر الأساسي |
| effect locked note | The effect can't be changed later. | لا يمكن تغيير الأثر لاحقًا. |
| used on | {count} levels | {count} درجات (plural forms via the i18n plural rules) |
| hide confirm | Used on {levels} levels in {violations} violations. They keep it; it can't be picked for other levels. | مستخدم في {levels} درجات ضمن {violations} مخالفات. تحتفظ به، ولا يمكن اختياره لدرجات أخرى. |
| hidden marker | (hidden) | (مخفي) |
| level percent | Level {level} percent | نسبة الدرجة {level} |
| level amount | Level {level} amount | مبلغ الدرجة {level} |
| no number | No number | بدون رقم |
| problems.PERCENT_REQUIRED | Enter a percent. | أدخل النسبة. |
| problems.PERCENT_INVALID | Enter a percent above 0 and up to 100, with at most two decimals. | أدخل نسبة أكبر من 0 وحتى 100، بخانتين عشريتين على الأكثر. |
| problems.AMOUNT_REQUIRED | Enter an amount. | أدخل المبلغ. |
| problems.AMOUNT_INVALID | Enter an amount above 0 and up to EGP 1,000,000. | أدخل مبلغًا أكبر من 0 وحتى 1,000,000 جنيه. |
| problems.VALUE_NOT_ALLOWED | This action takes no number. | هذا الإجراء لا يأخذ رقمًا. |
| manage link | Manage actions | إدارة الإجراءات |
| net floored flag | Deductions exceed this month's pay — net set to 0 | الخصومات تتجاوز أجر الشهر — صافي الأجر صفر |

Seeded names (today's translations, unchanged): Notice / لفت نظر · Warning / إنذار · Deduct days /
خصم أيام · Referral to investigation / إحالة للتحقيق · Loss of half the annual raise / الحرمان من نصف
العلاوة السنوية · Loss of the annual raise / الحرمان من العلاوة السنوية · Annual raise deferred 3 months
/ تأجيل العلاوة السنوية 3 أشهر · Pay cut by one annual raise / خفض الأجر بمقدار علاوة · Demotion / خفض
الدرجة · Dismissal / الفصل.

## Audit (§9)

| Action | Record | What it keeps |
|---|---|---|
| `hr.penalty_action.create` (new) | the action (new entity type `penalty_action`, label: its names) | names, effect, base, order |
| `hr.penalty_action.update` (new) | the action | the fields that changed: names, order, hidden ↔ shown |
| `hr.violation.create` / `.update` (existing) | the violation | each level's action **by name** (both languages, as then) and its number, before → after: "Level 2: Deduct 0.5 day → Deduct 5% of the salary for the month" |
| `hr.penalty.record` / `.approve` / `.recount` (existing) | the penalty | the action's names and number (snapshot), effect; approving shows the level and action fixed if they differ from recording; a recount its before → after |

Both new actions join `SETTINGS_HISTORY_ACTIONS` as `catalogue`, so Settings' **View change
history** shows them. Every new endpoint is `@Audited`; none is `@NotAudited`. Entries written
before the move keep their enum codes and still read through `common.enums.penaltyAction.*`. A
penalty's percent or fixed amount is not hidden in History (catalogue data); a priced amount appears
only in payroll entries, as today.

## Migration of existing data (one Prisma migration, one transaction)

1. Create `PenaltyEffect`, `PenaltySalaryBase` and `penalty_actions`; insert the ten seeded rows
   (codes, names EN / AR above, effects: `DEDUCT_DAYS` → Deduct days, `INVESTIGATION` →
   Investigation, the other eight → Record only), in today's order.
2. `violation_levels`: add `action_id`, `percent`, `amount`; set `action_id` from
   `penalty_actions.code = action::text`; make it NOT NULL with its foreign key; drop `action`.
   `days` untouched.
3. `penalty_records`: add `action_id` and the snapshot columns; backfill from the matching seeded
   row (names, effect; `percent`, `amount`, `percent_base` null); NOT NULL; drop `action`. Every
   approved penalty keeps its level and days; its action now reads by the same name.
4. `payroll_lines`: add `penalty_days_amount`, backfilled with `penalty_amount`.
5. Drop the Prisma enum `PenaltyAction`.
6. Checks in the migration's test (CI): row counts unchanged; every level and penalty has an action;
   for every approved run, the sum of payslip penalty amounts and each net are unchanged.
7. **Seed**: ensures the ten actions by `code` (idempotent; a renamed or hidden one is left as the
   school made it). `seed-data.local/catalogue.json` keeps `action: "DEDUCT_DAYS"` (a seeded code),
   and may add an optional `actions` array `{ code, nameEn, nameAr, effect, percentBase? }` for the
   school's own actions, and `percent` / `amount` on levels. The committed fallback catalogue is
   unchanged.

## Timeline walks

"Today" moves; each step says what each record holds. Nadia: full-time, basic EGP 9,000 (salary for
the month 9,000; divisor 30). Contract-year window.

### A. A penalty approved, then its action renamed and its % changed

1. **1 Nov 2026** — Mona (HR manager) adds the action "Salary deduction %" / "خصم نسبة من الراتب",
   Deduct a %, of the salary for the month. Entry `hr.penalty_action.create`.
2. **2 Nov** — she sets "Absence without notice", level 2 → that action, **10%**. Entry
   `hr.violation.update` ("Level 2: Deduct 1 day → Deduct 10% of the salary for the month").
3. **10 Nov** — Nadia's 2nd absence (dated 10 Nov) is recorded and approved: snapshot "Salary
   deduction %", `DEDUCT_PERCENT`, `MONTH_SALARY`, 10%.
4. **20 Nov** — Mona renames the action to "Pay deduction %" and changes level 2 to **5%**.
5. **30 Nov** — November's payroll is approved: Nadia's line deducts 10% of 9,000 = **EGP 900.00**;
   the payslip says "Deduct 10% of the salary for the month". The penalty's details still show the
   name "Salary deduction %" (the snapshot).
6. **5 Dec** — the level goes to 7%. November's run and payslip never change; Nadia's next level-2
   penalty, if any, gets 7% with the name "Pay deduction %".

### B. An action hidden while a level still uses it

1. **1 Dec** — "Referral to investigation" is used on 6 levels. Mona hides it: the dialog says "Used
   on 6 levels in 5 violations. They keep it…". Entry `hr.penalty_action.update` (shown → hidden).
2. **3 Dec** — Sami gets his 4th "Fighting at school" (level 4 = investigation, 2 days): recorded and
   approved with it, as before; December deducts 2 days.
3. **4 Dec** — Mona edits "Fighting at school"'s name: saving works; level 4 still says "Referral to
   investigation (hidden)". She tries to pick it for "Leaving the school": refused,
   `PENALTY_ACTION_HIDDEN`, and the picker doesn't offer it.
4. **10 Dec** — she changes level 4 to "Warning". Pending penalties on that level now show Warning;
   Sami's approved one keeps the investigation and its 2 days.
5. **11 Dec** — she shows the action again: pickable everywhere.

### C. A % deduction approved in a month whose payroll is DRAFT, vs APPROVED

1. **28 Nov** — November's run is a **draft**, calculated 25 Nov. A 10% penalty dated 26 Nov is
   approved: the draft doesn't change by itself; its next Recalculate, or its approval (which
   recalculates first), deducts EGP 900.00. Until then the line shows the old figure, as with a day
   deduction today.
2. **30 Nov** — November is **approved**. On **2 Dec** HR tries to record (or approve) a 10% penalty
   dated 29 Nov: refused, the month's payroll is approved (§4). The correction goes into December as
   an adjustment with a reason (§6).
3. **Accounting returns November to HR** (draft again, §10): the next calculation reprices the 10%
   from the line's salary at that calculation, like every other line.

### D. Salary changes after a % penalty is approved, before the month's payroll is approved

1. **10 Nov** — 10% penalty (salary for the month) approved for Nadia. The penalty stores 10%, no money.
2. **20 Nov** — November's draft is calculated: basic 9,000 → EGP 900.00.
3. **25 Nov** — Nadia's basic is raised to 10,000 (employee form; §6 has no effective date).
4. **30 Nov** — approving November recalculates: the line's basic is 10,000, salary for the month
   10,000, the penalty **EGP 1,000.00**, and day deductions in the month use 10,000 ÷ 30 too. The
   payslip shows 10,000 and 10% = 1,000 — consistent.
5. **5 Dec** — a cut back to 9,000: November is approved and frozen (the line's snapshot); nothing
   moves. Why the payroll's salary and not the salary at penalty approval: see Decisions.
6. **Part-timer variant** — Huda, 3 days (60%), basic 10,000: salary for the month 6,000. A 10% of
   the salary for the month = EGP 600.00; a 10% of the basic salary = EGP 1,000.00.

### E. A backdated penalty that moves levels, with different effects per level

"Late to class": level 1 Notice, level 2 Deduct 0.5 day, level 3 **Deduct 5% of the salary for the
month**, level 4 **Deduct EGP 300**.

1. **19 Nov** — Omar's late (dated 19 Nov) approved: level 1, Notice. **20 Nov** — dated 20 Nov,
   approved: level 2, Deduct 0.5 day. **21 Nov** — dated 21 Nov, approved: level 3, 5%.
2. **24 Nov** — a late **dated 18 Nov** is recorded. Preview: "Approving this will raise the level of
   3 approved penalties: 19 Nov 2026: level 1 → 2, Notice → Deduct 0.5 day; 20 Nov: level 2 → 3,
   Deduct 0.5 day → Deduct 5% of the salary for the month; 21 Nov: level 3 → 4, Deduct 5% of the
   salary for the month → Deduct EGP 300".
3. **25 Nov** — approved with "Approve and update 3 penalties": 18 Nov level 1 Notice; the three move
   up with **today's** level actions, names and numbers (the existing exception), each with its own
   `hr.penalty.recount` entry. November's draft says "Penalties changed since the last calculation".
4. **Recalculated** (salary 9,000): days part 0.5 × 9,000 ÷ 30 = 150.00; % part 5% = 450.00; fixed
   300.00 → penalty deductions **EGP 900.00** (before: 0.5 day 150.00 + 5% 450.00 = 600.00).
5. **If December's run held a moved penalty and were approved**, recording the 18 Nov penalty would
   be refused (§4 "not into an approved month") — unchanged by effects.

### F. Boundary days: the last day of a month, approval on the 1st

1. **30 Nov (last day)** — a 10% penalty dated 30 Nov, recorded at 14:00. It belongs to **November**
   (the violation's month), whatever day it is approved.
2. **1 Dec** — HR approves it. November's run is still a draft → November deducts it at its next
   calculation; December's run doesn't. November can't be approved on 30 Nov while this penalty
   waits (§6 refuses a month with a waiting penalty — Q1 below): it is approved or cancelled first.
3. **31 May 2027 → 1 June 2027** (contract-year window): a penalty dated 31 May is level 3 (5%); the
   same violation on 1 June starts a new window → level 1 (Notice). The effect follows the level of
   its own date, not of the approval day.
4. **31 Jan vs 28 Feb** — a % is a share of the month's salary, so January and February take the
   same EGP; a day deduction is ÷ 30 in both (the divisor, §6), unchanged.
5. **1 Dec, 00:10 Cairo** — dates are Cairo calendar dates (`@db.Date`); a penalty dated 1 Dec is
   December's even if recorded seconds after midnight.

## Edge cases

1. A Record-only level with a number sent by the API → 400 `INVALID_LEVELS` (`VALUE_NOT_ALLOWED`).
2. Deduct days with 0, a negative, 0.3 or 31 days → `DAYS_INVALID`; missing → `DAYS_REQUIRED`.
3. Deduct % with 0, -5, 100.01 or 12.345 → `PERCENT_INVALID`; 100 → allowed; missing →
   `PERCENT_REQUIRED`.
4. Deduct amount with 0, a negative, a fraction of a piastre, or above EGP 1,000,000 →
   `AMOUNT_INVALID`; missing → `AMOUNT_REQUIRED`.
5. Investigation with no days → valid, costs 0; with days → priced as days.
6. A % base sent for an action that isn't Deduct % → 400; Deduct % without a base → 400.
7. A PATCH that tries to change an action's effect or base → 400 `PENALTY_ACTION_EFFECT_LOCKED`.
8. Two actions with the same English (or Arabic) name, any case, hidden ones included → 409
   `PENALTY_ACTION_NAME_TAKEN`.
9. Picking a hidden action for a level that didn't have it → 400 `PENALTY_ACTION_HIDDEN`; keeping it on
   a level that had it → saved.
10. A level naming an action id that doesn't exist → 400 `PENALTY_ACTION_NOT_FOUND`.
11. Deleting an action → no endpoint; the foreign keys are `RESTRICT`.
12. An action renamed while a penalty waits → the waiting penalty shows the new name; fixed at approval.
13. An action renamed after approval → the approved penalty, its payslip and History keep the old name.
14. A level's % changed after approval → approved penalties and approved runs unchanged; a draft run
    unchanged (the penalty's own 10% stands).
15. A level's action switched from Deduct days to Deduct % while a penalty waits → it shows the % now
    and gets it at approval.
16. Two % penalties in one month (10% and 2.5% of 9,999.99) → 1,000.00 + 250.00, each rounded on its own.
17. Penalties exceeding the month's pay (e.g. 60% + EGP 5,000 on 9,000) → net 0, `NET_FLOORED`, needs
    review (no cap — DECIDED).
18. A % of the basic salary for a part-timer, larger than a share of their salary for the month →
    allowed; the floor still applies.
19. A fixed amount on a stage head's screen → shown (catalogue data); the EGP taken from the employee
    on payroll → only for salary viewers.
20. The salary changes before the month's approval → the % follows the line's salary at approval (walk D).
21. The month's payroll is approved → recording, approving and cancelling a penalty dated in it are
    refused, whatever the effect (§4).
22. A backdated recount changing a penalty from Record only to a fixed amount → its History entry shows
    "Notice → Deduct EGP 300"; the draft run asks to recalculate.
23. A recount into a level whose action is now hidden → it takes that action (levels keep hidden
    actions).
24. An employee deactivated before the run's last calculation → off the run; their penalties never
    priced (unchanged).
25. Old payslips → read exactly as before (`penalty_days_amount` backfilled; names from the seeded rows).
26. Old audit and change-history entries holding `DEDUCT_DAYS` etc. → still read via the kept locale keys.
27. Seed run twice, or after the school renamed "Warning" → the ten are ensured by code, never renamed back.
28. `seed-data.local/catalogue.json` naming an unknown action code → the seed stops with a clear error.
29. Two people adding an action with the same name at once → the unique index lets one win; the other
    gets `PENALTY_ACTION_NAME_TAKEN`.
30. A percent printed as 10.00 or 2.50 → shown "10" and "2.5" (no trailing zeros), "10٪" never — Western
    digits and "%" in both languages.
31. The dashboard chart → a school-added Record-only action counts as "Other"; any deducting effect as
    "Pay deductions".

## Answers to the blind scenarios' questions (2026-11-26)

The blind scenarios (`2026-11-25-penalty-actions-scenarios.md`) raised 20 questions. Answers:
**DECIDED (owner, 2026-11-26)** where marked, otherwise **GUESS (decided by Claude, 2026-11-26)**.

- **Q1** — Walk F step 2 was wrong: §6 refuses to approve a month while a penalty dated in it waits,
  so "November approved at 16:00 while the 30 Nov penalty waits" can't happen (fixed below).
- **Q2** — A level's days: more than 0 up to 30, in ¼ steps (§4, §7 match).
- **Q3** — `NET_FLOORED` only when the net would go **below** 0 after everything, adjustments
  included. A net of exactly 0 isn't flagged.
- **Q4 — DECIDED (owner, 2026-11-26)** — When the net floors at 0, what couldn't be deducted is
  **written off** for that month, never carried forward. The payslip shows "Not deducted (pay too
  low): X" and the line stays flagged.
- **Q5** — No new stage review when the catalogue changes after it: the HR approval shows the level's
  current effect and number and the snapshot is taken then; its History entry shows the action fixed
  at approval when it differs from recording.
- **Q6** — Any penalty dated in the month approved, cancelled or moved up a level after a draft's last
  calculation marks the draft "Penalties changed since the last calculation", not only a recount.
- **Q7** — A fixed amount is catalogue data: stage heads and direct managers see it.
- **Q8 — DECIDED (owner, 2026-11-26)** — A fixed amount is a fine: **not** scaled for part-timers.
- **Q9** — Without salary access a payroll line lists its deducting penalties by kind ("2 penalties:
  0.5 day, 5%"), never "0 days" and never money, and doesn't carry the `NET_FLOORED` flag (beside a
  visible fixed amount it would hint at the pay).
- **Q10** — A level's percent: 0.01 to 100 (§7's 1–100 is the part-time percentages).
- **Q11** — An investigation with 0 days means no days: stored as none, never 0.
- **Q12** — The payslip's label: the effect's text, then the action's own name in brackets when it
  isn't the effect's default ("Deduct EGP 200 (Late uniform fine)").
- **Q13** — A % of the basic salary on the payslip names its base: "Deduct 10% of the basic salary
  (12,345.67)", in both languages.
- **Q14** — The day-priced part is split between the day penalties by the **largest remainder**
  method, so the payslip's shares always add up to it (S10: 75.01 + 75.00; S11: 83.34 + 83.33 + 83.33).
- **Q15** — A month Accounting returns to HR is re-priced at its next calculation (it reopened); §6.
- **Q16** — Name uniqueness folds Arabic letter variants (أ/إ/آ → ا, ى → ي, ة → ه), case, marks
  and spaces — the search's own folding (`search_fold`).
- **Q17** — The business-doc edits below are applied with the build.
- **Q18** — Ten seeded actions (investigation with or without days is one action).
- **Q19** — The hide warning counts the levels and violations in use (active violations in active
  groups) and names retired ones that still hold the action separately.
- **Q20** — Out of scope: "whether an investigation is needed before a deduction" stays OPEN in §4.

## Owner questions

None left. The monthly cap is answered: **no cap** (owner, 2026-11-26); net floored at 0 and flagged,
as today. §4's OPEN on the cap becomes DECIDED with the business-doc edits.

Everything else above is GUESS (or DECIDED from the brief): the owner can change any of it in review.
The three I would most like him to glance at: the numbers on the level (not the action), "gross" not
offered as a base (Salary for the month / Basic salary instead), and the % priced from the month's
payroll salary.

## Proposed business-doc edits (not applied — after approval)

### §4 Penalties — replace the "Each level has one action" bullet with

- **DECIDED** (owner, 2026-11-25) — Each level has one **action** from the school's **Penalty
  actions** list (§7). Each action has one **effect**, fixed in code: **Record only**, **Deduct days
  of pay**, **Deduct a % of salary**, **Deduct a fixed amount**, **Referral to investigation**
  (optionally with days deducted). No free formulas: a new effect is code.
- **GUESS** (spec 2026-11-25) — The **numbers are on the level**: days (quarter steps, above 0, at
  most 30), a percent (above 0, at most 100, two decimals) or an amount (above EGP 0, at most
  1,000,000). A % action says which salary it is a % of — the salary for the month or the basic
  salary (§6). An action's effect and salary are fixed once it is added.
- **DECIDED** — The seeded actions are today's ten: notice, warning, deduct days, referral to
  investigation, loss of half the annual raise, loss of the annual raise, raise deferred 3 months,
  pay cut by one annual raise, demotion, dismissal. The raise actions, pay cut, demotion and
  dismissal are Record only (**Planned**: a raise effect when the annual raise exists).

### §4 — replace "An approved penalty whose action is a day deduction…" and "Notice, warning…" with

- **DECIDED** (owner, 2026-11-25) — An approved penalty whose action deducts (days, a %, a fixed
  amount, or an investigation with days) reduces pay in the payroll of the **month the violation
  happened** (§6). Record-only actions, and investigation without days, don't change pay.
- **DECIDED** (owner, 2026-11-25) — At approval the penalty keeps a **snapshot** of its action's
  names, effect, salary base and numbers. Renaming, hiding or re-pricing later never changes it, its
  payslip or its History (only a backdated recount moves it, with today's catalogue, above).

### §6 Payroll — replace step 3 with

3. **Penalty deductions** = for the approved deducting penalties dated in the month:
   `round(total days × salary for the month ÷ divisor)` (day deductions and investigations with
   days, priced once) + each % penalty's `round(base × percent ÷ 100)` (base: the line's salary for
   the month or basic salary) + each fixed amount. (GUESS, spec 2026-11-25)

and add:

- **GUESS** (spec 2026-11-25) — A % uses the **salary on the month's payroll line** at its last
  calculation (approval recalculates first): the salary when the month is approved, like day
  deductions. A penalty stores the percent, never money.
- **DECIDED** — the payslip bullet becomes: "each penalty with its level and action ('Deduct 0.5
  day', 'Deduct 10% of the salary for the month', 'Deduct EGP 200', or the action's name)"; and the
  share rule: "A day penalty's amount is its share of the line's day-priced deduction; a % or fixed
  penalty shows its own amount."
- Dashboard charts: "stacked by kind (notice & warning, pay deductions, other)".

### §7 Settings — add to the table and the bullets

| Setting | Default | Source |
|---|---|---|
| Penalty actions (§4) | Today's ten, with their names | DECIDED (owner, 2026-11-25) — Settings → Penalty catalogue → Penalty actions; names up to 100, unique in each language; never deleted, only hidden |

- **GUESS** (spec 2026-11-25) — A hidden penalty action can't be picked for a level; levels that
  already use it keep it, and new penalties on them still get it. Hiding one in use says how many
  levels and violations use it.
- Validation line gains: "level percentages above 0 and at most 100 with two decimals; level amounts
  above EGP 0 and at most 1,000,000".
- The change-history bullet's list gains "penalty actions".

### §9 Audit — add

- Recorded actions gain "**penalty actions** (add, rename, reorder, hide, show)". A level's or a
  penalty's action reads by its name as it was then, with its number ("Deduct 10% of the salary for
  the month"). Replace "A penalty has no amount (it is days; payroll prices them)" with "A penalty
  holds no priced amount — days, a percent or a catalogue amount; payroll prices them — so nothing in
  it is hidden as salary."

### §2 Roles — add

- **GUESS** (spec 2026-11-25) — **Penalty actions** are managed with the catalogue
  (`hr.penalty_catalogue.manage`: HR manager, System admin) and seen by whoever sees the catalogue.
  No new permission.

## Out of scope

The annual raise and its effect (Planned) · a cap on deductions (decided: none) · allowances as a % base ·
effects on lateness · formulas · per-employee overrides of a level's number · changing an action's
effect in place · restoring a hidden action's levels in bulk.
