import {
  ErrorCode,
  PenaltyReviewSkip,
  PenaltyStatus,
  PenaltyStep,
} from '@school-erp/shared';

/*
 * The two-step penalty flow (§4 DECIDED, owner 2026-11-21): "record penalty => approve or reject
 * (reasons) => hr approval or reject (reasons)".
 *
 *   recorded ─► PENDING_REVIEW ──(stage head approves)──► WAITING_HR ──(HR approves)──► APPROVED
 *                     │                                        │
 *                     └──(stage head rejects, reason)──► REJECTED ◄──(HR rejects, reason)
 *
 * PENDING_REVIEW, WAITING_HR and APPROVED can be cancelled (as before). REJECTED and CANCELLED are
 * final. Only the HR approval fixes the level and the deduction (`penalties.ts`). Pure: who heads a
 * stage, who acts and what is stored come in as arguments.
 */

/** What someone asks to do to a penalty. */
export type PenaltyDecision = 'REVIEW_APPROVE' | 'REVIEW_REJECT' | 'HR_APPROVE' | 'HR_REJECT' | 'CANCEL';

/** Why a decision can't be taken from the penalty's status (each a 409). */
export type PenaltyTransitionRefusal =
  | typeof ErrorCode.PENALTY_CANCELLED
  | typeof ErrorCode.PENALTY_REJECTED
  | typeof ErrorCode.PENALTY_WRONG_STEP;

export type PenaltyTransition =
  | { ok: true; to: PenaltyStatus }
  | { ok: false; refusal: PenaltyTransitionRefusal };

export interface TransitionFacts {
  /**
   * The penalty waits for a stage review nobody can give any more — its stage has no stage head
   * left (owner 2026-11-21, edge case 3): the HR step may then approve or reject it directly.
   */
  hrMayDecide?: boolean;
}

const ALLOWED: Readonly<Record<PenaltyDecision, Partial<Record<PenaltyStatus, PenaltyStatus>>>> = {
  REVIEW_APPROVE: { [PenaltyStatus.PENDING_REVIEW]: PenaltyStatus.WAITING_HR },
  REVIEW_REJECT: { [PenaltyStatus.PENDING_REVIEW]: PenaltyStatus.REJECTED },
  HR_APPROVE: { [PenaltyStatus.WAITING_HR]: PenaltyStatus.APPROVED },
  HR_REJECT: { [PenaltyStatus.WAITING_HR]: PenaltyStatus.REJECTED },
  CANCEL: {
    [PenaltyStatus.PENDING_REVIEW]: PenaltyStatus.CANCELLED,
    [PenaltyStatus.WAITING_HR]: PenaltyStatus.CANCELLED,
    [PenaltyStatus.APPROVED]: PenaltyStatus.CANCELLED,
  },
};

/**
 * Where `decision` takes a penalty now in `status`, or why it can't: a cancelled or rejected one is
 * final; anything else at the wrong step is `PENALTY_WRONG_STEP` (someone acted first, or the
 * request is for the other step).
 *
 * @example penaltyTransition('PENDING_REVIEW', 'REVIEW_APPROVE') // { ok: true, to: 'WAITING_HR' }
 * @example penaltyTransition('PENDING_REVIEW', 'HR_APPROVE')     // { ok: false, refusal: 'PENALTY_WRONG_STEP' }
 * @example penaltyTransition('PENDING_REVIEW', 'HR_APPROVE', { hrMayDecide: true }) // → APPROVED
 */
export function penaltyTransition(
  status: PenaltyStatus,
  decision: PenaltyDecision,
  facts: TransitionFacts = {},
): PenaltyTransition {
  if (status === PenaltyStatus.CANCELLED) return { ok: false, refusal: ErrorCode.PENALTY_CANCELLED };
  if (status === PenaltyStatus.REJECTED) return { ok: false, refusal: ErrorCode.PENALTY_REJECTED };
  const to = ALLOWED[decision][status];
  if (to) return { ok: true, to };
  if (
    facts.hrMayDecide === true &&
    status === PenaltyStatus.PENDING_REVIEW &&
    (decision === 'HR_APPROVE' || decision === 'HR_REJECT')
  ) {
    return { ok: true, to: decision === 'HR_APPROVE' ? PenaltyStatus.APPROVED : PenaltyStatus.REJECTED };
  }
  return { ok: false, refusal: ErrorCode.PENALTY_WRONG_STEP };
}

/** The statuses a decision may start from (the conditional update's `where status in …`). */
export function decisionFrom(decision: PenaltyDecision, facts: TransitionFacts = {}): PenaltyStatus[] {
  const from = Object.keys(ALLOWED[decision]) as PenaltyStatus[];
  if (facts.hrMayDecide === true && (decision === 'HR_APPROVE' || decision === 'HR_REJECT')) {
    from.push(PenaltyStatus.PENDING_REVIEW);
  }
  return from;
}

/** The step a rejection is recorded at: the stage review, or HR (also for a review HR took over). */
export function rejectionStep(decision: 'REVIEW_REJECT' | 'HR_REJECT'): PenaltyStep {
  return decision === 'REVIEW_REJECT' ? PenaltyStep.REVIEW : PenaltyStep.HR;
}

/** Longest reason or note a person can type (the same as a cancel reason). */
export const PENALTY_TEXT_MAX = 1000;

/**
 * A rejection reason as stored: trimmed; null when blank or too long — a rejection needs a real
 * reason (owner 2026-11-21). Any script is fine (Arabic, English, digits).
 *
 * @example rejectionReason('  late twice  ') // 'late twice'
 * @example rejectionReason('   ')             // null
 */
export function rejectionReason(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed.length > PENALTY_TEXT_MAX) return null;
  return trimmed;
}

/** An optional note (stage review or HR approval): trimmed, blank → null. */
export function optionalNote(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

/** What decides where a new penalty starts. */
export interface FirstStepFacts {
  /** The penalised employee is themselves a stage head of the penalty's stage. */
  employeeIsHead: boolean;
  /** The recorder may review this penalty themselves (they head its stage, or review school-wide). */
  recorderMayReview: boolean;
  /** At least one stage head of the penalty's stage other than the penalised employee. */
  stageHasHead: boolean;
}

/**
 * Where a newly recorded penalty starts (§4, owner 2026-11-21 defaults):
 * - the penalised employee heads that stage → WAITING_HR (nobody reviews their own penalty — also
 *   when they recorded it themselves);
 * - the recorder may review it → WAITING_HR (their recording counts as the stage review);
 * - the stage has no stage head → WAITING_HR;
 * - otherwise PENDING_REVIEW.
 */
export function firstStep(facts: FirstStepFacts): {
  status: typeof PenaltyStatus.PENDING_REVIEW | typeof PenaltyStatus.WAITING_HR;
  skip: PenaltyReviewSkip | null;
} {
  if (facts.employeeIsHead) return { status: PenaltyStatus.WAITING_HR, skip: PenaltyReviewSkip.EMPLOYEE_IS_HEAD };
  if (facts.recorderMayReview) return { status: PenaltyStatus.WAITING_HR, skip: PenaltyReviewSkip.RECORDER_IS_HEAD };
  if (!facts.stageHasHead) return { status: PenaltyStatus.WAITING_HR, skip: PenaltyReviewSkip.NO_STAGE_HEAD };
  return { status: PenaltyStatus.PENDING_REVIEW, skip: null };
}

/** Why a stage can't be used for a new penalty of this employee. */
export type StageChoiceRefusal = typeof ErrorCode.PENALTY_STAGE_REQUIRED | typeof ErrorCode.PENALTY_STAGE_INVALID;

/**
 * The stage a new penalty is recorded in (owner 2026-11-21): one of the employee's stages (main
 * first, then the others). One stage fills in by itself; several → the recorder must choose.
 */
export function penaltyStage(
  employeeStages: readonly string[],
  requested: string | undefined,
): { ok: true; stageId: string } | { ok: false; refusal: StageChoiceRefusal } {
  if (requested !== undefined) {
    return employeeStages.includes(requested)
      ? { ok: true, stageId: requested }
      : { ok: false, refusal: ErrorCode.PENALTY_STAGE_INVALID };
  }
  if (employeeStages.length === 1) return { ok: true, stageId: employeeStages[0] };
  return { ok: false, refusal: ErrorCode.PENALTY_STAGE_REQUIRED };
}

/**
 * Whether `actorEmployeeId` (the acting user's linked employee) is the penalised employee: nobody
 * reviews, approves or rejects their own penalty (owner 2026-11-21). No linked employee → no.
 */
export function actsOnOwnPenalty(actorEmployeeId: string | null, penaltyEmployeeId: string): boolean {
  return actorEmployeeId !== null && actorEmployeeId === penaltyEmployeeId;
}

/**
 * The status a penalty stored before the two steps gets (the migration `penalty_two_step`, owner
 * 2026-11-21): a pending one waits for HR — nothing already pending needs a new review — and
 * approved and cancelled ones are untouched.
 */
export function migratedPenaltyStatus(old: 'PENDING' | 'APPROVED' | 'CANCELLED'): PenaltyStatus {
  return old === 'PENDING' ? PenaltyStatus.WAITING_HR : old;
}
