import { useEffect, useMemo, useState } from 'react';
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
  Paperclip,
  Plus,
  RefreshCcw,
  Save,
  Search,
  ShieldCheck,
  Target,
  Workflow
} from 'lucide-react';
import AuthPromptCard from './components/AuthPromptCard';
import Sidebar, { AppTab, MobileMenuButton } from './components/Sidebar';
import { LOGIN_URL } from './config';
import { usePersistentSidebarCollapse } from './hooks/usePersistentSidebarCollapse';
import { useTheme } from './hooks/useTheme';
import { AuthError, fetchUserProfile } from './services/auth';
import {
  createExportTask,
  createProject,
  fetchExportDownloadLink,
  fetchWorkspaceData,
  updateCheckItemOwner
} from './services/bsAutoStatusApi';
import { ApiError } from './services/http';
import type {
  CheckItem,
  CollisionReport,
  ExportTask,
  InspectionModule,
  KeyIssue,
  OwnerCandidate,
  Project,
  ProjectPhase,
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

const VIEW_META: Record<AppTab, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: '项目状态、阶段进度、检查风险和签核' },
  projects: { title: '项目列表', subtitle: '项目切换与状态' },
  phases: { title: '阶段配置', subtitle: '模板与项目阶段实例' },
  timeline: { title: '阶段进度', subtitle: '计划、实际和当前进展' },
  checks: { title: '检查项', subtitle: '检查台账与负责人维护' },
  issues: { title: '重点问题', subtitle: '风险、遏制与关闭' },
  collision: { title: '碰撞一页纸', subtitle: 'A3/8D 轻量评审材料' },
  reports: { title: '报告导出', subtitle: '导出定义与任务队列' },
  settings: { title: '配置管理', subtitle: '阶段模板、模块和检查项模板' }
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

const percent = (value: number) => `${Math.max(0, Math.min(100, Math.round(value)))}%`;

const bySequence = <T extends { sequence: number }>(items: T[]) =>
  [...items].sort((left, right) => left.sequence - right.sequence);

const idOf = (value?: string | number | null) => (value === undefined || value === null ? '' : `${value}`);

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

type DashboardCell = {
  moduleId: string;
  phaseId: string;
};

function HeaderProjectSelector({
  projects,
  selectedProject,
  summary,
  onSelectProject,
  onCreateExport,
  canWrite
}: {
  projects: Project[];
  selectedProject: Project | null;
  summary: WorkspaceData['dashboardSummary'];
  onSelectProject: (projectId: string | number) => void;
  onCreateExport: () => void;
  canWrite: boolean;
}) {
  const progress = summary?.completionRate ?? selectedProject?.progressPercent ?? 0;
  const options = projects.length ? projects : selectedProject ? [selectedProject] : [];

  return (
    <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
      <label className="flex min-h-11 min-w-[260px] flex-1 items-center gap-2 rounded-lg border border-outline bg-surface-strong px-3 text-sm lg:min-w-[360px] lg:flex-none">
        <span className="shrink-0 text-xs font-semibold text-ink-muted">项目</span>
        <select
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-ink outline-none"
          value={selectedProject ? idOf(selectedProject.id) : ''}
          onChange={event => onSelectProject(event.target.value)}
        >
          {options.length ? null : <option value="">暂无项目</option>}
          {options.map(project => (
            <option key={project.id} value={idOf(project.id)}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex min-h-11 items-center gap-2 rounded-lg border border-outline bg-surface-strong px-3">
        <span className="text-xs text-ink-muted">总完成率</span>
        <div className="h-2 w-24 rounded-full bg-surface">
          <div className="h-2 rounded-full bg-accent" style={{ width: percent(progress) }} />
        </div>
        <span className="min-w-10 text-right text-sm font-semibold text-accent">{percent(progress)}</span>
      </div>
      <button className="btn btn-primary btn--sm" type="button" disabled={!canWrite || !selectedProject} onClick={onCreateExport}>
        <FileDown className="h-4 w-4" />
        导出
      </button>
    </div>
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
      <MetricCard label="检查闭环" value={`${doneChecks}/${totalChecks}`} detail={`${openCheckCount} 项未关闭`} />
      <MetricCard label="重点问题" value={summary?.openKeyIssueCount ?? openIssues} detail={`${summary?.highOpenKeyIssueCount ?? 0} 个高风险`} />
      <MetricCard label="导出/签核" value={summary?.exportJobCount ?? signedReports} detail={`${summary?.pendingCollisionReportCount ?? 0} 个一页纸待签`} />
    </div>
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
  const gridTemplateColumns = `190px repeat(${Math.max(sortedPhases.length, 1)}, minmax(118px, 1fr))`;
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
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="kicker">Key Issues</p>
          <h2 className="text-lg font-semibold">重点问题表</h2>
        </div>
        <span className="chip">{issues.length} 条</span>
      </div>
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
            </tr>
          </thead>
          <tbody>
            {issues.map((issue, index) => (
              <tr key={issue.id}>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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
  visibleProjects,
  scope,
  selectedCell,
  canWrite,
  onScopeChange,
  onSelectProject,
  onSelectCell,
  onCreateProject,
  onCreateExport
}: {
  data: WorkspaceData;
  visibleProjects: Project[];
  scope: ScopeState;
  selectedCell: DashboardCell | null;
  canWrite: boolean;
  onScopeChange: (scope: ScopeState) => void;
  onSelectProject: (projectId: string | number) => void;
  onSelectCell: (cell: DashboardCell) => void;
  onCreateProject: () => void;
  onCreateExport: () => void;
}) {
  const sortedModules = bySequence(data.inspectionModules);
  const sortedPhases = bySequence(data.phases);
  const firstPopulatedCell =
    sortedModules.flatMap(module =>
      sortedPhases.map(phase => ({
        moduleId: idOf(module.id),
        phaseId: idOf(phase.id),
        count: data.checkItems.filter(item => idOf(item.moduleId) === idOf(module.id) && idOf(item.projectPhaseId) === idOf(phase.id)).length
      }))
    ).find(cell => cell.count > 0) ?? null;
  const activeCell = selectedCell ?? (firstPopulatedCell ? { moduleId: firstPopulatedCell.moduleId, phaseId: firstPopulatedCell.phaseId } : null);

  return (
    <div className="grid gap-5">
      <ScopeToolbar hierarchy={data.hierarchy} scope={scope} canWrite={canWrite} onChange={onScopeChange} onCreateProject={onCreateProject} />
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="kicker">Project Context</p>
            <h2 className="text-xl font-semibold">{data.selectedProject?.name ?? '未选择项目'}</h2>
            <p className="text-sm text-ink-muted">
              {[data.selectedProject?.plant, data.selectedProject?.workshopName, data.selectedProject?.lineName].filter(Boolean).join(' / ') || '通过工厂、车间和可选产线过滤项目'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="chip"><FactoryIcon className="h-3.5 w-3.5" />匹配项目 {visibleProjects.length}</span>
            {data.selectedProject ? <StatusPill status={data.selectedProject.status} /> : null}
          </div>
        </div>
      </section>
      <PhaseRail phases={data.phases} />
      <DashboardStats
        project={data.selectedProject}
        summary={data.dashboardSummary}
        phases={data.phases}
        checkItems={data.checkItems}
        keyIssues={data.keyIssues}
        exportTasks={data.exportTasks}
      />
      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.9fr]">
        <ModuleSwimlane
          phases={data.phases}
          modules={data.inspectionModules}
          checkItems={data.checkItems}
          selectedCell={activeCell}
          onSelectCell={onSelectCell}
        />
        <ChecklistDetailPanel
          phases={data.phases}
          modules={data.inspectionModules}
          checkItems={data.checkItems}
          selectedCell={activeCell}
          canWrite={canWrite}
        />
      </div>
      <div className="grid gap-5 2xl:grid-cols-[1.15fr_0.85fr]">
        <KeyIssueTable issues={data.keyIssues} />
        <CollisionOnePager reports={data.collisionReports} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-outline bg-surface px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Flag className="h-4 w-4 text-accent" />
          默认 dashboard 已覆盖原型的阶段、模块、重点问题、碰撞一页纸、签核和附件入口。
        </div>
        <button className="btn btn-ghost btn--sm" type="button" disabled={!data.selectedProject} onClick={onCreateExport}>
          <ArrowUpRight className="h-4 w-4" />
          生成总览导出
        </button>
      </div>
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
          </button>
        ))}
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

function TimelineView({ phases }: { phases: ProjectPhase[] }) {
  const sorted = bySequence(phases);
  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="text-xl font-semibold">阶段进度</h2>
      </div>
      <div className="mt-5 space-y-4">
        {sorted.map(phase => (
          <div key={phase.id} className="grid gap-3 rounded-lg border border-outline bg-surface-soft p-4 lg:grid-cols-[180px_1fr_120px]">
            <div>
              <div className="font-semibold text-ink">{phase.name}</div>
              <div className="text-xs text-ink-muted">{formatDate(phase.plannedStartDate)} / {formatDate(phase.plannedEndDate)}</div>
            </div>
            <div className="flex items-center">
              <div className="h-4 w-full rounded-full bg-surface-strong">
                <div className="h-4 rounded-full bg-accent" style={{ width: percent(phase.progressPercent) }} />
              </div>
            </div>
            <div className="flex items-center justify-start lg:justify-end">
              <StatusPill status={phase.status} />
            </div>
          </div>
        ))}
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
  onUpdateOwner
}: {
  checkItems: CheckItem[];
  phases: ProjectPhase[];
  modules: InspectionModule[];
  ownerCandidates: OwnerCandidate[];
  canWrite: boolean;
  onUpdateOwner: (item: CheckItem, ownerName: string, ownerIdaasId?: string) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, { ownerName: string; ownerIdaasId?: string }>>({});
  const phaseById = new Map(phases.map(phase => [`${phase.id}`, phase]));
  const moduleById = new Map(modules.map(module => [`${module.id}`, module]));

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2 className="text-xl font-semibold">检查项表格</h2>
          <p className="text-sm text-ink-muted">负责人可选择 IDaaS 候选人，也可直接输入姓名。</p>
        </div>
        <ReadOnlyNotice canWrite={canWrite} />
      </div>
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
            {checkItems.map(item => {
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

function IssuesView({ issues }: { issues: KeyIssue[] }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="text-xl font-semibold">重点问题</h2>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {issues.map(issue => (
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

function CollisionView({ reports }: { reports: CollisionReport[] }) {
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

  return (
    <div className="grid gap-5">
      {reports.map(report => (
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
        <div className="mt-4 space-y-3">
          {reports.map(report => (
            <div key={report.id} className="rounded-lg border border-outline bg-surface-soft p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-ink">{report.name}</div>
                  <div className="text-xs text-ink-muted">{report.description}</div>
                </div>
                <button className="btn btn-primary btn--sm" disabled={!canWrite} type="button" onClick={() => onCreateExport(report)}>
                  <FileDown className="h-4 w-4" />
                  导出
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2 className="text-xl font-semibold">导出任务</h2>
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
              {tasks.map(task => {
                const state = downloadState[idOf(task.id)] ?? {};
                const hasArtifact = Boolean(task.resultObjectKey);
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
            </tbody>
          </table>
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

const projectMatchesScope = (project: Project | null | undefined, scope: ScopeState) => {
  if (!project) return false;
  if (scope.factoryId && idOf(project.factoryId) !== scope.factoryId) return false;
  if (scope.workshopId && idOf(project.workshopId) !== scope.workshopId) return false;
  if (scope.productionLineId && idOf(project.productionLineId) !== scope.productionLineId) return false;
  return true;
};

export default function App() {
  const [currentView, setCurrentView] = useState<AppTab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | number | undefined>();
  const [scope, setScope] = useState<ScopeState>({ factoryId: '', workshopId: '', productionLineId: '' });
  const [selectedDashboardCell, setSelectedDashboardCell] = useState<DashboardCell | null>(null);
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
    if (!workspace.selectedProject) return;
    setSelectedDashboardCell(null);
  }, [workspace.selectedProject?.id]);

  const visibleProjects = useMemo(
    () => workspace.projects.filter(project => projectMatchesScope(project, scope)),
    [workspace.projects, scope]
  );

  const viewMeta = VIEW_META[currentView];
  const headerStatus = useMemo(() => {
    if (loading) return { icon: Clock3, label: '同步中', tone: 'text-warning' };
    if (error) return { icon: AlertTriangle, label: '接口异常', tone: 'text-danger' };
    return { icon: CheckCircle2, label: '已同步', tone: 'text-success' };
  }, [error, loading]);
  const HeaderIcon = headerStatus.icon;

  const handleScopeChange = (nextScope: ScopeState) => {
    setScope(nextScope);
    void loadData(undefined, nextScope);
  };

  const handleCreateProject = async () => {
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
      setCurrentView('dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建项目失败');
    }
  };

  const handleUpdateOwner = async (item: CheckItem, ownerName: string, ownerIdaasId?: string) => {
    if (!canWrite) return;
    try {
      await updateCheckItemOwner(item.id, { ownerName, ownerIdaasId });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '负责人更新失败');
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

  const handleCreateProjectExport = async () => {
    const report =
      workspace.reports.find(item => `${item.id}` === 'project') ??
      workspace.reports[0] ??
      {
        id: 'project',
        name: '项目总览导出',
        description: '阶段、检查项、重点问题与签核汇总。',
        format: 'xlsx'
      };
    await handleCreateExport(report);
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

  const renderView = () => {
    if (currentView === 'dashboard') {
      return (
        <DashboardView
          data={workspace}
          visibleProjects={visibleProjects}
          scope={scope}
          selectedCell={selectedDashboardCell}
          canWrite={canWrite}
          onScopeChange={handleScopeChange}
          onSelectProject={projectId => void loadData(projectId)}
          onSelectCell={setSelectedDashboardCell}
          onCreateProject={handleCreateProject}
          onCreateExport={() => void handleCreateProjectExport()}
        />
      );
    }
    if (currentView === 'projects') {
      return (
        <ProjectsView
          projects={workspace.projects}
          selectedProject={workspace.selectedProject}
          canWrite={canWrite}
          onSelectProject={projectId => void loadData(projectId)}
          onCreateProject={handleCreateProject}
        />
      );
    }
    if (currentView === 'phases') return <PhasesView data={workspace} />;
    if (currentView === 'timeline') return <TimelineView phases={workspace.phases} />;
    if (currentView === 'checks') {
      return (
        <ChecksView
          checkItems={workspace.checkItems}
          phases={workspace.phases}
          modules={workspace.inspectionModules}
          ownerCandidates={workspace.ownerCandidates}
          canWrite={canWrite}
          onUpdateOwner={handleUpdateOwner}
        />
      );
    }
    if (currentView === 'issues') return <IssuesView issues={workspace.keyIssues} />;
    if (currentView === 'collision') return <CollisionView reports={workspace.collisionReports} />;
    if (currentView === 'reports') {
      return (
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
          <div className="mx-auto flex max-w-[1520px] flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <MobileMenuButton onClick={() => setSidebarOpen(true)} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-lg font-semibold sm:text-xl">{viewMeta.title}</h1>
                  <span className={`chip ${headerStatus.tone}`}>
                    <HeaderIcon className="h-3.5 w-3.5" />
                    {headerStatus.label}
                  </span>
                </div>
                <p className="truncate text-xs text-ink-muted">{viewMeta.subtitle}</p>
              </div>
            </div>
            <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
              <HeaderProjectSelector
                projects={visibleProjects}
                selectedProject={workspace.selectedProject}
                summary={workspace.dashboardSummary}
                onSelectProject={projectId => void loadData(projectId)}
                onCreateExport={() => void handleCreateProjectExport()}
                canWrite={canWrite}
              />
              {profile ? (
                <span className="chip">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {profile.permissionLabel}
                </span>
              ) : null}
              <button className="btn btn-ghost btn--sm" type="button" onClick={() => void loadData()}>
                <RefreshCcw className="h-4 w-4" />
                刷新
              </button>
            </div>
          </div>
        </header>
        <main className="page-shell">
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
