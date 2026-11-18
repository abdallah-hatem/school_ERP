import { ErrorCode, GENDERS, type CreateUserRequest, type UpdateUserRequest, type UserAccount } from '@school-erp/shared';
import { z } from 'zod';

/*
 * The user form's rules, its values and how they become API requests. Error messages are
 * translation keys so one schema serves both languages.
 */

const linkedEmployee = z
  .object({
    id: z.string(),
    code: z.string(),
    nameEn: z.string(),
    nameAr: z.string(),
    photoUrl: z.string().nullable(),
    gender: z.enum(GENDERS),
  })
  .nullable();

export const userFormSchema = z.object({
  name: z.string().trim().min(1, 'access.userForm.errors.name').max(100, 'access.userForm.errors.name'),
  email: z
    .string()
    .trim()
    .max(254, 'access.userForm.errors.email')
    .refine((v) => z.email().safeParse(v).success, 'access.userForm.errors.email'),
  roleIds: z.array(z.string()),
  employee: linkedEmployee,
});

export type UserFormValues = z.infer<typeof userFormSchema>;

export function emptyUserForm(): UserFormValues {
  return { name: '', email: '', roleIds: [], employee: null };
}

export function userToForm(user: UserAccount): UserFormValues {
  return { name: user.name, email: user.email, roleIds: user.roles.map((r) => r.id), employee: user.employee };
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

/** Which fields differ from the saved user ("2 unsaved changes"; back to the original = unchanged). */
export function changedFields(saved: UserFormValues, current: UserFormValues): (keyof UserFormValues)[] {
  const out: (keyof UserFormValues)[] = [];
  if (saved.name.trim() !== current.name.trim()) out.push('name');
  if (saved.email.trim().toLowerCase() !== current.email.trim().toLowerCase()) out.push('email');
  if (!sameSet(saved.roleIds, current.roleIds)) out.push('roleIds');
  if ((saved.employee?.id ?? null) !== (current.employee?.id ?? null)) out.push('employee');
  return out;
}

export function formToCreate(values: UserFormValues, password: string): CreateUserRequest {
  return {
    name: values.name.trim(),
    email: values.email.trim(),
    password,
    roleIds: values.roleIds,
    employeeId: values.employee?.id ?? null,
  };
}

/** Only what changed (`roleIds` replaces the set; `employeeId: null` unlinks). */
export function formToUpdate(saved: UserFormValues, values: UserFormValues): UpdateUserRequest {
  const changed = new Set(changedFields(saved, values));
  return {
    ...(changed.has('name') ? { name: values.name.trim() } : {}),
    ...(changed.has('email') ? { email: values.email.trim() } : {}),
    ...(changed.has('roleIds') ? { roleIds: values.roleIds } : {}),
    ...(changed.has('employee') ? { employeeId: values.employee?.id ?? null } : {}),
  };
}

/** The field a server rule error belongs under, or null (shown above the actions). */
export function fieldForError(code: unknown): keyof UserFormValues | null {
  switch (code) {
    case ErrorCode.EMAIL_TAKEN:
      return 'email';
    case ErrorCode.EMPLOYEE_ALREADY_LINKED:
    case ErrorCode.UNKNOWN_EMPLOYEE:
      return 'employee';
    case ErrorCode.LAST_SYSTEM_ADMIN:
    case ErrorCode.UNKNOWN_ROLE:
      return 'roleIds';
    default:
      return null;
  }
}
