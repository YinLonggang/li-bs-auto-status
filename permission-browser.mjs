#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { configuration } from './permission-regression.mjs';

const requireBackend = createRequire(new URL('../li_sicar/package.json', import.meta.url));
const check = (value, code) => { if (!value) throw new Error(code); };
const variants = [
  { width: 1440, height: 1000, theme: 'light' },
  { width: 1440, height: 1000, theme: 'dark' },
  { width: 390, height: 844, theme: 'light' },
  { width: 390, height: 844, theme: 'dark' },
];

export function browserConfiguration(env = process.env) {
  const config = configuration(env);
  check(config.identitySource === 'current-dev' && config.modes.length === 1, 'BROWSER_REQUIRES_CONTROLLED_DEV');
  const spa = new URL(env.PERM_SPA_URL || 'http://127.0.0.1:3005');
  check(spa.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(spa.hostname)
    && !spa.username && !spa.password && spa.pathname === '/' && !spa.search && !spa.hash, 'BROWSER_REQUIRES_LOCAL_SPA');
  return { ...config, spaUrl: spa.origin, browserExecutable: env.PERM_BROWSER_EXECUTABLE || '', output: env.PERM_BROWSER_OUTPUT || '' };
}

export function allowedRequest(config, url, method, postData = '') {
  const target = new URL(url);
  if (![config.baseUrl, config.spaUrl].includes(target.origin)) return 'external';
  // This suite never reads file bytes, including attachments of unverified provenance.
  if (/\/attachments\//.test(target.pathname)) return 'attachment';
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return 'allow';
  if (config.modes[0] === 'readonly' && config.allowWrites && method === 'PATCH'
    && target.pathname === `/api/li-bs-auto-status/v1/check-items/${config.checkItemId}/`) {
    try {
      const body = JSON.parse(postData);
      if (Object.keys(body).length === 1 && body.description?.permission_probe === config.marker
        && Object.keys(body.description).length === 1) return 'allow';
    } catch { /* Unexpected browser writes are blocked before reaching the server. */ }
  }
  return 'mutation';
}

async function launch(config) {
  const { chromium } = requireBackend('playwright');
  const candidates = [config.browserExecutable, chromium.executablePath(),
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'];
  const executablePath = candidates.find(candidate => candidate && existsSync(candidate));
  check(executablePath, 'NO_INSTALLED_BROWSER');
  return chromium.launch({ executablePath, headless: true });
}

async function assertProfile(page, mode) {
  const result = await page.evaluate(async () => {
    const { fetchUserProfile } = await import('/src/services/auth.ts');
    const profile = await fetchUserProfile();
    return profile ? { signedIn: true, role: profile.role, canWrite: profile.canWrite } : { signedIn: false };
  });
  check(result.signedIn === (mode !== 'anonymous'), 'SPA_SIGNED_IN_MISMATCH');
  if (mode !== 'anonymous') check(result.role === (mode === 'writable' ? 'super_admin' : 'viewer')
    && result.canWrite === (mode === 'writable'), 'SPA_PERMISSION_MISMATCH');
  return result;
}

export async function verifyAnonymousGate(page) {
  const gate = page.locator('.li-portal-login');
  await gate.waitFor({ state: 'visible' });
  await gate.getByRole('link', { name: '前往 Li-Sicar 门户登录', exact: true }).waitFor();
  await gate.getByRole('button', { name: '已登录，重新检测', exact: true }).click();
  await assertProfile(page, 'anonymous');
  await page.getByRole('heading', { name: '需要登录', exact: true }).waitFor();
  const blocksPage = await gate.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const points = [[1, 1], [innerWidth - 2, 1], [1, innerHeight - 2],
      [innerWidth - 2, innerHeight - 2], [innerWidth / 2, innerHeight / 2]];
    return bounds.left <= 0 && bounds.top <= 0 && bounds.right >= innerWidth && bounds.bottom >= innerHeight
      && points.every(([x, y]) => element.contains(document.elementFromPoint(x, y)));
  });
  check(blocksPage, 'ANONYMOUS_LOGIN_GATE_NOT_BLOCKING');
  check(await page.getByRole('dialog').count() === 0, 'ANONYMOUS_DRAWER_VISIBLE');
}

export async function verifyVariant(browser, config, variant) {
  const mode = config.modes[0];
  const context = await browser.newContext({ viewport: { width: variant.width, height: variant.height }, colorScheme: variant.theme, serviceWorkers: 'block' });
  const blocked = { external: 0, attachment: 0, mutation: 0 };
  const pageErrors = [];
  let step = 'PORTAL_LOAD';
  await context.addInitScript(theme => localStorage.setItem('li_sicar_theme', theme), variant.theme);
  await context.route('**/*', route => {
    const request = route.request();
    const decision = allowedRequest(config, request.url(), request.method(), request.postData() || '');
    if (decision === 'allow') return route.continue();
    blocked[decision] += 1;
    return route.abort('blockedbyclient');
  });
  try {
    const portal = await context.newPage();
    portal.on('pageerror', () => pageErrors.push('PORTAL_SCRIPT_ERROR'));
    await portal.goto(`${config.baseUrl}/`, { waitUntil: 'domcontentloaded' });
    check(new URL(portal.url()).origin === config.baseUrl, 'PORTAL_LEFT_LOCAL_ORIGIN');
    if (mode === 'anonymous') {
      await portal.getByRole('link', { name: '授权登录', exact: true }).waitFor();
      check(await portal.locator('.hm-identity').count() === 0, 'ANONYMOUS_PORTAL_SHOWS_IDENTITY');
    } else {
      const identity = portal.locator('.hm-identity');
      await identity.waitFor({ state: 'attached' });
      const facts = await identity.innerText();
      check(facts.includes(mode === 'writable' ? '全域管理员' : '只读访问'), 'PORTAL_PERMISSION_MISMATCH');
      check(mode === 'writable' || !facts.includes('全域管理员'), 'READONLY_PORTAL_SHOWS_ADMIN');
    }

    step = 'SPA_LOAD';
    const page = await context.newPage();
    page.on('pageerror', () => pageErrors.push('SPA_SCRIPT_ERROR'));
    await page.goto(`${config.spaUrl}/`, { waitUntil: 'domcontentloaded' });
    await page.locator('main[aria-busy="false"]').waitFor();
    const profile = await assertProfile(page, mode);
    check(await page.locator('html').getAttribute('data-theme') === variant.theme, 'THEME_MISMATCH');
    const header = page.locator('header .header-user');
    check((await header.innerText()).includes(mode === 'anonymous' ? '未登录' : mode === 'writable' ? '超级管理员' : '只读用户'), 'SPA_ROLE_LABEL_MISMATCH');
    if (mode === 'anonymous') await page.getByRole('heading', { name: '需要登录', exact: true }).waitFor();
    else check(await page.getByRole('heading', { name: '需要登录', exact: true }).count() === 0, 'SIGNED_IN_SHOWS_LOGIN');

    if (mode === 'anonymous') {
      step = 'ANONYMOUS_LOGIN_GATE';
      await verifyAnonymousGate(page);
    } else {
      step = 'CHECK_LIST';
      if (variant.width < 1024) await page.getByRole('button', { name: '打开导航', exact: true }).click();
      await page.locator('aside button[title="检查项"]').click();
      const add = page.getByRole('button', { name: '新增检查项', exact: true });
      await add.waitFor();
      await page.getByLabel('当前项目', { exact: true }).selectOption(config.projectId);
      await page.locator('main[aria-busy="false"]').waitFor();
      check(await page.getByLabel('检查项阶段筛选', { exact: true }).locator('option').count() > 1
        && await page.getByLabel('检查项模块筛选', { exact: true }).locator('option').count() > 1, 'SPA_WORKSPACE_NOT_READY');
      const expectedTitle = await page.evaluate(async ({ id, project, marker }) => {
        const { apiRequest } = await import('/src/services/http.ts');
        const raw = await apiRequest(`/check-items/${id}/`);
        const item = raw.data ?? raw;
        if (String(item.id) !== id || String(item.project) !== project || !item.title?.startsWith(`${marker}-`)) return null;
        return item.title;
      }, { id: config.checkItemId, project: config.projectId, marker: config.marker });
      check(expectedTitle, 'SPA_FIXTURE_SCOPE_MISMATCH');
      await page.getByLabel('检查项关键字筛选', { exact: true }).fill(expectedTitle);
      const view = page.getByRole('button', { name: `查看检查项 ${expectedTitle}`, exact: true });
      await view.waitFor();
      check((await page.locator('.project-context-bar').innerText()).includes(config.projectCode), 'SPA_PROJECT_SCOPE_MISMATCH');
      check(await add.isDisabled() === (mode !== 'writable'), 'SPA_CREATE_PERMISSION_MISMATCH');
      step = 'CHECK_DRAWER';
      await view.click();
      const drawer = page.getByRole('dialog').last();
      const title = drawer.getByLabel('检查项标题', { exact: true });
      await title.waitFor();
      check((await title.inputValue()).startsWith(`${config.marker}-`), 'SPA_DRAWER_SCOPE_MISMATCH');
      check(await title.isDisabled() === (mode !== 'writable'), 'SPA_EDIT_PERMISSION_MISMATCH');
      check(await drawer.getByRole('button', { name: '保存检查项', exact: true }).count() === (mode === 'writable' ? 1 : 0), 'SPA_SAVE_PERMISSION_MISMATCH');
      if (mode === 'writable') {
        const original = await title.inputValue();
        await title.fill(`${config.marker}-unsaved-permission-draft`);
        await title.fill(original);
      }
      await drawer.locator('footer').getByRole('button', { name: '关闭', exact: true }).click();
      check(await page.getByRole('dialog').count() === 0, 'DRAWER_DID_NOT_CLOSE');
    }

    step = 'DENIAL_AND_LAYOUT';
    let denial = null;
    if (mode === 'readonly' && variant.width === 1440 && variant.theme === 'light') {
      check(config.allowWrites, 'BROWSER_DENIAL_NOT_AUTHORIZED');
      denial = await page.evaluate(async ({ id, marker }) => {
        const { apiRequest, requestWithPrefix } = await import('/src/services/http.ts');
        await requestWithPrefix('/api/auth', '/csrf/');
        try {
          await apiRequest(`/check-items/${id}/`, { method: 'PATCH', body: JSON.stringify({ description: { permission_probe: marker } }) });
          return { status: 200 };
        } catch (error) { return { status: error.status }; }
      }, { id: config.checkItemId, marker: config.marker });
      check(denial.status === 403, 'SPA_SERVICE_WRITE_NOT_DENIED');
      await assertProfile(page, mode);
      check(new URL(page.url()).origin === config.spaUrl
        && await page.getByRole('heading', { name: '需要登录', exact: true }).count() === 0, 'SPA_403_BECAME_SIGNOUT');
    }
    check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'SPA_HORIZONTAL_OVERFLOW');
    check(!blocked.mutation && !blocked.attachment && !pageErrors.length, 'UNEXPECTED_BROWSER_SIDE_EFFECT_OR_ERROR');
    return { ...variant, status: 'PASS', portalRoleMatched: true, profile, drawerChecked: mode !== 'anonymous', loginGateChecked: mode === 'anonymous', denial, blockedExternalRequests: blocked.external };
  } catch (error) {
    const code = /^[A-Z][A-Z0-9_]+$/.test(error.message || '') ? error.message : 'BROWSER_ASSERTION_OR_TIMEOUT';
    return { ...variant, status: 'FAIL', code, step, blocked, pageErrors };
  } finally { await context.close(); }
}

export async function runBrowserVerification(config) {
  const report = { evidenceLevel: 'controlled-dev-browser', scenario: config.modes[0], status: 'INCOMPLETE', results: [], complete: false };
  const browser = await launch(config);
  try {
    report.browserVersion = browser.version();
    for (const variant of variants) {
      const result = await verifyVariant(browser, config, variant);
      report.results.push(result);
      if (result.status !== 'PASS') break;
    }
    report.complete = report.results.length === variants.length && report.results.every(result => result.status === 'PASS');
    report.status = report.complete ? 'PASS' : 'INCOMPLETE';
  } finally { await browser.close(); }
  return report;
}

async function main() {
  let output;
  try {
    const config = browserConfiguration();
    if (process.argv.includes('--preflight')) {
      const browser = await launch(config);
      try { console.log(JSON.stringify({ status: 'BROWSER_READY', version: browser.version() })); }
      finally { await browser.close(); }
      return;
    }
    if (config.output) output = await open(config.output, 'wx', 0o600);
    const report = await runBrowserVerification(config);
    if (output) await output.writeFile(`${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report));
    if (!report.complete) process.exitCode = 1;
  } catch (error) {
    const code = /^[A-Z][A-Z0-9_]+$/.test(error.message || '') ? error.message : 'BROWSER_ASSERTION_OR_TIMEOUT';
    const report = { status: 'INCOMPLETE', complete: false, code };
    if (output) await output.writeFile(`${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report));
    process.exitCode = 1;
  } finally { await output?.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
