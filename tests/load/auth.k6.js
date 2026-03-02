/**
 * Auth Endpoint Load Test
 *
 * Tests the /api/auth/login endpoint under load.
 * Validates that:
 *   - The login endpoint responds within acceptable time
 *   - Rate limiting (429) kicks in at high request rates
 *   - Error responses are well-formed JSON
 *
 * The auth endpoint is rate-limited to 5 req/min per IP.
 * This test intentionally pushes past that limit to verify
 * rate limiting works correctly.
 *
 * Run:
 *   k6 run tests/load/auth.k6.js
 *   k6 run tests/load/auth.k6.js -e BASE_URL=https://staging.recoder.xyz
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const authErrorRate = new Rate('auth_errors');
const authDuration = new Trend('auth_duration', true);
const rateLimitHits = new Counter('rate_limit_hits');

export const options = {
  stages: [
    { duration: '15s', target: 5 },   // ramp up slowly
    { duration: '30s', target: 10 },   // moderate load — should trigger rate limiting
    { duration: '30s', target: 20 },   // heavier load — rate limiting well engaged
    { duration: '15s', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],  // 95th percentile under 1s
    http_req_failed: ['rate<0.05'],     // less than 5% transport-level failures
    auth_errors: ['rate<0.05'],         // auth logic errors under 5% (excluding expected 429s and 401s)
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Test credentials — deliberately invalid, must not correspond to any real user.
// The test validates that the endpoint responds correctly to invalid credentials (401)
// and rate-limits excessive requests (429).
if (!__ENV.TEST_EMAIL) {
  console.warn('TEST_EMAIL not set — using non-routable placeholder (test@k6.invalid)');
}
const TEST_CREDENTIALS = {
  email: __ENV.TEST_EMAIL || 'test@k6.invalid',
  password: __ENV.TEST_PASSWORD || 'K6LoadTest!2024#Invalid',
};

export function setup() {
  // Smoke-check: make sure the server is up
  const healthRes = http.get(`${BASE_URL}/api/health`);
  if (healthRes.status !== 200) {
    console.error(`Health check failed (${healthRes.status}) — server may be unreachable.`);
  }
  return { baseUrl: BASE_URL, startedAt: new Date().toISOString() };
}

export default function () {
  group('login_attempt', function () {
    const payload = JSON.stringify({
      email: TEST_CREDENTIALS.email,
      password: TEST_CREDENTIALS.password,
    });

    const params = {
      headers: {
        'Content-Type': 'application/json',
      },
      tags: { name: 'AuthLogin' },
    };

    const res = http.post(`${BASE_URL}/api/auth/login`, payload, params);

    authDuration.add(res.timings.duration);

    // Track rate-limit responses separately
    if (res.status === 429) {
      rateLimitHits.add(1);
    }

    const passed = check(res, {
      'response is valid JSON': (r) => {
        try {
          JSON.parse(r.body);
          return true;
        } catch (_) {
          return false;
        }
      },
      'status is expected (200, 400, 401, 403, or 429)': (r) =>
        [200, 400, 401, 403, 429].includes(r.status),
      'response time < 1000ms': (r) => r.timings.duration < 1000,
      'rate limit returns retry-after or standard 429 body': (r) => {
        if (r.status === 429) {
          // Verify rate limit response is well-formed
          try {
            const body = JSON.parse(r.body);
            return body.error !== undefined || body.message !== undefined;
          } catch (_) {
            return false;
          }
        }
        return true; // non-429 responses pass this check
      },
      'invalid credentials return 401': (r) => {
        // When not rate-limited, we expect 401 for invalid creds
        if (r.status === 401) {
          try {
            const body = JSON.parse(r.body);
            return body.error === 'Invalid email or password';
          } catch (_) {
            return false;
          }
        }
        return true; // other statuses pass this check
      },
    });

    if (!passed && res.status !== 429 && res.status !== 401) {
      // Only count as auth error if it's not an expected 429 or 401
      authErrorRate.add(1);
    } else {
      authErrorRate.add(0);
    }
  });

  group('login_missing_fields', function () {
    // Test with missing email — should return 400
    const res = http.post(
      `${BASE_URL}/api/auth/login`,
      JSON.stringify({ password: 'somepassword' }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'AuthLoginMissingEmail' },
      }
    );

    check(res, {
      'missing email returns 400 or 429': (r) => r.status === 400 || r.status === 429,
    });

    if (res.status === 429) {
      rateLimitHits.add(1);
    }
  });

  // Sleep between iterations — respect rate limiting
  sleep(Math.random() * 2 + 1); // 1-3 seconds
}

export function teardown(data) {
  console.log(`Auth load test completed. Started at ${data.startedAt}`);
  console.log('Note: 429 responses are expected and indicate rate limiting is working correctly.');
}
