import type { UserProfile } from '../types';

interface UserProfileCardProps {
  profile?: UserProfile | null;
  desktopCompact?: boolean;
  warning?: string | null;
}

const roleClass: Record<UserProfile['role'] | 'anonymous', string> = {
  super_admin: 'border-success/40 bg-success/10 text-success',
  module_admin: 'border-primary/40 bg-primary/10 text-primary',
  viewer: 'border-outline bg-surface-strong text-ink-muted',
  anonymous: 'border-outline bg-surface-strong text-ink-muted'
};

export default function UserProfileCard({
  profile,
  desktopCompact = false,
  warning
}: UserProfileCardProps) {
  const displayName = profile?.displayName || '未登录';
  const subline = warning || profile?.email || profile?.userId || '只读入口';
  const role = profile?.role ?? 'anonymous';

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border border-outline bg-surface-soft p-3 ${
        desktopCompact ? 'lg:justify-center lg:p-2' : ''
      }`}
      title={desktopCompact ? `${displayName} · ${profile?.permissionLabel ?? '未登录'}` : undefined}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-outline bg-surface-strong">
        {profile?.avatarUrl ? (
          <img src={profile.avatarUrl} alt={displayName} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs font-semibold text-ink-muted">ID</span>
        )}
      </div>
      <div className={`min-w-0 flex-1 ${desktopCompact ? 'lg:sr-only' : ''}`}>
        <div className="truncate text-sm font-semibold text-ink">{displayName}</div>
        <div className="truncate text-xs text-ink-muted">{subline}</div>
      </div>
      <span
        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
          roleClass[role]
        } ${desktopCompact ? 'lg:sr-only' : ''}`}
      >
        {profile?.permissionLabel ?? '未登录'}
      </span>
    </div>
  );
}
