import type {
  CheckItem,
  CollisionReport,
  ExportTask,
  InspectionModule,
  KeyIssue,
  OwnerCandidate,
  PhaseTemplate,
  Project,
  ProjectPhase,
  ReportDefinition,
  UserProfile
} from '../types';

export const ownerCandidates: OwnerCandidate[] = [
  { idaasId: 'u101', displayName: '张工', email: 'zhang.gong@li.local', department: '制造工程' },
  { idaasId: 'u102', displayName: '李工', email: 'li.gong@li.local', department: '电气自动化' },
  { idaasId: 'u103', displayName: '王工', email: 'wang.gong@li.local', department: '工艺质量' }
];

export const mockProfile: UserProfile = {
  userId: 'mock-admin',
  displayName: 'Mock 模块管理员',
  email: 'mock-admin@li.local',
  role: 'module_admin',
  permissionLabel: '模块管理员',
  canWrite: true,
  adminModules: ['li_bs_auto_status']
};

export const projects: Project[] = [
  {
    id: 'P-1001',
    code: 'BS-AUTO-2026-A',
    name: '焊装一线 Auto Status 改造',
    plant: '常州一区',
    lineName: 'BS1 主线',
    description: '围绕改造线体设备检查、问题闭环和报告导出建立统一项目台账。',
    status: 'active',
    ownerName: '张工',
    plannedStartDate: '2026-05-01',
    plannedEndDate: '2026-07-15',
    actualStartDate: '2026-05-06',
    actualEndDate: null,
    progressPercent: 42,
    updatedAt: '2026-05-12T09:30:00+08:00'
  },
  {
    id: 'P-1002',
    code: 'BS-AUTO-2026-B',
    name: '焊装二线 Auto Status 复制项目',
    plant: '常州一区',
    lineName: 'BS2 改造段',
    description: '复用模板进行二线导入前评审。',
    status: 'planning',
    ownerName: '李工',
    plannedStartDate: '2026-06-01',
    plannedEndDate: '2026-08-10',
    progressPercent: 8,
    updatedAt: '2026-05-10T16:10:00+08:00'
  }
];

export const phaseTemplates: PhaseTemplate[] = [
  { id: 'PT-10', code: 'survey', name: '现场调研', sequence: 10, defaultGoal: '确认设备边界与责任接口', defaultDurationDays: 7, isActive: true },
  { id: 'PT-20', code: 'design-freeze', name: '方案冻结', sequence: 20, defaultGoal: '冻结机械、电气、PLC 改造方案', defaultDurationDays: 10, isActive: true },
  { id: 'PT-30', code: 'pre-commission', name: '预调试', sequence: 30, defaultGoal: '完成离线检查和安全联锁验证', defaultDurationDays: 14, isActive: true },
  { id: 'PT-40', code: 'line-trial', name: '线体试运行', sequence: 40, defaultGoal: '通过节拍、质量和安全验证', defaultDurationDays: 18, isActive: true },
  { id: 'PT-50', code: 'handover', name: '交付归档', sequence: 50, defaultGoal: '关闭遗留问题并归档报告', defaultDurationDays: 8, isActive: true }
];

export const phases: ProjectPhase[] = [
  {
    id: 'PH-10',
    projectId: 'P-1001',
    templateId: 'PT-10',
    code: 'survey',
    name: '现场调研',
    sequence: 10,
    goal: '确认站点设备清单、接口矩阵和改造窗口。',
    plannedStartDate: '2026-05-01',
    plannedEndDate: '2026-05-08',
    actualStartAt: '2026-05-06T09:00:00+08:00',
    actualEndAt: '2026-05-09T17:00:00+08:00',
    status: 'completed',
    progressPercent: 100,
    notes: '现场资产清单已归档。'
  },
  {
    id: 'PH-20',
    projectId: 'P-1001',
    templateId: 'PT-20',
    code: 'design-freeze',
    name: '方案冻结',
    sequence: 20,
    goal: '冻结改造方案、I/O 点表、风险清单和责任分工。',
    plannedStartDate: '2026-05-09',
    plannedEndDate: '2026-05-20',
    actualStartAt: '2026-05-10T10:30:00+08:00',
    status: 'in_progress',
    progressPercent: 64,
    notes: '碰撞评审仍有 2 项待确认。'
  },
  {
    id: 'PH-30',
    projectId: 'P-1001',
    templateId: 'PT-30',
    code: 'pre-commission',
    name: '预调试',
    sequence: 30,
    goal: '完成离线程序、互锁、HMI 和安全回路检查。',
    plannedStartDate: '2026-05-21',
    plannedEndDate: '2026-06-05',
    status: 'not_started',
    progressPercent: 12
  },
  {
    id: 'PH-40',
    projectId: 'P-1001',
    templateId: 'PT-40',
    code: 'line-trial',
    name: '线体试运行',
    sequence: 40,
    goal: '完成节拍验证、故障复盘和交付条件确认。',
    plannedStartDate: '2026-06-06',
    plannedEndDate: '2026-06-28',
    status: 'not_started',
    progressPercent: 0
  }
];

export const inspectionModules: InspectionModule[] = [
  { id: 'M-10', code: 'mechanical', name: '机械', sequence: 10, isActive: true },
  { id: 'M-20', code: 'electrical', name: '电气', sequence: 20, isActive: true },
  { id: 'M-30', code: 'plc', name: 'PLC', sequence: 30, isActive: true },
  { id: 'M-40', code: 'safety', name: '安全', sequence: 40, isActive: true },
  { id: 'M-50', code: 'quality', name: '工艺质量', sequence: 50, isActive: true }
];

export const checklistTemplates = [
  { id: 'CT-10', moduleId: 'M-30', phaseTemplateId: 'PT-20', code: 'PLC-IO', title: 'I/O 点表冻结', defaultOwnerRole: 'PLC 工程师', defaultDurationDays: 3, requiredAttachment: true, severity: 'high' },
  { id: 'CT-20', moduleId: 'M-40', phaseTemplateId: 'PT-30', code: 'SAFE-LOCK', title: '安全互锁验证', defaultOwnerRole: '安全工程师', defaultDurationDays: 4, requiredAttachment: true, severity: 'critical' },
  { id: 'CT-30', moduleId: 'M-10', phaseTemplateId: 'PT-20', code: 'MECH-CLEAR', title: '夹具干涉检查', defaultOwnerRole: '机械工程师', defaultDurationDays: 5, requiredAttachment: true, severity: 'high' }
];

export const checkItems: CheckItem[] = [
  {
    id: 'CI-100',
    projectId: 'P-1001',
    projectPhaseId: 'PH-20',
    moduleId: 'M-30',
    title: 'PLC I/O 点表冻结',
    description: '完成新增设备 I/O 点、备用点和安全信号定义。',
    acceptanceCriteria: 'I/O 点表经 PLC、设备、电气三方签字。',
    ownerName: '李工',
    ownerIdaasId: 'u102',
    plannedStartDate: '2026-05-10',
    plannedEndDate: '2026-05-15',
    actualStartAt: '2026-05-10T11:00:00+08:00',
    status: 'in_progress',
    progressPercent: 70,
    notes: '等待安全信号最终编号。',
    attachments: [
      {
        id: 'A-100',
        fileName: 'IO-list-draft.xlsx',
        objectKey: 'bs-auto-status/P-1001/check-items/CI-100/IO-list-draft.xlsx',
        downloadUrl: '/api/li-bs-auto-status/v1/attachments/A-100/download/',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileSize: 84320,
        uploadedBy: '李工',
        createdAt: '2026-05-11T13:20:00+08:00'
      }
    ]
  },
  {
    id: 'CI-110',
    projectId: 'P-1001',
    projectPhaseId: 'PH-20',
    moduleId: 'M-10',
    title: '夹具与输送线干涉检查',
    acceptanceCriteria: '三维检查无红色碰撞项，黄色风险有临时遏制措施。',
    ownerName: '张工',
    ownerIdaasId: 'u101',
    plannedStartDate: '2026-05-12',
    plannedEndDate: '2026-05-18',
    status: 'blocked',
    blockerReason: '夹具供应商图纸未更新。',
    progressPercent: 45,
    attachments: []
  },
  {
    id: 'CI-120',
    projectId: 'P-1001',
    projectPhaseId: 'PH-30',
    moduleId: 'M-40',
    title: '安全门互锁回路验证',
    acceptanceCriteria: '所有安全门开关触发后线体进入安全状态。',
    ownerName: '王工',
    ownerIdaasId: 'u103',
    plannedStartDate: '2026-05-23',
    plannedEndDate: '2026-05-27',
    status: 'not_started',
    progressPercent: 0,
    attachments: []
  }
];

export const keyIssues: KeyIssue[] = [
  {
    id: 'KI-10',
    projectId: 'P-1001',
    projectPhaseId: 'PH-20',
    checkItemId: 'CI-110',
    title: '夹具图纸版本滞后导致干涉无法关闭',
    description: '供应商仍按旧版机器人轨迹输出图纸，影响方案冻结。',
    severity: 'high',
    status: 'open',
    ownerName: '张工',
    dueDate: '2026-05-16',
    resolution: '',
    attachments: []
  },
  {
    id: 'KI-20',
    projectId: 'P-1001',
    projectPhaseId: 'PH-20',
    title: '安全信号编号待最终确认',
    description: '安全 PLC 输入编号与电气图纸不一致。',
    severity: 'medium',
    status: 'containment',
    ownerName: '王工',
    dueDate: '2026-05-14',
    attachments: []
  }
];

export const collisionReports: CollisionReport[] = [
  {
    id: 'CR-10',
    projectId: 'P-1001',
    projectPhaseId: 'PH-20',
    title: '夹具与机器人轨迹碰撞一页纸',
    status: 'reviewing',
    riskLevel: 'high',
    problemDefinition: '新夹具定位销与 R2 机器人焊钳轨迹在 OP30 发生空间干涉。',
    impact: '若不处理，将阻塞方案冻结，并可能造成线体试运行阶段返工。',
    containment: '临时冻结 OP30 夹具加工，要求供应商按最新轨迹重新输出图纸。',
    rootCause: '供应商使用旧版机器人离线程序，接口文件未纳入版本受控清单。',
    correctiveAction: '由机械和 PLC 共同复核离线程序版本，更新三维模型后重新跑碰撞检查。',
    preventiveAction: '把机器人轨迹文件版本加入阶段冻结检查项，后续模板默认要求附件签核。',
    validation: '重新仿真无红色碰撞项，黄色风险需在试运行前完成现场复测。',
    owner: '张工',
    dueDate: '2026-05-16',
    approvalSignoff: '制造工程负责人待签核，质量与安全已完成意见确认。',
    attachments: [
      {
        id: 'A-200',
        fileName: 'collision-review-one-pager.pdf',
        objectKey: 'bs-auto-status/P-1001/collision/CR-10/collision-review-one-pager.pdf',
        downloadUrl: '/api/li-bs-auto-status/v1/attachments/A-200/download/',
        contentType: 'application/pdf',
        fileSize: 442112,
        uploadedBy: '张工',
        createdAt: '2026-05-12T08:40:00+08:00'
      }
    ],
    updatedAt: '2026-05-12T09:10:00+08:00'
  }
];

export const reports: ReportDefinition[] = [
  { id: 'R-10', name: '项目阶段状态汇总', description: '按阶段输出计划、实际、进度和风险状态。', format: 'xlsx', lastGeneratedAt: '2026-05-11T18:00:00+08:00' },
  { id: 'R-20', name: '检查项明细台账', description: '导出检查项、负责人、附件对象键和关闭证据。', format: 'xlsx', lastGeneratedAt: null },
  { id: 'R-30', name: '碰撞评审一页纸', description: '导出制造工程评审使用的一页纸报告。', format: 'pdf', lastGeneratedAt: '2026-05-12T09:12:00+08:00' }
];

export const exportTasks: ExportTask[] = [
  {
    id: 'E-10',
    projectId: 'P-1001',
    reportName: '项目阶段状态汇总',
    status: 'succeeded',
    requestedBy: 'Mock 模块管理员',
    requestedAt: '2026-05-11T17:50:00+08:00',
    finishedAt: '2026-05-11T17:52:00+08:00',
    downloadUrl: '/api/li-bs-auto-status/v1/exports/E-10/download/'
  },
  {
    id: 'E-20',
    projectId: 'P-1001',
    reportName: '检查项明细台账',
    status: 'running',
    requestedBy: 'Mock 模块管理员',
    requestedAt: '2026-05-12T09:25:00+08:00'
  }
];
