import { endpointOptions } from '../utils/scenarios.js';
import { runEndpoint } from '../utils/workflows.js';
import { writeSummary } from '../utils/reports.js';

export const options = endpointOptions('attendance');
export default function () {
  runEndpoint('attendance');
}
export function handleSummary(data) {
  return writeSummary(data, 'attendance');
}
