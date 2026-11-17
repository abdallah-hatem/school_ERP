import type { ListItem } from '@school-erp/shared';

/** Band colours in order; stages past the fourth cycle through them again. */
export const STAGE_BANDS = ['band-1', 'band-2', 'band-3', 'band-4'] as const;
export type StageBand = (typeof STAGE_BANDS)[number] | 'band-neutral';

/**
 * Whether a stage is the "no stage" entry (§3 DECIDED: staff not tied to a stage get "None").
 * Stages carry no flag for it, so it is recognised by its English name.
 */
export function isNoStage(stage: Pick<ListItem, 'nameEn'>): boolean {
  return stage.nameEn.trim().toLowerCase() === 'none';
}

/**
 * The band colour for `stageId`: by the stage's place in the school's stage order (the "None"
 * stage left out), neutral for "None" or a stage not in the list.
 */
export function stageBandOf(stageId: string, stages: readonly ListItem[]): StageBand {
  const ordered = [...stages].filter((s) => !isNoStage(s)).sort((a, b) => a.sortOrder - b.sortOrder);
  const index = ordered.findIndex((s) => s.id === stageId);
  return index < 0 ? 'band-neutral' : (STAGE_BANDS[index % STAGE_BANDS.length] ?? 'band-neutral');
}
