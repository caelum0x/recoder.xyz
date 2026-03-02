/**
 * General API Load Test — Weighted Scenarios
 *
 * Tests multiple API endpoints with realistic traffic distribution:
 *   - 60% — GET /api/health          (high-frequency lightweight check)
 *   - 20% — GET /api/billing/plans   (public pricing page)
 *   - 20% — GET /api/auth/key-validate (CLI authentication with test key header)
 *
 * Run:
 *   k6 run tests/load/api.k6.js
 *   k6 run tests/load/api.k6.js -e BASE_URL=https://staging.recoder.xyz
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Per-endpoint custom metrics
const healthErrors = new Rate('health_endpoint_errors');
const plansErrors = new Rate('plans_endpoint_errors');
const keyValidateErrors = new Rate('key_validate_endpoint_errors');
const healthTiming = new Trend('health_endpoint_duration', true);
const plansTiming = new Trend('plans_endpoint_duration', true);
const keyValidateTiming = new Trend('key_validate_endpoint_duration', true);

export const options = {
  scenarios: {
    health_check: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 12 },  // 60% of 20 peak VUs
        { duration: '1m', target: 12 },
        { duration: '10s', target: 0 },
      ],
      exec: 'healthCheck',
      tags: { scenario: 'health' },
    },
    billing_plans: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 4 },   // 20% of 20 peak VUs
        { duration: '1m', target: 4 },
        { duration: '10s', target: 0 },
      ],
      exec: 'billingPlans',
      tags: { scenario: 'plans' },
    },
    key_validate: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 4 },   // 20% of 20 peak VUs
        { duration: '1m', target: 4 },
        { duration: '10s', target: 0 },
      ],
      exec: 'keyValidate',
      tags: { scenario: 'key_validate' },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1000'],            // global: 95th percentile under 1s
    http_req_failed: ['rate<0.02'],               // global: less than 2% transport failures
    health_endpoint_errors: ['rate<0.01'],         // health: under 1% logic errors
    plans_endpoint_errors: ['rate<0.02'],          // plans: under 2% logic errors
    key_validate_endpoint_errors: ['rate<0.05'],   // key-validate: under 5% (may 401 by design)
    health_endpoint_duration: ['p(95)<500'],       // health: fast
    plans_endpoint_duration: ['p(95)<800'],        // plans: moderate
    key_validate_endpoint_duration: ['p(95)<1000'],// key-validate: slightly slower (DB lookup)
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// A deliberately invalid API key for testing — the endpoint should return 401.
// If TEST_API_KEY is set in the environment, use that for authenticated testing.
const TEST_API_KEY = __ENV.TEST_API_KEY || 'sk-recoder-k6loadtest000000000000';

export function setup() {
  const res = http.get(`${BASE_URL}/api/health`);
  if (res.status !== 200) {
    console.error(`Setup: health check failed (${res.status}). Tests may produce elevated error rates.`);
  }
  return { baseUrl: BASE_URL, startedAt: new Date().toISOString() };
}

// -------------------------------------------------------------------
// Scenario: Health Check (60% of traffic)
// -------------------------------------------------------------------
export function healthCheck() {
  const res = http.get(`${BASE_URL}/api/health`, {
    tags: { name: 'GET /api/health' },
  });

  healthTiming.add(res.timings.duration);

  const passed = check(res, {
    '[health] status is 200': (r) => r.status === 200,
    '[health] body has status field': (r) => {
      try {
        return JSON.parse(r.body).status === 'healthy';
      } catch (_) {
        return false;
      }
    },
    '[health] response time < 500ms': (r) => r.timings.duration < 500,
  });

  healthErrors.add(passed ? 0 : 1);
  sleep(1);
}

// -------------------------------------------------------------------
// Scenario: Billing Plans (20% of traffic)
// -------------------------------------------------------------------
export function billingPlans() {
  const res = http.get(`${BASE_URL}/api/billing/plans`, {
    tags: { name: 'GET /api/billing/plans' },
  });

  plansTiming.add(res.timings.duration);

  const passed = check(res, {
    '[plans] status is 200': (r) => r.status === 200,
    '[plans] returns plans array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success === true && Array.isArray(body.plans) && body.plans.length > 0;
      } catch (_) {
        return false;
      }
    },
    '[plans] includes free plan': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.plans.some((p) => p.id === 'free');
      } catch (_) {
        return false;
      }
    },
    '[plans] response time < 800ms': (r) => r.timings.duration < 800,
  });

  plansErrors.add(passed ? 0 : 1);
  sleep(2);
}

// -------------------------------------------------------------------
// Scenario: API Key Validation (20% of traffic)
// -------------------------------------------------------------------
export function keyValidate() {
  const res = http.get(`${BASE_URL}/api/auth/key-validate`, {
    headers: {
      Authorization: `Bearer ${TEST_API_KEY}`,
    },
    tags: { name: 'GET /api/auth/key-validate' },
  });

  keyValidateTiming.add(res.timings.duration);

  const passed = check(res, {
    '[key-validate] status is 200 or 401': (r) =>
      r.status === 200 || r.status === 401,
    '[key-validate] returns valid JSON': (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch (_) {
        return false;
      }
    },
    '[key-validate] body has valid field': (r) => {
      try {
        const body = JSON.parse(r.body);
        return typeof body.valid === 'boolean';
      } catch (_) {
        return false;
      }
    },
    '[key-validate] response time < 1000ms': (r) => r.timings.duration < 1000,
  });

  keyValidateErrors.add(passed ? 0 : 1);
  sleep(2);
}

export function teardown(data) {
  console.log(`API load test completed. Started at ${data.startedAt}`);
  console.log('Traffic distribution: 60% health, 20% plans, 20% key-validate');
}
