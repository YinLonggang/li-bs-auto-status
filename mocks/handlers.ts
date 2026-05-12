import { http, HttpResponse } from 'msw';
import { API_PREFIX, AUTH_PREFIX } from '../config';
import {
  checkItems,
  checklistTemplates,
  collisionReports,
  exportTasks,
  inspectionModules,
  keyIssues,
  mockProfile,
  ownerCandidates,
  phases,
  phaseTemplates,
  projects,
  reports
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

export const handlers = [
  http.get(`${AUTH_PREFIX}/user-profile/`, () => ok(mockProfile)),
  http.get(`${API_PREFIX}/projects/`, () => ok(projects)),
  http.post(`${API_PREFIX}/projects/`, async ({ request }) => {
    if (!canWrite()) return fail('forbidden', 403);
    const body = (await request.json()) as Record<string, string>;
    const project: Project = {
      id: `P-${Date.now()}`,
      code: body.code || `BS-AUTO-${projects.length + 1}`,
      name: body.name || '新建 Auto Status 项目',
      plant: body.plant || '未设置',
      lineName: body.line_name || '未设置',
      status: 'planning',
      ownerName: body.owner_name || '未设置',
      plannedStartDate: body.planned_start_date || new Date().toISOString().slice(0, 10),
      plannedEndDate: body.planned_end_date || new Date().toISOString().slice(0, 10),
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
    return ok(data);
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
