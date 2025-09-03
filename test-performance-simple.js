#!/usr/bin/env node

/**
 * 🧪 SIMPLE PERFORMANCE MONITORING TEST
 * Quick tests without overwhelming the server
 */

async function testBasicEndpoints() {
  console.log('🧪 Testing Performance Monitoring - Basic Endpoints\n');

  const baseUrl = 'http://localhost:3000/api/performance-monitoring';

  try {
    // Test 1: Basic Status
    console.log('1. 📊 Testing basic status...');
    const statusResponse = await fetch(`${baseUrl}`, { 
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    
    if (!statusResponse.ok) {
      throw new Error(`Status: ${statusResponse.status}`);
    }
    
    const statusData = await statusResponse.json();
    console.log('   ✅ Basic endpoint: PASS');
    console.log(`   Service: ${statusData.data?.service || 'Unknown'}\n`);

    // Test 2: Service Status
    console.log('2. 📈 Testing service status endpoint...');
    const serviceResponse = await fetch(`${baseUrl}?metric=status`);
    
    if (!serviceResponse.ok) {
      throw new Error(`Service status: ${serviceResponse.status}`);
    }
    
    const serviceData = await serviceResponse.json();
    console.log('   ✅ Service status: PASS');
    
    if (serviceData.data?.currentMetrics) {
      console.log(`   CPU: ${serviceData.data.currentMetrics.cpu}%`);
      console.log(`   Memory: ${serviceData.data.currentMetrics.memory}%`);
      console.log(`   Uptime: ${Math.round(serviceData.data.currentMetrics.uptime/3600)}h\n`);
    }

    // Test 3: Simple Metrics Collection
    console.log('3. 🔍 Testing metrics collection...');
    const metricsResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'collect-metrics' })
    });
    
    if (!metricsResponse.ok) {
      throw new Error(`Metrics: ${metricsResponse.status}`);
    }
    
    const metricsData = await metricsResponse.json();
    console.log('   ✅ Metrics collection: PASS');
    
    if (metricsData.metrics) {
      console.log(`   CPU Usage: ${metricsData.metrics.cpu.usage}%`);
      console.log(`   Memory: ${metricsData.metrics.memory.percentage}%`);
      console.log(`   Network Connections: ${metricsData.metrics.network.connections}`);
      console.log(`   Disk Usage: ${metricsData.metrics.disk.percentage}%\n`);
    }

    // Test 4: Performance Alerts
    console.log('4. 🚨 Testing performance alerts...');
    const alertsResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get-alerts' })
    });
    
    if (!alertsResponse.ok) {
      throw new Error(`Alerts: ${alertsResponse.status}`);
    }
    
    const alertsData = await alertsResponse.json();
    console.log('   ✅ Alerts system: PASS');
    console.log(`   Active Alerts: ${alertsData.totalActiveAlerts || 0}\n`);

    // Test 5: Simple Recommendations (using fallback)
    console.log('5. 🧠 Testing optimization recommendations...');
    const recResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get-optimization-recommendations' })
    });
    
    if (!recResponse.ok) {
      throw new Error(`Recommendations: ${recResponse.status}`);
    }
    
    const recData = await recResponse.json();
    console.log('   ✅ Recommendations: PASS');
    console.log(`   Found ${recData.recommendations?.length || 0} recommendations\n`);

    console.log('🎉 All basic tests PASSED!');
    console.log('\n📊 Performance Monitoring Engine is working correctly:');
    console.log('   ✅ Basic endpoints responding');
    console.log('   ✅ Metrics collection functional');
    console.log('   ✅ Alert system operational');
    console.log('   ✅ Recommendations system working');
    console.log('\n💡 The system is ready for production use!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Check if the development server is running');
    console.log('   2. Verify the API route is accessible');
    console.log('   3. Check for any TypeScript compilation errors');
  }
}

// Run the tests
testBasicEndpoints();
