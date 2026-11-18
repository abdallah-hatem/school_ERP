'use client';

import { SYSTEM_ADMIN_ROLE, type Role } from '@school-erp/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Can, useCan } from '@/core/auth';
import { callApi } from '@/lib/callApi';
import { DataTable, type DataTableColumn } from '@/shared/components/data-table/data-table';
import { RowActions, rowActionsColumn } from '@/shared/components/data-table/row-actions';
import { EmptyState } from '@/shared/components/layout/empty-state';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Button } from '@/shared/components/ui/button';
import { AddIcon, CopyIcon, EditIcon, OpenIcon, ReadyIcon, RemoveIcon } from '@/shared/components/ui/icons';
import { SkeletonIdentity, SkeletonPill, SkeletonText } from '@/shared/components/ui/skeleton';
import { formatCount } from '@/shared/lib/format';
import { localName, otherName } from '@/shared/lib/i18n';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { DELETE_ROLE } from '../apis';
import { AvatarStack, RoleKindBadge, RoleTile } from './role-bits';
import { RoleDeleteDialog } from './role-delete-dialog';

export interface RolesListProps {
  /** `/en/roles`. */
  basePath: string;
  /** `undefined` while the roles load: the table draws skeleton rows. */
  roles: Role[] | undefined;
  /** The names of (some of) each role's holders, for the avatar stack. */
  holderNames: Record<string, string[]>;
  error?: boolean;
}

/**
 * Administration → Roles (P3, option A): every role with its kind, how many permissions it grants
 * and who holds it. Any role but the System admin can be deleted once nobody holds it (owner
 * 2026-11-19); a held one's Delete says who still holds it.
 */
export function RolesList({ basePath, roles, holderNames, error = false }: RolesListProps) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const canManage = useCan()('core.roles.manage');
  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState<Role | null>(null);

  const addButton = (
    <Can permission="core.roles.manage">
      <Button asChild variant="primary">
        <Link href={`${basePath}/new`}>
          <AddIcon />
          {t('access.roles.add')}
        </Link>
      </Button>
    </Can>
  );

  const columns: DataTableColumn<Role>[] = [
    {
      id: 'role',
      header: t('access.roles.columns.role'),
      card: 'title',
      className: 'min-w-60',
      skeleton: <SkeletonIdentity />,
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-3">
          <RoleTile role={r} />
          <span className="flex min-w-0 flex-col">
            <Link
              href={`${basePath}/${r.id}`}
              className="tap-target cursor-pointer rounded-sm font-bold break-words whitespace-normal decoration-2 underline-offset-3 hover:text-primary hover:underline"
            >
              {localName(r, locale)}
            </Link>
            <span lang={locale === 'ar' ? 'en' : 'ar'} className="truncate text-xs text-muted-foreground">
              {otherName(r, locale)}
            </span>
          </span>
        </span>
      ),
    },
    {
      id: 'type',
      header: t('access.roles.columns.type'),
      card: 'status',
      className: 'w-32',
      skeleton: <SkeletonPill />,
      cell: (r) => <RoleKindBadge builtIn={r.builtIn} />,
    },
    {
      id: 'permissions',
      header: t('access.roles.columns.permissions'),
      className: 'w-44',
      skeleton: <SkeletonText className="text-sm" width="w-24" />,
      cell: (r) => (
        <span className="tabular font-bold">
          {r.key === SYSTEM_ADMIN_ROLE
            ? t('access.roles.everyPermission')
            : t('access.roles.permissionCount', { count: formatCount(r.permissions.length) })}
        </span>
      ),
    },
    {
      id: 'heldBy',
      header: t('access.roles.columns.heldBy'),
      className: 'w-48',
      cell: (r) => (
        <span className="flex items-center gap-2">
          <AvatarStack names={holderNames[r.id] ?? []} />
          <span className="text-muted-foreground">{r.userCount === 0
              ? t('access.roles.userCount.zero')
              : t('access.roles.userCount', { count: formatCount(r.userCount) })}</span>
        </span>
      ),
    },
    rowActionsColumn<Role>(t('access.roles.columns.actions'), (r) => (
      <RowActions
        label={t('ui.table.actionsFor', { name: localName(r, locale) })}
        actions={[
          {
            id: 'edit',
            label: canManage && r.key !== SYSTEM_ADMIN_ROLE ? t('access.roles.actions.edit') : t('access.roles.actions.view'),
            icon: canManage && r.key !== SYSTEM_ADMIN_ROLE ? EditIcon : OpenIcon,
            href: `${basePath}/${r.id}`,
          },
          {
            id: 'duplicate',
            label: t('access.roles.actions.duplicate'),
            icon: CopyIcon,
            hidden: !canManage || r.key === SYSTEM_ADMIN_ROLE,
            href: `${basePath}/new?from=${r.id}`,
          },
          {
            id: 'delete',
            label: t('access.roles.actions.delete'),
            icon: RemoveIcon,
            destructive: true,
            // Never the System admin; a held role opens the refusal instead of the confirm.
            hidden: !canManage || r.key === SYSTEM_ADMIN_ROLE,
            onSelect: () => setDeleting(r),
          },
        ]}
      />
    )),
  ];

  async function confirmDelete() {
    if (!deleting) return false;
    const name = localName(deleting, locale);
    const res = await callApi(DELETE_ROLE(deleting.id), {
      showSuccessToast: true,
      successMessage: t('access.roles.delete.done', { name }),
    });
    if (!res.success) return false;
    startTransition(() => router.refresh());
    return true;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('access.roles.title')}
        description={t('access.roles.description')}
        breadcrumbs={[{ label: t('access.administration') }, { label: t('access.roles.title') }]}
        breadcrumbsLabel={t('ui.shell.breadcrumbs')}
        actions={addButton}
      />
      <DataTable
        label={t('access.roles.label')}
        columns={columns}
        rows={roles}
        getRowId={(r) => r.id}
        loading={roles === undefined}
        refreshing={pending}
        error={error}
        onRetry={() => startTransition(() => router.refresh())}
        retrying={pending}
        empty={<EmptyState title={t('access.roles.emptyTitle')} description={t('access.roles.emptyBody')} action={addButton} />}
        cardsBelow={740}
      />
      {error ? null : (
        <p data-skeleton-block="note" className="flex items-start gap-2.5 rounded-2xl bg-info-soft px-4 py-3 text-sm text-info-ink">
          <ReadyIcon className="mt-0.5 size-4.5 shrink-0" />
          {t('access.roles.note')}
        </p>
      )}
      <RoleDeleteDialog
        role={deleting}
        holderName={deleting ? holderNames[deleting.id]?.[0] : undefined}
        onOpenChange={(o) => (o ? null : setDeleting(null))}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
