# 2026-11-24 — An employee's grade is picked from the school's Employee grades list

Owner, 2026-11-24: the grade was free text; it is now a configured list the school manages, like
departments and job titles. It is called **Employee grades** everywhere but the form's "Grade"
label, because "grades" alone means school grades (academics).

- **Employee grades list (§3, §7):** Settings → HR lists has an **Employee grades** panel beside
  Departments and Job titles: each grade has an English and an Arabic name; grades are added,
  renamed, hidden or shown, never deleted. Same permissions as the other HR lists (View HR lists /
  Manage HR lists). Every change is in the audit log and the settings change history (§9).
- **On the employee (§3):** Grade is optional, picked from the list (searched as you type), with
  "No grade" to leave it empty or clear it. A grade hidden after an employee got it stays on that
  employee, with the same "hidden" note as the other lists; only a newly chosen grade must be shown.
  The employee's page shows the grade's current name in the page's language; their History shows a
  grade change by the names it had then.
- **Existing data:** grades typed before became items on the list. Texts that differ only by
  spaces or upper/lower case became one item, named after the most common spelling (a tie: the
  first alphabetically), the same text in English and Arabic, which the school can then translate.
  Empty grades stay empty.
- **Seed:** four generic examples (Pay grade 1–4 / الدرجة الأولى … الرابعة). Demo employees get one
  when the seed creates them; an older database gets them once, only while no employee has a grade.
