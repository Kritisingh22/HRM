import { check } from 'k6';
import http from 'k6/http';
import { apiUrl, siteUrl } from '../config/environments.js';
import { accessToken } from './auth.js';
import { recordHttpStatus } from './metrics.js';

export function getJson(path, endpoint) {
  const response = http.get(apiUrl(path), {
    headers: { Authorization: `Bearer ${accessToken()}` },
    tags: { class: 'general', endpoint },
  });
  recordHttpStatus(endpoint, response.status);
  check(response, {
    [`${endpoint} returns 200`]: (res) => res.status === 200,
    [`${endpoint} returns JSON`]: (res) => String(res.headers['Content-Type'] || '').includes('application/json'),
  });
  return response;
}

export function expectForbidden(path, endpoint) {
  const response = http.get(apiUrl(path), {
    headers: { Authorization: `Bearer ${accessToken()}` },
    responseCallback: http.expectedStatuses(403),
    tags: { class: 'auth', endpoint },
  });
  recordHttpStatus(endpoint, response.status);
  check(response, {
    [`${endpoint} is denied with 403`]: (res) => res.status === 403,
  });
  return response;
}

export function getPublicJson(path, endpoint) {
  const response = http.get(siteUrl(path), {
    tags: { class: 'general', endpoint },
  });
  recordHttpStatus(endpoint, response.status);
  check(response, {
    [`${endpoint} returns 200`]: (res) => res.status === 200,
    [`${endpoint} returns JSON`]: (res) => String(res.headers['Content-Type'] || '').includes('application/json'),
  });
  return response;
}
