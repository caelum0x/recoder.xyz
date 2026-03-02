/**
 * Health Endpoint Load Test
 *
 * Tests the /api/health endpoint under sustained load.
 * Ramps up to 20 concurrent virtual users, holds steady for 1 minute,
 * then ramps back down.
 *
 * Run:
 *   k6 run tests/load/health.k6.js
 *   k6 run tests/load/health.k6.js -e BASE_URL=https://staging.recoder.xyz
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('health_errors');
const healthDuration = new Trend('health_duration', true);

export const options = {
  stages: [
    { duration: '30s', target: 20 },  // ramp up to 20 VUs over 30s
    { duration: '1m', target: 20 },   // steady state at 20 VUs for 1m
    { duration: '10s', target: 0 },   // ramp down to 0 over 10s
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95th percentile under 500ms
    http_req_failed: ['rate<0.01'],    // less than 1% HTTP errors
    health_errors: ['rate<0.01'],      // custom error rate under 1%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export function setup() {
  // Verify the health endpoint is reachable before running the full test
  const res = http.get(`${BASE_URL}/api/health`);
  if (res.status !== 200) {
    console.error(`Health endpoint returned ${res.status} — aborting load test.`);
    console.error(`Response body: ${res.body}`);
  }
  return { baseUrl: BASE_URL, startedAt: new Date().toISOString() };
}

export default function () {
  const res = http.get(`${BASE_URL}/api/health`, {
    tags: { name: 'HealthCheck' },
  });

  healthDuration.add(res.timings.duration);

  const passed = check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
    'body contains status healthy': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status === 'healthy';
      } catch (_) {
        return false;
      }
    },
    'body contains service name': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.service === 'recoder-api';
      } catch (_) {
        return false;
      }
    },
    'body contains timestamp': (r) => {
      try {
        const body = JSON.parse(r.body);
        return typeof body.timestamp === 'string' && body.timestamp.length > 0;
      } catch (_) {
        return false;
      }
    },
  });

  if (!passed) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }

  sleep(1);
}

export function teardown(data) {
  console.log(`Health load test completed. Started at ${data.startedAt}`);
}
