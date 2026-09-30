import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { allowedRequest, browserConfiguration, verifyVariant } from './permission-browser.mjs';

const env = {
  PERM_IDENTITY_SOURCE: 'current-dev', PERM_TEST_MODE: 'readonly', PERM_ALLOW_WRITES: '1',
  PERM_PROJECT_ID: '2', PERM_CHECK_ITEM_ID: '75', PERM_PROJECT_CODE: 'AUTO-DRAWER-DEV-FIXTURE',
  PERM_FIXTURE_MARKER: 'AUTO-CHECK-DEV-FIXTURE',
};

const path = 'http://127.0.0.1:8000/api/li-bs-auto-status/v1/check-items/75/';
const body = JSON.stringify({ description: { permission_probe: env.PERM_FIXTURE_MARKER } });

test('browser requires one controlled local mode and a local SPA', () => {
  assert.equal(browserConfiguration(env).modes[0], 'readonly');
  for (const overrides of [
    { PERM_IDENTITY_SOURCE: 'session' }, { PERM_TEST_MODE: 'all' },
    { PERM_SPA_URL: 'https://example.invalid' }, { PERM_SPA_URL: 'http://localhost/?secret=1' },
    { PERM_SPA_URL: 'http://user:secret@localhost' }, { PERM_SPA_URL: 'http://localhost/api/' },
  ]) assert.throws(() => browserConfiguration({ ...env, ...overrides }));
});

test('browser allows only local reads and explicitly scoped invalid readonly probe', () => {
  const config = browserConfiguration(env);
  assert.equal(allowedRequest(config, path, 'GET'), 'allow');
  assert.equal(allowedRequest(config, 'http://127.0.0.1:3005/src/App.tsx', 'GET'), 'allow');
  assert.equal(allowedRequest(config, path, 'PATCH', body), 'allow');
  assert.equal(allowedRequest(config, 'https://example.invalid', 'GET'), 'external');
  assert.equal(allowedRequest(config, path, 'DELETE'), 'mutation');
  assert.equal(allowedRequest(config, path.replace('75/', '76/'), 'PATCH', body), 'mutation');
  assert.equal(allowedRequest(config, path, 'PATCH', JSON.stringify({ description: 'valid string' })), 'mutation');
  assert.equal(allowedRequest(config, path, 'PATCH', JSON.stringify({ description: { permission_probe: env.PERM_FIXTURE_MARKER }, status: 'done' })), 'mutation');
  assert.equal(allowedRequest(config, path, 'PATCH', 'not json'), 'mutation');
});

test('browser does not access attachment endpoints or send administrator mutations', () => {
  for (const mode of ['anonymous', 'readonly', 'writable']) {
    const config = browserConfiguration({ ...env, PERM_TEST_MODE: mode });
    for (const suffix of ['3/preview/', '3/download/', '3/download-link/', 'upload/']) {
      assert.equal(allowedRequest(config, `http://127.0.0.1:8000/api/li-bs-auto-status/v1/attachments/${suffix}`, 'GET'), 'attachment');
    }
    if (mode !== 'readonly') assert.equal(allowedRequest(config, path, 'PATCH', body), 'mutation');
  }
  assert.equal(allowedRequest(browserConfiguration({ ...env, PERM_ALLOW_WRITES: '' }), path, 'PATCH', body), 'mutation');
});

function anonymousBrowser({ uncoveredPoint = -1, coversViewport = true, dialogCount = 0 } = {}) {
  const calls = [];
  let closed = false;
  const wait = async () => {};
  const gate = {
    waitFor: async options => { assert.equal(options.state, 'visible'); },
    getByRole(role, options) {
      assert.equal(options.exact, true);
      if (role === 'link' && options.name === '前往 Li-Sicar 门户登录') return { waitFor: wait };
      if (role === 'button' && options.name === '已登录，重新检测') return { click: async () => { calls.push('refresh'); } };
      throw new Error('UNEXPECTED_LOGIN_CONTROL');
    },
    async evaluate(fn) {
      let point = 0;
      const inside = {}, outside = {};
      const element = {
        getBoundingClientRect: () => ({ left: 0, top: 0, right: coversViewport ? 1440 : 700, bottom: 1000 }),
        contains: target => target === inside,
      };
      return runInNewContext(`(${fn.toString()})(element)`, {
        element, innerWidth: 1440, innerHeight: 1000,
        document: { elementFromPoint: () => point++ === uncoveredPoint ? outside : inside },
      });
    },
  };
  const portal = {
    on() {}, async goto() {}, url: () => 'http://127.0.0.1:8000/',
    getByRole(role, options) {
      assert.equal(role, 'link'); assert.equal(options.name, '授权登录');
      return { waitFor: wait };
    },
    locator(selector) { assert.equal(selector, '.hm-identity'); return { count: async () => 0 }; },
  };
  const page = {
    on() {}, async goto() {},
    async evaluate(fn) { return fn.toString().includes('fetchUserProfile') ? { signedIn: false } : true; },
    locator(selector) {
      if (selector === 'main[aria-busy="false"]') return { waitFor: wait };
      if (selector === 'html') return { getAttribute: async () => 'light' };
      if (selector === 'header .header-user') return { innerText: async () => '未登录' };
      if (selector === '.li-portal-login') return gate;
      throw new Error('ANONYMOUS_NAVIGATION_ATTEMPT');
    },
    getByRole(role, options) {
      if (role === 'heading' && options?.name === '需要登录') return { waitFor: wait };
      if (role === 'dialog') return { count: async () => dialogCount };
      throw new Error('ANONYMOUS_NAVIGATION_ATTEMPT');
    },
  };
  let pageIndex = 0;
  return {
    calls, isClosed: () => closed,
    async newContext() {
      return {
        async addInitScript() {}, async route() {},
        async newPage() { return pageIndex++ === 0 ? portal : page; },
        async close() { closed = true; },
      };
    },
  };
}

const anonymousConfig = () => browserConfiguration({ ...env, PERM_TEST_MODE: 'anonymous' });
const desktop = { width: 1440, height: 1000, theme: 'light' };

test('anonymous browser validates the blocking login gate without navigating behind it', async () => {
  const browser = anonymousBrowser();
  const result = await verifyVariant(browser, anonymousConfig(), desktop);
  assert.equal(result.status, 'PASS');
  assert.equal(result.loginGateChecked, true);
  assert.equal(result.drawerChecked, false);
  assert.deepEqual(browser.calls, ['refresh']);
  assert.equal(browser.isClosed(), true);
});

test('anonymous browser rejects incomplete coverage, pointer passthrough and open drawers', async () => {
  for (const [options, code] of [
    [{ coversViewport: false }, 'ANONYMOUS_LOGIN_GATE_NOT_BLOCKING'],
    [{ uncoveredPoint: 4 }, 'ANONYMOUS_LOGIN_GATE_NOT_BLOCKING'],
    [{ dialogCount: 1 }, 'ANONYMOUS_DRAWER_VISIBLE'],
  ]) {
    const browser = anonymousBrowser(options);
    const result = await verifyVariant(browser, anonymousConfig(), desktop);
    assert.equal(result.status, 'FAIL');
    assert.equal(result.code, code);
    assert.equal(result.step, 'ANONYMOUS_LOGIN_GATE');
    assert.equal(browser.isClosed(), true);
  }
});
