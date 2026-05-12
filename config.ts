const trimTrailingSlash = (value?: string | null) => (value ? value.replace(/\/+$/, '') : '');

export const API_BASE_URL = trimTrailingSlash(import.meta.env.VITE_API_BASE_URL);
export const AUTH_PREFIX = '/api/auth';
export const API_PREFIX = '/api/li-bs-auto-status/v1';
export const BASE_CONFIG_PREFIX = '/api/v1/base';

const loginOverride = trimTrailingSlash(import.meta.env.VITE_LOGIN_URL);
export const LOGIN_URL = loginOverride || `${API_BASE_URL || ''}/login/`;

export const ENABLE_MOCKS =
  import.meta.env.DEV &&
  import.meta.env.VITE_ENABLE_MOCKS !== 'false' &&
  import.meta.env.VITE_ENABLE_MOCKS !== '0';

export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'li-sicar-bs-auto-status-sidebar-collapsed';
