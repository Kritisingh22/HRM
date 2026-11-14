import { group, sleep } from 'k6';
import { authenticate, currentRole } from './auth.js';
import { recordActiveVus } from './metrics.js';
import { expectForbidden, getJson, getPublicJson } from './requests.js';

const traffic = [
  { weight: 0.10, run: () => getJson('/auth/me', 'auth_me') },
  { weight: 0.20, run: () => getJson('/dashboard', 'dashboard') },
  { weight: 0.15, run: () => getJson('/employees', 'employees') },
  { weight: 0.15, run: () => getJson('/attendance/me', 'attendance') },
  { weight: 0.15, run: () => getJson('/leaves', 'leaves') },
  { weight: 0.10, run: () => getJson('/notifications/unread-count', 'notifications') },
  { weight: 0.05, run: () => getJson('/payroll', 'payroll') },
  { weight: 0.10, run: () => getJson('/reports/me', 'reports') },
];

export function runSmoke() {
  recordActiveVus();
  getPublicJson('/health', 'health');
  authenticate();
  getJson('/auth/me', 'auth_me');
  getJson('/dashboard', 'dashboard');
  sleep(1);
}

export function runAuthentication() {
  recordActiveVus();
  authenticate();
  getJson('/auth/me', 'auth_me');
  if (currentRole() === 'EMPLOYEE') {
    expectForbidden('/analytics/overview', 'authz_denied');
  }
  sleep(1);
}

export function runEndpoint(endpoint) {
  recordActiveVus();
  authenticate();
  if (endpoint === 'authentication') return runAuthentication();

  const routes = {
    dashboard: ['/dashboard', 'dashboard'],
    employees: ['/employees', 'employees'],
    attendance: ['/attendance/me', 'attendance'],
    leave: ['/leaves', 'leaves'],
    notifications: ['/notifications/unread-count', 'notifications'],
    payroll: ['/payroll', 'payroll'],
    reports: ['/reports/me', 'reports'],
  };
  const route = routes[endpoint];
  if (!route) throw new Error(`Unknown endpoint scenario: ${endpoint}`);
  getJson(route[0], route[1]);
  sleep(1);
}

export function runFullWorkflow() {
  recordActiveVus();
  authenticate();
  const choice = Math.random();
  let boundary = 0;
  for (const item of traffic) {
    boundary += item.weight;
    if (choice < boundary) {
      group('read-only HRM workflow', item.run);
      break;
    }
  }
  sleep(1 + Math.random() * 2);
}
