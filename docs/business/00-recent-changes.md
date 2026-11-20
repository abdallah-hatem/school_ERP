# Recent changes

Each business change is **one file** in [`recent-changes/`](recent-changes/), named
`YYYY-MM-DD-NNN-<slug>.md` (date, a number that keeps the day's order, a short slug). Newest first
= sort the folder by name, descending. One file per change means two PRs never edit the same lines,
so they never conflict (owner, 2026-11-18).

A PR that changes business behaviour adds its own file there — never edits this one or another
PR's file. Format: a `# YYYY-MM-DD — <title>` heading, then the change in business terms with the
sections it touches (`§N`) and who decided it.
