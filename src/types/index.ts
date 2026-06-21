export type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  results?: T;
  items?: T;
  message?: string;
  request_id?: string;
};

export type UserRole = 'super_admin' | 'module_admin' | 'viewer';

export type UserProfile = {
  userId: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  role: UserRole;
  permissionLabel: string;
  canWrite: boolean;
  adminModules: string[];
};

export type OwnerCandidate = {
  idaasId: string;
  displayName: string;
  email?: string;
  department?: string;
  avatarUrl?: string;
};

export type FactoryOption = {
  id: string | number;
  code: string;
  name: string;
  isActive?: boolean;
};

export type WorkshopOption = {
  id: string | number;
  factoryId: string | number;
  code: string;
  name: string;
  factoryCode?: string;
  factoryName?: string;
  isActive?: boolean;
};

export type ProductionLineOption = {
  id: string | number;
  workshopId: string | number;
  code: string;
  name: string;
  workshopCode?: string;
  workshopName?: string;
  factoryCode?: string;
  factoryName?: string;
  isActive?: boolean;
};

export type HierarchyOptions = {
  factories: FactoryOption[];
  workshops: WorkshopOption[];
  productionLines: ProductionLineOption[];
};

export type ProjectStatus = 'planning' | 'active' | 'paused' | 'completed' | 'archived' | string;
export type PhaseStatus = 'not_started' | 'in_progress' | 'blocked' | 'completed' | string;
export type CheckItemStatus =
  | 'pending'
  | 'not_started'
  | 'in_progress'
  | 'blocked'
  | 'done'
  | 'waived'
  | 'pass'
  | 'fail'
  | 'na'
  | string;
export type Severity = 'critical' | 'high' | 'medium' | 'low' | string;
export type ExportStatus = 'pending' | 'queued' | 'running' | 'succeeded' | 'failed' | string;

export type Attachment = {
  id: string | number;
  fileName: string;
  bucketName?: string;
  objectKey?: string;
  downloadUrl?: string | null;
  previewUrl?: string | null;
  contentType?: string;
  fileSize?: number;
  uploadedBy?: string;
  createdAt?: string;
  canPreview?: boolean;
  canDownload?: boolean;
  isImage?: boolean;
  metadata?: Record<string, unknown>;
};

export type AttachmentPreview = {
  blob: Blob;
  fileName?: string;
};

export type SharedStorageProfile = {
  id?: string | number;
  scope: string;
  displayName?: string;
  isActive?: boolean;
  smbUrl?: string;
  smbHost?: string;
  smbShare?: string;
  smbPath?: string;
  smbDomain?: string;
  smbUsername?: string;
  passwordSet?: boolean;
  objectPrefix?: string;
  envSegment?: string;
  smbTimeout?: number;
  smbChunkKb?: number;
  smbRateLimitMbps?: number;
  smbMaxConcurrency?: number;
  smbMaxSizeMb?: number;
  description?: string;
  effectiveSmbUrl?: string;
  lastValidatedAt?: string | null;
  lastValidationStatus?: string;
  lastValidationMessage?: string;
  updatedAt?: string;
};

export type AuditLog = {
  id: string | number;
  action: string;
  objectType: string;
  objectId: string;
  projectId?: string | number | null;
  projectCode?: string;
  actorIdaasId?: string;
  actorName?: string;
  requestId?: string;
  detail: Record<string, unknown>;
  createdAt: string;
};

export type Project = {
  id: string | number;
  code: string;
  name: string;
  factoryId?: string | number | null;
  factoryCode?: string;
  factoryName?: string;
  workshopId?: string | number | null;
  workshopCode?: string;
  workshopName?: string;
  productionLineId?: string | number | null;
  productionLineCode?: string;
  productionLineName?: string;
  factoryNameSnapshot?: string;
  workshopNameSnapshot?: string;
  lineNameSnapshot?: string;
  plant: string;
  lineName: string;
  description?: string;
  status: ProjectStatus;
  ownerName: string;
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartDate?: string | null;
  actualEndDate?: string | null;
  progressPercent: number;
  metadata?: Record<string, unknown>;
  updatedAt: string;
};

export type PhaseTemplate = {
  id: string | number;
  code: string;
  name: string;
  version?: number;
  description?: string;
  sequence: number;
  defaultGoal?: string;
  defaultDurationDays?: number;
  isActive: boolean;
  phaseDefinitions?: PhaseDefinition[];
  metadata?: Record<string, unknown>;
};

export type PhaseDefinition = {
  key: string;
  name: string;
  description?: string;
  sortOrder?: number;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  durationDays?: number | null;
  metadata?: Record<string, unknown>;
};

export type PhaseTemplateInput = {
  code?: string;
  name?: string;
  version?: number;
  description?: string;
  isActive?: boolean;
  phaseDefinitions?: PhaseDefinition[];
  metadata?: Record<string, unknown>;
};

export type ProjectPhase = {
  id: string | number;
  projectId: string | number;
  templateId?: string | number | null;
  code: string;
  name: string;
  sequence: number;
  goal: string;
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartAt?: string | null;
  actualEndAt?: string | null;
  status: PhaseStatus;
  progressPercent: number;
  isActive?: boolean;
  canDelete?: boolean;
  isDefault?: boolean;
  notes?: string;
  metadata?: Record<string, unknown>;
};

export type InspectionModule = {
  id: string | number;
  code: string;
  name: string;
  description?: string;
  sequence: number;
  isActive: boolean;
  ownerName?: string;
  ownerIdaasId?: string;
  ownerEmail?: string;
  owners?: CheckItemOwner[];
  color?: string;
  milestones?: number[];
  metadata?: Record<string, unknown>;
};

export type InspectionModuleInput = {
  code?: string;
  name?: string;
  description?: string;
  sequence?: number;
  sortOrder?: number;
  isActive?: boolean;
  owners?: CheckItemOwner[];
  metadata?: Record<string, unknown>;
};

export type ChecklistTemplate = {
  id: string | number;
  moduleId: string | number;
  moduleCode?: string;
  moduleName?: string;
  phaseTemplateId: string | number | null;
  phaseTemplateCode?: string;
  phaseKey?: string;
  code: string;
  name?: string;
  title: string;
  version?: number;
  isActive?: boolean;
  defaultOwnerRole?: string;
  defaultDurationDays?: number;
  requiredAttachment?: boolean;
  severity: Severity;
  itemTemplates?: ChecklistTemplateItem[];
  metadata?: Record<string, unknown>;
};

export type ChecklistTemplateInput = {
  code?: string;
  name?: string;
  moduleId?: string | number;
  phaseTemplateId?: string | number | null;
  phaseKey?: string;
  version?: number;
  isActive?: boolean;
  itemTemplates?: ChecklistTemplateItem[];
  metadata?: Record<string, unknown>;
};

export type ChecklistTemplateItem = {
  title: string;
  description?: string;
  sortOrder?: number;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  dueDate?: string | null;
  priority?: string;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
};

export type CheckItemOwner = {
  displayName: string;
  idaasId?: string;
  email?: string;
  department?: string;
  avatarUrl?: string;
  manualName?: string;
  manual_name?: string;
  role?: string;
  sortOrder?: number;
  sort_order?: number;
  isPrimary?: boolean;
  is_primary?: boolean;
  metadata?: Record<string, unknown>;
};

export type CheckItem = {
  id: string | number;
  projectId: string | number;
  projectPhaseId: string | number;
  moduleId: string | number;
  title: string;
  description?: string;
  acceptanceCriteria?: string;
  tags?: string[];
  ownerName: string;
  ownerIdaasId?: string;
  owners: CheckItemOwner[];
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartAt?: string | null;
  actualEndAt?: string | null;
  status: CheckItemStatus;
  isActive?: boolean;
  canDelete?: boolean;
  isDefault?: boolean;
  result?: string;
  blockerReason?: string;
  progressPercent: number;
  notes?: string;
  metadata?: Record<string, unknown>;
  attachments: Attachment[];
};

export type KeyIssue = {
  id: string | number;
  projectId: string | number;
  projectPhaseId?: string | number | null;
  phaseName?: string;
  moduleId?: string | number | null;
  moduleName?: string;
  checkItemId?: string | number | null;
  checkItemTitle?: string;
  title: string;
  description: string;
  severity: Severity;
  status: string;
  ownerName: string;
  ownerIdaasId?: string;
  ownerEmail?: string;
  dueDate: string;
  closedAt?: string | null;
  resolution?: string;
  problemPhoto?: string;
  problemPhotoBucketName?: string;
  problemPhotoObjectKey?: string;
  countermeasure?: string;
  supplier?: string;
  confirmer?: string;
  confirmerIdaasId?: string;
  confirmerEmail?: string;
  currentProgress?: string;
  remark?: string;
  imageCaptions?: Record<string, string>;
  metadata?: Record<string, unknown>;
  attachments: Attachment[];
};

export type CollisionBlockType = 'text' | 'image' | 'file' | string;

export type CollisionReportBlock = {
  id: string | number;
  report?: string | number | null;
  sectionKey: string;
  slotKey: string;
  slotLabel: string;
  blockType: CollisionBlockType;
  text?: string;
  attachment?: string | number | null;
  attachmentDetail?: Attachment | null;
  caption?: string;
  sortOrder: number;
  metadata?: Record<string, unknown>;
};

export type CollisionReport = {
  id: string | number;
  projectId: string | number;
  projectPhaseId?: string | number | null;
  phaseName?: string;
  title: string;
  reportDate: string;
  status: string;
  riskLevel: Severity;
  summary: string;
  content?: Record<string, unknown>;
  problemDefinition: string;
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
  impact: string;
  containment: string;
  rootCause: string;
  rootCauseConclusion?: string;
  correctiveAction: string;
  preventiveAction: string;
  validation: string;
  owner: string;
  dueDate: string;
  approvalSignoff: string;
  imageObjectKey?: string;
  imageCaptions?: Record<string, string>;
  metadata?: Record<string, unknown>;
  attachments: Attachment[];
  blocks: CollisionReportBlock[];
  updatedAt: string;
};

export type ReportDefinition = {
  id: string | number;
  name: string;
  description: string;
  format: 'xlsx' | 'pdf' | 'csv' | string;
  lastGeneratedAt?: string | null;
};

export type ExportTask = {
  id: string | number;
  projectId: string | number;
  reportName: string;
  fileName?: string;
  fileFormat?: string;
  status: ExportStatus;
  requestedBy: string;
  requestedAt: string;
  finishedAt?: string | null;
  resultBucketName?: string;
  resultObjectKey?: string;
  hasResult?: boolean;
  errorMessage?: string | null;
};

export type DashboardProgressRow = {
  key: string;
  name: string;
  checkItemCount: number;
  completedCheckItemCount: number;
  completionRate: number;
};

export type ProjectStatistics = {
  projectId: string | number;
  projectCode: string;
  projectName: string;
  projectStatus: ProjectStatus;
  ownerName: string;
  plannedStartDate: string;
  plannedEndDate: string;
  completionRate: number;
  phaseCount: number;
  checkItemCount: number;
  completedCheckItemCount: number;
  overdueCount: number;
  overduePhaseCount: number;
  overdueCheckItemCount: number;
  blockedCheckItemCount: number;
  keyIssueCount: number;
  openKeyIssueCount: number;
  highOpenKeyIssueCount: number;
  collisionReportCount: number;
  pendingCollisionReportCount: number;
  exportJobCount: number;
  failedExportJobCount: number;
  currentPhaseName?: string;
  phaseProgress?: ProjectPhaseProgress[];
};

export type ProjectPhaseProgress = {
  key: string;
  name: string;
  sequence: number;
  plannedStartDate?: string;
  plannedEndDate?: string;
  status: PhaseStatus;
  progressPercent: number;
  checkItemCount: number;
  completedCheckItemCount: number;
  isOverdue?: boolean;
};

export type ProjectTimeline = {
  projectId?: string | number;
  refreshedAt?: string;
  phases: ProjectPhase[];
  checkItems: CheckItem[];
};

export type DashboardSummary = {
  refreshedAt?: string;
  filters: Record<string, string>;
  projectCount: number;
  activeProjectCount: number;
  archivedProjectCount: number;
  phaseCount: number;
  checkItemCount: number;
  completedCheckItemCount: number;
  openCheckItemCount: number;
  overdueCount: number;
  overduePhaseCount?: number;
  overdueCheckItemCount?: number;
  completionRate: number;
  keyIssueCount: number;
  openKeyIssueCount: number;
  highOpenKeyIssueCount: number;
  collisionReportCount: number;
  pendingCollisionReportCount: number;
  exportJobCount: number;
  failedExportJobCount: number;
  byProjectStatus: Record<string, number>;
  byPhaseStatus: Record<string, number>;
  byCheckItemStatus: Record<string, number>;
  byIssueStatus: Record<string, number>;
  byIssueSeverity: Record<string, number>;
  byCollisionStatus: Record<string, number>;
  byExportStatus: Record<string, number>;
  phaseProgress: DashboardProgressRow[];
  moduleProgress: DashboardProgressRow[];
  projectStats: ProjectStatistics[];
};

export type WorkspaceData = {
  projects: Project[];
  selectedProject: Project | null;
  hierarchy: HierarchyOptions;
  dashboardSummary: DashboardSummary | null;
  projectStats: ProjectStatistics[];
  selectedProjectStats: ProjectStatistics | null;
  timeline: ProjectTimeline | null;
  phases: ProjectPhase[];
  phaseTemplates: PhaseTemplate[];
  inspectionModules: InspectionModule[];
  checklistTemplates: ChecklistTemplate[];
  checkItems: CheckItem[];
  keyIssues: KeyIssue[];
  collisionReports: CollisionReport[];
  reports: ReportDefinition[];
  exportTasks: ExportTask[];
  ownerCandidates: OwnerCandidate[];
};
