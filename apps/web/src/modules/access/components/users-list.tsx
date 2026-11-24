'use client';

import { PAGINATION, type IsoDateTime, type Role, type UserAccount } from '@school-erp/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Can, useCan } from '@/core/auth';
import { EmployeeLink } from '@/core/employees';
import { DataTable, type DataTableColumn } from '@/shared/components/data-table/data-table';
import { RowActions, rowActionsColumn } from '@/shared/components/data-table/row-actions';
import { ClearFilters, FilterSelect, SearchInput } from '@/shared/components/form/filter-controls';
import { EmptyState } from '@/shared/components/layout/empty-state';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Button } from '@/shared/components/ui/button';
import {
  AddIcon,
  DeactivateIcon,
  EditIcon,
  LinkedEmployeeIcon,
  OpenIcon,
  ReactivateIcon,
  SearchIcon,
  TemporaryPasswordIcon,
  LockedIcon,
  UnlockIcon,
} from '@/shared/components/ui/icons';
import { PersonAvatar } from '@/shared/components/ui/person-avatar';
import { SkeletonIdentity, SkeletonPill, SkeletonText } from '@/shared/components/ui/skeleton';
import { StatusPill } from '@/shared/components/ui/status-pill';
import { formatCount } from '@/shared/lib/format';
import { localName } from '@/shared/lib/i18n';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { formatLockEnd, formatSignIn } from '../lib/sign-in-time';
import { activeFilterCount, usersQueryString, type UsersFilterKey, type UsersListQuery } from '../lib/users-query';
import { RoleChips } from './role-bits';
import { useUserActions } from './user-actions';
import { PICKER_PAGE, useServerOptions } from '@/shared/hooks/use-server-options';
import { GET_ROLES } from '../apis';

const SEARCH_DEBOUNCE_MS = 300;

export interface UsersListProps {
  /** `/en/users` — the list's own path, for links and URL updates. */
  basePath: string;
  query: UsersListQuery;
  /** `undefined` while the first page loads: the list draws itself with skeleton rows. */
  rows: UserAccount[] | undefined;
  total: number;
  /** Every role, for the role filter. */
  /** The role the filter names; the API searches the others. */
  selectedRole?: Role | null;
  /**
   * The only active System admin, when there is exactly one: their ⋯ has no Deactivate (R8, edge
   * case 5 — the API refuses it anyway).
   */
  lastAdminId: string | null;
  /** The server's clock, so "Today" is the same on both sides. */
  now: IsoDateTime;
  error?: boolean;
}

/** Administration → Users (spec P3, option A): search, role and status filters, 10 per page. */
export function UsersList({ basePath, query, rows, total, selectedRole = null, lastAdminId, now, error = false }: UsersListProps) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const can = useCan();
  const canManage = can('core.users.manage');
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(query.search ?? '');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actions = useUserActions();

  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
  }, []);

  // Every list control updates the URL in place: no scroll to top; the rows dim while it loads.
  function go(next: UsersListQuery) {
    startTransition(() => router.push(`${basePath}${usersQueryString(next)}`, { scroll: false }));
  }
  function setFilter(key: UsersFilterKey, value: string | undefined) {
    go({ ...query, [key]: value || undefined, page: PAGINATION.defaultPage });
  }
  function onSearchChange(text: string) {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setFilter('search', text.trim()), SEARCH_DEBOUNCE_MS);
  }
  function clearFilters() {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearch('');
    go({ page: PAGINATION.defaultPage, limit: query.limit });
  }

  const addButton = (
    <Can permission="core.users.manage">
      <Button asChild variant="primary">
        <Link href={`${basePath}/new`}>
          <AddIcon />
          {t('access.users.add')}
        </Link>
      </Button>
    </Can>
  );

  const columns: DataTableColumn<UserAccount>[] = [
    {
      id: 'name',
      header: t('access.users.columns.name'),
      card: 'title',
      // Capped like the email: a long name truncates instead of pushing the table past its card at
      // 1440 (the smoke users' long emails and the seeded heads' three-part names did).
      className: 'min-w-48 max-w-52',
      skeleton: <SkeletonIdentity />,
      cell: (u) => (
        <span className="flex min-w-0 items-center gap-3">
          <PersonAvatar photoUrl={u.employee?.photoUrl} gender={u.employee?.gender} muted={!u.isActive} />
          <span className="flex min-w-0 flex-col">
            <Link
              href={`${basePath}/${u.id}`}
              className="tap-target cursor-pointer truncate rounded-sm font-bold decoration-2 underline-offset-3 hover:text-primary hover:underline"
            >
              {u.name}
            </Link>
            {/* On a card the email sits under the name. */}
            <bdi dir="ltr" className="truncate text-xs text-muted-foreground @min-[1100px]:hidden">
              {u.email}
            </bdi>
          </span>
        </span>
      ),
    },
    {
      id: 'email',
      header: t('access.users.columns.email'),
      card: 'hidden',
      className: 'max-w-48',
      cell: (u) => (
        <bdi dir="ltr" title={u.email} className="block truncate text-muted-foreground">
          {u.email}
        </bdi>
      ),
    },
    {
      id: 'roles',
      header: t('access.users.columns.roles'),
      card: 'wide',
      className: 'min-w-40 whitespace-normal',
      skeleton: <SkeletonPill className="w-24" />,
      cell: (u) =>
        u.roles.length ? <RoleChips roles={u.roles} /> : <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'employee',
      header: t('access.users.columns.employee'),
      // Across the card: "No employee record" in half a card wraps to two lines on a phone.
      card: 'wide',
      className: 'w-40',
      cell: (u) =>
        u.employee ? (
          <span className="inline-flex items-center gap-1.5 font-bold text-primary">
            <LinkedEmployeeIcon className="size-4 shrink-0 text-muted-foreground" />
            <EmployeeLink employeeId={u.employee.id} name={<bdi dir="ltr" className="tabular">{u.employee.code}</bdi>} />
            <span className="sr-only">{localName(u.employee, locale)}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">{t('access.users.notLinked')}</span>
        ),
    },
    {
      id: 'status',
      header: t('access.users.columns.status'),
      // On a card the pills get their own line, so the name and email keep the card's width.
      card: 'badges',
      // Narrow enough that the seven columns fit the card at desktop width (smoke 27 measures it);
      // a second pill wraps to its own line.
      className: 'w-44',
      skeleton: <SkeletonPill />,
      // The account's whole state in one place: active/inactive, and a temporary password still to
      // be replaced (one line each, never wrapped).
      cell: (u) => (
        <span className="flex flex-wrap items-center gap-1.5">
          {u.isActive ? (
            <StatusPill tone="success">{t('access.users.statuses.active')}</StatusPill>
          ) : (
            <StatusPill tone="neutral" hollow>{t('access.users.statuses.inactive')}</StatusPill>
          )}
          {u.mustChangePassword && u.isActive ? (
            <StatusPill tone="warning" icon={TemporaryPasswordIcon} title={t('access.users.mustChange')}>
              {t('access.users.temporaryPassword')}
            </StatusPill>
          ) : null}
          {u.lockedUntil ? (
            <StatusPill
              tone="danger"
              icon={LockedIcon}
              title={t('access.users.lockedTitle', { time: formatLockEnd(u.lockedUntil, locale) })}
            >
              {t('access.users.locked')}
            </StatusPill>
          ) : null}
        </span>
      ),
    },
    {
      id: 'lastSignIn',
      header: t('access.users.columns.lastSignIn'),
      className: 'w-40',
      skeleton: <SkeletonText className="text-sm" width="w-24" />,
      cell: (u) => (
        <span className="tabular">{formatSignIn(u.lastSignInAt, now, locale, t)}</span>
      ),
    },
    rowActionsColumn<UserAccount>(t('access.users.columns.actions'), (u) => (
      <RowActions
        label={t('ui.table.actionsFor', { name: u.name })}
        actions={[
          {
            id: 'edit',
            label: canManage ? t('access.users.actions.edit') : t('access.users.actions.view'),
            icon: canManage ? EditIcon : OpenIcon,
            href: `${basePath}/${u.id}`,
          },
          {
            id: 'password',
            label: t('access.users.actions.setPassword'),
            icon: TemporaryPasswordIcon,
            hidden: !canManage || !u.isActive,
            onSelect: () => actions.setPassword(u),
          },
          {
            id: 'unlock',
            label: t('access.users.actions.unlock'),
            icon: UnlockIcon,
            positive: true,
            hidden: !canManage || !u.lockedUntil,
            onSelect: () => actions.unlock(u),
          },
          {
            id: 'deactivate',
            label: t('access.users.actions.deactivate'),
            icon: DeactivateIcon,
            destructive: true,
            hidden: !canManage || !u.isActive || u.id === lastAdminId,
            onSelect: () => actions.deactivate(u),
          },
          {
            id: 'reactivate',
            label: t('access.users.actions.reactivate'),
            icon: ReactivateIcon,
            positive: true,
            hidden: !canManage || u.isActive,
            onSelect: () => actions.reactivate(u),
          },
        ]}
      />
    )),
  ];

  const loading = rows === undefined;
  const filterCount = activeFilterCount(query);
  const filtered = filterCount > 0;
  const emptyState = filtered ? (
    <EmptyState
      icon={SearchIcon}
      title={t('access.users.noResultsTitle')}
      description={t('access.users.noResultsBody')}
      action={<ClearFilters placement="empty" count={filterCount} onClear={clearFilters} />}
    />
  ) : (
    <EmptyState title={t('access.users.emptyTitle')} description={t('access.users.emptyBody')} action={addButton} />
  );

  const roleOptions = useServerOptions<Role>({
    load: (search) => GET_ROLES({ search, limit: PICKER_PAGE }),
    toOption: (r) => ({ value: r.id, label: localName(r, locale) }),
    selected: selectedRole ? { value: selectedRole.id, label: localName(selectedRole, locale) } : null,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('access.users.title')}
        description={t('access.users.description')}
        breadcrumbs={[{ label: t('access.administration') }, { label: t('access.users.title') }]}
        breadcrumbsLabel={t('ui.shell.breadcrumbs')}
        actions={addButton}
      />
      <section aria-label={t('access.users.label')} className="@container flex min-w-0 flex-col gap-4.5">
        <div data-skeleton-block="filters" className="flex flex-col gap-3 rounded-[1.25rem] bg-card p-3.5 shadow-card">
          <div role="search" className="flex w-full flex-col gap-2.5 @min-[900px]:flex-row @min-[900px]:items-center">
            <SearchInput
              aria-label={t('access.users.searchLabel')}
              placeholder={t('access.users.searchPlaceholder')}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              disabled={loading}
              loading={pending}
              wrapperClassName="basis-auto"
            />
            <FilterSelect
              label={t('access.users.role')}
              allLabel={t('access.users.allRoles')}
              value={query.roleId}
              server={roleOptions}
              onChange={(v) => setFilter('roleId', v)}
              disabled={loading}
              className="w-full sm:w-full @min-[900px]:w-60"
            />
            <FilterSelect
              label={t('access.users.status')}
              allLabel={t('access.users.allStatuses')}
              value={query.status}
              options={[
                { value: 'active', label: t('access.users.statuses.active') },
                { value: 'inactive', label: t('access.users.statuses.inactive') },
              ]}
              onChange={(v) => setFilter('status', v)}
              disabled={loading}
              className="w-full sm:w-full @min-[900px]:w-52"
            />
          </div>
          {error ? null : (
            <div className="flex items-center justify-between gap-3 px-1">
              {loading ? (
                <SkeletonText className="text-[0.8rem]" width="w-16" />
              ) : (
                <p aria-live="polite" data-testid="users-count" className="text-[0.8rem] text-muted-foreground">
                  {t('access.users.count', { count: formatCount(total) })}
                </p>
              )}
              <ClearFilters count={filterCount} onClear={clearFilters} disabled={loading || pending} className="ms-auto" />
            </div>
          )}
        </div>
        <DataTable
          label={t('access.users.label')}
          columns={columns}
          rows={rows}
          getRowId={(u) => u.id}
          loading={loading}
          refreshing={pending}
          error={error}
          onRetry={() => startTransition(() => router.refresh())}
          retrying={pending}
          empty={emptyState}
          cardsBelow={1100}
          pagination={{
            page: query.page,
            limit: query.limit,
            total,
            onPageChange: (page) => go({ ...query, page }),
          }}
        />
      </section>
      {actions.dialogs}
    </div>
  );
}
