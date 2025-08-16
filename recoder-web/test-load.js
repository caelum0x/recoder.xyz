// Test Load Performance with Concurrent Users
const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3007';
const CONCURRENT_USERS = [1, 5, 10, 20, 50];
const TEST_DURATION = 30000; // 30 seconds

async function makeRequest(url, options = {}) {
  const start = Date.now();
  try {
    const response = await fetch(url, options);
    const responseTime = Date.now() - start;
    return {
      success: true,
      status: response.status,
      responseTime,
      size: response.headers.get('content-length') || 0
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      responseTime: Date.now() - start
    };
  }
}

async function runConcurrentTest(users, duration) {
  console.log(`\n🚀 Testing with ${users} concurrent users for ${duration/1000}s...`);
  
  const requests = [];
  const results = [];
  const startTime = Date.now();
  
  // Endpoints to test
  const endpoints = [
    { url: `${BASE_URL}/`, method: 'GET' },
    { url: `${BASE_URL}/pricing`, method: 'GET' },
    { url: `${BASE_URL}/templates`, method: 'GET' },
    { url: `${BASE_URL}/api/pricing/tiers`, method: 'GET' },
    { url: `${BASE_URL}/api/smart-routing`, method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ prompt: 'test load', task_type: 'test' }) }
  ];
  
  // Start concurrent users
  for (let user = 0; user < users; user++) {
    const userRequests = async () => {
      const userResults = [];
      
      while (Date.now() - startTime < duration) {
        const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
        const result = await makeRequest(endpoint.url, {
          method: endpoint.method,
          headers: endpoint.headers,
          body: endpoint.body
        });
        
        userResults.push({
          ...result,
          endpoint: endpoint.url,
          user: user + 1,
          timestamp: Date.now()
        });
        
        // Small delay between requests to simulate real user behavior
        await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
      }
      
      return userResults;
    };
    
    requests.push(userRequests());
  }
  
  // Wait for all users to complete
  const userResults = await Promise.all(requests);
  const allResults = userResults.flat();
  
  // Calculate metrics
  const successfulRequests = allResults.filter(r => r.success);
  const failedRequests = allResults.filter(r => !r.success);
  
  const responseTimes = successfulRequests.map(r => r.responseTime);
  const avgResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
  const minResponseTime = Math.min(...responseTimes);
  const maxResponseTime = Math.max(...responseTimes);
  
  // Calculate percentiles
  const sortedTimes = responseTimes.sort((a, b) => a - b);
  const p50 = sortedTimes[Math.floor(sortedTimes.length * 0.5)];
  const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)];
  const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)];
  
  const throughput = allResults.length / (duration / 1000); // requests per second
  const errorRate = (failedRequests.length / allResults.length) * 100;
  
  return {
    users,
    totalRequests: allResults.length,
    successfulRequests: successfulRequests.length,
    failedRequests: failedRequests.length,
    avgResponseTime: Math.round(avgResponseTime),
    minResponseTime,
    maxResponseTime,
    p50: Math.round(p50),
    p95: Math.round(p95),
    p99: Math.round(p99),
    throughput: Math.round(throughput * 100) / 100,
    errorRate: Math.round(errorRate * 100) / 100
  };
}

async function testLoadPerformance() {
  console.log('⚡ Starting Load Testing with Concurrent Users...');
  console.log(`Test Duration: ${TEST_DURATION/1000} seconds per test`);
  console.log(`Base URL: ${BASE_URL}`);
  
  const loadTestResults = [];
  
  try {
    // Test with different user loads
    for (const userCount of CONCURRENT_USERS) {
      const result = await runConcurrentTest(userCount, TEST_DURATION);
      loadTestResults.push(result);
      
      console.log(`\n📊 Results for ${userCount} users:`);
      console.log(`  Total Requests: ${result.totalRequests}`);
      console.log(`  Successful: ${result.successfulRequests}`);
      console.log(`  Failed: ${result.failedRequests}`);
      console.log(`  Avg Response Time: ${result.avgResponseTime}ms`);
      console.log(`  Response Time Range: ${result.minResponseTime}ms - ${result.maxResponseTime}ms`);
      console.log(`  P50: ${result.p50}ms | P95: ${result.p95}ms | P99: ${result.p99}ms`);
      console.log(`  Throughput: ${result.throughput} req/s`);
      console.log(`  Error Rate: ${result.errorRate}%`);
      
      // Brief pause between tests
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Analyze performance degradation
    console.log('\n📈 Load Testing Analysis...');
    
    const baselineResult = loadTestResults[0]; // 1 user
    const highLoadResult = loadTestResults[loadTestResults.length - 1]; // highest user count
    
    const performanceDegradation = {
      responseTimeIncrease: Math.round(((highLoadResult.avgResponseTime - baselineResult.avgResponseTime) / baselineResult.avgResponseTime) * 100),
      throughputDecrease: Math.round(((baselineResult.throughput - highLoadResult.throughput) / baselineResult.throughput) * 100),
      errorRateIncrease: highLoadResult.errorRate - baselineResult.errorRate
    };
    
    console.log(`Response time increased by: ${performanceDegradation.responseTimeIncrease}%`);
    console.log(`Throughput decreased by: ${performanceDegradation.throughputDecrease}%`);
    console.log(`Error rate increased by: ${performanceDegradation.errorRateIncrease}%`);
    
    // Performance thresholds
    const performanceIssues = [];
    
    if (highLoadResult.avgResponseTime > 3000) {
      performanceIssues.push('High response times under load (>3s)');
    }
    if (highLoadResult.errorRate > 5) {
      performanceIssues.push('High error rate under load (>5%)');
    }
    if (performanceDegradation.responseTimeIncrease > 200) {
      performanceIssues.push('Significant performance degradation (>200% increase)');
    }
    if (highLoadResult.p95 > 5000) {
      performanceIssues.push('Poor 95th percentile response time (>5s)');
    }
    
    // Calculate load testing score
    const loadScore = {
      responseTime: Math.max(0, 100 - Math.round(highLoadResult.avgResponseTime / 30)), // 30ms = 1 point deduction
      errorRate: Math.max(0, 100 - Math.round(highLoadResult.errorRate * 10)), // 1% error = 10 points deduction
      throughput: Math.min(100, Math.round(highLoadResult.throughput * 2)), // 1 req/s = 2 points
      stability: Math.max(0, 100 - performanceDegradation.responseTimeIncrease) // performance degradation penalty
    };
    
    const totalLoadScore = Math.round((loadScore.responseTime + loadScore.errorRate + loadScore.throughput + loadScore.stability) / 4);
    
    console.log('\n🎯 Load Testing Score:');
    console.log(`Response Time Score: ${loadScore.responseTime}/100`);
    console.log(`Error Rate Score: ${loadScore.errorRate}/100`);
    console.log(`Throughput Score: ${loadScore.throughput}/100`);
    console.log(`Stability Score: ${loadScore.stability}/100`);
    console.log(`Overall Load Score: ${totalLoadScore}/100`);
    
    return {
      status: 'success',
      loadTestResults,
      performanceDegradation,
      loadScore: totalLoadScore,
      scoreBreakdown: loadScore,
      performanceIssues,
      recommendations: performanceIssues.length > 0 ? [
        'Implement database connection pooling',
        'Add Redis caching for frequently accessed data',
        'Set up load balancing for multiple server instances',
        'Optimize database queries and add indexes',
        'Implement request rate limiting',
        'Add CDN for static assets'
      ] : []
    };
    
  } catch (error) {
    console.error('❌ Load testing failed:', error.message);
    return { status: 'error', error: error.message };
  }
}

testLoadPerformance()
  .then(result => {
    console.log('\n📋 Load Testing Summary:', result);
    if (result.status === 'success') {
      console.log('✅ Load testing completed');
      
      if (result.recommendations.length > 0) {
        console.log('\n⚡ Load Testing Recommendations:');
        result.recommendations.forEach(rec => console.log(`• ${rec}`));
      }
      
      if (result.performanceIssues.length > 0) {
        console.log('\n⚠️  Performance Issues Detected:');
        result.performanceIssues.forEach(issue => console.log(`• ${issue}`));
      }
    }
  })
  .catch(error => {
    console.error('💥 Test failed:', error);
  });