import type { UserProfile } from './types';

/**
 * Zeus SDK Web 端封装（内网版）。
 *
 * - 内网部署必须走 `cdn.chehejia.com` 并设置 `intranetOnly: true`。
 * - `basic` 插件自动加载，不写入 `plugins`。
 * - 车间环境默认关闭 Clarity 行为采集（`track: false`）。
 * - 手动 PV 请使用 `zeusView()`，不要使用已废弃的 `pv()`。
 */
const ZEUS_APP_ID = 'li-bs-auto-status';
const ZEUS_MODULE = 'bs-auto-status';

type ZeusInitOptions = {
  appid: string;
  env: 'prod' | 'test';
  intranetOnly?: boolean;
  spa?: boolean;
  plugins?: string[];
  track?: boolean | Record<string, unknown>;
  heartbeat?: boolean | number;
  uvKey?: string | (() => string);
  liUsername?: string;
  liOpenId?: string;
  module?: string;
  context?: Record<string, unknown>;
};

type ZeusInstance = {
  collect: (key: string, payload?: Record<string, unknown>) => void;
  view: (pageId?: string) => void;
  destroy: () => void;
};

declare global {
  interface Window {
    ZEUS?: new (options: ZeusInitOptions) => ZeusInstance;
  }
}

let zeus: ZeusInstance | undefined;
let zeusIdentity: string | undefined;

const resolveZeusEnv = (): 'prod' | 'test' => {
  const env = (
    import.meta.env.VITE_API_ENV ||
    import.meta.env.MODE ||
    'development'
  ).toLowerCase();
  return env === 'production' ? 'prod' : 'test';
};

/** 清理当前用户的 Zeus 实例；SDK 异常不得阻断退出或身份切换。 */
export function destroyZeus(): void {
  const current = zeus;
  zeus = undefined;
  zeusIdentity = undefined;
  try {
    current?.destroy();
  } catch {
    // 可观测性是旁路能力，SDK 清理异常不得打断退出和业务状态切换。
  }
}

/** 在用户身份可取后调用；同一身份复用，身份变化时销毁旧实例后重建。 */
export function initZeus(user: UserProfile | null | undefined): void {
  const userId = user?.userId;
  if (!userId || userId === 'unknown' || userId === 'readonly') {
    destroyZeus();
    return;
  }
  const nextIdentity = String(userId);
  if (zeus && zeusIdentity === nextIdentity) return;
  destroyZeus();
  if (!window.ZEUS) return;
  try {
    zeus = new window.ZEUS({
      appid: ZEUS_APP_ID,
      env: resolveZeusEnv(),
      intranetOnly: true,
      spa: true,
      plugins: ['error', 'performance'],
      track: false,
      heartbeat: 60000,
      uvKey: () => nextIdentity,
      liUsername: user?.ldapName ?? '',
      liOpenId: nextIdentity,
      module: ZEUS_MODULE,
      context: { tenant: 'li-sicar', module: ZEUS_MODULE },
    });
    zeusIdentity = nextIdentity;
  } catch {
    // 可观测性是旁路能力，SDK 初始化异常不得打断登录和业务启动。
    zeus = undefined;
    zeusIdentity = undefined;
  }
}

/** 手动 PV（SPA 内关键视图切换时使用）。 */
export function zeusView(pageId?: string): void {
  zeus?.view(pageId);
}

/** 自定义埋点。key 建议以埋点名作前缀，如 `cm_import_success`。 */
export function zeusCollect(
  key: string,
  payload?: Record<string, unknown>,
): void {
  zeus?.collect(key, payload);
}
