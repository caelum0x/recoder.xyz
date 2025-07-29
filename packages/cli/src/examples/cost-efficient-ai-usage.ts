/**
 * Cost-Efficient AI Usage Examples for Recoder.xyz
 * 
 * Demonstrates how to use the unified AI provider system with
 * intelligent cost optimization and automatic model selection.
 */

import { AIHub } from '../services/ai-hub';
import { recoderAIConfig } from '../services/recoder-ai-config';
import { costEfficientRouter } from '../services/cost-efficient-router';
import { Logger } from '../utils/logger';

/**
 * Example 1: Basic cost-efficient chat
 */
export async function basicCostEfficientExample() {
  console.log('\n🚀 Example 1: Basic Cost-Efficient Chat\n');
  
  const aiHub = AIHub.getInstance();
  
  // Simple web development task
  const context = {
    type: 'web' as const,
    complexity: 'medium' as const,
    priority: 'cost' as const, // Prioritize cost efficiency
    requirements: ['React', 'TypeScript', 'responsive design']
  };

  const messages = [
    {
      role: 'user',
      content: 'Create a responsive React component for a user profile card with avatar, name, bio, and social links'
    }
  ];

  try {
    const response = await aiHub.chatCostEfficient(messages, context);
    
    console.log(`✅ Generated using: ${response.model} (${response.costInfo.tier})`);
    console.log(`💰 Estimated cost: $${response.costInfo.estimatedCost.toFixed(4)}`);
    console.log(`🧠 Selection reasoning: ${response.costInfo.reasoning}`);
    console.log(`📝 Code length: ${response.content.length} characters`);
    
    // Show first 200 characters of generated code
    console.log('\n📋 Generated code preview:');
    console.log(response.content.substring(0, 200) + '...\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

/**
 * Example 2: High-quality blockchain development
 */
export async function blockchainHighQualityExample() {
  console.log('\n🔒 Example 2: High-Quality Blockchain Development\n');
  
  const aiHub = AIHub.getInstance();
  
  // Complex blockchain task requiring high quality
  const context = {
    type: 'blockchain' as const,
    complexity: 'complex' as const,
    priority: 'quality' as const, // Prioritize quality over cost
    requirements: ['Solana', 'security audit', 'gas optimization'],
    tokenEstimate: 3000 // Large complex request
  };

  const messages = [
    {
      role: 'user',
      content: 'Create a Solana smart contract for a decentralized exchange (DEX) with automated market maker (AMM) functionality, including security measures and gas optimization'
    }
  ];

  try {
    const response = await aiHub.chatCostEfficient(messages, context);
    
    console.log(`✅ Generated using: ${response.model} (${response.costInfo.tier})`);
    console.log(`💰 Estimated cost: $${response.costInfo.estimatedCost.toFixed(4)}`);
    console.log(`🧠 Selection reasoning: ${response.costInfo.reasoning}`);
    console.log(`🔧 Tokens used: ${response.tokens?.input} input, ${response.tokens?.output} output`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

/**
 * Example 3: Budget mode demonstration
 */
export async function budgetModeExample() {
  console.log('\n💰 Example 3: Budget Mode - Maximum Cost Efficiency\n');
  
  const aiHub = AIHub.getInstance();
  
  // Configure for maximum cost efficiency
  const budgetConfig = {
    maxDailyCost: 2.00, // Very low budget
    preferFreeModels: true,
    budgetMode: true,
    qualityThreshold: 6.0, // Lower quality threshold for budget
    allowFallbacks: true
  };

  const context = {
    type: 'general' as const,
    complexity: 'simple' as const,
    priority: 'cost' as const,
    requirements: ['JavaScript', 'Node.js']
  };

  const messages = [
    {
      role: 'user',
      content: 'Create a simple Node.js Express API with basic CRUD operations for a todo list'
    }
  ];

  try {
    const response = await aiHub.chatCostEfficient(messages, context, {}, budgetConfig);
    
    console.log(`✅ Generated using: ${response.model} (${response.costInfo.tier})`);
    console.log(`💰 Estimated cost: $${response.costInfo.estimatedCost.toFixed(4)} (Budget mode)`);
    console.log(`🧠 Selection reasoning: ${response.costInfo.reasoning}`);
    
    if (response.costInfo.estimatedCost === 0) {
      console.log('🎉 FREE MODEL USED - Zero cost!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

/**
 * Example 4: Comparing different priorities
 */
export async function priorityComparisonExample() {
  console.log('\n⚖️ Example 4: Priority Comparison - Cost vs Quality vs Speed\n');
  
  const aiHub = AIHub.getInstance();
  
  const baseContext = {
    type: 'backend' as const,
    complexity: 'medium' as const,
    requirements: ['Python', 'FastAPI', 'PostgreSQL']
  };

  const prompt = 'Create a FastAPI backend with user authentication, database models, and JWT token management';

  const priorities = ['cost', 'quality', 'speed'] as const;
  
  for (const priority of priorities) {
    console.log(`\n--- Priority: ${priority.toUpperCase()} ---`);
    
    const context = { ...baseContext, priority };
    const selection = await costEfficientRouter.selectOptimalModel(context);
    
    console.log(`🎯 Selected model: ${selection.model}`);
    console.log(`🏷️ Tier: ${selection.tier}`);
    console.log(`💰 Estimated cost: $${selection.estimatedCost.toFixed(4)}`);
    console.log(`🧠 Reasoning: ${selection.reasoning}`);
  }
}

/**
 * Example 5: Cost tracking and optimization
 */
export async function costTrackingExample() {
  console.log('\n📊 Example 5: Cost Tracking and Optimization\n');
  
  // Get current usage statistics
  const stats = costEfficientRouter.getUsageStats();
  console.log('📈 Current Usage Statistics:');
  console.log(`  Daily cost: $${stats.dailyCost.toFixed(2)}`);
  console.log(`  Requests: ${stats.requestCount}`);
  console.log(`  Average cost per request: $${stats.averageCostPerRequest.toFixed(4)}`);
  
  // Get optimization recommendations
  const recommendations = costEfficientRouter.getCostOptimizationRecommendations();
  console.log('\n💡 Cost Optimization Recommendations:');
  console.log(`  Free model usage: ${recommendations.freeModelUsage.toFixed(1)}%`);
  console.log(`  Potential savings: $${recommendations.totalSavings.toFixed(2)}`);
  
  if (recommendations.recommendations.length > 0) {
    console.log('  Suggestions:');
    recommendations.recommendations.forEach((rec, i) => {
      console.log(`    ${i + 1}. ${rec}`);
    });
  }

  // Get configuration optimization
  const configOptimizations = recoderAIConfig.getOptimizationSuggestions();
  
  if (configOptimizations.costOptimizations.length > 0) {
    console.log('\n💰 Configuration Optimizations:');
    configOptimizations.costOptimizations.forEach((opt, i) => {
      console.log(`    ${i + 1}. ${opt}`);
    });
  }
}

/**
 * Example 6: Environment-specific optimization
 */
export async function environmentOptimizationExample() {
  console.log('\n🌍 Example 6: Environment-Specific Optimization\n');
  
  const environments = ['development', 'production', 'testing'] as const;
  
  for (const env of environments) {
    console.log(`\n--- Environment: ${env.toUpperCase()} ---`);
    
    // Simulate environment change
    process.env.NODE_ENV = env;
    
    const optimizedModels = recoderAIConfig.getEnvironmentOptimizedModels('web');
    console.log(`🎯 Optimized models for ${env}:`);
    optimizedModels.slice(0, 3).forEach((model, i) => {
      console.log(`    ${i + 1}. ${model}`);
    });
  }
  
  // Reset environment
  process.env.NODE_ENV = 'development';
}

/**
 * Example 7: Provider availability check
 */
export async function providerAvailabilityExample() {
  console.log('\n🔍 Example 7: Provider Availability Check\n');
  
  const aiHub = AIHub.getInstance();
  const providers = aiHub.getAvailableProviders();
  
  console.log('📋 Available Providers:');
  providers.forEach(provider => {
    const status = provider.available ? '✅' : '❌';
    const costInfo = provider.cost === 'free' ? '🆓' : provider.cost === 'free/paid' ? '💰/🆓' : '💰';
    
    console.log(`  ${status} ${provider.name} ${costInfo}`);
    console.log(`      Specialties: ${provider.specialties.join(', ')}`);
    
    if (provider.performance) {
      console.log(`      Quality: ${provider.performance.codingScore}/10, Tokens: ${provider.performance.tokenCapacity}`);
    }
  });
}

/**
 * Example 8: Custom configuration generation
 */
export async function generateOptimalConfigExample() {
  console.log('\n⚙️ Example 8: Generate Optimal Configuration\n');
  
  console.log('📝 Generating optimal .env configuration based on your setup...\n');
  
  const optimalConfig = recoderAIConfig.generateOptimalEnvConfig();
  
  // Show first few lines as preview
  const lines = optimalConfig.split('\n').slice(0, 20);
  console.log('📋 Configuration preview:');
  lines.forEach(line => console.log(line));
  console.log('...');
  
  console.log('\n💡 Copy the full configuration to your .env file for optimal performance');
}

/**
 * Run all examples
 */
export async function runAllExamples() {
  console.log('🚀 Recoder.xyz Cost-Efficient AI System Demo');
  console.log('='.repeat(50));
  
  try {
    await basicCostEfficientExample();
    await blockchainHighQualityExample();
    await budgetModeExample();
    await priorityComparisonExample();
    await costTrackingExample();
    await environmentOptimizationExample();
    await providerAvailabilityExample();
    await generateOptimalConfigExample();
    
    console.log('\n✅ All examples completed successfully!');
    console.log('\n🎯 Key Benefits Demonstrated:');
    console.log('  • Automatic cost optimization');
    console.log('  • Quality-based model selection');
    console.log('  • Free model prioritization');
    console.log('  • Environment-specific optimization');
    console.log('  • Comprehensive cost tracking');
    console.log('  • Intelligent fallback systems');
    
  } catch (error) {
    console.error('❌ Example failed:', error);
  }
}

// Export for CLI usage
export {
  runAllExamples as default
};

// Run examples if called directly
if (require.main === module) {
  runAllExamples().catch(console.error);
}