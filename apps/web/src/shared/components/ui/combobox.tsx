'use client';

import { useId, useMemo, useRef, useState, type ComponentProps, type KeyboardEvent } from 'react';
import { CheckIcon, ChevronDownIcon, SearchIcon } from '@/shared/components/ui/icons';
import { controlClasses } from '@/shared/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { matchesSearch } from '@/shared/lib/search';
import { cn } from '@/shared/lib/utils';

export interface ComboboxOption {
  value: string;
  /** What the row and the trigger show. */
  label: string;
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

export interface ComboboxProps extends Omit<
  ComponentProps<'button'>,
  'value' | 'onChange' | 'children' | 'placeholder'
> {
  options: readonly ComboboxOption[];
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
}

/**
 * A select with a search box: the trigger opens a popover aligned to it, focus lands in the search,
 * typing filters the options (label and keywords, either language, ignoring case and marks), the
 * arrow keys / Home / End move through the matches and Enter picks one. Rows are touch-sized;
 * direction follows the page. For short, fully loaded lists — the API searches paged data.
 */
export function Combobox({
  options,
  groups,
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
  ...triggerProps
}: ComboboxProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const all = useMemo(() => [...options, ...(groups ?? []).flatMap((g) => g.options)], [options, groups]);
  const selected = all.find((o) => o.value === value);
  // Sections in display order: the ungrouped options, then each group that still has a match.
  const sections = useMemo(() => {
    const filter = (list: readonly ComboboxOption[]) =>
      list.filter((o) => matchesSearch(query, [o.label, ...(o.keywords ?? [])]));
    return [
      { key: '', label: null as string | null, options: filter(options) },
      ...(groups ?? []).map((g) => ({
        key: g.key,
        label: g.label as string | null,
        options: filter(g.options),
      })),
    ].filter((section) => section.options.length > 0);
  }, [options, groups, query]);
  const matches = sections.flatMap((section) => section.options);
  const enabled = matches.filter((o) => !o.disabled);
  const activeOption = enabled[Math.min(active, enabled.length - 1)];
  const optionId = (v: string) => `${listId}-${v.replace(/\W/g, '-')}`;

  function change(next: boolean) {
    setOpen(next);
    if (next) {
      setQuery('');
      // Start on the chosen option so arrows continue from it.
      setActive(
        Math.max(
          0,
          all.filter((o) => !o.disabled).findIndex((o) => o.value === value),
        ),
      );
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
    const next = Math.max(0, Math.min(index, enabled.length - 1));
    setActive(next);
    const target = enabled[next];
    if (target) document.getElementById(optionId(target.value))?.scrollIntoView?.({ block: 'nearest' });
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const current = Math.min(active, enabled.length - 1);
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
          if (index >= 0 && index !== active) setActive(index);
        }}
        className={cn(
          'relative flex min-h-11 cursor-pointer items-center rounded-lg py-2 ps-3 pe-9 text-sm wrap-anywhere select-none',
          'data-[active]:bg-primary-soft data-[active]:text-primary',
          isSelected && 'font-semibold',
          option.disabled && 'pointer-events-none opacity-50',
        )}
      >
        {option.label}
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
          <span className="truncate">{selected ? selected.label : placeholder}</span>
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
              setActive(0);
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
          className="scrollbar-clean max-h-64 min-h-0 overflow-y-auto overscroll-contain"
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
              {all.length === 0 ? emptyText : noMatchesText}
            </li>
          ) : null}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
