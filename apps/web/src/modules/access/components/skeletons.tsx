'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useId, type ReactNode } from 'react';
import { FieldShell } from '@/shared/components/form/field-shell';
import { Form } from '@/shared/components/form/form';
import { FormActionBar } from '@/shared/components/form/form-action-bar';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Button } from '@/shared/components/ui/button';
import { AddUserIcon, ReadyIcon, RemoveIcon } from '@/shared/components/ui/icons';
import { formatCount } from '@/shared/lib/format';
import { Skeleton, SkeletonButton, SkeletonIdentity, SkeletonMask, SkeletonPill, SkeletonProse, SkeletonText } from '@/shared/components/ui/skeleton';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { parseUsersQuery } from '../lib/users-query';
import { AccessI18n } from '../messages';
import { ChangePasswordCard } from './account-view';
import { AccountTabs } from './account-tabs';
import { NotificationPreferencesSkeleton, NotificationsI18n } from '@/core/notifications';
import { DeviceAlerts } from '@/core/pwa';
import { FormCard, FormColumns } from './form-card';
import { PermissionGroups } from './permission-groups';
import { RoleScopesCard } from './role-form';
import { RolesList } from './roles-list';
import { TempPasswordBox } from './temp-password';
import { UsersList } from './users-list';

/*
 * The Users, Roles and My account pages while they load. The lists are the lists themselves in
 * their loading state. The form pages use the forms' own header, columns, cards, field shells and
 * Save bar, with the static parts drawn for real (labels, hints, the permission list, the scopes,
 * the change-password form) and a bar where data goes. `loading.tsx` renders before the page's own
 * messages, so each brings them. e2e/23-skeletons*.spec.ts compares each with its page.
 */

const noop = () => undefined;

/** Users: the list itself — header, the search + filters card, 10 skeleton rows, pagination. */
export function UsersListSkeleton() {
  const { locale } = useTranslation();
  const params = useSearchParams();
  return (
    <AccessI18n locale={locale}>
      <UsersList
        basePath={`/${locale}/users`}
        query={parseUsersQuery(Object.fromEntries(params))}
        rows={undefined}
        total={0}
        roles={[]}
        lastAdminId={null}
        now={new Date().toISOString()}
      />
    </AccessI18n>
  );
}

/** Roles: the list itself — header, the table with skeleton rows and the note under it. */
export function RolesListSkeleton() {
  const { locale } = useTranslation();
  return (
    <AccessI18n locale={locale}>
      <RolesList basePath={`/${locale}/roles`} roles={undefined} holders={{}} />
    </AccessI18n>
  );
}

/** A user's page, a role's page or My account while it loads. */
export function FormPageSkeleton({ kind }: { kind: 'user' | 'role' | 'account' }) {
  const { locale } = useTranslation();
  const adding = usePathname()?.endsWith('/new') ?? false;
  return (
    <AccessI18n locale={locale}>
      <div aria-busy="true" className="flex flex-col gap-6">
        <LoadingStatus />
        {kind === 'account' ? <AccountSkeleton /> : kind === 'user' ? <UserSkeleton adding={adding} /> : <RoleSkeleton adding={adding} />}
      </div>
    </AccessI18n>
  );
}

/** My account → Notifications while it loads: the header, the tabs and the switch list itself. */
export function AccountNotificationsSkeleton() {
  const { t, locale } = useTranslation();
  return (
    <AccessI18n locale={locale}>
      <NotificationsI18n locale={locale}>
        <div aria-busy="true" className="flex flex-col gap-6">
          <Header title={t('access.account.title')} description={t('access.account.notificationsDescription')} />
          <AccountTabs />
          <SkeletonMask>
            <DeviceAlerts initial={{ available: true, publicKey: null, devices: [] }} />
          </SkeletonMask>
          <NotificationPreferencesSkeleton />
        </div>
      </NotificationsI18n>
    </AccessI18n>
  );
}

function LoadingStatus() {
  const { t } = useTranslation();
  return (
    <span role="status" className="sr-only">
      {t('ui.states.loading')}
    </span>
  );
}

/**
 * The page header with the loaded title and description drawn as bars of their own text, so they
 * wrap where the loaded ones do; a record's name (not known yet) is a short bar.
 */
function Header({
  crumb,
  title,
  description,
  status,
  action,
}: {
  crumb?: 'users' | 'roles';
  title?: string;
  description: string;
  /** The kind pill beside a role's name (most roles opened are built-in: the defaults). */
  status?: boolean;
  /** A button in the header (a role's Delete: every role but the System admin has one). */
  action?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <PageHeader
      title={title ? <SkeletonProse>{title}</SkeletonProse> : <SkeletonText width="w-40" />}
      status={status ? <SkeletonPill icon>{t('access.roles.builtIn')}</SkeletonPill> : undefined}
      description={<SkeletonProse>{description}</SkeletonProse>}
      actions={
        action ? (
          <SkeletonButton>
            <RemoveIcon />
            {t('access.roleForm.deleteRole')}
          </SkeletonButton>
        ) : undefined
      }
      breadcrumbs={
        crumb ? [{ label: t('access.administration') }, { label: t(`access.${crumb}.title`) }, { label: ' ' }] : undefined
      }
      breadcrumbsLabel={t('ui.shell.breadcrumbs')}
    />
  );
}

/** A field: its real label and hint around an input-sized bar. */
function FieldSkeleton({ label, hint, required = false }: { label: string; hint?: string; required?: boolean }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} required={required}>
      {() => <Skeleton className="h-11 rounded-lg" />}
    </FieldShell>
  );
}

/** Static content drawn for real but inert, its controls as pulsing blocks. */
function Masked({ children }: { children: ReactNode }) {
  return (
    <div aria-hidden="true" inert className="skeleton-mask">
      {children}
    </div>
  );
}

/**
 * The form's Save bar with its real status line and buttons — the skeleton's `<Form>` is masked,
 * so they are pulsing blocks of the loaded widths and the bar wraps where the loaded one does.
 */
function SaveBar({ kind, adding }: { kind: 'user' | 'role'; adding: boolean }) {
  const { t } = useTranslation();
  const status = !adding ? (
    <p role="status" className="text-muted-foreground">
      {t('access.userForm.noChanges')}
    </p>
  ) : kind === 'user' ? (
    <p role="status" className="flex items-center gap-1.5 text-muted-foreground max-sm:sr-only">
      <ReadyIcon className="size-4" />
      {t('access.userForm.requiredMissing')}
    </p>
  ) : (
    <p role="status" className="text-muted-foreground">
      {t('access.roles.permissionCount', { count: formatCount(0) })}
    </p>
  );
  return (
    <FormActionBar status={status}>
      <Button type="button" variant="secondary" tabIndex={-1}>
        {t('common.actions.cancel')}
      </Button>
      <Button type="button" variant="primary" tabIndex={-1}>
        {kind === 'user' && adding ? <AddUserIcon /> : null}
        {t(adding ? `access.${kind}Form.create` : `access.${kind}Form.save`)}
      </Button>
    </FormActionBar>
  );
}

function UserSkeleton({ adding }: { adding: boolean }) {
  const { t } = useTranslation();
  const account = (
    <FormCard title={t('access.userForm.account')}>
      <div className="grid gap-5 @min-[560px]:grid-cols-2">
        <FieldSkeleton label={t('access.userForm.name')} required />
        <FieldSkeleton label={t('access.userForm.email')} hint={t('access.userForm.emailHint')} required />
      </div>
    </FormCard>
  );
  const roles = (
    <FormCard title={t('access.userForm.roles')} hint={t('access.userForm.rolesHint')} measure="width">
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    </FormCard>
  );
  const employee = (
    <FormCard title={t('access.userForm.employee')} note={t('access.userForm.employeeOptional')} hint={t('access.userForm.employeeHint')}>
      <FieldSkeleton label={t('access.userForm.employeeField')} hint={t('access.userForm.employeeFieldHint')} />
    </FormCard>
  );
  return (
    <>
      <Header
        crumb="users"
        title={adding ? t('access.userForm.addTitle') : undefined}
        description={t(adding ? 'access.userForm.addDescription' : 'access.userForm.editDescription')}
      />
      <Form aria-hidden="true" inert className="skeleton-mask">
        <FormColumns
          sideFirst={!adding}
          main={
            adding ? (
              <>
                {account}
                {employee}
                {roles}
              </>
            ) : (
              <>
                {account}
                {roles}
                {employee}
              </>
            )
          }
          side={
            adding ? (
              <FormCard title={t('access.userForm.password')}>
                <Masked>
                  <TempPasswordBox password="" onRegenerate={noop} disabled />
                </Masked>
              </FormCard>
            ) : (
              <>
                <FormCard title={t('access.userForm.status')}>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <SkeletonPill />
                    <SkeletonText className="text-sm" width="w-36" />
                  </div>
                  <Skeleton className="h-11 rounded-lg" />
                </FormCard>
                <FormCard title={t('access.userForm.password')}>
                  <p className="text-sm text-muted-foreground">{t('access.userForm.passwordHint')}</p>
                  <Skeleton className="h-11 rounded-lg" />
                </FormCard>
              </>
            )
          }
        />
        <SaveBar kind="user" adding={adding} />
      </Form>
    </>
  );
}

function RoleSkeleton({ adding }: { adding: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      <Header
        crumb="roles"
        title={adding ? t('access.roleForm.addTitle') : undefined}
        status={!adding}
        action={!adding}
        description={t(adding ? 'access.roleForm.addDescription' : 'access.roleForm.description')}
      />
      <Form aria-hidden="true" inert className="skeleton-mask">
        <FormColumns
          main={
            <>
              <FormCard title={t('access.roleForm.name')}>
                <div className="grid gap-5 @min-[560px]:grid-cols-2">
                  <FieldSkeleton label={t('access.roleForm.nameEn')} required />
                  <FieldSkeleton label={t('access.roleForm.nameAr')} required />
                </div>
              </FormCard>
              <section data-skeleton-block="permissions" data-skeleton-measure="width" className="overflow-hidden rounded-3xl bg-card shadow-card">
                <div className="flex flex-col gap-1 px-5 pt-5 pb-3 md:px-6">
                  <h2 className="font-display text-lg font-extrabold">{t('access.roleForm.permissions')}</h2>
                  <p className="text-sm text-muted-foreground">{t('access.roleForm.permissionsHint')}</p>
                </div>
                <Masked>
                  <PermissionGroups value={{}} saved={{}} onToggle={noop} onScope={noop} onModule={noop} />
                </Masked>
              </section>
            </>
          }
          side={
            <>
              {adding ? null : (
                <FormCard title={t('access.roleForm.holders')} measure="width" aside={<SkeletonText className="text-sm" width="w-16" />}>
                  <div className="flex flex-col gap-3">
                    <SkeletonIdentity />
                    <SkeletonIdentity />
                  </div>
                </FormCard>
              )}
              <RoleScopesCard />
            </>
          }
        />
        <SaveBar kind="role" adding={adding} />
      </Form>
    </>
  );
}

function AccountSkeleton() {
  const { t } = useTranslation();
  return (
    <>
      <Header title={t('access.account.title')} description={t('access.account.description')} />
      <AccountTabs />
      <FormColumns
        main={
          <>
            <section data-skeleton-block="account-profile" className="@container flex flex-col gap-5 rounded-3xl bg-card p-5 shadow-card md:p-6">
              <div className="flex min-w-0 items-center gap-4">
                <Skeleton className="size-12 shrink-0 rounded-2xl" />
                <div className="flex min-w-0 flex-col">
                  <SkeletonText className="font-display text-xl" width="w-40" />
                  <SkeletonText className="text-sm" width="w-52" />
                </div>
              </div>
              <div className="grid gap-5 @min-[560px]:grid-cols-2">
                <FieldSkeleton label={t('access.account.name')} />
                <FieldSkeleton label={t('access.account.email')} />
              </div>
              <p className="text-sm text-muted-foreground">{t('access.account.askAdmin')}</p>
              <div className="grid gap-4 border-t border-border pt-4 @min-[560px]:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">{t('access.account.yourRoles')}</span>
                  <SkeletonPill className="w-28" />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">{t('access.account.linkedEmployee')}</span>
                  <SkeletonText className="text-sm" width="w-40" />
                </div>
              </div>
            </section>
            <SkeletonMask>
              <ChangePasswordCard />
            </SkeletonMask>
          </>
        }
        side={
          <FormCard title={t('access.account.signIn')}>
            <dl className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">{t('access.account.lastSignIn')}</dt>
                <dd>
                  <SkeletonText className="font-bold" width="w-32" />
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">{t('access.account.passwordChanged')}</dt>
                <dd>
                  <SkeletonText className="font-bold" width="w-32" />
                </dd>
              </div>
            </dl>
            <Skeleton className="h-11 rounded-lg" />
          </FormCard>
        }
      />
    </>
  );
}
