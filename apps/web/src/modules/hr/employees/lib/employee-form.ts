import {
  applyInsuranceStatus,
  contractYearFor,
  DEGREES,
  EmployeeStatus,
  ErrorCode,
  GENDERS,
  graduationYearRange,
  INSURANCE_STATUSES,
  InsuranceStatus,
  isValidEgyptianIban,
  isValidGraduationYear,
  MAX_PIASTRES,
  normalizeIban,
  socialInsuranceIssues,
  WORK_SYSTEMS,
  type Degree,
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
const optionalPhone = z
  .string()
  .trim()
  .refine((v) => v === '' || isValidPhone(v), 'employees.errors.phone');

/** The shared insurance rule's issues (§3) → this form's messages. */
const INSURANCE_MESSAGES = {
  required: REQUIRED,
  insuranceNumberFormat: 'employees.errors.insuranceNumber',
  registrationDateFuture: 'employees.errors.registrationDateFuture',
  insuredSalaryPositive: 'employees.errors.insuredSalaryPositive',
  insuredSalaryTooLarge: 'employees.errors.salaryTooLarge',
} as const;

/** Graduation years offered, newest first: the current year … 1950 (§3). */
export function graduationYears(today: IsoDate = todayIso()): number[] {
  const { min, max } = graduationYearRange(today);
  return Array.from({ length: max - min + 1 }, (_, i) => max - i);
}

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
    insuranceStatus: z.string().refine((v) => (INSURANCE_STATUSES as string[]).includes(v), REQUIRED),
    insuranceNumber: z.string().trim(),
    insuranceRegistrationDate: z.string().nullable(),
    insuredSalary: z.number().nullable(),
    bankName: optionalText(100),
    bankAccountNumber: optionalText(50),
    iban: z.string().refine((v) => v.trim() === '' || isValidEgyptianIban(v), 'employees.errors.iban'),
    emergencyContactName: optionalText(200),
    emergencyContactRelationship: optionalText(100),
    emergencyContactPhone: optionalPhone,
    highestDegree: z.string().refine((v) => v === '' || (DEGREES as string[]).includes(v), REQUIRED),
    major: optionalText(200),
    university: optionalText(200),
    // A year picked from the list is a string ('' = not given).
    graduationYear: z
      .string()
      .refine((v) => v === '' || isValidGraduationYear(Number(v), todayIso()), 'employees.errors.graduationYear'),
  })
  .superRefine((v, ctx) => {
    if (v.contractStart && v.contractEnd && v.contractEnd <= v.contractStart) {
      ctx.addIssue({ code: 'custom', path: ['contractEnd'], message: 'employees.errors.contractOrder' });
    }
    // §3: while insured, the number, registration date and insured salary are required (shared rule).
    const issues = socialInsuranceIssues(
      {
        insuranceStatus: v.insuranceStatus as InsuranceStatus,
        insuranceNumber: v.insuranceNumber.trim() || null,
        insuranceRegistrationDate: v.insuranceRegistrationDate,
        insuredSalary: v.insuredSalary,
      },
      todayIso(),
    );
    for (const { field, issue } of issues) {
      ctx.addIssue({ code: 'custom', path: [field], message: INSURANCE_MESSAGES[issue] });
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
    ...EMPTY_DETAILS,
  };
}

/** The §3 detail groups of an employee with none: not insured, everything else empty. */
const EMPTY_DETAILS = {
  insuranceStatus: InsuranceStatus.NOT_INSURED,
  insuranceNumber: '',
  insuranceRegistrationDate: null,
  insuredSalary: null,
  bankName: '',
  bankAccountNumber: '',
  iban: '',
  emergencyContactName: '',
  emergencyContactRelationship: '',
  emergencyContactPhone: '',
  highestDegree: '',
  major: '',
  university: '',
  graduationYear: '',
} satisfies Partial<EmployeeFormValues>;

/** What choosing "not insured" resets (§3): the three insurance details, to empty. */
export const CLEARED_INSURANCE = {
  insuranceNumber: '',
  insuranceRegistrationDate: null,
  insuredSalary: null,
} as const satisfies Partial<EmployeeFormValues>;

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
    insuranceStatus: employee.insuranceStatus,
    insuranceNumber: employee.insuranceNumber ?? '',
    insuranceRegistrationDate: employee.insuranceRegistrationDate,
    insuredSalary: employee.insuredSalary,
    bankName: employee.bankName ?? '',
    bankAccountNumber: employee.bankAccountNumber ?? '',
    iban: employee.iban ?? '',
    emergencyContactName: employee.emergencyContactName ?? '',
    emergencyContactRelationship: employee.emergencyContactRelationship ?? '',
    emergencyContactPhone: employee.emergencyContactPhone ?? '',
    highestDegree: employee.highestDegree ?? '',
    major: employee.major ?? '',
    university: employee.university ?? '',
    graduationYear: employee.graduationYear == null ? '' : String(employee.graduationYear),
  };
}

const orNull = (v: string) => (v.trim() === '' ? null : v.trim());

/** Validated form values → the full request body. Empty optional text is `null`. */
export function formToRequest(v: EmployeeFormValues): CreateEmployeeRequest {
  const insurance = applyInsuranceStatus({
    insuranceStatus: v.insuranceStatus as InsuranceStatus,
    insuranceNumber: orNull(v.insuranceNumber),
    insuranceRegistrationDate: v.insuranceRegistrationDate,
    insuredSalary: v.insuredSalary,
  });
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
    ...insurance,
    bankName: orNull(v.bankName),
    bankAccountNumber: orNull(v.bankAccountNumber),
    iban: v.iban.trim() === '' ? null : normalizeIban(v.iban),
    emergencyContactName: orNull(v.emergencyContactName),
    emergencyContactRelationship: orNull(v.emergencyContactRelationship),
    emergencyContactPhone: orNull(v.emergencyContactPhone),
    highestDegree: v.highestDegree === '' ? null : (v.highestDegree as Degree),
    major: orNull(v.major),
    university: orNull(v.university),
    graduationYear: v.graduationYear === '' ? null : Number(v.graduationYear),
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
  [ErrorCode.DUPLICATE_INSURANCE_NUMBER]: 'insuranceNumber',
  [ErrorCode.INVALID_MANAGER]: 'managerId',
  [ErrorCode.MANAGER_LOOP]: 'managerId',
  [ErrorCode.MANAGER_NOT_MANAGING]: 'managerId',
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
 * Direct-manager options (§3): active employees whose job title manages people (the API filters
 * them) — never the employee being edited and never an inactive one. The current manager stays
 * listed so an unrelated edit doesn't blank it, even when they no longer manage people:
 * `currentNotManaging` then says so, for the field's note.
 */
export function managerOptions(
  candidates: EmployeeSummary[],
  locale: Locale,
  noneLabel: string,
  selfId?: Uuid,
  current?: (NamedRef & { code: string; managesPeople?: boolean }) | null,
): { options: SelectOption[]; currentNotManaging: boolean; hasCandidates: boolean } {
  const label = (e: NamedRef & { code: string }) => `${localName(e, locale)} · ${e.code}`;
  const options = candidates
    .filter((e) => e.status === EmployeeStatus.ACTIVE && e.id !== selfId)
    .map((e) => ({ value: e.id, label: label(e), keywords: [e.nameEn, e.nameAr, e.code] }));
  const hasCandidates = options.length > 0;
  const kept = Boolean(current && current.id !== selfId);
  if (current && kept && !options.some((o) => o.value === current.id)) {
    options.push({ value: current.id, label: label(current), keywords: [current.nameEn, current.nameAr, current.code] });
  }
  return {
    options: [{ value: NO_MANAGER, label: noneLabel }, ...options],
    currentNotManaging: kept && current?.managesPeople === false,
    hasCandidates,
  };
}
