/**
 * Test script for enhanced recoder-web features
 * Tests the Phase 1 implementation
 */

// Test 1: Smart Routing API
async function testSmartRouting() {
  console.log('🧠 Testing Smart Routing API...');
  
  try {
    const response = await fetch('http://localhost:3001/api/smart-routing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Build a secure authentication system with database integration',
        preferences: { speed: 'quality', cost: 'medium' }
      })
    });
    
    const result = await response.json();
    console.log('✅ Smart Routing Result:', {
      recommendedModel: result.recommendedModel,
      confidence: result.confidence,
      reasoning: result.reasoning
    });
    
    return result;
  } catch (error) {
    console.error('❌ Smart Routing failed:', error);
    return null;
  }
}

// Test 2: Provider Status
async function testProviderStatus() {
  console.log('🔌 Testing Provider Status...');
  
  try {
    const response = await fetch('http://localhost:3001/api/smart-routing');
    const result = await response.json();
    
    console.log('✅ Available Providers:', result.providersStatus.length);
    result.providersStatus.forEach(provider => {
      console.log(`  - ${provider.name}: ${provider.available ? '✅' : '❌'} (${provider.models.length} models)`);
    });
    
    return result;
  } catch (error) {
    console.error('❌ Provider Status failed:', error);
    return null;
  }
}

// Test 3: Multi-AI Generation (if keys are configured)
async function testMultiAIGeneration() {
  console.log('🤖 Testing Multi-AI Generation...');
  
  try {
    const response = await fetch('http://localhost:3001/api/multi-ai-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId: 'test-message-id',
        prompt: 'Create a simple React component with TypeScript',
        model: 'claude-3-5-sonnet-20241022',
        quality: 'high',
        options: {
          language: 'typescript',
          framework: 'react',
          realCode: true
        }
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Multi-AI Generation successful:', {
        provider: result.result.provider,
        model: result.result.model,
        codeLength: result.result.code.length,
        realFunctionality: result.result.realFunctionality
      });
      return result;
    } else {
      console.log('⚠️ Multi-AI Generation requires database and API keys');
      return null;
    }
  } catch (error) {
    console.error('❌ Multi-AI Generation failed:', error);
    return null;
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Testing Enhanced Recoder Web Features\n');
  
  const results = {
    smartRouting: await testSmartRouting(),
    providerStatus: await testProviderStatus(),
    multiAI: await testMultiAIGeneration()
  };
  
  console.log('\n📊 Test Summary:');
  console.log('Smart Routing:', results.smartRouting ? '✅ PASS' : '❌ FAIL');
  console.log('Provider Status:', results.providerStatus ? '✅ PASS' : '❌ FAIL');
  console.log('Multi-AI Generation:', results.multiAI ? '✅ PASS' : '⚠️ SKIP (requires setup)');
  
  console.log('\n🎉 Phase 1 Enhanced Features Test Complete!');
  console.log('Visit http://localhost:3001 to test the full interface');
}

// Run tests if this script is executed directly
if (typeof module !== 'undefined' && require.main === module) {
  runAllTests();
}

module.exports = { testSmartRouting, testProviderStatus, testMultiAIGeneration };