import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, extname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

// Config-center drawer regression suite: mounts the real BaseConfigView with the
// real service layer against an in-memory API. Covers the project instance drawer
// (edit + two-step physical deletion), module owner apply/clear, phase drawer
// (edit/delete-gate/migrate) and the matrix cell drawer (list/filter/CRUD/guards).
const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const appPath = resolve(root, 'src/App.tsx');
const apiOrigin = 'https://api.config.example.test';
const prefix = '/api/li-bs-auto-status/v1';
const basePrefix = '/api/v1/base';
const outputDir = await mkdtemp(resolve(tmpdir(), 'auto-status-config-drawers-'));
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://spa.config.example.test', pretendToBeVisual: true
});
const compiled = new Map();
const originals = new Map();
const blockedRequests = [];
const consoleErrors = [];
const originalConsoleError = console.error;
let backend;
let renderer;
let views;
let api;
let createRoot;
let data;
let selectedId;
let deletedProjects = [];
let deletionReload = null;
let confirmResult = false;
let confirmCalls = [];
let passed = 0;

function installGlobal(key, value) {
  originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
for (const key of ['window', 'document', 'Event', 'KeyboardEvent', 'MouseEvent', 'HTMLElement', 'Node', 'navigator']) {
  installGlobal(key, key === 'window' ? dom.window : key === 'document' ? dom.window.document : dom.window[key]);
}
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);
installGlobal('fetch', async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  const allowed = url.origin === apiOrigin && (url.pathname.startsWith(`${prefix}/`) || url.pathname.startsWith(`${basePrefix}/`));
  if (!allowed) {
    blockedRequests.push(url.href);
    throw new Error(`Network outside the in-memory test API is forbidden: ${url.href}`);
  }
  assert.ok(backend, 'A mounted test must own every API request');
  assert.equal(init.credentials, 'include', 'Real services must retain credential handling');
  return backend.fetch(url, init);
});
dom.window.fetch = globalThis.fetch;
dom.window.confirm = message => { confirmCalls.push(message); return confirmResult; };
// Container-level save flows resolve through microtask gaps between polling act()s,
// so React's "not wrapped in act" hygiene warning cannot be fully eliminated here the
// way leaf-component suites do. Filter exactly that warning; every other console error
// (key warnings, invalid nesting, error boundaries, real exceptions) stays fatal.
const isActWarning = args => args.some(arg => typeof arg === 'string' && arg.includes('was not wrapped in act('));
console.error = (...args) => {
  if (!isActWarning(args)) consoleErrors.push(args);
  if (process.env.CONFIG_DRAWER_DEBUG) originalConsoleError(args.map(String).join(' ').slice(0, 200));
};

async function compile(path) {
  if (compiled.has(path)) return compiled.get(path);
  const outputPath = resolve(outputDir, `${compiled.size}.mjs`);
  compiled.set(path, outputPath);
  let source = (await readFile(path, 'utf8')).replaceAll('import.meta.env', `({ VITE_BASE_API: ${JSON.stringify(apiOrigin)} })`);
  if (path === appPath) source += '\nexport { BaseConfigView };\n';
  let output = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  output = output.replace(/import\s+['"][^'"]+\.css['"];?/g, '');
  for (const match of [...output.matchAll(/from\s+(['"])([^'"]+)\1/g)]) {
    const specifier = match[2];
    let target;
    if (specifier.startsWith('.')) {
      const base = resolve(dirname(path), specifier);
      const candidates = extname(base)
        ? [base, base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx')]
        : [`${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts'), resolve(base, 'index.tsx')];
      for (const candidate of candidates) {
        if (await stat(candidate).then(value => value.isFile()).catch(() => false)) {
          target = await compile(candidate);
          break;
        }
      }
      assert.ok(target, `Unresolved local module: ${specifier}`);
    } else target = require.resolve(specifier);
    output = output.replaceAll(match[0], `from ${JSON.stringify(pathToFileURL(target).href)}`);
  }
  await writeFile(outputPath, output);
  return outputPath;
}

const clone = value => structuredClone(value);
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' }
});
const page = results => ({ count: results.length, next: null, previous: null, results });

const ownerWire = (idaasId, name, primary = true) => ({
  display_name: name, idaas_id: idaasId, email: `${idaasId}@example.test`, is_primary: primary, sort_order: 0, metadata: {}
});
const candidateWire = (idaasId, name, department) => ({
  idaas_id: idaasId, display_name: name, email: `${idaasId}@example.test`, department
});
const projectWire = (id, code, name) => ({
  id, code, name, status: 'active', owner_name: '陈工', description: '初始说明',
  factory: null, workshop: null, production_line: null,
  factory_name_snapshot: '一厂', workshop_name_snapshot: '总装车间', line_name_snapshot: '',
  planned_start_date: '2026-10-01', planned_end_date: '2026-12-31',
  progress_percent: 0, metadata: {}, updated_at: '2026-09-29T00:00:00Z'
});
const phaseWire = (id, code, name, sortOrder, overrides = {}) => ({
  id, project: 7, code, name, sort_order: sortOrder, goal: `${name}目标`,
  planned_start: '2026-10-01', planned_end: '2026-10-20', status: 'not_started',
  is_enabled: true, can_delete: false, is_default: false, metadata: {}, ...overrides
});
const moduleWire = (id, code, name, sortOrder, owners = []) => ({
  id, code, name, description: '', sort_order: sortOrder, is_active: true,
  owner_display_name: '', owner_name: '', owner_idaas_id: '', owner_email: '',
  metadata: { owners }
});
const checkItemWire = (id, phaseId, moduleId, title, overrides = {}) => ({
  id, project: 7, project_phase: phaseId, phase: phaseId, module: moduleId, title,
  description: `${title}说明`, tags: ['尺寸'], planned_start: '2026-10-02', planned_end: '2026-10-09',
  due_date: '2026-10-09', owners: [], status: 'pending', is_enabled: true,
  can_delete: true, is_default: false, progress_percent: 0, metadata: {}, attachments: [], ...overrides
});

class MemoryApi {
  calls = [];
  unexpectedRequests = [];
  projects = new Map();
  phases = new Map();
  modules = new Map();
  checkItems = new Map();
  jobs = new Map();
  nextItemId = 1000;
  nextJobId = 500;
  failNextExecute = false;
  remotePool = [
    candidateWire('u1001', '王芳', '质量部'),
    candidateWire('u1002', '李强', '制造部'),
    candidateWire('u1003', '赵敏', '工艺部')
  ];

  seedDefaults() {
    this.projects.set(7, projectWire(7, 'PRJ-CFG', '配置验证项目'));
    this.projects.set(99, projectWire(99, 'PRJ-OTHER', '其他项目'));
    this.phases.set(71, phaseWire(71, 'P1', '冲压阶段', 1, { status: 'in_progress', is_default: true }));
    this.phases.set(72, phaseWire(72, 'P2', '焊装阶段', 2, { planned_start: '2026-10-21', planned_end: '2026-11-10', can_delete: true }));
    this.phases.set(73, phaseWire(73, 'P3', '涂装阶段', 3, { planned_start: '2026-11-11', planned_end: '2026-11-30', can_delete: true }));
    this.modules.set(81, moduleWire(81, 'MOD-A', '尺寸检测', 1, [ownerWire('u1001', '王芳')]));
    this.modules.set(82, moduleWire(82, 'MOD-B', '外观检测', 2, []));
    this.checkItems.set(901, checkItemWire(901, 71, 81, '间隙面差检测', {
      status: 'in_progress', can_delete: false, owners: [ownerWire('u1001', '王芳')], tags: ['尺寸', '间隙']
    }));
    this.checkItems.set(902, checkItemWire(902, 71, 81, '扭矩复检', { planned_start: '2026-10-03', planned_end: '2026-10-08' }));
    this.checkItems.set(903, checkItemWire(903, 71, 82, '漆膜厚度检测', { tags: ['漆膜'] }));
    // 其他项目的检查项用于验证模块负责人同步与物理删除的隔离边界。
    this.checkItems.set(904, checkItemWire(904, null, 81, '他项目检查项', { project: 99 }));
  }

  matching(method, path) { return this.calls.filter(call => call.method === method && call.path === path); }
  jobFor(projectId) { return this.jobs.get(projectId) ?? null; }
  jobPayload(job) {
    return {
      id: job.id, project_id: job.project_id, project_code: job.project_code, project_name: job.project_name,
      status: job.status, last_error: job.last_error, requested_by: job.requested_by,
      counts: job.counts, file_summary: job.file_summary, created_at: job.created_at, updated_at: job.updated_at
    };
  }
  deletionState(projectId) {
    const job = this.jobFor(projectId);
    return { active: Boolean(job && ['preflighted', 'cleaning_files', 'files_cleaned', 'finalizing', 'failed'].includes(job.status)), job: job ? this.jobPayload(job) : null };
  }
  buildJob(project) {
    const phases = [...this.phases.values()].filter(item => item.project === project.id);
    const items = [...this.checkItems.values()].filter(item => item.project === project.id);
    return {
      id: this.nextJobId += 1,
      project_id: project.id, project_code: project.code, project_name: project.name,
      status: 'preflighted', last_error: '', requested_by: { idaas_id: 'admin-user', name: '管理员' },
      counts: {
        phases: phases.length, check_items: items.length,
        check_item_owners: items.reduce((total, item) => total + item.owners.length, 0),
        key_issues: 0, collision_reports: 0, collision_blocks: 0, collision_approvals: 0,
        attachments: 0, export_jobs: 0, audit_logs: 4
      },
      file_summary: {
        attachments_total: 0, attachments_to_delete: 0, attachments_kept_shared: 0,
        attachment_files_deleted: 0, export_files_total: 0, export_files_to_delete: 0, export_files_deleted: 0
      },
      created_at: '2026-09-29T00:00:00Z', updated_at: '2026-09-29T00:00:00Z'
    };
  }

  async fetch(url, init) {
    const method = init.method || 'GET';
    if (url.pathname.startsWith(`${basePrefix}/`)) return json({ detail: '主数据服务在配置抽屉测试中不可用' }, 404);
    const path = url.pathname.slice(prefix.length);
    const call = { method, path, url, body: typeof init.body === 'string' ? init.body : '' };
    this.calls.push(call);
    if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    if (path.startsWith('/dashboard/')) return json({ detail: '看板在配置抽屉测试中不可用' }, 404);
    if (/^\/projects\/(\d+)\/timeline\/$/.test(path) && method === 'GET') {
      return json({ detail: '时间线在配置抽屉测试中不可用' }, 404);
    }

    if (path === '/projects/' && method === 'GET') {
      return json(page([...this.projects.values()].map(clone)));
    }
    let match = path.match(/^\/projects\/(\d+)\/$/);
    if (match) {
      const project = this.projects.get(Number(match[1]));
      if (!project) return json({ detail: '项目不存在。' }, 404);
      if (method === 'GET') return json(clone(project));
      if (method === 'PATCH') {
        Object.assign(project, JSON.parse(call.body));
        return json(clone(project));
      }
    }
    match = path.match(/^\/projects\/(\d+)\/phases\/$/);
    if (match && method === 'GET') {
      const projectId = Number(match[1]);
      if (!this.projects.has(projectId)) return json({ detail: '项目不存在。' }, 404);
      return json([...this.phases.values()].filter(item => item.project === projectId).map(clone));
    }
    match = path.match(/^\/projects\/(\d+)\/check-items\/$/);
    if (match) {
      const projectId = Number(match[1]);
      if (!this.projects.has(projectId)) return json({ detail: '项目不存在。' }, 404);
      if (method === 'GET') {
        return json([...this.checkItems.values()].filter(item => item.project === projectId).map(clone));
      }
      if (method === 'POST') {
        const payload = JSON.parse(call.body);
        const row = checkItemWire(this.nextItemId += 1, payload.project_phase, payload.module, payload.title, {
          project: projectId,
          description: payload.description ?? '',
          tags: payload.tags ?? [],
          planned_start: payload.planned_start, planned_end: payload.planned_end, due_date: payload.due_date,
          owners: payload.owners ?? [], status: payload.status ?? 'pending',
          is_enabled: payload.is_enabled ?? true, metadata: payload.metadata ?? {}
        });
        this.checkItems.set(row.id, row);
        return json(clone(row), 201);
      }
    }
    for (const child of ['key-issues', 'collision-reports', 'reports', 'exports']) {
      if (path === `/projects/7/${child}/` || path === `/projects/99/${child}/`) {
        if (method === 'GET') return json([]);
      }
    }
    match = path.match(/^\/projects\/(\d+)\/delete-physical\/$/);
    if (match) {
      const projectId = Number(match[1]);
      const project = this.projects.get(projectId);
      if (method === 'GET') return json(this.deletionState(projectId));
      if (method === 'POST') {
        if (!project) return json({ detail: '项目不存在。' }, 404);
        const payload = JSON.parse(call.body);
        if (payload.confirm_code !== project.code) return json({ detail: '项目编号校验失败。' }, 400);
        const job = this.buildJob(project);
        this.jobs.set(projectId, job);
        return json(this.deletionState(projectId), 201);
      }
    }
    match = path.match(/^\/projects\/(\d+)\/delete-physical\/execute\/$/);
    if (match && method === 'POST') {
      const projectId = Number(match[1]);
      const project = this.projects.get(projectId);
      const job = this.jobFor(projectId);
      if (!project || !job || !['preflighted', 'failed'].includes(job.status)) {
        return json({ detail: '没有可执行的删除预检任务。' }, 409);
      }
      const payload = JSON.parse(call.body);
      if (payload.confirm_code !== project.code) return json({ detail: '项目编号校验失败。' }, 400);
      if (this.failNextExecute) {
        this.failNextExecute = false;
        job.status = 'failed';
        job.last_error = '模拟存储清理失败：附件文件不可达。';
        return json({ detail: job.last_error, retryable: true, job: this.jobPayload(job) }, 502);
      }
      job.status = 'completed';
      job.project_id = null;
      this.projects.delete(projectId);
      for (const [id, phase] of this.phases) if (phase.project === projectId) this.phases.delete(id);
      for (const [id, item] of this.checkItems) if (item.project === projectId) this.checkItems.delete(id);
      return json(this.deletionState(projectId));
    }
    match = path.match(/^\/projects\/(\d+)\/delete-physical\/cancel\/$/);
    if (match && method === 'POST') {
      const projectId = Number(match[1]);
      const job = this.jobFor(projectId);
      if (!job || job.status !== 'preflighted') return json({ detail: '仅预检状态的任务可取消。' }, 409);
      job.status = 'cancelled';
      return json(this.deletionState(projectId));
    }
    if (path === '/phase-templates/' && method === 'GET') {
      return json(page([{ id: 61, code: 'TPL-DEFAULT', name: '默认阶段模板', version: 1, description: '', is_active: true, phase_definitions: [], metadata: {} }]));
    }
    if (path === '/inspection-modules/' && method === 'GET') {
      return json(page([...this.modules.values()].map(clone)));
    }
    if (path === '/checklist-templates/' && method === 'GET') return json(page([]));
    if (path === '/idaas-candidates/' && method === 'GET') {
      const q = (url.searchParams.get('q') || '').trim();
      const results = this.remotePool.filter(item => !q || item.display_name.includes(q) || item.idaas_id.includes(q) || item.email.includes(q));
      return json({ results });
    }
    match = path.match(/^\/project-phases\/(\d+)\/$/);
    if (match) {
      const phase = this.phases.get(Number(match[1]));
      if (!phase) return json({ detail: '阶段不存在。' }, 404);
      if (method === 'GET') return json(clone(phase));
      if (method === 'PATCH') {
        Object.assign(phase, JSON.parse(call.body));
        return json(clone(phase));
      }
      if (method === 'DELETE') {
        this.phases.delete(phase.id);
        return new Response(null, { status: 204 });
      }
    }
    match = path.match(/^\/check-items\/(\d+)\/$/);
    if (match) {
      const item = this.checkItems.get(Number(match[1]));
      if (!item) return json({ detail: '检查项不存在。' }, 404);
      if (method === 'PATCH') {
        Object.assign(item, JSON.parse(call.body));
        return json(clone(item));
      }
      if (method === 'DELETE') {
        this.checkItems.delete(item.id);
        return new Response(null, { status: 204 });
      }
    }
    match = path.match(/^\/inspection-modules\/(\d+)\/apply-owner\/$/);
    if (match && method === 'POST') {
      const module = this.modules.get(Number(match[1]));
      if (!module) return json({ detail: '模块不存在。' }, 404);
      const payload = JSON.parse(call.body);
      const projectId = Number(payload.project_id);
      module.metadata = { ...module.metadata, owners: payload.owners };
      let affected = 0;
      for (const item of this.checkItems.values()) {
        if (item.project === projectId && String(item.module) === String(module.id)) {
          item.owners = clone(payload.owners);
          affected += 1;
        }
      }
      return json({ module: clone(module), owners: clone(payload.owners), affected_count: affected, cleared: payload.owners.length === 0 });
    }

    this.unexpectedRequests.push(`${method} ${path}`);
    throw new Error(`Unhandled in-memory API request: ${method} ${path}`);
  }
}

const container = () => document.getElementById('root');
const dialogs = () => [...container().querySelectorAll('[role="dialog"]')];
const dialogByTitle = title => dialogs().find(item => item.querySelector('header h2')?.textContent.includes(title));
const footerOf = dialog => dialog.querySelector('footer');
const buttons = scope => [...scope.querySelectorAll('button')];
function button(text, scope = container()) {
  const found = buttons(scope).find(item => item.textContent.trim() === text);
  assert.ok(found, `Missing button ${text}`);
  return found;
}
function maybeButton(text, scope = container()) {
  return buttons(scope).find(item => item.textContent.trim() === text) ?? null;
}
function byAria(label, scope = container()) {
  const found = scope.querySelector(`[aria-label="${label}"]`);
  assert.ok(found, `Missing aria-label target ${label}`);
  return found;
}
function fieldByLabel(scope, label) {
  const found = [...scope.querySelectorAll('label')].find(item => item.querySelector('.field-label')?.textContent.trim() === label);
  assert.ok(found, `Missing field ${label}`);
  const control = found.querySelector('input, select, textarea');
  assert.ok(control, `Field ${label} has no control`);
  return control;
}
async function click(target) {
  assert.ok(target, 'Click target must exist');
  await act(async () => { target.click(); });
  // Click-triggered async chains (save → reload → accept) resume in microtasks;
  // give them an in-act window so no state update escapes act().
  await act(async () => { await new Promise(done => setTimeout(done, 20)); });
}
async function typeInto(input, value) {
  assert.ok(input && !input.disabled, 'Typing requires an enabled form control');
  await act(async () => {
    input.focus();
    const prototype = input.tagName === 'TEXTAREA'
      ? dom.window.HTMLTextAreaElement.prototype
      : input.tagName === 'SELECT'
        ? dom.window.HTMLSelectElement.prototype
        : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
    input.dispatchEvent(new dom.window.Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
  assert.equal(input.value, value);
}
async function escape() {
  await act(async () => { dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
}
async function until(predicate, message) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) {
      // Flush trailing effect promises (e.g. drawer-open state fetches) inside act.
      await act(async () => { await new Promise(done => setTimeout(done, 25)); });
      await act(async () => { await new Promise(done => setTimeout(done, 25)); });
      return;
    }
    await act(async () => { await new Promise(done => setTimeout(done, 5)); });
  }
  assert.ok(predicate(), message);
}

const mutations = () => backend.calls.filter(call => call.method !== 'GET');
const projectRow = name => [...container().querySelectorAll('table tbody tr')].find(row => row.textContent.includes(name));

function viewProps() {
  const unavailable = async () => { throw new Error('This test must not invoke unrelated application actions'); };
  return {
    data,
    scope: { factoryId: '', workshopId: '', productionLineId: '' },
    canWrite: true,
    onScopeChange: () => {},
    onSelectProject: projectId => { selectedId = projectId; void reload(); },
    onCreateProject: () => unavailable(),
    onUpdateProject: async (project, draft) => {
      const factory = data.hierarchy.factories.find(item => String(item.id) === draft.factoryId);
      const workshop = data.hierarchy.workshops.find(item => String(item.id) === draft.workshopId);
      const productionLine = data.hierarchy.productionLines.find(item => String(item.id) === draft.productionLineId);
      const updated = await api.updateProject(project.id, {
        name: draft.name, code: draft.code, status: draft.status, description: draft.description,
        factoryId: draft.factoryId || null, workshopId: draft.workshopId || null, productionLineId: draft.productionLineId || null,
        plant: factory?.name ?? project.plant,
        workshopName: workshop?.name,
        lineName: productionLine?.name ?? '车间级项目',
        ownerName: draft.ownerName,
        plannedStartDate: draft.plannedStartDate, plannedEndDate: draft.plannedEndDate,
        metadata: project.metadata
      });
      await reload();
      return updated;
    },
    onProjectDeleted: project => {
      deletedProjects.push(project.id);
      selectedId = undefined;
      deletionReload = reload();
    },
    onSeedTemplate: unavailable,
    onUpdatePhase: async (phase, draft) => {
      const updated = await api.updateProjectPhase(phase.id, {
        name: draft.name, sequence: Number(draft.sequence), goal: draft.goal,
        plannedStartDate: draft.plannedStartDate, plannedEndDate: draft.plannedEndDate,
        status: draft.status, isActive: draft.isActive, metadata: phase.metadata
      });
      await reload();
      return updated;
    },
    onDeletePhase: async phase => { await api.deleteProjectPhase(phase.id); await reload(); },
    onMigratePhaseCheckItems: async (phase, targetPhaseId) => {
      const target = data.phases.find(item => String(item.id) === String(targetPhaseId));
      const items = data.checkItems.filter(item => String(item.projectPhaseId) === String(phase.id));
      for (const item of items) {
        await api.updateCheckItem(item.id, {
          title: item.title,
          moduleId: item.moduleId,
          projectPhaseId: targetPhaseId,
          tags: item.tags ?? [],
          plannedStartDate: (item.plannedStartDate || target?.plannedStartDate || '').slice(0, 10),
          plannedEndDate: (item.plannedEndDate || target?.plannedEndDate || '').slice(0, 10),
          owners: item.owners,
          status: item.status,
          isActive: item.isActive,
          progressPercent: item.progressPercent,
          metadata: item.metadata
        });
      }
      await reload();
      return items.length;
    },
    onCreateCheckItem: async draft => {
      await api.createCheckItem(selectedId, {
        title: draft.title,
        moduleId: draft.moduleId,
        projectPhaseId: draft.projectPhaseId,
        tags: draft.tags.split(/[,，、]/).map(tag => tag.trim()).filter(Boolean),
        plannedStartDate: draft.plannedStartDate,
        plannedEndDate: draft.plannedEndDate,
        owners: draft.owners,
        status: draft.status,
        isActive: draft.isActive,
        progressPercent: draft.status === 'completed' ? 100 : 0
      });
      await reload();
    },
    onUpdateCheckItem: async (item, draft) => {
      await api.updateCheckItem(item.id, {
        title: draft.title,
        moduleId: draft.moduleId,
        projectPhaseId: draft.projectPhaseId,
        tags: draft.tags.split(/[,，、]/).map(tag => tag.trim()).filter(Boolean),
        plannedStartDate: draft.plannedStartDate,
        plannedEndDate: draft.plannedEndDate,
        owners: draft.owners,
        status: draft.status,
        isActive: draft.isActive,
        progressPercent: item.progressPercent,
        metadata: item.metadata
      });
      await reload();
    },
    onDeleteCheckItem: async item => { await api.deleteCheckItem(item.id); await reload(); },
    onApplyModuleOwner: async (module, owners) => {
      const result = await api.applyInspectionModuleOwner(module.id, { projectId: selectedId, owners });
      await reload();
      return { affectedCount: result.affectedCount, cleared: result.cleared };
    }
  };
}

async function render() {
  await act(async () => { renderer.render(React.createElement(views.BaseConfigView, viewProps())); });
}
async function reload() {
  data = await api.fetchWorkspaceData(selectedId);
  if (renderer) await render();
}
async function mount() {
  backend = new MemoryApi();
  backend.seedDefaults();
  selectedId = 7;
  data = await api.fetchWorkspaceData(selectedId);
  renderer = createRoot(container());
  await render();
  await until(() => container().textContent.includes('项目实例列表') && container().textContent.includes('项目模块配置'), 'Config center did not settle');
}
async function openProjectDrawer(name = '配置验证项目') {
  await click(byAria(`配置项目实例 ${name}`));
  await until(() => {
    const dialog = dialogByTitle(`项目实例 · ${name}`);
    return dialog && fieldByLabel(dialog, '项目名称').value === name;
  }, 'Project drawer did not load the saved record');
  return dialogByTitle(`项目实例 · ${name}`);
}
async function openPhaseDrawer(name) {
  await click(byAria(`配置阶段 ${name}`));
  await until(() => {
    const dialog = dialogByTitle(`项目阶段 · ${name}`);
    return dialog && fieldByLabel(dialog, '阶段名称').value === name;
  }, 'Phase drawer did not load the saved record');
  return dialogByTitle(`项目阶段 · ${name}`);
}
async function openMatrixCell(moduleName, phaseName) {
  await click(byAria(`配置 ${moduleName} ${phaseName} 检查项`));
  await until(() => Boolean(dialogByTitle(`${moduleName} × ${phaseName}`)), 'Matrix cell drawer did not open');
  return dialogByTitle(`${moduleName} × ${phaseName}`);
}
const ownerCandidateButton = (scope, name) => {
  const found = buttons(scope).find(item => item.textContent.includes(name) && item.querySelector('svg'));
  assert.ok(found, `Missing owner candidate ${name}`);
  return found;
};

async function run(name, test) {
  const errorsBefore = consoleErrors.length;
  confirmCalls = [];
  confirmResult = false;
  deletedProjects = [];
  deletionReload = null;
  try {
    await test();
    assert.deepEqual(blockedRequests, [], 'No request may target any non-test origin');
    assert.deepEqual(backend?.unexpectedRequests ?? [], [], 'Every service request must be explicitly handled');
    assert.equal(consoleErrors.length, errorsBefore, 'React/browser console errors are test failures');
    passed += 1;
    process.stdout.write(`PASS ${name}\n`);
  } finally {
    if (renderer) {
      await act(async () => { renderer.unmount(); });
      renderer = null;
    }
    container().replaceChildren();
    backend = null;
    data = null;
  }
}

try {
  ({ createRoot } = await import('react-dom/client'));
  views = await import(pathToFileURL(await compile(appPath)).href);
  api = await import(pathToFileURL(await compile(resolve(root, 'src/services/bsAutoStatusApi.ts'))).href);

  await run('project drawer: shows saved values, saves edits and resets the baseline without stray writes', async () => {
    await mount();
    const dialog = await openProjectDrawer();
    assert.equal(fieldByLabel(dialog, '项目编号').value, 'PRJ-CFG');
    assert.equal(fieldByLabel(dialog, '状态').value, 'active');
    assert.equal(fieldByLabel(dialog, '负责人').value, '陈工');
    assert.equal(fieldByLabel(dialog, '计划开始').value, '2026-10-01');
    assert.equal(fieldByLabel(dialog, '项目说明').value, '初始说明');
    assert.ok(backend.matching('GET', '/projects/7/delete-physical/').length >= 1, '抽屉打开时查询删除任务状态');
    const saveButton = button('保存项目', footerOf(dialog));
    assert.equal(saveButton.disabled, true, '未修改时保存禁用');
    await typeInto(fieldByLabel(dialog, '项目名称'), '配置验证项目（改）');
    assert.equal(saveButton.disabled, false);
    await click(saveButton);
    await until(() => {
      const current = dialogByTitle('项目实例 · 配置验证项目（改）');
      const btn = current && maybeButton('保存项目', footerOf(current));
      return projectRow('配置验证项目（改）') && btn && btn.disabled === true;
    }, '保存后表格未展示保存值或草稿基线未更新');
    const patch = backend.matching('PATCH', '/projects/7/');
    assert.equal(patch.length, 1);
    assert.equal(JSON.parse(patch[0].body).name, '配置验证项目（改）');
    const savedDialog = dialogByTitle('项目实例 · 配置验证项目（改）');
    const before = mutations().length;
    await click(button('取消', footerOf(savedDialog)));
    assert.equal(dialogByTitle('项目实例'), undefined, '干净状态下取消直接关闭');
    assert.equal(mutations().length, before, '取消不发生任何写请求');
  });

  await run('project deletion: code-matched preflight then execute removes only the target project', async () => {
    await mount();
    await assert.rejects(
      () => api.preflightProjectPhysicalDeletion(7, 'WRONG-CODE'),
      error => error.status === 400 && /编号/.test(error.message),
      '服务器必须复验确认编号'
    );
    const dialog = await openProjectDrawer();
    const codeInput = byAria('物理删除确认编号', dialog);
    const preflightButton = button('预检（不执行删除）', dialog);
    assert.equal(preflightButton.disabled, true, '编号一致前预检禁用');
    await typeInto(codeInput, 'PRJ-WRONG');
    assert.equal(button('预检（不执行删除）', dialog).disabled, true);
    await typeInto(codeInput, 'PRJ-CFG');
    assert.equal(button('预检（不执行删除）', dialog).disabled, false);
    await click(button('预检（不执行删除）', dialog));
    await until(() => dialog.textContent.includes('已预检'), '预检任务卡片未出现');
    assert.ok(dialog.textContent.includes(`任务 #${backend.jobFor(7).id}`));
    assert.ok(dialog.textContent.includes('阶段') && dialog.textContent.includes('检查项'), '预检展示关联数量');
    assert.equal(backend.projects.has(7), true, '预检不执行删除');
    const preflightCall = backend.matching('POST', '/projects/7/delete-physical/')
      .filter(call => JSON.parse(call.body).confirm_code === 'PRJ-CFG');
    assert.equal(preflightCall.length, 1, '抽屉预检只发一次请求');
    assert.equal(backend.matching('POST', '/projects/7/delete-physical/')
      .filter(call => JSON.parse(call.body).confirm_code === 'WRONG-CODE').length, 1, '服务器复验编号（直调 400）');
    await click(button('执行物理删除', dialog));
    await until(() => !dialogByTitle('项目实例') && deletionReload, '删除成功后抽屉应关闭并触发重载');
    await deletionReload;
    await until(() => !projectRow('配置验证项目') && projectRow('其他项目'), '删除后表格应移除目标项目并保留其他项目');
    assert.deepEqual(deletedProjects, [7]);
    assert.equal(backend.projects.has(7), false);
    assert.equal(backend.projects.has(99), true, '其他项目不受影响');
    assert.equal(backend.checkItems.has(904), true, '其他项目的检查项不受影响');
    assert.equal(backend.jobFor(7).status, 'completed');
  });

  await run('project deletion: storage failure keeps failed-job evidence and retry completes', async () => {
    await mount();
    backend.failNextExecute = true;
    const dialog = await openProjectDrawer();
    await typeInto(byAria('物理删除确认编号', dialog), 'PRJ-CFG');
    await click(button('预检（不执行删除）', dialog));
    await until(() => dialog.textContent.includes('已预检'), '预检任务卡片未出现');
    await click(button('执行物理删除', dialog));
    await until(() => dialog.textContent.includes('失败，可重试'), '502 后应保留失败任务证据');
    assert.ok(dialog.textContent.includes('模拟存储清理失败'), '失败任务展示最近错误');
    assert.ok(dialog.querySelector('[role="alert"]')?.textContent.includes('模拟存储清理失败'), '操作错误来自服务器 detail');
    assert.equal(backend.projects.has(7), true, '存储失败不得返回成功或移除项目');
    await click(button('重试执行物理删除', dialog));
    await until(() => !dialogByTitle('项目实例') && deletionReload, '重试成功后抽屉应关闭');
    await deletionReload;
    await until(() => !projectRow('配置验证项目'), '重试删除后表格应移除目标项目');
    assert.equal(backend.projects.has(7), false);
  });

  await run('project deletion: cancel releases a preflighted job back to idle', async () => {
    await mount();
    const dialog = await openProjectDrawer();
    await typeInto(byAria('物理删除确认编号', dialog), 'PRJ-CFG');
    await click(button('预检（不执行删除）', dialog));
    await until(() => dialog.textContent.includes('已预检'), '预检任务卡片未出现');
    await click(button('取消删除任务', dialog));
    await until(() => dialog.textContent.includes('已取消'), '取消后任务卡片应更新');
    assert.equal(backend.matching('POST', '/projects/7/delete-physical/cancel/').length, 1);
    assert.equal(backend.jobFor(7).status, 'cancelled');
    assert.equal(button('预检（不执行删除）', dialog).disabled, false, '取消后可重新预检');
    assert.equal(backend.projects.has(7), true);
  });

  await run('module owner: single-request apply syncs the project scope and refreshes summaries', async () => {
    await mount();
    await click(byAria('配置模块负责人 尺寸检测'));
    await until(() => dialogByTitle('模块负责人 · 尺寸检测'), '模块负责人抽屉未打开');
    const dialog = dialogByTitle('模块负责人 · 尺寸检测');
    assert.ok(dialog.textContent.includes('保存将同步当前项目该模块 2 个检查项'), '范围提示展示项目内检查项数量');
    assert.ok(dialog.textContent.includes('王芳'), '展示模块已保存负责人');
    const saveButton = button('保存并同步检查项', footerOf(dialog));
    assert.equal(saveButton.disabled, true, '未修改时保存禁用');
    await click(ownerCandidateButton(dialog, '李强'));
    assert.ok(dialog.textContent.includes('李强'), '候选人加入负责人列表');
    await click(button('保存并同步检查项', footerOf(dialog)));
    await until(() => !dialogByTitle('模块负责人') && container().textContent.includes('已保存模块「尺寸检测」负责人，并同步 2 个检查项。'), '保存后应关闭抽屉并提示同步数量');
    const applyCalls = backend.matching('POST', '/inspection-modules/81/apply-owner/');
    assert.equal(applyCalls.length, 1, '一次请求完成模块负责人保存与检查项同步');
    const body = JSON.parse(applyCalls[0].body);
    assert.equal(body.project_id, 7);
    assert.deepEqual(body.owners.map(owner => owner.idaas_id), ['u1001', 'u1002']);
    assert.deepEqual(backend.checkItems.get(901).owners.map(owner => owner.idaas_id), ['u1001', 'u1002']);
    assert.deepEqual(backend.checkItems.get(902).owners.map(owner => owner.idaas_id), ['u1001', 'u1002']);
    assert.deepEqual(backend.checkItems.get(903).owners, [], '其他模块的检查项不同步');
    assert.deepEqual(backend.checkItems.get(904).owners, [], '其他项目的检查项不改写');
    assert.equal(backend.matching('PATCH', '/check-items/901/').length, 0, '前端不再逐条循环写检查项');
  });

  await run('module owner: clearing owners requires confirmation and sends an empty array', async () => {
    await mount();
    await click(byAria('配置模块负责人 尺寸检测'));
    await until(() => dialogByTitle('模块负责人 · 尺寸检测'), '模块负责人抽屉未打开');
    const dialog = dialogByTitle('模块负责人 · 尺寸检测');
    await click(byAria('移除责任人 王芳', dialog));
    assert.ok(dialog.textContent.includes('保存将清空并同步 2 个检查项'), '清空前展示二次确认范围');
    await click(button('保存并同步检查项', footerOf(dialog)));
    assert.equal(confirmCalls.length, 1, '清空必须二次确认');
    assert.equal(backend.matching('POST', '/inspection-modules/81/apply-owner/').length, 0, '未确认前不发请求');
    confirmResult = true;
    await click(button('保存并同步检查项', footerOf(dialog)));
    await until(() => container().textContent.includes('已清空模块「尺寸检测」默认负责人，并同步清空 2 个检查项。'), '清空后应提示同步结果');
    const body = JSON.parse(backend.matching('POST', '/inspection-modules/81/apply-owner/')[0].body);
    assert.deepEqual(body.owners, [], '显式清空发送空数组');
    assert.deepEqual(backend.checkItems.get(901).owners, []);
    assert.deepEqual(backend.checkItems.get(902).owners, []);
  });

  await run('phase drawer: edit saves through PATCH and delete is gated by canDelete', async () => {
    await mount();
    const dialog = await openPhaseDrawer('冲压阶段');
    assert.ok(dialog.textContent.includes('Key P1 · 3 项检查配置'), '副标题展示稳定 key 与检查项数量');
    assert.equal(maybeButton('删除阶段', dialog), null, '受保护阶段不展示删除入口');
    const saveButton = button('保存阶段', footerOf(dialog));
    assert.equal(saveButton.disabled, true);
    await typeInto(fieldByLabel(dialog, '阶段名称'), '冲压阶段（改）');
    await typeInto(fieldByLabel(dialog, '阶段目标'), '更新的阶段目标');
    await click(button('保存阶段', footerOf(dialog)));
    await until(() => {
      const current = dialogByTitle('项目阶段 · 冲压阶段（改）');
      const btn = current && maybeButton('保存阶段', footerOf(current));
      return projectRow('冲压阶段（改）') && btn && btn.disabled === true;
    }, '保存后阶段表格未展示保存值或草稿基线未更新');
    const patch = backend.matching('PATCH', '/project-phases/71/');
    assert.equal(patch.length, 1);
    const body = JSON.parse(patch[0].body);
    assert.equal(body.name, '冲压阶段（改）');
    assert.equal(body.goal, '更新的阶段目标');
    await click(button('取消', footerOf(dialogByTitle('项目阶段 · 冲压阶段（改）'))));
    await until(() => !dialogByTitle('项目阶段'), '阶段抽屉应关闭');

    const removable = await openPhaseDrawer('涂装阶段');
    const deleteButton = button('删除阶段', removable);
    await click(deleteButton);
    assert.equal(confirmCalls.length, 1, '删除阶段需要确认');
    assert.equal(backend.phases.has(73), true, '未确认前不删除');
    confirmResult = true;
    await click(button('删除阶段', removable));
    await until(() => !dialogByTitle('项目阶段') && !projectRow('涂装阶段'), '删除后抽屉关闭且表格移除阶段');
    assert.equal(backend.matching('DELETE', '/project-phases/73/').length, 1);
  });

  await run('phase drawer: migrates all of the phase check items to the target phase', async () => {
    await mount();
    const dialog = await openPhaseDrawer('冲压阶段');
    const targetSelect = fieldByLabel(dialog, '迁移到阶段');
    await typeInto(targetSelect, '72');
    const migrateButton = button('迁移本阶段检查项', dialog);
    await click(migrateButton);
    assert.equal(confirmCalls.length, 1, '迁移需要确认');
    assert.equal(backend.checkItems.get(901).project_phase, 71, '未确认前不迁移');
    confirmResult = true;
    await click(button('迁移本阶段检查项', dialog));
    await until(() => backend.checkItems.get(901).project_phase === '72' && backend.checkItems.get(903).project_phase === '72', '检查项未迁移到目标阶段');
    assert.equal(backend.matching('PATCH', '/check-items/901/').length, 1);
    assert.equal(backend.matching('PATCH', '/check-items/902/').length, 1);
    assert.equal(backend.matching('PATCH', '/check-items/903/').length, 1);
    const migrated = JSON.parse(backend.matching('PATCH', '/check-items/901/')[0].body);
    assert.equal(migrated.project_phase, '72');
    assert.equal(migrated.planned_start, '2026-10-02', '已有计划日期的检查项保留自身窗口');
    assert.deepEqual(backend.checkItems.get(904).project_phase, null, '其他项目检查项不迁移');
    await until(() => dialog.textContent.includes('Key P1 · 0 项检查配置'), '迁移后副标题数量更新');
    await until(() => {
      const sourceCell = byAria('配置 尺寸检测 冲压阶段 检查项');
      const targetCell = byAria('配置 尺寸检测 焊装阶段 检查项');
      return sourceCell.textContent.includes('未配置') && targetCell.textContent.includes('2 项检查项');
    }, '矩阵单元格摘要未随迁移更新');
  });

  await run('matrix cell: filters, creates, edits and deletes check items through nested drawers', async () => {
    await mount();
    const dialog = await openMatrixCell('尺寸检测', '冲压阶段');
    assert.ok(dialog.textContent.includes('项目 配置验证项目 · P1'), '抽屉展示明确的项目/阶段上下文');
    assert.ok(footerOf(dialog).textContent.includes('2/2 项'));
    assert.ok(dialog.textContent.includes('间隙面差检测') && dialog.textContent.includes('扭矩复检'));
    await typeInto(byAria('单元检查项搜索', dialog), '扭矩');
    assert.ok(footerOf(dialog).textContent.includes('1/2 项'), '筛选后计数更新');
    assert.ok(!dialog.querySelector('tbody').textContent.includes('间隙面差检测'));
    await typeInto(byAria('单元检查项搜索', dialog), '');
    assert.ok(footerOf(dialog).textContent.includes('2/2 项'));

    await click(button('新增检查项', footerOf(dialog)));
    await until(() => dialogByTitle('新增检查项'), '新增检查项抽屉未打开');
    const inner = dialogByTitle('新增检查项');
    assert.ok(inner.textContent.includes('阶段与模块由当前矩阵单元固定'), '内层抽屉说明固定上下文');
    const createButton = button('新增检查项', footerOf(inner));
    assert.equal(createButton.disabled, true, '标题为空时校验拦截保存');
    await typeInto(fieldByLabel(inner, '检查项标题'), '新检查项X');
    assert.equal(fieldByLabel(inner, '计划开始').value, '2026-10-01', '计划窗口默认继承阶段');
    await click(ownerCandidateButton(inner, '李强'));
    await click(button('新增检查项', footerOf(inner)));
    await until(() => !dialogByTitle('新增检查项') && footerOf(dialog).textContent.includes('3/3 项'), '新增后列表未刷新');
    const createCalls = backend.matching('POST', '/projects/7/check-items/');
    assert.equal(createCalls.length, 1);
    const created = JSON.parse(createCalls[0].body);
    assert.equal(created.module, '81', '新增固定在单元格模块');
    assert.equal(created.project_phase, '71', '新增固定在单元格阶段');
    assert.deepEqual(created.owners.map(owner => owner.idaas_id), ['u1001', 'u1002'], '新建检查项继承模块默认负责人（王芳）并叠加所选（李强）');

    await click(byAria('编辑检查项 扭矩复检', dialog));
    await until(() => dialogByTitle('编辑检查项 · 扭矩复检'), '编辑抽屉未打开');
    const editDialog = dialogByTitle('编辑检查项 · 扭矩复检');
    assert.equal(fieldByLabel(editDialog, '检查项标题').value, '扭矩复检');
    const editSave = button('保存检查项', footerOf(editDialog));
    assert.equal(editSave.disabled, true, '未修改时保存禁用');
    await typeInto(fieldByLabel(editDialog, '检查项标题'), '扭矩复检（改）');
    await click(button('保存检查项', footerOf(editDialog)));
    await until(() => !dialogByTitle('编辑检查项') && dialog.textContent.includes('扭矩复检（改）'), '编辑后列表未展示保存值');
    assert.equal(JSON.parse(backend.matching('PATCH', '/check-items/902/')[0].body).title, '扭矩复检（改）');

    await click(byAria('编辑检查项 扭矩复检（改）', dialog));
    const deleting = dialogByTitle('编辑检查项 · 扭矩复检（改）');
    await click(button('删除检查项', deleting));
    assert.equal(confirmCalls.length, 1, '删除检查项需要确认');
    assert.equal(backend.checkItems.has(902), true);
    confirmResult = true;
    await click(button('删除检查项', deleting));
    await until(() => !dialogByTitle('编辑检查项') && footerOf(dialog).textContent.includes('2/2 项'), '删除后列表未刷新');
    assert.equal(backend.checkItems.has(902), false);
    assert.equal(backend.matching('DELETE', '/check-items/902/').length, 1);

    await click(byAria('编辑检查项 间隙面差检测', dialog));
    const protectedDialog = dialogByTitle('编辑检查项 · 间隙面差检测');
    assert.equal(maybeButton('删除检查项', protectedDialog), null, '受保护检查项不展示删除按钮');
    assert.ok(protectedDialog.textContent.includes('受删除保护'), '受保护检查项展示提示');
  });

  await run('matrix cell: dirty guards, nested owner search and scroll lock', async () => {
    await mount();
    const dialog = await openMatrixCell('尺寸检测', '冲压阶段');
    assert.equal(document.body.style.overflow, 'hidden', '抽屉打开时锁定页面滚动');
    await click(button('新增检查项', footerOf(dialog)));
    const inner = dialogByTitle('新增检查项');
    await typeInto(fieldByLabel(inner, '检查项标题'), '未保存草稿');
    await escape();
    assert.equal(confirmCalls.length, 1, '脏草稿 Escape 需要确认');
    assert.ok(dialogByTitle('新增检查项'), '取消确认后内层抽屉保留');
    assert.ok(dialogByTitle('尺寸检测 × 冲压阶段'), '内层确认不波及外层抽屉');
    confirmResult = true;
    await escape();
    await until(() => !dialogByTitle('新增检查项') && dialogByTitle('尺寸检测 × 冲压阶段'), '确认后仅关闭内层抽屉');

    await click(button('新增检查项', footerOf(dialog)));
    const searchDialog = dialogByTitle('新增检查项');
    await typeInto(byAria('配置中心 检查项 IDaaS 责任人', searchDialog), '赵');
    await until(
      () => backend.matching('GET', '/idaas-candidates/').some(call => call.url.searchParams.get('q') === '赵'),
      '人员搜索应经 250ms 防抖发起真实远程 IDaaS 请求'
    );
    assert.ok(!buttons(searchDialog).some(item => item.textContent.includes('制造部')), '本地候选人不应匹配远程关键字');
    await until(() => buttons(searchDialog).some(item => item.textContent.includes('赵敏')), '远程 IDaaS 候选人未出现');
    await click(ownerCandidateButton(searchDialog, '赵敏'));
    assert.ok(searchDialog.textContent.includes('赵敏'), '远程候选人加入负责人');

    await click(button('取消', footerOf(searchDialog)));
    await until(() => !dialogByTitle('新增检查项'), '确认放弃后关闭内层抽屉');
    await click(button('关闭', footerOf(dialog)));
    await until(() => dialogs().length === 0, '外层抽屉应关闭');
    assert.equal(document.body.style.overflow, '', '抽屉关闭后恢复页面滚动');
  });

  await run('App config wiring (bounded AST): drawers replace the inline config forms', async () => {
    const source = ts.createSourceFile(appPath, await readFile(appPath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const view = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'BaseConfigView');
    assert.ok(view?.body, 'Inspect the actual BaseConfigView function');
    const rendered = [];
    function visit(node) {
      if (ts.isJsxSelfClosingElement(node) && ts.isIdentifier(node.tagName)) {
        const name = node.tagName.text;
        if (['ProjectConfigDrawer', 'PhaseConfigDrawer', 'MatrixCellDrawer', 'ModuleOwnerDrawer'].includes(name)) rendered.push(name);
        if (name === 'MatrixCellDrawer') {
          const cellProp = node.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.getText(source) === 'cell');
          assert.ok(cellProp, 'MatrixCellDrawer must receive the selected cell');
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(view.body);
    assert.deepEqual(rendered.sort(), ['MatrixCellDrawer', 'ModuleOwnerDrawer', 'PhaseConfigDrawer', 'ProjectConfigDrawer']);
    const text = view.getText(source);
    assert.ok(!text.includes('所选单元检查项配置'), '页面底部常驻检查项长表单已移除');
    assert.ok(!text.includes('应用到检查项'), '逐条应用负责人按钮已移除');
    assert.ok(!text.includes('OwnerEditorDrawer'), '旧负责人弹窗已移除');
  });

  process.stdout.write(`${passed} config drawer regression groups passed (real React DOM + services; drawer wiring checked by bounded AST).\n`);
} finally {
  if (renderer) await act(async () => { renderer.unmount(); });
  console.error = originalConsoleError;
  dom.window.close();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  await rm(outputDir, { recursive: true, force: true });
}
