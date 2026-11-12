import { endpointOptions } from '../utils/scenarios.js';
import { runEndpoint } from '../utils/workflows.js';
import { writeSummary } from '../utils/reports.js';

export const options = endpointOptions('employees');
export default function () {
  runEndpoint('employees');
}
export function handleSummary(data) {
  return writeSummary(data, 'employees');
}
