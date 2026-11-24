import {
  CONTRACT_FIELD_GROUPS,
  CONTRACT_FIELD_KEYS,
  CONTRACT_FIELDS,
  type ContractFieldGroup,
  type ContractFieldKey,
  type ContractLanguage,
} from '@school-erp/shared';
import type { Locale } from '@/shared/lib/i18n';
import { FIELD_NAMES } from '../messages';

/*
 * The 19 contract fields as the editor and the print dialog name them. A field's name follows the
 * DOCUMENT's language (an Arabic text shows Arabic chips on an English screen), so both languages'
 * names are read here, not through the screen's `t`.
 */

type NameTree = { [k: string]: string | NameTree };

/** `employee.nameAr` → "Employee name (Arabic)" / "اسم الموظف (بالعربية)" in `language`. */
export function fieldName(key: ContractFieldKey, language: ContractLanguage): string {
  let node: string | NameTree | undefined = FIELD_NAMES[language] as NameTree;
  for (const part of key.split('.')) node = typeof node === 'object' ? node[part] : undefined;
  return typeof node === 'string' ? node : key;
}

export const languageOfLocale = (locale: Locale): ContractLanguage => (locale === 'ar' ? 'AR' : 'EN');
export const otherLanguage = (language: ContractLanguage): ContractLanguage => (language === 'AR' ? 'EN' : 'AR');

/** The sample value shown in the Fields panel, in the document's language (null: empty for some). */
export function fieldSample(key: ContractFieldKey, language: ContractLanguage): string | null {
  return CONTRACT_FIELDS[key].sample[language === 'AR' ? 'ar' : 'en'];
}

/** The fields under their four groups, in the panel's order (static code config). */
export const FIELDS_BY_GROUP: { group: ContractFieldGroup; keys: ContractFieldKey[] }[] = CONTRACT_FIELD_GROUPS.map((group) => ({
  group,
  keys: CONTRACT_FIELD_KEYS.filter((key) => CONTRACT_FIELDS[key].group === group),
}));

/** The school-settings fields: an empty one links to Settings → School instead of the employee's file. */
export const SCHOOL_SETTING_FIELDS: readonly ContractFieldKey[] = ['school.address', 'school.representative'];
