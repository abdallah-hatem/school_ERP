'use client';

import { PAGINATION, type ListItem } from '@school-erp/shared';
import { useState } from 'react';
import { callApi } from '@/lib/callApi';
import { DataTable, type DataTableColumn } from '@/shared/components/data-table/data-table';
import { RowActions, rowActionsColumn } from '@/shared/components/data-table/row-actions';
import { EmptyState } from '@/shared/components/layout/empty-state';
import { Button } from '@/shared/components/ui/button';
import { AddIcon, EditIcon, HideIcon, ShowIcon } from '@/shared/components/ui/icons';
import { SkeletonPill, SkeletonText } from '@/shared/components/ui/skeleton';
import { StatusPill } from '@/shared/components/ui/status-pill';
import { localName, otherName } from '@/shared/lib/i18n';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { CREATE_LIST_ITEM, GET_LIST_ITEMS, UPDATE_LIST_ITEM, type ListKind } from '../apis';
import { useResource } from '../hooks/use-resource';
import { NamesDialog } from './names-dialog';
import { SectionPanel } from './section-panel';

/**
 * One managed list — stages, departments or job titles (§3, §7): add, rename, hide / show. No
 * delete: an item in use is hidden from new choices. The API returns the whole (short) list, so
 * it is paged here.
 */
export function ListManager({ kind }: { kind: ListKind }) {
  const { t, locale } = useTranslation();
  const list = useResource(kind, () => GET_LIST_ITEMS(kind));
  const [page, setPage] = useState(1);
  const limit = PAGINATION.defaultLimit;
  const [editing, setEditing] = useState<ListItem | 'new' | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const all = list.data ? [...list.data].sort((a, b) => a.sortOrder - b.sortOrder) : undefined;
  const pageCount = Math.max(1, Math.ceil((all?.length ?? 0) / limit));
  const current = Math.min(page, pageCount);
  const rows = all?.slice((current - 1) * limit, current * limit);
  const copy = (key: string, values?: Record<string, string | number>) => t(`settings.lists.${kind}.${key}`, values);

  function replace(item: ListItem) {
    list.setData((items) => items.map((i) => (i.id === item.id ? item : i)));
  }

  async function toggle(item: ListItem) {
    if (toggling) return;
    setToggling(item.id);
    try {
      const res = await callApi(UPDATE_LIST_ITEM(kind, item.id, { isActive: !item.isActive }));
      if (res.success && res.data) replace(res.data);
    } finally {
      setToggling(null);
    }
  }

  async function save(values: { nameEn: string; nameAr: string }): Promise<boolean> {
    if (editing === 'new') {
      const nextOrder = (all ?? []).reduce((max, i) => Math.max(max, i.sortOrder), 0) + 1;
      const res = await callApi(CREATE_LIST_ITEM(kind, { ...values, sortOrder: nextOrder }));
      if (res.success && res.data) {
        const created = res.data;
        list.setData((items) => [...items, created]);
        return true;
      }
      return false;
    }
    if (!editing) return false;
    const res = await callApi(UPDATE_LIST_ITEM(kind, editing.id, values));
    if (res.success && res.data) replace(res.data);
    return Boolean(res.success);
  }

  const columns: DataTableColumn<ListItem>[] = [
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
        <div className="flex min-w-0 flex-col">
          <span className="font-semibold break-words">{localName(item, locale)}</span>
          <span className="text-xs break-words text-muted-foreground">{otherName(item, locale)}</span>
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
    rowActionsColumn(t('settings.lists.actions'), (item) => (
      <RowActions
        label={t('ui.table.actionsFor', { name: localName(item, locale) })}
        busy={toggling === item.id}
        disabled={toggling !== null && toggling !== item.id}
        actions={[
          { id: 'rename', label: t('settings.lists.rename'), icon: EditIcon, onSelect: () => setEditing(item) },
          item.isActive
            ? { id: 'hide', label: t('settings.lists.hide'), icon: HideIcon, destructive: true, onSelect: () => void toggle(item) }
            : { id: 'show', label: t('settings.lists.show'), icon: ShowIcon, onSelect: () => void toggle(item) },
        ]}
      />
    )),
  ];

  const addButton = (
    <Button variant="primary" onClick={() => setEditing('new')} disabled={!list.data}>
      <AddIcon />
      {copy('add')}
    </Button>
  );

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
        pagination={{ page: current, limit, total: all?.length ?? 0, onPageChange: setPage }}
      />
      {editing ? (
        <NamesDialog
          key={editing === 'new' ? 'new' : editing.id}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          title={editing === 'new' ? copy('add') : t('settings.lists.renameItem', { name: localName(editing, locale) })}
          max="list"
          initial={editing === 'new' ? undefined : { nameEn: editing.nameEn, nameAr: editing.nameAr }}
          placeholders={{ en: copy('placeholderEn'), ar: copy('placeholderAr') }}
          submitLabel={editing === 'new' ? t('common.actions.create') : t('common.actions.save')}
          onSubmit={save}
        />
      ) : null}
    </SectionPanel>
  );
}
