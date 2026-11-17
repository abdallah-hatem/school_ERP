# §7 Settings

Everything here is changed by the school in the Settings screen, takes effect immediately, and
affects only **draft** payroll runs (approved runs never change).

- **DECIDED** — **Change history:** every change to school settings, HR rules, lists (stages,
  departments, job titles) and the penalty catalogue is recorded: what changed, the old and new
  value, who changed it and when. The history can be viewed, newest first, page by page.
- **DECIDED** — The history is part of the audit log (§9): it is saved together with the change, and
  if it can't be saved the change is refused. Built for school settings, the logo and HR rules;
  stages, lists and the catalogue follow when their audit entries are wired (until then their
  history is written right after the change). Every change recorded before the move is kept, with
  its value, person and time.
- **DECIDED** — The logo must be PNG, JPG or SVG and at most 2 MB. School names are at most 200
  characters; stage, department and job-title names at most 100.

| Setting | Default | Source |
|---|---|---|
| School name (English, Arabic) and logo | From the seed | DECIDED |
| Default language | English | DECIDED (owner, 2026-11-17) |
| Work start / end time | 7:30 / 15:00 | DECIDED |
| Working days | Sunday – Thursday | GUESS |
| Lateness grace minutes | 0 | GUESS |
| Lateness steps | 1st hour ¼ day, 2nd hour ½ day | DECIDED |
| Lateness cost per hour beyond the steps | ½ day | GUESS |
| Day value divisor | 30 | GUESS |
| Part-time percentages | 4 days 80%, 3 days 60%, 2 days 40% | DECIDED |
| Penalty repetition window | Contract year (1 June – 31 May); alternatives: calendar year, rolling 12 months | GUESS |
| Penalty catalogue | The school's 4 tables (72 violations) | DECIDED |
| Stages (school structure), departments, job titles | From the seed | DECIDED |
| Brand colours | Teal and sunflower (the "Campus" design), fixed for now | DECIDED |
| Currency | EGP | DECIDED |

- **DECIDED** — Settings are validated: times in order, percentages 1–100, divisor 1–31, days in
  quarter steps (0.25) from 0 to 30.
- **DECIDED** (owner, 2026-11-17) — Work start and work end are on a 30-minute boundary (07:00,
  07:30 — not 07:15). The Settings screen offers them as a list from 05:00 to 20:00 every half hour,
  shown in the screen's language; a time off the boundary is refused. Times already saved on a
  boundary stay valid.
- **DECIDED** — A violation used by an approved penalty can't be deleted, only retired from new use.
