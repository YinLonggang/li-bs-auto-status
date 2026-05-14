import { useEffect, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  Factory as FactoryIcon,
  FileDown,
  FileText,
  Flag,
  Lock,
  Moon,
  Paperclip,
  Plus,
  RefreshCcw,
  Save,
  Search,
  ShieldCheck,
  Sun,
  Target,
  Trash2,
  UserRound,
  Workflow
} from 'lucide-react';
import AuthPromptCard from './components/AuthPromptCard';
import Sidebar, { AppTab, MobileMenuButton } from './components/Sidebar';
import { LOGIN_URL } from './config';
import { usePersistentSidebarCollapse } from './hooks/usePersistentSidebarCollapse';
import { useTheme } from './hooks/useTheme';
import { AuthError, fetchUserProfile } from './services/auth';
import {
  createCheckItem,
  createExportTask,
  createProject,
  deleteCheckItem,
  deleteProjectPhase,
  fetchExportDownloadLink,
  fetchWorkspaceData,
  seedProjectTemplate,
  updateCheckItem,
  updateCheckItemOwner,
  updateProject,
  updateProjectPhase
} from './services/bsAutoStatusApi';
import { ApiError } from './services/http';
import type {
  CheckItem,
  CollisionReport,
  DashboardSummary,
  ExportTask,
  InspectionModule,
  KeyIssue,
  OwnerCandidate,
  Project,
  ProjectPhaseProgress,
  ProjectPhase,
  ProjectStatistics,
  ReportDefinition,
  UserProfile,
  WorkspaceData
} from './types';

type StatusTone = 'success' | 'warning' | 'danger' | 'muted' | 'primary';

const EMPTY_WORKSPACE: WorkspaceData = {
  projects: [],
  selectedProject: null,
  hierarchy: {
    factories: [],
    workshops: [],
    productionLines: []
  },
  dashboardSummary: null,
  projectStats: [],
  selectedProjectStats: null,
  timeline: null,
  phases: [],
  phaseTemplates: [],
  inspectionModules: [],
  checklistTemplates: [],
  checkItems: [],
  keyIssues: [],
  collisionReports: [],
  reports: [],
  exportTasks: [],
  ownerCandidates: []
};

const TONE_CLASS: Record<StatusTone, string> = {
  success: 'border-success/40 bg-success/10 text-success',
  warning: 'border-warning/40 bg-warning/10 text-warning',
  danger: 'border-danger/40 bg-danger/10 text-danger',
  muted: 'border-outline bg-surface-strong text-ink-muted',
  primary: 'border-primary/40 bg-primary/10 text-primary'
};

const STATUS_LABEL: Record<string, string> = {
  active: '进行中',
  planning: '规划中',
  paused: '暂停',
  completed: '已完成',
  archived: '归档',
  not_started: '未开始',
  in_progress: '进行中',
  blocked: '阻塞',
  pending: '待处理',
  queued: '排队中',
  running: '生成中',
  succeeded: '已完成',
  failed: '失败',
  done: '完成',
  pass: '通过',
  fail: '未通过',
  na: '不适用',
  waived: '豁免',
  high: '高风险',
  medium: '中风险',
  low: '低风险',
  critical: '严重',
  waiting_confirm: '待确认',
  approved: '已批准',
  signed: '已签核',
  rejected: '退回',
  draft: '草稿'
};

const phaseTone = (status: string): StatusTone => {
  if (['completed', 'done', 'succeeded', 'closed', 'approved', 'signed', 'pass', 'na', 'waived', '已关闭', '完成', '已签核'].includes(status)) return 'success';
  if (['blocked', 'failed', 'critical', 'fail', 'rejected', 'returned', 'voided', '高风险', '严重'].includes(status)) return 'danger';
  if (['active', 'in_progress', 'running', 'containment', '进行中'].includes(status)) return 'primary';
  if (['pending', 'queued', 'planning', 'waiting_confirm', 'hold', 'draft', '待确认', '搁置'].includes(status)) return 'warning';
  return 'muted';
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  return value.slice(0, 10);
};

const dateInputValue = (value?: string | null) => (value ? value.slice(0, 10) : '');

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const percent = (value: number) => `${Math.max(0, Math.min(100, Math.round(value)))}%`;

const bySequence = <T extends { sequence: number }>(items: T[]) =>
  [...items].sort((left, right) => left.sequence - right.sequence);

const activePhasesOf = (phases: ProjectPhase[]) => bySequence(phases).filter(phase => phase.isActive !== false);

const filterCheckItemsByPhases = (items: CheckItem[], phases: ProjectPhase[]) => {
  const phaseIds = new Set(phases.map(phase => idOf(phase.id)));
  return items.filter(item => phaseIds.has(idOf(item.projectPhaseId)));
};

const idOf = (value?: string | number | null) => (value === undefined || value === null ? '' : `${value}`);

const COMPLETE_STATUSES = new Set(['done', 'completed', 'pass', 'na', 'waived', 'succeeded', 'approved', 'signed']);
const BLOCKED_STATUSES = new Set(['blocked', 'fail', 'failed', 'critical']);
const DAY_MS = 24 * 60 * 60 * 1000;

const dateFromValue = (value?: string | null) => {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isFinite(date.getTime()) ? date : null;
};

const isoWeekOf = (date: Date) => {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - weekday);
  const weekYear = target.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil((((target.getTime() - yearStart.getTime()) / DAY_MS) + 1) / 7);
  return { weekYear, week };
};

const formatWeekInfo = (value?: string | null) => {
  const date = dateFromValue(value);
  return date ? isoWeekOf(date) : null;
};

const formatWeekLabel = (value?: string | null) => {
  const weekInfo = formatWeekInfo(value);
  return weekInfo ? `${weekInfo.weekYear} W${`${weekInfo.week}`.padStart(2, '0')}` : '-';
};

const formatWeekRange = (startDate?: string | null, endDate?: string | null) => {
  const startWeek = formatWeekInfo(startDate);
  const endWeek = formatWeekInfo(endDate);
  const exactStart = formatDate(startDate);
  const exactEnd = formatDate(endDate);
  const title = exactStart === '-' && exactEnd === '-' ? '未设置日期' : `${exactStart} 至 ${exactEnd}`;

  if (!startWeek && !endWeek) return { start: '未设置周', title };
  if (startWeek && endWeek && startWeek.weekYear === endWeek.weekYear && startWeek.week === endWeek.week) {
    return { start: formatWeekLabel(startDate), title };
  }
  if (!startWeek && endWeek) return { start: '开始周未设置', end: `至 ${formatWeekLabel(endDate)}`, title };
  if (startWeek && !endWeek) return { start: formatWeekLabel(startDate), end: '结束周未设置', title };
  if (startWeek && endWeek) {
    const endPrefix = startWeek.weekYear === endWeek.weekYear ? '' : `${endWeek.weekYear} `;
    return {
      start: formatWeekLabel(startDate),
      end: `至 ${endPrefix}W${`${endWeek.week}`.padStart(2, '0')}`,
      title
    };
  }
  return { start: '未设置周', title };
};

const formatWeekRangeText = (startDate?: string | null, endDate?: string | null) => {
  const weekRange = formatWeekRange(startDate, endDate);
  return weekRange.end ? `${weekRange.start} ${weekRange.end}` : weekRange.start;
};

const startOfIsoWeekMs = (value: number) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  const weekday = date.getDay() || 7;
  date.setDate(date.getDate() - weekday + 1);
  return date.getTime();
};

const formatWeekLabelFromMs = (value: number) => formatWeekLabel(formatLocalDate(new Date(value)));

const dateMs = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
};

const isComplete = (status: string) => COMPLETE_STATUSES.has(status);
const isBlocked = (status: string) => BLOCKED_STATUSES.has(status);

const isOverdue = (plannedEndDate: string, status: string, today = formatLocalDate(new Date())) =>
  Boolean(plannedEndDate) && plannedEndDate.slice(0, 10) < today && !isComplete(status);

const completionRateFor = (items: CheckItem[], fallback = 0) =>
  items.length ? (items.filter(item => isComplete(item.status)).length / items.length) * 100 : fallback;

const hierarchyLabel = (item?: { code?: string; name?: string } | null) =>
  item ? [item.code, item.name].filter(Boolean).join(' · ') || '未命名' : '未设置';

const phaseStatusFromProgress = (value: number) => {
  if (value >= 100) return 'completed';
  if (value > 0) return 'in_progress';
  return 'not_started';
};

function StatusPill({ status }: { status: string }) {
  return <span className={`status-pill ${TONE_CLASS[phaseTone(status)]}`}>{STATUS_LABEL[status] ?? status}</span>;
}

function ReadOnlyNotice({ canWrite }: { canWrite: boolean }) {
  if (canWrite) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-outline bg-surface-soft px-3 py-2 text-sm text-ink-muted">
      <Lock className="h-4 w-4" />
      当前账号只读，写操作已禁用。
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="metric-card">
      <div className="text-xs font-medium text-ink-muted">{label}</div>
      <div className="metric-value">{value}</div>
      <div className="text-xs text-ink-muted">{detail}</div>
    </div>
  );
}

type ScopeState = {
  factoryId: string;
  workshopId: string;
  productionLineId: string;
};

const EMPTY_SCOPE: ScopeState = {
  factoryId: '',
  workshopId: '',
  productionLineId: ''
};

type SearchFilterState = {
  keyword: string;
  status: string;
  phaseId: string;
  moduleId: string;
  owner: string;
  severity: string;
  startDate: string;
  endDate: string;
  activeState: string;
};

const EMPTY_FILTERS: SearchFilterState = {
  keyword: '',
  status: '',
  phaseId: '',
  moduleId: '',
  owner: '',
  severity: '',
  startDate: '',
  endDate: '',
  activeState: ''
};

const normalizeText = (value?: string | number | null) => `${value ?? ''}`.trim().toLowerCase();

const textMatches = (keyword: string, values: Array<string | number | null | undefined>) => {
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedKeyword) return true;
  return values.some(value => normalizeText(value).includes(normalizedKeyword));
};

const dateRangeMatches = (itemStart?: string | null, itemEnd?: string | null, filterStart?: string, filterEnd?: string) => {
  const startLimit = dateMs(filterStart);
  const endLimit = dateMs(filterEnd);
  if (startLimit === null && endLimit === null) return true;
  const start = dateMs(itemStart) ?? dateMs(itemEnd);
  const end = dateMs(itemEnd) ?? start;
  if (start === null || end === null) return false;
  if (startLimit !== null && end < startLimit) return false;
  if (endLimit !== null && start > endLimit) return false;
  return true;
};

const statusOptionValues = (items: string[]) => [...new Set(items.filter(Boolean))];

function FilterShell({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-outline bg-surface-soft p-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{children}</div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-outline bg-surface-soft p-6 text-center text-sm text-ink-muted">
      {message}
    </div>
  );
}

type DashboardCell = {
  moduleId: string;
  phaseId: string;
};

type DashboardJumpTarget = Extract<AppTab, 'timeline' | 'checks' | 'issues' | 'collision' | 'baseConfig'>;

const DASHBOARD_PROJECT_ACTIONS: Array<{
  view: DashboardJumpTarget;
  label: string;
  icon: typeof Target;
}> = [
  { view: 'timeline', label: '阶段进度', icon: Target },
  { view: 'checks', label: '检查项', icon: CheckCircle2 },
  { view: 'issues', label: '重点问题', icon: AlertTriangle },
  { view: 'collision', label: '碰撞一页纸', icon: FileText },
  { view: 'baseConfig', label: '配置中心', icon: Workflow }
];

type ChartDatum = {
  key: string;
  label: string;
  value: number;
  detail?: string;
  color?: string;
};

const CHART_COLORS = [
  'rgb(var(--chart-blue))',
  'rgb(var(--chart-teal))',
  'rgb(var(--chart-green))',
  'rgb(var(--chart-amber))',
  'rgb(var(--chart-red))',
  'rgb(var(--chart-slate))'
];

const chartColor = (index: number) => CHART_COLORS[index % CHART_COLORS.length];

const chartDataFromRecord = (
  record: Record<string, number>,
  preferredOrder: string[]
): ChartDatum[] => {
  const orderedKeys = [
    ...preferredOrder,
    ...Object.keys(record)
      .filter(key => !preferredOrder.includes(key))
      .sort((left, right) => left.localeCompare(right))
  ];

  return orderedKeys
    .map((key, index) => ({
      key,
      label: STATUS_LABEL[key] ?? key,
      value: record[key] ?? 0,
      color: chartColor(index)
    }))
    .filter(item => item.value > 0);
};

function DonutChart({
  title,
  description,
  data,
  centerLabel
}: {
  title: string;
  description: string;
  data: ChartDatum[];
  centerLabel: string;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <article className="chart-card">
      <div className="chart-card-header">
        <div>
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          <p className="text-sm text-ink-muted">{description}</p>
        </div>
        <span className="chip">合计 {total}</span>
      </div>
      {total > 0 ? (
        <div className="chart-donut-layout">
          <div className="chart-donut-wrap">
            <svg
              className="h-40 w-40"
              viewBox="0 0 160 160"
              role="img"
              aria-label={`${title}，合计 ${total}`}
            >
              <title>{title}</title>
              <circle
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke="rgb(var(--surface-strong))"
                strokeWidth="20"
              />
              {data.map((item, index) => {
                const segmentLength = (item.value / total) * circumference;
                const dashOffset = -offset;
                offset += segmentLength;
                return (
                  <circle
                    key={item.key}
                    cx="80"
                    cy="80"
                    r={radius}
                    fill="none"
                    stroke={item.color ?? chartColor(index)}
                    strokeWidth="20"
                    strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
                    strokeDashoffset={dashOffset}
                    strokeLinecap={data.length === 1 ? 'round' : 'butt'}
                    transform="rotate(-90 80 80)"
                  />
                );
              })}
            </svg>
            <div className="chart-donut-center">
              <span className="text-xs text-ink-muted">{centerLabel}</span>
              <strong>{total}</strong>
            </div>
          </div>
          <dl className="chart-legend">
            {data.map((item, index) => (
              <div key={item.key} className="chart-legend-row">
                <dt className="flex min-w-0 items-center gap-2">
                  <span className="chart-swatch" style={{ background: item.color ?? chartColor(index) }} />
                  <span className="truncate">{item.label}</span>
                </dt>
                <dd className="font-semibold text-ink">
                  {item.value}
                  <span className="ml-1 text-xs font-normal text-ink-muted">{percent((item.value / total) * 100)}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <EmptyState message="暂无可统计数据。" />
      )}
    </article>
  );
}

function HorizontalBarChart({
  title,
  description,
  data,
  maxValue,
  valueFormatter,
  wide = false
}: {
  title: string;
  description: string;
  data: ChartDatum[];
  maxValue?: number;
  valueFormatter?: (value: number) => string;
  wide?: boolean;
}) {
  const max = maxValue ?? Math.max(...data.map(item => item.value), 1);
  const formatValue = valueFormatter ?? ((value: number) => `${value}`);

  return (
    <article className={`chart-card ${wide ? 'xl:col-span-2' : ''}`}>
      <div className="chart-card-header">
        <div>
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          <p className="text-sm text-ink-muted">{description}</p>
        </div>
        <span className="chip">{data.length} 个项目</span>
      </div>
      {data.length ? (
        <div className="chart-bar-body">
          {data.map((item, index) => {
            const width = max > 0 ? `${Math.min(100, Math.max(0, Math.round((item.value / max) * 100)))}%` : '0%';
            return (
              <div key={item.key} className="chart-bar-row" aria-label={`${item.label}：${formatValue(item.value)}`}>
                <div className="chart-bar-label">
                  <span className="truncate text-sm font-semibold text-ink">{item.label}</span>
                  {item.detail ? <span className="truncate text-xs text-ink-muted">{item.detail}</span> : null}
                </div>
                <div className="chart-bar-track" aria-hidden="true">
                  <span
                    className="chart-bar-fill"
                    style={{ width, background: item.color ?? chartColor(index) }}
                  />
                </div>
                <div className="chart-bar-value">{formatValue(item.value)}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState message="暂无子项目统计数据。" />
      )}
    </article>
  );
}

function ScopeToolbar({
  hierarchy,
  scope,
  canWrite,
  onChange,
  onCreateProject
}: {
  hierarchy: WorkspaceData['hierarchy'];
  scope: ScopeState;
  canWrite: boolean;
  onChange: (scope: ScopeState) => void;
  onCreateProject: () => void;
}) {
  const workshops = hierarchy.workshops.filter(
    workshop => !scope.factoryId || idOf(workshop.factoryId) === scope.factoryId
  );
  const productionLines = hierarchy.productionLines.filter(
    line => !scope.workshopId || idOf(line.workshopId) === scope.workshopId
  );

  return (
    <section className="panel">
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
        <label>
          <span className="field-label">工厂</span>
          <select
            className="select"
            value={scope.factoryId}
            onChange={event => onChange({ factoryId: event.target.value, workshopId: '', productionLineId: '' })}
          >
            <option value="">全部工厂</option>
            {hierarchy.factories.map(factory => (
              <option key={factory.id} value={idOf(factory.id)}>
                {hierarchyLabel(factory)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">车间</span>
          <select
            className="select"
            value={scope.workshopId}
            onChange={event => onChange({ ...scope, workshopId: event.target.value, productionLineId: '' })}
          >
            <option value="">全部车间</option>
            {workshops.map(workshop => (
              <option key={workshop.id} value={idOf(workshop.id)}>
                {hierarchyLabel(workshop)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">产线（可选）</span>
          <select
            className="select"
            value={scope.productionLineId}
            onChange={event => onChange({ ...scope, productionLineId: event.target.value })}
            disabled={!scope.workshopId}
          >
            <option value="">车间级项目 / 全部产线</option>
            {productionLines.map(line => (
              <option key={line.id} value={idOf(line.id)}>
                {hierarchyLabel(line)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            className="btn btn-primary w-full lg:w-auto"
            type="button"
            disabled={!canWrite || !scope.factoryId || !scope.workshopId}
            onClick={onCreateProject}
          >
            <Plus className="h-4 w-4" />
            按范围创建
          </button>
        </div>
      </div>
    </section>
  );
}

function AttachmentList({ attachments }: { attachments: CheckItem['attachments'] }) {
  if (!attachments.length) return <span className="text-xs text-ink-muted">无附件</span>;
  return (
    <div className="space-y-2">
      {attachments.map(attachment => (
        <div key={attachment.id} className="rounded-lg border border-outline bg-surface-soft p-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-ink">{attachment.fileName}</span>
            {attachment.downloadUrl ? (
              <a className="chip hover:text-primary" href={attachment.downloadUrl}>
                <ExternalLink className="h-3.5 w-3.5" />
                download_url
              </a>
            ) : null}
          </div>
          <div className="mt-1 break-all font-mono text-[11px] text-ink-muted">{attachment.objectKey}</div>
          {attachment.bucketName ? <div className="mt-1 text-[11px] text-ink-subtle">bucket: {attachment.bucketName}</div> : null}
        </div>
      ))}
    </div>
  );
}

function PhaseRail({ phases }: { phases: ProjectPhase[] }) {
  const sorted = bySequence(phases);
  const activeIndex = sorted.findIndex(phase => ['in_progress', 'active', 'blocked'].includes(phase.status));
  const fallbackIndex = sorted.reduce((lastIndex, phase, index) => (phase.status === 'completed' ? index : lastIndex), -1);
  const currentIndex = activeIndex >= 0 ? activeIndex : Math.max(0, fallbackIndex);
  const current = sorted[currentIndex];

  return (
    <section className="panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="kicker">Phase Navigation</p>
          <h2 className="text-lg font-semibold">阶段导航与进度</h2>
        </div>
        <div className="chip">
          <Target className="h-3.5 w-3.5" />
          当前目标：{current?.goal ?? '暂无阶段'}
        </div>
      </div>
      <div className="mt-5 overflow-x-auto pb-1">
        <div className="flex min-w-[760px] items-start">
          {sorted.map((phase, index) => {
            const done = phase.progressPercent >= 100 || phase.status === 'completed';
            const active = index === currentIndex && !done;
            return (
              <div key={phase.id} className="relative flex flex-1 flex-col items-center gap-2 text-center">
                {index < sorted.length - 1 ? (
                  <div
                    className={`absolute left-1/2 top-3 h-0.5 w-full ${
                      done ? 'bg-success' : active ? 'bg-primary/60' : 'bg-outline'
                    }`}
                  />
                ) : null}
                <div
                  className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold ${
                    done
                      ? 'border-success bg-success text-white'
                      : active
                        ? 'border-primary bg-primary text-white shadow-[0_0_0_4px_rgba(37,99,235,0.22)]'
                        : 'border-outline bg-surface-strong text-ink-muted'
                  }`}
                >
                  {done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                </div>
                <div className="w-full px-2">
                  <div className={`text-xs font-semibold ${done ? 'text-success' : active ? 'text-primary' : 'text-ink-muted'}`}>
                    {phase.name}
                  </div>
                  <div className="mt-1 text-[11px] text-ink-subtle">{formatDate(phase.actualStartAt || phase.plannedStartDate)}</div>
                  <div className="mt-2 h-1.5 rounded-full bg-surface-strong">
                    <div className="h-1.5 rounded-full bg-accent" style={{ width: percent(phase.progressPercent) }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function DashboardStats({
  project,
  summary,
  phases,
  checkItems,
  keyIssues,
  exportTasks
}: {
  project: Project | null;
  summary: WorkspaceData['dashboardSummary'];
  phases: ProjectPhase[];
  checkItems: CheckItem[];
  keyIssues: KeyIssue[];
  exportTasks: ExportTask[];
}) {
  const completedChecks = checkItems.filter(item => ['done', 'completed', 'pass', 'na', 'waived'].includes(item.status)).length;
  const activeChecks = checkItems.filter(item => ['in_progress', 'blocked', 'fail'].includes(item.status)).length;
  const openIssues = keyIssues.filter(issue => !issue.closedAt).length;
  const signedReports = exportTasks.filter(task => task.status === 'succeeded').length;
  const completionRate = summary?.completionRate ?? project?.progressPercent ?? 0;
  const totalChecks = summary?.checkItemCount ?? checkItems.length;
  const doneChecks = summary?.completedCheckItemCount ?? completedChecks;
  const openCheckCount = summary?.openCheckItemCount ?? activeChecks;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <MetricCard label="范围完成率" value={percent(completionRate)} detail={project?.lineName ?? '按筛选条件聚合'} />
      <MetricCard label="项目数量" value={summary?.projectCount ?? (project ? 1 : 0)} detail={`${summary?.activeProjectCount ?? 0} 个进行中`} />
      <MetricCard label="检查闭环" value={`${doneChecks}/${totalChecks}`} detail={`${openCheckCount} 项未关闭 · ${summary?.overdueCount ?? 0} 项逾期`} />
      <MetricCard label="重点问题" value={summary?.openKeyIssueCount ?? openIssues} detail={`${summary?.highOpenKeyIssueCount ?? 0} 个高风险`} />
      <MetricCard label="导出/签核" value={summary?.exportJobCount ?? signedReports} detail={`${summary?.pendingCollisionReportCount ?? 0} 个一页纸待签`} />
    </div>
  );
}

function DashboardLayer({
  index,
  title,
  children
}: {
  index: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="dashboard-layer">
      <div className="dashboard-layer-header">
        <span className="dashboard-layer-index">{index}</span>
        <h2 className="dashboard-layer-title">{title}</h2>
      </div>
      <div className="dashboard-layer-body">{children}</div>
    </section>
  );
}

function DashboardProjectFilters({
  filters,
  onChange,
  statusOptions
}: {
  filters: SearchFilterState;
  onChange: (filters: SearchFilterState) => void;
  statusOptions: string[];
}) {
  return (
    <FilterShell>
      <label className="xl:col-span-2">
        <span className="field-label">关键字</span>
        <input
          className="input"
          value={filters.keyword}
          onChange={event => onChange({ ...filters, keyword: event.target.value })}
          placeholder="项目、编号、负责人"
          aria-label="Dashboard 项目统计关键字"
        />
      </label>
      <label>
        <span className="field-label">项目状态</span>
        <select className="select" value={filters.status} onChange={event => onChange({ ...filters, status: event.target.value })}>
          <option value="">全部状态</option>
          {statusOptions.map(status => (
            <option key={status} value={status}>{STATUS_LABEL[status] ?? status}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="field-label">负责人</span>
        <input
          className="input"
          value={filters.owner}
          onChange={event => onChange({ ...filters, owner: event.target.value })}
          placeholder="负责人"
          aria-label="Dashboard 负责人筛选"
        />
      </label>
      <label>
        <span className="field-label">计划开始</span>
        <input className="input" type="date" value={filters.startDate} onChange={event => onChange({ ...filters, startDate: event.target.value })} />
      </label>
      <label>
        <span className="field-label">计划结束</span>
        <input className="input" type="date" value={filters.endDate} onChange={event => onChange({ ...filters, endDate: event.target.value })} />
      </label>
    </FilterShell>
  );
}

function DashboardDetailFilters({
  filters,
  onChange,
  phases,
  modules,
  statusOptions
}: {
  filters: SearchFilterState;
  onChange: (filters: SearchFilterState) => void;
  phases: ProjectPhase[];
  modules: InspectionModule[];
  statusOptions: string[];
}) {
  return (
    <FilterShell>
      <label className="xl:col-span-2">
        <span className="field-label">检查项关键字</span>
        <input
          className="input"
          value={filters.keyword}
          onChange={event => onChange({ ...filters, keyword: event.target.value })}
          placeholder="检查项、验收、负责人"
          aria-label="Dashboard 检查项详情关键字"
        />
      </label>
      <label>
        <span className="field-label">阶段</span>
        <select className="select" value={filters.phaseId} onChange={event => onChange({ ...filters, phaseId: event.target.value })}>
          <option value="">全部阶段</option>
          {bySequence(phases).map(phase => <option key={phase.id} value={idOf(phase.id)}>{phase.name}</option>)}
        </select>
      </label>
      <label>
        <span className="field-label">模块</span>
        <select className="select" value={filters.moduleId} onChange={event => onChange({ ...filters, moduleId: event.target.value })}>
          <option value="">全部模块</option>
          {bySequence(modules).map(module => <option key={module.id} value={idOf(module.id)}>{module.name}</option>)}
        </select>
      </label>
      <label>
        <span className="field-label">状态</span>
        <select className="select" value={filters.status} onChange={event => onChange({ ...filters, status: event.target.value })}>
          <option value="">全部状态</option>
          {statusOptions.map(status => <option key={status} value={status}>{STATUS_LABEL[status] ?? status}</option>)}
        </select>
      </label>
      <label>
        <span className="field-label">负责人</span>
        <input className="input" value={filters.owner} onChange={event => onChange({ ...filters, owner: event.target.value })} placeholder="负责人" aria-label="Dashboard 检查项负责人" />
      </label>
      <label>
        <span className="field-label">开始日期</span>
        <input className="input" type="date" value={filters.startDate} onChange={event => onChange({ ...filters, startDate: event.target.value })} />
      </label>
      <label>
        <span className="field-label">结束日期</span>
        <input className="input" type="date" value={filters.endDate} onChange={event => onChange({ ...filters, endDate: event.target.value })} />
      </label>
    </FilterShell>
  );
}

const buildProjectStatistics = (data: WorkspaceData): ProjectStatistics[] => {
  const summaryStats = new Map(
    (data.projectStats.length ? data.projectStats : data.dashboardSummary?.projectStats ?? []).map(item => [idOf(item.projectId), item])
  );
  const selectedProjectId = idOf(data.selectedProject?.id);
  const selectedItems = data.checkItems;
  const selectedIssues = data.keyIssues;
  const selectedReports = data.collisionReports;
  const selectedExports = data.exportTasks;
  const selectedPhases = activePhasesOf(data.phases);
  const selectedPhaseIds = new Set(selectedPhases.map(phase => idOf(phase.id)));
  const selectedActiveItems = selectedItems.filter(item => selectedPhaseIds.has(idOf(item.projectPhaseId)));

  return data.projects.map(project => {
    const selected = idOf(project.id) === selectedProjectId;
    const summary = selected && data.selectedProjectStats ? data.selectedProjectStats : summaryStats.get(idOf(project.id));
    const phaseCount = selected ? selectedPhases.length : summary?.phaseCount ?? 0;
    const completedCheckItemCount = selected
      ? selectedActiveItems.filter(item => isComplete(item.status)).length
      : summary?.completedCheckItemCount ?? 0;
    const checkItemCount = selected ? selectedActiveItems.length : summary?.checkItemCount ?? 0;
    const openIssues = selected
      ? selectedIssues.filter(issue => !issue.closedAt && !['closed', 'resolved', 'done'].includes(issue.status)).length
      : summary?.openKeyIssueCount ?? 0;
    const currentPhase = selected
      ? selectedPhases.find(phase => ['in_progress', 'active', 'blocked'].includes(phase.status)) ?? selectedPhases[0]
      : null;
    const localOverduePhaseCount = selectedPhases.filter(phase => isOverdue(phase.plannedEndDate, phase.status)).length;
    const localOverdueCheckItemCount = selectedActiveItems.filter(item => isOverdue(item.plannedEndDate, item.status)).length;
    const overduePhaseCount = summary?.overduePhaseCount ?? (selected ? localOverduePhaseCount : 0);
    const overdueCheckItemCount = summary?.overdueCheckItemCount ?? (selected ? localOverdueCheckItemCount : 0);

    return {
      projectId: project.id,
      projectCode: summary?.projectCode || project.code,
      projectName: summary?.projectName || project.name,
      projectStatus: summary?.projectStatus || project.status,
      ownerName: summary?.ownerName || project.ownerName,
      plannedStartDate: summary?.plannedStartDate || project.plannedStartDate,
      plannedEndDate: summary?.plannedEndDate || project.plannedEndDate,
      completionRate: selected ? completionRateFor(selectedItems, project.progressPercent) : summary?.completionRate ?? project.progressPercent,
      phaseCount,
      checkItemCount,
      completedCheckItemCount,
      overdueCount: summary?.overdueCount ?? overduePhaseCount + overdueCheckItemCount,
      overduePhaseCount,
      overdueCheckItemCount,
      blockedCheckItemCount: selected ? selectedActiveItems.filter(item => isBlocked(item.status)).length : summary?.blockedCheckItemCount ?? 0,
      keyIssueCount: selected ? selectedIssues.length : summary?.keyIssueCount ?? 0,
      openKeyIssueCount: openIssues,
      highOpenKeyIssueCount: selected
        ? selectedIssues.filter(issue => !issue.closedAt && ['high', 'critical'].includes(issue.severity)).length
        : summary?.highOpenKeyIssueCount ?? 0,
      collisionReportCount: selected ? selectedReports.length : summary?.collisionReportCount ?? 0,
      pendingCollisionReportCount: selected
        ? selectedReports.filter(report => !['approved', 'signed', 'closed'].includes(report.status)).length
        : summary?.pendingCollisionReportCount ?? 0,
      exportJobCount: selected ? selectedExports.length : summary?.exportJobCount ?? 0,
      failedExportJobCount: selected ? selectedExports.filter(task => task.status === 'failed').length : summary?.failedExportJobCount ?? 0,
      currentPhaseName: currentPhase?.name ?? summary?.currentPhaseName,
      phaseProgress: summary?.phaseProgress ?? []
    };
  });
};

const projectStatMatchesFilters = (stat: ProjectStatistics, filters: SearchFilterState) => {
  if (filters.status && stat.projectStatus !== filters.status) return false;
  if (filters.owner && !textMatches(filters.owner, [stat.ownerName])) return false;
  if (!textMatches(filters.keyword, [stat.projectName, stat.projectCode, stat.ownerName, stat.currentPhaseName])) return false;
  return dateRangeMatches(stat.plannedStartDate, stat.plannedEndDate, filters.startDate, filters.endDate);
};

function PortfolioOverview({
  summary,
  stats
}: {
  summary: DashboardSummary | null;
  stats: ProjectStatistics[];
}) {
  const projectCount = summary?.projectCount ?? stats.length;
  const activeProjectCount = summary?.activeProjectCount ?? stats.filter(stat => stat.projectStatus === 'active').length;
  const completedProjectCount = summary?.byProjectStatus?.completed ?? stats.filter(stat => stat.projectStatus === 'completed').length;
  const completionRate = summary?.completionRate ?? (
    stats.length ? stats.reduce((total, stat) => total + stat.completionRate, 0) / stats.length : 0
  );
  const checkItemCount = summary?.checkItemCount ?? stats.reduce((total, stat) => total + stat.checkItemCount, 0);
  const completedCheckItemCount = summary?.completedCheckItemCount ?? stats.reduce((total, stat) => total + stat.completedCheckItemCount, 0);
  const overdueCount = summary?.overdueCount ?? stats.reduce((total, stat) => total + stat.overdueCount, 0);
  const openIssueCount = summary?.openKeyIssueCount ?? stats.reduce((total, stat) => total + stat.openKeyIssueCount, 0);
  const pendingCollisionCount = summary?.pendingCollisionReportCount ?? stats.reduce((total, stat) => total + stat.pendingCollisionReportCount, 0);
  const statusCounts = summary?.byProjectStatus ?? stats.reduce<Record<string, number>>((acc, stat) => {
    acc[stat.projectStatus] = (acc[stat.projectStatus] ?? 0) + 1;
    return acc;
  }, {});
  const orderedStatuses = ['active', 'planning', 'paused', 'completed', 'archived'];
  const statusEntries = orderedStatuses
    .map(status => [status, statusCounts[status] ?? 0] as const)
    .filter(([, count]) => count > 0);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="kicker">Portfolio Overview</p>
          <h2 className="text-xl font-semibold">项目状态总览</h2>
        </div>
        <span className="chip">{projectCount} 个项目</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="全部项目" value={projectCount} detail={`${activeProjectCount} 个进行中 · ${completedProjectCount} 个完成`} />
        <MetricCard label="整体完成率" value={percent(completionRate)} detail={`${completedCheckItemCount}/${checkItemCount} 项完成`} />
        <MetricCard label="逾期风险" value={overdueCount} detail={`${summary?.overduePhaseCount ?? 0} 阶段 · ${summary?.overdueCheckItemCount ?? 0} 检查项`} />
        <MetricCard label="重点问题" value={openIssueCount} detail={`${summary?.highOpenKeyIssueCount ?? 0} 个高风险未关闭`} />
        <MetricCard label="碰撞签核" value={pendingCollisionCount} detail={`${summary?.collisionReportCount ?? 0} 份一页纸`} />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {statusEntries.map(([status, count]) => (
          <div key={status} className="rounded-lg border border-outline bg-surface-soft p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink">{STATUS_LABEL[status] ?? status}</span>
              <StatusPill status={status} />
            </div>
            <div className="mt-2 text-2xl font-semibold text-ink">{count}</div>
          </div>
        ))}
        {!statusEntries.length ? <EmptyState message="暂无项目状态数据。" /> : null}
      </div>
    </section>
  );
}

function DashboardCharts({
  summary,
  stats
}: {
  summary: DashboardSummary | null;
  stats: ProjectStatistics[];
}) {
  const summaryProjectStatusCounts = summary?.byProjectStatus ?? {};
  const projectStatusCounts = Object.keys(summaryProjectStatusCounts).length ? summaryProjectStatusCounts : stats.reduce<Record<string, number>>((acc, stat) => {
    acc[stat.projectStatus] = (acc[stat.projectStatus] ?? 0) + 1;
    return acc;
  }, {});
  const projectStatusData = chartDataFromRecord(
    projectStatusCounts,
    ['active', 'planning', 'paused', 'completed', 'archived']
  );
  const riskBars = [...stats]
    .sort((left, right) => {
      const leftRisk = left.overdueCount + left.openKeyIssueCount + left.pendingCollisionReportCount;
      const rightRisk = right.overdueCount + right.openKeyIssueCount + right.pendingCollisionReportCount;
      return rightRisk - leftRisk || left.projectName.localeCompare(right.projectName);
    })
    .map(stat => {
      const riskValue = stat.overdueCount + stat.openKeyIssueCount + stat.pendingCollisionReportCount;
      return {
        key: idOf(stat.projectId),
        label: stat.projectName,
        value: riskValue,
        detail: `逾期 ${stat.overdueCount} · 问题 ${stat.openKeyIssueCount} · 签核 ${stat.pendingCollisionReportCount}`,
        color: riskValue > 0 ? 'rgb(var(--chart-red))' : 'rgb(var(--chart-green))'
      };
    });

  return (
    <section className="dashboard-chart-section">
      <div className="dashboard-chart-header">
        <div>
          <p className="kicker">Dashboard Charts</p>
          <h2 className="text-xl font-semibold">整体状态图表</h2>
        </div>
        <span className="chip">{stats.length} 个项目</span>
      </div>
      <div className="dashboard-chart-grid dashboard-chart-grid--focused">
        <DonutChart
          title="项目状态分布"
          description="按项目当前状态汇总。"
          data={projectStatusData}
          centerLabel="项目"
        />
        <HorizontalBarChart
          title="项目风险压力"
          description="逾期、未关闭重点问题和待签核一页纸汇总。"
          data={riskBars}
          wide
        />
      </div>
    </section>
  );
}

function ProjectStatisticsList({
  stats,
  selectedProjectId,
  filters,
  onFiltersChange,
  statusOptions,
  onSelectProject
}: {
  stats: ProjectStatistics[];
  selectedProjectId?: string | number;
  filters: SearchFilterState;
  onFiltersChange: (filters: SearchFilterState) => void;
  statusOptions: string[];
  onSelectProject: (projectId: string | number) => void;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="kicker">Project Statistics</p>
          <h2 className="text-lg font-semibold">项目统计列表</h2>
        </div>
        <span className="chip">{stats.length} 个项目</span>
      </div>
      <div className="mt-4">
        <DashboardProjectFilters
          filters={filters}
          onChange={onFiltersChange}
          statusOptions={statusOptions}
        />
      </div>
      {!stats.length ? <div className="mt-4"><EmptyState message="当前筛选下暂无项目统计。" /></div> : null}
      <div className="table-shell mt-4">
        <table className="data-table min-w-[1120px]">
          <thead>
            <tr>
              <th>项目</th>
              <th>完成率</th>
              <th>阶段</th>
              <th>检查项</th>
              <th>逾期</th>
              <th>重点问题</th>
              <th>碰撞</th>
              <th>导出任务</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {stats.map(stat => {
              const selected = idOf(stat.projectId) === idOf(selectedProjectId);
              const handleSelect = () => onSelectProject(stat.projectId);
              const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleSelect();
                }
              };
              return (
                <tr
                  key={stat.projectId}
                  className={`cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50 ${
                    selected ? 'bg-primary/10' : 'hover:bg-surface-soft'
                  }`}
                  tabIndex={0}
                  aria-selected={selected}
                  onClick={handleSelect}
                  onKeyDown={handleRowKeyDown}
                >
                  <td>
                    <div className="font-semibold text-ink">{stat.projectName}</div>
                    <div className="mt-1 text-xs text-ink-muted">{stat.projectCode} · {stat.ownerName}</div>
                  </td>
                  <td>
                    <div className="min-w-28">
                      <div className="text-sm font-semibold text-accent">{percent(stat.completionRate)}</div>
                      <div className="mt-1 h-1.5 rounded-full bg-surface-strong">
                        <div className="h-1.5 rounded-full bg-accent" style={{ width: percent(stat.completionRate) }} />
                      </div>
                    </div>
                  </td>
                  <td>{stat.phaseCount}</td>
                  <td>{stat.completedCheckItemCount}/{stat.checkItemCount}</td>
                  <td>
                    <span className={stat.overdueCount ? 'text-danger' : 'text-success'}>{stat.overdueCount}</span>
                    <div className="mt-1 text-[11px] text-ink-muted">
                      阶段 {stat.overduePhaseCount} · 检查项 {stat.overdueCheckItemCount}
                    </div>
                  </td>
                  <td>{stat.openKeyIssueCount}/{stat.keyIssueCount}</td>
                  <td>{stat.pendingCollisionReportCount}/{stat.collisionReportCount}</td>
                  <td>{stat.exportJobCount}{stat.failedExportJobCount ? ` · 失败 ${stat.failedExportJobCount}` : ''}</td>
                  <td>
                    <button
                      className="btn btn-ghost btn--sm"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleSelect();
                      }}
                      aria-label={`查看项目 ${stat.projectName} 详情`}
                      aria-pressed={selected}
                    >
                      <ArrowUpRight className="h-4 w-4" />
                      {selected ? '当前详情' : '查看详情'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProjectPhaseProgressRail({
  phases,
  stat
}: {
  phases: ProjectPhaseProgress[];
  stat: ProjectStatistics;
}) {
  const sorted = [...phases].sort((left, right) => left.sequence - right.sequence);
  const fallbackCount = Math.max(stat.phaseCount, 1);
  const fallbackCurrentIndex = Math.min(
    fallbackCount - 1,
    Math.max(0, Math.floor((stat.completionRate / 100) * fallbackCount))
  );
  const railCount = sorted.length || fallbackCount;
  const railStyle = {
    gridTemplateColumns: `repeat(${Math.max(railCount, 1)}, minmax(0, 1fr))`
  };
  const railClassName = `project-phase-rail ${railCount >= 6 ? 'is-dense' : ''}`;

  if (!sorted.length) {
    return (
      <div className="project-phase-rail-shell" aria-label={`${stat.projectName} 阶段进度`}>
        <div className={railClassName} style={railStyle}>
          {Array.from({ length: fallbackCount }, (_, index) => {
            const done = stat.completionRate >= ((index + 1) / fallbackCount) * 100;
            const active = index === fallbackCurrentIndex && !done;
            const label = active && stat.currentPhaseName ? stat.currentPhaseName : `阶段 ${index + 1}`;
            return (
              <div
                key={label}
                className={`project-phase-step ${done ? 'is-done' : active ? 'is-active' : ''}`}
              >
                {index < fallbackCount - 1 ? <span className={`project-phase-line ${done ? 'is-complete' : ''}`} /> : null}
                <span className="project-phase-dot">{done ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}</span>
                <span className="project-phase-name">{label}</span>
                <span className="project-phase-date">{stat.currentPhaseName && active ? '当前阶段' : '摘要字段暂缺'}</span>
                <span className="project-phase-checks">检查项摘要暂缺</span>
                <span className="project-phase-progress">
                  <span style={{ width: done ? '100%' : active ? percent(stat.completionRate) : '0%' }} />
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const activeIndex = sorted.findIndex(phase => ['in_progress', 'active', 'blocked'].includes(phase.status));
  const fallbackIndex = sorted.reduce((lastIndex, phase, index) => (isComplete(phase.status) || phase.status === 'completed' ? index : lastIndex), -1);
  const currentIndex = activeIndex >= 0 ? activeIndex : Math.max(0, fallbackIndex);

  return (
    <div className="project-phase-rail-shell" aria-label={`${stat.projectName} 阶段进度`}>
      <div className={railClassName} style={railStyle}>
        {sorted.map((phase, index) => {
          const done = phase.progressPercent >= 100 || isComplete(phase.status) || phase.status === 'completed';
          const blocked = isBlocked(phase.status);
          const active = index === currentIndex && !done;
          const weekRange = formatWeekRange(phase.plannedStartDate, phase.plannedEndDate);
          const checkSummary = `${phase.completedCheckItemCount}/${phase.checkItemCount} 检查项`;
          const phaseProgress = phase.checkItemCount > 0
            ? (phase.completedCheckItemCount / phase.checkItemCount) * 100
            : phase.progressPercent;
          return (
            <div
              key={phase.key || `${phase.name}-${index}`}
              className={`project-phase-step ${done ? 'is-done' : ''} ${active ? 'is-active' : ''} ${blocked ? 'is-blocked' : ''} ${phase.isOverdue ? 'is-overdue' : ''}`}
            >
              {index < sorted.length - 1 ? (
                <span className={`project-phase-line ${done || index < currentIndex ? 'is-complete' : ''}`} />
              ) : null}
              <span className="project-phase-dot">{done ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}</span>
              <span className="project-phase-name" title={phase.name}>{phase.name}</span>
              <span className="project-phase-date" title={weekRange.title}>
                <span>{weekRange.start}</span>
                {weekRange.end ? <span>{weekRange.end}</span> : null}
              </span>
              <span className="project-phase-checks" title={checkSummary}>{checkSummary}</span>
              <span className="project-phase-progress">
                <span style={{ width: percent(phaseProgress) }} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProjectSummaryCard({
  stat,
  project,
  phases,
  selected,
  onOpenProject
}: {
  stat: ProjectStatistics;
  project?: Project;
  phases: ProjectPhaseProgress[];
  selected: boolean;
  onOpenProject: (projectId: string | number, view: DashboardJumpTarget) => void;
}) {
  const scopeText = [project?.plant, project?.workshopName, project?.lineName].filter(Boolean).join(' / ');
  const dateText = `${formatDate(stat.plannedStartDate || project?.plannedStartDate)} 至 ${formatDate(stat.plannedEndDate || project?.plannedEndDate)}`;

  return (
    <article className={`project-summary-card ${selected ? 'is-selected' : ''}`}>
      <div className="project-card-header">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-ink">{stat.projectName || project?.name || '未命名项目'}</h3>
            {selected ? <span className="chip">当前项目</span> : null}
          </div>
          <div className="mt-1 truncate text-xs text-ink-muted">
            {[stat.projectCode || project?.code, stat.ownerName || project?.ownerName].filter(Boolean).join(' · ')}
          </div>
          <div className="mt-1 truncate text-xs text-ink-subtle">{scopeText || dateText}</div>
        </div>
        <StatusPill status={stat.projectStatus || project?.status || 'active'} />
      </div>

      <div className="project-card-progress">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-semibold text-ink-muted">完成率</span>
          <span className="font-semibold text-accent">{percent(stat.completionRate)}</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-surface-strong">
          <div className="h-2 rounded-full bg-accent" style={{ width: percent(stat.completionRate) }} />
        </div>
      </div>

      <div className="project-card-metrics">
        <span><strong>{stat.phaseCount}</strong> 阶段</span>
        <span><strong>{stat.completedCheckItemCount}/{stat.checkItemCount}</strong> 检查项</span>
        <span className={stat.overdueCount ? 'text-danger' : 'text-success'}><strong>{stat.overdueCount}</strong> 逾期</span>
        <span><strong>{stat.openKeyIssueCount}</strong> 重点问题</span>
      </div>

      <ProjectPhaseProgressRail phases={phases} stat={stat} />

      <div className="project-card-actions">
        {DASHBOARD_PROJECT_ACTIONS.map(action => {
          const Icon = action.icon;
          return (
            <button
              key={action.view}
              className="btn btn-ghost btn--sm project-card-action"
              type="button"
              onClick={() => onOpenProject(stat.projectId, action.view)}
              aria-label={`${stat.projectName} 跳转到${action.label}`}
            >
              <Icon className="h-4 w-4" />
              {action.label}
            </button>
          );
        })}
      </div>
    </article>
  );
}

function ProjectSummaryBoard({
  stats,
  projects,
  selectedProjectId,
  filters,
  onFiltersChange,
  statusOptions,
  onOpenProject
}: {
  stats: ProjectStatistics[];
  projects: Project[];
  selectedProjectId?: string | number;
  filters: SearchFilterState;
  onFiltersChange: (filters: SearchFilterState) => void;
  statusOptions: string[];
  onOpenProject: (projectId: string | number, view: DashboardJumpTarget) => void;
}) {
  const projectById = new Map(projects.map(project => [idOf(project.id), project]));

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="kicker">Project Hub</p>
          <h2 className="text-xl font-semibold">项目汇总入口</h2>
        </div>
        <span className="chip">{stats.length} 个项目</span>
      </div>
      <div className="mt-4">
        <DashboardProjectFilters
          filters={filters}
          onChange={onFiltersChange}
          statusOptions={statusOptions}
        />
      </div>
      {!stats.length ? <div className="mt-4"><EmptyState message="当前筛选下暂无项目。" /></div> : null}
      <div className="project-summary-grid">
        {stats.map(stat => {
          const projectId = idOf(stat.projectId);
          return (
            <ProjectSummaryCard
              key={projectId}
              stat={stat}
              project={projectById.get(projectId)}
              phases={stat.phaseProgress ?? []}
              selected={projectId === idOf(selectedProjectId)}
              onOpenProject={onOpenProject}
            />
          );
        })}
      </div>
    </section>
  );
}

function ProjectDashboardExpansion({
  data,
  visibleProjects,
  selectedProjectStat,
  fallbackStat,
  phases,
  modules,
  checkItems,
  activeCell,
  canWrite,
  detailFilters,
  checkStatusOptions,
  onDetailFiltersChange,
  onSelectCell,
  onCreateExport
}: {
  data: WorkspaceData;
  visibleProjects: Project[];
  selectedProjectStat?: ProjectStatistics;
  fallbackStat: ProjectStatistics;
  phases: ProjectPhase[];
  modules: InspectionModule[];
  checkItems: CheckItem[];
  activeCell: DashboardCell | null;
  canWrite: boolean;
  detailFilters: SearchFilterState;
  checkStatusOptions: string[];
  onDetailFiltersChange: (filters: SearchFilterState) => void;
  onSelectCell: (cell: DashboardCell) => void;
  onCreateExport: () => void;
}) {
  return (
    <div className="dashboard-flow">
      <section className="panel dashboard-context-panel">
        <div className="panel-header">
          <div>
            <p className="kicker">Project Context</p>
            <h2 className="text-xl font-semibold">{data.selectedProject?.name ?? fallbackStat.projectName}</h2>
            <p className="text-sm text-ink-muted">
              {[data.selectedProject?.plant, data.selectedProject?.workshopName, data.selectedProject?.lineName].filter(Boolean).join(' / ') || '通过工厂、车间和可选产线过滤项目'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="chip"><FactoryIcon className="h-3.5 w-3.5" />项目总数 {visibleProjects.length}</span>
            {data.selectedProject ? <StatusPill status={data.selectedProject.status} /> : <StatusPill status={fallbackStat.projectStatus} />}
          </div>
        </div>
      </section>
      <DashboardLayer index="01" title="项目状态">
        <SingleProjectStatistics
          project={data.selectedProject}
          stat={selectedProjectStat ?? fallbackStat}
          phases={phases}
          checkItems={checkItems}
          embedded
        />
        <PhaseRail phases={phases} />
        <DashboardStats
          project={data.selectedProject}
          summary={data.dashboardSummary}
          phases={phases}
          checkItems={filterCheckItemsByPhases(data.checkItems, phases)}
          keyIssues={data.keyIssues}
          exportTasks={data.exportTasks}
        />
      </DashboardLayer>
      <DashboardLayer index="02" title="阶段检查">
        <DashboardDetailFilters
          filters={detailFilters}
          onChange={onDetailFiltersChange}
          phases={phases}
          modules={modules}
          statusOptions={checkStatusOptions}
        />
        <ModuleSwimlane
          phases={phases}
          modules={modules}
          checkItems={checkItems}
          selectedCell={activeCell}
          onSelectCell={onSelectCell}
        />
        <ChecklistDetailPanel
          phases={phases}
          modules={modules}
          checkItems={checkItems}
          selectedCell={activeCell}
          canWrite={canWrite}
        />
      </DashboardLayer>
      <DashboardLayer index="03" title="风险与签核">
        <KeyIssueTable issues={data.keyIssues} />
        <CollisionOnePager reports={data.collisionReports} />
      </DashboardLayer>
      <div className="dashboard-actionbar">
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Flag className="h-4 w-4 text-accent" />
          <span>默认 dashboard 已覆盖原型的阶段、模块、重点问题、碰撞一页纸、签核和附件入口。</span>
          {!canWrite ? <span className="text-warning">当前账号只读，不能生成导出任务。</span> : null}
        </div>
        <button
          className="btn btn-ghost btn--sm"
          type="button"
          disabled={!canWrite || !data.selectedProject}
          onClick={onCreateExport}
          title={!canWrite ? '当前账号无导出权限' : undefined}
        >
          <ArrowUpRight className="h-4 w-4" />
          生成总览导出
        </button>
      </div>
    </div>
  );
}

function SingleProjectStatistics({
  project,
  stat,
  phases,
  checkItems,
  embedded = false
}: {
  project: Project | null;
  stat?: ProjectStatistics;
  phases: ProjectPhase[];
  checkItems: CheckItem[];
  embedded?: boolean;
}) {
  const shellClass = embedded ? 'rounded-lg bg-surface p-4' : 'panel';
  if (!project || !stat) {
    return (
      <section className={shellClass}>
        <h2 className="text-lg font-semibold">单项目统计</h2>
        <p className="mt-3 text-sm text-ink-muted">请选择项目查看阶段和检查项统计。</p>
      </section>
    );
  }

  return (
    <section className={shellClass}>
      <div className="panel-header">
        <div>
          <p className="kicker">Single Project</p>
          <h2 className="text-lg font-semibold">{project.name}</h2>
          <p className="text-sm text-ink-muted">
            {formatDate(project.plannedStartDate)} 至 {formatDate(project.plannedEndDate)} · 当前阶段：{stat.currentPhaseName || '未开始'}
          </p>
        </div>
        <StatusPill status={project.status} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="完成率" value={percent(stat.completionRate)} detail={`${stat.completedCheckItemCount}/${stat.checkItemCount} 项完成`} />
        <MetricCard label="阶段数" value={stat.phaseCount} detail={`${phases.filter(phase => phase.isActive !== false).length} 个启用`} />
        <MetricCard label="风险检查项" value={stat.overdueCheckItemCount + stat.blockedCheckItemCount} detail={`${stat.overduePhaseCount} 阶段逾期 · ${stat.overdueCheckItemCount} 检查项逾期 · ${stat.blockedCheckItemCount} 阻塞`} />
        <MetricCard label="问题/导出" value={`${stat.openKeyIssueCount}/${stat.exportJobCount}`} detail={`${stat.pendingCollisionReportCount} 个碰撞待签`} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {bySequence(phases).map(phase => {
          const items = checkItems.filter(item => idOf(item.projectPhaseId) === idOf(phase.id));
          const rate = completionRateFor(items, phase.progressPercent);
          return (
            <div key={phase.id} className="rounded-lg border border-outline bg-surface-soft p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-ink">{phase.name}</div>
                  <div className="text-xs text-ink-muted">Key: {phase.code} · {formatDate(phase.plannedStartDate)} 至 {formatDate(phase.plannedEndDate)}</div>
                </div>
                <StatusPill status={phase.status} />
              </div>
              <div className="mt-3 h-2 rounded-full bg-surface-strong">
                <div className="h-2 rounded-full bg-primary" style={{ width: percent(rate) }} />
              </div>
              <div className="mt-2 text-xs text-ink-muted">{items.filter(item => isComplete(item.status)).length}/{items.length} 项完成</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ModuleSwimlane({
  phases,
  modules,
  checkItems,
  selectedCell,
  onSelectCell
}: {
  phases: ProjectPhase[];
  modules: InspectionModule[];
  checkItems: CheckItem[];
  selectedCell: DashboardCell | null;
  onSelectCell: (cell: DashboardCell) => void;
}) {
  const sortedPhases = bySequence(phases);
  const sortedModules = bySequence(modules);
  const gridTemplateColumns = `190px repeat(${Math.max(sortedPhases.length, 1)}, minmax(150px, 1fr))`;
  const itemsFor = (moduleId: string | number, phaseId: string | number) =>
    checkItems.filter(item => idOf(item.moduleId) === idOf(moduleId) && idOf(item.projectPhaseId) === idOf(phaseId));

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="kicker">Swimlane</p>
          <h2 className="text-lg font-semibold">检查模块泳道</h2>
        </div>
        <div className="chip">
          <Workflow className="h-3.5 w-3.5" />
          {sortedModules.length} 模块 · {sortedPhases.length} 阶段
        </div>
      </div>
      <div className="mt-4 overflow-x-auto rounded-lg border border-outline">
        <div className="min-w-[920px]">
          <div className="grid bg-surface-strong text-xs font-semibold text-ink-muted" style={{ gridTemplateColumns }}>
            <div className="border-r border-outline px-3 py-3">模块 / 阶段</div>
            {sortedPhases.map(phase => (
              <div key={phase.id} className="border-r border-outline px-3 py-3 text-center last:border-r-0">
                <div className="text-ink">{phase.name}</div>
                <div className="mt-1 font-normal text-ink-subtle">{formatDate(phase.plannedStartDate)} 至 {formatDate(phase.plannedEndDate)}</div>
                <div className="mt-1 font-normal">{percent(phase.progressPercent)}</div>
              </div>
            ))}
          </div>
          {sortedModules.map(module => (
            <div key={module.id} className="grid border-t border-outline" style={{ gridTemplateColumns }}>
              <div className="border-r border-outline bg-surface-soft px-3 py-3" style={{ borderLeft: `4px solid ${module.color || 'rgb(var(--accent))'}` }}>
                <div className="text-sm font-semibold text-ink">{module.name}</div>
                <div className="mt-1 text-xs text-ink-muted">{module.code}</div>
              </div>
              {sortedPhases.map(phase => {
                const items = itemsFor(module.id, phase.id);
                const done = items.filter(item => ['done', 'completed', 'pass', 'na', 'waived'].includes(item.status)).length;
                const selected = selectedCell?.moduleId === idOf(module.id) && selectedCell.phaseId === idOf(phase.id);
                const status = phaseStatusFromProgress(items.length ? (done / items.length) * 100 : 0);
                return (
                  <button
                    key={`${module.id}-${phase.id}`}
                    type="button"
                    className={`min-h-24 border-r border-outline px-3 py-3 text-left transition last:border-r-0 ${
                      selected ? 'bg-primary/15 ring-1 ring-inset ring-primary/50' : 'bg-surface hover:bg-surface-soft'
                    }`}
                    onClick={() => onSelectCell({ moduleId: idOf(module.id), phaseId: idOf(phase.id) })}
                  >
                    {items.length ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <StatusPill status={status} />
                          <span className="text-xs font-semibold text-ink">{done}/{items.length}</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {items.slice(0, 5).map(item => (
                            <span
                              key={item.id}
                              className={`h-2 w-2 rounded-full ${
                                phaseTone(item.status) === 'success'
                                  ? 'bg-success'
                                  : phaseTone(item.status) === 'danger'
                                    ? 'bg-danger'
                                    : phaseTone(item.status) === 'primary'
                                      ? 'bg-primary'
                                      : 'bg-warning'
                              }`}
                              title={item.title}
                            />
                          ))}
                        </div>
                        <div className="line-clamp-2 text-xs text-ink-muted">{items[0]?.title}</div>
                      </div>
                    ) : (
                      <div className="flex h-full min-h-16 items-center justify-center text-xs text-ink-subtle">未排期</div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ChecklistDetailPanel({
  phases,
  modules,
  checkItems,
  selectedCell,
  canWrite
}: {
  phases: ProjectPhase[];
  modules: InspectionModule[];
  checkItems: CheckItem[];
  selectedCell: DashboardCell | null;
  canWrite: boolean;
}) {
  const phase = phases.find(item => idOf(item.id) === selectedCell?.phaseId);
  const module = modules.find(item => idOf(item.id) === selectedCell?.moduleId);
  const items = checkItems.filter(
    item => idOf(item.moduleId) === selectedCell?.moduleId && idOf(item.projectPhaseId) === selectedCell?.phaseId
  );

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="kicker">Detail</p>
          <h2 className="text-lg font-semibold">{module && phase ? `${module.name} / ${phase.name}` : '检查清单详情'}</h2>
        </div>
        <button className="btn btn-ghost btn--sm" type="button" disabled={!canWrite}>
          <Paperclip className="h-4 w-4" />
          附件入口
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {items.length ? (
          items.map(item => (
            <article key={item.id} className="rounded-lg border border-outline bg-surface-soft p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-ink">{item.title}</div>
                  <div className="mt-1 text-xs text-ink-muted">{item.description || item.acceptanceCriteria}</div>
                </div>
                <StatusPill status={item.status} />
              </div>
              <div className="mt-3 grid gap-2 text-xs text-ink-muted sm:grid-cols-3">
                <span>负责人：{item.ownerName || '未设置'}</span>
                <span>计划：{formatDate(item.plannedStartDate)} 至 {formatDate(item.plannedEndDate)}</span>
                <span>进度：{percent(item.progressPercent)}</span>
              </div>
              <div className="mt-3">
                <AttachmentList attachments={item.attachments} />
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-outline bg-surface-soft p-6 text-sm text-ink-muted">
            该阶段模块暂无检查项，后续可从模板配置或项目阶段实例生成。
          </div>
        )}
      </div>
    </section>
  );
}

function KeyIssueTable({ issues }: { issues: KeyIssue[] }) {
  const [selectedIssueId, setSelectedIssueId] = useState('');

  useEffect(() => {
    setSelectedIssueId(idOf(issues[0]?.id));
  }, [issues]);

  const selectedIssue = issues.find(issue => idOf(issue.id) === selectedIssueId) ?? issues[0];
  const selectIssue = (issue: KeyIssue) => setSelectedIssueId(idOf(issue.id));

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="kicker">Key Issues</p>
          <h2 className="text-lg font-semibold">重点问题表</h2>
        </div>
        <span className="chip">{issues.length} 条</span>
      </div>
      {!issues.length ? <div className="mt-4"><EmptyState message="暂无重点问题。" /></div> : null}
      {issues.length ? (
        <div className="table-shell mt-4">
          <table className="data-table min-w-[1180px]">
            <thead>
              <tr>
                <th>序号</th>
                <th>问题描述</th>
                <th>问题照片</th>
                <th>对策</th>
                <th>整改完成时间</th>
                <th>供应商</th>
                <th>责任人</th>
                <th>确认人</th>
                <th>目前进度</th>
                <th>备注</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue, index) => {
                const selected = idOf(issue.id) === idOf(selectedIssue?.id);
                const handleSelect = () => selectIssue(issue);
                const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleSelect();
                  }
                };
                return (
                  <tr
                    key={issue.id}
                    className={`cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50 ${
                      selected ? 'bg-primary/10' : 'hover:bg-surface-soft'
                    }`}
                    tabIndex={0}
                    aria-selected={selected}
                    onClick={handleSelect}
                    onKeyDown={handleRowKeyDown}
                  >
                    <td>{index + 1}</td>
                    <td className="max-w-[260px]">{issue.description || issue.title}</td>
                    <td>
                      {issue.problemPhotoObjectKey || issue.problemPhoto ? (
                        <span className="chip max-w-[220px] truncate" title={[issue.problemPhotoBucketName, issue.problemPhotoObjectKey || issue.problemPhoto].filter(Boolean).join('/')}>
                          <FileText className="h-3.5 w-3.5" />
                          {issue.problemPhotoObjectKey || issue.problemPhoto}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="max-w-[240px]">{issue.countermeasure || issue.resolution || '-'}</td>
                    <td>{formatDate(issue.dueDate)}</td>
                    <td>{issue.supplier || '-'}</td>
                    <td>{issue.ownerName}</td>
                    <td>{issue.confirmer || '-'}</td>
                    <td><StatusPill status={issue.currentProgress || issue.status} /></td>
                    <td className="max-w-[180px]">{issue.remark || '-'}</td>
                    <td>
                      <button
                        className="btn btn-ghost btn--sm"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleSelect();
                        }}
                        aria-label={`查看重点问题 ${issue.title || issue.description} 详情`}
                        aria-pressed={selected}
                      >
                        <ArrowUpRight className="h-4 w-4" />
                        {selected ? '当前详情' : '查看详情'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {selectedIssue ? <KeyIssueDetail issue={selectedIssue} /> : null}
    </section>
  );
}

function DetailField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg border border-outline bg-surface p-3">
      <div className="text-xs font-semibold text-ink-muted">{label}</div>
      <div className={`mt-2 break-words text-sm text-ink ${mono ? 'font-mono text-xs' : ''}`}>{value}</div>
    </div>
  );
}

function KeyIssueDetail({ issue }: { issue: KeyIssue }) {
  const photoObjectKey = issue.problemPhotoObjectKey || issue.problemPhoto;
  return (
    <article className="mt-4 rounded-lg border border-outline bg-surface-soft p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="kicker">Issue Detail</p>
          <h3 className="text-base font-semibold text-ink">{issue.title || issue.description || '未命名问题'}</h3>
          <p className="mt-2 text-sm text-ink-muted">{issue.description || '-'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill status={issue.severity} />
          <StatusPill status={issue.status} />
        </div>
      </div>
      <div className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
        <DetailField label="问题照片 bucket" value={issue.problemPhotoBucketName || '-'} />
        <DetailField label="问题照片 object key" value={photoObjectKey || '-'} mono />
        <DetailField label="整改完成时间" value={formatDate(issue.dueDate)} />
        <DetailField label="供应商" value={issue.supplier || '-'} />
        <DetailField label="责任人" value={issue.ownerName || '未设置'} />
        <DetailField label="确认人" value={issue.confirmer || '-'} />
        <DetailField label="目前进度" value={issue.currentProgress || issue.status} />
        <DetailField label="关闭时间" value={formatDate(issue.closedAt)} />
        <DetailField label="备注" value={issue.remark || '-'} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-outline bg-surface p-3">
          <div className="text-xs font-semibold text-ink-muted">整改对策</div>
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{issue.countermeasure || issue.resolution || '-'}</p>
        </div>
        <div className="rounded-lg border border-outline bg-surface p-3">
          <div className="text-xs font-semibold text-ink-muted">附件列表</div>
          <div className="mt-2">
            <AttachmentList attachments={issue.attachments} />
          </div>
        </div>
      </div>
    </article>
  );
}

function ApprovalStatusList({ value }: { value: string }) {
  const approvals = value
    .split('/')
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => {
      const [name, status = 'pending'] = item.split(':').map(part => part.trim());
      return { name, status };
    });

  if (!approvals.length) return <span className="text-sm text-ink-muted">暂无签核槽位</span>;

  return (
    <div className="flex flex-wrap gap-2">
      {approvals.map(item => (
        <span key={`${item.name}-${item.status}`} className={`status-pill ${TONE_CLASS[phaseTone(item.status)]}`}>
          <ShieldCheck className="h-3.5 w-3.5" />
          {item.name} · {STATUS_LABEL[item.status] ?? item.status}
        </span>
      ))}
    </div>
  );
}

function CollisionOnePager({ reports }: { reports: CollisionReport[] }) {
  const report = reports[0];

  if (!report) {
    return (
      <section className="panel">
        <h2 className="text-lg font-semibold">碰撞一页纸</h2>
        <p className="mt-3 text-sm text-ink-muted">暂无一页纸报告。</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="kicker">制造工程重点问题一页纸报告</p>
          <h2 className="text-lg font-semibold">{report.title}</h2>
        </div>
        <StatusPill status={report.riskLevel} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border border-outline bg-surface-soft p-4">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <span><strong className="text-ink">问题定义：</strong>{report.problemDefinition}</span>
            <span><strong className="text-ink">涉及零件：</strong>{report.parts || '-'}</span>
            <span><strong className="text-ink">车型：</strong>{report.vehicleModel || '-'}</span>
            <span><strong className="text-ink">故障频次：</strong>{report.failureFrequency || '-'}</span>
            <span><strong className="text-ink">责任区域：</strong>{report.responsibilityArea || '-'}</span>
            <span><strong className="text-ink">负责人：</strong>{report.owner}</span>
          </div>
        </div>
        <div className="rounded-lg border border-outline bg-surface-soft p-4">
          <div className="text-xs font-semibold uppercase text-ink-muted">审批 / 签核状态</div>
          <div className="mt-3">
            <ApprovalStatusList value={report.approvalSignoff} />
          </div>
          <div className="mt-4">
            <AttachmentList attachments={report.attachments} />
          </div>
        </div>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-outline bg-surface-soft p-4">
          <div className="text-sm font-semibold text-primary">1. 问题描述</div>
          <p className="mt-2 text-sm text-ink-muted">{report.problemDescription || report.impact}</p>
        </div>
        <div className="rounded-lg border border-outline bg-surface-soft p-4">
          <div className="text-sm font-semibold text-primary">3. 原因分析</div>
          <p className="mt-2 text-sm text-ink-muted">{report.rootCause}</p>
        </div>
        <div className="rounded-lg border border-outline bg-surface-soft p-4">
          <div className="text-sm font-semibold text-primary">2. 诊断维修</div>
          <p className="mt-2 text-sm text-ink-muted">{report.diagnosisRepair || report.containment}</p>
        </div>
        <div className="rounded-lg border border-outline bg-surface-soft p-4">
          <div className="text-sm font-semibold text-primary">4/5. 措施与支持</div>
          <p className="mt-2 text-sm text-ink-muted">{report.correctiveAction}</p>
          <p className="mt-2 text-sm text-ink-muted">{report.supportNeeded || report.preventiveAction}</p>
        </div>
      </div>
    </section>
  );
}

function DashboardView({
  data,
  onOpenProject
}: {
  data: WorkspaceData;
  onOpenProject: (projectId: string | number, view: DashboardJumpTarget) => void;
}) {
  const [dashboardFilters, setDashboardFilters] = useState<SearchFilterState>(EMPTY_FILTERS);
  const projectStats = buildProjectStatistics(data);
  const filteredProjectStats = projectStats.filter(stat => projectStatMatchesFilters(stat, dashboardFilters));
  const projectStatusOptions = statusOptionValues(projectStats.map(stat => stat.projectStatus));

  return (
    <div className="grid gap-5">
      <PortfolioOverview summary={data.dashboardSummary} stats={projectStats} />
      <DashboardCharts summary={data.dashboardSummary} stats={projectStats} />
      <ProjectSummaryBoard
        stats={filteredProjectStats}
        projects={data.projects}
        selectedProjectId={data.selectedProject?.id}
        filters={dashboardFilters}
        onFiltersChange={setDashboardFilters}
        statusOptions={projectStatusOptions}
        onOpenProject={onOpenProject}
      />
    </div>
  );
}

function ProjectsView({
  projects,
  selectedProject,
  canWrite,
  onSelectProject,
  onCreateProject
}: {
  projects: Project[];
  selectedProject: Project | null;
  canWrite: boolean;
  onSelectProject: (projectId: string | number) => void;
  onCreateProject: () => void;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="kicker">Projects</p>
          <h2 className="text-xl font-semibold">项目列表</h2>
        </div>
        <button className="btn btn-primary" disabled={!canWrite} onClick={onCreateProject} type="button">
          <Plus className="h-4 w-4" />
          新建项目
        </button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {projects.map(project => (
          <button
            key={project.id}
            type="button"
            onClick={() => onSelectProject(project.id)}
            className={`rounded-lg border p-4 text-left transition hover:border-primary/60 ${
              selectedProject?.id === project.id ? 'border-primary bg-primary/10' : 'border-outline bg-surface-soft'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-ink">{project.name}</div>
                <div className="mt-1 text-xs text-ink-muted">{project.code}</div>
              </div>
              <StatusPill status={project.status} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-ink-muted">
              <span>{project.plant}</span>
              <span>{project.lineName}</span>
              <span>负责人：{project.ownerName}</span>
              <span>进度：{percent(project.progressPercent)}</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-surface-strong">
              <div className="h-2 rounded-full bg-accent" style={{ width: percent(project.progressPercent) }} />
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-primary">
              <ArrowUpRight className="h-3.5 w-3.5" />
              查看单项目统计
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function ProjectContextBar({
  projects,
  selectedProject,
  onSelectProject
}: {
  projects: Project[];
  selectedProject: Project | null;
  onSelectProject: (projectId: string | number) => void;
}) {
  return (
    <section className="project-context-bar">
      <div className="min-w-0">
        <p className="kicker">Current Project</p>
        <h2 className="truncate text-lg font-semibold text-ink">{selectedProject?.name ?? '未选择项目'}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          {selectedProject ? (
            <>
              <span>{selectedProject.code}</span>
              <span>{[selectedProject.plant, selectedProject.workshopName, selectedProject.lineName].filter(Boolean).join(' / ')}</span>
              <span>{formatDate(selectedProject.plannedStartDate)} 至 {formatDate(selectedProject.plannedEndDate)}</span>
            </>
          ) : (
            <span>暂无项目数据</span>
          )}
        </div>
      </div>
      <div className="project-context-controls">
        <label className="min-w-[260px] flex-1">
          <span className="field-label">项目筛选</span>
          <select
            className="select"
            value={idOf(selectedProject?.id)}
            onChange={event => onSelectProject(event.target.value)}
            disabled={!projects.length}
          >
            {!projects.length ? <option value="">暂无项目</option> : null}
            {projects.map(project => (
              <option key={project.id} value={idOf(project.id)}>
                {project.name} / {project.code}
              </option>
            ))}
          </select>
        </label>
        {selectedProject ? (
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={selectedProject.status} />
            <span className="chip">{percent(selectedProject.progressPercent)}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function OverviewView({
  project,
  phases,
  checkItems,
  keyIssues,
  exportTasks
}: {
  project: Project | null;
  phases: ProjectPhase[];
  checkItems: CheckItem[];
  keyIssues: KeyIssue[];
  exportTasks: ExportTask[];
}) {
  const blockedChecks = checkItems.filter(item => item.status === 'blocked').length;
  const openIssues = keyIssues.filter(issue => !issue.closedAt).length;
  const runningExports = exportTasks.filter(task => ['queued', 'running'].includes(task.status)).length;

  return (
    <div className="grid gap-5">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="kicker">Overview</p>
            <h2 className="text-xl font-semibold">{project?.name ?? '未选择项目'}</h2>
            <p className="text-sm text-ink-muted">{project?.description ?? '暂无项目数据'}</p>
          </div>
          {project ? <StatusPill status={project.status} /> : null}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="项目进度" value={project ? percent(project.progressPercent) : '-'} detail="来自项目汇总接口" />
          <MetricCard label="阶段数量" value={phases.length} detail="由 API 阶段实例驱动" />
          <MetricCard label="阻塞检查项" value={blockedChecks} detail={`${checkItems.length} 个检查项`} />
          <MetricCard label="待处理问题" value={openIssues} detail={`${runningExports} 个导出任务运行中`} />
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h3 className="text-lg font-semibold">阶段概览</h3>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {bySequence(phases).map(phase => (
            <div key={phase.id} className="rounded-lg border border-outline bg-surface-soft p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-ink">{phase.name}</div>
                  <div className="text-xs text-ink-muted">{phase.goal}</div>
                </div>
                <StatusPill status={phase.status} />
              </div>
              <div className="mt-3 h-2 rounded-full bg-surface-strong">
                <div className="h-2 rounded-full bg-primary" style={{ width: percent(phase.progressPercent) }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function PhasesView({ data }: { data: WorkspaceData }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <section className="panel">
        <div className="panel-header">
          <h2 className="text-xl font-semibold">项目阶段实例</h2>
        </div>
        <div className="mt-4 space-y-3">
          {bySequence(data.phases).map(phase => (
            <div key={phase.id} className="rounded-lg border border-outline bg-surface-soft p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-ink">{phase.name}</div>
                  <div className="text-xs text-ink-muted">{phase.code}</div>
                </div>
                <StatusPill status={phase.status} />
              </div>
              <p className="mt-3 text-sm text-ink-muted">{phase.goal}</p>
              <div className="mt-3 grid gap-2 text-xs text-ink-muted sm:grid-cols-3">
                <span>计划：{formatDate(phase.plannedStartDate)} 至 {formatDate(phase.plannedEndDate)}</span>
                <span>实际开始：{formatDate(phase.actualStartAt)}</span>
                <span>进度：{percent(phase.progressPercent)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2 className="text-xl font-semibold">阶段模板</h2>
        </div>
        <div className="mt-4 space-y-3">
          {bySequence(data.phaseTemplates).map(template => (
            <div key={template.id} className="rounded-lg border border-outline bg-surface-soft p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-ink">{template.name}</span>
                <span className="chip">{template.code}</span>
              </div>
              <div className="mt-2 text-xs text-ink-muted">{template.defaultGoal}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function TimelineView({
  project,
  phases,
  checkItems,
  modules
}: {
  project: Project | null;
  phases: ProjectPhase[];
  checkItems: CheckItem[];
  modules: InspectionModule[];
}) {
  const [filters, setFilters] = useState<SearchFilterState>(EMPTY_FILTERS);
  const sorted = activePhasesOf(phases);
  const today = formatLocalDate(new Date());
  const phaseById = new Map(sorted.map(phase => [idOf(phase.id), phase]));
  const filteredCheckItems = checkItems.filter(item => {
    const phase = phaseById.get(idOf(item.projectPhaseId));
    if (!phase) return false;
    if (filters.phaseId && idOf(item.projectPhaseId) !== filters.phaseId) return false;
    if (filters.moduleId && idOf(item.moduleId) !== filters.moduleId) return false;
    if (filters.status && item.status !== filters.status) return false;
    if (filters.owner && !textMatches(filters.owner, [item.ownerName, item.ownerIdaasId])) return false;
    if (!textMatches(filters.keyword, [item.title, item.description, item.acceptanceCriteria, item.ownerName, phase?.name])) return false;
    return dateRangeMatches(item.plannedStartDate, item.plannedEndDate, filters.startDate, filters.endDate);
  });
  const filteredItemPhaseIds = new Set(filteredCheckItems.map(item => idOf(item.projectPhaseId)));
  const visiblePhases = sorted.filter(phase => {
    if (filters.phaseId && idOf(phase.id) !== filters.phaseId) return false;
    if (filters.status && phase.status !== filters.status && !filteredItemPhaseIds.has(idOf(phase.id))) return false;
    if (!textMatches(filters.keyword, [phase.name, phase.code, phase.goal]) && !filteredItemPhaseIds.has(idOf(phase.id))) return false;
    if (!dateRangeMatches(phase.plannedStartDate, phase.plannedEndDate, filters.startDate, filters.endDate) && !filteredItemPhaseIds.has(idOf(phase.id))) return false;
    return true;
  });
  const dates = [
    project?.plannedStartDate,
    project?.plannedEndDate,
    ...visiblePhases.flatMap(phase => [phase.plannedStartDate, phase.plannedEndDate]),
    ...filteredCheckItems.flatMap(item => [item.plannedStartDate, item.plannedEndDate])
  ].map(dateMs).filter((value): value is number => value !== null);
  const fallbackStart = dateMs(today) ?? Date.now();
  const rangeStart = dates.length ? Math.min(...dates) : fallbackStart;
  const rangeEnd = dates.length ? Math.max(...dates) : fallbackStart + 7 * DAY_MS;
  const paddedStart = rangeStart - DAY_MS;
  const paddedEnd = rangeEnd + DAY_MS;
  const totalDays = Math.max(1, Math.round((paddedEnd - paddedStart) / DAY_MS) + 1);
  const todayMs = dateMs(today);
  const todayPosition = todayMs === null ? null : ((todayMs - paddedStart) / (totalDays * DAY_MS)) * 100;
  const showToday = todayPosition !== null && todayPosition >= 0 && todayPosition <= 100;
  const moduleById = new Map(modules.map(module => [idOf(module.id), module]));
  const weekStart = startOfIsoWeekMs(paddedStart);
  const weekEnd = startOfIsoWeekMs(paddedEnd);
  const weekTicks = [];
  for (let value = weekStart; value <= weekEnd; value += 7 * DAY_MS) {
    const left = ((value - paddedStart) / (totalDays * DAY_MS)) * 100;
    weekTicks.push({
      left: `${Math.max(0, Math.min(100, left))}%`,
      label: formatWeekLabelFromMs(value)
    });
  }
  const ticks = weekTicks.length ? weekTicks : [{ left: '0%', label: formatWeekLabelFromMs(paddedStart) }];
  const rangeStyle = (startDate?: string, endDate?: string) => {
    const start = dateMs(startDate) ?? paddedStart;
    const end = dateMs(endDate) ?? start;
    const left = ((start - paddedStart) / (totalDays * DAY_MS)) * 100;
    const width = ((Math.max(end, start) - start) / DAY_MS + 1) / totalDays * 100;
    return {
      left: `${Math.max(0, Math.min(100, left))}%`,
      width: `${Math.max(1.5, Math.min(100, width))}%`
    };
  };
  const itemClass = (item: CheckItem) => {
    if (isComplete(item.status)) return 'bg-success text-white';
    if (isBlocked(item.status) || isOverdue(item.plannedEndDate, item.status, today)) return 'bg-danger text-white';
    if (['in_progress', 'active'].includes(item.status)) return 'bg-primary text-white';
    return 'bg-warning text-surface-inverse';
  };
  const phaseStatusOptions = statusOptionValues(sorted.map(phase => phase.status));
  const checkStatusOptions = statusOptionValues(checkItems.map(item => item.status));
  const timelineStatusOptions = statusOptionValues([...phaseStatusOptions, ...checkStatusOptions]);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="kicker">Time Gantt</p>
          <h2 className="text-xl font-semibold">时间甘特</h2>
          <p className="text-sm text-ink-muted">阶段和检查项均按计划开始/结束时间计算位置，横轴按周展示。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="chip"><Clock3 className="h-3.5 w-3.5" />当前日期 {today}</span>
          <span className="chip">周期 {formatWeekRangeText(formatLocalDate(new Date(paddedStart)), formatLocalDate(new Date(paddedEnd)))}</span>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="status-pill border-success/40 bg-success/10 text-success">完成</span>
        <span className="status-pill border-primary/40 bg-primary/10 text-primary">进行中</span>
        <span className="status-pill border-danger/40 bg-danger/10 text-danger">阻塞/逾期</span>
        <span className="status-pill border-warning/40 bg-warning/10 text-warning">未开始</span>
      </div>
      <div className="mt-4">
        <FilterShell>
          <label className="xl:col-span-2">
            <span className="field-label">关键字</span>
            <input className="input" value={filters.keyword} onChange={event => setFilters({ ...filters, keyword: event.target.value })} placeholder="阶段、检查项、负责人" aria-label="时间甘特关键字筛选" />
          </label>
          <label>
            <span className="field-label">阶段</span>
            <select className="select" value={filters.phaseId} onChange={event => setFilters({ ...filters, phaseId: event.target.value })}>
              <option value="">全部阶段</option>
              {sorted.map(phase => <option key={phase.id} value={idOf(phase.id)}>{phase.name}</option>)}
            </select>
          </label>
          <label>
            <span className="field-label">模块</span>
            <select className="select" value={filters.moduleId} onChange={event => setFilters({ ...filters, moduleId: event.target.value })}>
              <option value="">全部模块</option>
              {bySequence(modules).map(module => <option key={module.id} value={idOf(module.id)}>{module.name}</option>)}
            </select>
          </label>
          <label>
            <span className="field-label">状态</span>
            <select className="select" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}>
              <option value="">全部状态</option>
              {timelineStatusOptions.map(status => <option key={status} value={status}>{STATUS_LABEL[status] ?? status}</option>)}
            </select>
          </label>
          <label>
            <span className="field-label">负责人</span>
            <input className="input" value={filters.owner} onChange={event => setFilters({ ...filters, owner: event.target.value })} placeholder="负责人" aria-label="时间甘特负责人筛选" />
          </label>
          <label>
            <span className="field-label">开始日期</span>
            <input className="input" type="date" value={filters.startDate} onChange={event => setFilters({ ...filters, startDate: event.target.value })} />
          </label>
          <label>
            <span className="field-label">结束日期</span>
            <input className="input" type="date" value={filters.endDate} onChange={event => setFilters({ ...filters, endDate: event.target.value })} />
          </label>
        </FilterShell>
      </div>
      {!visiblePhases.length ? <div className="mt-4"><EmptyState message="当前筛选下暂无甘特数据。" /></div> : null}
      <div className="mt-5 overflow-x-auto rounded-lg border border-outline">
        <div className="min-w-[1040px]">
          <div className="grid border-b border-outline bg-surface-strong text-xs font-semibold text-ink-muted lg:grid-cols-[240px_1fr]">
            <div className="border-r border-outline px-3 py-3">阶段</div>
            <div className="relative px-3 py-3">
              <div className="relative h-7">
                {ticks.map(tick => (
                  <div key={tick.label} className="absolute top-0 -translate-x-1/2 text-center" style={{ left: tick.left }}>
                    <div className="mx-auto h-2 w-px bg-outline" />
                    <div className="mt-1 whitespace-nowrap">{tick.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {visiblePhases.map(phase => {
            const items = filteredCheckItems.filter(item => idOf(item.projectPhaseId) === idOf(phase.id));
            const rowHeight = Math.max(108, 74 + items.length * 24);
            return (
              <div key={phase.id} className="grid border-b border-outline last:border-b-0 lg:grid-cols-[240px_1fr]">
                <div className="border-r border-outline bg-surface-soft px-3 py-4" style={{ minHeight: rowHeight }}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-ink">{phase.name}</div>
                      <div className="mt-1 text-xs text-ink-muted">Key: {phase.code}</div>
                    </div>
                    <StatusPill status={phase.status} />
                  </div>
                  <div className="mt-3 text-xs text-ink-muted">
                    周期：{formatWeekRangeText(phase.plannedStartDate, phase.plannedEndDate)}
                  </div>
                  <div className="mt-2 text-xs text-ink-subtle">{items.length} 个检查项 · {percent(phase.progressPercent)}</div>
                </div>
                <div className="relative bg-surface px-3 py-4" style={{ minHeight: rowHeight }}>
                  {ticks.map(tick => (
                    <div key={`${phase.id}-${tick.label}`} className="absolute bottom-0 top-0 w-px bg-outline/50" style={{ left: tick.left }} />
                  ))}
                  {showToday ? (
                    <div className="absolute bottom-0 top-0 z-10 w-px bg-danger" style={{ left: `${todayPosition}%` }}>
                      <span className="absolute -top-1 left-1 rounded-full bg-danger px-2 py-0.5 text-[11px] font-semibold text-white">
                        今天
                      </span>
                    </div>
                  ) : null}
                  <div
                    className="absolute top-5 h-7 rounded-lg border border-primary/40 bg-primary/20"
                    style={rangeStyle(phase.plannedStartDate, phase.plannedEndDate)}
                    title={`${phase.name}: ${formatWeekRangeText(phase.plannedStartDate, phase.plannedEndDate)} · ${formatDate(phase.plannedStartDate)} 至 ${formatDate(phase.plannedEndDate)}`}
                  >
                    <div className="h-full rounded-lg bg-primary/50" style={{ width: percent(phase.progressPercent) }} />
                  </div>
                  {items.map((item, index) => {
                    const module = moduleById.get(idOf(item.moduleId));
                    const overdue = isOverdue(item.plannedEndDate, item.status, today);
                    return (
                      <div
                        key={item.id}
                        className={`absolute h-4 overflow-hidden rounded-full px-2 text-[11px] font-semibold leading-4 shadow-sm ${itemClass(item)}`}
                        style={{ ...rangeStyle(item.plannedStartDate, item.plannedEndDate), top: 58 + index * 24 }}
                        title={`${item.title} · ${module?.name ?? '未设置模块'} · ${formatWeekRangeText(item.plannedStartDate, item.plannedEndDate)} · ${formatDate(item.plannedStartDate)} 至 ${formatDate(item.plannedEndDate)} · ${overdue ? '逾期' : STATUS_LABEL[item.status] ?? item.status}`}
                      >
                        <span className="block truncate">
                          {overdue ? '逾期 · ' : ''}{module?.name ?? '模块'} / {item.title}
                        </span>
                      </div>
                    );
                  })}
                  {!items.length ? (
                    <div className="absolute left-3 right-3 top-16 rounded-lg border border-dashed border-outline bg-surface-soft px-3 py-4 text-center text-xs text-ink-muted">
                      该阶段暂无检查项。
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ChecksView({
  checkItems,
  phases,
  modules,
  ownerCandidates,
  canWrite,
  defaultOwnerName,
  onCreateCheckItem,
  onUpdateOwner
}: {
  checkItems: CheckItem[];
  phases: ProjectPhase[];
  modules: InspectionModule[];
  ownerCandidates: OwnerCandidate[];
  canWrite: boolean;
  defaultOwnerName: string;
  onCreateCheckItem: (draft: CheckItemConfigDraft) => Promise<void>;
  onUpdateOwner: (item: CheckItem, ownerName: string, ownerIdaasId?: string) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, { ownerName: string; ownerIdaasId?: string }>>({});
  const [filters, setFilters] = useState<SearchFilterState>(EMPTY_FILTERS);
  const [newDraft, setNewDraft] = useState<CheckItemConfigDraft | null>(null);
  const [createMessage, setCreateMessage] = useState('');
  const [savingCreate, setSavingCreate] = useState(false);
  const visiblePhases = activePhasesOf(phases);
  const orderedModules = bySequence(modules);
  const visiblePhaseKey = visiblePhases.map(phase => idOf(phase.id)).join('|');
  const moduleKey = orderedModules.map(module => idOf(module.id)).join('|');
  const defaultPhase = visiblePhases[0];
  const defaultModule = orderedModules[0];
  const phaseById = new Map(visiblePhases.map(phase => [`${phase.id}`, phase]));
  const moduleById = new Map(modules.map(module => [`${module.id}`, module]));
  const filteredCheckItems = checkItems.filter(item => {
    const phase = phaseById.get(idOf(item.projectPhaseId));
    const module = moduleById.get(idOf(item.moduleId));
    if (!phase) return false;
    if (filters.phaseId && idOf(item.projectPhaseId) !== filters.phaseId) return false;
    if (filters.moduleId && idOf(item.moduleId) !== filters.moduleId) return false;
    if (filters.status && item.status !== filters.status) return false;
    if (filters.owner && !textMatches(filters.owner, [item.ownerName, item.ownerIdaasId])) return false;
    if (filters.activeState === 'enabled' && item.isActive === false) return false;
    if (filters.activeState === 'disabled' && item.isActive !== false) return false;
    if (!textMatches(filters.keyword, [item.title, item.description, item.acceptanceCriteria, item.ownerName, phase?.name, module?.name])) return false;
    return dateRangeMatches(item.plannedStartDate, item.plannedEndDate, filters.startDate, filters.endDate);
  });
  const statusOptions = statusOptionValues(checkItems.map(item => item.status));
  const selectedNewPhase = visiblePhases.find(phase => idOf(phase.id) === newDraft?.projectPhaseId) ?? defaultPhase;
  const selectedNewModule = orderedModules.find(module => idOf(module.id) === newDraft?.moduleId) ?? defaultModule;
  const createDisabledReason = !canWrite
    ? '当前账号只读，写操作已禁用。'
    : !newDraft?.title.trim()
      ? '请先输入检查项标题。'
      : !newDraft?.projectPhaseId
        ? '请先选择阶段。'
        : !newDraft?.moduleId
          ? '请先选择模块。'
          : '';

  useEffect(() => {
    if (!defaultPhase || !defaultModule) {
      setNewDraft(null);
      return;
    }
    setNewDraft(current => {
      const currentPhaseExists = current && visiblePhases.some(phase => idOf(phase.id) === current.projectPhaseId);
      const currentModuleExists = current && orderedModules.some(module => idOf(module.id) === current.moduleId);
      if (currentPhaseExists && currentModuleExists) return current;
      return {
        title: '',
        moduleId: idOf(defaultModule.id),
        projectPhaseId: idOf(defaultPhase.id),
        tags: '',
        plannedStartDate: dateInputValue(defaultPhase.plannedStartDate),
        plannedEndDate: dateInputValue(defaultPhase.plannedEndDate),
        ownerName: defaultOwnerName,
        ownerIdaasId: undefined,
        status: 'pending',
        isActive: true
      };
    });
  }, [defaultPhase?.id, defaultModule?.id, defaultOwnerName, visiblePhaseKey, moduleKey]);

  const handleCreate = async () => {
    if (!newDraft) return;
    if (createDisabledReason) {
      setCreateMessage(createDisabledReason);
      return;
    }
    setSavingCreate(true);
    setCreateMessage('');
    try {
      await onCreateCheckItem(newDraft);
      setNewDraft({
        ...newDraft,
        title: '',
        tags: '',
        plannedStartDate: dateInputValue(selectedNewPhase?.plannedStartDate),
        plannedEndDate: dateInputValue(selectedNewPhase?.plannedEndDate),
        ownerName: newDraft.ownerName || defaultOwnerName,
        status: 'pending',
        isActive: true
      });
      setCreateMessage('已新增检查项。');
    } catch (err) {
      setCreateMessage(mutationErrorMessage(err, '检查项新增失败。'));
    } finally {
      setSavingCreate(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2 className="text-xl font-semibold">检查项表格</h2>
          <p className="text-sm text-ink-muted">支持新增检查项、筛选台账和维护负责人。</p>
        </div>
        <ReadOnlyNotice canWrite={canWrite} />
      </div>
      {newDraft ? (
        <div className="mt-4 rounded-lg border border-outline bg-surface-soft p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-ink">新增检查项</div>
              <div className="text-xs text-ink-muted">默认归属 {selectedNewPhase?.name ?? '当前阶段'} / {selectedNewModule?.name ?? '当前模块'}。</div>
            </div>
            {createMessage ? <span className="text-sm text-ink-muted">{createMessage}</span> : null}
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-4">
            <label className="lg:col-span-2">
              <span className="field-label">检查项标题</span>
              <input
                className="input"
                value={newDraft.title}
                disabled={!canWrite}
                onChange={event => setNewDraft({ ...newDraft, title: event.target.value })}
                placeholder="输入检查项标题"
                aria-label="检查项页面新增标题"
              />
            </label>
            <label>
              <span className="field-label">阶段</span>
              <select
                className="select"
                value={newDraft.projectPhaseId}
                disabled={!canWrite}
                onChange={event => {
                  const phase = visiblePhases.find(item => idOf(item.id) === event.target.value);
                  setNewDraft({
                    ...newDraft,
                    projectPhaseId: event.target.value,
                    plannedStartDate: dateInputValue(phase?.plannedStartDate),
                    plannedEndDate: dateInputValue(phase?.plannedEndDate)
                  });
                }}
              >
                {visiblePhases.map(phase => <option key={phase.id} value={idOf(phase.id)}>{phase.name}</option>)}
              </select>
            </label>
            <label>
              <span className="field-label">模块</span>
              <select className="select" value={newDraft.moduleId} disabled={!canWrite} onChange={event => setNewDraft({ ...newDraft, moduleId: event.target.value })}>
                {orderedModules.map(module => <option key={module.id} value={idOf(module.id)}>{module.name}</option>)}
              </select>
            </label>
            <label>
              <span className="field-label">标签</span>
              <input className="input" value={newDraft.tags} disabled={!canWrite} onChange={event => setNewDraft({ ...newDraft, tags: event.target.value })} placeholder="逗号分隔" />
            </label>
            <label>
              <span className="field-label">计划开始</span>
              <input className="input" type="date" value={newDraft.plannedStartDate} disabled={!canWrite} onChange={event => setNewDraft({ ...newDraft, plannedStartDate: event.target.value })} />
            </label>
            <label>
              <span className="field-label">计划结束</span>
              <input className="input" type="date" value={newDraft.plannedEndDate} disabled={!canWrite} onChange={event => setNewDraft({ ...newDraft, plannedEndDate: event.target.value })} />
            </label>
            <label>
              <span className="field-label">负责人</span>
              <input className="input" list="checks-owner-candidates" value={newDraft.ownerName} disabled={!canWrite} onChange={event => setNewDraft({ ...newDraft, ownerName: event.target.value })} />
              <datalist id="checks-owner-candidates">
                {ownerCandidates.map(owner => <option key={owner.idaasId} value={owner.displayName} />)}
              </datalist>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              className="btn btn-primary btn--sm"
              type="button"
              disabled={savingCreate}
              onClick={() => void handleCreate()}
              aria-label="在检查项页面新增检查项"
              title={createDisabledReason || undefined}
            >
              <Plus className="h-4 w-4" />
              {savingCreate ? '新增中' : '新增检查项'}
            </button>
            {createDisabledReason ? <span className="text-xs text-ink-muted">{createDisabledReason}</span> : null}
          </div>
        </div>
      ) : null}
      <div className="mt-4">
        <FilterShell>
          <label className="xl:col-span-2">
            <span className="field-label">关键字</span>
            <input className="input" value={filters.keyword} onChange={event => setFilters({ ...filters, keyword: event.target.value })} placeholder="检查项、阶段、模块" aria-label="检查项关键字筛选" />
          </label>
          <label>
            <span className="field-label">阶段</span>
            <select className="select" value={filters.phaseId} onChange={event => setFilters({ ...filters, phaseId: event.target.value })}>
              <option value="">全部阶段</option>
              {visiblePhases.map(phase => <option key={phase.id} value={idOf(phase.id)}>{phase.name}</option>)}
            </select>
          </label>
          <label>
            <span className="field-label">模块</span>
            <select className="select" value={filters.moduleId} onChange={event => setFilters({ ...filters, moduleId: event.target.value })}>
              <option value="">全部模块</option>
              {orderedModules.map(module => <option key={module.id} value={idOf(module.id)}>{module.name}</option>)}
            </select>
          </label>
          <label>
            <span className="field-label">状态</span>
            <select className="select" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}>
              <option value="">全部状态</option>
              {statusOptions.map(status => <option key={status} value={status}>{STATUS_LABEL[status] ?? status}</option>)}
            </select>
          </label>
          <label>
            <span className="field-label">负责人</span>
            <input className="input" value={filters.owner} onChange={event => setFilters({ ...filters, owner: event.target.value })} placeholder="负责人" aria-label="检查项负责人筛选" />
          </label>
          <label>
            <span className="field-label">启用状态</span>
            <select className="select" value={filters.activeState} onChange={event => setFilters({ ...filters, activeState: event.target.value })}>
              <option value="">全部</option>
              <option value="enabled">启用</option>
              <option value="disabled">停用</option>
            </select>
          </label>
          <label>
            <span className="field-label">开始日期</span>
            <input className="input" type="date" value={filters.startDate} onChange={event => setFilters({ ...filters, startDate: event.target.value })} />
          </label>
          <label>
            <span className="field-label">结束日期</span>
            <input className="input" type="date" value={filters.endDate} onChange={event => setFilters({ ...filters, endDate: event.target.value })} />
          </label>
        </FilterShell>
      </div>
      {!filteredCheckItems.length ? <div className="mt-4"><EmptyState message="当前筛选下暂无检查项。" /></div> : null}
      <div className="table-shell mt-4">
        <table className="data-table">
          <thead>
            <tr>
              <th>检查项</th>
              <th>阶段</th>
              <th>模块</th>
              <th>负责人</th>
              <th>计划</th>
              <th>状态</th>
              <th>附件</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredCheckItems.map(item => {
              const draft = drafts[`${item.id}`] ?? {
                ownerName: item.ownerName,
                ownerIdaasId: item.ownerIdaasId
              };
              return (
                <tr key={item.id}>
                  <td className="max-w-[280px]">
                    <div className="font-semibold">{item.title}</div>
                    <div className="mt-1 text-xs text-ink-muted">{item.acceptanceCriteria}</div>
                  </td>
                  <td>{phaseById.get(`${item.projectPhaseId}`)?.name ?? '-'}</td>
                  <td>{moduleById.get(`${item.moduleId}`)?.name ?? '-'}</td>
                  <td className="min-w-[220px]">
                    <select
                      className="select mb-2"
                      value={draft.ownerIdaasId ?? 'free'}
                      disabled={!canWrite}
                      onChange={event => {
                        const candidate = ownerCandidates.find(owner => owner.idaasId === event.target.value);
                        setDrafts(current => ({
                          ...current,
                          [`${item.id}`]: candidate
                            ? { ownerName: candidate.displayName, ownerIdaasId: candidate.idaasId }
                            : { ownerName: draft.ownerName, ownerIdaasId: undefined }
                        }));
                      }}
                    >
                      <option value="free">自由输入</option>
                      {ownerCandidates.map(owner => (
                        <option key={owner.idaasId} value={owner.idaasId}>
                          {owner.displayName} / {owner.department ?? owner.email ?? owner.idaasId}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input"
                      value={draft.ownerName}
                      disabled={!canWrite}
                      onChange={event =>
                        setDrafts(current => ({
                          ...current,
                          [`${item.id}`]: { ownerName: event.target.value, ownerIdaasId: draft.ownerIdaasId }
                        }))
                      }
                    />
                  </td>
                  <td>{formatDate(item.plannedStartDate)} 至 {formatDate(item.plannedEndDate)}</td>
                  <td><StatusPill status={item.status} /></td>
                  <td className="min-w-[260px]"><AttachmentList attachments={item.attachments} /></td>
                  <td>
                    <button
                      className="btn btn-primary btn--sm"
                      type="button"
                      disabled={!canWrite}
                      onClick={() => onUpdateOwner(item, draft.ownerName, draft.ownerIdaasId)}
                    >
                      <Save className="h-4 w-4" />
                      保存
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function IssuesView({ issues, phases }: { issues: KeyIssue[]; phases: ProjectPhase[] }) {
  const [filters, setFilters] = useState<SearchFilterState>(EMPTY_FILTERS);
  const filteredIssues = issues.filter(issue => {
    if (filters.phaseId && idOf(issue.projectPhaseId) !== filters.phaseId) return false;
    if (filters.status && issue.status !== filters.status && issue.currentProgress !== filters.status) return false;
    if (filters.severity && issue.severity !== filters.severity) return false;
    if (filters.owner && !textMatches(filters.owner, [issue.ownerName, issue.confirmer])) return false;
    if (!textMatches(filters.keyword, [issue.title, issue.description, issue.countermeasure, issue.supplier, issue.ownerName, issue.confirmer, issue.currentProgress, issue.remark])) return false;
    return dateRangeMatches(issue.dueDate, issue.dueDate, filters.startDate, filters.endDate);
  });
  const statusOptions = statusOptionValues(issues.flatMap(issue => [issue.status, issue.currentProgress ?? '']));
  const severityOptions = statusOptionValues(issues.map(issue => issue.severity));
  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="text-xl font-semibold">重点问题</h2>
        <span className="chip">{filteredIssues.length}/{issues.length} 条</span>
      </div>
      <div className="mt-4">
        <FilterShell>
          <label className="xl:col-span-2">
            <span className="field-label">关键字</span>
            <input className="input" value={filters.keyword} onChange={event => setFilters({ ...filters, keyword: event.target.value })} placeholder="问题、对策、供应商" aria-label="重点问题关键字筛选" />
          </label>
          <label>
            <span className="field-label">阶段</span>
            <select className="select" value={filters.phaseId} onChange={event => setFilters({ ...filters, phaseId: event.target.value })}>
              <option value="">全部阶段</option>
              {bySequence(phases).map(phase => <option key={phase.id} value={idOf(phase.id)}>{phase.name}</option>)}
            </select>
          </label>
          <label>
            <span className="field-label">状态</span>
            <select className="select" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}>
              <option value="">全部状态</option>
              {statusOptions.map(status => <option key={status} value={status}>{STATUS_LABEL[status] ?? status}</option>)}
            </select>
          </label>
          <label>
            <span className="field-label">风险等级</span>
            <select className="select" value={filters.severity} onChange={event => setFilters({ ...filters, severity: event.target.value })}>
              <option value="">全部等级</option>
              {severityOptions.map(severity => <option key={severity} value={severity}>{STATUS_LABEL[severity] ?? severity}</option>)}
            </select>
          </label>
          <label>
            <span className="field-label">负责人/确认人</span>
            <input className="input" value={filters.owner} onChange={event => setFilters({ ...filters, owner: event.target.value })} placeholder="负责人" aria-label="重点问题负责人筛选" />
          </label>
          <label>
            <span className="field-label">截止起</span>
            <input className="input" type="date" value={filters.startDate} onChange={event => setFilters({ ...filters, startDate: event.target.value })} />
          </label>
          <label>
            <span className="field-label">截止止</span>
            <input className="input" type="date" value={filters.endDate} onChange={event => setFilters({ ...filters, endDate: event.target.value })} />
          </label>
        </FilterShell>
      </div>
      {!filteredIssues.length ? <div className="mt-4"><EmptyState message="当前筛选下暂无重点问题。" /></div> : null}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {filteredIssues.map(issue => (
          <article key={issue.id} className="rounded-lg border border-outline bg-surface-soft p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-semibold">{issue.title}</h3>
              <StatusPill status={issue.severity} />
            </div>
            <p className="mt-2 text-sm text-ink-muted">{issue.description}</p>
            <div className="mt-4 grid gap-2 text-xs text-ink-muted sm:grid-cols-3">
              <span>状态：{issue.status}</span>
              <span>负责人：{issue.ownerName}</span>
              <span>截止：{formatDate(issue.dueDate)}</span>
              <span>供应商：{issue.supplier || '-'}</span>
              <span>确认人：{issue.confirmer || '-'}</span>
              <span>进度：{issue.currentProgress || issue.status}</span>
            </div>
            <p className="mt-3 text-xs text-ink-muted">对策：{issue.countermeasure || issue.resolution || '-'}</p>
            <p className="mt-1 text-xs text-ink-muted">备注：{issue.remark || '-'}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function CollisionView({ reports, phases }: { reports: CollisionReport[]; phases: ProjectPhase[] }) {
  const [filters, setFilters] = useState<SearchFilterState>(EMPTY_FILTERS);
  const fields: Array<[keyof CollisionReport, string]> = [
    ['problemDefinition', '问题定义'],
    ['parts', '涉及零件'],
    ['vehicleModel', '车型'],
    ['failureFrequency', '故障频次'],
    ['responsibilityArea', '责任区域'],
    ['progress', '问题进展'],
    ['remark', '备注'],
    ['problemDescription', '1 问题描述'],
    ['diagnosisRepair', '2 诊断维修'],
    ['rootCause', '3 原因分析'],
    ['correctiveAction', '4 制定措施'],
    ['supportNeeded', '5 所需支持'],
    ['approvalSignoff', '签核槽位']
  ];
  const filteredReports = reports.filter(report => {
    if (filters.phaseId && idOf(report.projectPhaseId) !== filters.phaseId) return false;
    if (filters.status && report.status !== filters.status) return false;
    if (filters.severity && report.riskLevel !== filters.severity) return false;
    if (filters.owner && !textMatches(filters.owner, [report.owner])) return false;
    if (!textMatches(filters.keyword, [report.title, report.problemDefinition, report.parts, report.vehicleModel, report.responsibilityArea, report.progress, report.owner, report.rootCause, report.correctiveAction])) return false;
    return dateRangeMatches(report.dueDate, report.updatedAt, filters.startDate, filters.endDate);
  });
  const statusOptions = statusOptionValues(reports.map(report => report.status));
  const riskOptions = statusOptionValues(reports.map(report => report.riskLevel));

  return (
    <div className="grid gap-5">
      <section className="panel">
        <div className="panel-header">
          <h2 className="text-xl font-semibold">碰撞一页纸筛选</h2>
          <span className="chip">{filteredReports.length}/{reports.length} 份</span>
        </div>
        <div className="mt-4">
          <FilterShell>
            <label className="xl:col-span-2">
              <span className="field-label">关键字</span>
              <input className="input" value={filters.keyword} onChange={event => setFilters({ ...filters, keyword: event.target.value })} placeholder="问题、零件、车型、责任区域" aria-label="碰撞一页纸关键字筛选" />
            </label>
            <label>
              <span className="field-label">阶段</span>
              <select className="select" value={filters.phaseId} onChange={event => setFilters({ ...filters, phaseId: event.target.value })}>
                <option value="">全部阶段</option>
                {bySequence(phases).map(phase => <option key={phase.id} value={idOf(phase.id)}>{phase.name}</option>)}
              </select>
            </label>
            <label>
              <span className="field-label">状态</span>
              <select className="select" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}>
                <option value="">全部状态</option>
                {statusOptions.map(status => <option key={status} value={status}>{STATUS_LABEL[status] ?? status}</option>)}
              </select>
            </label>
            <label>
              <span className="field-label">风险等级</span>
              <select className="select" value={filters.severity} onChange={event => setFilters({ ...filters, severity: event.target.value })}>
                <option value="">全部风险</option>
                {riskOptions.map(risk => <option key={risk} value={risk}>{STATUS_LABEL[risk] ?? risk}</option>)}
              </select>
            </label>
            <label>
              <span className="field-label">负责人</span>
              <input className="input" value={filters.owner} onChange={event => setFilters({ ...filters, owner: event.target.value })} placeholder="负责人" aria-label="碰撞一页纸负责人筛选" />
            </label>
            <label>
              <span className="field-label">日期起</span>
              <input className="input" type="date" value={filters.startDate} onChange={event => setFilters({ ...filters, startDate: event.target.value })} />
            </label>
            <label>
              <span className="field-label">日期止</span>
              <input className="input" type="date" value={filters.endDate} onChange={event => setFilters({ ...filters, endDate: event.target.value })} />
            </label>
          </FilterShell>
        </div>
      </section>
      {!filteredReports.length ? <EmptyState message="当前筛选下暂无碰撞一页纸。" /> : null}
      {filteredReports.map(report => (
        <section key={report.id} className="panel">
          <div className="panel-header">
            <div>
              <p className="kicker">制造工程重点问题一页纸报告</p>
              <h2 className="text-xl font-semibold">{report.title}</h2>
            </div>
            <StatusPill status={report.riskLevel} />
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {fields.map(([key, label]) => (
              <div key={key} className="rounded-lg border border-outline bg-surface-soft p-4">
                <div className="text-xs font-semibold uppercase text-ink-muted">{label}</div>
                <p className="mt-2 text-sm text-ink">{String(report[key] ?? '-')}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <MetricCard label="Owner" value={report.owner} detail="责任人" />
            <MetricCard label="Due date" value={formatDate(report.dueDate)} detail="关闭日期" />
            <MetricCard label="Status" value={report.status} detail={`更新于 ${formatDate(report.updatedAt)}`} />
          </div>
          <div className="mt-4">
            <AttachmentList attachments={report.attachments} />
          </div>
        </section>
      ))}
    </div>
  );
}

function ReportsView({
  reports,
  tasks,
  canWrite,
  onCreateExport,
  onDownloadExport
}: {
  reports: ReportDefinition[];
  tasks: ExportTask[];
  canWrite: boolean;
  onCreateExport: (report: ReportDefinition) => void;
  onDownloadExport: (task: ExportTask) => Promise<void>;
}) {
  const [downloadState, setDownloadState] = useState<Record<string, { loading?: boolean; error?: string }>>({});
  const [definitionFilters, setDefinitionFilters] = useState<SearchFilterState>(EMPTY_FILTERS);
  const [taskFilters, setTaskFilters] = useState<SearchFilterState>(EMPTY_FILTERS);
  const filteredReports = reports.filter(report =>
    textMatches(definitionFilters.keyword, [report.name, report.description, report.format])
  );
  const filteredTasks = tasks.filter(task => {
    if (taskFilters.status && task.status !== taskFilters.status) return false;
    if (taskFilters.owner && !textMatches(taskFilters.owner, [task.requestedBy])) return false;
    if (!textMatches(taskFilters.keyword, [task.reportName, task.fileName, task.fileFormat, task.requestedBy, task.errorMessage])) return false;
    return dateRangeMatches(task.requestedAt, task.finishedAt ?? task.requestedAt, taskFilters.startDate, taskFilters.endDate);
  });
  const taskStatusOptions = statusOptionValues(tasks.map(task => task.status));

  const handleDownload = async (task: ExportTask) => {
    const key = idOf(task.id);
    setDownloadState(current => ({ ...current, [key]: { loading: true } }));
    try {
      await onDownloadExport(task);
      setDownloadState(current => ({ ...current, [key]: {} }));
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 403
          ? '当前账号无导出下载权限。'
          : err instanceof Error
            ? err.message
            : '下载链接获取失败。';
      setDownloadState(current => ({ ...current, [key]: { error: message } }));
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="panel">
        <div className="panel-header">
          <h2 className="text-xl font-semibold">报告定义</h2>
          <ReadOnlyNotice canWrite={canWrite} />
        </div>
        <div className="mt-4">
          <FilterShell>
            <label className="xl:col-span-6">
              <span className="field-label">报告搜索</span>
              <input className="input" value={definitionFilters.keyword} onChange={event => setDefinitionFilters({ ...definitionFilters, keyword: event.target.value })} placeholder="报告名称、说明、格式" aria-label="报告定义搜索" />
            </label>
          </FilterShell>
        </div>
        <div className="mt-4 space-y-3">
          {filteredReports.map(report => (
            <div key={report.id} className="rounded-lg border border-outline bg-surface-soft p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-ink">{report.name}</div>
                  <div className="text-xs text-ink-muted">{report.description}</div>
                </div>
                <button className="btn btn-primary btn--sm" disabled={!canWrite} type="button" onClick={() => onCreateExport(report)} aria-label={`导出 ${report.name}`}>
                  <FileDown className="h-4 w-4" />
                  导出
                </button>
              </div>
            </div>
          ))}
          {!filteredReports.length ? <EmptyState message="当前筛选下暂无报告定义。" /> : null}
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2 className="text-xl font-semibold">导出任务</h2>
          <span className="chip">{filteredTasks.length}/{tasks.length} 个任务</span>
        </div>
        <div className="mt-4">
          <FilterShell>
            <label className="xl:col-span-2">
              <span className="field-label">关键字</span>
              <input className="input" value={taskFilters.keyword} onChange={event => setTaskFilters({ ...taskFilters, keyword: event.target.value })} placeholder="报告、文件、申请人" aria-label="导出任务关键字筛选" />
            </label>
            <label>
              <span className="field-label">状态</span>
              <select className="select" value={taskFilters.status} onChange={event => setTaskFilters({ ...taskFilters, status: event.target.value })}>
                <option value="">全部状态</option>
                {taskStatusOptions.map(status => <option key={status} value={status}>{STATUS_LABEL[status] ?? status}</option>)}
              </select>
            </label>
            <label>
              <span className="field-label">申请人</span>
              <input className="input" value={taskFilters.owner} onChange={event => setTaskFilters({ ...taskFilters, owner: event.target.value })} placeholder="申请人" aria-label="导出任务申请人筛选" />
            </label>
            <label>
              <span className="field-label">申请起</span>
              <input className="input" type="date" value={taskFilters.startDate} onChange={event => setTaskFilters({ ...taskFilters, startDate: event.target.value })} />
            </label>
            <label>
              <span className="field-label">申请止</span>
              <input className="input" type="date" value={taskFilters.endDate} onChange={event => setTaskFilters({ ...taskFilters, endDate: event.target.value })} />
            </label>
          </FilterShell>
        </div>
        <div className="table-shell mt-4">
          <table className="data-table">
            <thead>
              <tr>
                <th>报告</th>
                <th>状态</th>
                <th>申请人</th>
                <th>时间</th>
                <th>产物</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map(task => {
                const state = downloadState[idOf(task.id)] ?? {};
                const hasArtifact = task.hasResult === true;
                const canDownload = canWrite && task.status === 'succeeded' && hasArtifact;
                return (
                  <tr key={task.id}>
                    <td>
                      <div className="font-semibold">{task.reportName}</div>
                      <div className="mt-1 text-xs text-ink-muted">{task.fileFormat || 'export'}</div>
                    </td>
                    <td><StatusPill status={task.status} /></td>
                    <td>{task.requestedBy}</td>
                    <td>
                      <div>{formatDate(task.requestedAt)}</div>
                      {task.finishedAt ? <div className="text-xs text-ink-muted">完成：{formatDate(task.finishedAt)}</div> : null}
                    </td>
                    <td>
                      <div className="space-y-2">
                        <div className="max-w-[280px] truncate text-xs text-ink" title={task.fileName || task.resultObjectKey || ''}>
                          {task.fileName || task.resultObjectKey || task.errorMessage || '等待产物生成'}
                        </div>
                        {task.resultBucketName || task.resultObjectKey ? (
                          <div className="max-w-[280px] truncate text-[11px] text-ink-subtle" title={[task.resultBucketName, task.resultObjectKey].filter(Boolean).join('/')}>
                            {[task.resultBucketName, task.resultObjectKey].filter(Boolean).join('/')}
                          </div>
                        ) : null}
                        <button
                          className="btn btn-ghost btn--sm"
                          type="button"
                          disabled={!canDownload || state.loading}
                          onClick={() => void handleDownload(task)}
                          title={!canWrite ? '当前账号无导出下载权限' : !hasArtifact ? '导出产物尚未生成' : undefined}
                          aria-label={`下载导出任务 ${task.reportName}`}
                        >
                          <Download className="h-4 w-4" />
                          {state.loading ? '获取中' : '下载'}
                        </button>
                        {state.error ? <div className="text-xs text-warning">{state.error}</div> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filteredTasks.length ? (
                <tr>
                  <td colSpan={5} className="text-center text-ink-muted">当前筛选下暂无导出任务。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

type ProjectConfigDraft = {
  name: string;
  code: string;
  status: string;
  ownerName: string;
  plannedStartDate: string;
  plannedEndDate: string;
  description: string;
  factoryId: string;
  workshopId: string;
  productionLineId: string;
};

type PhaseConfigDraft = {
  name: string;
  sequence: string;
  goal: string;
  plannedStartDate: string;
  plannedEndDate: string;
  status: string;
  isActive: boolean;
};

type CheckItemConfigDraft = {
  title: string;
  moduleId: string;
  projectPhaseId: string;
  tags: string;
  plannedStartDate: string;
  plannedEndDate: string;
  ownerName: string;
  ownerIdaasId?: string;
  status: string;
  isActive: boolean;
};

function BaseConfigView({
  data,
  scope,
  canWrite,
  onScopeChange,
  onSelectProject,
  onCreateProject,
  onUpdateProject,
  onSeedTemplate,
  onUpdatePhase,
  onDeletePhase,
  onCreateCheckItem,
  onUpdateCheckItem,
  onDeleteCheckItem
}: {
  data: WorkspaceData;
  scope: ScopeState;
  canWrite: boolean;
  onScopeChange: (scope: ScopeState) => void;
  onSelectProject: (projectId: string | number) => void;
  onCreateProject: () => void;
  onUpdateProject: (draft: ProjectConfigDraft) => Promise<void>;
  onSeedTemplate: () => Promise<void>;
  onUpdatePhase: (phase: ProjectPhase, draft: PhaseConfigDraft) => Promise<void>;
  onDeletePhase: (phase: ProjectPhase) => Promise<void>;
  onCreateCheckItem: (draft: CheckItemConfigDraft) => Promise<void>;
  onUpdateCheckItem: (item: CheckItem, draft: CheckItemConfigDraft) => Promise<void>;
  onDeleteCheckItem: (item: CheckItem) => Promise<void>;
}) {
  const [projectDraft, setProjectDraft] = useState<ProjectConfigDraft | null>(null);
  const [phaseDrafts, setPhaseDrafts] = useState<Record<string, PhaseConfigDraft>>({});
  const [checkItemDrafts, setCheckItemDrafts] = useState<Record<string, CheckItemConfigDraft>>({});
  const [projectFilters, setProjectFilters] = useState<SearchFilterState>(EMPTY_FILTERS);
  const [phaseFilters, setPhaseFilters] = useState<SearchFilterState>(EMPTY_FILTERS);
  const [checkFilters, setCheckFilters] = useState<SearchFilterState>(EMPTY_FILTERS);
  const [newCheckDraft, setNewCheckDraft] = useState<CheckItemConfigDraft | null>(null);
  const [selectedPhaseConfigId, setSelectedPhaseConfigId] = useState('');
  const [transferTargetPhaseId, setTransferTargetPhaseId] = useState('');
  const [savingKey, setSavingKey] = useState('');
  const [message, setMessage] = useState('');
  const project = data.selectedProject;
  const sortedPhases = bySequence(data.phases);
  const visibleProjects = data.projects.filter(item => {
    if (scope.factoryId && idOf(item.factoryId) !== scope.factoryId) return false;
    if (scope.workshopId && idOf(item.workshopId) !== scope.workshopId) return false;
    if (scope.productionLineId && idOf(item.productionLineId) !== scope.productionLineId) return false;
    if (projectFilters.status && item.status !== projectFilters.status) return false;
    if (projectFilters.owner && !textMatches(projectFilters.owner, [item.ownerName])) return false;
    if (!textMatches(projectFilters.keyword, [item.name, item.code, item.ownerName, item.plant, item.workshopName, item.lineName])) return false;
    return dateRangeMatches(item.plannedStartDate, item.plannedEndDate, projectFilters.startDate, projectFilters.endDate);
  });
  const visiblePhases = sortedPhases.filter(phase => {
    if (phaseFilters.status && phase.status !== phaseFilters.status) return false;
    if (phaseFilters.activeState === 'enabled' && phase.isActive === false) return false;
    if (phaseFilters.activeState === 'disabled' && phase.isActive !== false) return false;
    if (!textMatches(phaseFilters.keyword, [phase.name, phase.code, phase.goal])) return false;
    return dateRangeMatches(phase.plannedStartDate, phase.plannedEndDate, phaseFilters.startDate, phaseFilters.endDate);
  });
  const selectedPhaseId = visiblePhases.length
    ? visiblePhases.some(phase => idOf(phase.id) === selectedPhaseConfigId)
      ? selectedPhaseConfigId
      : idOf(visiblePhases[0]?.id)
    : '';
  const selectedConfigPhase = sortedPhases.find(phase => idOf(phase.id) === selectedPhaseId);
  const selectedPhaseDraft = selectedConfigPhase ? phaseDrafts[idOf(selectedConfigPhase.id)] : undefined;
  const selectedPhaseAllCheckItems = selectedPhaseId
    ? data.checkItems.filter(item => idOf(item.projectPhaseId) === selectedPhaseId)
    : [];
  const transferTargetPhase = sortedPhases.find(phase => idOf(phase.id) === transferTargetPhaseId);
  const visibleCheckItems = data.checkItems.filter(item => {
    const phase = data.phases.find(phaseItem => idOf(phaseItem.id) === idOf(item.projectPhaseId));
    const module = data.inspectionModules.find(moduleItem => idOf(moduleItem.id) === idOf(item.moduleId));
    if (!selectedPhaseId || idOf(item.projectPhaseId) !== selectedPhaseId) return false;
    if (checkFilters.moduleId && idOf(item.moduleId) !== checkFilters.moduleId) return false;
    if (checkFilters.status && item.status !== checkFilters.status) return false;
    if (checkFilters.owner && !textMatches(checkFilters.owner, [item.ownerName, item.ownerIdaasId])) return false;
    if (checkFilters.activeState === 'enabled' && item.isActive === false) return false;
    if (checkFilters.activeState === 'disabled' && item.isActive !== false) return false;
    if (!textMatches(checkFilters.keyword, [item.title, item.description, item.acceptanceCriteria, item.ownerName, phase?.name, module?.name, item.tags?.join(' ')])) return false;
    return dateRangeMatches(item.plannedStartDate, item.plannedEndDate, checkFilters.startDate, checkFilters.endDate);
  });
  const workshops = data.hierarchy.workshops.filter(
    workshop => !projectDraft?.factoryId || idOf(workshop.factoryId) === projectDraft.factoryId
  );
  const productionLines = data.hierarchy.productionLines.filter(
    line => !projectDraft?.workshopId || idOf(line.workshopId) === projectDraft.workshopId
  );
  const projectStatusOptions = statusOptionValues(data.projects.map(item => item.status));
  const phaseStatusOptions = statusOptionValues(data.phases.map(item => item.status));
  const checkStatusOptions = statusOptionValues(data.checkItems.map(item => item.status));
  const selectedNewCheckPhase = sortedPhases.find(phase => idOf(phase.id) === newCheckDraft?.projectPhaseId);
  const selectedModule = data.inspectionModules.find(module => idOf(module.id) === newCheckDraft?.moduleId);
  const projectWorkbench = (
    <>
      <ScopeToolbar hierarchy={data.hierarchy} scope={scope} canWrite={canWrite} onChange={onScopeChange} onCreateProject={onCreateProject} />
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="kicker">Configuration Center</p>
            <h2 className="text-xl font-semibold">项目范围与项目列表</h2>
            <p className="text-sm text-ink-muted">先按工厂、车间、产线缩小范围，再选择项目维护基础信息、阶段和检查项。</p>
          </div>
          <span className="chip">{visibleProjects.length}/{data.projects.length} 个项目</span>
        </div>
        <div className="mt-4">
          <FilterShell>
            <label className="xl:col-span-2">
              <span className="field-label">项目搜索</span>
              <input className="input" value={projectFilters.keyword} onChange={event => setProjectFilters({ ...projectFilters, keyword: event.target.value })} placeholder="项目、编号、范围、负责人" aria-label="配置中心项目搜索" />
            </label>
            <label>
              <span className="field-label">状态</span>
              <select className="select" value={projectFilters.status} onChange={event => setProjectFilters({ ...projectFilters, status: event.target.value })}>
                <option value="">全部状态</option>
                {projectStatusOptions.map(status => <option key={status} value={status}>{STATUS_LABEL[status] ?? status}</option>)}
              </select>
            </label>
            <label>
              <span className="field-label">负责人</span>
              <input className="input" value={projectFilters.owner} onChange={event => setProjectFilters({ ...projectFilters, owner: event.target.value })} placeholder="负责人" aria-label="配置中心项目负责人筛选" />
            </label>
            <label>
              <span className="field-label">计划开始</span>
              <input className="input" type="date" value={projectFilters.startDate} onChange={event => setProjectFilters({ ...projectFilters, startDate: event.target.value })} />
            </label>
            <label>
              <span className="field-label">计划结束</span>
              <input className="input" type="date" value={projectFilters.endDate} onChange={event => setProjectFilters({ ...projectFilters, endDate: event.target.value })} />
            </label>
          </FilterShell>
        </div>
        <div className="table-shell mt-4">
          <table className="data-table min-w-[1120px]">
            <thead>
              <tr>
                <th>序号</th>
                <th>项目</th>
                <th>范围</th>
                <th>负责人</th>
                <th>计划窗口</th>
                <th>状态</th>
                <th>进度</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleProjects.map((item, index) => {
                const active = idOf(project?.id) === idOf(item.id);
                return (
                  <tr
                    key={item.id}
                    className={`cursor-pointer transition ${active ? 'bg-primary/10' : 'hover:bg-surface-soft'}`}
                    tabIndex={0}
                    onClick={() => onSelectProject(item.id)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelectProject(item.id);
                      }
                    }}
                    aria-selected={active}
                  >
                    <td>{index + 1}</td>
                    <td className="min-w-[260px]">
                      <div className="font-semibold text-ink">{item.name}</div>
                      <div className="mt-1 text-xs text-ink-muted">{item.code}</div>
                    </td>
                    <td className="min-w-[240px]">
                      <div>{item.plant || item.factoryName || '未设置工厂'}</div>
                      <div className="mt-1 text-xs text-ink-muted">{item.workshopName || item.lineName || '未设置范围'}</div>
                    </td>
                    <td>{item.ownerName || '未设置'}</td>
                    <td className="min-w-[190px]">{formatDate(item.plannedStartDate)} 至 {formatDate(item.plannedEndDate)}</td>
                    <td><StatusPill status={item.status} /></td>
                    <td>{percent(item.progressPercent)}</td>
                    <td>
                      <button
                        className="btn btn-ghost btn--sm"
                        type="button"
                        onClick={event => {
                          event.stopPropagation();
                          onSelectProject(item.id);
                        }}
                        aria-label={`配置项目 ${item.name}`}
                      >
                        配置
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!visibleProjects.length ? (
                <tr>
                  <td colSpan={8} className="text-center text-ink-muted">当前范围与筛选下暂无项目，可调整筛选或按范围创建。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );

  useEffect(() => {
    setMessage('');
    if (!project) {
      setProjectDraft(null);
      setPhaseDrafts({});
      setCheckItemDrafts({});
      setCheckFilters(EMPTY_FILTERS);
      setSelectedPhaseConfigId('');
      setTransferTargetPhaseId('');
      setNewCheckDraft(null);
      return;
    }
    setProjectDraft({
      name: project.name,
      code: project.code,
      status: project.status,
      ownerName: project.ownerName,
      plannedStartDate: dateInputValue(project.plannedStartDate),
      plannedEndDate: dateInputValue(project.plannedEndDate),
      description: project.description ?? '',
      factoryId: idOf(project.factoryId),
      workshopId: idOf(project.workshopId),
      productionLineId: idOf(project.productionLineId)
    });
    setPhaseDrafts(
      Object.fromEntries(
        sortedPhases.map(phase => [
          idOf(phase.id),
          {
            name: phase.name,
            sequence: String(phase.sequence),
            goal: phase.goal,
            plannedStartDate: dateInputValue(phase.plannedStartDate),
            plannedEndDate: dateInputValue(phase.plannedEndDate),
            status: phase.status,
            isActive: phase.isActive !== false
          }
        ])
      )
    );
    setCheckItemDrafts(
      Object.fromEntries(
        data.checkItems.map(item => [
          idOf(item.id),
          {
            title: item.title,
            moduleId: idOf(item.moduleId),
            projectPhaseId: idOf(item.projectPhaseId),
            tags: (item.tags?.length ? item.tags : item.acceptanceCriteria ? [item.acceptanceCriteria] : []).join('，'),
            plannedStartDate: dateInputValue(item.plannedStartDate),
            plannedEndDate: dateInputValue(item.plannedEndDate),
            ownerName: item.ownerName,
            ownerIdaasId: item.ownerIdaasId,
            status: item.status,
            isActive: item.isActive !== false
          }
        ])
      )
    );
    const firstPhaseId = idOf(sortedPhases[0]?.id);
    const firstModuleId = idOf(bySequence(data.inspectionModules)[0]?.id);
    setCheckFilters(current => ({ ...current, phaseId: '' }));
    setSelectedPhaseConfigId(current =>
      sortedPhases.some(phase => idOf(phase.id) === current) ? current : firstPhaseId
    );
    setTransferTargetPhaseId('');
    setNewCheckDraft({
      title: '',
      moduleId: firstModuleId,
      projectPhaseId: firstPhaseId,
      tags: '',
      plannedStartDate: dateInputValue(sortedPhases[0]?.plannedStartDate),
      plannedEndDate: dateInputValue(sortedPhases[0]?.plannedEndDate),
      ownerName: project.ownerName,
      ownerIdaasId: undefined,
      status: 'pending',
      isActive: true
    });
  }, [project?.id, data.phases, data.checkItems]);

  useEffect(() => {
    if (!newCheckDraft || !selectedPhaseId || newCheckDraft.projectPhaseId === selectedPhaseId) return;
    const phase = sortedPhases.find(item => idOf(item.id) === selectedPhaseId);
    setNewCheckDraft({
      ...newCheckDraft,
      projectPhaseId: selectedPhaseId,
      plannedStartDate: dateInputValue(phase?.plannedStartDate),
      plannedEndDate: dateInputValue(phase?.plannedEndDate)
    });
  }, [selectedPhaseId]);

  const save = async (key: string, action: () => Promise<void>) => {
    if (!canWrite) {
      setMessage('当前账号只读，写操作已禁用。');
      return;
    }
    setSavingKey(key);
    setMessage('');
    try {
      await action();
      setMessage('已保存。');
    } catch (err) {
      setMessage(mutationErrorMessage(err, '保存失败。'));
    } finally {
      setSavingKey('');
    }
  };

  const selectPhaseForConfig = (phase: ProjectPhase) => {
    const phaseId = idOf(phase.id);
    setSelectedPhaseConfigId(phaseId);
    setTransferTargetPhaseId('');
    setNewCheckDraft(current =>
      current
        ? {
            ...current,
            projectPhaseId: phaseId,
            plannedStartDate: dateInputValue(phase.plannedStartDate),
            plannedEndDate: dateInputValue(phase.plannedEndDate)
          }
        : current
    );
  };

  const moveSelectedPhaseCheckItems = async () => {
    if (!selectedPhaseId || !transferTargetPhaseId || selectedPhaseId === transferTargetPhaseId) return;
    for (const item of selectedPhaseAllCheckItems) {
      const draft = checkItemDrafts[idOf(item.id)];
      if (!draft) continue;
      await onUpdateCheckItem(item, {
        ...draft,
        projectPhaseId: transferTargetPhaseId,
        plannedStartDate: draft.plannedStartDate || dateInputValue(transferTargetPhase?.plannedStartDate),
        plannedEndDate: draft.plannedEndDate || dateInputValue(transferTargetPhase?.plannedEndDate)
      });
    }
    setTransferTargetPhaseId('');
  };

  if (!project || !projectDraft) {
    return (
      <div className="grid gap-5">
        {projectWorkbench}
        <section className="panel">
          <h2 className="text-xl font-semibold">配置中心</h2>
          <p className="mt-3 text-sm text-ink-muted">请选择项目后维护基础信息、阶段、检查项、模块与负责人候选。</p>
        </section>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      {projectWorkbench}
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="kicker">Project Base</p>
            <h2 className="text-xl font-semibold">项目基础信息</h2>
          </div>
          <ReadOnlyNotice canWrite={canWrite} />
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <label>
            <span className="field-label">工厂</span>
            <select
              className="select"
              value={projectDraft.factoryId}
              disabled={!canWrite}
              onChange={event =>
                setProjectDraft({
                  ...projectDraft,
                  factoryId: event.target.value,
                  workshopId: '',
                  productionLineId: ''
                })
              }
            >
              <option value="">请选择工厂</option>
              {data.hierarchy.factories.map(factory => (
                <option key={factory.id} value={idOf(factory.id)}>{hierarchyLabel(factory)}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label">车间</span>
            <select
              className="select"
              value={projectDraft.workshopId}
              disabled={!canWrite || !projectDraft.factoryId}
              onChange={event => setProjectDraft({ ...projectDraft, workshopId: event.target.value, productionLineId: '' })}
            >
              <option value="">请选择车间</option>
              {workshops.map(workshop => (
                <option key={workshop.id} value={idOf(workshop.id)}>{hierarchyLabel(workshop)}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label">产线（可选）</span>
            <select
              className="select"
              value={projectDraft.productionLineId}
              disabled={!canWrite || !projectDraft.workshopId}
              onChange={event => setProjectDraft({ ...projectDraft, productionLineId: event.target.value })}
            >
              <option value="">车间级项目</option>
              {productionLines.map(line => (
                <option key={line.id} value={idOf(line.id)}>{hierarchyLabel(line)}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label">项目名称</span>
            <input className="input" value={projectDraft.name} disabled={!canWrite} onChange={event => setProjectDraft({ ...projectDraft, name: event.target.value })} />
          </label>
          <label>
            <span className="field-label">项目编号</span>
            <input className="input" value={projectDraft.code} disabled={!canWrite} onChange={event => setProjectDraft({ ...projectDraft, code: event.target.value })} />
          </label>
          <label>
            <span className="field-label">状态</span>
            <select className="select" value={projectDraft.status} disabled={!canWrite} onChange={event => setProjectDraft({ ...projectDraft, status: event.target.value })}>
              {['planning', 'active', 'paused', 'completed', 'archived'].map(status => (
                <option key={status} value={status}>{STATUS_LABEL[status] ?? status}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label">负责人</span>
            <input
              className="input"
              list="base-config-owner-candidates"
              value={projectDraft.ownerName}
              disabled={!canWrite}
              onChange={event => setProjectDraft({ ...projectDraft, ownerName: event.target.value })}
            />
            <datalist id="base-config-owner-candidates">
              {data.ownerCandidates.map(owner => <option key={owner.idaasId} value={owner.displayName} />)}
            </datalist>
          </label>
          <label>
            <span className="field-label">计划开始</span>
            <input className="input" type="date" value={projectDraft.plannedStartDate} disabled={!canWrite} onChange={event => setProjectDraft({ ...projectDraft, plannedStartDate: event.target.value })} />
          </label>
          <label>
            <span className="field-label">计划结束</span>
            <input className="input" type="date" value={projectDraft.plannedEndDate} disabled={!canWrite} onChange={event => setProjectDraft({ ...projectDraft, plannedEndDate: event.target.value })} />
          </label>
          <label className="lg:col-span-3">
            <span className="field-label">项目说明</span>
            <textarea className="input min-h-24" value={projectDraft.description} disabled={!canWrite} onChange={event => setProjectDraft({ ...projectDraft, description: event.target.value })} />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="btn btn-primary"
            type="button"
            disabled={!canWrite || savingKey === 'project'}
            onClick={() => void save('project', () => onUpdateProject(projectDraft))}
          >
            <Save className="h-4 w-4" />
            {savingKey === 'project' ? '保存中' : '保存项目'}
          </button>
          {message ? <span className="text-sm text-ink-muted">{message}</span> : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="kicker">Project Phases</p>
            <h2 className="text-xl font-semibold">项目阶段配置</h2>
            <p className="text-sm text-ink-muted">阶段 code 作为稳定 key 保留；项目展示按当前启用阶段数量渲染，也可在此补齐缺失阶段和检查项。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip">{visiblePhases.length}/{sortedPhases.length} 阶段</span>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={!canWrite || savingKey === 'seed-template'}
              onClick={() => void save('seed-template', onSeedTemplate)}
              aria-label="补齐默认阶段和检查项"
              title="按默认阶段模板补齐当前项目缺失的阶段和检查项"
            >
              <RefreshCcw className="h-4 w-4" />
              {savingKey === 'seed-template' ? '补齐中' : '补齐默认阶段'}
            </button>
          </div>
        </div>
        <div className="mt-4">
          <FilterShell>
            <label className="xl:col-span-2">
              <span className="field-label">阶段搜索</span>
              <input className="input" value={phaseFilters.keyword} onChange={event => setPhaseFilters({ ...phaseFilters, keyword: event.target.value })} placeholder="阶段名称、Key、目标" aria-label="配置中心阶段搜索" />
            </label>
            <label>
              <span className="field-label">状态</span>
              <select className="select" value={phaseFilters.status} onChange={event => setPhaseFilters({ ...phaseFilters, status: event.target.value })}>
                <option value="">全部状态</option>
                {phaseStatusOptions.map(status => <option key={status} value={status}>{STATUS_LABEL[status] ?? status}</option>)}
              </select>
            </label>
            <label>
              <span className="field-label">启用状态</span>
              <select className="select" value={phaseFilters.activeState} onChange={event => setPhaseFilters({ ...phaseFilters, activeState: event.target.value })}>
                <option value="">全部</option>
                <option value="enabled">启用</option>
                <option value="disabled">停用</option>
              </select>
            </label>
            <label>
              <span className="field-label">计划开始</span>
              <input className="input" type="date" value={phaseFilters.startDate} onChange={event => setPhaseFilters({ ...phaseFilters, startDate: event.target.value })} />
            </label>
            <label>
              <span className="field-label">计划结束</span>
              <input className="input" type="date" value={phaseFilters.endDate} onChange={event => setPhaseFilters({ ...phaseFilters, endDate: event.target.value })} />
            </label>
          </FilterShell>
        </div>
        <div className="table-shell mt-4">
          <table className="data-table min-w-[1160px]">
            <thead>
              <tr>
                <th>序号</th>
                <th>阶段</th>
                <th>阶段 Key</th>
                <th>计划窗口</th>
                <th>状态</th>
                <th>启用</th>
                <th>检查项</th>
                <th>完成</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visiblePhases.map((phase, index) => {
                const draft = phaseDrafts[idOf(phase.id)];
                const phaseItems = data.checkItems.filter(item => idOf(item.projectPhaseId) === idOf(phase.id));
                const completedCount = phaseItems.filter(item => isComplete(item.status)).length;
                const active = selectedPhaseId === idOf(phase.id);
                return (
                  <tr
                    key={phase.id}
                    className={`cursor-pointer transition ${active ? 'bg-primary/10' : 'hover:bg-surface-soft'}`}
                    tabIndex={0}
                    onClick={() => selectPhaseForConfig(phase)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectPhaseForConfig(phase);
                      }
                    }}
                    aria-selected={active}
                  >
                    <td>{index + 1}</td>
                    <td className="min-w-[180px]">
                      <div className="font-semibold text-ink">{phase.name}</div>
                      <div className="mt-1 text-xs text-ink-muted">{phase.goal || '未设置阶段目标'}</div>
                    </td>
                    <td>{phase.code}</td>
                    <td className="min-w-[190px]">{formatDate(phase.plannedStartDate)} 至 {formatDate(phase.plannedEndDate)}</td>
                    <td><StatusPill status={draft?.status ?? phase.status} /></td>
                    <td>{draft?.isActive ? '启用' : '停用'}</td>
                    <td>{phaseItems.length} 项</td>
                    <td>{completedCount}/{phaseItems.length}</td>
                    <td>
                      <button
                        className="btn btn-ghost btn--sm"
                        type="button"
                        onClick={event => {
                          event.stopPropagation();
                          selectPhaseForConfig(phase);
                        }}
                        aria-label={`配置阶段 ${phase.name}`}
                      >
                        配置
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!visiblePhases.length ? (
                <tr>
                  <td colSpan={9} className="text-center text-ink-muted">当前筛选下暂无阶段。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {selectedConfigPhase && selectedPhaseDraft ? (
          <div className="mt-4 rounded-lg border border-outline bg-surface-soft p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-ink">{selectedConfigPhase.name} 阶段维护</div>
                <div className="text-xs text-ink-muted">Key: {selectedConfigPhase.code} · {selectedPhaseAllCheckItems.length} 项检查配置</div>
              </div>
              <label className="flex items-center gap-2 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  checked={selectedPhaseDraft.isActive}
                  disabled={!canWrite}
                  onChange={event =>
                    setPhaseDrafts(current => ({
                      ...current,
                      [idOf(selectedConfigPhase.id)]: { ...selectedPhaseDraft, isActive: event.target.checked }
                    }))
                  }
                />
                启用
              </label>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-5">
              <label>
                <span className="field-label">阶段名称</span>
                <input
                  className="input"
                  value={selectedPhaseDraft.name}
                  disabled={!canWrite}
                  onChange={event =>
                    setPhaseDrafts(current => ({
                      ...current,
                      [idOf(selectedConfigPhase.id)]: { ...selectedPhaseDraft, name: event.target.value }
                    }))
                  }
                />
              </label>
              <label>
                <span className="field-label">排序</span>
                <input
                  className="input"
                  type="number"
                  value={selectedPhaseDraft.sequence}
                  disabled={!canWrite}
                  onChange={event =>
                    setPhaseDrafts(current => ({
                      ...current,
                      [idOf(selectedConfigPhase.id)]: { ...selectedPhaseDraft, sequence: event.target.value }
                    }))
                  }
                />
              </label>
              <label>
                <span className="field-label">计划开始</span>
                <input
                  className="input"
                  type="date"
                  value={selectedPhaseDraft.plannedStartDate}
                  disabled={!canWrite}
                  onChange={event =>
                    setPhaseDrafts(current => ({
                      ...current,
                      [idOf(selectedConfigPhase.id)]: { ...selectedPhaseDraft, plannedStartDate: event.target.value }
                    }))
                  }
                />
              </label>
              <label>
                <span className="field-label">计划结束</span>
                <input
                  className="input"
                  type="date"
                  value={selectedPhaseDraft.plannedEndDate}
                  disabled={!canWrite}
                  onChange={event =>
                    setPhaseDrafts(current => ({
                      ...current,
                      [idOf(selectedConfigPhase.id)]: { ...selectedPhaseDraft, plannedEndDate: event.target.value }
                    }))
                  }
                />
              </label>
              <label>
                <span className="field-label">状态</span>
                <select
                  className="select"
                  value={selectedPhaseDraft.status}
                  disabled={!canWrite}
                  onChange={event =>
                    setPhaseDrafts(current => ({
                      ...current,
                      [idOf(selectedConfigPhase.id)]: { ...selectedPhaseDraft, status: event.target.value }
                    }))
                  }
                >
                  {['not_started', 'in_progress', 'blocked', 'completed'].map(status => (
                    <option key={status} value={status}>{STATUS_LABEL[status] ?? status}</option>
                  ))}
                </select>
              </label>
              <label className="lg:col-span-5">
                <span className="field-label">阶段目标</span>
                <textarea
                  className="input min-h-20"
                  value={selectedPhaseDraft.goal}
                  disabled={!canWrite}
                  onChange={event =>
                    setPhaseDrafts(current => ({
                      ...current,
                      [idOf(selectedConfigPhase.id)]: { ...selectedPhaseDraft, goal: event.target.value }
                    }))
                  }
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <button
                className="btn btn-primary btn--sm"
                type="button"
                disabled={!canWrite || savingKey === `phase-${selectedConfigPhase.id}`}
                onClick={() => void save(`phase-${selectedConfigPhase.id}`, () => onUpdatePhase(selectedConfigPhase, selectedPhaseDraft))}
              >
                <Save className="h-4 w-4" />
                保存阶段
              </button>
              {selectedConfigPhase.canDelete === true ? (
                <button
                  className="btn btn-ghost btn--sm"
                  type="button"
                  disabled={!canWrite || savingKey === `phase-delete-${selectedConfigPhase.id}`}
                  onClick={() => {
                    if (window.confirm(`确认删除阶段「${selectedConfigPhase.name}」？`)) {
                      void save(`phase-delete-${selectedConfigPhase.id}`, () => onDeletePhase(selectedConfigPhase));
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  删除阶段
                </button>
              ) : null}
              <label className="min-w-[220px]">
                <span className="field-label">迁移到阶段</span>
                <select
                  className="select"
                  value={transferTargetPhaseId}
                  disabled={!canWrite || !selectedPhaseAllCheckItems.length}
                  onChange={event => setTransferTargetPhaseId(event.target.value)}
                >
                  <option value="">选择目标阶段</option>
                  {sortedPhases
                    .filter(phase => idOf(phase.id) !== selectedPhaseId)
                    .map(phase => <option key={phase.id} value={idOf(phase.id)}>{phase.name}</option>)}
                </select>
              </label>
              <button
                className="btn btn-ghost btn--sm"
                type="button"
                disabled={!canWrite || !transferTargetPhaseId || !selectedPhaseAllCheckItems.length || savingKey === 'phase-check-transfer'}
                onClick={() => void save('phase-check-transfer', moveSelectedPhaseCheckItems)}
                title={transferTargetPhase ? `迁移到 ${transferTargetPhase.name}` : undefined}
              >
                <Workflow className="h-4 w-4" />
                {savingKey === 'phase-check-transfer' ? '迁移中' : '迁移本阶段检查项'}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="kicker">Checklist</p>
            <h2 className="text-xl font-semibold">所选阶段检查项配置</h2>
            <p className="text-sm text-ink-muted">{selectedConfigPhase ? `${selectedConfigPhase.name} · ${selectedConfigPhase.code}` : '先在上方阶段表选择阶段'}</p>
          </div>
          <span className="chip">{visibleCheckItems.length}/{selectedPhaseAllCheckItems.length} 项</span>
        </div>
        <div className="mt-4">
          <FilterShell>
            <label className="xl:col-span-2">
              <span className="field-label">检查项搜索</span>
              <input className="input" value={checkFilters.keyword} onChange={event => setCheckFilters({ ...checkFilters, keyword: event.target.value })} placeholder="标题、标签、负责人" aria-label="配置中心检查项搜索" />
            </label>
            <label>
              <span className="field-label">模块</span>
              <select className="select" value={checkFilters.moduleId} onChange={event => setCheckFilters({ ...checkFilters, moduleId: event.target.value })}>
                <option value="">全部模块</option>
                {bySequence(data.inspectionModules).map(module => <option key={module.id} value={idOf(module.id)}>{module.name}</option>)}
              </select>
            </label>
            <label>
              <span className="field-label">状态</span>
              <select className="select" value={checkFilters.status} onChange={event => setCheckFilters({ ...checkFilters, status: event.target.value })}>
                <option value="">全部状态</option>
                {checkStatusOptions.map(status => <option key={status} value={status}>{STATUS_LABEL[status] ?? status}</option>)}
              </select>
            </label>
            <label>
              <span className="field-label">负责人</span>
              <input className="input" value={checkFilters.owner} onChange={event => setCheckFilters({ ...checkFilters, owner: event.target.value })} placeholder="负责人" aria-label="配置中心检查项负责人筛选" />
            </label>
            <label>
              <span className="field-label">启用状态</span>
              <select className="select" value={checkFilters.activeState} onChange={event => setCheckFilters({ ...checkFilters, activeState: event.target.value })}>
                <option value="">全部</option>
                <option value="enabled">启用</option>
                <option value="disabled">停用</option>
              </select>
            </label>
            <label>
              <span className="field-label">计划开始</span>
              <input className="input" type="date" value={checkFilters.startDate} onChange={event => setCheckFilters({ ...checkFilters, startDate: event.target.value })} />
            </label>
            <label>
              <span className="field-label">计划结束</span>
              <input className="input" type="date" value={checkFilters.endDate} onChange={event => setCheckFilters({ ...checkFilters, endDate: event.target.value })} />
            </label>
          </FilterShell>
        </div>
        {newCheckDraft ? (
          <div className="mt-4 rounded-lg border border-outline bg-surface-soft p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-ink">新增检查项</div>
                <div className="text-xs text-ink-muted">默认归属 {selectedNewCheckPhase?.name ?? '当前阶段'} / {selectedModule?.name ?? '当前模块'}。</div>
              </div>
              <ReadOnlyNotice canWrite={canWrite} />
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-4">
              <label className="lg:col-span-2">
                <span className="field-label">检查项标题</span>
                <input className="input" value={newCheckDraft.title} disabled={!canWrite} onChange={event => setNewCheckDraft({ ...newCheckDraft, title: event.target.value })} placeholder="输入检查项标题" aria-label="新增检查项标题" />
              </label>
              <label>
                <span className="field-label">阶段</span>
                <select
                  className="select"
                  value={newCheckDraft.projectPhaseId}
                  disabled={!canWrite}
                  onChange={event => {
                    const phase = sortedPhases.find(item => idOf(item.id) === event.target.value);
                    setSelectedPhaseConfigId(event.target.value);
                    setNewCheckDraft({
                      ...newCheckDraft,
                      projectPhaseId: event.target.value,
                      plannedStartDate: dateInputValue(phase?.plannedStartDate),
                      plannedEndDate: dateInputValue(phase?.plannedEndDate)
                    });
                  }}
                >
                  {(visiblePhases.length ? visiblePhases : sortedPhases).map(phase => <option key={phase.id} value={idOf(phase.id)}>{phase.name}</option>)}
                </select>
              </label>
              <label>
                <span className="field-label">模块</span>
                <select className="select" value={newCheckDraft.moduleId} disabled={!canWrite} onChange={event => setNewCheckDraft({ ...newCheckDraft, moduleId: event.target.value })}>
                  {bySequence(data.inspectionModules).map(module => <option key={module.id} value={idOf(module.id)}>{module.name}</option>)}
                </select>
              </label>
              <label>
                <span className="field-label">标签</span>
                <input className="input" value={newCheckDraft.tags} disabled={!canWrite} onChange={event => setNewCheckDraft({ ...newCheckDraft, tags: event.target.value })} placeholder="逗号分隔" />
              </label>
              <label>
                <span className="field-label">计划开始</span>
                <input className="input" type="date" value={newCheckDraft.plannedStartDate} disabled={!canWrite} onChange={event => setNewCheckDraft({ ...newCheckDraft, plannedStartDate: event.target.value })} />
              </label>
              <label>
                <span className="field-label">计划结束</span>
                <input className="input" type="date" value={newCheckDraft.plannedEndDate} disabled={!canWrite} onChange={event => setNewCheckDraft({ ...newCheckDraft, plannedEndDate: event.target.value })} />
              </label>
              <label>
                <span className="field-label">负责人</span>
                <input className="input" list="base-config-owner-candidates" value={newCheckDraft.ownerName} disabled={!canWrite} onChange={event => setNewCheckDraft({ ...newCheckDraft, ownerName: event.target.value })} />
              </label>
              <label>
                <span className="field-label">状态</span>
                <select className="select" value={newCheckDraft.status} disabled={!canWrite} onChange={event => setNewCheckDraft({ ...newCheckDraft, status: event.target.value })}>
                  {['pending', 'in_progress', 'blocked', 'done', 'pass', 'fail', 'na', 'waived'].map(status => (
                    <option key={status} value={status}>{STATUS_LABEL[status] ?? status}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3">
              <button
                className="btn btn-primary btn--sm"
                type="button"
                disabled={!canWrite || savingKey === 'check-create' || !selectedPhaseId || !newCheckDraft.title.trim() || !newCheckDraft.projectPhaseId || !newCheckDraft.moduleId}
                onClick={() => void save('check-create', () => onCreateCheckItem(newCheckDraft))}
                aria-label="新增检查项"
              >
                <Plus className="h-4 w-4" />
                {savingKey === 'check-create' ? '新增中' : '新增检查项'}
              </button>
            </div>
          </div>
        ) : null}
        <div className="table-shell mt-4">
          <table className="data-table min-w-[1520px]">
            <thead>
              <tr>
                <th>检查项</th>
                <th>阶段</th>
                <th>模块</th>
                <th>标签</th>
                <th>计划开始</th>
                <th>计划结束</th>
                <th>负责人</th>
                <th>状态</th>
                <th>启用</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleCheckItems.map(item => {
                const draft = checkItemDrafts[idOf(item.id)];
                if (!draft) return null;
                return (
                  <tr key={item.id}>
                    <td className="min-w-[240px]">
                      <input className="input" value={draft.title} disabled={!canWrite} onChange={event => setCheckItemDrafts(current => ({ ...current, [idOf(item.id)]: { ...draft, title: event.target.value } }))} />
                    </td>
                    <td className="min-w-[180px]">
                      <select
                        className="select"
                        value={draft.projectPhaseId}
                        disabled={!canWrite}
                        onChange={event => {
                          const phase = sortedPhases.find(item => idOf(item.id) === event.target.value);
                          setCheckItemDrafts(current => ({
                            ...current,
                            [idOf(item.id)]: {
                              ...draft,
                              projectPhaseId: event.target.value,
                              plannedStartDate: draft.plannedStartDate || dateInputValue(phase?.plannedStartDate),
                              plannedEndDate: draft.plannedEndDate || dateInputValue(phase?.plannedEndDate)
                            }
                          }));
                        }}
                      >
                        {sortedPhases.map(phase => <option key={phase.id} value={idOf(phase.id)}>{phase.name}</option>)}
                      </select>
                    </td>
                    <td className="min-w-[180px]">
                      <select className="select" value={draft.moduleId} disabled={!canWrite} onChange={event => setCheckItemDrafts(current => ({ ...current, [idOf(item.id)]: { ...draft, moduleId: event.target.value } }))}>
                        {bySequence(data.inspectionModules).map(module => (
                          <option key={module.id} value={idOf(module.id)}>{module.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="min-w-[180px]">
                      <input className="input" value={draft.tags} disabled={!canWrite} onChange={event => setCheckItemDrafts(current => ({ ...current, [idOf(item.id)]: { ...draft, tags: event.target.value } }))} />
                    </td>
                    <td className="min-w-[150px]">
                      <input className="input" type="date" value={draft.plannedStartDate} disabled={!canWrite} onChange={event => setCheckItemDrafts(current => ({ ...current, [idOf(item.id)]: { ...draft, plannedStartDate: event.target.value } }))} />
                    </td>
                    <td className="min-w-[150px]">
                      <input className="input" type="date" value={draft.plannedEndDate} disabled={!canWrite} onChange={event => setCheckItemDrafts(current => ({ ...current, [idOf(item.id)]: { ...draft, plannedEndDate: event.target.value } }))} />
                    </td>
                    <td className="min-w-[190px]">
                      <input
                        className="input"
                        list="base-config-owner-candidates"
                        value={draft.ownerName}
                        disabled={!canWrite}
                        onChange={event => setCheckItemDrafts(current => ({ ...current, [idOf(item.id)]: { ...draft, ownerName: event.target.value } }))}
                      />
                    </td>
                    <td className="min-w-[160px]">
                      <select className="select" value={draft.status} disabled={!canWrite} onChange={event => setCheckItemDrafts(current => ({ ...current, [idOf(item.id)]: { ...draft, status: event.target.value } }))}>
                        {['pending', 'in_progress', 'blocked', 'done', 'pass', 'fail', 'na', 'waived'].map(status => (
                          <option key={status} value={status}>{STATUS_LABEL[status] ?? status}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <label className="flex items-center gap-2 text-sm text-ink-muted">
                        <input
                          type="checkbox"
                          checked={draft.isActive}
                          disabled={!canWrite}
                          onChange={event => setCheckItemDrafts(current => ({ ...current, [idOf(item.id)]: { ...draft, isActive: event.target.checked } }))}
                        />
                        启用
                      </label>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="btn btn-primary btn--sm"
                          type="button"
                          disabled={!canWrite || savingKey === `check-${item.id}`}
                          onClick={() => void save(`check-${item.id}`, () => onUpdateCheckItem(item, draft))}
                        >
                          <Save className="h-4 w-4" />
                          保存
                        </button>
                        {item.canDelete === true ? (
                          <button
                            className="btn btn-ghost btn--sm"
                            type="button"
                            disabled={!canWrite || savingKey === `check-delete-${item.id}`}
                            onClick={() => {
                              if (window.confirm(`确认删除检查项「${item.title}」？`)) {
                                void save(`check-delete-${item.id}`, () => onDeleteCheckItem(item));
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                            删除
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!visibleCheckItems.length ? (
                <tr>
                  <td colSpan={10} className="text-center text-ink-muted">该阶段暂无检查项。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="kicker">Base Data</p>
            <h2 className="text-xl font-semibold">模块与负责人候选</h2>
            <p className="text-sm text-ink-muted">检查项模块、模板和 IDaaS 候选人在同一配置中心查看，避免基础数据维护入口分叉。</p>
          </div>
          <span className="chip">{data.inspectionModules.length} 模块 · {data.ownerCandidates.length} 候选人</span>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <div className="rounded-lg border border-outline bg-surface-soft p-4">
            <div className="text-sm font-semibold text-ink">检查模块</div>
            <div className="mt-3 space-y-2">
              {bySequence(data.inspectionModules).map(module => (
                <div key={module.id} className="flex items-center justify-between gap-3 rounded-lg border border-outline bg-surface px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">{module.name}</div>
                    <div className="text-xs text-ink-muted">{module.code}</div>
                  </div>
                  <StatusPill status={module.isActive ? 'active' : 'disabled'} />
                </div>
              ))}
              {!data.inspectionModules.length ? <EmptyState message="暂无检查模块。" /> : null}
            </div>
          </div>
          <div className="rounded-lg border border-outline bg-surface-soft p-4">
            <div className="text-sm font-semibold text-ink">检查项模板</div>
            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
              {data.checklistTemplates.map(template => (
                <div key={template.id} className="rounded-lg border border-outline bg-surface px-3 py-2">
                  <div className="text-sm font-semibold text-ink">{template.title}</div>
                  <div className="mt-1 text-xs text-ink-muted">{template.code} · {template.defaultOwnerRole ?? '未设置角色'}</div>
                </div>
              ))}
              {!data.checklistTemplates.length ? <EmptyState message="暂无检查项模板。" /> : null}
            </div>
          </div>
          <div className="rounded-lg border border-outline bg-surface-soft p-4">
            <div className="text-sm font-semibold text-ink">负责人候选</div>
            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
              {data.ownerCandidates.map(owner => (
                <div key={owner.idaasId || owner.displayName} className="rounded-lg border border-outline bg-surface px-3 py-2">
                  <div className="text-sm font-semibold text-ink">{owner.displayName}</div>
                  <div className="mt-1 text-xs text-ink-muted">{owner.department || owner.email || owner.idaasId}</div>
                </div>
              ))}
              {!data.ownerCandidates.length ? <EmptyState message="暂无负责人候选，负责人字段仍可手工输入。" /> : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function SettingsView({ data }: { data: WorkspaceData }) {
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <section className="panel">
        <h2 className="text-xl font-semibold">阶段模板</h2>
        <div className="mt-4 space-y-2">
          {bySequence(data.phaseTemplates).map(template => (
            <div key={template.id} className="rounded-lg border border-outline bg-surface-soft p-3">
              <div className="font-semibold text-ink">{template.name}</div>
              <div className="text-xs text-ink-muted">{template.code} · {template.defaultDurationDays ?? '-'} 天</div>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2 className="text-xl font-semibold">检查模块</h2>
        <div className="mt-4 space-y-2">
          {bySequence(data.inspectionModules).map(module => (
            <div key={module.id} className="flex items-center justify-between rounded-lg border border-outline bg-surface-soft p-3">
              <span className="font-semibold text-ink">{module.name}</span>
              <StatusPill status={module.isActive ? 'active' : 'disabled'} />
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2 className="text-xl font-semibold">检查项模板</h2>
        <div className="mt-4 space-y-2">
          {data.checklistTemplates.map(template => (
            <div key={template.id} className="rounded-lg border border-outline bg-surface-soft p-3">
              <div className="font-semibold text-ink">{template.title}</div>
              <div className="text-xs text-ink-muted">{template.code} · {template.defaultOwnerRole ?? '未设置'}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const mutationErrorMessage = (error: unknown, fallback: string) =>
  error instanceof ApiError && error.status === 403
    ? '当前账号没有写权限，已保留只读访问。'
    : error instanceof Error
      ? error.message
      : fallback;

export default function App() {
  const [currentView, setCurrentView] = useState<AppTab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | number | undefined>();
  const [scope, setScope] = useState<ScopeState>(EMPTY_SCOPE);
  const [workspace, setWorkspace] = useState<WorkspaceData>(EMPTY_WORKSPACE);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authWarning, setAuthWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { theme, toggleTheme } = useTheme();
  const { isCollapsed, toggleCollapsed } = usePersistentSidebarCollapse();
  const canWrite = profile?.canWrite ?? false;

  const loadAuth = async () => {
    try {
      const nextProfile = await fetchUserProfile();
      setProfile(nextProfile);
      setAuthWarning(null);
    } catch (err) {
      if (err instanceof AuthError && err.status === 403) {
        setAuthWarning(err.message);
        setProfile({
          userId: 'readonly',
          displayName: '只读用户',
          role: 'viewer',
          permissionLabel: '只读用户',
          canWrite: false,
          adminModules: []
        });
        return;
      }
      setAuthWarning(err instanceof Error ? err.message : '授权检查失败');
    }
  };

  const loadData = async (projectId = selectedProjectId, filters = scope) => {
    if (projectId !== undefined) {
      setSelectedProjectId(projectId);
    }
    setLoading(true);
    setError(null);
    try {
      const next = await fetchWorkspaceData(projectId, {
        factoryId: filters.factoryId || undefined,
        workshopId: filters.workshopId || undefined,
        productionLineId: filters.productionLineId || undefined
      });
      setWorkspace(next);
      setSelectedProjectId(next.selectedProject?.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '数据加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAuth();
    void loadData();
  }, []);

  useEffect(() => {
    if (currentView !== 'dashboard') return;
    if (!scope.factoryId && !scope.workshopId && !scope.productionLineId) return;
    setScope(EMPTY_SCOPE);
    void loadData(selectedProjectId, EMPTY_SCOPE);
  }, [currentView]);

  const handleScopeChange = (nextScope: ScopeState) => {
    setScope(nextScope);
    void loadData(undefined, nextScope);
  };

  const handleSelectCurrentProject = (projectId: string | number) => {
    if (!projectId) return;
    setScope(EMPTY_SCOPE);
    setSelectedProjectId(projectId);
    void loadData(projectId, EMPTY_SCOPE);
  };

  const handleOpenProjectView = (projectId: string | number, view: DashboardJumpTarget) => {
    if (!projectId) return;
    setScope(EMPTY_SCOPE);
    setSelectedProjectId(projectId);
    setCurrentView(view);
    void loadData(projectId, EMPTY_SCOPE);
  };

  const handleCreateProject = async (nextView: AppTab = 'baseConfig') => {
    if (!canWrite) return;
    const factory = workspace.hierarchy.factories.find(item => idOf(item.id) === scope.factoryId);
    const workshop = workspace.hierarchy.workshops.find(item => idOf(item.id) === scope.workshopId);
    const productionLine = workspace.hierarchy.productionLines.find(item => idOf(item.id) === scope.productionLineId);

    if (!factory || !workshop) {
      setError('创建项目前必须先选择工厂和车间，产线可为空。');
      return;
    }

    try {
      const scopeName = productionLine?.name ?? `${workshop.name}车间级`;
      const project = await createProject({
        name: `${scopeName} Auto Status ${workspace.projects.length + 1}`,
        code: `BS-AUTO-${Date.now()}`,
        factoryId: factory.id,
        workshopId: workshop.id,
        productionLineId: productionLine?.id ?? null,
        plant: factory.name,
        lineName: productionLine?.name ?? '车间级项目',
        workshopName: workshop.name,
        ownerName: profile?.displayName ?? '未设置',
        plannedStartDate: new Date().toISOString().slice(0, 10),
        plannedEndDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10)
      });
      await loadData(project.id);
      setCurrentView(nextView);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建项目失败');
    }
  };

  const handleUpdateOwner = async (item: CheckItem, ownerName: string, ownerIdaasId?: string) => {
    if (!canWrite) return;
    try {
      await updateCheckItemOwner(item.id, { ownerName, ownerIdaasId, metadata: item.metadata });
      await loadData();
    } catch (err) {
      setError(mutationErrorMessage(err, '负责人更新失败'));
      throw err;
    }
  };

  const handleUpdateProject = async (draft: ProjectConfigDraft) => {
    if (!canWrite || !workspace.selectedProject) return;
    const factory = workspace.hierarchy.factories.find(item => idOf(item.id) === draft.factoryId);
    const workshop = workspace.hierarchy.workshops.find(item => idOf(item.id) === draft.workshopId);
    const productionLine = workspace.hierarchy.productionLines.find(item => idOf(item.id) === draft.productionLineId);

    try {
      await updateProject(workspace.selectedProject.id, {
        name: draft.name,
        code: draft.code,
        status: draft.status,
        description: draft.description,
        factoryId: draft.factoryId || null,
        workshopId: draft.workshopId || null,
        productionLineId: draft.productionLineId || null,
        plant: factory?.name ?? workspace.selectedProject.plant,
        workshopName: workshop?.name,
        lineName: productionLine?.name ?? '车间级项目',
        ownerName: draft.ownerName,
        plannedStartDate: draft.plannedStartDate,
        plannedEndDate: draft.plannedEndDate,
        metadata: workspace.selectedProject.metadata
      });
      await loadData(workspace.selectedProject.id);
    } catch (err) {
      setError(mutationErrorMessage(err, '项目基础信息保存失败'));
      throw err;
    }
  };

  const handleUpdatePhase = async (phase: ProjectPhase, draft: PhaseConfigDraft) => {
    if (!canWrite) return;
    try {
      await updateProjectPhase(phase.id, {
        name: draft.name,
        sequence: Number(draft.sequence),
        goal: draft.goal,
        plannedStartDate: draft.plannedStartDate,
        plannedEndDate: draft.plannedEndDate,
        status: draft.status,
        isActive: draft.isActive,
        metadata: phase.metadata
      });
      await loadData();
    } catch (err) {
      setError(mutationErrorMessage(err, '阶段配置保存失败'));
      throw err;
    }
  };

  const handleSeedTemplate = async () => {
    if (!canWrite || !workspace.selectedProject) return;
    try {
      await seedProjectTemplate(workspace.selectedProject.id);
      await loadData(workspace.selectedProject.id);
    } catch (err) {
      setError(mutationErrorMessage(err, '默认阶段补齐失败'));
      throw err;
    }
  };

  const handleDeletePhase = async (phase: ProjectPhase) => {
    if (!canWrite) return;
    try {
      await deleteProjectPhase(phase.id);
      await loadData();
    } catch (err) {
      setError(mutationErrorMessage(err, '阶段删除失败'));
      throw err;
    }
  };

  const handleCreateCheckItemConfig = async (draft: CheckItemConfigDraft) => {
    if (!canWrite || !workspace.selectedProject) return;
    try {
      await createCheckItem(workspace.selectedProject.id, {
        title: draft.title,
        moduleId: draft.moduleId,
        projectPhaseId: draft.projectPhaseId,
        tags: draft.tags.split(/[,，、]/).map(tag => tag.trim()).filter(Boolean),
        plannedStartDate: draft.plannedStartDate,
        plannedEndDate: draft.plannedEndDate,
        ownerName: draft.ownerName,
        ownerIdaasId: draft.ownerIdaasId,
        status: draft.status,
        isActive: draft.isActive,
        progressPercent: isComplete(draft.status) ? 100 : 0
      });
      await loadData(workspace.selectedProject.id);
    } catch (err) {
      setError(mutationErrorMessage(err, '检查项新增失败'));
      throw err;
    }
  };

  const handleUpdateCheckItemConfig = async (item: CheckItem, draft: CheckItemConfigDraft) => {
    if (!canWrite) return;
    try {
      await updateCheckItem(item.id, {
        title: draft.title,
        moduleId: draft.moduleId,
        projectPhaseId: draft.projectPhaseId,
        tags: draft.tags.split(/[,，、]/).map(tag => tag.trim()).filter(Boolean),
        plannedStartDate: draft.plannedStartDate,
        plannedEndDate: draft.plannedEndDate,
        ownerName: draft.ownerName,
        ownerIdaasId: draft.ownerIdaasId,
        status: draft.status,
        isActive: draft.isActive,
        progressPercent: isComplete(draft.status) ? 100 : item.progressPercent,
        metadata: item.metadata
      });
      await loadData();
    } catch (err) {
      setError(mutationErrorMessage(err, '检查项配置保存失败'));
      throw err;
    }
  };

  const handleDeleteCheckItem = async (item: CheckItem) => {
    if (!canWrite) return;
    try {
      await deleteCheckItem(item.id);
      await loadData();
    } catch (err) {
      setError(mutationErrorMessage(err, '检查项删除失败'));
      throw err;
    }
  };

  const handleCreateExport = async (report: ReportDefinition) => {
    if (!canWrite || !workspace.selectedProject) return;
    try {
      await createExportTask(workspace.selectedProject.id, {
        reportName: report.name,
        reportType: report.id,
        format: report.format
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出任务创建失败');
    }
  };

  const handleDownloadExport = async (task: ExportTask) => {
    const downloadUrl = await fetchExportDownloadLink(task.id);
    if (!downloadUrl) {
      throw new Error('后端未返回导出下载链接。');
    }
    const opened = window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    if (!opened) {
      window.location.assign(downloadUrl);
    }
  };

  const withProjectContext = (content: ReactNode) => (
    <div className="grid gap-5">
      <ProjectContextBar
        projects={workspace.projects}
        selectedProject={workspace.selectedProject}
        onSelectProject={handleSelectCurrentProject}
      />
      {content}
    </div>
  );

  const renderView = () => {
    if (currentView === 'dashboard') {
      return (
        <DashboardView
          data={workspace}
          onOpenProject={handleOpenProjectView}
        />
      );
    }
    if (currentView === 'projects') {
      return (
        <ProjectsView
          projects={workspace.projects}
          selectedProject={workspace.selectedProject}
          canWrite={canWrite}
          onSelectProject={projectId => {
            handleSelectCurrentProject(projectId);
            setCurrentView('dashboard');
          }}
          onCreateProject={() => void handleCreateProject('baseConfig')}
        />
      );
    }
    if (currentView === 'baseConfig') {
      return (
        <BaseConfigView
          data={workspace}
          scope={scope}
          canWrite={canWrite}
          onScopeChange={handleScopeChange}
          onSelectProject={projectId => {
            setSelectedProjectId(projectId);
            void loadData(projectId);
          }}
          onCreateProject={() => void handleCreateProject('baseConfig')}
          onUpdateProject={handleUpdateProject}
          onSeedTemplate={handleSeedTemplate}
          onUpdatePhase={handleUpdatePhase}
          onDeletePhase={handleDeletePhase}
          onCreateCheckItem={handleCreateCheckItemConfig}
          onUpdateCheckItem={handleUpdateCheckItemConfig}
          onDeleteCheckItem={handleDeleteCheckItem}
        />
      );
    }
    if (currentView === 'phases') return withProjectContext(<PhasesView data={workspace} />);
    if (currentView === 'timeline') {
      return withProjectContext(
        <TimelineView
          project={workspace.selectedProject}
          phases={workspace.timeline?.phases.length ? workspace.timeline.phases : workspace.phases}
          checkItems={workspace.timeline?.checkItems.length ? workspace.timeline.checkItems : workspace.checkItems}
          modules={workspace.inspectionModules}
        />
      );
    }
    if (currentView === 'checks') {
      return withProjectContext(
        <ChecksView
          checkItems={workspace.checkItems}
          phases={workspace.phases}
          modules={workspace.inspectionModules}
          ownerCandidates={workspace.ownerCandidates}
          canWrite={canWrite}
          defaultOwnerName={workspace.selectedProject?.ownerName ?? profile?.displayName ?? ''}
          onCreateCheckItem={handleCreateCheckItemConfig}
          onUpdateOwner={handleUpdateOwner}
        />
      );
    }
    if (currentView === 'issues') return withProjectContext(<IssuesView issues={workspace.keyIssues} phases={workspace.phases} />);
    if (currentView === 'collision') return withProjectContext(<CollisionView reports={workspace.collisionReports} phases={workspace.phases} />);
    if (currentView === 'reports') {
      return withProjectContext(
        <ReportsView
          reports={workspace.reports}
          tasks={workspace.exportTasks}
          canWrite={canWrite}
          onCreateExport={handleCreateExport}
          onDownloadExport={handleDownloadExport}
        />
      );
    }
    return <SettingsView data={workspace} />;
  };

  return (
    <div className="flex min-h-screen text-ink">
      <div
        className={`fixed inset-0 z-30 bg-black/60 backdrop-blur-sm transition lg:hidden ${
          sidebarOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setSidebarOpen(false)}
      />
      <Sidebar
        currentView={currentView}
        onChangeView={setCurrentView}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        profile={profile}
        warning={authWarning}
        theme={theme}
        onToggleTheme={toggleTheme}
        isDesktopCollapsed={isCollapsed}
        onToggleDesktopCollapsed={toggleCollapsed}
      />
      <div className={`min-w-0 flex-1 transition-[padding] duration-200 ${isCollapsed ? 'lg:pl-20' : 'lg:pl-72'}`}>
        <header className="sticky top-0 z-20 border-b border-outline bg-surface/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1520px] flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <MobileMenuButton onClick={() => setSidebarOpen(true)} />
              <div className="min-w-0">
                <p className="kicker">LI-BS-AUTO-STATUS</p>
                <h1 className="truncate text-lg font-semibold sm:text-xl">
                  Auto Status 自动化项目状态
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                  <span className="truncate">焊装自动化六阶段项目状态、检查项、风险签核与一页纸导出</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {profile ? (
                <div className="header-user">
                  <UserRound className="h-4 w-4 text-primary" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{profile.displayName}</span>
                    <span className="block truncate text-[11px] text-ink-muted">{profile.permissionLabel}</span>
                  </span>
                </div>
              ) : (
                <div className="header-user">
                  <UserRound className="h-4 w-4 text-ink-muted" />
                  <span className="text-sm font-semibold text-ink-muted">未登录</span>
                </div>
              )}
              <button
                className="btn btn-ghost btn--sm"
                type="button"
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {theme === 'dark' ? '浅色' : '深色'}
              </button>
            </div>
          </div>
        </header>
        <main className="page-shell" aria-busy={loading}>
          {!profile && !authWarning ? (
            <AuthPromptCard loginUrl={LOGIN_URL} authError={authWarning} onRefresh={() => void loadAuth()} />
          ) : null}
          {error ? (
            <section className="panel border-danger/40 bg-danger/10">
              <div className="flex items-center gap-2 text-danger">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-semibold">{error}</span>
              </div>
            </section>
          ) : null}
          {authWarning ? (
            <section className="panel border-warning/40 bg-warning/10">
              <div className="flex items-center gap-2 text-warning">
                <Search className="h-4 w-4" />
                <span className="text-sm font-semibold">{authWarning}</span>
              </div>
            </section>
          ) : null}
          {renderView()}
        </main>
      </div>
    </div>
  );
}
