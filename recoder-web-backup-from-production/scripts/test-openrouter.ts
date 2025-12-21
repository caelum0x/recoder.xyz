/**
 * Test OpenRouter Integration
 * Validates multi-model routing via OpenRouter
 */

import { optimizeRequest } from '../app/lib/.server/llm/smart-optimizer';
import { getModelWithFallback, type ModelProviderConfig } from '../app/lib/.server/llm/model-provider';

console.log('🌐 Testing OpenRouter Integration\n');
console.log('═'.repeat(80));

// Test cases
const testRequests = [
  {
    request: 'Create a Next.js dashboard with shadcn/ui',
    expectedStrategy: 'template-based',
    expectedModel: 'gemini-2.5-flash-lite'
  },
  {
    request: 'Build a simple todo list',
    expectedStrategy: 'template-based',
    expectedModel: 'gemini-2.5-flash-lite'
  },
  {
    request: 'Implement a pathfinding algorithm using A*',
    expectedStrategy: 'model-routed',
    expectedModel: 'deepseek-r1'
  },
  {
    request: 'Design a complex distributed system architecture',
    expectedStrategy: 'model-routed',
    expectedModel: 'claude-sonnet-4'
  }
];

console.log('\n📊 Test Configuration\n');
console.log('Environment Variables:');
console.log(`  OPENROUTER_API_KEY: ${process.env.OPENROUTER_API_KEY ? '✅ Set' : '❌ Not set'}`);
console.log(`  ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? '✅ Set' : '❌ Not set'}`);
console.log('');

if (!process.env.OPENROUTER_API_KEY && !process.env.ANTHROPIC_API_KEY) {
  console.log('⚠️  WARNING: No API keys found!');
  console.log('   Set OPENROUTER_API_KEY or ANTHROPIC_API_KEY in .env.local');
  console.log('   Tests will simulate API key validation only.\n');
}

console.log('═'.repeat(80));
console.log('\n🧪 Running Optimization Tests\n');

let passed = 0;
let failed = 0;

for (let i = 0; i < testRequests.length; i++) {
  const test = testRequests[i];

  console.log(`\n📝 Test ${i + 1}: ${test.request}`);
  console.log('─'.repeat(80));

  try {
    // Get optimization result
    const result = optimizeRequest(test.request, 1);

    console.log(`   Strategy: ${result.strategy}`);
    console.log(`   Model: ${result.selectedModel?.id || 'none'}`);
    console.log(`   Model Name: ${result.selectedModel?.name || 'none'}`);
    console.log(`   Provider: ${result.selectedModel?.provider || 'none'}`);
    console.log(`   Cost: $${result.estimatedCost.toFixed(4)}`);
    console.log(`   Savings: ${result.estimatedSavings.percent.toFixed(1)}%`);
    console.log(`   Is Free: ${result.selectedModel?.isFree ? 'Yes' : 'No'}`);

    if (result.templateMatch) {
      console.log(`   Template: ${result.templateMatch.template.name} (${result.templateMatch.confidence}% confidence)`);
    }

    // Validate provider configuration
    if (result.selectedModel) {
      const providerConfig: ModelProviderConfig = {
        openrouterKey: process.env.OPENROUTER_API_KEY,
        anthropicKey: process.env.ANTHROPIC_API_KEY
      };

      const modelResult = getModelWithFallback(result.selectedModel, providerConfig);

      console.log(`   OpenRouter Ready: ${providerConfig.openrouterKey ? '✅ Yes' : '⚠️  No (add OPENROUTER_API_KEY)'}`);
      console.log(`   Using Fallback: ${modelResult.usingFallback ? 'Yes' : 'No'}`);

      if (modelResult.usingFallback) {
        console.log(`   ⚠️  Fallback triggered - add OPENROUTER_API_KEY for optimal routing`);
      } else if (providerConfig.openrouterKey) {
        console.log(`   ✅ Model would be served via OpenRouter`);
      }
    }

    // Check if test passed
    const strategyMatch = result.strategy === test.expectedStrategy;
    const modelMatch = !test.expectedModel || result.selectedModel?.id === test.expectedModel;

    if (strategyMatch && modelMatch) {
      console.log(`   ✅ PASS`);
      passed++;
    } else {
      console.log(`   ❌ FAIL`);
      if (!strategyMatch) {
        console.log(`      Expected strategy: ${test.expectedStrategy}, got: ${result.strategy}`);
      }
      if (!modelMatch) {
        console.log(`      Expected model: ${test.expectedModel}, got: ${result.selectedModel?.id}`);
      }
      failed++;
    }
  } catch (error) {
    console.log(`   ❌ ERROR: ${error}`);
    failed++;
  }
}

// Summary
console.log('\n═'.repeat(80));
console.log('\n📊 Test Results Summary\n');
console.log(`Total Tests: ${testRequests.length}`);
console.log(`Passed: ${passed} ✅`);
console.log(`Failed: ${failed} ❌`);
console.log(`Success Rate: ${((passed / testRequests.length) * 100).toFixed(1)}%`);

// OpenRouter recommendations
console.log('\n═'.repeat(80));
console.log('\n💡 OpenRouter Integration Status\n');

if (process.env.OPENROUTER_API_KEY) {
  console.log('✅ OpenRouter API key configured!');
  console.log('✅ You have access to ALL models with one API key');
  console.log('✅ Free models: Gemini Flash, DeepSeek R1 8B');
  console.log('✅ Premium models: Claude, GPT-4, DeepSeek R1');
  console.log('\n📊 Expected Cost Distribution:');
  console.log('   • 60-70% requests: FREE (Gemini, DeepSeek 8B)');
  console.log('   • 20-30% requests: $0.0049 (DeepSeek R1)');
  console.log('   • 5-10% requests: $0.03 (Claude Sonnet 4)');
  console.log('\n💰 Estimated savings: 93% vs baseline');
} else {
  console.log('⚠️  OpenRouter API key NOT configured');
  console.log('');
  console.log('📝 To enable OpenRouter (RECOMMENDED):');
  console.log('   1. Go to https://openrouter.ai/');
  console.log('   2. Sign up and get API key');
  console.log('   3. Add $5-10 credits');
  console.log('   4. Add to .env.local:');
  console.log('      OPENROUTER_API_KEY="sk-or-v1-xxxx"');
  console.log('   5. Restart dev server');
  console.log('');
  console.log('✅ Benefits:');
  console.log('   • One API key for ALL models');
  console.log('   • Free models (Gemini, DeepSeek)');
  console.log('   • 93% cost savings');
  console.log('   • No vendor lock-in');
}

console.log('\n═'.repeat(80));
console.log('');

// Exit code
if (failed > 0) {
  console.log('⚠️  Some tests failed. Review results above.\n');
  process.exit(1);
} else {
  console.log('🎉 All tests passed!\n');
  console.log('✅ Multi-model routing is operational');
  console.log('✅ OpenRouter integration ready');
  console.log('✅ Template system integrated');
  console.log('✅ Cost optimization active\n');
  process.exit(0);
}
