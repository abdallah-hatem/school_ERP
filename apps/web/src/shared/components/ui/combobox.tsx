'use client';

import { useEffect, useId, useMemo, useRef, useState, type ComponentProps, type KeyboardEvent } from 'react';
import { CheckIcon, ChevronDownIcon, SearchIcon } from '@/shared/components/ui/icons';
import { controlClasses } from '@/shared/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { matchesSearch } from '@/shared/lib/search';
import { cn } from '@/shared/lib/utils';

export interface ComboboxOption {
  value: string;
  /** What the row and the trigger show. */
  label: string;
  /** Lighter text after the label, " · "-separated (a manager's department). The search matches it. */
  hint?: string;
  /** Extra text the search matches but doesn't show (the other language's name, a code). */
  keywords?: readonly string[];
  disabled?: boolean;
}

/** A heading the person can't pick, then its options. It hides while a search leaves it empty. */
export interface ComboboxGroup {
  key: string;
  label: string;
  options: readonly ComboboxOption[];
}

/**
 * Above this many options a picker gets a search box (forms.md → "A picker with many options gets
 * a search"); at or below it a plain select is faster to scan. `SelectField` and `FilterSelect`
 * switch by themselves; a `searchable` prop forces either way.
 */
export const SEARCH_THRESHOLD = 6;

/** True when a list holding `count` options should be searchable (unless `forced` says otherwise). */
export function needsSearch(count: number, forced?: boolean): boolean {
  return forced ?? count > SEARCH_THRESHOLD;
}

/**
 * A picker whose options the API searches (lists of records: employees, departments, people in
 * the log…) — `useServerOptions` builds it. The Combobox then never filters: it shows what the API
 * answered for the typed text, dimmed while the next answer loads.
 */
export interface ServerOptions {
  /** The options the API answered for the current text (ungrouped). */
  options: readonly ComboboxOption[];
  /** …or under headings (violations by catalogue group). */
  groups?: readonly ComboboxGroup[];
  /** Called when the list opens (with "") and as the person types. */
  onQueryChange: (query: string) => void;
  loading: boolean;
  /** The answer failed: the list says so instead of "no matches". */
  failed?: boolean;
  /** The chosen option, shown on the trigger even when today's answer doesn't hold it. */
  selected?: ComboboxOption | null;
  /** "Showing 20 of 85 — type to narrow": when the API holds more than it answered. */
  more?: string | null;
}

export interface ComboboxProps extends Omit<
  ComponentProps<'button'>,
  'value' | 'onChange' | 'children' | 'placeholder'
> {
  /** The options (a short code list the Combobox filters itself); ignored with `server`. */
  options?: readonly ComboboxOption[];
  /** Options under headings, after `options` (e.g. violations by catalogue group). */
  groups?: readonly ComboboxGroup[];
  value: string | null | undefined;
  onValueChange: (value: string) => void;
  /** Trigger text with nothing chosen. */
  placeholder: string;
  /** The search box's placeholder and accessible name, e.g. "Type a name or code". */
  searchPlaceholder: string;
  /** Shown when there are no options at all (and where the first one is made). */
  emptyText: string;
  /** Shown when the search matches nothing. */
  noMatchesText: string;
  /** Called when the list closes (react-hook-form's `onBlur`). */
  onClose?: () => void;
  /** The API searches the options (`useServerOptions`); `options` / `groups` are then ignored. */
  server?: ServerOptions;
}

/**
 * An option's text: the label, then its hint lighter (muted, normal weight) after " · ". Each part is
 * isolated so the order holds in RTL with mixed scripts (name first, then the hint); the separator
 * is plain text, so a screen reader reads "Name · Department" as one name.
 */
export function OptionText({ label, hint }: { label: string; hint?: string | null }) {
  if (!hint) return <>{label}</>;
  return (
    <>
      <bdi>{label}</bdi>
      <span className="text-muted-foreground font-normal">
        {' · '}
        <bdi>{hint}</bdi>
      </span>
    </>
  );
}

/** A row's element id (the search box points at it with `aria-activedescendant`). */
function optionDomId(listId: string, value: string): string {
  return `${listId}-${value.replace(/\W/g, '-')}`;
}

/**
 * A select with a search box: the trigger opens a popover aligned to it, focus lands in the search,
 * typing filters the options (label and keywords, either language, ignoring case and marks), the
 * arrow keys / Home / End move through the matches and Enter picks one. Rows are touch-sized;
 * direction follows the page. With `server` the API answers each search (records); without, the
 * typed text filters the given options — only for short lists that are code, not data (an enum).
 */
export function Combobox({
  options: givenOptions = [],
  groups: givenGroups,
  value,
  onValueChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  noMatchesText,
  onClose,
  disabled,
  className,
  ref,
  server,
  ...triggerProps
}: ComboboxProps) {
  const options = server ? server.options : givenOptions;
  const groups = server ? server.groups : givenGroups;
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // The highlighted row, by value: `null` is the first match. Kept by value (not by place) so it stays
  // on the same option when the API's answer arrives or changes order.
  const [activeValue, setActiveValue] = useState<string | null>(null);
  // Set on open: bring the chosen option into view once it is in the list.
  const revealChosen = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const all = useMemo(() => [...options, ...(groups ?? []).flatMap((g) => g.options)], [options, groups]);
  const remembered = server?.selected;
  const selected = all.find((o) => o.value === value) ?? (remembered && remembered.value === value ? remembered : undefined);
  // Sections in display order: the ungrouped options, then each group that still has a match.
  const sections = useMemo(() => {
    // The API already searched a server list; a short code list filters here.
    const filter = (list: readonly ComboboxOption[]) =>
      server ? list : list.filter((o) => matchesSearch(query, [o.label, ...(o.hint ? [o.hint] : []), ...(o.keywords ?? [])]));
    return [
      { key: '', label: null as string | null, options: filter(options) },
      ...(groups ?? []).map((g) => ({
        key: g.key,
        label: g.label as string | null,
        options: filter(g.options),
      })),
    ].filter((section) => section.options.length > 0);
  }, [options, groups, query, server]);
  const matches = sections.flatMap((section) => section.options);
  const enabled = matches.filter((o) => !o.disabled);
  // A value no longer among the matches highlights nothing — the chosen option the API's page doesn't
  // hold (yet): Enter then keeps the value instead of silently picking the first row.
  const activeOption = activeValue === null ? enabled[0] : enabled.find((o) => o.value === activeValue);
  const active = activeOption ? enabled.indexOf(activeOption) : -1;
  const optionId = (v: string) => optionDomId(listId, v);

  function change(next: boolean) {
    setOpen(next);
    if (next) {
      setQuery('');
      server?.onQueryChange('');
      // Open on the chosen option (Enter keeps it, arrows continue from it); nothing chosen, the first.
      setActiveValue(value ? value : null);
      revealChosen.current = Boolean(value);
    } else {
      onClose?.();
    }
  }

  function pick(option: ComboboxOption) {
    if (option.disabled) return;
    onValueChange(option.value);
    change(false);
  }

  function moveTo(index: number) {
    const target = enabled[Math.max(0, Math.min(index, enabled.length - 1))];
    if (!target) return;
    revealChosen.current = false;
    setActiveValue(target.value);
    document.getElementById(optionId(target.value))?.scrollIntoView?.({ block: 'nearest' });
  }

  // On open — and when the API's answer arrives holding it — scroll the chosen option into the
  // list's view. Only the list scrolls (not the page: the popover may not be placed yet).
  const chosenShown = open && activeOption !== undefined && activeOption.value === value;
  useEffect(() => {
    if (!chosenShown || !revealChosen.current) return;
    const list = listRef.current;
    const row = value ? document.getElementById(optionDomId(listId, value)) : null;
    if (!list || !row) return;
    revealChosen.current = false;
    const listBox = list.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    const offset = rowBox.top - listBox.top;
    if (offset < 0 || offset + rowBox.height > listBox.height) {
      list.scrollTop += offset - (listBox.height - rowBox.height) / 2;
    }
  }, [chosenShown, value, listId]);

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const current = active;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveTo(current + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveTo(current - 1);
        break;
      case 'Home':
        e.preventDefault();
        moveTo(0);
        break;
      case 'End':
        e.preventDefault();
        moveTo(enabled.length - 1);
        break;
      case 'Enter':
        e.preventDefault();
        if (activeOption) pick(activeOption);
        break;
    }
  }

  function renderOption(option: ComboboxOption) {
    const isSelected = option.value === value;
    const isActive = option === activeOption;
    return (
      <li
        key={option.value}
        id={optionId(option.value)}
        role="option"
        aria-selected={isSelected}
        aria-disabled={option.disabled || undefined}
        data-active={isActive || undefined}
        // Keep focus in the search box; a tap or click picks.
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => pick(option)}
        onPointerMove={() => {
          const index = enabled.indexOf(option);
          if (index >= 0 && index !== active) setActiveValue(option.value);
        }}
        className={cn(
          'relative flex min-h-11 cursor-pointer items-center rounded-lg py-2 ps-3 pe-9 text-sm wrap-anywhere select-none',
          'data-[active]:bg-primary-soft data-[active]:text-primary',
          isSelected && 'font-semibold',
          option.disabled && 'pointer-events-none opacity-50',
        )}
      >
        <span className="min-w-0">
          <OptionText label={option.label} hint={option.hint} />
        </span>
        {isSelected ? <CheckIcon className="text-primary absolute end-3 size-4" /> : null}
      </li>
    );
  }

  return (
    <Popover open={open} onOpenChange={change}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          {...triggerProps}
          ref={ref}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          className={cn(
            controlClasses,
            'flex h-11 cursor-pointer items-center justify-between gap-2 text-start',
            !selected && 'text-muted-foreground/80',
            className,
          )}
        >
          <span className="min-w-0 truncate">
            {selected ? <OptionText label={selected.label} hint={selected.hint} /> : placeholder}
          </span>
          <ChevronDownIcon className="text-muted-foreground size-4 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="flex w-(--radix-popover-trigger-width) min-w-64 flex-col gap-1.5 overflow-hidden p-1.5"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          searchRef.current?.focus();
        }}
      >
        <div className="relative shrink-0">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute inset-y-0 start-3 my-auto size-4" />
          <input
            ref={searchRef}
            type="search"
            dir="auto"
            autoComplete="off"
            enterKeyHint="go"
            aria-label={searchPlaceholder}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeOption ? optionId(activeOption.value) : undefined}
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              server?.onQueryChange(e.target.value);
              // A search highlights its first match.
              setActiveValue(null);
              revealChosen.current = false;
              listRef.current?.scrollTo?.({ top: 0 });
            }}
            onKeyDown={onKeyDown}
            className={cn(controlClasses, 'h-11 ps-9 text-start [&::-webkit-search-cancel-button]:appearance-none')}
          />
        </div>
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={triggerProps['aria-label'] ?? placeholder}
          aria-busy={server?.loading || undefined}
          className={cn(
            'scrollbar-clean max-h-64 min-h-0 overflow-y-auto overscroll-contain transition-opacity duration-150',
            server?.loading && matches.length > 0 && 'opacity-55',
          )}
        >
          {sections.map((section) =>
            section.label === null ? (
              section.options.map(renderOption)
            ) : (
              <li key={section.key} role="presentation">
                <ul role="group" aria-labelledby={`${listId}-g-${section.key}`}>
                  <li
                    role="presentation"
                    id={`${listId}-g-${section.key}`}
                    className="text-muted-foreground px-3 pt-3 pb-1.5 text-xs font-bold"
                  >
                    {section.label}
                  </li>
                  {section.options.map(renderOption)}
                </ul>
              </li>
            ),
          )}
          {matches.length === 0 ? (
            <li role="presentation" className="text-muted-foreground px-3 py-2.5 text-sm">
              {server?.loading
                ? '…'
                : server?.failed
                  ? noMatchesText
                  : server
                    ? query.trim()
                      ? noMatchesText
                      : emptyText
                    : all.length === 0
                      ? emptyText
                      : noMatchesText}
            </li>
          ) : null}
        </ul>
        {server?.more ? (
          <p role="status" className="text-muted-foreground border-border border-t px-3 pt-2 pb-1 text-xs">
            {server.more}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
