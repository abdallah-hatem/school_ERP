# 2026-11-26 — Penalty actions are a school-managed list, each with one effect on pay

Owner, 2026-11-25 (approved as written 2026-11-26, "Approve, no cap"; spec
`docs/specs/2026-11-25-penalty-actions.md`): a catalogue level's action is no longer a fixed code
but a row of the school's **Penalty actions** list, and what it does to pay is one of five effects
fixed in code. The seed loads today's ten actions with today's names, so nothing reads differently.

- **Penalty actions list (§4, §7):** Settings → Penalty catalogue has a **Penalty actions** card above
  the groups: English and Arabic names (unique in each language), its effect, how many levels use
  it, Show hidden, Add action, Rename and Hide / Show. Never deleted. Managed with the catalogue
  (`hr.penalty_catalogue.manage`), seen by whoever sees it (§2). Every change is in the audit log and
  the change history (§9).
- **Five effects:** Record only · Deduct days of pay · Deduct a % of salary (of the salary for the
  month or the basic salary) · Deduct a fixed amount · Referral to investigation (optionally with
  days). An action's effect and salary are fixed once added: to change them, add a new action and
  hide the old one.
- **Numbers on the level:** the level editor keeps its layout; the number field beside the action
  follows its effect — days, a percent (0.01–100) or an amount in EGP (up to 1,000,000), or none.
- **Hidden actions:** levels that use a hidden action keep it and keep working; it just can't be
  picked for other levels. Hiding one in use says how many levels and violations use it.
- **Snapshot:** an approved penalty keeps its action's names, effect and number; renaming or
  re-pricing later never changes it, its payslip or its History.
- **Payroll (§6):** day deductions are priced as before (all days once); each % is priced from the
  month's payroll line salary at approval, rounded on its own; fixed amounts are added as they are.
  The payslip shows each penalty's own amount ("Deduct 10% of the salary for the month").
- **No monthly cap (owner, 2026-11-26):** the net floor stays — net never below 0, flagged "Deductions
  exceed this month's pay — net set to 0".
- **Dashboard:** the approved-penalties chart's kinds are Notice & warning, Pay deductions (days, %,
  fixed, investigation with days) and Other.
- **Existing data:** every level, penalty and payslip reads as before — the ten actions keep their
  names, and old payslip amounts don't change.
