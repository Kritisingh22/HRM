import { check, fail } from 'k6';
import exec from 'k6/execution';
import http from 'k6/http';
import { config, apiUrl } from '../config/environments.js';
import { recordHttpStatus } from './metrics.js';

const roles = ['EMPLOYEE', 'MANAGER', 'HR', 'ADMIN', 'SUPER_ADMIN'];
let users;
let session;

function getUsers() {
  if (!users) users = JSON.parse(open(config.usersFile));
  return users;
}

function assignedRoleAndIndex(vu) {
  if (config.fixedRole) return { role: config.fixedRole, index: vu - 1 };
  return {
    role: roles[(vu - 1) % roles.length],
    index: Math.floor((vu - 1) / roles.length),
  };
}

function getUserForVU(vu) {
  const { role, index } = assignedRoleAndIndex(vu);
  const accounts = getUsers();
  const account = accounts[role] && accounts[role][index];
  if (!account || !account.email || !account.password) {
    fail(`Missing dedicated ${role} test account for VU ${vu}; credentials were not logged.`);
  }
  return { role, account };
}

function durationInMilliseconds(value) {
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/i.exec(String(value || ''));
  if (!match) return 15 * 60 * 1000;
  const factors = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return Number(match[1]) * factors[(match[2] || 's').toLowerCase()];
}

function storeSession(response) {
  const body = response.json();
  if (!body || !body.accessToken) {
    fail('Authentication response did not contain an access token; response body omitted.');
  }
  session = {
    accessToken: body.accessToken,
    expiresAt: Date.now() + durationInMilliseconds(body.expiresIn) - 30000,
  };
}

export function validateTestUsers(requiredVus) {
  const testUsers = getUsers();
  const emails = new Set();
  const needed = {};

  for (let vu = 1; vu <= requiredVus; vu += 1) {
    const { role, index } = assignedRoleAndIndex(vu);
    needed[role] = Math.max(needed[role] || 0, index + 1);
  }

  for (const role of roles) {
    const accounts = testUsers[role] || [];
    if (accounts.length < (needed[role] || 0)) {
      throw new Error(`K6_USERS_FILE needs at least ${needed[role]} ${role} account(s) for ${requiredVus} VUs.`);
    }
    for (const account of accounts) {
      if (!account.email || !account.password) {
        throw new Error(`Every ${role} test account needs an email and password.`);
      }
      const email = String(account.email).trim().toLowerCase();
      if (emails.has(email)) throw new Error('A test account email is duplicated across role pools.');
      emails.add(email);
    }
  }
}

export function authenticate() {
  if (session && Date.now() < session.expiresAt) return session;

  const selected = getUserForVU(__VU);
  const response = http.post(
    apiUrl('/auth/login'),
    JSON.stringify({
      email: selected.account.email,
      password: selected.account.password,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { class: 'auth', endpoint: 'login' },
    },
  );
  recordHttpStatus('login', response.status);
  const passed = check(response, {
    'login returns 200': (res) => res.status === 200,
    'login returns JSON': (res) => String(res.headers['Content-Type'] || '').includes('application/json'),
  });
  if (!passed) {
    exec.test.abort(`Test-account login failed for the ${selected.role} role; response details omitted.`);
  }

  storeSession(response);
  return session;
}

export function refreshIfNeeded() {
  if (!session) return authenticate();
  if (Date.now() < session.expiresAt) return session;

  const response = http.post(apiUrl('/auth/refresh'), null, {
    tags: { class: 'auth', endpoint: 'refresh' },
  });
  recordHttpStatus('refresh', response.status);
  const passed = check(response, {
    'refresh returns 200': (res) => res.status === 200,
    'refresh returns JSON': (res) => String(res.headers['Content-Type'] || '').includes('application/json'),
  });
  if (!passed) fail('Refresh-token rotation failed; response details omitted.');

  storeSession(response);
  return session;
}

export function accessToken() {
  return refreshIfNeeded().accessToken;
}

export function currentRole() {
  return getUserForVU(__VU).role;
}
