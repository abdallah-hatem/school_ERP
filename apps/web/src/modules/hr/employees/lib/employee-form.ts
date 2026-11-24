import {
  applyInsuranceStatus,
  contractYearFor,
  DEGREES,
  ErrorCode,
  GENDERS,
  graduationYearRange,
  INSURANCE_STATUSES,
  InsuranceStatus,
  isValidEgyptianIban,
  isValidGraduationYear,
  isProbationEndValid,
  MAX_MONTHLY_PIASTRES,
  normalizeIban,
  socialInsuranceIssues,
  WORK_SYSTEMS,
  type Degree,
  type CreateEmployeeRequest,
  type Employee,
  type Gender,
  type IsoDate,
  type NamedRef,
  type UpdateEmployeeRequest,
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

/** The grade picker's "no grade" item (§3, owner 2026-11-24: the grade is optional). */
export const NO_GRADE = '__none__';

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

const employeeFields = z.object({
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
    /** §3 (N0): empty on a new employee → the API fills it from the hire date; empty on edit → none. */
    probationEnd: z.string().nullable(),
    stageId: requiredId,
    /** "Also teaches in" (owner 2026-11-21): the other stages, as their tags show them. */
    otherStages: z.array(z.object({ id: z.string(), label: z.string() })),
    departmentId: requiredId,
    jobTitleId: requiredId,
    managerId: z.string(),
    gradeId: z.string(),
    workSystem: z.string().refine((v) => (WORK_SYSTEMS as string[]).includes(v), REQUIRED),
    basicSalary: z
      .number()
      .nullable()
      .superRefine((v, ctx) => {
        if (v == null) ctx.addIssue({ code: 'custom', message: REQUIRED });
        else if (!Number.isInteger(v) || v <= 0) ctx.addIssue({ code: 'custom', message: 'employees.errors.salaryPositive' });
        else if (v > MAX_MONTHLY_PIASTRES) ctx.addIssue({ code: 'custom', message: 'employees.errors.salaryTooLarge' });
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
  });

/**
 * The form's rules. `salary: false` — someone editing an employee whose salary they may not see
 * (R7): the salary fields are neither shown nor checked, and are never sent (`formToUpdate` sends
 * only what changed).
 */
export function employeeFormSchemaFor({ salary }: { salary: boolean }) {
  const fields = salary ? employeeFields : employeeFields.extend({ basicSalary: z.number().nullable() });
  return fields.superRefine((v, ctx) => {
    // §3: the main stage isn't also an "also teaches in" stage.
    if (v.stageId && v.otherStages.some((s) => s.id === v.stageId)) {
      ctx.addIssue({ code: 'custom', path: ['otherStages'], message: 'employees.errors.otherStageIsMain' });
    }
    if (v.contractStart && v.contractEnd && v.contractEnd <= v.contractStart) {
      ctx.addIssue({ code: 'custom', path: ['contractEnd'], message: 'employees.errors.contractOrder' });
    }
    // Against a valid hire date only: a future one already has its own message.
    if (v.hireDate && v.hireDate <= todayIso() && !isProbationEndValid(v.hireDate, v.probationEnd)) {
      ctx.addIssue({ code: 'custom', path: ['probationEnd'], message: 'employees.errors.probationBeforeHire' });
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
      if (!salary && field === 'insuredSalary') continue;
      ctx.addIssue({ code: 'custom', path: [field], message: INSURANCE_MESSAGES[issue] });
    }
  });
}

export const employeeFormSchema = employeeFormSchemaFor({ salary: true });

export type EmployeeFormValues = z.input<typeof employeeFormSchema>;

/** One "also teaches in" tag: the stage and its name in the form's language. */
export type OtherStageChoice = EmployeeFormValues['otherStages'][number];

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
    probationEnd: null,
    stageId: '',
    otherStages: [],
    departmentId: '',
    jobTitleId: '',
    managerId: NO_MANAGER,
    gradeId: NO_GRADE,
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
/** An employee as the edit form's values; `locale` names the "also teaches in" tags. */
export function employeeToForm(employee: Employee, locale: Locale = 'en'): EmployeeFormValues {
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
    probationEnd: employee.probationEnd,
    stageId: employee.stage.id,
    otherStages: employee.otherStages.map((s) => ({ id: s.id, label: localName(s, locale) })),
    departmentId: employee.department.id,
    jobTitleId: employee.jobTitle.id,
    managerId: employee.manager?.id ?? NO_MANAGER,
    gradeId: employee.grade?.id ?? NO_GRADE,
    workSystem: employee.workSystem,
    basicSalary: employee.basicSalary ?? null,
    fingerprintId: employee.fingerprintId ?? '',
    contractStart: employee.contractStart,
    contractEnd: employee.contractEnd,
    usesBus: employee.usesBus,
    insuranceStatus: employee.insuranceStatus,
    insuranceNumber: employee.insuranceNumber ?? '',
    insuranceRegistrationDate: employee.insuranceRegistrationDate,
    insuredSalary: employee.insuredSalary ?? null,
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
    probationEnd: v.probationEnd,
    stageId: v.stageId,
    otherStageIds: v.otherStages.map((s) => s.id),
    departmentId: v.departmentId,
    jobTitleId: v.jobTitleId,
    managerId: v.managerId && v.managerId !== NO_MANAGER ? v.managerId : null,
    gradeId: v.gradeId && v.gradeId !== NO_GRADE ? v.gradeId : null,
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

/** Create-only fields: the first contract's dates, which later change only through Contracts (renew, end). */
const CREATE_ONLY: readonly (keyof CreateEmployeeRequest)[] = ['contractStart', 'contractEnd'];

/**
 * Only what changed since `initial`, so an untouched hidden department or a manager who has since
 * left isn't re-validated as a new choice. A cleared optional field is sent as `null`. The contract
 * dates are never sent (spec 2026-11-24, edge case 13).
 */
export function formToUpdate(values: EmployeeFormValues, initial: EmployeeFormValues): UpdateEmployeeRequest {
  const next = formToRequest(values);
  const before = formToRequest(initial);
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(next) as (keyof CreateEmployeeRequest)[]) {
    if (CREATE_ONLY.includes(key)) continue;
    const a = next[key];
    const b = before[key];
    // A list (the other stages) changes when its items do, not when it is a new array.
    if (Array.isArray(a) && Array.isArray(b) ? a.join() !== b.join() : a !== b) patch[key] = a;
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
  [ErrorCode.PROBATION_BEFORE_HIRE]: 'probationEnd',
  [ErrorCode.INVALID_OTHER_STAGES]: 'otherStages',
};

export function fieldForError(code: unknown): keyof EmployeeFormValues | undefined {
  return typeof code === 'string' ? FIELD_BY_ERROR[code] : undefined;
}

/** A direct-manager choice (§3): "Name · code". The API lists the candidates as the person types. */
export function managerChoice(e: NamedRef & { code: string }, locale: Locale): SelectOption {
  return { value: e.id, label: `${localName(e, locale)} · ${e.code}` };
}
