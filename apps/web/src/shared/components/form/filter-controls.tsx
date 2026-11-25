'use client';

import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { scrollListIntoView } from '@/shared/components/data-table/pagination';
import { Button, Spinner } from '@/shared/components/ui/button';
import { Combobox, needsSearch, OptionText, type ServerOptions } from '@/shared/components/ui/combobox';
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
  /** Lighter text shown after the label, " · "-separated; searched too. */
  hint?: string;
  /** Extra text the searchable version matches but doesn't show (other-language name, a code). */
  keywords?: readonly string[];
}

/**
 * A filter with an "All …" first option; `undefined` means no filter. A filter over records
 * (departments, roles…) passes `server` (`useServerOptions`): the API searches its choices. A short
 * code list (an enum) passes `options`; above `SEARCH_THRESHOLD` it gets a search box of its own.
 */
export function FilterSelect({
  label,
  allLabel,
  value,
  options = [],
  onChange,
  disabled,
  className,
  searchable,
  server,
}: {
  /** Accessible name, e.g. "Department". */
  label: string;
  /** The no-filter option, e.g. "All departments". */
  allLabel: string;
  value: string | undefined;
  /** A short code list's choices; ignored with `server`. */
  options?: FilterOption[];
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
  className?: string;
  searchable?: boolean;
  /** Records: the API searches the choices. */
  server?: ServerOptions;
}) {
  // A filter in use is tinted, so a narrowed list is visible at a glance.
  const triggerClass = cn('w-full sm:w-48', value !== undefined && 'border-primary bg-primary-soft text-primary', className);
  const report = (v: string) => onChange(v === ALL ? undefined : v);
  if (server) {
    return (
      <ServerFilter
        label={label}
        allLabel={allLabel}
        server={server}
        value={value ?? ALL}
        onChange={report}
        disabled={disabled}
        className={triggerClass}
      />
    );
  }
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
            <OptionText label={o.label} hint={o.hint} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A filter over records: "All …" heads the API's answer, until the person searches. */
function ServerFilter({
  label,
  allLabel,
  server,
  value,
  onChange,
  disabled,
  className,
}: {
  label: string;
  allLabel: string;
  server: ServerOptions;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className: string;
}) {
  const [query, setQuery] = useState('');
  const all = { value: ALL, label: allLabel };
  return (
    <SearchableFilter
      label={label}
      options={[]}
      server={{
        ...server,
        options: query.trim() ? server.options : [all, ...server.options],
        onQueryChange: (text) => {
          setQuery(text);
          server.onQueryChange(text);
        },
        selected: value === ALL ? all : server.selected,
      }}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={className}
    />
  );
}

function SearchableFilter({
  label,
  options,
  value,
  onChange,
  disabled,
  className,
  server,
}: {
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className: string;
  server?: ServerOptions;
}) {
  const { t } = useTranslation();
  return (
    <Combobox
      aria-label={label}
      options={options}
      server={server}
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

/** How long a refetch runs before the search box shows it, so instant results don't flash it. */
export const SEARCH_LOADING_DELAY_MS = 180;
/** Once shown, the spinner stays at least this long, so it never flickers on and off. */
export const SEARCH_LOADING_MIN_MS = 300;

/**
 * True once `active` has lasted `SEARCH_LOADING_DELAY_MS`, then kept true for at least
 * `SEARCH_LOADING_MIN_MS` — a refetch that ends sooner shows nothing.
 */
export function useDelayedLoading(active: boolean): boolean {
  const [shown, setShown] = useState(false);
  const shownAt = useRef(0);
  useEffect(() => {
    if (active === shown) return;
    if (active) {
      const timer = setTimeout(() => {
        shownAt.current = Date.now();
        setShown(true);
      }, SEARCH_LOADING_DELAY_MS);
      return () => clearTimeout(timer);
    }
    const left = Math.max(0, SEARCH_LOADING_MIN_MS - (Date.now() - shownAt.current));
    const timer = setTimeout(() => setShown(false), left);
    return () => clearTimeout(timer);
  }, [active, shown]);
  return shown;
}

/**
 * Search box with the leading magnifier. Pass `aria-label` and a translated `placeholder`.
 *
 * `loading` is the list's refetch (its `useTransition` pending — from typing, a filter, a tab or
 * a page; owner, 2026-11-20): after a short delay a spinner takes the magnifier's place, same size
 * and spot (static under reduced motion), and "Loading…" is announced once. The list keeps dimming.
 */
export function SearchInput({
  className,
  wrapperClassName,
  loading = false,
  ...props
}: ComponentProps<typeof Input> & { wrapperClassName?: string; loading?: boolean }) {
  const { t } = useTranslation();
  const busy = useDelayedLoading(loading);
  const iconClass = 'pointer-events-none absolute inset-y-0 start-3.5 my-auto size-5';
  return (
    <div className={cn('relative min-w-0 flex-1 basis-64', wrapperClassName)}>
      {busy ? (
        <Spinner data-testid="search-spinner" className={cn(iconClass, 'text-primary animate-none motion-safe:animate-spin')} />
      ) : (
        <SearchIcon data-testid="search-icon" className={cn(iconClass, 'text-muted-foreground')} />
      )}
      <Input type="search" {...props} className={cn('ps-11', className)} />
      <span role="status" className="sr-only">
        {busy ? t('ui.states.loading') : null}
      </span>
    </div>
  );
}
