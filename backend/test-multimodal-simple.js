/**
 * Simple Multi-Modal AI Test
 */

const { multiModalAI } = require('./src/services/multi-modal-ai-service');

async function testSimple() {
  console.log('🚀 Testing Multi-Modal AI...');

  try {
    const input = {
      code: {
        content: 'function test() { return "hello"; }',
        filePath: 'test.js',
        language: 'javascript'
      },
      query: 'Analyze this code',
      mode: 'code_generation'
    };

    console.log('📝 Processing request...');
    const result = await multiModalAI.processMultiModal(input);
    
    console.log('✅ Success!');
    console.log(`🎯 Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.log(`📊 Modalities: ${result.usedModalities.join(', ')}`);
    console.log(`⏱️  Processing time: ${result.processingTime}ms`);
    
    if (result.generatedCode) {
      console.log('💻 Generated code length:', result.generatedCode.content.length);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

testSimple().then(success => {
  if (success) {
    console.log('\n🎉 Multi-Modal AI is working!');
  } else {
    console.log('\n💥 Multi-Modal AI test failed');
  }
});