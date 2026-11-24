'use client';

import type { ListItem, ListStagesQuery, NamedRef } from '@school-erp/shared';
import type { ComboboxOption, ServerOptions } from '@/shared/components/ui/combobox';
import { PICKER_PAGE, useServerOptions } from '@/shared/hooks/use-server-options';
import type { ApiResult } from '@/lib/types';
import { localName, type Locale } from '@/shared/lib/i18n';

/** A department, stage or job title as a picker's choice: its name in the page's language. */
export function listItemOption(item: NamedRef, locale: Locale): ComboboxOption {
  return { value: item.id, label: localName(item, locale) };
}

/**
 * A department / stage / job title picker whose choices the API searches (`GET_DEPARTMENTS`,
 * `GET_STAGES`, `GET_JOB_TITLES`: one page of `PICKER_PAGE` for the typed name). `selected` is the
 * chosen item, so its name shows before any answer holds it; `includeHidden` for filters (a hidden
 * item can still have employees); `excludeIds` (stages only) leaves out items already chosen
 * elsewhere — the API drops them, and the next search (opening the picker) uses the latest list.
 */
export function useListItemOptions<T extends ListItem>(
  load: (query: ListStagesQuery) => Promise<ApiResult<T[]>>,
  locale: Locale,
  {
    includeHidden = false,
    selected,
    excludeIds,
  }: { includeHidden?: boolean; selected?: NamedRef | null; excludeIds?: string[] } = {},
): ServerOptions {
  return useServerOptions<T>({
    load: (search) =>
      load({ includeHidden, search, limit: PICKER_PAGE, ...(excludeIds?.length ? { excludeIds } : {}) }),
    toOption: (item) => listItemOption(item, locale),
    selected: selected ? listItemOption(selected, locale) : null,
  });
}
