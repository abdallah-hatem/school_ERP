'use client';

import { useRef, type ComponentProps } from 'react';
import { scrollListIntoView } from '@/shared/components/data-table/pagination';
import { Button } from '@/shared/components/ui/button';
import { Combobox, needsSearch } from '@/shared/components/ui/combobox';
import { ClearFiltersIcon, SearchIcon } from '@/shared/components/ui/icons';
import { formatCount } from '@/shared/lib/format';
import { Input } from '@/shared/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';

/*
 * The controls in a list's toolbar: a search box and "All …" filter selects. Lists keep their
 * state in the URL; these only report what the person chose.
 */

/** Radix Select items can't be empty; this one means "no filter". */
const ALL = '__all__';

export interface FilterOption {
  value: string;
  label: string;
  /** Extra text the searchable version matches but doesn't show (other-language name, a code). */
  keywords?: readonly string[];
}

/**
 * A filter with an "All …" first option; `undefined` means no filter. Above `SEARCH_THRESHOLD`
 * choices it is the searchable `Combobox`; `searchable` forces either way (lists of records such
 * as departments, which outgrow the seed).
 */
export function FilterSelect({
  label,
  allLabel,
  value,
  options,
  onChange,
  disabled,
  className,
  searchable,
}: {
  /** Accessible name, e.g. "Department". */
  label: string;
  /** The no-filter option, e.g. "All departments". */
  allLabel: string;
  value: string | undefined;
  options: FilterOption[];
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
  className?: string;
  searchable?: boolean;
}) {
  // A filter in use is tinted, so a narrowed list is visible at a glance.
  const triggerClass = cn('w-full sm:w-48', value !== undefined && 'border-primary bg-primary-soft text-primary', className);
  const report = (v: string) => onChange(v === ALL ? undefined : v);
  if (needsSearch(options.length + 1, searchable)) {
    return (
      <SearchableFilter
        label={label}
        options={[{ value: ALL, label: allLabel }, ...options]}
        value={value ?? ALL}
        onChange={report}
        disabled={disabled}
        className={triggerClass}
      />
    );
  }
  // The trigger names the choice itself: Radix only learns an item's text once the list has
  // mounted, so without children the closed trigger (and the server render) shows nothing.
  const selected = value === undefined ? allLabel : (options.find((o) => o.value === value)?.label ?? allLabel);
  return (
    <Select value={value ?? ALL} onValueChange={report} disabled={disabled}>
      <SelectTrigger aria-label={label} className={triggerClass}>
        <SelectValue placeholder={allLabel}>{selected}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SearchableFilter({
  label,
  options,
  value,
  onChange,
  disabled,
  className,
}: {
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className: string;
}) {
  const { t } = useTranslation();
  return (
    <Combobox
      aria-label={label}
      options={options}
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      className={className}
      placeholder={label}
      searchPlaceholder={t('ui.form.searchOptions')}
      emptyText={t('ui.form.noOptions')}
      noMatchesText={t('ui.form.noMatches')}
    />
  );
}

/**
 * "Clear filters · 3": shown only while a search or a filter narrows the list (`count` > 0), at
 * the inline end of the toolbar and as the "No results" action (`placement="empty"`). `onClear`
 * resets the search, every filter and the page in one URL update (the caller's `go`, with
 * `scroll: false`); this then brings the top of the list back into view, as paging does
 * (owner, 2026-11-18: every list with filters gets one).
 */
export function ClearFilters({
  count,
  onClear,
  disabled,
  placement = 'toolbar',
  className,
}: {
  /** The search (when it has text) plus each filter in use. */
  count: number;
  onClear: () => void;
  disabled?: boolean;
  placement?: 'toolbar' | 'empty';
  className?: string;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLButtonElement>(null);
  if (count <= 0) return null;
  return (
    <Button
      ref={ref}
      type="button"
      variant={placement === 'empty' ? 'secondary' : 'ghost'}
      data-testid="clear-filters"
      disabled={disabled}
      onClick={() => {
        onClear();
        scrollListIntoView(ref.current);
      }}
      className={cn(
        'shrink-0 cursor-pointer',
        placement === 'toolbar' && 'tap-target text-primary hover:bg-primary-soft hover:text-primary',
        className,
      )}
    >
      <ClearFiltersIcon />
      <span className="tabular">{t('ui.filters.clearCount', { count: formatCount(count) })}</span>
    </Button>
  );
}

/** Search box with the leading magnifier. Pass `aria-label` and a translated `placeholder`. */
export function SearchInput({
  className,
  wrapperClassName,
  ...props
}: ComponentProps<typeof Input> & { wrapperClassName?: string }) {
  return (
    <div className={cn('relative min-w-0 flex-1 basis-64', wrapperClassName)}>
      <SearchIcon className="text-muted-foreground pointer-events-none absolute inset-y-0 start-3.5 my-auto size-5" />
      <Input type="search" {...props} className={cn('ps-11', className)} />
    </div>
  );
}
