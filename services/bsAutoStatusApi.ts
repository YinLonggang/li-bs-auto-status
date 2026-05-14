import { BASE_CONFIG_PREFIX } from '../config';
import { ApiError, apiRequest, requestWithPrefix } from './http';
import type {
  ApiEnvelope,
  Attachment,
  AuditLog,
  CheckItem,
  CheckItemOwner,
  CheckItemStatus,
  ChecklistTemplate,
  CollisionReport,
  DashboardProgressRow,
  DashboardSummary,
  ExportTask,
  FactoryOption,
  HierarchyOptions,
  InspectionModule,
  KeyIssue,
  OwnerCandidate,
  PhaseTemplate,
  ProductionLineOption,
  Project,
  ProjectPhaseProgress,
  ProjectPhase,
  ProjectStatistics,
  ProjectTimeline,
  ReportDefinition,
  WorkshopOption,
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

const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,，、]/)
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [];
};

const normalizeCheckItemOwner = (input: unknown): CheckItemOwner => {
  if (typeof input === 'string') {
    return { displayName: input.trim() };
  }
  const raw = asRecord(input);
  const manualName = firstString(raw, ['manualName', 'manual_name']);
  const sortOrder = firstNumber(raw, ['sortOrder', 'sort_order'], Number.NaN);
  const isPrimary = asBoolean(raw.isPrimary, asBoolean(raw.is_primary, false));
  return {
    displayName: firstString(raw, ['displayName', 'display_name', 'name', 'ownerName', 'owner_name']),
    idaasId: firstString(raw, ['idaasId', 'idaas_id', 'user_id', 'open_id', 'id']),
    email: firstString(raw, ['email']),
    department: firstString(raw, ['department', 'department_name', 'org_name']),
    manualName,
    manual_name: manualName,
    role: firstString(raw, ['role']),
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : undefined,
    sort_order: Number.isFinite(sortOrder) ? sortOrder : undefined,
    isPrimary,
    is_primary: isPrimary,
    metadata: asRecord(raw.metadata)
  };
};

const normalizeCheckItemOwners = (input: unknown, fallbackName = '', fallbackIdaasId = '') => {
  const seen = new Set<string>();
  const owners = asArray(input)
    .map(normalizeCheckItemOwner)
    .filter(owner => owner.displayName || owner.idaasId || owner.manualName || owner.manual_name)
    .filter(owner => {
      const key = `${owner.idaasId || ''}|${owner.displayName || owner.manualName || owner.manual_name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (owners.length) return owners;
  return fallbackName || fallbackIdaasId
    ? [{ displayName: fallbackName || fallbackIdaasId, idaasId: fallbackIdaasId || undefined }]
    : [];
};

const serializeCheckItemOwners = (owners?: CheckItemOwner[]) =>
  (owners ?? [])
    .map((owner, index) => ({
      display_name: (owner.displayName || '').trim(),
      idaas_id: owner.idaasId || undefined,
      email: owner.email || undefined,
      manual_name: owner.manualName || owner.manual_name || undefined,
      role: owner.role || undefined,
      sort_order: index,
      is_primary: owner.isPrimary ?? owner.is_primary ?? undefined,
      metadata: {
        ...(owner.metadata ?? {}),
        ...(owner.department ? { department: owner.department } : {})
      }
    }))
    .filter(owner => owner.display_name || owner.idaas_id || owner.manual_name);

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

const firstOptionalId = (record: RawRecord, keys: string[]) => {
  const value = firstId(record, keys);
  return value === '' ? null : value;
};

const optionalDate = (value?: string | null) => {
  if (value === undefined) return undefined;
  return value ? value : undefined;
};

const metadataOf = (record: RawRecord) => asRecord(record.metadata);

const EMPTY_HIERARCHY: HierarchyOptions = {
  factories: [],
  workshops: [],
  productionLines: []
};

const normalizeFactoryOption = (input: unknown): FactoryOption => {
  const raw = asRecord(input);
  return {
    id: firstId(raw, ['id']),
    code: firstString(raw, ['code']),
    name: firstString(raw, ['name']),
    isActive: asBoolean(raw.isActive, asBoolean(raw.is_active, true))
  };
};

const normalizeWorkshopOption = (input: unknown): WorkshopOption => {
  const raw = asRecord(input);
  return {
    id: firstId(raw, ['id']),
    factoryId: firstId(raw, ['factory', 'factoryId', 'factory_id']),
    code: firstString(raw, ['code']),
    name: firstString(raw, ['name']),
    factoryCode: firstString(raw, ['factoryCode', 'factory_code']),
    factoryName: firstString(raw, ['factoryName', 'factory_name']),
    isActive: asBoolean(raw.isActive, asBoolean(raw.is_active, true))
  };
};

const normalizeProductionLineOption = (input: unknown): ProductionLineOption => {
  const raw = asRecord(input);
  return {
    id: firstId(raw, ['id']),
    workshopId: firstId(raw, ['workshop', 'workshopId', 'workshop_id']),
    code: firstString(raw, ['code']),
    name: firstString(raw, ['name']),
    workshopCode: firstString(raw, ['workshopCode', 'workshop_code']),
    workshopName: firstString(raw, ['workshopName', 'workshop_name']),
    factoryCode: firstString(raw, ['factoryCode', 'factory_code']),
    factoryName: firstString(raw, ['factoryName', 'factory_name']),
    isActive: asBoolean(raw.isActive, asBoolean(raw.is_active, true))
  };
};

const buildHierarchyFromProjects = (projects: Project[]): HierarchyOptions => {
  const factories = new Map<string, FactoryOption>();
  const workshops = new Map<string, WorkshopOption>();
  const productionLines = new Map<string, ProductionLineOption>();

  projects.forEach(project => {
    if (project.factoryId) {
      const id = `${project.factoryId}`;
      factories.set(id, {
        id: project.factoryId,
        code: project.factoryCode ?? '',
        name: project.factoryName ?? project.factoryNameSnapshot ?? project.plant
      });
    }
    if (project.workshopId && project.factoryId) {
      const id = `${project.workshopId}`;
      workshops.set(id, {
        id: project.workshopId,
        factoryId: project.factoryId,
        code: project.workshopCode ?? '',
        name: project.workshopName ?? project.workshopNameSnapshot ?? '未命名车间',
        factoryCode: project.factoryCode,
        factoryName: project.factoryName ?? project.factoryNameSnapshot
      });
    }
    if (project.productionLineId && project.workshopId) {
      const id = `${project.productionLineId}`;
      productionLines.set(id, {
        id: project.productionLineId,
        workshopId: project.workshopId,
        code: project.productionLineCode ?? '',
        name: project.productionLineName ?? project.lineNameSnapshot ?? project.lineName,
        workshopCode: project.workshopCode,
        workshopName: project.workshopName ?? project.workshopNameSnapshot,
        factoryCode: project.factoryCode,
        factoryName: project.factoryName ?? project.factoryNameSnapshot
      });
    }
  });

  return {
    factories: [...factories.values()],
    workshops: [...workshops.values()],
    productionLines: [...productionLines.values()]
  };
};

const mergeHierarchyFallback = (hierarchy: HierarchyOptions, projects: Project[]): HierarchyOptions => {
  const fallback = buildHierarchyFromProjects(projects);
  return {
    factories: hierarchy.factories.length ? hierarchy.factories : fallback.factories,
    workshops: hierarchy.workshops.length ? hierarchy.workshops : fallback.workshops,
    productionLines: hierarchy.productionLines.length ? hierarchy.productionLines : fallback.productionLines
  };
};

const normalizeAttachment = (input: unknown): Attachment => {
  const raw = asRecord(input);
  return {
    id: firstId(raw, ['id']),
    fileName: firstString(raw, ['fileName', 'file_name']),
    bucketName: firstString(raw, ['bucketName', 'bucket_name']),
    objectKey: firstString(raw, ['objectKey', 'object_key']),
    downloadUrl: firstString(raw, ['downloadUrl', 'download_url']) || null,
    contentType: firstString(raw, ['contentType', 'content_type']),
    fileSize: firstNumber(raw, ['fileSize', 'file_size']),
    uploadedBy: firstString(raw, ['uploadedBy', 'uploaded_by_name']),
    createdAt: firstString(raw, ['createdAt', 'created_at'])
  };
};

const normalizeAuditLog = (input: unknown): AuditLog => {
  const raw = asRecord(input);
  return {
    id: firstId(raw, ['id']),
    action: firstString(raw, ['action']),
    objectType: firstString(raw, ['objectType', 'object_type']),
    objectId: String(firstId(raw, ['objectId', 'object_id'])),
    projectId: firstOptionalId(raw, ['projectId', 'project']),
    projectCode: firstString(raw, ['projectCode', 'project_code']),
    actorIdaasId: firstString(raw, ['actorIdaasId', 'actor_idaas_id']),
    actorName: firstString(raw, ['actorName', 'actor_name']),
    requestId: firstString(raw, ['requestId', 'request_id']),
    detail: asRecord(raw.detail),
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
    factoryId: firstOptionalId(raw, ['factoryId', 'factory']),
    factoryCode: firstString(raw, ['factoryCode', 'factory_code']),
    factoryName: firstString(raw, ['factoryName', 'factory_name']),
    workshopId: firstOptionalId(raw, ['workshopId', 'workshop']),
    workshopCode: firstString(raw, ['workshopCode', 'workshop_code']),
    workshopName: firstString(raw, ['workshopName', 'workshop_name']),
    productionLineId: firstOptionalId(raw, ['productionLineId', 'production_line']),
    productionLineCode: firstString(raw, ['productionLineCode', 'production_line_code']),
    productionLineName: firstString(raw, ['productionLineName', 'production_line_name']),
    factoryNameSnapshot: firstString(raw, ['factoryNameSnapshot', 'factory_name_snapshot']),
    workshopNameSnapshot: firstString(raw, ['workshopNameSnapshot', 'workshop_name_snapshot']),
    lineNameSnapshot: firstString(raw, ['lineNameSnapshot', 'line_name_snapshot']),
    plant:
      firstString(raw, ['factoryName', 'factory_name']) ||
      firstString(raw, ['factoryNameSnapshot', 'factory_name_snapshot']) ||
      firstString(raw, ['plant']),
    lineName:
      firstString(raw, ['productionLineName', 'production_line_name']) ||
      firstString(raw, ['lineNameSnapshot', 'line_name_snapshot']) ||
      firstString(raw, ['lineName', 'line', 'line_name']),
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
    metadata,
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
    plannedStartDate: firstString(raw, ['plannedStartDate', 'planned_start', 'planned_start_date']),
    plannedEndDate: firstString(raw, ['plannedEndDate', 'planned_end', 'planned_end_date']),
    actualStartAt: firstString(raw, ['actualStartAt', 'actual_start']) || null,
    actualEndAt: firstString(raw, ['actualEndAt', 'actual_end']) || null,
    status: firstString(raw, ['status'], 'not_started'),
    progressPercent: firstNumber(raw, ['progressPercent', 'progress_percent']) || firstNumber(metadata, ['progressPercent', 'progress_percent']),
    isActive: asBoolean(raw.isEnabled, asBoolean(raw.is_enabled, asBoolean(raw.isActive, asBoolean(raw.is_active, true)))),
    canDelete: asBoolean(raw.canDelete, asBoolean(raw.can_delete, false)),
    isDefault: asBoolean(raw.isDefault, asBoolean(raw.is_default, false)),
    notes: firstString(metadata, ['notes']),
    metadata
  };
};

const normalizeInspectionModule = (input: unknown): InspectionModule => {
  const raw = asRecord(input);
  const metadata = metadataOf(raw);
  return {
    id: firstId(raw, ['id']),
    code: firstString(raw, ['code']),
    name: firstString(raw, ['name']),
    sequence: firstNumber(raw, ['sequence', 'sort_order']),
    isActive: asBoolean(raw.isActive, asBoolean(raw.is_active, true)),
    color: firstString(metadata, ['color']),
    milestones: asArray(metadata.milestones).map(item => Number(item)).filter(item => Number.isFinite(item))
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
  const ownerName = firstString(raw, ['ownerName', 'owner_display_name', 'owner_name'], '未设置');
  const ownerIdaasId = firstString(raw, ['ownerIdaasId', 'owner_idaas_id']);
  const owners = normalizeCheckItemOwners(raw.owners, ownerName === '未设置' ? '' : ownerName, ownerIdaasId);
  return {
    id: firstId(raw, ['id']),
    projectId: firstId(raw, ['projectId', 'project']),
    projectPhaseId: firstId(raw, ['projectPhaseId', 'project_phase', 'project_phase_id', 'phase']),
    moduleId: firstId(raw, ['moduleId', 'module']),
    title: firstString(raw, ['title']),
    description: firstString(raw, ['description']),
    acceptanceCriteria: firstString(raw, ['acceptanceCriteria', 'acceptance_criteria']) || firstString(metadata, ['acceptanceCriteria', 'acceptance_criteria']),
    tags: asStringArray(raw.tags).length ? asStringArray(raw.tags) : asStringArray(metadata.tags),
    ownerName: ownerName === '未设置'
      ? owners[0]?.displayName || owners[0]?.manualName || owners[0]?.manual_name || '未设置'
      : ownerName || owners[0]?.displayName || owners[0]?.manualName || owners[0]?.manual_name || '未设置',
    ownerIdaasId: ownerIdaasId || owners[0]?.idaasId,
    owners,
    plannedStartDate: firstString(raw, ['plannedStartDate', 'planned_start', 'planned_start_date']) || firstString(metadata, ['plannedStartDate', 'planned_start_date']),
    plannedEndDate: firstString(raw, ['plannedEndDate', 'planned_end', 'planned_end_date', 'due_date']) || firstString(metadata, ['plannedEndDate', 'planned_end_date']),
    actualStartAt: firstString(raw, ['actualStartAt', 'actual_start_at']) || null,
    actualEndAt: firstString(raw, ['actualEndAt', 'completed_at']) || null,
    status: firstString(raw, ['status'], 'pending'),
    isActive: asBoolean(raw.isEnabled, asBoolean(raw.is_enabled, asBoolean(raw.isActive, asBoolean(raw.is_active, true)))),
    canDelete: asBoolean(raw.canDelete, asBoolean(raw.can_delete, false)),
    isDefault: asBoolean(raw.isDefault, asBoolean(raw.is_default, false)),
    result: firstString(raw, ['result', 'result_note']),
    blockerReason: firstString(raw, ['blockerReason', 'blocker_reason']),
    progressPercent: firstNumber(raw, ['progressPercent', 'progress_percent']) || firstNumber(metadata, ['progressPercent', 'progress_percent']),
    notes: firstString(metadata, ['notes']),
    metadata,
    attachments: asArray(raw.attachments).map(normalizeAttachment)
  };
};

const normalizeKeyIssue = (input: unknown): KeyIssue => {
  const raw = asRecord(input);
  const metadata = metadataOf(raw);
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
    problemPhoto:
      firstString(raw, ['problemPhoto', 'problem_photo']) ||
      firstString(raw, ['problem_photo_object_key']) ||
      firstString(metadata, ['problemPhoto', 'problem_photo']),
    problemPhotoBucketName: firstString(raw, ['problemPhotoBucketName', 'problem_photo_bucket_name']),
    problemPhotoObjectKey: firstString(raw, ['problemPhotoObjectKey', 'problem_photo_object_key']),
    countermeasure: firstString(raw, ['countermeasure']) || firstString(metadata, ['countermeasure']),
    supplier: firstString(raw, ['supplier']) || firstString(metadata, ['supplier']),
    confirmer:
      firstString(raw, ['confirmerName', 'confirmer_display_name', 'confirmer_name']) ||
      firstString(metadata, ['confirmer']),
    currentProgress: firstString(raw, ['currentProgress', 'progress_note']) || firstString(metadata, ['currentProgress', 'current_progress']),
    remark: firstString(raw, ['remark']) || firstString(metadata, ['remark']),
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
    parts: firstString(content, ['parts']),
    vehicleModel: firstString(content, ['vehicleModel', 'vehicle_model', 'model']),
    failureFrequency: firstString(content, ['failureFrequency', 'failure_frequency', 'frequency']),
    responsibilityArea: firstString(content, ['responsibilityArea', 'responsibility_area', 'area']),
    progress: firstString(content, ['progress']),
    remark: firstString(content, ['remark']),
    problemDescription: firstString(content, ['problemDescription', 'problem_description']),
    diagnosisRepair: firstString(content, ['diagnosisRepair', 'diagnosis_repair']),
    supportNeeded: firstString(content, ['supportNeeded', 'support_needed']),
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
  const resultObjectKey = firstString(raw, ['resultObjectKey', 'result_object_key']);
  const inferredFileName = resultObjectKey.split('/').filter(Boolean).at(-1) ?? '';
  return {
    id: firstId(raw, ['id']),
    projectId: firstId(raw, ['projectId', 'project']),
    reportName: firstString(metadata, ['reportName', 'report_name']) || exportType,
    fileName: firstString(metadata, ['fileName', 'file_name']) || inferredFileName,
    fileFormat: firstString(raw, ['fileFormat', 'file_format']),
    status: firstString(raw, ['status'], 'queued'),
    requestedBy: firstString(raw, ['requestedBy', 'requested_by_name'], '系统'),
    requestedAt: firstString(raw, ['requestedAt', 'created_at', 'started_at']),
    finishedAt: firstString(raw, ['finishedAt', 'finished_at']) || null,
    resultBucketName: firstString(raw, ['resultBucketName', 'result_bucket_name']),
    resultObjectKey,
    hasResult: asBoolean(raw.hasResult, asBoolean(raw.has_result, false)),
    errorMessage: firstString(raw, ['errorMessage', 'error_message']) || null
  };
};

const normalizeOwnerCandidate = (input: unknown): OwnerCandidate => {
  const raw = asRecord(input);
  return {
    idaasId: firstString(raw, ['idaasId', 'idaas_id', 'user_id', 'open_id', 'id']),
    displayName: firstString(raw, ['displayName', 'display_name', 'name', 'username']),
    email: firstString(raw, ['email']),
    department: firstString(raw, ['department', 'department_name', 'org_name'])
  };
};

export type ProjectScopeFilters = {
  projectId?: string | number;
  factoryId?: string | number;
  workshopId?: string | number;
  productionLineId?: string | number | null;
  status?: string;
};

const buildProjectSearchParams = (filters?: ProjectScopeFilters) => {
  const params = new URLSearchParams();
  if (!filters) return params;
  if (filters.projectId) params.set('project', `${filters.projectId}`);
  if (filters.factoryId) params.set('factory', `${filters.factoryId}`);
  if (filters.workshopId) params.set('workshop', `${filters.workshopId}`);
  if (filters.productionLineId !== undefined && filters.productionLineId !== null && `${filters.productionLineId}`) {
    params.set('production_line', `${filters.productionLineId}`);
  }
  if (filters.status) params.set('status', filters.status);
  return params;
};

const withQuery = (path: string, filters?: ProjectScopeFilters) => {
  const params = buildProjectSearchParams(filters);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
};

const normalizeDashboardProgressRow = (input: unknown): DashboardProgressRow => {
  const raw = asRecord(input);
  return {
    key: firstString(raw, ['phase_key', 'module_code', 'key', 'code']),
    name: firstString(raw, ['phase_name', 'module_name', 'name']),
    checkItemCount: firstNumber(raw, ['check_item_count']),
    completedCheckItemCount: firstNumber(raw, ['completed_check_item_count']),
    completionRate: firstNumber(raw, ['completion_rate'])
  };
};

const normalizeProjectPhaseProgress = (input: unknown): ProjectPhaseProgress => {
  const raw = asRecord(input);
  const metadata = metadataOf(raw);
  const key = firstId(raw, ['phase_key', 'key', 'code', 'id']);
  return {
    key: `${key}`,
    name: firstString(raw, ['phase_name', 'name'], `${key}`),
    sequence: firstNumber(raw, ['sequence', 'sort_order']),
    plannedStartDate: firstString(raw, ['planned_start', 'planned_start_date', 'plannedStartDate']),
    plannedEndDate: firstString(raw, ['planned_end', 'planned_end_date', 'plannedEndDate']),
    status: firstString(raw, ['status'], 'not_started'),
    progressPercent: firstNumber(raw, ['progress_percent', 'completion_rate', 'progressPercent']) || firstNumber(metadata, ['progressPercent', 'progress_percent']),
    checkItemCount: firstNumber(raw, ['check_item_count', 'checkItemCount']),
    completedCheckItemCount: firstNumber(raw, ['completed_check_item_count', 'completedCheckItemCount']),
    isOverdue: asBoolean(raw.is_overdue, asBoolean(raw.isOverdue, false))
  };
};

const normalizeProjectStatistics = (input: unknown): ProjectStatistics => {
  const raw = asRecord(input);
  const overduePhaseCount = firstNumber(raw, ['overdue_phase_count', 'overduePhaseCount']);
  const overdueCheckItemCount = firstNumber(raw, ['overdue_check_item_count', 'overdueCheckItemCount']);
  const explicitOverdueCount = firstNumber(raw, ['overdue_count', 'overdueCount'], Number.NaN);
  const overdueCount = Number.isFinite(explicitOverdueCount)
    ? explicitOverdueCount
    : overduePhaseCount + overdueCheckItemCount;
  return {
    projectId: firstId(raw, ['project_id', 'projectId', 'project', 'id']),
    projectCode: firstString(raw, ['project_code', 'projectCode', 'code']),
    projectName: firstString(raw, ['project_name', 'projectName', 'name']),
    projectStatus: firstString(raw, ['project_status', 'projectStatus', 'status'], 'active'),
    ownerName: firstString(raw, ['owner_name', 'ownerName'], '未设置'),
    plannedStartDate: firstString(raw, ['planned_start', 'planned_start_date', 'plannedStartDate']),
    plannedEndDate: firstString(raw, ['planned_end', 'planned_end_date', 'plannedEndDate']),
    completionRate: firstNumber(raw, ['completion_rate', 'completionRate', 'progress_percent']),
    phaseCount: firstNumber(raw, ['phase_count', 'phaseCount']),
    checkItemCount: firstNumber(raw, ['check_item_count', 'checkItemCount']),
    completedCheckItemCount: firstNumber(raw, ['completed_check_item_count', 'completedCheckItemCount']),
    overdueCount,
    overduePhaseCount,
    overdueCheckItemCount,
    blockedCheckItemCount: firstNumber(raw, ['blocked_check_item_count', 'blockedCheckItemCount']),
    keyIssueCount: firstNumber(raw, ['key_issue_count', 'keyIssueCount']),
    openKeyIssueCount: firstNumber(raw, ['open_key_issue_count', 'openKeyIssueCount']),
    highOpenKeyIssueCount: firstNumber(raw, ['high_open_key_issue_count', 'highOpenKeyIssueCount']),
    collisionReportCount: firstNumber(raw, ['collision_report_count', 'collisionReportCount']),
    pendingCollisionReportCount: firstNumber(raw, ['pending_collision_report_count', 'pendingCollisionReportCount']),
    exportJobCount: firstNumber(raw, ['export_job_count', 'exportJobCount']),
    failedExportJobCount: firstNumber(raw, ['failed_export_job_count', 'failedExportJobCount']),
    currentPhaseName: firstString(raw, ['current_phase_name', 'currentPhaseName', 'current_phase']),
    phaseProgress: asArray(raw.phase_progress ?? raw.phaseProgress).map(normalizeProjectPhaseProgress)
  };
};

const normalizeProjectTimeline = (input: unknown): ProjectTimeline => {
  const raw = asRecord(input);
  const timeline = asRecord(raw.timeline);
  const source = Object.keys(timeline).length ? timeline : raw;
  const sourceProject = asRecord(source.project);
  const rawProject = asRecord(raw.project);
  return {
    projectId:
      firstOptionalId(source, ['project_id', 'projectId']) ??
      firstOptionalId(raw, ['project_id', 'projectId']) ??
      firstOptionalId(sourceProject, ['id']) ??
      firstOptionalId(rawProject, ['id']) ??
      undefined,
    refreshedAt: firstString(source, ['refreshed_at', 'refreshedAt']),
    phases: asArray(source.phases ?? source.phase_timeline ?? source.phase_windows).map(normalizeProjectPhase),
    checkItems: asArray(source.check_items ?? source.checkItems ?? source.items).map(normalizeCheckItem)
  };
};

const normalizeCountMap = (value: unknown): Record<string, number> => {
  const raw = asRecord(value);
  return Object.fromEntries(
    Object.entries(raw).map(([key, count]) => [key, asNumber(count)])
  );
};

const normalizeDashboardSummary = (input: unknown): DashboardSummary => {
  const raw = asRecord(input);
  const overduePhaseCount = firstNumber(raw, ['overdue_phase_count', 'overduePhaseCount']);
  const overdueCheckItemCount = firstNumber(raw, ['overdue_check_item_count', 'overdueCheckItemCount']);
  const explicitOverdueCount = firstNumber(raw, ['overdue_count', 'overdueCount'], Number.NaN);
  return {
    refreshedAt: firstString(raw, ['refreshed_at', 'refreshedAt']),
    filters: Object.fromEntries(
      Object.entries(asRecord(raw.filters)).map(([key, value]) => [key, typeof value === 'string' ? value : String(value ?? '')])
    ),
    projectCount: firstNumber(raw, ['project_count']),
    activeProjectCount: firstNumber(raw, ['active_project_count']),
    archivedProjectCount: firstNumber(raw, ['archived_project_count']),
    phaseCount: firstNumber(raw, ['phase_count']),
    checkItemCount: firstNumber(raw, ['check_item_count']),
    completedCheckItemCount: firstNumber(raw, ['completed_check_item_count']),
    openCheckItemCount: firstNumber(raw, ['open_check_item_count']),
    overdueCount: Number.isFinite(explicitOverdueCount)
      ? explicitOverdueCount
      : overduePhaseCount + overdueCheckItemCount,
    overduePhaseCount,
    overdueCheckItemCount,
    completionRate: firstNumber(raw, ['completion_rate']),
    keyIssueCount: firstNumber(raw, ['key_issue_count']),
    openKeyIssueCount: firstNumber(raw, ['open_key_issue_count']),
    highOpenKeyIssueCount: firstNumber(raw, ['high_open_key_issue_count']),
    collisionReportCount: firstNumber(raw, ['collision_report_count']),
    pendingCollisionReportCount: firstNumber(raw, ['pending_collision_report_count']),
    exportJobCount: firstNumber(raw, ['export_job_count']),
    failedExportJobCount: firstNumber(raw, ['failed_export_job_count']),
    byProjectStatus: normalizeCountMap(raw.by_project_status),
    byPhaseStatus: normalizeCountMap(raw.by_phase_status),
    byCheckItemStatus: normalizeCountMap(raw.by_check_item_status),
    byIssueStatus: normalizeCountMap(raw.by_issue_status),
    byIssueSeverity: normalizeCountMap(raw.by_issue_severity),
    byCollisionStatus: normalizeCountMap(raw.by_collision_status),
    byExportStatus: normalizeCountMap(raw.by_export_status),
    phaseProgress: asArray(raw.phase_progress).map(normalizeDashboardProgressRow),
    moduleProgress: asArray(raw.module_progress).map(normalizeDashboardProgressRow),
    projectStats: asArray(raw.project_summaries ?? raw.project_statistics ?? raw.project_stats ?? raw.projects).map(normalizeProjectStatistics)
  };
};

export type CreateProjectInput = {
  name: string;
  code: string;
  factoryId?: string | number | null;
  workshopId?: string | number | null;
  productionLineId?: string | number | null;
  plant: string;
  lineName: string;
  workshopName?: string;
  ownerName: string;
  plannedStartDate: string;
  plannedEndDate: string;
  metadata?: Record<string, unknown>;
};

export type UpdateProjectInput = Partial<CreateProjectInput> & {
  status?: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

export type UpdateProjectPhaseInput = {
  name?: string;
  sequence?: number;
  goal?: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  status?: string;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
};

export type UpdateCheckItemInput = {
  title?: string;
  moduleId?: string | number;
  projectPhaseId?: string | number;
  tags?: string[];
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  ownerName?: string;
  ownerIdaasId?: string;
  owners?: CheckItemOwner[];
  status?: string;
  isActive?: boolean;
  progressPercent?: number;
  metadata?: Record<string, unknown>;
};

export type CreateCheckItemInput = UpdateCheckItemInput & {
  title: string;
  moduleId: string | number;
  projectPhaseId: string | number;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
};

export type CreateExportInput = {
  reportName: string;
  reportType?: string | number;
  format: string;
};

export async function listProjects(filters?: ProjectScopeFilters) {
  return unwrap(await apiRequest<ApiEnvelope<unknown[]> | unknown[]>(withQuery('/projects/', filters))).map(normalizeProject);
}

export async function fetchDashboardSummary(filters?: ProjectScopeFilters): Promise<DashboardSummary | null> {
  try {
    return normalizeDashboardSummary(
      unwrap(await apiRequest<ApiEnvelope<unknown> | unknown>(withQuery('/dashboard/', filters)))
    );
  } catch (error) {
    if (error instanceof ApiError && [403, 404, 501].includes(error.status)) {
      return null;
    }
    throw error;
  }
}

export async function fetchDashboardProjectStatistics(filters?: ProjectScopeFilters): Promise<ProjectStatistics[]> {
  try {
    const payload = unwrap(
      await apiRequest<ApiEnvelope<unknown[]> | unknown[]>(withQuery('/dashboard/projects/', filters))
    );
    const record = asRecord(payload);
    const items = Array.isArray(payload)
      ? payload
      : asArray(record.project_summaries ?? record.results ?? record.items);
    return items.map(normalizeProjectStatistics);
  } catch (error) {
    if (error instanceof ApiError && [403, 404, 501].includes(error.status)) {
      return [];
    }
    throw error;
  }
}

type DashboardProjectDetail = {
  stats: ProjectStatistics | null;
  timeline: ProjectTimeline | null;
};

export async function fetchDashboardProjectDetail(projectId: string | number): Promise<DashboardProjectDetail> {
  try {
    const payload = unwrap(
      await apiRequest<ApiEnvelope<unknown> | unknown>(`/dashboard/projects/${projectId}/`)
    );
    const raw = asRecord(payload);
    const statSource = raw.project_summary ?? raw.summary ?? payload;
    const timelineSource = raw.timeline ?? raw.project_timeline;
    return {
      stats: normalizeProjectStatistics(statSource),
      timeline: timelineSource ? normalizeProjectTimeline(timelineSource) : null
    };
  } catch (error) {
    if (error instanceof ApiError && [403, 404, 501].includes(error.status)) {
      return { stats: null, timeline: null };
    }
    throw error;
  }
}

export async function fetchProjectTimeline(projectId: string | number): Promise<ProjectTimeline | null> {
  try {
    return normalizeProjectTimeline(
      unwrap(await apiRequest<ApiEnvelope<unknown> | unknown>(`/projects/${projectId}/timeline/`))
    );
  } catch (error) {
    if (error instanceof ApiError && [403, 404, 501].includes(error.status)) {
      return null;
    }
    throw error;
  }
}

export async function fetchHierarchyOptions(): Promise<HierarchyOptions> {
  try {
    const [factories, workshops, productionLines] = await Promise.all([
      requestWithPrefix<ApiEnvelope<unknown[]> | unknown[]>(BASE_CONFIG_PREFIX, '/factories/?is_active=true'),
      requestWithPrefix<ApiEnvelope<unknown[]> | unknown[]>(BASE_CONFIG_PREFIX, '/workshops/?is_active=true'),
      requestWithPrefix<ApiEnvelope<unknown[]> | unknown[]>(BASE_CONFIG_PREFIX, '/lines/?is_active=true')
    ]);

    return {
      factories: unwrap(factories).map(normalizeFactoryOption),
      workshops: unwrap(workshops).map(normalizeWorkshopOption),
      productionLines: unwrap(productionLines).map(normalizeProductionLineOption)
    };
  } catch (error) {
    if (error instanceof ApiError && [403, 404, 501].includes(error.status)) {
      return EMPTY_HIERARCHY;
    }
    throw error;
  }
}

export async function createProject(input: CreateProjectInput) {
  const project = unwrap(
    await apiRequest<ApiEnvelope<unknown> | unknown>('/projects/', {
      method: 'POST',
      body: JSON.stringify({
        code: input.code,
        name: input.name,
        factory: input.factoryId,
        workshop: input.workshopId,
        production_line: input.productionLineId,
        factory_name_snapshot: input.plant,
        workshop_name_snapshot: input.workshopName,
        line_name_snapshot: input.lineName,
        metadata: {
          ...(input.metadata ?? {}),
          owner_name: input.ownerName,
          planned_start_date: input.plannedStartDate,
          planned_end_date: input.plannedEndDate
        }
      })
    })
  );
  return normalizeProject(project);
}

export async function seedProjectTemplate(projectId: string | number) {
  return unwrap(
    await apiRequest<ApiEnvelope<unknown> | unknown>(`/projects/${projectId}/seed-template/`, {
      method: 'POST',
      body: JSON.stringify({})
    })
  );
}

export async function updateProject(projectId: string | number, input: UpdateProjectInput) {
  const project = unwrap(
    await apiRequest<ApiEnvelope<unknown> | unknown>(`/projects/${projectId}/`, {
      method: 'PATCH',
      body: JSON.stringify({
        code: input.code,
        name: input.name,
        description: input.description,
        status: input.status,
        factory: input.factoryId,
        workshop: input.workshopId,
        production_line: input.productionLineId,
        factory_name_snapshot: input.plant,
        workshop_name_snapshot: input.workshopName,
        line_name_snapshot: input.lineName,
        owner_name: input.ownerName,
        planned_start_date: input.plannedStartDate,
        planned_end_date: input.plannedEndDate,
        metadata: {
          ...(input.metadata ?? {}),
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
    const payload = unwrap(
      await apiRequest<ApiEnvelope<unknown[]> | unknown[]>(`/idaas-candidates/${search}`)
    );
    const record = asRecord(payload);
    const candidates = Array.isArray(payload)
      ? payload
      : asArray(record.candidates ?? record.results ?? record.items);
    return candidates.map(normalizeOwnerCandidate).filter(candidate => candidate.idaasId || candidate.displayName);
  } catch (error) {
    if (error instanceof ApiError && [403, 404, 501].includes(error.status)) {
      return [];
    }
    throw error;
  }
}

export async function fetchProjectBundle(
  projectId: string | number
): Promise<Omit<WorkspaceData, 'projects' | 'selectedProject' | 'hierarchy' | 'dashboardSummary' | 'projectStats' | 'selectedProjectStats' | 'timeline'>> {
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

export async function fetchWorkspaceData(projectId?: string | number, filters?: ProjectScopeFilters): Promise<WorkspaceData> {
  const effectiveFilters = projectId ? { ...filters, projectId } : filters;
  const [projects, hierarchyPayload, dashboardSummary, dashboardProjectStats] = await Promise.all([
    listProjects(filters),
    fetchHierarchyOptions()
      .catch(error => {
        if (error instanceof ApiError) return EMPTY_HIERARCHY;
        throw error;
      }),
    fetchDashboardSummary(effectiveFilters),
    fetchDashboardProjectStatistics(filters)
  ]);
  const hierarchy = mergeHierarchyFallback(hierarchyPayload, projects);
  const selectedProject = projects.find(project => `${project.id}` === `${projectId}`) ?? projects[0] ?? null;
  const projectStats = dashboardProjectStats.length ? dashboardProjectStats : dashboardSummary?.projectStats ?? [];
  const summaryWithProjectStats = dashboardSummary
    ? { ...dashboardSummary, projectStats: projectStats.length ? projectStats : dashboardSummary.projectStats }
    : null;

  if (!selectedProject) {
    return {
      projects,
      selectedProject: null,
      hierarchy,
      dashboardSummary: summaryWithProjectStats,
      projectStats,
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
  }

  const [bundle, dashboardProjectDetail, projectTimeline] = await Promise.all([
    fetchProjectBundle(selectedProject.id),
    fetchDashboardProjectDetail(selectedProject.id),
    fetchProjectTimeline(selectedProject.id)
  ]);
  const selectedProjectStats =
    dashboardProjectDetail.stats ??
    projectStats.find(stat => `${stat.projectId}` === `${selectedProject.id}`) ??
    null;
  const timeline = dashboardProjectDetail.timeline ?? projectTimeline;

  return {
    projects,
    selectedProject,
    hierarchy,
    dashboardSummary: summaryWithProjectStats,
    projectStats,
    selectedProjectStats,
    timeline,
    ...bundle
  };
}

export async function updateCheckItemOwner(
  checkItemId: string | number,
  payload: { ownerName?: string; ownerIdaasId?: string; owners?: CheckItemOwner[]; metadata?: Record<string, unknown> }
) {
  return updateCheckItem(checkItemId, payload);
}

export async function updateCheckItemStatus(
  checkItemId: string | number,
  payload: { status: CheckItemStatus; resultNote?: string; source?: string; comment?: string }
) {
  return normalizeCheckItem(unwrap(
    await apiRequest<ApiEnvelope<unknown> | unknown>(`/check-items/${checkItemId}/set-status/`, {
      method: 'POST',
      body: JSON.stringify({
        status: payload.status,
        result_note: payload.resultNote,
        source: payload.source,
        comment: payload.comment
      })
    })
  ));
}

export async function fetchCheckItemAuditLogs(checkItemId: string | number) {
  const query = new URLSearchParams({
    object_type: 'CheckItem',
    object_id: String(checkItemId),
    page_size: '100'
  });
  const payload = await apiRequest<ApiEnvelope<unknown[]> | unknown[]>(`/audit-logs/?${query.toString()}`);
  return asArray(unwrap(payload)).map(normalizeAuditLog);
}

export async function uploadAttachment(input: {
  file: File;
  projectId?: string | number | null;
  objectType: string;
  objectId: string | number;
}) {
  const formData = new FormData();
  formData.append('file', input.file);
  if (input.projectId !== undefined && input.projectId !== null) {
    formData.append('project', String(input.projectId));
  }
  formData.append('object_type', input.objectType);
  formData.append('object_id', String(input.objectId));
  return normalizeAttachment(unwrap(
    await apiRequest<ApiEnvelope<unknown> | unknown>('/attachments/upload/', {
      method: 'POST',
      body: formData
    })
  ));
}

export async function fetchAttachmentDownloadLink(attachmentId: string | number) {
  const payload = unwrap(
    await apiRequest<ApiEnvelope<unknown> | unknown>(`/attachments/${attachmentId}/download-link/`)
  );
  const raw = asRecord(payload);
  return firstString(raw, ['download_url', 'downloadUrl', 'url']);
}

export async function updateProjectPhase(phaseId: string | number, payload: UpdateProjectPhaseInput) {
  return normalizeProjectPhase(unwrap(
    await apiRequest<ApiEnvelope<unknown> | unknown>(`/project-phases/${phaseId}/`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: payload.name,
        sort_order: payload.sequence,
        goal: payload.goal,
        description: payload.goal,
        planned_start: payload.plannedStartDate,
        planned_end: payload.plannedEndDate,
        status: payload.status,
        is_enabled: payload.isActive,
        metadata: {
          ...(payload.metadata ?? {}),
          notes: payload.goal
        }
      })
    })
  ));
}

export async function updateCheckItem(checkItemId: string | number, payload: UpdateCheckItemInput) {
  const owners = serializeCheckItemOwners(payload.owners);
  const primaryOwner = owners[0];
  return normalizeCheckItem(unwrap(
    await apiRequest<ApiEnvelope<unknown> | unknown>(`/check-items/${checkItemId}/`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: payload.title,
        module: payload.moduleId,
        project_phase: payload.projectPhaseId,
        phase: payload.projectPhaseId,
        tags: payload.tags,
        planned_start: optionalDate(payload.plannedStartDate),
        planned_end: optionalDate(payload.plannedEndDate),
        due_date: optionalDate(payload.plannedEndDate),
        owners: payload.owners === undefined ? undefined : owners,
        owner_name: primaryOwner?.display_name ?? payload.ownerName,
        owner_idaas_id: primaryOwner?.idaas_id ?? payload.ownerIdaasId,
        status: payload.status,
        is_enabled: payload.isActive,
        progress_percent: payload.progressPercent,
        metadata: {
          ...(payload.metadata ?? {}),
          tags: payload.tags,
          planned_start_date: optionalDate(payload.plannedStartDate),
          planned_end_date: optionalDate(payload.plannedEndDate),
          owner_name: primaryOwner?.display_name ?? payload.ownerName,
          owner_idaas_id: primaryOwner?.idaas_id ?? payload.ownerIdaasId
        }
      })
    })
  ));
}

export async function createCheckItem(projectId: string | number, payload: CreateCheckItemInput) {
  const owners = serializeCheckItemOwners(payload.owners);
  const primaryOwner = owners[0];
  return normalizeCheckItem(unwrap(
    await apiRequest<ApiEnvelope<unknown> | unknown>(`/projects/${projectId}/check-items/`, {
      method: 'POST',
      body: JSON.stringify({
        phase: payload.projectPhaseId,
        project_phase: payload.projectPhaseId,
        module: payload.moduleId,
        title: payload.title,
        tags: payload.tags,
        planned_start: optionalDate(payload.plannedStartDate),
        planned_end: optionalDate(payload.plannedEndDate),
        due_date: optionalDate(payload.plannedEndDate),
        owners,
        owner_name: primaryOwner?.display_name ?? payload.ownerName,
        owner_idaas_id: primaryOwner?.idaas_id ?? payload.ownerIdaasId,
        status: payload.status ?? 'pending',
        is_enabled: payload.isActive ?? true,
        progress_percent: payload.progressPercent,
        metadata: {
          ...(payload.metadata ?? {}),
          tags: payload.tags,
          planned_start_date: optionalDate(payload.plannedStartDate),
          planned_end_date: optionalDate(payload.plannedEndDate),
          owner_name: primaryOwner?.display_name ?? payload.ownerName,
          owner_idaas_id: primaryOwner?.idaas_id ?? payload.ownerIdaasId
        }
      })
    })
  ));
}

export async function deleteProjectPhase(phaseId: string | number) {
  await apiRequest<ApiEnvelope<unknown> | unknown>(`/project-phases/${phaseId}/`, {
    method: 'DELETE'
  });
}

export async function deleteCheckItem(checkItemId: string | number) {
  await apiRequest<ApiEnvelope<unknown> | unknown>(`/check-items/${checkItemId}/`, {
    method: 'DELETE'
  });
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

export async function fetchExportDownloadLink(exportJobId: string | number) {
  const payload = unwrap(
    await apiRequest<ApiEnvelope<unknown> | unknown>(`/export-jobs/${exportJobId}/download-link/`)
  );
  const raw = asRecord(payload);
  return firstString(raw, ['download_url', 'downloadUrl', 'url']);
}
