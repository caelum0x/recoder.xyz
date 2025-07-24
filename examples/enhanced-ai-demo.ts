/**
 * Enhanced Recoder.xyz AI Demo
 * 
 * Demonstrates the power of next-generation AI models with intelligent routing
 */

import { AIOrchestrator, GenerationRequest, OrchestratorConfig } from '../packages/core/src/ai/orchestrator';

// Configuration for all next-gen AI providers
const orchestratorConfig: OrchestratorConfig = {
  providers: {
    claude: {
      apiKey: process.env.ANTHROPIC_API_KEY!,
      defaultModel: 'claude-sonnet-4',
      rateLimits: {
        requestsPerMinute: 1000,
        tokensPerMinute: 100_000,
        concurrentRequests: 10
      }
    },
    groq: {
      apiKey: process.env.GROQ_API_KEY!,
      defaultModel: 'llama-3.3-70b-versatile',
      rateLimits: {
        requestsPerMinute: 2000,
        tokensPerMinute: 500_000,
        concurrentRequests: 20
      }
    },
    gemini: {
      apiKey: process.env.GOOGLE_API_KEY!,
      defaultModel: 'gemini-2.5-pro',
      rateLimits: {
        requestsPerMinute: 1500,
        tokensPerMinute: 300_000,
        concurrentRequests: 15
      }
    },
    kimi: {
      apiKey: process.env.MOONSHOT_API_KEY!,
      defaultModel: 'moonshot-v1-128k',
      rateLimits: {
        requestsPerMinute: 1000,
        tokensPerMinute: 200_000,
        concurrentRequests: 12
      }
    },
    qwen: {
      apiKey: process.env.QWEN_API_KEY!,
      defaultModel: 'qwen2.5-coder-32b-instruct',
      rateLimits: {
        requestsPerMinute: 1200,
        tokensPerMinute: 300_000,
        concurrentRequests: 15
      }
    },
    deepseekR1: {
      apiKey: process.env.DEEPSEEK_API_KEY!,
      defaultModel: 'deepseek-r1',
      rateLimits: {
        requestsPerMinute: 800,
        tokensPerMinute: 150_000,
        concurrentRequests: 10
      }
    }
  },
  routing: {
    enableIntelligentRouting: true,
    fallbackEnabled: true,
    maxRetries: 3,
    timeoutMs: 30000
  },
  optimization: {
    enableCaching: true,
    cacheSize: 1000,
    enableLoadBalancing: true,
    enableCostOptimization: true
  },
  monitoring: {
    enableMetrics: true,
    enableLogging: true,
    logLevel: 'info'
  }
};

/**
 * Demo 1: Intelligent AI Routing
 * Shows how different tasks get routed to optimal AI models
 */
async function demoIntelligentRouting() {
  console.log('🧠 DEMO 1: Intelligent AI Routing\n');
  
  const orchestrator = AIOrchestrator.getInstance(orchestratorConfig);

  // Security Task → Claude Sonnet 4 (Best for security)
  console.log('🔒 Security Analysis Task:');
  const securityRequest: GenerationRequest = {
    prompt: `Analyze this smart contract for security vulnerabilities:

contract SimpleToken {
    mapping(address => uint256) public balances;
    
    function transfer(address to, uint256 amount) public {
        balances[msg.sender] -= amount;
        balances[to] += amount;
    }
}`,
    task: {
      type: 'security-audit',
      complexity: 'complex',
      language: 'solidity',
      domain: 'blockchain'
    },
    user: { id: 'demo-user', tier: 'pro' },
    options: { priority: 'quality' }
  };

  const securityResult = await orchestrator.generateCode(securityRequest);
  console.log(`✅ Routed to: ${securityResult.metadata.provider} (${securityResult.metadata.model})`);
  console.log(`💰 Cost: $${securityResult.usage.cost.toFixed(4)}`);
  console.log(`⏱️ Time: ${securityResult.metadata.responseTime}ms`);
  console.log(`🎯 Reasoning: ${securityResult.metadata.routing.reasoning}\n`);

  // UI Components → Groq (Best for speed)
  console.log('⚡ UI Component Generation:');
  const uiRequest: GenerationRequest = {
    prompt: 'Create a responsive React dashboard component with dark mode toggle',
    task: {
      type: 'ui-components',
      complexity: 'moderate',
      language: 'typescript',
      framework: 'react'
    },
    user: { id: 'demo-user', tier: 'pro' },
    options: { priority: 'speed' }
  };

  const uiResult = await orchestrator.generateCode(uiRequest);
  console.log(`✅ Routed to: ${uiResult.metadata.provider} (${uiResult.metadata.model})`);
  console.log(`💰 Cost: $${uiResult.usage.cost.toFixed(4)}`);
  console.log(`⏱️ Time: ${uiResult.metadata.responseTime}ms`);
  console.log(`🎯 Reasoning: ${uiResult.metadata.routing.reasoning}\n`);

  // Large Codebase Analysis → Gemini 2.5 Pro (Best for large context)
  console.log('📊 Large Codebase Analysis:');
  const analysisRequest: GenerationRequest = {
    prompt: 'Analyze this codebase architecture and suggest improvements',
    context: {
      codeContext: `// Large codebase context (truncated for demo)
      ${'// '.repeat(1000)} Large codebase with multiple files...`
    },
    task: {
      type: 'analysis',
      complexity: 'enterprise',
      language: 'typescript'
    },
    user: { id: 'demo-user', tier: 'enterprise' },
    options: { priority: 'balanced' }
  };

  const analysisResult = await orchestrator.generateCode(analysisRequest);
  console.log(`✅ Routed to: ${analysisResult.metadata.provider} (${analysisResult.metadata.model})`);
  console.log(`💰 Cost: $${analysisResult.usage.cost.toFixed(4)}`);
  console.log(`⏱️ Time: ${analysisResult.metadata.responseTime}ms`);
  console.log(`🎯 Reasoning: ${analysisResult.metadata.routing.reasoning}\n`);
}

/**
 * Demo 2: Streaming Code Generation
 * Shows real-time code generation with streaming
 */
async function demoStreamingGeneration() {
  console.log('🌊 DEMO 2: Streaming Code Generation\n');
  
  const orchestrator = AIOrchestrator.getInstance();

  const streamRequest: GenerationRequest = {
    prompt: 'Create a complete Express.js API with authentication, CRUD operations, and database integration',
    task: {
      type: 'code-generation',
      complexity: 'complex',
      language: 'typescript',
      framework: 'express'
    },
    user: { id: 'demo-user', tier: 'pro' },
    options: { 
      streaming: true,
      priority: 'balanced',
      maxTokens: 8192
    }
  };

  console.log('🚀 Starting streaming generation...\n');
  process.stdout.write('Generated: ');

  const streamGenerator = orchestrator.generateCodeStream(streamRequest);
  let totalContent = '';

  for await (const chunk of streamGenerator) {
    if ('content' in chunk) {
      // Final result
      const result = chunk as any;
      console.log(`\n\n✅ Streaming Complete!`);
      console.log(`📝 Total Length: ${result.content.length} characters`);
      console.log(`🤖 Provider: ${result.metadata.provider}`);
      console.log(`💰 Cost: $${result.usage.cost.toFixed(4)}`);
      console.log(`⏱️ Total Time: ${result.metadata.responseTime}ms`);
      return result;
    } else {
      // Stream chunk
      totalContent += chunk.delta;
      process.stdout.write('█');
    }
  }
}

/**
 * Demo 3: Cost Optimization
 * Shows how the system optimizes for cost while maintaining quality
 */
async function demoCostOptimization() {
  console.log('\n💰 DEMO 3: Cost Optimization\n');
  
  const orchestrator = AIOrchestrator.getInstance();

  // Same task with different priorities
  const baseRequest: GenerationRequest = {
    prompt: 'Create a simple React component for displaying user profile information',
    task: {
      type: 'ui-components',
      complexity: 'simple',
      language: 'typescript',
      framework: 'react'
    },
    user: { id: 'demo-user', tier: 'free' }
  };

  // Quality priority (expensive but high quality)
  console.log('🏆 Quality Priority:');
  const qualityResult = await orchestrator.generateCode({
    ...baseRequest,
    options: { priority: 'quality' }
  });
  console.log(`Provider: ${qualityResult.metadata.provider} | Cost: $${qualityResult.usage.cost.toFixed(4)} | Quality: ${qualityResult.metadata.quality.score.toFixed(2)}`);

  // Cost priority (cheap but good enough)
  console.log('💸 Cost Priority:');
  const costResult = await orchestrator.generateCode({
    ...baseRequest,
    options: { priority: 'cost' }
  });
  console.log(`Provider: ${costResult.metadata.provider} | Cost: $${costResult.usage.cost.toFixed(4)} | Quality: ${costResult.metadata.quality.score.toFixed(2)}`);

  // Speed priority (fast response)
  console.log('⚡ Speed Priority:');
  const speedResult = await orchestrator.generateCode({
    ...baseRequest,
    options: { priority: 'speed' }
  });
  console.log(`Provider: ${speedResult.metadata.provider} | Time: ${speedResult.metadata.responseTime}ms | Quality: ${speedResult.metadata.quality.score.toFixed(2)}`);

  // Balanced (optimal trade-off)
  console.log('⚖️ Balanced Priority:');
  const balancedResult = await orchestrator.generateCode({
    ...baseRequest,
    options: { priority: 'balanced' }
  });
  console.log(`Provider: ${balancedResult.metadata.provider} | Cost: $${balancedResult.usage.cost.toFixed(4)} | Time: ${balancedResult.metadata.responseTime}ms | Quality: ${balancedResult.metadata.quality.score.toFixed(2)}\n`);
}

/**
 * Demo 4: Fallback and Reliability
 * Shows how the system handles provider failures gracefully
 */
async function demoFallbackReliability() {
  console.log('🛡️ DEMO 4: Fallback and Reliability\n');
  
  const orchestrator = AIOrchestrator.getInstance();

  // Simulate a scenario where primary provider might fail
  const reliabilityRequest: GenerationRequest = {
    prompt: 'Generate a complex machine learning pipeline with data preprocessing, model training, and evaluation',
    task: {
      type: 'code-generation',
      complexity: 'enterprise',
      language: 'python'
    },
    user: { id: 'demo-user', tier: 'enterprise' },
    options: { 
      priority: 'quality',
      maxTokens: 16384
    }
  };

  console.log('🎯 Attempting complex generation with fallback enabled...');
  
  try {
    const result = await orchestrator.generateCode(reliabilityRequest);
    console.log(`✅ Success with ${result.metadata.provider}`);
    console.log(`🔄 Fallback used: ${result.metadata.fallbackUsed ? 'Yes' : 'No'}`);
    console.log(`📊 Quality score: ${result.metadata.quality.score.toFixed(2)}`);
    
    if (result.warnings && result.warnings.length > 0) {
      console.log(`⚠️ Warnings: ${result.warnings.join(', ')}`);
    }
  } catch (error) {
    console.log(`❌ All providers failed: ${error}`);
  }
}

/**
 * Demo 5: Performance Metrics
 * Shows comprehensive metrics and monitoring
 */
async function demoPerformanceMetrics() {
  console.log('\n📊 DEMO 5: Performance Metrics\n');
  
  const orchestrator = AIOrchestrator.getInstance();

  // Generate several requests to build metrics
  const requests = [
    { type: 'code-generation' as const, prompt: 'Create a REST API endpoint' },
    { type: 'security-audit' as const, prompt: 'Review this authentication code' },
    { type: 'ui-components' as const, prompt: 'Build a responsive navigation bar' },
    { type: 'analysis' as const, prompt: 'Analyze performance bottlenecks' },
    { type: 'documentation' as const, prompt: 'Document this API specification' }
  ];

  console.log('🚀 Running multiple requests to gather metrics...');
  
  for (const req of requests) {
    const request: GenerationRequest = {
      prompt: req.prompt,
      task: {
        type: req.type,
        complexity: 'moderate',
        language: 'typescript'
      },
      user: { id: 'demo-user', tier: 'pro' },
      options: { priority: 'balanced' }
    };

    try {
      await orchestrator.generateCode(request);
      process.stdout.write('✅ ');
    } catch (error) {
      process.stdout.write('❌ ');
    }
  }

  console.log('\n\n📈 Performance Metrics:');
  const metrics = orchestrator.getMetrics();
  
  console.log(`Total Requests: ${metrics.totalRequests}`);
  console.log(`Successful Requests: ${metrics.successfulRequests}`);
  console.log(`Failed Requests: ${metrics.failedRequests}`);
  console.log(`Success Rate: ${((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(1)}%`);
  console.log(`Average Response Time: ${metrics.averageResponseTime}ms`);
  console.log(`Total Cost: $${metrics.totalCost.toFixed(4)}`);
  console.log(`Cache Hit Rate: ${(metrics.cacheHitRate * 100).toFixed(1)}%`);
  console.log(`Fallback Rate: ${(metrics.fallbackRate * 100).toFixed(1)}%`);

  console.log('\n🤖 Provider Usage:');
  for (const [provider, count] of metrics.providerUsage) {
    const percentage = ((count / metrics.totalRequests) * 100).toFixed(1);
    console.log(`  ${provider}: ${count} requests (${percentage}%)`);
  }

  console.log('\n🏥 Provider Health:');
  const providerStatus = orchestrator.getProviderStatus();
  for (const [provider, status] of providerStatus) {
    console.log(`  ${provider}: ${status.isHealthy ? '✅ Healthy' : '❌ Unhealthy'} | Response: ${status.responseTime}ms | Error Rate: ${(status.errorRate * 100).toFixed(1)}%`);
  }
}

/**
 * Main demo execution
 */
async function runAllDemos() {
  console.log('🚀 RECODER.XYZ ENHANCED AI SYSTEM DEMO');
  console.log('=====================================\n');
  
  console.log('🔧 Supported Models:');
  console.log('• Claude Sonnet 4 (507B tokens processed, 29% market share)');
  console.log('• Claude Opus 4 (29.1B tokens, premium quality)');
  console.log('• Gemini 2.5 Pro (188B tokens, large context)');
  console.log('• Gemini 2.5 Flash (314B tokens, ultra-fast)');
  console.log('• Groq Llama 3.3 70B (lightning speed)');
  console.log('• DeepSeek V3 (cost-effective excellence)');
  console.log('• Grok 4 (real-time intelligence)');
  console.log('• Kimi K2 (17.4B tokens, #5 on leaderboard)');
  console.log('• Qwen 3 235B (4.71B tokens, #9 on leaderboard)');
  console.log('• DeepSeek R1 (6.82B tokens, #8 on leaderboard, reasoning)\n');

  try {
    await demoIntelligentRouting();
    await demoStreamingGeneration();
    await demoCostOptimization();
    await demoFallbackReliability();
    await demoPerformanceMetrics();

    console.log('\n🎉 All demos completed successfully!');
    console.log('\nKey Benefits Demonstrated:');
    console.log('✅ Intelligent AI routing based on task requirements');
    console.log('✅ Real-time streaming for immediate feedback');
    console.log('✅ Cost optimization without sacrificing quality');
    console.log('✅ Robust fallback handling for reliability');
    console.log('✅ Comprehensive monitoring and metrics');
    console.log('✅ Support for next-generation AI models');

  } catch (error) {
    console.error('\n❌ Demo failed:', error);
  }
}

/**
 * Example usage scenarios
 */
export const usageExamples = {
  // Quick code generation
  quickGeneration: async () => {
    const orchestrator = AIOrchestrator.getInstance(orchestratorConfig);
    
    return orchestrator.generateCode({
      prompt: 'Create a TypeScript function to validate email addresses',
      task: { type: 'code-generation', complexity: 'simple', language: 'typescript' },
      user: { id: 'user123', tier: 'free' },
      options: { priority: 'speed' }
    });
  },

  // Security audit
  securityAudit: async () => {
    const orchestrator = AIOrchestrator.getInstance(orchestratorConfig);
    
    return orchestrator.generateCode({
      prompt: 'Audit this authentication middleware for security vulnerabilities',
      context: { codeContext: 'const authMiddleware = (req, res, next) => { /* code */ }' },
      task: { type: 'security-audit', complexity: 'complex', language: 'javascript' },
      user: { id: 'user123', tier: 'pro' },
      options: { priority: 'quality' }
    });
  },

  // UI component with streaming
  streamingUI: async () => {
    const orchestrator = AIOrchestrator.getInstance(orchestratorConfig);
    
    const generator = orchestrator.generateCodeStream({
      prompt: 'Create a responsive e-commerce product card component',
      task: { type: 'ui-components', complexity: 'moderate', language: 'typescript', framework: 'react' },
      user: { id: 'user123', tier: 'pro' },
      options: { streaming: true, priority: 'balanced' }
    });

    let content = '';
    for await (const chunk of generator) {
      if ('content' in chunk) return chunk;
      content += chunk.delta;
      console.log('Streaming:', chunk.delta);
    }
  }
};

// Run demos if called directly
if (require.main === module) {
  runAllDemos().catch(console.error);
}

export { runAllDemos, orchestratorConfig };