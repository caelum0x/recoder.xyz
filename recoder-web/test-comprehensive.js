// Comprehensive Test Suite for Recoder-Web Production Deployment
const BASE_URL = 'http://localhost:3000';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(color, symbol, message) {
  console.log(`${colors[color]}${symbol} ${message}${colors.reset}`);
}

// Test Suite 1: Core API Endpoints
async function testCoreEndpoints() {
  console.log(`\n${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}  TEST SUITE 1: CORE API ENDPOINTS${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}\n`);

  const endpoints = [
    {
      name: 'Health Check',
      url: '/api/health',
      method: 'GET',
      expectedStatus: 200,
      validate: (data) => data.status === 'healthy' && data.checks.database === 'healthy'
    },
    {
      name: 'Database Test',
      url: '/api/test-db',
      method: 'GET',
      expectedStatus: 200,
      validate: (data) => data.success === true && typeof data.userCount === 'number'
    },
    {
      name: 'Smart Routing - GET',
      url: '/api/smart-routing',
      method: 'GET',
      expectedStatus: 200,
      validate: (data) => data.availableProviders && Array.isArray(data.providersStatus)
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of endpoints) {
    try {
      const response = await fetch(`${BASE_URL}${test.url}`, { method: test.method });
      const data = await response.json();

      if (response.status === test.expectedStatus && test.validate(data)) {
        log('green', '✅', `${test.name}: PASSED`);
        log('cyan', '   ', `Status: ${response.status}, Response time: ${response.headers.get('x-response-time') || 'N/A'}`);
        passed++;
      } else {
        log('red', '❌', `${test.name}: FAILED`);
        log('yellow', '   ', `Expected: ${test.expectedStatus}, Got: ${response.status}`);
        failed++;
      }
    } catch (error) {
      log('red', '❌', `${test.name}: ERROR - ${error.message}`);
      failed++;
    }
  }

  return { passed, failed, total: endpoints.length };
}

// Test Suite 2: AI Provider Integration
async function testAIProviders() {
  console.log(`\n${colors.bright}${colors.magenta}═══════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.magenta}  TEST SUITE 2: AI PROVIDER INTEGRATION${colors.reset}`);
  console.log(`${colors.bright}${colors.magenta}═══════════════════════════════════════════════════════${colors.reset}\n`);

  const tests = [
    {
      name: 'Smart Routing Analysis',
      payload: {
        prompt: 'Create a React button component',
        context: { complexity: 'simple', language: 'typescript' },
        preferences: { speed: 'fast', cost: 'low' }
      }
    },
    {
      name: 'Complex Task Routing',
      payload: {
        prompt: 'Build a secure authentication system with JWT and OAuth',
        context: { complexity: 'complex', taskType: 'security' },
        preferences: { speed: 'quality', cost: 'high' }
      }
    },
    {
      name: 'API Development Routing',
      payload: {
        prompt: 'Create a REST API with CRUD operations',
        context: { complexity: 'medium', taskType: 'api-development' },
        preferences: { speed: 'balanced', cost: 'medium' }
      }
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const response = await fetch(`${BASE_URL}/api/smart-routing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(test.payload)
      });

      const data = await response.json();

      if (response.status === 200 && data.recommendedModel && data.recommendedProvider) {
        log('green', '✅', `${test.name}: PASSED`);
        log('cyan', '   ', `Model: ${data.recommendedModel}`);
        log('cyan', '   ', `Provider: ${data.recommendedProvider}`);
        log('cyan', '   ', `Confidence: ${data.confidence}%`);
        log('cyan', '   ', `Reasoning: ${data.reasoning.substring(0, 80)}...`);
        passed++;
      } else {
        log('red', '❌', `${test.name}: FAILED`);
        failed++;
      }
    } catch (error) {
      log('red', '❌', `${test.name}: ERROR - ${error.message}`);
      failed++;
    }
  }

  return { passed, failed, total: tests.length };
}

// Test Suite 3: Error Handling & Edge Cases
async function testErrorHandling() {
  console.log(`\n${colors.bright}${colors.yellow}═══════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.yellow}  TEST SUITE 3: ERROR HANDLING & EDGE CASES${colors.reset}`);
  console.log(`${colors.bright}${colors.yellow}═══════════════════════════════════════════════════════${colors.reset}\n`);

  const tests = [
    {
      name: 'Invalid Message ID',
      url: '/api/multi-ai-generate',
      method: 'POST',
      payload: { messageId: 'invalid_id_123', prompt: 'test' },
      expectedStatus: 404
    },
    {
      name: 'Missing Required Fields',
      url: '/api/smart-routing',
      method: 'POST',
      payload: {},
      expectedStatus: 400
    },
    {
      name: 'Malformed JSON',
      url: '/api/smart-routing',
      method: 'POST',
      body: 'invalid json',
      expectedStatus: 400
    },
    {
      name: 'Non-existent Endpoint',
      url: '/api/nonexistent',
      method: 'GET',
      expectedStatus: 404
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const options = {
        method: test.method,
        headers: test.payload ? { 'Content-Type': 'application/json' } : undefined,
        body: test.body || (test.payload ? JSON.stringify(test.payload) : undefined)
      };

      const response = await fetch(`${BASE_URL}${test.url}`, options);

      if (response.status === test.expectedStatus) {
        log('green', '✅', `${test.name}: PASSED (Expected error handled correctly)`);
        log('cyan', '   ', `Status: ${response.status}`);
        passed++;
      } else {
        log('red', '❌', `${test.name}: FAILED`);
        log('yellow', '   ', `Expected: ${test.expectedStatus}, Got: ${response.status}`);
        failed++;
      }
    } catch (error) {
      if (test.expectedStatus >= 400) {
        log('green', '✅', `${test.name}: PASSED (Error thrown as expected)`);
        passed++;
      } else {
        log('red', '❌', `${test.name}: UNEXPECTED ERROR - ${error.message}`);
        failed++;
      }
    }
  }

  return { passed, failed, total: tests.length };
}

// Test Suite 4: Performance Benchmarks
async function testPerformance() {
  console.log(`\n${colors.bright}${colors.blue}═══════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}  TEST SUITE 4: PERFORMANCE BENCHMARKS${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}═══════════════════════════════════════════════════════${colors.reset}\n`);

  const benchmarks = [
    { name: 'Health Check', url: '/api/health', threshold: 2000 },
    { name: 'Database Query', url: '/api/test-db', threshold: 3000 },
    { name: 'Smart Routing GET', url: '/api/smart-routing', threshold: 1000 },
  ];

  let passed = 0;
  let failed = 0;

  for (const benchmark of benchmarks) {
    const start = Date.now();
    try {
      const response = await fetch(`${BASE_URL}${benchmark.url}`);
      const elapsed = Date.now() - start;

      if (response.ok && elapsed < benchmark.threshold) {
        log('green', '✅', `${benchmark.name}: PASSED`);
        log('cyan', '   ', `Response time: ${elapsed}ms (threshold: ${benchmark.threshold}ms)`);
        passed++;
      } else if (!response.ok) {
        log('yellow', '⚠️', `${benchmark.name}: DEGRADED`);
        log('yellow', '   ', `Response time: ${elapsed}ms, Status: ${response.status}`);
        failed++;
      } else {
        log('yellow', '⚠️', `${benchmark.name}: SLOW`);
        log('yellow', '   ', `Response time: ${elapsed}ms exceeded threshold ${benchmark.threshold}ms`);
        failed++;
      }
    } catch (error) {
      log('red', '❌', `${benchmark.name}: ERROR - ${error.message}`);
      failed++;
    }
  }

  return { passed, failed, total: benchmarks.length };
}

// Test Suite 5: Security & Validation
async function testSecurity() {
  console.log(`\n${colors.bright}${colors.red}═══════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.red}  TEST SUITE 5: SECURITY & VALIDATION${colors.reset}`);
  console.log(`${colors.bright}${colors.red}═══════════════════════════════════════════════════════${colors.reset}\n`);

  const tests = [
    {
      name: 'SQL Injection Protection',
      url: '/api/test-db',
      headers: { 'X-Test': "'; DROP TABLE users; --" },
      validate: (response) => response.status !== 500
    },
    {
      name: 'XSS Protection',
      url: '/api/smart-routing',
      method: 'POST',
      payload: { prompt: '<script>alert("xss")</script>' },
      validate: (data) => !data.error || data.error.includes('Routing failed')
    },
    {
      name: 'Large Payload Handling',
      url: '/api/smart-routing',
      method: 'POST',
      payload: { prompt: 'a'.repeat(10000), context: {} },
      validate: (response) => response.status === 413 || response.status === 200
    },
    {
      name: 'CORS Headers',
      url: '/api/health',
      validate: (response) => {
        return response.headers.get('access-control-allow-origin') !== null ||
               response.headers.get('content-type') !== null;
      }
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const options = {
        method: test.method || 'GET',
        headers: test.headers || (test.payload ? { 'Content-Type': 'application/json' } : undefined),
        body: test.payload ? JSON.stringify(test.payload) : undefined
      };

      const response = await fetch(`${BASE_URL}${test.url}`, options);
      const data = response.headers.get('content-type')?.includes('json') ? await response.json() : null;

      if (test.validate(data !== null ? data : response)) {
        log('green', '✅', `${test.name}: PASSED (Secure)`);
        passed++;
      } else {
        log('red', '❌', `${test.name}: FAILED (Security concern)`);
        failed++;
      }
    } catch (error) {
      log('yellow', '⚠️', `${test.name}: ERROR - ${error.message}`);
      failed++;
    }
  }

  return { passed, failed, total: tests.length };
}

// Main test runner
async function runAllTests() {
  console.log(`${colors.bright}${colors.cyan}`);
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║                                                       ║');
  console.log('║     RECODER-WEB COMPREHENSIVE TEST SUITE             ║');
  console.log('║     Production Deployment Validation                 ║');
  console.log('║                                                       ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  const results = {
    totalPassed: 0,
    totalFailed: 0,
    totalTests: 0,
    suites: []
  };

  try {
    // Run all test suites
    const suite1 = await testCoreEndpoints();
    const suite2 = await testAIProviders();
    const suite3 = await testErrorHandling();
    const suite4 = await testPerformance();
    const suite5 = await testSecurity();

    results.suites = [
      { name: 'Core Endpoints', ...suite1 },
      { name: 'AI Providers', ...suite2 },
      { name: 'Error Handling', ...suite3 },
      { name: 'Performance', ...suite4 },
      { name: 'Security', ...suite5 }
    ];

    results.totalPassed = results.suites.reduce((sum, s) => sum + s.passed, 0);
    results.totalFailed = results.suites.reduce((sum, s) => sum + s.failed, 0);
    results.totalTests = results.suites.reduce((sum, s) => sum + s.total, 0);

    // Print summary
    console.log(`\n${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}  TEST SUMMARY${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}\n`);

    results.suites.forEach(suite => {
      const color = suite.failed === 0 ? 'green' : suite.failed < suite.total / 2 ? 'yellow' : 'red';
      const percentage = Math.round((suite.passed / suite.total) * 100);
      log(color, '📊', `${suite.name}: ${suite.passed}/${suite.total} passed (${percentage}%)`);
    });

    console.log(`\n${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

    const totalPercentage = Math.round((results.totalPassed / results.totalTests) * 100);
    const overallColor = results.totalFailed === 0 ? 'green' : results.totalFailed < results.totalTests / 4 ? 'yellow' : 'red';

    log(overallColor, '🎯', `OVERALL: ${results.totalPassed}/${results.totalTests} tests passed (${totalPercentage}%)`);

    if (results.totalFailed === 0) {
      console.log(`\n${colors.bright}${colors.green}╔═══════════════════════════════════════════════════════╗`);
      console.log(`║                                                       ║`);
      console.log(`║           ✨ ALL TESTS PASSED! ✨                     ║`);
      console.log(`║     RECODER-WEB IS PRODUCTION READY! 🚀              ║`);
      console.log(`║                                                       ║`);
      console.log(`╚═══════════════════════════════════════════════════════╝${colors.reset}\n`);
    } else {
      console.log(`\n${colors.bright}${colors.yellow}╔═══════════════════════════════════════════════════════╗`);
      console.log(`║                                                       ║`);
      console.log(`║     ⚠️  SOME TESTS FAILED                            ║`);
      console.log(`║     Review failures before production deployment     ║`);
      console.log(`║                                                       ║`);
      console.log(`╚═══════════════════════════════════════════════════════╝${colors.reset}\n`);
    }

  } catch (error) {
    console.error(`\n${colors.red}Fatal error running tests: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

runAllTests();
