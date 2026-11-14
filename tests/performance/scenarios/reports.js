import { endpointOptions } from '../utils/scenarios.js';
import { runEndpoint } from '../utils/workflows.js';
import { writeSummary } from '../utils/reports.js';

export const options = endpointOptions('reports');
export default function () {
  runEndpoint('reports');
}
export function handleSummary(data) {
  return writeSummary(data, 'reports');
}
