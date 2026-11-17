'use client';

import { PAGINATION, type SettingChangeItem } from '@school-erp/shared';
import { useState } from 'react';
import { DataTable, type DataTableColumn } from '@/shared/components/data-table/data-table';
import { EmptyState } from '@/shared/components/layout/empty-state';
import { HistoryIcon } from '@/shared/components/ui/icons';
import { formatDateTime } from '@/shared/lib/format';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { GET_SETTINGS_HISTORY } from '../apis';
import { useResource } from '../hooks/use-resource';
import { formatChangeValue, keyLabel } from '../lib/history-format';
import { SectionPanel } from './section-panel';

/** Every change to settings, lists and the catalogue, newest first, page by page (§7). */
export function HistorySection() {
  const { t, has, locale } = useTranslation();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<number>(PAGINATION.defaultLimit);
  const history = useResource(`history:${page}:${limit}`, () => GET_SETTINGS_HISTORY({ page, limit }));

  const columns: DataTableColumn<SettingChangeItem>[] = [
    {
      id: 'what',
      header: t('settings.history.what'),
      card: 'title',
      className: 'min-w-40',
      cell: (row) => <span className="font-semibold">{keyLabel(row.key, t, has)}</span>,
    },
    {
      id: 'change',
      header: t('settings.history.change'),
      card: 'wide',
      className: 'min-w-64',
      cell: (row) => (
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1 break-words">
          <span className="text-muted-foreground line-through decoration-muted-foreground/50">
            {formatChangeValue(row.key, row.oldValue, t, locale)}
          </span>
          <span aria-hidden="true" className="text-muted-foreground">
            {locale === 'ar' ? '←' : '→'}
          </span>
          <span className="sr-only">{t('settings.history.to')}</span>
          <span className="font-semibold">{formatChangeValue(row.key, row.newValue, t, locale)}</span>
        </span>
      ),
    },
    {
      id: 'who',
      header: t('settings.history.who'),
      className: 'w-44',
      cell: (row) => row.changedBy?.name ?? t('settings.history.system'),
    },
    {
      id: 'when',
      header: t('settings.history.when'),
      card: 'status',
      className: 'w-48',
      cell: (row) => <bdi className="tabular text-sm whitespace-nowrap">{formatDateTime(row.changedAt, locale)}</bdi>,
    },
  ];

  return (
    <SectionPanel title={t('settings.sections.history.title')} description={t('settings.sections.history.description')}>
      <DataTable
        label={t('settings.sections.history.title')}
        columns={columns}
        rows={history.data}
        getRowId={(row) => row.id}
        loading={history.loading}
        refreshing={history.refreshing}
        error={history.error}
        onRetry={history.retry}
        retrying={history.retrying}
        empty={<EmptyState icon={HistoryIcon} title={t('settings.history.emptyTitle')} description={t('settings.history.emptyBody')} />}
        pagination={{
          page,
          limit,
          total: history.meta?.total ?? 0,
          onPageChange: setPage,
          onLimitChange: (next) => {
            setLimit(next);
            setPage(1);
          },
        }}
      />
    </SectionPanel>
  );
}
