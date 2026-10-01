import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, extname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

// Check-item library regression suite: mounts the real CheckItemLibraryView with the
// real service layer against an in-memory API. Covers phase-grouped rendering,
// client-side filters, drawer create/edit, the linked-template delete gate and the
// structured 409 surfacing for stale deletes.
const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const appPath = resolve(root, 'src/App.tsx');
const apiOrigin = 'https://api.library.example.test';
const prefix = '/api/li-bs-auto-status/v1';
const outputDir = await mkdtemp(resolve(tmpdir(), 'auto-status-check-item-library-'));
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://spa.library.example.test', pretendToBeVisual: true
});
const compiled = new Map();
const originals = new Map();
const blockedRequests = [];
const consoleErrors = [];
const originalConsoleError = console.error;
let backend;
let renderer;
let views;
let createRoot;
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
// Save flows resolve through microtask gaps between polling act()s; filter exactly
// that hygiene warning, keep every other console error fatal.
const isActWarning = args => args.some(arg => typeof arg === 'string' && arg.includes('was not wrapped in act('));
console.error = (...args) => {
  if (!isActWarning(args)) consoleErrors.push(args);
  if (process.env.LIBRARY_DEBUG) originalConsoleError(args.map(String).join(' ').slice(0, 400));
};

async function compile(path) {
  if (compiled.has(path)) return compiled.get(path);
  const outputPath = resolve(outputDir, `${compiled.size}.mjs`);
  compiled.set(path, outputPath);
  let source = (await readFile(path, 'utf8')).replaceAll('import.meta.env', `({ VITE_BASE_API: ${JSON.stringify(apiOrigin)} })`);
  if (path === appPath) source += '\nexport { CheckItemLibraryView };\n';
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

const libraryEntryWire = (id, phaseKey, title, overrides = {}) => ({
  id, phase_key: phaseKey, title, description: `${title}说明`, priority: 'P1', sort_order: id % 100,
  is_active: true, linked_template_count: 0, metadata: {}, ...overrides
});

class MemoryApi {
  calls = [];
  unexpectedRequests = [];
  entries = new Map();
  conflictDeletes = new Map();
  nextEntryId = 600;

  seedDefaults() {
    this.entries.set(501, libraryEntryWire(501, 'design', '尺寸链校核', { sort_order: 10, linked_template_count: 1 }));
    this.entries.set(502, libraryEntryWire(502, 'design', '定位基准检查', { sort_order: 20 }));
    this.entries.set(504, libraryEntryWire(504, 'design', '停用的旧条目', { sort_order: 30, is_active: false }));
    this.entries.set(503, libraryEntryWire(503, 'ppv', '焊点间距检查', { sort_order: 10 }));
    this.entries.set(505, libraryEntryWire(505, 'ppv', '关重扭矩复核', { sort_order: 20 }));
    this.conflictDeletes.set(505, '检查项库条目「关重扭矩复核」仍被 2 组清单模板引用，无法删除。');
  }

  matching(method, pattern) {
    return this.calls.filter(call => call.method === method && pattern.test(call.path));
  }

  async fetch(url, init) {
    const method = init.method || 'GET';
    const path = url.pathname.slice(prefix.length);
    const call = { method, path, url, body: typeof init.body === 'string' ? init.body : '' };
    this.calls.push(call);
    if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    if (path === '/check-item-library/' && method === 'GET') {
      const phaseKey = url.searchParams.get('phase_key');
      const isActive = url.searchParams.get('is_active');
      const q = (url.searchParams.get('q') || '').trim();
      let rows = [...this.entries.values()];
      if (phaseKey) rows = rows.filter(item => item.phase_key === phaseKey);
      if (isActive === 'true') rows = rows.filter(item => item.is_active);
      if (isActive === 'false') rows = rows.filter(item => !item.is_active);
      if (q) rows = rows.filter(item => item.title.includes(q) || item.description.includes(q));
      return json(page(rows.map(clone)));
    }
    if (path === '/check-item-library/' && method === 'POST') {
      const payload = JSON.parse(call.body);
      if (!payload.phase_key || !payload.title) return json({ detail: '项目阶段与标题为必填项。' }, 400);
      const row = libraryEntryWire(this.nextEntryId += 1, payload.phase_key, payload.title, {
        description: payload.description ?? '',
        priority: payload.priority ?? '',
        sort_order: payload.sort_order ?? 0,
        is_active: payload.is_active ?? true,
        metadata: payload.metadata ?? {}
      });
      this.entries.set(row.id, row);
      return json({ data: clone(row) }, 201);
    }
    const match = path.match(/^\/check-item-library\/(\d+)\/$/);
    if (match) {
      const row = this.entries.get(Number(match[1]));
      if (!row) return json({ detail: '检查项库条目不存在。' }, 404);
      if (method === 'GET') return json({ data: clone(row) });
      if (method === 'PATCH') {
        Object.assign(row, JSON.parse(call.body));
        return json({ data: clone(row) });
      }
      if (method === 'DELETE') {
        const conflict = this.conflictDeletes.get(row.id);
        if (conflict) return json({ detail: conflict, linked_templates: [{ id: 301, name: 'TPL-DEFAULT-MOD-A-design' }] }, 409);
        this.entries.delete(row.id);
        return new Response(null, { status: 204 });
      }
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
const rowTexts = () => [...container().querySelectorAll('tbody tr')].map(row => row.textContent);
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
  if (!predicate() && process.env.LIBRARY_DEBUG) {
    originalConsoleError('DIALOGS:', JSON.stringify(dialogs().map(d => d.querySelector('header h2')?.textContent)));
    originalConsoleError('CALLS:', JSON.stringify(backend?.calls.map(c => `${c.method} ${c.path}`)));
    originalConsoleError('BODY:', container().textContent.slice(0, 1200));
  }
  assert.ok(predicate(), message);
}

const phaseTemplatesProp = () => [{
  id: 61, code: 'TPL-DEFAULT', name: '默认项目模板', version: 1, description: '', sequence: 61, isActive: true,
  phaseDefinitions: [
    { key: 'design', name: '设计阶段', description: '', sortOrder: 10, plannedStart: null, plannedEnd: null, durationDays: null, metadata: {} },
    { key: 'ppv', name: 'PPV阶段', description: '', sortOrder: 20, plannedStart: null, plannedEnd: null, durationDays: null, metadata: {} }
  ],
  metadata: {}
}];

async function render() {
  await act(async () => {
    renderer.render(React.createElement(views.CheckItemLibraryView, { phaseTemplates: phaseTemplatesProp(), canWrite: true }));
  });
}
async function mount() {
  backend = new MemoryApi();
  backend.seedDefaults();
  renderer = createRoot(container());
  await render();
  await until(() => container().textContent.includes('5 条库检查项'), 'Library view did not settle');
  const listCalls = backend.matching('GET', /\/check-item-library\/$/);
  assert.equal(listCalls.length, 1, 'The view must load the library once on mount');
  assert.equal(listCalls[0].url.searchParams.get('phase_key'), null, 'Initial load must be unfiltered');
  assert.equal(listCalls[0].url.searchParams.get('is_active'), null, 'Initial load must include disabled entries');
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
  }
}

try {
  ({ createRoot } = await import('react-dom/client'));
  views = await import(pathToFileURL(await compile(appPath)).href);

  await run('library view: groups entries by phase order and shows counts', async () => {
    await mount();
    const rows = rowTexts();
    const designHeader = rows.findIndex(text => text.includes('设计阶段') && text.includes('design · 3 项'));
    const ppvHeader = rows.findIndex(text => text.includes('PPV阶段') && text.includes('ppv · 2 项'));
    assert.ok(designHeader >= 0, 'Design group header with count must render');
    assert.ok(ppvHeader > designHeader, 'PPV group must follow the design group in phase order');
    const designRows = rows.slice(designHeader + 1, ppvHeader);
    assert.ok(designRows[0].includes('尺寸链校核'), 'Design entries must sort by sort_order first');
    assert.ok(designRows[1].includes('定位基准检查'), 'Second design entry follows sort order');
    assert.ok(designRows[2].includes('停用的旧条目'), 'Disabled entries stay in the unfiltered list');
    assert.ok(rows.some(text => text.includes('尺寸链校核') && text.includes('1 组')), 'Linked template count must render');
  });

  await run('library view: keyword, phase and status filters narrow the list client-side', async () => {
    await mount();
    const callsBefore = backend.calls.length;
    await typeInto(byAria('检查项库搜索'), '焊点');
    await until(() => rowTexts().some(text => text.includes('焊点间距检查')) && !rowTexts().some(text => text.includes('尺寸链校核')), 'Keyword filter did not narrow the rows');
    assert.ok(!rowTexts().some(text => text.includes('design ·')), 'Filtered-out groups must not render headers');
    assert.ok(container().textContent.includes('5 条库检查项'), 'Header chip keeps the unfiltered total');
    await typeInto(byAria('检查项库搜索'), '');

    await typeInto(byAria('检查项库阶段筛选'), 'design');
    await until(() => rowTexts().some(text => text.includes('尺寸链校核')) && !rowTexts().some(text => text.includes('焊点间距检查')), 'Phase filter did not narrow the rows');
    assert.ok(!rowTexts().some(text => text.includes('ppv ·')), 'PPV group must disappear under the design filter');

    await typeInto(byAria('检查项库阶段筛选'), '');
    await typeInto(byAria('检查项库状态筛选'), 'disabled');
    await until(() => {
      const rows = rowTexts();
      return rows.some(text => text.includes('停用的旧条目')) && !rows.some(text => text.includes('尺寸链校核'));
    }, 'Status filter did not narrow to disabled entries');
    const listCalls = backend.matching('GET', /\/check-item-library\/$/).length;
    assert.equal(backend.calls.length, callsBefore + listCalls - 1, 'Filters must not trigger new fetches');
  });

  await run('library drawer: create posts the entry and reloads the grouped list', async () => {
    await mount();
    await click(button('新增检查项'));
    await until(() => Boolean(dialogByTitle('新增库检查项')), 'Create drawer did not open');
    const dialog = dialogByTitle('新增库检查项');
    assert.ok(button('保存检查项', dialog).disabled, 'Empty drafts stay invalid and non-dirty');
    await typeInto(fieldByLabel(dialog, '项目阶段 Key'), 'ppv');
    await typeInto(fieldByLabel(dialog, '检查项标题'), '焊后气密性复查');
    await typeInto(fieldByLabel(dialog, '优先级'), 'P0');
    await typeInto(fieldByLabel(dialog, '排序'), '30');
    await typeInto(fieldByLabel(dialog, '检查内容 / 验收口径'), '按密封性试验规程复核');
    await click(button('保存检查项', dialogByTitle('新增库检查项')));
    await until(() => backend.matching('POST', /\/check-item-library\/$/).length === 1, 'Create must POST the library entry');
    const created = JSON.parse(backend.matching('POST', /\/check-item-library\/$/)[0].body);
    assert.deepEqual(
      Object.keys(created).sort(),
      ['is_active', 'metadata', 'phase_key', 'description', 'priority', 'sort_order', 'title'].sort(),
      'Create payload must carry only the library entry contract keys'
    );
    assert.equal(created.phase_key, 'ppv');
    assert.equal(created.title, '焊后气密性复查');
    assert.equal(created.priority, 'P0');
    assert.equal(created.sort_order, 30);
    assert.equal(created.is_active, true);
    await until(() => dialogByTitle('库检查项 · 焊后气密性复查'), 'Drawer must accept the saved entry');
    await until(() => rowTexts().some(text => text.includes('焊后气密性复查')), 'List must reload with the new entry');
    assert.ok(container().textContent.includes('6 条库检查项'), 'Header chip must count the new entry');
    const rows = rowTexts();
    const ppvHeader = rows.findIndex(text => text.includes('ppv · 3 项'));
    assert.ok(ppvHeader > 0, 'PPV group count must include the new entry');
    assert.ok(rows.slice(ppvHeader).some(text => text.includes('焊后气密性复查')), 'New entry must land in the PPV group');
  });

  await run('library drawer: edit patches the entry and delete stays gated while linked', async () => {
    await mount();
    await click(byAria('维护检查项库条目 尺寸链校核'));
    await until(() => {
      const dialog = dialogByTitle('库检查项 · 尺寸链校核');
      return dialog && fieldByLabel(dialog, '检查项标题').value === '尺寸链校核';
    }, 'Entry drawer did not load the saved record');
    assert.ok(backend.matching('GET', /\/check-item-library\/501\/$/).length === 1, 'Drawer must retrieve the saved record');
    const dialog = dialogByTitle('库检查项 · 尺寸链校核');
    assert.ok(dialog.textContent.includes('被 1 组清单模板引用'), 'Subtitle must surface the link count');
    assert.ok(dialog.textContent.includes('当前条目被 1 组清单模板引用，无法删除'), 'Gate note must surface the link count');
    const gatedDelete = button('删除条目', dialog);
    assert.ok(gatedDelete.disabled, 'Delete must be disabled while templates reference the entry');

    await typeInto(fieldByLabel(dialog, '检查项标题'), '尺寸链校核（修订）');
    await click(button('保存检查项', dialogByTitle('库检查项 · 尺寸链校核')));
    await until(() => backend.matching('PATCH', /\/check-item-library\/501\/$/).length === 1, 'Edit must PATCH the entry');
    const patch = JSON.parse(backend.matching('PATCH', /\/check-item-library\/501\/$/)[0].body);
    assert.equal(patch.title, '尺寸链校核（修订）');
    assert.equal(patch.phase_key, 'design');
    await until(() => rowTexts().some(text => text.includes('尺寸链校核（修订）')), 'List must reload with the edited title');
    assert.ok(dialogByTitle('库检查项 · 尺寸链校核（修订）'), 'Drawer must accept the saved entry');
    await click(button('取消', dialogByTitle('库检查项 · 尺寸链校核（修订）')));
    await until(() => !dialogs().length, 'Drawer did not close');
    assert.deepEqual(backend.matching('DELETE', /\/check-item-library\//), [], 'Gated deletes must never reach the API');
  });

  await run('library drawer: unlinked entries delete with confirm and stale deletes surface the 409 detail', async () => {
    await mount();
    await click(byAria('编辑检查项库条目 停用的旧条目'));
    await until(() => Boolean(dialogByTitle('库检查项 · 停用的旧条目')), 'Entry drawer did not open for the disabled entry');
    const dialog = dialogByTitle('库检查项 · 停用的旧条目');
    assert.ok(!button('删除条目', dialog).disabled, 'Unlinked entries must allow deletion');
    confirmResult = true;
    await click(button('删除条目', dialog));
    await until(() => backend.matching('DELETE', /\/check-item-library\/504\/$/).length === 1, 'Delete must issue DELETE');
    assert.ok(confirmCalls[0].includes('确认删除检查项库条目「停用的旧条目」？删除后不可恢复。'), 'Confirm text must name the entry');
    await until(() => !dialogs().length, 'Drawer must close after delete');
    await until(() => container().textContent.includes('4 条库检查项'), 'List must reload after delete');
    assert.ok(!backend.entries.has(504), 'Entry must be gone from the backend');

    // Stale delete: the row was rendered with zero links, but the server now reports references.
    await click(byAria('维护检查项库条目 关重扭矩复核'));
    await until(() => Boolean(dialogByTitle('库检查项 · 关重扭矩复核')), 'Entry drawer did not open for the stale entry');
    confirmResult = true;
    await click(button('删除条目', dialogByTitle('库检查项 · 关重扭矩复核')));
    await until(() => backend.matching('DELETE', /\/check-item-library\/505\/$/).length === 1, 'Stale delete must reach the API');
    await until(() => {
      const dialog = dialogByTitle('库检查项 · 关重扭矩复核');
      const alert = dialog?.querySelector('[role="alert"]');
      return alert?.textContent.includes('仍被 2 组清单模板引用，无法删除');
    }, 'The structured 409 detail must surface in the drawer');
    assert.ok(dialogByTitle('库检查项 · 关重扭矩复核'), 'Drawer must stay open on conflict');
    assert.ok(backend.entries.has(505), 'Conflicted entry must stay in the backend');
    assert.ok(rowTexts().some(text => text.includes('关重扭矩复核')), 'Conflicted entry must stay in the list');
  });

  process.stdout.write(`${passed} check item library scenarios passed\n`);
} finally {
  if (renderer) await act(async () => { renderer.unmount(); });
  dom.window.close();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  await rm(outputDir, { recursive: true, force: true });
}
