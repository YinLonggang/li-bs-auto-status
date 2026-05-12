#!/usr/bin/env node

const baseUrl = (process.env.PERM_BASE_URL || process.env.VITE_API_BASE || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const modeRaw = (process.env.PERM_TEST_MODE || 'all').toLowerCase();
const modeSet = new Set(modeRaw.split(/[\s,|]+/).filter(Boolean));

const profilePath = process.env.PERM_PROFILE_PATH || '/api/auth/user-profile';
const readPath = process.env.PERM_READ_PATH || '/api/li-bs-auto-status/v1/projects/';
const writePath = process.env.PERM_WRITE_PATH || '/api/li-bs-auto-status/v1/projects/';
const writeBody = process.env.PERM_WRITE_BODY
  ? JSON.parse(process.env.PERM_WRITE_BODY)
  : {};

const scenarios = [
  { key: 'anonymous', label: '未登录', cookie: '' },
  { key: 'readonly', label: '只读', cookie: process.env.PERM_RO_COOKIE || '' },
  { key: 'writable', label: '可写', cookie: process.env.PERM_RW_COOKIE || '' },
].filter(scenario => modeSet.has('all') || modeSet.has(scenario.key));

async function request(path, { method = 'GET', cookie = '', csrfToken = '', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    if (csrfToken) headers['X-CSRFToken'] = csrfToken;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '');

  return {
    status: response.status,
    payload,
    requestId: response.headers.get('x-request-id') || payload?.request_id || '',
    csrfToken: payload?.csrftoken || payload?.csrfToken || payload?.csrf || ''
  };
}

async function fetchCsrf(cookie) {
  const response = await request('/api/auth/csrf/', { cookie });
  return response.csrfToken;
}

async function runScenario(scenario) {
  if (scenario.key !== 'anonymous' && !scenario.cookie) {
    return { scenario: scenario.label, status: 'SKIP', detail: '缺少 PERM_RO_COOKIE / PERM_RW_COOKIE' };
  }

  const profile = await request(profilePath, { cookie: scenario.cookie });
  const read = await request(readPath, { cookie: scenario.cookie });

  if (scenario.key === 'anonymous' && profile.status === 200) {
    const permissions = profile.payload?.permissions || {};
    if (
      permissions.idaas_auth_disabled === true &&
      permissions.perm_test_mode &&
      permissions.perm_test_mode !== 'anonymous'
    ) {
      return {
        scenario: scenario.label,
        status: 'SKIP',
        detail: `后端 PERM_TEST_MODE=${permissions.perm_test_mode}（需 anonymous）`
      };
    }
  }

  const csrfToken = await fetchCsrf(scenario.cookie);
  const write = await request(writePath, {
    method: 'POST',
    cookie: scenario.cookie,
    csrfToken,
    body: writeBody
  });

  const pass = scenario.key === 'anonymous'
    ? [401, 403].includes(profile.status) && [401, 403].includes(write.status)
    : scenario.key === 'readonly'
      ? profile.status === 200 && read.status === 200 && write.status === 403
      : profile.status === 200 && read.status === 200 && write.status !== 403;

  return {
    scenario: scenario.label,
    status: pass ? 'PASS' : 'FAIL',
    detail: `profile=${profile.status}, read=${read.status}, write=${write.status}`,
    requestId: write.requestId || read.requestId || profile.requestId
  };
}

async function main() {
  const results = [];
  for (const scenario of scenarios) {
    try {
      results.push(await runScenario(scenario));
    } catch (error) {
      results.push({
        scenario: scenario.label,
        status: 'BLOCKED',
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const failed = results.filter(result => result.status === 'FAIL' || result.status === 'BLOCKED').length;
  console.log(JSON.stringify({ app: 'li-bs-auto-status', baseUrl, mode: modeRaw, results, failed }, null, 2));
  if (failed > 0) process.exitCode = 1;
}

main();
