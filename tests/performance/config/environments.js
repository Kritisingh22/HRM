const LOCAL_BASE_URL = 'http://127.0.0.1:5000';

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function parsePositiveInteger(name, fallback) {
  const value = Number(__ENV[name] || fallback);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function hostnameFromUrl(value, name) {
  const match = /^https?:\/\/(\[[^\]]+\]|[^/:?#]+)(?::\d+)?(?:[/?#]|$)/i.exec(value);
  if (!match || value.includes('@') || value.includes('?') || value.includes('#')) {
    throw new Error(`${name} must be an absolute HTTP(S) URL without embedded credentials.`);
  }
  return match[1].replace(/^\[|\]$/g, '').toLowerCase();
}

const environment = (__ENV.K6_ENV || 'local').toLowerCase();
const baseUrl = trimTrailingSlash(__ENV.BASE_URL || LOCAL_BASE_URL);
const apiBaseUrl = trimTrailingSlash(__ENV.API_BASE_URL || `${baseUrl}/api`);
const hostname = hostnameFromUrl(baseUrl, 'BASE_URL');
const apiHostname = hostnameFromUrl(apiBaseUrl, 'API_BASE_URL');

if (environment === 'local') {
  const loopbackHosts = ['localhost', '127.0.0.1', '::1'];
  if (!loopbackHosts.includes(hostname) || !loopbackHosts.includes(apiHostname)) {
    throw new Error('K6_ENV=local only permits loopback BASE_URL and API_BASE_URL values.');
  }
} else if (environment === 'staging') {
  if (__ENV.ALLOW_STAGING_TESTS !== 'true') {
    throw new Error('Set ALLOW_STAGING_TESTS=true to run against staging.');
  }
  if (!__ENV.BASE_URL) {
    throw new Error('Set BASE_URL explicitly for staging.');
  }
  if (!baseUrl.startsWith('https://') || !apiBaseUrl.startsWith('https://')) {
    throw new Error('Staging BASE_URL and API_BASE_URL must use HTTPS.');
  }
} else if (environment === 'production') {
  if (__ENV.PRODUCTION_AUTHORIZATION !== 'I_AUTHORIZE_PRODUCTION_LOAD_TESTING') {
    throw new Error('Production tests require explicit PRODUCTION_AUTHORIZATION.');
  }
  if (!__ENV.BASE_URL || !__ENV.API_BASE_URL) {
    throw new Error('Production tests require explicit BASE_URL and API_BASE_URL.');
  }
  if (!baseUrl.startsWith('https://') || !apiBaseUrl.startsWith('https://')) {
    throw new Error('Production BASE_URL and API_BASE_URL must use HTTPS.');
  }
} else {
  throw new Error('K6_ENV must be local, staging, or production.');
}

export const config = {
  environment,
  baseUrl,
  apiBaseUrl,
  targetVus: parsePositiveInteger('TARGET_VUS', 500),
  testDuration: __ENV.TEST_DURATION || '',
  usersFile: __ENV.K6_USERS_FILE || '../data/test-users.json',
  stressVus: parsePositiveInteger('K6_STRESS_VUS', 750),
  fixedRole: (__ENV.K6_ROLE || '').toUpperCase(),
};

if (config.fixedRole && !['EMPLOYEE', 'MANAGER', 'HR', 'ADMIN', 'SUPER_ADMIN'].includes(config.fixedRole)) {
  throw new Error('K6_ROLE must be EMPLOYEE, MANAGER, HR, ADMIN, or SUPER_ADMIN.');
}

export function apiUrl(path) {
  return `${config.apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

export function siteUrl(path) {
  return `${config.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}
