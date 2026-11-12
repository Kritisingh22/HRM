const generalLatency = ['p(95)<500', 'p(99)<1000'];

export function createThresholds({ abortOnFail = false } = {}) {
  const thresholds = {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    'http_req_duration{class:general}': generalLatency,
    'http_req_duration{class:auth,endpoint:login}': ['p(95)<1000', 'p(99)<2000'],
    'http_req_duration{class:auth,endpoint:refresh}': generalLatency,
    'http_req_duration{endpoint:dashboard}': generalLatency,
    'http_req_duration{endpoint:employees}': generalLatency,
    'http_req_duration{endpoint:attendance}': generalLatency,
    'http_req_duration{endpoint:leaves}': generalLatency,
    'http_req_duration{endpoint:notifications}': generalLatency,
    'http_req_duration{endpoint:payroll}': generalLatency,
    'http_req_duration{endpoint:reports}': generalLatency,
  };

  if (!abortOnFail) return thresholds;

  for (const [metric, rules] of Object.entries(thresholds)) {
    thresholds[metric] = rules.map((threshold) => ({
      threshold,
      abortOnFail: true,
      delayAbortEval: '30s',
    }));
  }

  return thresholds;
}
