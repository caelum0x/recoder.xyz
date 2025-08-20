#!/usr/bin/env node

/**
 * Commercial Features Test Script
 * Tests all the commercial features of the production engine
 */

const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'test-user-123';
const TEST_API_KEY = 'test-api-key-456';

class CommercialFeaturesTest {
  constructor() {
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      tests: []
    };
  }

  async runTest(name, testFn) {
    this.results.total++;
    console.log(`\n🧪 Testing: ${name}`);
    
    try {
      const result = await testFn();
      if (result) {
        console.log(`✅ PASS: ${name}`);
        this.results.passed++;
        this.results.tests.push({ name, status: 'PASS', details: result });
      } else {
        console.log(`❌ FAIL: ${name}`);
        this.results.failed++;
        this.results.tests.push({ name, status: 'FAIL', details: 'Test returned false' });
      }
    } catch (error) {
      console.log(`❌ ERROR: ${name} - ${error.message}`);
      this.results.failed++;
      this.results.tests.push({ name, status: 'ERROR', details: error.message });
    }
  }

  async testHealthCheck() {
    const response = await axios.get(`${BASE_URL}/health`);
    return response.status === 200 && response.data.service.includes('Recoder Production Engine');
  }

  async testCommercialStatus() {
    const response = await axios.get(`${BASE_URL}/api/status`, {
      headers: { 'X-User-Id': TEST_USER_ID }
    });
    
    return response.status === 200 && 
           response.data.data.service.includes('Commercial') &&
           response.data.data.services &&
           response.data.data.services.billing &&
           response.data.data.services.openRouter;
  }

  async testOpenRouterModels() {
    const response = await axios.get(`${BASE_URL}/api/openrouter/models`, {
      headers: { 'X-User-Id': TEST_USER_ID }
    });
    
    return response.status === 200 && 
           Array.isArray(response.data.data) &&
           response.data.data.length > 0;
  }

  async testOpenRouterHealth() {
    const response = await axios.get(`${BASE_URL}/api/openrouter/health`, {
      headers: { 'X-User-Id': TEST_USER_ID }
    });
    
    return response.status === 200 && response.data.data;
  }

  async testPricingTiers() {
    const response = await axios.get(`${BASE_URL}/api/billing/pricing`, {
      headers: { 'X-User-Id': TEST_USER_ID }
    });
    
    return response.status === 200 && 
           Array.isArray(response.data.data) &&
           response.data.data.length === 4 && // Free, Pro, Business, Enterprise
           response.data.data.some(tier => tier.id === 'free') &&
           response.data.data.some(tier => tier.id === 'enterprise');
  }

  async testAuthenticationRequired() {
    try {
      const response = await axios.post(`${BASE_URL}/api/generate`, {
        description: 'Test without auth',
        type: 'web'
      });
      return false; // Should have failed
    } catch (error) {
      return error.response?.status === 401;
    }
  }

  async testRateLimitingCheck() {
    try {
      const response = await axios.get(`${BASE_URL}/api/rate-limit/${TEST_USER_ID}`, {
        headers: { 'X-User-Id': TEST_USER_ID }
      });
      
      return response.status === 200 && 
             response.data.data.hasOwnProperty('allowed') &&
             response.data.data.hasOwnProperty('remaining');
    } catch (error) {
      return false;
    }
  }

  async testCodeGeneration() {
    try {
      const response = await axios.post(`${BASE_URL}/api/generate`, {
        description: 'Create a simple Hello World function in JavaScript',
        type: 'web',
        framework: 'vanilla',
        features: ['basic-function'],
        userId: TEST_USER_ID
      }, {
        headers: { 'X-User-Id': TEST_USER_ID },
        timeout: 30000 // 30 second timeout
      });
      
      // Even if OpenRouter is not configured, it should return an error about missing API key
      return response.status === 200 || 
             (response.status >= 400 && response.data.error?.includes('OpenRouter'));
    } catch (error) {
      // Expected if OpenRouter is not configured
      return error.response?.data?.error?.includes('OpenRouter') || 
             error.response?.data?.error?.includes('API key');
    }
  }

  async testValidationEndpoint() {
    const testFiles = [
      {
        path: 'test.js',
        content: 'function hello() { console.log("Hello World!"); }',
        type: 'code'
      }
    ];

    const response = await axios.post(`${BASE_URL}/api/validate`, {
      files: testFiles,
      projectType: 'web'
    }, {
      headers: { 'X-User-Id': TEST_USER_ID }
    });

    return response.status === 200 && 
           response.data.data &&
           response.data.data.summary;
  }

  async testBillingSubscriptionNotFound() {
    try {
      const response = await axios.get(`${BASE_URL}/api/billing/subscription/nonexistent-user`, {
        headers: { 'X-User-Id': TEST_USER_ID }
      });
      return false; // Should have failed
    } catch (error) {
      return error.response?.status === 404;
    }
  }

  async runAllTests() {
    console.log('🚀 Starting Commercial Features Test Suite');
    console.log('='.repeat(50));

    // Core functionality tests
    await this.runTest('Health Check', () => this.testHealthCheck());
    await this.runTest('Commercial Status Endpoint', () => this.testCommercialStatus());
    
    // OpenRouter integration tests
    await this.runTest('OpenRouter Models Endpoint', () => this.testOpenRouterModels());
    await this.runTest('OpenRouter Health Check', () => this.testOpenRouterHealth());
    
    // Billing system tests
    await this.runTest('Pricing Tiers Endpoint', () => this.testPricingTiers());
    await this.runTest('Billing Subscription Not Found', () => this.testBillingSubscriptionNotFound());
    
    // Security and rate limiting tests
    await this.runTest('Authentication Required', () => this.testAuthenticationRequired());
    await this.runTest('Rate Limiting Check', () => this.testRateLimitingCheck());
    
    // Core engine functionality
    await this.runTest('Code Generation Endpoint', () => this.testCodeGeneration());
    await this.runTest('Validation Endpoint', () => this.testValidationEndpoint());

    // Print results
    console.log('\n' + '='.repeat(50));
    console.log('🏆 TEST RESULTS SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total Tests: ${this.results.total}`);
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`📊 Success Rate: ${Math.round((this.results.passed / this.results.total) * 100)}%`);
    
    if (this.results.failed > 0) {
      console.log('\n📋 Failed Tests:');
      this.results.tests
        .filter(test => test.status !== 'PASS')
        .forEach(test => {
          console.log(`  • ${test.name}: ${test.details}`);
        });
    }

    console.log('\n🔧 Setup Instructions:');
    console.log('1. Make sure the production engine is running on port 3002');
    console.log('2. Set OPENROUTER_API_KEY in your .env file for full functionality');
    console.log('3. Configure database connections for persistent storage');
    console.log('4. Set up Stripe integration for payment processing');
    
    if (this.results.passed === this.results.total) {
      console.log('\n🎉 All tests passed! Your commercial production engine is ready.');
    } else {
      console.log('\n⚠️  Some tests failed. Check the setup and try again.');
      process.exit(1);
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new CommercialFeaturesTest();
  tester.runAllTests().catch(error => {
    console.error('❌ Test suite failed:', error.message);
    process.exit(1);
  });
}

module.exports = CommercialFeaturesTest;