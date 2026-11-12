import { endpointOptions } from '../utils/scenarios.js';
import { runEndpoint } from '../utils/workflows.js';
import { writeSummary } from '../utils/reports.js';

export const options = endpointOptions('payroll');
export default function () {
  runEndpoint('payroll');
}
export function handleSummary(data) {
  return writeSummary(data, 'payroll');
}
