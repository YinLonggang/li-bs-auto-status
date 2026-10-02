import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, extname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

// Module delete-unblock suite: mounts the real ProjectTemplateView with the real
// service layer against an in-memory API. Covers the module drawer's reference
// list (global counts, per-project grouping, source badges), migrate all/selected
// flows with confirm gating, per-row delete gating, read-only visibility, the
// jump-to-project-side entry, and bounded AST wiring of the App container.
const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const appPath = resolve(root, 'src/App.tsx');
const apiOrigin = 'https://api.module-refs.example.test';
const prefix = '/api/li-bs-auto-status/v1';
const outputDir = await mkdtemp(resolve(tmpdir(), 'auto-status-module-refs-'));
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://spa.module-refs.example.test', pretendToBeVisual: true
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
let jumpCalls;
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
  const allowed = url.origin === apiOrigin && url.pathname.startsWith(`${prefix}/`);
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
// Container-level save flows resolve through microtask gaps between polling act()s;
// filter exactly that hygiene warning, keep every other console error fatal.
const isActWarning = args => args.some(arg => typeof arg === 'string' && arg.includes('was not wrapped in act('));
console.error = (...args) => {
  if (!isActWarning(args)) consoleErrors.push(args);
  if (process.env.MODULE_REFS_DEBUG) originalConsoleError(args.map(String).join(' ').slice(0, 400));
};

async function compile(path) {
  if (compiled.has(path)) return compiled.get(path);
  const outputPath = resolve(outputDir, `${compiled.size}.mjs`);
  compiled.set(path, outputPath);
  let source = (await readFile(path, 'utf8')).replaceAll('import.meta.env', `({ VITE_BASE_API: ${JSON.stringify(apiOrigin)} })`);
  if (path === appPath) source += '\nexport { ProjectTemplateView };\n';
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

const phaseDefinitionWire = (key, name, sortOrder) => ({
  key, name, description: '', sort_order: sortOrder,
  planned_start: null, planned_end: null, duration_days: null, metadata: {}
});
const phaseTemplateWire = (id, code, name, overrides = {}) => ({
  id, code, name, version: 1, description: '', sequence: id, is_active: true,
  phase_definitions: [phaseDefinitionWire('design', '设计阶段', 10), phaseDefinitionWire('ppv', 'PPV阶段', 20)],
  metadata: {}, ...overrides
});
const moduleWire = (id, code, name, sortOrder) => ({
  id, code, name, description: '', sort_order: sortOrder, is_active: true,
  owner_display_name: '', owner_name: '', owner_idaas_id: '', owner_email: '',
  metadata: { owners: [] }
});
const checklistWire = (id, phaseTemplateId, moduleId, phaseKey, code, overrides = {}) => ({
  id, code, name: code, module: moduleId, phase_template: phaseTemplateId, phase_key: phaseKey,
  version: 1, is_active: true, items: [], metadata: {}, ...overrides
});
const checkItemWire = (id, moduleId, title, overrides = {}) => ({
  id, project: 7, moduleId, title, status: 'pending',
  phase_key: 'design', phase_name: '设计阶段',
  is_enabled: true, can_delete: true, source: '', ...overrides
});

class MemoryApi {
  calls = [];
  unexpectedRequests = [];
  phaseTemplates = new Map();
  modules = new Map();
  checklists = new Map();
  checkItems = new Map();
  nextMigrateError = null;

  seedDefaults() {
    this.phaseTemplates.set(61, phaseTemplateWire(61, 'TPL-DEFAULT', '默认项目模板'));
    this.modules.set(81, moduleWire(81, 'MOD-A', '尺寸检测', 1));
    this.modules.set(82, moduleWire(82, 'MOD-B', '外观检测', 2));
    this.modules.set(83, moduleWire(83, 'MOD-C', '电气检测', 3));
    this.checklists.set(301, checklistWire(301, 61, 81, 'design', 'TPL-DEFAULT-MOD-A-design'));
    // 模块 81 的引用覆盖：两个项目 × 模板来源（仅可迁移）/库来源/手动/已停用。
    this.checkItems.set(1001, checkItemWire(1001, 81, '机器人程序核对', {
      source: 'MODULES.items', can_delete: false
    }));
    this.checkItems.set(1002, checkItemWire(1002, 81, '尺寸链抽检', {
      phase_key: 'ppv', phase_name: 'PPV阶段', source: 'LIBRARY'
    }));
    this.checkItems.set(1003, checkItemWire(1003, 81, '焊点间距抽检', { project: 8 }));
    this.checkItems.set(1004, checkItemWire(1004, 81, '旧涂装检查', {
      project: 8, phase_key: 'ppv', phase_name: 'PPV阶段', source: 'LIBRARY', is_enabled: false
    }));
  }

  matching(method, pattern) {
    return this.calls.filter(call => call.method === method && pattern.test(call.path));
  }

  referencesPayload(row) {
    const items = [...this.checkItems.values()].filter(item => Number(item.moduleId) === row.id);
    const templates = [...this.checklists.values()].filter(item => Number(item.module) === row.id);
    return {
      counts: {
        check_items: items.length,
        check_items_enabled: items.filter(item => item.is_enabled !== false).length,
        check_items_disabled: items.filter(item => item.is_enabled === false).length,
        checklist_templates: templates.length
      },
      check_items: items.map(item => ({
        id: item.id,
        project: { id: item.project, code: `P-${item.project}`, name: `项目 P${item.project}` },
        phase: { id: null, phase_key: item.phase_key ?? '', name: item.phase_name ?? '' },
        title: item.title,
        status: item.status ?? 'pending',
        is_enabled: item.is_enabled !== false,
        can_delete: item.can_delete !== false,
        source: item.source ?? ''
      })),
      checklist_templates: templates.map(item => ({
        id: item.id, code: item.code, name: item.name, phase_template_id: item.phase_template
      }))
    };
  }

  async fetch(url, init) {
    const method = init.method || 'GET';
    const path = url.pathname.slice(prefix.length);
    const call = { method, path, url, body: typeof init.body === 'string' ? init.body : '' };
    this.calls.push(call);
    if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    if (path === '/phase-templates/' && method === 'GET') {
      return json(page([...this.phaseTemplates.values()].map(clone)));
    }
    if (path === '/inspection-modules/' && method === 'GET') {
      return json(page([...this.modules.values()].map(clone)));
    }
    let match = path.match(/^\/inspection-modules\/(\d+)\/references\/$/);
    if (match && method === 'GET') {
      const row = this.modules.get(Number(match[1]));
      if (!row) return json({ detail: '检查模块不存在。' }, 404);
      return json(this.referencesPayload(row));
    }
    match = path.match(/^\/inspection-modules\/(\d+)\/migrate-check-items\/$/);
    if (match && method === 'POST') {
      const row = this.modules.get(Number(match[1]));
      if (!row) return json({ detail: '检查模块不存在。' }, 404);
      if (this.nextMigrateError) {
        const failure = this.nextMigrateError;
        this.nextMigrateError = null;
        return json(failure.payload, failure.status);
      }
      const payload = JSON.parse(call.body);
      const targetId = Number(payload.target_module);
      if (!this.modules.has(targetId)) return json({ target_module: ['目标模块不存在。'] }, 400);
      if (targetId === row.id) return json({ target_module: ['目标模块不能是当前模块。'] }, 400);
      let items = [...this.checkItems.values()].filter(item => Number(item.moduleId) === row.id);
      if (Array.isArray(payload.item_ids)) {
        const wanted = new Set(payload.item_ids.map(Number));
        const foreign = payload.item_ids.filter(id => !items.some(item => item.id === Number(id)));
        if (foreign.length) return json({ item_ids: [`检查项 ${foreign.join('、')} 不属于当前模块。`] }, 400);
        items = items.filter(item => wanted.has(item.id));
      }
      for (const item of items) item.moduleId = targetId;
      const remaining = [...this.checkItems.values()].filter(item => Number(item.moduleId) === row.id).length;
      return json({ moved_count: items.length, remaining_count: remaining });
    }
    match = path.match(/^\/inspection-modules\/(\d+)\/$/);
    if (match) {
      const row = this.modules.get(Number(match[1]));
      if (!row) return json({ detail: '检查模块不存在。' }, 404);
      if (method === 'GET') return json({ data: clone(row) });
      if (method === 'DELETE') {
        const itemCount = [...this.checkItems.values()].filter(item => Number(item.moduleId) === row.id).length;
        if (itemCount) {
          return json({ detail: `检查模块「${row.name}」仍被 ${itemCount} 个项目检查项引用，无法删除。`, counts: { check_items: itemCount } }, 409);
        }
        const cascaded = [...this.checklists.values()].filter(item => Number(item.module) === row.id);
        for (const item of cascaded) this.checklists.delete(item.id);
        this.modules.delete(row.id);
        return new Response(null, { status: 204 });
      }
    }
    match = path.match(/^\/check-items\/(\d+)\/$/);
    if (match && method === 'DELETE') {
      const row = this.checkItems.get(Number(match[1]));
      if (!row) return json({ detail: '检查项不存在。' }, 404);
      this.checkItems.delete(row.id);
      return new Response(null, { status: 204 });
    }

    this.unexpectedRequests.push(`${method} ${path}`);
    throw new Error(`Unhandled in-memory API request: ${method} ${path}`);
  }
}

const container = () => document.getElementById('root');
const dialogs = () => [...container().querySelectorAll('[role="dialog"]')];
const dialogByTitle = title => dialogs().find(item => item.querySelector('header h2')?.textContent.includes(title));
const buttons = scope => [...scope.querySelectorAll('button')];
function button(text, scope = container()) {
  const found = buttons(scope).find(item => item.textContent.trim() === text);
  assert.ok(found, `Missing button ${text}`);
  return found;
}
function byAria(label, scope = container()) {
  const found = scope.querySelector(`[aria-label="${label}"]`);
  assert.ok(found, `Missing aria-label target ${label}`);
  return found;
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
    const prototype = input.tagName === 'SELECT'
      ? dom.window.HTMLSelectElement.prototype
      : input.tagName === 'INPUT'
        ? dom.window.HTMLInputElement.prototype
        : dom.window.HTMLTextAreaElement.prototype;
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
  if (!predicate() && process.env.MODULE_REFS_DEBUG) {
    originalConsoleError('DIALOGS:', JSON.stringify(dialogs().map(d => d.querySelector('header h2')?.textContent)));
    originalConsoleError('CALLS:', JSON.stringify(backend?.calls.map(c => `${c.method} ${c.path}`)));
    originalConsoleError('BODY:', container().textContent.slice(0, 1500));
  }
  assert.ok(predicate(), message);
}

const snapshot = () => ({
  phaseTemplates: [...backend.phaseTemplates.values()].map(row => ({
    id: row.id, code: row.code, name: row.name, version: row.version, description: row.description,
    sequence: row.sequence ?? row.id, isActive: row.is_active, defaultGoal: row.description,
    phaseDefinitions: (row.phase_definitions ?? []).map(definition => ({
      key: definition.key, name: definition.name, description: definition.description,
      sortOrder: definition.sort_order, plannedStart: definition.planned_start,
      plannedEnd: definition.planned_end, durationDays: definition.duration_days,
      metadata: definition.metadata ?? {}
    })),
    metadata: row.metadata ?? {}
  })),
  inspectionModules: [...backend.modules.values()].map(row => ({
    id: row.id, code: row.code, name: row.name, description: row.description,
    sequence: row.sort_order, isActive: row.is_active, owners: [], metadata: row.metadata ?? {}
  })),
  checklistTemplates: [...backend.checklists.values()].map(row => ({
    id: row.id, moduleId: row.module, phaseTemplateId: row.phase_template, phaseKey: row.phase_key,
    code: row.code, name: row.name, title: row.name, version: row.version, isActive: row.is_active,
    severity: 'medium', items: [], metadata: row.metadata ?? {}
  })),
  checkItems: [...backend.checkItems.values()].map(clone),
  ownerCandidates: []
});

function viewProps(canWrite = true) {
  return {
    data,
    canWrite,
    onCreatePhaseTemplate: async () => { throw new Error('not used'); },
    onUpdatePhaseTemplate: async () => { throw new Error('not used'); },
    onDeletePhaseTemplate: async () => { throw new Error('not used'); },
    onCopyPhaseTemplate: async () => { throw new Error('not used'); },
    onCreateChecklistTemplate: async () => { throw new Error('not used'); },
    onDeleteChecklistTemplate: async () => { throw new Error('not used'); },
    onUpdateChecklistTemplate: async () => { throw new Error('not used'); },
    onSetChecklistTemplateItems: async () => { throw new Error('not used'); },
    onCreateInspectionModule: async () => { throw new Error('not used'); },
    onUpdateInspectionModule: async () => { throw new Error('not used'); },
    onDeleteInspectionModule: async module => {
      await api.deleteInspectionModule(module.id);
      await reload();
    },
    onDeleteModuleReferenceItem: async item => {
      await api.deleteCheckItem(item.id);
      await reload();
    },
    onJumpToProjectCheckItems: module => { jumpCalls.push(module); }
  };
}

async function render(canWrite) {
  await act(async () => { renderer.render(React.createElement(views.ProjectTemplateView, viewProps(canWrite))); });
}
async function reload() {
  data = snapshot();
  if (renderer) await render(lastCanWrite);
}
let lastCanWrite = true;
async function mount(canWrite = true) {
  lastCanWrite = canWrite;
  backend = new MemoryApi();
  backend.seedDefaults();
  data = snapshot();
  jumpCalls = [];
  renderer = createRoot(container());
  await render(canWrite);
  await until(() => container().textContent.includes('项目模板源数据') && container().textContent.includes('模块 × 阶段矩阵'), 'Template view did not settle');
}
async function openModuleDrawer(name) {
  await click(byAria(`维护检查模块 ${name}`));
  await until(() => Boolean(dialogByTitle(`检查模块 · ${name}`)), `Module drawer did not open for ${name}`);
  const dialog = dialogByTitle(`检查模块 · ${name}`);
  await until(() => !dialog.textContent.includes('正在加载引用明细'), 'References must finish loading');
  return dialogByTitle(`检查模块 · ${name}`);
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

  await run('references: global counts, per-project grouping and source badges render', async () => {
    await mount();
    const dialog = await openModuleDrawer('尺寸检测');
    assert.ok(
      backend.matching('GET', /\/inspection-modules\/81\/references\/$/).length >= 1,
      'Drawer must self-fetch the references endpoint'
    );
    assert.ok(dialog.textContent.includes('共 4 个检查项（启用 3 / 停用 1）· 1 组清单模板'), 'Global counts must include every project and disabled items');
    assert.ok(dialog.textContent.includes('项目 P7（P-7）· 2 项'), 'Project A group header missing');
    assert.ok(dialog.textContent.includes('项目 P8（P-8）· 2 项'), 'Project B group header missing');
    for (const title of ['机器人程序核对', '尺寸链抽检', '焊点间距抽检', '旧涂装检查']) {
      assert.ok(dialog.textContent.includes(title), `Reference row ${title} must render`);
    }
    assert.ok(dialog.textContent.includes('仅可迁移'), 'Template-source item must carry the migrate-only badge');
    assert.ok(dialog.textContent.includes('已停用'), 'Disabled item must carry the disabled badge');
    assert.ok(dialog.textContent.includes('模板导入') && dialog.textContent.includes('检查项库') && dialog.textContent.includes('手动创建'), 'Source labels must distinguish template/library/manual');
    assert.ok(!dialog.textContent.includes('或停用'), 'The misleading disable-to-unblock copy must be gone');
    // 逐行删除只开放给 can_delete 项：模板来源项没有删除按钮，其余三项有。
    assert.equal(dialog.querySelectorAll('[aria-label^="删除检查项 "]').length, 3, 'Only deletable items get a per-row delete button');
    assert.ok(!dialog.querySelector('[aria-label="删除检查项 机器人程序核对"]'), 'Template-source item must not offer delete');
    assert.ok(dialog.textContent.includes('仍被 4 个项目检查项引用，无法删除'), 'Delete gate note must surface the global count');
    assert.ok(button('删除模块', dialog).disabled, 'Delete stays disabled while references exist');
  });

  await run('migrate all: confirm gating, POST body, refresh and delete unlock', async () => {
    await mount();
    let dialog = await openModuleDrawer('尺寸检测');
    assert.ok(button('迁移全部（4）', dialog).disabled, 'Migrate-all stays disabled until a target module is chosen');
    await typeInto(byAria('迁移目标模块', dialog), '82');
    dialog = dialogByTitle('检查模块 · 尺寸检测');
    assert.ok(!button('迁移全部（4）', dialog).disabled, 'Target selection enables migrate-all');

    // 拒绝确认：不发请求。
    await click(button('迁移全部（4）', dialog));
    assert.equal(backend.matching('POST', /migrate-check-items\/$/).length, 0, 'Declined confirm must not POST');

    confirmResult = true;
    await click(button('迁移全部（4）', dialogByTitle('检查模块 · 尺寸检测')));
    await until(() => backend.matching('POST', /migrate-check-items\/$/).length === 1, 'Confirmed migrate-all must POST once');
    const migrateCall = backend.matching('POST', /migrate-check-items\/$/)[0];
    assert.equal(migrateCall.path, '/inspection-modules/81/migrate-check-items/');
    const payload = JSON.parse(migrateCall.body);
    assert.equal(payload.target_module, 82);
    assert.ok(!('item_ids' in payload), 'Migrate-all must omit item_ids');
    assert.ok(confirmCalls.some(message => message.includes('全部 4 个引用检查项') && message.includes('外观检测')), 'Confirm must state scope and target');

    await until(() => {
      const current = dialogByTitle('检查模块 · 尺寸检测');
      return current && current.textContent.includes('无项目检查项引用，模块可删除');
    }, 'References must refetch and clear after migration');
    dialog = dialogByTitle('检查模块 · 尺寸检测');
    assert.ok(!button('删除模块', dialog).disabled, 'Delete unlocks at zero references');
    assert.ok(!dialog.textContent.includes('个项目检查项引用，无法删除'), 'Gate note must clear');

    // 闭环：迁移清零后直接删除模块，级联其清单模板。
    await click(button('删除模块', dialog));
    await until(() => backend.matching('DELETE', /\/inspection-modules\/81\/$/).length === 1, 'Module delete must issue DELETE');
    assert.ok(confirmCalls.some(message => message.includes('级联删除其下 1 组清单模板')), 'Delete confirm must mention the checklist cascade');
    await until(() => !container().textContent.includes('尺寸检测'), 'Module row must disappear after delete');
    assert.equal(backend.checklists.has(301), false, 'Cascade must drop the module checklist templates');
  });

  await run('migrate selected: subset POST carries item_ids; server 400 surfaces and keeps state', async () => {
    await mount();
    let dialog = await openModuleDrawer('尺寸检测');
    assert.ok(button('迁移所选（0）', dialog).disabled, 'Migrate-selected disabled without selection');
    await click(byAria('选择检查项 机器人程序核对', dialog));
    await click(byAria('选择检查项 焊点间距抽检', dialogByTitle('检查模块 · 尺寸检测')));
    dialog = dialogByTitle('检查模块 · 尺寸检测');
    assert.ok(button('迁移所选（2）', dialog).disabled, 'Selection alone must not enable migrate without target');
    await typeInto(byAria('迁移目标模块', dialog), '83');
    confirmResult = true;
    await click(button('迁移所选（2）', dialogByTitle('检查模块 · 尺寸检测')));
    await until(() => backend.matching('POST', /migrate-check-items\/$/).length === 1, 'Migrate-selected must POST');
    const payload = JSON.parse(backend.matching('POST', /migrate-check-items\/$/)[0].body);
    assert.equal(payload.target_module, 83);
    assert.deepEqual(payload.item_ids.sort(), [1001, 1003], 'Subset migration must carry exactly the selected ids');

    await until(() => {
      const current = dialogByTitle('检查模块 · 尺寸检测');
      return current && current.textContent.includes('共 2 个检查项');
    }, 'References must refetch after subset migration');
    dialog = dialogByTitle('检查模块 · 尺寸检测');
    assert.ok(!dialog.textContent.includes('机器人程序核对'), 'Migrated template-source item must leave the list');
    assert.ok(dialog.textContent.includes('仍被 2 个项目检查项引用，无法删除'), 'Gate note must track the remaining count');

    // 服务端 400（字段级 payload）必须透传到抽屉，且引用清单保持原状。
    backend.nextMigrateError = { status: 400, payload: { item_ids: ['检查项 1009 不属于当前模块。'] } };
    await typeInto(byAria('迁移目标模块', dialog), '82');
    await click(button('迁移全部（2）', dialogByTitle('检查模块 · 尺寸检测')));
    await until(() => {
      const current = dialogByTitle('检查模块 · 尺寸检测');
      return current && current.textContent.includes('检查项 1009 不属于当前模块。');
    }, 'Field-level 400 message must surface in the drawer');
    dialog = dialogByTitle('检查模块 · 尺寸检测');
    assert.ok(dialog.textContent.includes('共 2 个检查项'), 'Failed migration must not change the reference list');
    assert.ok(button('删除模块', dialog).disabled, 'Delete stays disabled after a failed migration');
    assert.equal(backend.checkItems.get(1002).moduleId, 81, 'Server-side rows must stay put on 400');
  });

  await run('per-row delete: deletes a deletable item, refreshes and updates the gate', async () => {
    await mount();
    let dialog = await openModuleDrawer('尺寸检测');
    const deleteButton = byAria('删除检查项 焊点间距抽检', dialog);
    await click(deleteButton);
    assert.equal(backend.matching('DELETE', /\/check-items\/1003\/$/).length, 0, 'Declined confirm must not DELETE');
    confirmResult = true;
    await click(byAria('删除检查项 焊点间距抽检', dialogByTitle('检查模块 · 尺寸检测')));
    await until(() => backend.matching('DELETE', /\/check-items\/1003\/$/).length === 1, 'Per-row delete must DELETE the check item');
    assert.ok(confirmCalls.some(message => message.includes('焊点间距抽检') && message.includes('项目 P8')), 'Delete confirm must identify item and project');
    await until(() => {
      const current = dialogByTitle('检查模块 · 尺寸检测');
      return current && current.textContent.includes('共 3 个检查项');
    }, 'References must refetch after per-row delete');
    dialog = dialogByTitle('检查模块 · 尺寸检测');
    assert.ok(!dialog.textContent.includes('焊点间距抽检'), 'Deleted row must disappear');
    assert.ok(dialog.textContent.includes('仍被 3 个项目检查项引用，无法删除'), 'Gate note must track the new count');
    assert.ok(dialog.textContent.includes('项目 P8（P-8）· 1 项'), 'Project B group must shrink to one item');
  });

  await run('readonly: references stay visible while every action is hidden', async () => {
    await mount(false);
    const dialog = await openModuleDrawer('尺寸检测');
    assert.ok(dialog.textContent.includes('共 4 个检查项'), 'Readonly users still see the reference list');
    assert.ok(dialog.textContent.includes('项目 P7（P-7）· 2 项'), 'Readonly grouping must render');
    assert.equal(dialog.querySelectorAll('[aria-label^="选择检查项 "]').length, 0, 'Readonly hides selection checkboxes');
    assert.equal(dialog.querySelectorAll('[aria-label^="删除检查项 "]').length, 0, 'Readonly hides per-row delete');
    assert.equal(dialog.querySelectorAll('[aria-label="迁移目标模块"]').length, 0, 'Readonly hides the migrate bar');
    assert.ok(!buttons(dialog).some(item => item.textContent.trim() === '去项目侧新增检查项'), 'Readonly hides the jump-to-project action');
    assert.ok(!buttons(dialog).some(item => item.textContent.trim() === '删除模块'), 'Readonly hides module delete');
  });

  await run('jump: 去项目侧新增检查项 delegates to the App handler with the module', async () => {
    await mount();
    const dialog = await openModuleDrawer('尺寸检测');
    await click(button('去项目侧新增检查项', dialog));
    assert.equal(jumpCalls.length, 1, 'Jump button must fire the App-level handler once');
    assert.equal(jumpCalls[0].id, 81, 'Jump must carry the current module');
    assert.equal(jumpCalls[0].code, 'MOD-A');
  });

  await run('wiring: App container passes real services and consumes the jump in BaseConfigView', async () => {
    const appSource = await readFile(appPath, 'utf8');
    assert.ok(!appSource.includes('moduleDrawerCheckItemCount'), 'Workspace-derived module drawer counts must be removed');
    assert.ok(!appSource.includes('moduleDrawerChecklistCount'), 'Workspace-derived checklist counts must be removed');
    assert.ok(!appSource.includes('迁移到其他模块或停用'), 'The misleading disable-to-unblock copy must be gone from App');
    assert.ok(appSource.includes('onFetchReferences={fetchModuleReferences}'), 'Drawer must receive the real references fetcher');
    assert.ok(appSource.includes('onMigrateCheckItems={migrateModuleCheckItems}'), 'Drawer must receive the real migrate service');
    assert.ok(appSource.includes('onDeleteModuleReferenceItem={handleDeleteModuleReferenceItem}'), 'Per-row delete must flow through the App handler');
    assert.ok(appSource.includes('onJumpToProjectCheckItems={handleJumpToProjectCheckItems}'), 'Jump entry must flow through the App handler');
    assert.ok(appSource.includes("setCurrentView('baseConfig')"), 'Jump must switch to the project-side view');
    assert.ok(appSource.includes('pendingCheckItemModuleId={pendingMatrixCellModuleId}'), 'BaseConfigView must receive the pending module id');
    assert.ok(appSource.includes('setMatrixCell({ moduleId: pendingCheckItemModuleId'), 'BaseConfigView must open the matrix cell for the jumped module');
    const apiSource = await readFile(resolve(root, 'src/services/bsAutoStatusApi.ts'), 'utf8');
    assert.ok(apiSource.includes('/references/'), 'Service must expose the references endpoint');
    assert.ok(apiSource.includes('/migrate-check-items/'), 'Service must expose the migrate endpoint');
  });

  process.stdout.write(`${passed} module reference scenarios passed\n`);
} finally {
  if (renderer) await act(async () => { renderer.unmount(); });
  dom.window.close();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  await rm(outputDir, { recursive: true, force: true });
}
