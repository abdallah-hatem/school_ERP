import { SEEDED_PENALTY_ACTIONS, type PenaltyAction, type PenaltyActionRef } from '@school-erp/shared';

/**
 * The ten seeded penalty actions as the migration created them (20261126100000_penalty_actions):
 * fixed ids `5eed0000-0000-4000-8000-0000000000NN`, in today's order. Test fixtures name a level's
 * action by these (`actionId: ACTION_ID.NOTICE`) and match responses with `ACTION.NOTICE`.
 */
export const ACTION_ID = Object.fromEntries(
  SEEDED_PENALTY_ACTIONS.map((a, i) => [a.code, `5eed0000-0000-4000-8000-0000000000${String(i + 1).padStart(2, '0')}`]),
) as Record<PenaltyAction, string>;

/** The seeded actions as a level or a penalty shows them (`PenaltyActionRef`), by code. */
export const ACTION = Object.fromEntries(
  SEEDED_PENALTY_ACTIONS.map((a) => [
    a.code,
    { id: ACTION_ID[a.code], nameEn: a.nameEn, nameAr: a.nameAr, effect: a.effect, percentBase: null },
  ]),
) as Record<PenaltyAction, PenaltyActionRef>;
