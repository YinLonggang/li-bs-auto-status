import { BASE_CONFIG_PREFIX } from '../config';
import { ApiError, apiBlobRequest, apiRequest, requestWithPrefix } from './http';
import type {
  ApiEnvelope,
  Attachment,
  AttachmentPreview,
  AuditLog,
  CheckItem,
  CheckItemOwner,
  CheckItemStatus,
  ChecklistTemplate,
  ChecklistTemplateInput,
  ChecklistTemplateItem,
  CollisionReportBlock,
  CollisionReport,
  DashboardProgressRow,
  DashboardSummary,
  ExportTask,
  FactoryOption,
  HierarchyOptions,
  InspectionModule,
  InspectionModuleInput,
  KeyIssue,
  OwnerCandidate,
  PhaseDefinition,
  PhaseTemplate,
  PhaseTemplateInput,
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

const asStringRecord = (value: unknown): Record<string, string> => {
  const raw = asRecord(value);
  return Object.fromEntries(
    Object.entries(raw)
      .map(([key, item]) => [key, String(item ?? '').trim()])
      .filter(([, item]) => item)
  );
};

const safeJsonParse = (value: string): unknown => {
  if (!value.trim()) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const asString = (value: unknown, fallback = '') =>
  typeof value === 'string' && value.trim() ? value : fallback;

const asNumber = (value: unknown, fallback = 0) => {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const asBoolean = (value: unknown, fallback = false) =>
  typeof value === 'boolean' ? value : fallback;

const isLegacyCsvEndpointFallback = (error: unknown) =>
  error instanceof ApiError && [404, 405].includes(error.status);

const csvProjectQuery = (projectId: string | number) =>
  `project=${encodeURIComponent(String(projectId))}`;

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
  const metadata = asRecord(raw.metadata);
  const manualName = firstString(raw, ['manualName', 'manual_name']);
  const sortOrder = firstNumber(raw, ['sortOrder', 'sort_order'], Number.NaN);
  const isPrimary = asBoolean(raw.isPrimary, asBoolean(raw.is_primary, false));
  return {
    displayName: firstString(raw, ['displayName', 'display_name', 'name', 'ownerName', 'owner_name']),
    idaasId: firstString(raw, ['idaasId', 'idaas_id', 'user_id', 'open_id', 'id']),
    email: firstString(raw, ['email']),
    department: firstString(raw, ['department', 'department_name', 'org_name']),
    avatarUrl:
      firstString(raw, ['avatarUrl', 'avatar_url', 'avatar', 'picture', 'photo', 'photoUrl']) ||
      firstString(metadata, ['avatarUrl', 'avatar_url', 'avatar', 'picture', 'photo', 'photoUrl']),
    manualName: '',
    manual_name: '',
    role: firstString(raw, ['role']),
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : undefined,
    sort_order: Number.isFinite(sortOrder) ? sortOrder : undefined,
    isPrimary,
    is_primary: isPrimary,
    metadata
  };
};

const normalizeCheckItemOwners = (
  input: unknown,
  fallbackName = '',
  fallbackIdaasId = '',
  fallbackAvatarUrl = ''
) => {
  const seen = new Set<string>();
  const owners = asArray(input)
    .map(normalizeCheckItemOwner)
    .filter(owner => owner.idaasId)
    .filter(owner => {
      const key = owner.idaasId || '';
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (owners.length) return owners;
  return fallbackIdaasId
    ? [{ displayName: fallbackName || fallbackIdaasId, idaasId: fallbackIdaasId, avatarUrl: fallbackAvatarUrl || undefined }]
    : [];
};

const serializeCheckItemOwners = (owners?: CheckItemOwner[]) =>
  (owners ?? [])
    .map((owner, index) => ({
      display_name: (owner.displayName || owner.idaasId || '').trim(),
      idaas_id: owner.idaasId?.trim() || undefined,
      email: owner.email || undefined,
      manual_name: undefined,
      role: owner.role || undefined,
      sort_order: index,
      is_primary: owner.isPrimary ?? owner.is_primary ?? undefined,
      metadata: {
        ...(owner.metadata ?? {}),
        ...(owner.department ? { department: owner.department } : {}),
        ...(owner.avatarUrl ? { avatar_url: owner.avatarUrl } : {})
      }
    }))
    .filter(owner => owner.idaas_id);

const serializePhaseDefinitions = (definitions?: PhaseDefinition[]) =>
  (definitions ?? [])
    .map((definition, index) => ({
      key: definition.key.trim(),
      name: definition.name.trim(),
      description: definition.description?.trim() || '',
      sort_order: definition.sortOrder ?? (index + 1) * 10,
      planned_start: optionalDate(definition.plannedStart),
      planned_end: optionalDate(definition.plannedEnd),
      duration_days: definition.durationDays ?? null,
      metadata: definition.metadata ?? {}
    }))
    .filter(definition => definition.key && definition.name);

const serializeChecklistTemplateItems = (items?: ChecklistTemplateItem[]) =>
  (items ?? [])
    .map((item, index) => ({
      title: item.title.trim(),
      description: item.description?.trim() || '',
      sort_order: item.sortOrder ?? index * 10,
      planned_start: optionalDate(item.plannedStart),
      planned_end: optionalDate(item.plannedEnd),
      due_date: optionalDate(item.dueDate),
      priority: item.priority?.trim() || '',
      is_enabled: item.isActive ?? true,
      metadata: item.metadata ?? {}
    }))
    .filter(item => item.title);

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
    previewUrl: firstString(raw, ['previewUrl', 'preview_url']) || null,
    contentType: firstString(raw, ['contentType', 'content_type']),
    fileSize: firstNumber(raw, ['fileSize', 'file_size']),
    uploadedBy: firstString(raw, ['uploadedBy', 'uploaded_by_name']),
    createdAt: firstString(raw, ['createdAt', 'created_at']),
    canPreview: asBoolean(raw.canPreview, asBoolean(raw.can_preview, true)),
    canDownload: asBoolean(raw.canDownload, asBoolean(raw.can_download, true)),
    isImage: asBoolean(raw.isImage, asBoolean(raw.is_image, false)),
    metadata: asRecord(raw.metadata)
  };
};

const IMAGE_ATTACHMENT_PATTERN = /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i;

const isImageAttachmentForBlocks = (attachment: Attachment) =>
  attachment.isImage === true ||
  attachment.contentType?.toLowerCase().startsWith('image/') ||
  IMAGE_ATTACHMENT_PATTERN.test(attachment.fileName);

const collisionDefaultSectionKey = (slotKey: string) => {
  if (['problemDescription', 'vehicleModel', 'source'].includes(slotKey)) return 'section_1';
  if (slotKey === 'diagnosisRepair') return 'section_2';
  if (['processAnalysis', 'rootCause', 'rootCauseConclusion', 'summary'].includes(slotKey)) return 'section_3';
  if (['containment', 'correctiveAction', 'impact', 'preventiveAction', 'validation'].includes(slotKey)) return 'section_4';
  if (slotKey === 'supportNeeded') return 'section_5';
  if (slotKey === 'approvalSignoff') return 'signoff';
  return 'summary';
};

const normalizeCollisionReportBlock = (
  input: unknown,
  attachmentById: Map<string, Attachment>,
  fallbackReportId: string | number,
  fallbackIndex: number
): CollisionReportBlock => {
  const raw = asRecord(input);
  const metadata = metadataOf(raw);
  const detailPayload = raw.attachmentDetail ?? raw.attachment_detail;
  const attachmentPayload = raw.attachment;
  const embeddedAttachment = isRecord(detailPayload)
    ? normalizeAttachment(detailPayload)
    : isRecord(attachmentPayload)
      ? normalizeAttachment(attachmentPayload)
      : null;
  const attachmentId =
    (isRecord(attachmentPayload) ? null : firstOptionalId(raw, ['attachment'])) ??
    (embeddedAttachment ? embeddedAttachment.id : null);
  const attachmentDetail = embeddedAttachment ?? (attachmentId !== null ? attachmentById.get(String(attachmentId)) ?? null : null);
  const slotKey =
    firstString(raw, ['slotKey', 'slot_key']) ||
    firstString(metadata, ['collision_slot', 'collisionSlot', 'slot_key', 'slotKey'], 'problemDescription');
  const sectionKey =
    firstString(raw, ['sectionKey', 'section_key']) ||
    firstString(metadata, ['section_key', 'sectionKey'], collisionDefaultSectionKey(slotKey));
  const blockType = firstString(
    raw,
    ['blockType', 'block_type'],
    attachmentDetail ? (isImageAttachmentForBlocks(attachmentDetail) ? 'image' : 'file') : 'text'
  ).toLowerCase();
  const rawSortOrder = firstNumber(raw, ['sortOrder', 'sort_order'], Number.NaN);
  const metadataSortOrder = firstNumber(metadata, ['sortOrder', 'sort_order'], fallbackIndex);

  return {
    id: firstId(raw, ['id'], attachmentDetail ? `attachment-${attachmentDetail.id}` : `block-${fallbackIndex}`),
    report: firstOptionalId(raw, ['report']) ?? fallbackReportId,
    sectionKey,
    slotKey,
    slotLabel:
      firstString(raw, ['slotLabel', 'slot_label']) ||
      firstString(metadata, ['collision_slot_label', 'collisionSlotLabel', 'slot_label', 'slotLabel'], slotKey),
    blockType,
    text: firstString(raw, ['text']),
    attachment: attachmentId,
    attachmentDetail,
    caption:
      firstString(raw, ['caption']) ||
      firstString(metadata, ['caption', 'image_caption']),
    sortOrder: Number.isFinite(rawSortOrder) ? rawSortOrder : metadataSortOrder,
    metadata
  };
};

const fallbackCollisionAttachmentBlocksFromAttachments = (
  attachments: Attachment[],
  fallbackReportId: string | number
): CollisionReportBlock[] =>
  attachments
    .map((attachment, index) => {
      const metadata = asRecord(attachment.metadata);
      const slotKey = firstString(metadata, ['collision_slot', 'collisionSlot', 'slot_key', 'slotKey'], 'problemDescription');
      const sectionKey = firstString(metadata, ['section_key', 'sectionKey'], collisionDefaultSectionKey(slotKey));
      return {
        id: `attachment-${attachment.id}`,
        report: fallbackReportId,
        sectionKey,
        slotKey,
        slotLabel: firstString(metadata, ['collision_slot_label', 'collisionSlotLabel', 'slot_label', 'slotLabel'], slotKey),
        blockType: isImageAttachmentForBlocks(attachment) ? 'image' : 'file',
        text: '',
        attachment: attachment.id,
        attachmentDetail: attachment,
        caption: firstString(metadata, ['caption', 'image_caption']),
        sortOrder: firstNumber(metadata, ['sortOrder', 'sort_order'], index),
        metadata
      };
    });

const normalizeCollisionReportBlocks = (
  input: unknown,
  attachments: Attachment[],
  fallbackReportId: string | number
) => {
  const attachmentById = new Map(attachments.map(attachment => [String(attachment.id), attachment]));
  const rawBlocks = asArray(input);
  const blocks = rawBlocks.length
    ? rawBlocks.map((block, index) => normalizeCollisionReportBlock(block, attachmentById, fallbackReportId, index))
    : fallbackCollisionAttachmentBlocksFromAttachments(attachments, fallbackReportId);
  return blocks.sort((left, right) => left.sortOrder - right.sortOrder);
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
  const definitions = asArray(raw.phase_definitions).map(normalizePhaseDefinition);
  return {
    id: firstId(raw, ['id']),
    code: firstString(raw, ['code']),
    name: firstString(raw, ['name']),
    version: firstNumber(raw, ['version'], 1),
    description: firstString(raw, ['description']),
    sequence: firstNumber(raw, ['sequence', 'sort_order', 'version']),
    defaultGoal: firstString(raw, ['defaultGoal', 'description']) || `${definitions.length || 0} 个阶段`,
    defaultDurationDays: firstNumber(metadata, ['defaultDurationDays', 'default_duration_days']),
    isActive: asBoolean(raw.isActive, asBoolean(raw.is_active, true)),
    phaseDefinitions: definitions,
    metadata
  };
};

const normalizePhaseDefinition = (input: unknown): PhaseDefinition => {
  const raw = asRecord(input);
  const durationDays = firstNumber(raw, ['durationDays', 'duration_days'], Number.NaN);
  return {
    key: firstString(raw, ['key', 'phase_key']),
    name: firstString(raw, ['name']),
    description: firstString(raw, ['description']),
    sortOrder: firstNumber(raw, ['sortOrder', 'sort_order'], 0),
    plannedStart: firstString(raw, ['plannedStart', 'planned_start']) || null,
    plannedEnd: firstString(raw, ['plannedEnd', 'planned_end']) || null,
    durationDays: Number.isFinite(durationDays) ? durationDays : null,
    metadata: asRecord(raw.metadata)
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
  const ownerIdaasId = firstString(raw, ['ownerIdaasId', 'owner_idaas_id']);
  const ownerName =
    firstString(raw, ['ownerName', 'owner_display_name', 'owner_name']) ||
    firstString(metadata, ['ownerName', 'owner_name']);
  const ownerAvatarUrl = firstString(raw, ['ownerAvatarUrl', 'owner_avatar_url', 'avatarUrl', 'avatar_url']);
  const owners = normalizeCheckItemOwners(metadata.owners, ownerName, ownerIdaasId, ownerAvatarUrl);
  return {
    id: firstId(raw, ['id']),
    code: firstString(raw, ['code']),
    name: firstString(raw, ['name']),
    description: firstString(raw, ['description']),
    sequence: firstNumber(raw, ['sequence', 'sort_order']),
    isActive: asBoolean(raw.isActive, asBoolean(raw.is_active, true)),
    ownerName: ownerName || owners[0]?.displayName,
    ownerIdaasId: ownerIdaasId || owners[0]?.idaasId,
    ownerEmail: firstString(raw, ['ownerEmail', 'owner_email']) || owners[0]?.email,
    owners,
    color: firstString(metadata, ['color']),
    milestones: asArray(metadata.milestones).map(item => Number(item)).filter(item => Number.isFinite(item)),
    metadata
  };
};

const normalizeChecklistTemplate = (input: unknown): ChecklistTemplate => {
  const raw = asRecord(input);
  const metadata = metadataOf(raw);
  const itemTemplates = asArray(raw.item_templates).map(normalizeChecklistTemplateItem);
  return {
    id: firstId(raw, ['id']),
    moduleId: firstId(raw, ['moduleId', 'module']),
    moduleCode: firstString(raw, ['moduleCode', 'module_code']),
    moduleName: firstString(raw, ['moduleName', 'module_name']),
    phaseTemplateId: firstOptionalId(raw, ['phaseTemplateId', 'phase_template']),
    phaseTemplateCode: firstString(raw, ['phaseTemplateCode', 'phase_template_code']),
    phaseKey: firstString(raw, ['phaseKey', 'phase_key']),
    code: firstString(raw, ['code']),
    name: firstString(raw, ['name']),
    title: firstString(raw, ['title', 'name']),
    version: firstNumber(raw, ['version'], 1),
    isActive: asBoolean(raw.isActive, asBoolean(raw.is_active, true)),
    defaultOwnerRole: firstString(metadata, ['defaultOwnerRole', 'default_owner_role']) || `${itemTemplates.length || 0} 个模板项`,
    defaultDurationDays: firstNumber(metadata, ['defaultDurationDays', 'default_duration_days']),
    requiredAttachment: asBoolean(metadata.requiredAttachment, asBoolean(metadata.required_attachment)),
    severity: firstString(metadata, ['severity'], 'medium'),
    itemTemplates,
    metadata
  };
};

const normalizeChecklistTemplateItem = (input: unknown): ChecklistTemplateItem => {
  const raw = asRecord(input);
  return {
    title: firstString(raw, ['title']),
    description: firstString(raw, ['description']),
    sortOrder: firstNumber(raw, ['sortOrder', 'sort_order'], 0),
    plannedStart: firstString(raw, ['plannedStart', 'planned_start']) || null,
    plannedEnd: firstString(raw, ['plannedEnd', 'planned_end']) || null,
    dueDate: firstString(raw, ['dueDate', 'due_date']) || null,
    priority: firstString(raw, ['priority']),
    isActive: asBoolean(raw.isEnabled, asBoolean(raw.is_enabled, asBoolean(raw.isActive, asBoolean(raw.is_active, true)))),
    metadata: asRecord(raw.metadata)
  };
};

const normalizeCheckItem = (input: unknown): CheckItem => {
  const raw = asRecord(input);
  const metadata = metadataOf(raw);
  const ownerIdaasId = firstString(raw, ['ownerIdaasId', 'owner_idaas_id']);
  const ownerName = ownerIdaasId
    ? firstString(raw, ['ownerName', 'owner_display_name', 'owner_name'], '未设置')
    : firstString(raw, ['ownerName', 'owner_display_name'], '未设置');
  const ownerAvatarUrl = firstString(raw, ['ownerAvatarUrl', 'owner_avatar_url', 'avatarUrl', 'avatar_url']);
  const owners = normalizeCheckItemOwners(raw.owners, ownerName === '未设置' ? '' : ownerName, ownerIdaasId, ownerAvatarUrl);
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
      ? owners[0]?.displayName || '未设置'
      : ownerName || owners[0]?.displayName || '未设置',
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
    projectPhaseId: firstId(raw, ['projectPhaseId', 'phase', 'project_phase', 'project_phase_id']) || null,
    phaseName: firstString(raw, ['phaseName', 'phase_name']),
    moduleId: firstId(raw, ['moduleId', 'module', 'module_id']) || null,
    moduleName: firstString(raw, ['moduleName', 'module_name']),
    checkItemId: firstId(raw, ['checkItemId', 'check_item', 'check_item_id']) || null,
    checkItemTitle: firstString(raw, ['checkItemTitle', 'check_item_title']),
    title: firstString(raw, ['title']),
    description: firstString(raw, ['description']),
    severity: firstString(raw, ['severity'], 'medium'),
    status: firstString(raw, ['status'], 'open'),
    ownerName: firstString(raw, ['ownerName', 'owner_display_name', 'owner_name'], '未设置'),
    ownerIdaasId: firstString(raw, ['ownerIdaasId', 'owner_idaas_id']),
    ownerEmail: firstString(raw, ['ownerEmail', 'owner_email']),
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
    confirmerIdaasId: firstString(raw, ['confirmerIdaasId', 'confirmer_idaas_id']),
    confirmerEmail: firstString(raw, ['confirmerEmail', 'confirmer_email']),
    currentProgress: firstString(raw, ['currentProgress', 'progress_note']) || firstString(metadata, ['currentProgress', 'current_progress']),
    remark: firstString(raw, ['remark']) || firstString(metadata, ['remark']),
    imageCaptions: asStringRecord(metadata.imageCaptions ?? metadata.image_captions),
    metadata,
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
  const reportId = firstId(raw, ['id']);
  const attachments = asArray(raw.attachments).map(normalizeAttachment);
  return {
    id: reportId,
    projectId: firstId(raw, ['projectId', 'project']),
    projectPhaseId: firstId(raw, ['projectPhaseId', 'phase', 'project_phase', 'project_phase_id']) || null,
    phaseName: firstString(raw, ['phaseName', 'phase_name']),
    title: firstString(raw, ['title']),
    reportDate: firstString(raw, ['reportDate', 'report_date']),
    status: firstString(raw, ['status'], 'draft'),
    riskLevel: firstString(raw, ['riskLevel', 'risk_level']) || firstString(metadata, ['riskLevel', 'risk_level', 'severity'], 'medium'),
    summary: firstString(raw, ['summary']) || firstString(content, ['summary']),
    content,
    problemDefinition: firstString(content, ['problemDefinition', 'problem_statement', 'problem']),
    parts: firstString(content, ['parts']),
    vehicleModel: firstString(content, ['vehicleModel', 'vehicle_model', 'model']),
    failureFrequency: firstString(content, ['failureFrequency', 'failure_frequency', 'frequency']),
    responsibilityArea: firstString(content, ['responsibilityArea', 'responsibility_area', 'area']),
    progress: firstString(content, ['progress']),
    remark: firstString(content, ['remark']),
    source: firstString(content, ['source']) || firstString(metadata, ['source']),
    problemDescription: firstString(content, ['problemDescription', 'problem_description']),
    diagnosisRepair: firstString(content, ['diagnosisRepair', 'diagnosis_repair']),
    processAnalysis: firstString(content, ['processAnalysis', 'process_analysis', 'analysis']),
    supportNeeded: firstString(content, ['supportNeeded', 'support_needed']),
    impact: firstString(content, ['impact']),
    containment: firstString(content, ['containment']),
    rootCause: firstString(content, ['rootCause', 'root_cause']),
    rootCauseConclusion: firstString(content, ['rootCauseConclusion', 'root_cause_conclusion']) || firstString(metadata, ['root_cause_conclusion']),
    correctiveAction: stringifyAction(content.correctiveAction ?? content.corrective_action ?? content.countermeasures),
    preventiveAction: firstString(content, ['preventiveAction', 'preventive_action']),
    validation: firstString(content, ['validation', 'verification']),
    owner: firstString(content, ['owner']) || firstString(metadata, ['owner'], '未设置'),
    dueDate: firstString(content, ['dueDate', 'due_date']) || firstString(raw, ['report_date']),
    approvalSignoff:
      approvals.map(item => `${firstString(item, ['step_name'], '签核')}: ${firstString(item, ['status'], 'pending')}`).join(' / ') ||
      firstString(content, ['approvalSignoff', 'approval_signoff']),
    imageObjectKey: firstString(content, ['imageObjectKey', 'image_object_key', 'photo', 'problemPhotoObjectKey', 'problem_photo_object_key']),
    imageCaptions: asStringRecord(content.imageCaptions ?? content.image_captions),
    metadata,
    attachments,
    blocks: normalizeCollisionReportBlocks(raw.blocks ?? raw.collisionBlocks ?? raw.collision_blocks, attachments, reportId),
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
  const metadata = asRecord(raw.metadata);
  const idaasId = firstString(raw, ['idaasId', 'idaas_id', 'user_id', 'open_id', 'id']);
  const displayName = firstString(raw, ['displayName', 'display_name', 'name', 'username'], idaasId);
  return {
    idaasId,
    displayName,
    email: firstString(raw, ['email']),
    department: firstString(raw, ['department', 'department_name', 'org_name']),
    avatarUrl:
      firstString(raw, ['avatarUrl', 'avatar_url', 'avatar', 'picture', 'photo', 'photoUrl']) ||
      firstString(metadata, ['avatarUrl', 'avatar_url', 'avatar', 'picture', 'photo', 'photoUrl'])
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
  phaseTemplateId?: string | number | null;
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

export type CreatePhaseTemplateInput = Required<Pick<PhaseTemplateInput, 'code' | 'name' | 'version' | 'phaseDefinitions'>> &
  Omit<PhaseTemplateInput, 'code' | 'name' | 'version' | 'phaseDefinitions'>;

export type UpdatePhaseTemplateInput = PhaseTemplateInput;

export type CreateChecklistTemplateInput = Required<Pick<ChecklistTemplateInput, 'code' | 'name' | 'moduleId'>> &
  Omit<ChecklistTemplateInput, 'code' | 'name' | 'moduleId'>;

export type UpdateChecklistTemplateInput = ChecklistTemplateInput;

export type CreateExportInput = {
  reportName: string;
  reportType?: string | number;
  format: string;
};

export type KeyIssueInput = {
  projectPhaseId?: string | number | null;
  moduleId?: string | number | null;
  checkItemId?: string | number | null;
  title: string;
  description?: string;
  severity?: string;
  status?: string;
  supplier?: string;
  ownerName?: string;
  ownerIdaasId?: string;
  ownerEmail?: string;
  confirmer?: string;
  confirmerIdaasId?: string;
  confirmerEmail?: string;
  dueDate?: string | null;
  countermeasure?: string;
  currentProgress?: string;
  remark?: string;
  problemPhotoBucketName?: string;
  problemPhotoObjectKey?: string;
  resolution?: string;
  imageCaptions?: Record<string, string>;
  metadata?: Record<string, unknown>;
};

export type CollisionReportInput = {
  projectPhaseId?: string | number | null;
  title: string;
  reportDate?: string | null;
  status?: string;
  riskLevel?: string;
  summary?: string;
  owner?: string;
  dueDate?: string | null;
  problemDefinition?: string;
  parts?: string;
  vehicleModel?: string;
  failureFrequency?: string;
  responsibilityArea?: string;
  progress?: string;
  remark?: string;
  source?: string;
  problemDescription?: string;
  diagnosisRepair?: string;
  processAnalysis?: string;
  supportNeeded?: string;
  impact?: string;
  containment?: string;
  rootCause?: string;
  rootCauseConclusion?: string;
  correctiveAction?: string;
  preventiveAction?: string;
  validation?: string;
  approvalSignoff?: string;
  imageObjectKey?: string;
  imageCaptions?: Record<string, string>;
  content?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type CsvImportResult<T> = {
  created: number;
  updated: number;
  items: T[];
};

const optionalId = (value?: string | number | null) => {
  if (value === undefined || value === null || `${value}` === '') return undefined;
  return value;
};

const serializeKeyIssuePayload = (input: Partial<KeyIssueInput>) => ({
  phase: optionalId(input.projectPhaseId),
  project_phase: optionalId(input.projectPhaseId),
  module: optionalId(input.moduleId),
  check_item: optionalId(input.checkItemId),
  title: input.title,
  description: input.description,
  problem_photo_bucket_name: input.problemPhotoBucketName,
  problem_photo_object_key: input.problemPhotoObjectKey,
  countermeasure: input.countermeasure,
  severity: input.severity,
  status: input.status,
  supplier: input.supplier,
  owner_display_name: input.ownerName,
  owner_name: input.ownerName,
  owner_idaas_id: input.ownerIdaasId,
  owner_email: input.ownerEmail,
  confirmer_display_name: input.confirmer,
  confirmer_name: input.confirmer,
  confirmer_idaas_id: input.confirmerIdaasId,
  confirmer_email: input.confirmerEmail,
  due_date: optionalDate(input.dueDate),
  progress_note: input.currentProgress,
  remark: input.remark,
  resolution: input.resolution,
  metadata: {
    ...(input.metadata ?? {}),
    countermeasure: input.countermeasure,
    current_progress: input.currentProgress,
    remark: input.remark,
    imageCaptions: input.imageCaptions ?? {}
  }
});

const serializeCollisionReportPayload = (input: Partial<CollisionReportInput>) => {
  const content = {
    ...(input.content ?? {}),
    problemDefinition: input.problemDefinition,
    parts: input.parts,
    vehicleModel: input.vehicleModel,
    failureFrequency: input.failureFrequency,
    responsibilityArea: input.responsibilityArea,
    progress: input.progress,
    remark: input.remark,
    source: input.source,
    problemDescription: input.problemDescription,
    diagnosisRepair: input.diagnosisRepair,
    processAnalysis: input.processAnalysis,
    supportNeeded: input.supportNeeded,
    impact: input.impact,
    containment: input.containment,
    rootCause: input.rootCause,
    rootCauseConclusion: input.rootCauseConclusion,
    correctiveAction: input.correctiveAction,
    preventiveAction: input.preventiveAction,
    validation: input.validation,
    owner: input.owner,
    due_date: optionalDate(input.dueDate),
    approvalSignoff: input.approvalSignoff,
    imageObjectKey: input.imageObjectKey,
    imageCaptions: input.imageCaptions ?? {}
  };

  return {
    phase: optionalId(input.projectPhaseId),
    project_phase: optionalId(input.projectPhaseId),
    title: input.title,
    report_date: optionalDate(input.reportDate),
    summary: input.summary,
    status: input.status,
    content,
    metadata: {
      ...(input.metadata ?? {}),
      risk_level: input.riskLevel,
      owner: input.owner,
      source: input.source,
      root_cause_conclusion: input.rootCauseConclusion
    }
  };
};

const csvEscape = (value: unknown) => {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const csvRows = (headers: string[], rows: unknown[][]) =>
  [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');

const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += char;
  }

  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
};

const csvRecords = (text: string) => {
  const [headers = [], ...rows] = parseCsv(text);
  return rows.map(row =>
    Object.fromEntries(headers.map((header, index) => [header.trim().toLowerCase(), row[index]?.trim() ?? '']))
  );
};

const csvField = (record: Record<string, string>, keys: string[]) => {
  for (const key of keys) {
    const value = record[key.toLowerCase()];
    if (value) return value;
  }
  return '';
};

const keyIssueCsvHeaders = [
  'id',
  'phase',
  'module',
  'check_item',
  'title',
  'description',
  'severity',
  'status',
  'supplier',
  'owner_name',
  'confirmer_name',
  'due_date',
  'countermeasure',
  'progress_note',
  'remark',
  'problem_photo_bucket_name',
  'problem_photo_object_key'
];

const collisionCsvHeaders = [
  'id',
  'phase',
  'title',
  'report_date',
  'status',
  'risk_level',
  'summary',
  'owner',
  'due_date',
  'problem_definition',
  'parts',
  'vehicle_model',
  'failure_frequency',
  'responsibility_area',
  'progress',
  'remark',
  'source',
  'problem_description',
  'diagnosis_repair',
  'process_analysis',
  'support_needed',
  'impact',
  'containment',
  'root_cause',
  'root_cause_conclusion',
  'corrective_action',
  'preventive_action',
  'validation',
  'approval_signoff',
  'image_object_key',
  'image_captions'
];

const keyIssuesToCsv = (issues: KeyIssue[]) =>
  csvRows(
    keyIssueCsvHeaders,
    issues.map(issue => [
      issue.id,
      issue.projectPhaseId ?? '',
      issue.moduleId ?? '',
      issue.checkItemId ?? '',
      issue.title,
      issue.description,
      issue.severity,
      issue.status,
      issue.supplier,
      issue.ownerName,
      issue.confirmer,
      issue.dueDate,
      issue.countermeasure,
      issue.currentProgress,
      issue.remark,
      issue.problemPhotoBucketName,
      issue.problemPhotoObjectKey
    ])
  );

const collisionReportsToCsv = (reports: CollisionReport[]) =>
  csvRows(
    collisionCsvHeaders,
    reports.map(report => [
      report.id,
      report.projectPhaseId ?? '',
      report.title,
      report.reportDate,
      report.status,
      report.riskLevel,
      report.summary,
      report.owner,
      report.dueDate,
      report.problemDefinition,
      report.parts,
      report.vehicleModel,
      report.failureFrequency,
      report.responsibilityArea,
      report.progress,
      report.remark,
      report.source,
      report.problemDescription,
      report.diagnosisRepair,
      report.processAnalysis,
      report.supportNeeded,
      report.impact,
      report.containment,
      report.rootCause,
      report.rootCauseConclusion,
      report.correctiveAction,
      report.preventiveAction,
      report.validation,
      report.approvalSignoff,
      report.imageObjectKey,
      JSON.stringify(report.imageCaptions ?? {})
    ])
  );

const keyIssueInputFromCsv = (record: Record<string, string>): KeyIssueInput => ({
  projectPhaseId: csvField(record, ['phase', 'project_phase', '阶段']) || null,
  moduleId: csvField(record, ['module', 'module_id', '模块']) || null,
  checkItemId: csvField(record, ['check_item', 'check_item_id', '检查项']) || null,
  title: csvField(record, ['title', '标题']),
  description: csvField(record, ['description', '描述']),
  severity: csvField(record, ['severity', '严重度']) || 'medium',
  status: csvField(record, ['status', '状态']) || 'open',
  supplier: csvField(record, ['supplier', '供应商']),
  ownerName: csvField(record, ['owner_name', 'owner', '负责人']),
  confirmer: csvField(record, ['confirmer_name', 'confirmer', '确认人']),
  dueDate: csvField(record, ['due_date', 'dueDate', '截止']),
  countermeasure: csvField(record, ['countermeasure', '对策']),
  currentProgress: csvField(record, ['progress_note', 'current_progress', '进展']),
  remark: csvField(record, ['remark', '备注']),
  problemPhotoBucketName: csvField(record, ['problem_photo_bucket_name', 'bucket']),
  problemPhotoObjectKey: csvField(record, ['problem_photo_object_key', 'key'])
});

const collisionInputFromCsv = (record: Record<string, string>): CollisionReportInput => ({
  projectPhaseId: csvField(record, ['phase', 'project_phase', '阶段']) || null,
  title: csvField(record, ['title', '标题']),
  reportDate: csvField(record, ['report_date', 'reportDate', '日期']),
  status: csvField(record, ['status', '状态']) || 'draft',
  riskLevel: csvField(record, ['risk_level', 'riskLevel', '风险']) || 'medium',
  summary: csvField(record, ['summary', '摘要']),
  owner: csvField(record, ['owner', '负责人']),
  dueDate: csvField(record, ['due_date', 'dueDate', '截止']),
  problemDefinition: csvField(record, ['problem_definition', 'problemDefinition', '问题定义']),
  parts: csvField(record, ['parts', '零件']),
  vehicleModel: csvField(record, ['vehicle_model', 'vehicleModel', '车型']),
  failureFrequency: csvField(record, ['failure_frequency', 'failureFrequency', '故障频次']),
  responsibilityArea: csvField(record, ['responsibility_area', 'responsibilityArea', '责任区域']),
  progress: csvField(record, ['progress', '进展']),
  remark: csvField(record, ['remark', '备注']),
  source: csvField(record, ['source', 'information_source', '信息来源']),
  problemDescription: csvField(record, ['problem_description', 'problemDescription', '问题描述']),
  diagnosisRepair: csvField(record, ['diagnosis_repair', 'diagnosisRepair', '诊断维修']),
  processAnalysis: csvField(record, ['process_analysis', 'processAnalysis', '过程分析']),
  supportNeeded: csvField(record, ['support_needed', 'supportNeeded', '所需支持']),
  impact: csvField(record, ['impact', '影响']),
  containment: csvField(record, ['containment', '遏制']),
  rootCause: csvField(record, ['root_cause', 'rootCause', '原因分析']),
  rootCauseConclusion: csvField(record, ['root_cause_conclusion', 'rootCauseConclusion', '根本原因']),
  correctiveAction: csvField(record, ['corrective_action', 'correctiveAction', '制定措施']),
  preventiveAction: csvField(record, ['preventive_action', 'preventiveAction', '预防措施']),
  validation: csvField(record, ['validation', 'verification', '验证']),
  approvalSignoff: csvField(record, ['approval_signoff', 'approvalSignoff', '签核']),
  imageObjectKey: csvField(record, ['image_object_key', 'imageObjectKey', '现场图片']),
  imageCaptions: asStringRecord(safeJsonParse(csvField(record, ['image_captions', 'imageCaptions', '图片说明'])))
});

const csvPayloadText = (payload: unknown) => {
  if (typeof payload === 'string') return payload;
  const raw = asRecord(payload);
  return firstString(raw, ['csv', 'content', 'data']);
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
        phase_template: input.phaseTemplateId,
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

export async function fetchOwnerCandidates(query = '', limit = 50) {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  params.set('limit', String(limit));
  const search = `?${params.toString()}`;
  try {
    const payload = unwrap(
      await apiRequest<ApiEnvelope<unknown[]> | unknown[]>(`/idaas-candidates/${search}`)
    );
    const record = asRecord(payload);
    const candidates = Array.isArray(payload)
      ? payload
      : asArray(record.candidates ?? record.results ?? record.items);
    return candidates.map(normalizeOwnerCandidate).filter(candidate => candidate.idaasId);
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
  const [
    projects,
    hierarchyPayload,
    dashboardSummary,
    dashboardProjectStats,
    globalPhaseTemplates,
    globalInspectionModules,
    globalChecklistTemplates,
    globalOwnerCandidates
  ] = await Promise.all([
    listProjects(filters),
    fetchHierarchyOptions()
      .catch(error => {
        if (error instanceof ApiError) return EMPTY_HIERARCHY;
        throw error;
      }),
    fetchDashboardSummary(effectiveFilters),
    fetchDashboardProjectStatistics(filters),
    apiRequest<ApiEnvelope<unknown[]> | unknown[]>('/phase-templates/'),
    apiRequest<ApiEnvelope<unknown[]> | unknown[]>('/inspection-modules/'),
    apiRequest<ApiEnvelope<unknown[]> | unknown[]>('/checklist-templates/'),
    fetchOwnerCandidates()
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
      phaseTemplates: unwrap(globalPhaseTemplates).map(normalizePhaseTemplate),
      inspectionModules: unwrap(globalInspectionModules).map(normalizeInspectionModule),
      checklistTemplates: unwrap(globalChecklistTemplates).map(normalizeChecklistTemplate),
      checkItems: [],
      keyIssues: [],
      collisionReports: [],
      reports: [],
      exportTasks: [],
      ownerCandidates: globalOwnerCandidates
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

const serializePhaseTemplateInput = (input: PhaseTemplateInput) => ({
  code: input.code,
  name: input.name,
  version: input.version,
  description: input.description,
  is_active: input.isActive,
  phase_definitions: input.phaseDefinitions === undefined
    ? undefined
    : serializePhaseDefinitions(input.phaseDefinitions),
  metadata: input.metadata
});

const serializeChecklistTemplateInput = (input: ChecklistTemplateInput) => ({
  code: input.code,
  name: input.name,
  module: input.moduleId,
  phase_template: input.phaseTemplateId,
  phase_key: input.phaseKey,
  version: input.version,
  is_active: input.isActive,
  item_templates: input.itemTemplates === undefined
    ? undefined
    : serializeChecklistTemplateItems(input.itemTemplates),
  metadata: input.metadata
});

const serializeInspectionModuleInput = (input: InspectionModuleInput) => {
  const hasOwners = input.owners !== undefined;
  const owners = hasOwners ? serializeCheckItemOwners(input.owners) : undefined;
  const primaryOwner = owners?.[0];
  return {
    code: input.code,
    name: input.name,
    description: input.description,
    sort_order: input.sequence ?? input.sortOrder,
    is_active: input.isActive,
    ...(hasOwners
      ? {
          owner_display_name: primaryOwner?.display_name ?? '',
          owner_name: primaryOwner?.display_name ?? '',
          owner_idaas_id: primaryOwner?.idaas_id ?? '',
          owner_email: primaryOwner?.email ?? ''
        }
      : {}),
    metadata: input.metadata === undefined && !hasOwners
      ? undefined
      : {
          ...(input.metadata ?? {}),
          ...(hasOwners ? { owners } : {})
        }
  };
};

export async function createPhaseTemplate(input: CreatePhaseTemplateInput) {
  return normalizePhaseTemplate(unwrap(
    await apiRequest<ApiEnvelope<unknown> | unknown>('/phase-templates/', {
      method: 'POST',
      body: JSON.stringify(serializePhaseTemplateInput(input))
    })
  ));
}

export async function updatePhaseTemplate(
  templateId: string | number,
  input: UpdatePhaseTemplateInput
) {
  return normalizePhaseTemplate(unwrap(
    await apiRequest<ApiEnvelope<unknown> | unknown>(`/phase-templates/${templateId}/`, {
      method: 'PATCH',
      body: JSON.stringify(serializePhaseTemplateInput(input))
    })
  ));
}

export async function deletePhaseTemplate(templateId: string | number) {
  await apiRequest(`/phase-templates/${templateId}/`, {
    method: 'DELETE'
  });
}

export async function createChecklistTemplate(input: CreateChecklistTemplateInput) {
  return normalizeChecklistTemplate(unwrap(
    await apiRequest<ApiEnvelope<unknown> | unknown>('/checklist-templates/', {
      method: 'POST',
      body: JSON.stringify(serializeChecklistTemplateInput(input))
    })
  ));
}

export async function updateChecklistTemplate(
  templateId: string | number,
  input: UpdateChecklistTemplateInput
) {
  return normalizeChecklistTemplate(unwrap(
    await apiRequest<ApiEnvelope<unknown> | unknown>(`/checklist-templates/${templateId}/`, {
      method: 'PATCH',
      body: JSON.stringify(serializeChecklistTemplateInput(input))
    })
  ));
}

export async function deleteChecklistTemplate(templateId: string | number) {
  await apiRequest(`/checklist-templates/${templateId}/`, {
    method: 'DELETE'
  });
}

export async function createInspectionModule(input: InspectionModuleInput) {
  return normalizeInspectionModule(unwrap(
    await apiRequest<ApiEnvelope<unknown> | unknown>('/inspection-modules/', {
      method: 'POST',
      body: JSON.stringify(serializeInspectionModuleInput(input))
    })
  ));
}

export async function updateInspectionModule(
  moduleId: string | number,
  input: InspectionModuleInput
) {
  return normalizeInspectionModule(unwrap(
    await apiRequest<ApiEnvelope<unknown> | unknown>(`/inspection-modules/${moduleId}/`, {
      method: 'PATCH',
      body: JSON.stringify(serializeInspectionModuleInput(input))
    })
  ));
}

export async function deleteInspectionModule(moduleId: string | number) {
  await apiRequest(`/inspection-modules/${moduleId}/`, {
    method: 'DELETE'
  });
}

export async function updateInspectionModuleOwner(
  moduleId: string | number,
  payload: { owners: CheckItemOwner[]; metadata?: Record<string, unknown> }
) {
  return updateInspectionModule(moduleId, {
    owners: payload.owners,
    metadata: payload.metadata
  });
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
  return fetchObjectAuditLogs('CheckItem', checkItemId);
}

export async function fetchKeyIssueAuditLogs(issueId: string | number) {
  return fetchObjectAuditLogs('KeyIssue', issueId);
}

export async function fetchCollisionReportAuditLogs(reportId: string | number) {
  return fetchObjectAuditLogs('CollisionReport', reportId);
}

export async function fetchProjectAuditLogs(
  projectId: string | number,
  options: { keyword?: string; pageSize?: number } = {}
) {
  const pageSize = Math.min(Math.max(options.pageSize ?? 200, 1), 200);
  const logs: AuditLog[] = [];
  let page = 1;
  for (;;) {
    const query = new URLSearchParams({
      page_size: String(pageSize),
      page: String(page)
    });
    if (options.keyword?.trim()) {
      query.set('q', options.keyword.trim());
    }
    const payload = await apiRequest<ApiEnvelope<unknown[]> | unknown[] | RawRecord>(
      `/projects/${projectId}/audit-logs/?${query.toString()}`
    );
    const raw = asRecord(payload);
    const items = asArray(raw.results ?? unwrap(payload));
    logs.push(...items.map(normalizeAuditLog));
    const total = firstNumber(raw, ['count'], logs.length);
    if (!raw.next || logs.length >= total || page >= 20) {
      break;
    }
    page += 1;
  }
  return logs;
}

async function fetchObjectAuditLogs(objectType: string, objectId: string | number) {
  const query = new URLSearchParams({
    object_type: objectType,
    object_id: String(objectId),
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
  metadata?: Record<string, unknown>;
}) {
  const formData = new FormData();
  formData.append('file', input.file);
  if (input.projectId !== undefined && input.projectId !== null) {
    formData.append('project', String(input.projectId));
  }
  formData.append('object_type', input.objectType);
  formData.append('object_id', String(input.objectId));
  if (input.metadata) {
    formData.append('metadata', JSON.stringify(input.metadata));
  }
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

export async function fetchAttachmentPreview(attachmentId: string | number): Promise<AttachmentPreview> {
  const result = await apiBlobRequest(`/attachments/${attachmentId}/preview/`);
  return {
    blob: result.blob,
    fileName: result.fileName
  };
}

export async function updateAttachmentMetadata(
  attachmentId: string | number,
  metadata: Record<string, unknown>
) {
  return normalizeAttachment(unwrap(
    await apiRequest<ApiEnvelope<unknown> | unknown>(`/attachments/${attachmentId}/metadata/`, {
      method: 'PATCH',
      body: JSON.stringify({ metadata })
    })
  ));
}

export async function deleteAttachment(attachmentId: string | number) {
  await apiRequest<void>(`/attachments/${attachmentId}/`, {
    method: 'DELETE'
  });
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
        owner_name: primaryOwner?.display_name,
        owner_idaas_id: primaryOwner?.idaas_id,
        status: payload.status,
        is_enabled: payload.isActive,
        progress_percent: payload.progressPercent,
        metadata: {
          ...(payload.metadata ?? {}),
          tags: payload.tags,
          planned_start_date: optionalDate(payload.plannedStartDate),
          planned_end_date: optionalDate(payload.plannedEndDate),
          owner_name: primaryOwner?.display_name,
          owner_idaas_id: primaryOwner?.idaas_id
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
        owner_name: primaryOwner?.display_name,
        owner_idaas_id: primaryOwner?.idaas_id,
        status: payload.status ?? 'pending',
        is_enabled: payload.isActive ?? true,
        progress_percent: payload.progressPercent,
        metadata: {
          ...(payload.metadata ?? {}),
          tags: payload.tags,
          planned_start_date: optionalDate(payload.plannedStartDate),
          planned_end_date: optionalDate(payload.plannedEndDate),
          owner_name: primaryOwner?.display_name,
          owner_idaas_id: primaryOwner?.idaas_id
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

export async function createKeyIssue(projectId: string | number, payload: KeyIssueInput) {
  const issue = unwrap(
    await apiRequest<ApiEnvelope<unknown> | unknown>(`/projects/${projectId}/key-issues/`, {
      method: 'POST',
      body: JSON.stringify(serializeKeyIssuePayload(payload))
    })
  );
  return normalizeKeyIssue(issue);
}

export async function updateKeyIssue(issueId: string | number, payload: Partial<KeyIssueInput>) {
  const issue = unwrap(
    await apiRequest<ApiEnvelope<unknown> | unknown>(`/key-issues/${issueId}/`, {
      method: 'PATCH',
      body: JSON.stringify(serializeKeyIssuePayload(payload))
    })
  );
  return normalizeKeyIssue(issue);
}

export async function deleteKeyIssue(issueId: string | number) {
  await apiRequest<ApiEnvelope<unknown> | unknown>(`/key-issues/${issueId}/`, {
    method: 'DELETE'
  });
}

export async function importKeyIssuesCsv(projectId: string | number, file: File): Promise<CsvImportResult<KeyIssue>> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('project', String(projectId));
  try {
    let payload: unknown;
    try {
      payload = unwrap(
        await apiRequest<ApiEnvelope<unknown> | unknown>(`/key-issues/import/?${csvProjectQuery(projectId)}`, {
          method: 'POST',
          body: formData
        })
      );
    } catch (error) {
      if (!isLegacyCsvEndpointFallback(error)) throw error;
      payload = unwrap(
        await apiRequest<ApiEnvelope<unknown> | unknown>(`/projects/${projectId}/key-issues/import/`, {
          method: 'POST',
          body: formData
        })
      );
    }
    const raw = asRecord(payload);
    const items = asArray(raw.items ?? raw.results ?? raw.created ?? raw.updated ?? payload).map(normalizeKeyIssue);
    return {
      created: firstNumber(raw, ['created_count', 'created'], items.length),
      updated: firstNumber(raw, ['updated_count', 'updated']),
      items
    };
  } catch (error) {
    if (!isLegacyCsvEndpointFallback(error)) throw error;
  }

  const items: KeyIssue[] = [];
  let created = 0;
  let updated = 0;
  for (const record of csvRecords(await file.text())) {
    const issueId = csvField(record, ['id']);
    const input = keyIssueInputFromCsv(record);
    if (!input.title.trim()) continue;
    if (issueId) {
      items.push(await updateKeyIssue(issueId, input));
      updated += 1;
    } else {
      items.push(await createKeyIssue(projectId, input));
      created += 1;
    }
  }
  return { created, updated, items };
}

export async function exportKeyIssuesCsv(projectId: string | number) {
  try {
    let payload: unknown;
    try {
      payload = unwrap(
        await apiRequest<ApiEnvelope<unknown> | unknown>(`/key-issues/export/?${csvProjectQuery(projectId)}`, {
          headers: { Accept: 'text/csv, application/json' }
        })
      );
    } catch (error) {
      if (!isLegacyCsvEndpointFallback(error)) throw error;
      payload = unwrap(
        await apiRequest<ApiEnvelope<unknown> | unknown>(`/projects/${projectId}/key-issues/export/`, {
          headers: { Accept: 'text/csv, application/json' }
        })
      );
    }
    const csv = csvPayloadText(payload);
    if (csv) return csv;
  } catch (error) {
    if (!isLegacyCsvEndpointFallback(error)) throw error;
  }
  const issues = unwrap(
    await apiRequest<ApiEnvelope<unknown[]> | unknown[]>(`/projects/${projectId}/key-issues/`)
  ).map(normalizeKeyIssue);
  return keyIssuesToCsv(issues);
}

export async function createCollisionReport(projectId: string | number, payload: CollisionReportInput) {
  const report = unwrap(
    await apiRequest<ApiEnvelope<unknown> | unknown>(`/projects/${projectId}/collision-reports/`, {
      method: 'POST',
      body: JSON.stringify(serializeCollisionReportPayload(payload))
    })
  );
  return normalizeCollisionReport(report);
}

export async function updateCollisionReport(reportId: string | number, payload: Partial<CollisionReportInput>) {
  const report = unwrap(
    await apiRequest<ApiEnvelope<unknown> | unknown>(`/collision-reports/${reportId}/`, {
      method: 'PATCH',
      body: JSON.stringify(serializeCollisionReportPayload(payload))
    })
  );
  return normalizeCollisionReport(report);
}

export async function deleteCollisionReport(reportId: string | number) {
  await apiRequest<ApiEnvelope<unknown> | unknown>(`/collision-reports/${reportId}/`, {
    method: 'DELETE'
  });
}

export async function importCollisionReportsCsv(projectId: string | number, file: File): Promise<CsvImportResult<CollisionReport>> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('project', String(projectId));
  try {
    let payload: unknown;
    try {
      payload = unwrap(
        await apiRequest<ApiEnvelope<unknown> | unknown>(`/collision-reports/import/?${csvProjectQuery(projectId)}`, {
          method: 'POST',
          body: formData
        })
      );
    } catch (error) {
      if (!isLegacyCsvEndpointFallback(error)) throw error;
      payload = unwrap(
        await apiRequest<ApiEnvelope<unknown> | unknown>(`/projects/${projectId}/collision-reports/import/`, {
          method: 'POST',
          body: formData
        })
      );
    }
    const raw = asRecord(payload);
    const items = asArray(raw.items ?? raw.results ?? raw.created ?? raw.updated ?? payload).map(normalizeCollisionReport);
    return {
      created: firstNumber(raw, ['created_count', 'created'], items.length),
      updated: firstNumber(raw, ['updated_count', 'updated']),
      items
    };
  } catch (error) {
    if (!isLegacyCsvEndpointFallback(error)) throw error;
  }

  const items: CollisionReport[] = [];
  let created = 0;
  let updated = 0;
  for (const record of csvRecords(await file.text())) {
    const reportId = csvField(record, ['id']);
    const input = collisionInputFromCsv(record);
    if (!input.title.trim()) continue;
    if (reportId) {
      items.push(await updateCollisionReport(reportId, input));
      updated += 1;
    } else {
      items.push(await createCollisionReport(projectId, input));
      created += 1;
    }
  }
  return { created, updated, items };
}

export async function exportCollisionReportsCsv(projectId: string | number) {
  try {
    let payload: unknown;
    try {
      payload = unwrap(
        await apiRequest<ApiEnvelope<unknown> | unknown>(`/collision-reports/export/?${csvProjectQuery(projectId)}`, {
          headers: { Accept: 'text/csv, application/json' }
        })
      );
    } catch (error) {
      if (!isLegacyCsvEndpointFallback(error)) throw error;
      payload = unwrap(
        await apiRequest<ApiEnvelope<unknown> | unknown>(`/projects/${projectId}/collision-reports/export/`, {
          headers: { Accept: 'text/csv, application/json' }
        })
      );
    }
    const csv = csvPayloadText(payload);
    if (csv) return csv;
  } catch (error) {
    if (!isLegacyCsvEndpointFallback(error)) throw error;
  }
  const reports = unwrap(
    await apiRequest<ApiEnvelope<unknown[]> | unknown[]>(`/projects/${projectId}/collision-reports/`)
  ).map(normalizeCollisionReport);
  return collisionReportsToCsv(reports);
}

export async function exportCollisionReportExcel(reportId: string | number) {
  return apiBlobRequest(`/collision-reports/${reportId}/export-excel/`, {
    headers: {
      Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }
  });
}

export async function downloadCollisionReportTemplateExcel() {
  return apiBlobRequest('/collision-reports/template/', {
    headers: {
      Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }
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
