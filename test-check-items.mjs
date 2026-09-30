import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, extname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

// Render the actual ChecksView, editor hooks, shared drawer and service adapters.
// The memory API has a different origin and cannot reach dev or any real network.
// PDF rendering is a separate browser acceptance, not simulated by jsdom canvas.
const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const appPath = resolve(root, 'src/App.tsx');
const apiOrigin = 'https://api.checks.example.test';
const prefix = '/api/li-bs-auto-status/v1';
const outputDir = await mkdtemp(resolve(tmpdir(), 'auto-status-check-items-'));
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://spa.checks.example.test', pretendToBeVisual: true });
const compiled = new Map();
const originals = new Map();
const consoleErrors = [];
const originalError = console.error;
const objectUrls = new Set();
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
const blocked = [];
let backend, renderer, props, createRoot, ChecksView, api, allowEditorNavigation;
let confirmResult = false;
let confirmCalls = [];
let saved = [], removed = [], downloaded = [];
let passed = 0;
const clone = value => structuredClone(value);
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const project = { id: 7, code: 'TEST-ONLY', name: 'Isolated test project' };
const phases = [1, 2].map(id => ({ id, projectId: 7, name: `Phase ${id}`, sortOrder: id, sequence: id, isActive: true, plannedStartDate: '2026-09-01', plannedEndDate: '2026-10-31' }));
const modules = [1, 2].map(id => ({ id, name: `Module ${id}`, sortOrder: id, sequence: id, isActive: true, owners: [] }));
const owners = [{ idaasId: 'owner-a', displayName: 'Owner A' }, { idaasId: 'owner-b', displayName: 'Owner B' }];
const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const png = name => new File([imageBytes], name, { type: 'image/png' });
const pdf = name => new File(['%PDF-1.7\ntransport-only fixture\n%%EOF'], name, { type: 'application/pdf' });
const attachment = (id, name, caption = '') => ({ id, file_name: name, content_type: name.endsWith('.png') ? 'image/png' : 'application/pdf', preview_kind: name.endsWith('.png') ? 'image' : 'pdf', can_preview: true, can_download: true, file_size: imageBytes.length, metadata: { caption }, created_at: '2026-09-29T00:00:00Z' });
const row = (id, extra = {}) => ({ id, project: 7, phase: 1, project_phase: 1, module: 1, title: `Check ${String(id).padStart(2, '0')}`, description: 'Original description', planned_start: '2026-09-01', planned_end: '2026-10-31', owners: [{ idaas_id: 'owner-a', display_name: 'Owner A' }], owner_idaas_id: 'owner-a', owner_name: 'Owner A', status: 'in_progress', is_enabled: true, can_delete: true, metadata: { progress_percent: 43, acceptance_criteria: 'Original requirement', retained: 'keep' }, attachments: [], ...extra });
function install(key, value) {
  originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
for (const key of ['window', 'document', 'Event', 'KeyboardEvent', 'MouseEvent', 'HTMLElement', 'Node', 'navigator']) install(key, key === 'window' ? dom.window : key === 'document' ? dom.window.document : dom.window[key]);
install('IS_REACT_ACT_ENVIRONMENT', true);
install('fetch', async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.origin !== apiOrigin || !url.pathname.startsWith(`${prefix}/`)) { blocked.push(url.href); throw new Error(`Network outside the isolated test API: ${url.href}`); }
  assert.equal(init.credentials, 'include');
  assert.ok(backend);
  return backend.fetch(url, init);
});
dom.window.fetch = globalThis.fetch;
dom.window.confirm = message => { confirmCalls.push(message); return confirmResult; };
console.error = (...args) => { consoleErrors.push(args); originalError(...args); };
URL.createObjectURL = blob => { const url = originalCreate(blob); objectUrls.add(url); return url; };
URL.revokeObjectURL = url => { objectUrls.delete(url); originalRevoke(url); };
async function compile(path) {
  if (compiled.has(path)) return compiled.get(path);
  const target = resolve(outputDir, `${compiled.size}.mjs`);
  compiled.set(path, target);
  let source = (await readFile(path, 'utf8')).replaceAll('import.meta.env', `({ VITE_BASE_API: ${JSON.stringify(apiOrigin)} })`);
  if (path === appPath) source += '\nexport { ChecksView };\n';
  let output = ts.transpileModule(source, { fileName: path, compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  output = output.replace(/import\s+['"][^'"]+\.css['"];?/g, '');
  for (const match of [...output.matchAll(/from\s+(['"])([^'"]+)\1/g)]) {
    const specifier = match[2];
    let dependency;
    if (specifier.startsWith('.')) {
      const base = resolve(dirname(path), specifier);
      const candidates = extname(base) ? [base, base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx')] : [`${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts'), resolve(base, 'index.tsx')];
      for (const candidate of candidates) if (await stat(candidate).then(info => info.isFile()).catch(() => false)) { dependency = await compile(candidate); break; }
      assert.ok(dependency, `Unresolved module ${specifier}`);
    } else dependency = require.resolve(specifier);
    output = output.replaceAll(match[0], `from ${JSON.stringify(pathToFileURL(dependency).href)}`);
  }
  await writeFile(target, output);
  return target;
}
class MemoryApi {
  rows = new Map(); calls = []; audits = []; gates = []; uploads = []; unexpected = []; files = new Map();
  nextId = 100; nextAttachmentId = 1000; failUploadAt = 0; writable = true; badDetailProject = false;
  hold(predicate, ignoreAbort = false) { const gate = { predicate, ignoreAbort, used: false, release: deferred() }; this.gates.push(gate); return gate; }
  matching(method, path) { return this.calls.filter(call => call.method === method && call.path === path); }
  recordAudit(id, action) { this.audits.push({ id: this.audits.length + 1, object_type: 'CheckItem', object_id: String(id), action, project: 7, created_at: '2026-09-29T00:00:00Z' }); }
  validateOwners(payload) {
    assert.ok(!payload.owner_name, 'Check items never write a free-text owner identity');
    assert.ok(!payload.owners || payload.owners.every(owner => owner.idaas_id), 'Owners come from IDaaS');
  }
  async fetch(url, init) {
    const call = { method: init.method || 'GET', path: url.pathname.slice(prefix.length), url, body: init.body, signal: init.signal };
    this.calls.push(call);
    const gate = this.gates.find(item => !item.used && item.predicate(call));
    if (gate) { gate.used = true; await gate.release.promise; }
    if (init.signal?.aborted && !gate?.ignoreAbort) throw new DOMException('Aborted', 'AbortError');
    if (!this.writable && (call.method !== 'GET' || call.path.endsWith('/download/'))) return json({ detail: 'Read-only test account' }, 403);
    const query = url.searchParams;
    if (call.path === '/check-items/' && call.method === 'GET') {
      assert.equal(query.get('project'), '7');
      assert.equal(query.get('phase_enabled'), 'true');
      let results = [...this.rows.values()].sort((a, b) => a.id - b.id);
      if (query.get('q')) results = results.filter(item => `${item.title} ${item.description} ${item.metadata.acceptance_criteria}`.includes(query.get('q')));
      for (const [filter, field] of [['phase', 'phase'], ['module', 'module'], ['status', 'status']]) if (query.get(filter)) results = results.filter(item => String(item[field]) === query.get(filter));
      if (query.get('owner')) results = results.filter(item => item.owners.some(owner => `${owner.idaas_id} ${owner.display_name}`.includes(query.get('owner'))));
      const page = Number(query.get('page') || 1), size = Number(query.get('page_size') || 20);
      if (page > 1 && (page - 1) * size >= results.length) return json({ detail: 'Invalid page.' }, 404);
      const total = results.length;
      results = results.slice((page - 1) * size, page * size).map(item => { const { attachments, ...fields } = clone(item); return { ...fields, attachment_count: attachments.length }; });
      return json({ count: total, next: page * size < total ? `?page=${page + 1}` : null, previous: page > 1 ? `?page=${page - 1}` : null, results });
    }
    if (call.path === '/projects/7/check-items/' && call.method === 'POST') {
      const { progress_percent: _ignoredProgress, ...payload } = JSON.parse(call.body);
      this.validateOwners(payload);
      const item = row(this.nextId++, payload);
      this.rows.set(item.id, item); this.recordAudit(item.id, 'check_item.create');
      return json(clone(item), 201);
    }
    const checkMatch = call.path.match(/^\/check-items\/(\d+)\/$/);
    if (checkMatch) {
      const item = this.rows.get(Number(checkMatch[1]));
      if (!item) return json({ detail: 'Not found.' }, 404);
      if (call.method === 'GET') return json({ ...clone(item), project: this.badDetailProject ? 8 : item.project, attachment_count: item.attachments.length });
      if (call.method === 'PATCH') {
        const { progress_percent: _ignoredProgress, ...payload } = JSON.parse(call.body);
        this.validateOwners(payload);
        Object.assign(item, payload, { metadata: { ...item.metadata, ...payload.metadata } });
        if (payload.owners) { item.owner_idaas_id = payload.owners[0]?.idaas_id ?? ''; item.owner_display_name = payload.owners[0]?.display_name ?? ''; item.owner_name = ''; }
        this.recordAudit(item.id, 'check_item.update');
        return json(clone(item));
      }
      if (call.method === 'DELETE') {
        if (!item.can_delete) return json({ detail: 'Protected item' }, 400);
        this.rows.delete(item.id); this.recordAudit(item.id, 'check_item.delete');
        return new Response(null, { status: 204 });
      }
    }
    if (call.path === '/audit-logs/' && call.method === 'GET') {
      const results = this.audits.filter(item => item.object_type === query.get('object_type') && item.object_id === query.get('object_id'));
      return json({ count: results.length, next: null, previous: null, results });
    }
    if (call.path === '/attachments/upload/' && call.method === 'POST') {
      assert.ok(call.body instanceof FormData);
      assert.equal(call.body.get('object_type'), 'check_item');
      assert.equal(call.body.get('project'), '7');
      const id = Number(call.body.get('object_id')), item = this.rows.get(id), file = call.body.get('file');
      assert.ok(item, 'Multipart upload waits for a real create response ID');
      this.uploads.push({ id, name: file.name });
      if (this.uploads.length === this.failUploadAt) return json({ detail: 'Simulated transfer failure' }, 503);
      const saved = { ...attachment(this.nextAttachmentId++, file.name), metadata: JSON.parse(call.body.get('metadata')) };
      this.files.set(saved.id, file); item.attachments.push(saved);
      return json(clone(saved), 201);
    }
    const attachmentMatch = call.path.match(/^\/attachments\/(\d+)\/(metadata\/|preview\/|download\/)?$/);
    if (attachmentMatch) {
      const id = Number(attachmentMatch[1]), item = [...this.rows.values()].find(entry => entry.attachments.some(asset => asset.id === id));
      assert.ok(item, 'Attachment belongs to a known test record');
      const asset = item.attachments.find(entry => entry.id === id);
      if (call.method === 'PATCH' && attachmentMatch[2] === 'metadata/') { asset.metadata = JSON.parse(call.body).metadata; return json(clone(asset)); }
      if (call.method === 'DELETE') { item.attachments = item.attachments.filter(entry => entry.id !== id); return new Response(null, { status: 204 }); }
      if (call.method === 'GET' && ['preview/', 'download/'].includes(attachmentMatch[2])) return new Response(this.files.get(id) ?? imageBytes, { headers: { 'content-type': asset.content_type, 'content-disposition': `attachment; filename="${asset.file_name}"` } });
    }
    this.unexpected.push(`${call.method} ${call.path}`);
    throw new Error(`Unhandled memory API request: ${call.method} ${call.path}`);
  }
}
const container = () => document.getElementById('root');
const dialogs = () => [...container().querySelectorAll('[role="dialog"]')];
const dialog = () => dialogs()[0];
const buttons = (scope = container()) => [...scope.querySelectorAll('button')];
const button = (text, scope = container()) => { const found = buttons(scope).find(item => item.textContent.trim() === text); assert.ok(found, `Missing button ${text}`); return found; };
const byLabel = (text, scope = dialog()) => { const found = scope.querySelector(`[aria-label="${text}"]`); assert.ok(found, `Missing control ${text}`); return found; };
const field = text => { const label = [...dialog().querySelectorAll('label')].find(item => item.querySelector('.field-label')?.textContent === text); assert.ok(label, `Missing field ${text}`); return label.querySelector('input, textarea, select'); };
const footer = () => dialog().querySelector('footer');
const mainSave = () => button('保存检查项', footer());
const tableRows = () => [...container().querySelectorAll(':scope > section > .table-shell tbody tr')];
const listNav = () => container().querySelector(':scope > section > nav[aria-label="列表分页"]');
const caption = name => { const title = [...dialog().querySelectorAll('[title]')].find(item => item.getAttribute('title') === name); assert.ok(title, `Missing asset ${name}`); const input = title.closest('.rounded-lg')?.querySelector('input'); assert.ok(input, `Missing caption ${name}`); return input; };
async function click(target) { assert.ok(target); await act(async () => { target.click(); }); }
async function value(input, next) {
  assert.ok(input && !input.disabled, 'Use an enabled real form control');
  await act(async () => {
    const prototype = input.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : input.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, next);
    input.dispatchEvent(new dom.window.Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
  assert.equal(input.value, next);
}
async function files(next) { const input = byLabel('检查项选择附件'); assert.equal(input.disabled, false); await act(async () => { Object.defineProperty(input, 'files', { configurable: true, value: next }); input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); }); }
async function until(predicate, message) { for (let i = 0; i < 120; i++) { if (predicate()) return; await act(async () => { await new Promise(done => setTimeout(done, 5)); }); } assert.ok(predicate(), message); }
const settle = () => until(() => dialog() && !mainSave().disabled, 'Drawer mutation/detail did not settle');
async function tab(name) { const nav = byLabel('检查项详情分区'); const target = buttons(nav).find(item => item.textContent.startsWith(name)); await click(target); }
async function open(title) { await click(button(title)); await settle(); }
async function render(patch = {}) { props = { ...props, ...patch }; await act(async () => { renderer.render(React.createElement(ChecksView, props)); }); }
async function mount(rows = [], overrides = {}) {
  backend = new MemoryApi(); rows.forEach(item => backend.rows.set(item.id, clone(item)));
  saved = []; removed = []; downloaded = [];
  props = { project, phases, modules, ownerCandidates: owners, canWrite: true, defaultOwner: owners[0], workspaceLoading: false,
    onSaved: item => saved.push(item), onRemoved: item => removed.push(item),
    onDownloadAttachment: async (asset, signal) => { const result = await api.fetchAttachmentDownload(asset.id, asset.fileName, signal); signal.throwIfAborted(); downloaded.push(result); }, ...overrides };
  renderer = createRoot(container());
  await render();
  await until(() => backend.matching('GET', '/check-items/').length && tableRows().length === Math.min(20, rows.length), 'Initial server-paged list did not render');
}
async function run(name, action) {
  const errors = consoleErrors.length;
  confirmCalls = []; confirmResult = false;
  try { await action(); assert.deepEqual(blocked, []); assert.deepEqual(backend?.unexpected ?? [], []); assert.equal(consoleErrors.length, errors, 'Console errors fail component tests'); passed++; process.stdout.write(`PASS ${name}\n`); }
  finally {
    if (backend) await act(async () => { backend.gates.forEach(gate => gate.release.resolve()); });
    if (renderer) { await act(async () => { renderer.unmount(); }); renderer = null; }
    container().replaceChildren(); backend = null;
    assert.equal(objectUrls.size, 0, 'Unmount releases every image/preview Blob URL');
  }
}
try {
  ({ createRoot } = await import('react-dom/client'));
  ({ ChecksView } = await import(pathToFileURL(await compile(appPath)).href));
  api = await import(pathToFileURL(await compile(resolve(root, 'src/services/bsAutoStatusApi.ts'))).href);
  ({ allowEditorNavigation } = await import(pathToFileURL(await compile(resolve(root, 'src/hooks/useRecordEditor.ts'))).href));

  await run('one filter surface, true 20+1 pages, page-size options and filter reset', async () => {
    await mount(Array.from({ length: 21 }, (_, i) => row(i + 1)));
    assert.equal(container().querySelectorAll('[aria-label="检查项筛选"]').length, 1);
    assert.equal(container().querySelector('[aria-label="检查项标题"]'), null, 'Create form is not permanently repeated above filters');
    assert.equal(tableRows().length, 20);
    assert.ok(!tableRows().some(item => buttons(item).some(control => control.textContent === '保存')));
    assert.match(listNav().textContent, /共 21 条 · 第 1 \/ 2 页/);
    await click(button('下一页', listNav()));
    await until(() => tableRows().length === 1 && tableRows()[0].textContent.includes('Check 21'), 'Second page did not use the server');
    await value(byLabel('检查项关键字筛选', container()), 'Check 03');
    await until(() => tableRows().length === 1 && tableRows()[0].textContent.includes('Check 03'), 'Filter did not reset to page one');
    assert.equal(backend.matching('GET', '/check-items/').at(-1).url.searchParams.get('page'), '1');
    await click(button('重置'));
    await until(() => tableRows().length === 20, 'Reset did not restore list');
    for (const size of ['50', '100', '20']) {
      await value(byLabel('每页条数', listNav()), size);
      await until(() => tableRows().length === Math.min(Number(size), 21), 'Page-size response did not render');
      assert.equal(backend.matching('GET', '/check-items/').at(-1).url.searchParams.get('page_size'), size);
    }
    await click(button('高级筛选'));
    await value(byLabel('检查项负责人筛选', container()), 'Owner A');
    await until(() => backend.matching('GET', '/check-items/').at(-1).url.searchParams.get('owner') === 'Owner A', 'Owner filter not sent');
    await click(button('高级筛选 · 已生效'));
    assert.ok(button('高级筛选 · 已生效'));
  });

  await run('hidden attachment tab does not fetch image bytes and keeps drafts when revisited', async () => {
    await mount([row(11, { attachments: [attachment(41, 'lazy.png', 'Saved caption')] })]);
    await open('Check 11');
    assert.equal(backend.matching('GET', '/attachments/41/preview/').length, 0);
    await tab('操作记录');
    assert.equal(backend.matching('GET', '/attachments/41/preview/').length, 0);
    const gate = backend.hold(call => call.path === '/attachments/41/preview/', true);
    await tab('附件');
    await until(() => gate.used, 'Visible attachment tab did not request a thumbnail');
    await value(caption('lazy.png'), 'Unsaved caption');
    await files([png('pending.png')]);
    const first = backend.matching('GET', '/attachments/41/preview/')[0];
    await tab('基本信息');
    assert.equal(first.signal.aborted, true, 'Hidden tab cancels thumbnail transport');
    await act(async () => { gate.release.resolve(); });
    assert.equal(objectUrls.size, 0, 'Hidden tab never retains late image bytes');
    await tab('附件');
    await until(() => backend.matching('GET', '/attachments/41/preview/').length === 2 && objectUrls.size === 1, 'Reopened tab did not load its image');
    assert.equal(caption('lazy.png').value, 'Unsaved caption');
    assert.ok(byLabel('移除待上传 pending.png'));
    assert.equal(backend.calls.filter(call => call.method !== 'GET').length, 0);
  });

  await run('independent detail read, atomic form payload and partial progress preservation', async () => {
    await mount([row(11, { attachments: [attachment(41, 'detail.pdf')] })]);
    assert.equal(tableRows()[0].querySelector('[aria-label="Check 11 的附件"]').textContent.trim(), '1');
    assert.equal(backend.matching('GET', '/check-items/11/').length, 0);
    await open('Check 11');
    assert.equal(backend.matching('GET', '/check-items/11/').length, 1);
    assert.ok(dialog().textContent.includes('附件 (1)'));
    await value(byLabel('检查项标题'), 'Unified saved');
    await value(field('描述'), 'Saved description');
    await value(field('检查要求'), 'Saved requirement');
    await value(field('标签'), 'alpha，beta');
    await value(byLabel('检查项所属阶段'), '2');
    await value(byLabel('检查项所属模块'), '2');
    await value(field('计划开始 *'), '2026-09-10');
    await value(field('计划结束 *'), '2026-10-20');
    await value(byLabel('检查项状态'), 'blocked');
    await value(byLabel('检查项启用状态'), 'false');
    await click(byLabel('移除责任人 Owner A'));
    const candidate = buttons(dialog()).find(item => item.textContent.includes('Owner B') && item.textContent.includes('owner-b'));
    await click(candidate);
    const gate = backend.hold(call => call.method === 'PATCH' && call.path === '/check-items/11/');
    await click(mainSave());
    await until(() => gate.used, 'Save was not sent');
    assert.equal(byLabel('检查项标题').disabled, true);
    assert.equal(button('关闭', footer()).disabled, true);
    assert.equal(allowEditorNavigation(), false);
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    assert.ok(dialog());
    const payload = JSON.parse(backend.matching('PATCH', '/check-items/11/')[0].body);
    assert.equal(payload.title, 'Unified saved'); assert.equal(payload.description, 'Saved description');
    assert.equal(payload.metadata.acceptance_criteria, 'Saved requirement'); assert.equal(payload.metadata.retained, 'keep');
    assert.deepEqual(payload.tags, ['alpha', 'beta']); assert.equal(payload.phase, '2'); assert.equal(payload.module, '2');
    assert.equal(payload.planned_start, '2026-09-10'); assert.equal(payload.planned_end, '2026-10-20');
    assert.equal(payload.status, 'blocked'); assert.equal(payload.is_enabled, false); assert.equal(payload.metadata.progress_percent, 43);
    assert.deepEqual(payload.owners.map(item => item.idaas_id), ['owner-b']);
    await act(async () => { gate.release.resolve(); }); await settle();
    assert.equal(saved.at(-1).id, 11); assert.equal(saved.at(-1).attachments.length, 1);
    assert.match(footer().textContent, /已保存/);
    await click(button('关闭', footer())); await open('Unified saved');
    assert.equal(field('描述').value, 'Saved description'); assert.equal(field('检查要求').value, 'Saved requirement');
    await click(byLabel('移除责任人 Owner B')); await click(mainSave()); await settle();
    const clearedPayload = JSON.parse(backend.matching('PATCH', '/check-items/11/').at(-1).body);
    assert.deepEqual(clearedPayload.owners, [], 'Clearing owners is explicit, not omitted');
    assert.equal(clearedPayload.metadata.owner_idaas_id, '');
    assert.equal(clearedPayload.metadata.owner_name, '');
    assert.deepEqual(saved.at(-1).owners, [], 'Cleared snapshots must not restore a removed owner');
    await value(byLabel('检查项状态'), 'done'); await click(mainSave()); await settle();
    assert.equal(backend.rows.get(11).metadata.progress_percent, 100);
  });

  await run('progress survives the canonical metadata round trip without a model progress field', async () => {
    await mount([row(11, { metadata: { progressPercent: 43, progress_percent: 43, retained: 'keep' } })]);
    await open('Check 11');
    await value(byLabel('检查项状态'), 'done'); await click(mainSave()); await settle();
    const payload = JSON.parse(backend.matching('PATCH', '/check-items/11/').at(-1).body);
    assert.equal(payload.progress_percent, undefined, 'Do not send an undeclared model field');
    assert.equal(payload.metadata.progressPercent, 100);
    assert.equal(payload.metadata.progress_percent, 100, 'Update both existing metadata aliases');
    assert.equal(saved.at(-1).progressPercent, 100);
    await click(button('关闭', footer())); await open('Check 11');
    await value(byLabel('检查项状态'), 'in_progress'); await click(mainSave()); await settle();
    assert.equal(saved.at(-1).progressPercent, 100, 'A non-complete status retains the stored progress');
    const unchanged = await api.updateCheckItem(11, { description: 'No progress change', metadata: { retained: 'keep' } });
    const omitted = JSON.parse(backend.matching('PATCH', '/check-items/11/').at(-1).body);
    assert.equal(omitted.metadata.progressPercent, undefined);
    assert.equal(omitted.metadata.progress_percent, undefined);
    assert.equal(unchanged.progressPercent, 100, 'Omitting progress preserves the stored metadata');
    const reset = await api.updateCheckItem(11, { progressPercent: 0, metadata: { progressPercent: 100, progress_percent: 100 } });
    assert.equal(reset.progressPercent, 0, 'An explicit zero must replace stale metadata');
    assert.equal((await api.fetchCheckItem(11)).progressPercent, 0);
    const created = await api.createCheckItem(7, { title: 'Complete on create', projectPhaseId: 1, moduleId: 1, status: 'done', progressPercent: 100, plannedStartDate: '2026-09-01', plannedEndDate: '2026-10-31' });
    const createPayload = JSON.parse(backend.matching('POST', '/projects/7/check-items/').at(-1).body);
    assert.equal(createPayload.progress_percent, undefined);
    assert.equal(createPayload.metadata.progress_percent, 100);
    assert.equal(created.progressPercent, 100);
    for (const progress of [0, 25]) {
      backend.rows.set(90, row(90, { progress_percent: progress, metadata: { progress_percent: 80 } }));
      assert.equal((await api.fetchCheckItem(90)).progressPercent, progress, 'Legacy top-level reads preserve explicit zero');
    }
  });

  await run('required and inverted dates prevent writes; first upload waits for and reuses created ID', async () => {
    await mount(); await click(button('新增检查项'));
    assert.equal(mainSave().disabled, true);
    await tab('附件'); await files([png('first.png')]);
    assert.equal(button('保存检查项并上传').disabled, true);
    await tab('基本信息'); await value(byLabel('检查项标题'), 'Created with file');
    await value(field('计划结束 *'), '2026-08-01'); assert.equal(mainSave().disabled, true);
    await value(field('计划结束 *'), '2026-10-31');
    await tab('附件');
    const gate = backend.hold(call => call.method === 'POST' && call.path === '/projects/7/check-items/');
    await click(button('保存检查项并上传'));
    await until(() => gate.used, 'Create not issued'); assert.equal(backend.uploads.length, 0);
    assert.equal(byLabel('检查项选择附件').disabled, true);
    await act(async () => { gate.release.resolve(); });
    await until(() => dialog().textContent.includes('已上传 1 个附件') && !byLabel('检查项选择附件').disabled, 'First upload did not settle');
    const id = [...backend.rows.keys()][0]; assert.ok(id >= 100); assert.equal(backend.uploads[0].id, id);
    assert.equal(dialog().querySelectorAll('[aria-label^="移除待上传"]').length, 0);
    assert.equal(saved.at(-1).attachments.length, 1);
    await files([pdf('second.pdf')]); await click(button('上传附件'));
    await until(() => backend.rows.get(id).attachments.length === 2 && !byLabel('检查项选择附件').disabled, 'Second upload did not settle');
    assert.equal(backend.matching('POST', '/projects/7/check-items/').length, 1);
    assert.deepEqual(backend.uploads.map(item => item.id), [id, id]);
    assert.ok(backend.calls.some(call => call.path === '/audit-logs/' && call.url.searchParams.get('object_type') === 'CheckItem' && call.url.searchParams.get('object_id') === String(id)));
  });

  for (const failureAt of [1, 2]) await run(`partial upload ${failureAt}/3 retains only failed/unattempted files and does not duplicate creation`, async () => {
    await mount(); backend.failUploadAt = failureAt;
    await click(button('新增检查项')); await value(byLabel('检查项标题'), 'Partial upload'); await tab('附件');
    await files([png('one.png'), png('two.png'), png('three.png')]); await click(button('保存检查项并上传'));
    await until(() => dialog().textContent.includes('Simulated transfer failure') && !byLabel('检查项选择附件').disabled, 'Partial failure not surfaced');
    const id = [...backend.rows.keys()][0];
    assert.equal(backend.rows.size, 1); assert.equal(backend.rows.get(id).attachments.length, failureAt - 1);
    assert.ok(dialog().textContent.includes(`附件成功 ${failureAt - 1}/3 个`));
    assert.equal(dialog().querySelectorAll('[aria-label^="移除待上传"]').length, 4 - failureAt);
    assert.match(footer().textContent, /尚未提交/);
    assert.equal(saved.at(-1).attachments.length, failureAt - 1);
    const uploadIndex = backend.calls.findLastIndex(call => call.path === '/attachments/upload/');
    assert.ok(backend.calls.slice(uploadIndex + 1).some(call => call.path === `/check-items/${id}/`));
    backend.failUploadAt = 0; await click(button('上传附件'));
    await until(() => backend.rows.get(id).attachments.length === 3 && !byLabel('检查项选择附件').disabled, 'Retry did not finish pending files');
    assert.equal(backend.matching('POST', '/projects/7/check-items/').length, 1);
    assert.equal(dialog().querySelectorAll('[aria-label^="移除待上传"]').length, 0);
  });

  await run('body, caption and pending-file drafts survive tab switches and independent saves', async () => {
    await mount([row(11, { attachments: [attachment(41, 'alpha.pdf', 'Old alpha'), attachment(42, 'beta.pdf', 'Old beta')] })]);
    await open('Check 11'); await tab('附件');
    await value(caption('alpha.pdf'), 'New alpha'); await value(caption('beta.pdf'), 'New beta'); await files([png('pending.png')]);
    await click(button('关闭', footer())); assert.ok(dialog()); assert.equal(confirmCalls.length, 1); assert.equal(allowEditorNavigation(), false);
    const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload); assert.equal(unload.defaultPrevented, true);
    await tab('基本信息'); await value(byLabel('检查项标题'), 'Saved text only'); await click(mainSave()); await settle();
    await tab('附件'); assert.equal(caption('alpha.pdf').value, 'New alpha'); assert.equal(caption('beta.pdf').value, 'New beta');
    assert.equal(dialog().querySelectorAll('[aria-label^="移除待上传"]').length, 1);
    assert.equal(backend.rows.get(11).attachments[0].metadata.caption, 'Old alpha');
    await tab('基本信息'); await value(field('描述'), 'Unsaved body survives attachment refresh'); await tab('附件');
    await click(button('保存', caption('alpha.pdf').closest('label')));
    await until(() => backend.rows.get(11).attachments[0].metadata.caption === 'New alpha' && !byLabel('检查项选择附件').disabled, 'Caption save did not settle');
    assert.ok(dialog().textContent.includes('附件说明已保存。'), 'PDF captions use attachment-specific feedback');
    assert.equal(field('描述').value, 'Unsaved body survives attachment refresh'); assert.equal(caption('beta.pdf').value, 'New beta');
    await click(button('上传附件'));
    await until(() => backend.rows.get(11).attachments.length === 3 && !byLabel('检查项选择附件').disabled, 'Attachment refresh not finished');
    assert.equal(field('描述').value, 'Unsaved body survives attachment refresh');
    assert.equal(backend.rows.get(11).description, 'Original description', 'Existing-object upload does not save the body');
    confirmResult = true; await click(button('关闭', footer())); assert.equal(dialog(), undefined);
    await open('Saved text only'); await tab('附件');
    assert.equal(caption('alpha.pdf').value, 'New alpha'); assert.equal(caption('beta.pdf').value, 'Old beta');
    assert.equal(field('描述').value, 'Original description');
  });

  await run('cancelled attachment deletion keeps PDF drafts and nested image preview without a write', async () => {
    await mount([row(11, { attachments: [attachment(41, 'cancel.pdf', 'Saved PDF caption'), attachment(42, 'cancel.png')] })]);
    await open('Check 11'); await value(field('描述'), 'Unsaved body'); await tab('附件');
    await value(caption('cancel.pdf'), 'Unsaved PDF caption');
    const before = backend.calls.length;
    await click(button('删除', caption('cancel.pdf').closest('.rounded-lg')));
    assert.deepEqual(confirmCalls, ['确认删除附件「cancel.pdf」？']);
    assert.equal(backend.rows.get(11).attachments.length, 2);
    assert.equal(backend.rows.get(11).attachments[0].metadata.caption, 'Saved PDF caption');
    assert.equal(caption('cancel.pdf').value, 'Unsaved PDF caption');
    assert.equal(field('描述').value, 'Unsaved body');
    assert.deepEqual(backend.calls.slice(before).filter(call => call.method !== 'GET'), []);
    await click(byLabel('放大预览 cancel.png'));
    await until(() => dialogs().length === 2 && dialogs()[1].querySelector('img'), 'Nested image did not load');
    const previewUrl = dialogs()[1].querySelector('img').src;
    await click(button('删除', dialogs()[1]));
    assert.deepEqual(confirmCalls, ['确认删除附件「cancel.pdf」？', '确认删除附件「cancel.png」？']);
    assert.equal(dialogs().length, 2, 'Cancelling must keep both drawers open');
    assert.equal(dialogs()[1].querySelector('img').src, previewUrl);
    assert.deepEqual(backend.calls.slice(before).filter(call => call.method !== 'GET'), []);
    assert.equal(backend.rows.get(11).attachments.length, 2);
    assert.equal(saved.length, 0, 'Cancellation must not save or refresh the record');
    await click(byLabel('关闭附件预览', dialogs()[1]));
    assert.equal(caption('cancel.pdf').value, 'Unsaved PDF caption');
    assert.equal(field('描述').value, 'Unsaved body');
  });

  await run('protected delete is absent; deleting last page falls back and retains audit', async () => {
    await mount(Array.from({ length: 21 }, (_, i) => row(i + 1, { can_delete: i !== 0 })));
    await open('Check 01'); assert.ok(dialog().textContent.includes('删除保护'));
    assert.ok(!buttons(dialog()).some(item => item.textContent === '删除检查项'));
    await click(button('关闭', footer())); await click(button('下一页', listNav()));
    await until(() => tableRows().length === 1, 'Last page not loaded'); await open('Check 21');
    confirmResult = true; await click(button('删除检查项'));
    await until(() => !dialog() && tableRows().length === 20, 'Delete did not close and recover page one');
    assert.equal(backend.rows.size, 20); assert.deepEqual(removed.map(item => item.id), [21]);
    assert.match(listNav().textContent, /共 20 条 · 第 1 \/ 1 页/);
    assert.ok(backend.audits.some(item => item.object_id === '21' && item.action === 'check_item.delete'));
  });

  await run('readonly shows attachments and image preview but cannot mutate or download', async () => {
    await mount([row(11, { attachments: [attachment(41, 'readonly.png')] })], { canWrite: false }); backend.writable = false;
    assert.equal(button('新增检查项').disabled, true);
    await click(button('Check 11')); await until(() => dialog()?.querySelector('[aria-label="检查项标题"]'), 'Readonly detail missing');
    assert.equal(byLabel('检查项标题').disabled, true);
    assert.ok(!buttons(footer()).some(item => item.textContent === '保存检查项'));
    assert.equal(dialog().querySelector('input[type="file"]'), null);
    await tab('附件'); assert.equal(button('下载', dialog()).disabled, true);
    await click(byLabel('放大预览 readonly.png'));
    await until(() => dialogs().length === 2 && dialogs()[1].querySelector('img'), 'Readonly preview did not load');
    assert.equal(button('下载', dialogs()[1]).disabled, true);
    assert.equal(backend.calls.filter(call => call.method !== 'GET').length, 0);
    assert.equal(backend.calls.filter(call => call.path.endsWith('/download/')).length, 0);
  });

  await run('closing nested image preview cancels download without closing the record or acting on late bytes', async () => {
    await mount([row(11, { attachments: [attachment(41, 'nested.png')] })]);
    await open('Check 11'); await tab('附件'); await click(byLabel('放大预览 nested.png'));
    await until(() => dialogs().length === 2 && dialogs()[1].querySelector('img'), 'Nested image did not load');
    const gate = backend.hold(call => call.path === '/attachments/41/download/', true);
    await click(button('下载', dialogs()[1])); await until(() => gate.used, 'Download did not start');
    const signal = backend.matching('GET', '/attachments/41/download/')[0].signal;
    await click(byLabel('关闭附件预览', dialogs()[1])); assert.equal(dialogs().length, 1); assert.equal(signal.aborted, true);
    await act(async () => { gate.release.resolve(); });
    await until(() => !dialog().textContent.includes('获取中'), 'Cancelled download did not settle'); assert.equal(downloaded.length, 0);
    await click(button('下载', dialog())); await until(() => downloaded.length === 1, 'Independent controlled download not completed');
    assert.deepEqual(Buffer.from(await downloaded[0].blob.arrayBuffer()), imageBytes);
    confirmResult = true; await click(button('删除', dialog()));
    await until(() => backend.rows.get(11).attachments.length === 0 && !byLabel('检查项选择附件').disabled, 'Attachment delete did not refresh detail');
    assert.equal(saved.at(-1).attachments.length, 0);
  });

  await run('workspace loading locks existing drafts and new/detail navigation', async () => {
    await mount([row(11)], { workspaceLoading: true });
    assert.equal(button('新增检查项').disabled, true); assert.equal(button('Check 11').disabled, true);
    await render({ workspaceLoading: false }); await open('Check 11'); await value(byLabel('检查项标题'), 'Unsaved title');
    await render({ workspaceLoading: true }); assert.equal(byLabel('检查项标题').disabled, true); assert.equal(button('处理中…', footer()).disabled, true);
    await click(button('关闭', footer())); assert.ok(dialog()); assert.equal(allowEditorNavigation(), false); assert.equal(confirmCalls.length, 0);
    await render({ workspaceLoading: false }); assert.equal(byLabel('检查项标题').value, 'Unsaved title');
    await click(button('关闭', footer())); assert.equal(confirmCalls.length, 1); assert.ok(dialog());
  });

  await run('wrong-project detail fails closed with retry instead of editing a foreign record', async () => {
    await mount([row(11)]); backend.badDetailProject = true; await click(button('Check 11'));
    await until(() => dialog()?.textContent.includes('不属于当前项目'), 'Foreign detail was accepted');
    assert.equal(mainSave().disabled, true); assert.equal(dialog().querySelector('[aria-label="检查项标题"]'), null);
    backend.badDetailProject = false; await click(button('重试', dialog())); await settle();
    assert.equal(byLabel('检查项标题').value, 'Check 11'); assert.equal(backend.calls.filter(call => call.method !== 'GET').length, 0);
  });

  await run('App actual saved/removed callbacks update full arrays without replacing them with a page (bounded AST)', async () => {
    const source = ts.createSourceFile(appPath, await readFile(appPath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const app = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'App');
    const declarations = app.body.statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations]);
    let workspace = { selectedProject: { id: 7 }, checkItems: Array.from({ length: 37 }, (_, index) => ({ id: index + 1, projectId: 7 })), timeline: { checkItems: Array.from({ length: 37 }, (_, index) => ({ id: index + 1, projectId: 7 })) } };
    const callback = name => {
      const declaration = declarations.find(node => ts.isIdentifier(node.name) && node.name.text === name);
      assert.ok(declaration?.initializer && ts.isArrowFunction(declaration.initializer));
      const code = ts.transpileModule(`const handler = ${declaration.initializer.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
      return new Function('setWorkspace', 'idOf', `${code}\nreturn handler;`)(update => { workspace = update(workspace); }, id => String(id ?? ''));
    };
    const accept = callback('handleCheckItemSaved'), remove = callback('handleCheckItemRemoved');
    accept({ id: 25, projectId: 7, title: 'Updated' });
    assert.equal(workspace.checkItems.length, 37); assert.equal(workspace.timeline.checkItems.length, 37);
    assert.equal(workspace.timeline.checkItems[24].title, 'Updated');
    accept({ id: 100, projectId: 7 }); assert.equal(workspace.checkItems.length, 38);
    const before = workspace; accept({ id: 50, projectId: 8 }); remove({ id: 1, projectId: 8 }); assert.equal(workspace, before);
    remove({ id: 100, projectId: 7 }); assert.equal(workspace.checkItems.length, 37); assert.equal(workspace.timeline.checkItems.length, 37);
    const callsites = [];
    const visit = node => { if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'ChecksView') callsites.push(node); ts.forEachChild(node, visit); }; visit(app);
    assert.equal(callsites.length, 1);
    const attributes = callsites[0].attributes.properties;
    for (const [name, expression] of [['workspaceLoading', 'loading'], ['onSaved', 'handleCheckItemSaved'], ['onRemoved', 'handleCheckItemRemoved']]) assert.ok(attributes.some(attribute => attribute.name?.getText(source) === name && attribute.initializer?.expression?.getText(source) === expression));
  });

  process.stdout.write(`${passed} check-item regression groups passed (real React DOM + services; full-array App callbacks checked by bounded AST).\n`);
} finally {
  if (renderer) await act(async () => { renderer.unmount(); });
  console.error = originalError;
  for (const url of objectUrls) originalRevoke(url);
  URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
  dom.window.close();
  for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  await rm(outputDir, { recursive: true, force: true });
}
