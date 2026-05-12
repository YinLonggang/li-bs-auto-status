import { http, HttpResponse } from 'msw';
import { API_PREFIX, AUTH_PREFIX, BASE_CONFIG_PREFIX } from '../config';
import {
  checkItems,
  checklistTemplates,
  collisionReports,
  exportTasks,
  factories,
  inspectionModules,
  keyIssues,
  mockProfile,
  ownerCandidates,
  phases,
  phaseTemplates,
  productionLines,
  projects,
  reports,
  workshops
} from './data';
import type { ExportTask, Project } from '../types';

const requestId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `req_${Date.now()}`;

const ok = <T,>(data: T, message = 'ok') =>
  HttpResponse.json({ success: true, data, message, request_id: requestId() });

const fail = (message: string, status = 400) =>
  HttpResponse.json({ success: false, data: null, message, request_id: requestId() }, { status });

const canWrite = () => mockProfile.canWrite;

const projectMatchesRequest = (project: Project, request: Request) => {
  const params = new URL(request.url).searchParams;
  const projectId = params.get('project') || params.get('project_id');
  const factoryId = params.get('factory') || params.get('factory_id');
  const workshopId = params.get('workshop') || params.get('workshop_id');
  const productionLineId = params.get('production_line') || params.get('production_line_id') || params.get('line');
  const status = params.get('status') || params.get('project_status');
  if (projectId && `${project.id}` !== projectId) return false;
  if (factoryId && `${project.factoryId}` !== factoryId) return false;
  if (workshopId && `${project.workshopId}` !== workshopId) return false;
  if (productionLineId) {
    if (['none', 'null', 'workshop'].includes(productionLineId.toLowerCase())) {
      if (project.productionLineId) return false;
    } else if (`${project.productionLineId}` !== productionLineId) {
      return false;
    }
  }
  if (status && project.status !== status) return false;
  return true;
};

const countBy = (values: string[], known: string[] = []) => {
  const counts = Object.fromEntries(known.map(key => [key, 0]));
  values.forEach(value => {
    counts[value] = (counts[value] ?? 0) + 1;
  });
  return counts;
};

const completionRate = (total: number, completed: number) => (total ? Math.round((completed * 1000) / total) / 10 : 0);

const buildDashboardSummary = (request: Request) => {
  const scopedProjects = projects.filter(project => projectMatchesRequest(project, request));
  const projectIds = new Set(scopedProjects.map(project => `${project.id}`));
  const scopedPhases = phases.filter(item => projectIds.has(`${item.projectId}`));
  const scopedItems = checkItems.filter(item => projectIds.has(`${item.projectId}`));
  const scopedIssues = keyIssues.filter(item => projectIds.has(`${item.projectId}`));
  const scopedReports = collisionReports.filter(item => projectIds.has(`${item.projectId}`));
  const scopedExports = exportTasks.filter(item => projectIds.has(`${item.projectId}`));
  const completedItems = scopedItems.filter(item => ['done', 'completed', 'pass', 'na', 'waived'].includes(item.status));
  const openIssues = scopedIssues.filter(issue => !issue.closedAt && !['resolved', 'closed'].includes(issue.status));

  return {
    refreshed_at: new Date().toISOString(),
    filters: Object.fromEntries(new URL(request.url).searchParams.entries()),
    project_count: scopedProjects.length,
    active_project_count: scopedProjects.filter(project => project.status === 'active').length,
    archived_project_count: scopedProjects.filter(project => project.status === 'archived').length,
    phase_count: scopedPhases.length,
    check_item_count: scopedItems.length,
    completed_check_item_count: completedItems.length,
    open_check_item_count: scopedItems.length - completedItems.length,
    completion_rate: completionRate(scopedItems.length, completedItems.length),
    key_issue_count: scopedIssues.length,
    open_key_issue_count: openIssues.length,
    high_open_key_issue_count: openIssues.filter(issue => ['high', 'critical'].includes(issue.severity)).length,
    collision_report_count: scopedReports.length,
    pending_collision_report_count: scopedReports.filter(report => !['approved', 'signed', 'closed'].includes(report.status)).length,
    export_job_count: scopedExports.length,
    failed_export_job_count: scopedExports.filter(task => task.status === 'failed').length,
    by_project_status: countBy(scopedProjects.map(project => project.status), ['active', 'planning', 'archived']),
    by_phase_status: countBy(scopedPhases.map(phase => phase.status), ['not_started', 'in_progress', 'completed', 'blocked']),
    by_check_item_status: countBy(scopedItems.map(item => item.status), ['pending', 'in_progress', 'done', 'blocked']),
    by_issue_status: countBy(scopedIssues.map(issue => issue.status), ['open', 'in_progress', 'waiting_confirm', 'closed']),
    by_issue_severity: countBy(scopedIssues.map(issue => issue.severity), ['low', 'medium', 'high', 'critical']),
    by_collision_status: countBy(scopedReports.map(report => report.status), ['draft', 'pending', 'in_progress', 'approved', 'signed']),
    by_export_status: countBy(scopedExports.map(task => task.status), ['pending', 'queued', 'running', 'succeeded', 'failed']),
    phase_progress: phases.map(phase => {
      const items = scopedItems.filter(item => `${item.projectPhaseId}` === `${phase.id}`);
      const done = items.filter(item => ['done', 'completed', 'pass', 'na', 'waived'].includes(item.status)).length;
      return {
        phase_key: phase.code,
        phase_name: phase.name,
        check_item_count: items.length,
        completed_check_item_count: done,
        completion_rate: completionRate(items.length, done)
      };
    }),
    module_progress: inspectionModules.map(module => {
      const items = scopedItems.filter(item => `${item.moduleId}` === `${module.id}`);
      const done = items.filter(item => ['done', 'completed', 'pass', 'na', 'waived'].includes(item.status)).length;
      return {
        module_code: module.code,
        module_name: module.name,
        check_item_count: items.length,
        completed_check_item_count: done,
        completion_rate: completionRate(items.length, done)
      };
    })
  };
};

export const handlers = [
  http.get(`${AUTH_PREFIX}/user-profile/`, () => ok(mockProfile)),
  http.get(`${BASE_CONFIG_PREFIX}/factories/`, () => ok(factories)),
  http.get(`${BASE_CONFIG_PREFIX}/workshops/`, ({ request }) => {
    const params = new URL(request.url).searchParams;
    const factory = params.get('factory');
    const filtered = factory ? workshops.filter(item => `${item.factoryId}` === factory) : workshops;
    return ok(filtered);
  }),
  http.get(`${BASE_CONFIG_PREFIX}/lines/`, ({ request }) => {
    const params = new URL(request.url).searchParams;
    const workshop = params.get('workshop');
    const factory = params.get('workshop__factory');
    const filtered = productionLines.filter(item => {
      if (workshop && `${item.workshopId}` !== workshop) return false;
      if (factory && !workshops.some(candidate => `${candidate.id}` === `${item.workshopId}` && `${candidate.factoryId}` === factory)) {
        return false;
      }
      return true;
    });
    return ok(filtered);
  }),
  http.get(`${API_PREFIX}/dashboard/`, ({ request }) => ok(buildDashboardSummary(request))),
  http.get(`${API_PREFIX}/projects/`, ({ request }) => ok(projects.filter(project => projectMatchesRequest(project, request)))),
  http.post(`${API_PREFIX}/projects/`, async ({ request }) => {
    if (!canWrite()) return fail('forbidden', 403);
    const body = (await request.json()) as Record<string, unknown>;
    const metadata = (body.metadata ?? {}) as Record<string, unknown>;
    const text = (value: unknown, fallback = '') => (typeof value === 'string' && value.trim() ? value : fallback);
    const factoryId = text(body.factory);
    const workshopId = text(body.workshop);
    const productionLineId = text(body.production_line);
    const factory = factories.find(item => `${item.id}` === factoryId);
    const workshop = workshops.find(item => `${item.id}` === workshopId);
    const line = productionLines.find(item => `${item.id}` === productionLineId);
    const project: Project = {
      id: `P-${Date.now()}`,
      code: text(body.code, `BS-AUTO-${projects.length + 1}`),
      name: text(body.name, '新建 Auto Status 项目'),
      factoryId: factoryId || null,
      factoryCode: factory?.code,
      factoryName: factory?.name,
      workshopId: workshopId || null,
      workshopCode: workshop?.code,
      workshopName: workshop?.name,
      productionLineId: productionLineId || null,
      productionLineCode: line?.code,
      productionLineName: line?.name,
      plant: text(body.factory_name_snapshot, factory?.name || text(body.plant, '未设置')),
      lineName: text(body.line_name_snapshot, line?.name || workshop?.name || text(body.line_name, '未设置')),
      status: 'planning',
      ownerName: text(metadata.owner_name, text(body.owner_name, '未设置')),
      plannedStartDate: text(metadata.planned_start_date, text(body.planned_start_date, new Date().toISOString().slice(0, 10))),
      plannedEndDate: text(metadata.planned_end_date, text(body.planned_end_date, new Date().toISOString().slice(0, 10))),
      progressPercent: 0,
      updatedAt: new Date().toISOString()
    };
    projects.unshift(project);
    return ok(project, 'created');
  }),
  http.get(`${API_PREFIX}/phase-templates/`, () => ok(phaseTemplates)),
  http.get(`${API_PREFIX}/inspection-modules/`, () => ok(inspectionModules)),
  http.get(`${API_PREFIX}/checklist-templates/`, () => ok(checklistTemplates)),
  http.get(`${API_PREFIX}/idaas-candidates/`, ({ request }) => {
    const q = new URL(request.url).searchParams.get('q')?.toLowerCase() ?? '';
    const data = q
      ? ownerCandidates.filter(
          item =>
            item.displayName.toLowerCase().includes(q) ||
            item.idaasId.toLowerCase().includes(q) ||
            (item.email ?? '').toLowerCase().includes(q)
        )
      : ownerCandidates;
    return ok(
      data.map(candidate => ({
        idaas_id: candidate.idaasId,
        display_name: candidate.displayName,
        email: candidate.email,
        department: candidate.department
      }))
    );
  }),
  http.get(`${API_PREFIX}/projects/:projectId/phases/`, ({ params }) =>
    ok(phases.filter(item => `${item.projectId}` === `${params.projectId}`))
  ),
  http.get(`${API_PREFIX}/projects/:projectId/check-items/`, ({ params }) =>
    ok(checkItems.filter(item => `${item.projectId}` === `${params.projectId}`))
  ),
  http.get(`${API_PREFIX}/projects/:projectId/key-issues/`, ({ params }) =>
    ok(keyIssues.filter(item => `${item.projectId}` === `${params.projectId}`))
  ),
  http.get(`${API_PREFIX}/projects/:projectId/collision-reports/`, ({ params }) =>
    ok(collisionReports.filter(item => `${item.projectId}` === `${params.projectId}`))
  ),
  http.get(`${API_PREFIX}/projects/:projectId/reports/`, () => ok(reports)),
  http.get(`${API_PREFIX}/projects/:projectId/exports/`, ({ params }) =>
    ok(exportTasks.filter(item => `${item.projectId}` === `${params.projectId}`))
  ),
  http.post(`${API_PREFIX}/projects/:projectId/exports/`, async ({ params, request }) => {
    if (!canWrite()) return fail('forbidden', 403);
    const body = (await request.json()) as Record<string, string>;
    const task: ExportTask = {
      id: `E-${Date.now()}`,
      projectId: `${params.projectId}`,
      reportName: body.report_name || '项目报告',
      status: 'queued',
      requestedBy: mockProfile.displayName,
      requestedAt: new Date().toISOString()
    };
    exportTasks.unshift(task);
    return ok(task, 'queued');
  }),
  http.get(`${API_PREFIX}/export-jobs/:exportJobId/download-link/`, ({ params }) => {
    if (!canWrite()) return fail('forbidden', 403);
    const target = exportTasks.find(item => `${item.id}` === `${params.exportJobId}`);
    if (!target || !target.resultObjectKey) return fail('导出任务尚无 OiS3 对象键。', 404);
    return ok({
      download_url: `https://ois3.example.invalid/${encodeURIComponent(target.resultBucketName ?? 'company-bucket')}/${encodeURIComponent(target.resultObjectKey)}`
    });
  }),
  http.patch(`${API_PREFIX}/check-items/:checkItemId/`, async ({ params, request }) => {
    if (!canWrite()) return fail('forbidden', 403);
    const target = checkItems.find(item => `${item.id}` === `${params.checkItemId}`);
    if (!target) return fail('not found', 404);
    const body = (await request.json()) as Record<string, string>;
    target.ownerName = body.owner_name || target.ownerName;
    target.ownerIdaasId = body.owner_idaas_id || target.ownerIdaasId;
    return ok(target, 'updated');
  })
];
