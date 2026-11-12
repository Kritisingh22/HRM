function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

function metricValue(metrics, name, key) {
  const metric = metrics[name];
  return metric && metric.values && metric.values[key] !== undefined
    ? metric.values[key]
    : 'Not recorded';
}

function endpointMetricValue(metrics, endpoint, metricName, key) {
  const requestCount = metrics[`requests_${endpoint}`];
  if (!requestCount || requestCount.values.count < 1) return 'Not recorded';
  return metricValue(metrics, metricName, key);
}

function thresholdStatus(metrics) {
  const requestCount = metrics.http_reqs && metrics.http_reqs.values && metrics.http_reqs.values.count;
  const checkRate = metrics.checks && metrics.checks.values && metrics.checks.values.rate;
  const thresholdMetrics = Object.values(metrics).filter(
    (metric) => metric.thresholds && Object.keys(metric.thresholds).length > 0,
  );
  return Boolean(
    requestCount > 0
    && checkRate > 0.99
    && thresholdMetrics.length > 0
    && thresholdMetrics.every((metric) => Object.values(metric.thresholds).every((threshold) => threshold.ok)),
  );
}

export function writeSummary(data, scenario) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = `tests/performance/results/${scenario}-${timestamp}`;
  const metrics = data.metrics || {};
  const status = thresholdStatus(metrics) ? 'PASS' : 'FAIL';
  const latencyRows = [
    ['General API p95 (ms)', metricValue(metrics, 'http_req_duration{class:general}', 'p(95)')],
    ['General API p99 (ms)', metricValue(metrics, 'http_req_duration{class:general}', 'p(99)')],
    ['Login p95 (ms)', endpointMetricValue(metrics, 'login', 'http_req_duration{class:auth,endpoint:login}', 'p(95)')],
    ['Login p99 (ms)', endpointMetricValue(metrics, 'login', 'http_req_duration{class:auth,endpoint:login}', 'p(99)')],
    ['Dashboard p95 (ms)', endpointMetricValue(metrics, 'dashboard', 'http_req_duration{endpoint:dashboard}', 'p(95)')],
    ['Employee API p95 (ms)', endpointMetricValue(metrics, 'employees', 'http_req_duration{endpoint:employees}', 'p(95)')],
    ['Attendance p95 (ms)', endpointMetricValue(metrics, 'attendance', 'http_req_duration{endpoint:attendance}', 'p(95)')],
    ['Leave p95 (ms)', endpointMetricValue(metrics, 'leaves', 'http_req_duration{endpoint:leaves}', 'p(95)')],
    ['Notifications p95 (ms)', endpointMetricValue(metrics, 'notifications', 'http_req_duration{endpoint:notifications}', 'p(95)')],
    ['Payroll p95 (ms)', endpointMetricValue(metrics, 'payroll', 'http_req_duration{endpoint:payroll}', 'p(95)')],
    ['Reports p95 (ms)', endpointMetricValue(metrics, 'reports', 'http_req_duration{endpoint:reports}', 'p(95)')],
    ['Average request latency (ms)', metricValue(metrics, 'http_req_duration', 'avg')],
    ['Median request latency (ms)', metricValue(metrics, 'http_req_duration', 'med')],
    ['p90 request latency (ms)', metricValue(metrics, 'http_req_duration', 'p(90)')],
    ['HTTP request failures', metricValue(metrics, 'http_req_failed', 'rate')],
    ['Checks passed', metricValue(metrics, 'checks', 'rate')],
    ['Total requests', metricValue(metrics, 'http_reqs', 'count')],
    ['Peak active virtual users', metricValue(metrics, 'active_vus', 'max')],
    ['Peak requests/second', metricValue(metrics, 'http_reqs', 'rate')],
  ];
  const tableRows = latencyRows.map(([label, value]) =>
    `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
  ).join('');
  const statusRows = Object.entries(metrics).map(([name, metric]) => {
    const match = /^http_status_(\d{3}|other)$/.exec(name);
    return match && metric.values.count > 0
      ? `<tr><th>HTTP ${escapeHtml(match[1])} requests</th><td>${escapeHtml(metric.values.count)}</td></tr>`
      : '';
  }).join('');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>k6 ${escapeHtml(scenario)} report</title>
<style>body{font:16px system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;color:#17202a}
h1{margin-bottom:.2rem}.status{font-weight:700;color:${status === 'PASS' ? '#18794e' : '#b42318'}}
table{border-collapse:collapse;width:100%;margin:1.5rem 0}th,td{border:1px solid #d0d7de;padding:.6rem;text-align:left}
th{width:55%;background:#f6f8fa}.note{background:#fff8c5;padding:1rem}</style></head>
<body><h1>k6 ${escapeHtml(scenario)} performance report</h1>
<p>Result: <span class="status">${status}</span> (k6 thresholds only)</p>
<p>Run time: ${escapeHtml(new Date().toISOString())}</p>
<table>${tableRows}${statusRows}</table>
<p class="note">Node.js, MongoDB, Cloudflare R2, and hosting CPU/memory telemetry are not collected by k6. Record those observations from the staging monitoring systems; do not infer them from virtual-user counts.</p>
<p>Raw k6 summary is saved next to this report as JSON. No response bodies or test credentials are included.</p>
</body></html>`;

  return {
    [`${prefix}.json`]: JSON.stringify(data, null, 2),
    [`${prefix}.html`]: html,
  };
}
