import assert from 'node:assert/strict';
import test from 'node:test';
import { configuration, runRegression } from './permission-regression.mjs';

const env = {
  PERM_IDENTITY_SOURCE: 'current-dev', PERM_TEST_MODE: 'writable',
  PERM_PROJECT_ID: '2', PERM_CHECK_ITEM_ID: '75',
  PERM_PROJECT_CODE: 'AUTO-DRAWER-DEV-FIXTURE', PERM_FIXTURE_MARKER: 'AUTO-CHECK-DEV-FIXTURE',
  PERM_ALLOW_WRITES: '1',
};
const fixture = {
  projectId: '2', checkItemId: '75', projectCode: env.PERM_PROJECT_CODE, marker: env.PERM_FIXTURE_MARKER,
};
const evidence = {
  evidenceLevel: 'controlled-dev', fixture,
  results: [{ scenario: 'readonly', status: 'PASS', checks: { read: { fixtureVerified: true } } }],
};
const json = (payload, status = 200, headers = {}) => new Response(JSON.stringify(payload), {
  status, headers: { 'Content-Type': 'application/json', ...headers },
});

function backend(options = {}) {
  const config = configuration({ ...env, ...options.env });
  if (options.fixtureEvidence !== false) config.verifiedFixture = evidence;
  const calls = [];
  const item = { id: 75, project: 2, title: `${env.PERM_FIXTURE_MARKER}-01`, description: 'original synthetic body', updated_at: 'initial', ...options.item };
  const original = structuredClone(item);
  const audits = [];
  let patches = 0;
  let readsAfterWrite = 0;
  let auditReads = 0;
  const fetchImpl = async (url, init) => {
    const path = new URL(url).pathname;
    const mode = config.identitySource === 'current-dev' ? config.modes[0]
      : init.headers.Cookie?.includes('writable') ? 'writable'
        : init.headers.Cookie?.includes('readonly') ? 'readonly' : 'anonymous';
    const method = init.method;
    calls.push({ path, method, body: init.body, redirect: init.redirect, cookie: init.headers.Cookie });
    if (options.override) {
      const response = options.override({ path, init, mode, patches });
      if (response) return response;
    }
    if (path === '/api/auth/user-profile') {
      const permissions = {
        can_write: mode === 'writable', is_super_admin: mode === 'writable', is_admin: mode === 'writable',
        module_admin: { li_bs_auto_status: mode === 'writable' },
        idaas_auth_disabled: mode !== 'anonymous' && config.identitySource === 'current-dev', perm_test_mode: mode,
      };
      const profile = { user: mode === 'anonymous' ? {} : { user_id: 'synthetic-actor' }, permissions, ...permissions };
      options.profile?.(profile);
      return json(profile, mode === 'anonymous' ? 401 : 200);
    }
    if (path === '/api/auth/csrf/') return json({ csrfToken: 'synthetic-csrf' }, 200, { 'Set-Cookie': 'csrftoken=synthetic-csrf; Path=/' });
    if (path.endsWith('/projects/2/')) return json({ id: 2, code: options.projectCode || env.PERM_PROJECT_CODE });
    if (path.endsWith('/audit-logs/')) {
      auditReads += 1;
      assert.equal(new URL(url).searchParams.get('object_type'), 'CheckItem');
      return json({ count: audits.length, results: options.noAudit && auditReads > 1 ? [] : audits });
    }
    if (path.endsWith('/check-items/')) return mode === 'anonymous'
      ? json({ detail: 'denied' }, 403) : json({ count: 1, results: [item] });
    if (path.endsWith('/check-items/75/')) {
      if (method === 'GET') {
        if (mode === 'anonymous') return json({ detail: 'denied' }, 403);
        if (patches) {
          readsAfterWrite += 1;
          if (options.readbackFailure) throw new Error('synthetic read timeout');
          if (options.concurrent && readsAfterWrite === 1) item.description = 'someone else changed this';
        }
        return json(item);
      }
      assert.equal(method, 'PATCH');
      patches += 1;
      assert.equal(init.headers['X-CSRFToken'], 'synthetic-csrf');
      assert.match(init.headers.Cookie, /csrftoken=synthetic-csrf/);
      const body = JSON.parse(init.body);
      if (mode !== 'writable') {
        assert.equal(typeof body.description, 'object');
        return json({ detail: 'denied' }, options.denialStatus || 403);
      }
      if (options.writeStatus && patches === 1) return json({ detail: 'not saved' }, options.writeStatus);
      if (options.restoreFails && patches === 2) return json({ detail: 'restore failed' }, 500);
      if (!options.ignoreWrites) {
        item.description = body.description;
        item.updated_at = `write-${patches}`;
        audits.unshift({ id: patches, action: 'check_item.update', object_type: 'CheckItem', object_id: '75', project: 2, actor_idaas_id: 'synthetic-actor' });
      }
      if (options.timeoutAfterApply && patches === 1 || options.restoreTimeout && patches === 2) throw new Error('synthetic response timeout');
      return json(item);
    }
    throw new Error(`Unexpected fixture route ${path}`);
  };
  return { config, fetchImpl, calls, item, original, get patches() { return patches; } };
}

async function run(options = {}) {
  const server = backend(options);
  const report = await runRegression(server.config, server.fetchImpl);
  return { server, report, result: report.results[0] };
}

test('explicit valid modes and fixture are required before any I/O', () => {
  for (const override of [
    { PERM_TEST_MODE: '' }, { PERM_TEST_MODE: 'invalid' }, { PERM_TEST_MODE: 'all' },
    { PERM_TEST_MODE: ', ,' }, { PERM_PROJECT_ID: '0' }, { PERM_CHECK_ITEM_ID: '' },
    { PERM_FIXTURE_MARKER: '' }, { PERM_PROJECT_CODE: '' },
    { PERM_BASE_URL: 'http://example.invalid' }, { PERM_BASE_URL: 'http://secret@localhost' },
    { PERM_BASE_URL: 'http://localhost/api/' }, { PERM_BASE_URL: 'http://localhost/?secret=1' },
  ]) assert.throws(() => configuration({ ...env, ...override }));
});

test('default mode never sends a mutation without explicit opt-in', async () => {
  const { server, report, result } = await run({ env: { PERM_ALLOW_WRITES: '' } });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.code, 'WRITE_PROBE_NOT_AUTHORIZED');
  assert.equal(report.complete, false);
  assert.equal(server.patches, 0);
});

test('missing sessions are blocked rather than skipped or accepted', async () => {
  const { report, server } = await run({ env: { PERM_IDENTITY_SOURCE: 'session', PERM_TEST_MODE: 'readonly,writable' } });
  assert.equal(report.failed, 2);
  assert.equal(report.complete, false);
  assert.ok(report.results.every(row => row.status === 'BLOCKED' && row.code === 'MISSING_SESSION'));
  assert.equal(server.calls.length, 0);
});

test('writable probe persists, reads back, restores and checks audit', async () => {
  const { report, server, result } = await run();
  assert.equal(report.status, 'SCENARIO_PASS');
  assert.equal(report.complete, false);
  assert.equal(result.restore, 'verified');
  assert.equal(result.checks.audit.newEvents, 2);
  assert.equal(server.item.description, server.original.description);
  assert.equal(server.patches, 2);
  assert.ok(server.calls.every(call => call.redirect === 'manual'));
  const encoded = JSON.stringify(report);
  for (const secret of ['synthetic-actor', 'synthetic-csrf', server.original.description]) assert.ok(!encoded.includes(secret));
});

test('all actual session modes are required for complete PASS', async () => {
  const { report, server } = await run({
    env: { PERM_IDENTITY_SOURCE: 'session', PERM_TEST_MODE: 'all', PERM_RO_COOKIE: 'session=readonly', PERM_RW_COOKIE: 'session=writable' },
    fixtureEvidence: false,
  });
  assert.equal(report.status, 'PASS');
  assert.equal(report.complete, true);
  assert.equal(report.evidenceLevel, 'idaas-session');
  assert.equal(server.item.description, server.original.description);
});

test('readonly 403 preserves the body and signed-in profile', async () => {
  const { result, server } = await run({ env: { PERM_TEST_MODE: 'readonly' } });
  assert.equal(result.status, 'PASS');
  assert.equal(result.checks.write.remainsSignedIn, true);
  assert.deepEqual(server.item, server.original);
  assert.equal(server.patches, 1);
});

test('anonymous requires known fixture evidence and denies list, detail and write', async () => {
  const { result, server } = await run({ env: { PERM_TEST_MODE: 'anonymous' } });
  assert.equal(result.status, 'PASS');
  assert.equal(result.checks.profile.signedIn, false);
  assert.equal(server.patches, 1);
  const blocked = await run({ env: { PERM_TEST_MODE: 'anonymous' }, fixtureEvidence: false });
  assert.equal(blocked.result.status, 'FAIL');
  assert.equal(blocked.server.patches, 0);
});

test('fixture and project mismatches refuse writes', async () => {
  for (const options of [{ item: { id: 99 } }, { item: { project: 3 } }, { item: { title: 'existing business object' } }, { projectCode: 'OTHER-PROJECT' }]) {
    const { server, result } = await run(options);
    assert.equal(result.status, 'FAIL');
    assert.equal(server.patches, 0);
  }
});

test('dev mode and duplicate permission fields cannot advertise false acceptance', async () => {
  for (const profile of [
    value => { value.permissions.perm_test_mode = 'readonly'; },
    value => { value.permissions.idaas_auth_disabled = false; },
    value => { value.can_write = false; },
    value => { value.module_admin = {}; },
  ]) {
    const { server, result } = await run({ profile });
    assert.equal(result.status, 'FAIL');
    assert.equal(server.patches, 0);
  }
});

test('400, 403 and 500 are not writable success', async () => {
  for (const writeStatus of [400, 403, 500]) {
    const { server, result } = await run({ writeStatus });
    assert.equal(result.status, 'FAIL');
    assert.equal(result.restore, 'original-verified');
    assert.equal(server.patches, 1);
    assert.equal(server.item.description, server.original.description);
  }
});

test('readonly validation error or success cannot stand in for permission denial', async () => {
  for (const denialStatus of [200, 400, 500]) {
    const { result } = await run({ env: { PERM_TEST_MODE: 'readonly' }, denialStatus });
    assert.equal(result.status, 'FAIL');
    assert.equal(result.code, 'WRITE_NOT_DENIED');
  }
});

test('200 without persistence and missing audit fail', async () => {
  const ignored = await run({ ignoreWrites: true });
  assert.equal(ignored.result.status, 'FAIL');
  assert.equal(ignored.result.restore, 'original-verified');
  const missing = await run({ noAudit: true });
  assert.equal(missing.result.status, 'FAIL');
  assert.equal(missing.result.code, 'WRITE_AUDIT_MISSING');
  assert.equal(missing.server.item.description, missing.server.original.description);
});

test('HTML, redirects, invalid JSON and empty payload never pass', async () => {
  const responses = [
    () => new Response('<html>login</html>', { headers: { 'Content-Type': 'text/html' } }),
    () => new Response('', { status: 302, headers: { Location: '/login' } }),
    () => new Response('not-json', { headers: { 'Content-Type': 'application/json' } }),
    () => json(null),
  ];
  for (const response of responses) {
    const { result, server } = await run({ override: ({ path }) => path.includes('user-profile') ? response() : null });
    assert.equal(result.status, 'FAIL');
    assert.equal(server.patches, 0);
  }
});

test('probe response timeout reads effect once and restores without resending probe', async () => {
  const { result, server } = await run({ timeoutAfterApply: true });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.restore, 'verified');
  assert.equal(result.code, 'REQUEST_FAILED_OR_TIMED_OUT');
  assert.equal(server.patches, 2);
  assert.equal(server.item.description, server.original.description);
});

test('restore response timeout verifies actual restored effect', async () => {
  const { result, server } = await run({ restoreTimeout: true });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.restore, 'verified-after-response-error');
  assert.equal(server.patches, 2);
  assert.equal(server.item.description, server.original.description);
});

test('failed recovery and unknown effect are explicit and never blindly retried', async () => {
  const failed = await run({ restoreFails: true });
  assert.equal(failed.result.status, 'FAIL');
  assert.equal(failed.result.restore, 'pending');
  assert.equal(failed.server.patches, 2);
  const unknown = await run({ readbackFailure: true });
  assert.equal(unknown.result.status, 'FAIL');
  assert.equal(unknown.result.restore, 'effect-unknown');
  assert.equal(unknown.server.patches, 1);
});

test('concurrent text is preserved rather than replaced by recovery', async () => {
  const { result, server } = await run({ concurrent: true });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.restore, 'concurrent-change-preserved');
  assert.equal(server.item.description, 'someone else changed this');
  assert.equal(server.patches, 1);
});
