import { isDeepStrictEqual } from 'node:util';
import {
  AuditEntityType,
  HrCatalogueKey,
  HrListKey,
  SETTING_DEFAULTS,
  SchoolSettingKey,
  type AuditAction,
  type AuditLabel,
  type SchoolSettings,
  type SettingsChangedEvent,
  type SettingKey,
  type SettingValueMap,
  type TimeOfDay,
} from '@school-erp/shared';

/** Each `/settings/school` field and the setting key it is stored under. */
export const SCHOOL_FIELD_KEYS = {
  nameEn: SchoolSettingKey.NAME_EN,
  nameAr: SchoolSettingKey.NAME_AR,
  logoUrl: SchoolSettingKey.LOGO_URL,
  defaultLanguage: SchoolSettingKey.DEFAULT_LANGUAGE,
  workStart: SchoolSettingKey.WORK_START,
  workEnd: SchoolSettingKey.WORK_END,
  workingDays: SchoolSettingKey.WORKING_DAYS,
  addressEn: SchoolSettingKey.ADDRESS_EN,
  addressAr: SchoolSettingKey.ADDRESS_AR,
  signatoryNameEn: SchoolSettingKey.SIGNATORY_NAME_EN,
  signatoryNameAr: SchoolSettingKey.SIGNATORY_NAME_AR,
  signatoryTitleEn: SchoolSettingKey.SIGNATORY_TITLE_EN,
  signatoryTitleAr: SchoolSettingKey.SIGNATORY_TITLE_AR,
} as const satisfies { [F in keyof SchoolSettings]: SchoolSettingKey };

export type SettingValues<K extends SettingKey> = { [P in K]: SettingValueMap[P] };

/** Stored rows over the §7 defaults: a key with no row has its default. */
export function resolveValues<K extends SettingKey>(
  keys: readonly K[],
  stored: ReadonlyArray<{ key: string; value: unknown }>,
): SettingValues<K> {
  const byKey = new Map(stored.map((s) => [s.key, s.value]));
  const out = {} as SettingValues<K>;
  for (const key of keys) {
    out[key] = (byKey.has(key) ? byKey.get(key) : SETTING_DEFAULTS[key]) as SettingValueMap[K];
  }
  return out;
}

export interface SettingDiff {
  key: SettingKey;
  oldValue: unknown;
  newValue: unknown;
}

/** Keys whose value actually changes. Deep compare, so `{a,b}` vs `{b,a}` is not a change. */
export function diffValues(
  current: Partial<Record<SettingKey, unknown>>,
  next: Partial<Record<SettingKey, unknown>>,
): SettingDiff[] {
  return (Object.keys(next) as SettingKey[])
    .filter((key) => next[key] !== undefined && !isDeepStrictEqual(current[key], next[key]))
    .map((key) => ({ key, oldValue: current[key] ?? null, newValue: next[key] }));
}

/** §7: times in order — work ends strictly after it starts. `HH:mm` compares as text. */
export function isWorkHoursOrdered(start: TimeOfDay, end: TimeOfDay): boolean {
  return start < end;
}

/** Folder under UPLOADS_DIR (and `/files/…`) holding the school logo — the one public folder. */
export const LOGO_FOLDER = 'logo';

export type ImageType = 'png' | 'jpg' | 'webp' | 'svg';

export const IMAGE_MIME: Record<ImageType, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

/**
 * The file's real type from its first bytes — the declared mimetype is the client's claim. SVG is
 * text: accept it when an `<svg` root appears before any other element.
 */
export function detectImageType(buffer: Buffer): ImageType | null {
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }
  // RIFF <size> WEBP
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'webp';
  }
  const head = buffer
    .subarray(0, 1024)
    .toString('utf8')
    .replace(/^\uFEFF/, '');
  if (/^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(head)) {
    return 'svg';
  }
  return null;
}

/** Stage edits are keyed per stage: `lists.stages.<id>` (core/school-structure). */
export const STAGE_HISTORY_PREFIX = 'lists.stages.';

/** The audit action and record of a list / catalogue `settings.changed` event. */
export interface HistoryAuditTarget {
  action: AuditAction;
  /** Both names of the item (UI audit finding 3): Arabic sentences show the Arabic name. */
  entity: { type: AuditEntityType; id: string; label: AuditLabel };
}

const LIST_ACTIONS: Record<string, { type: AuditEntityType; create: AuditAction; update: AuditAction }> = {
  [HrListKey.DEPARTMENTS]: {
    type: AuditEntityType.DEPARTMENT,
    create: 'hr.department.create',
    update: 'hr.department.update',
  },
  [HrListKey.JOB_TITLES]: {
    type: AuditEntityType.JOB_TITLE,
    create: 'hr.job_title.create',
    update: 'hr.job_title.update',
  },
  [HrListKey.EMPLOYEE_GRADES]: {
    type: AuditEntityType.EMPLOYEE_GRADE,
    create: 'hr.employee_grade.create',
    update: 'hr.employee_grade.update',
  },
  [HrCatalogueKey.PENALTY_GROUPS]: {
    type: AuditEntityType.PENALTY_GROUP,
    create: 'hr.penalty_group.create',
    update: 'hr.penalty_group.update',
  },
  [HrCatalogueKey.VIOLATIONS]: {
    type: AuditEntityType.VIOLATION,
    create: 'hr.violation.create',
    update: 'hr.violation.update',
  },
  [HrCatalogueKey.PENALTY_ACTIONS]: {
    type: AuditEntityType.PENALTY_ACTION,
    create: 'hr.penalty_action.create',
    update: 'hr.penalty_action.update',
  },
};

const field = (value: unknown, name: string): string | undefined => {
  const v = value && typeof value === 'object' ? (value as Record<string, unknown>)[name] : undefined;
  return typeof v === 'string' && v !== '' ? v : undefined;
};

/**
 * Maps a list / catalogue history event (stages, departments, job titles, penalty groups,
 * violations) to its audit action and record — the same mapping the T27 migration used for the
 * old rows. `null` for anything else (school and HR settings are recorded in their transaction).
 */
export function historyAuditTarget(event: SettingsChangedEvent): HistoryAuditTarget | null {
  const created = event.oldValue === null || event.oldValue === undefined;
  const snapshot = created ? event.newValue : (event.newValue ?? event.oldValue);
  const en = field(snapshot, 'nameEn') ?? field(snapshot, 'nameAr') ?? '';
  const label: AuditLabel = { en, ar: field(snapshot, 'nameAr') ?? en };

  if (event.scope === 'lists' && event.key.startsWith(STAGE_HISTORY_PREFIX)) {
    return {
      action: created ? 'core.stage.create' : 'core.stage.update',
      entity: { type: AuditEntityType.STAGE, id: event.key.slice(STAGE_HISTORY_PREFIX.length), label },
    };
  }
  const target = LIST_ACTIONS[event.key];
  const scopeOk =
    (event.scope === 'lists' &&
      (event.key === HrListKey.DEPARTMENTS || event.key === HrListKey.JOB_TITLES || event.key === HrListKey.EMPLOYEE_GRADES)) ||
    (event.scope === 'catalogue' &&
      (event.key === HrCatalogueKey.PENALTY_GROUPS ||
        event.key === HrCatalogueKey.VIOLATIONS ||
        event.key === HrCatalogueKey.PENALTY_ACTIONS));
  if (!target || !scopeOk) return null;
  return {
    action: created ? target.create : target.update,
    entity: { type: target.type, id: field(snapshot, 'id') ?? '', label },
  };
}
