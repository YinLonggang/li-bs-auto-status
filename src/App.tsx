import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ClipboardEvent, KeyboardEvent, ReactNode } from 'react';
import { toPng } from 'html-to-image';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  Factory as FactoryIcon,
  FileDown,
  FileText,
  Flag,
  Home,
  Image as ImageIcon,
  Lock,
  Moon,
  Paperclip,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  Target,
  Trash2,
  UserRound,
  Workflow,
  X
} from 'lucide-react';
import AuthPromptCard from './components/AuthPromptCard';
import TimelineGantt from './components/TimelineGantt';
import Pagination from './components/Pagination';
import { SideDrawer } from '@li-sicar/side-drawer';
import { usePaginatedList } from './hooks/usePaginatedList';
import { allowEditorNavigation, RelatedDraftContext, useRecordEditor, useRelatedDraftDirty } from './hooks/useRecordEditor';
import { useCaptionDrafts } from './hooks/useCaptionDrafts';
import { useAttachmentPreview } from './hooks/useAttachmentPreview';
import type { AttachmentPreviewState } from './hooks/useAttachmentPreview';
import { useAttachmentDownload } from './hooks/useAttachmentDownload';
import type { AttachmentDownloadHandler } from './hooks/useAttachmentDownload';
import Sidebar, { AppTab, MobileMenuButton } from './components/Sidebar';
import { LOGIN_URL } from './config';
import { usePersistentSidebarCollapse } from './hooks/usePersistentSidebarCollapse';
import { useTheme } from './hooks/useTheme';
import { AuthError, fetchUserProfile } from './services/auth';
import { initZeus } from './zeus';
import {
  applyInspectionModuleOwner,
  cancelProjectPhysicalDeletion,
  createChecklistTemplate,
  createInspectionModule,
  createPhaseTemplate,
  createCheckItem,
  createCollisionReport,
  createExportTask,
  createKeyIssue,
  createProject,
  deleteAttachment,
  deleteChecklistTemplate,
  deleteCollisionReport,
  deleteCheckItem,
  deleteInspectionModule,
  deleteKeyIssue,
  deletePhaseTemplate,
  deleteProjectPhase,
  downloadCollisionReportTemplateExcel,
  exportCollisionReportExcel,
  exportCollisionReportsCsv,
  exportKeyIssuesCsv,
  executeProjectPhysicalDeletion,
  fetchAttachmentDownload,
  fetchAttachmentPreview,
  fetchCheckItem,
  listCheckItems,
  fetchCheckItemAuditLogs,
  fetchExportDownloadLink,
  fetchProjectAuditLogs,
  fetchOwnerCandidates,
  fetchProject,
  fetchProjectDeletionState,
  fetchProjectPhase,
  fetchWorkspaceData,
  fetchKeyIssue,
  fetchCollisionReport,
  listKeyIssues,
  listCollisionReports,
  listAuditLogs,
  importCollisionReportsCsv,
  importKeyIssuesCsv,
  preflightProjectPhysicalDeletion,
  projectDeletionJobFromError,
  seedProjectTemplate,
  updateCollisionReport,
  updateAttachmentMetadata,
  updateCheckItem,
  updateCheckItemOwner,
  updateCheckItemStatus,
  updateChecklistTemplate,
  updateInspectionModule,
  updateKeyIssue,
  updatePhaseTemplate,
  updateProject,
  updateProjectPhase,
  uploadAttachment
} from './services/bsAutoStatusApi';
import type {
  CreateChecklistTemplateInput,
  CreatePhaseTemplateInput,
  ProjectDeletionJob,
  ProjectDeletionState,
  UpdateChecklistTemplateInput,
  UpdatePhaseTemplateInput
} from './services/bsAutoStatusApi';
import { ApiError } from './services/http';
import type {
  AuditLog,
  Attachment,
  ChecklistTemplate,
  ChecklistTemplateItem,
  CheckItem,
  CheckItemOwner,
  CheckItemStatus,
  CollisionReport,
  CollisionReportBlock,
  DashboardSummary,
  ExportTask,
  InspectionModule,
  InspectionModuleInput,
  KeyIssue,
  OwnerCandidate,
  PhaseDefinition,
  PhaseTemplate,
  Project,
  ProjectPhaseProgress,
  ProjectPhase,
  ProjectStatistics,
  ReportDefinition,
  UserProfile,
  WorkspaceData
} from './types';
import { resolvePortalUrl } from './utils/portalUrl';

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
  draft: '草稿',
  open: '打开',
  resolved: '已解决',
  closed: '已关闭',
  containment: '遏制中',
  hold: '搁置',
  returned: '已退回',
  voided: '已作废'
};

const CHECK_ITEM_STATUS_OPTIONS: CheckItemStatus[] = [
  'pending',
  'in_progress',
  'blocked',
  'done',
  'pass',
  'fail',
  'waived',
  'na'
];

const AUDIT_ACTION_LABEL: Record<string, string> = {
  'project.create': '创建项目',
  'project.update': '更新项目',
  'project.delete': '删除项目',
  'project.copy': '复制项目',
  'project.archive': '归档项目',
  'project.seed_template': '按默认模板补齐项目实例',
  'project.seed_check_items': '补齐检查项',
  'project_phase.create': '创建阶段',
  'project_phase.update': '更新阶段',
  'project_phase.delete': '删除阶段',
  'check_item.create': '创建检查项',
  'check_item.update': '更新检查项',
  'check_item.status_change': '状态变更',
  'attachment.upload': '上传附件',
  'attachment.preview': '预览附件',
  'attachment.download': '下载附件',
  'attachment.download_link': '获取附件下载链接',
  'attachment.update_metadata': '更新附件说明',
  'attachment.delete': '删除附件',
  'key_issue.create': '创建重点问题',
  'key_issue.update': '更新重点问题',
  'key_issue.delete': '删除重点问题',
  'key_issue.import_create': '导入新增重点问题',
  'key_issue.import_update': '导入更新重点问题',
  'collision_report.create': '创建一页纸',
  'collision_report.update': '更新一页纸',
  'collision_report.delete': '删除一页纸',
  'collision_report.import_create': '导入新增一页纸',
  'collision_report.import_update': '导入更新一页纸',
  'collision_report.export_excel': '导出一页纸 Excel',
  'collision_report.template_download': '下载一页纸模板',
  'collision_report.submit': '提交一页纸',
  CheckItem: '检查项'
};

const AUDIT_OBJECT_TYPE_LABEL: Record<string, string> = {
  Project: '项目',
  ProjectPhase: '项目阶段',
  CheckItem: '检查项',
  KeyIssue: '重点问题',
  CollisionReport: '碰撞一页纸',
  Attachment: '附件',
  ExportJob: '导出任务',
  CollisionReportApproval: '审批/签核'
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

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value.replace('T', ' ').slice(0, 16);
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatFileSize = (value?: number) => {
  if (!value || value <= 0) return '-';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
};

const PdfAttachmentPreview = lazy(() => import('./components/PdfAttachmentPreview'));

const isImageAttachment = (attachment: Attachment) => attachment.previewKind === 'image';

const canPreviewAttachment = (attachment: Attachment) =>
  attachment.canPreview === true && (attachment.previewKind === 'image' || attachment.previewKind === 'pdf');

const attachmentCaption = (attachment: Attachment) => {
  const metadata = attachment.metadata ?? {};
  return String(metadata.caption ?? metadata.image_caption ?? '').trim();
};

const downloadTextFile = (fileName: string, content: string, type = 'text/csv;charset=utf-8') => {
  const blob = new Blob([content], { type });
  downloadBlobFile(fileName, blob);
};

const downloadBlobFile = (fileName: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Allow the browser to consume the Blob before releasing its URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const safeDownloadFileName = (value: string, fallback: string) => {
  const normalized = (value || fallback)
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  return normalized || fallback;
};

const downloadDataUrlFile = (fileName: string, dataUrl: string) => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
};

const SHEET_IMAGE_PLACEHOLDER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const SHEET_IMAGE_MAX_DIMENSION = 12000;
const SHEET_IMAGE_MAX_PIXELS = 24000000;

const waitForNextPaint = () =>
  new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

const waitForImageReady = async (image: HTMLImageElement) => {
  if (!image.currentSrc && !image.src) return;
  if (!image.complete) {
    await new Promise<void>(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        image.removeEventListener('load', finish);
        image.removeEventListener('error', finish);
        resolve();
      };
      const timeout = window.setTimeout(finish, 2500);
      image.addEventListener('load', finish);
      image.addEventListener('error', finish);
    });
  }
  if (image.complete && image.naturalWidth > 0 && image.decode) {
    await image.decode().catch(() => undefined);
  }
};

const waitForSheetCaptureAssets = async (node: HTMLElement) => {
  await document.fonts?.ready.catch(() => undefined);
  const images = Array.from(node.querySelectorAll('img'));
  await Promise.all(images.map(waitForImageReady));
  await waitForNextPaint();
};

const sheetImagePixelRatio = (width: number, height: number) => {
  const area = Math.max(1, width * height);
  const dimensionLimit = Math.min(SHEET_IMAGE_MAX_DIMENSION / Math.max(width, 1), SHEET_IMAGE_MAX_DIMENSION / Math.max(height, 1));
  const areaLimit = Math.sqrt(SHEET_IMAGE_MAX_PIXELS / area);
  const ratio = Math.min(2, dimensionLimit, areaLimit);
  return Math.max(1, Number.isFinite(ratio) ? ratio : 1);
};

const sheetCaptureSize = (node: HTMLElement) => {
  const rect = node.getBoundingClientRect();
  return {
    width: Math.ceil(Math.max(node.scrollWidth, node.clientWidth, rect.width, 1)),
    height: Math.ceil(Math.max(node.scrollHeight, node.clientHeight, rect.height, 1))
  };
};

const shouldCaptureCollisionSheetNode = (node: HTMLElement) =>
  !(node instanceof HTMLElement && node.closest('.collision-block-toolbar, .collision-block-actions'));

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

function CheckItemStatusControl({
  item,
  canWrite,
  source,
  onUpdateStatus
}: {
  item: CheckItem;
  canWrite: boolean;
  source: string;
  onUpdateStatus: (item: CheckItem, status: CheckItemStatus, source: string) => Promise<void>;
}) {
  const [statusDraft, setStatusDraft] = useState<CheckItemStatus>(item.status as CheckItemStatus);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const hasChanged = statusDraft !== item.status;

  useEffect(() => {
    setStatusDraft(item.status as CheckItemStatus);
    setMessage('');
  }, [item.id, item.status]);

  const handleSave = async () => {
    if (!canWrite || !hasChanged) return;
    setSaving(true);
    setMessage('');
    try {
      await onUpdateStatus(item, statusDraft, source);
      setMessage('已更新');
    } catch (err) {
      setMessage(mutationErrorMessage(err, '状态更新失败'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-w-[220px]">
      <div className="flex items-center gap-2">
        <select
          className="select h-9 min-w-[120px]"
          value={statusDraft}
          disabled={!canWrite || saving}
          onChange={event => setStatusDraft(event.target.value as CheckItemStatus)}
          aria-label={`更新检查项状态 ${item.title}`}
        >
          {CHECK_ITEM_STATUS_OPTIONS.map(status => (
            <option key={status} value={status}>{STATUS_LABEL[status] ?? status}</option>
          ))}
        </select>
        <button
          className="btn btn-primary btn--sm shrink-0"
          type="button"
          disabled={!canWrite || saving || !hasChanged}
          onClick={() => void handleSave()}
          title={!canWrite ? '当前账号只读，写操作已禁用。' : undefined}
        >
          <Save className="h-4 w-4" />
          {saving ? '更新中' : '更新'}
        </button>
      </div>
      {message ? <div className="mt-1 text-xs text-ink-muted">{message}</div> : null}
    </div>
  );
}

const auditValue = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');

const statusLabelOrDash = (status: string) => (status ? STATUS_LABEL[status] ?? status : '-');

const auditStatusTransition = (log: AuditLog) => {
  const oldStatus = auditValue(log.detail.old_status);
  const newStatus = auditValue(log.detail.new_status);
  if (!oldStatus && !newStatus) return '';
  return `${statusLabelOrDash(oldStatus)} -> ${statusLabelOrDash(newStatus)}`;
};

const auditObjectLabel = (log: AuditLog) => {
  const objectType = AUDIT_OBJECT_TYPE_LABEL[log.objectType] ?? log.objectType;
  return log.objectId ? `${objectType} #${log.objectId}` : objectType || '-';
};

function AuditHistoryPanel({
  logs,
  loading,
  error,
  onRefresh,
  emptyMessage = '当前对象暂无审计记录。',
  title = '审计历史',
  description = '按后端审计日志倒序展示，操作者来自 IDaaS 请求上下文。',
  showProject = false,
  showObject = false
}: {
  logs: AuditLog[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
  emptyMessage?: string;
  title?: string;
  description?: string;
  showProject?: boolean;
  showObject?: boolean;
}) {
  return (
    <div className="rounded-lg border border-outline bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-ink">{title}</h4>
          <p className="text-xs text-ink-muted">{description}</p>
        </div>
        <button className="btn btn-ghost btn--sm" type="button" onClick={onRefresh} disabled={loading}>
          <RefreshCcw className="h-4 w-4" />
          {loading ? '刷新中' : '刷新'}
        </button>
      </div>
      {error ? <div className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div> : null}
      {!loading && !logs.length && !error ? <div className="mt-3"><EmptyState message={emptyMessage} /></div> : null}
      {logs.length ? (
        <div className="table-shell mt-3">
          <table className="data-table">
            <thead>
              <tr>
                <th>时间</th>
                {showProject ? <th>项目</th> : null}
                {showObject ? <th>对象</th> : null}
                <th>动作</th>
                <th>状态变化</th>
                <th>操作者</th>
                <th>来源</th>
                <th>请求 ID</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
                const transition = auditStatusTransition(log);
                const source = auditValue(log.detail.source);
                const comment = auditValue(log.detail.comment);
                return (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                    {showProject ? <td>{log.projectCode || log.projectId || '-'}</td> : null}
                    {showObject ? <td>{auditObjectLabel(log)}</td> : null}
                    <td>{AUDIT_ACTION_LABEL[log.action] ?? log.action}</td>
                    <td>
                      <div className="font-medium text-ink">{transition || '-'}</div>
                      {comment ? <div className="mt-1 text-xs text-ink-muted">{comment}</div> : null}
                    </td>
                    <td>{log.actorName || log.actorIdaasId || '-'}</td>
                    <td>{source || '-'}</td>
                    <td className="max-w-[180px] truncate" title={log.requestId || undefined}>{log.requestId || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function ObjectAuditHistory({ objectType, objectId, revision }: { objectType: string; objectId?: string | number; revision: number }) {
  const list = usePaginatedList(listAuditLogs, { object_type: objectType, object_id: objectId }, objectId !== undefined);
  useEffect(() => { list.refresh(); }, [revision, list.refresh]);
  return <div className="mt-5 min-w-0">
    <AuditHistoryPanel logs={list.data?.results ?? []} loading={list.loading} error={list.error} onRefresh={list.refresh} emptyMessage={objectId === undefined ? '保存后开始记录审计历史。' : '当前对象暂无审计记录。'} />
    {objectId !== undefined && <Pagination page={list.page} pageSize={list.pageSize} count={list.data?.count ?? 0} loading={list.loading} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />}
  </div>;
}

function UserAvatar({
  name,
  idaasId,
  avatarUrl,
  size = 'sm'
}: {
  name?: string;
  idaasId?: string;
  avatarUrl?: string;
  size?: 'xs' | 'sm';
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const label = (name || idaasId || '').trim();
  const initials = Array.from(label).slice(0, 2).join('').toUpperCase();
  const sizeClass = size === 'xs' ? 'h-5 w-5 text-[10px]' : 'h-7 w-7 text-xs';
  const canShowImage = Boolean(avatarUrl && !imageFailed);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/20 bg-primary/10 font-semibold text-primary ${sizeClass}`}
      aria-hidden="true"
      title={label || undefined}
    >
      {canShowImage ? (
        <img
          src={avatarUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        initials || <UserRound className={size === 'xs' ? 'h-3 w-3' : 'h-4 w-4'} />
      )}
    </span>
  );
}

function CheckItemAttachmentPanel({
  item,
  canWrite,
  onUploadAttachment,
  onDownloadAttachment,
  onDeleteAttachment,
  onUpdateAttachmentCaption,
  compact = false
}: {
  item: CheckItem;
  canWrite: boolean;
  onUploadAttachment: (item: CheckItem, file: File) => Promise<void>;
  onDownloadAttachment: AttachmentDownloadHandler;
  onDeleteAttachment: (attachment: Attachment) => Promise<void>;
  onUpdateAttachmentCaption: (attachment: Attachment, caption: string) => Promise<void>;
  compact?: boolean;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setSelectedFile(null);
    setUploadOpen(false);
    setMessage('');
  }, [item.id]);

  const handleUpload = async () => {
    if (!canWrite) {
      setMessage('当前账号没有附件上传权限。');
      return;
    }
    if (!selectedFile) {
      setMessage('请先选择附件。');
      return;
    }
    setUploading(true);
    setMessage('');
    try {
      await onUploadAttachment(item, selectedFile);
      setSelectedFile(null);
      setMessage('附件已上传。');
    } catch (err) {
      setMessage(mutationErrorMessage(err, '附件上传失败。'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={`rounded-lg border border-outline bg-surface ${compact ? 'p-2' : 'p-3'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-ink">附件</h4>
          {!compact ? (
            <p className="text-xs text-ink-muted">附件归档到当前检查项，上传和下载由后端 OiS3 接口控制。</p>
          ) : null}
        </div>
        {compact ? (
          <button
            className="btn btn-ghost btn--sm"
            type="button"
            disabled={!canWrite}
            onClick={() => setUploadOpen(current => !current)}
            aria-expanded={uploadOpen}
          >
            <Paperclip className="h-4 w-4" />
            上传
          </button>
        ) : (
          <Paperclip className="h-4 w-4 text-ink-muted" />
        )}
      </div>
      {!compact || uploadOpen ? (
        <div className="mt-3 grid gap-2">
          <label>
            <span className="field-label">选择附件</span>
            <input
              className="input"
              type="file"
              disabled={!canWrite || uploading}
              onChange={event => setSelectedFile(event.target.files?.[0] ?? null)}
              aria-label={`为检查项 ${item.title} 选择附件`}
            />
          </label>
          <button
            className="btn btn-primary btn--sm w-fit"
            type="button"
            disabled={!canWrite || uploading || !selectedFile}
            onClick={() => void handleUpload()}
          >
            <Paperclip className="h-4 w-4" />
            {uploading ? '上传中' : '上传附件'}
          </button>
        </div>
      ) : null}
      {message ? <div className="mt-2 text-xs text-ink-muted">{message}</div> : null}
      <div className={compact ? 'mt-2' : 'mt-4'}>
        <AttachmentList
          attachments={item.attachments}
          canDownload={canWrite}
          canDelete={canWrite}
          canEditCaption={canWrite}
          onDownloadAttachment={onDownloadAttachment}
          onDeleteAttachment={onDeleteAttachment}
          onUpdateAttachmentCaption={onUpdateAttachmentCaption}
          emptyMessage="当前检查项暂无附件。"
        />
      </div>
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

type OwnerEditorChange = {
  owners: CheckItemOwner[];
  ownerName: string;
  ownerIdaasId?: string;
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

const ownerKeyOf = (owner: CheckItemOwner) =>
  normalizeText(owner.idaasId);

const normalizeOwners = (owners: CheckItemOwner[]) => {
  const seen = new Set<string>();
  return owners
    .map((owner, index) => {
      const metadataAvatarUrl =
        typeof owner.metadata?.avatar_url === 'string'
          ? owner.metadata.avatar_url
          : undefined;
      return {
        ...owner,
        displayName: (owner.displayName || owner.idaasId || '').trim(),
        idaasId: owner.idaasId?.trim() || undefined,
        manualName: undefined,
        manual_name: undefined,
        role: owner.role?.trim() || undefined,
        avatarUrl: owner.avatarUrl || metadataAvatarUrl,
        sortOrder: index,
        sort_order: index
      };
    })
    .filter(owner => owner.idaasId)
    .filter(owner => {
      const key = ownerKeyOf(owner);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const ownersOfItem = (item: CheckItem) =>
  normalizeOwners(
    item.owners?.length
      ? item.owners
      : item.ownerIdaasId && item.ownerName && item.ownerName !== '未设置'
        ? [{ displayName: item.ownerName, idaasId: item.ownerIdaasId }]
        : []
  );

const ownersOfModule = (module: InspectionModule) =>
  normalizeOwners(
    module.owners?.length
      ? module.owners
      : module.ownerIdaasId && module.ownerName
        ? [{ displayName: module.ownerName, idaasId: module.ownerIdaasId, email: module.ownerEmail }]
        : []
  );

const phaseDefinitionsOf = (template: PhaseTemplate) =>
  [...(template.phaseDefinitions ?? [])].sort((left, right) =>
    (left.sortOrder ?? 0) - (right.sortOrder ?? 0) || left.key.localeCompare(right.key)
  );

const checklistItemsOf = (template: ChecklistTemplate) =>
  [...(template.itemTemplates ?? [])].sort((left, right) =>
    (left.sortOrder ?? 0) - (right.sortOrder ?? 0) || left.title.localeCompare(right.title)
  );

const checklistTemplateItemCount = (templates: ChecklistTemplate[]) =>
  templates.reduce((total, template) => total + checklistItemsOf(template).length, 0);

const emptyChecklistTemplateItem = (sortOrder: number): ChecklistTemplateItem => ({
  title: '',
  description: '',
  sortOrder,
  plannedStart: null,
  plannedEnd: null,
  dueDate: null,
  priority: '',
  isActive: true,
  metadata: {}
});

const normalizeTemplateItemsForDraft = (items: ChecklistTemplateItem[]) =>
  items.map((item, index) => ({
    ...item,
    title: item.title ?? '',
    description: item.description ?? '',
    sortOrder: item.sortOrder ?? (index + 1) * 10,
    priority: item.priority ?? '',
    isActive: item.isActive !== false,
    metadata: item.metadata ?? {}
  }));

type PhaseTemplateDraft = {
  code: string;
  name: string;
  version: string;
  description: string;
  isActive: boolean;
  phaseDefinitions: PhaseDefinition[];
  metadata: Record<string, unknown>;
};

type ChecklistTemplateDraft = {
  code: string;
  name: string;
  moduleId: string;
  phaseTemplateId: string;
  phaseKey: string;
  version: string;
  isActive: boolean;
  itemTemplates: ChecklistTemplateItem[];
  metadata: Record<string, unknown>;
};

type InspectionModuleDraft = {
  code: string;
  name: string;
  description: string;
  sequence: string;
  isActive: boolean;
  owners: CheckItemOwner[];
  metadata: Record<string, unknown>;
};

type TemplateCellTarget = {
  module: InspectionModule;
  phase: PhaseDefinition;
};

const emptyPhaseDefinition = (sortOrder: number): PhaseDefinition => ({
  key: '',
  name: '',
  description: '',
  sortOrder,
  plannedStart: null,
  plannedEnd: null,
  durationDays: null,
  metadata: {}
});

const normalizePhaseDefinitionsForDraft = (definitions: PhaseDefinition[]) =>
  definitions.map((definition, index) => ({
    ...definition,
    key: definition.key ?? '',
    name: definition.name ?? '',
    description: definition.description ?? '',
    sortOrder: definition.sortOrder ?? (index + 1) * 10,
    plannedStart: definition.plannedStart ?? null,
    plannedEnd: definition.plannedEnd ?? null,
    durationDays: definition.durationDays ?? null,
    metadata: definition.metadata ?? {}
  }));

const phaseTemplateDraftFrom = (template: PhaseTemplate): PhaseTemplateDraft => {
  const definitions = phaseDefinitionsOf(template);
  return {
    code: template.code,
    name: template.name,
    version: String(template.version ?? 1),
    description: template.description ?? '',
    isActive: template.isActive !== false,
    phaseDefinitions: normalizePhaseDefinitionsForDraft(
      definitions.length ? definitions : [emptyPhaseDefinition(10)]
    ),
    metadata: template.metadata ?? {}
  };
};

const emptyPhaseTemplateDraft = (existingCodes: string[] = []): PhaseTemplateDraft => ({
  code: makeUniqueTemplateCode(`bs-auto-status-template-${formatLocalDate(new Date())}`, existingCodes),
  name: '',
  version: '1',
  description: '',
  isActive: false,
  phaseDefinitions: [emptyPhaseDefinition(10)],
  metadata: {}
});

const checklistTemplateDraftFrom = (template: ChecklistTemplate): ChecklistTemplateDraft => ({
  code: template.code,
  name: template.name || template.title,
  moduleId: idOf(template.moduleId),
  phaseTemplateId: idOf(template.phaseTemplateId),
  phaseKey: template.phaseKey ?? '',
  version: String(template.version ?? 1),
  isActive: template.isActive !== false,
  itemTemplates: normalizeTemplateItemsForDraft(checklistItemsOf(template)),
  metadata: template.metadata ?? {}
});

const inspectionModuleDraftFrom = (module: InspectionModule): InspectionModuleDraft => ({
  code: module.code,
  name: module.name,
  description: module.description ?? '',
  sequence: String(module.sequence ?? 0),
  isActive: module.isActive !== false,
  owners: ownersOfModule(module),
  metadata: module.metadata ?? {}
});

const emptyInspectionModuleDraft = (
  existingCodes: string[] = [],
  nextSequence = 10
): InspectionModuleDraft => ({
  code: makeUniqueTemplateCode(`inspection-module-${formatLocalDate(new Date())}`, existingCodes),
  name: '',
  description: '',
  sequence: String(nextSequence),
  isActive: true,
  owners: [],
  metadata: {}
});

const makeChecklistTemplateDraft = (
  phaseTemplate: PhaseTemplate,
  module: InspectionModule,
  phase: PhaseDefinition,
  existingCodes: string[]
): ChecklistTemplateDraft => ({
  code: makeUniqueTemplateCode(
    `${phaseTemplate.code}-${module.code || module.id}-${phase.key || phase.name}`,
    existingCodes
  ),
  name: `${module.name || module.code} · ${phase.name || phase.key}`,
  moduleId: idOf(module.id),
  phaseTemplateId: idOf(phaseTemplate.id),
  phaseKey: phase.key,
  version: '1',
  isActive: true,
  itemTemplates: [emptyChecklistTemplateItem(10)],
  metadata: {}
});

const toPositiveInteger = (value: string, fallback = 1) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const makeUniqueTemplateCode = (base: string, existingCodes: string[], maxLength = 64) => {
  const existing = new Set(existingCodes.map(code => normalizeText(code)));
  const normalized = (base || 'template')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength) || 'template';
  if (!existing.has(normalizeText(normalized))) return normalized;
  for (let index = 2; index < 1000; index += 1) {
    const suffix = `-${index}`;
    const candidate = `${normalized.slice(0, Math.max(1, maxLength - suffix.length))}${suffix}`;
    if (!existing.has(normalizeText(candidate))) return candidate;
  }
  return `${normalized.slice(0, Math.max(1, maxLength - 14))}-${Date.now()}`;
};

const checklistTemplatesForCell = (
  templates: ChecklistTemplate[],
  phaseTemplateId: string,
  module: InspectionModule,
  phase: PhaseDefinition
) =>
  templates
    .filter(template =>
      idOf(template.phaseTemplateId) === phaseTemplateId &&
      idOf(template.moduleId) === idOf(module.id) &&
      (template.phaseKey || '') === phase.key
    )
    .sort((left, right) =>
      Number(right.isActive !== false) - Number(left.isActive !== false) ||
      (right.version ?? 0) - (left.version ?? 0) ||
      left.code.localeCompare(right.code)
    );

const ownersForSearch = (owners?: CheckItemOwner[]) =>
  (owners ?? []).flatMap(owner => [
    owner.displayName,
    owner.idaasId,
    owner.email,
    owner.department
  ]);

const ownerDisplayName = (owner: CheckItemOwner) =>
  owner.displayName || owner.idaasId || '';

const candidateKeyOf = (candidate: OwnerCandidate) => normalizeText(candidate.idaasId);

const normalizeOwnerCandidates = (candidates: OwnerCandidate[]) => {
  const seen = new Set<string>();
  return candidates
    .map(candidate => ({
      ...candidate,
      idaasId: candidate.idaasId?.trim() ?? '',
      displayName: (candidate.displayName || candidate.idaasId || '').trim(),
      avatarUrl: candidate.avatarUrl?.trim() || undefined
    }))
    .filter(candidate => candidate.idaasId)
    .filter(candidate => {
      const key = candidateKeyOf(candidate);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const candidateMatches = (candidate: OwnerCandidate, keyword: string) =>
  textMatches(keyword, [candidate.displayName, candidate.idaasId, candidate.email, candidate.department]);

const ownerCandidateToOwner = (candidate: OwnerCandidate): CheckItemOwner => ({
  displayName: candidate.displayName || candidate.idaasId,
  idaasId: candidate.idaasId,
  email: candidate.email,
  department: candidate.department,
  avatarUrl: candidate.avatarUrl,
  role: 'owner'
});

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
  onChange
}: {
  hierarchy: WorkspaceData['hierarchy'];
  scope: ScopeState;
  onChange: (scope: ScopeState) => void;
}) {
  const workshops = hierarchy.workshops.filter(
    workshop => !scope.factoryId || idOf(workshop.factoryId) === scope.factoryId
  );
  const productionLines = hierarchy.productionLines.filter(
    line => !scope.workshopId || idOf(line.workshopId) === scope.workshopId
  );

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="kicker">Project Instances</p>
          <h2 className="text-xl font-semibold">项目实例筛选</h2>
          <p className="text-sm text-ink-muted">筛选只作用于项目实例列表，不维护项目模板源数据。</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
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
      </div>
    </section>
  );
}

function CreateProjectInstancePanel({
  hierarchy,
  phaseTemplates,
  scope,
  selectedPhaseTemplateId,
  canWrite,
  open,
  onOpenChange,
  onChange,
  onTemplateChange,
  onCreateProject
}: {
  hierarchy: WorkspaceData['hierarchy'];
  phaseTemplates: PhaseTemplate[];
  scope: ScopeState;
  selectedPhaseTemplateId: string;
  canWrite: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (scope: ScopeState) => void;
  onTemplateChange: (templateId: string) => void;
  onCreateProject: (phaseTemplateId: string) => void;
}) {
  const workshops = hierarchy.workshops.filter(
    workshop => !scope.factoryId || idOf(workshop.factoryId) === scope.factoryId
  );
  const productionLines = hierarchy.productionLines.filter(
    line => !scope.workshopId || idOf(line.workshopId) === scope.workshopId
  );
  const sortedPhaseTemplates = bySequence(phaseTemplates).filter(template => template.isActive !== false);
  const selectedPhaseTemplate = sortedPhaseTemplates.find(
    template => idOf(template.id) === selectedPhaseTemplateId && template.isActive !== false
  );

  return (
    <details className="panel" open={open} onToggle={event => onOpenChange(event.currentTarget.open)}>
      <summary className="cursor-pointer list-none">
        <div className="panel-header">
          <div>
            <p className="kicker">Create Project Instance</p>
            <h2 className="text-xl font-semibold">创建项目实例</h2>
            <p className="text-sm text-ink-muted">初始化模板仅用于新项目初始化，不会修改已有项目。</p>
          </div>
          <span className="chip">{open ? '收起' : '展开'}</span>
        </div>
      </summary>
      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]">
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
        <label>
          <span className="field-label">初始化模板</span>
          <select
            className="select"
            value={selectedPhaseTemplateId}
            onChange={event => onTemplateChange(event.target.value)}
            disabled={!sortedPhaseTemplates.length}
          >
            <option value="">{sortedPhaseTemplates.length ? '选择初始化模板' : '暂无启用初始化模板'}</option>
            {sortedPhaseTemplates.map(template => (
              <option key={template.id} value={idOf(template.id)}>
                {template.name} · v{template.version ?? 1}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            className="btn btn-primary w-full lg:w-auto"
            type="button"
            disabled={!canWrite || !scope.factoryId || !scope.workshopId || !selectedPhaseTemplate}
            onClick={() => onCreateProject(selectedPhaseTemplateId)}
          >
            <Plus className="h-4 w-4" />
            创建项目实例
          </button>
        </div>
      </div>
    </details>
  );
}

type AttachmentThumbnailState = {
  url?: string;
  loading?: boolean;
  error?: string;
};

type SheetImagePreviewState = {
  url?: string;
  fileName: string;
  loading: boolean;
  error?: string;
};

function AttachmentPreviewModal({
  state,
  canDownload,
  canDelete,
  downloading,
  deleting,
  downloadError,
  onCancelDownload,
  onClose,
  onDownload,
  onDelete
}: {
  state: AttachmentPreviewState | null;
  canDownload: boolean;
  canDelete: boolean;
  downloading: boolean;
  deleting: boolean;
  downloadError: string;
  onCancelDownload: () => void;
  onClose: () => void;
  onDownload: (attachment: Attachment) => void;
  onDelete: (attachment: Attachment) => void;
}) {
  if (!state) return null;

  return (
    <SideDrawer open title={`预览附件 ${state.attachment.fileName}`} size="wide" saving={deleting} onClose={onClose} overlayClassName="!m-0" bodyClassName="flex flex-col">
      <div className="flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden rounded-lg border border-outline bg-surface shadow-card">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-outline px-4 py-3">
          <div className="min-w-0 max-w-full">
            <div className="truncate text-sm font-semibold text-ink" title={state.attachment.fileName}>
              {state.attachment.fileName}
            </div>
            <div className="mt-1 text-xs text-ink-muted">
              {formatFileSize(state.attachment.fileSize)} · {formatDateTime(state.attachment.createdAt)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn btn-ghost btn--sm"
              type="button"
              disabled={!canDownload && !downloading}
              onClick={() => downloading ? onCancelDownload() : onDownload(state.attachment)}
              title={!canDownload ? '当前账号没有附件下载权限。' : undefined}
            >
              <Download className="h-4 w-4" />
              {downloading ? '取消下载' : '下载'}
            </button>
            <button
              className="btn btn-ghost btn--sm text-danger"
              type="button"
              disabled={!canDelete || deleting}
              onClick={() => onDelete(state.attachment)}
              title={!canDelete ? '当前账号没有附件删除权限。' : undefined}
            >
              <Trash2 className="h-4 w-4" />
              {deleting ? '删除中' : '删除'}
            </button>
            <button className="btn btn-ghost btn--sm" type="button" disabled={deleting} onClick={onClose} aria-label="关闭附件预览">
              <X className="h-4 w-4" />
              关闭
            </button>
          </div>
        </div>
        {downloadError ? <p className="shrink-0 px-4 py-2 text-sm text-danger" role="alert">{downloadError}</p> : null}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden bg-surface-soft p-3 sm:p-5">
          {state.loading ? <div className="text-sm text-ink-muted">附件加载中...</div> : null}
          {state.error ? <div className="max-w-md text-center text-sm text-danger" role="alert">{state.error}</div> : null}
          {state.blob && state.attachment.previewKind === 'pdf' && !state.loading && !state.error ? (
            <Suspense fallback={<p role="status">正在加载 PDF 预览器…</p>}>
              <PdfAttachmentPreview blob={state.blob} fileName={state.attachment.fileName} />
            </Suspense>
          ) : null}
          {state.url && !state.loading && !state.error ? (
            <img
              className="min-h-0 max-h-full max-w-full rounded-lg object-contain"
              src={state.url}
              alt={state.attachment.fileName}
            />
          ) : null}
        </div>
      </div>
    </SideDrawer>
  );
}

function SheetImagePreviewModal({
  state,
  onClose,
  onDownload
}: {
  state: SheetImagePreviewState | null;
  onClose: () => void;
  onDownload: () => void;
}) {
  if (!state) return null;

  return (
    <SideDrawer open title="一页纸图片预览" size="wide" onClose={onClose}>
      <div className="flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-outline bg-surface shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-ink" title={state.fileName}>
              {state.fileName}
            </div>
            <div className="mt-1 text-xs text-ink-muted">碰撞一页纸 PNG 预览</div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn btn-ghost btn--sm" type="button" disabled={!state.url || state.loading} onClick={onDownload}>
              <Download className="h-4 w-4" />
              下载图片
            </button>
            <button className="btn btn-ghost btn--sm" type="button" onClick={onClose} aria-label="关闭一页纸图片预览">
              <X className="h-4 w-4" />
              关闭
            </button>
          </div>
        </div>
        <div className="flex min-h-[320px] flex-1 items-center justify-center bg-surface-soft p-3 sm:p-5">
          {state.loading ? <div className="text-sm text-ink-muted">图片生成中...</div> : null}
          {state.error ? <div className="max-w-md text-center text-sm text-danger">{state.error}</div> : null}
          {state.url && !state.loading && !state.error ? (
            <img
              className="max-h-[76dvh] max-w-full rounded-lg bg-white object-contain"
              src={state.url}
              alt="碰撞一页纸图片预览"
            />
          ) : null}
        </div>
      </div>
    </SideDrawer>
  );
}

function AttachmentList({
  attachments,
  loadThumbnails = true,
  canDownload = false,
  canDelete = false,
  canEditCaption = false,
  onDownloadAttachment,
  onDeleteAttachment,
  onUpdateAttachmentCaption,
  emptyMessage = '无附件'
}: {
  attachments: Attachment[];
  loadThumbnails?: boolean;
  canDownload?: boolean;
  canDelete?: boolean;
  canEditCaption?: boolean;
  onDownloadAttachment?: AttachmentDownloadHandler;
  onDeleteAttachment?: (attachment: Attachment) => Promise<void>;
  onUpdateAttachmentCaption?: (attachment: Attachment, caption: string) => Promise<void>;
  emptyMessage?: string;
}) {
  const [thumbnails, setThumbnails] = useState<Record<string, AttachmentThumbnailState>>({});
  const [savingCaptionId, setSavingCaptionId] = useState<string | number | null>(null);
  const [deletingId, setDeletingId] = useState<string | number | null>(null);
  const [message, setMessage] = useState('');
  const thumbnailUrlsRef = useRef<string[]>([]);
  const imageAttachments = attachments.filter(attachment => canPreviewAttachment(attachment) && isImageAttachment(attachment));
  const fileAttachments = attachments.filter(attachment => !canPreviewAttachment(attachment) || !isImageAttachment(attachment));
  const attachmentKey = attachments.map(attachment => `${attachment.id}:${attachment.previewKind}:${attachment.canPreview}`).join('|');
  const { preview, openPreview, closePreview } = useAttachmentPreview(attachmentKey);
  const { downloadingId, downloadError, download: handleDownload, cancelDownload } = useAttachmentDownload(
    `${attachmentKey}:${preview?.attachment.id ?? 'list'}`, canDownload, onDownloadAttachment
  );
  const imageAttachmentKey = imageAttachments
    .map(attachment => `${attachment.id}:${attachment.fileName}:${attachment.createdAt ?? ''}:${attachment.fileSize ?? ''}`)
    .join('|');
  const { captionDrafts, setCaption, acceptCaption } = useCaptionDrafts(
    attachments.map(attachment => [idOf(attachment.id), attachmentCaption(attachment)])
  );

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    thumbnailUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    thumbnailUrlsRef.current = [];
    setThumbnails({});
    if (!loadThumbnails) return;

    imageAttachments.forEach(attachment => {
      const key = idOf(attachment.id);
      setThumbnails(current => ({ ...current, [key]: { loading: true } }));
      void fetchAttachmentPreview(attachment.id, controller.signal)
        .then(result => {
          const url = URL.createObjectURL(result.blob);
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          thumbnailUrlsRef.current.push(url);
          setThumbnails(current => ({ ...current, [key]: { url, loading: false } }));
        })
        .catch(err => {
          if (cancelled) return;
          setThumbnails(current => ({
            ...current,
            [key]: {
              loading: false,
              error: mutationErrorMessage(err, '缩略图加载失败。')
            }
          }));
        });
    });

    return () => {
      controller.abort();
      cancelled = true;
      thumbnailUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      thumbnailUrlsRef.current = [];
    };
  }, [imageAttachmentKey, loadThumbnails]);

  const handleSaveCaption = async (attachment: Attachment) => {
    if (!onUpdateAttachmentCaption || !canEditCaption) {
      setMessage('当前账号没有附件说明维护权限。');
      return;
    }
    const caption = captionDrafts[idOf(attachment.id)] ?? '';
    setSavingCaptionId(attachment.id);
    setMessage('');
    try {
      await onUpdateAttachmentCaption(attachment, caption);
      acceptCaption(idOf(attachment.id), caption);
      setMessage('附件说明已保存。');
    } catch (err) {
      setMessage(mutationErrorMessage(err, '附件说明保存失败。'));
    } finally {
      setSavingCaptionId(null);
    }
  };

  const handleDelete = async (attachment: Attachment) => {
    if (!onDeleteAttachment || !canDelete) {
      setMessage('当前账号没有附件删除权限。');
      return;
    }
    if (!window.confirm(`确认删除附件「${attachment.fileName}」？`)) return;
    setDeletingId(attachment.id);
    setMessage('');
    try {
      await onDeleteAttachment(attachment);
      if (preview?.attachment.id === attachment.id) {
        closePreview();
      }
      setMessage('附件已删除。');
    } catch (err) {
      setMessage(mutationErrorMessage(err, '附件删除失败。'));
    } finally {
      setDeletingId(null);
    }
  };

  const renderCaptionEditor = (attachment: Attachment) => {
    if (!canEditCaption && !attachmentCaption(attachment)) return null;
    const key = idOf(attachment.id);
    const draft = captionDrafts[key] ?? '';
    const saved = attachmentCaption(attachment);
    const changed = draft !== saved;
    return (
      <label className="mt-2 block px-2 pb-2">
        <span className="field-label">{isImageAttachment(attachment) ? '图片说明' : '附件说明'}</span>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input min-w-0 flex-1"
            value={draft}
            disabled={!canEditCaption || savingCaptionId === attachment.id}
            onChange={event => setCaption(key, event.target.value)}
            placeholder={isImageAttachment(attachment) ? '为这张图片填写说明' : '为附件填写说明'}
          />
          {onUpdateAttachmentCaption ? (
            <button
              className="btn btn-ghost btn--sm"
              type="button"
              disabled={!canEditCaption || !changed || savingCaptionId === attachment.id}
              onClick={() => void handleSaveCaption(attachment)}
            >
              <Save className="h-4 w-4" />
              {savingCaptionId === attachment.id ? '保存中' : '保存'}
            </button>
          ) : null}
        </div>
      </label>
    );
  };

  if (!attachments.length) {
    return (
      <div className="rounded-lg border border-dashed border-outline bg-surface-soft px-3 py-4 text-center text-xs text-ink-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {downloadingId !== null ? <button className="btn btn-ghost btn--sm" type="button" onClick={cancelDownload}>取消下载</button> : null}
      {downloadError && !preview ? <p className="text-sm text-danger" role="alert">{downloadError}</p> : null}
      {imageAttachments.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {imageAttachments.map(attachment => {
            const thumbnail = thumbnails[idOf(attachment.id)];
            return (
              <div key={attachment.id} className="overflow-hidden rounded-lg border border-outline bg-surface">
                <button
                  className="group block w-full text-left"
                  type="button"
                  onClick={() => void openPreview(attachment)}
                  aria-label={`放大预览 ${attachment.fileName}`}
                >
                  <div className="aspect-[4/3] w-full bg-surface-soft">
                    {thumbnail?.url ? (
                      <img
                        className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                        src={thumbnail.url}
                        alt={attachment.fileName}
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-ink-muted">
                        {thumbnail?.error ? '缩略图加载失败' : '图片加载中...'}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 px-2 py-2">
                    <div className="truncate text-xs font-semibold text-ink" title={attachment.fileName}>
                      {attachment.fileName}
                    </div>
                    <div className="mt-1 text-[11px] text-ink-muted">
                      {formatFileSize(attachment.fileSize)} · {formatDateTime(attachment.createdAt)}
                    </div>
                  </div>
                </button>
                {renderCaptionEditor(attachment)}
                {onDownloadAttachment ? (
                  <div className="flex flex-wrap gap-2 border-t border-outline px-2 py-2">
                    <button
                      className="btn btn-ghost btn--sm flex-1"
                      type="button"
                      disabled={!canDownload || attachment.canDownload === false || downloadingId === attachment.id}
                      onClick={() => void handleDownload(attachment)}
                      title={!canDownload || attachment.canDownload === false ? '当前账号没有附件下载权限。' : undefined}
                    >
                      <Download className="h-4 w-4" />
                      {downloadingId === attachment.id ? '获取中' : '下载'}
                    </button>
                    {onDeleteAttachment ? (
                      <button
                        className="btn btn-ghost btn--sm flex-1 text-danger"
                        type="button"
                        disabled={!canDelete || deletingId === attachment.id}
                        onClick={() => void handleDelete(attachment)}
                        title={!canDelete ? '当前账号没有附件删除权限。' : undefined}
                      >
                        <Trash2 className="h-4 w-4" />
                        {deletingId === attachment.id ? '删除中' : '删除'}
                      </button>
                    ) : null}
                  </div>
                ) : onDeleteAttachment ? (
                  <div className="border-t border-outline px-2 py-2">
                    <button
                      className="btn btn-ghost btn--sm w-full text-danger"
                      type="button"
                      disabled={!canDelete || deletingId === attachment.id}
                      onClick={() => void handleDelete(attachment)}
                      title={!canDelete ? '当前账号没有附件删除权限。' : undefined}
                    >
                      <Trash2 className="h-4 w-4" />
                      {deletingId === attachment.id ? '删除中' : '删除'}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
      {fileAttachments.map(attachment => (
        <div key={attachment.id} className="rounded-lg border border-outline bg-surface-soft p-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-ink-muted" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink" title={attachment.fileName}>{attachment.fileName}</div>
                <div className="mt-1 text-xs text-ink-muted">{formatFileSize(attachment.fileSize)} · {formatDateTime(attachment.createdAt)}</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canPreviewAttachment(attachment) ? (
                <button className="btn btn-ghost btn--sm" type="button" onClick={() => void openPreview(attachment)} aria-label={`预览 ${attachment.fileName}`}>
                  <FileText className="h-4 w-4" />预览 PDF
                </button>
              ) : <span className="text-xs text-ink-muted">此格式仅支持下载</span>}
              {onDownloadAttachment ? (
                <button
                  className="btn btn-ghost btn--sm"
                  type="button"
                  disabled={!canDownload || attachment.canDownload === false || downloadingId === attachment.id}
                  onClick={() => void handleDownload(attachment)}
                  title={!canDownload || attachment.canDownload === false ? '当前账号没有附件下载权限。' : undefined}
                >
                  <Download className="h-4 w-4" />
                  {downloadingId === attachment.id ? '获取中' : '下载'}
                </button>
              ) : null}
              {onDeleteAttachment ? (
                <button
                  className="btn btn-ghost btn--sm text-danger"
                  type="button"
                  disabled={!canDelete || deletingId === attachment.id}
                  onClick={() => void handleDelete(attachment)}
                  title={!canDelete ? '当前账号没有附件删除权限。' : undefined}
                >
                  <Trash2 className="h-4 w-4" />
                  {deletingId === attachment.id ? '删除中' : '删除'}
                </button>
              ) : null}
            </div>
          </div>
          {renderCaptionEditor(attachment)}
        </div>
      ))}
      {message ? <div className="text-xs text-ink-muted">{message}</div> : null}
      <AttachmentPreviewModal
        state={preview}
        canDownload={!!onDownloadAttachment && canDownload && preview?.attachment.canDownload !== false}
        canDelete={!!onDeleteAttachment && canDelete}
        downloading={preview ? downloadingId === preview.attachment.id : false}
        deleting={preview ? deletingId === preview.attachment.id : false}
        downloadError={downloadError}
        onCancelDownload={cancelDownload}
        onClose={() => { cancelDownload(); closePreview(); }}
        onDownload={attachment => void handleDownload(attachment)}
        onDelete={attachment => void handleDelete(attachment)}
      />
    </div>
  );
}

type CollisionPendingImage = {
  id: string;
  fileName: string;
  previewUrl: string;
  sortOrder: number;
  error?: string;
};

function CollisionBlockGallery({
  blocks,
  pendingImages = [],
  canWrite,
  canDownload,
  onDownloadAttachment,
  onDeleteAttachment,
  onUpdateAttachmentCaption,
  onUploadFiles,
  onFocus,
  onPaste,
  emptyMessage = '暂无附件'
}: {
  blocks: CollisionReportBlock[];
  pendingImages?: CollisionPendingImage[];
  canWrite: boolean;
  canDownload: boolean;
  onDownloadAttachment?: AttachmentDownloadHandler;
  onDeleteAttachment?: (attachment: Attachment) => Promise<void>;
  onUpdateAttachmentCaption?: (attachment: Attachment, caption: string) => Promise<void>;
  onUploadFiles?: (files: File[]) => void | Promise<void>;
  onFocus?: () => void;
  onPaste?: (event: ClipboardEvent<HTMLDivElement>) => void;
  emptyMessage?: string;
}) {
  const [thumbnails, setThumbnails] = useState<Record<string, AttachmentThumbnailState>>({});
  const [savingCaptionId, setSavingCaptionId] = useState<string | number | null>(null);
  const [deletingId, setDeletingId] = useState<string | number | null>(null);
  const [message, setMessage] = useState('');
  const thumbnailUrlsRef = useRef<string[]>([]);
  const sortedBlocks = [...blocks].sort((left, right) => left.sortOrder - right.sortOrder);
  const blockItems = sortedBlocks.map(block => {
    const attachment = block.attachmentDetail ?? null;
    return {
      block,
      attachment,
      key: idOf(block.id),
      caption: collisionBlockCaption(block, attachment)
    };
  });
  const attachmentKey = blockItems.map(item => `${item.key}:${item.attachment?.id}:${item.attachment?.previewKind}:${item.attachment?.canPreview}`).join('|');
  const { preview, openPreview, closePreview } = useAttachmentPreview(attachmentKey);
  const { downloadingId, downloadError, download: handleDownload, cancelDownload } = useAttachmentDownload(
    `${attachmentKey}:${preview?.attachment.id ?? 'list'}`, canDownload, onDownloadAttachment
  );
  const imageAttachmentKey = blockItems
    .filter(item => item.attachment && canPreviewAttachment(item.attachment) && isImageAttachment(item.attachment))
    .map(item => item.attachment ? `${item.key}:${item.attachment.id}:${item.attachment.fileName}:${item.attachment.createdAt ?? ''}:${item.attachment.fileSize ?? ''}` : item.key)
    .join('|');
  const { captionDrafts, setCaption, acceptCaption } = useCaptionDrafts(
    blockItems.map(item => [item.key, item.caption])
  );
  const isEmpty = !blockItems.length && !pendingImages.length;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    thumbnailUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    thumbnailUrlsRef.current = [];
    setThumbnails({});

    blockItems.forEach(item => {
      if (!item.attachment || !canPreviewAttachment(item.attachment) || !isImageAttachment(item.attachment)) return;
      setThumbnails(current => ({ ...current, [item.key]: { loading: true } }));
      void fetchAttachmentPreview(item.attachment.id, controller.signal)
        .then(result => {
          const url = URL.createObjectURL(result.blob);
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          thumbnailUrlsRef.current.push(url);
          setThumbnails(current => ({ ...current, [item.key]: { url, loading: false } }));
        })
        .catch(err => {
          if (cancelled) return;
          setThumbnails(current => ({
            ...current,
            [item.key]: {
              loading: false,
              error: mutationErrorMessage(err, '缩略图加载失败。')
            }
          }));
        });
    });

    return () => {
      controller.abort();
      cancelled = true;
      thumbnailUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      thumbnailUrlsRef.current = [];
    };
  }, [imageAttachmentKey]);

  const handleDelete = async (attachment: Attachment) => {
    if (!onDeleteAttachment || !canWrite) {
      setMessage('当前账号没有附件删除权限。');
      return;
    }
    if (!window.confirm(`确认删除附件「${attachment.fileName}」？`)) return;
    setDeletingId(attachment.id);
    setMessage('');
    try {
      await onDeleteAttachment(attachment);
      if (preview?.attachment.id === attachment.id) closePreview();
      setMessage('附件已删除。');
    } catch (err) {
      setMessage(mutationErrorMessage(err, '附件删除失败。'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaveCaption = async (blockKey: string, attachment: Attachment) => {
    if (!onUpdateAttachmentCaption || !canWrite) {
      setMessage('当前账号没有附件说明维护权限。');
      return;
    }
    const caption = captionDrafts[blockKey] ?? '';
    setSavingCaptionId(attachment.id);
    setMessage('');
    try {
      await onUpdateAttachmentCaption(attachment, caption);
      acceptCaption(blockKey, caption);
      setMessage('附件说明已保存。');
    } catch (err) {
      setMessage(mutationErrorMessage(err, '附件说明保存失败。'));
    } finally {
      setSavingCaptionId(null);
    }
  };

  if (isEmpty && !canWrite) return null;

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length || !onUploadFiles) return;
    void onUploadFiles(files);
  };

  return (
    <div
      className={`collision-block-gallery ${canWrite ? 'is-editable' : ''}`}
      tabIndex={canWrite ? 0 : -1}
      onFocus={onFocus}
      onPaste={onPaste}
      aria-label={emptyMessage}
    >
      {canWrite && onUploadFiles ? (
        <div className="collision-block-toolbar">
          <label className="btn btn-ghost btn--sm">
            <Paperclip className="h-4 w-4" />
            上传附件
            <input className="hidden" type="file" multiple onChange={handleFileUpload} />
          </label>
        </div>
      ) : null}
      {isEmpty ? (
        <div className="collision-block-empty">
          <Paperclip className="h-4 w-4" />
          <span>{emptyMessage}</span>
        </div>
      ) : (
        <div className="collision-block-grid">
          {[...pendingImages]
            .sort((left, right) => left.sortOrder - right.sortOrder)
            .map(image => (
              <div key={image.id} className={`collision-block-card is-pending ${image.error ? 'is-error' : ''}`}>
                <div className="collision-block-thumb">
                  <img src={image.previewUrl} alt={image.fileName} />
                </div>
                <div className="collision-block-meta">
                  <div className="truncate text-xs font-semibold" title={image.fileName}>{image.fileName}</div>
                  <div className={image.error ? 'text-xs text-danger' : 'text-xs text-ink-muted'}>
                    {image.error || '上传中...'}
                  </div>
                </div>
              </div>
            ))}
          {blockItems.map(item => {
            const thumbnail = thumbnails[item.key];
            const attachment = item.attachment;
            const draft = captionDrafts[item.key] ?? '';
            const changed = draft !== item.caption;
            const previewAttachment = attachment && canPreviewAttachment(attachment) ? attachment : null;
            return (
              <div key={item.key} className="collision-block-card">
                {previewAttachment ? (
                  <button
                    className="collision-block-thumb"
                    type="button"
                    onClick={() => void openPreview(previewAttachment)}
                    aria-label={`放大预览 ${previewAttachment.fileName}`}
                  >
                    {thumbnail?.url ? (
                      <img src={thumbnail.url} alt={previewAttachment.fileName} loading="lazy" />
                    ) : (
                      <span>{previewAttachment.previewKind === 'pdf' ? '预览 PDF' : thumbnail?.error ? '缩略图加载失败' : '图片加载中...'}</span>
                    )}
                  </button>
                ) : (
                  <div className="collision-block-file">
                    <FileText className="h-8 w-8 text-slate-500" />
                    <span>{attachment ? '文件附件' : '缺少附件详情'}</span>
                  </div>
                )}
                <div className="collision-block-meta">
                  <div className="truncate text-xs font-semibold" title={attachment?.fileName ?? item.block.slotLabel}>
                    {attachment?.fileName ?? item.block.slotLabel}
                  </div>
                  {attachment ? (
                    <div className="text-[11px] text-ink-muted">
                      {formatFileSize(attachment.fileSize)} · {formatDateTime(attachment.createdAt)}
                    </div>
                  ) : null}
                  {canWrite && attachment && onUpdateAttachmentCaption ? (
                    <label className="collision-block-caption">
                      <span>{attachment.previewKind === 'image' ? '图片说明' : '附件说明'}</span>
                      <div className="flex gap-2">
                        <input
                          value={draft}
                          disabled={savingCaptionId === attachment.id}
                          onChange={event => setCaption(item.key, event.target.value)}
                          placeholder="填写说明"
                        />
                        <button
                          className="btn btn-ghost btn--sm"
                          type="button"
                          disabled={!changed || savingCaptionId === attachment.id}
                          onClick={() => void handleSaveCaption(item.key, attachment)}
                        >
                          <Save className="h-4 w-4" />
                          {savingCaptionId === attachment.id ? '保存中' : '保存'}
                        </button>
                      </div>
                    </label>
                  ) : item.caption ? (
                    <p className="collision-block-caption-text">{item.caption}</p>
                  ) : null}
                  {attachment && (onDownloadAttachment || onDeleteAttachment) ? (
                    <div className="collision-block-actions">
                      {onDownloadAttachment ? (
                        <button
                          className="btn btn-ghost btn--sm"
                          type="button"
                          disabled={!canDownload || attachment.canDownload === false || downloadingId === attachment.id}
                          onClick={() => void handleDownload(attachment)}
                          title={!canDownload || attachment.canDownload === false ? '当前账号没有附件下载权限。' : undefined}
                        >
                          <Download className="h-4 w-4" />
                          {downloadingId === attachment.id ? '获取中' : '下载'}
                        </button>
                      ) : null}
                      {onDeleteAttachment ? (
                        <button
                          className="btn btn-ghost btn--sm text-danger"
                          type="button"
                          disabled={!canWrite || deletingId === attachment.id}
                          onClick={() => void handleDelete(attachment)}
                          title={!canWrite ? '当前账号没有附件删除权限。' : undefined}
                        >
                          <Trash2 className="h-4 w-4" />
                          {deletingId === attachment.id ? '删除中' : '删除'}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {downloadingId !== null ? <button className="btn btn-ghost btn--sm" type="button" onClick={cancelDownload}>取消下载</button> : null}
      {downloadError && !preview ? <p className="mt-2 text-sm text-danger" role="alert">{downloadError}</p> : null}
      {message ? <div className="mt-2 text-xs text-ink-muted">{message}</div> : null}
      <AttachmentPreviewModal
        state={preview}
        canDownload={!!onDownloadAttachment && canDownload && preview?.attachment.canDownload !== false}
        canDelete={!!onDeleteAttachment && canWrite}
        downloading={preview ? downloadingId === preview.attachment.id : false}
        deleting={preview ? deletingId === preview.attachment.id : false}
        downloadError={downloadError}
        onCancelDownload={cancelDownload}
        onClose={() => { cancelDownload(); closePreview(); }}
        onDownload={attachment => void handleDownload(attachment)}
        onDelete={attachment => void handleDelete(attachment)}
      />
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
  auditSelected,
  onOpenProject,
  onSelectProjectAudit
}: {
  stat: ProjectStatistics;
  project?: Project;
  phases: ProjectPhaseProgress[];
  selected: boolean;
  auditSelected: boolean;
  onOpenProject: (projectId: string | number, view: DashboardJumpTarget) => void;
  onSelectProjectAudit: (projectId: string | number) => void;
}) {
  const scopeText = [project?.plant, project?.workshopName, project?.lineName].filter(Boolean).join(' / ');
  const dateText = `${formatDate(stat.plannedStartDate || project?.plannedStartDate)} 至 ${formatDate(stat.plannedEndDate || project?.plannedEndDate)}`;
  const handleAuditSelect = () => onSelectProjectAudit(stat.projectId);
  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleAuditSelect();
    }
  };

  return (
    <article
      className={`project-summary-card ${selected ? 'is-selected' : ''} ${auditSelected ? 'is-audit-selected' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={auditSelected}
      aria-label={`查看项目 ${stat.projectName || project?.name || '未命名项目'} 审计日志`}
      onClick={handleAuditSelect}
      onKeyDown={handleCardKeyDown}
    >
      <div className="project-card-header">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-ink">{stat.projectName || project?.name || '未命名项目'}</h3>
            {selected ? <span className="chip">当前项目</span> : null}
            {auditSelected ? <span className="chip">审计查看中</span> : null}
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
              onClick={(event) => {
                event.stopPropagation();
                onOpenProject(stat.projectId, action.view);
              }}
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

function ProjectAuditLogPanel({
  stat,
  logs,
  loading,
  error,
  onRefresh
}: {
  stat?: ProjectStatistics;
  logs: AuditLog[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
}) {
  if (!stat) return null;
  const latestLog = logs[0];
  const objectTypeCount = new Set(logs.map(log => log.objectType).filter(Boolean)).size;
  const actorCount = new Set(logs.map(log => log.actorIdaasId || log.actorName).filter(Boolean)).size;

  return (
    <div className="project-audit-shell">
      <div className="panel-header">
        <div>
          <p className="kicker">Project Audit Trail</p>
          <h3 className="text-lg font-semibold">{stat.projectName} 审计日志</h3>
          <p className="text-sm text-ink-muted">
            {stat.projectCode} · 聚合项目、阶段、检查项、重点问题、碰撞一页纸、附件和导出任务的审计记录。
          </p>
        </div>
        <span className="chip"><Clock3 className="h-3.5 w-3.5" />{logs.length} 条</span>
      </div>
      <div className="project-audit-metrics">
        <MetricCard label="审计记录" value={logs.length} detail={loading ? '正在刷新' : '当前返回最近记录'} />
        <MetricCard label="对象类型" value={objectTypeCount} detail="按业务对象聚合" />
        <MetricCard label="操作者" value={actorCount} detail="来自 IDaaS 请求上下文" />
        <MetricCard
          label="最近操作"
          value={latestLog ? formatDateTime(latestLog.createdAt) : '-'}
          detail={latestLog ? (AUDIT_ACTION_LABEL[latestLog.action] ?? latestLog.action) : '暂无记录'}
        />
      </div>
      <AuditHistoryPanel
        logs={logs}
        loading={loading}
        error={error}
        onRefresh={onRefresh}
        title="项目审计明细"
        description="按项目上下文倒序展示，覆盖项目下所有已写入 project 维度的业务审计。"
        emptyMessage="该项目暂无审计记录。"
        showObject
      />
    </div>
  );
}

function ProjectSummaryBoard({
  stats,
  projects,
  selectedProjectId,
  auditProjectId,
  auditLogs,
  auditLoading,
  auditError,
  filters,
  onFiltersChange,
  statusOptions,
  onOpenProject,
  onSelectProjectAudit,
  onRefreshProjectAudit
}: {
  stats: ProjectStatistics[];
  projects: Project[];
  selectedProjectId?: string | number;
  auditProjectId?: string | number;
  auditLogs: AuditLog[];
  auditLoading: boolean;
  auditError: string;
  filters: SearchFilterState;
  onFiltersChange: (filters: SearchFilterState) => void;
  statusOptions: string[];
  onOpenProject: (projectId: string | number, view: DashboardJumpTarget) => void;
  onSelectProjectAudit: (projectId: string | number) => void;
  onRefreshProjectAudit: () => void;
}) {
  const projectById = new Map(projects.map(project => [idOf(project.id), project]));
  const auditProjectStat = stats.find(stat => idOf(stat.projectId) === idOf(auditProjectId));

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
              auditSelected={projectId === idOf(auditProjectId)}
              onOpenProject={onOpenProject}
              onSelectProjectAudit={onSelectProjectAudit}
            />
          );
        })}
      </div>
      <ProjectAuditLogPanel
        stat={auditProjectStat}
        logs={auditLogs}
        loading={auditLoading}
        error={auditError}
        onRefresh={onRefreshProjectAudit}
      />
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
          <span>默认 dashboard 已覆盖阶段、模块、重点问题、碰撞一页纸、签核和附件入口。</span>
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
                <span>负责人：{ownersOfItem(item).map(ownerDisplayName).join('、') || '未设置'}</span>
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
                        <span className="chip">
                          <ImageIcon className="h-3.5 w-3.5" />
                          已配置
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
        <DetailField label="问题照片" value={issue.problemPhotoObjectKey || issue.problemPhoto ? '已配置' : '-'} />
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

function CollisionReadonlyCanvas({ report }: { report: CollisionReport }) {
  const renderBlockGallery = (sectionKey: string, slotKey: string, label: string) => (
    <CollisionBlockGallery
      blocks={collisionBlocksForSlot(report, sectionKey, slotKey)}
      canWrite={false}
      canDownload={false}
      emptyMessage={`${label}附件`}
    />
  );
  const renderSummaryCell = (
    sectionKey: string,
    slotKey: string,
    label: string,
    value?: string,
    wide = false,
    showImages = true
  ) => (
    <div className={`${wide ? 'is-wide' : ''} collision-readonly-summary-cell`}>
      <span>{label}</span>
      <p>{value || '-'}</p>
      {showImages ? renderBlockGallery(sectionKey, slotKey, label) : null}
    </div>
  );
  const renderBodyCell = (
    sectionKey: string,
    slotKey: string,
    label: string,
    value?: string,
    large = false
  ) => (
    <div className={`collision-field ${large ? 'is-large' : ''}`}>
      <span>{label}</span>
      <p className="collision-readonly-text">{value || '-'}</p>
      {renderBlockGallery(sectionKey, slotKey, label)}
    </div>
  );

  return (
    <div className="collision-sheet-scroll">
      <div className="collision-sheet collision-sheet-readonly" aria-label="碰撞一页纸预览">
        <div className="collision-title-display">{report.title || '重点问题一页纸'}</div>
        <div className="collision-sheet-head">
          <div className="collision-brand-cell">
            <strong>LI AUTO</strong>
            <span>理想汽车</span>
          </div>
          <div className="collision-report-title">重点问题一页纸</div>
          <div className="collision-meta-table">
            <label><span>编制</span><p>{report.owner || '-'}</p></label>
            <label><span>问题状态</span><p>{STATUS_LABEL[report.status] ?? report.status}</p></label>
            <label><span>提出日期</span><p>{formatDate(report.reportDate)}</p></label>
          </div>
        </div>
        <div className="collision-summary-table">
          {renderSummaryCell('summary', 'problemDefinition', '问题定义', report.problemDefinition, true, false)}
          {renderSummaryCell('summary', 'parts', '涉及零件', report.parts, false, false)}
          {renderSummaryCell('summary', 'vehicleModel', '车型', report.vehicleModel, false, false)}
          {renderSummaryCell('summary', 'failureFrequency', '故障频次', report.failureFrequency, false, false)}
          {renderSummaryCell('summary', 'responsibilityArea', '责任区域', report.responsibilityArea, false, false)}
          {renderSummaryCell('summary', 'owner', '负责人', report.owner, false, false)}
          {renderSummaryCell('summary', 'progress', '问题进展', report.progress, false, false)}
          {renderSummaryCell('summary', 'remark', '备注', report.remark, false, false)}
        </div>
        <div className="collision-sheet-toolbar is-readonly">
          <div><span className="field-label">风险等级</span><p>{STATUS_LABEL[report.riskLevel] ?? report.riskLevel}</p></div>
          <div><span className="field-label">断点计划</span><p>{formatDate(report.dueDate)}</p></div>
          <div><span className="field-label">签核</span><ApprovalStatusList value={report.approvalSignoff} /></div>
        </div>
        <div className="collision-body-grid">
          <section className="collision-section">
            <h4>1. 问题描述</h4>
            {renderBodyCell('section_1', 'problemDescription', '【失效模式&工况】', report.problemDescription)}
            {renderBodyCell('section_1', 'vehicleModel', '【涉及车辆】', report.vehicleModel)}
            {renderBodyCell('section_1', 'source', '【信息来源】', report.source)}
          </section>
          <section className="collision-section">
            <h4>3. 原因分析</h4>
            {renderBodyCell('section_3', 'processAnalysis', '【过程分析】', report.processAnalysis)}
            {renderBodyCell('section_3', 'rootCauseConclusion', '【根本原因】', report.rootCauseConclusion || report.rootCause)}
            {renderBodyCell('section_3', 'summary', '【摘要】', report.summary)}
          </section>
          <section className="collision-section">
            <h4>2. 诊断维修</h4>
            {renderBodyCell('section_2', 'diagnosisRepair', '诊断维修记录', report.diagnosisRepair, true)}
          </section>
          <section className="collision-section">
            <h4>4. 制定措施</h4>
            {renderBodyCell('section_4', 'containment', '【临时/拦截措施】', report.containment)}
            {renderBodyCell('section_4', 'correctiveAction', '【长期措施/追溯】', report.correctiveAction)}
          </section>
          <section className="collision-section">
            <h4>其他补充说明</h4>
            {renderBodyCell('signoff', 'approvalSignoff', '备注 / 签核', report.approvalSignoff)}
          </section>
          <section className="collision-section">
            <h4>5. 所需支持</h4>
            {renderBodyCell('section_5', 'supportNeeded', '支持事项', report.supportNeeded)}
          </section>
        </div>
      </div>
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
      <div className="mt-4">
        <CollisionReadonlyCanvas report={report} />
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
  const [auditProjectId, setAuditProjectId] = useState<string | number | undefined>();
  const [projectAuditLogs, setProjectAuditLogs] = useState<AuditLog[]>([]);
  const [projectAuditLoading, setProjectAuditLoading] = useState(false);
  const [projectAuditError, setProjectAuditError] = useState('');
  const projectStats = buildProjectStatistics(data);
  const filteredProjectStats = projectStats.filter(stat => projectStatMatchesFilters(stat, dashboardFilters));
  const projectStatusOptions = statusOptionValues(projectStats.map(stat => stat.projectStatus));
  const loadProjectAuditLogs = async (projectId: string | number) => {
    setProjectAuditLoading(true);
    setProjectAuditError('');
    try {
      const logs = await fetchProjectAuditLogs(projectId);
      setProjectAuditLogs(logs);
    } catch (err) {
      setProjectAuditLogs([]);
      setProjectAuditError(err instanceof Error ? err.message : '项目审计日志加载失败。');
    } finally {
      setProjectAuditLoading(false);
    }
  };
  const handleSelectProjectAudit = (projectId: string | number) => {
    setAuditProjectId(projectId);
    void loadProjectAuditLogs(projectId);
  };
  const handleRefreshProjectAudit = () => {
    if (!auditProjectId) return;
    void loadProjectAuditLogs(auditProjectId);
  };

  return (
    <div className="grid gap-5">
      <PortfolioOverview summary={data.dashboardSummary} stats={projectStats} />
      <DashboardCharts summary={data.dashboardSummary} stats={projectStats} />
      <ProjectSummaryBoard
        stats={filteredProjectStats}
        projects={data.projects}
        selectedProjectId={data.selectedProject?.id}
        auditProjectId={auditProjectId}
        auditLogs={projectAuditLogs}
        auditLoading={projectAuditLoading}
        auditError={projectAuditError}
        filters={dashboardFilters}
        onFiltersChange={setDashboardFilters}
        statusOptions={projectStatusOptions}
        onOpenProject={onOpenProject}
        onSelectProjectAudit={handleSelectProjectAudit}
        onRefreshProjectAudit={handleRefreshProjectAudit}
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
          <span className="field-label">当前项目</span>
          <select
            className="select"
            aria-label="当前项目"
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
    <div className="grid gap-5">
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
    </div>
  );
}

function TimelineView({
  project,
  phases,
  checkItems,
  modules,
  ownerCandidates,
  canWrite,
  onUpdateStatus,
  onUpdateOwner,
  onUploadAttachment,
  onDownloadAttachment,
  onDeleteAttachment,
  onUpdateAttachmentCaption
}: {
  project: Project | null;
  phases: ProjectPhase[];
  checkItems: CheckItem[];
  modules: InspectionModule[];
  ownerCandidates: OwnerCandidate[];
  canWrite: boolean;
  onUpdateStatus: (item: CheckItem, status: CheckItemStatus, source: string) => Promise<void>;
  onUpdateOwner: (item: CheckItem, owners: CheckItemOwner[]) => Promise<void>;
  onUploadAttachment: (item: CheckItem, file: File) => Promise<void>;
  onDownloadAttachment: AttachmentDownloadHandler;
  onDeleteAttachment: (attachment: Attachment) => Promise<void>;
  onUpdateAttachmentCaption: (attachment: Attachment, caption: string) => Promise<void>;
}) {
  const [filters, setFilters] = useState<SearchFilterState>(EMPTY_FILTERS);
  const [selectedCheckItemId, setSelectedCheckItemId] = useState('');
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [ownerDrafts, setOwnerDrafts] = useState<Record<string, { owners: CheckItemOwner[]; ownerName: string; ownerIdaasId?: string }>>({});
  const [ownerSaving, setOwnerSaving] = useState(false);
  const [ownerMessage, setOwnerMessage] = useState('');
  const sorted = activePhasesOf(phases);
  const today = formatLocalDate(new Date());
  const phaseById = new Map(sorted.map(phase => [idOf(phase.id), phase]));
  const filteredCheckItems = checkItems.filter(item => {
    const phase = phaseById.get(idOf(item.projectPhaseId));
    const itemOwners = ownersOfItem(item);
    if (!phase || item.isActive === false) return false;
    if (filters.phaseId && idOf(item.projectPhaseId) !== filters.phaseId) return false;
    if (filters.moduleId && idOf(item.moduleId) !== filters.moduleId) return false;
    if (filters.status && item.status !== filters.status) return false;
    if (filters.owner && !textMatches(filters.owner, ownersForSearch(itemOwners))) return false;
    if (!textMatches(filters.keyword, [item.title, item.description, item.acceptanceCriteria, phase?.name, ...ownersForSearch(itemOwners)])) return false;
    return dateRangeMatches(item.plannedStartDate, item.plannedEndDate, filters.startDate, filters.endDate);
  });
  const filteredItemPhaseIds = new Set(filteredCheckItems.map(item => idOf(item.projectPhaseId)));
  const visiblePhases = sorted.filter(phase => {
    if (filters.phaseId && idOf(phase.id) !== filters.phaseId) return false;
    if ((filters.moduleId || filters.owner) && !filteredItemPhaseIds.has(idOf(phase.id))) return false;
    if (filters.status && phase.status !== filters.status && !filteredItemPhaseIds.has(idOf(phase.id))) return false;
    if (!textMatches(filters.keyword, [phase.name, phase.code, phase.goal]) && !filteredItemPhaseIds.has(idOf(phase.id))) return false;
    if (!dateRangeMatches(phase.plannedStartDate, phase.plannedEndDate, filters.startDate, filters.endDate) && !filteredItemPhaseIds.has(idOf(phase.id))) return false;
    return true;
  });
  const moduleById = new Map(modules.map(module => [idOf(module.id), module]));
  const itemClass = (item: CheckItem) => {
    if (isComplete(item.status)) return 'bg-success text-white';
    if (isBlocked(item.status) || isOverdue(item.plannedEndDate, item.status, today)) return 'bg-danger text-white';
    if (['in_progress', 'active'].includes(item.status)) return 'bg-primary text-white';
    return 'bg-warning text-surface-inverse';
  };
  const phaseStatusOptions = statusOptionValues(sorted.map(phase => phase.status));
  const checkStatusOptions = statusOptionValues(checkItems.map(item => item.status));
  const timelineStatusOptions = statusOptionValues([...phaseStatusOptions, ...checkStatusOptions]);
  const filteredCheckItemKey = filteredCheckItems.map(item => idOf(item.id)).join('|');
  const selectedCheckItem = filteredCheckItems.find(item => idOf(item.id) === selectedCheckItemId) ?? null;
  const selectedPhase = selectedCheckItem ? phaseById.get(idOf(selectedCheckItem.projectPhaseId)) : null;
  const selectedModule = selectedCheckItem ? moduleById.get(idOf(selectedCheckItem.moduleId)) : null;
  const latestStatusAudit = auditLogs.find(log => log.action === 'check_item.status_change');
  const selectedOwnerDraft = selectedCheckItem
    ? ownerDrafts[idOf(selectedCheckItem.id)] ?? {
        owners: ownersOfItem(selectedCheckItem),
        ownerName: '',
        ownerIdaasId: undefined
      }
    : null;

  const loadAuditLogs = async (checkItemId: string | number) => {
    setAuditLoading(true);
    setAuditError('');
    try {
      const logs = await fetchCheckItemAuditLogs(checkItemId);
      setAuditLogs(logs);
    } catch (err) {
      setAuditLogs([]);
      setAuditError(err instanceof Error ? err.message : '审计历史加载失败');
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    if (!filteredCheckItems.length) {
      setSelectedCheckItemId('');
      return;
    }
    if (!filteredCheckItems.some(item => idOf(item.id) === selectedCheckItemId)) {
      setSelectedCheckItemId(idOf(filteredCheckItems[0].id));
    }
  }, [filteredCheckItemKey, selectedCheckItemId]);

  useEffect(() => {
    if (!selectedCheckItemId) {
      setAuditLogs([]);
      setAuditError('');
      return;
    }
    void loadAuditLogs(selectedCheckItemId);
  }, [selectedCheckItemId]);

  useEffect(() => {
    if (!selectedCheckItem) {
      setOwnerMessage('');
      return;
    }
    setOwnerDrafts(current => ({
      ...current,
      [idOf(selectedCheckItem.id)]: current[idOf(selectedCheckItem.id)] ?? {
        owners: ownersOfItem(selectedCheckItem),
        ownerName: '',
        ownerIdaasId: undefined
      }
    }));
    setOwnerMessage('');
  }, [selectedCheckItemId]);

  const handleUpdateTimelineStatus = async (item: CheckItem, status: CheckItemStatus, source: string) => {
    await onUpdateStatus(item, status, source);
    if (idOf(item.id) === selectedCheckItemId) {
      await loadAuditLogs(item.id);
    }
  };

  const handleUpdateTimelineOwner = async () => {
    if (!selectedCheckItem || !selectedOwnerDraft) return;
    setOwnerSaving(true);
    setOwnerMessage('');
    try {
      await onUpdateOwner(selectedCheckItem, ownersFromDraft(selectedOwnerDraft));
      await loadAuditLogs(selectedCheckItem.id);
      setOwnerMessage('负责人已更新。');
    } catch (err) {
      setOwnerMessage(mutationErrorMessage(err, '负责人更新失败。'));
    } finally {
      setOwnerSaving(false);
    }
  };

  return (
    <section className="panel min-w-0">
      <div className="panel-header">
        <div>
          <p className="kicker">Time Gantt</p>
          <h2 className="text-xl font-semibold">时间甘特</h2>
          <p className="text-sm text-ink-muted">阶段与检查项按真实计划日期定位，名称独立展示；横轴按周缩放、滚动。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="chip"><Clock3 className="h-3.5 w-3.5" />当前日期 {today}</span>
          <span className="chip">{visiblePhases.length} 个阶段 · {filteredCheckItems.length} 个检查项</span>
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
      {visiblePhases.length ? (
        <TimelineGantt
          key={project?.id ?? 'empty'}
          project={project}
          today={today}
          selectedId={selectedCheckItemId}
          onSelect={setSelectedCheckItemId}
          phases={visiblePhases.map(phase => {
            const items = filteredCheckItems.filter(item => idOf(item.projectPhaseId) === idOf(phase.id));
            return {
              ...phase,
              id: idOf(phase.id),
              status: <StatusPill status={phase.status} />,
              completed: items.filter(item => isComplete(item.status)).length,
              items: items.map(item => ({
                ...item,
                id: idOf(item.id),
                moduleName: moduleById.get(idOf(item.moduleId))?.name ?? '未设置模块',
                ownerLabel: ownersOfItem(item).map(owner => owner.displayName || owner.idaasId).filter(Boolean).join('、') || '未设置负责人',
                statusLabel: isOverdue(item.plannedEndDate, item.status, today) ? `逾期 · ${STATUS_LABEL[item.status] ?? item.status}` : STATUS_LABEL[item.status] ?? item.status,
                barClass: itemClass(item)
              }))
            };
          })}
        />
      ) : null}
      {selectedCheckItem ? (
        <div id="timeline-selected-detail" className="mt-5 rounded-lg border border-outline bg-surface-soft p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="kicker">Selected Check Item</p>
              <h3 className="text-base font-semibold text-ink">{selectedCheckItem.title}</h3>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-ink-muted">
                <span>{selectedPhase?.name ?? '未设置阶段'}</span>
                <span>{selectedModule?.name ?? '未设置模块'}</span>
                <span>{formatDate(selectedCheckItem.plannedStartDate)} 至 {formatDate(selectedCheckItem.plannedEndDate)}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill status={selectedCheckItem.status} />
              {latestStatusAudit ? (
                <span className="chip" title={auditStatusTransition(latestStatusAudit) || undefined}>
                  最近更新：{latestStatusAudit.actorName || latestStatusAudit.actorIdaasId || '-'} · {formatDateTime(latestStatusAudit.createdAt)}
                </span>
              ) : (
                <span className="chip">暂无状态审计</span>
              )}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-lg border border-outline bg-surface p-3">
              <div className="mb-3 text-sm font-semibold text-ink">直接更新状态</div>
              <CheckItemStatusControl
                item={selectedCheckItem}
                canWrite={canWrite}
                source="timeline-gantt"
                onUpdateStatus={handleUpdateTimelineStatus}
              />
              <div className="mt-3 text-xs text-ink-muted">
                点击甘特条切换检查项；保存后后端会记录状态审计和 IDaaS 操作者。
              </div>
            </div>
            <div className="rounded-lg border border-outline bg-surface p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-ink">负责人</div>
                  <div className="text-xs text-ink-muted">仅支持从 IDaaS 候选人搜索添加。</div>
                </div>
                <button
                  className="btn btn-primary btn--sm"
                  type="button"
                  disabled={!canWrite || ownerSaving || !selectedOwnerDraft}
                  onClick={() => void handleUpdateTimelineOwner()}
                >
                  <Save className="h-4 w-4" />
                  {ownerSaving ? '保存中' : '保存负责人'}
                </button>
              </div>
              {selectedOwnerDraft ? (
                <OwnerListEditor
                  owners={selectedOwnerDraft.owners}
                  ownerCandidates={ownerCandidates}
                  canWrite={canWrite}
                  candidateLabel={`甘特检查项 ${selectedCheckItem.title} IDaaS 责任人`}
                  onChange={next =>
                    setOwnerDrafts(current => ({
                      ...current,
                      [idOf(selectedCheckItem.id)]: next
                    }))
                  }
                />
              ) : null}
              {ownerMessage ? <div className="mt-2 text-xs text-ink-muted">{ownerMessage}</div> : null}
            </div>
            <CheckItemAttachmentPanel
              item={selectedCheckItem}
              canWrite={canWrite}
              onUploadAttachment={onUploadAttachment}
              onDownloadAttachment={onDownloadAttachment}
              onDeleteAttachment={onDeleteAttachment}
              onUpdateAttachmentCaption={onUpdateAttachmentCaption}
            />
            <AuditHistoryPanel
              logs={auditLogs}
              loading={auditLoading}
              error={auditError}
              onRefresh={() => void loadAuditLogs(selectedCheckItem.id)}
            />
          </div>
        </div>
      ) : null}
      <div className="mt-5 grid grid-cols-1 gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-ink">阶段检查项状态更新</h3>
            <p className="text-xs text-ink-muted">按当前甘特筛选结果分阶段维护，状态变更会写入后端审计日志。</p>
          </div>
          <ReadOnlyNotice canWrite={canWrite} />
        </div>
        {visiblePhases.map(phase => {
          const items = filteredCheckItems.filter(item => idOf(item.projectPhaseId) === idOf(phase.id));
          if (!items.length) return null;
          return (
            <div key={`${phase.id}-status-board`} className="rounded-lg border border-outline bg-surface-soft p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-ink">{phase.name}</div>
                  <div className="text-xs text-ink-muted">
                    {formatWeekRangeText(phase.plannedStartDate, phase.plannedEndDate)} · {items.filter(item => isComplete(item.status)).length}/{items.length} 项完成
                  </div>
                </div>
                <StatusPill status={phase.status} />
              </div>
              <div className="table-shell mt-3">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>检查项</th>
                      <th>模块</th>
                      <th>计划</th>
                      <th>当前状态</th>
                      <th>状态更新</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => (
                      <tr key={item.id}>
                        <td className="max-w-[360px]">
                          <div className="font-semibold">{item.title}</div>
                          <div className="mt-1 text-xs text-ink-muted">{item.acceptanceCriteria || item.description}</div>
                        </td>
                        <td>{moduleById.get(idOf(item.moduleId))?.name ?? '-'}</td>
                        <td>{formatDate(item.plannedStartDate)} 至 {formatDate(item.plannedEndDate)}</td>
                        <td><StatusPill status={item.status} /></td>
                        <td>
                          <CheckItemStatusControl
                            item={item}
                            canWrite={canWrite}
                            source="timeline"
                            onUpdateStatus={handleUpdateTimelineStatus}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function OwnerListEditor({
  owners,
  ownerCandidates,
  canWrite,
  candidateLabel,
  onChange
}: {
  owners: CheckItemOwner[];
  ownerCandidates: OwnerCandidate[];
  canWrite: boolean;
  candidateLabel: string;
  onChange: (next: OwnerEditorChange) => void;
}) {
  const [query, setQuery] = useState('');
  const [remoteCandidates, setRemoteCandidates] = useState<OwnerCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const normalizedOwners = normalizeOwners(owners);
  const selectedKeys = new Set(normalizedOwners.map(ownerKeyOf));
  const normalizedBaseCandidates = normalizeOwnerCandidates(ownerCandidates);
  const localMatches = query.trim()
    ? normalizedBaseCandidates.filter(candidate => candidateMatches(candidate, query))
    : normalizedBaseCandidates;
  const candidatePool = normalizeOwnerCandidates([...localMatches, ...remoteCandidates])
    .filter(candidate => !selectedKeys.has(candidateKeyOf(candidate)));

  useEffect(() => {
    const keyword = query.trim();
    let cancelled = false;
    if (!keyword || !canWrite) {
      setRemoteCandidates([]);
      setSearchError('');
      setSearching(false);
      return () => {
        cancelled = true;
      };
    }

    setSearching(true);
    setSearchError('');
    const timer = window.setTimeout(() => {
      fetchOwnerCandidates(keyword, 30)
        .then(candidates => {
          if (!cancelled) setRemoteCandidates(normalizeOwnerCandidates(candidates));
        })
        .catch(err => {
          if (!cancelled) {
            setRemoteCandidates([]);
            setSearchError(err instanceof Error ? err.message : 'IDaaS 候选人搜索失败');
          }
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, canWrite]);

  const addOwner = (owner: CheckItemOwner) => {
    onChange({
      owners: normalizeOwners([...owners, owner]),
      ownerName: '',
      ownerIdaasId: undefined
    });
  };
  const removeOwner = (owner: CheckItemOwner) => {
    onChange({
      owners: normalizeOwners(owners.filter(current => ownerKeyOf(current) !== ownerKeyOf(owner))),
      ownerName: '',
      ownerIdaasId: undefined
    });
  };
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-1.5">
        {normalizedOwners.length ? normalizedOwners.map(owner => (
          <span key={ownerKeyOf(owner)} className="chip gap-1.5">
            <UserAvatar name={ownerDisplayName(owner)} idaasId={owner.idaasId} avatarUrl={owner.avatarUrl} size="xs" />
            <span>{ownerDisplayName(owner)}</span>
            <button
              className="ml-1 text-ink-muted hover:text-danger disabled:hover:text-ink-muted"
              type="button"
              disabled={!canWrite}
              onClick={() => removeOwner(owner)}
              aria-label={`移除责任人 ${ownerDisplayName(owner)}`}
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        )) : <span className="text-xs text-ink-muted">未设置</span>}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <input
          className="input pl-9"
          value={query}
          disabled={!canWrite}
          onChange={event => setQuery(event.target.value)}
          placeholder="搜索姓名 / IDaaS / 邮箱"
          aria-label={candidateLabel}
        />
      </div>
      <div className="max-h-48 overflow-y-auto rounded-lg border border-outline bg-surface-soft p-1">
        {candidatePool.length ? candidatePool.map(candidate => (
          <button
            key={candidate.idaasId}
            className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-ink transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            disabled={!canWrite}
            onClick={() => {
              addOwner(ownerCandidateToOwner(candidate));
              setQuery('');
              setRemoteCandidates([]);
            }}
          >
            <UserAvatar name={candidate.displayName} idaasId={candidate.idaasId} avatarUrl={candidate.avatarUrl} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{candidate.displayName || candidate.idaasId}</span>
              <span className="block truncate text-xs text-ink-muted">{candidate.department || candidate.email || candidate.idaasId}</span>
            </span>
            <Plus className="h-4 w-4 shrink-0 text-ink-muted" />
          </button>
        )) : (
          <div className="px-3 py-4 text-xs text-ink-muted">
            {searching
              ? '正在搜索 IDaaS 候选人...'
              : query.trim()
                ? '未找到 IDaaS 候选人。'
                : '输入关键字搜索 IDaaS 候选人。'}
          </div>
        )}
      </div>
      {searchError ? <div className="text-xs text-danger">{searchError}</div> : null}
    </div>
  );
}

function OwnerAvatarStack({ owners, maxVisible = 4 }: { owners: CheckItemOwner[]; maxVisible?: number }) {
  const normalizedOwners = normalizeOwners(owners);
  const visibleOwners = normalizedOwners.slice(0, maxVisible);
  const hiddenCount = Math.max(0, normalizedOwners.length - visibleOwners.length);

  if (!normalizedOwners.length) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
        <UserAvatar size="xs" />
        未设置
      </span>
    );
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className="flex -space-x-1.5">
        {visibleOwners.map(owner => (
          <UserAvatar
            key={ownerKeyOf(owner)}
            name={ownerDisplayName(owner)}
            idaasId={owner.idaasId}
            avatarUrl={owner.avatarUrl}
            size="xs"
          />
        ))}
      </span>
      {hiddenCount ? (
        <span className="rounded-full border border-outline bg-surface-soft px-1.5 py-0.5 text-[11px] font-semibold text-ink-muted">
          +{hiddenCount}
        </span>
      ) : null}
    </span>
  );
}

function ownersSignature(owners: CheckItemOwner[]): string {
  return JSON.stringify(
    owners.map(owner => ({
      id: owner.idaasId ?? '',
      name: owner.displayName ?? '',
      email: owner.email ?? '',
      primary: owner.isPrimary ?? owner.is_primary ?? false
    }))
  );
}

function ModuleOwnerDrawer({
  module,
  projectName,
  affectedCount,
  ownerCandidates,
  canWrite,
  onApply,
  onClose
}: {
  module: InspectionModule | null;
  projectName: string;
  affectedCount: number;
  ownerCandidates: OwnerCandidate[];
  canWrite: boolean;
  onApply: (module: InspectionModule, owners: CheckItemOwner[]) => Promise<{ affectedCount: number; cleared: boolean }>;
  onClose: () => void;
}) {
  const [owners, setOwners] = useState<CheckItemOwner[]>([]);
  const [baselineSignature, setBaselineSignature] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const moduleKey = module ? idOf(module.id) : '';

  useEffect(() => {
    if (!module) return;
    const initial = ownersOfModule(module);
    setOwners(initial);
    setBaselineSignature(ownersSignature(initial));
    setError('');
    // 仅在切换目标模块时重置草稿；保存后抽屉即关闭。
  }, [moduleKey]);

  if (!module) return null;

  const dirty = ownersSignature(owners) !== baselineSignature;
  const clearing = !owners.length && Boolean(baselineSignature && baselineSignature !== '[]');
  const requestClose = () => {
    if (busy) return;
    if (dirty && !window.confirm('有未保存的修改，确认放弃并离开？')) return;
    onClose();
  };
  const handleSave = async () => {
    if (!canWrite || busy) return;
    if (clearing && !window.confirm(`将清空模块默认负责人，并同步清空当前项目该模块 ${affectedCount} 个检查项的负责人。确认继续？`)) return;
    setBusy(true);
    setError('');
    try {
      await onApply(module, owners);
      onClose();
    } catch (err) {
      setError(mutationErrorMessage(err, '模块负责人保存失败'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SideDrawer
      open
      title={`模块负责人 · ${module.name}`}
      subtitle={`${module.code} · 当前项目 ${projectName || '未选择'}`}
      size="md"
      saving={busy}
      onClose={requestClose}
      footer={
        <>
          <span className="mr-auto text-xs text-ink-muted">
            {clearing
              ? `保存将清空并同步 ${affectedCount} 个检查项`
              : `保存将同步当前项目该模块 ${affectedCount} 个检查项`}
          </span>
          <button className="btn btn-ghost btn--sm" type="button" disabled={busy} onClick={requestClose}>
            取消
          </button>
          {canWrite && (
            <button className="btn btn-primary btn--sm" type="button" disabled={busy || !dirty} onClick={() => void handleSave()}>
              {busy ? '处理中…' : '保存并同步检查项'}
            </button>
          )}
        </>
      }
    >
      <div className="mb-3 rounded-lg border border-outline bg-surface-soft p-3">
        <div className="text-xs font-semibold text-ink-muted">应用范围</div>
        <p className="mt-1 text-xs text-ink-muted">
          当前项目「{projectName || '未选择'}」下模块「{module.name}」的全部 {affectedCount} 个检查项（跨阶段、跨分页）将随本次保存单事务同步；其他项目不受影响。清空负责人需二次确认。
        </p>
      </div>
      {error ? <div role="alert" className="mb-3 text-sm text-danger">{error}</div> : null}
      <OwnerListEditor
        owners={owners}
        ownerCandidates={ownerCandidates}
        canWrite={canWrite && !busy}
        candidateLabel={`检查模块 ${module.name} IDaaS 负责人`}
        onChange={next => setOwners(next.owners)}
      />
    </SideDrawer>
  );
}

function projectDraftFromProject(project: Project | null): ProjectConfigDraft {
  return {
    name: project?.name ?? '',
    code: project?.code ?? '',
    status: project?.status ?? 'planning',
    ownerName: project?.ownerName ?? '',
    plannedStartDate: dateInputValue(project?.plannedStartDate),
    plannedEndDate: dateInputValue(project?.plannedEndDate),
    description: project?.description ?? '',
    factoryId: idOf(project?.factoryId),
    workshopId: idOf(project?.workshopId),
    productionLineId: idOf(project?.productionLineId)
  };
}

type ProjectConfigEditor = ReturnType<typeof useRecordEditor<Project, ProjectConfigDraft>>;

const DELETION_JOB_STATUS_LABEL: Record<string, string> = {
  preflighted: '已预检',
  cleaning_files: '清理文件中',
  files_cleaned: '文件已清理',
  finalizing: '写入终态中',
  failed: '失败，可重试',
  completed: '已完成',
  cancelled: '已取消'
};

const DELETION_COUNT_LABELS: Record<string, string> = {
  phases: '阶段',
  check_items: '检查项',
  check_item_owners: '检查项负责人',
  key_issues: '重点问题',
  collision_reports: '碰撞报告',
  collision_blocks: '碰撞卡控',
  collision_approvals: '碰撞审批',
  attachments: '附件记录',
  export_jobs: '导出任务',
  audit_logs: '审计记录（保留）'
};

function ProjectConfigDrawer({ editor, hierarchy, ownerCandidates, canWrite, onSave, onDeleted }: {
  editor: ProjectConfigEditor;
  hierarchy: WorkspaceData['hierarchy'];
  ownerCandidates: OwnerCandidate[];
  canWrite: boolean;
  onSave: (project: Project, draft: ProjectConfigDraft) => Promise<Project>;
  onDeleted: (project: Project) => void;
}) {
  const { draft, setDraft, record, loading, error, dirty } = editor;
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [deletion, setDeletion] = useState<ProjectDeletionState | null>(null);
  const [deleteCode, setDeleteCode] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const recordKey = record ? idOf(record.id) : '';
  const sessionKey = editor.sessionKey;

  useEffect(() => {
    setDeletion(null);
    setDeleteCode('');
    setDeleteError('');
    setSaveError('');
    if (!recordKey) return;
    let cancelled = false;
    fetchProjectDeletionState(recordKey)
      .then(state => { if (!cancelled) setDeletion(state); })
      .catch(() => { if (!cancelled) setDeletion(null); });
    return () => { cancelled = true; };
  }, [recordKey, sessionKey]);

  const job = deletion?.job ?? null;
  const jobActive = Boolean(deletion?.active && job);
  const codeMatches = Boolean(record) && deleteCode.trim() === record?.code;
  const workshops = hierarchy.workshops.filter(workshop => !draft.factoryId || idOf(workshop.factoryId) === draft.factoryId);
  const productionLines = hierarchy.productionLines.filter(line => !draft.workshopId || idOf(line.workshopId) === draft.workshopId);

  const save = async () => {
    if (!record || !canWrite || saving || deleteBusy) return;
    setSaving(true);
    setSaveError('');
    try {
      const updated = await onSave(record, draft);
      editor.accept(updated, projectDraftFromProject(updated));
    } catch (err) {
      setSaveError(mutationErrorMessage(err, '项目基础信息保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const runDeletionAction = async (action: () => Promise<ProjectDeletionState>) => {
    if (!record || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      const state = await action();
      setDeletion(state);
      if (state.job?.status === 'completed') {
        editor.removed();
        onDeleted(record);
      }
    } catch (err) {
      const failedJob = projectDeletionJobFromError(err);
      if (failedJob) setDeletion({ active: !['completed', 'cancelled'].includes(failedJob.status), job: failedJob });
      setDeleteError(mutationErrorMessage(err, '物理删除操作失败'));
    } finally {
      setDeleteBusy(false);
    }
  };
  const preflight = () => runDeletionAction(() => preflightProjectPhysicalDeletion(record!.id, deleteCode.trim()));
  const execute = () => runDeletionAction(() => executeProjectPhysicalDeletion(record!.id, deleteCode.trim()));
  const cancelDeletion = () => runDeletionAction(() => cancelProjectPhysicalDeletion(record!.id));
  const refreshDeletion = () => runDeletionAction(() => fetchProjectDeletionState(record!.id));

  const requestClose = () => {
    if (saving || deleteBusy) return;
    editor.close();
  };

  return (
    <SideDrawer
      open={editor.open}
      title={`项目实例 · ${record?.name ?? '加载中'}`}
      subtitle={record ? `${record.code} · 基础信息与危险操作` : undefined}
      size="lg"
      saving={saving || deleteBusy}
      onClose={requestClose}
      footer={
        <>
          <button className="btn btn-ghost btn--sm" type="button" disabled={saving || deleteBusy} onClick={requestClose}>
            取消
          </button>
          {canWrite && (
            <button
              className="btn btn-primary btn--sm"
              type="button"
              disabled={saving || deleteBusy || loading || Boolean(error) || !record || !dirty}
              onClick={() => void save()}
            >
              <Save className="h-4 w-4" />
              {saving ? '保存中…' : '保存项目'}
            </button>
          )}
        </>
      }
    >
      {loading ? <p className="text-sm text-ink-muted">正在加载项目实例…</p> : null}
      {error ? (
        <div role="alert" className="rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          <p>{error}</p>
          <button className="btn btn-ghost btn--sm mt-2" type="button" onClick={() => void editor.retry()}>
            重试加载
          </button>
        </div>
      ) : null}
      {record && !loading && !error ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="field-label">工厂</span>
              <select
                className="select"
                value={draft.factoryId}
                disabled={!canWrite || saving}
                onChange={event => setDraft({ ...draft, factoryId: event.target.value, workshopId: '', productionLineId: '' })}
              >
                <option value="">请选择工厂</option>
                {hierarchy.factories.map(factory => (
                  <option key={factory.id} value={idOf(factory.id)}>{hierarchyLabel(factory)}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label">车间</span>
              <select
                className="select"
                value={draft.workshopId}
                disabled={!canWrite || saving || !draft.factoryId}
                onChange={event => setDraft({ ...draft, workshopId: event.target.value, productionLineId: '' })}
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
                value={draft.productionLineId}
                disabled={!canWrite || saving || !draft.workshopId}
                onChange={event => setDraft({ ...draft, productionLineId: event.target.value })}
              >
                <option value="">车间级项目</option>
                {productionLines.map(line => (
                  <option key={line.id} value={idOf(line.id)}>{hierarchyLabel(line)}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label">项目名称</span>
              <input className="input" value={draft.name} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, name: event.target.value })} />
            </label>
            <label>
              <span className="field-label">项目编号</span>
              <input className="input" value={draft.code} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, code: event.target.value })} />
            </label>
            <label>
              <span className="field-label">状态</span>
              <select className="select" value={draft.status} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, status: event.target.value })}>
                {['planning', 'active', 'paused', 'completed', 'archived'].map(status => (
                  <option key={status} value={status}>{STATUS_LABEL[status] ?? status}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label">负责人</span>
              <input
                className="input"
                list="project-drawer-owner-candidates"
                value={draft.ownerName}
                disabled={!canWrite || saving}
                onChange={event => setDraft({ ...draft, ownerName: event.target.value })}
              />
              <datalist id="project-drawer-owner-candidates">
                {ownerCandidates.map(owner => <option key={owner.idaasId} value={owner.displayName} />)}
              </datalist>
            </label>
            <label>
              <span className="field-label">计划开始</span>
              <input className="input" type="date" value={draft.plannedStartDate} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, plannedStartDate: event.target.value })} />
            </label>
            <label>
              <span className="field-label">计划结束</span>
              <input className="input" type="date" value={draft.plannedEndDate} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, plannedEndDate: event.target.value })} />
            </label>
            <label className="sm:col-span-2">
              <span className="field-label">项目说明</span>
              <textarea className="input min-h-24" value={draft.description} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, description: event.target.value })} />
            </label>
          </div>
          {saveError ? <div role="alert" className="text-sm text-danger">{saveError}</div> : null}

          {canWrite ? (
            <section className="rounded-lg border border-danger/40 bg-danger/5 p-4" aria-label="危险操作">
              <div className="flex flex-wrap items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-danger" />
                <h3 className="text-sm font-semibold text-danger">物理删除项目实例</h3>
              </div>
              <p className="mt-2 text-xs text-ink-muted">
                将物理删除「{record.name}」（{record.code}）及其阶段、检查项、问题、报告与专属存储文件；审计记录保留项目标识快照。项目模板、全局模块、主数据与其他项目不受影响。删除期间项目的创建、上传与导出入口将被锁定。
              </p>
              <label className="mt-3 block">
                <span className="field-label">输入项目编号「{record.code}」确认</span>
                <input
                  className="input"
                  value={deleteCode}
                  disabled={deleteBusy || (jobActive && job?.status !== 'preflighted' && job?.status !== 'failed')}
                  onChange={event => setDeleteCode(event.target.value)}
                  placeholder={record.code}
                  aria-label="物理删除确认编号"
                />
              </label>
              {job ? (
                <div className="mt-3 rounded-lg border border-outline bg-surface-soft p-3 text-xs text-ink-muted">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="chip">任务 #{job.id}</span>
                    <StatusPill status={job.status} />
                    <span>{DELETION_JOB_STATUS_LABEL[job.status] ?? job.status}</span>
                    <span>发起人 {job.requestedBy.name || job.requestedBy.idaasId || '未知'}</span>
                  </div>
                  {Object.keys(job.counts).length ? (
                    <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                      {Object.entries(job.counts).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between gap-2">
                          <dt>{DELETION_COUNT_LABELS[key] ?? key}</dt>
                          <dd className="font-semibold text-ink">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  <p className="mt-2">
                    附件文件 {job.fileSummary.attachmentFilesDeleted}/{job.fileSummary.attachmentsToDelete} 已删除
                    {job.fileSummary.attachmentsKeptShared ? `，${job.fileSummary.attachmentsKeptShared} 个共享文件保留` : ''}
                    ；导出文件 {job.fileSummary.exportFilesDeleted}/{job.fileSummary.exportFilesToDelete} 已删除。
                  </p>
                  {job.lastError ? <p className="mt-1 text-danger">最近错误：{job.lastError}</p> : null}
                </div>
              ) : null}
              {deleteError ? <div role="alert" className="mt-2 text-sm text-danger">{deleteError}</div> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {!jobActive ? (
                  <button
                    className="btn btn-ghost btn--sm text-danger"
                    type="button"
                    disabled={deleteBusy || !codeMatches}
                    onClick={() => void preflight()}
                  >
                    {deleteBusy ? '处理中…' : '预检（不执行删除）'}
                  </button>
                ) : null}
                {jobActive && (job?.status === 'preflighted' || job?.status === 'failed') ? (
                  <button
                    className="btn btn-primary btn--sm bg-danger border-danger"
                    type="button"
                    disabled={deleteBusy || !codeMatches}
                    onClick={() => void execute()}
                  >
                    {deleteBusy ? '处理中…' : job?.status === 'failed' ? '重试执行物理删除' : '执行物理删除'}
                  </button>
                ) : null}
                {jobActive && job?.status === 'preflighted' ? (
                  <button className="btn btn-ghost btn--sm" type="button" disabled={deleteBusy} onClick={() => void cancelDeletion()}>
                    取消删除任务
                  </button>
                ) : null}
                {jobActive ? (
                  <button className="btn btn-ghost btn--sm" type="button" disabled={deleteBusy} onClick={() => void refreshDeletion()}>
                    <RefreshCcw className="h-4 w-4" />
                    刷新状态
                  </button>
                ) : null}
              </div>
              {!codeMatches && !jobActive ? (
                <p className="mt-2 text-xs text-ink-muted">编号完全一致后才能预检。</p>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}
    </SideDrawer>
  );
}

function phaseConfigDraftFrom(phase: ProjectPhase | null): PhaseConfigDraft {
  return {
    name: phase?.name ?? '',
    sequence: String(phase?.sequence ?? ''),
    goal: phase?.goal ?? '',
    plannedStartDate: dateInputValue(phase?.plannedStartDate),
    plannedEndDate: dateInputValue(phase?.plannedEndDate),
    status: phase?.status ?? 'not_started',
    isActive: phase?.isActive !== false
  };
}

function checkItemConfigDraftFrom(
  item: CheckItem | null,
  phase?: ProjectPhase | null,
  module?: InspectionModule | null
): CheckItemConfigDraft {
  return {
    title: item?.title ?? '',
    moduleId: idOf(item?.moduleId ?? module?.id),
    projectPhaseId: idOf(item?.projectPhaseId ?? phase?.id),
    tags: item ? (item.tags?.length ? item.tags : item.acceptanceCriteria ? [item.acceptanceCriteria] : []).join('，') : '',
    plannedStartDate: dateInputValue(item?.plannedStartDate ?? phase?.plannedStartDate),
    plannedEndDate: dateInputValue(item?.plannedEndDate ?? phase?.plannedEndDate),
    ownerName: '',
    ownerIdaasId: undefined,
    owners: item ? ownersOfItem(item) : module ? ownersOfModule(module) : [],
    status: item?.status ?? 'pending',
    isActive: item?.isActive !== false
  };
}

type PhaseConfigEditor = ReturnType<typeof useRecordEditor<ProjectPhase, PhaseConfigDraft>>;

function PhaseConfigDrawer({ editor, phases, checkItems, canWrite, onSave, onDelete, onMigrateItems }: {
  editor: PhaseConfigEditor;
  phases: ProjectPhase[];
  checkItems: CheckItem[];
  canWrite: boolean;
  onSave: (phase: ProjectPhase, draft: PhaseConfigDraft) => Promise<ProjectPhase>;
  onDelete: (phase: ProjectPhase) => Promise<void>;
  onMigrateItems: (phase: ProjectPhase, targetPhaseId: string) => Promise<number>;
}) {
  const { draft, setDraft, record, loading, error, dirty } = editor;
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [transferTargetId, setTransferTargetId] = useState('');
  const sessionKey = editor.sessionKey;

  useEffect(() => {
    setActionError('');
    setTransferTargetId('');
  }, [sessionKey]);

  const phaseItems = record ? checkItems.filter(item => idOf(item.projectPhaseId) === idOf(record.id)) : [];
  const transferTarget = phases.find(phase => idOf(phase.id) === transferTargetId);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setActionError('');
    try {
      await action();
    } catch (err) {
      setActionError(mutationErrorMessage(err, '操作失败'));
    } finally {
      setBusy(false);
    }
  };
  const save = () => run(async () => {
    if (!record) return;
    const updated = await onSave(record, draft);
    editor.accept(updated, phaseConfigDraftFrom(updated));
  });
  const remove = () => {
    if (!record || !window.confirm(`确认删除阶段「${record.name}」？`)) return;
    void run(async () => {
      await onDelete(record);
      editor.removed();
    });
  };
  const migrate = () => {
    if (!record || !transferTargetId || !transferTarget) return;
    if (!window.confirm(`确认将本阶段 ${phaseItems.length} 个检查项迁移到「${transferTarget.name}」？`)) return;
    void run(async () => {
      await onMigrateItems(record, transferTargetId);
      setTransferTargetId('');
    });
  };
  const requestClose = () => {
    if (busy) return;
    editor.close();
  };

  return (
    <SideDrawer
      open={editor.open}
      title={`项目阶段 · ${record?.name ?? '加载中'}`}
      subtitle={record ? `Key ${record.code} · ${phaseItems.length} 项检查配置` : undefined}
      size="lg"
      saving={busy}
      onClose={requestClose}
      footer={
        <>
          <button className="btn btn-ghost btn--sm" type="button" disabled={busy} onClick={requestClose}>
            取消
          </button>
          {canWrite && (
            <button
              className="btn btn-primary btn--sm"
              type="button"
              disabled={busy || loading || Boolean(error) || !record || !dirty}
              onClick={() => void save()}
            >
              <Save className="h-4 w-4" />
              {busy ? '处理中…' : '保存阶段'}
            </button>
          )}
        </>
      }
    >
      {loading ? <p className="text-sm text-ink-muted">正在加载阶段…</p> : null}
      {error ? (
        <div role="alert" className="rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          <p>{error}</p>
          <button className="btn btn-ghost btn--sm mt-2" type="button" onClick={() => void editor.retry()}>
            重试加载
          </button>
        </div>
      ) : null}
      {record && !loading && !error ? (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              checked={draft.isActive}
              disabled={!canWrite || busy}
              onChange={event => setDraft({ ...draft, isActive: event.target.checked })}
            />
            启用该阶段
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="field-label">阶段名称</span>
              <input className="input" value={draft.name} disabled={!canWrite || busy} onChange={event => setDraft({ ...draft, name: event.target.value })} />
            </label>
            <label>
              <span className="field-label">排序</span>
              <input className="input" type="number" value={draft.sequence} disabled={!canWrite || busy} onChange={event => setDraft({ ...draft, sequence: event.target.value })} />
            </label>
            <label>
              <span className="field-label">计划开始</span>
              <input className="input" type="date" value={draft.plannedStartDate} disabled={!canWrite || busy} onChange={event => setDraft({ ...draft, plannedStartDate: event.target.value })} />
            </label>
            <label>
              <span className="field-label">计划结束</span>
              <input className="input" type="date" value={draft.plannedEndDate} disabled={!canWrite || busy} onChange={event => setDraft({ ...draft, plannedEndDate: event.target.value })} />
            </label>
            <label className="sm:col-span-2">
              <span className="field-label">状态</span>
              <select className="select" value={draft.status} disabled={!canWrite || busy} onChange={event => setDraft({ ...draft, status: event.target.value })}>
                {['not_started', 'in_progress', 'blocked', 'completed'].map(status => (
                  <option key={status} value={status}>{STATUS_LABEL[status] ?? status}</option>
                ))}
              </select>
            </label>
            <label className="sm:col-span-2">
              <span className="field-label">阶段目标</span>
              <textarea className="input min-h-20" value={draft.goal} disabled={!canWrite || busy} onChange={event => setDraft({ ...draft, goal: event.target.value })} />
            </label>
          </div>
          {actionError ? <div role="alert" className="text-sm text-danger">{actionError}</div> : null}
          {canWrite ? (
            <section className="rounded-lg border border-outline bg-surface-soft p-4" aria-label="阶段工具">
              <h3 className="text-sm font-semibold text-ink">检查项迁移</h3>
              <p className="mt-1 text-xs text-ink-muted">将本阶段全部 {phaseItems.length} 个检查项迁移到目标阶段，计划日期缺省时沿用目标阶段窗口。</p>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="min-w-[220px]">
                  <span className="field-label">迁移到阶段</span>
                  <select
                    className="select"
                    value={transferTargetId}
                    disabled={busy || !phaseItems.length}
                    onChange={event => setTransferTargetId(event.target.value)}
                  >
                    <option value="">选择目标阶段</option>
                    {phases
                      .filter(phase => !record || idOf(phase.id) !== idOf(record.id))
                      .map(phase => <option key={phase.id} value={idOf(phase.id)}>{phase.name}</option>)}
                  </select>
                </label>
                <button
                  className="btn btn-ghost btn--sm"
                  type="button"
                  disabled={busy || !transferTargetId || !phaseItems.length}
                  onClick={migrate}
                  title={transferTarget ? `迁移到 ${transferTarget.name}` : undefined}
                >
                  <Workflow className="h-4 w-4" />
                  迁移本阶段检查项
                </button>
              </div>
            </section>
          ) : null}
          {canWrite && record.canDelete === true ? (
            <section className="rounded-lg border border-danger/40 bg-danger/5 p-4" aria-label="危险操作">
              <div className="flex flex-wrap items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-danger" />
                <h3 className="text-sm font-semibold text-danger">删除阶段</h3>
              </div>
              <p className="mt-1 text-xs text-ink-muted">受保护的阶段不可删除；删除操作不可撤销。</p>
              <button className="btn btn-ghost btn--sm mt-3 text-danger" type="button" disabled={busy} onClick={remove}>
                <Trash2 className="h-4 w-4" />
                删除阶段
              </button>
            </section>
          ) : null}
        </div>
      ) : null}
    </SideDrawer>
  );
}

const MATRIX_CELL_FILTER_DEFAULT: SearchFilterState = EMPTY_FILTERS;

function MatrixCellDrawer({ project, cell, phases, modules, checkItems, ownerCandidates, canWrite, onCreate, onUpdate, onDelete, onClose }: {
  project: Project | null;
  cell: { moduleId: string; phaseId: string } | null;
  phases: ProjectPhase[];
  modules: InspectionModule[];
  checkItems: CheckItem[];
  ownerCandidates: OwnerCandidate[];
  canWrite: boolean;
  onCreate: (draft: CheckItemConfigDraft) => Promise<void>;
  onUpdate: (item: CheckItem, draft: CheckItemConfigDraft) => Promise<void>;
  onDelete: (item: CheckItem) => Promise<void>;
  onClose: () => void;
}) {
  const [filters, setFilters] = useState<SearchFilterState>(MATRIX_CELL_FILTER_DEFAULT);
  const [editing, setEditing] = useState<{ item: CheckItem | null; draft: CheckItemConfigDraft; baseline: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const cellKey = cell ? `${cell.moduleId}:${cell.phaseId}` : '';

  useEffect(() => {
    setFilters(MATRIX_CELL_FILTER_DEFAULT);
    setEditing(null);
    setActionError('');
  }, [cellKey]);

  const phase = cell ? phases.find(item => idOf(item.id) === cell.phaseId) ?? null : null;
  const module = cell ? modules.find(item => idOf(item.id) === cell.moduleId) ?? null : null;
  const cellItems = cell
    ? checkItems.filter(item => idOf(item.moduleId) === cell.moduleId && idOf(item.projectPhaseId) === cell.phaseId)
    : [];
  const visibleItems = cellItems.filter(item => {
    const itemOwners = ownersOfItem(item);
    if (filters.status && item.status !== filters.status) return false;
    if (filters.owner && !textMatches(filters.owner, ownersForSearch(itemOwners))) return false;
    if (filters.activeState === 'enabled' && item.isActive === false) return false;
    if (filters.activeState === 'disabled' && item.isActive !== false) return false;
    if (!textMatches(filters.keyword, [item.title, item.description, item.acceptanceCriteria, item.tags?.join(' '), ...ownersForSearch(itemOwners)])) return false;
    return dateRangeMatches(item.plannedStartDate, item.plannedEndDate, filters.startDate, filters.endDate);
  });

  const editingDirty = editing ? JSON.stringify(editing.draft) !== editing.baseline : false;
  const openItem = (item: CheckItem | null) => {
    const draft = checkItemConfigDraftFrom(item, phase, module);
    setActionError('');
    setEditing({ item, draft, baseline: JSON.stringify(draft) });
  };
  const closeItem = () => {
    if (busy) return;
    if (editingDirty && !window.confirm('有未保存的修改，确认放弃并离开？')) return;
    setEditing(null);
    setActionError('');
  };
  const requestClose = () => {
    if (busy) return;
    if (editing) {
      closeItem();
      return;
    }
    onClose();
  };

  const runItem = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setActionError('');
    try {
      await action();
      setEditing(null);
    } catch (err) {
      setActionError(mutationErrorMessage(err, '检查项操作失败'));
    } finally {
      setBusy(false);
    }
  };
  const itemValidation = !editing
    ? ''
    : !editing.draft.title.trim()
      ? '请填写检查项标题。'
      : !editing.draft.plannedStartDate || !editing.draft.plannedEndDate
        ? '请填写计划开始和结束日期。'
        : editing.draft.plannedStartDate > editing.draft.plannedEndDate
          ? '计划结束不得早于开始。'
          : '';
  const saveItem = () => {
    if (!editing || itemValidation) {
      if (itemValidation) setActionError(itemValidation);
      return;
    }
    void runItem(async () => {
      if (editing.item) await onUpdate(editing.item, editing.draft);
      else await onCreate(editing.draft);
    });
  };
  const deleteItem = () => {
    if (!editing?.item || editing.item.canDelete !== true) return;
    if (!window.confirm(`确认删除检查项「${editing.item.title}」？`)) return;
    void runItem(() => onDelete(editing.item!));
  };

  const disabledContext = (module && module.isActive === false) || (phase && phase.isActive === false);

  return (
    <>
      <SideDrawer
        open={Boolean(cell)}
        title={module && phase ? `${module.name} × ${phase.name}` : '检查项配置'}
        subtitle={project ? `项目 ${project.name} · ${phase?.code ?? ''}` : undefined}
        size="lg"
        saving={busy}
        onClose={requestClose}
        footer={
          <>
            <span className="mr-auto text-xs text-ink-muted">{visibleItems.length}/{cellItems.length} 项</span>
            <button className="btn btn-ghost btn--sm" type="button" disabled={busy} onClick={requestClose}>
              关闭
            </button>
            {canWrite && phase && module ? (
              <button className="btn btn-primary btn--sm" type="button" disabled={busy} onClick={() => openItem(null)}>
                <Plus className="h-4 w-4" />
                新增检查项
              </button>
            ) : null}
          </>
        }
      >
        {disabledContext ? (
          <div className="mb-3 rounded-lg border border-outline bg-surface-soft p-3 text-xs text-ink-muted">
            {module?.isActive === false ? '模块已停用；' : ''}{phase?.isActive === false ? '阶段已停用；' : ''}仍可维护检查项，启用后参与项目展示。
          </div>
        ) : null}
        <div className="rounded-lg border border-outline bg-surface-soft p-3" aria-label="单元检查项筛选">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <label>
              <span className="field-label">检查项搜索</span>
              <input className="input" value={filters.keyword} onChange={event => setFilters({ ...filters, keyword: event.target.value })} placeholder="标题、标签、负责人" aria-label="单元检查项搜索" />
            </label>
            <label>
              <span className="field-label">状态</span>
              <select className="select" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}>
                <option value="">全部状态</option>
                {CHECK_ITEM_STATUS_OPTIONS.map(status => <option key={status} value={status}>{STATUS_LABEL[status] ?? status}</option>)}
              </select>
            </label>
            <label>
              <span className="field-label">负责人</span>
              <input className="input" value={filters.owner} onChange={event => setFilters({ ...filters, owner: event.target.value })} placeholder="负责人" aria-label="单元检查项负责人筛选" />
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
              <span className="field-label">计划开始</span>
              <input className="input" type="date" value={filters.startDate} onChange={event => setFilters({ ...filters, startDate: event.target.value })} />
            </label>
            <label>
              <span className="field-label">计划结束</span>
              <input className="input" type="date" value={filters.endDate} onChange={event => setFilters({ ...filters, endDate: event.target.value })} />
            </label>
          </div>
        </div>
        <div className="table-shell mt-3">
          <table className="data-table min-w-[900px]">
            <thead>
              <tr>
                <th>检查项</th>
                <th>标签</th>
                <th>计划窗口</th>
                <th>负责人</th>
                <th>状态</th>
                <th>启用</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map(item => {
                const itemOwners = ownersOfItem(item);
                return (
                  <tr key={item.id}>
                    <td className="min-w-[220px]">
                      <div className="font-semibold text-ink">{item.title}</div>
                      {item.description ? <div className="mt-1 text-xs text-ink-muted">{item.description}</div> : null}
                    </td>
                    <td className="min-w-[140px] text-xs text-ink-muted">{(item.tags ?? []).join('、') || '—'}</td>
                    <td className="min-w-[170px]">{formatDate(item.plannedStartDate)} 至 {formatDate(item.plannedEndDate)}</td>
                    <td className="min-w-[150px]">
                      {itemOwners.length ? (
                        <div className="flex items-center gap-2">
                          <OwnerAvatarStack owners={itemOwners} maxVisible={3} />
                          <span className="text-xs text-ink-muted">{itemOwners.map(owner => owner.displayName || owner.idaasId).join('、')}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-ink-muted">未设置</span>
                      )}
                    </td>
                    <td><StatusPill status={item.status} /></td>
                    <td>{item.isActive === false ? '停用' : '启用'}</td>
                    <td>
                      <button
                        className="btn btn-ghost btn--sm"
                        type="button"
                        disabled={busy}
                        onClick={() => openItem(item)}
                        aria-label={`编辑检查项 ${item.title}`}
                        aria-haspopup="dialog"
                      >
                        编辑
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!visibleItems.length ? (
                <tr>
                  <td colSpan={7} className="text-center text-ink-muted">
                    {cellItems.length ? '当前筛选下暂无检查项。' : canWrite ? '该单元暂无检查项，可在下方新增。' : '该单元暂无检查项。'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SideDrawer>
      <SideDrawer
        open={Boolean(editing)}
        title={editing?.item ? `编辑检查项 · ${editing.item.title}` : '新增检查项'}
        subtitle={module && phase ? `${module.name} / ${phase.name}（${phase.code}）` : undefined}
        size="md"
        saving={busy}
        onClose={closeItem}
        footer={
          <>
            <button className="btn btn-ghost btn--sm" type="button" disabled={busy} onClick={closeItem}>
              取消
            </button>
            {canWrite ? (
              <button
                className="btn btn-primary btn--sm"
                type="button"
                disabled={busy || !editing || Boolean(itemValidation) || (editing.item != null && !editingDirty)}
                onClick={saveItem}
              >
                <Save className="h-4 w-4" />
                {busy ? '处理中…' : editing?.item ? '保存检查项' : '新增检查项'}
              </button>
            ) : null}
          </>
        }
      >
        {editing ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-outline bg-surface-soft p-3 text-xs text-ink-muted">
              阶段与模块由当前矩阵单元固定：{phase?.name ?? '未知阶段'} / {module?.name ?? '未知模块'}；跨阶段迁移请在阶段抽屉中操作。
            </div>
            <label className="block">
              <span className="field-label">检查项标题</span>
              <input
                className="input"
                value={editing.draft.title}
                disabled={!canWrite || busy}
                onChange={event => setEditing({ ...editing, draft: { ...editing.draft, title: event.target.value } })}
                placeholder="输入检查项标题"
                aria-label="检查项标题"
              />
            </label>
            <label className="block">
              <span className="field-label">标签</span>
              <input
                className="input"
                value={editing.draft.tags}
                disabled={!canWrite || busy}
                onChange={event => setEditing({ ...editing, draft: { ...editing.draft, tags: event.target.value } })}
                placeholder="逗号分隔"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="field-label">计划开始</span>
                <input
                  className="input"
                  type="date"
                  value={editing.draft.plannedStartDate}
                  disabled={!canWrite || busy}
                  onChange={event => setEditing({ ...editing, draft: { ...editing.draft, plannedStartDate: event.target.value } })}
                />
              </label>
              <label>
                <span className="field-label">计划结束</span>
                <input
                  className="input"
                  type="date"
                  value={editing.draft.plannedEndDate}
                  disabled={!canWrite || busy}
                  onChange={event => setEditing({ ...editing, draft: { ...editing.draft, plannedEndDate: event.target.value } })}
                />
              </label>
            </div>
            <div>
              <span className="field-label">责任人</span>
              <OwnerListEditor
                owners={editing.draft.owners}
                ownerCandidates={ownerCandidates}
                canWrite={canWrite && !busy}
                candidateLabel={`配置中心 ${editing.draft.title || '检查项'} IDaaS 责任人`}
                onChange={next => setEditing({ ...editing, draft: { ...editing.draft, ...next } })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="field-label">状态</span>
                <select
                  className="select"
                  value={editing.draft.status}
                  disabled={!canWrite || busy}
                  onChange={event => setEditing({ ...editing, draft: { ...editing.draft, status: event.target.value } })}
                >
                  {CHECK_ITEM_STATUS_OPTIONS.map(status => (
                    <option key={status} value={status}>{STATUS_LABEL[status] ?? status}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-end gap-2 pb-2 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  checked={editing.draft.isActive}
                  disabled={!canWrite || busy}
                  onChange={event => setEditing({ ...editing, draft: { ...editing.draft, isActive: event.target.checked } })}
                />
                启用该检查项
              </label>
            </div>
            {actionError ? <div role="alert" className="text-sm text-danger">{actionError}</div> : null}
            {editing.item ? (
              <div className="border-t border-outline pt-3">
                {editing.item.canDelete === true ? (
                  <button className="btn btn-ghost btn--sm text-danger" type="button" disabled={!canWrite || busy} onClick={deleteItem}>
                    <Trash2 className="h-4 w-4" />
                    删除检查项
                  </button>
                ) : (
                  <p className="text-xs text-ink-muted">该检查项受删除保护，如不再使用请设置为停用。</p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </SideDrawer>
    </>
  );
}

type CheckItemDraft = CheckItemConfigDraft & { description: string; acceptanceCriteria: string };

function CheckItemAttachmentsEditor({ item, active, canWrite, saving, validation, onUpload, onDownload, onDelete, onCaption }: {
  item: CheckItem | null;
  active: boolean;
  canWrite: boolean;
  saving: boolean;
  validation: string;
  onUpload: (files: File[]) => Promise<number>;
  onDownload: AttachmentDownloadHandler;
  onDelete: (attachment: Attachment) => Promise<void>;
  onCaption: (attachment: Attachment, caption: string) => Promise<void>;
}) {
  const [files, setFiles] = useState<File[]>([]);
  useRelatedDraftDirty(files.length > 0);
  return <section className="space-y-4" aria-label="检查项附件">
    <p className="text-sm text-ink-muted">图片和 PDF 可在线预览；其他文件使用受控下载。上传、删除和说明保存立即生效，不会随正文取消而撤销。</p>
    {canWrite && <div className="rounded-lg border border-outline bg-surface-soft p-3">
      <label><span className="field-label">选择附件（可多选）</span><input className="input" type="file" multiple disabled={saving} aria-label="检查项选择附件" onChange={event => { setFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }} /></label>
      {!!files.length && <ul className="my-2 space-y-1 text-sm text-ink-muted">{files.map((file, index) => <li key={`${file.name}:${index}`} className="flex min-w-0 items-center gap-2"><span className="truncate">{file.name} · {formatFileSize(file.size)}</span><button type="button" className="btn btn-ghost btn--sm" disabled={saving} aria-label={`移除待上传 ${file.name}`} onClick={() => setFiles(current => current.filter((_, itemIndex) => itemIndex !== index))}>移除</button></li>)}</ul>}
      <button className="btn btn-primary btn--sm mt-3" type="button" disabled={saving || !files.length || (!item && !!validation)} onClick={async () => { const count = await onUpload(files); setFiles(current => current.slice(count)); }}><Paperclip className="h-4 w-4" />{saving ? '处理中…' : item ? '上传附件' : '保存检查项并上传'}</button>
      {!item && <p className="mt-2 text-xs text-ink-muted">首次上传会先保存基本信息，取得检查项 ID 后归档。{validation}</p>}
      {item && <p className="mt-2 text-xs text-ink-muted">上传不自动保存基本信息草稿。</p>}
    </div>}
    <AttachmentList attachments={item?.attachments ?? []} loadThumbnails={active} canDownload={canWrite} canDelete={canWrite && !saving} canEditCaption={canWrite && !saving} onDownloadAttachment={onDownload} onDeleteAttachment={onDelete} onUpdateAttachmentCaption={onCaption} emptyMessage="当前检查项暂无附件。" />
  </section>;
}

function ChecksView({ project, phases, modules, ownerCandidates, canWrite, workspaceLoading = false, defaultOwner, onSaved, onRemoved, onDownloadAttachment }: {
  project: Project | null;
  phases: ProjectPhase[];
  modules: InspectionModule[];
  ownerCandidates: OwnerCandidate[];
  canWrite: boolean;
  workspaceLoading?: boolean;
  defaultOwner?: OwnerCandidate;
  onSaved: (item: CheckItem) => void;
  onRemoved: (item: CheckItem) => void;
  onDownloadAttachment: AttachmentDownloadHandler;
}) {
  const [filters, setFilters] = useState<SearchFilterState>(EMPTY_FILTERS);
  const [advanced, setAdvanced] = useState(false);
  const [mutationSaving, setSaving] = useState(false);
  const busy = useRef(false);
  const saving = mutationSaving || workspaceLoading;
  const [message, setMessage] = useState('');
  const [auditRevision, setAuditRevision] = useState(0);
  const [tab, setTab] = useState('basic');
  const requestedTab = useRef('basic');
  const visiblePhases = activePhasesOf(phases);
  const orderedModules = bySequence(modules);
  const defaultPhase = visiblePhases.find(phase => idOf(phase.id) === filters.phaseId) ?? visiblePhases[0];
  const defaultModule = orderedModules.find(module => idOf(module.id) === filters.moduleId) ?? orderedModules[0];
  const toDraft = (item: CheckItem | null): CheckItemDraft => ({
    title: item?.title ?? '', description: item?.description ?? '', acceptanceCriteria: item?.acceptanceCriteria ?? '',
    moduleId: idOf(item?.moduleId ?? defaultModule?.id), projectPhaseId: idOf(item?.projectPhaseId ?? defaultPhase?.id),
    tags: (item?.tags ?? []).join(', '), plannedStartDate: dateInputValue(item?.plannedStartDate ?? defaultPhase?.plannedStartDate),
    plannedEndDate: dateInputValue(item?.plannedEndDate ?? defaultPhase?.plannedEndDate), ownerName: '', ownerIdaasId: undefined,
    owners: item ? ownersOfItem(item) : defaultModule && ownersOfModule(defaultModule).length ? ownersOfModule(defaultModule) : defaultOwner?.idaasId ? [ownerCandidateToOwner(defaultOwner)] : [],
    status: item?.status ?? 'pending', isActive: item?.isActive !== false
  });
  const retrieve = async (id: string | number, signal?: AbortSignal) => {
    const item = await fetchCheckItem(id, signal);
    if (!project || idOf(item.projectId) !== idOf(project.id)) throw new Error('检查项不属于当前项目，请刷新列表。');
    return item;
  };
  const editor = useRecordEditor<CheckItem, CheckItemDraft>(toDraft, retrieve, saving);
  const { draft, setDraft, record: selectedItem } = editor;
  const list = usePaginatedList(listCheckItems, {
    project: project?.id, phase_enabled: true, phase: filters.phaseId, module: filters.moduleId,
    status: filters.status, owner: filters.owner, q: filters.keyword,
    is_enabled: filters.activeState === 'enabled' ? true : filters.activeState === 'disabled' ? false : undefined,
    start_date: filters.startDate, end_date: filters.endDate
  }, !!project);
  const rows = list.data?.results ?? [];
  const phaseById = new Map(phases.map(phase => [idOf(phase.id), phase]));
  const moduleById = new Map(modules.map(module => [idOf(module.id), module]));
  const validation = !draft.title.trim() ? '请填写检查项标题。'
    : !draft.projectPhaseId || !draft.moduleId ? '请选择阶段和模块。'
    : !draft.plannedStartDate || !draft.plannedEndDate ? '请填写计划开始和结束日期。'
    : draft.plannedStartDate > draft.plannedEndDate ? '计划结束不得早于开始。' : '';

  useEffect(() => { setTab(requestedTab.current); setMessage(''); }, [editor.sessionKey]);

  const open = (id?: string | number, nextTab = 'basic') => {
    if (saving || busy.current) return;
    requestedTab.current = nextTab;
    void editor.openRecord(id);
  };
  const beginMutation = () => {
    if (!canWrite || saving || busy.current || editor.loading || editor.error || !project) return false;
    busy.current = true;
    setSaving(true);
    setMessage('');
    return true;
  };
  const endMutation = () => { busy.current = false; setSaving(false); };
  const changed = () => { list.refresh(); setAuditRevision(value => value + 1); };
  const saveRecord = async () => {
    if (!project || validation) throw new Error(validation || '请先选择项目。');
    const snapshot = draft;
    const payload = {
      title: snapshot.title.trim(), description: snapshot.description, acceptanceCriteria: snapshot.acceptanceCriteria,
      moduleId: snapshot.moduleId, projectPhaseId: snapshot.projectPhaseId,
      tags: snapshot.tags.split(/[,，、]/).map(tag => tag.trim()).filter(Boolean),
      plannedStartDate: snapshot.plannedStartDate, plannedEndDate: snapshot.plannedEndDate,
      owners: ownersFromDraft(snapshot), status: snapshot.status, isActive: snapshot.isActive,
      progressPercent: isComplete(snapshot.status) ? 100 : selectedItem?.progressPercent ?? 0, metadata: selectedItem?.metadata
    };
    const saved = selectedItem ? await updateCheckItem(selectedItem.id, payload) : await createCheckItem(project.id, payload);
    editor.accept(saved, toDraft(saved));
    onSaved(saved);
    changed();
    return saved;
  };
  const save = async () => {
    if (!beginMutation()) return;
    try { await saveRecord(); setMessage('检查项已保存。'); }
    catch (error) { setMessage(mutationErrorMessage(error, '检查项保存失败。')); }
    finally { endMutation(); }
  };
  const refreshAssets = async (target: CheckItem) => {
    changed();
    const updated = await editor.refresh(target);
    if (updated) onSaved(updated);
  };
  const mutateAsset = async (action: () => Promise<unknown>) => {
    if (!selectedItem || !beginMutation()) throw new Error('当前检查项正在处理，请稍后重试。');
    let applied = false;
    try {
      await action();
      applied = true;
      await refreshAssets(selectedItem);
    } catch (error) {
      if (applied) throw new Error('附件操作已生效，但详情回读失败。请重新打开核实，勿重复操作。');
      throw error;
    } finally { endMutation(); }
  };
  const upload = async (files: File[]) => {
    if (!files.length || !beginMutation()) return 0;
    let target = selectedItem;
    let completed = 0;
    try {
      if (!target) target = await saveRecord();
      for (const file of files) {
        await uploadAttachment({ file, projectId: target.projectId, objectType: 'check_item', objectId: target.id, metadata: { source: 'file_upload' } });
        completed += 1;
      }
      setMessage(`已上传 ${completed} 个附件。`);
    } catch (error) {
      setMessage(`${target ? `检查项已保存；附件成功 ${completed}/${files.length} 个，其余未完成。` : ''}${mutationErrorMessage(error, '附件上传失败。')}`);
    } finally {
      if (target) {
        try { await refreshAssets(target); }
        catch { setMessage(current => `${current} 附件回读失败，请重新打开核实，避免重复上传。`); }
      }
      endMutation();
    }
    return completed;
  };
  const remove = async () => {
    if (!selectedItem?.canDelete || !window.confirm(`确认删除检查项「${selectedItem.title}」？未保存草稿也会放弃。`)) return;
    if (!beginMutation()) return;
    try {
      await deleteCheckItem(selectedItem.id);
      onRemoved(selectedItem);
      editor.removed();
      changed();
      setMessage('检查项已删除，审计记录保留。');
    } catch (error) { setMessage(mutationErrorMessage(error, '检查项删除失败。')); }
    finally { endMutation(); }
  };

  return <section className="panel min-w-0">
    <div className="panel-header">
      <div><h2 className="text-xl font-semibold">检查项</h2><p className="text-sm text-ink-muted">筛选列表，点击检查项查看详情、附件与操作记录。</p></div>
      <div className="flex flex-wrap items-center gap-2"><span className="chip">共 {list.data?.count ?? 0} 条</span><button className="btn btn-primary btn--sm" type="button" disabled={!canWrite || !project || saving || !defaultPhase || !defaultModule} onClick={() => open()}><Plus className="h-4 w-4" />新增检查项</button></div>
    </div>
    <ReadOnlyNotice canWrite={canWrite} />
    {!editor.open && message && <p role="status" className="mt-3 text-sm">{message}</p>}
    <div className="mt-4 rounded-lg border border-outline bg-surface-soft p-3" aria-label="检查项筛选">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <label className="xl:col-span-2"><span className="field-label">关键字</span><input className="input" value={filters.keyword} onChange={event => setFilters({ ...filters, keyword: event.target.value })} placeholder="检查项、要求、阶段、模块" aria-label="检查项关键字筛选" /></label>
        <label><span className="field-label">阶段</span><select className="select" aria-label="检查项阶段筛选" value={filters.phaseId} onChange={event => setFilters({ ...filters, phaseId: event.target.value })}><option value="">全部启用阶段</option>{visiblePhases.map(phase => <option key={phase.id} value={idOf(phase.id)}>{phase.name}</option>)}</select></label>
        <label><span className="field-label">模块</span><select className="select" aria-label="检查项模块筛选" value={filters.moduleId} onChange={event => setFilters({ ...filters, moduleId: event.target.value })}><option value="">全部模块</option>{orderedModules.map(module => <option key={module.id} value={idOf(module.id)}>{module.name}</option>)}</select></label>
        <label><span className="field-label">状态</span><select className="select" aria-label="检查项状态筛选" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}><option value="">全部状态</option>{CHECK_ITEM_STATUS_OPTIONS.map(status => <option key={status} value={status}>{STATUS_LABEL[status] ?? status}</option>)}</select></label>
        <div className="flex items-end gap-2"><button className="btn btn-ghost btn--sm" type="button" aria-expanded={advanced} onClick={() => setAdvanced(value => !value)}>高级筛选{filters.owner || filters.activeState || filters.startDate || filters.endDate ? ' · 已生效' : ''}</button><button className="btn btn-ghost btn--sm" type="button" onClick={() => setFilters(EMPTY_FILTERS)}>重置</button></div>
      </div>
      {advanced && <div className="mt-3 grid gap-3 border-t border-outline pt-3 sm:grid-cols-2 xl:grid-cols-4">
        <label><span className="field-label">负责人</span><input className="input" value={filters.owner} onChange={event => setFilters({ ...filters, owner: event.target.value })} placeholder="姓名、邮箱或 IDaaS ID" aria-label="检查项负责人筛选" /></label>
        <label><span className="field-label">检查项启用状态</span><select className="select" value={filters.activeState} onChange={event => setFilters({ ...filters, activeState: event.target.value })}><option value="">全部</option><option value="enabled">启用</option><option value="disabled">停用</option></select></label>
        <label><span className="field-label">计划区间起</span><input className="input" type="date" value={filters.startDate} onChange={event => setFilters({ ...filters, startDate: event.target.value })} /></label>
        <label><span className="field-label">计划区间止</span><input className="input" type="date" value={filters.endDate} onChange={event => setFilters({ ...filters, endDate: event.target.value })} /></label>
      </div>}
    </div>
    {rows.length ? <div className="table-shell mt-4"><table className="data-table min-w-[900px]">
      <thead><tr><th>检查项</th><th>阶段 / 模块</th><th>负责人</th><th>计划</th><th>状态</th><th>附件</th><th>操作</th></tr></thead>
      <tbody>{rows.map(item => <tr key={item.id} className={idOf(selectedItem?.id) === idOf(item.id) ? 'bg-primary/10' : undefined}>
        <td className="max-w-[270px]"><button className="block max-w-full truncate text-left font-semibold text-primary" type="button" disabled={saving} title={item.title} onClick={() => open(item.id)}>{item.title}</button>{item.acceptanceCriteria && <div className="mt-1 truncate text-xs text-ink-muted" title={item.acceptanceCriteria}>{item.acceptanceCriteria}</div>}</td>
        <td className="max-w-[160px]"><div className="truncate">{phaseById.get(idOf(item.projectPhaseId))?.name ?? '-'}</div><div className="truncate text-xs text-ink-muted">{moduleById.get(idOf(item.moduleId))?.name ?? '-'}</div></td>
        <td><OwnerAvatarStack owners={ownersOfItem(item)} maxVisible={3} /></td>
        <td className="whitespace-nowrap text-xs"><div>{formatDate(item.plannedStartDate)}</div><div className="text-ink-muted">至 {formatDate(item.plannedEndDate)}</div></td>
        <td><StatusPill status={item.status} />{item.isActive === false && <div className="mt-1 text-xs text-ink-muted">已停用</div>}</td>
        <td><button className="btn btn-ghost btn--sm" type="button" disabled={saving} aria-label={`${item.title} 的附件`} onClick={() => open(item.id, 'attachments')}><Paperclip className="h-4 w-4" />{item.attachmentCount ?? item.attachments.length}</button></td>
        <td><button className="btn btn-ghost btn--sm whitespace-nowrap" type="button" disabled={saving} aria-label={`查看检查项 ${item.title}`} onClick={() => open(item.id)}>{canWrite ? '查看 / 编辑' : '查看'}</button></td>
      </tr>)}</tbody>
    </table></div> : <div className="mt-4"><EmptyState message={!project ? '请先选择项目。' : list.loading ? '正在加载检查项…' : list.error ? '检查项列表暂不可用。' : '当前筛选下暂无检查项。'} /></div>}
    {list.error && <div role="alert" className="mt-3 text-danger">{list.error}<button className="btn btn-ghost btn--sm" type="button" onClick={list.refresh}>重试</button></div>}
    <Pagination page={list.page} pageSize={list.pageSize} count={list.data?.count ?? 0} loading={list.loading || saving} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
    <RelatedDraftContext.Provider key={editor.sessionKey} value={editor.registerRelatedDraft}>
      <SideDrawer open={editor.open} title={selectedItem ? `检查项 · ${selectedItem.title}` : editor.loading || editor.error ? '检查项详情' : '新增检查项'} size="xl" saving={saving} onClose={editor.close}
        footer={<><span className="mr-auto text-xs text-ink-muted">{editor.relatedDirty ? '有附件说明或待上传文件尚未提交' : editor.dirty ? '基本信息有未保存修改' : selectedItem ? '已保存' : '保存后归档到当前项目'}</span><button className="btn btn-ghost btn--sm" type="button" disabled={saving} onClick={editor.close}>关闭</button>{canWrite && <button className="btn btn-primary btn--sm" type="button" disabled={saving || editor.loading || !!editor.error || !!validation} onClick={() => void save()}>{saving ? '处理中…' : '保存检查项'}</button>}</>}
      >
        {editor.loading ? <p role="status">正在加载详情…</p> : editor.error ? <div role="alert" className="text-danger">{editor.error}<button className="btn btn-ghost btn--sm" type="button" onClick={() => void editor.retry()}>重试</button></div> : <>
          <nav className="mb-4 flex flex-wrap gap-2 border-b border-outline pb-3" aria-label="检查项详情分区">{[['basic', '基本信息'], ['attachments', `附件 (${selectedItem?.attachments.length ?? 0})`], ['audit', '操作记录']].map(([value, label]) => <button key={value} type="button" className={`btn btn--sm ${tab === value ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</button>)}</nav>
          {message && <p className="mb-3 text-sm" role="status">{message}</p>}
          <div hidden={tab !== 'basic'}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2"><span className="field-label">检查项标题 *</span><input className="input" aria-label="检查项标题" value={draft.title} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
              <label><span className="field-label">阶段 *</span><select className="select" aria-label="检查项所属阶段" value={draft.projectPhaseId} disabled={!canWrite || saving} onChange={event => { const phase = phaseById.get(event.target.value); setDraft({ ...draft, projectPhaseId: event.target.value, ...(!selectedItem ? { plannedStartDate: dateInputValue(phase?.plannedStartDate), plannedEndDate: dateInputValue(phase?.plannedEndDate) } : {}) }); }}><option value="" disabled>选择阶段</option>{bySequence(phases).filter(phase => phase.isActive !== false || idOf(phase.id) === draft.projectPhaseId).map(phase => <option key={phase.id} value={idOf(phase.id)}>{phase.name}{phase.isActive === false ? '（已停用）' : ''}</option>)}</select></label>
              <label><span className="field-label">模块 *</span><select className="select" aria-label="检查项所属模块" value={draft.moduleId} disabled={!canWrite || saving} onChange={event => { const module = moduleById.get(event.target.value); setDraft({ ...draft, moduleId: event.target.value, ...(!selectedItem ? { owners: module ? ownersOfModule(module) : [] } : {}) }); }}><option value="" disabled>选择模块</option>{orderedModules.map(module => <option key={module.id} value={idOf(module.id)}>{module.name}</option>)}</select></label>
              <label><span className="field-label">计划开始 *</span><input className="input" type="date" value={draft.plannedStartDate} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, plannedStartDate: event.target.value })} /></label>
              <label><span className="field-label">计划结束 *</span><input className="input" type="date" value={draft.plannedEndDate} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, plannedEndDate: event.target.value })} /></label>
              <label><span className="field-label">状态</span><select className="select" aria-label="检查项状态" value={draft.status} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, status: event.target.value })}>{statusOptionValues([...CHECK_ITEM_STATUS_OPTIONS, draft.status]).map(status => <option key={status} value={status}>{STATUS_LABEL[status] ?? status}</option>)}</select></label>
              <label><span className="field-label">启用状态</span><select className="select" aria-label="检查项启用状态" value={String(draft.isActive)} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, isActive: event.target.value === 'true' })}><option value="true">启用</option><option value="false">停用</option></select></label>
              <label className="sm:col-span-2"><span className="field-label">标签</span><input className="input" value={draft.tags} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, tags: event.target.value })} placeholder="逗号分隔" /></label>
              <label className="sm:col-span-2"><span className="field-label">描述</span><textarea className="input min-h-24" value={draft.description} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
              <label className="sm:col-span-2"><span className="field-label">检查要求</span><textarea className="input min-h-24" value={draft.acceptanceCriteria} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, acceptanceCriteria: event.target.value })} /></label>
              <div className="sm:col-span-2"><span className="field-label">负责人（IDaaS）</span><OwnerListEditor owners={draft.owners} ownerCandidates={ownerCandidates} canWrite={canWrite && !saving} candidateLabel="检查项 IDaaS 负责人" onChange={next => setDraft({ ...draft, ...next })} /></div>
            </div>
            {canWrite && validation && <p className="mt-3 text-sm text-warning">{validation}</p>}
            {canWrite && selectedItem && <div className="mt-5 border-t border-outline pt-3">{selectedItem.canDelete ? <button className="btn btn-ghost btn--sm text-danger" type="button" disabled={saving} onClick={() => void remove()}><Trash2 className="h-4 w-4" />删除检查项</button> : <p className="text-xs text-ink-muted">该检查项受删除保护，如不再使用请设置为停用。</p>}</div>}
          </div>
          <div hidden={tab !== 'attachments'}><CheckItemAttachmentsEditor item={selectedItem} active={tab === 'attachments'} canWrite={canWrite} saving={saving} validation={validation} onUpload={upload} onDownload={onDownloadAttachment} onDelete={attachment => mutateAsset(() => deleteAttachment(attachment.id))} onCaption={(attachment, caption) => mutateAsset(() => updateAttachmentMetadata(attachment.id, { ...(attachment.metadata ?? {}), caption }))} /></div>
          <div hidden={tab !== 'audit'}><ObjectAuditHistory objectType="CheckItem" objectId={selectedItem?.id} revision={auditRevision} /></div>
        </>}
      </SideDrawer>
    </RelatedDraftContext.Provider>
  </section>;
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
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <MetricCard label="Owner" value={report.owner} detail="责任人" />
            <MetricCard label="Due date" value={formatDate(report.dueDate)} detail="关闭日期" />
            <MetricCard label="Status" value={report.status} detail={`更新于 ${formatDate(report.updatedAt)}`} />
          </div>
          <div className="mt-4">
            <CollisionReadonlyCanvas report={report} />
          </div>
        </section>
      ))}
    </div>
  );
}

type KeyIssueDraft = {
  projectPhaseId: string;
  moduleId: string;
  checkItemId: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  supplier: string;
  ownerName: string;
  confirmer: string;
  dueDate: string;
  countermeasure: string;
  currentProgress: string;
  remark: string;
  problemPhotoBucketName: string;
  problemPhotoObjectKey: string;
  imageCaptions: Record<string, string>;
};

type CollisionDraft = {
  projectPhaseId: string;
  title: string;
  reportDate: string;
  status: string;
  riskLevel: string;
  summary: string;
  owner: string;
  dueDate: string;
  problemDefinition: string;
  parts: string;
  vehicleModel: string;
  failureFrequency: string;
  responsibilityArea: string;
  progress: string;
  remark: string;
  source: string;
  problemDescription: string;
  diagnosisRepair: string;
  processAnalysis: string;
  supportNeeded: string;
  impact: string;
  containment: string;
  rootCause: string;
  rootCauseConclusion: string;
  correctiveAction: string;
  preventiveAction: string;
  validation: string;
  approvalSignoff: string;
  imageObjectKey: string;
  imageCaptions: Record<string, string>;
};

const KEY_ISSUE_FIELD_LABELS: Record<string, string> = {
  description: '问题描述',
  countermeasure: '对策',
  currentProgress: '进展',
  remark: '备注'
};

const COLLISION_FIELD_LABELS: Record<string, string> = {
  problemDefinition: '问题定义',
  parts: '涉及零件',
  vehicleModel: '车型 / 涉及车辆',
  failureFrequency: '故障频次',
  responsibilityArea: '责任区域',
  progress: '问题进展',
  remark: '备注',
  source: '信息来源',
  problemDescription: '失效模式&工况',
  diagnosisRepair: '诊断维修',
  processAnalysis: '过程分析',
  summary: '摘要',
  rootCauseConclusion: '根本原因',
  containment: '临时/拦截措施',
  correctiveAction: '长期措施/追溯',
  impact: '影响',
  preventiveAction: '预防',
  validation: '验证',
  approvalSignoff: '备注 / 签核',
  supportNeeded: '所需支持'
};

const COLLISION_SLOT_SECTION_KEYS: Record<string, string> = {
  problemDefinition: 'summary',
  parts: 'summary',
  vehicleModel: 'summary',
  failureFrequency: 'summary',
  responsibilityArea: 'summary',
  owner: 'summary',
  progress: 'summary',
  remark: 'summary',
  source: 'section_1',
  problemDescription: 'section_1',
  diagnosisRepair: 'section_2',
  processAnalysis: 'section_3',
  rootCause: 'section_3',
  rootCauseConclusion: 'section_3',
  summary: 'section_3',
  containment: 'section_4',
  correctiveAction: 'section_4',
  impact: 'section_4',
  preventiveAction: 'section_4',
  validation: 'section_4',
  approvalSignoff: 'signoff',
  supportNeeded: 'section_5'
};

const collisionSectionKey = (slotKey: string, fallback = 'summary') =>
  COLLISION_SLOT_SECTION_KEYS[slotKey] ?? fallback;

const collisionBlockCaption = (block: CollisionReportBlock, attachment?: Attachment | null) =>
  (attachment ? attachmentCaption(attachment) : '') || String(block.caption ?? '').trim();

const collisionBlocksForSlot = (
  report: CollisionReport | null,
  sectionKey: string,
  slotKey: string
) =>
  (report?.blocks ?? [])
    .filter(block =>
      ['image', 'file'].includes(block.blockType) &&
      block.slotKey === slotKey &&
      (!block.sectionKey || block.sectionKey === sectionKey)
    )
    .map(block => ({
      ...block,
      attachmentDetail:
        block.attachmentDetail ??
        report?.attachments.find(attachment => idOf(attachment.id) === idOf(block.attachment)) ??
        null
    }))
    .sort((left, right) => left.sortOrder - right.sortOrder);

const dataUrlToImageFile = async (dataUrl: string, fieldKey: string, index: number) => {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
  if (!match) return null;
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const extension = (match[1].split('/')[1] || 'png').replace('jpeg', 'jpg');
  return new File([blob], `${fieldKey}-${Date.now()}-${index + 1}.${extension}`, { type: blob.type || match[1] });
};

const clipboardHasImagePayload = (clipboardData: DataTransfer) =>
  Array.from(clipboardData.files).some(file => file.type.startsWith('image/')) ||
  Array.from(clipboardData.items).some(item => item.kind === 'file' && item.type.startsWith('image/')) ||
  (clipboardData.getData('text/html') || '').includes('data:image/') ||
  (clipboardData.getData('text/plain') || '').trim().startsWith('data:image/');

const pastedImageFilesFromClipboard = async (clipboardData: DataTransfer, fieldKey: string) => {
  const files: File[] = [];
  const seen = new Set<string>();
  const addFile = (file: File | null, index: number) => {
    if (!file || !file.type.startsWith('image/')) return;
    const fingerprint = `${file.name}:${file.type}:${file.size}`;
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    const extension = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
    const fileName = file.name && !/^image\.(png|jpe?g|gif|webp)$/i.test(file.name)
      ? file.name
      : `${fieldKey}-${Date.now()}-${index + 1}.${extension}`;
    files.push(new File([file], fileName, { type: file.type }));
  };

  Array.from(clipboardData.files).forEach((file, index) => addFile(file, index));
  Array.from(clipboardData.items).forEach((item, index) => {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) return;
    addFile(item.getAsFile(), index);
  });

  const html = clipboardData.getData('text/html') || '';
  const plain = clipboardData.getData('text/plain') || '';
  const dataUrls = [
    ...Array.from(html.matchAll(/<img[^>]+src=["'](data:image\/[^"']+)["']/gi)).map(match => match[1]),
    ...(plain.startsWith('data:image/') ? [plain.trim()] : [])
  ];
  for (const [index, dataUrl] of dataUrls.entries()) {
    const file = await dataUrlToImageFile(dataUrl, fieldKey, files.length + index);
    addFile(file, files.length + index);
  }
  return files;
};

const issueAttachmentSlot = (attachment: Attachment) => {
  const metadata = attachment.metadata ?? {};
  return String(metadata.key_issue_slot ?? metadata.keyIssueSlot ?? 'description');
};

const emptyKeyIssueDraft = (phases: ProjectPhase[]): KeyIssueDraft => ({
  projectPhaseId: idOf(activePhasesOf(phases)[0]?.id),
  moduleId: '',
  checkItemId: '',
  title: '',
  description: '',
  severity: 'medium',
  status: 'open',
  supplier: '',
  ownerName: '',
  confirmer: '',
  dueDate: '',
  countermeasure: '',
  currentProgress: '',
  remark: '',
  problemPhotoBucketName: '',
  problemPhotoObjectKey: '',
  imageCaptions: {}
});

const keyIssueDraftFromIssue = (issue: KeyIssue | null, phases: ProjectPhase[]): KeyIssueDraft =>
  issue
    ? {
        projectPhaseId: idOf(issue.projectPhaseId),
        moduleId: idOf(issue.moduleId),
        checkItemId: idOf(issue.checkItemId),
        title: issue.title,
        description: issue.description,
        severity: issue.severity,
        status: issue.status,
        supplier: issue.supplier ?? '',
        ownerName: issue.ownerName === '未设置' ? '' : issue.ownerName,
        confirmer: issue.confirmer ?? '',
        dueDate: dateInputValue(issue.dueDate),
        countermeasure: issue.countermeasure ?? '',
        currentProgress: issue.currentProgress ?? '',
        remark: issue.remark ?? '',
        problemPhotoBucketName: issue.problemPhotoBucketName ?? '',
        problemPhotoObjectKey: issue.problemPhotoObjectKey ?? '',
        imageCaptions: issue.imageCaptions ?? {}
      }
    : emptyKeyIssueDraft(phases);

const emptyCollisionDraft = (phases: ProjectPhase[]): CollisionDraft => ({
  projectPhaseId: idOf(activePhasesOf(phases)[0]?.id),
  title: '',
  reportDate: formatLocalDate(new Date()),
  status: 'draft',
  riskLevel: 'medium',
  summary: '',
  owner: '',
  dueDate: '',
  problemDefinition: '',
  parts: '',
  vehicleModel: '',
  failureFrequency: '',
  responsibilityArea: '',
  progress: '',
  remark: '',
  source: '',
  problemDescription: '',
  diagnosisRepair: '',
  processAnalysis: '',
  supportNeeded: '',
  impact: '',
  containment: '',
  rootCause: '',
  rootCauseConclusion: '',
  correctiveAction: '',
  preventiveAction: '',
  validation: '',
  approvalSignoff: '',
  imageObjectKey: '',
  imageCaptions: {}
});

const collisionDraftFromReport = (report: CollisionReport | null, phases: ProjectPhase[]): CollisionDraft =>
  report
    ? {
        projectPhaseId: idOf(report.projectPhaseId),
        title: report.title,
        reportDate: dateInputValue(report.reportDate),
        status: report.status,
        riskLevel: report.riskLevel,
        summary: report.summary,
        owner: report.owner === '未设置' ? '' : report.owner,
        dueDate: dateInputValue(report.dueDate),
        problemDefinition: report.problemDefinition ?? '',
        parts: report.parts ?? '',
        vehicleModel: report.vehicleModel ?? '',
        failureFrequency: report.failureFrequency ?? '',
        responsibilityArea: report.responsibilityArea ?? '',
        progress: report.progress ?? '',
        remark: report.remark ?? '',
        source: report.source ?? '',
        problemDescription: report.problemDescription ?? '',
        diagnosisRepair: report.diagnosisRepair ?? '',
        processAnalysis: report.processAnalysis ?? '',
        supportNeeded: report.supportNeeded ?? '',
        impact: report.impact ?? '',
        containment: report.containment ?? '',
        rootCause: report.rootCause ?? '',
        rootCauseConclusion: report.rootCauseConclusion ?? '',
        correctiveAction: report.correctiveAction ?? '',
        preventiveAction: report.preventiveAction ?? '',
        validation: report.validation ?? '',
        approvalSignoff: report.approvalSignoff ?? '',
        imageObjectKey: report.imageObjectKey ?? '',
        imageCaptions: report.imageCaptions ?? {}
      }
    : emptyCollisionDraft(phases);

const collisionDraftWithLatestFieldValue = (
  current: CollisionDraft,
  fieldKey: string,
  fieldValue: string
): CollisionDraft => {
  if (!(fieldKey in current)) return current;
  const nextDraft = { ...current, [fieldKey]: fieldValue } as CollisionDraft;
  if (fieldKey === 'rootCauseConclusion') {
    nextDraft.rootCause = fieldValue;
  }
  return nextDraft;
};

const collisionTextareaRows = (value: string, large = false) => {
  const minRows = large ? 14 : 5;
  const estimatedRows = (value || '')
    .split('\n')
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / 38)), 0);
  return Math.max(minRows, estimatedRows + 1);
};

function IssuesCrudView({
  project,
  phases,
  modules,
  checkItems,
  canWrite,
  workspaceLoading = false,
  onCreateIssue,
  onUpdateIssue,
  onDeleteIssue,
  onImportCsv,
  onExportCsv,
  onUploadIssueAttachment,
  onDownloadAttachment,
  onDeleteAttachment,
  onUpdateAttachmentCaption
}: {
  project: Project | null;
  phases: ProjectPhase[];
  modules: InspectionModule[];
  checkItems: CheckItem[];
  canWrite: boolean;
  workspaceLoading?: boolean;
  onCreateIssue: (draft: KeyIssueDraft) => Promise<KeyIssue | null>;
  onUpdateIssue: (issue: KeyIssue, draft: KeyIssueDraft) => Promise<KeyIssue | null>;
  onDeleteIssue: (issue: KeyIssue) => Promise<void>;
  onImportCsv: (file: File) => Promise<void>;
  onExportCsv: () => Promise<void>;
  onUploadIssueAttachment: (issue: KeyIssue, file: File, metadata?: Record<string, unknown>) => Promise<void>;
  onDownloadAttachment: AttachmentDownloadHandler;
  onDeleteAttachment: (attachment: Attachment) => Promise<void>;
  onUpdateAttachmentCaption: (attachment: Attachment, caption: string) => Promise<void>;
}) {
  const [filters, setFilters] = useState<SearchFilterState>(EMPTY_FILTERS);
  const [mutationSaving, setSaving] = useState(false);
  const saving = mutationSaving || workspaceLoading;
  const [message, setMessage] = useState('');
  const [auditRevision, setAuditRevision] = useState(0);
  const editor = useRecordEditor<KeyIssue, KeyIssueDraft>(record => keyIssueDraftFromIssue(record, phases), fetchKeyIssue, saving);
  const { draft, setDraft, record: selectedIssue } = editor;
  const selectedIsNew = !selectedIssue;
  const list = usePaginatedList(listKeyIssues, {
    project: project?.id, phase: filters.phaseId, status: filters.status, severity: filters.severity,
    owner: filters.owner, q: filters.keyword, start_date: filters.startDate, end_date: filters.endDate
  }, !!project);
  const statusOptions = ['open', 'in_progress', 'containment', 'waiting_confirm', 'hold', 'resolved', 'closed'];
  const severityOptions = ['critical', 'high', 'medium', 'low'];
  const filteredIssues = list.data?.results ?? [];
  const visibleCheckItems = checkItems.filter(item => !draft.projectPhaseId || idOf(item.projectPhaseId) === draft.projectPhaseId);
  const [activeIssueFieldKey, setActiveIssueFieldKey] = useState('description');
  const issueAttachments = selectedIssue?.attachments ?? [];
  const attachmentsForField = (fieldKey: string) =>
    issueAttachments.filter(attachment => issueAttachmentSlot(attachment) === fieldKey);

  const runMutation = async (action: () => Promise<unknown>, successMessage: string) => {
    setSaving(true);
    setMessage('');
    try {
      await action();
      setMessage(successMessage);
      list.refresh();
      setAuditRevision(value => value + 1);
    } catch (err) {
      setMessage(mutationErrorMessage(err, '操作失败，请重试。'));
    } finally {
      setSaving(false);
    }
  };

  const saveIssue = async () => {
    const snapshot = draft;
    const saved = selectedIssue ? await onUpdateIssue(selectedIssue, snapshot) : await onCreateIssue(snapshot);
    if (!saved) throw new Error('未能保存重点问题。');
    editor.accept(saved, snapshot);
  };

  const updateAssets = async (action: () => Promise<void>) => {
    setSaving(true);
    try {
      await action();
      list.refresh();
      setAuditRevision(value => value + 1);
      await editor.refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !canWrite) return;
    await runMutation(() => onImportCsv(file), '重点问题 CSV 已导入。');
  };

  const ensureIssueForAttachmentUpload = async () => {
    const snapshot = draft;
    if (!snapshot.title.trim()) throw new Error('填写标题后可上传附件；首次上传将创建并保存记录。');
    const saved = selectedIssue ? await onUpdateIssue(selectedIssue, snapshot) : await onCreateIssue(snapshot);
    if (!saved) throw new Error('正文保存失败，尚未上传附件。');
    editor.accept(saved, snapshot);
    return saved;
  };

  const uploadIssueFieldAttachments = async (
    fieldKey: string,
    fieldLabel: string,
    files: File[],
    source: string
  ) => {
    if (!canWrite || saving || !files.length) return;
    if (!draft.title.trim()) {
      setMessage('填写标题后可上传附件。');
      return;
    }
    setSaving(true);
    setMessage('正在保存正文并上传附件…');
    let targetIssue: KeyIssue | null = null;
    let uploaded = 0;
    try {
      targetIssue = await ensureIssueForAttachmentUpload();
      for (const file of files) {
        await onUploadIssueAttachment(targetIssue, file, {
          key_issue_slot: fieldKey,
          key_issue_slot_label: KEY_ISSUE_FIELD_LABELS[fieldKey] ?? fieldLabel,
          source
        });
        uploaded += 1;
      }
      setMessage(`${fieldLabel}已上传 ${uploaded} 个附件。`);
    } catch (err) {
      setMessage(`${targetIssue ? `正文已保存，附件已上传 ${uploaded}/${files.length} 个；其余未完成。` : ''}${mutationErrorMessage(err, '附件上传失败。')}`);
    } finally {
      if (targetIssue) {
        list.refresh();
        setAuditRevision(value => value + 1);
        try {
          await editor.refresh(targetIssue);
        } catch (err) {
          setMessage(current => `${current} 详情刷新失败：${mutationErrorMessage(err, '回读失败。')} 请重新打开记录核实附件，避免重复上传。`);
        }
      }
      setSaving(false);
    }
  };

  const handleIssueFieldPaste = async (
    fieldKey: string,
    fieldLabel: string,
    event: ClipboardEvent<HTMLElement>
  ) => {
    if (!canWrite || saving || !clipboardHasImagePayload(event.clipboardData)) return;
    event.preventDefault();
    const files = await pastedImageFilesFromClipboard(event.clipboardData, fieldKey);
    if (!files.length) return;
    if (!draft.title.trim()) {
      setMessage('填写标题后可粘贴图片。');
      return;
    }
    await uploadIssueFieldAttachments(fieldKey, fieldLabel, files, 'clipboard_paste');
  };

  const renderIssueFieldAssets = (fieldKey: string, fieldLabel: string) => {
    const fieldAttachments = attachmentsForField(fieldKey);
    if (!fieldAttachments.length && !canWrite) return null;
    const uploadDisabled = !canWrite || saving || !draft.title.trim();
    return (
      <div className="issue-field-assets">
        {canWrite ? (
          <div className="issue-field-toolbar">
            <label className={`btn btn-ghost btn--sm ${uploadDisabled ? 'pointer-events-none opacity-60' : ''}`}>
              <Paperclip className="h-4 w-4" />
              上传附件
              <input
                className="hidden"
                type="file"
                multiple
                disabled={uploadDisabled}
                onChange={event => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = '';
                  void uploadIssueFieldAttachments(fieldKey, fieldLabel, files, 'file_upload');
                }}
              />
            </label>
            {uploadDisabled && !draft.title.trim() ? (
              <span className="text-xs text-ink-muted">填写标题后可上传附件</span>
            ) : null}
          </div>
        ) : null}
        {fieldAttachments.length ? (
          <AttachmentList
            attachments={fieldAttachments}
            canDownload={canWrite}
            canDelete={canWrite && !saving}
            canEditCaption={canWrite && !saving}
            onDownloadAttachment={onDownloadAttachment}
            onDeleteAttachment={attachment => updateAssets(() => onDeleteAttachment(attachment))}
            onUpdateAttachmentCaption={(attachment, caption) => updateAssets(() => onUpdateAttachmentCaption(attachment, caption))}
            emptyMessage={`${fieldLabel}暂无附件`}
          />
        ) : null}
      </div>
    );
  };

  const renderIssueTextArea = (
    fieldKey: string,
    label: string,
    value: string,
    onChange: (value: string) => void
  ) => (
    <div className="md:col-span-2">
      <label>
        <span className="field-label">{label}</span>
        <textarea
          className="input min-h-20"
          value={value}
          disabled={!canWrite || saving}
          onFocus={() => setActiveIssueFieldKey(fieldKey)}
          onChange={event => onChange(event.target.value)}
          onPaste={event => {
            event.stopPropagation();
            void handleIssueFieldPaste(fieldKey, label, event);
          }}
        />
      </label>
      {renderIssueFieldAssets(fieldKey, label)}
    </div>
  );

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="kicker">Key Issues</p>
          <h2 className="text-xl font-semibold">重点问题</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip">共 {list.data?.count ?? 0} 条</span>
          <button className="btn btn-ghost btn--sm" type="button" disabled={!canWrite || !project || saving} onClick={() => void runMutation(onExportCsv, '重点问题 CSV 已导出。')}>
            <FileDown className="h-4 w-4" />
            导出 CSV
          </button>
          <label className={`btn btn-ghost btn--sm ${!canWrite || !project || saving ? 'pointer-events-none opacity-60' : ''}`}>
            <FileText className="h-4 w-4" />
            导入 CSV
            <input className="hidden" type="file" accept=".csv,text/csv" disabled={!canWrite || !project || saving} onChange={event => void handleImport(event)} />
          </label>
          <button className="btn btn-primary btn--sm" type="button" disabled={!canWrite || !project || saving} onClick={() => { setMessage(''); void editor.openRecord(); }}>
            <Plus className="h-4 w-4" />
            新增
          </button>
        </div>
      </div>
      <ReadOnlyNotice canWrite={canWrite} />
      {message ? <div className="mt-3 text-sm text-success">{message}</div> : null}
      <div className="mt-4">
        <FilterShell>
          <label className="xl:col-span-2">
            <span className="field-label">关键字</span>
            <input className="input" value={filters.keyword} onChange={event => setFilters({ ...filters, keyword: event.target.value })} placeholder="问题、对策、供应商" />
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
            <input className="input" value={filters.owner} onChange={event => setFilters({ ...filters, owner: event.target.value })} placeholder="负责人" />
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
      {filteredIssues.length ? (
        <div className="table-shell mt-4">
          <table className="data-table min-w-[1320px]">
            <thead>
              <tr>
                <th>阶段</th>
                <th>模块</th>
                <th>检查项</th>
                <th>标题/描述</th>
                <th>严重度</th>
                <th>状态</th>
                <th>供应商</th>
                <th>负责人/确认人</th>
                <th>截止</th>
                <th>进展</th>
                <th>附件</th>
              </tr>
            </thead>
            <tbody>
              {filteredIssues.map(issue => {
                const phase = phases.find(item => idOf(item.id) === idOf(issue.projectPhaseId));
                const module = modules.find(item => idOf(item.id) === idOf(issue.moduleId));
                const checkItem = checkItems.find(item => idOf(item.id) === idOf(issue.checkItemId));
                const selected = idOf(issue.id) === idOf(selectedIssue?.id);
                return (
                  <tr key={issue.id} className={`cursor-pointer transition ${selected ? 'bg-primary/10' : 'hover:bg-surface-soft'}`} onClick={() => { setMessage(''); void editor.openRecord(issue.id); }}>
                    <td>{issue.phaseName || phase?.name || '-'}</td>
                    <td>{issue.moduleName || module?.name || '-'}</td>
                    <td className="max-w-[220px]">{issue.checkItemTitle || checkItem?.title || '-'}</td>
                    <td className="max-w-[280px]">
                      <button type="button" className="text-left font-semibold text-primary" disabled={saving} onClick={event => { event.stopPropagation(); setMessage(''); void editor.openRecord(issue.id); }}>{issue.title}</button>
                      <div className="mt-1 text-xs text-ink-muted">{issue.description || '-'}</div>
                    </td>
                    <td><StatusPill status={issue.severity} /></td>
                    <td><StatusPill status={issue.status} /></td>
                    <td>{issue.supplier || '-'}</td>
                    <td><div>{issue.ownerName || '-'}</div><div className="text-xs text-ink-muted">{issue.confirmer || '-'}</div></td>
                    <td>{formatDate(issue.dueDate)}</td>
                    <td className="max-w-[180px]">{issue.currentProgress || issue.status}</td>
                    <td>{(issue.attachments ?? []).length ? `${issue.attachments.length} 个` : issue.problemPhotoObjectKey || issue.problemPhoto ? '已配置' : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <div className="mt-4"><EmptyState message={list.loading ? '正在加载重点问题…' : '当前筛选下暂无重点问题。'} /></div>}
      {list.error && <div role="alert" className="mt-3 text-danger">{list.error}<button className="btn btn-ghost btn--sm" onClick={list.refresh}>重试</button></div>}
      <Pagination page={list.page} pageSize={list.pageSize} count={list.data?.count ?? 0} loading={list.loading} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
      <RelatedDraftContext.Provider key={editor.sessionKey} value={editor.registerRelatedDraft}>
      <SideDrawer open={editor.open} title={selectedIsNew ? '新增重点问题' : `重点问题 · ${selectedIssue.title}`} size="xl" saving={saving} onClose={editor.close}
        footer={<>
          <span className="mr-auto text-xs text-ink-muted">{editor.relatedDirty ? '附件说明有未保存的修改，请在对应附件旁保存' : editor.dirty ? '有未保存的修改' : selectedIssue ? '已保存' : '首次上传附件会先保存记录'}</span>
          <button className="btn btn-ghost btn--sm" disabled={saving} onClick={editor.close}>关闭</button>
          <button className="btn btn-primary btn--sm" disabled={!canWrite || saving || editor.loading || !!editor.error || !draft.title.trim()} onClick={() => void runMutation(saveIssue, '重点问题已保存。')}>保存</button>
        </>}
      >
      {editor.loading ? <p role="status">正在加载详情…</p> : editor.error ? <div role="alert" className="text-danger">{editor.error}<button type="button" className="btn btn-ghost btn--sm" onClick={() => void editor.retry()}>重试</button></div> : <>
      {message && <div role="status" className="mb-3 text-sm">{message}</div>}
      <div
        className="rounded-lg border border-outline bg-surface-soft p-4"
        onPaste={event => {
          if (!event.defaultPrevented) {
            const fieldKey = activeIssueFieldKey || 'description';
            void handleIssueFieldPaste(fieldKey, KEY_ISSUE_FIELD_LABELS[fieldKey] ?? '问题描述', event);
          }
        }}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="kicker">{selectedIsNew ? 'Create' : 'Edit'}</p>
            <h3 className="text-lg font-semibold">{selectedIsNew ? '新增重点问题' : '编辑重点问题'}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-ghost btn--sm" type="button" disabled={!canWrite || saving || selectedIsNew || !selectedIssue} onClick={() => {
              if (selectedIssue && window.confirm(`确认删除重点问题「${selectedIssue.title}」？`)) {
                void runMutation(async () => { await onDeleteIssue(selectedIssue); editor.removed(); }, '重点问题已删除。');
              }
            }}>
              <Trash2 className="h-4 w-4" />
              删除
            </button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label><span className="field-label">阶段</span><select className="select" value={draft.projectPhaseId} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, projectPhaseId: event.target.value, checkItemId: '' })}><option value="">未关联</option>{activePhasesOf(phases).map(phase => <option key={phase.id} value={idOf(phase.id)}>{phase.name}</option>)}</select></label>
          <label><span className="field-label">模块</span><select className="select" value={draft.moduleId} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, moduleId: event.target.value })}><option value="">未关联</option>{modules.map(module => <option key={module.id} value={idOf(module.id)}>{module.name}</option>)}</select></label>
          <label className="xl:col-span-2"><span className="field-label">检查项</span><select className="select" value={draft.checkItemId} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, checkItemId: event.target.value })}><option value="">未关联</option>{visibleCheckItems.map(item => <option key={item.id} value={idOf(item.id)}>{item.title}</option>)}</select></label>
          <label className="md:col-span-2"><span className="field-label">标题</span><input className="input" value={draft.title} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
          <label><span className="field-label">严重度</span><select className="select" value={draft.severity} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, severity: event.target.value })}>{['critical', 'high', 'medium', 'low'].map(value => <option key={value} value={value}>{STATUS_LABEL[value] ?? value}</option>)}</select></label>
          <label><span className="field-label">状态</span><select className="select" value={draft.status} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, status: event.target.value })}>{statusOptions.map(value => <option key={value} value={value}>{STATUS_LABEL[value] ?? value}</option>)}</select></label>
          <div className="xl:col-span-4">
            {renderIssueTextArea('description', '描述', draft.description, value => setDraft({ ...draft, description: value }))}
          </div>
          <label><span className="field-label">供应商</span><input className="input" value={draft.supplier} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, supplier: event.target.value })} /></label>
          <label><span className="field-label">负责人</span><input className="input" value={draft.ownerName} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, ownerName: event.target.value })} /></label>
          <label><span className="field-label">确认人</span><input className="input" value={draft.confirmer} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, confirmer: event.target.value })} /></label>
          <label><span className="field-label">截止</span><input className="input" type="date" value={draft.dueDate} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, dueDate: event.target.value })} /></label>
          {renderIssueTextArea('countermeasure', '对策', draft.countermeasure, value => setDraft({ ...draft, countermeasure: value }))}
          {renderIssueTextArea('currentProgress', '进展', draft.currentProgress, value => setDraft({ ...draft, currentProgress: value }))}
          {renderIssueTextArea('remark', '备注', draft.remark, value => setDraft({ ...draft, remark: value }))}
        </div>
      </div>
      <ObjectAuditHistory objectType="KeyIssue" objectId={selectedIssue?.id} revision={auditRevision} />
      </>}
      </SideDrawer>
      </RelatedDraftContext.Provider>
    </section>
  );
}

function CollisionCrudView({
  project,
  phases,
  canWrite,
  workspaceLoading = false,
  onCreateReport,
  onUpdateReport,
  onDeleteReport,
  onImportCsv,
  onExportCsv,
  onDownloadTemplate,
  onExportExcel,
  onUploadReportAttachment,
  onDownloadAttachment,
  onDeleteAttachment,
  onUpdateAttachmentCaption
}: {
  project: Project | null;
  phases: ProjectPhase[];
  canWrite: boolean;
  workspaceLoading?: boolean;
  onCreateReport: (draft: CollisionDraft) => Promise<CollisionReport | null>;
  onUpdateReport: (report: CollisionReport, draft: CollisionDraft) => Promise<CollisionReport | null>;
  onDeleteReport: (report: CollisionReport) => Promise<void>;
  onImportCsv: (file: File) => Promise<void>;
  onExportCsv: () => Promise<void>;
  onDownloadTemplate: () => Promise<void>;
  onExportExcel: (report: CollisionReport) => Promise<void>;
  onUploadReportAttachment: (report: CollisionReport, file: File, metadata?: Record<string, unknown>) => Promise<void>;
  onDownloadAttachment: AttachmentDownloadHandler;
  onDeleteAttachment: (attachment: Attachment) => Promise<void>;
  onUpdateAttachmentCaption: (attachment: Attachment, caption: string) => Promise<void>;
}) {
  const [filters, setFilters] = useState<SearchFilterState>(EMPTY_FILTERS);
  const [mutationSaving, setSaving] = useState(false);
  const saving = mutationSaving || workspaceLoading;
  const [message, setMessage] = useState('');
  const [auditRevision, setAuditRevision] = useState(0);
  const editor = useRecordEditor<CollisionReport, CollisionDraft>(record => collisionDraftFromReport(record, phases), fetchCollisionReport, saving);
  const { draft, setDraft, record: selectedReport } = editor;
  const selectedIsNew = !selectedReport;
  const [sheetImagePreview, setSheetImagePreview] = useState<SheetImagePreviewState | null>(null);
  const collisionSheetRef = useRef<HTMLDivElement | null>(null);
  const statusOptions = ['draft', 'pending', 'in_progress', 'waiting_confirm', 'approved', 'rejected', 'signed', 'closed', 'hold', 'returned', 'voided'];
  const riskOptions = ['critical', 'high', 'medium', 'low'];
  const [pendingCollisionImages, setPendingCollisionImages] = useState<Array<CollisionPendingImage & { sectionKey: string; slotKey: string }>>([]);
  const pendingCollisionImageUrlsRef = useRef<Record<string, string>>({});
  const list = usePaginatedList(listCollisionReports, {
    project: project?.id, phase: filters.phaseId, status: filters.status, risk_level: filters.severity,
    owner: filters.owner, q: filters.keyword, start_date: filters.startDate, end_date: filters.endDate
  }, !!project);
  const filteredReports = list.data?.results ?? [];
  const [activeCollisionFieldKey, setActiveCollisionFieldKey] = useState('problemDescription');
  const [activeCollisionSectionKey, setActiveCollisionSectionKey] = useState('section_1');
  const blocksForField = (sectionKey: string, fieldKey: string) =>
    collisionBlocksForSlot(selectedReport, sectionKey, fieldKey);
  const pendingImagesForField = (sectionKey: string, fieldKey: string) =>
    pendingCollisionImages.filter(image => image.sectionKey === sectionKey && image.slotKey === fieldKey);
  const nextSortOrderForField = (sectionKey: string, fieldKey: string) => {
    const currentOrders = [
      ...blocksForField(sectionKey, fieldKey).map(block => block.sortOrder),
      ...pendingImagesForField(sectionKey, fieldKey).map(image => image.sortOrder)
    ];
    return currentOrders.length ? Math.max(...currentOrders) + 1 : 0;
  };
  const clearPendingImages = (ids: string[]) => {
    ids.forEach(id => {
      const url = pendingCollisionImageUrlsRef.current[id];
      if (url) URL.revokeObjectURL(url);
      delete pendingCollisionImageUrlsRef.current[id];
    });
    setPendingCollisionImages(current => current.filter(image => !ids.includes(image.id)));
  };

  useEffect(() => {
    if (!saving) {
      clearPendingImages(Object.keys(pendingCollisionImageUrlsRef.current));
      setSheetImagePreview(null);
    }
  }, [editor.open, editor.sessionKey]);

  useEffect(() => () => {
    Object.values(pendingCollisionImageUrlsRef.current).forEach(url => URL.revokeObjectURL(url));
    pendingCollisionImageUrlsRef.current = {};
  }, []);

  const runMutation = async (action: () => Promise<unknown>, successMessage: string) => {
    setSaving(true);
    setMessage('');
    try {
      await action();
      setMessage(successMessage);
      list.refresh();
      setAuditRevision(value => value + 1);
    } catch (err) {
      setMessage(mutationErrorMessage(err, '操作失败，请重试。'));
    } finally {
      setSaving(false);
    }
  };

  const saveReport = async () => {
    const snapshot = draft;
    const saved = selectedReport ? await onUpdateReport(selectedReport, snapshot) : await onCreateReport(snapshot);
    if (!saved) throw new Error('未能保存碰撞一页纸。');
    editor.accept(saved, snapshot);
  };

  const updateAssets = async (action: () => Promise<void>) => {
    setSaving(true);
    try {
      await action();
      list.refresh();
      setAuditRevision(value => value + 1);
      await editor.refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !canWrite) return;
    await runMutation(() => onImportCsv(file), '碰撞一页纸 CSV 已导入。');
  };

  const ensureReportForAttachmentUpload = async (draftSnapshot: CollisionDraft) => {
    if (!draftSnapshot.title.trim()) throw new Error('请先填写标题；上传附件时会自动创建草稿报告并绑定附件。');
    if (selectedReport && !selectedIsNew) return { report: selectedReport, created: false };
    const createdReport = await onCreateReport(draftSnapshot);
    if (!createdReport) throw new Error('正文保存失败，尚未上传附件。');
    editor.accept(createdReport, draftSnapshot);
    return { report: createdReport, created: true };
  };

  const uploadCollisionFieldAttachments = async (
    sectionKey: string,
    fieldKey: string,
    fieldLabel: string,
    files: File[],
    source: 'clipboard_paste' | 'file_upload',
    fieldValue?: string
  ) => {
    if (!canWrite || saving || !files.length) return;
    const draftSnapshot = fieldValue === undefined
      ? draft
      : collisionDraftWithLatestFieldValue(draft, fieldKey, fieldValue);
    if (!draftSnapshot.title.trim()) {
      setMessage('请先填写标题；上传附件时会自动创建草稿报告并绑定附件。');
      return;
    }
    const baseSortOrder = nextSortOrderForField(sectionKey, fieldKey);
    const uploadBatchId = Date.now();
    const pendingImages = files
      .map((file, index) => ({ file, index }))
      .filter(item => item.file.type.startsWith('image/'))
      .map(({ file, index }) => {
        const id = `${sectionKey}-${fieldKey}-${uploadBatchId}-${index}`;
        const previewUrl = URL.createObjectURL(file);
        pendingCollisionImageUrlsRef.current[id] = previewUrl;
        return {
          id,
          sectionKey,
          slotKey: fieldKey,
          fileName: file.name,
          previewUrl,
          sortOrder: baseSortOrder + index
        };
      });
    setPendingCollisionImages(current => [...current, ...pendingImages]);
    setSaving(true);
    setMessage(`${fieldLabel}文字正在保存，附件正在上传...`);
    let savedReport: CollisionReport | null = null;
    let uploaded = 0;
    const completedPendingIds = new Set<string>();
    try {
      const target = await ensureReportForAttachmentUpload(draftSnapshot);
      if (target.created) savedReport = target.report;
      else {
        const saved = await onUpdateReport(target.report, draftSnapshot);
        if (!saved) throw new Error('正文保存失败，尚未上传附件。');
        savedReport = saved;
        editor.accept(saved, draftSnapshot);
      }
      for (const [index, file] of files.entries()) {
        await onUploadReportAttachment(savedReport, file, {
          section_key: sectionKey,
          collision_slot: fieldKey,
          collision_slot_label: COLLISION_FIELD_LABELS[fieldKey] ?? fieldLabel,
          caption: '',
          sort_order: baseSortOrder + index,
          source
        });
        uploaded += 1;
        completedPendingIds.add(`${sectionKey}-${fieldKey}-${uploadBatchId}-${index}`);
      }
      setMessage(`${target.created ? '已先创建草稿报告，' : ''}${fieldLabel}已上传 ${uploaded} 个附件。`);
    } catch (err) {
      setPendingCollisionImages(current =>
        current.map(image =>
          pendingImages.some(item => item.id === image.id) && !completedPendingIds.has(image.id)
            ? { ...image, error: `未完成：${mutationErrorMessage(err, '上传失败')}` }
            : image
        )
      );
      setMessage(`${savedReport ? `正文已保存，附件已上传 ${uploaded}/${files.length} 个；其余未完成。` : ''}${mutationErrorMessage(err, '一页纸附件上传失败。')}`);
    } finally {
      clearPendingImages([...completedPendingIds]);
      if (savedReport) {
        list.refresh();
        setAuditRevision(value => value + 1);
        try {
          await editor.refresh(savedReport);
        } catch (err) {
          setMessage(current => `${current} 详情刷新失败：${mutationErrorMessage(err, '回读失败。')} 请重新打开记录核实附件，避免重复上传。`);
        }
      }
      setSaving(false);
    }
  };

  const handleCollisionFieldPaste = async (
    sectionKey: string,
    fieldKey: string,
    fieldLabel: string,
    event: ClipboardEvent<HTMLElement>,
    fieldValue?: string
  ) => {
    if (!canWrite || saving || !clipboardHasImagePayload(event.clipboardData)) return;
    event.preventDefault();
    const files = await pastedImageFilesFromClipboard(event.clipboardData, fieldKey);
    if (!files.length) return;
    await uploadCollisionFieldAttachments(sectionKey, fieldKey, fieldLabel, files, 'clipboard_paste', fieldValue);
  };

  const focusCollisionSlot = (sectionKey: string, fieldKey: string) => {
    setActiveCollisionSectionKey(sectionKey);
    setActiveCollisionFieldKey(fieldKey);
  };

  const handleGenerateSheetImage = async () => {
    const node = collisionSheetRef.current;
    const fileName = `${safeDownloadFileName(draft.title || selectedReport?.title || 'collision-one-pager', 'collision-one-pager')}.png`;
    if (!node) {
      setSheetImagePreview({ fileName, loading: false, error: '一页纸画布尚未渲染，无法生成图片。' });
      return;
    }

    setSheetImagePreview({ fileName, loading: true });
    node.classList.add('is-capturing-image');
    try {
      await waitForSheetCaptureAssets(node);
      const { width, height } = sheetCaptureSize(node);
      const baseOptions = {
        backgroundColor: '#ffffff',
        cacheBust: false,
        imagePlaceholder: SHEET_IMAGE_PLACEHOLDER,
        width,
        height,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          maxWidth: 'none',
          transform: 'none'
        },
        filter: shouldCaptureCollisionSheetNode
      };
      const capture = async (pixelRatio: number) => {
        const dataUrl = await toPng(node, { ...baseOptions, pixelRatio });
        if (!dataUrl || dataUrl === 'data:,') {
          throw new Error('浏览器返回空图片，请稍后重试。');
        }
        return dataUrl;
      };
      let url: string;
      try {
        url = await capture(sheetImagePixelRatio(width, height));
      } catch {
        url = await capture(1);
      }
      setSheetImagePreview({ fileName, url, loading: false });
    } catch (err) {
      setSheetImagePreview({
        fileName,
        loading: false,
        error: mutationErrorMessage(err, '一页纸图片生成失败。')
      });
    } finally {
      node.classList.remove('is-capturing-image');
    }
  };

  const renderSummaryField = (
    fieldKey: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: { wide?: boolean; multiline?: boolean; sectionKey?: string; allowImages?: boolean } = {}
  ) => {
    const sectionKey = options.sectionKey ?? 'summary';
    const allowImages = options.allowImages === true;
    const inputProps = {
      value,
      disabled: !canWrite || saving,
      onFocus: () => focusCollisionSlot(sectionKey, fieldKey),
      onPaste: (event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        event.stopPropagation();
        if (!allowImages && clipboardHasImagePayload(event.clipboardData)) {
          event.preventDefault();
          return;
        }
        if (allowImages) {
          void handleCollisionFieldPaste(sectionKey, fieldKey, label, event, event.currentTarget.value);
        }
      }
    };
    return (
      <div className={`${options.wide ? 'is-wide' : ''} ${allowImages ? 'has-paste-assets' : ''} collision-summary-field`}>
        <span>{label}</span>
        {options.multiline ? (
          <textarea {...inputProps} onChange={event => onChange(event.target.value)} />
        ) : (
          <input {...inputProps} onChange={event => onChange(event.target.value)} />
        )}
        {allowImages ? (
          <CollisionBlockGallery
            blocks={blocksForField(sectionKey, fieldKey)}
            pendingImages={pendingImagesForField(sectionKey, fieldKey)}
            canWrite={canWrite && !saving}
            canDownload={canWrite}
            onDownloadAttachment={onDownloadAttachment}
            onDeleteAttachment={attachment => updateAssets(() => onDeleteAttachment(attachment))}
            onUpdateAttachmentCaption={(attachment, caption) => updateAssets(() => onUpdateAttachmentCaption(attachment, caption))}
            onFocus={() => focusCollisionSlot(sectionKey, fieldKey)}
            onPaste={event => {
              event.stopPropagation();
              void handleCollisionFieldPaste(sectionKey, fieldKey, label, event);
            }}
            onUploadFiles={files => uploadCollisionFieldAttachments(sectionKey, fieldKey, label, files, 'file_upload', value)}
            emptyMessage={`${label}附件`}
          />
        ) : null}
      </div>
    );
  };

  const renderBodyField = (
    fieldKey: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: { large?: boolean; sectionKey?: string } = {}
  ) => {
    const sectionKey = options.sectionKey ?? collisionSectionKey(fieldKey, activeCollisionSectionKey);
    return (
      <div className={`collision-field ${options.large ? 'is-large' : ''}`}>
        <span>{label}</span>
        <textarea
          value={value}
          rows={collisionTextareaRows(value, options.large)}
          disabled={!canWrite || saving}
          onFocus={() => focusCollisionSlot(sectionKey, fieldKey)}
          onChange={event => onChange(event.target.value)}
          onPaste={event => {
            event.stopPropagation();
            void handleCollisionFieldPaste(sectionKey, fieldKey, label, event, event.currentTarget.value);
          }}
        />
        <CollisionBlockGallery
          blocks={blocksForField(sectionKey, fieldKey)}
          pendingImages={pendingImagesForField(sectionKey, fieldKey)}
          canWrite={canWrite && !saving}
          canDownload={canWrite}
          onDownloadAttachment={onDownloadAttachment}
          onDeleteAttachment={attachment => updateAssets(() => onDeleteAttachment(attachment))}
          onUpdateAttachmentCaption={(attachment, caption) => updateAssets(() => onUpdateAttachmentCaption(attachment, caption))}
          onFocus={() => focusCollisionSlot(sectionKey, fieldKey)}
          onPaste={event => {
            event.stopPropagation();
            void handleCollisionFieldPaste(sectionKey, fieldKey, label, event);
          }}
          onUploadFiles={files => uploadCollisionFieldAttachments(sectionKey, fieldKey, label, files, 'file_upload', value)}
          emptyMessage={`${label}附件`}
        />
      </div>
    );
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="kicker">Collision One Pager</p>
          <h2 className="text-xl font-semibold">碰撞一页纸</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip">共 {list.data?.count ?? 0} 份</span>
          <button className="btn btn-ghost btn--sm" type="button" disabled={!canWrite || saving} onClick={() => void runMutation(onDownloadTemplate, '碰撞一页纸模板已下载。')}>
            <Download className="h-4 w-4" />
            下载模板
          </button>
          <button className="btn btn-ghost btn--sm" type="button" disabled={!canWrite || !project || saving} onClick={() => void runMutation(onExportCsv, '碰撞一页纸 CSV 已导出。')}>
            <FileDown className="h-4 w-4" />
            导出 CSV
          </button>
          <label className={`btn btn-ghost btn--sm ${!canWrite || !project || saving ? 'pointer-events-none opacity-60' : ''}`}>
            <FileText className="h-4 w-4" />
            导入 CSV
            <input className="hidden" type="file" accept=".csv,text/csv" disabled={!canWrite || !project || saving} onChange={event => void handleImport(event)} />
          </label>
          <button className="btn btn-primary btn--sm" type="button" disabled={!canWrite || !project || saving} onClick={() => { setMessage(''); void editor.openRecord(); }}>
            <Plus className="h-4 w-4" />
            新增
          </button>
        </div>
      </div>
      <ReadOnlyNotice canWrite={canWrite} />
      {message ? <div className="mt-3 text-sm text-success">{message}</div> : null}
      <div className="mt-4">
        <FilterShell>
          <label className="xl:col-span-2"><span className="field-label">关键字</span><input className="input" value={filters.keyword} onChange={event => setFilters({ ...filters, keyword: event.target.value })} placeholder="问题、零件、车型、责任区域" /></label>
          <label><span className="field-label">阶段</span><select className="select" value={filters.phaseId} onChange={event => setFilters({ ...filters, phaseId: event.target.value })}><option value="">全部阶段</option>{bySequence(phases).map(phase => <option key={phase.id} value={idOf(phase.id)}>{phase.name}</option>)}</select></label>
          <label><span className="field-label">状态</span><select className="select" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}><option value="">全部状态</option>{statusOptions.map(status => <option key={status} value={status}>{STATUS_LABEL[status] ?? status}</option>)}</select></label>
          <label><span className="field-label">风险等级</span><select className="select" value={filters.severity} onChange={event => setFilters({ ...filters, severity: event.target.value })}><option value="">全部风险</option>{riskOptions.map(risk => <option key={risk} value={risk}>{STATUS_LABEL[risk] ?? risk}</option>)}</select></label>
          <label><span className="field-label">负责人</span><input className="input" value={filters.owner} onChange={event => setFilters({ ...filters, owner: event.target.value })} placeholder="负责人" /></label>
          <label><span className="field-label">报告日期起</span><input className="input" type="date" value={filters.startDate} onChange={event => setFilters({ ...filters, startDate: event.target.value })} /></label>
          <label><span className="field-label">报告日期止</span><input className="input" type="date" value={filters.endDate} onChange={event => setFilters({ ...filters, endDate: event.target.value })} /></label>
        </FilterShell>
      </div>
      {filteredReports.length ? (
        <div className="table-shell mt-4">
          <table className="data-table min-w-[1280px]">
            <thead>
              <tr>
                <th>阶段</th>
                <th>标题/摘要</th>
                <th>报告日期</th>
                <th>状态</th>
                <th>风险</th>
                <th>负责人/截止</th>
                <th>问题定义</th>
                <th>零件/车型</th>
                <th>责任区域</th>
                <th>进展</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.map(report => {
                const phase = phases.find(item => idOf(item.id) === idOf(report.projectPhaseId));
                const selected = idOf(report.id) === idOf(selectedReport?.id);
                return (
                  <tr key={report.id} className={`cursor-pointer transition ${selected ? 'bg-primary/10' : 'hover:bg-surface-soft'}`} onClick={() => { setMessage(''); void editor.openRecord(report.id); }}>
                    <td>{report.phaseName || phase?.name || '-'}</td>
                    <td className="max-w-[280px]"><button type="button" className="text-left font-semibold text-primary" disabled={saving} onClick={event => { event.stopPropagation(); setMessage(''); void editor.openRecord(report.id); }}>{report.title}</button><div className="mt-1 text-xs text-ink-muted">{report.summary || '-'}</div></td>
                    <td>{formatDate(report.reportDate)}</td>
                    <td><StatusPill status={report.status} /></td>
                    <td><StatusPill status={report.riskLevel} /></td>
                    <td><div>{report.owner || '-'}</div><div className="text-xs text-ink-muted">{formatDate(report.dueDate)}</div></td>
                    <td className="max-w-[220px]">{report.problemDefinition || '-'}</td>
                    <td>{[report.parts, report.vehicleModel].filter(Boolean).join(' / ') || '-'}</td>
                    <td>{report.responsibilityArea || '-'}</td>
                    <td className="max-w-[180px]">{report.progress || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <div className="mt-4"><EmptyState message={list.loading ? '正在加载碰撞一页纸…' : '当前筛选下暂无碰撞一页纸。'} /></div>}
      {list.error && <div role="alert" className="mt-3 text-danger">{list.error}<button className="btn btn-ghost btn--sm" onClick={list.refresh}>重试</button></div>}
      <Pagination page={list.page} pageSize={list.pageSize} count={list.data?.count ?? 0} loading={list.loading} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
      <RelatedDraftContext.Provider key={editor.sessionKey} value={editor.registerRelatedDraft}>
      <SideDrawer open={editor.open} title={selectedIsNew ? '新增碰撞一页纸' : `碰撞一页纸 · ${selectedReport.title}`} size="wide" saving={saving} onClose={editor.close}
        footer={<>
          <span className="mr-auto text-xs text-ink-muted">{editor.relatedDirty ? '附件说明有未保存的修改，请在对应附件旁保存' : editor.dirty ? '有未保存的修改' : selectedReport ? '已保存' : '首次上传附件会先保存记录'}</span>
          <button className="btn btn-ghost btn--sm" disabled={saving} onClick={editor.close}>关闭</button>
          <button className="btn btn-primary btn--sm" disabled={!canWrite || saving || editor.loading || !!editor.error || !draft.title.trim()} onClick={() => void runMutation(saveReport, '碰撞一页纸已保存。')}>保存</button>
        </>}
      >
      {editor.loading ? <p role="status">正在加载详情…</p> : editor.error ? <div role="alert" className="text-danger">{editor.error}<button type="button" className="btn btn-ghost btn--sm" onClick={() => void editor.retry()}>重试</button></div> : <>
      {message && <div role="status" className="mb-3 text-sm">{message}</div>}
      <div className="rounded-lg border border-outline bg-surface-soft p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><p className="kicker">{selectedIsNew ? 'Create' : 'Edit'}</p><h3 className="text-lg font-semibold">{selectedIsNew ? '新增碰撞一页纸' : '编辑碰撞一页纸'}</h3></div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-ghost btn--sm"
              type="button"
              disabled={saving || sheetImagePreview?.loading}
              onClick={() => void handleGenerateSheetImage()}
            >
              <ImageIcon className="h-4 w-4" />
              预览图片
            </button>
            <button
              className="btn btn-ghost btn--sm"
              type="button"
              disabled={!canWrite || saving || selectedIsNew || !selectedReport}
              onClick={() => selectedReport && void runMutation(() => onExportExcel(selectedReport), '碰撞一页纸 Excel 已导出。')}
            >
              <FileDown className="h-4 w-4" />
              导出 Excel
            </button>
            <button className="btn btn-ghost btn--sm" type="button" disabled={!canWrite || saving || selectedIsNew || !selectedReport} onClick={() => {
              if (selectedReport && window.confirm(`确认删除碰撞一页纸「${selectedReport.title}」？`)) {
                void runMutation(async () => { await onDeleteReport(selectedReport); editor.removed(); }, '碰撞一页纸已删除。');
              }
            }}><Trash2 className="h-4 w-4" />删除</button>
          </div>
        </div>
        <div className="collision-sheet-scroll">
          <div
            ref={collisionSheetRef}
            className="collision-sheet"
            aria-label="碰撞一页纸模板输入区"
            onPaste={event => {
              if (!event.defaultPrevented) {
                const fieldKey = activeCollisionFieldKey || 'problemDescription';
                const sectionKey = activeCollisionSectionKey || collisionSectionKey(fieldKey, 'section_1');
                if (sectionKey === 'summary') {
                  return;
                }
                void handleCollisionFieldPaste(sectionKey, fieldKey, COLLISION_FIELD_LABELS[fieldKey] ?? '问题描述', event);
              }
            }}
          >
            <label className="collision-title-field">
              <span className="sr-only">报告标题</span>
              <input
                value={draft.title}
                disabled={!canWrite || saving}
                onChange={event => setDraft({ ...draft, title: event.target.value })}
                placeholder="制造工程重点问题一页纸报告——请输入问题标题"
              />
            </label>

            <div className="collision-sheet-head">
              <div className="collision-brand-cell">
                <strong>LI AUTO</strong>
                <span>理想汽车</span>
              </div>
              <div className="collision-report-title">重点问题一页纸</div>
              <div className="collision-meta-table">
                <label>
                  <span>编制</span>
                  <input value={draft.owner} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, owner: event.target.value })} />
                </label>
                <label>
                  <span>问题状态</span>
                  <select value={draft.status} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, status: event.target.value })}>
                    {statusOptions.map(value => <option key={value} value={value}>{STATUS_LABEL[value] ?? value}</option>)}
                  </select>
                </label>
                <label>
                  <span>提出日期</span>
                  <input type="date" value={draft.reportDate} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, reportDate: event.target.value })} />
                </label>
              </div>
            </div>

            <div className="collision-summary-table">
              {renderSummaryField('problemDefinition', '问题定义', draft.problemDefinition, value => setDraft({ ...draft, problemDefinition: value }), { wide: true, multiline: true })}
              {renderSummaryField('parts', '涉及零件', draft.parts, value => setDraft({ ...draft, parts: value }))}
              {renderSummaryField('vehicleModel', '车型', draft.vehicleModel, value => setDraft({ ...draft, vehicleModel: value }))}
              {renderSummaryField('failureFrequency', '故障频次', draft.failureFrequency, value => setDraft({ ...draft, failureFrequency: value }))}
              {renderSummaryField('responsibilityArea', '责任区域', draft.responsibilityArea, value => setDraft({ ...draft, responsibilityArea: value }))}
              {renderSummaryField('owner', '负责人', draft.owner, value => setDraft({ ...draft, owner: value }))}
              {renderSummaryField('progress', '问题进展', draft.progress, value => setDraft({ ...draft, progress: value }))}
              {renderSummaryField('remark', '备注', draft.remark, value => setDraft({ ...draft, remark: value }))}
            </div>

            <div className="collision-sheet-toolbar">
              <label><span className="field-label">关联阶段</span><select className="select" value={draft.projectPhaseId} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, projectPhaseId: event.target.value })}><option value="">未关联</option>{activePhasesOf(phases).map(phase => <option key={phase.id} value={idOf(phase.id)}>{phase.name}</option>)}</select></label>
              <label><span className="field-label">风险等级</span><select className="select" value={draft.riskLevel} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, riskLevel: event.target.value })}>{['critical', 'high', 'medium', 'low'].map(value => <option key={value} value={value}>{STATUS_LABEL[value] ?? value}</option>)}</select></label>
              <label><span className="field-label">断点计划</span><input className="input" type="date" value={draft.dueDate} disabled={!canWrite || saving} onChange={event => setDraft({ ...draft, dueDate: event.target.value })} /></label>
            </div>

            <div className="collision-body-grid">
              <section className="collision-section">
                <h4>1. 问题描述</h4>
                {renderBodyField('problemDescription', '【失效模式&工况】', draft.problemDescription, value => setDraft({ ...draft, problemDescription: value }))}
                {renderBodyField('vehicleModel', '【涉及车辆】', draft.vehicleModel, value => setDraft({ ...draft, vehicleModel: value }), { sectionKey: 'section_1' })}
                {renderBodyField('source', '【信息来源】', draft.source, value => setDraft({ ...draft, source: value }))}
              </section>

              <section className="collision-section">
                <h4>3. 原因分析</h4>
                {renderBodyField('processAnalysis', '【过程分析】', draft.processAnalysis, value => setDraft({ ...draft, processAnalysis: value }))}
                {renderBodyField('rootCauseConclusion', '【根本原因】', draft.rootCauseConclusion || draft.rootCause, value => setDraft({ ...draft, rootCauseConclusion: value, rootCause: value }))}
                {renderBodyField('summary', '【摘要】', draft.summary, value => setDraft({ ...draft, summary: value }))}
              </section>

              <section className="collision-section">
                <h4>2. 诊断维修</h4>
                {renderBodyField('diagnosisRepair', '诊断维修记录', draft.diagnosisRepair, value => setDraft({ ...draft, diagnosisRepair: value }), { large: true })}
              </section>

              <section className="collision-section">
                <h4>4. 制定措施</h4>
                {renderBodyField('containment', '【临时/拦截措施】', draft.containment, value => setDraft({ ...draft, containment: value }))}
                {renderBodyField('correctiveAction', '【长期措施/追溯】', draft.correctiveAction, value => setDraft({ ...draft, correctiveAction: value }))}
              </section>

              <section className="collision-section">
                <h4>其他补充说明</h4>
                {renderBodyField('approvalSignoff', '备注 / 签核', draft.approvalSignoff, value => setDraft({ ...draft, approvalSignoff: value }))}
              </section>

              <section className="collision-section">
                <h4>5. 所需支持</h4>
                {renderBodyField('supportNeeded', '支持事项', draft.supportNeeded, value => setDraft({ ...draft, supportNeeded: value }))}
              </section>
            </div>
          </div>
        </div>
      </div>
      <SheetImagePreviewModal
        state={sheetImagePreview}
        onClose={() => setSheetImagePreview(null)}
        onDownload={() => {
          if (sheetImagePreview?.url) {
            downloadDataUrlFile(sheetImagePreview.fileName, sheetImagePreview.url);
          }
        }}
      />
      <ObjectAuditHistory objectType="CollisionReport" objectId={selectedReport?.id} revision={auditRevision} />
      </>}
      </SideDrawer>
      </RelatedDraftContext.Provider>
    </section>
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
                        <div className="max-w-[280px] truncate text-xs text-ink" title={task.fileName || task.errorMessage || ''}>
                          {task.fileName || task.errorMessage || (task.hasResult ? '导出产物已生成' : '等待产物生成')}
                        </div>
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
  owners: CheckItemOwner[];
  status: string;
  isActive: boolean;
};

const ownersFromDraft = (draft: Pick<CheckItemConfigDraft, 'owners' | 'ownerName' | 'ownerIdaasId'>) =>
  normalizeOwners(draft.owners);

function ProjectTemplateView({
  data,
  canWrite,
  onCreatePhaseTemplate,
  onUpdatePhaseTemplate,
  onDeletePhaseTemplate,
  onCopyPhaseTemplate,
  onCreateChecklistTemplate,
  onDeleteChecklistTemplate,
  onUpdateChecklistTemplate,
  onCreateInspectionModule,
  onUpdateInspectionModule,
  onDeleteInspectionModule
}: {
  data: WorkspaceData;
  canWrite: boolean;
  onCreatePhaseTemplate: (input: CreatePhaseTemplateInput) => Promise<PhaseTemplate>;
  onUpdatePhaseTemplate: (template: PhaseTemplate, input: UpdatePhaseTemplateInput) => Promise<PhaseTemplate>;
  onDeletePhaseTemplate: (template: PhaseTemplate) => Promise<void>;
  onCopyPhaseTemplate: (template: PhaseTemplate) => Promise<PhaseTemplate>;
  onCreateChecklistTemplate: (input: CreateChecklistTemplateInput) => Promise<ChecklistTemplate>;
  onDeleteChecklistTemplate: (template: ChecklistTemplate) => Promise<void>;
  onUpdateChecklistTemplate: (template: ChecklistTemplate, input: UpdateChecklistTemplateInput) => Promise<ChecklistTemplate>;
  onCreateInspectionModule: (input: InspectionModuleInput) => Promise<InspectionModule>;
  onUpdateInspectionModule: (module: InspectionModule, input: InspectionModuleInput) => Promise<InspectionModule>;
  onDeleteInspectionModule: (module: InspectionModule) => Promise<void>;
}) {
  const [selectedPhaseTemplateId, setSelectedPhaseTemplateId] = useState('');
  const [phaseEditorMode, setPhaseEditorMode] = useState<'edit' | 'create'>('edit');
  const [phaseDrafts, setPhaseDrafts] = useState<Record<string, PhaseTemplateDraft>>({});
  const [newPhaseDraft, setNewPhaseDraft] = useState<PhaseTemplateDraft>(() => emptyPhaseTemplateDraft());
  const [selectedInspectionModuleId, setSelectedInspectionModuleId] = useState('');
  const [moduleEditorMode, setModuleEditorMode] = useState<'edit' | 'create'>('edit');
  const [moduleDrafts, setModuleDrafts] = useState<Record<string, InspectionModuleDraft>>({});
  const [newModuleDraft, setNewModuleDraft] = useState<InspectionModuleDraft>(() => emptyInspectionModuleDraft());
  const [selectedChecklistTemplateId, setSelectedChecklistTemplateId] = useState('');
  const [checklistDrafts, setChecklistDrafts] = useState<Record<string, ChecklistTemplateDraft>>({});
  const [creatingCell, setCreatingCell] = useState<TemplateCellTarget | null>(null);
  const [newChecklistDraft, setNewChecklistDraft] = useState<ChecklistTemplateDraft | null>(null);
  const [savingKey, setSavingKey] = useState('');
  const [message, setMessage] = useState('');
  const [moduleMessage, setModuleMessage] = useState('');
  const sortedPhaseTemplates = bySequence(data.phaseTemplates);
  const sortedInspectionModules = bySequence(data.inspectionModules);
  const phaseTemplateKey = sortedPhaseTemplates.map(template => idOf(template.id)).join('|');
  const checklistTemplateKey = data.checklistTemplates.map(template => `${idOf(template.id)}:${template.code}:${template.version ?? ''}`).join('|');
  const inspectionModuleKey = sortedInspectionModules.map(module => `${idOf(module.id)}:${module.code}:${module.sequence}:${module.isActive}`).join('|');
  const selectedPhaseTemplate = sortedPhaseTemplates.find(template => idOf(template.id) === selectedPhaseTemplateId) ?? sortedPhaseTemplates[0];
  const selectedPhaseTemplateIdValue = idOf(selectedPhaseTemplate?.id);
  const selectedInspectionModule =
    sortedInspectionModules.find(module => idOf(module.id) === selectedInspectionModuleId) ??
    sortedInspectionModules[0];
  const selectedInspectionModuleIdValue = idOf(selectedInspectionModule?.id);
  const existingPhaseTemplateCodes = data.phaseTemplates.map(template => template.code);
  const existingChecklistTemplateCodes = data.checklistTemplates.map(template => template.code);
  const existingInspectionModuleCodes = data.inspectionModules.map(module => module.code);
  const nextInspectionModuleSequence = sortedInspectionModules.length
    ? Math.max(...sortedInspectionModules.map(module => module.sequence ?? 0)) + 10
    : 10;
  const selectedTemplateChecklists = data.checklistTemplates.filter(template =>
    selectedPhaseTemplateIdValue && idOf(template.phaseTemplateId) === selectedPhaseTemplateIdValue
  );
  const selectedChecklistTemplate =
    selectedTemplateChecklists.find(template => idOf(template.id) === selectedChecklistTemplateId) ??
    selectedTemplateChecklists[0];
  const selectedChecklistTemplateIdValue = idOf(selectedChecklistTemplate?.id);
  const selectedChecklistDraft = selectedChecklistTemplate
    ? checklistDrafts[selectedChecklistTemplateIdValue] ?? checklistTemplateDraftFrom(selectedChecklistTemplate)
    : undefined;
  const activeChecklistDraft = creatingCell ? newChecklistDraft : selectedChecklistDraft;
  const selectedDraftItems = activeChecklistDraft?.itemTemplates ?? [];
  const selectedTemplateDefinitions = selectedPhaseTemplate ? phaseDefinitionsOf(selectedPhaseTemplate) : [];
  const selectedPhaseDraft = selectedPhaseTemplate
    ? phaseDrafts[selectedPhaseTemplateIdValue] ?? phaseTemplateDraftFrom(selectedPhaseTemplate)
    : undefined;
  const selectedModuleDraft = selectedInspectionModule
    ? moduleDrafts[selectedInspectionModuleIdValue] ?? inspectionModuleDraftFrom(selectedInspectionModule)
    : undefined;
  const activeModuleDraft = moduleEditorMode === 'create' ? newModuleDraft : selectedModuleDraft;
  const activePhaseDraft = phaseEditorMode === 'create' ? newPhaseDraft : selectedPhaseDraft;
  const selectedChecklistPhase = activeChecklistDraft?.phaseKey
    ? selectedTemplateDefinitions.find(phase => phase.key === activeChecklistDraft.phaseKey)
    : undefined;
  const invalidPhaseDraft =
    !activePhaseDraft?.code.trim() ||
    !activePhaseDraft.name.trim() ||
    !Number.isFinite(toPositiveInteger(activePhaseDraft.version)) ||
    !activePhaseDraft.phaseDefinitions.length ||
    activePhaseDraft.phaseDefinitions.some(phase => !phase.key.trim() || !phase.name.trim());
  const moduleSequenceValue = Number(activeModuleDraft?.sequence ?? 0);
  const invalidModuleDraft =
    !activeModuleDraft?.code.trim() ||
    !activeModuleDraft.name.trim() ||
    !Number.isFinite(moduleSequenceValue) ||
    moduleSequenceValue < 0;
  const invalidChecklistDraft =
    !activeChecklistDraft?.code.trim() ||
    !activeChecklistDraft.name.trim() ||
    !activeChecklistDraft.moduleId ||
    !activeChecklistDraft.phaseTemplateId ||
    !activeChecklistDraft.phaseKey ||
    selectedDraftItems.some(item => !item.title.trim());

  useEffect(() => {
    setSelectedPhaseTemplateId(current =>
      sortedPhaseTemplates.some(template => idOf(template.id) === current)
        ? current
        : idOf(sortedPhaseTemplates[0]?.id)
    );
  }, [phaseTemplateKey]);

  useEffect(() => {
    if (moduleEditorMode === 'create') return;
    setSelectedInspectionModuleId(current =>
      sortedInspectionModules.some(module => idOf(module.id) === current)
        ? current
        : idOf(sortedInspectionModules[0]?.id)
    );
  }, [inspectionModuleKey, moduleEditorMode]);

  useEffect(() => {
    if (creatingCell) return;
    setSelectedChecklistTemplateId(current =>
      selectedTemplateChecklists.some(template => idOf(template.id) === current)
        ? current
        : idOf(selectedTemplateChecklists[0]?.id)
    );
  }, [selectedPhaseTemplateIdValue, checklistTemplateKey, creatingCell]);

  useEffect(() => {
    setPhaseDrafts(
      Object.fromEntries(
        data.phaseTemplates.map(template => [idOf(template.id), phaseTemplateDraftFrom(template)])
      )
    );
  }, [data.phaseTemplates]);

  useEffect(() => {
    setModuleDrafts(
      Object.fromEntries(
        data.inspectionModules.map(module => [idOf(module.id), inspectionModuleDraftFrom(module)])
      )
    );
  }, [data.inspectionModules]);

  useEffect(() => {
    setChecklistDrafts(
      Object.fromEntries(
        data.checklistTemplates.map(template => [idOf(template.id), checklistTemplateDraftFrom(template)])
      )
    );
  }, [data.checklistTemplates]);

  const updateActivePhaseDraft = (patch: Partial<PhaseTemplateDraft>) => {
    if (phaseEditorMode === 'create') {
      setNewPhaseDraft(current => ({ ...current, ...patch }));
      return;
    }
    if (!selectedPhaseTemplateIdValue || !selectedPhaseTemplate) return;
    setPhaseDrafts(current => ({
      ...current,
      [selectedPhaseTemplateIdValue]: {
        ...(current[selectedPhaseTemplateIdValue] ?? phaseTemplateDraftFrom(selectedPhaseTemplate)),
        ...patch
      }
    }));
  };

  const updatePhaseDefinition = (index: number, patch: Partial<PhaseDefinition>) => {
    if (!activePhaseDraft) return;
    const nextDefinitions = [...activePhaseDraft.phaseDefinitions];
    nextDefinitions[index] = { ...nextDefinitions[index], ...patch };
    updateActivePhaseDraft({ phaseDefinitions: nextDefinitions });
  };

  const addPhaseDefinition = () => {
    const nextSortOrder = activePhaseDraft?.phaseDefinitions.length
      ? Math.max(...activePhaseDraft.phaseDefinitions.map(phase => phase.sortOrder ?? 0)) + 10
      : 10;
    updateActivePhaseDraft({
      phaseDefinitions: [
        ...(activePhaseDraft?.phaseDefinitions ?? []),
        emptyPhaseDefinition(nextSortOrder)
      ]
    });
  };

  const removePhaseDefinition = (index: number) => {
    if (!activePhaseDraft) return;
    updateActivePhaseDraft({
      phaseDefinitions: activePhaseDraft.phaseDefinitions.filter((_, phaseIndex) => phaseIndex !== index)
    });
  };

  const openCreatePhaseTemplate = () => {
    setPhaseEditorMode('create');
    setNewPhaseDraft(emptyPhaseTemplateDraft(existingPhaseTemplateCodes));
    setCreatingCell(null);
    setNewChecklistDraft(null);
    setMessage('');
  };

  const selectPhaseTemplate = (template: PhaseTemplate) => {
    setPhaseEditorMode('edit');
    setSelectedPhaseTemplateId(idOf(template.id));
    setCreatingCell(null);
    setNewChecklistDraft(null);
    setMessage('');
  };

  const phaseDraftInput = (draft: PhaseTemplateDraft): CreatePhaseTemplateInput => ({
    code: draft.code.trim(),
    name: draft.name.trim(),
    version: toPositiveInteger(draft.version),
    description: draft.description.trim(),
    isActive: draft.isActive,
    phaseDefinitions: normalizePhaseDefinitionsForDraft(draft.phaseDefinitions),
    metadata: draft.metadata
  });

  const savePhaseTemplate = async () => {
    if (!canWrite || !activePhaseDraft || invalidPhaseDraft) return;
    const key = phaseEditorMode === 'create' ? 'phase-template-new' : `phase-template-${selectedPhaseTemplate?.id}`;
    setSavingKey(key);
    setMessage('');
    try {
      if (phaseEditorMode === 'create') {
        const created = await onCreatePhaseTemplate(phaseDraftInput(activePhaseDraft));
        setSelectedPhaseTemplateId(idOf(created.id));
        setPhaseEditorMode('edit');
        setMessage('项目模板源数据已新增。');
      } else if (selectedPhaseTemplate) {
        const updated = await onUpdatePhaseTemplate(selectedPhaseTemplate, phaseDraftInput(activePhaseDraft));
        setSelectedPhaseTemplateId(idOf(updated.id));
        setMessage('项目模板源数据已保存。');
      }
    } catch (err) {
      setMessage(mutationErrorMessage(err, '项目模板源数据保存失败。'));
    } finally {
      setSavingKey('');
    }
  };

  const deleteSelectedPhaseTemplate = async () => {
    if (!canWrite || !selectedPhaseTemplate) return;
    const confirmed = window.confirm(`确认删除项目模板源数据「${selectedPhaseTemplate.name}」？将同步删除该模板下的关联清单模板。`);
    if (!confirmed) return;
    setSavingKey(`phase-template-delete-${selectedPhaseTemplate.id}`);
    setMessage('');
    try {
      await onDeletePhaseTemplate(selectedPhaseTemplate);
      setSelectedPhaseTemplateId('');
      setSelectedChecklistTemplateId('');
      setMessage('项目模板源数据已删除。');
    } catch (err) {
      setMessage(mutationErrorMessage(err, '项目模板源数据删除失败。'));
    } finally {
      setSavingKey('');
    }
  };

  const copySelectedPhaseTemplate = async () => {
    if (!canWrite || !selectedPhaseTemplate) return;
    setSavingKey(`phase-template-copy-${selectedPhaseTemplate.id}`);
    setMessage('');
    try {
      const copied = await onCopyPhaseTemplate(selectedPhaseTemplate);
      setSelectedPhaseTemplateId(idOf(copied.id));
      setSelectedChecklistTemplateId('');
      setPhaseEditorMode('edit');
      setCreatingCell(null);
      setNewChecklistDraft(null);
      setMessage('已复制为草稿模板，并复制关联清单模板与模板检查项。');
    } catch (err) {
      setMessage(mutationErrorMessage(err, '项目模板源数据复制失败。'));
    } finally {
      setSavingKey('');
    }
  };

  const updateActiveModuleDraft = (patch: Partial<InspectionModuleDraft>) => {
    if (moduleEditorMode === 'create') {
      setNewModuleDraft(current => ({ ...current, ...patch }));
      return;
    }
    if (!selectedInspectionModuleIdValue || !selectedInspectionModule) return;
    setModuleDrafts(current => ({
      ...current,
      [selectedInspectionModuleIdValue]: {
        ...(current[selectedInspectionModuleIdValue] ?? inspectionModuleDraftFrom(selectedInspectionModule)),
        ...patch
      }
    }));
  };

  const openCreateInspectionModule = () => {
    setModuleEditorMode('create');
    setNewModuleDraft(emptyInspectionModuleDraft(existingInspectionModuleCodes, nextInspectionModuleSequence));
    setModuleMessage('');
  };

  const selectInspectionModule = (module: InspectionModule) => {
    setModuleEditorMode('edit');
    setSelectedInspectionModuleId(idOf(module.id));
    setModuleMessage('');
  };

  const inspectionModuleDraftInput = (draft: InspectionModuleDraft): InspectionModuleInput => ({
    code: draft.code.trim(),
    name: draft.name.trim(),
    description: draft.description.trim(),
    sequence: Math.max(0, Math.trunc(Number(draft.sequence) || 0)),
    isActive: draft.isActive,
    owners: normalizeOwners(draft.owners),
    metadata: draft.metadata
  });

  const saveInspectionModule = async () => {
    if (!canWrite || !activeModuleDraft || invalidModuleDraft) return;
    const key = moduleEditorMode === 'create' ? 'inspection-module-new' : `inspection-module-${selectedInspectionModule?.id}`;
    setSavingKey(key);
    setModuleMessage('');
    try {
      if (moduleEditorMode === 'create') {
        const created = await onCreateInspectionModule(inspectionModuleDraftInput(activeModuleDraft));
        setSelectedInspectionModuleId(idOf(created.id));
        setModuleEditorMode('edit');
        setModuleMessage('检查模块已新增，矩阵和清单模板模块下拉已使用最新列表。');
      } else if (selectedInspectionModule) {
        const updated = await onUpdateInspectionModule(
          selectedInspectionModule,
          inspectionModuleDraftInput(activeModuleDraft)
        );
        setSelectedInspectionModuleId(idOf(updated.id));
        setModuleMessage('检查模块已保存，矩阵行已刷新。');
      }
    } catch (err) {
      setModuleMessage(mutationErrorMessage(err, '检查模块保存失败。'));
    } finally {
      setSavingKey('');
    }
  };

  const deleteSelectedInspectionModule = async () => {
    if (!canWrite || !selectedInspectionModule) return;
    const confirmed = window.confirm(`确认删除检查模块「${selectedInspectionModule.name}」？若已有清单模板或检查项引用，后端会拒绝删除。`);
    if (!confirmed) return;
    setSavingKey(`inspection-module-delete-${selectedInspectionModule.id}`);
    setModuleMessage('');
    try {
      await onDeleteInspectionModule(selectedInspectionModule);
      setSelectedInspectionModuleId('');
      setModuleEditorMode('edit');
      setModuleMessage('检查模块已删除。');
    } catch (err) {
      setModuleMessage(mutationErrorMessage(err, '检查模块删除失败。'));
    } finally {
      setSavingKey('');
    }
  };

  const updateActiveChecklistDraft = (patch: Partial<ChecklistTemplateDraft>) => {
    if (creatingCell) {
      setNewChecklistDraft(current => current ? { ...current, ...patch } : current);
      return;
    }
    if (!selectedChecklistTemplateIdValue || !selectedChecklistTemplate) return;
    setChecklistDrafts(current => ({
      ...current,
      [selectedChecklistTemplateIdValue]: {
        ...(current[selectedChecklistTemplateIdValue] ?? checklistTemplateDraftFrom(selectedChecklistTemplate)),
        ...patch
      }
    }));
  };

  const updateDraftItem = (index: number, patch: Partial<ChecklistTemplateItem>) => {
    if (!activeChecklistDraft) return;
    const nextItems = [...selectedDraftItems];
    nextItems[index] = { ...nextItems[index], ...patch };
    updateActiveChecklistDraft({ itemTemplates: nextItems });
  };

  const addDraftItem = () => {
    const nextSortOrder = selectedDraftItems.length
      ? Math.max(...selectedDraftItems.map(item => item.sortOrder ?? 0)) + 10
      : 10;
    updateActiveChecklistDraft({
      itemTemplates: [...selectedDraftItems, emptyChecklistTemplateItem(nextSortOrder)]
    });
  };

  const removeDraftItem = (index: number) => {
    updateActiveChecklistDraft({
      itemTemplates: selectedDraftItems.filter((_, itemIndex) => itemIndex !== index)
    });
  };

  const startCreateChecklistTemplate = (target: TemplateCellTarget) => {
    if (!selectedPhaseTemplate) return;
    setCreatingCell(target);
    setSelectedChecklistTemplateId('');
    setNewChecklistDraft(makeChecklistTemplateDraft(
      selectedPhaseTemplate,
      target.module,
      target.phase,
      existingChecklistTemplateCodes
    ));
    setMessage('');
  };

  const selectChecklistTemplate = (template: ChecklistTemplate) => {
    setCreatingCell(null);
    setNewChecklistDraft(null);
    setSelectedChecklistTemplateId(idOf(template.id));
    setMessage('');
  };

  const checklistDraftInput = (draft: ChecklistTemplateDraft): CreateChecklistTemplateInput => ({
    code: draft.code.trim(),
    name: draft.name.trim(),
    moduleId: draft.moduleId,
    phaseTemplateId: draft.phaseTemplateId,
    phaseKey: draft.phaseKey,
    version: toPositiveInteger(draft.version),
    isActive: draft.isActive,
    itemTemplates: normalizeTemplateItemsForDraft(draft.itemTemplates),
    metadata: {
      ...draft.metadata,
      item_count: draft.itemTemplates.filter(item => item.title.trim()).length
    }
  });

  const saveChecklistTemplate = async () => {
    if (!canWrite || !activeChecklistDraft || invalidChecklistDraft) return;
    const key = creatingCell ? 'checklist-template-new' : `checklist-template-${selectedChecklistTemplate?.id}`;
    setSavingKey(key);
    setMessage('');
    try {
      if (creatingCell) {
        const created = await onCreateChecklistTemplate(checklistDraftInput(activeChecklistDraft));
        setCreatingCell(null);
        setNewChecklistDraft(null);
        setSelectedChecklistTemplateId(idOf(created.id));
        setMessage('清单模板已新增。');
      } else if (selectedChecklistTemplate) {
        const updated = await onUpdateChecklistTemplate(selectedChecklistTemplate, checklistDraftInput(activeChecklistDraft));
        setSelectedChecklistTemplateId(idOf(updated.id));
        setMessage('清单模板已保存。新创建或补齐模板的项目会使用最新模板，已有项目实例不自动覆盖。');
      }
    } catch (err) {
      setMessage(mutationErrorMessage(err, '清单模板保存失败。'));
    } finally {
      setSavingKey('');
    }
  };

  const deleteSelectedChecklistTemplate = async () => {
    if (!canWrite || !selectedChecklistTemplate) return;
    const confirmed = window.confirm(`确认删除清单模板「${selectedChecklistTemplate.title}」？`);
    if (!confirmed) return;
    setSavingKey(`checklist-template-delete-${selectedChecklistTemplate.id}`);
    setMessage('');
    try {
      await onDeleteChecklistTemplate(selectedChecklistTemplate);
      setSelectedChecklistTemplateId('');
      setMessage('清单模板已删除。');
    } catch (err) {
      setMessage(mutationErrorMessage(err, '清单模板删除失败。'));
    } finally {
      setSavingKey('');
    }
  };

  return (
    <div className="grid gap-5">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="kicker">Project Templates</p>
            <h2 className="text-xl font-semibold">项目模板源数据</h2>
            <p className="text-sm text-ink-muted">项目模板源数据只用于新项目初始化和默认补齐，不和项目实例维护混在一起。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ReadOnlyNotice canWrite={canWrite} />
            <button className="btn btn-ghost btn--sm" type="button" disabled={!canWrite} onClick={openCreatePhaseTemplate}>
              <Plus className="h-4 w-4" />
              新建模板
            </button>
          </div>
        </div>
        <div className="table-shell mt-4">
          <table className="data-table min-w-[1120px]">
            <thead>
              <tr>
                <th>模板</th>
                <th>版本</th>
                <th>阶段</th>
                <th>清单模板</th>
                <th>模板检查项</th>
                <th>状态</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {sortedPhaseTemplates.map(template => {
                const active = idOf(template.id) === selectedPhaseTemplateIdValue;
                const templateChecklists = data.checklistTemplates.filter(item =>
                  item.phaseTemplateId && idOf(item.phaseTemplateId) === idOf(template.id)
                );
                return (
                  <tr
                    key={template.id}
                    className={`cursor-pointer transition ${active && phaseEditorMode === 'edit' ? 'bg-primary/10' : 'hover:bg-surface-soft'}`}
                    tabIndex={0}
                    aria-selected={active && phaseEditorMode === 'edit'}
                    onClick={() => selectPhaseTemplate(template)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectPhaseTemplate(template);
                      }
                    }}
                  >
                    <td className="min-w-[260px]">
                      <div className="font-semibold text-ink">{template.name}</div>
                      <div className="mt-1 text-xs text-ink-muted">{template.code}</div>
                    </td>
                    <td>v{template.version ?? template.sequence}</td>
                    <td>{phaseDefinitionsOf(template).length} 阶段</td>
                    <td>{templateChecklists.length} 组</td>
                    <td>{checklistTemplateItemCount(templateChecklists)} 项</td>
                    <td><StatusPill status={template.isActive ? 'active' : 'disabled'} /></td>
                    <td className="max-w-[280px]">{template.description || template.defaultGoal || '-'}</td>
                  </tr>
                );
              })}
              {!sortedPhaseTemplates.length ? (
                <tr>
                  <td colSpan={7} className="text-center text-ink-muted">暂无项目模板源数据。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {activePhaseDraft ? (
          <div className="mt-5 rounded-lg border border-outline bg-surface-soft p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-ink">
                  {phaseEditorMode === 'create' ? '新建项目模板源数据' : '模板属性'}
                </h3>
                <p className="text-xs text-ink-muted">
                  {phaseEditorMode === 'create' ? '保存后可在矩阵中维护模块阶段清单模板。' : `${selectedPhaseTemplate?.code ?? ''} · ${selectedTemplateDefinitions.length} 阶段`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {phaseEditorMode === 'edit' && selectedPhaseTemplate ? (
                  <>
                    <button
                      className="btn btn-ghost btn--sm"
                      type="button"
                      disabled={!canWrite || savingKey === `phase-template-copy-${selectedPhaseTemplate.id}`}
                      onClick={() => void copySelectedPhaseTemplate()}
                    >
                      <Copy className="h-4 w-4" />
                      {savingKey === `phase-template-copy-${selectedPhaseTemplate.id}` ? '复制中' : '复制草稿'}
                    </button>
                    <button
                      className="btn btn-ghost btn--sm"
                      type="button"
                      disabled={!canWrite || savingKey === `phase-template-delete-${selectedPhaseTemplate.id}`}
                      onClick={() => void deleteSelectedPhaseTemplate()}
                    >
                      <Trash2 className="h-4 w-4" />
                      删除模板
                    </button>
                  </>
                ) : null}
                <button
                  className="btn btn-primary btn--sm"
                  type="button"
                  disabled={!canWrite || invalidPhaseDraft || savingKey.startsWith('phase-template')}
                  onClick={() => void savePhaseTemplate()}
                >
                  <Save className="h-4 w-4" />
                  {savingKey === 'phase-template-new' || savingKey === `phase-template-${selectedPhaseTemplate?.id}` ? '保存中' : '保存模板'}
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-5">
              <label>
                <span className="field-label">模板编码</span>
                <input className="input" value={activePhaseDraft.code} disabled={!canWrite} onChange={event => updateActivePhaseDraft({ code: event.target.value })} />
              </label>
              <label className="lg:col-span-2">
                <span className="field-label">模板名称</span>
                <input className="input" value={activePhaseDraft.name} disabled={!canWrite} onChange={event => updateActivePhaseDraft({ name: event.target.value })} />
              </label>
              <label>
                <span className="field-label">版本</span>
                <input className="input" type="number" min={1} value={activePhaseDraft.version} disabled={!canWrite} onChange={event => updateActivePhaseDraft({ version: event.target.value })} />
              </label>
              <label className="flex items-end gap-2 text-sm text-ink-muted">
                <input type="checkbox" checked={activePhaseDraft.isActive} disabled={!canWrite} onChange={event => updateActivePhaseDraft({ isActive: event.target.checked })} />
                启用
              </label>
              <label className="lg:col-span-5">
                <span className="field-label">说明</span>
                <textarea className="input min-h-20" value={activePhaseDraft.description} disabled={!canWrite} onChange={event => updateActivePhaseDraft({ description: event.target.value })} />
              </label>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold text-ink">阶段定义</h4>
                <p className="text-xs text-ink-muted">阶段 key 会用于矩阵列和清单模板 phase_key。</p>
              </div>
              <button className="btn btn-ghost btn--sm" type="button" disabled={!canWrite} onClick={addPhaseDefinition}>
                <Plus className="h-4 w-4" />
                新增阶段
              </button>
            </div>
            <div className="table-shell mt-3">
              <table className="data-table min-w-[1180px]">
                <thead>
                  <tr>
                    <th>排序</th>
                    <th>阶段 Key</th>
                    <th>阶段名称</th>
                    <th>说明</th>
                    <th>计划开始</th>
                    <th>计划结束</th>
                    <th>持续天数</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {activePhaseDraft.phaseDefinitions.map((phase, index) => (
                    <tr key={`${phase.key || 'phase'}-${index}`}>
                      <td className="min-w-[100px]">
                        <input className="input" type="number" value={phase.sortOrder ?? (index + 1) * 10} disabled={!canWrite} onChange={event => updatePhaseDefinition(index, { sortOrder: Number(event.target.value) })} />
                      </td>
                      <td className="min-w-[150px]">
                        <input className="input" value={phase.key} disabled={!canWrite} onChange={event => updatePhaseDefinition(index, { key: event.target.value })} />
                      </td>
                      <td className="min-w-[180px]">
                        <input className="input" value={phase.name} disabled={!canWrite} onChange={event => updatePhaseDefinition(index, { name: event.target.value })} />
                      </td>
                      <td className="min-w-[260px]">
                        <input className="input" value={phase.description ?? ''} disabled={!canWrite} onChange={event => updatePhaseDefinition(index, { description: event.target.value })} />
                      </td>
                      <td className="min-w-[150px]">
                        <input className="input" type="date" value={dateInputValue(phase.plannedStart)} disabled={!canWrite} onChange={event => updatePhaseDefinition(index, { plannedStart: event.target.value || null })} />
                      </td>
                      <td className="min-w-[150px]">
                        <input className="input" type="date" value={dateInputValue(phase.plannedEnd)} disabled={!canWrite} onChange={event => updatePhaseDefinition(index, { plannedEnd: event.target.value || null })} />
                      </td>
                      <td className="min-w-[120px]">
                        <input className="input" type="number" value={phase.durationDays ?? ''} disabled={!canWrite} onChange={event => updatePhaseDefinition(index, { durationDays: event.target.value ? Number(event.target.value) : null })} />
                      </td>
                      <td>
                        <button className="btn btn-ghost btn--sm" type="button" disabled={!canWrite || activePhaseDraft.phaseDefinitions.length <= 1} onClick={() => removePhaseDefinition(index)}>
                          <Trash2 className="h-4 w-4" />
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="kicker">Inspection Modules</p>
            <h2 className="text-xl font-semibold">检查模块维护</h2>
            <p className="text-sm text-ink-muted">维护模块编码、名称、排序、启用状态和 IDaaS 负责人；保存后立即影响下方矩阵行与新建清单模板模块选项。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ReadOnlyNotice canWrite={canWrite} />
            <button className="btn btn-ghost btn--sm" type="button" disabled={!canWrite} onClick={openCreateInspectionModule}>
              <Plus className="h-4 w-4" />
              新增模块
            </button>
          </div>
        </div>
        <div className="table-shell mt-4">
          <table className="data-table min-w-[1120px]">
            <thead>
              <tr>
                <th>排序</th>
                <th>模块</th>
                <th>负责人</th>
                <th>清单模板</th>
                <th>项目检查项</th>
                <th>状态</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {sortedInspectionModules.map(module => {
                const active = moduleEditorMode === 'edit' && idOf(module.id) === selectedInspectionModuleIdValue;
                const moduleOwners = ownersOfModule(module);
                const moduleChecklistCount = data.checklistTemplates.filter(template => idOf(template.moduleId) === idOf(module.id)).length;
                const moduleCheckItemCount = data.checkItems.filter(item => idOf(item.moduleId) === idOf(module.id)).length;
                return (
                  <tr
                    key={module.id}
                    className={`cursor-pointer transition ${active ? 'bg-primary/10' : 'hover:bg-surface-soft'}`}
                    tabIndex={0}
                    aria-selected={active}
                    onClick={() => selectInspectionModule(module)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectInspectionModule(module);
                      }
                    }}
                  >
                    <td>{module.sequence}</td>
                    <td className="min-w-[240px]">
                      <div className="font-semibold text-ink">{module.name}</div>
                      <div className="mt-1 text-xs text-ink-muted">{module.code}</div>
                    </td>
                    <td className="min-w-[220px]">
                      {moduleOwners.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {moduleOwners.map(owner => (
                            <span key={ownerKeyOf(owner)} className="chip gap-1.5">
                              <UserAvatar name={ownerDisplayName(owner)} idaasId={owner.idaasId} avatarUrl={owner.avatarUrl} size="xs" />
                              <span>{ownerDisplayName(owner)}</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-ink-muted">未设置</span>
                      )}
                    </td>
                    <td>{moduleChecklistCount} 组</td>
                    <td>{moduleCheckItemCount} 项</td>
                    <td><StatusPill status={module.isActive ? 'active' : 'disabled'} /></td>
                    <td className="max-w-[280px]">{module.description || '-'}</td>
                  </tr>
                );
              })}
              {!sortedInspectionModules.length ? (
                <tr>
                  <td colSpan={7} className="text-center text-ink-muted">暂无检查模块，可新增后保存。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {activeModuleDraft ? (
          <div className="mt-5 rounded-lg border border-outline bg-surface-soft p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-ink">
                  {moduleEditorMode === 'create' ? '新增检查模块' : '模块属性'}
                </h3>
                <p className="text-xs text-ink-muted">
                  {moduleEditorMode === 'create'
                    ? '保存后可在矩阵中维护该模块的阶段清单模板。'
                    : `${selectedInspectionModule?.code ?? ''} · 排序 ${selectedInspectionModule?.sequence ?? 0}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {moduleEditorMode === 'edit' && selectedInspectionModule ? (
                  <button
                    className="btn btn-ghost btn--sm"
                    type="button"
                    disabled={!canWrite || savingKey === `inspection-module-delete-${selectedInspectionModule.id}`}
                    onClick={() => void deleteSelectedInspectionModule()}
                  >
                    <Trash2 className="h-4 w-4" />
                    删除模块
                  </button>
                ) : null}
                <button
                  className="btn btn-primary btn--sm"
                  type="button"
                  disabled={!canWrite || invalidModuleDraft || savingKey.startsWith('inspection-module')}
                  onClick={() => void saveInspectionModule()}
                >
                  <Save className="h-4 w-4" />
                  {savingKey === 'inspection-module-new' || savingKey === `inspection-module-${selectedInspectionModule?.id}` ? '保存中' : '保存模块'}
                </button>
              </div>
            </div>
            {moduleMessage ? <div className="mt-3 text-sm text-ink-muted">{moduleMessage}</div> : null}
            <div className="mt-4 grid gap-3 lg:grid-cols-6">
              <label>
                <span className="field-label">模块编码</span>
                <input className="input" value={activeModuleDraft.code} disabled={!canWrite} onChange={event => updateActiveModuleDraft({ code: event.target.value })} />
              </label>
              <label className="lg:col-span-2">
                <span className="field-label">模块名称</span>
                <input className="input" value={activeModuleDraft.name} disabled={!canWrite} onChange={event => updateActiveModuleDraft({ name: event.target.value })} />
              </label>
              <label>
                <span className="field-label">排序</span>
                <input className="input" type="number" min={0} value={activeModuleDraft.sequence} disabled={!canWrite} onChange={event => updateActiveModuleDraft({ sequence: event.target.value })} />
              </label>
              <label className="flex items-end gap-2 text-sm text-ink-muted">
                <input type="checkbox" checked={activeModuleDraft.isActive} disabled={!canWrite} onChange={event => updateActiveModuleDraft({ isActive: event.target.checked })} />
                启用
              </label>
              <label className="lg:col-span-6">
                <span className="field-label">说明</span>
                <textarea className="input min-h-20" value={activeModuleDraft.description} disabled={!canWrite} onChange={event => updateActiveModuleDraft({ description: event.target.value })} />
              </label>
              <div className="lg:col-span-6">
                <span className="field-label">负责人</span>
                <OwnerListEditor
                  owners={activeModuleDraft.owners}
                  ownerCandidates={data.ownerCandidates}
                  canWrite={canWrite}
                  candidateLabel={`检查模块 ${activeModuleDraft.name || activeModuleDraft.code || '新增模块'} IDaaS 负责人`}
                  onChange={next => updateActiveModuleDraft({ owners: next.owners })}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-5">
            <EmptyState message="请选择检查模块，或点击新增模块开始维护。" />
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="kicker">Module Phase Matrix</p>
            <h2 className="text-xl font-semibold">模块 × 阶段矩阵</h2>
            <p className="text-sm text-ink-muted">{selectedPhaseTemplate && phaseEditorMode === 'edit' ? `${selectedPhaseTemplate.name} · ${selectedTemplateDefinitions.length} 阶段` : '先选择已保存的项目模板源数据'}</p>
          </div>
          <span className="chip">{selectedTemplateChecklists.length} 组清单模板</span>
        </div>
        {selectedPhaseTemplate && phaseEditorMode === 'edit' && selectedTemplateDefinitions.length ? (
          <div className="table-shell mt-4">
            <table className="data-table" style={{ minWidth: `${Math.max(960, 220 + selectedTemplateDefinitions.length * 220)}px` }}>
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-surface">检查模块</th>
                  {selectedTemplateDefinitions.map(phase => (
                    <th key={phase.key}>
                      <div className="font-semibold">{phase.name}</div>
                      <div className="mt-1 text-xs font-normal text-ink-muted">{phase.key}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedInspectionModules.map(module => (
                  <tr key={module.id}>
                    <td className="sticky left-0 z-10 min-w-[220px] bg-surface">
                      <div className="font-semibold text-ink">{module.name}</div>
                      <div className="mt-1 text-xs text-ink-muted">{module.code}</div>
                      <div className="mt-2"><StatusPill status={module.isActive ? 'active' : 'disabled'} /></div>
                    </td>
                    {selectedTemplateDefinitions.map(phase => {
                      const cellTemplates = checklistTemplatesForCell(
                        data.checklistTemplates,
                        selectedPhaseTemplateIdValue,
                        module,
                        phase
                      );
                      return (
                        <td key={`${module.id}-${phase.key}`} className="min-w-[220px] align-top">
                          <div className="space-y-2">
                            {cellTemplates.map(template => (
                              <button
                                key={template.id}
                                className={`w-full rounded-lg border p-3 text-left transition ${
                                  idOf(template.id) === selectedChecklistTemplateIdValue && !creatingCell
                                    ? 'border-primary bg-primary/10'
                                    : 'border-outline bg-surface-soft hover:border-primary/50'
                                }`}
                                type="button"
                                aria-pressed={idOf(template.id) === selectedChecklistTemplateIdValue && !creatingCell}
                                onClick={() => selectChecklistTemplate(template)}
                              >
                                <div className="font-semibold text-ink">{template.title}</div>
                                <div className="mt-1 text-xs text-ink-muted">{template.code}</div>
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  <StatusPill status={template.isActive !== false ? 'active' : 'disabled'} />
                                  <span className="chip">{checklistItemsOf(template).length} 项</span>
                                </div>
                              </button>
                            ))}
                            {!cellTemplates.length && <div className="p-3 text-sm text-ink-muted">未配置</div>}
                          </div>
                          {canWrite ? (
                            <button
                              className="btn btn-ghost btn--sm mt-2 w-full"
                              type="button"
                              onClick={() => startCreateChecklistTemplate({ module, phase })}
                            >
                              <Plus className="h-4 w-4" />
                              新增单元格清单
                            </button>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {!sortedInspectionModules.length ? (
                  <tr>
                    <td colSpan={selectedTemplateDefinitions.length + 1} className="text-center text-ink-muted">暂无检查模块。</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState message={phaseEditorMode === 'create' ? '新模板保存后可维护模块阶段矩阵。' : '当前模板暂无阶段定义。'} />
          </div>
        )}

        {activeChecklistDraft ? (
          <div className="mt-5 rounded-lg border border-outline bg-surface-soft p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                  {creatingCell ? <Plus className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                  {creatingCell ? '新增清单模板' : activeChecklistDraft.name}
                </div>
                <div className="text-xs text-ink-muted">
                  {selectedChecklistPhase?.name || activeChecklistDraft.phaseKey || '未设置阶段'} · {sortedInspectionModules.find(module => idOf(module.id) === activeChecklistDraft.moduleId)?.name || '未设置模块'}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!creatingCell && selectedChecklistTemplate ? (
                  <button
                    className="btn btn-ghost btn--sm"
                    type="button"
                    disabled={!canWrite || savingKey === `checklist-template-delete-${selectedChecklistTemplate.id}`}
                    onClick={() => void deleteSelectedChecklistTemplate()}
                  >
                    <Trash2 className="h-4 w-4" />
                    删除清单
                  </button>
                ) : null}
                <button
                  className="btn btn-ghost btn--sm"
                  type="button"
                  disabled={!canWrite || !activeChecklistDraft}
                  onClick={addDraftItem}
                >
                  <Plus className="h-4 w-4" />
                  新增模板检查项
                </button>
                <button
                  className="btn btn-primary btn--sm"
                  type="button"
                  disabled={!canWrite || invalidChecklistDraft || savingKey.startsWith('checklist-template')}
                  onClick={() => void saveChecklistTemplate()}
                >
                  <Save className="h-4 w-4" />
                  {savingKey === 'checklist-template-new' || savingKey === `checklist-template-${selectedChecklistTemplate?.id}` ? '保存中' : '保存清单'}
                </button>
              </div>
            </div>
            {message ? <div className="mt-3 text-sm text-ink-muted">{message}</div> : null}
            <div className="mt-4 grid gap-3 lg:grid-cols-6">
              <label>
                <span className="field-label">清单编码</span>
                <input className="input" value={activeChecklistDraft.code} disabled={!canWrite} onChange={event => updateActiveChecklistDraft({ code: event.target.value })} />
              </label>
              <label className="lg:col-span-2">
                <span className="field-label">清单名称</span>
                <input className="input" value={activeChecklistDraft.name} disabled={!canWrite} onChange={event => updateActiveChecklistDraft({ name: event.target.value })} />
              </label>
              <label>
                <span className="field-label">模块</span>
                <select className="select" value={activeChecklistDraft.moduleId} disabled={!canWrite} onChange={event => updateActiveChecklistDraft({ moduleId: event.target.value })}>
                  <option value="">选择模块</option>
                  {sortedInspectionModules.map(module => (
                    <option key={module.id} value={idOf(module.id)}>{module.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="field-label">阶段</span>
                <select className="select" value={activeChecklistDraft.phaseKey} disabled={!canWrite} onChange={event => updateActiveChecklistDraft({ phaseKey: event.target.value })}>
                  <option value="">选择阶段</option>
                  {selectedTemplateDefinitions.map(phase => (
                    <option key={phase.key} value={phase.key}>{phase.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="field-label">版本</span>
                <input className="input" type="number" min={1} value={activeChecklistDraft.version} disabled={!canWrite} onChange={event => updateActiveChecklistDraft({ version: event.target.value })} />
              </label>
              <label className="flex items-end gap-2 text-sm text-ink-muted">
                <input type="checkbox" checked={activeChecklistDraft.isActive} disabled={!canWrite} onChange={event => updateActiveChecklistDraft({ isActive: event.target.checked })} />
                启用
              </label>
            </div>
            <div className="table-shell mt-4">
              <table className="data-table min-w-[1280px]">
                <thead>
                  <tr>
                    <th>排序</th>
                    <th>模板检查项</th>
                    <th>描述/验收口径</th>
                    <th>优先级</th>
                    <th>计划开始</th>
                    <th>计划结束</th>
                    <th>启用</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedDraftItems.map((item, index) => (
                    <tr key={`${creatingCell ? 'new' : selectedChecklistTemplate?.id}-${index}`}>
                      <td className="min-w-[110px]">
                        <input
                          className="input"
                          type="number"
                          value={item.sortOrder ?? index * 10}
                          disabled={!canWrite}
                          onChange={event => updateDraftItem(index, { sortOrder: Number(event.target.value) })}
                          aria-label={`模板检查项 ${index + 1} 排序`}
                        />
                      </td>
                      <td className="min-w-[260px]">
                        <input
                          className="input"
                          value={item.title}
                          disabled={!canWrite}
                          onChange={event => updateDraftItem(index, { title: event.target.value })}
                          aria-label={`模板检查项 ${index + 1} 标题`}
                        />
                      </td>
                      <td className="min-w-[320px]">
                        <input
                          className="input"
                          value={item.description ?? ''}
                          disabled={!canWrite}
                          onChange={event => updateDraftItem(index, { description: event.target.value })}
                          aria-label={`模板检查项 ${index + 1} 描述`}
                        />
                      </td>
                      <td className="min-w-[130px]">
                        <input
                          className="input"
                          value={item.priority ?? ''}
                          disabled={!canWrite}
                          onChange={event => updateDraftItem(index, { priority: event.target.value })}
                          aria-label={`模板检查项 ${index + 1} 优先级`}
                        />
                      </td>
                      <td className="min-w-[150px]">
                        <input
                          className="input"
                          type="date"
                          value={dateInputValue(item.plannedStart)}
                          disabled={!canWrite}
                          onChange={event => updateDraftItem(index, { plannedStart: event.target.value || null })}
                          aria-label={`模板检查项 ${index + 1} 计划开始`}
                        />
                      </td>
                      <td className="min-w-[150px]">
                        <input
                          className="input"
                          type="date"
                          value={dateInputValue(item.plannedEnd)}
                          disabled={!canWrite}
                          onChange={event => updateDraftItem(index, { plannedEnd: event.target.value || null })}
                          aria-label={`模板检查项 ${index + 1} 计划结束`}
                        />
                      </td>
                      <td>
                        <label className="flex items-center gap-2 text-sm text-ink-muted">
                          <input
                            type="checkbox"
                            checked={item.isActive !== false}
                            disabled={!canWrite}
                            onChange={event => updateDraftItem(index, { isActive: event.target.checked })}
                          />
                          启用
                        </label>
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost btn--sm"
                          type="button"
                          disabled={!canWrite}
                          onClick={() => removeDraftItem(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!selectedDraftItems.length ? (
                    <tr>
                      <td colSpan={8} className="text-center text-ink-muted">该清单模板暂无检查项，可新增后保存。</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="mt-5">
            <EmptyState message="请选择矩阵中的清单模板，或点击空单元格新增清单模板。" />
          </div>
        )}
        {message && !activeChecklistDraft ? <div className="mt-3 text-sm text-ink-muted">{message}</div> : null}
      </section>
    </div>
  );
}

function BaseConfigView({
  data,
  scope,
  canWrite,
  onScopeChange,
  onSelectProject,
  onCreateProject,
  onUpdateProject,
  onProjectDeleted,
  onSeedTemplate,
  onUpdatePhase,
  onDeletePhase,
  onMigratePhaseCheckItems,
  onCreateCheckItem,
  onUpdateCheckItem,
  onDeleteCheckItem,
  onApplyModuleOwner
}: {
  data: WorkspaceData;
  scope: ScopeState;
  canWrite: boolean;
  onScopeChange: (scope: ScopeState) => void;
  onSelectProject: (projectId: string | number) => void;
  onCreateProject: (phaseTemplateId: string) => void;
  onUpdateProject: (project: Project, draft: ProjectConfigDraft) => Promise<Project>;
  onProjectDeleted: (project: Project) => void;
  onSeedTemplate: () => Promise<void>;
  onUpdatePhase: (phase: ProjectPhase, draft: PhaseConfigDraft) => Promise<ProjectPhase>;
  onDeletePhase: (phase: ProjectPhase) => Promise<void>;
  onMigratePhaseCheckItems: (phase: ProjectPhase, targetPhaseId: string) => Promise<number>;
  onCreateCheckItem: (draft: CheckItemConfigDraft) => Promise<void>;
  onUpdateCheckItem: (item: CheckItem, draft: CheckItemConfigDraft) => Promise<void>;
  onDeleteCheckItem: (item: CheckItem) => Promise<void>;
  onApplyModuleOwner: (module: InspectionModule, owners: CheckItemOwner[]) => Promise<{ affectedCount: number; cleared: boolean }>;
}) {
  const [projectFilters, setProjectFilters] = useState<SearchFilterState>(EMPTY_FILTERS);
  const [phaseFilters, setPhaseFilters] = useState<SearchFilterState>(EMPTY_FILTERS);
  const [moduleOwnerTargetId, setModuleOwnerTargetId] = useState('');
  const [matrixCell, setMatrixCell] = useState<{ moduleId: string; phaseId: string } | null>(null);
  const [createPhaseTemplateId, setCreatePhaseTemplateId] = useState('');
  const [createProjectPanelOpen, setCreateProjectPanelOpen] = useState(false);
  const [savingKey, setSavingKey] = useState('');
  const [message, setMessage] = useState('');
  const project = data.selectedProject;
  const projectEditor = useRecordEditor<Project, ProjectConfigDraft>(projectDraftFromProject, fetchProject, false);
  const phaseEditor = useRecordEditor<ProjectPhase, PhaseConfigDraft>(phaseConfigDraftFrom, fetchProjectPhase, false);
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
  const sortedInspectionModules = bySequence(data.inspectionModules);
  const moduleOwnerTarget = data.inspectionModules.find(module => idOf(module.id) === moduleOwnerTargetId) ?? null;
  const moduleOwnerAffectedCount = moduleOwnerTarget
    ? data.checkItems.filter(item => idOf(item.moduleId) === idOf(moduleOwnerTarget.id)).length
    : 0;
  const projectStatusOptions = statusOptionValues(data.projects.map(item => item.status));
  const phaseStatusOptions = statusOptionValues(data.phases.map(item => item.status));
  const sortedCreatePhaseTemplates = bySequence(data.phaseTemplates).filter(template => template.isActive !== false);
  const createPhaseTemplateKey = sortedCreatePhaseTemplates.map(template => `${idOf(template.id)}:${template.isActive}`).join('|');
  const projectWorkbench = (
    <>
      <ScopeToolbar
        hierarchy={data.hierarchy}
        scope={scope}
        onChange={onScopeChange}
      />
      <CreateProjectInstancePanel
        hierarchy={data.hierarchy}
        phaseTemplates={data.phaseTemplates}
        scope={scope}
        selectedPhaseTemplateId={createPhaseTemplateId}
        canWrite={canWrite}
        open={createProjectPanelOpen}
        onOpenChange={setCreateProjectPanelOpen}
        onChange={onScopeChange}
        onTemplateChange={setCreatePhaseTemplateId}
        onCreateProject={onCreateProject}
      />
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="kicker">Configuration Center</p>
            <h2 className="text-xl font-semibold">项目实例列表</h2>
            <p className="text-sm text-ink-muted">只展示项目实例；项目模板源数据请到侧边栏“项目模板”模块维护。</p>
          </div>
          <span className="chip">{visibleProjects.length}/{data.projects.length} 个项目实例</span>
        </div>
        <div className="mt-4">
          <FilterShell>
            <label className="xl:col-span-2">
              <span className="field-label">项目实例搜索</span>
              <input className="input" value={projectFilters.keyword} onChange={event => setProjectFilters({ ...projectFilters, keyword: event.target.value })} placeholder="项目实例、编号、范围、负责人" aria-label="配置中心项目实例搜索" />
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
                <th>项目实例</th>
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
                          void projectEditor.openRecord(item.id);
                        }}
                        aria-label={`配置项目实例 ${item.name}`}
                        aria-haspopup="dialog"
                      >
                        配置
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!visibleProjects.length ? (
                <tr>
                  <td colSpan={8} className="text-center text-ink-muted">当前范围与筛选下暂无项目实例，可调整筛选或展开“创建项目实例”。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <ProjectConfigDrawer
        editor={projectEditor}
        hierarchy={data.hierarchy}
        ownerCandidates={data.ownerCandidates}
        canWrite={canWrite}
        onSave={(record, draft) => onUpdateProject(record, draft)}
        onDeleted={onProjectDeleted}
      />
    </>
  );

  useEffect(() => {
    setMessage('');
    setMatrixCell(null);
    setModuleOwnerTargetId('');
    if (phaseEditor.open) phaseEditor.close();
    // 阶段抽屉有自己的未保存确认；切换项目只负责收起单元格抽屉。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  useEffect(() => {
    setCreatePhaseTemplateId(current =>
      sortedCreatePhaseTemplates.some(template => idOf(template.id) === current)
        ? current
        : idOf(sortedCreatePhaseTemplates.find(template => template.isActive !== false)?.id ?? sortedCreatePhaseTemplates[0]?.id)
    );
  }, [createPhaseTemplateKey]);

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

  if (!project) {
    return (
      <div className="grid gap-5">
        {projectWorkbench}
        <section className="panel">
          <h2 className="text-xl font-semibold">配置中心</h2>
          <p className="mt-3 text-sm text-ink-muted">请选择项目后维护阶段、检查项与模块负责人配置；项目基础信息与物理删除在项目实例列表的“配置”抽屉中处理。</p>
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
            <p className="kicker">Project Phases</p>
            <h2 className="text-xl font-semibold">项目阶段配置</h2>
            <p className="text-sm text-ink-muted">阶段 code 作为稳定 key 保留；项目展示按当前启用阶段数量渲染，也可按默认模板补齐当前项目实例缺失阶段和检查项。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip">{visiblePhases.length}/{sortedPhases.length} 阶段</span>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={!canWrite || savingKey === 'seed-template'}
              onClick={() => void save('seed-template', onSeedTemplate)}
              aria-label="按默认模板补齐项目实例"
              title="按默认模板补齐当前项目实例缺失的阶段和检查项，不会编辑项目模板源数据"
            >
              <RefreshCcw className="h-4 w-4" />
              {savingKey === 'seed-template' ? '补齐中' : '按默认模板补齐项目实例'}
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
                const phaseItems = data.checkItems.filter(item => idOf(item.projectPhaseId) === idOf(phase.id));
                const completedCount = phaseItems.filter(item => isComplete(item.status)).length;
                return (
                  <tr
                    key={phase.id}
                    className="cursor-pointer transition hover:bg-surface-soft"
                    tabIndex={0}
                    onClick={() => void phaseEditor.openRecord(phase.id)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        void phaseEditor.openRecord(phase.id);
                      }
                    }}
                  >
                    <td>{index + 1}</td>
                    <td className="min-w-[180px]">
                      <div className="font-semibold text-ink">{phase.name}</div>
                      <div className="mt-1 text-xs text-ink-muted">{phase.goal || '未设置阶段目标'}</div>
                    </td>
                    <td>{phase.code}</td>
                    <td className="min-w-[190px]">{formatDate(phase.plannedStartDate)} 至 {formatDate(phase.plannedEndDate)}</td>
                    <td><StatusPill status={phase.status} /></td>
                    <td>{phase.isActive === false ? '停用' : '启用'}</td>
                    <td>{phaseItems.length} 项</td>
                    <td>{completedCount}/{phaseItems.length}</td>
                    <td>
                      <button
                        className="btn btn-ghost btn--sm"
                        type="button"
                        onClick={event => {
                          event.stopPropagation();
                          void phaseEditor.openRecord(phase.id);
                        }}
                        aria-label={`配置阶段 ${phase.name}`}
                        aria-haspopup="dialog"
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
        {message ? <p role="status" className="mt-3 text-sm text-ink-muted">{message}</p> : null}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="kicker">Checklist</p>
            <h2 className="text-xl font-semibold">模块 × 阶段矩阵</h2>
            <p className="text-sm text-ink-muted">矩阵只展示数量、完成与启用摘要；点击单元格在抽屉中维护该模块在该阶段的检查项。</p>
          </div>
          <span className="chip">{sortedInspectionModules.length} 模块 · {visiblePhases.length} 阶段</span>
        </div>
        {visiblePhases.length && sortedInspectionModules.length ? (
          <div className="table-shell mt-4">
            <table className="data-table" style={{ minWidth: `${Math.max(960, 220 + visiblePhases.length * 220)}px` }}>
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-surface">检查模块</th>
                  {visiblePhases.map(phase => (
                    <th key={phase.id}>
                      <div className="font-semibold">{phase.name}</div>
                      <div className="mt-1 text-xs font-normal text-ink-muted">{phase.code}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedInspectionModules.map(module => (
                  <tr key={module.id}>
                    <td className="sticky left-0 z-10 min-w-[220px] bg-surface">
                      <div className="font-semibold text-ink">{module.name}</div>
                      <div className="mt-1 text-xs text-ink-muted">{module.code}</div>
                      <div className="mt-2"><StatusPill status={module.isActive ? 'active' : 'disabled'} /></div>
                    </td>
                    {visiblePhases.map(phase => {
                      const cellItems = data.checkItems.filter(
                        item => idOf(item.moduleId) === idOf(module.id) && idOf(item.projectPhaseId) === idOf(phase.id)
                      );
                      const completedCount = cellItems.filter(item => isComplete(item.status)).length;
                      const enabledCount = cellItems.filter(item => item.isActive !== false).length;
                      const active = matrixCell?.phaseId === idOf(phase.id) && matrixCell?.moduleId === idOf(module.id);
                      return (
                        <td key={`${module.id}-${phase.id}`} className="min-w-[220px] align-top">
                          <button
                            className={`w-full rounded-lg border p-3 text-left transition ${
                              active ? 'border-primary bg-primary/10' : 'border-outline bg-surface-soft hover:border-primary/50'
                            }`}
                            type="button"
                            onClick={() => setMatrixCell({ moduleId: idOf(module.id), phaseId: idOf(phase.id) })}
                            aria-label={`配置 ${module.name} ${phase.name} 检查项`}
                            aria-haspopup="dialog"
                          >
                            {cellItems.length ? (
                              <>
                                <div className="font-semibold text-ink">{cellItems.length} 项检查项</div>
                                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-ink-muted">
                                  <span className="chip">{completedCount}/{cellItems.length} 完成</span>
                                  <span className="chip">{enabledCount} 启用</span>
                                </div>
                                <div className="mt-2 text-xs text-ink-muted">
                                  {cellItems.slice(0, 2).map(item => item.title).join('、')}
                                  {cellItems.length > 2 ? ` 等 ${cellItems.length} 项` : ''}
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="font-semibold text-ink-muted">未配置</div>
                                <div className="mt-2 text-xs text-ink-muted">{canWrite ? '点击打开抽屉新增检查项' : '只读查看'}</div>
                              </>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState message="当前阶段筛选下暂无可维护的矩阵列，或暂无检查模块。" />
          </div>
        )}
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="kicker">Base Data</p>
            <h2 className="text-xl font-semibold">模块负责人配置</h2>
            <p className="text-sm text-ink-muted">为检查模块维护默认负责人；保存时单事务同步当前项目该模块的全部检查项，项目模板源数据在侧边栏“项目模板”模块维护。</p>
          </div>
          <span className="chip">{data.inspectionModules.length} 模块</span>
        </div>
        <div className="table-shell mt-4">
          <table className="data-table min-w-[900px]">
            <thead>
              <tr>
                <th>模块</th>
                <th>检查项</th>
                <th>模块负责人</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {bySequence(data.inspectionModules).map(module => {
                const moduleId = idOf(module.id);
                const moduleOwners = ownersOfModule(module);
                const moduleCheckItems = data.checkItems.filter(item => idOf(item.moduleId) === moduleId);
                return (
                  <tr key={module.id}>
                    <td className="min-w-[260px]">
                      <div className="font-semibold text-ink">{module.name}</div>
                      <div className="mt-1 text-xs text-ink-muted">{module.code}</div>
                    </td>
                    <td className="whitespace-nowrap text-ink-muted">{moduleCheckItems.length} 项</td>
                    <td className="min-w-[180px]">
                      {moduleOwners.length ? (
                        <div className="flex items-center gap-2">
                          <OwnerAvatarStack owners={moduleOwners} maxVisible={4} />
                          <span className="text-xs text-ink-muted">{moduleOwners.map(owner => owner.displayName || owner.idaasId).join('、')}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-ink-muted">未设置</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      <StatusPill status={module.isActive ? 'active' : 'disabled'} />
                    </td>
                    <td className="min-w-[160px]">
                      <button
                        className="btn btn-ghost btn--sm"
                        type="button"
                        onClick={() => setModuleOwnerTargetId(moduleId)}
                        aria-label={`配置模块负责人 ${module.name}`}
                        aria-haspopup="dialog"
                      >
                        <Settings2 className="h-4 w-4" />
                        配置
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!data.inspectionModules.length ? (
                <tr>
                  <td colSpan={5} className="text-center text-ink-muted">暂无检查模块。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <PhaseConfigDrawer
        editor={phaseEditor}
        phases={sortedPhases}
        checkItems={data.checkItems}
        canWrite={canWrite}
        onSave={(phase, draft) => onUpdatePhase(phase, draft)}
        onDelete={onDeletePhase}
        onMigrateItems={onMigratePhaseCheckItems}
      />
      <MatrixCellDrawer
        project={project}
        cell={matrixCell}
        phases={sortedPhases}
        modules={sortedInspectionModules}
        checkItems={data.checkItems}
        ownerCandidates={data.ownerCandidates}
        canWrite={canWrite}
        onCreate={onCreateCheckItem}
        onUpdate={onUpdateCheckItem}
        onDelete={onDeleteCheckItem}
        onClose={() => setMatrixCell(null)}
      />
      <ModuleOwnerDrawer
        module={moduleOwnerTarget}
        projectName={project?.name ?? ''}
        affectedCount={moduleOwnerAffectedCount}
        ownerCandidates={data.ownerCandidates}
        canWrite={canWrite}
        onApply={async (module, owners) => {
          const result = await onApplyModuleOwner(module, owners);
          setMessage(
            result.cleared
              ? `已清空模块「${module.name}」默认负责人，并同步清空 ${result.affectedCount} 个检查项。`
              : `已保存模块「${module.name}」负责人，并同步 ${result.affectedCount} 个检查项。`
          );
          return result;
        }}
        onClose={() => setModuleOwnerTargetId('')}
      />
    </div>
  );
}

function SettingsView({ data }: { data: WorkspaceData }) {
  return (
    <div className="grid gap-5">
      <section className="panel">
        <h2 className="text-xl font-semibold">检查模块</h2>
        <p className="mt-2 text-sm text-ink-muted">设置 fallback 仅展示模块基础状态；负责人通过配置中心搜索选择。</p>
        <div className="table-shell mt-4">
          <table className="data-table">
            <thead>
              <tr>
                <th>模块</th>
                <th>编码</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {bySequence(data.inspectionModules).map(module => (
                <tr key={module.id}>
                  <td className="font-semibold text-ink">{module.name}</td>
                  <td className="text-ink-muted">{module.code}</td>
                  <td><StatusPill status={module.isActive ? 'active' : 'disabled'} /></td>
                </tr>
              ))}
              {!data.inspectionModules.length ? (
                <tr>
                  <td colSpan={3} className="text-center text-ink-muted">暂无检查模块。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
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
      initZeus(nextProfile);
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

  const loadSequence = useRef(0);
  const loadData = async (projectId = selectedProjectId, filters = scope) => {
    const sequence = ++loadSequence.current;
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
      if (sequence !== loadSequence.current) return;
      setWorkspace(next);
      setSelectedProjectId(next.selectedProject?.id);
    } catch (err) {
      if (sequence === loadSequence.current) setError(err instanceof Error ? err.message : '数据加载失败');
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  };

  useEffect(() => {
    void loadAuth();
    void loadData();
  }, []);

  const previousView = useRef(currentView);
  useEffect(() => {
    const prior = previousView.current;
    previousView.current = currentView;
    if (currentView !== 'dashboard') return;
    if (prior === 'dashboard' && !scope.factoryId && !scope.workshopId && !scope.productionLineId) return;
    setScope(EMPTY_SCOPE);
    void loadData(selectedProjectId, EMPTY_SCOPE);
  }, [currentView]);

  const handleScopeChange = (nextScope: ScopeState) => {
    if (!allowEditorNavigation()) return;
    setScope(nextScope);
    void loadData(undefined, nextScope);
  };

  const handleSelectCurrentProject = (projectId: string | number) => {
    if (!projectId || !allowEditorNavigation()) return;
    setScope(EMPTY_SCOPE);
    setSelectedProjectId(projectId);
    void loadData(projectId, EMPTY_SCOPE);
  };

  const handleOpenProjectView = (projectId: string | number, view: DashboardJumpTarget) => {
    if (!projectId || !allowEditorNavigation()) return;
    setScope(EMPTY_SCOPE);
    setSelectedProjectId(projectId);
    setCurrentView(view);
    void loadData(projectId, EMPTY_SCOPE);
  };

  const handleCreateProject = async (
    nextView: AppTab = 'baseConfig',
    phaseTemplateId?: string | number | null
  ) => {
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
        plannedEndDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10),
        phaseTemplateId: phaseTemplateId || undefined
      });
      await loadData(project.id);
      setCurrentView(nextView);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建项目失败');
    }
  };

  const handleCheckItemSaved = (item: CheckItem) => {
    const upsert = (items: CheckItem[]) => items.some(current => idOf(current.id) === idOf(item.id))
      ? items.map(current => idOf(current.id) === idOf(item.id) ? item : current)
      : [...items, item];
    setWorkspace(current => idOf(current.selectedProject?.id) !== idOf(item.projectId) ? current : {
      ...current,
      checkItems: upsert(current.checkItems),
      timeline: current.timeline ? { ...current.timeline, checkItems: upsert(current.timeline.checkItems) } : null
    });
  };

  const handleCheckItemRemoved = (item: CheckItem) => {
    const without = (items: CheckItem[]) => items.filter(current => idOf(current.id) !== idOf(item.id));
    setWorkspace(current => idOf(current.selectedProject?.id) !== idOf(item.projectId) ? current : {
      ...current,
      checkItems: without(current.checkItems),
      timeline: current.timeline ? { ...current.timeline, checkItems: without(current.timeline.checkItems) } : null
    });
  };

  const handleUpdateOwner = async (item: CheckItem, owners: CheckItemOwner[]) => {
    if (!canWrite) return;
    try {
      await updateCheckItemOwner(item.id, { owners, metadata: item.metadata });
      await loadData();
    } catch (err) {
      setError(mutationErrorMessage(err, '负责人更新失败'));
      throw err;
    }
  };

  const handleApplyModuleOwner = async (
    module: InspectionModule,
    owners: CheckItemOwner[]
  ): Promise<{ affectedCount: number; cleared: boolean }> => {
    if (!canWrite) throw new Error('当前账号没有写权限，已保留只读访问。');
    if (!workspace.selectedProject) throw new Error('请先在配置中心选择项目实例。');
    try {
      const result = await applyInspectionModuleOwner(module.id, {
        projectId: workspace.selectedProject.id,
        owners: normalizeOwners(owners)
      });
      await loadData();
      return { affectedCount: result.affectedCount, cleared: result.cleared };
    } catch (err) {
      setError(mutationErrorMessage(err, '模块负责人保存失败'));
      throw err;
    }
  };

  const handleCreatePhaseTemplateConfig = async (input: CreatePhaseTemplateInput) => {
    if (!canWrite) throw new Error('当前账号没有写权限，已保留只读访问。');
    try {
      const created = await createPhaseTemplate(input);
      await loadData();
      return created;
    } catch (err) {
      setError(mutationErrorMessage(err, '项目模板源数据新增失败'));
      throw err;
    }
  };

  const handleUpdatePhaseTemplateConfig = async (
    template: PhaseTemplate,
    input: UpdatePhaseTemplateInput
  ) => {
    if (!canWrite) throw new Error('当前账号没有写权限，已保留只读访问。');
    try {
      const updated = await updatePhaseTemplate(template.id, input);
      await loadData();
      return updated;
    } catch (err) {
      setError(mutationErrorMessage(err, '项目模板源数据保存失败'));
      throw err;
    }
  };

  const handleDeletePhaseTemplateConfig = async (template: PhaseTemplate) => {
    if (!canWrite) throw new Error('当前账号没有写权限，已保留只读访问。');
    try {
      const relatedChecklists = workspace.checklistTemplates.filter(item =>
        idOf(item.phaseTemplateId) === idOf(template.id)
      );
      for (const checklist of relatedChecklists) {
        await deleteChecklistTemplate(checklist.id);
      }
      await deletePhaseTemplate(template.id);
      await loadData();
    } catch (err) {
      setError(mutationErrorMessage(err, '项目模板源数据删除失败'));
      throw err;
    }
  };

  const handleCopyPhaseTemplateConfig = async (template: PhaseTemplate) => {
    if (!canWrite) throw new Error('当前账号没有写权限，已保留只读访问。');
    const sourceChecklists = workspace.checklistTemplates.filter(item =>
      idOf(item.phaseTemplateId) === idOf(template.id)
    );
    const copiedCode = makeUniqueTemplateCode(
      `${template.code}-draft`,
      workspace.phaseTemplates.map(item => item.code)
    );
    try {
      const copiedPhaseTemplate = await createPhaseTemplate({
        code: copiedCode,
        name: `${template.name} 草稿`,
        version: template.version ?? 1,
        description: template.description ?? '',
        isActive: false,
        phaseDefinitions: phaseDefinitionsOf(template),
        metadata: {
          ...(template.metadata ?? {}),
          copied_from: {
            type: 'phase_template',
            id: template.id,
            code: template.code,
            version: template.version ?? 1
          }
        }
      });
      const checklistCodes = workspace.checklistTemplates.map(item => item.code);
      for (const checklist of sourceChecklists) {
        const copiedChecklistCode = makeUniqueTemplateCode(
          `${copiedCode}-${checklist.code}`,
          checklistCodes
        );
        checklistCodes.push(copiedChecklistCode);
        await createChecklistTemplate({
          code: copiedChecklistCode,
          name: checklist.name || checklist.title,
          moduleId: checklist.moduleId,
          phaseTemplateId: copiedPhaseTemplate.id,
          phaseKey: checklist.phaseKey ?? '',
          version: checklist.version ?? 1,
          isActive: checklist.isActive !== false,
          itemTemplates: normalizeTemplateItemsForDraft(checklistItemsOf(checklist)),
          metadata: {
            ...(checklist.metadata ?? {}),
            copied_from: {
              type: 'checklist_template',
              id: checklist.id,
              code: checklist.code,
              phase_template_id: template.id
            }
          }
        });
      }
      await loadData();
      return copiedPhaseTemplate;
    } catch (err) {
      setError(mutationErrorMessage(err, '项目模板源数据复制失败'));
      throw err;
    }
  };

  const handleCreateChecklistTemplateConfig = async (input: CreateChecklistTemplateInput) => {
    if (!canWrite) throw new Error('当前账号没有写权限，已保留只读访问。');
    try {
      const created = await createChecklistTemplate(input);
      await loadData();
      return created;
    } catch (err) {
      setError(mutationErrorMessage(err, '清单模板新增失败'));
      throw err;
    }
  };

  const handleUpdateChecklistTemplateConfig = async (
    template: ChecklistTemplate,
    input: UpdateChecklistTemplateInput
  ) => {
    if (!canWrite) throw new Error('当前账号没有写权限，已保留只读访问。');
    try {
      const updated = await updateChecklistTemplate(template.id, input);
      await loadData();
      return updated;
    } catch (err) {
      setError(mutationErrorMessage(err, '清单模板保存失败'));
      throw err;
    }
  };

  const handleDeleteChecklistTemplateConfig = async (template: ChecklistTemplate) => {
    if (!canWrite) throw new Error('当前账号没有写权限，已保留只读访问。');
    try {
      await deleteChecklistTemplate(template.id);
      await loadData();
    } catch (err) {
      setError(mutationErrorMessage(err, '清单模板删除失败'));
      throw err;
    }
  };

  const handleCreateInspectionModuleConfig = async (input: InspectionModuleInput) => {
    if (!canWrite) throw new Error('当前账号没有写权限，已保留只读访问。');
    try {
      const created = await createInspectionModule(input);
      await loadData();
      return created;
    } catch (err) {
      setError(mutationErrorMessage(err, '检查模块新增失败'));
      throw err;
    }
  };

  const handleUpdateInspectionModuleConfig = async (
    module: InspectionModule,
    input: InspectionModuleInput
  ) => {
    if (!canWrite) throw new Error('当前账号没有写权限，已保留只读访问。');
    try {
      const updated = await updateInspectionModule(module.id, input);
      await loadData();
      return updated;
    } catch (err) {
      setError(mutationErrorMessage(err, '检查模块保存失败'));
      throw err;
    }
  };

  const handleDeleteInspectionModuleConfig = async (module: InspectionModule) => {
    if (!canWrite) throw new Error('当前账号没有写权限，已保留只读访问。');
    try {
      await deleteInspectionModule(module.id);
      await loadData();
    } catch (err) {
      setError(mutationErrorMessage(err, '检查模块删除失败'));
      throw err;
    }
  };

  const handleUpdateCheckItemStatus = async (item: CheckItem, status: CheckItemStatus, source: string) => {
    if (!canWrite) return;
    try {
      await updateCheckItemStatus(item.id, {
        status,
        source,
        comment: `${STATUS_LABEL[item.status] ?? item.status} -> ${STATUS_LABEL[status] ?? status}`
      });
      await loadData();
    } catch (err) {
      setError(mutationErrorMessage(err, '检查项状态更新失败'));
      throw err;
    }
  };

  const handleUploadCheckItemAttachment = async (item: CheckItem, file: File) => {
    if (!canWrite) return;
    try {
      await uploadAttachment({
        file,
        projectId: item.projectId,
        objectType: 'check_item',
        objectId: item.id
      });
      await loadData();
    } catch (err) {
      setError(mutationErrorMessage(err, '附件上传失败'));
      throw err;
    }
  };

  const handleUploadKeyIssueAttachment = async (issue: KeyIssue, file: File, metadata?: Record<string, unknown>) => {
    if (!canWrite) return;
    try {
      await uploadAttachment({
        file,
        projectId: issue.projectId,
        objectType: 'key_issue',
        objectId: issue.id,
        metadata
      });
    } catch (err) {
      setError(mutationErrorMessage(err, '重点问题附件上传失败'));
      throw err;
    }
  };

  const handleUploadCollisionReportAttachment = async (report: CollisionReport, file: File, metadata?: Record<string, unknown>) => {
    if (!canWrite) return;
    try {
      await uploadAttachment({
        file,
        projectId: report.projectId,
        objectType: 'collision_report',
        objectId: report.id,
        metadata
      });
    } catch (err) {
      setError(mutationErrorMessage(err, '一页纸附件上传失败'));
      throw err;
    }
  };

  const handleDownloadAttachment: AttachmentDownloadHandler = async (attachment, signal) => {
    if (!canWrite) throw new Error('当前账号没有附件下载权限。');
    const result = await fetchAttachmentDownload(attachment.id, attachment.fileName, signal);
    signal?.throwIfAborted();
    downloadBlobFile(safeDownloadFileName(result.fileName || attachment.fileName, 'attachment'), result.blob);
  };

  const handleDeleteAttachment = async (attachment: Attachment) => {
    if (!canWrite) return;
    try {
      await deleteAttachment(attachment.id);
      await loadData(workspace.selectedProject?.id);
    } catch (err) {
      setError(mutationErrorMessage(err, '附件删除失败'));
      throw err;
    }
  };

  const handleUpdateAttachmentCaption = async (attachment: Attachment, caption: string) => {
    if (!canWrite) return;
    try {
      await updateAttachmentMetadata(attachment.id, { ...(attachment.metadata ?? {}), caption });
      await loadData(workspace.selectedProject?.id);
    } catch (err) {
      setError(mutationErrorMessage(err, '图片说明保存失败'));
      throw err;
    }
  };

  const handleUpdateProject = async (project: Project, draft: ProjectConfigDraft): Promise<Project> => {
    if (!canWrite) throw new Error('当前账号没有写权限，已保留只读访问。');
    const factory = workspace.hierarchy.factories.find(item => idOf(item.id) === draft.factoryId);
    const workshop = workspace.hierarchy.workshops.find(item => idOf(item.id) === draft.workshopId);
    const productionLine = workspace.hierarchy.productionLines.find(item => idOf(item.id) === draft.productionLineId);

    try {
      const updated = await updateProject(project.id, {
        name: draft.name,
        code: draft.code,
        status: draft.status,
        description: draft.description,
        factoryId: draft.factoryId || null,
        workshopId: draft.workshopId || null,
        productionLineId: draft.productionLineId || null,
        plant: factory?.name ?? project.plant,
        workshopName: workshop?.name,
        lineName: productionLine?.name ?? '车间级项目',
        ownerName: draft.ownerName,
        plannedStartDate: draft.plannedStartDate,
        plannedEndDate: draft.plannedEndDate,
        metadata: project.metadata
      });
      await loadData(idOf(workspace.selectedProject?.id) === idOf(project.id) ? project.id : workspace.selectedProject?.id);
      return updated;
    } catch (err) {
      setError(mutationErrorMessage(err, '项目基础信息保存失败'));
      throw err;
    }
  };

  const handleProjectDeleted = (project: Project) => {
    const wasSelected = idOf(workspace.selectedProject?.id) === idOf(project.id);
    if (wasSelected) {
      setSelectedProjectId(undefined);
      void loadData(undefined);
    } else {
      void loadData();
    }
  };

  const handleUpdatePhase = async (phase: ProjectPhase, draft: PhaseConfigDraft): Promise<ProjectPhase> => {
    if (!canWrite) throw new Error('readonly');
    try {
      const updated = await updateProjectPhase(phase.id, {
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
      return updated;
    } catch (err) {
      setError(mutationErrorMessage(err, '阶段配置保存失败'));
      throw err;
    }
  };

  const handleMigratePhaseCheckItems = async (phase: ProjectPhase, targetPhaseId: string): Promise<number> => {
    if (!canWrite || !workspace.selectedProject) return 0;
    const target = workspace.phases.find(item => idOf(item.id) === targetPhaseId);
    if (!target || idOf(target.id) === idOf(phase.id)) return 0;
    const items = workspace.checkItems.filter(item => idOf(item.projectPhaseId) === idOf(phase.id));
    try {
      for (const item of items) {
        const draft = checkItemConfigDraftFrom(item);
        await updateCheckItem(item.id, {
          title: draft.title,
          moduleId: draft.moduleId,
          projectPhaseId: targetPhaseId,
          tags: draft.tags.split(/[,，、]/).map(tag => tag.trim()).filter(Boolean),
          plannedStartDate: draft.plannedStartDate || dateInputValue(target.plannedStartDate),
          plannedEndDate: draft.plannedEndDate || dateInputValue(target.plannedEndDate),
          ownerName: undefined,
          ownerIdaasId: undefined,
          owners: ownersFromDraft(draft),
          status: draft.status,
          isActive: draft.isActive,
          progressPercent: item.progressPercent,
          metadata: item.metadata
        });
      }
      await loadData();
      return items.length;
    } catch (err) {
      setError(mutationErrorMessage(err, '检查项迁移失败'));
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
        ownerName: undefined,
        ownerIdaasId: undefined,
        owners: ownersFromDraft(draft),
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
        ownerName: undefined,
        ownerIdaasId: undefined,
        owners: ownersFromDraft(draft),
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

  const handleCreateKeyIssue = async (draft: KeyIssueDraft) => {
    if (!canWrite || !workspace.selectedProject) return null;
    try {
      const issue = await createKeyIssue(workspace.selectedProject.id, {
        projectPhaseId: draft.projectPhaseId || null,
        moduleId: draft.moduleId || null,
        checkItemId: draft.checkItemId || null,
        title: draft.title,
        description: draft.description,
        severity: draft.severity,
        status: draft.status,
        supplier: draft.supplier,
        ownerName: draft.ownerName,
        confirmer: draft.confirmer,
        dueDate: draft.dueDate,
        countermeasure: draft.countermeasure,
        currentProgress: draft.currentProgress,
        remark: draft.remark,
        problemPhotoBucketName: draft.problemPhotoBucketName,
        problemPhotoObjectKey: draft.problemPhotoObjectKey,
        imageCaptions: draft.imageCaptions
      });
      setWorkspace(current => current.selectedProject?.id === issue.projectId ? { ...current, keyIssues: [issue, ...current.keyIssues] } : current);
      return issue;
    } catch (err) {
      setError(mutationErrorMessage(err, '重点问题新增失败'));
      throw err;
    }
  };

  const handleUpdateKeyIssue = async (issue: KeyIssue, draft: KeyIssueDraft) => {
    if (!canWrite) return null;
    try {
      const updated = await updateKeyIssue(issue.id, {
        projectPhaseId: draft.projectPhaseId || null,
        moduleId: draft.moduleId || null,
        checkItemId: draft.checkItemId || null,
        title: draft.title,
        description: draft.description,
        severity: draft.severity,
        status: draft.status,
        supplier: draft.supplier,
        ownerName: draft.ownerName,
        confirmer: draft.confirmer,
        dueDate: draft.dueDate,
        countermeasure: draft.countermeasure,
        currentProgress: draft.currentProgress,
        remark: draft.remark,
        problemPhotoBucketName: draft.problemPhotoBucketName,
        problemPhotoObjectKey: draft.problemPhotoObjectKey,
        imageCaptions: draft.imageCaptions,
        metadata: issue.metadata
      });
      setWorkspace(current => ({ ...current, keyIssues: current.keyIssues.map(item => item.id === updated.id ? updated : item) }));
      return updated;
    } catch (err) {
      setError(mutationErrorMessage(err, '重点问题保存失败'));
      throw err;
    }
  };

  const handleDeleteKeyIssue = async (issue: KeyIssue) => {
    if (!canWrite) return;
    try {
      await deleteKeyIssue(issue.id);
      setWorkspace(current => ({ ...current, keyIssues: current.keyIssues.filter(item => item.id !== issue.id) }));
    } catch (err) {
      setError(mutationErrorMessage(err, '重点问题删除失败'));
      throw err;
    }
  };

  const handleImportKeyIssues = async (file: File) => {
    if (!canWrite || !workspace.selectedProject) return;
    try {
      await importKeyIssuesCsv(workspace.selectedProject.id, file);
      await loadData(workspace.selectedProject.id);
    } catch (err) {
      setError(mutationErrorMessage(err, '重点问题 CSV 导入失败'));
      throw err;
    }
  };

  const handleExportKeyIssues = async () => {
    if (!canWrite || !workspace.selectedProject) return;
    try {
      const csv = await exportKeyIssuesCsv(workspace.selectedProject.id);
      downloadTextFile(`${workspace.selectedProject.code || workspace.selectedProject.id}-key-issues.csv`, csv);
    } catch (err) {
      setError(mutationErrorMessage(err, '重点问题 CSV 导出失败'));
      throw err;
    }
  };

  const handleCreateCollisionReport = async (draft: CollisionDraft) => {
    if (!canWrite || !workspace.selectedProject) return null;
    try {
      const report = await createCollisionReport(workspace.selectedProject.id, { ...draft, projectPhaseId: draft.projectPhaseId || null });
      setWorkspace(current => current.selectedProject?.id === report.projectId ? { ...current, collisionReports: [report, ...current.collisionReports] } : current);
      return report;
    } catch (err) {
      setError(mutationErrorMessage(err, '碰撞一页纸新增失败'));
      throw err;
    }
  };

  const handleUpdateCollisionReport = async (report: CollisionReport, draft: CollisionDraft) => {
    if (!canWrite) return null;
    try {
      const updated = await updateCollisionReport(report.id, {
        ...draft,
        projectPhaseId: draft.projectPhaseId || null,
        content: report.content,
        metadata: report.metadata
      });
      setWorkspace(current => ({ ...current, collisionReports: current.collisionReports.map(item => item.id === updated.id ? updated : item) }));
      return updated;
    } catch (err) {
      setError(mutationErrorMessage(err, '碰撞一页纸保存失败'));
      throw err;
    }
  };

  const handleDeleteCollisionReport = async (report: CollisionReport) => {
    if (!canWrite) return;
    try {
      await deleteCollisionReport(report.id);
      setWorkspace(current => ({ ...current, collisionReports: current.collisionReports.filter(item => item.id !== report.id) }));
    } catch (err) {
      setError(mutationErrorMessage(err, '碰撞一页纸删除失败'));
      throw err;
    }
  };

  const handleImportCollisionReports = async (file: File) => {
    if (!canWrite || !workspace.selectedProject) return;
    try {
      await importCollisionReportsCsv(workspace.selectedProject.id, file);
      await loadData(workspace.selectedProject.id);
    } catch (err) {
      setError(mutationErrorMessage(err, '碰撞一页纸 CSV 导入失败'));
      throw err;
    }
  };

  const handleExportCollisionReports = async () => {
    if (!canWrite || !workspace.selectedProject) return;
    try {
      const csv = await exportCollisionReportsCsv(workspace.selectedProject.id);
      downloadTextFile(`${workspace.selectedProject.code || workspace.selectedProject.id}-collision-reports.csv`, csv);
    } catch (err) {
      setError(mutationErrorMessage(err, '碰撞一页纸 CSV 导出失败'));
      throw err;
    }
  };

  const handleDownloadCollisionReportTemplate = async () => {
    if (!canWrite) return;
    try {
      const result = await downloadCollisionReportTemplateExcel();
      downloadBlobFile(result.fileName || 'collision_one_pager_template.xlsx', result.blob);
    } catch (err) {
      setError(mutationErrorMessage(err, '碰撞一页纸模板下载失败'));
      throw err;
    }
  };

  const handleExportCollisionReportExcel = async (report: CollisionReport) => {
    if (!canWrite) return;
    try {
      const result = await exportCollisionReportExcel(report.id);
      const fallbackName = `${(report.title || `collision-report-${report.id}`).replace(/[\\/:*?"<>|]/g, '_')}.xlsx`;
      downloadBlobFile(result.fileName || fallbackName, result.blob);
    } catch (err) {
      setError(mutationErrorMessage(err, '碰撞一页纸 Excel 导出失败'));
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
    <div className="grid min-w-0 grid-cols-1 gap-5">
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
    if (currentView === 'templates') {
      return (
        <ProjectTemplateView
          data={workspace}
          canWrite={canWrite}
          onCreatePhaseTemplate={handleCreatePhaseTemplateConfig}
          onUpdatePhaseTemplate={handleUpdatePhaseTemplateConfig}
          onDeletePhaseTemplate={handleDeletePhaseTemplateConfig}
          onCopyPhaseTemplate={handleCopyPhaseTemplateConfig}
          onCreateChecklistTemplate={handleCreateChecklistTemplateConfig}
          onDeleteChecklistTemplate={handleDeleteChecklistTemplateConfig}
          onUpdateChecklistTemplate={handleUpdateChecklistTemplateConfig}
          onCreateInspectionModule={handleCreateInspectionModuleConfig}
          onUpdateInspectionModule={handleUpdateInspectionModuleConfig}
          onDeleteInspectionModule={handleDeleteInspectionModuleConfig}
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
          onCreateProject={phaseTemplateId => void handleCreateProject('baseConfig', phaseTemplateId)}
          onUpdateProject={handleUpdateProject}
          onProjectDeleted={handleProjectDeleted}
          onSeedTemplate={handleSeedTemplate}
          onUpdatePhase={handleUpdatePhase}
          onDeletePhase={handleDeletePhase}
          onMigratePhaseCheckItems={handleMigratePhaseCheckItems}
          onCreateCheckItem={handleCreateCheckItemConfig}
          onUpdateCheckItem={handleUpdateCheckItemConfig}
          onDeleteCheckItem={handleDeleteCheckItem}
          onApplyModuleOwner={handleApplyModuleOwner}
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
          ownerCandidates={workspace.ownerCandidates}
          canWrite={canWrite}
          onUpdateStatus={handleUpdateCheckItemStatus}
          onUpdateOwner={handleUpdateOwner}
          onUploadAttachment={handleUploadCheckItemAttachment}
          onDownloadAttachment={handleDownloadAttachment}
          onDeleteAttachment={handleDeleteAttachment}
          onUpdateAttachmentCaption={handleUpdateAttachmentCaption}
        />
      );
    }
    if (currentView === 'checks') {
      return withProjectContext(
        <ChecksView
          key={workspace.selectedProject?.id ?? 'no-project'}
          project={workspace.selectedProject}
          phases={workspace.phases}
          modules={workspace.inspectionModules}
          ownerCandidates={workspace.ownerCandidates}
          canWrite={canWrite}
          workspaceLoading={loading}
          defaultOwner={
            profile?.userId
              ? { idaasId: profile.userId, displayName: profile.displayName, email: profile.email, avatarUrl: profile.avatarUrl }
              : undefined
          }
          onSaved={handleCheckItemSaved}
          onRemoved={handleCheckItemRemoved}
          onDownloadAttachment={handleDownloadAttachment}
        />
      );
    }
    if (currentView === 'issues') {
      return withProjectContext(
        <IssuesCrudView
          key={workspace.selectedProject?.id ?? 'no-project'}
          project={workspace.selectedProject}
          phases={workspace.phases}
          modules={workspace.inspectionModules}
          checkItems={workspace.checkItems}
          canWrite={canWrite}
          workspaceLoading={loading}
          onCreateIssue={handleCreateKeyIssue}
          onUpdateIssue={handleUpdateKeyIssue}
          onDeleteIssue={handleDeleteKeyIssue}
          onImportCsv={handleImportKeyIssues}
          onExportCsv={handleExportKeyIssues}
          onUploadIssueAttachment={handleUploadKeyIssueAttachment}
          onDownloadAttachment={handleDownloadAttachment}
          onDeleteAttachment={async attachment => { if (canWrite) await deleteAttachment(attachment.id); }}
          onUpdateAttachmentCaption={async (attachment, caption) => { if (canWrite) await updateAttachmentMetadata(attachment.id, { ...(attachment.metadata ?? {}), caption }); }}
        />
      );
    }
    if (currentView === 'collision') {
      return withProjectContext(
        <CollisionCrudView
          key={workspace.selectedProject?.id ?? 'no-project'}
          project={workspace.selectedProject}
          phases={workspace.phases}
          canWrite={canWrite}
          workspaceLoading={loading}
          onCreateReport={handleCreateCollisionReport}
          onUpdateReport={handleUpdateCollisionReport}
          onDeleteReport={handleDeleteCollisionReport}
          onImportCsv={handleImportCollisionReports}
          onExportCsv={handleExportCollisionReports}
          onDownloadTemplate={handleDownloadCollisionReportTemplate}
          onExportExcel={handleExportCollisionReportExcel}
          onUploadReportAttachment={handleUploadCollisionReportAttachment}
          onDownloadAttachment={handleDownloadAttachment}
          onDeleteAttachment={async attachment => { if (canWrite) await deleteAttachment(attachment.id); }}
          onUpdateAttachmentCaption={async (attachment, caption) => { if (canWrite) await updateAttachmentMetadata(attachment.id, { ...(attachment.metadata ?? {}), caption }); }}
        />
      );
    }
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
        onChangeView={view => { if (view === currentView || allowEditorNavigation()) setCurrentView(view); }}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        profile={profile}
        warning={authWarning}
        theme={theme}
        onToggleTheme={toggleTheme}
        isDesktopCollapsed={isCollapsed}
        onToggleDesktopCollapsed={toggleCollapsed}
      />
      <div className={`min-w-0 w-full flex-1 transition-[padding] duration-200 ${isCollapsed ? 'lg:pl-20' : 'lg:pl-72'}`}>
        <header className="sticky top-0 z-20 border-b border-outline bg-surface/95 px-4 py-3 backdrop-blur sm:px-5 lg:px-6 xl:px-7 2xl:px-8">
          <div className="flex w-full flex-wrap items-center justify-between gap-4">
            <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto sm:flex-1">
              <MobileMenuButton onClick={() => setSidebarOpen(true)} />
              <div className="min-w-0">
                <p className="kicker">理想BIW云上产线-AutoStatus</p>
                <h1 className="truncate text-lg font-semibold sm:text-xl">
                  Auto Status 自动化项目状态
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                  <span className="truncate">焊装自动化六阶段项目状态、检查项、风险签核与一页纸导出</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <a className="btn btn-ghost btn--sm inline-flex items-center gap-1.5" href={resolvePortalUrl()}>
                <Home size={16} />
                返回门户
              </a>
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
