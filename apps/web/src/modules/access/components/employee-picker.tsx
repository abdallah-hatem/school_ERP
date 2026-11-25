'use client';

import type { EmployeeOption, UserAccount } from '@school-erp/shared';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { callApi } from '@/lib/callApi';
import { controlClasses } from '@/shared/components/ui/input';
import { CheckIcon, ChevronDownIcon, LinkedEmployeeIcon, SearchIcon } from '@/shared/components/ui/icons';
import { PersonAvatar } from '@/shared/components/ui/person-avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { formatCount } from '@/shared/lib/format';
import { localName } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { GET_EMPLOYEE_OPTIONS } from '../apis';

/** The linked employee as the form holds it. */
export type LinkedEmployee = NonNullable<UserAccount['employee']>;

const PAGE = 8;
const DEBOUNCE_MS = 250;

/**
 * The linked-employee picker (P3, option A): a searchable list that asks the API (`search` on name
 * or code, one page of 8) as you type — a school has far more employees than a picker can load.
 * Each row shows the code and job title; an employee who already has another account is shown but
 * can't be picked. "Not linked" clears the link.
 */
export function EmployeePicker({
  id,
  value,
  onChange,
  userId,
  disabled,
  invalid,
  describedBy,
}: {
  id: string;
  value: LinkedEmployee | null;
  onChange: (employee: LinkedEmployee | null) => void;
  /** The account being edited: its own linked employee stays pickable. */
  userId?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const { t, locale } = useTranslation();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [state, setState] = useState<{ rows: EmployeeOption[]; total: number; loading: boolean; failed: boolean }>({
    rows: [],
    total: 0,
    loading: false,
    failed: false,
  });
  // The highlighted row by its key ('none' is "Not linked"); `null` is the first row. By key, so it
  // stays on the linked employee when the API's answer arrives.
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const request = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  /** Asks the API for `search` (after a pause while typing); only the latest answer is kept. */
  function load(search: string, wait: number) {
    const n = ++request.current;
    setState((s) => ({ ...s, loading: true, failed: false }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void callApi(GET_EMPLOYEE_OPTIONS({ search: search.trim() || undefined, limit: PAGE }), {
        showErrorToast: false,
      }).then((res) => {
        if (n !== request.current) return;
        if (res.success) setState({ rows: res.data ?? [], total: res.meta?.total ?? 0, loading: false, failed: false });
        else setState({ rows: [], total: 0, loading: false, failed: true });
      });
    }, wait);
  }

  const taken = (o: EmployeeOption) => Boolean(o.linkedUser && o.linkedUser.id !== userId);
  const choices: (EmployeeOption | null)[] = [null, ...state.rows];
  const pickable = choices.filter((o) => o === null || !taken(o));
  const keyOf = (o: EmployeeOption | null) => (o ? o.id : 'none');
  // A key not in this answer highlights nothing, so Enter can't silently swap the linked employee.
  const activeChoice = activeKey === null ? pickable[0] : pickable.find((o) => keyOf(o) === activeKey);
  const active = activeChoice === undefined ? -1 : pickable.indexOf(activeChoice);
  const optionId = (o: EmployeeOption | null) => `${listId}-${keyOf(o)}`;

  // When the linked employee's row shows up in the open list, bring it into the list's view (only
  // the list scrolls, not the page).
  const linkedId = value?.id ?? null;
  const linkedShown = open && linkedId !== null && activeChoice?.id === linkedId;
  useEffect(() => {
    if (!linkedShown || !linkedId) return;
    // After the popover's first frame: in the commit that mounts it the list can't scroll yet.
    const frame = requestAnimationFrame(() => {
      const list = listRef.current;
      const row = document.getElementById(`${listId}-${linkedId}`);
      if (!list || !row) return;
      const listBox = list.getBoundingClientRect();
      const rowBox = row.getBoundingClientRect();
      const offset = rowBox.top - listBox.top;
      if (offset < 0 || offset + rowBox.height > listBox.height) {
        list.scrollTop += offset - (listBox.height - rowBox.height) / 2;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [linkedShown, linkedId, listId]);

  function pick(o: EmployeeOption | null) {
    if (o && taken(o)) return;
    onChange(o ? { id: o.id, code: o.code, nameEn: o.nameEn, nameAr: o.nameAr, photoUrl: o.photoUrl, gender: o.gender } : null);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const current = active;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.max(0, Math.min(current + (e.key === 'ArrowDown' ? 1 : -1), pickable.length - 1));
      const target = pickable[next];
      if (target === undefined) return;
      setActiveKey(keyOf(target));
      document.getElementById(optionId(pickable[next] ?? null))?.scrollIntoView?.({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeChoice !== undefined) pick(activeChoice);
    }
  }

  const label = value ? `${localName(value, locale)} · ${value.code}` : null;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setQuery('');
          // Open on the linked employee (Enter keeps it); none linked, "Not linked" — the first row.
          setActiveKey(value ? value.id : null);
          load('', 0);
        }
      }}
    >
      <PopoverTrigger asChild disabled={disabled}>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cn(
            controlClasses,
            'flex h-11 cursor-pointer items-center gap-2.5 text-start',
            !value && 'text-muted-foreground/80',
          )}
        >
          <LinkedEmployeeIcon className="size-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{label ?? t('access.userForm.chooseEmployee')}</span>
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="flex w-(--radix-popover-trigger-width) min-w-72 flex-col gap-1.5 overflow-hidden p-1.5"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          searchRef.current?.focus();
        }}
      >
        <div className="relative shrink-0">
          <SearchIcon className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
          <input
            ref={searchRef}
            type="search"
            dir="auto"
            autoComplete="off"
            aria-label={t('access.userForm.searchEmployees')}
            aria-controls={listId}
            aria-activedescendant={activeChoice !== undefined ? optionId(activeChoice) : undefined}
            placeholder={t('access.userForm.searchEmployees')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveKey(null);
              load(e.target.value, DEBOUNCE_MS);
            }}
            onKeyDown={onKeyDown}
            className={cn(controlClasses, 'h-11 ps-9 text-start [&::-webkit-search-cancel-button]:appearance-none')}
          />
        </div>
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={t('access.userForm.employeeField')}
          aria-busy={state.loading || undefined}
          className={cn(
            'scrollbar-clean max-h-72 min-h-0 overflow-y-auto overscroll-contain transition-opacity duration-150',
            state.loading && state.rows.length > 0 && 'opacity-55',
          )}
        >
          {choices.map((o) => {
            if (o && state.loading && state.rows.length === 0) return null;
            const isTaken = o ? taken(o) : false;
            const selected = o ? value?.id === o.id : value === null;
            const isActive = activeChoice !== undefined && (o === null ? activeChoice === null : activeChoice?.id === o.id);
            return (
              <li
                key={o ? o.id : 'none'}
                id={optionId(o)}
                role="option"
                aria-selected={selected}
                aria-disabled={isTaken || undefined}
                data-active={isActive || undefined}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm select-none',
                  'data-[active]:bg-primary-soft',
                  selected && 'bg-primary-soft',
                  isTaken && 'cursor-not-allowed opacity-55',
                )}
              >
                {o ? (
                  <>
                    <PersonAvatar photoUrl={o.photoUrl} gender={o.gender} size="xs" muted={!o.isActive} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-bold">{localName(o, locale)}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        <bdi dir="ltr" className="tabular">
                          {o.code}
                        </bdi>
                        {' · '}
                        {localName(o.jobTitle, locale)}
                        {isTaken ? ` · ${t('access.userForm.alreadyLinked')}` : ''}
                        {!o.isActive ? ` · ${t('access.userForm.inactiveEmployee')}` : ''}
                      </span>
                    </span>
                  </>
                ) : (
                  <span className="flex-1 ps-1 text-muted-foreground">{t('access.userForm.noEmployee')}</span>
                )}
                {selected ? <CheckIcon className="size-4 shrink-0 text-primary" /> : null}
              </li>
            );
          })}
          {state.loading && state.rows.length === 0
            ? Array.from({ length: 3 }, (_, i) => (
                <li key={`s-${i}`} role="presentation" className="flex min-h-11 items-center gap-2.5 px-2.5 py-1.5">
                  <Skeleton className="size-7 rounded-lg" />
                  <Skeleton className="h-3.5 w-36" />
                </li>
              ))
            : null}
        </ul>
        <p role="status" className="border-t border-border px-2.5 pt-2 pb-1 text-xs text-muted-foreground">
          {state.failed
            ? t('access.userForm.employeesLoadFailed')
            : state.loading && state.rows.length === 0
              ? t('ui.states.loading')
              : t('access.userForm.employeesMatch', {
                  count: formatCount(state.total),
                  shown: formatCount(state.rows.length),
                })}
        </p>
      </PopoverContent>
    </Popover>
  );
}
