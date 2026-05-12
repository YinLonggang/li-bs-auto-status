import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  FileDown,
  Lock,
  Plus,
  RefreshCcw,
  Save,
  Search,
  ShieldCheck
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
  fetchWorkspaceData,
  updateCheckItemOwner
} from './services/bsAutoStatusApi';
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
  projects: { title: '项目列表', subtitle: '项目切换与状态' },
  overview: { title: '项目总览', subtitle: '阶段、问题与检查项状态' },
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

const phaseTone = (status: string): StatusTone => {
  if (status === 'completed' || status === 'done' || status === 'succeeded') return 'success';
  if (status === 'blocked' || status === 'failed' || status === 'critical') return 'danger';
  if (status === 'in_progress' || status === 'running' || status === 'containment') return 'primary';
  if (status === 'queued' || status === 'planning') return 'warning';
  return 'muted';
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  return value.slice(0, 10);
};

const percent = (value: number) => `${Math.max(0, Math.min(100, Math.round(value)))}%`;

const bySequence = <T extends { sequence: number }>(items: T[]) =>
  [...items].sort((left, right) => left.sequence - right.sequence);

function StatusPill({ status }: { status: string }) {
  return <span className={`status-pill ${TONE_CLASS[phaseTone(status)]}`}>{status}</span>;
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
        </div>
      ))}
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
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function CollisionView({ reports }: { reports: CollisionReport[] }) {
  const fields: Array<[keyof CollisionReport, string]> = [
    ['problemDefinition', 'Problem definition'],
    ['impact', 'Impact'],
    ['containment', 'Containment'],
    ['rootCause', 'Root cause'],
    ['correctiveAction', 'Corrective action'],
    ['preventiveAction', 'Preventive action'],
    ['validation', 'Validation'],
    ['approvalSignoff', 'Approval / signoff']
  ];

  return (
    <div className="grid gap-5">
      {reports.map(report => (
        <section key={report.id} className="panel">
          <div className="panel-header">
            <div>
              <p className="kicker">A3 / 8D Lite</p>
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
  onCreateExport
}: {
  reports: ReportDefinition[];
  tasks: ExportTask[];
  canWrite: boolean;
  onCreateExport: (report: ReportDefinition) => void;
}) {
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
              {tasks.map(task => (
                <tr key={task.id}>
                  <td>{task.reportName}</td>
                  <td><StatusPill status={task.status} /></td>
                  <td>{task.requestedBy}</td>
                  <td>{formatDate(task.requestedAt)}</td>
                  <td>
                    {task.downloadUrl ? (
                      <a className="btn btn-ghost btn--sm" href={task.downloadUrl}>
                        <Download className="h-4 w-4" />
                        下载
                      </a>
                    ) : (
                      <span className="text-xs text-ink-muted">{task.errorMessage ?? '等待产物'}</span>
                    )}
                  </td>
                </tr>
              ))}
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

export default function App() {
  const [currentView, setCurrentView] = useState<AppTab>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | number | undefined>();
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

  const loadData = async (projectId = selectedProjectId) => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchWorkspaceData(projectId);
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

  const viewMeta = VIEW_META[currentView];
  const headerStatus = useMemo(() => {
    if (loading) return { icon: Clock3, label: '同步中', tone: 'text-warning' };
    if (error) return { icon: AlertTriangle, label: '接口异常', tone: 'text-danger' };
    return { icon: CheckCircle2, label: '已同步', tone: 'text-success' };
  }, [error, loading]);
  const HeaderIcon = headerStatus.icon;

  const handleCreateProject = async () => {
    if (!canWrite) return;
    try {
      const project = await createProject({
        name: `Auto Status 项目 ${workspace.projects.length + 1}`,
        code: `BS-AUTO-${Date.now()}`,
        plant: workspace.selectedProject?.plant ?? '常州一区',
        lineName: workspace.selectedProject?.lineName ?? '焊装线',
        ownerName: profile?.displayName ?? '未设置',
        plannedStartDate: new Date().toISOString().slice(0, 10),
        plannedEndDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10)
      });
      await loadData(project.id);
      setCurrentView('projects');
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

  const renderView = () => {
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
    if (currentView === 'overview') {
      return (
        <OverviewView
          project={workspace.selectedProject}
          phases={workspace.phases}
          checkItems={workspace.checkItems}
          keyIssues={workspace.keyIssues}
          exportTasks={workspace.exportTasks}
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
            <div className="flex flex-wrap items-center gap-2">
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
              <button className="btn btn-primary btn--sm" type="button" disabled={!canWrite} onClick={handleCreateProject}>
                <Plus className="h-4 w-4" />
                新建
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
