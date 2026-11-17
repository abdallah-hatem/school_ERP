/**
 * HR's pure rules (penalties, lateness, payroll). No Nest, no Prisma — arguments in, a value out.
 * Used inside the HR module only; other modules never import `domain/`.
 */
export { latenessDays } from '@school-erp/shared';
export { divRoundHalfUp, mulDivRoundHalfUp } from './rounding';
export { penaltyLevel, type LevelRef } from './penalties';
export {
  deductionAmount,
  displayDayValue,
  lineNet,
  monthSalary,
  type LineNetInput,
  type LineNetResult,
} from './payroll';
