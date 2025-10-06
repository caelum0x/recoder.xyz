/**
 * Test Backend Connection from Recoder Chat
 * This tests if the chat app can reach the backend successfully
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

async function testBackendConnection() {
  console.log('🔍 Testing Recoder Chat -> Backend Connection');
  console.log(`Backend URL: ${BACKEND_URL}`);
  
  try {
    // Test basic health endpoint
    console.log('\n1️⃣ Testing Health Endpoint...');
    const healthResponse = await fetch(`${BACKEND_URL}/health`);
    const healthData = await healthResponse.json();
    console.log('✅ Health Check:', healthData.status);
    console.log('📊 Systems:', healthData.systems);
    
    // Test AI providers endpoint
    console.log('\n2️⃣ Testing AI Providers Endpoint...');
    const aiResponse = await fetch(`${BACKEND_URL}/api/ai-providers/health`);
    if (aiResponse.ok) {
      const aiData = await aiResponse.json();
      console.log('✅ AI Providers:', aiData.success ? 'Available' : 'Error');
    } else if (aiResponse.status === 401) {
      console.log('🔐 AI Providers: Requires Authentication (Expected)');
    } else {
      console.log('❌ AI Providers: Error', aiResponse.status);
    }
    
    // Test multi-modal AI endpoint
    console.log('\n3️⃣ Testing Multi-Modal AI Endpoint...');
    const multiModalResponse = await fetch(`${BACKEND_URL}/api/multi-modal-ai/health`);
    if (multiModalResponse.ok) {
      const multiModalData = await multiModalResponse.json();
      console.log('✅ Multi-Modal AI:', multiModalData.status);
      console.log('🎯 Features:', Object.keys(multiModalData.features).filter(k => multiModalData.features[k]).length, 'enabled');
    } else {
      console.log('❌ Multi-Modal AI: Error', multiModalResponse.status);
    }
    
    // Test cost optimization endpoint  
    console.log('\n4️⃣ Testing Cost Optimization...');
    const costResponse = await fetch(`${BACKEND_URL}/api/cost-optimization/system/status`);
    if (costResponse.ok) {
      const costData = await costResponse.json();
      console.log('✅ Cost Optimization:', costData.success ? 'Active' : 'Error');
    } else if (costResponse.status === 401) {
      console.log('🔐 Cost Optimization: Requires Authentication (Expected)');
    } else {
      console.log('❌ Cost Optimization: Error', costResponse.status);
    }
    
    console.log('\n🎉 Backend Connection Test Complete!');
    return true;
    
  } catch (error) {
    console.error('❌ Backend Connection Failed:', error.message);
    return false;
  }
}

// Run the test
testBackendConnection().then(success => {
  process.exit(success ? 0 : 1);
});