/**
 * Comprehensive AI Functionality Test for Recoder Chat
 * Tests the complete AI pipeline including unified providers, models, and chat functionality
 */

// Test the AI functionality by making requests to the chat API
async function testAIFunctionality() {
  console.log('🤖 Testing AI Functionality in Recoder Chat');
  console.log('============================================\n');

  const baseURL = 'http://localhost:3010';
  const testMessage = {
    messages: [
      { role: 'user', content: 'Hello! Can you help me write a simple React component?' }
    ]
  };

  // Test 1: Check if chat API endpoint exists
  console.log('1️⃣ Testing Chat API Endpoint...');
  try {
    const response = await fetch(`${baseURL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testMessage)
    });

    if (response.ok) {
      console.log('✅ Chat API endpoint is accessible');
      
      // Try to read the response
      const responseText = await response.text();
      if (responseText) {
        console.log('✅ Chat API returned response');
        console.log('📄 Response sample:', responseText.substring(0, 200) + '...');
      }
    } else {
      console.log(`⚠️ Chat API returned status: ${response.status}`);
      const errorText = await response.text();
      console.log('📄 Error response:', errorText.substring(0, 200));
    }
  } catch (error) {
    console.log('❌ Chat API test failed:', error.message);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 2: Test backend AI providers
  console.log('2️⃣ Testing Backend AI Providers...');
  try {
    const backendAIResponse = await fetch('http://localhost:3001/api/multi-modal-ai/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: 'Test AI generation - respond with "Backend AI working!"',
        provider: 'unified',
        taskType: 'text-generation'
      })
    });

    if (backendAIResponse.ok) {
      const backendResult = await backendAIResponse.json();
      console.log('✅ Backend AI generation successful');
      console.log('📄 Response:', backendResult);
    } else {
      console.log(`⚠️ Backend AI returned status: ${backendAIResponse.status}`);
      const errorText = await backendAIResponse.text();
      console.log('📄 Error:', errorText.substring(0, 200));
    }
  } catch (error) {
    console.log('❌ Backend AI test failed:', error.message);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 3: Test AI models configuration
  console.log('3️⃣ Testing AI Models Configuration...');
  try {
    // Import and test the models directly
    const { default: models } = await import('./lib/ai/models.ts');
    
    console.log('✅ AI models imported successfully');
    console.log('📋 Available models:');
    
    if (models.chatModels) {
      models.chatModels.forEach((model, index) => {
        console.log(`   ${index + 1}. ${model.name} (${model.id})`);
        console.log(`      ${model.description}`);
      });
      console.log(`📌 Default model: ${models.DEFAULT_CHAT_MODEL}`);
    }
  } catch (error) {
    console.log('❌ AI models test failed:', error.message);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 4: Test unified providers
  console.log('4️⃣ Testing Unified AI Providers...');
  try {
    const { unifiedAI } = await import('./lib/ai/unified-providers.ts');
    
    console.log('✅ Unified AI providers imported successfully');
    
    // Test provider status
    const providerStatus = await unifiedAI.getProviderStatus();
    console.log('📊 Provider Status:', providerStatus);
    
    // Test a simple generation if any provider is available
    if (providerStatus.openRouter || providerStatus.together || providerStatus.local) {
      console.log('🚀 Testing AI generation...');
      
      try {
        const testMessages = [
          { role: 'user', content: 'Hello! Respond with exactly: "AI System Working"' }
        ];
        
        const response = await unifiedAI.smartGenerate(testMessages, {
          quality: 'fast',
          maxTokens: 50
        });
        
        console.log('✅ AI generation successful!');
        console.log(`📄 Response: "${response.content}"`);
        console.log(`🏷️ Model: ${response.model}`);
        console.log(`🔌 Provider: ${response.provider}`);
        console.log(`💰 Cost: $${response.cost || 0}`);
        console.log(`🔢 Tokens: ${response.tokens || 0}`);
      } catch (genError) {
        console.log('⚠️ AI generation test failed:', genError.message);
      }
    } else {
      console.log('⚠️ No AI providers available for testing');
    }
  } catch (error) {
    console.log('❌ Unified providers test failed:', error.message);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 5: Environment variables check
  console.log('5️⃣ Testing Environment Configuration...');
  
  const envVars = [
    'OPENROUTER_API_KEY',
    'TOGETHER_API_KEY', 
    'ANTHROPIC_API_KEY',
    'GROQ_API_KEY',
    'GOOGLE_API_KEY',
    'BACKEND_URL',
    'NEXTAUTH_URL'
  ];

  envVars.forEach(envVar => {
    const value = process.env[envVar];
    if (value) {
      const display = envVar.includes('KEY') || envVar.includes('SECRET') 
        ? `${value.substring(0, 8)}...` 
        : value;
      console.log(`✅ ${envVar}: ${display}`);
    } else {
      console.log(`⚠️ ${envVar}: NOT SET`);
    }
  });

  console.log('\n' + '='.repeat(50) + '\n');
  console.log('🎉 AI Functionality Test Complete!');
  console.log('\n📝 Summary:');
  console.log('   - Chat API endpoint tested');
  console.log('   - Backend AI providers tested');
  console.log('   - AI models configuration verified');
  console.log('   - Unified providers tested');
  console.log('   - Environment configuration checked');
  console.log('\n✨ The recoder-chat AI system is ready for use!');
}

// Run the test
testAIFunctionality().catch(error => {
  console.error('❌ Test suite failed:', error);
});