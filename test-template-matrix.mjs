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
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://spa.example.test', pretendToBeVisual: true });
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
const container = () => document.getElementById('root');
const dialogs = () => [...container().querySelectorAll('[role="dialog"]')];
const dialogByTitle = title => dialogs().find(item => item.querySelector('header h2')?.textContent.includes(title));
const buttonByText = (text, scope = container()) => [...scope.querySelectorAll('button')].find(item => item.textContent.trim() === text);
const fieldByLabel = (scope, label) => {
  const found = [...scope.querySelectorAll('label')].find(item => item.querySelector('.field-label')?.textContent.trim() === label);
  return found?.querySelector('input, select, textarea') ?? null;
};
try {
  const { ProjectTemplateView } = await import(pathToFileURL(await compile(resolve(root, 'src/App.tsx'))).href);
  const link = (id, entryId, title) => ({ linkId: id, entryId, phaseKey: 'design', title, description: `${title}说明`, priority: 'P1', sortOrder: id * 10, isEnabled: true, entryIsActive: true });
  const templates = [1, 2, 3].map(id => ({ id, code: `checklist-${id}`, title: `Checklist ${id}`, name: `Checklist ${id}`, phaseTemplateId: 10, moduleId: 20, phaseKey: 'design', version: 1, isActive: id !== 3, items: [link(id, id, `Item ${id}`)] }));
  const data = {
    phaseTemplates: [{ id: 10, code: 'phase-template', name: 'Phase template', version: 1, sequence: 1, isActive: true, phaseDefinitions: [{ key: 'design', name: 'Design', sortOrder: 10 }] }],
    inspectionModules: [{ id: 20, code: 'module', name: 'Module', sequence: 10, isActive: true, owners: [] }],
    checklistTemplates: templates, ownerCandidates: [], checkItems: []
  };
  const noMutation = async () => { throw new Error('Selection must not mutate templates'); };
  const props = { data, canWrite: true, ...Object.fromEntries(['onCreatePhaseTemplate', 'onUpdatePhaseTemplate', 'onDeletePhaseTemplate', 'onCopyPhaseTemplate', 'onCreateChecklistTemplate', 'onDeleteChecklistTemplate', 'onUpdateChecklistTemplate', 'onSetChecklistTemplateItems', 'onCreateInspectionModule', 'onUpdateInspectionModule', 'onDeleteInspectionModule'].map(key => [key, noMutation])) };
  renderer = createRoot(container());
  await act(async () => renderer.render(React.createElement(ProjectTemplateView, props)));
  const matrix = () => Array.from(document.querySelectorAll('section')).find(section => section.textContent.includes('Module Phase Matrix'));
  const cellButton = () => {
    const found = matrix().querySelector('button[aria-label="Module × Design 清单配置"]');
    assert.ok(found, 'Matrix cell must be a single compact button');
    return found;
  };
  assert.ok(cellButton().textContent.includes('Checklist 1'));
  assert.ok(cellButton().textContent.includes('Checklist 3'));
  assert.ok(cellButton().textContent.includes('3 组清单'));
  assert.ok(cellButton().textContent.includes('3 项'));
  assert.equal(matrix().querySelectorAll('button[aria-pressed]').length, 0, 'Matrix cells no longer carry per-template selection cards');
  assert.equal(matrix().querySelectorAll('input').length, 0, 'Matrix cells must not render inline editor inputs');
  process.stdout.write('PASS matrix cell shows grouped template summary without inline inputs\n');

  await act(async () => cellButton().click());
  const cellDrawer = dialogByTitle('Module × Design');
  assert.ok(cellDrawer, 'Cell drawer must open');
  assert.ok(cellDrawer.textContent.includes('checklist-2'));
  const editButtons = [...cellDrawer.querySelectorAll('button')].filter(item => item.textContent.trim() === '编辑');
  assert.equal(editButtons.length, 3, 'Cell drawer lists one edit action per template, including inactive ones');
  process.stdout.write('PASS cell drawer lists all same-cell templates, including inactive ones\n');

  await act(async () => buttonByText('新增单元格清单', cellDrawer).click());
  const createDrawer = dialogByTitle('新增清单模板');
  assert.ok(createDrawer, 'Checklist create drawer must open above the cell drawer');
  assert.ok(dialogByTitle('Module × Design'), 'Cell drawer stays open beneath the checklist drawer');
  assert.equal(fieldByLabel(createDrawer, '清单编码').value, 'phase-template-module-design');
  assert.equal(fieldByLabel(createDrawer, '清单名称').value, 'Module · Design');
  assert.equal(fieldByLabel(createDrawer, '模块').value, '20');
  assert.equal(fieldByLabel(createDrawer, '阶段').value, 'design');
  assert.ok(buttonByText('从检查项库选择', createDrawer), 'Checklist drawer must offer the library picker entry');
  assert.ok(!createDrawer.textContent.includes('新增模板检查项'), 'Free-form template items are replaced by library picks');
  process.stdout.write('PASS create drawer prefills the clicked cell target without any network request\n');

  await act(async () => buttonByText('取消', createDrawer).click());
  await act(async () => buttonByText('关闭', dialogByTitle('Module × Design')).click());
  assert.equal(dialogs().length, 0, 'Closing both drawers returns to the bare matrix');
  await act(async () => cellButton().click());
  assert.ok(dialogByTitle('Module × Design'), 'Cell drawer can be reopened after closing');
  await act(async () => buttonByText('关闭', dialogByTitle('Module × Design')).click());
  process.stdout.write('PASS drawers close cleanly and the cell flow can restart\n');

  await act(async () => renderer.render(React.createElement(ProjectTemplateView, { ...props, canWrite: false })));
  await act(async () => cellButton().click());
  const readonlyCellDrawer = dialogByTitle('Module × Design');
  assert.ok(readonlyCellDrawer, 'Readonly users can still inspect the cell');
  assert.ok(!buttonByText('新增单元格清单', readonlyCellDrawer), 'Readonly users get no creation entry');
  process.stdout.write('PASS readonly users can inspect the cell without creation entries\n3 matrix interaction checks passed\n');
} finally {
  if (renderer) await act(async () => renderer.unmount());
  dom.window.close();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  await rm(outputDir, { recursive: true, force: true });
}
