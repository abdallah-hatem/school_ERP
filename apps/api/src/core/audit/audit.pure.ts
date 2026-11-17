import { isSalaryField, type AuditChange, type AuditLabel } from '@school-erp/shared';

/*
 * The changed-fields diff (audit spec D7). Pure: values in, changes out. Only changed fields are
 * kept, each with before and after. Secrets are dropped at any depth; money stays in piastres
 * (numbers pass through untouched).
 */

/** Field names never stored, at any depth: password hashes, tokens, secrets (D7). */
export const SECRET_FIELD = /(password|passwd|secret|token|hash|otp|apikey|api_key|cookie)/i;

/** Bookkeeping fields that change on every write and say nothing about the change. */
export const IGNORED_FIELDS: readonly string[] = ['id', 'createdAt', 'updatedAt'];

export const isSecretField = (field: string): boolean => SECRET_FIELD.test(field);

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/**
 * A value as it is stored: JSON only, secrets removed, object keys sorted (so equal values
 * compare equal whatever their key order). Dates become ISO strings, Prisma decimals their
 * string form (`toJSON`), `undefined` becomes `null`.
 */
export function toStoredValue(value: unknown): Json {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(toStoredValue);
  if (typeof value === 'object') {
    const withJson = value as { toJSON?: () => unknown };
    if (typeof withJson.toJSON === 'function') return toStoredValue(withJson.toJSON());
    const out: { [key: string]: Json } = {};
    for (const key of Object.keys(value).sort()) {
      if (isSecretField(key)) continue;
      out[key] = toStoredValue((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return null;
}

const same = (a: Json, b: Json) => JSON.stringify(a) === JSON.stringify(b);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * The fields that differ between two snapshots (a missing side — create — is `null`). Field
 * order follows `after`, then fields only in `before`. Equal snapshots give `[]`.
 */
export function diffChanges(before: unknown, after: unknown): AuditChange[] {
  const b = asRecord(before);
  const a = asRecord(after);
  const fields = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  const changes: AuditChange[] = [];
  for (const field of fields) {
    if (IGNORED_FIELDS.includes(field) || isSecretField(field)) continue;
    const from = toStoredValue(b[field]);
    const to = toStoredValue(a[field]);
    if (!same(from, to)) changes.push({ field, before: from, after: to });
  }
  return changes;
}

/**
 * Changes a caller listed itself (e.g. one per setting key): secrets dropped, values stored as
 * JSON, and a change whose before equals its after removed.
 */
export function cleanChanges(changes: readonly AuditChange[]): AuditChange[] {
  return changes
    .filter((c) => !isSecretField(c.field))
    .map((c) => ({
      field: c.field,
      before: toStoredValue(c.before),
      after: toStoredValue(c.after),
    }))
    .filter((c) => !same(c.before, c.after));
}

/**
 * The changes as a viewer without salaries sees them (R7, P4): each salary-type field
 * (`AUDIT_SALARY_FIELDS`) keeps its name — "changed" — but loses its values.
 */
export function hideSalaryValues(changes: readonly AuditChange[]): AuditChange[] {
  return changes.map((c) =>
    isSalaryField(c.field) ? ({ field: c.field, hidden: true } as AuditChange) : c,
  );
}

/** A label as stored: English (or the only name) and the Arabic one, when it differs. */
export function labelColumns(label: string | AuditLabel): { entityLabel: string; entityLabelAr: string | null } {
  if (typeof label === 'string') return { entityLabel: label, entityLabelAr: null };
  const en = label.en || label.ar;
  const ar = label.ar || label.en;
  return { entityLabel: en, entityLabelAr: ar === en ? null : ar };
}
