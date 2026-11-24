'use client';

import { PAGINATION, WORK_SYSTEMS, type ContractTemplateSummary, type WorkSystem } from '@school-erp/shared';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { callApi } from '@/lib/callApi';
import { DataTable, type DataTableColumn } from '@/shared/components/data-table/data-table';
import { RowActions, RowActionsSkeleton } from '@/shared/components/data-table/row-actions';
import { ClearFilters, SearchInput } from '@/shared/components/form/filter-controls';
import { EmptyState } from '@/shared/components/layout/empty-state';
import { BidiText } from '@/shared/components/ui/bidi-text';
import { Button } from '@/shared/components/ui/button';
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog';
import { Dialog, DialogContent } from '@/shared/components/ui/dialog';
import { AddIcon, ContractsIcon, EditIcon, HideIcon, ShowIcon, StaffIcon } from '@/shared/components/ui/icons';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { SkeletonPill, SkeletonText } from '@/shared/components/ui/skeleton';
import { StatusPill } from '@/shared/components/ui/status-pill';
import { Switch } from '@/shared/components/ui/switch';
import { formatDateTime } from '@/shared/lib/format';
import { localName, otherName } from '@/shared/lib/i18n';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { GET_CONTRACT_TEMPLATE, GET_CONTRACT_TEMPLATES, HIDE_CONTRACT_TEMPLATE, SHOW_CONTRACT_TEMPLATE, UPDATE_CONTRACT_TEMPLATE } from '../apis';
import { templateErrorText } from '../lib/errors';

const SEARCH_DEBOUNCE_MS = 250;
const LIMIT = PAGINATION.defaultLimit;

interface Query {
  search: string;
  hidden: boolean;
  page: number;
}

function readQuery(params: URLSearchParams | null): Query {
  const page = Number(params?.get('page') ?? '1');
  return {
    search: params?.get('q')?.trim() ?? '',
    hidden: params?.get('hidden') === '1',
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/** Settings → Contract templates: the "New template" button (the section header's action). */
export function NewTemplateButton({ href }: { href: string }) {
  const { t } = useTranslation();
  return (
    <Button asChild variant="primary">
      <Link href={href}>
        <AddIcon />
        {t('contractTemplates.list.newTemplate')}
      </Link>
    </Button>
  );
}

/**
 * Settings → HR → Contract templates (spec → Screens): the templates, paged and searched by the API
 * — name (both languages), languages, default mark, version, last changed — with "Show hidden".
 * The search, the toggle and the page live in the URL (`?q`, `?hidden=1`, `?page`, beside the
 * Settings `?section=`); typing waits for a pause; the list dims while the next page loads. A row's
 * ⋯ edits it, makes it a work system's default, or hides / shows it (never deleted).
 */
export function ContractTemplatesList({ editorHref }: { editorHref: string }) {
  const { t, has, locale } = useTranslation();
  const params = useSearchParams();
  const query = readQuery(params);
  const [typed, setTyped] = useState(query.search);
  const [state, setState] = useState<{ key: string | null; rows?: ContractTemplateSummary[]; total: number; failed: boolean }>({
    key: null,
    total: 0,
    failed: false,
  });
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hiding, setHiding] = useState<ContractTemplateSummary | null>(null);
  const [defaulting, setDefaulting] = useState<ContractTemplateSummary | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = `${query.search}|${query.hidden}|${query.page}|${reload}`;

  /** Writes the list's state into the address (the Settings screen keeps `?section=`). */
  const push = useCallback(
    (next: Partial<Query>) => {
      const url = new URL(window.location.href);
      const merged = { ...readQuery(url.searchParams), ...next };
      const set = (name: string, value: string | null) => (value ? url.searchParams.set(name, value) : url.searchParams.delete(name));
      set('q', merged.search || null);
      set('hidden', merged.hidden ? '1' : null);
      set('page', merged.page > 1 ? String(merged.page) : null);
      window.history.replaceState(null, '', `${url.pathname}${url.search}`);
    },
    [],
  );

  useEffect(() => {
    const n = ++seq.current;
    void callApi(GET_CONTRACT_TEMPLATES({ search: query.search || undefined, hidden: query.hidden, page: query.page, limit: LIMIT }), {
      showErrorToast: false,
    }).then((res) => {
      if (n !== seq.current || res.unauthorized) return;
      if (res.success) setState({ key, rows: res.data ?? [], total: res.meta?.total ?? 0, failed: false });
      else setState((s) => ({ ...s, key, failed: true }));
    });
    // `key` names the query; the effect runs when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function type(value: string) {
    setTyped(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => push({ search: value.trim(), page: 1 }), SEARCH_DEBOUNCE_MS);
  }

  function clear() {
    setTyped('');
    if (timer.current) clearTimeout(timer.current);
    push({ search: '', hidden: false, page: 1 });
  }

  async function act(row: ContractTemplateSummary, request: Promise<{ success?: boolean } & Record<string, unknown>>, done: string) {
    setBusyId(row.id);
    setRowError(null);
    try {
      const res = await callApi(request as ReturnType<typeof HIDE_CONTRACT_TEMPLATE>, { showErrorToast: false, showSuccessToast: true, successMessage: done });
      if (res.unauthorized) return false;
      if (!res.success) {
        setRowError(templateErrorText(res, { t, has, locale }, t('errors.INTERNAL_ERROR')));
        return false;
      }
      setReload((r) => r + 1);
      return true;
    } finally {
      setBusyId(null);
    }
  }

  /** "Make default for …": the template's texts as they are, with the work system's mark. */
  async function makeDefault(row: ContractTemplateSummary, workSystem: WorkSystem): Promise<boolean> {
    const full = await callApi(GET_CONTRACT_TEMPLATE(row.id), { showErrorToast: false });
    if (full.unauthorized) return false;
    if (!full.success || !full.data) {
      setRowError(templateErrorText(full, { t, has, locale }, t('errors.INTERNAL_ERROR')));
      return false;
    }
    const tpl = full.data;
    const first = await UPDATE_CONTRACT_TEMPLATE(row.id, {
      nameEn: tpl.nameEn,
      nameAr: tpl.nameAr,
      defaultForWorkSystem: workSystem,
      bodyAr: tpl.bodyAr,
      bodyEn: tpl.bodyEn,
      baseVersion: tpl.version,
    });
    const took = first.success ? first.data?.tookDefaultFrom : null;
    const done = took
      ? t('contractTemplates.list.tookDefault', { name: localName(tpl, locale), other: localName(took, locale) })
      : t('contractTemplates.list.makeDefault.done', { name: localName(tpl, locale), workSystem: t(`common.enums.workSystem.${workSystem}`) });
    return act(row, Promise.resolve(first) as Promise<{ success?: boolean } & Record<string, unknown>>, done);
  }

  const loading = state.key === null && !state.failed;
  const refreshing = state.key !== null && state.key !== key;
  const narrowed = (query.search ? 1 : 0) + (query.hidden ? 1 : 0);

  const columns: DataTableColumn<ContractTemplateSummary>[] = [
    {
      id: 'name',
      header: t('contractTemplates.list.columns.name'),
      className: 'min-w-56 whitespace-normal',
      card: 'title',
      skeleton: (
        <span className="flex flex-col gap-1">
          <SkeletonText className="font-bold" width="w-40" />
          <SkeletonText className="text-xs" width="w-28" />
        </span>
      ),
      cell: (row) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <Link
            href={`${editorHref}/${row.id}`}
            className="w-fit rounded-sm font-bold break-words hover:text-primary hover:underline focus-visible:outline-3 focus-visible:outline-ring/55"
          >
            {localName(row, locale)}
          </Link>
          <BidiText className="text-xs break-words text-muted-foreground">{otherName(row, locale)}</BidiText>
        </span>
      ),
    },
    {
      id: 'status',
      header: <span className="sr-only">{t('contractTemplates.list.columns.name')}</span>,
      cardLabel: null,
      className: 'w-52 whitespace-normal',
      // Its own line under the names on a card: beside them, "Default for Full-time" wrapped the
      // title on a phone, and the card grew past its skeleton.
      card: 'badges',
      skeleton: <SkeletonPill>{t('contractTemplates.list.defaultFor', { workSystem: t('common.enums.workSystem.FULL_TIME') })}</SkeletonPill>,
      cell: (row) =>
        row.hidden ? (
          <StatusPill tone="neutral" hollow>
            {t('contractTemplates.list.hidden')}
          </StatusPill>
        ) : row.defaultForWorkSystem ? (
          <StatusPill tone="accent">
            {t('contractTemplates.list.defaultFor', { workSystem: t(`common.enums.workSystem.${row.defaultForWorkSystem}`) })}
          </StatusPill>
        ) : null,
    },
    {
      id: 'languages',
      header: t('contractTemplates.list.columns.languages'),
      className: 'w-44 whitespace-nowrap',
      skeleton: <SkeletonText width="w-28" />,
      cell: (row) => t(`contractTemplates.languagePills.${row.hasEnglish ? 'both' : 'AR'}`),
    },
    {
      id: 'version',
      header: t('contractTemplates.list.columns.version'),
      className: 'w-24 whitespace-nowrap',
      skeleton: <SkeletonText width="w-8" />,
      cell: (row) => <span className="tabular">{t('contractTemplates.list.version', { version: row.version })}</span>,
    },
    {
      id: 'changed',
      header: t('contractTemplates.list.columns.changed'),
      className: 'w-60 whitespace-normal',
      skeleton: <SkeletonText className="text-sm" width="w-44" />,
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.updatedBy
            ? t('contractTemplates.list.changedBy', { when: formatDateTime(row.updatedAt, locale), name: row.updatedBy.name })
            : formatDateTime(row.updatedAt, locale)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: <span className="sr-only">{t('contractTemplates.list.columns.actions')}</span>,
      align: 'end',
      className: 'w-16',
      card: 'menu',
      skeleton: <RowActionsSkeleton />,
      cell: (row) => (
        <RowActions
          label={t('ui.table.actionsFor', { name: localName(row, locale) })}
          busy={busyId === row.id}
          disabled={busyId !== null && busyId !== row.id}
          actions={[
            { id: 'edit', label: t('contractTemplates.list.actions.edit'), icon: EditIcon, href: `${editorHref}/${row.id}` },
            {
              id: 'default',
              label: t('contractTemplates.list.actions.makeDefault'),
              icon: StaffIcon,
              // A hidden template can't be a default (edge case 10): show it first.
              hidden: row.hidden,
              onSelect: () => {
                setRowError(null);
                setDefaulting(row);
              },
            },
            row.hidden
              ? {
                  id: 'show',
                  label: t('contractTemplates.list.actions.show'),
                  icon: ShowIcon,
                  onSelect: () => void act(row, SHOW_CONTRACT_TEMPLATE(row.id), t('contractTemplates.list.shownDone')),
                }
              : {
                  id: 'hide',
                  label: t('contractTemplates.list.actions.hide'),
                  icon: HideIcon,
                  destructive: true,
                  onSelect: () => {
                    setRowError(null);
                    setHiding(row);
                  },
                },
          ]}
        />
      ),
    },
  ];

  const toolbar = (
    <div role="search" className="flex w-full flex-wrap items-center gap-3">
      <SearchInput
        aria-label={t('contractTemplates.list.search')}
        placeholder={t('contractTemplates.list.searchPlaceholder')}
        value={typed}
        loading={refreshing}
        onChange={(e) => type(e.target.value)}
      />
      <ShowHiddenSwitch checked={query.hidden} onChange={(on) => push({ hidden: on, page: 1 })} />
      <ClearFilters count={narrowed} onClear={clear} />
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {rowError ? (
        <p role="alert" className="rounded-2xl bg-destructive-soft px-4 py-3 text-sm font-semibold text-destructive-ink">
          {rowError}
        </p>
      ) : null}
      <DataTable
        label={t('contractTemplates.list.tableLabel')}
        columns={columns}
        rows={state.rows}
        loading={loading}
        refreshing={refreshing}
        error={state.failed && state.key === key}
        onRetry={() => setReload((r) => r + 1)}
        getRowId={(row) => row.id}
        toolbar={toolbar}
        cardsBelow={900}
        empty={
          narrowed ? (
            <EmptyState
              title={t('contractTemplates.list.noMatchesTitle')}
              description={t('contractTemplates.list.noMatchesBody')}
              action={<ClearFilters count={narrowed} placement="empty" onClear={clear} />}
            />
          ) : (
            <EmptyState
              icon={ContractsIcon}
              title={t('contractTemplates.list.emptyTitle')}
              description={t('contractTemplates.list.emptyBody')}
              action={<NewTemplateButton href={`${editorHref}/new`} />}
            />
          )
        }
        pagination={{ page: query.page, limit: LIMIT, total: state.total, onPageChange: (page) => push({ page }) }}
      />
      <ConfirmDialog
        open={hiding !== null}
        onOpenChange={(o) => !o && setHiding(null)}
        tone="destructive"
        title={t('contractTemplates.list.hideConfirm.title', { name: hiding ? localName(hiding, locale) : '' })}
        description={t('contractTemplates.list.hideConfirm.body')}
        confirmLabel={t('contractTemplates.list.hideConfirm.confirm')}
        onConfirm={async () => (hiding ? act(hiding, HIDE_CONTRACT_TEMPLATE(hiding.id), t('contractTemplates.list.hiddenDone')) : true)}
      />
      {defaulting ? (
        <MakeDefaultDialog
          template={defaulting}
          onClose={() => setDefaulting(null)}
          onConfirm={async (ws) => {
            const ok = await makeDefault(defaulting, ws);
            if (ok) setDefaulting(null);
            return ok;
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * The whole Settings section: its heading (focused when the section opens), "New template", and
 * the list. Settings composes it in (app/ → `SettingsPage` slots), so the HR module owns it.
 */
export function ContractTemplatesSection({ editorHref }: { editorHref: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header
        data-skeleton-block="section-header"
        className="flex flex-wrap items-start justify-between gap-3 rounded-3xl bg-card p-5 shadow-card sm:p-6"
      >
        <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1">
          <h2 tabIndex={-1} className="font-display text-lg leading-tight font-extrabold outline-none">
            {t('settings.sections.contractTemplates.title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('settings.sections.contractTemplates.description')}</p>
        </div>
        <NewTemplateButton href={`${editorHref}/new`} />
      </header>
      <ContractTemplatesList editorHref={editorHref} />
    </div>
  );
}

function ShowHiddenSwitch({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <span className="flex shrink-0 items-center gap-2.5">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <label htmlFor={id} className="cursor-pointer text-sm font-semibold">
        {t('contractTemplates.list.showHidden')}
      </label>
    </span>
  );
}

function MakeDefaultDialog({
  template,
  onClose,
  onConfirm,
}: {
  template: ContractTemplateSummary;
  onClose: () => void;
  onConfirm: (workSystem: WorkSystem) => Promise<boolean>;
}) {
  const { t, locale } = useTranslation();
  const [choice, setChoice] = useState<WorkSystem | null>(template.defaultForWorkSystem);
  const [busy, setBusy] = useState(false);
  const id = useId();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="sm"
        title={t('contractTemplates.list.makeDefault.title', { name: localName(template, locale) })}
        description={t('contractTemplates.list.makeDefault.body')}
        closeLabel={t('common.actions.close')}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              {t('common.actions.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={!choice}
              loading={busy}
              onClick={() => {
                if (!choice) return;
                setBusy(true);
                void onConfirm(choice).finally(() => setBusy(false));
              }}
            >
              {t('contractTemplates.list.makeDefault.confirm')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id} className="text-sm font-semibold">
            {t('contractTemplates.list.makeDefault.label')}
          </label>
          <Select value={choice ?? undefined} onValueChange={(v) => setChoice(v as WorkSystem)}>
            <SelectTrigger id={id}>
              <SelectValue placeholder={t('contractTemplates.list.makeDefault.pick')} />
            </SelectTrigger>
            <SelectContent>
              {WORK_SYSTEMS.map((ws) => (
                <SelectItem key={ws} value={ws}>
                  {t(`common.enums.workSystem.${ws}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </DialogContent>
    </Dialog>
  );
}
