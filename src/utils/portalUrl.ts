type AppEnv = 'development' | 'ontest' | 'production' | string;

const ENV_PORTAL_URLS: Record<string, string> = {
  development: 'http://127.0.0.1:8000',
  ontest: 'https://li-sicar-ontest.inner.chj.cloud',
  production: 'https://li-sicar.inner.chj.cloud',
};

const trimTrailingSlash = (value?: string | null) => {
  if (!value) return '';
  return value.replace(/\/+$/, '');
};

const getEnv = (): Record<string, string | undefined> => {
  try {
    return typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
  } catch {
    return {};
  }
};

export const APP_ENV: AppEnv =
  (getEnv().VITE_APP_ENV || getEnv().VITE_API_ENV || getEnv().MODE || 'development') as AppEnv;

const derivePortalFromSpaOrigin = (): string => {
  try {
    if (typeof window === 'undefined' || !window.location?.origin) return '';
    const url = new URL(window.location.origin);
    const hostname = url.hostname;
    const spaDashPrefix = /^li-sicar-[a-z0-9-]+(-ontest)?-/;
    const spaDotPrefix = /^li-sicar-[a-z0-9-]+(-ontest)?\./;
    if (spaDashPrefix.test(hostname)) {
      url.hostname = hostname.replace(/^li-sicar-[a-z0-9-]+(-ontest)?-/, 'li-sicar$1.');
      return trimTrailingSlash(url.origin);
    }
    if (spaDotPrefix.test(hostname)) {
      url.hostname = hostname.replace(/^li-sicar-[a-z0-9-]+(-ontest)?\./, 'li-sicar$1.');
      return trimTrailingSlash(url.origin);
    }
  } catch {
    return '';
  }
  return '';
};

export const resolvePortalUrl = (): string => {
  const env = getEnv();
  const override = trimTrailingSlash(
    env.VITE_PORTAL_URL || env.VITE_LI_SICAR_HOME_URL || env.VITE_LI_SICAR_BASE_URL
  );
  if (override) return override;
  const derived = derivePortalFromSpaOrigin();
  if (derived) return derived;
  return ENV_PORTAL_URLS[APP_ENV] ?? ENV_PORTAL_URLS.development;
};

export const resolveLoginUrl = (redirect?: string): string => {
  const env = getEnv();
  const override = trimTrailingSlash(env.VITE_LOGIN_URL || env.VITE_LOGIN_BASE);
  const base = override || resolvePortalUrl();
  if (!base) return '';
  try {
    const current =
      redirect ||
      (typeof window !== 'undefined' && window.location?.href ? window.location.href : '');
    const url = new URL(base.includes('/login') ? base : `${base}/login/`, window.location.origin);
    if (current && !url.searchParams.has('redirect') && !url.searchParams.has('next')) {
      url.searchParams.set('redirect', current);
    }
    return url.toString();
  } catch {
    return base;
  }
};
