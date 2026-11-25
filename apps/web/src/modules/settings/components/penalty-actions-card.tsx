'use client';

import {
  PAGINATION,
  PENALTY_EFFECTS,
  PENALTY_SALARY_BASES,
  PenaltyEffect,
  PenaltySalaryBase,
  type PenaltyActionItem,
} from '@school-erp/shared';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useId, useState } from 'react';
import { useCan } from '@/core/auth';
import { callApi } from '@/lib/callApi';
import { DataTable, type DataTableColumn } from '@/shared/components/data-table/data-table';
import { RowActions, rowActionsColumn } from '@/shared/components/data-table/row-actions';
import { EmptyState } from '@/shared/components/layout/empty-state';
import { Button } from '@/shared/components/ui/button';
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog';
import { Dialog, DialogClose, DialogContent } from '@/shared/components/ui/dialog';
import { AddIcon, EditIcon, HideIcon, ShowIcon } from '@/shared/components/ui/icons';
import { Input } from '@/shared/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/shared/components/ui/radio-group';
import { Label } from '@/shared/components/ui/label';
import { SkeletonPill, SkeletonText } from '@/shared/components/ui/skeleton';
import { StatusPill } from '@/shared/components/ui/status-pill';
import { Switch } from '@/shared/components/ui/switch';
import { formatCount } from '@/shared/lib/format';
import { localName, otherName, type Translate } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { CREATE_PENALTY_ACTION, GET_PENALTY_ACTIONS, UPDATE_PENALTY_ACTION } from '../apis';
import { useResource } from '../hooks/use-resource';
import { NAME_MAX } from '../schemas';
import { NamesDialog } from './names-dialog';
import { SectionPanel } from './section-panel';

/** The effect as the list names it: a % says which salary ("Deduct % of the salary for the month"). */
export function effectName(t: Translate, a: Pick<PenaltyActionItem, 'effect' | 'percentBase'>): string {
  const key = a.effect === PenaltyEffect.DEDUCT_PERCENT ? `DEDUCT_PERCENT_${a.percentBase ?? PenaltySalaryBase.MONTH_SALARY}` : a.effect;
  return t(`settings.penaltyActions.effectName.${key}`);
}

/**
 * Settings → Penalty catalogue → Penalty actions (spec 2026-11-25): the card above the groups, the
 * managed-list pattern of departments — Name (other language under it), Effect, Used on, a Hidden
 * pill; Show hidden; Add action; a ⋯ per row (Rename, Hide / Show; hiding one in use asks first,
 * with how many levels and violations use it). Paged by the API (`?actionsPage=`, beside
 * `?section=`; `?actionsHidden=1` shows hidden ones). Read-only without `hr.penalty_catalogue.manage`.
 */
export function PenaltyActionsCard({ onChanged }: { onChanged?: () => void }) {
  const { t, locale } = useTranslation();
  const canManage = useCan()('hr.penalty_catalogue.manage');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const urlPage = Number(params?.get('actionsPage'));
  const page = Number.isInteger(urlPage) && urlPage >= 1 ? urlPage : PAGINATION.defaultPage;
  const showHidden = params?.get('actionsHidden') === '1';
  const limit = PAGINATION.defaultLimit;
  const [version, setVersion] = useState(0);
  const list = useResource(`penalty-actions:${page}:${showHidden}:${version}`, () =>
    GET_PENALTY_ACTIONS({ page, limit, includeHidden: showHidden }),
  );
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<PenaltyActionItem | null>(null);
  const [hiding, setHiding] = useState<PenaltyActionItem | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const total = list.meta?.total ?? 0;
  const copy = (key: string, values?: Record<string, string | number>) => t(`settings.penaltyActions.${key}`, values);

  function setQuery(change: (q: URLSearchParams) => void) {
    const query = new URLSearchParams(params?.toString() ?? '');
    change(query);
    query.delete('part');
    const s = query.toString();
    router.replace(`${pathname ?? ''}${s ? `?${s}` : ''}`, { scroll: false });
  }
  const setPage = (next: number) =>
    setQuery((q) => (next > PAGINATION.defaultPage ? q.set('actionsPage', String(next)) : q.delete('actionsPage')));
  const setShowHidden = (on: boolean) =>
    setQuery((q) => {
      q.delete('actionsPage');
      if (on) q.set('actionsHidden', '1');
      else q.delete('actionsHidden');
    });

  function reload() {
    setVersion((v) => v + 1);
    onChanged?.();
  }

  async function setActive(item: PenaltyActionItem, isActive: boolean): Promise<boolean> {
    setToggling(item.id);
    try {
      const res = await callApi(UPDATE_PENALTY_ACTION(item.id, { isActive }));
      if (res.success) reload();
      return Boolean(res.success);
    } finally {
      setToggling(null);
    }
  }

  async function rename(values: { nameEn: string; nameAr: string }): Promise<boolean> {
    if (!renaming) return false;
    const res = await callApi(UPDATE_PENALTY_ACTION(renaming.id, { nameEn: values.nameEn, nameAr: values.nameAr }));
    if (res.success) reload();
    return Boolean(res.success);
  }

  const columns: DataTableColumn<PenaltyActionItem>[] = [
    {
      id: 'name',
      header: copy('name'),
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
        </div>
      ),
    },
    {
      id: 'effect',
      header: copy('effect'),
      skeleton: <SkeletonText width="w-40" />,
      cell: (item) => <span className="break-words">{effectName(t, item)}</span>,
    },
    {
      id: 'usedOn',
      header: copy('usedOn'),
      className: 'w-32',
      cell: (item) => <span className="tabular">{copy('usedOnCount', { count: formatCount(item.levelsUsing) })}</span>,
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
    // View only: no actions column at all.
    ...(canManage
      ? [
          rowActionsColumn(t('settings.lists.actions'), (item: PenaltyActionItem) => (
            <RowActions
              label={t('ui.table.actionsFor', { name: localName(item, locale) })}
              busy={toggling === item.id}
              disabled={toggling !== null && toggling !== item.id}
              actions={[
                { id: 'rename', label: t('settings.lists.rename'), icon: EditIcon, onSelect: () => setRenaming(item) },
                item.isActive
                  ? { id: 'hide', label: t('settings.lists.hide'), icon: HideIcon, destructive: true, onSelect: () => setHiding(item) }
                  : { id: 'show', label: t('settings.lists.show'), icon: ShowIcon, onSelect: () => void setActive(item, true) },
              ]}
            />
          )),
        ]
      : []),
  ];

  const showHiddenId = useId();
  const actions = (
    <>
      <div data-skeleton-block="actions-show-hidden" className="flex items-center gap-2">
        <Switch id={showHiddenId} checked={showHidden} onCheckedChange={setShowHidden} disabled={!list.data} />
        <Label htmlFor={showHiddenId} className="text-sm">
          {copy('showHidden')}
        </Label>
      </div>
      {canManage ? (
        <Button variant="primary" onClick={() => setAdding(true)} disabled={!list.data}>
          <AddIcon />
          {copy('add')}
        </Button>
      ) : null}
    </>
  );

  return (
    <SectionPanel part="actions" title={copy('title')} description={copy('description')} actions={actions}>
      <DataTable
        label={copy('title')}
        columns={columns}
        rows={list.data}
        getRowId={(item) => item.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.retry}
        retrying={list.retrying}
        empty={<EmptyState title={copy('emptyTitle')} description={showHidden ? copy('emptyBody') : copy('emptyHiddenBody')} />}
        refreshing={list.refreshing}
        pagination={{ page: list.meta?.page ?? page, limit, total, onPageChange: setPage }}
      />
      {adding ? <AddActionDialog onClose={() => setAdding(false)} onAdded={reload} /> : null}
      {renaming ? (
        <NamesDialog
          key={renaming.id}
          open
          onOpenChange={(open) => !open && setRenaming(null)}
          title={copy('renameTitle', { name: localName(renaming, locale) })}
          max="list"
          initial={{ nameEn: renaming.nameEn, nameAr: renaming.nameAr }}
          placeholders={{ en: copy('placeholderEn'), ar: copy('placeholderAr') }}
          submitLabel={t('common.actions.save')}
          extra={
            <p className="rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
              {copy('effectReadOnly', { effect: effectName(t, renaming) })}
            </p>
          }
          onSubmit={rename}
        />
      ) : null}
      <ConfirmDialog
        open={hiding !== null}
        onOpenChange={(o) => !o && setHiding(null)}
        title={copy('hideTitle', { name: hiding ? localName(hiding, locale) : '' })}
        description={
          hiding && hiding.levelsUsing > 0
            ? copy('hideBody', {
                levels: copy('hideLevels', { count: formatCount(hiding.levelsUsing) }),
                violations: copy('hideViolations', { count: formatCount(hiding.violationsUsing) }),
              })
            : copy('hideBodyUnused')
        }
        confirmLabel={t('settings.lists.hide')}
        tone="destructive"
        onConfirm={async () => (hiding ? setActive(hiding, false) : true)}
      />
    </SectionPanel>
  );
}

/**
 * Add a penalty action (spec 2026-11-25): English and Arabic names, the effect — five choices, each
 * with its one-line explanation — and, for a %, which salary (default: the salary for the month).
 * The effect can't be changed later.
 */
export function AddActionDialog({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const { t } = useTranslation();
  const copy = (key: string) => t(`settings.penaltyActions.${key}`);
  const formId = useId();
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [effect, setEffect] = useState<PenaltyEffect | null>(null);
  const [base, setBase] = useState<PenaltySalaryBase>(PenaltySalaryBase.MONTH_SALARY);
  const [saving, setSaving] = useState(false);
  const valid = nameEn.trim() !== '' && nameAr.trim() !== '' && effect !== null;

  async function submit() {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const res = await callApi(
        CREATE_PENALTY_ACTION({
          nameEn: nameEn.trim(),
          nameAr: nameAr.trim(),
          effect,
          ...(effect === PenaltyEffect.DEDUCT_PERCENT ? { percentBase: base } : {}),
        }),
      );
      if (res.success) {
        onAdded();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent
        size="md"
        title={copy('addTitle')}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary" disabled={saving}>
                {t('common.actions.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" form={formId} variant="primary" disabled={!valid} loading={saving}>
              {t('common.actions.create')}
            </Button>
          </>
        }
      >
        <form
          id={formId}
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <NameInput label={t('settings.names.nameEn')} value={nameEn} onChange={setNameEn} dir="ltr" placeholder={copy('placeholderEn')} />
          <NameInput label={t('settings.names.nameAr')} value={nameAr} onChange={setNameAr} dir="rtl" placeholder={copy('placeholderAr')} />
          <RadioCards
            legend={copy('effectLabel')}
            name="effect"
            value={effect}
            onChange={(v) => setEffect(v as PenaltyEffect)}
            options={PENALTY_EFFECTS.map((e) => ({ value: e, label: t(`settings.penaltyActions.effectHelp.${e}`) }))}
          />
          {effect === PenaltyEffect.DEDUCT_PERCENT ? (
            <RadioCards
              legend={copy('baseLabel')}
              name="percentBase"
              value={base}
              onChange={(v) => setBase(v as PenaltySalaryBase)}
              options={PENALTY_SALARY_BASES.map((b) => ({ value: b, label: t(`settings.penaltyActions.base.${b}`) }))}
            />
          ) : null}
          <p className="text-xs text-muted-foreground">{copy('effectLocked')}</p>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NameInput({
  label,
  value,
  onChange,
  dir,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  dir: 'ltr' | 'rtl';
  placeholder: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label} <span aria-hidden="true" className="text-destructive-ink">*</span>
      </Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} dir={dir} maxLength={NAME_MAX.list} placeholder={placeholder} required />
    </div>
  );
}

/** A set of radio choices drawn as cards (the kit's RadioGroup), each with an optional explanation. */
function RadioCards({
  legend,
  name,
  value,
  onChange,
  options,
}: {
  legend: string;
  name: string;
  value: string | null;
  onChange: (value: string) => void;
  options: { value: string; label: string; hint?: string }[];
}) {
  const legendId = useId();
  return (
    <div className="flex flex-col gap-2">
      <p id={legendId} className="mb-1.5 text-sm font-semibold">
        {legend} <span aria-hidden="true" className="text-destructive-ink">*</span>
      </p>
      <RadioGroup name={name} value={value ?? ''} onValueChange={onChange} aria-labelledby={legendId} required>
        {options.map((o) => {
          const id = `${name}-${o.value}`;
          return (
            <label
              key={o.value}
              htmlFor={id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors duration-150',
                value === o.value ? 'border-primary bg-primary-soft' : 'border-input bg-card hover:bg-muted',
              )}
            >
              <RadioGroupItem id={id} value={o.value} className="mt-0.5" />
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-semibold">{o.label}</span>
                {o.hint ? <span className="text-xs text-muted-foreground">{o.hint}</span> : null}
              </span>
            </label>
          );
        })}
      </RadioGroup>
    </div>
  );
}
