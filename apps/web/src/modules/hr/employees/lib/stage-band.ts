import type { Stage } from '@school-erp/shared';

/** Band colours in order; stages past the fourth cycle through them again. */
export const STAGE_BANDS = ['band-1', 'band-2', 'band-3', 'band-4'] as const;
export type StageBand = (typeof STAGE_BANDS)[number] | 'band-neutral';

/**
 * The band colour for `stageId`: by the stage's place in the school's stage order (the "no stage"
 * entry left out), neutral for the "no stage" entry or a stage not in the list. The "no stage"
 * entry (§3: staff not tied to a stage) is the one flagged `isNoStage`, whatever it is called.
 */
export function stageBandOf(stageId: string, stages: readonly Stage[]): StageBand {
  const ordered = [...stages].filter((s) => !s.isNoStage).sort((a, b) => a.sortOrder - b.sortOrder);
  const index = ordered.findIndex((s) => s.id === stageId);
  return index < 0 ? 'band-neutral' : (STAGE_BANDS[index % STAGE_BANDS.length] ?? 'band-neutral');
}
