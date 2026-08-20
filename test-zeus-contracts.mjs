import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import ts from 'typescript';

const root = dirname(fileURLToPath(import.meta.url));
const outputDir = await mkdtemp(resolve(tmpdir(), 'li-bs-auto-status-zeus-'));
const outputFile = resolve(outputDir, 'zeus.mjs');

try {
  // 只用 typescript 转译（各 SPA 必备依赖），不依赖 esbuild 是否随 vite 提升。
  const source = await readFile(resolve(root, 'src/zeus.ts'), 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const bundled = transpiled
    .replaceAll('import.meta.env.VITE_API_ENV', JSON.stringify('production'))
    .replaceAll('import.meta.env.MODE', JSON.stringify('production'));
  await writeFile(outputFile, bundled);

  const zeusModule = await import(`${pathToFileURL(outputFile).href}?test=1`);
  globalThis.window = {
    ZEUS: class ThrowingZeus {
      constructor() {
        throw new Error('simulated SDK failure');
      }
    },
  };

  assert.doesNotThrow(
    () => zeusModule.initZeus({ userId: 'openid-1', ldapName: 'tester' }),
    'Zeus initialization failures must not escape into the login bootstrap',
  );

  let capturedOptions;
  let createdCount = 0;
  let destroyedCount = 0;
  globalThis.window.ZEUS = class WorkingZeus {
    constructor(options) {
      capturedOptions = options;
      createdCount += 1;
    }

    collect() {}
    view() {}
    destroy() {
      destroyedCount += 1;
    }
  };

  zeusModule.initZeus({ userId: 'openid-1', ldapName: 'tester' });
  assert.equal(capturedOptions.env, 'prod');
  assert.equal(capturedOptions.appid, 'li-bs-auto-status');
  assert.equal(capturedOptions.intranetOnly, true);
  assert.equal(capturedOptions.module, 'bs-auto-status');
  assert.equal(capturedOptions.liUsername, 'tester');
  assert.equal(capturedOptions.liOpenId, 'openid-1');
  assert.equal(capturedOptions.uvKey(), 'openid-1');
  zeusModule.initZeus({ userId: 'openid-1', ldapName: 'tester' });
  assert.equal(createdCount, 1);
  assert.equal(destroyedCount, 0);

  zeusModule.initZeus({ userId: 'openid-2', ldapName: 'tester-2' });
  assert.equal(createdCount, 2);
  assert.equal(destroyedCount, 1);
  assert.equal(capturedOptions.liOpenId, 'openid-2');
  assert.equal(capturedOptions.uvKey(), 'openid-2');

  zeusModule.destroyZeus();
  assert.equal(destroyedCount, 2);

  process.stdout.write('Zeus contracts passed\n');
} finally {
  delete globalThis.window;
  await rm(outputDir, { recursive: true, force: true });
}
