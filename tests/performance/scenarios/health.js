import { createThresholds } from '../config/thresholds.js';
import { recordActiveVus } from '../utils/metrics.js';
import { getPublicJson } from '../utils/requests.js';
import { writeSummary } from '../utils/reports.js';

export const options = {
  vus: 1,
  iterations: 1,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  thresholds: createThresholds(),
};

export default function () {
  recordActiveVus();
  getPublicJson('/health', 'health');
}

export function handleSummary(data) {
  return writeSummary(data, 'health');
}
