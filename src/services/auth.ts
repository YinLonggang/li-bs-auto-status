import { API_BASE_URL, AUTH_PREFIX, LOGIN_URL } from '../config';
import type { UserProfile, UserRole } from '../types';

type RawProfile = {
  user?: Record<string, unknown>;
  permissions?: {
    is_super_admin?: boolean;
    is_admin?: boolean;
    admin_modules?: string[];
    module_admin?: Record<string, boolean>;
    can_write?: boolean;
  };
  data?: unknown;
  message?: string;
  login_url?: string;
} & Record<string, unknown>;

export class AuthError extends Error {
  status: number;
  loginUrl: string;

  constructor(message: string, status: number, loginUrl = LOGIN_URL) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.loginUrl = loginUrl;
  }
}

const MODULE_SLUGS = [
  'li_bs_auto_status',
  'li-bs-auto-status',
  'bs_auto_status',
  'li_sicar_bs_auto_status'
];

const asString = (value: unknown) => (typeof value === 'string' ? value : '');

const getDataObject = (raw: RawProfile): RawProfile => {
  if (raw.data && typeof raw.data === 'object') return raw.data as RawProfile;
  return raw;
};

export const normalizeUserProfile = (rawInput: RawProfile): UserProfile => {
  const raw = getDataObject(rawInput);
  const user = (raw.user && typeof raw.user === 'object' ? raw.user : raw) as Record<string, unknown>;
  const permissions = raw.permissions ?? {};
  const adminModules =
    permissions.admin_modules ??
    ((raw.admin_modules || raw.permissions) as string[] | undefined) ??
    [];
  const moduleAdmin = permissions.module_admin ?? ((raw.module_admin || {}) as Record<string, boolean>);
  const normalizedPermission = asString(raw.permission || raw.role || user.role).toLowerCase();
  const isSuper =
    !!permissions.is_super_admin ||
    !!raw.is_super_admin ||
    normalizedPermission === 'super_admin';
  const isModuleAdmin =
    isSuper ||
    !!permissions.is_admin ||
    !!raw.is_module_admin ||
    !!permissions.can_write ||
    !!raw.can_write_bs_auto_status ||
    MODULE_SLUGS.some(slug => moduleAdmin[slug] || adminModules.includes(slug)) ||
    normalizedPermission === 'module_admin';
  const role: UserRole = isSuper ? 'super_admin' : isModuleAdmin ? 'module_admin' : 'viewer';
  const displayName =
    asString(user.display_name) ||
    asString(user.name) ||
    asString(user.username) ||
    asString(user.user_id) ||
    asString(user.email) ||
    '只读用户';

  return {
    userId:
      asString(user.user_id) ||
      asString(user.id) ||
      asString(user.username) ||
      asString(user.email) ||
      'unknown',
    displayName,
    email: asString(user.email),
    avatarUrl: asString(user.avatar_url) || asString(user.avatar) || asString(user.picture),
    role,
    permissionLabel:
      role === 'super_admin' ? '超级管理员' : role === 'module_admin' ? '模块管理员' : '只读用户',
    canWrite: role === 'super_admin' || role === 'module_admin',
    adminModules
  };
};

export async function fetchUserProfile(): Promise<UserProfile | null> {
  const response = await fetch(`${API_BASE_URL}${AUTH_PREFIX}/user-profile/`, {
    credentials: 'include',
    headers: { Accept: 'application/json' }
  });

  if (response.status === 401) return null;

  const payload = (await response.json().catch(() => null)) as RawProfile | null;
  if (!response.ok) {
    const loginUrl = asString(payload?.login_url) || LOGIN_URL;
    const message =
      response.status === 403
        ? '已登录但缺少模块写权限，页面将以只读模式展示。'
        : asString(payload?.message) || `授权检查失败：${response.status}`;
    throw new AuthError(message, response.status, loginUrl);
  }

  return normalizeUserProfile(payload ?? {});
}
