import { ApiError, apiRequest } from './http';
import type {
  ApiEnvelope,
  Attachment,
  CheckItem,
  ChecklistTemplate,
  CollisionReport,
  ExportTask,
  InspectionModule,
  KeyIssue,
  OwnerCandidate,
  PhaseTemplate,
  Project,
  ProjectPhase,
  ReportDefinition,
  WorkspaceData
} from '../types';

const unwrap = <T>(payload: ApiEnvelope<T> | T): T => {
  if (payload && typeof payload === 'object') {
    const envelope = payload as ApiEnvelope<T>;
    if (envelope.data !== undefined) return envelope.data;
    if (envelope.results !== undefined) return envelope.results;
    if (envelope.items !== undefined) return envelope.items;
  }
  return payload as T;
};

type RawRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is RawRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const asRecord = (value: unknown): RawRecord => (isRecord(value) ? value : {});

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const asString = (value: unknown, fallback = '') =>
  typeof value === 'string' && value.trim() ? value : fallback;

const asNumber = (value: unknown, fallback = 0) => {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const asBoolean = (value: unknown, fallback = false) =>
  typeof value === 'boolean' ? value : fallback;

const firstString = (record: RawRecord, keys: string[], fallback = '') => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return fallback;
};

const firstNumber = (record: RawRecord, keys: string[], fallback = 0) => {
  for (const key of keys) {
    const value = record[key];
    const numberValue = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return fallback;
};

const firstId = (record: RawRecord, keys: string[], fallback: string | number = '') => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' || typeof value === 'number') return value;
  }
  return fallback;
};

const metadataOf = (record: RawRecord) => asRecord(record.metadata);

const normalizeAttachment = (input: unknown): Attachment => {
  const raw = asRecord(input);
  return {
    id: firstId(raw, ['id']),
    fileName: firstString(raw, ['fileName', 'file_name']),
    objectKey: firstString(raw, ['objectKey', 'object_key']),
    downloadUrl: firstString(raw, ['downloadUrl', 'download_url']) || null,
    contentType: firstString(raw, ['contentType', 'content_type']),
    fileSize: firstNumber(raw, ['fileSize', 'file_size']),
    uploadedBy: firstString(raw, ['uploadedBy', 'uploaded_by_name']),
    createdAt: firstString(raw, ['createdAt', 'created_at'])
  };
};

const normalizeProject = (input: unknown): Project => {
  const raw = asRecord(input);
  const metadata = metadataOf(raw);
  return {
    id: firstId(raw, ['id']),
    code: firstString(raw, ['code']),
    name: firstString(raw, ['name']),
    plant: firstString(raw, ['plant']),
    lineName: firstString(raw, ['lineName', 'line', 'line_name']),
    description: firstString(raw, ['description']),
    status: firstString(raw, ['status'], 'active'),
    ownerName:
      firstString(raw, ['ownerName', 'owner_name']) ||
      firstString(metadata, ['ownerName', 'owner_name']) ||
      firstString(raw, ['updated_by_name', 'created_by_name'], '未设置'),
    plannedStartDate:
      firstString(raw, ['plannedStartDate', 'planned_start_date']) ||
      firstString(metadata, ['plannedStartDate', 'planned_start_date']),
    plannedEndDate:
      firstString(raw, ['plannedEndDate', 'planned_end_date']) ||
      firstString(metadata, ['plannedEndDate', 'planned_end_date']),
    actualStartDate: firstString(raw, ['actualStartDate', 'actual_start_date']) || null,
    actualEndDate: firstString(raw, ['actualEndDate', 'actual_end_date']) || null,
    progressPercent: firstNumber(raw, ['progressPercent', 'progress_percent']) || firstNumber(metadata, ['progressPercent', 'progress_percent']),
    updatedAt: firstString(raw, ['updatedAt', 'updated_at'])
  };
};

const normalizePhaseTemplate = (input: unknown): PhaseTemplate => {
  const raw = asRecord(input);
  const metadata = metadataOf(raw);
  const definitions = asArray(raw.phase_definitions);
  return {
    id: firstId(raw, ['id']),
    code: firstString(raw, ['code']),
    name: firstString(raw, ['name']),
    sequence: firstNumber(raw, ['sequence', 'sort_order', 'version']),
    defaultGoal: firstString(raw, ['defaultGoal', 'description']) || `${definitions.length || 0} 个阶段`,
    defaultDurationDays: firstNumber(metadata, ['defaultDurationDays', 'default_duration_days']),
    isActive: asBoolean(raw.isActive, asBoolean(raw.is_active, true))
  };
};

const normalizeProjectPhase = (input: unknown): ProjectPhase => {
  const raw = asRecord(input);
  const metadata = metadataOf(raw);
  return {
    id: firstId(raw, ['id']),
    projectId: firstId(raw, ['projectId', 'project']),
    templateId: firstId(raw, ['templateId', 'phase_template'], '') || null,
    code: firstString(raw, ['code', 'phase_key']),
    name: firstString(raw, ['name']),
    sequence: firstNumber(raw, ['sequence', 'sort_order']),
    goal: firstString(raw, ['goal', 'description']),
    plannedStartDate: firstString(raw, ['plannedStartDate', 'planned_start']),
    plannedEndDate: firstString(raw, ['plannedEndDate', 'planned_end']),
    actualStartAt: firstString(raw, ['actualStartAt', 'actual_start']) || null,
    actualEndAt: firstString(raw, ['actualEndAt', 'actual_end']) || null,
    status: firstString(raw, ['status'], 'not_started'),
    progressPercent: firstNumber(raw, ['progressPercent', 'progress_percent']) || firstNumber(metadata, ['progressPercent', 'progress_percent']),
    notes: firstString(metadata, ['notes'])
  };
};

const normalizeInspectionModule = (input: unknown): InspectionModule => {
  const raw = asRecord(input);
  return {
    id: firstId(raw, ['id']),
    code: firstString(raw, ['code']),
    name: firstString(raw, ['name']),
    sequence: firstNumber(raw, ['sequence', 'sort_order']),
    isActive: asBoolean(raw.isActive, asBoolean(raw.is_active, true))
  };
};

const normalizeChecklistTemplate = (input: unknown): ChecklistTemplate => {
  const raw = asRecord(input);
  const metadata = metadataOf(raw);
  const itemTemplates = asArray(raw.item_templates);
  return {
    id: firstId(raw, ['id']),
    moduleId: firstId(raw, ['moduleId', 'module']),
    phaseTemplateId: firstId(raw, ['phaseTemplateId', 'phase_template']),
    code: firstString(raw, ['code']),
    title: firstString(raw, ['title', 'name']),
    defaultOwnerRole: firstString(metadata, ['defaultOwnerRole', 'default_owner_role']) || `${itemTemplates.length || 0} 个模板项`,
    defaultDurationDays: firstNumber(metadata, ['defaultDurationDays', 'default_duration_days']),
    requiredAttachment: asBoolean(metadata.requiredAttachment, asBoolean(metadata.required_attachment)),
    severity: firstString(metadata, ['severity'], 'medium')
  };
};

const normalizeCheckItem = (input: unknown): CheckItem => {
  const raw = asRecord(input);
  const metadata = metadataOf(raw);
  return {
    id: firstId(raw, ['id']),
    projectId: firstId(raw, ['projectId', 'project']),
    projectPhaseId: firstId(raw, ['projectPhaseId', 'phase']),
    moduleId: firstId(raw, ['moduleId', 'module']),
    title: firstString(raw, ['title']),
    description: firstString(raw, ['description']),
    acceptanceCriteria: firstString(raw, ['acceptanceCriteria', 'acceptance_criteria']) || firstString(metadata, ['acceptanceCriteria', 'acceptance_criteria']),
    ownerName: firstString(raw, ['ownerName', 'owner_display_name', 'owner_name'], '未设置'),
    ownerIdaasId: firstString(raw, ['ownerIdaasId', 'owner_idaas_id']),
    plannedStartDate: firstString(raw, ['plannedStartDate', 'planned_start_date']) || firstString(metadata, ['plannedStartDate', 'planned_start_date']),
    plannedEndDate: firstString(raw, ['plannedEndDate', 'due_date']),
    actualStartAt: firstString(raw, ['actualStartAt', 'actual_start_at']) || null,
    actualEndAt: firstString(raw, ['actualEndAt', 'completed_at']) || null,
    status: firstString(raw, ['status'], 'pending'),
    result: firstString(raw, ['result', 'result_note']),
    blockerReason: firstString(raw, ['blockerReason', 'blocker_reason']),
    progressPercent: firstNumber(raw, ['progressPercent', 'progress_percent']) || firstNumber(metadata, ['progressPercent', 'progress_percent']),
    notes: firstString(metadata, ['notes']),
    attachments: asArray(raw.attachments).map(normalizeAttachment)
  };
};

const normalizeKeyIssue = (input: unknown): KeyIssue => {
  const raw = asRecord(input);
  return {
    id: firstId(raw, ['id']),
    projectId: firstId(raw, ['projectId', 'project']),
    projectPhaseId: firstId(raw, ['projectPhaseId', 'phase']) || null,
    checkItemId: firstId(raw, ['checkItemId', 'check_item']) || null,
    title: firstString(raw, ['title']),
    description: firstString(raw, ['description']),
    severity: firstString(raw, ['severity'], 'medium'),
    status: firstString(raw, ['status'], 'open'),
    ownerName: firstString(raw, ['ownerName', 'owner_display_name', 'owner_name'], '未设置'),
    dueDate: firstString(raw, ['dueDate', 'due_date']),
    closedAt: firstString(raw, ['closedAt', 'closed_at']) || null,
    resolution: firstString(raw, ['resolution']),
    attachments: asArray(raw.attachments).map(normalizeAttachment)
  };
};

const stringifyAction = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .map(item => {
        const record = asRecord(item);
        return [record.action, record.owner, record.due_date].filter(Boolean).join(' / ');
      })
      .filter(Boolean)
      .join('\n');
  }
  return asString(value);
};

const normalizeCollisionReport = (input: unknown): CollisionReport => {
  const raw = asRecord(input);
  const content = asRecord(raw.content);
  const metadata = metadataOf(raw);
  const approvals = asArray(raw.approvals).map(asRecord);
  return {
    id: firstId(raw, ['id']),
    projectId: firstId(raw, ['projectId', 'project']),
    projectPhaseId: firstId(raw, ['projectPhaseId', 'phase']) || null,
    title: firstString(raw, ['title']),
    status: firstString(raw, ['status'], 'draft'),
    riskLevel: firstString(raw, ['riskLevel', 'risk_level']) || firstString(metadata, ['riskLevel', 'risk_level', 'severity'], 'medium'),
    problemDefinition: firstString(content, ['problemDefinition', 'problem_statement', 'problem']),
    impact: firstString(content, ['impact']),
    containment: firstString(content, ['containment']),
    rootCause: firstString(content, ['rootCause', 'root_cause']),
    correctiveAction: stringifyAction(content.correctiveAction ?? content.corrective_action ?? content.countermeasures),
    preventiveAction: firstString(content, ['preventiveAction', 'preventive_action']),
    validation: firstString(content, ['validation', 'verification']),
    owner: firstString(content, ['owner']) || firstString(metadata, ['owner'], '未设置'),
    dueDate: firstString(content, ['dueDate', 'due_date']) || firstString(raw, ['report_date']),
    approvalSignoff:
      approvals.map(item => `${firstString(item, ['step_name'], '签核')}: ${firstString(item, ['status'], 'pending')}`).join(' / ') ||
      firstString(content, ['approvalSignoff', 'approval_signoff']),
    attachments: asArray(raw.attachments).map(normalizeAttachment),
    updatedAt: firstString(raw, ['updatedAt', 'updated_at'])
  };
};

const normalizeReportDefinitions = (input: unknown): ReportDefinition[] => {
  if (Array.isArray(input)) return input.map(item => asRecord(item) as ReportDefinition);
  const summary = asRecord(input);
  const checkItemCount = firstNumber(summary, ['check_item_count']);
  const issueCount = firstNumber(summary, ['key_issue_count']);
  return [
    {
      id: 'project',
      name: '项目总览导出',
      description: `阶段、检查项、重点问题与导出状态汇总，当前检查项 ${checkItemCount} 条。`,
      format: 'csv'
    },
    {
      id: 'check_items',
      name: '检查项台账',
      description: '导出项目检查项、负责人、状态、结论和计划日期。',
      format: 'csv'
    },
    {
      id: 'key_issues',
      name: '重点问题清单',
      description: `导出项目重点问题与关闭状态，当前问题 ${issueCount} 条。`,
      format: 'csv'
    }
  ];
};

const normalizeExportTask = (input: unknown): ExportTask => {
  const raw = asRecord(input);
  const metadata = metadataOf(raw);
  const exportType = firstString(raw, ['export_type'], 'project');
  return {
    id: firstId(raw, ['id']),
    projectId: firstId(raw, ['projectId', 'project']),
    reportName: firstString(metadata, ['reportName', 'report_name']) || exportType,
    status: firstString(raw, ['status'], 'queued'),
    requestedBy: firstString(raw, ['requestedBy', 'requested_by_name'], '系统'),
    requestedAt: firstString(raw, ['requestedAt', 'created_at', 'started_at']),
    finishedAt: firstString(raw, ['finishedAt', 'finished_at']) || null,
    downloadUrl: firstString(raw, ['downloadUrl', 'content_url']) || null,
    errorMessage: firstString(raw, ['errorMessage', 'error_message']) || null
  };
};

const normalizeOwnerCandidate = (input: unknown): OwnerCandidate => {
  const raw = asRecord(input);
  return {
    idaasId: firstString(raw, ['idaasId', 'idaas_id', 'user_id', 'id']),
    displayName: firstString(raw, ['displayName', 'display_name', 'name', 'username']),
    email: firstString(raw, ['email']),
    department: firstString(raw, ['department'])
  };
};

export type CreateProjectInput = {
  name: string;
  code: string;
  plant: string;
  lineName: string;
  ownerName: string;
  plannedStartDate: string;
  plannedEndDate: string;
};

export type CreateExportInput = {
  reportName: string;
  reportType?: string | number;
  format: string;
};

export async function listProjects() {
  return unwrap(await apiRequest<ApiEnvelope<unknown[]> | unknown[]>('/projects/')).map(normalizeProject);
}

export async function createProject(input: CreateProjectInput) {
  const project = unwrap(
    await apiRequest<ApiEnvelope<unknown> | unknown>('/projects/', {
      method: 'POST',
      body: JSON.stringify({
        code: input.code,
        name: input.name,
        plant: input.plant,
        line: input.lineName,
        metadata: {
          owner_name: input.ownerName,
          planned_start_date: input.plannedStartDate,
          planned_end_date: input.plannedEndDate
        }
      })
    })
  );
  return normalizeProject(project);
}

export async function fetchOwnerCandidates(query = '') {
  const search = query ? `?q=${encodeURIComponent(query)}` : '';
  try {
    return unwrap(
      await apiRequest<ApiEnvelope<unknown[]> | unknown[]>(`/idaas-candidates/${search}`)
    ).map(normalizeOwnerCandidate);
  } catch (error) {
    if (error instanceof ApiError && [403, 404, 501].includes(error.status)) {
      return [];
    }
    throw error;
  }
}

export async function fetchProjectBundle(projectId: string | number): Promise<Omit<WorkspaceData, 'projects' | 'selectedProject'>> {
  const [
    phases,
    phaseTemplates,
    inspectionModules,
    checklistTemplates,
    checkItems,
    keyIssues,
    collisionReports,
    reports,
    exportTasks,
    ownerCandidates
  ] = await Promise.all([
    apiRequest<ApiEnvelope<unknown[]> | unknown[]>(`/projects/${projectId}/phases/`),
    apiRequest<ApiEnvelope<unknown[]> | unknown[]>('/phase-templates/'),
    apiRequest<ApiEnvelope<unknown[]> | unknown[]>('/inspection-modules/'),
    apiRequest<ApiEnvelope<unknown[]> | unknown[]>('/checklist-templates/'),
    apiRequest<ApiEnvelope<unknown[]> | unknown[]>(`/projects/${projectId}/check-items/`),
    apiRequest<ApiEnvelope<unknown[]> | unknown[]>(`/projects/${projectId}/key-issues/`),
    apiRequest<ApiEnvelope<unknown[]> | unknown[]>(`/projects/${projectId}/collision-reports/`),
    apiRequest<ApiEnvelope<unknown> | unknown>(`/projects/${projectId}/reports/`),
    apiRequest<ApiEnvelope<unknown[]> | unknown[]>(`/projects/${projectId}/exports/`),
    fetchOwnerCandidates()
  ]);

  return {
    phases: unwrap(phases).map(normalizeProjectPhase),
    phaseTemplates: unwrap(phaseTemplates).map(normalizePhaseTemplate),
    inspectionModules: unwrap(inspectionModules).map(normalizeInspectionModule),
    checklistTemplates: unwrap(checklistTemplates).map(normalizeChecklistTemplate),
    checkItems: unwrap(checkItems).map(normalizeCheckItem),
    keyIssues: unwrap(keyIssues).map(normalizeKeyIssue),
    collisionReports: unwrap(collisionReports).map(normalizeCollisionReport),
    reports: normalizeReportDefinitions(unwrap(reports)),
    exportTasks: unwrap(exportTasks).map(normalizeExportTask),
    ownerCandidates
  };
}

export async function fetchWorkspaceData(projectId?: string | number): Promise<WorkspaceData> {
  const projects = await listProjects();
  const selectedProject = projects.find(project => `${project.id}` === `${projectId}`) ?? projects[0] ?? null;

  if (!selectedProject) {
    return {
      projects,
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
  }

  return {
    projects,
    selectedProject,
    ...(await fetchProjectBundle(selectedProject.id))
  };
}

export async function updateCheckItemOwner(
  checkItemId: string | number,
  payload: { ownerName: string; ownerIdaasId?: string }
) {
  return normalizeCheckItem(unwrap(
    await apiRequest<ApiEnvelope<unknown> | unknown>(`/check-items/${checkItemId}/`, {
      method: 'PATCH',
      body: JSON.stringify({
        owner_name: payload.ownerName,
        owner_idaas_id: payload.ownerIdaasId
      })
    })
  ));
}

export async function createExportTask(projectId: string | number, input: CreateExportInput) {
  const job = unwrap(
    await apiRequest<ApiEnvelope<unknown> | unknown>(`/projects/${projectId}/exports/`, {
      method: 'POST',
      body: JSON.stringify({
        export_type: String(input.reportType ?? input.reportName),
        file_format: input.format,
        metadata: {
          report_name: input.reportName
        }
      })
    })
  );
  return normalizeExportTask(job);
}
