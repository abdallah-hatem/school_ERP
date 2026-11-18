import type { PermissionKey } from '@school-erp/shared';

/** The Settings screen's sections, in menu order (`?section=` in the URL). */
export const SETTINGS_SECTIONS = ['school', 'structure', 'lists', 'hrRules', 'catalogue', 'accounting'] as const;
export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number];

/**
 * What a user needs to see each section — the permission its API read asks for. A section the
 * user can't view isn't listed, and asking for it in the URL opens their first allowed one.
 */
export const SECTION_VIEW_PERMISSION: Record<SettingsSectionId, PermissionKey> = {
  school: 'core.settings.view',
  structure: 'core.stages.view',
  lists: 'hr.lists.view',
  hrRules: 'hr.settings.view',
  catalogue: 'hr.penalty_catalogue.view',
  accounting: 'accounting.settings.view',
};

/** `?section=` → a known section, or null (phone: the section list; wider: the first section). */
export function parseSection(value: string | string[] | undefined): SettingsSectionId | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return (SETTINGS_SECTIONS as readonly string[]).includes(raw ?? '') ? (raw as SettingsSectionId) : null;
}
