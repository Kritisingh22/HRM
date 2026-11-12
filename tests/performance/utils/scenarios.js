import { config } from '../config/environments.js';
import { createThresholds } from '../config/thresholds.js';
import { validateTestUsers } from './auth.js';

function stage(duration, target) {
  return { duration, target };
}

function rampingOptions(stages, abortOnFail = false) {
  return {
    scenarios: {
      workload: {
        executor: 'ramping-vus',
        startVUs: 0,
        stages,
        gracefulRampDown: '30s',
      },
    },
    summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
    thresholds: createThresholds({ abortOnFail }),
    tags: { environment: config.environment },
  };
}

export function endpointOptions(name) {
  const targetVus = Math.min(config.targetVus, name === 'authentication' ? 5 : 20);
  validateTestUsers(targetVus);
  return {
    ...rampingOptions([
      stage('30s', targetVus),
      stage(config.testDuration || (name === 'authentication' ? '1m' : '2m'), targetVus),
      stage('15s', 0),
    ]),
    summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  };
}

export function profileOptions(profile) {
  const targetVus = config.targetVus;
  let stages;
  let maxVus = targetVus;

  if (profile === 'smoke') {
    maxVus = Math.min(targetVus, 5);
    stages = [
      stage('30s', maxVus),
      stage(config.testDuration || '1m', maxVus),
      stage('15s', 0),
    ];
  } else if (profile === 'baseline') {
    maxVus = Math.min(targetVus, 20);
    stages = [
      stage('1m', maxVus),
      stage(config.testDuration || '5m', maxVus),
      stage('30s', 0),
    ];
  } else if (profile === 'progressive') {
    const tiers = [...new Set([100, 250, targetVus].map((value) => Math.min(value, targetVus)))];
    stages = [];
    for (const tier of tiers) {
      stages.push(stage('2m', tier), stage(config.testDuration || '5m', tier));
    }
    stages.push(stage('30s', 0));
  } else if (profile === 'target') {
    stages = [
      stage('5m', targetVus),
      stage(config.testDuration || '25m', targetVus),
      stage('5m', 0),
    ];
  } else if (profile === 'stress') {
    if (config.stressVus <= targetVus) {
      throw new Error('K6_STRESS_VUS must be greater than TARGET_VUS.');
    }
    maxVus = config.stressVus;
    stages = [
      stage('5m', targetVus),
      stage('5m', targetVus),
      stage('5m', maxVus),
      stage(config.testDuration || '5m', maxVus),
      stage('5m', 0),
    ];
  } else if (profile === 'soak') {
    stages = [
      stage('5m', targetVus),
      stage(config.testDuration || '45m', targetVus),
      stage('5m', 0),
    ];
  } else {
    throw new Error(`Unknown k6 profile: ${profile}`);
  }

  validateTestUsers(maxVus);
  return rampingOptions(stages, profile === 'stress');
}
