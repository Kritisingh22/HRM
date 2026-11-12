import { profileOptions } from '../utils/scenarios.js';
import { runSmoke } from '../utils/workflows.js';
import { writeSummary } from '../utils/reports.js';

export const options = profileOptions('smoke');
export default function () {
  runSmoke();
}
export function handleSummary(data) {
  return writeSummary(data, 'smoke');
}
