import { SETTINGS_SECTIONS, type SettingsSectionId } from '@school-erp/shared';
import type { ReactNode } from 'react';

/*
 * The Settings screen's sections, in menu order (`?section=` in the URL). The list and the key that
 * shows each live in `@school-erp/shared` (`SETTINGS_SECTION_ACCESS`), next to the screen's guard.
 */
export { SETTINGS_SECTIONS, type SettingsSectionId };

/** `?section=` → a known section, or null (phone: the section list; wider: the first section). */
export function parseSection(value: string | string[] | undefined): SettingsSectionId | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return (SETTINGS_SECTIONS as readonly string[]).includes(raw ?? '') ? (raw as SettingsSectionId) : null;
}

/**
 * The sections another module owns (Contract templates: HR's), passed in by the route that composes
 * the modules (docs/ARCHITECTURE.md → Frontend rules: modules meet in app/).
 */
export type SectionSlots = Partial<Record<'contractTemplates', ReactNode>>;
