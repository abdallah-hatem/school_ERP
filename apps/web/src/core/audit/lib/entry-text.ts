import {
  AUDIT_FAILED_SIGN_IN,
  AUDIT_MONEY_FIELDS,
  HrSettingKey,
  LANGUAGES,
  SchoolSettingKey,
  WEEKDAYS,
  type AuditEntityType,
  type AuditEntry,
  type Names,
} from '@school-erp/shared';
import { formatDate, formatDayCount, formatDays } from '@/shared/lib/format';
import { localName, type Locale, type Translate } from '@/shared/lib/i18n';
import { formatSchoolDateTime } from './time';

/*
 * How an entry reads (D5): the sentence from its action's template with the record's label, each
 * changed field's label, and each value in the screen's language. Entries store keys and values,
 * never text, so old entries read in Arabic too (edge case 10). Unknown fields and shapes fall back
 * to the raw text, so a new action never breaks the timeline.
 */

/** The sentence, without the actor (shown beside it): "Edited the employee Omar Fathy". */
export function entrySentence(entry: Pick<AuditEntry, 'action' | 'entityLabel'>, t: Translate): string {
  return t(`audit.actions.${entry.action}`, { entity: entry.entityLabel });
}

/** Stage edits are keyed per stage (`lists.stages.<id>`, settings history format). */
const STAGE_FIELD = /^lists\.stages\..+$/;

/** A changed field's label: `audit.fields.<field>`, the raw name when there is none. */
export function fieldLabel(field: string, t: Translate, has: (key: string) => boolean): string {
  const key = STAGE_FIELD.test(field) ? 'audit.fields.lists.stages' : `audit.fields.${field}`;
  return has(key) ? t(key) : field;
}

export function isMoneyField(field: string): boolean {
  return (AUDIT_MONEY_FIELDS as readonly string[]).includes(field);
}

export function isFailedSignIn(entry: Pick<AuditEntry, 'action'>): boolean {
  return entry.action === AUDIT_FAILED_SIGN_IN;
}

const EMPTY = '—';
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function isNames(value: unknown): value is Names & { isActive?: boolean } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Names).nameEn === 'string' &&
    typeof (value as Names).nameAr === 'string'
  );
}

function isStep(value: unknown): value is { hour: number; days: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { hour?: unknown }).hour === 'number' &&
    typeof (value as { days?: unknown }).days === 'number'
  );
}

/** Which `common.enums.*` list a field's values come from, per record type. */
function enumOf(field: string, entityType: AuditEntityType | undefined): string | null {
  switch (field) {
    case 'gender':
      return 'gender';
    case 'workSystem':
      return 'workSystem';
    case 'action':
      return 'penaltyAction';
    case 'type':
      return 'adjustmentType';
    case 'status':
      if (entityType === 'penalty') return 'penaltyStatus';
      if (entityType === 'payroll_run') return 'payrollStatus';
      return 'employeeStatus';
    default:
      return null;
  }
}

/**
 * A value as the timeline shows it (money is drawn by `<Money>` instead). Settings keys keep their
 * old history formatting (§7): weekdays, lateness steps, part-time percentages, list items.
 */
export function formatAuditValue(
  field: string,
  value: unknown,
  t: Translate,
  has: (key: string) => boolean,
  locale: Locale,
  entityType?: AuditEntityType,
): string {
  if (value === null || value === undefined || value === '') return EMPTY;
  const list = locale === 'ar' ? '، ' : ', ';

  if (typeof value === 'string') {
    if (field === SchoolSettingKey.DEFAULT_LANGUAGE && (LANGUAGES as readonly string[]).includes(value)) {
      return t(value === 'ar' ? 'common.common.arabic' : 'common.common.english');
    }
    if (field === HrSettingKey.PENALTIES_REPETITION_WINDOW) return t(`common.enums.repetitionWindow.${value}`);
    if (field === SchoolSettingKey.LOGO_URL) return value.split('/').pop() ?? value;
    const enumList = enumOf(field, entityType);
    if (enumList && has(`common.enums.${enumList}.${value}`)) return t(`common.enums.${enumList}.${value}`);
    if (ISO_DAY.test(value)) return formatDate(value, locale);
    if (ISO_INSTANT.test(value) && !Number.isNaN(Date.parse(value))) return formatSchoolDateTime(value, locale);
    return value;
  }
  if (typeof value === 'number') {
    if (field === HrSettingKey.LATENESS_EXTRA_HOUR_DAYS || field === 'days') return formatDayCount(value, locale);
    if (field === HrSettingKey.LATENESS_GRACE_MINUTES || field === 'minutes') {
      return t('audit.values.minutes', { count: value });
    }
    return String(value);
  }
  if (typeof value === 'boolean') return t(value ? 'audit.values.yes' : 'audit.values.no');

  if (Array.isArray(value)) {
    if (value.length === 0) return EMPTY;
    if (value.every((v) => typeof v === 'string' && (WEEKDAYS as readonly string[]).includes(v))) {
      return value.map((d: string) => t(`common.enums.weekday.${d}`)).join(list);
    }
    if (value.every(isStep)) {
      return value
        .map((s: { hour: number; days: number }) => t('audit.values.step', { hour: s.hour, days: formatDays(s.days) }))
        .join(list);
    }
    return value.map((v) => formatAuditValue(field, v, t, has, locale, entityType)).join(list);
  }

  if (typeof value === 'object') {
    if (isNames(value)) {
      const name = localName(value, locale);
      return value.isActive === false ? t('audit.values.hiddenItem', { name }) : name;
    }
    if (field === HrSettingKey.PAYROLL_PART_TIME) {
      return Object.entries(value as Record<string, number>)
        .map(([system, pct]) => `${t(`common.enums.workSystem.${system}`)}: ${pct}%`)
        .join(list);
    }
  }
  return JSON.stringify(value);
}

/** Where "Open record" goes for an entry, or null when the record has no page. */
export function recordHref(entry: Pick<AuditEntry, 'entityType' | 'entityId'>, locale: Locale): string | null {
  const base = `/${locale}`;
  const id = encodeURIComponent(entry.entityId);
  switch (entry.entityType) {
    case 'employee':
      return `${base}/employees/${id}`;
    case 'payroll_run':
      return `${base}/payroll/${id}`;
    case 'lateness_month':
      return `${base}/lateness?month=${id}`;
    case 'penalty':
      return `${base}/penalties`;
    case 'school_settings':
      return `${base}/settings?section=school`;
    case 'stage':
      return `${base}/settings?section=structure`;
    case 'department':
    case 'job_title':
      return `${base}/settings?section=lists`;
    case 'hr_settings':
      return `${base}/settings?section=hrRules`;
    case 'penalty_group':
    case 'violation':
      return `${base}/settings?section=catalogue`;
    default:
      return null;
  }
}

/** The actor's name, "System" when nobody was signed in (failed sign-ins show no actor). */
export function actorName(entry: Pick<AuditEntry, 'actor'>, t: Translate): string {
  return entry.actor?.name || t('audit.system');
}
