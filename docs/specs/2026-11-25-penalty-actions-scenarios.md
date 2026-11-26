# Penalty actions — blind test scenarios (business auditor view)

Written from the business rules only: `docs/specs/2026-11-25-penalty-actions.md` (the spec, "Spec"),
`docs/BUSINESS_LOGIC.md` and §2, §4, §6, §7, §9. No code was read.

## Conventions used throughout

- Money in EGP to the piastre. Arithmetic is shown in piastres where rounding matters. "Round" =
  half up to the piastre (§6). Day divisor 30 unless a scenario says otherwise (§7).
- Salary for the month = basic × work-system % (full-time 100%, 4 days 80%, 3 days 60%, 2 days 40%),
  rounded first (§6 steps 1–2).
- Penalty deductions = days part + % part + fixed part (Spec → Payroll steps 1–4). Net = salary for
  the month − penalty deductions − lateness deductions + adjustments, floored at 0 (Spec step 5, §6).
- People (fictional): **Mona** HR manager · **Salma** HR officer · **Adel** principal · **Tarek**
  accountant · **Hany** stage head of Primary · **Rami** direct manager · **Admin** System admin.
  Employees: **Nadia** (Primary, full-time, basic 9,000.00) unless stated otherwise.
- Penalty states: Pending stage review → Waiting for HR → Approved / Rejected / Cancelled (§4).
- Repetition window: contract year 1 June – 31 May (§4, §7).

---

## A. Money — worked examples (S1–S24)

### S1 — One day deducted, round salary
*Rule: Spec Payroll step 1; §6 steps 2–3.*
- **Given** Nadia, full-time, basic 9,000.00. "Absence without notice" level 1 = Deduct days, 1.
- **When** a penalty dated 10 Nov 2026 is approved by HR and November 2026's run is approved.
- **Then** days part = round(1 × 900,000 ÷ 30) = 30,000 → **EGP 300.00**; penalty deductions 300.00;
  net **8,700.00**. Payslip line EN "Deduct 1 day"; AR today's wording for one day (formatDayCount,
  unchanged by this feature). `penalty_days_amount` = `penalty_amount` = 300.00.

### S2 — Half a day at an odd salary
*Rule: Spec Payroll step 1; §6 rounding.*
- **Given** Sami, full-time, basic 7,777.77; level 2 = Deduct days 0.5.
- **When** a penalty dated 3 Dec 2026 is approved; December's run approved.
- **Then** 777,777 × 0.5 ÷ 30 = 12,962.95 → 12,963 → **EGP 129.63**; net 7,777.77 − 129.63 =
  **7,648.14**. EN "Deduct 0.5 day"; AR "خصم نصف يوم".

### S3 — Day deduction exactly on x.xx5
*Rule: §6 "rounded half up, after multiplying"; day value not rounded on its own.*
- **Given** Omar, full-time, basic 9,000.60; level 1 = Deduct days 0.25.
- **When** approved and the month's run approved.
- **Then** 900,060 × 0.25 ÷ 30 = 7,500.5 → 7,501 → **EGP 75.01** (not 75.00). Net **8,925.59**. The
  payslip may show a day value of 300.02 for display only (900,060 ÷ 30 = 30,002).

### S4 — Day deduction for a part-timer
*Rule: §6 steps 1–2; Spec Payroll step 1.*
- **Given** Laila, part-time 4 days (80%), basic 8,765.43. Level = Deduct days 1.
- **When** approved; month approved.
- **Then** salary for the month = round(876,543 × 0.8) = round(701,234.4) = **7,012.34**; days part =
  round(701,234 ÷ 30) = round(23,374.47) = **EGP 233.74**; net **6,778.60**.

### S5 — % of the salary for the month, full-time
*Rule: Spec Payroll step 2; labels table.*
- **Given** action "Salary deduction %" (Deduct a %, base Salary for the month); level 2 = 10%.
- **When** Nadia's penalty dated 10 Nov 2026 is approved; November approved.
- **Then** 900,000 × 1,000 ÷ 10,000 = 90,000 → **EGP 900.00**; net **8,100.00**;
  `penalty_days_amount` 0.00, `penalty_amount` 900.00. EN "Deduct 10% of the salary for the month";
  AR "خصم 10% من أجر الشهر". The action's name is **not** on the payslip line (the label is the effect).

### S6 — % of month vs % of basic, part-timer
*Rule: Spec Decisions "salary base"; walk D step 6; copy `base.*`.*
- **Given** Huda, part-time 3 days (60%), basic 10,000.00 → salary for the month 6,000.00. Two
  actions: A = Deduct % of the salary for the month, B = Deduct % of the basic salary. Both levels 10%.
- **When** (a) a penalty on an A-level, (b) separately in another month a penalty on a B-level,
  each approved and its month approved.
- **Then** (a) 600,000 × 1,000 ÷ 10,000 = **EGP 600.00**, net 5,400.00, EN "Deduct 10% of the salary
  for the month"; (b) 1,000,000 × 1,000 ÷ 10,000 = **EGP 1,000.00**, net 5,000.00, EN "Deduct 10% of
  the basic salary", AR "خصم 10% من الأجر الأساسي". For a full-time employee (a) and (b) are equal.

### S7 — % rounding on x.xx5 and just below
*Rule: Spec Payroll step 2 (integer maths, each rounded half up).*
- **Given** full-time, basic 10,010.00, level = 0.05% of the salary for the month.
- **When** approved and priced.
- **Then** 1,001,000 × 5 ÷ 10,000 = 500.5 → 501 → **EGP 5.01**. Same with basic 10,009.00:
  1,000,900 × 5 ÷ 10,000 = 500.45 → 500 → **EGP 5.00**. Label "Deduct 0.05% of the salary for the month".

### S8 — Two % penalties in one month (spec's own example) and two-decimal %
*Rule: Spec Payroll step 2 example; Edge 16; labels "no trailing zeros".*
- **Given** full-time, basic 9,999.99. Two approved penalties in Feb 2027: 10% and 2.5% (month base).
- **When** February is approved.
- **Then** 10%: 999,999 × 1,000 ÷ 10,000 = 99,999.9 → **1,000.00**; 2.5%: 999,999 × 250 ÷ 10,000 =
  24,999.975 → **250.00**; total **1,250.00**; net **8,749.99**. Labels "Deduct 10% …", "Deduct 2.5% …"
  (never "10.00%" or "2.50%"). Variant: 12.75% → 999,999 × 1,275 ÷ 10,000 = 127,499.87 → **1,275.00**,
  label "Deduct 12.75% of the salary for the month".

### S9 — Each % is rounded on its own, not on the sum
*Rule: Spec Payroll step 2 "each rounded half up … on its own, then summed".*
- **Given** basic 10,010.00, two approved 0.05% penalties in the same month.
- **When** priced.
- **Then** 5.01 + 5.01 = **EGP 10.02** (not round(0.10% × 10,010.00) = 10.01). Net 9,999.98.

### S10 — Days are summed first and priced once
*Rule: Spec Payroll step 1 "summed … priced once"; payslip share rule.*
- **Given** Omar, basic 9,000.60, two approved 0.25-day penalties (two violations) in March 2027.
- **When** March is approved.
- **Then** days part = round(0.5 × 900,060 ÷ 30) = 15,001 → **EGP 150.01** (not 75.01 + 75.01 =
  150.02). Net **8,850.59**. Payslip day shares: 15,001 × 0.25 ÷ 0.5 = 7,500.5 → 75.01 each, which
  shows 150.02 against a line total of 150.01. The **line total is what is paid**.

### S11 — Day shares that don't add up by one piastre
*Rule: §6 payslip share; Spec "only the day shares can differ … by a piastre".*
- **Given** basic 10,000.00, three approved 0.25-day penalties (three violations) in one month.
- **When** the month is approved.
- **Then** days part = round(0.75 × 1,000,000 ÷ 30) = 25,000 → **250.00**; shares 8,333.33 → 83.33
  each (shown total 249.99). Paid deduction 250.00; net **9,750.00**.

### S12 — Fixed amounts and their wording
*Rule: Spec Payroll step 3; labels table; "piastres only when not zero".*
- **Given** three violations with levels Deduct EGP 300, Deduct EGP 150.50, Deduct EGP 1,250.
- **When** each is approved for Nadia in one month and the month is approved.
- **Then** fixed part = 30,000 + 15,050 + 125,000 = **EGP 1,750.50**, no rounding; net **7,249.50**.
  Labels EN "Deduct EGP 300", "Deduct EGP 150.50", "Deduct EGP 1,250"; AR "خصم 300 جنيه",
  "خصم 150.50 جنيه", "خصم 1,250 جنيه" (Western digits).

### S13 — Fixed amount for a part-timer is not scaled
*Rule: Spec Payroll step 3 (no base). See Q8.*
- **Given** Huda, 60%, basic 10,000.00 (month 6,000.00); level = Deduct EGP 300.
- **When** approved; month approved.
- **Then** deduction **EGP 300.00** (not 180.00); net **5,700.00**.

### S14 — Every effect type in one month, full-time
*Rule: Spec Payroll steps 1–4 and payslip amounts; §6 payslip "listed with 0".*
- **Given** Karim, full-time, basic 12,345.67 (1,234,567 piastres). Approved in Feb 2027:
  P1 Deduct days 0.75 · P2 Investigation with 1.25 days · P3 2.5% of the salary for the month ·
  P4 3% of the basic salary · P5 Deduct EGP 150.50 · P6 Warning.
- **When** February is approved.
- **Then**
  - Days part: round(2 × 1,234,567 ÷ 30) = round(82,304.47) = **823.04**
  - P3: 1,234,567 × 250 ÷ 10,000 = 30,864.175 → **308.64**
  - P4: 1,234,567 × 300 ÷ 10,000 = 37,037.01 → **370.37**
  - P5: **150.50**
  - Penalty deductions **1,652.55**; net 12,345.67 − 1,652.55 = **10,693.12**
  - `penalty_days` 2, `penalty_days_amount` 823.04, `penalty_amount` 1,652.55.
  - Payslip: P1 "Deduct 0.75 day" 308.64 (82,304 × 0.75 ÷ 2); P2 "Referral to investigation, 1.25
    days deducted" 514.40; P3 "Deduct 2.5% of the salary for the month" 308.64; P4 "Deduct 3% of
    the basic salary" 370.37; P5 "Deduct EGP 150.50" 150.50; P6 "Warning" 0.00.

### S15 — Mixed effects for a part-timer
*Rule: as S14; base choice.*
- **Given** Laila, 80%, basic 8,765.43 → month 7,012.34. Approved in one month: 1 day; 10% of month;
  10% of basic; EGP 500.
- **When** the month is approved.
- **Then** 233.74 (S4) + 70,123.4 → 701.23 + 87,654.3 → 876.54 + 500.00 = **2,311.51**; net
  7,012.34 − 2,311.51 = **4,700.83**.

### S16 — Penalties with lateness and adjustments
*Rule: Spec step 5; §6 steps 4–6.*
- **Given** Nadia 9,000.00; approved 5% of month and Deduct 1 day; lateness 0.75 day; adjustments
  +500.00 overtime, −100.00 "uniform".
- **When** the month is approved.
- **Then** penalties 450.00 + 300.00 = **750.00** (`penalty_days_amount` 300.00); lateness
  round(0.75 × 900,000 ÷ 30) = **225.00**; net 9,000 − 750 − 225 + 500 − 100 = **8,425.00**.

### S17 — Net would go negative: floor and flag
*Rule: Spec Caps (DECIDED no cap); Edge 17; §6 floor and needs review.*
- **Given** Nadia 9,000.00; approved in Dec 2026: 60% of the salary for the month and Deduct EGP
  5,000; lateness 0.5 day; overtime +500.00.
- **When** December is calculated and approved.
- **Then** penalties 5,400.00 + 5,000.00 = 10,400.00; lateness 150.00; raw net 9,000 − 10,400 − 150 +
  500 = −1,050.00 → **net 0.00**, flag `NET_FLOORED`, line **needs review**, flag text EN
  "Deductions exceed this month's pay — net set to 0", AR "الخصومات تتجاوز أجر الشهر — صافي الأجر
  صفر". No cap applied; nothing carried into January (see Q4). Bank sheet net 0.00, run net counts 0.

### S18 — % of basic for a part-timer larger than the month's pay
*Rule: Edge 18.*
- **Given** employee 2 days (40%), basic 8,000.00 → month 3,200.00; level = 50% of the basic salary.
- **When** approved; month approved.
- **Then** 4,000.00 > 3,200.00 → accepted at recording/approval; net **0.00**, `NET_FLOORED`.

### S19 — 100% exactly
*Rule: Spec effect table (100 allowed); §6 floor. See Q3.*
- **Given** Nadia 9,000.00, level = 100% of the salary for the month.
- **When** approved; month approved.
- **Then** deduction **9,000.00**; net **0.00**. Expected: not "below 0", so no `NET_FLOORED`
  (owner to confirm whether a net of exactly 0 is flagged).

### S20 — Deductions exceed pay, adjustments bring net back above 0
*Rule: Spec step 5 (floor at the end). See Q3.*
- **Given** basic 5,000.00; approved Deduct EGP 6,000; adjustment +2,000.00.
- **When** priced.
- **Then** net 5,000 − 6,000 + 2,000 = **1,000.00**; not floored. Flag: expected none (net was not
  set to 0), but §6's "If deductions exceed the salary … flagged" reads otherwise.

### S21 — Investigation with and without days; record-only actions
*Rule: Spec effect table; payslip "listed with 0"; labels.*
- **Given** Nadia 9,000.00; approved in one month: "Referral to investigation" with no days; another
  violation's level "Referral to investigation" with 2 days; "Loss of the annual raise".
- **When** the month is approved.
- **Then** investigation without days 0.00 — EN "Referral to investigation", AR "إحالة للتحقيق";
  with days round(2 × 900,000 ÷ 30) = **600.00** — EN "Referral to investigation, 2 days deducted",
  AR "إحالة للتحقيق مع خصم يومين"; raise loss 0.00 "Loss of the annual raise" / "الحرمان من العلاوة
  السنوية". Net **8,400.00**.

### S22 — January vs February
*Rule: walk F step 4.*
- **Given** Nadia 9,000.00, a 10% (month) and a 1-day penalty dated 31 Jan 2027, and the same pair
  dated 28 Feb 2027.
- **When** both months are approved.
- **Then** each month: 900.00 + 300.00 = 1,200.00 (÷ 30 in both; % is a share of the month).

### S23 — Divisor changed: days move, % and fixed don't
*Rule: §7 divisor setting affects drafts; Spec steps 1–3.*
- **Given** Feb 2027 draft for Nadia with 1 day, 10% (month) and EGP 200, calculated at divisor 30
  (300.00 + 900.00 + 200.00 = 1,400.00).
- **When** HR rules change the divisor to 26, the draft says the HR rules changed, and is recalculated.
- **Then** days 900,000 ÷ 26 = 34,615.38 → **346.15**; % 900.00; fixed 200.00; total **1,446.15**;
  net **7,553.85**. An approved January is untouched.

### S24 — Seeded "Deduct days" penalty, unchanged pricing after the feature
*Rule: Spec "the seed loads today's actions exactly"; Payroll step 1 "unchanged".*
- **Given** level "Late to class" level 2 = seeded action "Deduct days", 0.5 (as before migration).
- **When** Nadia's penalty is approved in Jan 2027 and January is approved.
- **Then** 150.00 deducted, label "Deduct 0.5 day" / "خصم نصف يوم" — identical to a pre-feature
  month.

---

## B. Flows end to end (S25–S32)

### S25 — Full two-step flow with a % penalty
*Rule: §4 two steps; §2 who acts; Spec snapshot at HR approval; §6 approve recalculates.*
- **Given** violation "Absence without notice" level 1 = "Salary deduction %" (month base) 10%. Nadia
  in Primary (head Hany). November 2026 draft exists.
- **When / Then**
  1. **12 Nov** Rami (direct manager) records, dated 11 Nov → status **Pending stage review**;
     shows level 1, "Deduct 10% of the salary for the month"; no EGP anywhere for Rami.
  2. **13 Nov** Hany approves (note "confirmed") → **Waiting for HR**; still today's catalogue.
  3. **14 Nov** Mona approves → **Approved**, level 1 fixed; snapshot: names "Salary deduction %" /
     "خصم نسبة من الراتب", `DEDUCT_PERCENT`, `MONTH_SALARY`, 10%; no money on the penalty.
  4. **25 Nov** Salma recalculates the draft → Nadia's line 900.00 penalty, net 8,100.00.
  5. **30 Nov** Mona approves November → recalculates, locks; payslip EN "Absence without notice —
     level 1 — Deduct 10% of the salary for the month — 900.00"; AR "خصم 10% من أجر الشهر — 900.00".

### S26 — Recorded by the stage head: skips stage review
*Rule: §4 skip rules; §2 principal approves HR step.*
- **Given** Hany records a Deduct EGP 300 penalty for Nadia (Primary).
- **When** saved.
- **Then** straight to **Waiting for HR** with "No stage review: …" (recorder is the stage head).
  Adel (principal) approves → Approved, snapshot "Deduct EGP 300". Adel sees "Deduct EGP 300" (catalogue
  data) but on the payroll line no money (§2). Month approval deducts 300.00.

### S27 — Rejected at the stage review
*Rule: §4 rejected are final, never count.*
- **Given** a Pending stage review penalty "Deduct 2 days" for Nadia, dated 5 Jan 2027.
- **When** Hany rejects with reason "Was on an approved errand".
- **Then** **Rejected**; costs nothing; not on the January payslip; not counted toward the next level
  (Nadia's next one is still level 1); reason shown on the penalty and in History; recorder notified.

### S28 — Rejected at HR
*Rule: §4.*
- **Given** Waiting for HR, Deduct 5% (month).
- **When** Mona rejects with an empty reason → refused; with "Duplicate of 4 Jan" → **Rejected**.
- **Then** no deduction, no level; one rejection entry in History.

### S29 — Approved, then cancelled before the month is approved
*Rule: §4 GUESS cancel approved; §6 approve recalculates.*
- **Given** January draft calculated with Nadia's approved EGP 300 (net 8,700.00).
- **When** Adel cancels it with reason "Wrong employee", then Mona approves January.
- **Then** approval recalculates: penalty gone, net **9,000.00**; payslip has no line for it.

### S30 — Month can't be approved with a pending penalty
*Rule: §6 "can't be approved while it still has pending penalties".*
- **Given** Feb 2027 draft; a 10% penalty dated 20 Feb is Pending stage review.
- **When** Mona tries to approve February.
- **Then** refused; Nadia's line needs review (pending penalty). After Hany and Mona approve it, the
  month approves and deducts 900.00.

### S31 — Approved penalty after the last calculation, before approval
*Rule: walk C step 1; §6 Approve recalculates. See Q6.*
- **Given** November draft calculated 25 Nov; a 10% penalty dated 26 Nov approved 28 Nov.
- **When** someone opens the draft on 29 Nov; then Mona approves on 30 Nov.
- **Then** 29 Nov: line still shows the 25 Nov figure (no 900.00 yet). 30 Nov: approval recalculates;
  final line deducts **900.00**.

### S32 — Accounting returns the month to HR
*Rule: walk C step 3; §10 return to draft.*
- **Given** November approved with Nadia's 10% = 900.00 at basic 9,000; on 3 Dec her basic is 9,500.
- **When** Accounting returns November to HR and HR recalculates.
- **Then** the 10% reprices from the line's new salary: **950.00**; net 8,550.00. (Confirm this is
  wanted, since the payslip may already have been issued.)

---

## C. Time (S33–S47)

### S33 — Rename and re-price after approval (walk A)
*Rule: Spec snapshot; walk A; Edge 13–14.*
- **Given** 10 Nov approved penalty: "Salary deduction %", 10%.
- **When** 20 Nov the action is renamed "Pay deduction %" and level 2 set to 5%; 30 Nov November approved;
  5 Dec level 2 set to 7%.
- **Then** November deducts **900.00** (10%), payslip "Deduct 10% of the salary for the month";
  penalty details show "Salary deduction %". After 5 Dec nothing in November changes; a new level-2
  penalty for Nadia approved in December gets 7% and the name "Pay deduction %" (630.00 at 9,000).

### S34 — Re-pricing does not touch a draft run
*Rule: Spec "a catalogue edit never touches a draft"; Edge 14.*
- **Given** December draft calculated with Nadia's approved 10% (900.00).
- **When** the level goes to 20% and the draft is recalculated.
- **Then** still **900.00**; no "changed since the last calculation" message from the catalogue edit.

### S35 — Re-priced or renamed while waiting
*Rule: §4 "waiting penalties show today's catalogue"; Spec snapshot "refreshed … fixed at HR approval"; Edge 12. See Q5.*
- **Given** penalty Pending stage review on a level "Deduct 0.5 day".
- **When** Hany approves it (→ Waiting for HR); then Mona edits the level to "Deduct EGP 500"; then
  Mona approves.
- **Then** while waiting it shows "Deduct EGP 500"; approval fixes **EGP 500**; payroll deducts 500.00.
  The HR approval entry shows the action fixed at approval differs from recording ("Deduct 0.5 day →
  Deduct EGP 500").

### S36 — Level switched from days to % while waiting
*Rule: Edge 15.*
- **Given** Waiting for HR on a level "Deduct 1 day".
- **When** the level is changed to "Deduct 10% of the basic salary" and Mona approves.
- **Then** penalty fixed as 10% of basic; Nadia's month deducts 900.00 instead of 300.00.

### S37 — Hiding an action in use (walk B)
*Rule: Spec "Hiding … they keep it"; Edge 9, 23.*
- **Given** "Referral to investigation" on 6 levels in 5 violations; "Fighting at school" level 4 =
  investigation, 2 days.
- **When** 1 Dec Mona hides it; 3 Dec Sami's 4th "Fighting" is recorded and approved; 4 Dec she renames
  "Fighting at school"; she tries to pick the action for "Leaving the school"; 10 Dec she sets level 4
  to "Warning"; 11 Dec she shows the action.
- **Then** hide dialog "Used on 6 levels in 5 violations. They keep it; it can't be picked for other
  levels."; Sami's penalty gets investigation + 2 days, December deducts 2 days; rename saves, level 4
  reads "Referral to investigation (hidden)"; picking it elsewhere → `PENALTY_ACTION_HIDDEN` and the
  picker doesn't list it; after 10 Dec pending level-4 penalties show "Warning", Sami's approved one
  keeps investigation and 2 days; after 11 Dec pickable everywhere.

### S38 — Salary raised between penalty approval and payroll approval (walk D)
*Rule: Spec "Which salary a % uses"; §6 no effective date.*
- **Given** 10 Nov: 10% (month) approved; 20 Nov draft: 900.00 at basic 9,000; Nadia also has a
  1-day penalty in November.
- **When** 25 Nov basic → 10,000; 30 Nov November approved.
- **Then** approval recalculates: salary 10,000.00; 10% = **1,000.00**; 1 day = round(1,000,000 ÷ 30)
  = **333.33**; total 1,333.33; net **8,666.67**. Payslip shows 10,000.00 beside "Deduct 10% …".

### S39 — Salary cut after the month is approved
*Rule: walk D step 5; §6 snapshot.*
- **Given** S38 approved.
- **When** 5 Dec basic back to 9,000.
- **Then** November's line, payslip and penalty amounts unchanged (1,000.00 / 333.33).

### S40 — Backdated penalty shifts levels across effect types (walk E)
*Rule: §4 recount; Spec walk E; Edge 22.*
- **Given** "Late to class": L1 Notice, L2 Deduct 0.5 day, L3 5% of month, L4 Deduct EGP 300. Omar
  (basic 9,000) approved: 19 Nov L1, 20 Nov L2, 21 Nov L3. November draft deducts 150.00 + 450.00 =
  600.00.
- **When** 24 Nov a late dated 18 Nov is recorded; 25 Nov approved with "Approve and update 3 penalties".
- **Then** preview: "Approving this will raise the level of 3 approved penalties: 19 Nov 2026: level
  1 → 2, Notice → Deduct 0.5 day; 20 Nov: level 2 → 3, Deduct 0.5 day → Deduct 5% of the salary for the
  month; 21 Nov: level 3 → 4, Deduct 5% of the salary for the month → Deduct EGP 300". Draft says
  "Penalties changed since the last calculation". After recalc: 150.00 + 450.00 + 300.00 = **900.00**;
  net **8,100.00**.

### S41 — Recount takes today's numbers, not the ones at first approval
*Rule: §4 recount "catalogue as it is today".*
- **Given** as S40, but on 22 Nov level 3 was changed from 5% to 7%.
- **When** the 18 Nov penalty is approved.
- **Then** 20 Nov moves to level 3 at **7%** = 630.00 (not 450.00); 21 Nov at EGP 300; 19 Nov 0.5 day
  150.00. Total **1,080.00**. Each moved penalty has its own `hr.penalty.recount` entry.

### S42 — Recount blocked by an approved month
*Rule: §4 "Not into an approved month".*
- **Given** Omar: 28 Oct 2026 L1 Notice (approved), 3 Nov L2 0.5 day (approved). October payroll
  approved; November draft.
- **When** HR records a late dated 27 Oct.
- **Then** refused at recording (the 28 Oct penalty would move, October is approved): the preview shows
  the error naming October 2026. Also refused if the 27 Oct date is itself in October. A later
  late dated 5 Nov → normal (level 3, 5%).

### S43 — Approved on the 1st of the next month
*Rule: walk F steps 1–2; §4 "month the violation happened".*
- **Given** a 10% penalty dated 30 Nov 2026, recorded 30 Nov 14:00; November draft.
- **When** Mona approves on 1 Dec 2026 09:00; November approved 2 Dec.
- **Then** counted in **November** (900.00); December's run doesn't include it.

### S44 — Last day of the month, near midnight
*Rule: walk F step 5 (Cairo dates).*
- **Given** January 2027 draft.
- **When** (a) a penalty dated 31 Jan 2027 is approved 31 Jan 23:50; (b) another is dated 1 Feb 2027,
  recorded 1 Feb 00:10 Cairo time.
- **Then** (a) in January's run once approved/recalculated; (b) in February, never January.

### S45 — Repetition window boundary changes the effect
*Rule: walk F step 3; §4 contract year.*
- **Given** "Late to class" as S40; Omar has L1 and L2 approved in May 2027.
- **When** a late dated 31 May 2027 is approved; then one dated 1 June 2027.
- **Then** 31 May → level 3, 5% (450.00 in May's run); 1 June → new contract year, **level 1 Notice**,
  0.00 in June's run.

### S46 — Penalty for a month whose payroll is already approved
*Rule: §4 month lock; walk C step 2; Edge 21.*
- **Given** November 2026 approved on 30 Nov.
- **When** on 2 Dec HR records a 10% penalty dated 29 Nov; separately tries to cancel an approved
  November EGP 300 penalty.
- **Then** both refused ("the month's payroll is approved"); no History entries; correction is a
  December adjustment with a reason (e.g. −900.00 "November absence penalty").

### S47 — The walk F "approved at 16:00 while pending" case
*Rule: §6 pending penalties block approval vs Spec walk F step 2. See Q1.*
- **Given** a 10% penalty dated 30 Nov recorded 14:00, still waiting.
- **When** Mona tries to approve November at 16:00.
- **Then** expected per §6: **refused** (pending penalty). The spec's walk says November "had been
  approved at 16:00" and the 1 Dec approval refused — that sequence should be impossible.

---

## D. Permissions (S48–S55)

### S48 — Who manages penalty actions
*Rule: Spec "Users and permissions"; §7 read-only sections.*
- **Given** Mona (HR manager), Admin, Salma (HR officer), Adel (principal).
- **When** each tries Add action / Rename / Hide.
- **Then** Mona and Admin succeed (audited). Salma and Adel see the card read-only (no Add, no ⋯
  menu); a direct write is refused (no `hr.penalty_catalogue.manage`).

### S49 — Stage head without salary access
*Rule: Spec "a % or fixed amount … is catalogue data"; Edge 19; §2 salaries.*
- **Given** Hany (no salary access); a Primary penalty "Deduct EGP 300" and one "Deduct 10% of the
  salary for the month".
- **When** he views the catalogue, the penalties, and the payroll line of Nadia.
- **Then** sees "Deduct EGP 300" and "Deduct 10% of the salary for the month" on levels and penalties;
  never 900.00, never a salary, no payslip money. See Q7.

### S50 — Principal approves a % penalty at the HR step
*Rule: §2 principal: lines without money; Spec permissions.*
- **Given** Adel, Waiting for HR, 10% of month.
- **When** he approves and later opens November's run.
- **Then** approval allowed, sees the label only; on the line sees days deducted (0 for a %
  penalty), flags (e.g. `NET_FLOORED`) and run totals, never Nadia's 900.00. See Q9.

### S51 — Accountant
*Rule: §2 salaries viewers; Spec "the payslip adds amount priced, for salary viewers only".*
- **Given** Tarek, no catalogue view.
- **When** he opens Nadia's November payslip (S14 style).
- **Then** sees each label and priced amount (308.64, 370.37, 150.50 …); Settings → Penalty
  catalogue is not in his Settings.

### S52 — Direct manager sees fixed amount on own team
*Rule: Spec permissions; §2 direct manager scope.*
- **Given** Rami manages Nadia, not Sami.
- **When** he lists penalties.
- **Then** sees Nadia's "Deduct EGP 300"; Sami's penalties absent; opening Sami's → "We couldn't find
  that page".

### S53 — Other stage's head
*Rule: §2 "penalties go by the penalty's stage".*
- **Given** Nadia also teaches in Prep (head Dina); penalty recorded in Primary, Deduct 5%.
- **When** Dina looks.
- **Then** she doesn't see it; if it blocks or recounts something of hers she only gets the "in another
  stage" wording, with no date, level, action or number.

### S54 — Activity log for a non-salary viewer
*Rule: Spec Audit "percent or fixed amount is not hidden"; §9 amount hidden.*
- **Given** Adel holds view activity log, no salaries.
- **When** he reads Nadia's penalty entries and her salary change entry.
- **Then** penalty entries read "Deduct EGP 300" / "Deduct 10% of the salary for the month" in full;
  the salary edit reads "Changed (amount hidden)".

### S55 — Self-penalty still blocked whatever the effect
*Rule: §4 nobody approves/cancels own penalty.*
- **Given** Mona is penalised with "Deduct EGP 1,000".
- **When** Mona tries to approve or cancel it.
- **Then** refused ("You can't review, approve, reject or cancel a penalty given to you"); Adel
  approves.

---

## E. Edge and bad input (S56–S63)

### S56 — Percent validation
*Rule: Spec effect table; Edge 3; copy PERCENT_INVALID.*
- **When** a level of a Deduct-% action is saved with 0, −5, 12.345, 100.01, blank.
- **Then** first four → `INVALID_LEVELS` `PERCENT_INVALID` "Enter a percent above 0 and up to 100, with
  at most two decimals." / "أدخل نسبة أكبر من 0 وحتى 100، بخانتين عشريتين على الأكثر."; blank →
  `PERCENT_REQUIRED`. 0.01, 12.34, 100 → saved. See Q10 on §7's "percentages 1–100".

### S57 — Amount validation
*Rule: Spec effect table; Edge 4.*
- **When** a Deduct-amount level is saved with 0, −50, 10.005, 1,000,000.01, blank.
- **Then** first four → `AMOUNT_INVALID`; blank → `AMOUNT_REQUIRED`. 0.01 and 1,000,000.00 saved
  (label "Deduct EGP 1,000,000").

### S58 — Days off the allowed steps
*Rule: Spec effect table; Edge 2; §4 list; §7 days rule. See Q2.*
- **When** a Deduct-days level is saved with 0, −1, 0.3, 30.25, 31, blank.
- **Then** 0, −1, 0.3, 30.25, 31 → `DAYS_INVALID`; blank → `DAYS_REQUIRED`. 0.25, 5.25, 30 saved.

### S59 — Number on an action that takes none, or the wrong number
*Rule: Spec Data "exactly the number the action's effect asks for"; Edge 1, 5.*
- **When** (a) Warning level with days 1; (b) Deduct-% level with days 1 and percent 10; (c) Deduct
  days with amount 300; (d) Investigation with no days; (e) Investigation with days 0.
- **Then** (a) `VALUE_NOT_ALLOWED` "This action takes no number."; (b),(c) refused (expected
  `VALUE_NOT_ALLOWED` for the extra number); (d) saved, costs 0; (e) expected `DAYS_INVALID` (see
  Q11).

### S60 — Adding and editing actions: bad input
*Rule: Spec API DTO rules; Edge 6–8, 29.*
- **When** (a) Deduct % with no base; (b) Deduct amount with base "Basic salary"; (c) PATCH effect
  Record only → Deduct days; (d) PATCH percentBase; (e) name "warning" (exists as "Warning");
  (f) Arabic name equal to a hidden action's; (g) 101-character name; (h) "   " name; (i) two managers
  add "Late fine" at the same moment.
- **Then** (a),(b) 400; (c),(d) `PENALTY_ACTION_EFFECT_LOCKED` "An action's effect can't be changed.
  Add a new action and hide this one."; (e),(f) 409 `PENALTY_ACTION_NAME_TAKEN`; (g),(h) 400; (i) one
  succeeds, the other gets `PENALTY_ACTION_NAME_TAKEN`. None of the refused ones is audited.

### S61 — Hidden / missing / deleting actions
*Rule: Edge 9–11.*
- **When** a level picks a hidden action it didn't have; keeps a hidden one it had; names a
  non-existent id; someone asks to delete an action.
- **Then** `PENALTY_ACTION_HIDDEN`; saved; `PENALTY_ACTION_NOT_FOUND` "Pick an action from the list.";
  no delete exists — only hide.

### S62 — Switching a level's action in the dialog
*Rule: Spec Screens "keeps a typed number only when the unit is the same".*
- **When** level has Deduct days 2, user switches to a school-added "Deduct days (late)" action, then
  to a Deduct-% action.
- **Then** 2 kept on the first switch; cleared on the % switch (Percent field empty, "%" suffix,
  hint "of the salary for the month").

### S63 — Max deduction in a month (no cap)
*Rule: Spec Caps DECIDED.*
- **Given** Nadia 9,000; in one month: 30 days + 100% + EGP 1,000,000.
- **When** priced.
- **Then** 9,000 + 9,000 + 1,000,000 accepted; net 0.00 floored; no cap message.

---

## F. Migration and seed (S64–S68)

### S64 — Ten actions created
*Rule: Spec Migration step 1; seeded names.*
- **Then** exactly ten actions in today's order: Notice / لفت نظر (Record only) · Warning / إنذار
  (Record only) · Deduct days / خصم أيام (Deduct days) · Referral to investigation / إحالة للتحقيق
  (Investigation) · Loss of half the annual raise · Loss of the annual raise · Annual raise deferred
  3 months · Pay cut by one annual raise · Demotion · Dismissal (all Record only). All shown.

### S65 — Levels and waiting penalties read as before
*Rule: Migration steps 2–3.*
- **Given** before migration: "Late to class" L2 Deduct days 0.5; "Fighting" L4 investigation 2; a
  Waiting-for-HR penalty on L2.
- **Then** after: same levels, same days, labels "Deduct 0.5 day", "Referral to investigation, 2 days
  deducted"; the waiting penalty shows the same; level counts unchanged.

### S66 — Approved runs and payslips unchanged
*Rule: Migration steps 4, 6; Edge 25.*
- **Given** October 2026 approved: Nadia 1.5 days = 450.00, net 8,550.00; run net X.
- **Then** after migration: `penalty_days_amount` = 450.00 = `penalty_amount`; payslip, net and run net
  identical; each payslip penalty share identical.

### S67 — Old History entries
*Rule: Edge 26; §9 log never rewritten.*
- **Then** a 2026-11-15 `hr.penalty.approve` entry holding `DEDUCT_DAYS` still reads "Deduct days" /
  "خصم أيام" in EN and AR; a catalogue change from 2026-11-10 still reads.

### S68 — Seed run again; school data kept; dashboard kinds
*Rule: Migration step 7; Edge 27–28, 31.*
- **Given** the school renamed Warning to "Written warning" and hid Dismissal; added "Verbal note"
  (Record only) and "Late fine" (Deduct amount).
- **When** seed runs twice.
- **Then** still ten seeded rows plus the two school ones; "Written warning" and hidden Dismissal stay;
  a catalogue file naming code `FINE` stops the seed with a clear error. Dashboard chart: Written
  warning → "Notice & warning"; Verbal note → "Other"; Late fine and investigation-with-days → "Pay
  deductions".

---

## G. Audit and History (S69–S72)

### S69 — Action changes and Settings change history
*Rule: Spec Audit table; §7 change history; §9.*
- **When** Mona adds "Salary deduction %" (Deduct %, month base, order 11), renames it, moves it to
  order 3, hides it, shows it.
- **Then** five entries on the action: create (names EN/AR, effect "Deduct a % of salary", base
  "Salary for the month", order 11); update names before → after; update order 11 → 3; update Shown →
  Hidden; Hidden → Shown. All appear in Settings → View change history (catalogue), with who and when.
  Refused attempts (S60) leave none.

### S70 — Violation edit entry
*Rule: Spec Audit `hr.violation.update`.*
- **When** "Absence without notice" level 2 goes from Deduct 1 day to 10% (month).
- **Then** one entry "Level 2: Deduct 1 day → Deduct 10% of the salary for the month", in both
  languages; after a later rename of the action, this old entry keeps the name as then.

### S71 — Penalty lifecycle entries
*Rule: §9 penalty entries; Spec Audit `hr.penalty.*`.*
- **Given** S25 and S40.
- **Then** S25: record (employee, violation, date 11 Nov, level "1st time", "Deduct 10% of the salary
  for the month", status Pending stage review); stage review approval (→ Waiting for HR, note);
  HR approval (Waiting for HR → Approved; level/action fixed shown only if different from recording).
  S40: HR approval of 18 Nov + three `hr.penalty.recount` entries (date, level, action and number
  before → after, and "moved by the 18 Nov 2026 penalty"). None holds 900.00.

### S72 — Payroll entries
*Rule: §9 payroll run History.*
- **Given** S40's November draft.
- **When** recalculated, then approved.
- **Then** Recalculated: only the totals that changed (penalty deductions +300.00, net −300.00);
  Approved: one entry Draft → Approved with the run's net; no per-employee penalty entries. A viewer
  without whole-school payroll gets "We couldn't find that page" on the run's History.

---

## Scenario count by area

| Area | Scenarios | Count |
|---|---|---|
| A. Money | S1–S24 | 24 |
| B. Flows | S25–S32 | 8 |
| C. Time | S33–S47 | 15 |
| D. Permissions | S48–S55 | 8 |
| E. Edge / bad input | S56–S63 | 8 |
| F. Migration / seed | S64–S68 | 5 |
| G. Audit | S69–S72 | 4 |
| **Total** | | **72** |

---

## Questions for the owner (ambiguities and contradictions)

**Q1 — Walk F contradicts §6's pending-penalty block.** Spec walk F step 2: "If November had been
approved on 30 Nov at 16:00, the 1 Dec approval is refused". §6: "A month can't be approved while it
still has pending penalties." A penalty recorded at 14:00 and still waiting blocks a 16:00 approval.
Reading A: §6 wins, the walk's case is impossible (it would need a cancel then a re-record). Reading
B: some path approves a month with waiting penalties. **Expect A** (S47); fix the walk.

**Q2 — Allowed days.** §4 lists "N can be ¼ … 5"; §7 says "days in quarter steps from **0** to 30";
Spec says "more than 0 and at most 30". Reading A: >0 to 30 (Spec). Reading B: 0 allowed (§7) or ≤5
(§4). **Expect A**, and §4/§7 edited to match.

**Q3 — When is a line flagged `NET_FLOORED`?** §6: "If deductions exceed the salary, net is 0 and the
line is flagged". Spec flag text "net set to 0". Cases: (a) net exactly 0 (100% deduction, S19);
(b) deductions > salary but positive adjustments keep net above 0 (S20). Reading A: flag only when the
raw net is below 0. Reading B: flag whenever deductions ≥ / > salary for the month. **Expect A**, but
(a) a 100% deduction arguably deserves review too.

**Q4 — What happens to the part not deducted when net floors at 0?** With no cap, a 60% + EGP 5,000
month loses 1,050.00 of deduction. Reading A: it's simply not collected (written off). Reading B: it
carries to next month. Docs are silent; also: how does the payslip show it — full penalty amounts
(and then lines don't add up to net 0) or a "not deducted" line? **Expect A** with a visible "not
deducted EGP 1,050.00" on the payslip.

**Q5 — Catalogue edits after the stage head reviewed.** Waiting penalties show today's catalogue and
the snapshot fixes at HR approval. Hany approves "Deduct 0.5 day"; then the level becomes "Deduct EGP
500" (or Record only → a deduction) and HR approves it. Reading A: fine, HR approves today's catalogue
(Spec as written). Reading B: a change of effect or number after the stage review needs a new stage
review, or at least a warning to HR. **Expect A plus a visible "changed since the stage review" note.**

**Q6 — Stale draft after a plain approval/cancel.** §6 shows "Penalties changed since the last
calculation" only for a **recount**. A penalty newly approved or cancelled after the last calculation
(S31) leaves the draft showing an old figure with no banner. Reading A: no banner, approval
recalculates anyway. Reading B: banner for any approved/cancelled penalty in the month. **Expect B**
(more so now a single % or fixed penalty can be large).

**Q7 — Fixed amount is "catalogue data" but it *is* the money taken.** Edge 19: the stage head sees
"Deduct EGP 300" but "the EGP taken from the employee on payroll → only for salary viewers". These
are the same number unless the net floors. Reading A: show the catalogue amount, hide only the payroll
figure (as written). Reading B: hide fixed amounts from non-salary viewers. **Expect A**, but confirm
the owner is fine that a stage head sees exact EGP penalties.

**Q8 — Fixed amount for part-timers.** Not stated whether EGP 300 is scaled by the work-system %.
Reading A: not scaled (300 for everyone). Reading B: scaled like the salary (180 at 60%). **Expect A**
(S13); state it in §6.

**Q9 — Principal's view of a line with % or fixed penalties.** §2: the principal sees "days deducted"
but no money. A % or fixed penalty adds 0 days, so Nadia's line reads "0 days deducted" though pay was
cut; a `NET_FLOORED` flag together with a visible "Deduct EGP 5,000" also tells him her pay is under
~EGP 5,000. Reading A: unchanged (days only). Reading B: show the penalty labels on the line, no money.
**Expect B**, and confirm the inference leak is acceptable.

**Q10 — §7 "percentages 1–100".** §7's validation line says percentages are 1–100; the Spec allows a
level percent 0.01–100. Reading A: §7's rule is only for part-time percentages. Reading B: it applies
to all percentages, so 0.5% is refused. **Expect A** (the proposed §7 edit adds the level rule).

**Q11 — Investigation with "0 days".** "Days optional; as Deduct days when given." Reading A: 0 means
"no days" and is saved as none. Reading B: 0 is refused as `DAYS_INVALID`. **Expect B** (S59e); confirm
the screen's "Optional" field leaves it empty, not 0.

**Q12 — Payslip shows the label, not the action's name.** For deducting effects the payslip shows
"Deduct 10% …" and never the school's action name; two school actions with the same effect ("Deduct
days" and "Deduct days (late)") look identical on payslips. Reading A: fine (Spec). Reading B: show
the name too. **Expect A**, confirm.

**Q13 — % of basic on the payslip.** The Spec justifies the month-salary base by "the payslip shows
that salary beside the deduction". For a % of **basic** on a part-timer the payslip (§6: "salary")
may not show the basic, so 10% → 1,000.00 next to a 6,000.00 salary doesn't add up for the employee.
Reading A: the payslip shows basic too. Reading B: it doesn't. **Expect A.**

**Q14 — Payslip day-share rounding.** Shares "can differ by a piastre" but the rounding method isn't
stated (half up each? largest remainder so they sum?). S10 shows half-up gives 150.02 against 150.01.
**Expect half up** (as written), confirm a payslip that visibly doesn't add up is acceptable.

**Q15 — Returned month repriced.** Walk C step 3: when Accounting returns an approved month, a % is
repriced from the salary at the new calculation (S32), so an issued payslip can change. Reading A:
intended. Reading B: penalties should keep the amounts of the first approval. **Expect A**, confirm.

**Q16 — Name uniqueness and Arabic letter variants.** Names are unique "case-insensitively"; §7's
search ignores Arabic letter variants (أ/ا, ة/ه). Are "إنذار" and "انذار" two names? Reading A:
different (only case). Reading B: same. **Expect B** for consistency with search.

**Q17 — Business docs still say the old rule.** §4 ("Each level has one action: notice, warning,
deduction of N days…"; the OPEN monthly cap), §6 step 3 (days only), §6 dashboard kinds ("day
deductions"), §9 ("A penalty has no amount (it is days)"). The Spec's edits are "not applied". Reading
A: applied in the same PR as the build. Reading B: later. **Expect A**; until then the docs and the
system disagree.

**Q18 — "Eleven" vs ten actions.** The owner's brief said "eleven kinds", the Spec seeds ten
(investigation with/without days as one). The approval covers it, but if the owner counted
"investigation with days" separately, the seed would need two rows. **Expect ten** (as approved).

**Q19 — Hide dialog counts.** "Used on 12 levels in 9 violations": do retired violations count?
Reading A: yes (they still hold the action). Reading B: only active violations. **Expect A**, but say
"including retired" if so.

**Q20 — OPEN still standing: investigation before a deduction.** §4: "OPEN — whether an investigation
is needed before a deduction." With % and fixed amounts the question is sharper; the Spec doesn't
touch it. Confirm it stays OPEN.
