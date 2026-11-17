import {
  contractYearFor,
  EmployeeStatus,
  ErrorCode,
  GENDERS,
  WORK_SYSTEMS,
  type CreateEmployeeRequest,
  type Employee,
  type EmployeeSummary,
  type Gender,
  type IsoDate,
  type ListItem,
  type NamedRef,
  type UpdateEmployeeRequest,
  type Uuid,
  type WorkSystem,
} from '@school-erp/shared';
import { z } from 'zod';
import type { SelectOption } from '@/shared/components/form/fields';
import { todayIso } from '@/shared/lib/format';
import { localName, type Locale } from '@/shared/lib/i18n';
import { isValidPhone } from '@/shared/lib/phone';

/*
 * The employee form's rules (§3), its defaults, and how its values become API requests. Error
 * messages are translation keys so the one schema serves both languages.
 */

/** The manager picker's "no direct manager" item (Radix Select items can't have an empty value). */
export const NO_MANAGER = '__none__';

/** Postgres `integer` upper bound — the API rejects larger salaries. */
const MAX_PIASTRES = 2_147_483_647;

const REQUIRED = 'ui.form.required';
const TOO_LONG = 'employees.errors.tooLong';

export { todayIso };

const requiredText = (max: number) =>
  z.string().trim().min(1, 'employees.errors.nameRequired').max(max, TOO_LONG);
const optionalText = (max: number) => z.string().trim().max(max, TOO_LONG);
const requiredId = z.string().min(1, REQUIRED);
const requiredDate = z
  .string()
  .nullable()
  .refine((v) => Boolean(v), REQUIRED);

export const employeeFormSchema = z
  .object({
    nameEn: requiredText(200),
    nameAr: requiredText(200),
    nationalId: z
      .string()
      .trim()
      .refine((v) => v === '' || /^\d{14}$/.test(v), 'employees.errors.nationalId'),
    gender: z.string().refine((v) => (GENDERS as string[]).includes(v), REQUIRED),
    dateOfBirth: requiredDate,
    phone: z
      .string()
      .trim()
      .min(1, REQUIRED)
      .refine((v) => isValidPhone(v), 'employees.errors.phone'),
    email: z
      .string()
      .trim()
      .max(200, TOO_LONG)
      .refine((v) => v === '' || z.email().safeParse(v).success, 'employees.errors.email'),
    address: optionalText(500),
    hireDate: requiredDate.refine((v) => !v || v <= todayIso(), 'employees.errors.hireDateFuture'),
    stageId: requiredId,
    departmentId: requiredId,
    jobTitleId: requiredId,
    managerId: z.string(),
    grade: optionalText(50),
    workSystem: z.string().refine((v) => (WORK_SYSTEMS as string[]).includes(v), REQUIRED),
    basicSalary: z
      .number()
      .nullable()
      .superRefine((v, ctx) => {
        if (v == null) ctx.addIssue({ code: 'custom', message: REQUIRED });
        else if (!Number.isInteger(v) || v <= 0) ctx.addIssue({ code: 'custom', message: 'employees.errors.salaryPositive' });
        else if (v > MAX_PIASTRES) ctx.addIssue({ code: 'custom', message: 'employees.errors.salaryTooLarge' });
      }),
    fingerprintId: optionalText(50),
    contractStart: requiredDate,
    contractEnd: requiredDate,
    usesBus: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.contractStart && v.contractEnd && v.contractEnd <= v.contractStart) {
      ctx.addIssue({ code: 'custom', path: ['contractEnd'], message: 'employees.errors.contractOrder' });
    }
  });

export type EmployeeFormValues = z.input<typeof employeeFormSchema>;

/** A new employee: contract defaults to 1 June – 31 May of the current contract year (§3). */
export function emptyEmployeeForm(today: IsoDate = todayIso()): EmployeeFormValues {
  const contract = contractYearFor(today);
  return {
    nameEn: '',
    nameAr: '',
    nationalId: '',
    gender: '',
    dateOfBirth: null,
    phone: '',
    email: '',
    address: '',
    hireDate: null,
    stageId: '',
    departmentId: '',
    jobTitleId: '',
    managerId: NO_MANAGER,
    grade: '',
    workSystem: '',
    basicSalary: null,
    fingerprintId: '',
    contractStart: contract.start,
    contractEnd: contract.end,
    usesBus: false,
  };
}

/** The form's starting values for editing `employee`. */
export function employeeToForm(employee: Employee): EmployeeFormValues {
  return {
    nameEn: employee.nameEn,
    nameAr: employee.nameAr,
    nationalId: employee.nationalId ?? '',
    gender: employee.gender,
    dateOfBirth: employee.dateOfBirth,
    phone: employee.phone,
    email: employee.email ?? '',
    address: employee.address ?? '',
    hireDate: employee.hireDate,
    stageId: employee.stage.id,
    departmentId: employee.department.id,
    jobTitleId: employee.jobTitle.id,
    managerId: employee.manager?.id ?? NO_MANAGER,
    grade: employee.grade ?? '',
    workSystem: employee.workSystem,
    basicSalary: employee.basicSalary,
    fingerprintId: employee.fingerprintId ?? '',
    contractStart: employee.contractStart,
    contractEnd: employee.contractEnd,
    usesBus: employee.usesBus,
  };
}

const orNull = (v: string) => (v.trim() === '' ? null : v.trim());

/** Validated form values → the full request body. Empty optional text is `null`. */
export function formToRequest(v: EmployeeFormValues): CreateEmployeeRequest {
  return {
    nameEn: v.nameEn.trim(),
    nameAr: v.nameAr.trim(),
    nationalId: orNull(v.nationalId),
    gender: v.gender as Gender,
    dateOfBirth: v.dateOfBirth as IsoDate,
    phone: v.phone.trim(),
    email: orNull(v.email),
    address: orNull(v.address),
    hireDate: v.hireDate as IsoDate,
    stageId: v.stageId,
    departmentId: v.departmentId,
    jobTitleId: v.jobTitleId,
    managerId: v.managerId && v.managerId !== NO_MANAGER ? v.managerId : null,
    grade: orNull(v.grade),
    workSystem: v.workSystem as WorkSystem,
    basicSalary: v.basicSalary as number,
    fingerprintId: orNull(v.fingerprintId),
    contractStart: v.contractStart as IsoDate,
    contractEnd: v.contractEnd as IsoDate,
    usesBus: v.usesBus,
  };
}

/**
 * Only what changed since `initial`, so an untouched hidden department or a manager who has since
 * left isn't re-validated as a new choice. A cleared optional field is sent as `null`.
 */
export function formToUpdate(values: EmployeeFormValues, initial: EmployeeFormValues): UpdateEmployeeRequest {
  const next = formToRequest(values);
  const before = formToRequest(initial);
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(next) as (keyof CreateEmployeeRequest)[]) {
    if (next[key] !== before[key]) patch[key] = next[key];
  }
  return patch as UpdateEmployeeRequest;
}

/** Server error codes that belong to one field; the message is shown under it. */
const FIELD_BY_ERROR: Partial<Record<string, keyof EmployeeFormValues>> = {
  [ErrorCode.DUPLICATE_NATIONAL_ID]: 'nationalId',
  [ErrorCode.DUPLICATE_FINGERPRINT_ID]: 'fingerprintId',
  [ErrorCode.INVALID_MANAGER]: 'managerId',
  [ErrorCode.MANAGER_LOOP]: 'managerId',
};

export function fieldForError(code: unknown): keyof EmployeeFormValues | undefined {
  return typeof code === 'string' ? FIELD_BY_ERROR[code] : undefined;
}

/**
 * Picker options: visible items only, plus the employee's current item when it has since been
 * hidden (§3 — they keep it on edit; only a newly chosen item must be visible).
 */
export function listOptions(
  items: ListItem[],
  locale: Locale,
  current?: NamedRef,
): { options: SelectOption[]; currentHidden: boolean } {
  const options = items
    .filter((item) => item.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => ({ value: item.id, label: localName(item, locale), keywords: [item.nameEn, item.nameAr] }));
  const currentHidden = Boolean(current && !options.some((o) => o.value === current.id));
  if (current && currentHidden) options.push({ value: current.id, label: localName(current, locale), keywords: [current.nameEn, current.nameAr] });
  return { options, currentHidden };
}

/**
 * Direct-manager options (§3): another active employee — never the employee being edited and
 * never an inactive one. The current manager stays listed so an unrelated edit doesn't blank it.
 */
export function managerOptions(
  candidates: EmployeeSummary[],
  locale: Locale,
  noneLabel: string,
  selfId?: Uuid,
  current?: (NamedRef & { code: string }) | null,
): SelectOption[] {
  const label = (e: NamedRef & { code: string }) => `${localName(e, locale)} · ${e.code}`;
  const options = candidates
    .filter((e) => e.status === EmployeeStatus.ACTIVE && e.id !== selfId)
    .map((e) => ({ value: e.id, label: label(e), keywords: [e.nameEn, e.nameAr, e.code] }));
  if (current && current.id !== selfId && !options.some((o) => o.value === current.id)) {
    options.push({ value: current.id, label: label(current), keywords: [current.nameEn, current.nameAr, current.code] });
  }
  return [{ value: NO_MANAGER, label: noneLabel }, ...options];
}
