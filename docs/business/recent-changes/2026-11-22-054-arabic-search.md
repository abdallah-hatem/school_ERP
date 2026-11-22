# 2026-11-22 — Search finds Arabic letter variants and joined or split names

Decided by the owner (every list's search; §3, §4, §6, §9, §10).

- **Letter variants:** every search box — employees, users, roles, stages, departments, job titles,
  penalties, the Activity log and its people picker, the payroll and accounting month lines, and
  every picker that searches records — finds a name however its letters are typed: أ / إ / آ / ا,
  ى / ي, ة / ه, ؤ / و, ئ / ي, with or without diacritics (مُحَمَّد) or the tatweel (محـمد). Latin
  accents are ignored too ("mona" finds "Moná"), and so is case.
- **Joined or split names:** "عبدالرحمن" finds "عبد الرحمن" and the other way round; the same for
  "أبوبكر" / "أبو بكر" and "Abdelrahman" / "Abdel Rahman".
- **Words in any order, parts of words:** "علي احمد" finds "أحمد علي"; "moh aziz" finds "Mohamed
  Abdelaziz". Extra spaces and invisible characters pasted into the box don't matter.
- `%` and `_` typed in a search mean themselves, not "anything".
- Searches the system runs in memory (the month's lateness, the penalty catalogue) follow the same
  rule. Nothing else changes: lists still page, count and sort on the server.
