import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, extname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

// Transpile the real App and dependencies into a disposable directory, as in
// test-template-matrix.mjs. No production exports or application files change.
const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const appPath = resolve(root, 'src/App.tsx');
const apiOrigin = 'https://api.drawer.example.test';
const prefix = '/api/li-bs-auto-status/v1';
const outputDir = await mkdtemp(resolve(tmpdir(), 'auto-status-drawers-'));
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://spa.drawer.example.test', pretendToBeVisual: true
});
const compiled = new Map();
const originals = new Map();
const blockedRequests = [];
const consoleErrors = [];
const originalConsoleError = console.error;
const objectUrls = new Set();
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
URL.createObjectURL = blob => {
  const url = originalCreateObjectURL(blob);
  objectUrls.add(url);
  return url;
};
URL.revokeObjectURL = url => { objectUrls.delete(url); originalRevokeObjectURL(url); };
let backend;
let renderer;
let mountedProps;
let mountedKind;
let views;
let api;
let allowEditorNavigation;
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
// Keep Node's File/FormData/Blob together so real service multipart requests and
// URL.createObjectURL work; jsdom file inputs receive these files explicitly.
installGlobal('fetch', async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.origin !== apiOrigin || !url.pathname.startsWith(`${prefix}/`)) {
    blockedRequests.push(url.href);
    throw new Error(`Network outside the in-memory test API is forbidden: ${url.href}`);
  }
  assert.ok(backend, 'A mounted test must own every API request');
  assert.equal(init.credentials, 'include', 'Real services must retain credential handling');
  return backend.fetch(url, init);
});
dom.window.fetch = globalThis.fetch;
dom.window.confirm = message => { confirmCalls.push(message); return confirmResult; };
console.error = (...args) => { consoleErrors.push(args); originalConsoleError(...args); };

async function compile(path) {
  if (compiled.has(path)) return compiled.get(path);
  const outputPath = resolve(outputDir, `${compiled.size}.mjs`);
  compiled.set(path, outputPath);
  let source = (await readFile(path, 'utf8')).replaceAll('import.meta.env', `({ VITE_BASE_API: ${JSON.stringify(apiOrigin)} })`);
  if (path === appPath) source += '\nexport { IssuesCrudView, CollisionCrudView };\n';
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
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const kinds = [
  { key: 'issue', path: 'key-issues', objectType: 'key_issue', auditType: 'KeyIssue', view: 'IssuesCrudView' },
  { key: 'collision', path: 'collision-reports', objectType: 'collision_report', auditType: 'CollisionReport', view: 'CollisionCrudView' }
];
const project = { id: 7, code: 'TEST-ONLY', name: 'In-memory project' };
const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

function attachment(id, fileName, caption = '') {
  return {
    id, file_name: fileName, content_type: fileName.endsWith('.png') ? 'image/png' : 'application/pdf',
    file_size: 20, can_preview: true, can_download: true, created_at: '2026-09-29T00:00:00Z',
    metadata: { caption, key_issue_slot: 'description', collision_slot: 'problemDescription', section_key: 'section_1' }
  };
}
function record(kind, id, title, attachments = []) {
  return {
    id, project: project.id, title, phase: null, module: null, check_item: null,
    description: 'Original body', severity: 'medium', status: kind.key === 'issue' ? 'open' : 'draft',
    report_date: '2026-09-29', owner_name: '', due_date: null, metadata: { risk_level: 'medium' },
    content: { problemDescription: 'Original body', problemDefinition: 'Original definition', parts: 'Original parts' },
    attachments: clone(attachments), blocks: []
  };
}

class MemoryApi {
  records = new Map(kinds.map(kind => [kind.path, new Map()]));
  calls = [];
  audits = [];
  nextId = 100;
  nextAttachmentId = 1000;
  uploadAttempts = [];
  unexpectedRequests = [];
  failedUploadAt = 0;
  gates = [];

  seed(kind, row) { this.records.get(kind.path).set(row.id, clone(row)); }
  rows(kind) { return [...this.records.get(kind.path).values()]; }
  holdNext(predicate) {
    const gate = { predicate, release: deferred(), used: false };
    this.gates.push(gate);
    return gate;
  }
  matching(method, path) { return this.calls.filter(call => call.method === method && call.path === path); }
  audit(kind, id, action) {
    this.audits.push({ id: this.audits.length + 1, object_type: kind.auditType, object_id: String(id), action, project: project.id, created_at: '2026-09-29T00:00:00Z' });
  }
  async fetch(url, init) {
    const call = { method: init.method || 'GET', path: url.pathname.slice(prefix.length), url, body: init.body, signal: init.signal };
    this.calls.push(call);
    const gate = this.gates.find(item => !item.used && item.predicate(call));
    if (gate) {
      gate.used = true;
      await gate.release.promise;
    }
    if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    for (const kind of kinds) {
      const rows = this.records.get(kind.path);
      if (call.path === `/${kind.path}/` && call.method === 'GET') {
        let results = [...rows.values()];
        const q = url.searchParams.get('q');
        if (q) results = results.filter(row => row.title.includes(q));
        const page = Number(url.searchParams.get('page') || 1);
        const pageSize = Number(url.searchParams.get('page_size') || 20);
        return json({ count: results.length, next: null, previous: null, results: clone(results.slice((page - 1) * pageSize, page * pageSize)) });
      }
      if (call.path === `/projects/${project.id}/${kind.path}/` && call.method === 'POST') {
        const payload = JSON.parse(call.body);
        const row = { ...record(kind, this.nextId++, payload.title), ...payload };
        rows.set(row.id, row);
        this.audit(kind, row.id, `${kind.auditType}.create`);
        return json(clone(row), 201);
      }
      const match = call.path.match(new RegExp(`^/${kind.path}/(\\d+)/$`));
      if (match) {
        const row = rows.get(Number(match[1]));
        assert.ok(row, `Unknown ${kind.key} fixture ${match[1]}`);
        if (call.method === 'GET') return json(clone(row));
        if (call.method === 'PATCH') {
          Object.assign(row, JSON.parse(call.body));
          this.audit(kind, row.id, `${kind.objectType}.update`);
          return json(clone(row));
        }
      }
    }
    if (call.path === '/audit-logs/' && call.method === 'GET') {
      const results = this.audits.filter(log => log.object_type === url.searchParams.get('object_type') && log.object_id === url.searchParams.get('object_id'));
      return json({ count: results.length, next: null, previous: null, results: clone(results) });
    }
    if (call.path === '/attachments/upload/' && call.method === 'POST') {
      assert.ok(call.body instanceof FormData, 'Exercise the actual multipart service');
      const objectType = call.body.get('object_type');
      const objectId = Number(call.body.get('object_id'));
      const file = call.body.get('file');
      const metadata = JSON.parse(call.body.get('metadata'));
      const kind = kinds.find(item => item.objectType === objectType);
      assert.ok(kind, 'Attachment upload must retain its concrete object type');
      const row = this.records.get(kind.path).get(objectId);
      assert.ok(row, 'Attachment must target the object returned by create');
      this.uploadAttempts.push({ objectType, objectId, fileName: file.name, metadata });
      if (this.uploadAttempts.length === this.failedUploadAt) return json({ detail: 'Simulated attachment transfer failure' }, 503);
      const saved = { ...attachment(this.nextAttachmentId++, file.name), metadata };
      row.attachments.push(saved);
      return json(clone(saved), 201);
    }
    const metadataMatch = call.path.match(/^\/attachments\/(\d+)\/metadata\/$/);
    if (metadataMatch && call.method === 'PATCH') {
      const found = [...this.records.values()].flatMap(rows => [...rows.values()]).flatMap(row => row.attachments).find(item => item.id === Number(metadataMatch[1]));
      assert.ok(found, 'Metadata update must target an existing attachment');
      found.metadata = JSON.parse(call.body).metadata;
      return json(clone(found));
    }
    if (/^\/attachments\/\d+\/preview\/$/.test(call.path) && call.method === 'GET') {
      return new Response(imageBytes, { headers: { 'Content-Type': 'image/png' } });
    }
    this.unexpectedRequests.push(`${call.method} ${call.path}`);
    throw new Error(`Unhandled in-memory API request: ${call.method} ${call.path}`);
  }
}

const container = () => document.getElementById('root');
const dialog = () => container().querySelector('[role="dialog"]');
const buttons = scope => [...scope.querySelectorAll('button')];
function button(text, scope = container()) {
  const found = buttons(scope).find(item => item.textContent.trim() === text);
  assert.ok(found, `Missing button ${text}`);
  return found;
}
const footer = () => dialog().querySelector('footer');
const mainSave = () => button('保存', footer());
const listButtons = () => [...container().querySelectorAll(':scope > section > .table-shell table tbody button')];
function titleInput(kind) {
  if (kind.key === 'collision') return dialog().querySelector('.collision-title-field input');
  const label = [...dialog().querySelectorAll('label')].find(item => item.querySelector('.field-label')?.textContent === '标题');
  assert.ok(label, 'Missing issue title label');
  return label.querySelector('input');
}
function bodyInput(kind) {
  if (kind.key === 'collision') return dialog().querySelector('.collision-field textarea');
  const label = [...dialog().querySelectorAll('label')].find(item => item.querySelector('.field-label')?.textContent === '描述');
  assert.ok(label, 'Missing issue description label');
  return label.querySelector('textarea');
}
function uploadInput(kind) {
  const found = dialog().querySelector(kind.key === 'issue' ? '.issue-field-assets input[type="file"]' : '.collision-field input[type="file"]');
  assert.ok(found, 'Missing actual attachment upload control');
  return found;
}
function captionInput(fileName) {
  const name = [...dialog().querySelectorAll('[title]')].find(item => item.getAttribute('title') === fileName);
  assert.ok(name, `Missing attachment card ${fileName}`);
  const card = name.closest('.collision-block-card') || name.closest('.rounded-lg');
  const input = card?.querySelector('input');
  assert.ok(input, `Missing caption input for ${fileName}`);
  return input;
}
async function click(target) {
  assert.ok(target, 'Click target must exist');
  await act(async () => { target.click(); });
}
async function typeInto(input, value) {
  assert.ok(input && !input.disabled, 'Typing requires an enabled form control');
  await act(async () => {
    input.focus();
    const prototype = input.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  assert.equal(input.value, value);
}
async function upload(kind, files) {
  const input = uploadInput(kind);
  assert.equal(input.disabled, false, 'Upload must use an enabled control');
  await act(async () => {
    Object.defineProperty(input, 'files', { configurable: true, value: files });
    input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
}
async function escape() {
  await act(async () => { dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
}
async function until(predicate, message) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await act(async () => { await new Promise(done => setTimeout(done, 5)); });
  }
  assert.ok(predicate(), message);
}
const settled = () => dialog() && mainSave().disabled === false;
const pdf = name => new File(['test-only attachment'], name, { type: 'application/pdf' });
const png = name => new File([imageBytes], name, { type: 'image/png' });

function propsFor(kind, workspaceLoading) {
  const unavailable = async () => { throw new Error('This test must not invoke unrelated application actions'); };
  const common = {
    project, phases: [], modules: [], checkItems: [], canWrite: true, workspaceLoading,
    onImportCsv: unavailable, onExportCsv: unavailable, onDownloadTemplate: unavailable,
    onExportExcel: unavailable, onDownloadAttachment: unavailable, onDeleteAttachment: unavailable,
    onUpdateAttachmentCaption: (item, caption) => api.updateAttachmentMetadata(item.id, { ...item.metadata, caption })
  };
  if (kind.key === 'issue') return {
    ...common,
    onCreateIssue: draft => api.createKeyIssue(project.id, draft),
    onUpdateIssue: (item, draft) => api.updateKeyIssue(item.id, draft),
    onDeleteIssue: unavailable,
    onUploadIssueAttachment: (item, file, metadata) => api.uploadAttachment({ file, projectId: item.projectId, objectType: kind.objectType, objectId: item.id, metadata })
  };
  return {
    ...common,
    onCreateReport: draft => api.createCollisionReport(project.id, draft),
    onUpdateReport: (item, draft) => api.updateCollisionReport(item.id, { ...draft, content: item.content, metadata: item.metadata }),
    onDeleteReport: unavailable,
    onUploadReportAttachment: (item, file, metadata) => api.uploadAttachment({ file, projectId: item.projectId, objectType: kind.objectType, objectId: item.id, metadata })
  };
}
async function mount(kind, { rows = [], workspaceLoading = false } = {}) {
  backend = new MemoryApi();
  rows.forEach(row => backend.seed(kind, row));
  mountedKind = kind;
  mountedProps = propsFor(kind, workspaceLoading);
  renderer = createRoot(container());
  await act(async () => { renderer.render(React.createElement(views[kind.view], mountedProps)); });
  await until(() => backend.matching('GET', `/${kind.path}/`).length > 0 && listButtons().length === rows.length, 'Initial paged list did not settle');
}
async function workspaceLoading(value) {
  mountedProps = { ...mountedProps, workspaceLoading: value };
  await act(async () => { renderer.render(React.createElement(views[mountedKind.view], mountedProps)); });
}
async function openExisting(title) {
  await click(button(title));
  await until(settled, 'Record detail did not load');
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
    if (backend) {
      await act(async () => { backend.gates.forEach(gate => gate.release.resolve()); });
    }
    if (renderer) {
      await act(async () => { renderer.unmount(); });
      renderer = null;
    }
    container().replaceChildren();
    backend = null;
  }
}

try {
  // Import react-dom after installing jsdom: React's input event detection needs
  // a real document at module initialization, not a private React handler call.
  ({ createRoot } = await import('react-dom/client'));
  views = await import(pathToFileURL(await compile(appPath)).href);
  api = await import(pathToFileURL(await compile(resolve(root, 'src/services/bsAutoStatusApi.ts'))).href);
  ({ allowEditorNavigation } = await import(pathToFileURL(await compile(resolve(root, 'src/hooks/useRecordEditor.ts'))).href));

  for (const kind of kinds) {
    await run(`${kind.key}: deferred save disables real fields and retains the submitted draft`, async () => {
      await mount(kind, { rows: [record(kind, 11, 'Existing record')] });
      await openExisting('Existing record');
      await typeInto(titleInput(kind), 'Saved title');
      await typeInto(bodyInput(kind), 'Saved body');
      if (kind.key === 'collision') {
        const summary = dialog().querySelectorAll('.collision-summary-field input, .collision-summary-field textarea');
        assert.equal(summary.length, 8, 'Cover every rendered summary field');
        await typeInto(summary[0], 'Saved definition');
        await typeInto(summary[1], 'Saved parts');
      }
      const gate = backend.holdNext(call => call.method === 'PATCH' && call.path === `/${kind.path}/11/`);
      await click(mainSave());
      await until(() => gate.used, 'The expected save request was not issued');
      assert.equal(titleInput(kind).disabled, true);
      assert.equal(bodyInput(kind).disabled, true);
      if (kind.key === 'collision') {
        const summary = [...dialog().querySelectorAll('.collision-summary-field input, .collision-summary-field textarea')];
        assert.equal(summary.length, 8);
        assert.ok(summary.every(input => input.disabled), 'No summary field may accept edits while its old snapshot is saving');
      }
      assert.equal(mainSave().disabled, true);
      assert.equal(button('关闭', footer()).disabled, true);
      await escape();
      assert.ok(dialog(), 'Saving blocks Escape');
      assert.equal(allowEditorNavigation(), false, 'Saving blocks navigation');
      await act(async () => { gate.release.resolve(); });
      await until(settled, 'Deferred save did not finish');
      assert.equal(titleInput(kind).value, 'Saved title');
      assert.equal(bodyInput(kind).value, 'Saved body');
      assert.equal(backend.rows(kind)[0].title, 'Saved title');
      assert.equal(backend.matching('PATCH', `/${kind.path}/11/`).length, 1);
      assert.ok(!footer().textContent.includes('有未保存'), 'Successful save adopts its returned object and baseline');
    });

    await run(`${kind.key}: title validation and first/second attachment uploads reuse the created object`, async () => {
      await mount(kind);
      await click(button('新增'));
      assert.ok(dialog());
      assert.equal(mainSave().disabled, true, 'Empty title must not save');
      if (kind.key === 'issue') assert.equal(uploadInput(kind).disabled, true, 'Untitled issue must not upload');
      else await upload(kind, [pdf('untitled.pdf')]);
      assert.equal(backend.rows(kind).length, 0);
      assert.equal(backend.uploadAttempts.length, 0);
      assert.ok(!dialog().textContent.includes('已上传 1'), 'Validation failure must not claim an uploaded file');
      await typeInto(titleInput(kind), `New ${kind.key}`);
      await typeInto(bodyInput(kind), 'Draft before first attachment');
      const gate = backend.holdNext(call => call.method === 'POST' && call.path === `/projects/${project.id}/${kind.path}/`);
      await upload(kind, [pdf('first.pdf')]);
      await until(() => gate.used, 'The expected save request was not issued');
      assert.equal(backend.uploadAttempts.length, 0, 'Upload waits for the new object ID');
      assert.equal(titleInput(kind).disabled, true);
      await act(async () => { gate.release.resolve(); });
      await until(() => settled() && dialog().textContent.includes('first.pdf') && listButtons().some(item => item.textContent === `New ${kind.key}`), 'Created object and its first attachment were not refreshed');
      const id = backend.rows(kind)[0].id;
      assert.ok(id >= 100);
      assert.equal(backend.uploadAttempts[0].objectId, id);
      assert.equal(backend.uploadAttempts[0].objectType, kind.objectType);
      assert.equal(bodyInput(kind).value, 'Draft before first attachment');
      assert.ok(!dialog().querySelector('header h2').textContent.startsWith('新增'), 'Returned ID changes the drawer to existing-object editing');
      await upload(kind, [pdf('second.pdf')]);
      await until(() => settled() && dialog().textContent.includes('second.pdf'), 'Second attachment was not refreshed');
      assert.equal(backend.matching('POST', `/projects/${project.id}/${kind.path}/`).length, 1, 'A second upload must not create a duplicate');
      assert.deepEqual(backend.uploadAttempts.map(item => item.objectId), [id, id]);
      assert.equal(backend.rows(kind)[0].attachments.length, 2);
      assert.equal(backend.matching('PATCH', `/${kind.path}/${id}/`).length, 1);
      assert.ok(backend.calls.some(call => call.path === '/audit-logs/' && call.url.searchParams.get('object_type') === kind.auditType && call.url.searchParams.get('object_id') === String(id)), 'Created-object audit uses its returned ID and stored model name');
    });

    await run(`${kind.key}: caption drafts guard close/navigation and survive other caption/body saves`, async () => {
      const attachments = [attachment(41, 'alpha.pdf', 'Old alpha'), attachment(42, 'beta.pdf', 'Old beta')];
      await mount(kind, { rows: [record(kind, 11, 'Caption record', attachments)] });
      await openExisting('Caption record');
      await typeInto(captionInput('alpha.pdf'), 'New alpha');
      await typeInto(captionInput('beta.pdf'), 'New beta');
      assert.ok(footer().textContent.includes('有未保存'), 'Attachment drafts register with the parent editor');
      await escape();
      assert.equal(confirmCalls.length, 1, 'Caption-only Escape asks before discarding');
      assert.ok(dialog());
      assert.equal(allowEditorNavigation(), false, 'Caption-only navigation can be cancelled');
      assert.equal(confirmCalls.length, 2);
      const unload = new dom.window.Event('beforeunload', { cancelable: true });
      dom.window.dispatchEvent(unload);
      assert.equal(unload.defaultPrevented, true, 'Caption drafts also protect page unload');
      await typeInto(titleInput(kind), 'Caption record saved');
      await click(mainSave());
      await until(settled, 'Body save did not settle');
      assert.equal(captionInput('alpha.pdf').value, 'New alpha', 'Body save does not clear caption alpha');
      assert.equal(captionInput('beta.pdf').value, 'New beta', 'Body save does not clear caption beta');
      assert.equal(backend.rows(kind)[0].attachments[0].metadata.caption, 'Old alpha', 'Main save does not pretend to persist an independent caption');
      assert.ok(footer().textContent.includes('有未保存'));
      await typeInto(bodyInput(kind), 'Unsaved body survives asset refresh');
      await click(button('保存', captionInput('alpha.pdf').closest('label')));
      await until(() => settled() && backend.rows(kind)[0].attachments[0].metadata.caption === 'New alpha', 'Caption alpha save did not finish');
      assert.equal(captionInput('beta.pdf').value, 'New beta', 'Saving alpha must not reset unsaved beta');
      assert.equal(backend.rows(kind)[0].attachments[1].metadata.caption, 'Old beta');
      assert.equal(bodyInput(kind).value, 'Unsaved body survives asset refresh', 'Related asset retrieval must not overwrite the body draft');
      await click(mainSave());
      await until(settled, 'Second body save did not finish');
      assert.equal(captionInput('beta.pdf').value, 'New beta');
      assert.ok(footer().textContent.includes('有未保存'), 'Body acceptance must retain related dirty state');
      await click(button('关闭', footer()));
      assert.ok(dialog(), 'Cancelling close preserves the outstanding caption');
      assert.equal(confirmCalls.length, 3);
      await click(button('保存', captionInput('beta.pdf').closest('label')));
      await until(() => settled() && !footer().textContent.includes('有未保存'), 'All saved captions should release the parent dirty guard');
      assert.deepEqual(backend.rows(kind)[0].attachments.map(item => item.metadata.caption), ['New alpha', 'New beta']);
      await click(button('关闭', footer()));
      assert.equal(dialog(), null);
      assert.equal(confirmCalls.length, 3, 'No discard prompt after every draft is saved');
      await openExisting('Caption record saved');
      await typeInto(captionInput('beta.pdf'), 'Discard this caption');
      confirmResult = true;
      await click(button('关闭', footer()));
      assert.equal(dialog(), null, 'Confirmed close discards an attachment-only draft');
      assert.equal(confirmCalls.length, 4);
      await openExisting('Caption record saved');
      assert.equal(captionInput('beta.pdf').value, 'New beta', 'Reopening does not resurrect a discarded caption');
      assert.ok(!footer().textContent.includes('有未保存'), 'A new drawer session has no leaked related dirty registrations');
    });

    for (const failureAt of [1, 2]) {
      await run(`${kind.key}: upload failure ${failureAt}/3 refreshes the created object and successful attachments`, async () => {
        await mount(kind);
        backend.failedUploadAt = failureAt;
        await click(button('新增'));
        const title = `Partial ${kind.key} ${failureAt}`;
        await typeInto(titleInput(kind), title);
        await upload(kind, [png('one.png'), png('two.png'), png('three.png')]);
        await until(() => settled() && dialog().textContent.includes('Simulated attachment transfer failure') && listButtons().some(item => item.textContent === title), 'Partial failure did not reconcile the created record into the actual list');
        assert.equal(backend.rows(kind).length, 1, 'The successful create must remain selected, not be retried');
        assert.equal(backend.uploadAttempts.length, failureAt, 'Files after the failed request are not falsely treated as uploaded');
        assert.equal(backend.rows(kind)[0].attachments.length, failureAt - 1);
        assert.ok(dialog().textContent.includes(`已上传 ${failureAt - 1}/3 个`), 'Failure reports the exact successful count out of the selected files');
        const id = backend.rows(kind)[0].id;
        const failedRequestIndex = backend.calls.findLastIndex(call => call.path === '/attachments/upload/');
        assert.ok(backend.calls.slice(failedRequestIndex + 1).some(call => call.path === `/${kind.path}/${id}/`), 'Always retrieve current detail after partial failure');
        assert.ok(backend.calls.slice(failedRequestIndex + 1).some(call => call.path === `/${kind.path}/`), 'Always refresh the paginated list after partial failure');
        if (failureAt === 2) {
          assert.ok(dialog().textContent.includes('one.png'), 'Successfully uploaded attachment is visible without reopening');
          assert.match(dialog().textContent, /已(?:成功)?上传\s*1(?:\s|个|\/)/, 'Partial failure reports one real success, not three');
        }
        if (kind.key === 'collision') {
          const pending = [...dialog().querySelectorAll('.collision-block-card.is-pending')];
          assert.equal(pending.length, 4 - failureAt, 'Only failed/unattempted images remain pending');
          assert.ok(pending.every(card => card.classList.contains('is-error')));
          if (failureAt === 2) assert.ok(pending.every(card => !card.textContent.includes('one.png')), 'A successful image must not be labelled failed');
        }
      });
    }

    await run(`${kind.key}: workspace loading blocks new/detail opens and freezes an existing dirty drawer`, async () => {
      await mount(kind, { rows: [record(kind, 11, 'Workspace A'), record(kind, 12, 'Workspace B')], workspaceLoading: true });
      assert.equal(button('新增').disabled, true);
      await click(button('新增'));
      await click(button('Workspace A'));
      await click(button('Workspace A').closest('tr'));
      assert.equal(dialog(), null, 'Neither a row nor its title can open while a workspace response is pending');
      assert.equal(backend.matching('GET', `/${kind.path}/11/`).length, 0);
      await workspaceLoading(false);
      await openExisting('Workspace A');
      await typeInto(titleInput(kind), 'Unsaved workspace title');
      await workspaceLoading(true);
      assert.equal(titleInput(kind).disabled, true);
      assert.equal(bodyInput(kind).disabled, true);
      if (kind.key === 'collision') assert.ok([...dialog().querySelectorAll('.collision-summary-field input, .collision-summary-field textarea')].every(input => input.disabled));
      assert.equal(mainSave().disabled, true);
      await click(button('Workspace B'));
      await click(button('Workspace B').closest('tr'));
      await escape();
      assert.equal(allowEditorNavigation(), false);
      assert.equal(confirmCalls.length, 0, 'Pending workspace blocks navigation rather than offering a stale discard choice');
      assert.equal(backend.matching('GET', `/${kind.path}/12/`).length, 0);
      assert.equal(titleInput(kind).value, 'Unsaved workspace title');
      await workspaceLoading(false);
      assert.equal(titleInput(kind).disabled, false);
      assert.equal(titleInput(kind).value, 'Unsaved workspace title');
      await click(button('关闭', footer()));
      assert.ok(dialog());
      assert.equal(confirmCalls.length, 1, 'After loading the original dirty guard still works');
      confirmResult = true;
      await click(button('关闭', footer()));
      assert.equal(dialog(), null);
    });
  }

  await run('issue: clearing an existing title prevents file and clipboard uploads without false success', async () => {
    const kind = kinds[0];
    await mount(kind, { rows: [record(kind, 11, 'Clear title')] });
    await openExisting('Clear title');
    await typeInto(titleInput(kind), '');
    assert.equal(mainSave().disabled, true);
    assert.ok([...dialog().querySelectorAll('input[type="file"]')].every(input => input.disabled));
    const file = png('clipboard.png');
    const event = new dom.window.Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { files: [file], items: [], getData: () => '' } });
    await act(async () => { bodyInput(kind).dispatchEvent(event); });
    assert.equal(backend.uploadAttempts.length, 0);
    assert.equal(backend.matching('PATCH', '/key-issues/11/').length, 0);
    assert.ok(!dialog().textContent.includes('已上传'), 'Validation is not reported as a successful mutation');
  });

  await run('App wiring (bounded AST): both real CrudView callsites receive workspaceLoading={loading}', async () => {
    const source = ts.createSourceFile(appPath, await readFile(appPath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const app = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'App');
    assert.ok(app?.body, 'Inspect the actual App function rather than an unrelated string');
    const found = [];
    function visit(node) {
      if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && kinds.some(kind => kind.view === node.tagName.getText(source))) {
        const prop = node.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.getText(source) === 'workspaceLoading');
        assert.ok(prop?.initializer && ts.isJsxExpression(prop.initializer) && ts.isIdentifier(prop.initializer.expression) && prop.initializer.expression.text === 'loading', `${node.tagName.getText(source)} must receive the workspace's actual loading state`);
        found.push(node.tagName.getText(source));
      }
      ts.forEachChild(node, visit);
    }
    visit(app.body);
    assert.deepEqual(found.sort(), kinds.map(kind => kind.view).sort());
  });

  await run('App layout (bounded AST): withProjectContext constrains wide tables to a shrinkable single-column grid', async () => {
    const source = ts.createSourceFile(appPath, await readFile(appPath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const app = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'App');
    assert.ok(app?.body, 'Inspect the actual App layout scope');
    const declarations = app.body.statements
      .filter(ts.isVariableStatement)
      .flatMap(statement => [...statement.declarationList.declarations]);
    const wrapper = declarations.find(node => ts.isIdentifier(node.name) && node.name.text === 'withProjectContext');
    assert.ok(wrapper?.initializer && ts.isArrowFunction(wrapper.initializer), 'Locate the actual project wrapper function, not another grid');
    const unwrap = node => ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node;
    const element = unwrap(wrapper.initializer.body);
    assert.ok(ts.isJsxElement(element) && element.openingElement.tagName.getText(source) === 'div', 'Inspect the returned wrapper element');
    const className = element.openingElement.attributes.properties.find(node => ts.isJsxAttribute(node) && node.name.getText(source) === 'className');
    assert.ok(className?.initializer && ts.isStringLiteral(className.initializer), 'The layout classes belong to this wrapper');
    const classes = new Set(className.initializer.text.split(/\s+/));
    for (const required of ['grid', 'min-w-0', 'grid-cols-1', 'gap-5']) {
      assert.ok(classes.has(required), `Project context wrapper requires ${required}: wide child tables must not expand the page's grid track`);
    }
    assert.ok(element.children.some(node => ts.isJsxSelfClosingElement(node) && ts.isIdentifier(node.tagName) && node.tagName.text === 'ProjectContextBar'), 'The constrained wrapper contains project context');
    const contentParameter = wrapper.initializer.parameters[0]?.name;
    assert.ok(contentParameter && ts.isIdentifier(contentParameter));
    assert.ok(element.children.some(node => ts.isJsxExpression(node) && node.expression && ts.isIdentifier(node.expression) && node.expression.text === contentParameter.text), 'The content is a direct child of the constrained track');
    const renderView = declarations.find(node => ts.isIdentifier(node.name) && node.name.text === 'renderView');
    assert.ok(renderView?.initializer && ts.isArrowFunction(renderView.initializer));
    const wrappedViews = [];
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'withProjectContext') {
        for (const argument of node.arguments) {
          const child = unwrap(argument);
          if (ts.isJsxSelfClosingElement(child) && kinds.some(kind => kind.view === child.tagName.getText(source))) wrappedViews.push(child.tagName.getText(source));
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(renderView.initializer.body);
    assert.deepEqual(wrappedViews.sort(), kinds.map(kind => kind.view).sort(), 'Both wide-table CRUD views actually use the constrained wrapper');
  });

  process.stdout.write(`${passed} drawer regression groups passed (real React DOM + services; App loading and project wrapper checked by bounded AST).\n`);
} finally {
  if (renderer) await act(async () => { renderer.unmount(); });
  console.error = originalConsoleError;
  for (const url of objectUrls) originalRevokeObjectURL(url);
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  dom.window.close();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  await rm(outputDir, { recursive: true, force: true });
}
