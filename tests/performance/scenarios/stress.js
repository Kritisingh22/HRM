import { profileOptions } from '../utils/scenarios.js';
import { runFullWorkflow } from '../utils/workflows.js';
import { writeSummary } from '../utils/reports.js';

export const options = profileOptions('stress');
export default function () {
  runFullWorkflow();
}
export function handleSummary(data) {
  return writeSummary(data, 'stress');
}
