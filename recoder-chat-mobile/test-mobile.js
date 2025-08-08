/**
 * Test Mobile App Core Functionality
 */

// Test LocalAIIntegration
const testLocalAI = async () => {
  try {
    console.log('🧪 Testing LocalAI Integration...');
    
    // Dynamic import to avoid module issues
    const { localAI } = await import('./lib/services/LocalAIIntegration.js');
    
    // Test connection
    const status = await localAI.testConnection();
    console.log('✅ Local AI connection test:', status);
    
    // Test get models
    const models = await localAI.getAvailableModels();
    console.log('✅ Available models:', models.local.length, 'local models');
    
    return true;
  } catch (error) {
    console.error('❌ LocalAI test failed:', error.message);
    return false;
  }
};

// Test Mobile Features
const testMobileFeatures = async () => {
  try {
    console.log('🧪 Testing Mobile Features...');
    
    const { mobileFeatures } = await import('./services/MobileFeatures.js');
    
    // Test capabilities
    const capabilities = await mobileFeatures.getDeviceCapabilities();
    console.log('✅ Device capabilities:', capabilities);
    
    return true;
  } catch (error) {
    console.error('❌ Mobile Features test failed:', error.message);
    return false;
  }
};

// Test Providers
const testProviders = async () => {
  try {
    console.log('🧪 Testing AI Providers...');
    
    const { getProviderStatus } = await import('./lib/ai/providers.js');
    
    const status = await getProviderStatus();
    console.log('✅ Provider status:', status);
    
    return true;
  } catch (error) {
    console.error('❌ Providers test failed:', error.message);
    return false;
  }
};

// Run all tests
const runTests = async () => {
  console.log('🚀 Starting Recoder Mobile App Tests...\n');
  
  const results = await Promise.all([
    testLocalAI(),
    testMobileFeatures(),
    testProviders()
  ]);
  
  const passed = results.filter(Boolean).length;
  const total = results.length;
  
  console.log(`\n📊 Test Results: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('✅ All tests passed! Mobile app is ready.');
  } else {
    console.log('❌ Some tests failed. Check the errors above.');
  }
};

// Run if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests, testLocalAI, testMobileFeatures, testProviders };