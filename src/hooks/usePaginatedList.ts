import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../services/http';
import type { ListQuery, PageResult } from '../types';

export function usePaginatedList<T>(
  load: (query: ListQuery, signal?: AbortSignal) => Promise<PageResult<T>>,
  filters: ListQuery,
  enabled = true
) {
  const filterKey = JSON.stringify(filters);
  const [cursor, setCursor] = useState({ key: filterKey, page: 1, pageSize: 20 });
  const page = cursor.key === filterKey ? cursor.page : 1;
  const pageSize = cursor.pageSize;
  const queryKey = JSON.stringify([filterKey, page, pageSize, enabled]);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; data: PageResult<T> | null; loading: boolean; error: string }>({ key: '', data: null, loading: false, error: '' });
  const requestId = useRef(0);
  useEffect(() => {
    setCursor(current => current.key === filterKey ? current : { ...current, key: filterKey, page: 1 });
    const id = ++requestId.current;
    const controller = new AbortController();
    if (!enabled) {
      setState({ key: queryKey, data: null, loading: false, error: '' });
      return () => controller.abort();
    }
    setState(current => ({ key: queryKey, data: current.key === queryKey ? current.data : null, loading: true, error: '' }));
    load({ ...JSON.parse(filterKey), page, page_size: pageSize }, controller.signal)
      .then(data => {
        if (id !== requestId.current || controller.signal.aborted) return;
        const lastPage = Math.max(1, Math.ceil(data.count / pageSize));
        if (page > lastPage) setCursor({ key: filterKey, page: lastPage, pageSize });
        else setState({ key: queryKey, data, loading: false, error: '' });
      })
      .catch(error => {
        if (id !== requestId.current || controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 404 && page > 1) {
          setCursor({ key: filterKey, page: page - 1, pageSize });
          return;
        }
        setState(current => ({ ...current, loading: false, error: error instanceof Error ? error.message : '列表加载失败。' }));
      });
    return () => controller.abort();
  }, [load, filterKey, page, pageSize, enabled, revision]);

  return {
    data: state.key === queryKey ? state.data : null,
    loading: enabled && (state.key !== queryKey || state.loading),
    error: state.key === queryKey ? state.error : '',
    page,
    pageSize,
    setPage: (value: number) => setCursor({ key: filterKey, page: Math.max(1, value), pageSize }),
    setPageSize: (value: number) => setCursor({ key: filterKey, page: 1, pageSize: value }),
    refresh: useCallback(() => setRevision(value => value + 1), [])
  };
}
