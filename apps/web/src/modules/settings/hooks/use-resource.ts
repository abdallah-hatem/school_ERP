'use client';

import type { Meta } from '@school-erp/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { callApi } from '@/lib/callApi';
import type { ApiResult } from '@/lib/types';

interface ResourceState<T> {
  data: T | undefined;
  meta: Meta | undefined;
  failed: boolean;
  /** The `key` the data on screen belongs to. */
  key: string | null;
}

/**
 * Loads one endpoint for a section and keeps it in state. `key` names what is loaded (e.g. the
 * history page): a new key refetches while the previous data stays on screen, dimmed
 * (`refreshing`). Mutations update the data in place with `setData`.
 */
export function useResource<T>(key: string, load: () => Promise<ApiResult<T>>) {
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const [state, setState] = useState<ResourceState<T>>({ data: undefined, meta: undefined, failed: false, key: null });
  const [retrying, setRetrying] = useState(false);

  const fetchNow = useCallback(async () => {
    const res = await callApi(loadRef.current(), { showErrorToast: false });
    if (res.unauthorized) return;
    if (res.success) {
      setState({ data: res.data as T, meta: res.meta, failed: false, key });
    } else {
      setState((s) => ({ ...s, failed: true, key }));
    }
    setRetrying(false);
  }, [key]);

  useEffect(() => {
    void fetchNow();
  }, [fetchNow]);

  const retry = useCallback(() => {
    setRetrying(true);
    void fetchNow();
  }, [fetchNow]);

  const setData = useCallback((update: (data: T) => T) => {
    setState((s) => (s.data === undefined ? s : { ...s, data: update(s.data) }));
  }, []);

  return {
    data: state.data,
    meta: state.meta,
    /** First load, nothing on screen yet. */
    loading: state.key === null && !state.failed,
    /** A new key is loading while the previous data stays on screen. */
    refreshing: state.key !== null && state.key !== key && !state.failed,
    error: state.failed,
    retrying,
    retry,
    setData,
  };
}
