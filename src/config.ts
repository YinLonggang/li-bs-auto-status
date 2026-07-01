const trimTrailingSlash = (value?: string | null) => (value ? value.replace(/\/+$/, '') : '');

const firstNonEmpty = (...values: Array<string | undefined>) =>
  values.map(value => trimTrailingSlash(value)).find(Boolean) || '';

export const API_BASE_URL = firstNonEmpty(
  import.meta.env.VITE_BASE_API,
  import.meta.env.VITE_API_BASE,
  import.meta.env.VITE_API_BASE_URL
);
export const AUTH_PREFIX = '/api/auth';
export const API_PREFIX = '/api/li-bs-auto-status/v1';
export const BASE_CONFIG_PREFIX = '/api/v1/base';

const loginOverride = firstNonEmpty(import.meta.env.VITE_LOGIN_URL);
export const LOGIN_URL = loginOverride || `${API_BASE_URL || ''}/login/`;

export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'li-sicar-bs-auto-status-sidebar-collapsed';
