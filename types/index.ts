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
  objectKey: string;
  downloadUrl?: string | null;
  contentType?: string;
  fileSize?: number;
  uploadedBy?: string;
  createdAt?: string;
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
  updatedAt: string;
};

export type PhaseTemplate = {
  id: string | number;
  code: string;
  name: string;
  sequence: number;
  defaultGoal?: string;
  defaultDurationDays?: number;
  isActive: boolean;
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
  notes?: string;
};

export type InspectionModule = {
  id: string | number;
  code: string;
  name: string;
  sequence: number;
  isActive: boolean;
  color?: string;
  milestones?: number[];
};

export type ChecklistTemplate = {
  id: string | number;
  moduleId: string | number;
  phaseTemplateId: string | number;
  code: string;
  title: string;
  defaultOwnerRole?: string;
  defaultDurationDays?: number;
  requiredAttachment?: boolean;
  severity: Severity;
};

export type CheckItem = {
  id: string | number;
  projectId: string | number;
  projectPhaseId: string | number;
  moduleId: string | number;
  title: string;
  description?: string;
  acceptanceCriteria?: string;
  ownerName: string;
  ownerIdaasId?: string;
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartAt?: string | null;
  actualEndAt?: string | null;
  status: CheckItemStatus;
  result?: string;
  blockerReason?: string;
  progressPercent: number;
  notes?: string;
  attachments: Attachment[];
};

export type KeyIssue = {
  id: string | number;
  projectId: string | number;
  projectPhaseId?: string | number | null;
  checkItemId?: string | number | null;
  title: string;
  description: string;
  severity: Severity;
  status: string;
  ownerName: string;
  dueDate: string;
  closedAt?: string | null;
  resolution?: string;
  problemPhoto?: string;
  problemPhotoBucketName?: string;
  problemPhotoObjectKey?: string;
  countermeasure?: string;
  supplier?: string;
  confirmer?: string;
  currentProgress?: string;
  remark?: string;
  attachments: Attachment[];
};

export type CollisionReport = {
  id: string | number;
  projectId: string | number;
  projectPhaseId?: string | number | null;
  title: string;
  status: string;
  riskLevel: Severity;
  problemDefinition: string;
  parts?: string;
  vehicleModel?: string;
  failureFrequency?: string;
  responsibilityArea?: string;
  progress?: string;
  remark?: string;
  problemDescription?: string;
  diagnosisRepair?: string;
  supportNeeded?: string;
  impact: string;
  containment: string;
  rootCause: string;
  correctiveAction: string;
  preventiveAction: string;
  validation: string;
  owner: string;
  dueDate: string;
  approvalSignoff: string;
  attachments: Attachment[];
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
  errorMessage?: string | null;
};

export type DashboardProgressRow = {
  key: string;
  name: string;
  checkItemCount: number;
  completedCheckItemCount: number;
  completionRate: number;
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
};

export type WorkspaceData = {
  projects: Project[];
  selectedProject: Project | null;
  hierarchy: HierarchyOptions;
  dashboardSummary: DashboardSummary | null;
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
