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

export type ProjectStatus = 'planning' | 'active' | 'paused' | 'completed' | 'archived' | string;
export type PhaseStatus = 'not_started' | 'in_progress' | 'blocked' | 'completed' | string;
export type CheckItemStatus = 'not_started' | 'in_progress' | 'blocked' | 'done' | 'waived' | string;
export type Severity = 'critical' | 'high' | 'medium' | 'low' | string;
export type ExportStatus = 'queued' | 'running' | 'succeeded' | 'failed' | string;

export type Attachment = {
  id: string | number;
  fileName: string;
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
  status: ExportStatus;
  requestedBy: string;
  requestedAt: string;
  finishedAt?: string | null;
  downloadUrl?: string | null;
  errorMessage?: string | null;
};

export type WorkspaceData = {
  projects: Project[];
  selectedProject: Project | null;
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
