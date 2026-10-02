import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, extname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

// Project maintenance regression suite: mounts the real BaseConfigView against an
// in-memory API. Covers in-project phase creation (validation, duplicate key,
// POST wiring), the delete-semantics explanation, library import into a module
// (per-entry skips) and module exit (disable-only, project scope isolation).
const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const appPath = resolve(root, 'src/App.tsx');
const apiOrigin = 'https://api.maintenance.example.test';
const prefix = '/api/li-bs-auto-status/v1';
const basePrefix = '/api/v1/base';
const outputDir = await mkdtemp(resolve(tmpdir(), 'auto-status-project-maintenance-'));
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://spa.maintenance.example.test', pretendToBeVisual: true
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
const isActWarning = args => args.some(arg => typeof arg === 'string' && arg.includes('was not wrapped in act('));
console.error = (...args) => {
  if (!isActWarning(args)) consoleErrors.push(args);
  if (process.env.PROJECT_MAINTENANCE_DEBUG) originalConsoleError(args.map(String).join(' ').slice(0, 200));
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

const projectWire = (id, code, name) => ({
  id, code, name, status: 'active', owner_name: '陈工', description: '',
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
const moduleWire = (id, code, name, sortOrder) => ({
  id, code, name, description: '', sort_order: sortOrder, is_active: true,
  owner_display_name: '', owner_name: '', owner_idaas_id: '', owner_email: '',
  metadata: {}
});
const checkItemWire = (id, phaseId, moduleId, title, overrides = {}) => ({
  id, project: 7, project_phase: phaseId, phase: phaseId, module: moduleId, title,
  description: `${title}说明`, tags: [], planned_start: '2026-10-02', planned_end: '2026-10-09',
  due_date: '2026-10-09', owners: [], status: 'pending', is_enabled: true,
  can_delete: true, is_default: false, progress_percent: 0, metadata: {}, attachments: [], ...overrides
});
const libraryEntryWire = (id, phaseKey, title, overrides = {}) => ({
  id, phase_key: phaseKey, title, description: `${title}说明`, priority: 'P1',
  sort_order: id, is_active: true, linked_template_count: 0, metadata: {}, ...overrides
});

class MemoryApi {
  calls = [];
  unexpectedRequests = [];
  projects = new Map();
  phases = new Map();
  modules = new Map();
  checkItems = new Map();
  libraryEntries = new Map();
  nextItemId = 1000;
  nextPhaseId = 100;

  seedDefaults() {
    this.projects.set(7, projectWire(7, 'PRJ-MNT', '维护验证项目'));
    this.phases.set(71, phaseWire(71, 'P1', '冲压阶段', 1, { status: 'in_progress', is_default: true }));
    this.phases.set(72, phaseWire(72, 'P2', '焊装阶段', 2, { planned_start: '2026-10-21', planned_end: '2026-11-10', can_delete: true }));
    this.modules.set(81, moduleWire(81, 'MOD-A', '尺寸检测', 1));
    this.modules.set(82, moduleWire(82, 'MOD-B', '外观检测', 2));
    this.checkItems.set(901, checkItemWire(901, 71, 81, '间隙面差检测', { status: 'in_progress' }));
    this.checkItems.set(902, checkItemWire(902, 71, 81, '扭矩复检'));
    this.checkItems.set(903, checkItemWire(903, 71, 82, '漆膜厚度检测'));
    this.libraryEntries.set(301, libraryEntryWire(301, 'P1', '冲压首件确认'));
    this.libraryEntries.set(302, libraryEntryWire(302, 'P9', '缺失阶段条目'));
    this.libraryEntries.set(303, libraryEntryWire(303, 'P1', '漆膜厚度检测'));
    this.libraryEntries.set(304, libraryEntryWire(304, 'P1', '已停用库条目', { is_active: false }));
  }

  matching(method, path) { return this.calls.filter(call => call.method === method && call.path === path); }

  async fetch(url, init) {
    const method = init.method || 'GET';
    if (url.pathname.startsWith(`${basePrefix}/`)) return json({ detail: '主数据服务在项目维护测试中不可用' }, 404);
    const path = url.pathname.slice(prefix.length);
    const call = { method, path, url, body: typeof init.body === 'string' ? init.body : '' };
    this.calls.push(call);
    if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    if (path.startsWith('/dashboard/')) return json({ detail: '看板在项目维护测试中不可用' }, 404);
    if (/^\/projects\/(\d+)\/timeline\/$/.test(path) && method === 'GET') {
      return json({ detail: '时间线在项目维护测试中不可用' }, 404);
    }
    if (path === '/projects/' && method === 'GET') {
      return json(page([...this.projects.values()].map(clone)));
    }
    let match = path.match(/^\/projects\/(\d+)\/$/);
    if (match && method === 'GET') {
      const project = this.projects.get(Number(match[1]));
      if (!project) return json({ detail: '项目不存在。' }, 404);
      return json(clone(project));
    }
    match = path.match(/^\/projects\/(\d+)\/phases\/$/);
    if (match) {
      const projectId = Number(match[1]);
      if (!this.projects.has(projectId)) return json({ detail: '项目不存在。' }, 404);
      if (method === 'GET') {
        return json([...this.phases.values()].filter(item => item.project === projectId).map(clone));
      }
      if (method === 'POST') {
        const payload = JSON.parse(call.body);
        const duplicate = [...this.phases.values()].some(item => item.project === projectId && item.code === payload.phase_key);
        if (duplicate) return json({ phase_key: [`该项目下已存在相同阶段 Key「${payload.phase_key}」。`] }, 400);
        const maxOrder = Math.max(0, ...[...this.phases.values()].filter(item => item.project === projectId).map(item => item.sort_order));
        const row = phaseWire(this.nextPhaseId += 1, payload.phase_key, payload.name, payload.sort_order ?? maxOrder + 1, {
          goal: payload.goal ?? '',
          planned_start: payload.planned_start, planned_end: payload.planned_end,
          status: payload.status ?? 'not_started', is_enabled: payload.is_enabled ?? true,
          can_delete: true, metadata: payload.metadata ?? {}
        });
        this.phases.set(row.id, row);
        return json(clone(row), 201);
      }
    }
    match = path.match(/^\/projects\/(\d+)\/import-library-items\/$/);
    if (match && method === 'POST') {
      const projectId = Number(match[1]);
      if (!this.projects.has(projectId)) return json({ detail: '项目不存在。' }, 404);
      const payload = JSON.parse(call.body);
      const moduleId = Number(payload.module);
      const module = this.modules.get(moduleId);
      if (!module) return json({ module: ['模块不存在。'] }, 400);
      const entryIds = [...new Set(payload.entry_ids.map(Number))];
      const createdIds = [];
      const skipped = [];
      for (const entryId of entryIds) {
        const entry = this.libraryEntries.get(entryId);
        if (!entry) { skipped.push({ entry_id: entryId, title: '', reason: '库条目不存在。' }); continue; }
        if (!entry.is_active) { skipped.push({ entry_id: entryId, title: entry.title, reason: '库条目已停用。' }); continue; }
        const phase = [...this.phases.values()].find(item => item.project === projectId && item.code === entry.phase_key);
        if (!phase) { skipped.push({ entry_id: entryId, title: entry.title, reason: `项目缺少阶段 Key「${entry.phase_key}」。` }); continue; }
        const duplicate = [...this.checkItems.values()].some(item => item.project === projectId
          && String(item.phase) === String(phase.id) && String(item.module) === String(moduleId) && item.title === entry.title);
        if (duplicate) { skipped.push({ entry_id: entryId, title: entry.title, reason: `阶段「${phase.name}」下已存在同名检查项。` }); continue; }
        const row = checkItemWire(this.nextItemId += 1, phase.id, moduleId, entry.title, {
          project: projectId,
          description: entry.description,
          planned_start: phase.planned_start, planned_end: phase.planned_end, due_date: phase.planned_end,
          metadata: { default_source: 'LIBRARY', library_entry_id: entry.id }
        });
        this.checkItems.set(row.id, row);
        createdIds.push(row.id);
      }
      return json({ created_ids: createdIds, created_count: createdIds.length, skipped });
    }
    match = path.match(/^\/projects\/(\d+)\/disable-module\/$/);
    if (match && method === 'POST') {
      const projectId = Number(match[1]);
      if (!this.projects.has(projectId)) return json({ detail: '项目不存在。' }, 404);
      const moduleId = Number(JSON.parse(call.body).module);
      let disabled = 0;
      for (const item of this.checkItems.values()) {
        if (item.project === projectId && String(item.module) === String(moduleId) && item.is_enabled) {
          item.is_enabled = false;
          disabled += 1;
        }
      }
      return json({ disabled_count: disabled });
    }
    match = path.match(/^\/projects\/(\d+)\/check-items\/$/);
    if (match && method === 'GET') {
      const projectId = Number(match[1]);
      return json([...this.checkItems.values()].filter(item => item.project === projectId).map(clone));
    }
    for (const child of ['key-issues', 'collision-reports', 'reports', 'exports']) {
      if (path === `/projects/7/${child}/` && method === 'GET') return json([]);
    }
    match = path.match(/^\/projects\/(\d+)\/delete-physical\/$/);
    if (match && method === 'GET') return json({ active: false, job: null });
    if (path === '/phase-templates/' && method === 'GET') return json(page([]));
    if (path === '/inspection-modules/' && method === 'GET') {
      return json(page([...this.modules.values()].map(clone)));
    }
    if (path === '/checklist-templates/' && method === 'GET') return json(page([]));
    if (path === '/check-item-library/' && method === 'GET') {
      const onlyActive = url.searchParams.get('is_active') === 'true';
      const results = [...this.libraryEntries.values()].filter(entry => !onlyActive || entry.is_active);
      return json(page(results.map(clone)));
    }
    if (path === '/idaas-candidates/' && method === 'GET') return json({ results: [] });
    match = path.match(/^\/project-phases\/(\d+)\/$/);
    if (match) {
      const phase = this.phases.get(Number(match[1]));
      if (!phase) return json({ detail: '阶段不存在。' }, 404);
      if (method === 'GET') return json(clone(phase));
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
async function until(predicate, message) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) {
      await act(async () => { await new Promise(done => setTimeout(done, 25)); });
      await act(async () => { await new Promise(done => setTimeout(done, 25)); });
      return;
    }
    await act(async () => { await new Promise(done => setTimeout(done, 5)); });
  }
  assert.ok(predicate(), message);
}

const phaseRow = name => [...container().querySelectorAll('table tbody tr')].find(row => row.textContent.includes(name));
const moduleRow = name => [...container().querySelectorAll('table tbody tr')]
  .find(row => row.textContent.includes(name) && row.querySelector(`[aria-label="模块 ${name} 退出当前项目"]`));

function viewProps() {
  const unavailable = async () => { throw new Error('This test must not invoke unrelated application actions'); };
  return {
    data,
    scope: { factoryId: '', workshopId: '', productionLineId: '' },
    canWrite: true,
    onScopeChange: () => {},
    onSelectProject: projectId => { selectedId = projectId; void reload(); },
    onCreateProject: () => unavailable(),
    onUpdateProject: unavailable,
    onProjectDeleted: unavailable,
    onSeedTemplate: unavailable,
    onCreatePhase: async draft => {
      const created = await api.createProjectPhase(selectedId, {
        phaseKey: draft.phaseKey.trim(),
        name: draft.name.trim(),
        sequence: Number(draft.sequence) || undefined,
        goal: draft.goal,
        plannedStartDate: draft.plannedStartDate,
        plannedEndDate: draft.plannedEndDate,
        status: draft.status,
        isActive: draft.isActive
      });
      await reload();
      return created;
    },
    onUpdatePhase: unavailable,
    onDeletePhase: unavailable,
    onMigratePhaseCheckItems: unavailable,
    onCreateCheckItem: unavailable,
    onUpdateCheckItem: unavailable,
    onDeleteCheckItem: unavailable,
    onApplyModuleOwner: unavailable,
    onImportLibraryItems: async (module, entryIds) => {
      const result = await api.importLibraryItems(selectedId, module.id, entryIds);
      await reload();
      return result;
    },
    onDisableModule: async module => {
      const result = await api.disableProjectModule(selectedId, module.id);
      await reload();
      return result.disabledCount;
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
async function openPhaseDrawer(name) {
  await click(byAria(`配置阶段 ${name}`));
  await until(() => {
    const dialog = dialogByTitle(`项目阶段 · ${name}`);
    return dialog && fieldByLabel(dialog, '阶段名称').value === name;
  }, 'Phase drawer did not load the saved record');
  return dialogByTitle(`项目阶段 · ${name}`);
}

async function run(name, test) {
  const errorsBefore = consoleErrors.length;
  confirmCalls = [];
  confirmResult = false;
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

  await run('phase create: validation errors stay client-side without any write request', async () => {
    await mount();
    await click(byAria('新增项目阶段'));
    await until(() => Boolean(dialogByTitle('新增项目阶段')), '新增阶段抽屉未打开');
    const dialog = dialogByTitle('新增项目阶段');
    assert.ok(dialog.textContent.includes('创建后不建议修改'), '副标题说明阶段 Key 语义');
    assert.equal(maybeButton('删除阶段', dialog), null, '新增模式不展示删除入口');
    assert.ok(!dialog.textContent.includes('检查项迁移'), '新增模式不展示迁移工具');
    const writesBefore = backend.calls.filter(call => call.method !== 'GET').length;

    await typeInto(byAria('新增阶段 Key', dialog), '非法 key!');
    await typeInto(fieldByLabel(dialog, '阶段名称'), '预验收');
    await typeInto(fieldByLabel(dialog, '计划开始'), '2026-10-05');
    await typeInto(fieldByLabel(dialog, '计划结束'), '2026-10-15');
    await click(button('新增阶段', footerOf(dialog)));
    assert.ok(dialog.textContent.includes('阶段 Key 仅支持字母、数字、下划线与中划线'), '非法 Key 展示校验错误');

    await typeInto(byAria('新增阶段 Key', dialog), 'P1');
    await click(button('新增阶段', footerOf(dialog)));
    assert.ok(dialog.textContent.includes('已存在相同阶段 Key「P1」'), '重复 Key 前端预检拦截');

    await typeInto(byAria('新增阶段 Key', dialog), 'pre-accept');
    await typeInto(fieldByLabel(dialog, '阶段名称'), '');
    await click(button('新增阶段', footerOf(dialog)));
    assert.ok(dialog.textContent.includes('请填写阶段名称'), '空名称拦截');

    await typeInto(fieldByLabel(dialog, '阶段名称'), '预验收');
    await typeInto(fieldByLabel(dialog, '计划结束'), '');
    await click(button('新增阶段', footerOf(dialog)));
    assert.ok(dialog.textContent.includes('请填写阶段计划开始与计划结束日期'), '缺计划日期拦截');
    assert.equal(backend.calls.filter(call => call.method !== 'GET').length, writesBefore, '任何校验失败都不发写请求');
  });

  await run('phase create: valid draft posts nested phases route and switches the drawer to edit mode', async () => {
    await mount();
    await click(byAria('新增项目阶段'));
    await until(() => Boolean(dialogByTitle('新增项目阶段')), '新增阶段抽屉未打开');
    const dialog = dialogByTitle('新增项目阶段');
    await typeInto(byAria('新增阶段 Key', dialog), 'pre-accept');
    await typeInto(fieldByLabel(dialog, '阶段名称'), '预验收');
    await typeInto(fieldByLabel(dialog, '排序'), '15');
    await typeInto(fieldByLabel(dialog, '计划开始'), '2026-10-05');
    await typeInto(fieldByLabel(dialog, '计划结束'), '2026-10-15');
    await click(button('新增阶段', footerOf(dialog)));
    await until(() => dialogByTitle('项目阶段 · 预验收') && phaseRow('预验收'), '创建后抽屉应转入编辑模式且表格出现新阶段');
    const posts = backend.matching('POST', '/projects/7/phases/');
    assert.equal(posts.length, 1, '新增阶段只发一次请求');
    const body = JSON.parse(posts[0].body);
    assert.equal(body.phase_key, 'pre-accept');
    assert.equal(body.name, '预验收');
    assert.equal(body.sort_order, 15);
    assert.equal(body.planned_start, '2026-10-05');
    assert.equal(body.planned_end, '2026-10-15');
    assert.equal(body.is_enabled, true);
    const editDialog = dialogByTitle('项目阶段 · 预验收');
    assert.ok(editDialog.textContent.includes('Key pre-accept · 0 项检查配置'), '编辑模式副标题展示新 Key');
    assert.equal(maybeButton('阶段 Key', editDialog), null);
    assert.equal([...editDialog.querySelectorAll('label')].some(label => label.querySelector('.field-label')?.textContent.trim() === '阶段 Key'), false, '编辑模式不展示阶段 Key 输入');
    assert.ok(button('删除阶段', editDialog), '自定义阶段（无检查项）可删除');
    await click(button('取消', footerOf(editDialog)));
    await until(() => !dialogByTitle('项目阶段'), '干净状态取消直接关闭');
  });

  await run('phase drawer: protected phase explains why delete is unavailable', async () => {
    await mount();
    const dialog = await openPhaseDrawer('冲压阶段');
    assert.equal(maybeButton('删除阶段', dialog), null, '受保护阶段不展示删除按钮');
    assert.ok(dialog.textContent.includes('该阶段暂不可删除'), '展示删除语义说明');
    assert.ok(dialog.textContent.includes('检查项迁移'), '说明指向迁移工具');
    await click(button('取消', footerOf(dialog)));
    await until(() => !dialogByTitle('项目阶段'), '抽屉应关闭');
  });

  await run('module panel: stats, library import with per-entry skips and message feedback', async () => {
    await mount();
    const statsRow = moduleRow('尺寸检测');
    assert.ok(statsRow.textContent.includes('启用 2 · 停用 0 · 完成 0'), '模块行展示启用/停用/完成统计');
    await click(byAria('从检查项库导入到模块 外观检测'));
    await until(() => dialogByTitle('从检查项库选择') && dialogByTitle('从检查项库选择').textContent.includes('冲压首件确认'), '库条目选择抽屉未加载');
    const picker = dialogByTitle('从检查项库选择');
    assert.ok(picker.textContent.includes('显示全部阶段的启用条目'), '项目级导入不限制阶段');
    assert.ok(!picker.textContent.includes('已停用库条目'), '停用条目不进入选择列表');
    for (const title of ['冲压首件确认', '缺失阶段条目', '漆膜厚度检测']) {
      await click(byAria(`选择检查项 ${title}`, picker));
    }
    await click(button('添加所选', footerOf(picker)));
    await until(() => !dialogByTitle('从检查项库选择') && container().textContent.includes('已从检查项库为模块「外观检测」导入 1 个检查项'), '导入完成后应关闭抽屉并反馈结果');
    assert.ok(container().textContent.includes('跳过 2 条'), '消息汇总跳过数量');
    const imports = backend.matching('POST', '/projects/7/import-library-items/');
    assert.equal(imports.length, 1, '导入只发一次请求');
    const body = JSON.parse(imports[0].body);
    assert.equal(body.module, 82);
    assert.deepEqual(body.entry_ids, [301, 302, 303]);
    const created = [...backend.checkItems.values()].find(item => item.title === '冲压首件确认');
    assert.ok(created, '导入生成检查项');
    assert.equal(String(created.module), '82', '导入归属所选模块');
    assert.equal(String(created.phase), '71', '按条目阶段 Key 落位 P1');
    assert.equal(created.planned_start, '2026-10-01', '计划日期取项目阶段窗口');
    assert.equal(created.metadata.default_source, 'LIBRARY');
    assert.equal(created.metadata.library_entry_id, 301);
    await until(() => {
      const row = moduleRow('外观检测');
      return row && row.textContent.includes('2 项') && row.textContent.includes('启用 2');
    }, '导入后模块统计未刷新');
  });

  await run('module exit: confirmation gates the request and only enabled in-scope items flip', async () => {
    await mount();
    await click(byAria('模块 尺寸检测 退出当前项目'));
    assert.equal(confirmCalls.length, 1, '退出项目需要确认');
    assert.ok(confirmCalls[0].includes('2 个启用检查项'), '确认文案展示影响范围');
    assert.equal(backend.matching('POST', '/projects/7/disable-module/').length, 0, '未确认前不发请求');
    confirmResult = true;
    await click(byAria('模块 尺寸检测 退出当前项目'));
    await until(() => container().textContent.includes('模块「尺寸检测」已退出当前项目：停用 2 个启用检查项'), '退出完成后应反馈停用数量');
    const disables = backend.matching('POST', '/projects/7/disable-module/');
    assert.equal(disables.length, 1);
    assert.equal(JSON.parse(disables[0].body).module, 81);
    assert.equal(backend.checkItems.get(901).is_enabled, false);
    assert.equal(backend.checkItems.get(902).is_enabled, false);
    assert.equal(backend.checkItems.get(903).is_enabled, true, '其他模块不受影响');
    await until(() => {
      const row = moduleRow('尺寸检测');
      return row && row.textContent.includes('启用 0 · 停用 2');
    }, '退出后模块统计未刷新');
  });

  await run('App config wiring (bounded AST): module panel renders picker and phase drawer gets onCreate', async () => {
    const source = ts.createSourceFile(appPath, await readFile(appPath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const view = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'BaseConfigView');
    assert.ok(view?.body, 'Inspect the actual BaseConfigView function');
    const rendered = new Set();
    let phaseDrawerHasOnCreate = false;
    function visit(node) {
      if (ts.isJsxSelfClosingElement(node) && ts.isIdentifier(node.tagName)) {
        const name = node.tagName.text;
        rendered.add(name);
        if (name === 'PhaseConfigDrawer') {
          phaseDrawerHasOnCreate = node.attributes.properties.some(item => ts.isJsxAttribute(item) && item.name.getText(source) === 'onCreate');
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(view.body);
    assert.ok(rendered.has('LibraryEntryPickerDrawer'), 'BaseConfigView 必须挂载库条目选择抽屉');
    assert.ok(phaseDrawerHasOnCreate, 'PhaseConfigDrawer 必须接收 onCreate');
  });

  process.stdout.write(`${passed} project maintenance regression groups passed (real React DOM + services; wiring checked by bounded AST).\n`);
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
