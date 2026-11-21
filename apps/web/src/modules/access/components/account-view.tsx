'use client';

import { ErrorCode, type IsoDateTime, type UserAccount } from '@school-erp/shared';
import { useId, useRef, useState, type FormEvent } from 'react';
import { CHANGE_OWN_PASSWORD, NewPasswordFields, PasswordInput, checkNewPassword, signOut, type NewPassword } from '@/core/auth';
import { EmployeeLink } from '@/core/employees';
import { forgetDeviceThenSubmit, InstallApp } from '@/core/pwa';
import { callApi } from '@/lib/callApi';
import { FieldShell } from '@/shared/components/form/field-shell';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Button } from '@/shared/components/ui/button';
import { ErrorIcon, LinkedEmployeeIcon, LockedIcon, PasswordIcon, SignOutIcon } from '@/shared/components/ui/icons';
import { Input } from '@/shared/components/ui/input';
import { PersonAvatar } from '@/shared/components/ui/person-avatar';
import { apiErrorText } from '@/shared/lib/api-error';
import { localName } from '@/shared/lib/i18n';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { formatSignIn } from '../lib/sign-in-time';
import { AccountTabs } from './account-tabs';
import { FormCard, FormColumns } from './form-card';
import { RoleChips } from './role-bits';

/**
 * My account (P3, option A): who you are (name and email are changed by a System admin), your
 * roles and linked employee, your sign-in facts, and changing your own password (the current one,
 * then the new one twice).
 */
export function AccountView({ account, now }: { account: UserAccount; now: IsoDateTime }) {
  const { t, locale } = useTranslation();
  const nameId = useId();
  const emailId = useId();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('access.account.title')} description={t('access.account.description')} />
      <AccountTabs />
      <FormColumns
        main={
          <>
            <section data-skeleton-block="account-profile" className="@container flex flex-col gap-5 rounded-3xl bg-card p-5 shadow-card md:p-6">
              <div className="flex min-w-0 items-center gap-4">
                <PersonAvatar photoUrl={account.employee?.photoUrl} gender={account.employee?.gender} size="md" />
                <div className="flex min-w-0 flex-col">
                  <h2 className="truncate font-display text-xl font-extrabold">{account.name}</h2>
                  <bdi dir="ltr" className="truncate text-sm text-muted-foreground">
                    {account.email}
                  </bdi>
                </div>
              </div>
              <div className="grid gap-5 @min-[560px]:grid-cols-2">
                <FieldShell id={nameId} label={t('access.account.name')}>
                  {(a11y) => <LockedInput {...a11y} value={account.name} />}
                </FieldShell>
                <FieldShell id={emailId} label={t('access.account.email')}>
                  {(a11y) => <LockedInput {...a11y} value={account.email} dir="ltr" />}
                </FieldShell>
              </div>
              <p className="text-sm text-muted-foreground">{t('access.account.askAdmin')}</p>
              <div className="grid gap-4 border-t border-border pt-4 @min-[560px]:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">{t('access.account.yourRoles')}</span>
                  {account.roles.length ? (
                    <RoleChips roles={account.roles} />
                  ) : (
                    <span className="text-sm text-muted-foreground">{t('access.account.noRoles')}</span>
                  )}
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">{t('access.account.linkedEmployee')}</span>
                  {account.employee ? (
                    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-primary">
                      <LinkedEmployeeIcon className="size-4 shrink-0 text-muted-foreground" />
                      <EmployeeLink
                        employeeId={account.employee.id}
                        name={localName(account.employee, locale)}
                        code={account.employee.code}
                      />
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">{t('access.account.notLinked')}</span>
                  )}
                </div>
              </div>
            </section>
            <ChangePasswordCard />
          </>
        }
        side={
          <>
          <FormCard title={t('access.account.signIn')}>
            <dl className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">{t('access.account.lastSignIn')}</dt>
                <dd className="tabular font-bold">{formatSignIn(account.lastSignInAt, now, locale, t)}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">{t('access.account.passwordChanged')}</dt>
                <dd className="tabular font-bold">
                  {account.passwordChangedAt
                    ? formatSignIn(account.passwordChangedAt, now, locale, t)
                    : t('access.account.unknown')}
                </dd>
              </div>
            </dl>
            <form action={signOut.bind(null, locale)} onSubmit={forgetDeviceThenSubmit}>
              <Button type="submit" variant="secondary" className="w-full">
                <SignOutIcon className="flip-rtl" />
                {t('access.account.signOut')}
              </Button>
            </form>
          </FormCard>
          {/* Shown only where the browser can install the app (or on an iPhone): never a banner. */}
          <InstallApp />
          </>
        }
      />
    </div>
  );
}

/** Name and email as read-only fields with a lock: only a System admin changes them. */
function LockedInput(props: { id: string; value: string; dir?: 'ltr'; 'aria-describedby'?: string }) {
  return (
    // The lock sits at the end of the text's own direction (an email reads left to right).
    <div className="relative" dir={props.dir}>
      <Input
        id={props.id}
        aria-describedby={props['aria-describedby']}
        value={props.value}
        dir={props.dir}
        readOnly
        className="bg-muted pe-11 text-start text-muted-foreground"
      />
      <LockedIcon className="pointer-events-none absolute inset-y-0 end-3.5 my-auto size-4.5 text-muted-foreground" />
    </div>
  );
}

/** Change your own password (current, new, confirm). The page's skeleton draws it masked. */
export function ChangePasswordCard() {
  const { t, has } = useTranslation();
  const currentId = useId();
  const [current, setCurrent] = useState('');
  const [value, setValue] = useState<NewPassword>({ next: '', confirm: '' });
  const [tried, setTried] = useState(false);
  const [wrongCurrent, setWrongCurrent] = useState(false);
  const [sameAsCurrent, setSameAsCurrent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const filled = current.length > 0 && value.next.length > 0 && value.confirm.length > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (inFlight.current || !filled || !checkNewPassword(value).ok) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await callApi(CHANGE_OWN_PASSWORD({ currentPassword: current, newPassword: value.next }), {
        showErrorToast: false,
        showSuccessToast: true,
        successMessage: t('access.account.changed'),
      });
      if (res.unauthorized) return;
      if (res.success) {
        setCurrent('');
        setValue({ next: '', confirm: '' });
        setTried(false);
        return;
      }
      if (res.error === ErrorCode.WRONG_PASSWORD) setWrongCurrent(true);
      else if (res.error === ErrorCode.SAME_PASSWORD) setSameAsCurrent(true);
      // Anything else, a sign-in lock included ("Try again in N minutes", from `params.count`).
      else setError(apiErrorText(res, { t, has }) || t('auth.password.failed'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <FormCard title={t('access.account.changePassword')} hint={t('access.account.changePasswordHint')}>
      <form noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" aria-label={t('access.account.changePassword')}>
        <FieldShell
          id={currentId}
          label={t('access.account.currentPassword')}
          required
          error={wrongCurrent ? 'errors.WRONG_PASSWORD' : tried && !current ? t('auth.password.errors.required') : undefined}
        >
          {(a11y) => (
            <PasswordInput
              {...a11y}
              value={current}
              onChange={(v) => {
                setCurrent(v);
                setWrongCurrent(false);
              }}
              placeholder={t('access.account.currentPasswordPlaceholder')}
              autoComplete="current-password"
              disabled={busy}
            />
          )}
        </FieldShell>
        <NewPasswordFields
          value={value}
          onChange={(next) => {
            setValue(next);
            if (next.next !== value.next) setSameAsCurrent(false);
          }}
          showErrors={tried}
          sameAsCurrent={sameAsCurrent}
          disabled={busy}
        />
        {error ? (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-destructive-soft px-3.5 py-2.5 text-sm font-semibold text-destructive-ink">
            <ErrorIcon className="mt-0.5 size-4.5 shrink-0" />
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="text-sm text-muted-foreground">
            {filled ? t('access.account.ready') : t('access.account.fillAll')}
          </p>
          <Button type="submit" variant="primary" loading={busy} disabled={!filled}>
            {busy ? null : <PasswordIcon />}
            {t('access.account.changePassword')}
          </Button>
        </div>
      </form>
    </FormCard>
  );
}
