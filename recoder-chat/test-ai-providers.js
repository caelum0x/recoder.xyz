/**
 * Test AI Providers Integration in Recoder Chat
 */

// Import the AI models directly
import('./lib/ai/models.ts').then(async (models) => {
  console.log('🤖 Testing AI Providers in Recoder Chat');
  
  try {
    console.log('\n📋 Available Chat Models:');
    models.chatModels.forEach(model => {
      console.log(`  ${model.name} (${model.id})`);
      console.log(`    ${model.description}`);
    });
    
    console.log('\n🎯 Default Chat Model:', models.DEFAULT_CHAT_MODEL);
    
    // Test local AI setup check
    console.log('\n🔍 Testing Local AI Setup...');
    try {
      const providers = await import('./lib/ai/providers.ts');
      const status = await providers.getProviderStatus();
      console.log('✅ Provider Status Check Complete');
      
      const instructions = providers.getSetupInstructions();
      console.log('\n📖 Setup Instructions Available:');
      Object.keys(instructions).forEach(key => {
        console.log(`  - ${instructions[key].name}: ${instructions[key].url}`);
      });
      
    } catch (providerError) {
      console.log('⚠️ Provider status check had issues:', providerError.message);
    }
    
    console.log('\n🎉 AI Provider Test Complete!');
    
  } catch (error) {
    console.error('❌ AI Provider Test Failed:', error.message);
  }
  
}).catch(error => {
  console.error('❌ Failed to import AI models:', error.message);
});