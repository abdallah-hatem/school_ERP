# 2026-11-21 — Penalties in two steps; employees in several stages

Decided by the owner (§2, §3, §4, §6, §9, §11).

- **Several stages (§3):** an employee has one main stage (card colour, headcount, payroll grouping,
  default display — unchanged) and optional **other stages** ("Also teaches in"), shown as tags on
  their page and card and edited in the employee form. Stage filters and searches find them under
  every stage; each of those stages' heads sees them (§2). Headcount still counts each person once,
  by main stage.
- **The penalty's stage (§4):** every penalty records the stage where the violation happened — filled
  in when the employee has one stage, asked (from their stages only) when they have several. The
  other stage's head doesn't see, isn't told about and can't act on it (§2). Levels still count
  across all stages.
- **Two steps (§4):** Pending stage review → the stage head approves (optional note) or rejects
  (required reason) → Waiting for HR → the HR manager or principal approves (optional note; fixes the
  level and the deduction, with the existing date-order, backdated-recount and approved-month rules)
  or rejects (required reason). Skipped straight to Waiting for HR when the recorder heads that stage,
  when the stage has no head, or when the penalised employee heads it. Nobody acts on their own
  penalty. With no stage head left, HR may decide a penalty still in review. Cancel is unchanged.
- **Permissions (§2):** new **Review penalties (stage head)** — the Stage head, for their own stages;
  existing databases got it. **Approve penalties** stays the HR step.
- **Notifications (§11):** "Penalty waiting for your review" (the stage's head), "waiting for your
  approval" (HR, after the review or when skipped), "Penalty you recorded was rejected" (the
  recorder).
- **Existing data:** penalties pending before this became Waiting for HR; approved and cancelled ones
  are untouched. "Pending" in payroll and the dashboard means waiting at either step; the dashboard's
  Approved tile counts only HR-approved penalties (§6).
- **Leave (Planned, §2):** will need every one of the employee's stage heads, then HR — a decision
  only.
