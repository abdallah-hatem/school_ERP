'use client';

import type { AuditActor, AuditSummary, IsoDate } from '@school-erp/shared';
import { useId, useState, type ReactNode } from 'react';
import {
  AnyoneIcon,
  CheckIcon,
  CreatedIcon,
  EditIcon,
  FailedSignInIcon,
  FilterIcon,
  ApproveIcon,
  SearchIcon,
  SignInIcon,
  type AppIcon,
} from '@/shared/components/ui/icons';
import { controlClasses } from '@/shared/components/ui/input';
import { formatCount } from '@/shared/lib/format';
import { initialsOf } from '@/shared/lib/initials';
import { matchesSearch } from '@/shared/lib/search';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import {
  ACTIVITY_MODULES,
  ACTIVITY_TYPES,
  activeFilterCount,
  type ActivityModule,
  type ActivityQuery,
  type ActivityType,
} from '../lib/query';
import { DateRangeFilter } from './date-range-filter';

const TYPE_ICONS: Record<ActivityType, AppIcon> = {
  create: CreatedIcon,
  update: EditIcon,
  status: ApproveIcon,
  signIn: SignInIcon,
  failed: FailedSignInIcon,
};

function Group({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-2">
      <span id={id} className="text-xs font-bold text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

/** "All · School · HR · Settings" — one choice. */
function ModuleSwitch({
  value,
  onChange,
  disabled,
}: {
  value: ActivityModule | undefined;
  onChange: (value: ActivityModule | undefined) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const options: { value: ActivityModule | undefined; label: string }[] = [
    { value: undefined, label: t('audit.filters.allModules') },
    ...ACTIVITY_MODULES.map((m) => ({
      value: m,
      label: m === 'settings' ? t('audit.filters.settings') : t(`audit.modules.${m}`),
    })),
  ];
  return (
    // One row in both languages: segments size to their names with tight padding, so the long
    // Arabic "الموارد البشرية" and "الإعدادات" fit the 300px panel side by side.
    <div className="flex gap-0.5 rounded-xl bg-secondary p-0.75">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value ?? 'all'}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'tap-target min-h-9 flex-[1_1_auto] cursor-pointer rounded-[0.6rem] px-1.5 text-[0.8125rem] font-bold whitespace-nowrap transition-colors duration-150',
              'focus-visible:outline-3 focus-visible:outline-ring/55 disabled:cursor-not-allowed',
              on ? 'bg-card text-primary shadow-xs' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** The action-type chips: several at once mean any of them. */
function TypeChips({
  value,
  onChange,
  disabled,
}: {
  value: ActivityType[];
  onChange: (value: ActivityType[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-x-1.5 gap-y-3 md:gap-y-1.5">
      {ACTIVITY_TYPES.map((type) => {
        const on = value.includes(type);
        const Icon = TYPE_ICONS[type];
        return (
          <button
            key={type}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(on ? value.filter((v) => v !== type) : [...value, type])}
            className={cn(
              'tap-target inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[0.8125rem] font-semibold whitespace-nowrap transition-colors duration-150',
              'focus-visible:outline-3 focus-visible:outline-ring/55 disabled:cursor-not-allowed',
              on ? 'border-transparent bg-primary-soft text-primary' : 'border-input bg-card hover:bg-muted',
            )}
          >
            <Icon className="size-4" />
            {t(`audit.filters.chips.${type}`)}
          </button>
        );
      })}
    </div>
  );
}

/** The searchable person picker, open inline (layout option B): "Anyone" then everyone in the log. */
function PersonPicker({
  actors,
  value,
  onChange,
  disabled,
}: {
  actors: AuditActor[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const shown = actors.filter((a) => matchesSearch(search, [a.name]));
  const row = (key: string, selected: boolean, onClick: () => void, lead: ReactNode, name: string) => (
    <li key={key}>
      <button
        type="button"
        aria-pressed={selected}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          'flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-start text-sm transition-colors duration-150 md:min-h-10',
          'focus-visible:outline-3 focus-visible:outline-ring/55 disabled:cursor-not-allowed',
          selected ? 'bg-primary-soft font-bold text-primary' : 'hover:bg-muted',
        )}
      >
        {lead}
        <bdi className="min-w-0 flex-1 truncate">{name}</bdi>
        {selected ? <CheckIcon className="size-4 shrink-0" /> : null}
      </button>
    </li>
  );
  return (
    <div className="overflow-hidden rounded-2xl border border-input bg-card">
      <div className="relative border-b border-border">
        <SearchIcon className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
        <input
          type="search"
          dir="auto"
          autoComplete="off"
          aria-label={t('audit.filters.searchPeople')}
          placeholder={t('audit.filters.searchPeople')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn(controlClasses, 'h-11 rounded-none border-0 ps-9 shadow-none md:h-10')}
        />
      </div>
      <ul className="scrollbar-clean flex max-h-56 flex-col gap-0.5 overflow-y-auto overscroll-contain p-1">
        {search
          ? null
          : row(
              'anyone',
              value === undefined,
              () => onChange(undefined),
              <span className="grid size-7 shrink-0 place-items-center rounded-[0.6rem] bg-secondary text-muted-foreground">
                <AnyoneIcon className="size-4" />
              </span>,
              t('audit.filters.anyone'),
            )}
        {shown.map((a) =>
          row(
            a.id,
            value === a.id,
            () => onChange(value === a.id ? undefined : a.id),
            <span
              aria-hidden="true"
              className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-[0.6875rem] font-extrabold text-accent-foreground"
            >
              {initialsOf(a.name)}
            </span>,
            a.name,
          ),
        )}
        {shown.length === 0 ? (
          <li className="px-2 py-2 text-sm text-muted-foreground">
            {actors.length === 0 ? t('audit.filters.noPeople') : t('audit.filters.noPeopleMatch')}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function Glance({ summary }: { summary: AuditSummary }) {
  const { t } = useTranslation();
  const tile = (value: number, label: string, tone?: 'info' | 'warning') => (
    <div className="rounded-xl bg-muted px-3 py-2.5">
      <p
        className={cn(
          'tabular text-xl font-extrabold',
          tone === 'info' && 'text-info-ink',
          tone === 'warning' && value > 0 && 'text-warning-ink',
        )}
      >
        {formatCount(value)}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
  return (
    <div data-testid="today-at-a-glance" className="grid grid-cols-2 gap-2">
      {tile(summary.actions, t('audit.filters.glanceActions'))}
      {tile(summary.people, t('audit.filters.glancePeople'))}
      {tile(summary.money, t('audit.filters.glanceMoney'), 'info')}
      {tile(summary.failedSignIns, t('audit.filters.glanceFailed'), 'warning')}
    </div>
  );
}

/**
 * The filters panel (layout option B): date range, module switch, action-type chips, the person
 * picker and today at a glance. A side panel on wide screens, the body of the Filters sheet on a
 * phone. Every change reports the next query; the screen puts it in the URL.
 */
export function ActivityFilters({
  query,
  actors,
  summary,
  today,
  onChange,
  disabled,
  title = true,
}: {
  query: ActivityQuery;
  actors: AuditActor[];
  summary: AuditSummary | null;
  /** Today in the school's calendar. */
  today: IsoDate;
  onChange: (next: ActivityQuery) => void;
  disabled?: boolean;
  /** The panel's own heading (the sheet has its own). */
  title?: boolean;
}) {
  const { t } = useTranslation();
  const set = (patch: Partial<ActivityQuery>) => onChange({ ...query, ...patch, page: 1 });
  const active = activeFilterCount(query) > 0;
  return (
    <div className="flex flex-col gap-4.5">
      {title ? (
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 font-display text-base font-extrabold">
            <FilterIcon className="size-5 text-muted-foreground" />
            {t('audit.filters.title')}
          </h2>
          {active ? (
            <button
              type="button"
              onClick={() => onChange({ page: 1, types: [], ...(query.q ? { q: query.q } : {}) })}
              className="tap-target ms-auto cursor-pointer rounded-sm text-[0.8125rem] font-bold text-primary hover:underline focus-visible:outline-3 focus-visible:outline-ring/55"
            >
              {t('audit.filters.clear')}
            </button>
          ) : null}
        </div>
      ) : null}
      <Group label={t('audit.filters.dateRange')}>
        <DateRangeFilter
          from={query.from}
          to={query.to}
          today={today}
          disabled={disabled}
          onChange={({ from, to }) => set({ from, to })}
        />
      </Group>
      <Group label={t('audit.filters.module')}>
        <ModuleSwitch value={query.module} disabled={disabled} onChange={(module) => set({ module })} />
      </Group>
      <Group label={t('audit.filters.actionType')}>
        <TypeChips value={query.types} disabled={disabled} onChange={(types) => set({ types })} />
      </Group>
      <Group label={t('audit.filters.person')}>
        <PersonPicker actors={actors} value={query.actorId} disabled={disabled} onChange={(actorId) => set({ actorId })} />
      </Group>
      {summary ? (
        <Group label={t('audit.filters.glance')}>
          <Glance summary={summary} />
        </Group>
      ) : null}
    </div>
  );
}
