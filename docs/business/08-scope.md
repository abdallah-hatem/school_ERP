# §8 Scope

## Built (demo, target 2026-11-22)

Sign-in · dashboard · employees · lists (departments, stages, job titles) · penalty catalogue and
penalty records · monthly lateness · payroll run, payslip, bank sheet · settings · Arabic/English ·
responsive layout.

## Planned (from the client's documents, after the demo)

The build order of every module, and what each one needs, is in [`docs/ROADMAP.md`](../ROADMAP.md).

- **Clinic** (owner, 2026-11-24): treats students and staff — visits, health profiles, medication,
  the guardian told when a student is sent home, and the doctor's approval of staff sick leave and
  sick permissions. Built after student records.

- **Leave:** annual (15 / 21 / 30 days), casual (7 a year, max 1 a month, not for drivers or external
  supervision), sick (10 a year with a doctor's approval), bereavement, Hajj, Umrah, marriage,
  maternity, excused absence, the part-time leave table.
- **Permissions:** 4 a month of 2 hours, half-hour permissions twice a month, full-day permission,
  nursing hours.
- **Employee self-service portal:** requests to the direct manager, HR, legal affairs or the clinic;
  approved exit permits shown to the security desk.
- **Fingerprint device** integration for attendance.
- **Recruitment:** job ads, online applications, CV review.
- **Contracts:** renewal and non-renewal deadlines, early termination, deemed resignation after
  unexcused absence.
- **Medical and legal:** sick-leave approval by the clinic, investigations.
- **Payroll:** annual raise and the raise-related penalties, exam bonus, overtime rate, loans, bank
  transfer. (The payroll taxes — insurance share, income tax, martyrs' fund — are built in
  accounting, §10.)
- **Reports** for official bodies, the bus department's attendance report.
- **Roles and permissions** for the whole approval chain (§2).
- **Accounting:** a screen for each approved month's payroll taxes (mockups first), journal entries
  created from approved payroll (and later fee payments), the employer's insurance share.
- **Supervision duty roster.**
- **Notifications** (§11) — in-app bell, approvals waiting and reminders; spec, plan and mockups
  with the owner (2026-11-18). The mechanism, HR's reminders and the screens are built
  (2026-11-18); HR's approval notifications next. Push alerts to phones and computers, and the
  app installable with the school's logo, built 2026-11-21. Email, WhatsApp, SMS and parents later.
- **Audit log** (§9) — approved 2026-11-17, being built.
- **App logging** for developers (requests, errors) — with hosting.

## Left out on purpose

- Dark mode (light only, owner's decision 2026-11-17).
