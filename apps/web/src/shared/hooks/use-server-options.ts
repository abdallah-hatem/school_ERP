'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComboboxGroup, ComboboxOption, ServerOptions } from '@/shared/components/ui/combobox';
import { callApi } from '@/lib/callApi';
import type { ApiResult } from '@/lib/types';
import { formatCount } from '@/shared/lib/format';
import { useTranslation } from '@/shared/providers/i18n-provider';

/** How long typing pauses before the API is asked. */
export const PICKER_DEBOUNCE_MS = 250;
/** How many options one answer holds (the person types to narrow beyond it). */
export const PICKER_PAGE = 20;

/**
 * A picker whose options the API searches (owner, 2026-11-21: never the browser). `load(search)`
 * asks one page (`PICKER_PAGE`) for the typed text — on opening, then after each pause in typing;
 * only the latest answer is kept. `toOption` (or `toGroups`, for options under headings) turns the
 * answer into choices; `selected` is the chosen record's option, so the trigger names it before
 * any answer holds it. Pass the result to `Combobox` / `SelectField` / `FilterSelect` as `server`.
 */
export function useServerOptions<T>({
  load,
  toOption,
  toGroups,
  selected,
}: {
  load: (search: string) => Promise<ApiResult<T[]>>;
  toOption?: (item: T) => ComboboxOption;
  toGroups?: (items: T[]) => ComboboxGroup[];
  selected?: ComboboxOption | null;
}): ServerOptions {
  const { t } = useTranslation();
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  const [state, setState] = useState<{ items: T[]; total: number; loading: boolean; failed: boolean }>({
    items: [],
    total: 0,
    loading: false,
    failed: false,
  });
  const request = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onQueryChange = useCallback((query: string) => {
    const n = ++request.current;
    setState((s) => ({ ...s, loading: true, failed: false }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => {
        timer.current = null;
        void callApi(loadRef.current(query.trim()), { showErrorToast: false }).then((res) => {
          if (n !== request.current || res.unauthorized) return;
          if (res.success) {
            const items = Array.isArray(res.data) ? res.data : [];
            setState({ items, total: res.meta?.total ?? items.length, loading: false, failed: false });
          } else setState({ items: [], total: 0, loading: false, failed: true });
        });
      },
      // Opening asks at once; typing waits for a pause.
      query === '' ? 0 : PICKER_DEBOUNCE_MS,
    );
  }, []);

  const options = toGroups || !toOption ? [] : state.items.map(toOption);
  const groups = toGroups ? toGroups(state.items) : undefined;
  return {
    options,
    groups,
    onQueryChange,
    loading: state.loading,
    failed: state.failed,
    selected: selected ?? null,
    more:
      state.total > state.items.length
        ? t('ui.form.moreOptions', { shown: formatCount(state.items.length), total: formatCount(state.total) })
        : null,
  };
}
