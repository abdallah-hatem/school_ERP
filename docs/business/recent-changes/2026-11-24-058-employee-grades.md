# 2026-11-24 — An employee's grade is picked from the school's Grades list

Owner, 2026-11-24: the grade was free text; it is now a configured list the school manages, like
departments and job titles.

- **Grades list (§3, §7):** Settings → HR lists has a **Grades** panel beside Departments and Job
  titles: each grade has an English and an Arabic name; grades are added, renamed, hidden or shown,
  never deleted. Same permissions as the other HR lists (View HR lists / Manage HR lists). Every
  change is in the audit log and the settings change history (§9).
- **On the employee (§3):** Grade is optional, picked from the list (searched as you type), with
  "No grade" to leave it empty or clear it. A grade hidden after an employee got it stays on that
  employee, with the same "hidden" note as the other lists; only a newly chosen grade must be shown.
  The employee's page shows the grade's name in the page's language, and their History shows a grade
  change by name.
- **Existing data:** every grade typed before became one grade on the list (one per distinct text,
  spaces trimmed, the same text in English and Arabic, which the school can then translate), and the
  employees who had it point at it. Empty grades stay empty.
- **Seed:** four generic example grades (Grade 1–4, in English and Arabic); the demo staff hold one.
