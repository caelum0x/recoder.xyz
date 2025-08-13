// k6 Spike Testing
// Sudden traffic bursts to test system resilience and auto-scaling

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('spike_errors');
const responseTime = new Trend('spike_response_time');

export const options = {
  scenarios: {
    spike_test: {
      executor: 'ramping-vus',
      stages: [
        { duration: '10s', target: 100 },    // Normal load
        { duration: '30s', target: 15000 },  // Massive spike!
        { duration: '2m', target: 15000 },   // Hold the spike
        { duration: '30s', target: 100 },    // Drop back
        { duration: '1m', target: 100 },     // Recovery period
      ],
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<5000'], // Relaxed during spike
    'spike_errors': ['rate<0.05'],       // Allow 5% errors during spike
    'checks': ['rate>0.9'],              // 90% success rate minimum
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export default function() {
  group('Spike Test - AI Generation', () => {
    const payload = {
      prompt: 'Generate a simple function',
      taskType: 'code-generation',
      userId: `spike-user-${__VU}`,
      context: { complexity: 'simple' },
    };

    const response = http.post(`${BASE_URL}/api/ai/generate`, JSON.stringify(payload), {
      headers: { 'Content-Type': 'application/json' },
      timeout: '10s'
    });

    const success = check(response, {
      'spike response received': (r) => r.status === 200 || r.status === 202 || r.status === 429,
      'spike response time acceptable': (r) => r.timings.duration < 10000,
    });

    errorRate.add(!success || response.status >= 500);
    responseTime.add(response.timings.duration);
  });

  sleep(1);
}