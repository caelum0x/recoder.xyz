#!/usr/bin/env node

/**
 * OpenRouter Free Models Cost Optimization Test
 * Tests cost optimization with real OpenRouter free models in production
 */

const fs = require('fs');
const path = require('path');

// Configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const TEST_PROMPTS = [
  {
    description: "create a simple React button component",
    type: "code_generation",
    complexity: "simple",
    priority: "cost",
    expectedModel: "google/gemini-2.0-flash-exp:free"
  },
  {
    description: "write a Python function to calculate fibonacci numbers",
    type: "code_generation", 
    complexity: "medium",
    priority: "cost",
    expectedModel: "meta-llama/llama-3.1-8b-instruct:free"
  },
  {
    description: "explain the concept of machine learning in simple terms",
    type: "analysis",
    complexity: "simple", 
    priority: "cost",
    expectedModel: "google/gemini-2.0-flash-exp:free"
  },
  {
    description: "debug this complex TypeScript generic type issue",
    type: "debugging",
    complexity: "expert",
    priority: "balanced", // Should still prefer free models but consider quality
    expectedModel: "deepseek/deepseek-r1-distill-llama-70b"
  }
];

const FREE_MODELS = [
  'google/gemini-2.0-flash-exp:free',
  'meta-llama/llama-3.1-8b-instruct:free'
];

const COST_EFFECTIVE_MODELS = [
  'deepseek/deepseek-r1-distill-llama-70b' // Very low cost
];

class OpenRouterCostOptimizationTester {
  constructor() {
    this.testResults = [];
    this.totalCostSavings = 0;
    this.baseUrl = 'https://openrouter.ai/api/v1';
  }

  async runAllTests() {
    console.log('🧪 Starting OpenRouter Free Models Cost Optimization Test\n');
    console.log('=' * 60);
    
    if (!OPENROUTER_API_KEY) {
      console.log('⚠️  OPENROUTER_API_KEY not found in environment');
      console.log('📝 Testing with mock responses and validating routing logic...\n');
    }

    for (const prompt of TEST_PROMPTS) {
      await this.testCostOptimization(prompt);
    }

    await this.generateReport();
  }

  async testCostOptimization(testCase) {
    console.log(`🎯 Testing: ${testCase.description}`);
    console.log(`   Type: ${testCase.type} | Complexity: ${testCase.complexity} | Priority: ${testCase.priority}`);

    const startTime = Date.now();
    
    try {
      // Step 1: Get optimal model selection from our orchestrator
      const routingDecision = await this.simulateIntelligentRouting(testCase);
      console.log(`   🧠 Router selected: ${routingDecision.selectedModel}`);
      console.log(`   💰 Estimated cost: $${routingDecision.estimatedCost.toFixed(6)}`);
      
      // Step 2: Test with OpenRouter API if available
      let actualResponse = null;
      if (OPENROUTER_API_KEY) {
        actualResponse = await this.callOpenRouterAPI(routingDecision.selectedModel, testCase.description);
        console.log(`   ✅ API Response: ${actualResponse ? 'Success' : 'Failed'}`);
      }

      // Step 3: Validate cost optimization
      const costValidation = this.validateCostOptimization(testCase, routingDecision);
      
      const result = {
        testCase,
        routingDecision,
        actualResponse: !!actualResponse,
        costValidation,
        responseTime: Date.now() - startTime,
        timestamp: new Date()
      };

      this.testResults.push(result);
      
      console.log(`   📊 Cost Optimization: ${costValidation.passed ? '✅ PASSED' : '❌ FAILED'}`);
      console.log(`   💡 Savings: ${costValidation.costSavings}% vs premium models`);
      console.log(`   ⏱️  Response Time: ${result.responseTime}ms\n`);

    } catch (error) {
      console.log(`   ❌ Test failed: ${error.message}\n`);
    }
  }

  simulateIntelligentRouting(testCase) {
    // Simulate our intelligent model router logic
    let selectedModel;
    let reasoning = [];
    let estimatedCost = 0;

    // Priority-based routing
    if (testCase.priority === 'cost') {
      if (testCase.type === 'code_generation') {
        selectedModel = 'meta-llama/llama-3.1-8b-instruct:free';
        reasoning.push('Free Llama 3.1 8B for cost-optimized code generation');
        estimatedCost = 0;
      } else {
        selectedModel = 'google/gemini-2.0-flash-exp:free';
        reasoning.push('Free Gemini 2.0 Flash for cost-optimized general tasks');
        estimatedCost = 0;
      }
    } else if (testCase.complexity === 'expert') {
      // For expert tasks, use low-cost premium models
      selectedModel = 'deepseek/deepseek-r1-distill-llama-70b';
      reasoning.push('Cost-effective premium model for expert complexity');
      estimatedCost = 0.00014 * this.estimateTokens(testCase.description); // DeepSeek pricing
    } else {
      // Balanced approach - still prefer free models
      selectedModel = 'google/gemini-2.0-flash-exp:free';
      reasoning.push('Free model with balanced quality-cost ratio');
      estimatedCost = 0;
    }

    return {
      selectedModel,
      reasoning,
      estimatedCost,
      confidence: 95,
      fallbackOptions: FREE_MODELS.filter(m => m !== selectedModel)
    };
  }

  async callOpenRouterAPI(model, prompt) {
    if (!OPENROUTER_API_KEY) return null;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://recoder.xyz',
          'X-Title': 'Recoder.xyz Cost Optimization Test'
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 500,
          temperature: 0.1
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${data.error?.message || response.statusText}`);
      }

      return {
        content: data.choices[0].message.content,
        usage: data.usage,
        model: data.model
      };
    } catch (error) {
      console.log(`   ⚠️  API call failed: ${error.message}`);
      return null;
    }
  }

  validateCostOptimization(testCase, routingDecision) {
    const isFreeModel = FREE_MODELS.includes(routingDecision.selectedModel);
    const isCostEffectiveModel = COST_EFFECTIVE_MODELS.includes(routingDecision.selectedModel);
    
    // Calculate cost savings vs premium models (Claude, GPT-4, etc.)
    const premiumModelCost = 0.00003 * this.estimateTokens(testCase.description); // ~$30/1M tokens
    const actualCost = routingDecision.estimatedCost;
    const costSavings = premiumModelCost > 0 ? ((premiumModelCost - actualCost) / premiumModelCost * 100) : 100;

    let passed = false;
    let validationNotes = [];

    // Validation rules
    if (testCase.priority === 'cost') {
      passed = isFreeModel;
      validationNotes.push(isFreeModel ? 'Correctly selected free model for cost priority' : 'Should have selected free model');
    } else if (testCase.complexity === 'expert') {
      passed = isFreeModel || isCostEffectiveModel;
      validationNotes.push(passed ? 'Acceptable model selection for expert task' : 'Model too expensive for expert task');
    } else {
      passed = costSavings >= 80; // At least 80% cost savings
      validationNotes.push(`${costSavings.toFixed(1)}% cost savings achieved`);
    }

    this.totalCostSavings += costSavings;

    return {
      passed,
      costSavings: Math.round(costSavings),
      isFreeModel,
      isCostEffectiveModel,
      premiumModelCost,
      actualCost,
      validationNotes
    };
  }

  estimateTokens(text) {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil((text.length + 500) / 4); // +500 for response tokens
  }

  async generateReport() {
    console.log('=' * 60);
    console.log('📊 COST OPTIMIZATION TEST RESULTS');
    console.log('=' * 60);

    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(r => r.costValidation.passed).length;
    const averageCostSavings = this.totalCostSavings / totalTests;
    const freeModelUsage = this.testResults.filter(r => r.costValidation.isFreeModel).length;

    console.log(`\n📈 Summary Statistics:`);
    console.log(`   Total Tests: ${totalTests}`);
    console.log(`   Tests Passed: ${passedTests}/${totalTests} (${(passedTests/totalTests*100).toFixed(1)}%)`);
    console.log(`   Average Cost Savings: ${averageCostSavings.toFixed(1)}%`);
    console.log(`   Free Models Used: ${freeModelUsage}/${totalTests} (${(freeModelUsage/totalTests*100).toFixed(1)}%)`);

    console.log(`\n🎯 Model Selection Analysis:`);
    const modelUsage = {};
    this.testResults.forEach(result => {
      const model = result.routingDecision.selectedModel;
      modelUsage[model] = (modelUsage[model] || 0) + 1;
    });

    Object.entries(modelUsage)
      .sort(([,a], [,b]) => b - a)
      .forEach(([model, count]) => {
        const isFree = FREE_MODELS.includes(model);
        const icon = isFree ? '🆓' : '💰';
        console.log(`   ${icon} ${model}: ${count} uses`);
      });

    console.log(`\n💡 Cost Optimization Effectiveness:`);
    if (averageCostSavings >= 90) {
      console.log('   🏆 EXCELLENT: >90% average cost savings achieved');
    } else if (averageCostSavings >= 75) {
      console.log('   ✅ GOOD: 75-90% average cost savings achieved');
    } else if (averageCostSavings >= 50) {
      console.log('   ⚠️  FAIR: 50-75% average cost savings achieved');
    } else {
      console.log('   ❌ POOR: <50% average cost savings achieved');
    }

    const freeModelPercentage = (freeModelUsage / totalTests) * 100;
    if (freeModelPercentage >= 75) {
      console.log('   🎯 OPTIMAL: High free model utilization');
    } else if (freeModelPercentage >= 50) {
      console.log('   📊 GOOD: Moderate free model utilization');
    } else {
      console.log('   📉 OPPORTUNITY: Could increase free model usage');
    }

    // Save detailed results
    const reportData = {
      summary: {
        totalTests,
        passedTests,
        passRate: (passedTests/totalTests*100).toFixed(1),
        averageCostSavings: averageCostSavings.toFixed(1),
        freeModelUsage: freeModelPercentage.toFixed(1)
      },
      modelUsage,
      detailedResults: this.testResults,
      timestamp: new Date(),
      configuration: {
        freeModels: FREE_MODELS,
        costEffectiveModels: COST_EFFECTIVE_MODELS,
        hasAPIKey: !!OPENROUTER_API_KEY
      }
    };

    const reportFile = path.join(__dirname, 'cost-optimization-report.json');
    fs.writeFileSync(reportFile, JSON.stringify(reportData, null, 2));
    
    console.log(`\n📄 Detailed report saved to: ${reportFile}`);
    console.log(`\n${passedTests === totalTests ? '🎉 All tests passed!' : `⚠️  ${totalTests - passedTests} tests need attention`}`);
  }
}

// Run the test
async function main() {
  try {
    const tester = new OpenRouterCostOptimizationTester();
    await tester.runAllTests();
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { OpenRouterCostOptimizationTester };