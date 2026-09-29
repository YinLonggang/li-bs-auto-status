import { apiRequest } from './http';
import type { ListQuery, PageResult } from '../types';

export const listUrl = (path: string, query: ListQuery = {}) => {
  const [pathname, search = ''] = path.split('?');
  const params = new URLSearchParams(search);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  return `${pathname}${params.size ? `?${params}` : ''}`;
};

export function parsePage<T>(payload: unknown, normalize: (value: unknown) => T): PageResult<T> {
  if (Array.isArray(payload)) return { count: payload.length, next: null, previous: null, results: payload.map(normalize) };
  if (!payload || typeof payload !== 'object') throw new Error('列表响应格式无效。');
  const record = payload as Record<string, unknown>;
  if (record.data !== undefined) return parsePage(record.data, normalize);
  const rows = record.results ?? record.items;
  if (!Array.isArray(rows)) throw new Error('列表响应缺少 results。');
  return {
    count: typeof record.count === 'number' ? record.count : rows.length,
    next: typeof record.next === 'string' ? record.next : null,
    previous: typeof record.previous === 'string' ? record.previous : null,
    results: rows.map(normalize)
  };
}

export async function requestPage<T>(path: string, query: ListQuery, normalize: (value: unknown) => T, signal?: AbortSignal) {
  return parsePage(await apiRequest(listUrl(path, query), { signal }), normalize);
}

// Complete directories are needed by selectors and template-wide operations, not paginated business tables.
export async function requestDirectory<T>(
  path: string,
  normalize: (value: unknown) => T,
  request: (path: string) => Promise<unknown> = apiRequest
): Promise<T[]> {
  const items: T[] = [];
  const seen = new Set<string>();
  for (let page = 1; ; page += 1) {
    const result = parsePage(await request(listUrl(path, { page, page_size: 200 })), normalize);
    items.push(...result.results);
    if (!result.next) {
      if (items.length < result.count) throw new Error('目录数据不完整，请刷新重试。');
      return items;
    }
    if (!result.results.length || seen.has(result.next)) throw new Error('目录分页未前进，请刷新重试。');
    seen.add(result.next);
  }
}
