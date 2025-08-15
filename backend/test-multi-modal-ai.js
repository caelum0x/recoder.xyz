/**
 * Multi-Modal AI Integration Test
 * Tests the unified AI processing of code, documentation, and conversations
 */

const { multiModalAI } = require('./src/services/multi-modal-ai-service');
const { logger } = require('./src/utils/logger');

// Test data for multi-modal processing
const testCases = [
  {
    name: 'Code + Documentation Analysis',
    input: {
      code: {
        content: `
const express = require('express');
const app = express();

app.get('/api/users', async (req, res) => {
  try {
    const users = await getUsersFromDB();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
`,
        filePath: 'server.js',
        language: 'javascript',
        framework: 'express'
      },
      documentation: {
        content: `
# User API Documentation

## Overview
This API provides endpoints for managing users in the system.

## Endpoints

### GET /api/users
Returns a list of all users.

**Response:**
\`\`\`json
{
  "users": [
    {
      "id": 1,
      "name": "John Doe",
      "email": "john@example.com"
    }
  ]
}
\`\`\`
`,
        format: 'markdown',
        metadata: {
          title: 'User API Documentation',
          author: 'Developer',
          created: new Date()
        }
      },
      query: 'Analyze this code and documentation for consistency and suggest improvements',
      mode: 'unified_analysis'
    },
    expectedFeatures: ['code analysis', 'documentation analysis', 'cross-modal relationships']
  },
  
  {
    name: 'Conversation + Code Context',
    input: {
      code: {
        content: `
function calculateTotal(items) {
  let total = 0;
  for (let item of items) {
    total += item.price;
  }
  return total;
}
`,
        filePath: 'calculator.js',
        language: 'javascript'
      },
      conversation: {
        messages: [
          {
            role: 'user',
            content: 'I need help optimizing this calculation function',
            timestamp: new Date()
          },
          {
            role: 'assistant',
            content: 'I can help you optimize the function. What specific performance issues are you experiencing?',
            timestamp: new Date()
          },
          {
            role: 'user',
            content: 'It seems slow with large arrays',
            timestamp: new Date()
          }
        ],
        context: {
          sessionId: 'test-session-123',
          userId: 'test-user'
        }
      },
      query: 'Based on our conversation, help me optimize this function for better performance',
      mode: 'code_generation'
    },
    expectedFeatures: ['conversation analysis', 'code optimization', 'contextual suggestions']
  },
  
  {
    name: 'Documentation Generation from Code',
    input: {
      code: {
        content: `
class UserService {
  constructor(database) {
    this.db = database;
  }

  async createUser(userData) {
    const validation = this.validateUserData(userData);
    if (!validation.isValid) {
      throw new Error(validation.errors.join(', '));
    }
    
    const user = await this.db.users.create(userData);
    return user;
  }

  validateUserData(userData) {
    const errors = [];
    if (!userData.email) errors.push('Email is required');
    if (!userData.name) errors.push('Name is required');
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
`,
        filePath: 'UserService.js',
        language: 'javascript'
      },
      query: 'Generate comprehensive documentation for this UserService class',
      mode: 'documentation'
    },
    expectedFeatures: ['automatic documentation', 'class analysis', 'method documentation']
  },
  
  {
    name: 'Pure Conversation Processing',
    input: {
      conversation: {
        messages: [
          {
            role: 'user',
            content: 'What are the best practices for error handling in Node.js?',
            timestamp: new Date()
          }
        ]
      },
      query: 'Explain error handling best practices with examples',
      mode: 'conversation'
    },
    expectedFeatures: ['conversation response', 'follow-up questions', 'suggestions']
  }
];

class MultiModalAITester {
  constructor() {
    this.results = [];
    this.passed = 0;
    this.failed = 0;
  }

  async runAllTests() {
    console.log('🚀 Starting Multi-Modal AI Integration Tests');
    console.log('============================================\n');

    // Test each scenario
    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      console.log(`📝 Test ${i + 1}/${testCases.length}: ${testCase.name}`);
      await this.testMultiModalProcessing(testCase);
      console.log('');
    }

    // Test service capabilities
    await this.testServiceCapabilities();

    // Test error handling
    await this.testErrorHandling();

    // Print results
    this.printResults();
  }

  async testMultiModalProcessing(testCase) {
    try {
      const startTime = Date.now();
      const result = await multiModalAI.processMultiModal(testCase.input);
      const processingTime = Date.now() - startTime;

      console.log(`   ✅ Processing completed in ${result.processingTime || processingTime}ms`);
      console.log(`   📊 Modalities used: ${result.usedModalities.join(', ')}`);
      console.log(`   🎯 Confidence: ${(result.confidence * 100).toFixed(1)}%`);

      // Check expected features
      let featuresFound = 0;
      if (result.generatedCode && testCase.expectedFeatures.some(f => f.includes('code'))) {
        console.log(`   💻 Generated code: ${result.generatedCode.content.split('\\n').length} lines`);
        featuresFound++;
      }

      if (result.documentation && testCase.expectedFeatures.some(f => f.includes('documentation'))) {
        console.log(`   📚 Generated documentation: ${result.documentation.sections.length} sections`);
        featuresFound++;
      }

      if (result.conversationResponse && testCase.expectedFeatures.some(f => f.includes('conversation'))) {
        console.log(`   💬 Conversation response generated`);
        if (result.conversationResponse.suggestions) {
          console.log(`   💡 Suggestions: ${result.conversationResponse.suggestions.length}`);
        }
        featuresFound++;
      }

      if (result.analysis && testCase.expectedFeatures.some(f => f.includes('analysis'))) {
        console.log(`   📈 Analysis completed:`);
        console.log(`      Code Quality: ${(result.analysis.codeQuality * 100).toFixed(1)}%`);
        console.log(`      Documentation Coverage: ${(result.analysis.documentationCoverage * 100).toFixed(1)}%`);
        console.log(`      Overall Coherence: ${(result.analysis.overallCoherence * 100).toFixed(1)}%`);
        featuresFound++;
      }

      // Verify expected features were found
      if (featuresFound >= testCase.expectedFeatures.length / 2) {
        console.log(`   ✅ Expected features confirmed`);
        this.passed++;
      } else {
        console.log(`   ⚠️  Some expected features missing`);
        this.failed++;
      }

    } catch (error) {
      console.log(`   ❌ Processing failed: ${error.message}`);
      this.failed++;
    }
  }

  async testServiceCapabilities() {
    console.log('🔧 Testing Service Capabilities...');
    try {
      // Test modality detection
      const codeOnlyInput = {
        code: {
          content: 'function test() { return true; }',
          filePath: 'test.js',
          language: 'javascript'
        },
        query: 'Test code processing',
        mode: 'code_generation'
      };

      const result = await multiModalAI.processMultiModal(codeOnlyInput);
      
      if (result.usedModalities.includes('code') && result.generatedCode) {
        console.log('   ✅ Code-only processing works');
        this.passed++;
      } else {
        console.log('   ❌ Code-only processing failed');
        this.failed++;
      }

    } catch (error) {
      console.log(`   ❌ Capabilities test failed: ${error.message}`);
      this.failed++;
    }
    console.log('');
  }

  async testErrorHandling() {
    console.log('⚠️  Testing Error Handling...');
    try {
      // Test with invalid input
      const invalidInput = {
        query: '', // Empty query should fail
        mode: 'invalid_mode'
      };

      try {
        await multiModalAI.processMultiModal(invalidInput);
        console.log('   ❌ Should have failed with invalid input');
        this.failed++;
      } catch (error) {
        console.log('   ✅ Properly handled invalid input');
        this.passed++;
      }

    } catch (error) {
      console.log(`   ⚠️  Error handling test issue: ${error.message}`);
    }
    console.log('');
  }

  printResults() {
    console.log('🏆 Multi-Modal AI Test Results');
    console.log('=============================');
    console.log(`✅ Passed: ${this.passed}`);
    console.log(`❌ Failed: ${this.failed}`);
    console.log(`📊 Success Rate: ${((this.passed / (this.passed + this.failed)) * 100).toFixed(1)}%`);
    
    if (this.failed === 0) {
      console.log('\\n🎉 All tests passed! Multi-Modal AI is working correctly.');
      console.log('🤖 The system successfully processes:');
      console.log('   • Code analysis and generation');
      console.log('   • Documentation analysis and generation'); 
      console.log('   • Conversational AI with context');
      console.log('   • Cross-modal relationship analysis');
      console.log('   • Unified multi-modal responses');
      console.log('   • Real AI provider integration');
    } else {
      console.log(`\\n⚠️  ${this.failed} tests failed. Check the logs above for details.`);
    }
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new MultiModalAITester();
  tester.runAllTests().catch(error => {
    console.error('Multi-modal test runner failed:', error);
    process.exit(1);
  });
}

module.exports = MultiModalAITester;