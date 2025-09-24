#!/usr/bin/env node

/**
 * Test OpenRouter AI Integration in Recoder-Chat
 */

import { UnifiedAIProvider } from './lib/ai/unified-providers.js';

async function testOpenRouterIntegration() {
  console.log('🚀 Testing OpenRouter AI Integration for Recoder-Chat...\n');
  
  // Set environment variable
  process.env.OPENROUTER_API_KEY = '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';
  
  const unifiedAI = new UnifiedAIProvider();
  
  // Test provider status
  console.log('📊 Checking provider status...');
  const status = await unifiedAI.getProviderStatus();
  console.log('Status:', status);
  
  // Test simple AI generation
  console.log('\n🧠 Testing AI generation...');
  try {
    const messages = [
      { role: 'user', content: 'Create a simple React button component' }
    ];
    
    const response = await unifiedAI.smartGenerate(messages, { 
      quality: 'balanced',
      temperature: 0.7,
      maxTokens: 1000
    });
    
    console.log('\n✅ AI Response:');
    console.log('Model:', response.model);
    console.log('Provider:', response.provider);
    console.log('Tokens:', response.tokens);
    console.log('Cost:', response.cost);
    console.log('Content preview:', response.content.substring(0, 200) + '...');
    
    console.log('\n🎉 SUCCESS: OpenRouter AI integration working in recoder-chat!');
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.log('\n🔄 Attempting fallback...');
    
    try {
      const fallbackResponse = await unifiedAI.smartGenerate(messages, { 
        quality: 'fast',
        preferredProvider: 'local'
      });
      console.log('Fallback successful:', fallbackResponse.provider);
    } catch (fallbackError) {
      console.error('Fallback failed:', fallbackError.message);
    }
  }
}

testOpenRouterIntegration().catch(console.error);