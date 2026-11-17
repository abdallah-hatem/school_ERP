/** The Settings screen's sections, in menu order (`?section=` in the URL). */
export const SETTINGS_SECTIONS = ['school', 'structure', 'lists', 'hrRules', 'catalogue', 'history'] as const;
export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number];

/** `?section=` → a known section, or null (phone: the section list; wider: the first section). */
export function parseSection(value: string | string[] | undefined): SettingsSectionId | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return (SETTINGS_SECTIONS as readonly string[]).includes(raw ?? '') ? (raw as SettingsSectionId) : null;
}
