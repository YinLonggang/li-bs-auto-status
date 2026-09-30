import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const outputDir = await mkdtemp(resolve(tmpdir(), 'auto-status-attachment-content-'));
const apiOrigin = 'https://api.attachments.example.test';
const prefix = '/api/li-bs-auto-status/v1';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://spa.attachments.example.test' });
const originals = new Map();
const requests = [];
const mounted = new Set();
const urls = new Set();
const revoked = new Set();
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
const originalError = console.error;
const consoleErrors = [];
let respond = () => { throw new Error('Every test must explicitly provide an in-memory response'); };
let createRoot;
let checks = 0;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
// Signature fixtures exercise the service boundary, not PDF/Office parsing.
const pdf = Buffer.from('%PDF-1.7\nsynthetic signature fixture\n%%EOF');
const zip = Buffer.from([0x50, 0x4b, 3, 4, 0, 0]);
const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const file = (bytes, type, disposition) => new Response(bytes, { headers: {
  'content-type': type, ...(disposition ? { 'content-disposition': disposition } : {})
} });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function install(key, value) {
  originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true })) install(key, value);
install('fetch', async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  assert.equal(url.origin, apiOrigin, 'Never resolve protected content against the SPA or an arbitrary host');
  assert.ok(url.pathname.startsWith(`${prefix}/`));
  assert.equal(init.credentials, 'include');
  const request = { url, init };
  requests.push(request);
  return respond(request);
});
URL.createObjectURL = blob => { const url = originalCreate(blob); urls.add(url); return url; };
URL.revokeObjectURL = url => { urls.delete(url); revoked.add(url); originalRevoke(url); };
console.error = (...args) => { consoleErrors.push(args); originalError(...args); };
const modules = {
  config: 'src/config.ts', http: 'src/services/http.ts', pagination: 'src/services/pagination.ts',
  attachmentContent: 'src/services/attachmentContent.ts', bsAutoStatusApi: 'src/services/bsAutoStatusApi.ts',
  useAttachmentPreview: 'src/hooks/useAttachmentPreview.ts', useAttachmentDownload: 'src/hooks/useAttachmentDownload.ts'
};
async function mountHook(hook, props = {}) {
  const container = document.createElement('div');
  document.body.append(container);
  const renderer = createRoot(container);
  let current;
  function Probe(next) { current = hook(next); return null; }
  const render = async next => { await act(async () => { renderer.render(React.createElement(Probe, next)); }); };
  await render(props);
  const instance = { get current() { return current; }, render, async unmount() { await act(async () => { renderer.unmount(); }); container.remove(); mounted.delete(instance); } };
  mounted.add(instance);
  return instance;
}
async function check(name, action) {
  const errors = consoleErrors.length;
  try {
    await action();
    assert.equal(consoleErrors.length, errors, 'React console errors fail the test');
    checks += 1;
    process.stdout.write(`PASS ${name}\n`);
  } finally {
    for (const hook of [...mounted]) await hook.unmount();
    assert.equal(urls.size, 0, 'Every preview Blob URL must be released after unmount');
    respond = () => { throw new Error('No response configured for this test'); };
  }
}
try {
  ({ createRoot } = await import('react-dom/client'));
  for (const [name, path] of Object.entries(modules)) {
    const source = (await readFile(resolve(root, path), 'utf8')).replaceAll('import.meta.env', `({ VITE_BASE_API: ${JSON.stringify(apiOrigin)} })`);
    let output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
    output = output.replace(/from (['"])([^'"]+)\1/g, (match, quote, specifier) => {
      if (specifier === 'react') return `from ${JSON.stringify(pathToFileURL(require.resolve('react')).href)}`;
      const key = specifier.split('/').pop();
      return modules[key] ? `from './${key}.mjs'` : match;
    });
    await writeFile(resolve(outputDir, `${name}.mjs`), output);
  }
  const load = name => import(pathToFileURL(resolve(outputDir, `${name}.mjs`)).href);
  const { attachmentPreviewKind, validateBinaryContent } = await load('attachmentContent');
  const api = await load('bsAutoStatusApi');
  const { ApiError, apiBlobRequest } = await load('http');
  const { useAttachmentPreview } = await load('useAttachmentPreview');
  const { useAttachmentDownload } = await load('useAttachmentDownload');
  const image = { id: 11, fileName: 'picture.png', previewKind: 'image', canPreview: true, canDownload: true };
  const documentFile = { id: 12, fileName: 'document.pdf', previewKind: 'pdf', canPreview: true, canDownload: true };

  await check('safe preview allowlist excludes active formats and normalizes MIME parameters', async () => {
    assert.equal(attachmentPreviewKind('IMAGE/PNG; charset=binary'), 'image');
    assert.equal(attachmentPreviewKind('application/pdf'), 'pdf');
    for (const mime of ['image/svg+xml', 'text/html', 'application/xhtml+xml', 'application/json', 'image/tiff', 'application/zip', '']) assert.equal(attachmentPreviewKind(mime), null, mime);
    const compatibleAvif = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypmif1'), Buffer.alloc(4), Buffer.from('mif1avif')]);
    for (const [bytes, mime, name] of [[png, 'image/png', 'picture.PNG'], [pdf, 'application/pdf', 'file.pdf'], [compatibleAvif, 'image/avif', 'picture.avif']]) await validateBinaryContent(new Blob([bytes], { type: mime }), name, true);
    for (const [bytes, mime, name] of [[zip, 'application/zip', 'archive.zip'], [zip, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'export.xlsx'], [ole, 'application/msword', 'legacy.doc'], ['[检查项] ordinary text', 'text/plain', 'notes.txt'], ['{notes} ordinary text', 'text/plain', 'notes.txt']]) await validateBinaryContent(new Blob([bytes], { type: mime }), name);
    await assert.rejects(validateBinaryContent(new Blob(['<svg/>'], { type: 'image/svg+xml' }), 'drawing.svg', true), /不支持安全在线预览/);
  });

  await check('HTML/JSON pseudo-success and MIME/extension/signature conflicts fail closed', async () => {
    for (const content of ['<!DOCTYPE html><html>login</html>', '﻿  <!-- gateway --> <html>login</html>', '<script>alert(1)</script>', '{"detail":"login"}', '[{"error":"denied"}]', '[]', '{}']) {
      await assert.rejects(validateBinaryContent(new Blob([content], { type: 'application/octet-stream' }), 'file.bin'), /HTML\/JSON/);
    }
    for (const mime of ['text/html', 'application/problem+json']) await assert.rejects(validateBinaryContent(new Blob([png], { type: mime })), /HTML\/JSON/);
    for (const [bytes, mime, name] of [[png, 'application/pdf', 'file.pdf'], [pdf, 'image/png', 'file.png'], [png, 'image/png', 'file.pdf'], ['bad', 'application/pdf', 'file.pdf'], [zip, 'application/msword', 'file.doc'], [png.subarray(0, 8), 'image/png', 'truncated.png'], ['%PDF-invalid\n', 'application/pdf', 'invalid.pdf'], ['GIF89a', 'image/gif', 'truncated.gif'], ['RIFF0000WEBPinvalid', 'image/webp', 'invalid.webp'], ['BM', 'image/bmp', 'truncated.bmp']]) await assert.rejects(validateBinaryContent(new Blob([bytes], { type: mime }), name), /内容与文件类型不一致/);
  });

  await check('real binary services preserve credentials, exact bytes, safe filenames and explicit abort signals', async () => {
    const controller = new AbortController();
    respond = ({ url, init }) => {
      assert.equal(init.signal, controller.signal);
      assert.equal(url.pathname, `${prefix}/attachments/12/download/`);
      return file(pdf, 'application/pdf', "attachment; filename*=UTF-8''..%2F%E6%A3%80%E6%9F%A5%5Cdocument.pdf");
    };
    const result = await api.fetchAttachmentDownload(12, 'fallback.pdf', controller.signal);
    assert.equal(result.fileName, '.._检查_document.pdf');
    assert.deepEqual(Buffer.from(await result.blob.arrayBuffer()), pdf);
    respond = () => file(png, 'image/png', 'inline; filename="picture.png"');
    const preview = await api.fetchAttachmentPreview(11, controller.signal);
    assert.deepEqual(Buffer.from(await preview.blob.arrayBuffer()), png);
    respond = () => file(zip, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'attachment; filename="export.xlsx"');
    assert.deepEqual(Buffer.from(await (await apiBlobRequest('/exports/1/file/')).blob.arrayBuffer()), zip, 'Other binary/Excel consumers retain their data');
    respond = () => file('plain', 'text/plain', 'attachment; filename="bad%name.txt"');
    assert.equal((await api.fetchAttachmentDownload(11)).fileName, 'bad%name.txt');
  });

  await check('binary 403 remains an API permission error; login HTML and JSON 200 never become files', async () => {
    const before = window.location.href;
    respond = () => new Response(JSON.stringify({ detail: 'Read-only account' }), { status: 403, headers: { 'content-type': 'application/json', 'x-request-id': 'test-request' } });
    await assert.rejects(api.fetchAttachmentDownload(11), error => error instanceof ApiError && error.status === 403 && error.requestId === 'test-request');
    assert.equal(window.location.href, before, '403 is not a signed-out redirect');
    respond = () => file('<html>Sign in</html>', 'text/html');
    await assert.rejects(api.fetchAttachmentDownload(11), /HTML\/JSON/);
    respond = () => file('{"detail":"Sign in"}', 'application/octet-stream');
    await assert.rejects(api.fetchAttachmentPreview(11), /HTML\/JSON/);
  });

  await check('normalizers preserve list counts/detail attachments and ignore unsafe backend preview URLs', async () => {
    respond = ({ url }) => {
      const row = { id: 21, project: 7, title: 'Check', attachment_count: 3, attachments: [
        { id: 1, file_name: 'safe.pdf', content_type: 'application/pdf', preview_kind: 'pdf', can_preview: true, download_url: 'https://untrusted.example/file', preview_url: '/wrong/origin' },
        { id: 2, file_name: 'script.svg', content_type: 'image/svg+xml', preview_kind: 'image', can_preview: true },
        { id: 3, file_name: 'wrong.png', content_type: 'image/png', preview_kind: 'pdf', can_preview: true }
      ] };
      return new Response(JSON.stringify(url.pathname.endsWith('/21/') ? row : { count: 21, next: '?page=2', previous: null, results: [row] }), { headers: { 'content-type': 'application/json' } });
    };
    const list = await api.listCheckItems({ project: 7, page: 1, page_size: 20 });
    assert.equal(list.count, 21);
    const detail = await api.fetchCheckItem(21);
    assert.equal(detail.attachmentCount, 3);
    assert.deepEqual(detail.attachments.map(item => item.canPreview), [true, false, false]);
    const count = requests.length;
    respond = ({ url }) => { assert.equal(url.pathname, `${prefix}/attachments/1/preview/`); return file(pdf, 'application/pdf'); };
    await api.fetchAttachmentPreview(detail.attachments[0].id);
    assert.equal(requests.length, count + 1);
  });

  await check('preview close aborts delayed content without reopening or allocating a late Blob URL', async () => {
    const gate = deferred();
    respond = () => gate.promise; // Deliberately ignore abort, exercising consumer isolation too.
    const hook = await mountHook(({ resourceKey }) => useAttachmentPreview(resourceKey), { resourceKey: 'A' });
    let pending;
    await act(async () => { pending = hook.current.openPreview(image); });
    const signal = requests.at(-1).init.signal;
    await act(async () => { hook.current.closePreview(); });
    assert.equal(signal.aborted, true);
    await act(async () => { gate.resolve(file(png, 'image/png')); await pending; });
    assert.equal(hook.current.preview, null);
    assert.equal(urls.size, 0);
  });

  await check('preview selection/key/unmount isolate late failures and release image URLs; PDF uses a Blob only', async () => {
    const gate = deferred();
    let delayed = true;
    respond = () => delayed ? gate.promise : file(png, 'image/png');
    const hook = await mountHook(({ resourceKey }) => useAttachmentPreview(resourceKey), { resourceKey: 'A' });
    let old;
    await act(async () => { old = hook.current.openPreview(image); });
    const oldSignal = requests.at(-1).init.signal;
    delayed = false;
    await act(async () => { await hook.current.openPreview({ ...image, id: 13 }); });
    const currentUrl = hook.current.preview.url;
    assert.ok(currentUrl.startsWith('blob:'));
    await act(async () => { gate.reject(new Error('Old request failed')); await old; });
    assert.equal(oldSignal.aborted, true);
    assert.equal(hook.current.preview.attachment.id, 13);
    assert.equal(hook.current.preview.error, undefined);
    assert.equal(hook.current.preview.url, currentUrl);
    await hook.render({ resourceKey: 'B' });
    assert.equal(hook.current.preview, null);
    assert.ok(revoked.has(currentUrl));
    respond = () => file(pdf, 'application/pdf');
    await act(async () => { await hook.current.openPreview(documentFile); });
    assert.equal(hook.current.preview.url, undefined, 'PDF parser receives bytes, never a protected URL');
    assert.deepEqual(Buffer.from(await hook.current.preview.blob.arrayBuffer()), pdf);
    respond = () => file(png, 'image/png');
    await act(async () => { await hook.current.openPreview(image); });
    const finalUrl = hook.current.preview.url;
    await hook.unmount();
    assert.ok(revoked.has(finalUrl));
  });

  await check('download cancellation and resource changes abort real services before consumer side effects', async () => {
    const gates = [];
    const finished = [];
    respond = () => { const gate = deferred(); gates.push(gate); return gate.promise; };
    const handler = async (attachment, signal) => { const result = await api.fetchAttachmentDownload(attachment.id, attachment.fileName, signal); signal.throwIfAborted(); finished.push(result); };
    const hook = await mountHook(({ resourceKey, can }) => useAttachmentDownload(resourceKey, can, handler), { resourceKey: 'A', can: true });
    let first;
    await act(async () => { first = hook.current.download(documentFile); });
    const firstSignal = requests.at(-1).init.signal;
    assert.equal(hook.current.downloadingId, 12);
    await act(async () => { hook.current.cancelDownload(); });
    await act(async () => { gates[0].resolve(file(pdf, 'application/pdf')); await first; });
    assert.equal(firstSignal.aborted, true);
    assert.equal(finished.length, 0);
    assert.equal(hook.current.downloadError, '');
    let second;
    await act(async () => { second = hook.current.download(documentFile); });
    const secondSignal = requests.at(-1).init.signal;
    await hook.render({ resourceKey: 'B', can: true });
    await act(async () => { gates[1].resolve(file(pdf, 'application/pdf')); await second; });
    assert.equal(secondSignal.aborted, true);
    assert.equal(finished.length, 0);
    assert.equal(hook.current.downloadingId, null);
  });

  await check('download newer requests survive old errors/finally, permission loss and unmount cancel', async () => {
    const calls = [];
    const handler = (attachment, signal) => { const gate = deferred(); calls.push({ ...gate, signal }); return gate.promise; };
    const hook = await mountHook(({ resourceKey, can }) => useAttachmentDownload(resourceKey, can, handler), { resourceKey: 'A', can: true });
    let old, current;
    await act(async () => { old = hook.current.download(image); current = hook.current.download(documentFile); });
    assert.equal(calls[0].signal.aborted, true);
    await act(async () => { calls[0].reject(new Error('stale failure')); await old; });
    assert.equal(hook.current.downloadingId, 12, 'Old finally must not clear current loading');
    assert.equal(hook.current.downloadError, '');
    await act(async () => { calls[1].reject(new Error('Current download failed')); await current; });
    assert.equal(hook.current.downloadError, 'Current download failed');
    let permissionPending;
    await act(async () => { permissionPending = hook.current.download(image); });
    await hook.render({ resourceKey: 'A', can: false });
    assert.equal(calls[2].signal.aborted, true);
    await act(async () => { calls[2].resolve(); await permissionPending; await hook.current.download(image); });
    assert.equal(calls.length, 3, 'Read-only does not invoke the download handler');
    assert.match(hook.current.downloadError, /没有附件下载权限/);
    await hook.render({ resourceKey: 'B', can: true });
    await act(async () => { await hook.current.download({ ...image, canDownload: false }); });
    assert.equal(calls.length, 3, 'Per-attachment denial also blocks requests');
    let unmounted;
    await act(async () => { unmounted = hook.current.download(image); });
    await hook.unmount();
    assert.equal(calls[3].signal.aborted, true);
    await act(async () => { calls[3].reject(new Error('late unmounted error')); await unmounted; });
  });

  await check('nested attachment preview keeps controls outside a bounded page scroller (bounded AST)', async () => {
    const parse = async path => ts.createSourceFile(path, await readFile(resolve(root, path), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const returnedElement = (source, name) => {
      const component = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
      const returned = component?.body?.statements.find(node => ts.isReturnStatement(node));
      assert.ok(returned?.expression, `Missing ${name} return`);
      const element = ts.isParenthesizedExpression(returned.expression) ? returned.expression.expression : returned.expression;
      assert.ok(ts.isJsxElement(element));
      return element;
    };
    const attribute = (element, name) => element.openingElement.attributes.properties.find(node => ts.isJsxAttribute(node) && node.name.text === name)?.initializer;
    const classes = element => {
      const value = attribute(element, 'className');
      assert.ok(value && ts.isStringLiteral(value));
      return new Set(value.text.split(/\s+/));
    };
    const requireClasses = (element, expected) => {
      const actual = classes(element);
      for (const name of expected) assert.ok(actual.has(name), `Layout requires ${name}, got ${[...actual].join(' ')}`);
    };
    const children = element => element.children.filter(ts.isJsxElement);
    const modal = returnedElement(await parse('src/App.tsx'), 'AttachmentPreviewModal');
    const body = attribute(modal, 'bodyClassName'), overlay = attribute(modal, 'overlayClassName');
    assert.ok(body && ts.isStringLiteral(body) && body.text.split(/\s+/).includes('flex'), 'Drawer body must bound the preview flex column');
    assert.ok(overlay && ts.isStringLiteral(overlay) && overlay.text.split(/\s+/).includes('!m-0'), 'Nested fixed overlay must not inherit parent space-y margins');
    const [card] = children(modal), [header, content] = children(card);
    requireClasses(card, ['flex', 'min-h-0', 'flex-1', 'flex-col', 'overflow-hidden']);
    assert.ok(!classes(card).has('max-h-[92dvh]'), 'Preview height comes from the drawer body, not a second viewport-sized box');
    requireClasses(header, ['shrink-0']);
    requireClasses(content, ['flex', 'min-h-0', 'flex-1', 'flex-col', 'overflow-hidden']);
    const pdf = returnedElement(await parse('src/components/PdfAttachmentPreview.tsx'), 'PdfAttachmentPreview');
    const [pager, scroller, notice] = children(pdf);
    requireClasses(pdf, ['flex', 'min-h-0', 'flex-1', 'flex-col']);
    requireClasses(pager, ['shrink-0']);
    requireClasses(scroller, ['min-h-0', 'flex-1', 'overflow-auto', 'overscroll-contain']);
    requireClasses(notice, ['shrink-0']);
    assert.ok(scroller.children.some(node => ts.isJsxSelfClosingElement(node) && node.tagName.getText() === 'canvas'), 'Only the canvas belongs to the scrolling page region');
    assert.equal(attribute(scroller, 'role')?.text, 'region');
    assert.equal(attribute(scroller, 'tabIndex')?.expression?.getText(), '0', 'The page scroller must be keyboard reachable');
  });

  process.stdout.write(`${checks} attachment content/lifecycle/layout groups passed (isolated cross-origin services, real React hooks and bounded layout AST; not PDF rendering or dev acceptance).\n`);
} finally {
  for (const hook of [...mounted]) await hook.unmount();
  console.error = originalError;
  for (const url of urls) originalRevoke(url);
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  dom.window.close();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  await rm(outputDir, { recursive: true, force: true });
}
