import { LogIn, RefreshCcw } from 'lucide-react';

interface AuthPromptCardProps {
  loginUrl: string;
  authError?: string | null;
  onRefresh: () => void;
}

export default function AuthPromptCard({ loginUrl, authError, onRefresh }: AuthPromptCardProps) {
  return (
    <section className="panel border-warning/40 bg-warning/10">
      <div className="panel-header">
        <div>
          <p className="kicker text-warning">需要登录</p>
          <h2 className="text-lg font-semibold text-ink">请先完成 IDaaS 登录</h2>
          <p className="mt-1 text-sm text-ink-muted">
            登录后普通用户仍可只读访问，写操作仅对模块管理员和超级管理员开放。
          </p>
        </div>
      </div>
      {authError ? <p className="mt-3 text-sm text-danger">{authError}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <a href={loginUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
          <LogIn className="h-4 w-4" />
          前往登录
        </a>
        <button className="btn btn-ghost" onClick={onRefresh} type="button">
          <RefreshCcw className="h-4 w-4" />
          重新检测
        </button>
      </div>
    </section>
  );
}
