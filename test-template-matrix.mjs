import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, extname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const outputDir = await mkdtemp(resolve(tmpdir(), 'auto-status-matrix-'));
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://spa.example.test' });
const originals = new Map(['window', 'document', 'Event', 'IS_REACT_ACT_ENVIRONMENT', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true, fetch: () => { throw new Error('Matrix selection must not request the network'); } })) {
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const compiled = new Map();
let renderer;
async function compile(path) {
  if (compiled.has(path)) return compiled.get(path);
  const outputPath = resolve(outputDir, `${compiled.size}.mjs`);
  compiled.set(path, outputPath);
  let source = (await readFile(path, 'utf8')).replaceAll('import.meta.env', '({ VITE_BASE_API: "https://api.example.test" })');
  // Expose the actual view only in the temporary test module; production exports stay unchanged.
  if (path === resolve(root, 'src/App.tsx')) source += '\nexport { ProjectTemplateView };\n';
  let output = ts.transpileModule(source, { fileName: path, compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  output = output.replace(/import\s+['"][^'"]+\.css['"];?/g, '');
  for (const match of [...output.matchAll(/from\s+(['"])([^'"]+)\1/g)]) {
    const specifier = match[2];
    let target;
    if (specifier.startsWith('.')) {
      const base = resolve(dirname(path), specifier);
      for (const candidate of extname(base) ? [base] : [`${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts'), resolve(base, 'index.tsx')]) {
        if (await stat(candidate).then(value => value.isFile()).catch(() => false)) { target = await compile(candidate); break; }
      }
      assert.ok(target, `Unresolved local module: ${specifier}`);
    } else target = require.resolve(specifier);
    output = output.replaceAll(match[0], `from ${JSON.stringify(pathToFileURL(target).href)}`);
  }
  await writeFile(outputPath, output);
  return outputPath;
}
try {
  const { ProjectTemplateView } = await import(pathToFileURL(await compile(resolve(root, 'src/App.tsx'))).href);
  const templates = [1, 2, 3].map(id => ({ id, code: `checklist-${id}`, title: `Checklist ${id}`, name: `Checklist ${id}`, phaseTemplateId: 10, moduleId: 20, phaseKey: 'design', version: 1, isActive: id !== 3, itemTemplates: [{ title: `Item ${id}`, sortOrder: 10 }] }));
  const data = {
    phaseTemplates: [{ id: 10, code: 'phase-template', name: 'Phase template', version: 1, phaseDefinitions: [{ key: 'design', name: 'Design', sortOrder: 10 }] }],
    inspectionModules: [{ id: 20, code: 'module', name: 'Module', sequence: 10, isActive: true }],
    checklistTemplates: templates, ownerCandidates: [], checkItems: []
  };
  const noMutation = async () => { throw new Error('Selection must not mutate templates'); };
  const props = { data, canWrite: true, ...Object.fromEntries(['onCreatePhaseTemplate', 'onUpdatePhaseTemplate', 'onDeletePhaseTemplate', 'onCopyPhaseTemplate', 'onCreateChecklistTemplate', 'onDeleteChecklistTemplate', 'onUpdateChecklistTemplate', 'onCreateInspectionModule', 'onUpdateInspectionModule', 'onDeleteInspectionModule'].map(key => [key, noMutation])) };
  renderer = createRoot(document.getElementById('root'));
  await act(async () => renderer.render(React.createElement(ProjectTemplateView, props)));
  const matrix = () => Array.from(document.querySelectorAll('section')).find(section => section.textContent.includes('Module Phase Matrix'));
  const cards = () => Array.from(matrix().querySelectorAll('button[aria-pressed]'));
  assert.equal(cards().length, 3);
  assert.equal(cards()[0].closest('td'), cards()[2].closest('td'));
  for (const id of [2, 3, 1]) {
    await act(async () => cards()[id - 1].click());
    assert.equal(cards().filter(button => button.getAttribute('aria-pressed') === 'true').length, 1);
    assert.equal(cards()[id - 1].getAttribute('aria-pressed'), 'true');
    assert.ok(Array.from(document.querySelectorAll('input')).some(input => input.value === `checklist-${id}`));
    assert.ok(Array.from(document.querySelectorAll('input')).some(input => input.value === `Item ${id}`));
  }
  process.stdout.write('PASS all same-cell templates, including inactive templates, can be selected and reselected\n');
  const createButton = Array.from(matrix().querySelectorAll('button')).find(button => button.textContent.includes('新增单元格清单'));
  assert.ok(createButton);
  await act(async () => createButton.click());
  assert.equal(cards().filter(button => button.getAttribute('aria-pressed') === 'true').length, 0);
  await act(async () => cards()[1].click());
  assert.equal(cards()[1].getAttribute('aria-pressed'), 'true');
  assert.ok(Array.from(document.querySelectorAll('input')).some(input => input.value === 'checklist-2'));
  process.stdout.write('PASS adding a same-cell draft does not remove existing template selection\n');
  await act(async () => renderer.render(React.createElement(ProjectTemplateView, { ...props, canWrite: false })));
  assert.equal(Array.from(matrix().querySelectorAll('button')).some(button => button.textContent.includes('新增单元格清单')), false);
  await act(async () => cards()[2].click());
  const codeInput = Array.from(document.querySelectorAll('input')).find(input => input.value === 'checklist-3');
  assert.ok(codeInput?.disabled);
  process.stdout.write('PASS readonly users can inspect every template without creation or mutation\n3 matrix interaction checks passed\n');
} finally {
  if (renderer) await act(async () => renderer.unmount());
  dom.window.close();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  await rm(outputDir, { recursive: true, force: true });
}
