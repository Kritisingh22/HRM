import { endpointOptions } from '../utils/scenarios.js';
import { runEndpoint } from '../utils/workflows.js';
import { writeSummary } from '../utils/reports.js';

export const options = endpointOptions('notifications');
export default function () {
  runEndpoint('notifications');
}
export function handleSummary(data) {
  return writeSummary(data, 'notifications');
}
