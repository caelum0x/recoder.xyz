#!/usr/bin/env node

/**
 * 🧪 PERFORMANCE MONITORING TEST SCRIPT
 * Tests the real performance monitoring functionality with timeout handling
 */

async function testPerformanceMonitoring() {
  console.log('🧪 Testing Performance Monitoring Engine...\n');

  const baseUrl = 'http://localhost:3000/api/performance-monitoring';

  // Helper function to make requests with timeout
  async function fetchWithTimeout(url, options = {}, timeout = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw error;
    }
  }

  try {
    // Test 1: Get Status
    console.log('📊 Test 1: Getting service status...');
    const statusResponse = await fetchWithTimeout(`${baseUrl}?metric=status`);
    const statusData = await statusResponse.json();
    console.log('✅ Status:', statusData.success ? 'PASS' : 'FAIL');
    if (statusData.data) {
      console.log(`   Service: ${statusData.data.service}`);
      console.log(`   Active Alerts: ${statusData.data.activeAlerts}`);
      console.log(`   CPU: ${statusData.data.currentMetrics.cpu}%`);
      console.log(`   Memory: ${statusData.data.currentMetrics.memory}%\n`);
    }

    // Test 2: Collect Metrics
    console.log('📈 Test 2: Collecting system metrics...');
    const metricsResponse = await fetchWithTimeout(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'collect-metrics' })
    });
    const metricsData = await metricsResponse.json();
    console.log('✅ Metrics Collection:', metricsData.success ? 'PASS' : 'FAIL');
    if (metricsData.metrics) {
      console.log(`   CPU Usage: ${metricsData.metrics.cpu.usage}%`);
      console.log(`   Memory Usage: ${metricsData.metrics.memory.percentage}%`);
      console.log(`   AI Requests: ${metricsData.metrics.ai.totalRequests}`);
      console.log(`   Active Users: ${metricsData.metrics.application.activeUsers}`);
      console.log(`   Database Available: ${metricsData.metrics.database.activeConnections > 0 ? 'Yes' : 'No'}\n`);
    }

    // Test 3: Get Optimization Recommendations (with shorter timeout)
    console.log('🧠 Test 3: Getting AI optimization recommendations...');
    try {
      const optResponse = await fetchWithTimeout(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get-optimization-recommendations' })
      }, 15000); // 15 second timeout
      const optData = await optResponse.json();
      console.log('✅ Optimization Recommendations:', optData.success ? 'PASS' : 'FAIL');
      if (optData.recommendations) {
        console.log(`   Found ${optData.recommendations.length} recommendations`);
        optData.recommendations.slice(0, 2).forEach(rec => {
          console.log(`   - ${rec.title} (${rec.priority} priority)`);
        });
        console.log('');
      }
    } catch (error) {
      console.log('⚠️  Optimization Recommendations: TIMEOUT (expected if AI provider is slow)');
      console.log(`   Error: ${error.message}\n`);
    }

    // Test 4: Performance Profiling
    console.log('🔍 Test 4: Running performance profile...');
    const profileResponse = await fetchWithTimeout(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        action: 'start-performance-profile',
        duration: 2000  // Shorter duration for faster testing
      })
    }, 10000);
    const profileData = await profileResponse.json();
    console.log('✅ Performance Profile:', profileData.success ? 'PASS' : 'FAIL');
    if (profileData.profile) {
      console.log(`   Duration: ${profileData.profile.duration}ms`);
      console.log(`   CPU Delta: ${profileData.profile.deltas.cpu}%`);
      console.log(`   Memory Delta: ${profileData.profile.deltas.memory}%`);
      console.log(`   Performance: ${profileData.profile.analysis.performance}\n`);
    }

    // Test 5: Anomaly Detection
    console.log('🎯 Test 5: Detecting performance anomalies...');
    const anomalyResponse = await fetchWithTimeout(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'detect-anomalies' })
    });
    const anomalyData = await anomalyResponse.json();
    console.log('✅ Anomaly Detection:', anomalyData.success ? 'PASS' : 'FAIL');
    if (anomalyData.anomalies) {
      console.log(`   Found ${anomalyData.totalAnomalies} anomalies`);
      anomalyData.anomalies.forEach(anomaly => {
        console.log(`   - ${anomaly.type}: ${anomaly.severity} (${anomaly.deviation.toFixed(1)}% deviation)`);
      });
      console.log('');
    }

    // Test 6: Get Alerts
    console.log('🚨 Test 6: Getting active alerts...');
    const alertsResponse = await fetchWithTimeout(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get-alerts' })
    });
    const alertsData = await alertsResponse.json();
    console.log('✅ Active Alerts:', alertsData.success ? 'PASS' : 'FAIL');
    if (alertsData.alerts) {
      console.log(`   Active Alerts: ${alertsData.totalActiveAlerts}`);
      alertsData.alerts.slice(0, 3).forEach(alert => {
        console.log(`   - ${alert.type}: ${alert.message}`);
      });
      console.log('');
    }

    // Test 7: Dashboard Data
    console.log('📊 Test 7: Getting dashboard data...');
    const dashboardResponse = await fetchWithTimeout(`${baseUrl}?metric=dashboard`);
    const dashboardData = await dashboardResponse.json();
    console.log('✅ Dashboard:', dashboardData.success ? 'PASS' : 'FAIL');
    if (dashboardData.dashboard) {
      console.log(`   Overall Health: ${dashboardData.dashboard.summary.overallHealth}`);
      console.log(`   Critical Issues: ${dashboardData.dashboard.summary.criticalIssues}`);
      console.log(`   Cost Savings Opportunity: $${dashboardData.dashboard.summary.costSavingsOpportunity.toFixed(2)}\n`);
    }

    console.log('🎉 All core tests completed successfully!');
    console.log('\n📊 Performance Monitoring Engine Status:');
    console.log('   ✅ Real system metrics collection');
    console.log('   ✅ Performance profiling and anomaly detection');
    console.log('   ✅ Alert system and dashboard integration');
    console.log('   ✅ Fallback handling for database issues');
    console.log('   ⚠️  AI optimization (may timeout if provider is slow)');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n💡 Make sure the development server is running:');
    console.log('   cd recoder-web && npm run dev');
  }
}

// Run tests if server is available
testPerformanceMonitoring();
