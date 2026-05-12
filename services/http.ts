import { API_BASE_URL, API_PREFIX } from '../config';

export class ApiError extends Error {
  status: number;
  details: unknown;
  requestId?: string | null;

  constructor(message: string, status: number, details?: unknown, requestId?: string | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }
}

const toHeaderRecord = (headers?: HeadersInit): Record<string, string> => {
  const record: Record<string, string> = {};
  if (!headers) return record;
  new Headers(headers).forEach((value, key) => {
    record[key] = value;
  });
  return record;
};

const hasHeader = (headers: Record<string, string>, name: string) =>
  Object.keys(headers).some(key => key.toLowerCase() === name.toLowerCase());

const getCsrfToken = () => {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

const mutates = (method?: string) =>
  !!method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());

const buildHeaders = (headers?: HeadersInit, method?: string): HeadersInit => {
  const explicit = toHeaderRecord(headers);
  const next: Record<string, string> = { Accept: 'application/json' };

  if (method && !['GET', 'HEAD'].includes(method.toUpperCase())) {
    next['Content-Type'] = 'application/json';
  }

  const csrf = mutates(method) ? getCsrfToken() : null;
  if (csrf && !hasHeader(explicit, 'X-CSRFToken')) {
    next['X-CSRFToken'] = csrf;
  }

  return { ...next, ...explicit };
};

const parseBody = async (response: Response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

const messageFrom = (payload: unknown, fallback: string) => {
  if (!payload) return fallback;
  if (typeof payload === 'string') return payload;
  if (typeof payload === 'object') {
    const value = payload as Record<string, unknown>;
    return (
      [value.message, value.detail, value.error]
        .find(item => typeof item === 'string' && item.trim())
        ?.toString() ?? fallback
    );
  }
  return fallback;
};

export async function requestWithPrefix<T>(
  prefix: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const { headers, method = 'GET', ...rest } = init;
  const response = await fetch(`${API_BASE_URL}${prefix}${path}`, {
    credentials: 'include',
    method,
    headers: buildHeaders(headers, method),
    ...rest
  });
  const payload = await parseBody(response);
  const requestId = response.headers.get('x-request-id') || response.headers.get('X-Request-Id');

  if (!response.ok) {
    const fallback = response.status === 403 ? '当前账号没有写权限。' : `请求失败：${response.status}`;
    throw new ApiError(messageFrom(payload, fallback), response.status, payload, requestId);
  }

  return payload as T;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return requestWithPrefix<T>(API_PREFIX, path, init);
}
