import { endpointOptions } from '../utils/scenarios.js';
import { runAuthentication } from '../utils/workflows.js';
import { writeSummary } from '../utils/reports.js';

export const options = endpointOptions('authentication');
export default function () {
  runAuthentication();
}
export function handleSummary(data) {
  return writeSummary(data, 'authentication');
}
