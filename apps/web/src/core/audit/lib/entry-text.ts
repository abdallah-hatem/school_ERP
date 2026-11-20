import {
  AUDIT_FAILED_SIGN_IN,
  AUDIT_MONEY_FIELDS,
  AUDIT_TOTAL_PARTS,
  AccountingSettingKey,
  HrSettingKey,
  LANGUAGES,
  SchoolSettingKey,
  WEEKDAYS,
  isMonth,
  type AuditChange,
  type AuditEntityType,
  type AuditEntry,
  type AuditLabel,
  type Names,
} from '@school-erp/shared';
import { formatCount, formatDate, formatDayCount, formatDays, formatMoney, formatMoneyText, formatMonth } from '@/shared/lib/format';
import { localName, type Locale, type Translate } from '@/shared/lib/i18n';
import { formatSchoolDateTime } from './time';

/*
 * How an entry reads (D5): the sentence from its action's template with the record's label, each
 * changed field's label, and each value in the screen's language. Entries store keys and values,
 * never text, so old entries read in Arabic too (edge case 10). Unknown fields and shapes fall back
 * to the raw text, so a new action never breaks the timeline.
 */

/** The record's name in the screen's language (entries keep both names; older ones one). */
export function labelIn(label: AuditLabel | string, locale: Locale): string {
  if (typeof label === 'string') return label;
  return (locale === 'ar' ? label.ar : label.en) || label.en || label.ar;
}

/** Records labelled by their month (`2026-11`): a payroll run, its taxes, a lateness month. */
const MONTH_RECORDS: readonly AuditEntityType[] = ['payroll_run', 'accounting_payroll', 'lateness_month'];

/** Whether the entry's record reads as a month ("November 2026"), kept on one line. */
export function isMonthRecord(entry: { entityType?: AuditEntityType; entityLabel: AuditLabel | string }): boolean {
  return entry.entityType !== undefined && MONTH_RECORDS.includes(entry.entityType) && isMonth(labelIn(entry.entityLabel, 'en'));
}

/**
 * The record's name as the sentence shows it: a month record's `2026-11` reads as the rest of the
 * app prints a month — "November 2026" / "نوفمبر 2026" — anything else as `labelIn`.
 */
export function recordLabel(
  entry: { entityType?: AuditEntityType; entityLabel: AuditLabel | string },
  locale: Locale,
): string {
  const label = labelIn(entry.entityLabel, locale);
  return isMonthRecord(entry) && isMonth(label) ? formatMonth(label, locale) : label;
}

/** The sentence, without the actor (shown beside it): "Edited the employee Omar Fathy". */
export function entrySentence(
  entry: { action: AuditEntry['action']; entityType?: AuditEntityType; entityLabel: AuditLabel | string },
  t: Translate,
  locale: Locale,
): string {
  return t(`audit.actions.${entry.action}`, { entity: recordLabel(entry, locale) });
}

/** Stage edits are keyed per stage (`lists.stages.<id>`, settings history format). */
const STAGE_FIELD = /^lists\.stages\..+$/;

/** A changed field's label: `audit.fields.<field>`, the raw name when there is none. */
export function fieldLabel(field: string, t: Translate, has: (key: string) => boolean): string {
  const key = STAGE_FIELD.test(field) ? 'audit.fields.lists.stages' : `audit.fields.${field}`;
  return has(key) ? t(key) : field;
}

/** One part of a run's totals as its own line: `totals.net`, `totals.employees`. */
const TOTALS_PART = /^totals\.(.+)$/;
/** One permission of a role as its own line: `permissions.hr.payroll.view`. */
const PERMISSION_PART = /^permissions\.(.+)$/;

function totalPartKind(field: string): 'money' | 'count' | null {
  const part = TOTALS_PART.exec(field)?.[1];
  return part && part in AUDIT_TOTAL_PARTS ? AUDIT_TOTAL_PARTS[part as keyof typeof AUDIT_TOTAL_PARTS] : null;
}

/** Money (piastres, drawn by `<Money>`): a money field, or a money part of a run's totals. */
export function isMoneyField(field: string): boolean {
  return (AUDIT_MONEY_FIELDS as readonly string[]).includes(field) || totalPartKind(field) === 'money';
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

function isBracket(value: unknown): value is { width: number | null; percent: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'width' in value &&
    typeof (value as { percent?: unknown }).percent === 'number'
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

/** Fields holding a stored file: their changes read as words ("Photo changed"), never file names. */
const FILE_FIELDS: Readonly<Record<string, 'photo' | 'logo'>> = {
  photoUrl: 'photo',
  [SchoolSettingKey.LOGO_URL]: 'logo',
};

function fileKind(field: string): 'photo' | 'logo' | null {
  return FILE_FIELDS[field] ?? null;
}

/**
 * A file field's change in words, from whether each side is empty: "Photo added" / "Photo changed" /
 * "Photo removed" (`audit.values.file.<kind>.<what>`); null when it isn't a file field or both are empty.
 */
export function fileChangeText(field: string, before: unknown, after: unknown, t: Translate): string | null {
  const kind = fileKind(field);
  if (!kind) return null;
  const empty = (v: unknown) => v === null || v === undefined || v === '';
  if (empty(before) && empty(after)) return null;
  const what = empty(before) ? 'added' : empty(after) ? 'removed' : 'changed';
  return t(`audit.values.file.${kind}.${what}`);
}

/** Which `common.enums.*` list a field's values come from, per record type. */
function enumOf(field: string, entityType: AuditEntityType | undefined): string | null {
  switch (field) {
    case 'gender':
      return 'gender';
    case 'workSystem':
      return 'workSystem';
    case 'insuranceStatus':
      return 'insuranceStatus';
    case 'highestDegree':
      return 'degree';
    case 'action':
      return 'penaltyAction';
    case 'type':
      return 'adjustmentType';
    case 'status':
      if (entityType === 'penalty') return 'penaltyStatus';
      if (entityType === 'payroll_run') return 'payrollStatus';
      if (entityType === 'accounting_payroll') return 'accountingPayrollStatus';
      return 'employeeStatus';
    default:
      return null;
  }
}

/**
 * A value as the timeline shows it (the timeline draws money with `<Money>`; as text it reads the
 * same, "EGP 6,500.00" / "6,500.00 ج.م", never the stored piastres). Settings keys keep their
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
    // A role's permission line holds its scope: "Everyone", "Their stage".
    if (PERMISSION_PART.test(field) && has(`permissions.scopes.${value}`)) return t(`permissions.scopes.${value}`);
    // A stored file (the school logo, an employee's photo) never shows its stored name
    // (`changeRows` turns the change into "Photo changed"); a lone value reads "Uploaded".
    if (fileKind(field)) return t('audit.values.file.uploaded');
    const enumList = enumOf(field, entityType);
    if (enumList && has(`common.enums.${enumList}.${value}`)) return t(`common.enums.${enumList}.${value}`);
    if (field === 'month' && isMonth(value)) return formatMonth(value, locale);
    if (ISO_DAY.test(value)) return formatDate(value, locale);
    if (ISO_INSTANT.test(value) && !Number.isNaN(Date.parse(value))) return formatSchoolDateTime(value, locale);
    return value;
  }
  if (typeof value === 'number') {
    if (totalPartKind(field) === 'count') return formatCount(value);
    if (totalPartKind(field) === 'money') return formatMoney(value);
    if (isMoneyField(field)) {
      return has('ui.units.currency') ? formatMoneyText(value, locale, t('ui.units.currency')) : formatMoney(value);
    }
    if (field === HrSettingKey.LATENESS_EXTRA_HOUR_DAYS || field === 'days') return formatDayCount(value, locale);
    if (field === AccountingSettingKey.PAYROLL_MARTYR_PERCENT || field === AccountingSettingKey.PAYROLL_INSURANCE_PERCENT) {
      return `${value}%`;
    }
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
    if (field === AccountingSettingKey.PAYROLL_TAX_BRACKETS && value.every(isBracket)) {
      return value
        .map((b: { width: number | null; percent: number }) =>
          b.width === null
            ? t('audit.values.bracketRest', { percent: b.percent })
            : t('audit.values.bracket', { amount: formatMoney(b.width), percent: b.percent }),
        )
        .join(list);
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
    // Any other object reads as its labelled parts — never as JSON (`changeRows` splits the common
    // ones into lines of their own first).
    const parts = Object.entries(value as Record<string, unknown>);
    if (parts.length === 0) return EMPTY;
    return parts
      .map(([key, v]) => `${fieldLabel(key, t, has)}: ${formatAuditValue(key, v, t, has, locale, entityType)}`)
      .join(list);
  }
  return String(value);
}

/** One line of an entry's changes as the timeline draws it. */
export interface ChangeRow {
  key: string;
  /** The field the values are formatted as (`nameAr`, `phone`, `hr.violations`). */
  field: string;
  label: string;
  before: unknown;
  after: unknown;
  /** Nothing before: only the new value shows. */
  created: boolean;
  /** The values were left out for this viewer (salary, R7): the row says "changed" without them. */
  hidden?: boolean;
  /** The whole line in words, drawn instead of label and values: a file's "Photo changed". */
  text?: string;
}

type Parts = Record<string, unknown>;

function isParts(value: unknown): value is Parts {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !isNames(value);
}

/** Object values that read well as one line (`formatAuditValue`) and are never split. */
const ONE_LINE_OBJECTS: readonly string[] = [HrSettingKey.PAYROLL_PART_TIME];

/**
 * How one part of a split object is named and formatted: a run's totals by `audit.totals.*` (in
 * `AUDIT_TOTAL_PARTS` order), a role's permissions by their names, anything else by its field label.
 */
function partOf(field: string, key: string, t: Translate, has: (key: string) => boolean): { field: string; label: string } {
  if (field === 'totals') {
    return { field: `totals.${key}`, label: has(`audit.totals.${key}`) ? t(`audit.totals.${key}`) : key };
  }
  if (field === 'permissions') {
    const name = `permissions.keys.${key}.label`;
    return { field: `permissions.${key}`, label: has(name) ? t(name) : key };
  }
  return { field: key, label: fieldLabel(key, t, has) };
}

function partKeys(field: string, before: Parts | null, after: Parts | null): string[] {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  if (field !== 'totals') return keys;
  const order = Object.keys(AUDIT_TOTAL_PARTS);
  const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
  return keys.sort((a, b) => rank(a) - rank(b));
}

/** The parts of a list item whose change is worth a line of its own; `id` never is. */
const NAME_PARTS = ['nameEn', 'nameAr', 'isActive', 'sortOrder', 'managesPeople'] as const;

/**
 * Before and after are the same item edited in place: the same id (list and catalogue snapshots),
 * or no ids and the same name in this language (a picked item whose other name changed).
 */
function editedInPlace(a: Names & { id?: unknown }, b: Names & { id?: unknown }, locale: Locale): boolean {
  if (a.id !== undefined && b.id !== undefined) return a.id === b.id;
  return localName(a, locale) === localName(b, locale);
}

/**
 * The lines an entry's changes read as. A list item edited in place (`{ nameEn, nameAr, … }` before
 * and after, the same item) is split into the parts that changed — "Violation · Name (Arabic)" with its
 * own before and after — so renaming only the Arabic name never reads "Strike → Strike". A change
 * whose two sides read the same in this language is dropped; everything else is one line.
 */
export function changeRows(
  changes: readonly AuditChange[],
  t: Translate,
  has: (key: string) => boolean,
  locale: Locale,
  entityType?: AuditEntityType,
): ChangeRow[] {
  const rows: ChangeRow[] = [];
  changes.forEach((change, i) => {
    const field = fieldLabel(change.field, t, has);
    // A line about one record inside the entry (an employee of a lateness month): "Mona · Minutes".
    const label = change.subject
      ? t('audit.timeline.part', { field: localName({ nameEn: change.subject.en, nameAr: change.subject.ar }, locale), part: field })
      : field;
    if (change.hidden) {
      rows.push({ key: `${change.field}-${i}`, field: change.field, label, before: undefined, after: undefined, created: false, hidden: true });
      return;
    }
    const { before, after } = change;
    const created = before === null || before === undefined;
    // A stored file: "Photo added / changed / removed", never its file name (one line, no values).
    if (fileKind(change.field)) {
      const text = fileChangeText(change.field, before, after, t);
      if (text) rows.push({ key: `${change.field}-${i}`, field: change.field, label, before, after, created, text });
      return;
    }
    if (!created && isNames(before) && isNames(after) && editedInPlace(before, after, locale)) {
      const b = before as unknown as Record<string, unknown>;
      const a = after as unknown as Record<string, unknown>;
      for (const part of NAME_PARTS) {
        if (JSON.stringify(b[part]) === JSON.stringify(a[part])) continue;
        rows.push({
          key: `${change.field}-${i}-${part}`,
          field: part,
          label: t('audit.timeline.part', { field: label, part: fieldLabel(part, t, has) }),
          before: b[part],
          after: a[part],
          created: false,
        });
      }
      return;
    }
    // An object of parts (a payroll run's totals, a role's permissions): one line per part that
    // changed — "Totals · Net: EGP 347,705.81", "Permissions · View payroll: Everyone → Their stage".
    const nothing = (v: unknown) => v === null || v === undefined;
    if (
      !ONE_LINE_OBJECTS.includes(change.field) &&
      (isParts(before) || isParts(after)) &&
      (isParts(before) || nothing(before)) &&
      (isParts(after) || nothing(after))
    ) {
      const b = isParts(before) ? before : null;
      const a = isParts(after) ? after : null;
      for (const key of partKeys(change.field, b, a)) {
        const part = partOf(change.field, key, t, has);
        if (b && a && JSON.stringify(b[key]) === JSON.stringify(a[key])) continue;
        rows.push({
          key: `${change.field}-${i}-${key}`,
          field: part.field,
          label: t('audit.timeline.part', { field: label, part: part.label }),
          before: b ? (b[key] ?? null) : undefined,
          after: a ? (a[key] ?? null) : null,
          created,
        });
      }
      return;
    }
    if (!created) {
      const shown = (v: unknown) => formatAuditValue(change.field, v, t, has, locale, entityType);
      if (shown(before) === shown(after) && JSON.stringify(before) === JSON.stringify(after)) return;
    }
    rows.push({ key: `${change.field}-${i}`, field: change.field, label, before, after, created });
  });
  return rows;
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
