# Roadmap

The order modules are built in, from what each one needs. A module is built only once the modules
it needs exist. The module list comes from the client proposal (33 modules in 8 groups, kept outside
the repo), plus the clinic (owner, 2026-11-24). Business rules for each module are written in
`docs/business/` just before it is built; this file is the order, not the rules.

Status: **Built** · **Partly built** (what is missing is named) · **Planned** · **Open** (scope not
decided).

## Build order

Numbers in brackets are the proposal's module numbers.

### Layer 0 — platform

| Module | Needs | Status |
|---|---|---|
| (1) Core platform & approvals — sign-in, roles and permissions, settings, audit log, notifications, files, stages | — | Built |

### Layer 1 — base records everything else hangs on

| Module | Needs | Status |
|---|---|---|
| (16) Employee records & contracts | core | Partly built — employees, departments, job titles; contracts Planned |
| (2) Chart of accounts & general ledger | core | Planned — every money module posts to it |
| (27) Student records & enrolment — students, guardians, academic years, grades, classes, enrolment per year, Excel import, health profile | core (stages), HR (class teachers) | Planned |
| (5) Vendors | core | Planned |

### Layer 2 — needs layer 1

| Module | Needs | Status |
|---|---|---|
| (17) Attendance, with the fingerprint device | employees | Planned — any device: push, a bridge on a school PC, or Excel/CSV import of the device's export; feeds lateness (§5) |
| (18) Permissions & excused absence | attendance | Planned |
| (19) Leave | attendance | Planned |
| (20) Part-time work | employees, leave | Planned |
| (21) Disciplinary & investigations | employees | Partly built — penalties (two-step approval); investigations Planned |
| (22) Supervision & duty rosters | employees | Planned |
| (15) Recruitment | employees | Planned |
| (23) Policies & code of conduct | employees | Planned |
| (4) Tuition fees & student accounts | students, general ledger | Planned |
| (6) Procurement & expenses | vendors, general ledger | Planned |
| (7) Cash, banks & reconciliation | general ledger | Planned |
| (9) Other revenue & grants | general ledger | Planned |
| (28) Student certificates & documents | students | Planned |

### Layer 3 — needs layer 2

| Module | Needs | Status |
|---|---|---|
| (13) Inventory & warehouse | procurement (stock arrives from purchase orders), vendors, general ledger | Planned |
| (8) Fixed assets | procurement, general ledger | Planned |
| (3) Budgeting & financial planning | general ledger, procurement (budget against spending) | Planned |
| (26) Payroll & bonuses, in full | attendance, leave, part-time, penalties, general ledger | Partly built — monthly run, payslip, bank sheet, payroll taxes; raises, exam bonus, overtime, loans and journal entries Planned |
| (29) Transportation | students, drivers (HR), fees (bus fees) | Planned |
| (33) Legal affairs | contracts, investigations | Planned |
| (34) Clinic — student and staff visits, health profiles, medication, guardian notice when sent home, staff sick permissions and sick leave approved by the doctor | students, HR; leave for the staff sick-leave part | Planned — not in the proposal yet (see Open) |

### Layer 4 — needs layer 3

| Module | Needs | Status |
|---|---|---|
| (14) Sales & POS | inventory, cash, the student financial account (fees) | Planned |
| (31) Facilities maintenance | inventory (spare parts), procurement | Planned |
| (32) Printing & copying | inventory (paper), sales/POS (charging) | Planned |
| (30) School security — exit permits on screen, student release | permissions, students, clinic | Planned |

### Layer 5 — read everything, built last

| Module | Needs | Status |
|---|---|---|
| (12) E-invoice | sales, fees, general ledger | Planned |
| (10) Period closing | every module that posts money | Planned |
| (11) Financial reports & dashboard | the finance modules | Planned |
| (25) HR reports | the HR modules | Planned |
| (24) HR integrations | the HR modules | Planned |

The **student financial account** is not a module of its own: one view of a student's fees,
purchases, payments and refunds, built inside fees (4) and sales (14), on student records (27).

## Two tracks

The HR side and the school side don't depend on each other, so they can run at the same time:

- **HR track:** attendance + fingerprint → permissions and leave → part-time → the rest of payroll.
- **School track:** student records → fees, certificates → transportation, clinic.
- **Finance track** starts with the general ledger and vendors; fees, procurement, inventory and
  sales follow it. Payroll's journal entries wait for it.

Student records (27) and the general ledger (2) are the two big gates: everything student-facing
waits on student records, and nothing that posts money can finish without the ledger.

## Build order vs code order

The layers above are the order of **building**. The order **in code** stays as in
`docs/ARCHITECTURE.md` → Module order: accounting (the ledger) sits at the top and listens to other
modules' events (`hr.payroll.approved`, later `fees.payment.recorded`); no module below imports it.
So the ledger is built early, but fees and payroll never depend on it in code. Where the new
modules (procurement, inventory, sales, clinic, security, maintenance, printing, legal) sit in the
code order is decided in each module's design, before it is built.

## Open

- **Clinic (34)** is not in the proposal: it appears only as "security & clinic integration". It
  treats students and staff (owner, 2026-11-24), so it needs adding to the proposal and its price.
- **Exams, grades and the timetable** are not in the proposal: student records & certificates
  cover records and documents, not academics. In or out is the proposal's "academics" blank.
- **The fingerprint device** is not chosen yet. The attendance plan works with any device.
- **A parent portal** (guardians signing in) is not in the proposal; parent notifications are, in
  its phase 4.
- The proposal's phases put payroll last; it was built first for the demo. Its remaining parts
  follow attendance, leave and the general ledger, as above.
