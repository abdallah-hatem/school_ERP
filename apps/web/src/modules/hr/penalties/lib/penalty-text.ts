import { EmployeeStatus, PenaltyAction, type Days, type EmployeeSummary, type PenaltyGroup } from '@school-erp/shared';
import type { SelectOption, SelectOptionGroup } from '@/shared/components/form/fields';
import { formatDays } from '@/shared/lib/format';
import { nameIn, type Locale, type Translate } from '@/shared/lib/i18n';

/*
 * Pure helpers for the penalties screens: how an action reads, which violations can be picked, and
 * which server errors have their own translated message.
 */

/** `DEDUCT_DAYS` + 0.5 → "Deduct 0.5 day"; an investigation with days says both; others by name. */
export function describeAction(t: Translate, action: PenaltyAction, days: Days | null): string {
  if (days != null && days > 0) {
    const value = formatDays(days);
    const many = days > 1;
    if (action === PenaltyAction.DEDUCT_DAYS) {
      return t(many ? 'penalties.action.deductMany' : 'penalties.action.deductOne', { days: value });
    }
    if (action === PenaltyAction.INVESTIGATION) {
      return t(many ? 'penalties.action.investigationMany' : 'penalties.action.investigationOne', { days: value });
    }
  }
  return t(`common.enums.penaltyAction.${action}`);
}

/**
 * The violation picker's sections: one per catalogue group in its order, each with the violations
 * still in use. A retired group retires every violation in it (§4); empty groups are left out.
 */
export function violationGroups(groups: PenaltyGroup[], locale: Locale): SelectOptionGroup[] {
  return [...groups]
    .filter((g) => g.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((g) => ({
      key: g.id,
      label: nameIn(g, locale),
      options: g.violations.filter((v) => v.isActive).map((v) => ({ value: v.id, label: nameIn(v, locale) })),
    }))
    .filter((g) => g.options.length > 0);
}

/** Active employees only (§4: a penalty is recorded for an active employee), "Name · code". */
export function employeeOptions(employees: Pick<EmployeeSummary, 'id' | 'code' | 'nameEn' | 'nameAr' | 'status'>[], locale: Locale): SelectOption[] {
  return employees
    .filter((e) => e.status === EmployeeStatus.ACTIVE)
    .map((e) => ({ value: e.id, label: `${nameIn(e, locale)} · ${e.code}` }));
}

/**
 * The message for a failed request: the translated `errors.<CODE>` when the code has one
 * (`PAYROLL_APPROVED`, `PENALTY_CANCELLED`, `VIOLATION_RETIRED`, `EMPLOYEE_INACTIVE`…), else the
 * server's own (already translated) message, else `fallback`.
 */
export function errorMessage(
  res: { error?: unknown; message?: unknown },
  t: Translate,
  has: (key: string) => boolean,
  fallback: string,
): string {
  const key = typeof res.error === 'string' ? `errors.${res.error}` : '';
  if (key && has(key)) return t(key);
  return typeof res.message === 'string' && res.message ? res.message : fallback;
}
