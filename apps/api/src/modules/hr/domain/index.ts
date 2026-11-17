/**
 * HR's pure rules (penalties, lateness, payroll). No Nest, no Prisma — arguments in, a value out.
 * Used inside the HR module only; other modules never import `domain/`.
 */
export { latenessDays } from '@school-erp/shared';
export { divRoundHalfUp, mulDivRoundHalfUp } from './rounding';
export { oncePerDayRefuses, type OncePerDayStage } from './once-per-day';
export {
  countPriorInWindow,
  isEarlierPenalty,
  penaltyLevel,
  repetitionWindowStart,
  resolvePenalty,
  type CatalogueLevel,
  type LevelRef,
  type PenaltyPair,
  type PenaltyPosition,
  type PenaltyTarget,
  type RecordedPenalty,
} from './penalties';
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
  lineTax,
  penaltyShare,
  sumAdjustments,
  sumDays,
  type LineAmounts,
  type LineInput,
} from './payroll-line';
