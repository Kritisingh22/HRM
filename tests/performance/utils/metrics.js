import exec from 'k6/execution';
import { Counter, Gauge } from 'k6/metrics';

const statuses = ['200', '201', '202', '204', '301', '302', '400', '401', '403', '404', '409', '413', '429', '500', '502', '503'];
const httpStatus = Object.fromEntries(
  [...statuses, 'other'].map((status) => [status, new Counter(`http_status_${status}`)]),
);
const endpoints = [
  'login',
  'refresh',
  'auth_me',
  'dashboard',
  'employees',
  'attendance',
  'leaves',
  'notifications',
  'payroll',
  'reports',
  'authz_denied',
  'health',
];
const endpointRequests = Object.fromEntries(
  [...endpoints, 'other'].map((endpoint) => [endpoint, new Counter(`requests_${endpoint}`)]),
);
const activeVus = new Gauge('active_vus');

export function recordHttpStatus(endpoint, status) {
  const statusLabel = String(status);
  const counter = httpStatus[statusLabel] || httpStatus.other;
  counter.add(1);
  const requestCounter = endpointRequests[endpoint] || endpointRequests.other;
  requestCounter.add(1);
}

export function recordActiveVus() {
  activeVus.add(exec.instance.vusActive);
}
