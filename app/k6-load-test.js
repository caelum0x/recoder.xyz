/**
 * K6 Load Testing Configuration
 * Tests API performance under various load conditions
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 50 },   // Ramp up to 50 users
    { duration: '5m', target: 50 },   // Stay at 50 users
    { duration: '2m', target: 100 },  // Ramp up to 100 users
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 200 },  // Spike to 200 users
    { duration: '5m', target: 200 },  // Stay at 200 users
    { duration: '3m', target: 0 },    // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests should be below 500ms
    http_req_failed: ['rate<0.05'],    // Error rate should be below 5%
    errors: ['rate<0.1'],              // Custom error rate below 10%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

// Test data
const testUser = {
  email: __ENV.TEST_EMAIL || 'loadtest@recoder.xyz',
  password: __ENV.TEST_PASSWORD || 'Test123!@#',
};

// Main test function
export default function () {
  // Test 1: Health check
  let response = http.get(`${BASE_URL}/health`);
  check(response, {
    'health check is 200': (r) => r.status === 200,
  }) || errorRate.add(1);
  
  sleep(1);

  // Test 2: Login
  response = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    email: testUser.email,
    password: testUser.password,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  check(response, {
    'login is 200': (r) => r.status === 200,
    'login returns token': (r) => r.json('token') !== undefined,
  }) || errorRate.add(1);

  const token = response.json('token');
  
  sleep(1);

  if (token) {
    // Test 3: Get dashboard data
    response = http.get(`${BASE_URL}/api/dashboard/overview`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    check(response, {
      'dashboard is 200': (r) => r.status === 200,
    }) || errorRate.add(1);
    
    sleep(1);

    // Test 4: Get analytics
    response = http.get(`${BASE_URL}/api/analytics/real-time?range=24h`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    check(response, {
      'analytics is 200': (r) => r.status === 200,
      'analytics has data': (r) => r.json('activeUsers') !== undefined,
    }) || errorRate.add(1);
    
    sleep(1);

    // Test 5: Get usage stats
    response = http.get(`${BASE_URL}/api/user/usage`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    check(response, {
      'usage is 200': (r) => r.status === 200,
    }) || errorRate.add(1);
  }

  sleep(2);
}

// Setup function - runs once at start
export function setup() {
  console.log('Starting load test...');
  console.log(`Target: ${BASE_URL}`);
  return { timestamp: Date.now() };
}

// Teardown function - runs once at end
export function teardown(data) {
  console.log('Load test completed');
  console.log(`Duration: ${(Date.now() - data.timestamp) / 1000}s`);
}
