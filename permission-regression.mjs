#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { open, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const API = '/api/li-bs-auto-status/v1';
const MODES = ['anonymous', 'readonly', 'writable'];
const unwrap = value => value?.data ?? value;
const sha256 = value => createHash('sha256').update(value).digest('hex');

class ProbeError extends Error {
  constructor(code) { super(code); this.code = code; }
}

const requireCheck = (condition, code) => { if (!condition) throw new ProbeError(code); };

export function configuration(env = process.env) {
  const base = new URL(env.PERM_BASE_URL || env.VITE_API_BASE || 'http://127.0.0.1:8000');
  requireCheck(['http:', 'https:'].includes(base.protocol) && !base.username && !base.password && !base.search && !base.hash && base.pathname === '/', 'INVALID_BASE_URL');
  const identitySource = env.PERM_IDENTITY_SOURCE || 'session';
  requireCheck(['session', 'current-dev'].includes(identitySource), 'INVALID_IDENTITY_SOURCE');
  if (identitySource === 'current-dev') {
    requireCheck(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'DEV_REQUIRES_LOOPBACK');
  }
  const requested = (env.PERM_TEST_MODE || 'all').toLowerCase();
  const modes = requested === 'all' ? [...MODES] : [...new Set(requested.split(/[\s,|]+/).filter(Boolean))];
  requireCheck(modes.length > 0 && modes.every(mode => MODES.includes(mode)), 'INVALID_SCENARIO');
  requireCheck(identitySource !== 'current-dev' || modes.length === 1, 'DEV_REQUIRES_ONE_CURRENT_MODE');
  const positiveId = value => /^[1-9]\d*$/.test(value || '') ? String(value) : null;
  const projectId = positiveId(env.PERM_PROJECT_ID);
  const checkItemId = positiveId(env.PERM_CHECK_ITEM_ID);
  const marker = env.PERM_FIXTURE_MARKER || '';
  const projectCode = env.PERM_PROJECT_CODE || '';
  requireCheck(projectId && checkItemId && /^[A-Z0-9][A-Z0-9_-]{7,100}$/.test(marker) && /^[A-Z0-9][A-Z0-9_-]{7,64}$/.test(projectCode), 'EXPLICIT_SYNTHETIC_FIXTURE_REQUIRED');
  return {
    baseUrl: base.origin, identitySource, modes, projectId, checkItemId, marker, projectCode,
    allowWrites: env.PERM_ALLOW_WRITES === '1',
    cookies: { anonymous: '', readonly: env.PERM_RO_COOKIE || '', writable: env.PERM_RW_COOKIE || '' },
    output: env.PERM_OUTPUT || '', fixtureEvidencePath: env.PERM_FIXTURE_EVIDENCE || '',
  };
}

function client(config, cookie, fetchImpl) {
  const cookies = new Map(cookie.split(';').map(value => value.trim()).filter(Boolean).map(value => {
    const index = value.indexOf('=');
    return [value.slice(0, index), value.slice(index + 1)];
  }));
  return async (path, { method = 'GET', body, csrf = '' } = {}) => {
    const headers = { Accept: 'application/json' };
    if (cookies.size) headers.Cookie = [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (csrf) headers['X-CSRFToken'] = csrf;
    let response;
    try {
      response = await fetchImpl(`${config.baseUrl}${path}`, {
        method, headers, redirect: 'manual', signal: AbortSignal.timeout(15000),
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch { throw new ProbeError('REQUEST_FAILED_OR_TIMED_OUT'); }
    for (const value of response.headers.getSetCookie?.() ?? []) {
      const pair = value.split(';', 1)[0];
      const index = pair.indexOf('=');
      if (index > 0) cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    requireCheck(response.status < 300 || response.status >= 400, 'UNEXPECTED_REDIRECT');
    requireCheck(/^application\/(?:[\w.+-]+\+)?json\b/i.test(response.headers.get('content-type') || ''), 'NON_JSON_RESPONSE');
    let payload;
    try { payload = unwrap(await response.json()); }
    catch { throw new ProbeError('INVALID_JSON_RESPONSE'); }
    requireCheck(payload && typeof payload === 'object', 'INVALID_RESPONSE_SHAPE');
    return { status: response.status, payload };
  };
}

function checkProfile(result, mode, config) {
  requireCheck(result.status === (mode === 'anonymous' ? 401 : 200), 'PROFILE_STATUS_MISMATCH');
  const profile = result.payload;
  const permissions = profile.permissions;
  requireCheck(permissions && typeof permissions === 'object', 'PROFILE_FIELDS_MISSING');
  if (mode === 'anonymous') {
    requireCheck(!profile.user?.user_id && permissions.can_write === false && permissions.idaas_auth_disabled === false, 'ANONYMOUS_PROFILE_MISMATCH');
    if (config.identitySource === 'current-dev') requireCheck(permissions.perm_test_mode === mode, 'CURRENT_DEV_MODE_MISMATCH');
    return { signedIn: false, canWrite: false };
  }
  requireCheck(profile.user?.user_id, 'PROFILE_FIELDS_MISSING');
  const canWrite = mode === 'writable';
  requireCheck(permissions.can_write === canWrite && profile.can_write === canWrite, 'PROFILE_WRITE_MISMATCH');
  requireCheck(permissions.is_super_admin === profile.is_super_admin && permissions.is_admin === profile.is_admin, 'PROFILE_FIELD_DRIFT');
  requireCheck(JSON.stringify(permissions.module_admin) === JSON.stringify(profile.module_admin), 'PROFILE_MODULE_FIELD_DRIFT');
  const moduleWrite = permissions.is_super_admin === true || permissions.module_admin?.li_bs_auto_status === true;
  requireCheck(moduleWrite === canWrite, 'MODULE_PERMISSION_MISMATCH');
  if (config.identitySource === 'current-dev') {
    requireCheck(permissions.idaas_auth_disabled === true && permissions.perm_test_mode === mode, 'CURRENT_DEV_MODE_MISMATCH');
  } else {
    requireCheck(permissions.idaas_auth_disabled === false, 'SIMULATED_IDENTITY_IS_NOT_SESSION_ACCEPTANCE');
  }
  return { signedIn: true, canWrite, identityPresent: true, canonicalFieldsAgree: true };
}

function checkFixture(result, config) {
  requireCheck(result.status === 200, 'FIXTURE_READ_FAILED');
  const item = result.payload;
  requireCheck(String(item.id) === config.checkItemId && String(item.project) === config.projectId && typeof item.title === 'string' && item.title.startsWith(`${config.marker}-`), 'FIXTURE_SCOPE_MISMATCH');
  requireCheck(typeof item.description === 'string', 'FIXTURE_BODY_MISSING');
  return item;
}

async function auditState(request, config) {
  const query = new URLSearchParams({ project: config.projectId, object_type: 'CheckItem', object_id: config.checkItemId, action: 'check_item.update', page_size: '100' });
  const result = await request(`${API}/audit-logs/?${query}`);
  requireCheck(result.status === 200 && Array.isArray(result.payload.results) && Number.isInteger(result.payload.count), 'AUDIT_READ_FAILED');
  return result.payload;
}

async function runScenario(mode, config, fetchImpl) {
  if (config.identitySource === 'session' && mode !== 'anonymous' && !config.cookies[mode]) {
    return { scenario: mode, status: 'BLOCKED', code: 'MISSING_SESSION' };
  }
  const request = client(config, config.identitySource === 'session' ? config.cookies[mode] : '', fetchImpl);
  const detailPath = `${API}/check-items/${config.checkItemId}/`;
  const result = { scenario: mode, status: 'FAIL', checks: {}, restore: 'not-needed' };
  try {
    const profile = await request('/api/auth/user-profile');
    result.checks.profile = checkProfile(profile, mode, config);
    const read = await request(`${API}/check-items/?project=${config.projectId}&q=${encodeURIComponent(config.marker)}&page_size=20`);
    requireCheck(read.status === (mode === 'anonymous' ? 403 : 200), 'LIST_STATUS_MISMATCH');
    if (mode !== 'anonymous') requireCheck(Array.isArray(read.payload.results) && Number.isInteger(read.payload.count), 'LIST_SHAPE_MISMATCH');
    const detail = await request(detailPath);
    let original = null;
    if (mode === 'anonymous') requireCheck(detail.status === 403, 'ANONYMOUS_DETAIL_NOT_DENIED');
    else {
      original = checkFixture(detail, config);
      const project = await request(`${API}/projects/${config.projectId}/`);
      requireCheck(project.status === 200 && String(project.payload.id) === config.projectId && project.payload.code === config.projectCode, 'PROJECT_SCOPE_MISMATCH');
    }
    result.checks.read = { list: read.status, detail: detail.status, fixtureVerified: !!original };
    if (mode === 'anonymous') {
      // Bind a denial probe to a fixture already checked in an authenticated state.
      requireCheck(config.verifiedFixture, 'ANONYMOUS_FIXTURE_EVIDENCE_REQUIRED');
      const evidence = config.verifiedFixture;
      requireCheck(['controlled-dev', 'idaas-session'].includes(evidence.evidenceLevel)
        && String(evidence.fixture?.projectId) === config.projectId
        && String(evidence.fixture?.checkItemId) === config.checkItemId
        && evidence.fixture?.marker === config.marker
        && evidence.fixture?.projectCode === config.projectCode
        && evidence.results?.some(row => row.status === 'PASS' && row.scenario !== 'anonymous' && row.checks?.read?.fixtureVerified), 'ANONYMOUS_FIXTURE_EVIDENCE_MISMATCH');
    }
    requireCheck(config.allowWrites, 'WRITE_PROBE_NOT_AUTHORIZED');
    const csrfResult = await request('/api/auth/csrf/');
    const csrf = csrfResult.payload.csrftoken || csrfResult.payload.csrfToken || csrfResult.payload.csrf;
    requireCheck(csrfResult.status === 200 && typeof csrf === 'string' && csrf, 'CSRF_UNAVAILABLE');
    if (mode !== 'writable') {
      // Invalid CharField input also prevents a mutation if authorization regresses.
      const write = await request(detailPath, { method: 'PATCH', csrf, body: { description: { permission_probe: config.marker } } });
      requireCheck(write.status === 403, 'WRITE_NOT_DENIED');
      if (original) {
        const after = checkFixture(await request(detailPath), config);
        requireCheck(after.description === original.description && after.updated_at === original.updated_at, 'DENIED_WRITE_CHANGED_FIXTURE');
      }
      checkProfile(await request('/api/auth/user-profile'), mode, config);
      result.checks.write = { status: write.status, denied: true, remainsSignedIn: mode !== 'anonymous' };
    } else {
      const beforeAudit = await auditState(request, config);
      const prior = checkFixture(await request(detailPath), config);
      requireCheck(prior.description === original.description && prior.updated_at === original.updated_at, 'FIXTURE_CHANGED_BEFORE_PROBE');
      const probe = `${config.marker} permission probe ${randomUUID()}`;
      let writeError = null;
      result.restore = 'effect-unknown';
      result.originalDescriptionSha256 = sha256(original.description);
      try {
        const write = await request(detailPath, { method: 'PATCH', csrf, body: { description: probe } });
        requireCheck(write.status === 200 && checkFixture(write, config).description === probe, 'WRITE_RESULT_MISMATCH');
        const after = checkFixture(await request(detailPath), config);
        requireCheck(after.description === probe, 'WRITE_READBACK_MISMATCH');
        result.checks.write = { status: 200, readbackMatched: true, sha256: sha256(probe) };
      } catch (error) { writeError = error; }
      // Read before recovery even after timeout; never resend a potentially applied probe.
      const current = checkFixture(await request(detailPath), config);
      if (current.description === probe) {
        result.restore = 'pending';
        let restoreError = null;
        try {
          const restored = await request(detailPath, { method: 'PATCH', csrf, body: { description: original.description } });
          requireCheck(restored.status === 200, 'RESTORE_WRITE_FAILED');
        } catch (error) { restoreError = error; }
        const verified = checkFixture(await request(detailPath), config);
        requireCheck(verified.description === original.description, 'RESTORE_READBACK_MISMATCH');
        result.restore = restoreError ? 'verified-after-response-error' : 'verified';
        if (restoreError && !writeError) writeError = restoreError;
      } else {
        if (current.description !== original.description) result.restore = 'concurrent-change-preserved';
        requireCheck(current.description === original.description, 'CONCURRENT_BODY_CHANGE_PRESERVED');
        result.restore = 'original-verified';
      }
      if (writeError) throw writeError;
      requireCheck(result.restore === 'verified', 'PROBE_NOT_PERSISTED');
      const afterAudit = await auditState(request, config);
      const priorIds = new Set(beforeAudit.results.map(row => row.id));
      const added = afterAudit.results.filter(row => !priorIds.has(row.id));
      requireCheck(afterAudit.count >= beforeAudit.count + 2 && added.length >= 2 && added.every(row => row.action === 'check_item.update' && row.object_type === 'CheckItem' && String(row.object_id) === config.checkItemId && String(row.project) === config.projectId && !!row.actor_idaas_id && row.actor_idaas_id === profile.payload.user.user_id), 'WRITE_AUDIT_MISSING');
      result.checks.audit = { newEvents: added.length, actorPresent: true, ids: added.map(row => row.id) };
    }
    result.status = 'PASS';
  } catch (error) {
    result.status = error.code === 'WRITE_PROBE_NOT_AUTHORIZED' ? 'BLOCKED' : 'FAIL';
    result.code = error instanceof ProbeError ? error.code : 'UNEXPECTED_PROBE_ERROR';
  }
  return result;
}

export async function runRegression(config, fetchImpl = fetch) {
  const evidenceLevel = config.identitySource === 'current-dev' ? 'controlled-dev' : 'idaas-session';
  const fixture = { projectId: config.projectId, checkItemId: config.checkItemId, marker: config.marker, projectCode: config.projectCode };
  const results = [];
  // Authenticated reads establish fixture ownership before the anonymous denial probe.
  const order = [...config.modes].sort((a, b) => Number(a === 'anonymous') - Number(b === 'anonymous'));
  for (const mode of order) {
    const verifiedFixture = config.verifiedFixture || { evidenceLevel, fixture, results };
    results.push(await runScenario(mode, { ...config, verifiedFixture }, fetchImpl));
  }
  const failed = results.filter(result => result.status !== 'PASS').length;
  const complete = MODES.every(mode => results.some(result => result.scenario === mode && result.status === 'PASS'));
  return {
    app: 'li-bs-auto-status', checkedAt: new Date().toISOString(), evidenceLevel, fixture,
    results, failed, complete, status: failed ? 'INCOMPLETE' : complete ? 'PASS' : 'SCENARIO_PASS',
  };
}

async function main() {
  let output;
  try {
    const config = configuration();
    if (config.fixtureEvidencePath) config.verifiedFixture = JSON.parse(await readFile(config.fixtureEvidencePath, 'utf8'));
    // Reserve evidence output before any request so a path failure cannot follow a write.
    if (config.output) output = await open(config.output, 'wx', 0o600);
    const report = await runRegression(config);
    if (output) await output.writeFile(`${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    if (report.failed) process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({ status: 'BLOCKED', code: error instanceof ProbeError ? error.code : 'REGRESSION_CONFIGURATION_OR_OUTPUT_FAILED', complete: false }));
    process.exitCode = 1;
  } finally { await output?.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
