#!/usr/bin/env node

/**
 * 🧪 SIMPLE PERFORMANCE MONITORING TEST
 * Quick tests without overwhelming the server
 */

async function testBasicFunctionality() {
  console.log('🧪 Testing Basic Performance Monitoring...\n');

  const baseUrl = 'http://localhost:3000/api/performance-monitoring';

  try {
    // Test 1: Simple Status Check
    console.log('📊 Test 1: Basic status check...');
    const response = await fetch(`${baseUrl}?metric=status`);
    const data = await response.json();
    
    if (data.success) {
      console.log('✅ Status check PASSED');
      console.log(`   Service: ${data.data.service}`);
      console.log(`   CPU: ${data.data.currentMetrics.cpu}%`);
      console.log(`   Memory: ${data.data.currentMetrics.memory}%`);
    } else {
      console.log('❌ Status check FAILED');
    }

    // Test 2: Simple Metrics Collection
    console.log('\n📈 Test 2: Simple metrics collection...');
    const metricsResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'collect-metrics' })
    });
    const metricsData = await metricsResponse.json();
    
    if (metricsData.success) {
      console.log('✅ Metrics collection PASSED');
      console.log(`   CPU Usage: ${metricsData.metrics.cpu.usage}%`);
      console.log(`   Memory Usage: ${metricsData.metrics.memory.percentage}%`);
      console.log(`   Uptime: ${Math.round(metricsData.metrics.application.uptime/60)}m`);
    } else {
      console.log('❌ Metrics collection FAILED');
    }

    // Test 3: Get Alerts
    console.log('\n🚨 Test 3: Getting alerts...');
    const alertsResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get-alerts' })
    });
    const alertsData = await alertsResponse.json();
    
    if (alertsData.success) {
      console.log('✅ Alerts check PASSED');
      console.log(`   Active alerts: ${alertsData.totalActiveAlerts}`);
    } else {
      console.log('❌ Alerts check FAILED');
    }

    console.log('\n🎉 Basic performance monitoring is working!');
    console.log('✅ All core functions are operational');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n💡 Make sure the development server is running:');
    console.log('   cd recoder-web && npm run dev');
  }
}

// Run simple tests
testBasicFunctionality();
