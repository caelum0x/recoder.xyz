// k6 Endurance/Soak Testing
// Long-duration testing to detect memory leaks and performance degradation

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const errorRate = new Rate('endurance_errors');
const responseTime = new Trend('endurance_response_time');
const memoryLeakDetector = new Trend('memory_usage_trend');

export const options = {
  scenarios: {
    endurance_test: {
      executor: 'constant-vus',
      vus: 2000,              // Constant 2k users
      duration: '2h',         // 2 hours continuous testing
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<3000'],     // Maintain performance
    'endurance_errors': ['rate<0.01'],        // Very low error rate
    'checks': ['rate>0.99'],                  // High success rate
    'http_reqs': ['rate>800'],                // Sustained throughput
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

// Simulate realistic user patterns
const userScenarios = [
  { type: 'developer', weight: 70 },      // 70% developers
  { type: 'enterprise', weight: 20 },     // 20% enterprise users
  { type: 'casual', weight: 10 },         // 10% casual users
];

export default function() {
  const userType = selectUserType();
  
  switch (userType) {
    case 'developer':
      developerWorkflow();
      break;
    case 'enterprise':
      enterpriseWorkflow();
      break;
    case 'casual':
      casualWorkflow();
      break;
  }
  
  // Monitor memory usage patterns
  monitorSystemHealth();
  
  sleep(Math.random() * 5 + 2); // 2-7 second intervals
}

function developerWorkflow() {
  group('Developer Workflow', () => {
    // Check projects
    let response = http.get(`${BASE_URL}/api/projects`, {
      headers: { 'Authorization': `Bearer dev-token-${__VU}` }
    });
    
    check(response, {
      'projects loaded': (r) => r.status === 200,
    });
    
    // Generate code
    response = http.post(`${BASE_URL}/api/ai/generate`, JSON.stringify({
      prompt: 'Create a REST API endpoint',
      userId: `dev-${__VU}`,
      taskType: 'code-generation'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
    const success = check(response, {
      'code generated': (r) => r.status === 200 || r.status === 202,
      'reasonable response time': (r) => r.timings.duration < 5000,
    });
    
    errorRate.add(!success);
    responseTime.add(response.timings.duration);
  });
}

function enterpriseWorkflow() {
  group('Enterprise Workflow', () => {
    // Analytics check
    let response = http.get(`${BASE_URL}/api/analytics/usage`, {
      headers: { 'Authorization': `Bearer enterprise-token-${__VU}` }
    });
    
    check(response, {
      'analytics loaded': (r) => r.status === 200,
    });
    
    // RAG analysis
    response = http.post(`${BASE_URL}/api/rag/analyze`, JSON.stringify({
      code: 'function test() { return true; }',
      analysisType: 'security'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
    const success = check(response, {
      'analysis completed': (r) => r.status === 200,
    });
    
    errorRate.add(!success);
    responseTime.add(response.timings.duration);
  });
}

function casualWorkflow() {
  group('Casual Workflow', () => {
    // Simple health check
    const response = http.get(`${BASE_URL}/health`);
    
    const success = check(response, {
      'health check ok': (r) => r.status === 200,
    });
    
    errorRate.add(!success);
    responseTime.add(response.timings.duration);
  });
}

function selectUserType() {
  const random = Math.random() * 100;
  let cumulative = 0;
  
  for (const scenario of userScenarios) {
    cumulative += scenario.weight;
    if (random <= cumulative) {
      return scenario.type;
    }
  }
  
  return 'casual';
}

function monitorSystemHealth() {
  // Simulate memory usage monitoring
  // In real scenario, this would query actual system metrics
  const simulatedMemoryUsage = Math.random() * 100;
  memoryLeakDetector.add(simulatedMemoryUsage);
}