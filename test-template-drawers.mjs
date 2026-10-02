import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, extname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

// Template-center drawer regression suite: mounts the real ProjectTemplateView with
// the real service layer against an in-memory API. Covers the phase template drawer
// (edit/save/copy), the inspection module drawer (delete gate + cascade), and the
// checklist template drawer (library picker, set-items, cell-targeted creation).
const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const appPath = resolve(root, 'src/App.tsx');
const apiOrigin = 'https://api.template.example.test';
const prefix = '/api/li-bs-auto-status/v1';
const outputDir = await mkdtemp(resolve(tmpdir(), 'auto-status-template-drawers-'));
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://spa.template.example.test', pretendToBeVisual: true
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
  if (process.env.TEMPLATE_DRAWER_DEBUG) originalConsoleError(args.map(String).join(' ').slice(0, 400));
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
const linkWire = (linkId, entry, sortOrder, overrides = {}) => ({
  link_id: linkId, entry_id: entry.id, phase_key: entry.phase_key, title: entry.title,
  description: entry.description, priority: entry.priority, sort_order: sortOrder,
  is_enabled: true, entry_is_active: entry.is_active, metadata: {}, ...overrides
});
const checklistWire = (id, phaseTemplateId, moduleId, phaseKey, code, items = [], overrides = {}) => ({
  id, code, name: code, module: moduleId, phase_template: phaseTemplateId, phase_key: phaseKey,
  version: 1, is_active: true, items, metadata: {}, ...overrides
});
const libraryEntryWire = (id, phaseKey, title, overrides = {}) => ({
  id, phase_key: phaseKey, title, description: `${title}说明`, priority: 'P1', sort_order: id * 10,
  is_active: true, linked_template_count: 0, metadata: {}, ...overrides
});
const checkItemWire = (id, moduleId, title) => ({
  id, project: 7, moduleId: moduleId, title, status: 'pending'
});

class MemoryApi {
  calls = [];
  unexpectedRequests = [];
  phaseTemplates = new Map();
  modules = new Map();
  checklists = new Map();
  libraryEntries = new Map();
  checkItems = new Map();
  nextPhaseTemplateId = 700;
  nextModuleId = 800;
  nextChecklistId = 900;
  nextLinkId = 5000;

  seedDefaults() {
    this.phaseTemplates.set(61, phaseTemplateWire(61, 'TPL-DEFAULT', '默认项目模板'));
    this.modules.set(81, moduleWire(81, 'MOD-A', '尺寸检测', 1));
    this.modules.set(82, moduleWire(82, 'MOD-B', '外观检测', 2));
    this.libraryEntries.set(501, libraryEntryWire(501, 'design', '尺寸链校核'));
    this.libraryEntries.set(502, libraryEntryWire(502, 'design', '定位基准检查'));
    this.libraryEntries.set(503, libraryEntryWire(503, 'ppv', '焊点间距检查'));
    this.libraryEntries.set(504, libraryEntryWire(504, 'design', '停用的旧条目', { is_active: false }));
    this.libraryEntries.get(501).linked_template_count = 1;
    this.checklists.set(301, checklistWire(301, 61, 81, 'design', 'TPL-DEFAULT-MOD-A-design', [
      linkWire(9001, this.libraryEntries.get(501), 10)
    ]));
    this.checklists.set(302, checklistWire(302, 61, 82, 'ppv', 'TPL-DEFAULT-MOD-B-ppv'));
    this.checkItems.set(1001, checkItemWire(1001, 81, '引用模块A的项目检查项'));
  }

  matching(method, pattern) {
    return this.calls.filter(call => call.method === method && pattern.test(call.path));
  }

  rebuildLinks(checklist, items) {
    return items.map((item, index) => {
      const entry = this.libraryEntries.get(Number(item.entry_id));
      return linkWire(this.nextLinkId += 1, entry, item.sort_order ?? (index + 1) * 10, {
        is_enabled: item.is_enabled ?? true
      });
    });
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
    if (path === '/phase-templates/' && method === 'POST') {
      const payload = JSON.parse(call.body);
      const row = phaseTemplateWire(this.nextPhaseTemplateId += 1, payload.code, payload.name, {
        version: payload.version ?? 1,
        description: payload.description ?? '',
        is_active: payload.is_active ?? true,
        phase_definitions: payload.phase_definitions ?? [],
        metadata: payload.metadata ?? {}
      });
      this.phaseTemplates.set(row.id, row);
      return json({ data: clone(row) }, 201);
    }
    let match = path.match(/^\/phase-templates\/(\d+)\/$/);
    if (match) {
      const row = this.phaseTemplates.get(Number(match[1]));
      if (!row) return json({ detail: '项目模板源数据不存在。' }, 404);
      if (method === 'GET') return json({ data: clone(row) });
      if (method === 'PATCH') {
        const payload = JSON.parse(call.body);
        Object.assign(row, payload);
        return json(clone(row));
      }
      if (method === 'DELETE') {
        this.phaseTemplates.delete(row.id);
        return new Response(null, { status: 204 });
      }
    }

    if (path === '/inspection-modules/' && method === 'GET') {
      return json(page([...this.modules.values()].map(clone)));
    }
    if (path === '/inspection-modules/' && method === 'POST') {
      const payload = JSON.parse(call.body);
      const row = moduleWire(this.nextModuleId += 1, payload.code, payload.name, payload.sort_order ?? 0);
      row.description = payload.description ?? '';
      row.is_active = payload.is_active ?? true;
      row.metadata = payload.metadata ?? { owners: [] };
      this.modules.set(row.id, row);
      return json({ data: clone(row) }, 201);
    }
    match = path.match(/^\/inspection-modules\/(\d+)\/references\/$/);
    if (match && method === 'GET') {
      const row = this.modules.get(Number(match[1]));
      if (!row) return json({ detail: '检查模块不存在。' }, 404);
      const items = [...this.checkItems.values()].filter(item => Number(item.moduleId) === row.id);
      const templates = [...this.checklists.values()].filter(item => Number(item.module) === row.id);
      return json({
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
      });
    }
    match = path.match(/^\/inspection-modules\/(\d+)\/migrate-check-items\/$/);
    if (match && method === 'POST') {
      const row = this.modules.get(Number(match[1]));
      if (!row) return json({ detail: '检查模块不存在。' }, 404);
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
      if (method === 'PATCH') {
        Object.assign(row, JSON.parse(call.body));
        return json({ data: clone(row) });
      }
      if (method === 'DELETE') {
        const itemCount = [...this.checkItems.values()].filter(item => Number(item.moduleId) === row.id).length;
        if (itemCount) {
          return json({
            detail: `检查模块「${row.name}」仍被 ${itemCount} 个项目检查项引用，无法删除。请先迁移或删除相关检查项。`,
            counts: { check_items: itemCount }
          }, 409);
        }
        const cascaded = [...this.checklists.values()].filter(item => Number(item.module) === row.id);
        for (const item of cascaded) this.checklists.delete(item.id);
        this.modules.delete(row.id);
        return new Response(null, { status: 204 });
      }
    }

    if (path === '/checklist-templates/' && method === 'POST') {
      const payload = JSON.parse(call.body);
      assert.ok(!('item_templates' in payload), 'Create payload must not carry legacy item_templates');
      const row = checklistWire(this.nextChecklistId += 1, Number(payload.phase_template), Number(payload.module), payload.phase_key, payload.code, [], {
        name: payload.name ?? payload.code,
        version: payload.version ?? 1,
        is_active: payload.is_active ?? true,
        metadata: payload.metadata ?? {}
      });
      this.checklists.set(row.id, row);
      return json(clone(row), 201);
    }
    match = path.match(/^\/checklist-templates\/(\d+)\/set-items\/$/);
    if (match && method === 'POST') {
      const row = this.checklists.get(Number(match[1]));
      if (!row) return json({ detail: '清单模板不存在。' }, 404);
      const payload = JSON.parse(call.body);
      const missing = payload.items.filter(item => !this.libraryEntries.has(Number(item.entry_id)));
      if (missing.length) return json({ detail: `检查项库条目不存在：${missing.map(item => item.entry_id).join('、')}` }, 400);
      const before = row.items.length;
      row.items = this.rebuildLinks(row, payload.items);
      return json({
        data: {
          template: clone(row),
          summary: { added: Math.max(0, row.items.length - before), removed: Math.max(0, before - row.items.length), kept: Math.min(before, row.items.length), total: row.items.length }
        }
      });
    }
    match = path.match(/^\/checklist-templates\/(\d+)\/$/);
    if (match) {
      const row = this.checklists.get(Number(match[1]));
      if (!row) return json({ detail: '清单模板不存在。' }, 404);
      // The dev backend renders bare objects (plain JSONRenderer, no envelope);
      // returning the raw row here guards the unwrap() items-collision regression.
      if (method === 'GET') return json(clone(row));
      if (method === 'PATCH') {
        const payload = JSON.parse(call.body);
        assert.ok(!('item_templates' in payload), 'Update payload must not carry legacy item_templates');
        Object.assign(row, payload);
        return json(clone(row));
      }
      if (method === 'DELETE') {
        this.checklists.delete(row.id);
        return new Response(null, { status: 204 });
      }
    }

    if (path === '/check-item-library/' && method === 'GET') {
      const phaseKey = url.searchParams.get('phase_key');
      const isActive = url.searchParams.get('is_active');
      const q = (url.searchParams.get('q') || '').trim();
      let rows = [...this.libraryEntries.values()];
      if (phaseKey) rows = rows.filter(item => item.phase_key === phaseKey);
      if (isActive === 'true') rows = rows.filter(item => item.is_active);
      if (isActive === 'false') rows = rows.filter(item => !item.is_active);
      if (q) rows = rows.filter(item => item.title.includes(q) || item.description.includes(q));
      return json(page(rows.map(clone)));
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
  if (!predicate() && process.env.TEMPLATE_DRAWER_DEBUG) {
    originalConsoleError('DIALOGS:', JSON.stringify(dialogs().map(d => d.querySelector('header h2')?.textContent)));
    originalConsoleError('CALLS:', JSON.stringify(backend?.calls.map(c => `${c.method} ${c.path}`)));
    originalConsoleError('BODY:', container().textContent.slice(0, 1200));
  }
  assert.ok(predicate(), message);
}

function cellDrawerTextIncludes(moduleName, phaseName, text) {
  const cell = dialogByTitle(`${moduleName} × ${phaseName}`);
  return Boolean(cell && cell.textContent.includes(text));
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
    severity: 'medium',
    items: (row.items ?? []).map(link => ({
      linkId: link.link_id, entryId: link.entry_id, phaseKey: link.phase_key, title: link.title,
      description: link.description, priority: link.priority, sortOrder: link.sort_order,
      isEnabled: link.is_enabled, entryIsActive: link.entry_is_active, metadata: link.metadata ?? {}
    })),
    metadata: row.metadata ?? {}
  })),
  checkItems: [...backend.checkItems.values()].map(clone),
  ownerCandidates: []
});

function viewProps() {
  return {
    data,
    canWrite: true,
    onCreatePhaseTemplate: async input => {
      const created = await api.createPhaseTemplate(input);
      await reload();
      return created;
    },
    onUpdatePhaseTemplate: async (template, input) => {
      const updated = await api.updatePhaseTemplate(template.id, input);
      await reload();
      return updated;
    },
    onDeletePhaseTemplate: async template => {
      for (const checklist of data.checklistTemplates.filter(item => String(item.phaseTemplateId) === String(template.id))) {
        await api.deleteChecklistTemplate(checklist.id);
      }
      await api.deletePhaseTemplate(template.id);
      await reload();
    },
    // Mirrors the App container copy flow: client-side create loop + set-items per checklist.
    onCopyPhaseTemplate: async template => {
      const copiedPhaseTemplate = await api.createPhaseTemplate({
        code: `${template.code}-draft`,
        name: `${template.name} 草稿`,
        version: template.version ?? 1,
        description: template.description ?? '',
        isActive: false,
        phaseDefinitions: template.phaseDefinitions ?? [],
        metadata: {}
      });
      for (const checklist of data.checklistTemplates.filter(item => String(item.phaseTemplateId) === String(template.id))) {
        const copied = await api.createChecklistTemplate({
          code: `${copiedPhaseTemplate.code}-${checklist.code}`,
          name: checklist.name || checklist.title,
          moduleId: checklist.moduleId,
          phaseTemplateId: copiedPhaseTemplate.id,
          phaseKey: checklist.phaseKey ?? '',
          version: checklist.version ?? 1,
          isActive: checklist.isActive !== false,
          metadata: {}
        });
        if (checklist.items?.length) {
          await api.setChecklistTemplateItems(copied.id, checklist.items.map((item, index) => ({
            entryId: item.entryId,
            sortOrder: item.sortOrder ?? (index + 1) * 10,
            isEnabled: item.isEnabled !== false
          })));
        }
      }
      await reload();
      return copiedPhaseTemplate;
    },
    onCreateChecklistTemplate: async input => {
      const created = await api.createChecklistTemplate(input);
      await reload();
      return created;
    },
    onUpdateChecklistTemplate: async (template, input) => {
      const updated = await api.updateChecklistTemplate(template.id, input);
      await reload();
      return updated;
    },
    onDeleteChecklistTemplate: async template => {
      await api.deleteChecklistTemplate(template.id);
      await reload();
    },
    onSetChecklistTemplateItems: async (template, items) => {
      const result = await api.setChecklistTemplateItems(template.id, items);
      await reload();
      return result.template;
    },
    onCreateInspectionModule: async input => {
      const created = await api.createInspectionModule(input);
      await reload();
      return created;
    },
    onUpdateInspectionModule: async (module, input) => {
      const updated = await api.updateInspectionModule(module.id, input);
      await reload();
      return updated;
    },
    onDeleteInspectionModule: async module => {
      await api.deleteInspectionModule(module.id);
      await reload();
    }
  };
}

async function render() {
  await act(async () => { renderer.render(React.createElement(views.ProjectTemplateView, viewProps())); });
}
async function reload() {
  data = snapshot();
  if (renderer) await render();
}
async function mount() {
  backend = new MemoryApi();
  backend.seedDefaults();
  data = snapshot();
  renderer = createRoot(container());
  await render();
  await until(() => container().textContent.includes('项目模板源数据') && container().textContent.includes('模块 × 阶段矩阵'), 'Template view did not settle');
}
async function openCellDrawer(moduleName, phaseName) {
  await click(byAria(`${moduleName} × ${phaseName} 清单配置`));
  await until(() => Boolean(dialogByTitle(`${moduleName} × ${phaseName}`)), 'Cell drawer did not open');
  return dialogByTitle(`${moduleName} × ${phaseName}`);
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

  await run('phase template drawer: loads the record, saves edits via PATCH and refreshes the list', async () => {
    await mount();
    await click(byAria('配置项目模板 默认项目模板'));
    await until(() => {
      const dialog = dialogByTitle('项目模板 · 默认项目模板');
      return dialog && fieldByLabel(dialog, '模板名称').value === '默认项目模板';
    }, 'Phase template drawer did not load the saved record');
    const dialog = dialogByTitle('项目模板 · 默认项目模板');
    assert.ok(backend.matching('GET', /\/phase-templates\/61\/$/).length >= 1, 'Drawer must retrieve the saved record');
    assert.ok(
      [...dialog.querySelectorAll('input')].some(input => input.value === '设计阶段'),
      'Phase definitions must render in the drawer'
    );
    const saveButton = button('保存模板', dialog);
    assert.ok(saveButton.disabled, 'Save stays disabled while the draft is clean');
    await typeInto(fieldByLabel(dialog, '模板名称'), '默认项目模板 v2');
    assert.ok(!button('保存模板', dialogByTitle('项目模板 · 默认项目模板')).disabled, 'Dirty drafts enable save');
    await click(button('保存模板', dialogByTitle('项目模板 · 默认项目模板')));
    await until(() => backend.matching('PATCH', /\/phase-templates\/61\/$/).length === 1, 'Save must PATCH the phase template');
    const patch = JSON.parse(backend.matching('PATCH', /\/phase-templates\/61\/$/)[0].body);
    assert.equal(patch.name, '默认项目模板 v2');
    assert.equal(patch.phase_definitions.length, 2);
    assert.equal(patch.phase_definitions[0].key, 'design');
    await until(() => container().textContent.includes('默认项目模板 v2'), 'List must refresh after save');
  });

  await run('module drawer: delete is gated by project check items and cascades checklists when clear', async () => {
    await mount();
    // Module 81 is referenced by a project check item: the drawer must show the gate.
    await click(byAria('维护检查模块 尺寸检测'));
    await until(() => Boolean(dialogByTitle('检查模块 · 尺寸检测')), 'Module drawer did not open for 尺寸检测');
    const gated = dialogByTitle('检查模块 · 尺寸检测');
    assert.ok(gated.textContent.includes('仍被 1 个项目检查项引用，无法删除'), 'Gate note must surface the reference count');
    const gatedDelete = button('删除模块', gated);
    assert.ok(gatedDelete.disabled, 'Delete must be disabled while check items reference the module');
    await click(button('取消', gated));
    await until(() => !dialogByTitle('检查模块 · 尺寸检测'), 'Gated drawer did not close');

    // Module 82 has one checklist template but no project check items: cascade delete proceeds.
    await click(byAria('维护检查模块 外观检测'));
    await until(() => Boolean(dialogByTitle('检查模块 · 外观检测')), 'Module drawer did not open for 外观检测');
    const clear = dialogByTitle('检查模块 · 外观检测');
    assert.ok(clear.textContent.includes('级联删除其下 1 组清单模板'), 'Cascade note must surface the checklist count');
    confirmResult = true;
    await click(button('删除模块', clear));
    await until(() => backend.matching('DELETE', /\/inspection-modules\/82\/$/).length === 1, 'Module delete must issue DELETE');
    assert.ok(confirmCalls[0].includes('级联删除其下 1 组清单模板'), 'Confirm text must mention the cascade');
    await until(() => !container().textContent.includes('外观检测'), 'Module row must disappear after delete');
    assert.equal(backend.checklists.has(302), false, 'Cascade must drop the module checklist templates');
  });

  await run('checklist drawer: library picker adds entries, removal works and save issues PATCH + set-items', async () => {
    await mount();
    const cell = await openCellDrawer('尺寸检测', '设计阶段');
    await click(byAria('编辑清单模板 TPL-DEFAULT-MOD-A-design', cell));
    await until(() => {
      const dialog = dialogByTitle('清单模板 · TPL-DEFAULT-MOD-A-design');
      return dialog && fieldByLabel(dialog, '清单编码').value === 'TPL-DEFAULT-MOD-A-design';
    }, 'Checklist drawer did not load the saved record');
    const dialog = dialogByTitle('清单模板 · TPL-DEFAULT-MOD-A-design');
    assert.ok(dialog.textContent.includes('尺寸链校核'), 'Existing library links must render');
    assert.ok(dialog.textContent.includes('已选检查项（1）'), 'Item count must reflect existing links');

    await click(button('从检查项库选择', dialog));
    await until(() => Boolean(dialogByTitle('从检查项库选择')), 'Picker drawer did not open');
    await until(() => dialogByTitle('从检查项库选择').textContent.includes('定位基准检查'), 'Picker did not load library entries');
    const picker = dialogByTitle('从检查项库选择');
    const listCalls = backend.matching('GET', /\/check-item-library\/$/);
    assert.equal(listCalls.length, 1, 'Picker must fetch the library once on open');
    assert.equal(listCalls[0].url.searchParams.get('phase_key'), 'design', 'Picker must scope to the checklist phase');
    assert.equal(listCalls[0].url.searchParams.get('is_active'), 'true', 'Picker must only request active entries');
    assert.ok(!picker.textContent.includes('停用的旧条目'), 'Inactive entries must not be offered');
    assert.ok(!picker.textContent.includes('焊点间距检查'), 'Other phases must not be offered');
    const addedCheckbox = byAria('选择检查项 尺寸链校核', picker);
    assert.ok(addedCheckbox.disabled && addedCheckbox.checked, 'Already-linked entries render as checked+disabled');
    assert.ok(button('添加所选', picker).disabled, '添加所选 stays disabled until a new entry is selected');

    await click(byAria('选择检查项 定位基准检查', picker));
    await click(button('添加所选', dialogByTitle('从检查项库选择')));
    await until(() => !dialogByTitle('从检查项库选择'), 'Picker must close after adding');
    const filled = dialogByTitle('清单模板 · TPL-DEFAULT-MOD-A-design');
    assert.ok(filled.textContent.includes('已选检查项（2）'), 'Added entry must join the draft list');
    assert.ok(filled.textContent.includes('定位基准检查'), 'Added entry title must render');

    // Remove the original link, then save: set-items must replace the item set atomically.
    await click(byAria('移除检查项 尺寸链校核', filled));
    const saveDialog = dialogByTitle('清单模板 · TPL-DEFAULT-MOD-A-design');
    assert.ok(saveDialog.textContent.includes('已选检查项（1）'), 'Removal must update the draft list');
    await click(button('保存清单', saveDialog));
    await until(() => backend.matching('POST', /\/checklist-templates\/301\/set-items\/$/).length === 1, 'Save must call set-items once');
    assert.equal(backend.matching('PATCH', /\/checklist-templates\/301\/$/).length, 1, 'Save must PATCH the checklist fields once');
    const patch = JSON.parse(backend.matching('PATCH', /\/checklist-templates\/301\/$/)[0].body);
    assert.ok(!('item_templates' in patch), 'Checklist PATCH must not carry legacy item_templates');
    const setItems = JSON.parse(backend.matching('POST', /\/checklist-templates\/301\/set-items\/$/)[0].body);
    assert.deepEqual(setItems.items.map(item => item.entry_id), [502], 'Set-items must carry the remaining entry ids');
    assert.equal(setItems.items[0].is_enabled, true);
    await until(() => dialogByTitle('清单模板 · TPL-DEFAULT-MOD-A-design')?.textContent.includes('已选检查项（1）'), 'Drawer must accept the refreshed template');
    await until(() => cellDrawerTextIncludes('尺寸检测', '设计阶段', '1 组清单'), 'Cell drawer must refresh after save');
  });

  await run('cell create drawer: prefills the target and creates without legacy item payloads', async () => {
    await mount();
    const cell = await openCellDrawer('外观检测', '设计阶段');
    assert.ok(cell.textContent.includes('暂未配置'), 'Empty cell must render the empty state');
    await click(button('新增单元格清单', cell));
    await until(() => Boolean(dialogByTitle('新增清单模板')), 'Create drawer did not open');
    const dialog = dialogByTitle('新增清单模板');
    assert.equal(fieldByLabel(dialog, '清单编码').value, 'tpl-default-mod-b-design');
    assert.equal(fieldByLabel(dialog, '清单名称').value, '外观检测 · 设计阶段');
    assert.equal(fieldByLabel(dialog, '模块').value, '82');
    assert.equal(fieldByLabel(dialog, '阶段').value, 'design');
    assert.ok(button('保存清单', dialog).disabled, 'Untouched prefilled drafts stay non-dirty and cannot be saved');
    await typeInto(fieldByLabel(dialog, '清单名称'), '外观检测 · 设计阶段-调整');
    assert.ok(!button('保存清单', dialogByTitle('新增清单模板')).disabled, 'Editing the draft enables save');
    await click(button('保存清单', dialogByTitle('新增清单模板')));
    await until(() => backend.matching('POST', /\/checklist-templates\/$/).length === 1, 'Create must POST the checklist');
    const created = JSON.parse(backend.matching('POST', /\/checklist-templates\/$/)[0].body);
    assert.equal(created.phase_template, '61');
    assert.equal(created.module, '82');
    assert.equal(created.phase_key, 'design');
    assert.equal(created.name, '外观检测 · 设计阶段-调整');
    assert.equal(backend.matching('POST', /set-items\/$/).length, 0, 'Empty item selections must skip set-items');
    await until(() => !dialogByTitle('新增清单模板') || button('保存清单', dialogByTitle('新增清单模板')).disabled, 'Drawer baseline must reset after create');
    await until(() => container().textContent.includes('tpl-default-mod-b-design'), 'Matrix must show the new checklist');
  });

  await run('phase template copy: creates the draft and re-links items through set-items', async () => {
    await mount();
    await click(byAria('配置项目模板 默认项目模板'));
    await until(() => Boolean(dialogByTitle('项目模板 · 默认项目模板')), 'Phase template drawer did not open');
    await click(button('复制草稿', dialogByTitle('项目模板 · 默认项目模板')));
    await until(() => backend.matching('POST', /\/phase-templates\/$/).length === 1, 'Copy must create the draft phase template');
    const draftCreate = JSON.parse(backend.matching('POST', /\/phase-templates\/$/)[0].body);
    assert.equal(draftCreate.is_active, false);
    assert.equal(draftCreate.phase_definitions.length, 2);
    await until(() => backend.matching('POST', /\/checklist-templates\/$/).length === 2, 'Copy must clone both checklists');
    const setItemsCalls = backend.matching('POST', /set-items\/$/);
    assert.equal(setItemsCalls.length, 1, 'Only the checklist with items needs set-items');
    const copiedItems = JSON.parse(setItemsCalls[0].body);
    assert.deepEqual(copiedItems.items.map(item => item.entry_id), [501], 'Copy must re-link the source library entries');
    await until(() => dialogByTitle('项目模板 · 默认项目模板 草稿'), 'Drawer must open the copied draft');
    await until(() => container().textContent.includes('默认项目模板 草稿'), 'List must show the copied draft');
  });

  process.stdout.write(`${passed} template drawer scenarios passed\n`);
} finally {
  if (renderer) await act(async () => { renderer.unmount(); });
  dom.window.close();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  await rm(outputDir, { recursive: true, force: true });
}
