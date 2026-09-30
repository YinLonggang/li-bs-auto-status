import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

const root = dirname(fileURLToPath(import.meta.url));
const outputDir = await mkdtemp(resolve(tmpdir(), 'auto-status-pagination-'));
const require = createRequire(import.meta.url);
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://spa.example.test' });
const originals = new Map(['window', 'document', 'Event', 'IS_REACT_ACT_ENVIRONMENT', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true })) {
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
let checks = 0;
const check = async (name, run) => { await run(); checks++; process.stdout.write(`PASS ${name}\n`); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const pageOf = (results, count = results.length) => ({ results, count, next: null, previous: null });
const modules = {
  config: 'src/config.ts', http: 'src/services/http.ts', pagination: 'src/services/pagination.ts', attachmentContent: 'src/services/attachmentContent.ts',
  bsAutoStatusApi: 'src/services/bsAutoStatusApi.ts', usePaginatedList: 'src/hooks/usePaginatedList.ts', useRecordEditor: 'src/hooks/useRecordEditor.ts'
};
const mounted = new Set();
async function mountHook(hook, initialProps) {
  const container = document.createElement('div');
  document.body.append(container);
  const renderer = createRoot(container);
  let value;
  function Probe(props) { value = hook(props); return null; }
  const render = async props => { await act(async () => renderer.render(React.createElement(Probe, props))); };
  await render(initialProps);
  const instance = { get current() { return value; }, render, async unmount() { await act(async () => renderer.unmount()); container.remove(); mounted.delete(instance); } };
  mounted.add(instance);
  return instance;
}
try {
  for (const [name, path] of Object.entries(modules)) {
    const source = (await readFile(resolve(root, path), 'utf8')).replaceAll('import.meta.env', '({ VITE_BASE_API: "https://api.example.test" })');
    let output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
    output = output.replace(/from (['"])([^'"]+)\1/g, (match, quote, specifier) => {
      if (specifier === 'react') return `from ${JSON.stringify(pathToFileURL(require.resolve('react')).href)}`;
      const key = specifier.split('/').pop();
      return modules[key] ? `from './${key}.mjs'` : match;
    });
    await writeFile(resolve(outputDir, `${name}.mjs`), output);
  }
  const loadModule = name => import(pathToFileURL(resolve(outputDir, `${name}.mjs`)).href);
  const { listUrl, parsePage, requestDirectory } = await loadModule('pagination');
  const api = await loadModule('bsAutoStatusApi');
  const { ApiError } = await loadModule('http');
  const { usePaginatedList } = await loadModule('usePaginatedList');
  const { useRecordEditor, allowEditorNavigation } = await loadModule('useRecordEditor');

  await check('page metadata survives envelopes and empty/array responses', () => {
    assert.deepEqual(parsePage({ data: { count: 21, next: '/?page=2', previous: null, results: [{ id: 1 }] } }, x => x.id), { count: 21, next: '/?page=2', previous: null, results: [1] });
    assert.deepEqual(parsePage([], x => x), pageOf([]));
    assert.throws(() => parsePage({ detail: 'not a list' }, x => x), /results/);
    assert.equal(listUrl('/issues/?project=21', { q: 'a&b', owner: '', page: 2, enabled: false }), '/issues/?project=21&q=a%26b&page=2&enabled=false');
  });
  await check('complete directories traverse pages without following arbitrary next URLs', async () => {
    const calls = [];
    const rows = await requestDirectory('/templates/?active=true', x => x.id, async path => {
      calls.push(path);
      return calls.length === 1 ? { count: 3, next: 'https://untrusted.example/page/2', results: [{ id: 1 }, { id: 2 }] } : pageOf([{ id: 3 }], 3);
    });
    assert.deepEqual(rows, [1, 2, 3]);
    assert.deepEqual(calls, ['/templates/?active=true&page=1&page_size=200', '/templates/?active=true&page=2&page_size=200']);
    await assert.rejects(requestDirectory('/templates/', x => x, async () => pageOf([1], 2)), /不完整/);
    await assert.rejects(requestDirectory('/templates/', x => x, async () => ({ count: 3, next: '?page=2', results: [1] })), /未前进/);
  });
  await check('workspace retrieves requested ID independently and loads each directory only once', async () => {
    const requests = [];
    globalThis.fetch = async (url, init) => {
      const parsed = new URL(url);
      requests.push(parsed.pathname + parsed.search);
      assert.equal(parsed.origin, 'https://api.example.test');
      assert.equal(init.credentials, 'include');
      let payload = [];
      if (parsed.pathname.endsWith('/dashboard/projects/205/')) payload = { timeline: { project_id: 205, phases: [], check_items: [] } };
      else if (parsed.pathname.endsWith('/projects/205/')) payload = { id: 205, code: 'target', name: 'Requested project' };
      else if (parsed.pathname.endsWith('/projects/')) {
        payload = parsed.searchParams.get('page') === '2'
          ? pageOf([{ id: 201, code: 'last', name: 'Last directory project' }], 201)
          : { count: 201, next: '?page=2', results: Array.from({ length: 200 }, (_, i) => ({ id: i + 1, name: `Project ${i + 1}` })) };
      } else if (parsed.pathname.endsWith('/dashboard/')) payload = {};
      else if (parsed.pathname.endsWith('/reports/')) payload = {};
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const workspace = await api.fetchWorkspaceData(205);
    assert.equal(workspace.selectedProject.id, 205);
    assert.equal(workspace.projects.length, 201);
    for (const directory of ['phase-templates', 'inspection-modules', 'checklist-templates', 'idaas-candidates']) {
      assert.equal(requests.filter(path => path.includes(`/${directory}/`)).length, 1, directory);
    }
    assert.equal(requests.filter(path => path.includes('/timeline/')).length, 0);
    assert.ok(requests.some(path => path.includes('/projects/205/check-items/')));
    globalThis.fetch = async url => new Response(JSON.stringify({ detail: 'not found' }), { status: String(url).includes('/projects/999/') ? 404 : 200 });
    await assert.rejects(api.fetchWorkspaceData(999));
  });
  await check('server list filters, count and abort signal cross the service boundary', async () => {
    const controller = new AbortController();
    globalThis.fetch = async (url, init) => {
      const query = new URL(url).searchParams;
      assert.equal(query.get('page'), '2');
      assert.equal(query.get('q'), 'needle');
      assert.equal(query.get('project'), '205');
      assert.equal(init.signal, controller.signal);
      return new Response(JSON.stringify({ count: 21, next: null, previous: '?page=1', results: [{ id: 21, title: 'needle' }] }));
    };
    const result = await api.listKeyIssues({ page: 2, page_size: 20, q: 'needle', project: 205 }, controller.signal);
    assert.equal(result.count, 21);
    assert.equal(result.results[0].id, 21);
    assert.equal(result.previous, '?page=1');
  });
  await check('filter changes reset page, abort requests and ignore late success/error', async () => {
    const requests = [];
    const load = (query, signal) => { const next = deferred(); requests.push({ ...next, query, signal }); return next.promise; };
    const hook = await mountHook(props => usePaginatedList(load, props.filters), { filters: { q: 'old' } });
    await act(async () => requests[0].resolve(pageOf(['first'], 41)));
    await act(async () => hook.current.setPage(3));
    const old = requests.at(-1);
    await hook.render({ filters: { q: 'new' } });
    assert.equal(hook.current.page, 1);
    assert.equal(hook.current.data, null);
    assert.equal(old.signal.aborted, true);
    const newest = requests.at(-1);
    await act(async () => newest.resolve(pageOf(['new result'])));
    await act(async () => old.reject(new Error('late failure')));
    assert.deepEqual(hook.current.data.results, ['new result']);
    assert.equal(hook.current.error, '');
    await act(async () => hook.current.refresh());
    const staleSuccess = requests.at(-1);
    await hook.render({ filters: { q: 'latest' } });
    await act(async () => requests.at(-1).resolve(pageOf(['latest'])));
    await act(async () => staleSuccess.resolve(pageOf(['wrong'])));
    assert.deepEqual(hook.current.data.results, ['latest']);
    await act(async () => hook.current.setPageSize(50));
    assert.equal(requests.at(-1).query.page, 1);
    assert.equal(requests.at(-1).query.page_size, 50);
    await hook.unmount();
    assert.equal(requests.at(-1).signal.aborted, true);
  });
  await check('deleting the last row of the last page recovers from DRF page 404', async () => {
    let deleted = false;
    const load = async query => {
      if (deleted && query.page === 2) throw new ApiError('Invalid page', 404);
      return pageOf(query.page === 2 ? ['last'] : ['first'], deleted ? 20 : 21);
    };
    const hook = await mountHook(() => usePaginatedList(load, {}), {});
    await act(async () => hook.current.setPage(2));
    assert.deepEqual(hook.current.data.results, ['last']);
    deleted = true;
    await act(async () => hook.current.refresh());
    assert.equal(hook.current.page, 1);
    assert.equal(hook.current.data.count, 20);
    await hook.unmount();
  });
  await check('record drafts survive asset refresh, cancelled close and navigation', async () => {
    let saved = { id: 21, title: 'Saved', attachments: [] };
    const toDraft = record => ({ title: record?.title ?? '' });
    const hook = await mountHook(props => useRecordEditor(toDraft, async () => saved, props.saving), { saving: false });
    await act(async () => hook.current.openRecord(21));
    await act(async () => hook.current.setDraft({ title: 'Unsaved' }));
    saved = { ...saved, attachments: [{ id: 1 }] };
    await act(async () => hook.current.refresh());
    assert.equal(hook.current.draft.title, 'Unsaved');
    assert.equal(hook.current.record.attachments.length, 1);
    assert.equal(hook.current.dirty, true);
    window.confirm = () => false;
    await act(async () => hook.current.close());
    assert.equal(hook.current.open, true);
    assert.equal(allowEditorNavigation(), false);
    await act(async () => hook.current.openRecord(99));
    assert.equal(hook.current.record.id, 21);
    await hook.render({ saving: true });
    window.confirm = () => true;
    assert.equal(allowEditorNavigation(), false);
    await act(async () => hook.current.close());
    assert.equal(hook.current.open, true);
    await hook.render({ saving: false });
    await act(async () => hook.current.accept({ id: 21, title: 'Unsaved' }, hook.current.draft));
    assert.equal(hook.current.dirty, false);
    assert.equal(allowEditorNavigation(), true);
    await act(async () => hook.current.close());
    assert.equal(hook.current.open, false);
    await act(async () => hook.current.openRecord());
    assert.equal(hook.current.record, null);
    await act(async () => hook.current.accept({ id: 22, title: 'Created' }, { title: 'Created' }));
    assert.equal(hook.current.record.id, 22);
    assert.equal(hook.current.open, true);
    assert.equal(hook.current.dirty, false);
    await hook.unmount();
  });
  await check('late record detail and asset responses cannot overwrite another selection', async () => {
    const requests = [];
    const retrieve = (id, signal) => { const next = deferred(); requests.push({ ...next, id, signal }); return next.promise; };
    const hook = await mountHook(() => useRecordEditor(record => ({ title: record?.title ?? '' }), retrieve, false), {});
    await act(async () => { void hook.current.openRecord(1); });
    await act(async () => { void hook.current.openRecord(2); });
    assert.equal(requests[0].signal.aborted, true);
    await act(async () => requests[1].resolve({ id: 2, title: 'Second' }));
    await act(async () => requests[0].resolve({ id: 1, title: 'Stale' }));
    assert.equal(hook.current.record.id, 2);
    await act(async () => { void hook.current.refresh(); });
    const asset = requests.at(-1);
    await act(async () => { void hook.current.openRecord(3); });
    assert.equal(asset.signal.aborted, true);
    await act(async () => requests.at(-1).resolve({ id: 3, title: 'Third' }));
    await act(async () => asset.resolve({ id: 2, title: 'Old assets' }));
    assert.equal(hook.current.record.id, 3);
    await hook.unmount();
  });
  process.stdout.write(`${checks} pagination and record editor checks passed\n`);
} finally {
  for (const hook of mounted) await hook.unmount();
  dom.window.close();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  await rm(outputDir, { recursive: true, force: true });
}
