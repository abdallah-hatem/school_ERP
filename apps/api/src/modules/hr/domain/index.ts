/**
 * HR's pure rules (penalties, lateness, payroll). No Nest, no Prisma — arguments in, a value out.
 * Used inside the HR module only; other modules never import `domain/`.
 */
export { latenessDays } from '@school-erp/shared';
export { divRoundHalfUp, mulDivRoundHalfUp } from './rounding';
export { oncePerDayRefuses, type OncePerDayStage } from './once-per-day';
export {
  countPriorInWindow,
  earlierPendingPenalty,
  isEarlierPenalty,
  penaltyLevel,
  recountAcknowledged,
  recountAfterApproval,
  recountLockedMonth,
  repetitionWindowStart,
  resolvePenalty,
  type ApprovedPenalty,
  type CatalogueLevel,
  type LevelRef,
  type PenaltyPair,
  type PenaltyPosition,
  type PenaltyTarget,
  type RecordedPenalty,
  type RecountAcknowledgement,
  type RecountChange,
} from './penalties';
export {
  actsOnOwnPenalty,
  decisionFrom,
  firstStep,
  migratedPenaltyStatus,
  optionalNote,
  penaltyStage,
  penaltyTransition,
  PENALTY_TEXT_MAX,
  rejectionReason,
  rejectionStep,
  type FirstStepFacts,
  type PenaltyDecision,
  type PenaltyTransition,
  type PenaltyTransitionRefusal,
  type StageChoiceRefusal,
  type TransitionFacts,
} from './penalty-flow';
export {
  deductionAmount,
  displayDayValue,
  lineNet,
  monthSalary,
  type LineNetInput,
  type LineNetResult,
} from './payroll';
export {
  calculateLine,
  deductedDays,
  lineNetWithFlags,
  penaltyShare,
  sumAdjustments,
  sumDays,
  type LineAmounts,
  type LineInput,
} from './payroll-line';
