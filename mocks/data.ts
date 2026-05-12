import type {
  CheckItem,
  ChecklistTemplate,
  CollisionReport,
  ExportTask,
  FactoryOption,
  ProductionLineOption,
  InspectionModule,
  KeyIssue,
  OwnerCandidate,
  PhaseTemplate,
  Project,
  ProjectPhase,
  ReportDefinition,
  WorkshopOption,
  UserProfile
} from '../types';

type PrototypePhase = {
  id: string;
  name: string;
  goal: string;
};

type PrototypeModule = {
  id: string;
  name: string;
  color: string;
  milestones: number[];
  items: Partial<Record<string, Array<{ text: string; tag: string }>>>;
};

const PROTOTYPE_PHASES: PrototypePhase[] = [
  { id: 'design', name: '设计会签', goal: '完成方案评审与人员入库' },
  { id: 'entry', name: '设备入场', goal: '设备到货验收完成' },
  { id: 'preppv', name: 'Pre-PPV', goal: '满足新车型自动偿车' },
  { id: 'ppv', name: 'PPV', goal: '差速验证通过' },
  { id: 'pp', name: 'PP', goal: '空循环8小时（开动率≥95%）' },
  { id: 'p', name: 'P', goal: '整线交付验收' }
];

const PROTOTYPE_MODULES: PrototypeModule[] = [
  {
    id: 'design_phase',
    name: '设计阶段',
    color: '#3b82f6',
    milestones: [2, 0, 0, 0, 0, 0],
    items: {
      design: [
        { text: 'PLC&机器人人员', tag: '考核入库' },
        { text: '机器人干涉区', tag: '离线检查单' },
        { text: '机器人离线', tag: '仿真验证' },
        { text: '虚拟调试', tag: '工艺变化时必做' }
      ]
    }
  },
  {
    id: 'water_gas',
    name: '水汽管检查',
    color: '#06b6d4',
    milestones: [1, 2, 0, 0, 0, 0],
    items: {
      design: [{ text: '水汽管设计方案', tag: '方案审查' }],
      entry: [{ text: '水汽管检查', tag: '边装边查' }]
    }
  },
  {
    id: 'electrical',
    name: '电气安装检查',
    color: '#8b5cf6',
    milestones: [1, 0, 2, 3, 3, 1],
    items: {
      design: [{ text: '电气方案', tag: '方案审查' }],
      preppv: [
        { text: 'PLC互锁检查', tag: '全量' },
        { text: 'PLC安全', tag: '全量' },
        { text: '机器人DCS', tag: '全量' }
      ],
      ppv: [
        { text: '电气安装全量', tag: '全量' },
        { text: 'PLC差速', tag: '差速验证' },
        { text: '群控通网&数据上传', tag: '全量' },
        { text: 'PLC安全程序冻结', tag: '冻结' },
        { text: '机器人DCS冻结', tag: '冻结' },
        { text: 'PLC-IT相关功能', tag: '验证' }
      ],
      pp: [{ text: 'PLC工艺功能', tag: '全量' }],
      p: [{ text: 'PLC工艺功能', tag: 'P阶段' }]
    }
  },
  {
    id: 'safety',
    name: '安全功能验证',
    color: '#ef4444',
    milestones: [1, 0, 0, 2, 3, 0],
    items: {
      design: [{ text: '安全方案', tag: '方案审查' }],
      ppv: [{ text: '第三方安全验证', tag: '第三方' }],
      pp: [{ text: '第三方安全验证', tag: '第三方' }]
    }
  },
  {
    id: 'mechanical',
    name: '机械安装检查',
    color: '#f59e0b',
    milestones: [0, 0, 2, 3, 0, 0],
    items: {
      preppv: [
        { text: '机器人干涉区', tag: '全查' },
        { text: '连接设备正常开启', tag: '验证' },
        { text: '机械安装检查-边装边查', tag: '边装边查' }
      ],
      ppv: [{ text: '机械安装全量', tag: '全量' }]
    }
  },
  {
    id: 'old_line',
    name: '老线体调试',
    color: '#10b981',
    milestones: [0, 0, 2, 3, 0, 0],
    items: {
      preppv: [
        { text: '老线体空循环', tag: '2小时' },
        { text: '机器人服务功能', tag: '验证' }
      ],
      ppv: [
        { text: '机器人服务功能', tag: '验证' },
        { text: '混线空循环调试', tag: '测试' }
      ]
    }
  },
  {
    id: 'idle_cycle',
    name: '空循环验证',
    color: '#f97316',
    milestones: [0, 0, 2, 0, 3, 1],
    items: {
      preppv: [{ text: '新线体空循环-供应商', tag: 'Pre-PPV前' }],
      pp: [
        { text: '单车型空循环8小时', tag: 'PP前' },
        { text: '混线空循环8小时', tag: 'PP前' },
        { text: '机器人服务功能', tag: '验证' },
        { text: '设备培训', tag: '培训' }
      ],
      p: [
        { text: '单车型空循环8小时', tag: 'P阶段' },
        { text: '开动率95%', tag: 'P阶段' },
        { text: '混线空循环8小时', tag: 'P阶段' }
      ]
    }
  }
];

const PROJECT_ID = 'P-PROTO';
const phaseIdByCode = Object.fromEntries(PROTOTYPE_PHASES.map((phase, index) => [phase.id, `PH-${(index + 1) * 10}`]));
const moduleIdByCode = Object.fromEntries(PROTOTYPE_MODULES.map((module, index) => [module.id, `M-${(index + 1) * 10}`]));
const phaseDates = [
  ['2026-05-13', '2026-05-19'],
  ['2026-05-20', '2026-05-26'],
  ['2026-05-27', '2026-06-02'],
  ['2026-06-03', '2026-06-09'],
  ['2026-06-10', '2026-06-16'],
  ['2026-06-17', '2026-06-23']
] as const;
const milestoneStatus = (value: number): CheckItem['status'] =>
  value === 1 ? 'done' : value === 2 ? 'in_progress' : 'pending';
const phaseName = (code: string) => PROTOTYPE_PHASES.find(phase => phase.id === code)?.name ?? code;

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

export const factories: FactoryOption[] = [
  { id: 'F-CZ', code: 'CZ', name: '常州一区', isActive: true },
  { id: 'F-BJ', code: 'BJ', name: '北京工厂', isActive: true }
];

export const workshops: WorkshopOption[] = [
  { id: 'W-BS', factoryId: 'F-CZ', code: 'BS', name: '焊装车间', factoryCode: 'CZ', factoryName: '常州一区', isActive: true },
  { id: 'W-GA', factoryId: 'F-CZ', code: 'GA', name: '总装车间', factoryCode: 'CZ', factoryName: '常州一区', isActive: true },
  { id: 'W-BJ-BS', factoryId: 'F-BJ', code: 'BJBS', name: '北京焊装车间', factoryCode: 'BJ', factoryName: '北京工厂', isActive: true }
];

export const productionLines: ProductionLineOption[] = [
  { id: 'L-BS-AUTO', workshopId: 'W-BS', code: 'BS-AUTO', name: '焊装改造线体', workshopCode: 'BS', workshopName: '焊装车间', factoryCode: 'CZ', factoryName: '常州一区', isActive: true },
  { id: 'L-BS-A', workshopId: 'W-BS', code: 'A', name: 'A线', workshopCode: 'BS', workshopName: '焊装车间', factoryCode: 'CZ', factoryName: '常州一区', isActive: true },
  { id: 'L-BS-B', workshopId: 'W-BS', code: 'B', name: 'B线', workshopCode: 'BS', workshopName: '焊装车间', factoryCode: 'CZ', factoryName: '常州一区', isActive: true },
  { id: 'L-GA-A', workshopId: 'W-GA', code: 'GA-A', name: '总装 A线', workshopCode: 'GA', workshopName: '总装车间', factoryCode: 'CZ', factoryName: '常州一区', isActive: true }
];

export const projects: Project[] = [
  {
    id: PROJECT_ID,
    code: 'BS-AUTO-PROTOTYPE',
    name: '焊装自动化项目状态原型样例',
    factoryId: 'F-CZ',
    factoryCode: 'CZ',
    factoryName: '常州一区',
    workshopId: 'W-BS',
    workshopCode: 'BS',
    workshopName: '焊装车间',
    productionLineId: 'L-BS-AUTO',
    productionLineCode: 'BS-AUTO',
    productionLineName: '焊装改造线体',
    factoryNameSnapshot: '常州一区',
    workshopNameSnapshot: '焊装车间',
    lineNameSnapshot: '焊装改造线体',
    plant: '常州一区',
    lineName: '焊装改造线体',
    description: '从原型 PHASES/MODULES 派生的开发样例，覆盖阶段、模块、检查项、重点问题与碰撞一页纸。',
    status: 'active',
    ownerName: '张工',
    plannedStartDate: '2026-05-13',
    plannedEndDate: '2026-06-23',
    actualStartDate: '2026-05-13',
    actualEndDate: null,
    progressPercent: 28,
    updatedAt: '2026-05-13T09:30:00+08:00'
  },
  {
    id: 'P-WORKSHOP',
    code: 'BS-AUTO-WORKSHOP',
    name: '焊装车间级检查项目',
    factoryId: 'F-CZ',
    factoryCode: 'CZ',
    factoryName: '常州一区',
    workshopId: 'W-BS',
    workshopCode: 'BS',
    workshopName: '焊装车间',
    productionLineId: null,
    productionLineCode: '',
    productionLineName: '',
    factoryNameSnapshot: '常州一区',
    workshopNameSnapshot: '焊装车间',
    lineNameSnapshot: '车间级项目',
    plant: '常州一区',
    lineName: '车间级项目',
    description: '用于验证项目可挂到车间且产线可选为空。',
    status: 'planning',
    ownerName: '王工',
    plannedStartDate: '2026-05-20',
    plannedEndDate: '2026-06-30',
    actualStartDate: null,
    actualEndDate: null,
    progressPercent: 8,
    updatedAt: '2026-05-13T10:20:00+08:00'
  }
];

export const phaseTemplates: PhaseTemplate[] = PROTOTYPE_PHASES.map((phase, index) => ({
  id: `PT-${(index + 1) * 10}`,
  code: phase.id,
  name: phase.name,
  sequence: (index + 1) * 10,
  defaultGoal: phase.goal,
  defaultDurationDays: 7,
  isActive: true
}));

export const phases: ProjectPhase[] = PROTOTYPE_PHASES.map((phase, index) => ({
  id: phaseIdByCode[phase.id],
  projectId: PROJECT_ID,
  templateId: `PT-${(index + 1) * 10}`,
  code: phase.id,
  name: phase.name,
  sequence: (index + 1) * 10,
  goal: phase.goal,
  plannedStartDate: phaseDates[index][0],
  plannedEndDate: phaseDates[index][1],
  actualStartAt: index === 0 ? '2026-05-13T09:00:00+08:00' : null,
  actualEndAt: index === 0 ? '2026-05-19T17:00:00+08:00' : null,
  status: index === 0 ? 'completed' : index === 1 ? 'in_progress' : 'not_started',
  progressPercent: index === 0 ? 100 : index === 1 ? 35 : 0,
  notes: phase.goal
}));

export const inspectionModules: InspectionModule[] = PROTOTYPE_MODULES.map((module, index) => ({
  id: moduleIdByCode[module.id],
  code: module.id,
  name: module.name,
  sequence: (index + 1) * 10,
  isActive: true,
  color: module.color,
  milestones: module.milestones
}));

export const checklistTemplates: ChecklistTemplate[] = PROTOTYPE_MODULES.flatMap(module =>
  Object.entries(module.items).map(([phaseCode, phaseItems = []]) => ({
    id: `CT-${module.id}-${phaseCode}`,
    moduleId: moduleIdByCode[module.id],
    phaseTemplateId: phaseTemplates.find(template => template.code === phaseCode)?.id ?? phaseCode,
    code: `prototype-${module.id}-${phaseCode}`,
    title: `${module.name} - ${phaseName(phaseCode)}`,
    defaultOwnerRole: 'prototype-seed',
    defaultDurationDays: 7,
    requiredAttachment: phaseItems.some(item => ['全量', '冻结', '第三方'].includes(item.tag)),
    severity: phaseItems.some(item => ['冻结', '第三方'].includes(item.tag)) ? 'high' : 'medium'
  }))
);

export const checkItems: CheckItem[] = PROTOTYPE_MODULES.flatMap(module =>
  PROTOTYPE_PHASES.flatMap((phase, phaseIndex) => {
    const items = module.items[phase.id] ?? [];
    return items.map((item, itemIndex) => ({
      id: `CI-${module.id}-${phase.id}-${itemIndex + 1}`,
      projectId: PROJECT_ID,
      projectPhaseId: phaseIdByCode[phase.id],
      moduleId: moduleIdByCode[module.id],
      title: item.text,
      description: `${module.name} / ${phase.name} / ${item.tag}`,
      acceptanceCriteria: item.tag,
      ownerName: module.id === 'electrical' ? '李工' : module.id === 'safety' ? '王工' : '张工',
      ownerIdaasId: module.id === 'electrical' ? 'u102' : module.id === 'safety' ? 'u103' : 'u101',
      plannedStartDate: phases[phaseIndex]?.plannedStartDate ?? '2026-05-13',
      plannedEndDate: phases[phaseIndex]?.plannedEndDate ?? '2026-05-19',
      actualStartAt: module.milestones[phaseIndex] > 0 ? `${phases[phaseIndex]?.plannedStartDate}T09:00:00+08:00` : null,
      actualEndAt: module.milestones[phaseIndex] === 1 ? `${phases[phaseIndex]?.plannedEndDate}T17:00:00+08:00` : null,
      status: milestoneStatus(module.milestones[phaseIndex]),
      progressPercent: module.milestones[phaseIndex] === 1 ? 100 : module.milestones[phaseIndex] === 2 ? 45 : 0,
      notes: `原型标签：${item.tag}`,
      attachments: []
    }));
  })
).map(item => {
  if (item.id === 'CI-design_phase-design-2') {
    return {
      ...item,
      attachments: [
        {
          id: 'A-100',
          fileName: '机器人干涉区离线检查单.xlsx',
          bucketName: 'company-bucket',
          objectKey: 'bs-auto-status/prototype/design/robot-interference-checklist.xlsx',
          downloadUrl: '/api/li-bs-auto-status/v1/attachments/A-100/download/',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          fileSize: 188416,
          uploadedBy: '张工',
          createdAt: '2026-05-13T08:20:00+08:00'
        }
      ]
    };
  }
  if (item.id === 'CI-electrical-preppv-2') {
    return {
      ...item,
      attachments: [
        {
          id: 'A-110',
          fileName: 'PLC安全点位差异清单.pdf',
          bucketName: 'company-bucket',
          objectKey: 'bs-auto-status/prototype/preppv/plc-safety-diff.pdf',
          downloadUrl: '/api/li-bs-auto-status/v1/attachments/A-110/download/',
          contentType: 'application/pdf',
          fileSize: 94032,
          uploadedBy: '李工',
          createdAt: '2026-05-13T08:32:00+08:00'
        }
      ]
    };
  }
  return item;
});

export const keyIssues: KeyIssue[] = [
  {
    id: 'KI-10',
    projectId: PROJECT_ID,
    projectPhaseId: phaseIdByCode.design,
    checkItemId: 'CI-design_phase-design-2',
    title: '机器人干涉区离线检查未关闭',
    description: 'OP30 机器人焊钳轨迹与新夹具定位销存在干涉风险。',
    severity: 'high',
    status: 'in_progress',
    ownerName: '张工',
    dueDate: '2026-05-20',
    resolution: '供应商更新离线模型后重新输出仿真报告。',
    problemPhoto: 'robot-interference.jpg',
    problemPhotoBucketName: 'company-bucket',
    problemPhotoObjectKey: 'li-bs-auto-status/issues/robot-interference.jpg',
    countermeasure: '冻结 OP30 夹具加工，重新跑碰撞检查。',
    supplier: '夹具供应商A',
    confirmer: '王工',
    currentProgress: '进行中',
    remark: '对应原型重点问题表字段。',
    attachments: []
  },
  {
    id: 'KI-20',
    projectId: PROJECT_ID,
    projectPhaseId: phaseIdByCode.preppv,
    checkItemId: 'CI-electrical-preppv-2',
    title: 'PLC安全程序冻结版本待确认',
    description: '安全 PLC 输入编号与电气图纸版本不一致。',
    severity: 'medium',
    status: 'waiting_confirm',
    ownerName: '李工',
    dueDate: '2026-05-27',
    resolution: '电气与 PLC 双方完成点位复核后签字。',
    problemPhoto: 'plc-safety-version.png',
    problemPhotoBucketName: 'company-bucket',
    problemPhotoObjectKey: 'li-bs-auto-status/issues/plc-safety-version.png',
    countermeasure: '补齐安全点位差异清单并更新冻结包。',
    supplier: '电气集成商B',
    confirmer: '赵工',
    currentProgress: '待确认',
    remark: '需在 PPV 前关闭。',
    attachments: []
  }
];

export const collisionReports: CollisionReport[] = [
  {
    id: 'CR-10',
    projectId: PROJECT_ID,
    projectPhaseId: phaseIdByCode.design,
    title: 'MB2-100 R6铆接报错碰撞一页纸',
    status: 'in_progress',
    riskLevel: 'high',
    problemDefinition: 'MB2-100 R6 铆接报错影响自动偿车稳定性。',
    parts: 'R6 铆接枪、定位销、夹具支撑块',
    vehicleModel: 'MB2',
    failureFrequency: '3 次/班',
    responsibilityArea: 'BS1 OP30',
    owner: '张工',
    progress: '进行中',
    remark: '原型状态选项：进行中、已关闭、待确认、搁置。',
    problemDescription: '1. 问题描述：R6 铆接动作进入后偶发报警，现场需人工复位。',
    diagnosisRepair: '2. 诊断维修：检查气压、DCS 区域与铆接枪到位信号，暂未发现硬件损坏。',
    impact: '若不处理，将影响 Pre-PPV 新车型自动偿车节拍。',
    containment: '临时冻结 OP30 夹具加工，安排人工确认铆接枪位置。',
    rootCause: '3. 原因分析：离线轨迹与现场夹具版本不一致，导致接近区域余量不足。',
    correctiveAction: '4. 制定措施：更新机器人离线程序并复核夹具模型，完成后重新跑碰撞检查。',
    preventiveAction: '将机器人轨迹文件版本加入设计会签检查项，后续变更必须签核。',
    validation: 'PPV 前完成现场复测，确认无红色碰撞项。',
    supportNeeded: '5. 所需支持：供应商提供最新夹具三维模型，生产安排 2 小时验证窗口。',
    dueDate: '2026-05-20',
    approvalSignoff: '制造工程负责人: waiting_confirm / 质量确认: pending / 安全确认: pending',
    attachments: [
      {
        id: 'A-200',
        fileName: 'collision-one-pager-prototype.xlsx',
        bucketName: 'company-bucket',
        objectKey: 'bs-auto-status/prototype/CR-10/collision-one-pager-prototype.xlsx',
        downloadUrl: '/api/li-bs-auto-status/v1/attachments/A-200/download/',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileSize: 442112,
        uploadedBy: '张工',
        createdAt: '2026-05-13T08:40:00+08:00'
      }
    ],
    updatedAt: '2026-05-13T09:10:00+08:00'
  }
];

export const reports: ReportDefinition[] = [
  { id: 'R-10', name: '阶段模块检查矩阵', description: '按原型 PHASES/MODULES 输出阶段、模块、检查项和标签。', format: 'xlsx', lastGeneratedAt: '2026-05-13T09:00:00+08:00' },
  { id: 'R-20', name: '重点问题表', description: '导出问题描述、问题照片、对策、供应商、责任人、确认人、目前进度与备注。', format: 'xlsx', lastGeneratedAt: null },
  { id: 'R-30', name: '碰撞一页纸', description: '导出制造工程重点问题一页纸报告。', format: 'xlsx', lastGeneratedAt: '2026-05-13T09:12:00+08:00' }
];

export const exportTasks: ExportTask[] = [
  {
    id: 'E-10',
    projectId: PROJECT_ID,
    reportName: '阶段模块检查矩阵',
    fileName: 'stage-module-matrix.xlsx',
    fileFormat: 'xlsx',
    status: 'succeeded',
    requestedBy: 'Mock 模块管理员',
    requestedAt: '2026-05-13T09:00:00+08:00',
    finishedAt: '2026-05-13T09:02:00+08:00',
    resultBucketName: 'company-bucket',
    resultObjectKey: 'bs-auto-status/exports/E-10/stage-module-matrix.xlsx'
  },
  {
    id: 'E-20',
    projectId: PROJECT_ID,
    reportName: '碰撞一页纸',
    fileName: 'collision-one-pager.xlsx',
    fileFormat: 'xlsx',
    status: 'running',
    requestedBy: 'Mock 模块管理员',
    requestedAt: '2026-05-13T09:25:00+08:00'
  }
];
