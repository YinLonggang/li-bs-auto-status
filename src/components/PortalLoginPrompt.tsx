import React, { useCallback, useState } from 'react';
import { Copy, ExternalLink, Loader2, LogIn, RefreshCw } from 'lucide-react';
import './PortalLoginPrompt.css';

export const PORTAL_LOGIN_COPY = {
  title: '需要登录',
  description:
    '你尚未登录 Li-Sicar，无法访问此应用。请前往 Li-Sicar 门户网站完成登录，成功后返回本页并点击「重新检测」。',
  portalLabel: 'Li-Sicar 门户地址',
  primaryCta: '前往 Li-Sicar 门户登录',
  secondaryCta: '已登录，重新检测',
  loading: '正在检查登录状态…',
  copy: '复制地址',
  copied: '已复制',
  steps: [
    '打开上方 Li-Sicar 门户',
    '使用公司账号完成登录',
    '返回本页，点击「重新检测」',
  ],
} as const;

export interface PortalLoginPromptProps {
  portalUrl: string;
  loginUrl: string;
  envLabel?: string;
  appBadge?: string;
  requestId?: string;
  loading?: boolean;
  title?: string;
  description?: string;
  errorMessage?: string | null;
  onRefresh: () => void;
  footerHint?: React.ReactNode;
}

const PortalLoginPrompt: React.FC<PortalLoginPromptProps> = ({
  portalUrl,
  loginUrl,
  envLabel,
  appBadge,
  requestId,
  loading = false,
  title = PORTAL_LOGIN_COPY.title,
  description = PORTAL_LOGIN_COPY.description,
  errorMessage,
  onRefresh,
  footerHint,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!portalUrl) return;
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be unavailable */
    }
  }, [portalUrl]);

  return (
    <div className="li-portal-login" role="alert" aria-live="polite">
      <div className="li-portal-login__card">
        <div className="li-portal-login__header">
          <div className="li-portal-login__icon">
            {loading ? (
              <Loader2 className="li-portal-login__spin" size={24} aria-hidden />
            ) : (
              <LogIn size={24} aria-hidden />
            )}
          </div>
          {appBadge ? <span className="li-portal-login__badge">{appBadge}</span> : null}
        </div>

        <div className="li-portal-login__title-row">
          <h1 className="li-portal-login__title">{title}</h1>
          {envLabel ? <span className="li-portal-login__env">{envLabel}</span> : null}
        </div>

        <p className="li-portal-login__description">
          {loading ? PORTAL_LOGIN_COPY.loading : description}
        </p>

        {errorMessage ? <p className="li-portal-login__error">{errorMessage}</p> : null}

        {!loading ? (
          <>
            <div className="li-portal-login__url-box">
              <p className="li-portal-login__url-label">{PORTAL_LOGIN_COPY.portalLabel}</p>
              <div className="li-portal-login__url-row">
                <code className="li-portal-login__url">{portalUrl}</code>
                <button type="button" onClick={() => void handleCopy()} className="li-portal-login__copy">
                  <Copy size={14} aria-hidden />
                  {copied ? PORTAL_LOGIN_COPY.copied : PORTAL_LOGIN_COPY.copy}
                </button>
              </div>
            </div>

            <ol className="li-portal-login__steps">
              {PORTAL_LOGIN_COPY.steps.map((step, index) => (
                <li key={step} className="li-portal-login__step">
                  <span className="li-portal-login__step-index">{index + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>

            <div className="li-portal-login__actions">
              <a
                href={loginUrl}
                target="_blank"
                rel="noreferrer"
                className="li-portal-login__primary"
              >
                <ExternalLink size={16} aria-hidden />
                {PORTAL_LOGIN_COPY.primaryCta}
              </a>
              <button type="button" onClick={onRefresh} className="li-portal-login__secondary">
                <RefreshCw size={16} aria-hidden />
                {PORTAL_LOGIN_COPY.secondaryCta}
              </button>
            </div>
          </>
        ) : (
          <div className="li-portal-login__actions">
            <button type="button" onClick={onRefresh} className="li-portal-login__secondary">
              <RefreshCw size={16} aria-hidden />
              刷新
            </button>
          </div>
        )}

        {footerHint ? <div className="li-portal-login__footer">{footerHint}</div> : null}
        {requestId ? <p className="li-portal-login__meta">request_id: {requestId}</p> : null}
      </div>
    </div>
  );
};

export default PortalLoginPrompt;
