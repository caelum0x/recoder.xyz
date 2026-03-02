/**
 * Smoke Test (CI-friendly)
 *
 * Ultra-lightweight load test designed to run in CI on every pull request.
 * Uses 1 VU, 10 iterations — verifies that all key endpoints respond.
 * Completes in under 30 seconds.
 *
 * Run:
 *   k6 run tests/load/smoke.k6.js
 *   k6 run tests/load/smoke.k6.js -e BASE_URL=https://staging.recoder.xyz
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';

const smokeErrors = new Rate('smoke_errors');

export const options = {
  vus: 1,
  iterations: 10,
  thresholds: {
    http_req_failed: ['rate==0'],     // zero transport-level failures
    smoke_errors: ['rate==0'],         // zero logic-level failures
    http_req_duration: ['p(95)<2000'], // generous: under 2s (cold start acceptable)
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export function setup() {
  console.log(`Smoke test targeting: ${BASE_URL}`);
  return { baseUrl: BASE_URL };
}

export default function () {
  let allPassed = true;

  // ---------------------------------------------------------------
  // 1. Health endpoint
  // ---------------------------------------------------------------
  group('health', function () {
    const res = http.get(`${BASE_URL}/api/health`, {
      tags: { name: 'smoke:health' },
    });

    const passed = check(res, {
      '[smoke:health] status is 200': (r) => r.status === 200,
      '[smoke:health] body is valid JSON': (r) => {
        try {
          JSON.parse(r.body);
          return true;
        } catch (_) {
          return false;
        }
      },
      '[smoke:health] status is healthy': (r) => {
        try {
          return JSON.parse(r.body).status === 'healthy';
        } catch (_) {
          return false;
        }
      },
    });

    if (!passed) allPassed = false;
  });

  // ---------------------------------------------------------------
  // 2. Billing plans endpoint (public, no auth required)
  // ---------------------------------------------------------------
  group('billing_plans', function () {
    const res = http.get(`${BASE_URL}/api/billing/plans`, {
      tags: { name: 'smoke:billing-plans' },
    });

    const passed = check(res, {
      '[smoke:plans] status is 200': (r) => r.status === 200,
      '[smoke:plans] returns plans': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.success === true && Array.isArray(body.plans);
        } catch (_) {
          return false;
        }
      },
    });

    if (!passed) allPassed = false;
  });

  // ---------------------------------------------------------------
  // 3. Auth key-validate (expects 401 with invalid key — that's OK)
  // ---------------------------------------------------------------
  group('key_validate', function () {
    const res = http.get(`${BASE_URL}/api/auth/key-validate`, {
      headers: {
        Authorization: 'Bearer sk-recoder-smoketest000000000000',
      },
      tags: { name: 'smoke:key-validate' },
    });

    const passed = check(res, {
      '[smoke:key-validate] responds (200 or 401)': (r) =>
        r.status === 200 || r.status === 401,
      '[smoke:key-validate] returns JSON with valid field': (r) => {
        try {
          const body = JSON.parse(r.body);
          return typeof body.valid === 'boolean';
        } catch (_) {
          return false;
        }
      },
    });

    if (!passed) allPassed = false;
  });

  // ---------------------------------------------------------------
  // 4. Auth login (expects 400 with empty body — validates endpoint is alive)
  // ---------------------------------------------------------------
  group('login_reachable', function () {
    const res = http.post(
      `${BASE_URL}/api/auth/login`,
      JSON.stringify({}),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'smoke:login' },
      }
    );

    const passed = check(res, {
      '[smoke:login] responds (400, 401, or 429)': (r) =>
        [400, 401, 429].includes(r.status),
      '[smoke:login] returns JSON error': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.error !== undefined || body.message !== undefined;
        } catch (_) {
          return false;
        }
      },
    });

    if (!passed) allPassed = false;
  });

  smokeErrors.add(allPassed ? 0 : 1);

  sleep(0.5);
}

export function teardown() {
  console.log('Smoke test completed.');
}
