'use client';

import {
  PERMISSION_SCOPES,
  SYSTEM_ADMIN_ROLE,
  type PermissionKey,
  type PermissionModule,
  type PermissionScope,
  type Role,
  type UserAccount,
} from '@school-erp/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useCan, useSession } from '@/core/auth';
import { callApi } from '@/lib/callApi';
import { FieldShell } from '@/shared/components/form/field-shell';
import { Form } from '@/shared/components/form/form';
import { FormActionBar } from '@/shared/components/form/form-action-bar';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Button } from '@/shared/components/ui/button';
import { PersonAvatar } from '@/shared/components/ui/person-avatar';
import { AnyoneIcon, ChevronEndIcon, ErrorIcon, LockedIcon, PersonIcon, RemoveIcon, StageIcon, StaffIcon, type AppIcon } from '@/shared/components/ui/icons';
import { Input } from '@/shared/components/ui/input';
import { StatusPill } from '@/shared/components/ui/status-pill';
import { formatCount } from '@/shared/lib/format';
import { localName } from '@/shared/lib/i18n';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { CREATE_ROLE, DELETE_ROLE, UPDATE_ROLE } from '../apis';
import { changedCount, giveCeiling, setModule, setScope, toGrantMap, toGrants, toggle, type GrantMap } from '../lib/role-grants';
import { FormCard, FormColumns } from './form-card';
import { PermissionGroups } from './permission-groups';
import { RoleKindBadge } from './role-bits';
import { RoleDeleteDialog } from './role-delete-dialog';

export interface RoleFormProps {
  /** `/en/roles`. */
  basePath: string;
  /** `/en/users` — "See them in Users". */
  usersPath: string;
  /** The role being edited; omit to add a custom role. */
  role?: Role;
  /** Adding: start from this role's permissions (Duplicate). */
  copyFrom?: Role;
  /** Who holds the role (first page) and how many in all. */
  holders?: UserAccount[];
  holdersTotal?: number;
}

const SCOPE_ICON: Record<PermissionScope, AppIcon> = {
  all: AnyoneIcon,
  own_stage: StageIcon,
  own_team: StaffIcon,
  self: PersonIcon,
};

/** What each scope means (the side card of a role's page; static, so its skeleton draws it too). */
export function RoleScopesCard() {
  const { t } = useTranslation();
  return (
    <FormCard title={t('access.roleForm.scopesTitle')}>
      <ul className="flex flex-col gap-3.5">
        {PERMISSION_SCOPES.map((s) => {
          const Icon = SCOPE_ICON[s];
          return (
            <li key={s} className="flex items-start gap-2.5">
              <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                <Icon className="size-4" />
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-bold">{t(`permissions.scopes.${s}`)}</span>
                <span className="text-xs text-muted-foreground">{t(`access.roleForm.scopes.${s}`)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </FormCard>
  );
}

/**
 * A role's page (P3, option A): its names in both languages, its permissions grouped by module (a
 * switch and, for row-level ones, a scope each), who holds it and what the scopes mean. Save stays
 * disabled until something changes. The System admin is read-only: it holds every permission.
 */
export function RoleForm({ basePath, usersPath, role, copyFrom, holders = [], holdersTotal = 0 }: RoleFormProps) {
  const { t, has, locale } = useTranslation();
  const router = useRouter();
  const session = useSession();
  const ceiling = giveCeiling(session);
  // H2 (view only, the API decides): a non-System-admin can't change a role they hold.
  const heldByMe = Boolean(role && !ceiling.isSystemAdmin && session?.roles.some((r) => r.id === role.id));
  const canManage = useCan()('core.roles.manage') && !heldByMe;
  const systemAdmin = role?.key === SYSTEM_ADMIN_ROLE;
  const readOnly = !canManage || systemAdmin;

  const savedGrants = useMemo(() => toGrantMap(role?.permissions ?? []), [role]);
  const [grants, setGrants] = useState<GrantMap>(() => toGrantMap((role ?? copyFrom)?.permissions ?? []));
  const savedNames = { nameEn: role?.nameEn ?? '', nameAr: role?.nameAr ?? '' };
  const [names, setNames] = useState(() =>
    role
      ? savedNames
      : copyFrom
        ? {
            nameEn: t('access.roleForm.copyOf', { name: copyFrom.nameEn }),
            nameAr: t('access.roleForm.copyOf', { name: copyFrom.nameAr }),
          }
        : savedNames,
  );
  const [errors, setErrors] = useState<{ nameEn?: string; nameAr?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const inFlight = useRef(false);
  const nameEnId = useId();
  const nameArId = useId();

  const changes =
    changedCount(savedGrants, grants) +
    (names.nameEn.trim() !== savedNames.nameEn ? 1 : 0) +
    (names.nameAr.trim() !== savedNames.nameAr ? 1 : 0);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current || readOnly) return;
    const nextErrors = {
      nameEn: names.nameEn.trim() ? undefined : 'access.roleForm.errors.nameEn',
      nameAr: names.nameAr.trim() ? undefined : 'access.roleForm.errors.nameAr',
    };
    setErrors(nextErrors);
    if (nextErrors.nameEn || nextErrors.nameAr) {
      document.getElementById(nextErrors.nameEn ? nameEnId : nameArId)?.focus();
      return;
    }
    if (role && changes === 0) return;
    inFlight.current = true;
    setBusy(true);
    setFormError(null);
    let saved = false;
    try {
      const body = { nameEn: names.nameEn.trim(), nameAr: names.nameAr.trim(), permissions: toGrants(grants) };
      const res = role
        ? await callApi(UPDATE_ROLE(role.id, body), {
            showErrorToast: false,
            showSuccessToast: true,
            successMessage: t('access.roleForm.saved'),
          })
        : await callApi(CREATE_ROLE(body), {
            showErrorToast: false,
            showSuccessToast: true,
            successMessage: t('access.roleForm.created', { name: locale === 'ar' ? body.nameAr : body.nameEn }),
          });
      if (res.unauthorized) return;
      if (res.success) {
        saved = true;
        router.push(basePath);
        router.refresh();
        return;
      }
      const key = `errors.${String(res.error)}`;
      setFormError(has(key) ? t(key) : res.message || t('access.roleForm.saveFailed'));
    } finally {
      if (!saved) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }

  async function confirmDelete() {
    if (!role) return false;
    const res = await callApi(DELETE_ROLE(role.id), {
      showSuccessToast: true,
      successMessage: t('access.roles.delete.done', { name: localName(role, locale) }),
    });
    if (!res.success) return false;
    router.push(basePath);
    router.refresh();
    return true;
  }

  const title = role ? localName(role, locale) : t('access.roleForm.addTitle');
  const nameField = (key: 'nameEn' | 'nameAr', id: string) => (
    <FieldShell
      id={id}
      label={t(`access.roleForm.${key}`)}
      required
      error={errors[key]}
    >
      {(a11y) => (
        <Input
          {...a11y}
          dir={key === 'nameAr' ? 'rtl' : 'ltr'}
          lang={key === 'nameAr' ? 'ar' : 'en'}
          required
          maxLength={100}
          disabled={readOnly}
          placeholder={t(`access.roleForm.${key}Placeholder`)}
          value={names[key]}
          onChange={(e) => setNames((n) => ({ ...n, [key]: e.target.value }))}
        />
      )}
    </FieldShell>
  );

  const holdersCard = role ? (
    <FormCard
      title={t('access.roleForm.holders')}
      measure="width"
      aside={
        <span className="tabular text-sm font-semibold text-muted-foreground">
          {holdersTotal === 0
            ? t('access.roles.userCount.zero')
            : t('access.roles.userCount', { count: formatCount(holdersTotal) })}
        </span>
      }
    >
      {holders.length ? (
        <ul className="flex flex-col gap-3">
          {holders.map((u) => (
            <li key={u.id} className="flex min-w-0 items-center gap-3">
              <PersonAvatar photoUrl={u.employee?.photoUrl} gender={u.employee?.gender} muted={!u.isActive} />
              <span className="flex min-w-0 flex-1 flex-col">
                <Link href={`${usersPath}/${u.id}`} className="truncate text-sm font-bold hover:text-primary hover:underline">
                  {u.name}
                </Link>
                <bdi dir="ltr" className="truncate text-xs text-muted-foreground">
                  {u.email}
                </bdi>
              </span>
              {u.isActive ? null : <StatusPill tone="neutral">{t('access.roleForm.inactive')}</StatusPill>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t('access.roleForm.noHolders')}</p>
      )}
      {holdersTotal > 0 ? (
        <Link
          href={`${usersPath}?roleId=${role.id}`}
          className="inline-flex items-center gap-1 self-start text-sm font-bold text-primary hover:underline"
        >
          {t('access.roleForm.seeInUsers')}
          <ChevronEndIcon className="flip-rtl size-3.5" />
        </Link>
      ) : null}
    </FormCard>
  ) : null;

  const scopesCard = systemAdmin ? null : <RoleScopesCard />;

  const main = (
    <>
      {systemAdmin ? (
        <div className="flex items-start gap-3 rounded-3xl border border-dashed border-border bg-card p-5 shadow-card">
          <LockedIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="flex flex-col gap-1">
            <p className="font-bold">{t('access.roleForm.systemAdminTitle')}</p>
            <p className="text-sm text-muted-foreground">{t('access.roleForm.systemAdminBody')}</p>
          </div>
        </div>
      ) : (
        <FormCard title={t('access.roleForm.name')}>
          <div className="grid gap-5 @min-[560px]:grid-cols-2">
            {nameField('nameEn', nameEnId)}
            {nameField('nameAr', nameArId)}
          </div>
        </FormCard>
      )}
      <section
        aria-labelledby="role-permissions"
        // Its height follows the grants (a granted key shows its scope picker).
        data-skeleton-block="permissions"
        data-skeleton-measure="width"
        className="overflow-hidden rounded-3xl bg-card shadow-card"
      >
        <div className="flex flex-col gap-1 px-5 pt-5 pb-3 md:px-6">
          <h2 id="role-permissions" className="font-display text-lg font-extrabold">
            {t('access.roleForm.permissions')}
          </h2>
          {readOnly ? null : <p className="text-sm text-muted-foreground">{t('access.roleForm.permissionsHint')}</p>}
          {!readOnly && !ceiling.isSystemAdmin ? (
            <p data-testid="role-ceiling-note" className="flex items-start gap-1.5 text-sm font-semibold text-muted-foreground">
              <LockedIcon className="mt-0.5 size-4 shrink-0" />
              {t('access.roleForm.ceilingNote')}
            </p>
          ) : null}
          {heldByMe ? (
            <p data-testid="role-held-note" className="flex items-start gap-1.5 text-sm font-semibold text-warning-ink">
              <LockedIcon className="mt-0.5 size-4 shrink-0" />
              {t('access.roleForm.heldByYou')}
            </p>
          ) : null}
        </div>
        <PermissionGroups
          value={grants}
          saved={role ? savedGrants : grants}
          readOnly={readOnly}
          canGive={ceiling.canGive}
          onToggle={(key: PermissionKey, on: boolean) => setGrants((g) => toggle(g, key, on))}
          onScope={(key: PermissionKey, scope: PermissionScope) => setGrants((g) => setScope(g, key, scope))}
          onModule={(module: PermissionModule, on: boolean) =>
            setGrants((g) => setModule(g, module, on, ceiling.canGive))
          }
        />
      </section>
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        status={role ? <RoleKindBadge builtIn={role.builtIn} /> : undefined}
        description={role ? t('access.roleForm.description') : t('access.roleForm.addDescription')}
        breadcrumbs={[
          { label: t('access.administration') },
          { label: t('access.roles.title'), href: basePath },
          { label: title },
        ]}
        breadcrumbsLabel={t('ui.shell.breadcrumbs')}
        actions={
          role && canManage && !systemAdmin ? (
            <Button variant="secondary" className="text-destructive-ink" onClick={() => setDeleteOpen(true)}>
              <RemoveIcon />
              {t('access.roleForm.deleteRole')}
            </Button>
          ) : undefined
        }
      />
      <Form onSubmit={(e) => void onSubmit(e)} aria-label={title}>
        <FormColumns
          main={main}
          side={
            <>
              {holdersCard}
              {scopesCard}
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
          <FormActionBar
            status={
              <p role="status" className={changes ? 'font-semibold text-warning-ink' : 'text-muted-foreground'}>
                {role
                  ? changes === 0
                    ? t('access.userForm.noChanges')
                    : t('access.userForm.unsaved', { count: changes })
                  : t('access.roles.permissionCount', { count: formatCount(toGrants(grants).length) })}
              </p>
            }
          >
            <Button asChild variant="secondary" aria-disabled={busy || undefined}>
              <Link href={basePath}>{t('common.actions.cancel')}</Link>
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={Boolean(role) && changes === 0}>
              {role ? t('access.roleForm.save') : t('access.roleForm.create')}
            </Button>
          </FormActionBar>
        )}
      </Form>
      <RoleDeleteDialog
        role={deleteOpen && role ? role : null}
        holderName={holders[0]?.name}
        onOpenChange={setDeleteOpen}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
