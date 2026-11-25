# §7 Settings

Everything here is changed by the school in the Settings screen, takes effect immediately, and
affects only **draft** payroll runs (approved runs never change).

- **DECIDED** — **Change history:** every change to school settings, HR rules, lists (stages,
  departments, job titles, employee grades), the penalty catalogue and penalty actions is recorded: what changed, the old and new
  value, who changed it and when. The history is viewed on the Activity page (§9), newest first,
  page by page: Settings' **View change history** opens it filtered to settings (owner, 2026-11-17 —
  the separate Change history section was removed).
- **DECIDED** — The history is part of the audit log (§9): it is saved together with the change, and
  if it can't be saved the change is refused. Built for school settings, the logo and HR rules;
  stages, lists and the catalogue follow when their audit entries are wired (until then their
  history is written right after the change). Every change recorded before the move is kept, with
  its value, person and time.
- **DECIDED** (§2) — Settings lists only the sections the user may view, and opens on the first of
  them; a link to a section they can't view opens their first allowed one instead. Anyone who may
  view at least one section (e.g. the Accountant, for Accounting) has Settings in the menu. A
  section they may view but not change is shown read-only: no typing, adding or removing.
  Every section follows it (2026-11-18): School (fields disabled, no logo upload, no Save), HR rules
  (fields disabled, no adding or removing hour steps, no Save), Structure and the lists (no Add, no
  rename / hide menu), the penalty catalogue (no Add group / Add violation, no menus) and
  Accounting. The live examples (lateness, tax) still work: they are calculators, not settings.
- **DECIDED** — The logo must be PNG, JPG or SVG and at most 2 MB. School names are at most 200
  characters; stage, department and job-title names at most 100.

| Setting | Default | Source |
|---|---|---|
| School name (English, Arabic) and logo | From the seed | DECIDED |
| Default language | English | DECIDED (owner, 2026-11-17) |
| Work start / end time | 7:30 / 15:00 | DECIDED |
| Working days | Sunday – Thursday | GUESS |
| School address (English, Arabic) | Empty (the "School address" field prints empty until set) | GUESS (spec 2026-11-24-contract-templates) — Settings → School; up to 300 characters each |
| School signatory: name and title (English, Arabic) — who signs contracts for the school | Empty (the "School representative" field prints empty until set) | DECIDED (owner, 2026-11-24) — one signatory, Settings → School; up to 100 characters each |
| Contract templates | One generic sample, "Full-time contract", default for full-time | GUESS — Settings → HR → Contract templates, Manage contract templates; the school's real text is entered at setup (never in code) |
| Lateness grace minutes | 0 | GUESS |
| Lateness steps | 1st hour ¼ day, 2nd hour ½ day | DECIDED |
| Lateness cost per hour beyond the steps | ½ day | GUESS |
| Day value divisor | 30 | GUESS |
| Part-time percentages | 4 days 80%, 3 days 60%, 2 days 40% | DECIDED |
| Penalty repetition window | Contract year (1 June – 31 May); alternatives: calendar year, rolling 12 months | GUESS |
| Default probation length (fills a new employee's probation end, §3) | 3 months; whole months 0–6, 0 = no probation | DECIDED (owner, 2026-11-18) — Settings → HR rules → Employees |
| Penalty catalogue | The school's 4 tables (72 violations) | DECIDED |
| Penalty actions (§4) | Today's ten, with their names | DECIDED (owner, 2026-11-25) — Settings → Penalty catalogue → Penalty actions; names up to 100, unique in each language; never deleted, only hidden |
| Violation "Once per day" (§4) | On, except violations that repeat within a day (late to class, leaving a task early…) | DECIDED (owner, 2026-11-18) |
| Stages (school structure), departments, job titles, employee grades | From the seed (employee grades: Pay grade 1–4 as generic examples, owner 2026-11-24) | DECIDED |
| Brand colours | Teal and sunflower (the "Campus" design), fixed for now | DECIDED |
| Currency | EGP | DECIDED |
| Payroll tax rule (income-tax slices, martyrs' fund, insurance share) | See §10 | GUESS — Settings → Accounting |
| Sign-in limit: wrong passwords, within minutes, lock minutes (§2) | 5, 15, 15 | DECIDED (owner, 2026-11-18) — no screen yet; each at least 1 |
| Remind before a contract ends (§11) | 30 days (1–120), and again 7 days (0 = none; 0–60, fewer than the first) | DECIDED (owner, 2026-11-18) — an HR rule; Settings → Notifications → Reminder timing |
| Remind before probation ends (§11) | 7 days (1–60) | GUESS — an HR rule; same screen |
| Renewal decisions due (§11) | From 1 March: 91 days before 31 May (1–180) | GUESS (spec 2026-11-24) — an HR rule; same screen |
| Non-renewal window closes soon (§11) | 7 days before the non-renewal deadline (1–60) | GUESS (spec 2026-11-24) — an HR rule; same screen |
| School calendar, per contract year (§3 Contracts) | Not set: first day of term 1, last day of term 1 (exams included), first day of term 2, non-renewal deadline (30 April) — all inside the contract year, in that order | GUESS (spec 2026-11-24) — Settings → HR rules; changed by whoever may change HR rules. When academics (academic years) is built, it takes these dates over |
| Lateness check day / payroll check day (§11) | 25 / 28 (1–31; past the month's end = its last day) | DECIDED settings; the days GUESS until the school confirms — HR rules; same screen |
| Keep read notifications / done approvals / any notification (§11) | 90 / 30 / 365 days (each 1–3650) | DECIDED (owner, 2026-11-18) — Settings → Notifications |
| Each kind of notification on or off by default (§11) | On; approvals always on | DECIDED (owner, 2026-11-18) — Settings → Notifications |

- **DECIDED** (owner, 2026-11-18) — Each job title in the job-titles list has a **Manages people**
  switch (set when adding or editing the title; the list shows a "Manages people" badge on those
  that do). It decides who can be chosen as a direct manager (§3). Changing it is recorded in the
  change history like any list change.
- **GUESS** (spec 2026-11-25) — A hidden penalty action can't be picked for a level; levels that
  already use it keep it, and new penalties on them still get it. Hiding one in use says how many
  levels and violations use it.
- **DECIDED** — Settings are validated: times in order, percentages 1–100, divisor 1–31, days in
  quarter steps (0.25) from 0 to 30, level percentages above 0 and at most 100 with two decimals,
  level amounts above EGP 0 and at most 1,000,000, the default probation length in whole months from 0 to 6,
  the reminder timings in whole days within their ranges (§11) with the second contract reminder
  fewer days before the end than the first (or 0). Changing a timing is recorded like any HR rule.
- **DECIDED** (owner, 2026-11-17) — Work start and work end are on a 30-minute boundary (07:00,
  07:30 — not 07:15). The Settings screen offers them as a list from 05:00 to 20:00 every half hour,
  shown 12-hour in the screen's language (`7:30 AM` / `7:30 ص`, owner 2026-11-21); a time off the
  boundary is refused. Times already saved on a
  boundary stay valid.
- **DECIDED** — A violation used by an approved penalty can't be deleted, only retired from new use.
- **DECIDED** (owner, 2026-11-18) — The violation dialog in Settings → Penalty catalogue has a
  **Once per day** switch with a one-line explanation (§4). Violations with it **off** show a small
  "Can repeat in a day" badge in the catalogue (the exception is the one marked). Changing it is
  recorded in the change history like any catalogue change, and never changes recorded penalties.
- **DECIDED** (owner, 2026-11-18) — The penalty catalogue has a **search box**: it matches a
  violation's English or Arabic name and a group's English or Arabic name (ignoring case, accents and
  Arabic letter variants). While searching, groups with a match open by themselves and show only the
  matching violations (a group whose own name matches shows all of its violations); the matching
  text is marked. Nothing matching → "No violations match" with **Clear filters**. Pressing `/`
  puts the cursor in the search. The record-penalty dialog's violation picker searches the same
  way (violation and group names, both languages).
