'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { IsoDateTime, Role, UserAccount } from '@school-erp/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useCan } from '@/core/auth';
import { callApi } from '@/lib/callApi';
import { FieldShell } from '@/shared/components/form/field-shell';
import { TextField } from '@/shared/components/form/fields';
import { Form } from '@/shared/components/form/form';
import { FormActionBar } from '@/shared/components/form/form-action-bar';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Button } from '@/shared/components/ui/button';
import {
  AddUserIcon,
  ErrorIcon,
  LockedIcon,
  ReadyIcon,
  TemporaryPasswordIcon,
} from '@/shared/components/ui/icons';
import { StatusChangeButton } from '@/shared/components/ui/status-change-button';
import { StatusPill } from '@/shared/components/ui/status-pill';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { CREATE_USER, UPDATE_USER } from '../apis';
import { formatSignIn } from '../lib/sign-in-time';
import { generateTemporaryPassword } from '../lib/temp-password';
import {
  changedFields,
  emptyUserForm,
  fieldForError,
  formToCreate,
  formToUpdate,
  userFormSchema,
  userToForm,
  type UserFormValues,
} from '../lib/user-form';
import { EmployeePicker } from './employee-picker';
import { FormCard, FormColumns } from './form-card';
import { RoleChecklist } from './role-checklist';
import { TempPasswordBox } from './temp-password';
import { useUserActions } from './user-actions';

export interface UserFormProps {
  /** `/en/users`. */
  basePath: string;
  /** The user being edited; omit to add one. */
  user?: UserAccount;
  /** Every role, for the checklist. */
  roles: Role[];
  /**
   * The user is the only active System admin: the role is locked on and the account can't be
   * deactivated (R8, edge case 5). The API refuses both anyway.
   */
  lastAdmin?: boolean;
  /** Adding: the first temporary password, made by the server screen so both renders agree. */
  initialPassword?: string;
  /** The server's clock ("Today, 09:12"). */
  now: IsoDateTime;
}

/**
 * Add or edit a user (P3, option A): a full page — Account, Roles (searchable checklist), Linked
 * employee (searchable picker) and, at the side, the status and the password. Adding shows the
 * temporary password to give the person; editing keeps Save disabled until something changes.
 * Without `core.users.manage` the page is read-only.
 */
export function UserForm({ basePath, user, roles, lastAdmin = false, initialPassword, now }: UserFormProps) {
  const { t, has, locale } = useTranslation();
  const router = useRouter();
  const canManage = useCan()('core.users.manage');
  const readOnly = !canManage;
  const initial = useMemo(() => (user ? userToForm(user) : emptyUserForm()), [user]);
  const form = useForm<UserFormValues>({ resolver: zodResolver(userFormSchema), defaultValues: initial });
  const { control, setError } = form;
  const values = useWatch({ control }) as UserFormValues;
  const changed = user ? changedFields(initial, { ...initial, ...values }) : [];
  // The server screen makes the first one and passes it down: one made during render here would
  // differ between the server and the browser (a hydration mismatch). Regenerate makes new ones.
  const [password, setPassword] = useState(() => (user ? '' : (initialPassword ?? generateTemporaryPassword())));
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const actions = useUserActions();
  const rolesTitleId = useId();
  const employeeFieldId = useId();

  async function onSubmit(next: UserFormValues) {
    if (inFlight.current || readOnly) return;
    if (user && changedFields(initial, next).length === 0) return;
    inFlight.current = true;
    setBusy(true);
    setFormError(null);
    let saved = false;
    try {
      const res = user
        ? await callApi(UPDATE_USER(user.id, formToUpdate(initial, next)), {
            showErrorToast: false,
            showSuccessToast: true,
            successMessage: t('access.userForm.saved'),
          })
        : await callApi(CREATE_USER(formToCreate(next, password)), {
            showErrorToast: false,
            showSuccessToast: true,
            successMessage: t('access.userForm.created', { name: next.name.trim() }),
          });
      if (res.unauthorized) return;
      if (res.success) {
        saved = true;
        router.push(basePath);
        router.refresh();
        return;
      }
      const field = fieldForError(res.error);
      const key = `errors.${String(res.error)}`;
      const message = has(key) ? key : res.message || t('access.userForm.saveFailed');
      if (field) setError(field, { message }, { shouldFocus: field !== 'roleIds' && field !== 'employee' });
      else setFormError(has(key) ? t(key) : message);
    } finally {
      if (!saved) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }

  const title = user ? user.name : t('access.userForm.addTitle');
  const description = user
    ? readOnly
      ? t('access.userForm.viewDescription')
      : t('access.userForm.editDescription')
    : t('access.userForm.addDescription');
  const lockedReason = lastAdmin && user ? t('access.userForm.lockedAdmin', { name: user.name }) : null;

  const account = (
    <FormCard title={t('access.userForm.account')}>
      <div className="grid gap-5 @min-[560px]:grid-cols-2">
        <TextField
          control={control}
          name="name"
          label={t('access.userForm.name')}
          placeholder={t('access.userForm.namePlaceholder')}
          autoComplete="off"
          required
          disabled={readOnly}
        />
        <TextField
          control={control}
          name="email"
          type="email"
          inputMode="email"
          dir="ltr"
          autoComplete="off"
          label={t('access.userForm.email')}
          placeholder={t('access.userForm.emailPlaceholder')}
          hint={t('access.userForm.emailHint')}
          required
          disabled={readOnly}
        />
      </div>
    </FormCard>
  );

  const rolesCard = (
    <FormCard title={t('access.userForm.roles')} titleId={rolesTitleId} hint={t('access.userForm.rolesHint')} measure="width">
      <Controller
        control={control}
        name="roleIds"
        render={({ field, fieldState }) => (
          <>
            <RoleChecklist
              roles={roles}
              value={field.value}
              onChange={field.onChange}
              lockedReason={lockedReason}
              disabled={readOnly}
              labelledBy={rolesTitleId}
            />
            {fieldState.error?.message ? (
              <p role="alert" className="flex items-start gap-1.5 text-sm font-semibold text-destructive-ink">
                <ErrorIcon className="mt-0.5 size-4 shrink-0" />
                {has(fieldState.error.message) ? t(fieldState.error.message) : fieldState.error.message}
              </p>
            ) : field.value.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('access.userForm.noRoles')}</p>
            ) : null}
          </>
        )}
      />
    </FormCard>
  );

  const employeeCard = (
    <FormCard
      title={t('access.userForm.employee')}
      note={t('access.userForm.employeeOptional')}
      hint={t('access.userForm.employeeHint')}
    >
      <Controller
        control={control}
        name="employee"
        render={({ field, fieldState }) => (
          <FieldShell
            id={employeeFieldId}
            label={t('access.userForm.employeeField')}
            hint={t('access.userForm.employeeFieldHint')}
            error={fieldState.error?.message}
          >
            {(a11y) => (
              <EmployeePicker
                id={a11y.id}
                value={field.value}
                onChange={field.onChange}
                userId={user?.id}
                disabled={readOnly}
                invalid={a11y['aria-invalid']}
                describedBy={a11y['aria-describedby']}
              />
            )}
          </FieldShell>
        )}
      />
    </FormCard>
  );

  const statusCard = user ? (
    <FormCard title={t('access.userForm.status')}>
      <div className="flex flex-wrap items-center gap-2.5">
        {user.isActive ? (
          <StatusPill tone="success">{t('access.users.statuses.active')}</StatusPill>
        ) : (
          <StatusPill tone="neutral" hollow>{t('access.users.statuses.inactive')}</StatusPill>
        )}
        <span className="text-sm text-muted-foreground">
          {t('access.userForm.lastSignIn', { when: formatSignIn(user.lastSignInAt, now, locale, t) })}
        </span>
      </div>
      {canManage ? (
        user.isActive ? (
          <div className="flex flex-col gap-2">
            <StatusChangeButton
              change="deactivate"
              className="w-full"
              disabled={lastAdmin}
              aria-describedby={lastAdmin ? `${employeeFieldId}-last-admin` : undefined}
              onClick={() => actions.deactivate(user)}
            >
              {t('access.userForm.deactivateAccount')}
            </StatusChangeButton>
            {lastAdmin ? (
              <p id={`${employeeFieldId}-last-admin`} className="flex items-start gap-1.5 text-xs font-semibold text-warning-ink">
                <LockedIcon className="mt-px size-3.5 shrink-0" />
                {t('access.users.lastAdmin')}
              </p>
            ) : null}
          </div>
        ) : (
          <StatusChangeButton change="reactivate" className="w-full" onClick={() => actions.reactivate(user)}>
            {t('access.userForm.reactivateAccount')}
          </StatusChangeButton>
        )
      ) : null}
    </FormCard>
  ) : null;

  const passwordCard = user ? (
    canManage && user.isActive ? (
      <FormCard title={t('access.userForm.password')}>
        {user.mustChangePassword ? (
          <div className="flex items-start gap-2.5 rounded-xl bg-warning-soft p-3 text-warning-ink">
            <TemporaryPasswordIcon className="mt-0.5 size-5 shrink-0" />
            <div className="flex flex-col gap-0.5 text-sm">
              <span className="font-bold">{t('access.userForm.mustChangeTitle')}</span>
              <span>{t('access.userForm.mustChangeBody', { name: user.name })}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('access.userForm.passwordHint')}</p>
        )}
        <Button type="button" variant="secondary" className="w-full" onClick={() => actions.setPassword(user)}>
          <TemporaryPasswordIcon />
          {user.mustChangePassword ? t('access.userForm.setNewPassword') : t('access.userForm.setPassword')}
        </Button>
      </FormCard>
    ) : null
  ) : (
    <FormCard title={t('access.userForm.password')}>
      <TempPasswordBox
        password={password}
        name={values.name?.trim() || undefined}
        onRegenerate={() => setPassword(generateTemporaryPassword())}
        disabled={busy}
      />
    </FormCard>
  );

  const nameAndEmail = Boolean(values.name?.trim()) && Boolean(values.email?.trim());
  const status = user ? (
    <p role="status" className={changed.length ? 'font-semibold text-warning-ink' : 'text-muted-foreground'}>
      {changed.length
        ? t('access.userForm.unsaved', { count: changed.length })
        : t('access.userForm.noChanges')}
    </p>
  ) : (
    // On a phone the two buttons need the whole bar; the hint stays for screen readers.
    <p role="status" className="flex items-center gap-1.5 text-muted-foreground max-sm:sr-only">
      <ReadyIcon className={nameAndEmail ? 'size-4 text-success' : 'size-4'} />
      {nameAndEmail ? t('access.userForm.requiredFilled') : t('access.userForm.requiredMissing')}
    </p>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        description={description}
        breadcrumbs={[
          { label: t('access.administration') },
          { label: t('access.users.title'), href: basePath },
          { label: title },
        ]}
        breadcrumbsLabel={t('ui.shell.breadcrumbs')}
      />
      <Form onSubmit={(e) => void form.handleSubmit(onSubmit)(e)} aria-label={title}>
        <FormColumns
          main={
            user ? (
              <>
                {account}
                {rolesCard}
                {employeeCard}
              </>
            ) : (
              <>
                {account}
                {employeeCard}
                {rolesCard}
              </>
            )
          }
          side={
            <>
              {statusCard}
              {passwordCard}
            </>
          }
        />
        {formError ? (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-destructive-soft px-4 py-3 text-sm font-semibold text-destructive-ink">
            <ErrorIcon className="mt-0.5 size-5 shrink-0" />
            {formError}
          </p>
        ) : null}
        {readOnly ? null : (
          <FormActionBar status={status}>
            <Button asChild variant="secondary" aria-disabled={busy || undefined}>
              <Link href={basePath}>{t('common.actions.cancel')}</Link>
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={Boolean(user) && changed.length === 0}>
              {user ? null : <AddUserIcon />}
              {user ? t('access.userForm.save') : t('access.userForm.create')}
            </Button>
          </FormActionBar>
        )}
      </Form>
      {actions.dialogs}
    </div>
  );
}
