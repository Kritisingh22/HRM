import { endpointOptions } from '../utils/scenarios.js';
import { runEndpoint } from '../utils/workflows.js';
import { writeSummary } from '../utils/reports.js';

export const options = endpointOptions('leave');
export default function () {
  runEndpoint('leave');
}
export function handleSummary(data) {
  return writeSummary(data, 'leave');
}
