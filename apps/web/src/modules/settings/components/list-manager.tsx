'use client';

import { PAGINATION, type PermissionKey } from '@school-erp/shared';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useCan } from '@/core/auth';
import { callApi } from '@/lib/callApi';
import { DataTable, type DataTableColumn } from '@/shared/components/data-table/data-table';
import { RowActions, rowActionsColumn } from '@/shared/components/data-table/row-actions';
import { EmptyState } from '@/shared/components/layout/empty-state';
import { Button } from '@/shared/components/ui/button';
import { AddIcon, EditIcon, HideIcon, ManagesPeopleIcon, ShowIcon } from '@/shared/components/ui/icons';
import { SkeletonPill, SkeletonText } from '@/shared/components/ui/skeleton';
import { StatusPill } from '@/shared/components/ui/status-pill';
import { localName, otherName } from '@/shared/lib/i18n';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { CREATE_LIST_ITEM, GET_LIST_ITEMS, UPDATE_LIST_ITEM, type ListKind, type ManagedListItem } from '../apis';
import { useResource } from '../hooks/use-resource';
import { NamesDialog } from './names-dialog';
import { SectionPanel } from './section-panel';

/** Who may add, rename and hide each list's items (view only — the API decides). */
const MANAGE_PERMISSION: Record<ListKind, PermissionKey> = {
  stages: 'core.stages.manage',
  departments: 'hr.lists.manage',
  jobTitles: 'hr.lists.manage',
  employeeGrades: 'hr.lists.manage',
};

/**
 * One managed list — stages, departments, job titles or grades (§3, §7): add, rename, hide / show. No
 * delete: an item in use is hidden from new choices. The API pages the list (`?<kind>Page=` in the
 * URL, beside `?section=`); the browser only shows that page. Job titles also have the "Manages
 * people" switch (in the add / edit dialog) and a badge on the titles that have it.
 */
export function ListManager({ kind }: { kind: ListKind }) {
  const { t, locale } = useTranslation();
  const canManage = useCan()(MANAGE_PERMISSION[kind]);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const pageKey = `${kind}Page`;
  const urlPage = Number(params?.get(pageKey));
  const page = Number.isInteger(urlPage) && urlPage >= 1 ? urlPage : PAGINATION.defaultPage;
  const limit = PAGINATION.defaultLimit;
  // A new key (another page, or a reload after adding) asks the API again.
  const [version, setVersion] = useState(0);
  const list = useResource(`${kind}:${page}:${version}`, () => GET_LIST_ITEMS(kind, { page, limit }));
  function setPage(next: number) {
    const query = new URLSearchParams(params?.toString() ?? '');
    if (next > PAGINATION.defaultPage) query.set(pageKey, String(next));
    else query.delete(pageKey);
    const s = query.toString();
    router.replace(`${pathname ?? ''}${s ? `?${s}` : ''}`, { scroll: false });
  }
  const [editing, setEditing] = useState<ManagedListItem | 'new' | null>(null);
  const withManaging = kind === 'jobTitles';
  const [toggling, setToggling] = useState<string | null>(null);

  // The page the API sent, in its order.
  const rows = list.data;
  const total = list.meta?.total ?? 0;
  const copy = (key: string, values?: Record<string, string | number>) => t(`settings.lists.${kind}.${key}`, values);

  function replace(item: ManagedListItem) {
    list.setData((items) => items.map((i) => (i.id === item.id ? item : i)));
  }

  async function toggle(item: ManagedListItem) {
    if (toggling) return;
    setToggling(item.id);
    try {
      const res = await callApi(UPDATE_LIST_ITEM(kind, item.id, { isActive: !item.isActive }));
      if (res.success && res.data) replace(res.data);
    } finally {
      setToggling(null);
    }
  }

  async function save(form: { nameEn: string; nameAr: string; managesPeople?: boolean }): Promise<boolean> {
    // Only job titles have the switch; the other lists refuse the field.
    const values = withManaging
      ? { nameEn: form.nameEn, nameAr: form.nameAr, managesPeople: Boolean(form.managesPeople) }
      : { nameEn: form.nameEn, nameAr: form.nameAr };
    if (editing === 'new') {
      // After the last item: the list's last one is asked of the API (one item, the last page).
      const last = total > 0 ? await callApi(GET_LIST_ITEMS(kind, { page: total, limit: 1 }), { showErrorToast: false }) : null;
      const lastOrder = last?.success ? (last.data?.[0]?.sortOrder ?? total) : total;
      const res = await callApi(CREATE_LIST_ITEM(kind, { ...values, sortOrder: lastOrder + 1 }));
      if (res.success && res.data) {
        // Re-read the page from the API (the new item lands on the last page).
        setVersion((v) => v + 1);
        return true;
      }
      return false;
    }
    if (!editing) return false;
    const res = await callApi(UPDATE_LIST_ITEM(kind, editing.id, values));
    if (res.success && res.data) replace(res.data);
    return Boolean(res.success);
  }

  const columns: DataTableColumn<ManagedListItem>[] = [
    {
      id: 'name',
      header: t('settings.names.name'),
      card: 'title',
      skeleton: (
        <span className="flex min-w-0 flex-col">
          <SkeletonText className="font-semibold" width="w-32" />
          <SkeletonText className="text-xs" width="w-20" />
        </span>
      ),
      cell: (item) => (
        <div className="flex min-w-0 flex-col items-start gap-0.5">
          <span className="font-semibold break-words">{localName(item, locale)}</span>
          <span className="text-xs break-words text-muted-foreground">{otherName(item, locale)}</span>
          {withManaging && item.managesPeople ? (
            <StatusPill tone="primary" icon={ManagesPeopleIcon} className="mt-1">
              {copy('managesPeople')}
            </StatusPill>
          ) : null}
        </div>
      ),
    },
    {
      id: 'status',
      header: t('settings.lists.status'),
      card: 'status',
      className: 'w-32',
      skeleton: <SkeletonPill />,
      cell: (item) =>
        item.isActive ? (
          <StatusPill tone="success">{t('settings.lists.shown')}</StatusPill>
        ) : (
          <StatusPill tone="neutral">{t('settings.lists.hidden')}</StatusPill>
        ),
    },
    // View only (no manage key): no actions column at all, rather than an empty one.
    ...(canManage ? [rowActionsColumn(t('settings.lists.actions'), (item: ManagedListItem) => (
      <RowActions
        label={t('ui.table.actionsFor', { name: localName(item, locale) })}
        busy={toggling === item.id}
        disabled={toggling !== null && toggling !== item.id}
        actions={[
          { id: 'rename', label: withManaging ? copy('edit') : t('settings.lists.rename'), icon: EditIcon, hidden: !canManage, onSelect: () => setEditing(item) },
          item.isActive
            ? { id: 'hide', label: t('settings.lists.hide'), icon: HideIcon, destructive: true, hidden: !canManage, onSelect: () => void toggle(item) }
            : { id: 'show', label: t('settings.lists.show'), icon: ShowIcon, hidden: !canManage, onSelect: () => void toggle(item) },
        ]}
      />
    ))] : []),
  ];

  const addButton = canManage ? (
    <Button variant="primary" onClick={() => setEditing('new')} disabled={!list.data}>
      <AddIcon />
      {copy('add')}
    </Button>
  ) : null;

  return (
    <SectionPanel title={copy('title')} description={copy('description')} actions={addButton}>
      <DataTable
        label={copy('title')}
        columns={columns}
        rows={rows}
        getRowId={(item) => item.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.retry}
        retrying={list.retrying}
        empty={<EmptyState title={copy('emptyTitle')} description={copy('emptyBody')} action={addButton} />}
        // Always there (total 0 while loading), so the skeleton has the bar the list will have.
        refreshing={list.refreshing}
        pagination={{ page: list.meta?.page ?? page, limit, total, onPageChange: setPage }}
      />
      {editing ? (
        <NamesDialog
          key={editing === 'new' ? 'new' : editing.id}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          title={
            editing === 'new'
              ? copy('add')
              : withManaging
                ? copy('editItem', { name: localName(editing, locale) })
                : t('settings.lists.renameItem', { name: localName(editing, locale) })
          }
          max="list"
          initial={
            editing === 'new'
              ? undefined
              : {
                  nameEn: editing.nameEn,
                  nameAr: editing.nameAr,
                  ...(withManaging ? { managesPeople: Boolean(editing.managesPeople) } : {}),
                }
          }
          toggle={withManaging ? { label: copy('managesPeople'), hint: copy('managesPeopleHint') } : undefined}
          placeholders={{ en: copy('placeholderEn'), ar: copy('placeholderAr') }}
          submitLabel={editing === 'new' ? t('common.actions.create') : t('common.actions.save')}
          onSubmit={save}
        />
      ) : null}
    </SectionPanel>
  );
}
