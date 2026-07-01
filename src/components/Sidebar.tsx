import {
  BarChart3,
  CalendarClock,
  ClipboardCheck,
  Download,
  FileWarning,
  LayoutDashboard,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  SlidersHorizontal,
  Sun,
  X
} from 'lucide-react';
import UserProfileCard from './UserProfileCard';
import type { ThemeMode } from '../hooks/useTheme';
import type { UserProfile } from '../types';

export type AppTab =
  | 'dashboard'
  | 'projects'
  | 'baseConfig'
  | 'phases'
  | 'timeline'
  | 'checks'
  | 'issues'
  | 'collision'
  | 'reports'
  | 'templates'
  | 'settings';

export type SidebarMenuItem<TView extends string = AppTab> = {
  id: TView;
  label: string;
  description: string;
  icon: typeof LayoutDashboard;
};

export const MENU_ITEMS: SidebarMenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', description: '项目状态驾驶舱', icon: LayoutDashboard },
  { id: 'timeline', label: '阶段进度', description: '时间线与打卡', icon: CalendarClock },
  { id: 'checks', label: '检查项', description: '甘特与表格', icon: ClipboardCheck },
  { id: 'issues', label: '重点问题', description: '风险闭环', icon: FileWarning },
  { id: 'collision', label: '碰撞一页纸', description: '制造评审材料', icon: BarChart3 },
  { id: 'reports', label: '报告导出', description: '报表与任务', icon: Download },
  { id: 'templates', label: '项目模板', description: '项目模板源数据', icon: SlidersHorizontal },
  { id: 'baseConfig', label: '配置中心', description: '项目实例与基础数据', icon: SlidersHorizontal }
];

interface SidebarProps {
  currentView: AppTab;
  onChangeView: (view: AppTab) => void;
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile | null;
  warning?: string | null;
  theme: ThemeMode;
  onToggleTheme: () => void;
  isDesktopCollapsed: boolean;
  onToggleDesktopCollapsed: () => void;
}

export default function Sidebar({
  currentView,
  onChangeView,
  isOpen,
  onClose,
  profile,
  warning,
  theme,
  onToggleTheme,
  isDesktopCollapsed,
  onToggleDesktopCollapsed
}: SidebarProps) {
  const collapseLabel = isDesktopCollapsed ? '展开侧边栏' : '收起侧边栏';

  return (
    <aside
      className={`fixed left-0 top-0 z-40 flex h-dvh w-72 flex-col border-r border-outline bg-surface shadow-card transition-[transform,width] duration-200 lg:translate-x-0 ${
        isDesktopCollapsed ? 'lg:w-20' : 'lg:w-72'
      } ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
    >
      <div
        className={`flex items-center border-b border-outline px-4 py-4 ${
          isDesktopCollapsed ? 'lg:justify-center lg:px-3' : 'justify-between'
        }`}
      >
        <div className={isDesktopCollapsed ? 'lg:sr-only' : undefined}>
          <div className="text-[11px] font-semibold uppercase text-ink-muted">LI-SICAR</div>
          <div className="text-base font-semibold text-ink">焊装 Auto Status</div>
          <div className="text-xs text-ink-muted">设备检查流程管理</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-ghost hidden h-10 w-10 justify-center p-0 lg:inline-flex"
            onClick={onToggleDesktopCollapsed}
            aria-label={collapseLabel}
            title={collapseLabel}
            type="button"
          >
            {isDesktopCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
          <button
            className="btn btn-ghost h-10 w-10 justify-center p-0 lg:hidden"
            onClick={onClose}
            aria-label="关闭侧边栏"
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <nav className={`flex-1 space-y-2 overflow-y-auto py-4 ${isDesktopCollapsed ? 'px-3' : 'px-4'}`}>
        {MENU_ITEMS.map(item => {
          const Icon = item.icon;
          const active = currentView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                active
                  ? 'border-primary/50 bg-primary/10 text-ink'
                  : 'border-transparent text-ink-muted hover:border-outline hover:bg-surface-soft hover:text-ink'
              } ${isDesktopCollapsed ? 'lg:px-2' : ''}`}
              aria-current={active ? 'page' : undefined}
              title={item.label}
              onClick={() => {
                onChangeView(item.id);
                onClose();
              }}
            >
              <span className={`flex items-center ${isDesktopCollapsed ? 'gap-3 lg:justify-center lg:gap-0' : 'gap-3'}`}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-strong">
                  <Icon className="h-4 w-4" />
                </span>
                <span className={isDesktopCollapsed ? 'lg:sr-only' : undefined}>
                  <span className="block text-sm font-semibold">{item.label}</span>
                  <span className="block text-xs text-ink-muted">{item.description}</span>
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className={`space-y-3 border-t border-outline p-4 ${isDesktopCollapsed ? 'lg:px-3' : ''}`}>
        <UserProfileCard profile={profile} warning={warning} desktopCompact={isDesktopCollapsed} />
        <button
          className={`btn btn-ghost w-full ${isDesktopCollapsed ? 'lg:justify-center lg:px-2' : ''}`}
          onClick={onToggleTheme}
          type="button"
          aria-label={theme === 'dark' ? '切换浅色主题' : '切换深色主题'}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          <span className={isDesktopCollapsed ? 'lg:sr-only' : undefined}>
            {theme === 'dark' ? '浅色' : '深色'}
          </span>
        </button>
      </div>
    </aside>
  );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="btn btn-ghost h-10 w-10 justify-center p-0 lg:hidden"
      onClick={onClick}
      aria-label="打开导航"
      type="button"
    >
      <Menu className="h-4 w-4" />
    </button>
  );
}
