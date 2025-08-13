// k6 Load Testing Configuration
// Comprehensive performance testing for 10k+ concurrent users to prove enterprise scalability

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomString, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom metrics for detailed analysis
const errorRate = new Rate('errors');
const responseTimeTrend = new Trend('response_time');
const requestCounter = new Counter('total_requests');
const aiGenerationTime = new Trend('ai_generation_time');
const cacheHitRate = new Rate('cache_hits');
const databaseResponseTime = new Trend('database_response_time');

// Load testing scenarios - enterprise scale progression
export const options = {
  scenarios: {
    // Warm-up phase
    warmup: {
      executor: 'ramping-vus',
      stages: [
        { duration: '2m', target: 100 },   // Warm up to 100 users
        { duration: '3m', target: 100 },   // Stay at 100 users
      ],
      gracefulRampDown: '30s',
      tags: { test_type: 'warmup' },
    },

    // Normal load testing
    normal_load: {
      executor: 'ramping-vus',
      startTime: '5m',
      stages: [
        { duration: '5m', target: 1000 },   // Ramp to 1k users
        { duration: '10m', target: 1000 },  // Stay at 1k users
        { duration: '5m', target: 2000 },   // Ramp to 2k users
        { duration: '10m', target: 2000 },  // Stay at 2k users
      ],
      gracefulRampDown: '2m',
      tags: { test_type: 'normal' },
    },

    // Stress testing - push to limits
    stress_test: {
      executor: 'ramping-vus',
      startTime: '37m',
      stages: [
        { duration: '5m', target: 5000 },   // Ramp to 5k users
        { duration: '15m', target: 5000 },  // Stay at 5k users
        { duration: '5m', target: 8000 },   // Ramp to 8k users
        { duration: '10m', target: 8000 },  // Stay at 8k users
        { duration: '5m', target: 10000 },  // Ramp to 10k users
        { duration: '15m', target: 10000 }, // Stay at 10k users - DOMINATION TEST
        { duration: '5m', target: 0 },      // Graceful shutdown
      ],
      gracefulRampDown: '3m',
      tags: { test_type: 'stress' },
    },

    // Spike testing - sudden load bursts
    spike_test: {
      executor: 'ramping-vus',
      startTime: '85m',
      stages: [
        { duration: '30s', target: 12000 }, // Sudden spike to 12k
        { duration: '2m', target: 12000 },  // Hold spike
        { duration: '30s', target: 1000 },  // Drop back down
        { duration: '5m', target: 1000 },   // Recover
      ],
      gracefulRampDown: '1m',
      tags: { test_type: 'spike' },
    },

    // Soak testing - long duration stability
    soak_test: {
      executor: 'constant-vus',
      startTime: '95m',
      vus: 3000,
      duration: '60m', // 1 hour at constant 3k users
      tags: { test_type: 'soak' },
    },
  },

  // Performance thresholds - enterprise requirements
  thresholds: {
    // Response time requirements
    'http_req_duration': ['p(95)<2000', 'p(99)<5000'], // 95% under 2s, 99% under 5s
    'http_req_duration{test_type:normal}': ['p(95)<1500'], // Normal load stricter
    'http_req_duration{test_type:stress}': ['p(95)<3000'], // Stress load relaxed
    
    // Error rate thresholds
    'http_req_failed': ['rate<0.02'], // Less than 2% errors
    'errors': ['rate<0.02'],
    
    // Success rate requirements
    'checks': ['rate>0.98'], // 98% success rate minimum
    
    // AI-specific thresholds
    'ai_generation_time': ['p(95)<15000'], // AI generation under 15s
    'cache_hits': ['rate>0.7'], // 70% cache hit rate minimum
    'database_response_time': ['p(95)<500'], // Database under 500ms
    
    // Throughput requirements
    'http_reqs': ['rate>1000'], // At least 1000 requests/second
  },

  // Global test configuration
  userAgent: 'k6-load-test/1.0 (Recoder.xyz Enterprise Load Testing)',
  insecureSkipTLSVerify: false,
  noConnectionReuse: false,
  noVUConnectionReuse: false,
  batchPerHost: 6,
  httpDebug: 'full',
};

// Test data generation
const testUsers = Array.from({ length: 1000 }, (_, i) => ({
  id: `test-user-${i}`,
  apiKey: `test-key-${randomString(32)}`,
  subscription: ['free', 'pro', 'enterprise'][i % 3],
}));

const testPrompts = [
  // Simple prompts (fast)
  'Create a hello world function in JavaScript',
  'Generate a simple React component',
  'Write a Python function to sort a list',
  
  // Medium complexity
  'Build a REST API endpoint with authentication',
  'Create a React form with validation',
  'Generate a database migration script',
  
  // Complex prompts (slow)
  'Build a complete e-commerce checkout flow',
  'Create a microservices architecture diagram',
  'Generate a blockchain smart contract with tests',
  
  // RAG-enabled prompts
  'Analyze this codebase and suggest improvements',
  'Refactor this legacy code to modern standards',
  'Generate documentation for this API',
];

const testEndpoints = [
  // Health and status
  { method: 'GET', url: '/health', weight: 5 },
  { method: 'GET', url: '/metrics', weight: 2 },
  
  // Authentication
  { method: 'POST', url: '/api/auth/login', weight: 3 },
  { method: 'GET', url: '/api/auth/me', weight: 4 },
  
  // Core AI endpoints
  { method: 'POST', url: '/api/ai/generate', weight: 30 },
  { method: 'POST', url: '/api/ai/chat', weight: 20 },
  { method: 'GET', url: '/api/ai/providers', weight: 3 },
  
  // RAG system
  { method: 'POST', url: '/api/rag/analyze', weight: 10 },
  { method: 'GET', url: '/api/rag/search', weight: 8 },
  { method: 'POST', url: '/api/rag/embed', weight: 5 },
  
  // Project management
  { method: 'GET', url: '/api/projects', weight: 8 },
  { method: 'POST', url: '/api/projects', weight: 3 },
  { method: 'GET', url: '/api/templates', weight: 5 },
  
  // Analytics and billing
  { method: 'GET', url: '/api/analytics/usage', weight: 2 },
  { method: 'GET', url: '/api/billing/subscription', weight: 1 },
];

// Base URL configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const API_KEY = __ENV.API_KEY || 'test-api-key';

// Request headers
const getHeaders = (user) => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${user.apiKey}`,
  'X-API-Key': API_KEY,
  'User-Agent': 'k6-load-test/1.0',
  'X-Test-User': user.id,
});

// Setup function - runs once per VU
export function setup() {
  console.log('🚀 Starting Recoder.xyz Enterprise Load Test');
  console.log(`Target: ${BASE_URL}`);
  console.log('Test scenarios: warmup → normal → stress → spike → soak');
  console.log('Target: 10,000+ concurrent users for AI industry domination');
  
  // Verify server is accessible
  const healthCheck = http.get(`${BASE_URL}/health`);
  if (healthCheck.status !== 200) {
    throw new Error(`Server not accessible: ${healthCheck.status}`);
  }
  
  return { baseUrl: BASE_URL };
}

// Main test function
export default function(data) {
  const user = testUsers[Math.floor(Math.random() * testUsers.length)];
  const headers = getHeaders(user);
  
  group('API Load Testing', () => {
    // Select endpoint based on weighted distribution
    const endpoint = selectWeightedEndpoint();
    
    switch (endpoint.url) {
      case '/health':
        testHealthEndpoint(data.baseUrl, headers);
        break;
      case '/metrics':
        testMetricsEndpoint(data.baseUrl, headers);
        break;
      case '/api/auth/login':
        testAuthLogin(data.baseUrl, user);
        break;
      case '/api/auth/me':
        testAuthMe(data.baseUrl, headers);
        break;
      case '/api/ai/generate':
        testAiGeneration(data.baseUrl, headers, user);
        break;
      case '/api/ai/chat':
        testAiChat(data.baseUrl, headers, user);
        break;
      case '/api/ai/providers':
        testAiProviders(data.baseUrl, headers);
        break;
      case '/api/rag/analyze':
        testRagAnalyze(data.baseUrl, headers, user);
        break;
      case '/api/rag/search':
        testRagSearch(data.baseUrl, headers);
        break;
      case '/api/rag/embed':
        testRagEmbed(data.baseUrl, headers);
        break;
      case '/api/projects':
        if (endpoint.method === 'GET') {
          testProjectsList(data.baseUrl, headers);
        } else {
          testProjectsCreate(data.baseUrl, headers, user);
        }
        break;
      case '/api/templates':
        testTemplatesList(data.baseUrl, headers);
        break;
      case '/api/analytics/usage':
        testAnalyticsUsage(data.baseUrl, headers);
        break;
      case '/api/billing/subscription':
        testBillingSubscription(data.baseUrl, headers);
        break;
    }
  });
  
  // Random sleep between requests (realistic user behavior)
  sleep(randomIntBetween(1, 3));
}

// Test functions for different endpoints
function testHealthEndpoint(baseUrl, headers) {
  group('Health Check', () => {
    const response = http.get(`${baseUrl}/health`, { headers });
    
    check(response, {
      'health check status is 200': (r) => r.status === 200,
      'health check response time < 100ms': (r) => r.timings.duration < 100,
      'health check has status field': (r) => JSON.parse(r.body).status !== undefined,
    });
    
    errorRate.add(response.status !== 200);
    responseTimeTrend.add(response.timings.duration);
    requestCounter.add(1);
  });
}

function testMetricsEndpoint(baseUrl, headers) {
  group('Metrics', () => {
    const response = http.get(`${baseUrl}/metrics`, { headers });
    
    check(response, {
      'metrics status is 200': (r) => r.status === 200,
      'metrics response time < 500ms': (r) => r.timings.duration < 500,
      'metrics has performance data': (r) => {
        const body = JSON.parse(r.body);
        return body.performance && body.cache;
      },
    });
    
    errorRate.add(response.status !== 200);
    responseTimeTrend.add(response.timings.duration);
    requestCounter.add(1);
  });
}

function testAuthLogin(baseUrl, user) {
  group('Authentication Login', () => {
    const payload = {
      email: `${user.id}@test.com`,
      password: 'test-password'
    };
    
    const response = http.post(`${baseUrl}/api/auth/login`, JSON.stringify(payload), {
      headers: { 'Content-Type': 'application/json' }
    });
    
    check(response, {
      'login request completed': (r) => r.status === 200 || r.status === 401,
      'login response time < 1000ms': (r) => r.timings.duration < 1000,
    });
    
    errorRate.add(response.status >= 500);
    responseTimeTrend.add(response.timings.duration);
    requestCounter.add(1);
  });
}

function testAuthMe(baseUrl, headers) {
  group('Auth Me', () => {
    const response = http.get(`${baseUrl}/api/auth/me`, { headers });
    
    check(response, {
      'auth me completed': (r) => r.status === 200 || r.status === 401,
      'auth me response time < 500ms': (r) => r.timings.duration < 500,
    });
    
    errorRate.add(response.status >= 500);
    responseTimeTrend.add(response.timings.duration);
    requestCounter.add(1);
  });
}

function testAiGeneration(baseUrl, headers, user) {
  group('AI Code Generation', () => {
    const prompt = testPrompts[Math.floor(Math.random() * testPrompts.length)];
    const complexity = prompt.length > 100 ? 'complex' : 
                      prompt.length > 50 ? 'medium' : 'simple';
    
    const payload = {
      prompt,
      userId: user.id,
      taskType: 'code-generation',
      context: {
        language: ['javascript', 'python', 'typescript', 'go'][Math.floor(Math.random() * 4)],
        complexity,
        useCache: Math.random() > 0.3, // 70% cache usage
      },
      constraints: {
        maxLatency: 15000,
        maxCost: user.subscription === 'enterprise' ? 0.1 : 0.05,
      }
    };
    
    const startTime = Date.now();
    const response = http.post(`${baseUrl}/api/ai/generate`, JSON.stringify(payload), {
      headers,
      timeout: '30s'
    });
    const generationTime = Date.now() - startTime;
    
    const wasFromCache = response.headers['X-Cache-Status'] === 'hit';
    cacheHitRate.add(wasFromCache);
    
    check(response, {
      'AI generation status is success': (r) => r.status === 200 || r.status === 202,
      'AI generation response time reasonable': (r) => {
        const maxTime = complexity === 'complex' ? 20000 : 
                       complexity === 'medium' ? 10000 : 5000;
        return r.timings.duration < maxTime;
      },
      'AI response has content': (r) => {
        if (r.status === 200) {
          const body = JSON.parse(r.body);
          return body.result && body.result.length > 0;
        }
        return true; // Accept 202 (async)
      },
    });
    
    errorRate.add(response.status >= 400);
    responseTimeTrend.add(response.timings.duration);
    aiGenerationTime.add(generationTime);
    requestCounter.add(1);
  });
}

function testAiChat(baseUrl, headers, user) {
  group('AI Chat', () => {
    const payload = {
      message: 'Help me debug this JavaScript function',
      userId: user.id,
      sessionId: `session-${user.id}-${Date.now()}`,
      context: {
        conversationType: 'technical-help',
        useRAG: Math.random() > 0.5,
      }
    };
    
    const response = http.post(`${baseUrl}/api/ai/chat`, JSON.stringify(payload), {
      headers,
      timeout: '20s'
    });
    
    check(response, {
      'chat status is success': (r) => r.status === 200,
      'chat response time < 10s': (r) => r.timings.duration < 10000,
      'chat response has message': (r) => {
        const body = JSON.parse(r.body);
        return body.response && body.response.length > 0;
      },
    });
    
    errorRate.add(response.status >= 400);
    responseTimeTrend.add(response.timings.duration);
    requestCounter.add(1);
  });
}

function testRagAnalyze(baseUrl, headers, user) {
  group('RAG Code Analysis', () => {
    const payload = {
      code: `function fibonacci(n) {
        if (n <= 1) return n;
        return fibonacci(n - 1) + fibonacci(n - 2);
      }`,
      language: 'javascript',
      analysisType: 'performance',
      userId: user.id
    };
    
    const startTime = Date.now();
    const response = http.post(`${baseUrl}/api/rag/analyze`, JSON.stringify(payload), {
      headers,
      timeout: '15s'
    });
    const analysisTime = Date.now() - startTime;
    
    check(response, {
      'RAG analysis status is success': (r) => r.status === 200,
      'RAG analysis response time < 15s': (r) => r.timings.duration < 15000,
      'RAG analysis has insights': (r) => {
        const body = JSON.parse(r.body);
        return body.analysis && body.insights;
      },
    });
    
    errorRate.add(response.status >= 400);
    responseTimeTrend.add(response.timings.duration);
    requestCounter.add(1);
  });
}

function testRagSearch(baseUrl, headers) {
  group('RAG Semantic Search', () => {
    const query = 'How to implement authentication in Node.js';
    const response = http.get(`${baseUrl}/api/rag/search?q=${encodeURIComponent(query)}`, { headers });
    
    check(response, {
      'RAG search status is success': (r) => r.status === 200,
      'RAG search response time < 2s': (r) => r.timings.duration < 2000,
      'RAG search has results': (r) => {
        const body = JSON.parse(r.body);
        return body.results && Array.isArray(body.results);
      },
    });
    
    errorRate.add(response.status >= 400);
    responseTimeTrend.add(response.timings.duration);
    requestCounter.add(1);
  });
}

function testRagEmbed(baseUrl, headers) {
  group('RAG Embedding', () => {
    const payload = {
      content: 'This is a test code snippet for embedding',
      type: 'code'
    };
    
    const response = http.post(`${baseUrl}/api/rag/embed`, JSON.stringify(payload), { headers });
    
    check(response, {
      'RAG embed status is success': (r) => r.status === 200,
      'RAG embed response time < 3s': (r) => r.timings.duration < 3000,
      'RAG embed has vector': (r) => {
        const body = JSON.parse(r.body);
        return body.embedding && Array.isArray(body.embedding);
      },
    });
    
    errorRate.add(response.status >= 400);
    responseTimeTrend.add(response.timings.duration);
    requestCounter.add(1);
  });
}

function testProjectsList(baseUrl, headers) {
  group('Projects List', () => {
    const response = http.get(`${baseUrl}/api/projects`, { headers });
    
    check(response, {
      'projects list status is success': (r) => r.status === 200,
      'projects list response time < 1s': (r) => r.timings.duration < 1000,
    });
    
    errorRate.add(response.status >= 400);
    responseTimeTrend.add(response.timings.duration);
    requestCounter.add(1);
  });
}

function testProjectsCreate(baseUrl, headers, user) {
  group('Projects Create', () => {
    const payload = {
      name: `Test Project ${randomString(8)}`,
      description: 'Load test project',
      template: 'basic-web-app',
      userId: user.id
    };
    
    const response = http.post(`${baseUrl}/api/projects`, JSON.stringify(payload), { headers });
    
    check(response, {
      'project create completed': (r) => r.status === 201 || r.status === 200,
      'project create response time < 2s': (r) => r.timings.duration < 2000,
    });
    
    errorRate.add(response.status >= 400);
    responseTimeTrend.add(response.timings.duration);
    requestCounter.add(1);
  });
}

function testTemplatesList(baseUrl, headers) {
  group('Templates List', () => {
    const response = http.get(`${baseUrl}/api/templates`, { headers });
    
    check(response, {
      'templates list status is success': (r) => r.status === 200,
      'templates list response time < 1s': (r) => r.timings.duration < 1000,
    });
    
    errorRate.add(response.status >= 400);
    responseTimeTrend.add(response.timings.duration);
    requestCounter.add(1);
  });
}

function testAnalyticsUsage(baseUrl, headers) {
  group('Analytics Usage', () => {
    const response = http.get(`${baseUrl}/api/analytics/usage`, { headers });
    
    check(response, {
      'analytics usage completed': (r) => r.status === 200,
      'analytics usage response time < 2s': (r) => r.timings.duration < 2000,
    });
    
    errorRate.add(response.status >= 400);
    responseTimeTrend.add(response.timings.duration);
    requestCounter.add(1);
  });
}

function testBillingSubscription(baseUrl, headers) {
  group('Billing Subscription', () => {
    const response = http.get(`${baseUrl}/api/billing/subscription`, { headers });
    
    check(response, {
      'billing subscription completed': (r) => r.status === 200,
      'billing subscription response time < 1s': (r) => r.timings.duration < 1000,
    });
    
    errorRate.add(response.status >= 400);
    responseTimeTrend.add(response.timings.duration);
    requestCounter.add(1);
  });
}

// Utility functions
function selectWeightedEndpoint() {
  const totalWeight = testEndpoints.reduce((sum, ep) => sum + ep.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const endpoint of testEndpoints) {
    random -= endpoint.weight;
    if (random <= 0) {
      return endpoint;
    }
  }
  
  return testEndpoints[0]; // Fallback
}

// Teardown function
export function teardown(data) {
  console.log('🏁 Load test completed');
  console.log('Results summary will be available in the k6 output');
  console.log('Check metrics for enterprise scalability validation');
}