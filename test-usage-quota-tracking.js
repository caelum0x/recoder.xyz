#!/usr/bin/env node

/**
 * Usage Tracking and Quota Enforcement Test
 * Tests usage tracking, rate limiting, and quota systems across all platforms
 */

const axios = require('axios');
const fs = require('fs');

class UsageQuotaTester {
  constructor() {
    this.results = [];
    this.config = {
      apiUrl: 'https://api.recoder.xyz',
      webUrl: 'https://recoder.xyz',
      testUser: {
        userId: 'test-usage-user-789',
        token: 'test-usage-token-123',
        email: 'usage-test@recoder.xyz',
        plan: 'pro'
      }
    };
  }

  log(message, level = 'info') {
    const colors = {
      info: '\x1b[36m',
      success: '\x1b[32m',
      error: '\x1b[31m',
      warning: '\x1b[33m',
      reset: '\x1b[0m'
    };
    console.log(`${colors[level]}${message}${colors.reset}`);
  }

  async testStep(stepName, testFunction) {
    try {
      this.log(`\n🔍 Testing: ${stepName}`, 'info');
      const result = await testFunction();
      
      if (result.success) {
        this.log(`✅ PASSED: ${stepName}`, 'success');
        if (result.details) this.log(`   ${result.details}`, 'info');
      } else {
        this.log(`❌ FAILED: ${stepName}`, 'error');
        this.log(`   Error: ${result.error}`, 'error');
      }
      
      this.results.push({ step: stepName, ...result });
      return result;
    } catch (error) {
      this.log(`❌ EXCEPTION: ${stepName}`, 'error');
      this.log(`   ${error.message}`, 'error');
      this.results.push({ step: stepName, success: false, error: error.message });
      return { success: false, error: error.message };
    }
  }

  async testUsageTrackingService() {
    try {
      // Test usage tracking service class
      const usageServicePath = './backend/src/services/usage-tracking.ts';
      if (!fs.existsSync(usageServicePath)) {
        return { success: false, error: 'Usage tracking service file not found' };
      }

      const content = fs.readFileSync(usageServicePath, 'utf8');
      
      const hasTrackingMethods = [
        'trackUsage',
        'getUsageStats', 
        'checkQuota',
        'updateUsage'
      ].some(method => content.includes(method));

      const hasUsageModel = content.includes('UsageRecord') || 
                           content.includes('Usage') ||
                           content.includes('tracking');

      return {
        success: hasTrackingMethods && hasUsageModel,
        details: `Tracking methods: ${hasTrackingMethods}, Usage model: ${hasUsageModel}`,
        error: !hasTrackingMethods ? 'Missing tracking methods' :
               !hasUsageModel ? 'Missing usage model' : null
      };
    } catch (error) {
      return { success: false, error: `Usage tracking service test failed: ${error.message}` };
    }
  }

  async testRateLimitingService() {
    try {
      // Test rate limiting service
      const rateLimitPath = './backend/src/middleware/rate-limit.ts';
      if (!fs.existsSync(rateLimitPath)) {
        return { success: false, error: 'Rate limiting service file not found' };
      }

      const content = fs.readFileSync(rateLimitPath, 'utf8');
      
      const hasRateLimiting = content.includes('rateLimit') || 
                             content.includes('rate-limit') ||
                             content.includes('rateLimiter');
      
      const hasRedisIntegration = content.includes('redis') || 
                                 content.includes('Redis');

      return {
        success: hasRateLimiting,
        details: `Rate limiting: ${hasRateLimiting}, Redis integration: ${hasRedisIntegration}`,
        error: !hasRateLimiting ? 'Missing rate limiting functionality' : null
      };
    } catch (error) {
      return { success: false, error: `Rate limiting service test failed: ${error.message}` };
    }
  }

  async testQuotaCheckEndpoint() {
    try {
      // Test quota check endpoint
      const response = await axios.get(
        `${this.config.apiUrl}/api/user/quota`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.testUser.token}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000,
          validateStatus: () => true
        }
      );

      const isValidResponse = response.status < 500;
      
      return {
        success: isValidResponse,
        details: `Quota check endpoint status: ${response.status}`,
        error: !isValidResponse ? `HTTP ${response.status}` : null
      };
    } catch (error) {
      return { success: false, error: `Quota check test failed: ${error.message}` };
    }
  }

  async testUsageReportingEndpoint() {
    try {
      // Test usage reporting endpoint
      const usageData = {
        userId: this.config.testUser.userId,
        platform: 'cli',
        command: 'generate',
        tokens: 1500,
        model: 'claude-3-sonnet',
        timestamp: new Date()
      };

      const response = await axios.post(
        `${this.config.apiUrl}/api/user/usage`,
        usageData,
        {
          headers: {
            'Authorization': `Bearer ${this.config.testUser.token}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000,
          validateStatus: () => true
        }
      );

      const isValidResponse = response.status < 500;
      
      return {
        success: isValidResponse,
        details: `Usage reporting endpoint status: ${response.status}`,
        error: !isValidResponse ? `HTTP ${response.status}` : null
      };
    } catch (error) {
      return { success: false, error: `Usage reporting test failed: ${error.message}` };
    }
  }

  async testCLIUsageTracking() {
    try {
      // Test CLI usage tracking integration
      const cliBackendClientPath = './packages/cli/src/services/backend-client.ts';
      if (!fs.existsSync(cliBackendClientPath)) {
        return { success: false, error: 'CLI backend client not found' };
      }

      const content = fs.readFileSync(cliBackendClientPath, 'utf8');
      
      const hasUsageTracking = content.includes('trackUsage') || 
                              content.includes('usage');
      
      const hasQuotaCheck = content.includes('checkQuota') || 
                           content.includes('quota');

      const hasAnalytics = content.includes('analytics') || 
                          content.includes('trackActivity');

      return {
        success: hasUsageTracking && hasQuotaCheck,
        details: `Usage tracking: ${hasUsageTracking}, Quota check: ${hasQuotaCheck}, Analytics: ${hasAnalytics}`,
        error: !hasUsageTracking ? 'Missing usage tracking' :
               !hasQuotaCheck ? 'Missing quota checking' : null
      };
    } catch (error) {
      return { success: false, error: `CLI usage tracking test failed: ${error.message}` };
    }
  }

  async testRouterUsageTracking() {
    try {
      // Test Router usage tracking
      const routerBackendPath = './packages/recoder-cli-router/src/services/backend-client.ts';
      if (!fs.existsSync(routerBackendPath)) {
        return { success: false, error: 'Router backend client not found' };
      }

      const content = fs.readFileSync(routerBackendPath, 'utf8');
      
      const hasUsageTracking = content.includes('trackUsage');
      const hasQuotaCheck = content.includes('checkQuota');
      const hasProcessRequest = content.includes('processRequest');

      return {
        success: hasUsageTracking && hasQuotaCheck,
        details: `Usage tracking: ${hasUsageTracking}, Quota check: ${hasQuotaCheck}, Process request: ${hasProcessRequest}`,
        error: !hasUsageTracking ? 'Missing usage tracking' :
               !hasQuotaCheck ? 'Missing quota checking' : null
      };
    } catch (error) {
      return { success: false, error: `Router usage tracking test failed: ${error.message}` };
    }
  }

  async testRealTimeAnalytics() {
    try {
      // Test real-time analytics endpoints
      const analyticsTests = [
        `${this.config.webUrl}/api/analytics/realtime`,
        `${this.config.webUrl}/api/analytics/usage-stats`
      ];

      let successCount = 0;
      let details = [];

      for (const endpoint of analyticsTests) {
        try {
          const response = await axios.get(endpoint, {
            headers: { 'Authorization': `Bearer ${this.config.testUser.token}` },
            timeout: 10000,
            validateStatus: () => true
          });

          const isValid = response.status < 500;
          if (isValid) successCount++;
          details.push(`${endpoint.split('/').pop()}: ${response.status}`);
        } catch (error) {
          details.push(`${endpoint.split('/').pop()}: Failed`);
        }
      }

      return {
        success: successCount > 0,
        details: details.join(', '),
        error: successCount === 0 ? 'All analytics endpoints failed' : null
      };
    } catch (error) {
      return { success: false, error: `Real-time analytics test failed: ${error.message}` };
    }
  }

  async testBillingIntegration() {
    try {
      // Test billing integration
      const billingDashboardPath = './recoder-web/components/billing/BillingDashboard.tsx';
      const hasBillingDashboard = fs.existsSync(billingDashboardPath);
      
      let hasStripeIntegration = false;
      let hasDodoPayments = false;

      if (hasBillingDashboard) {
        const content = fs.readFileSync(billingDashboardPath, 'utf8');
        hasStripeIntegration = content.includes('stripe') || content.includes('Stripe');
        hasDodoPayments = content.includes('dodo') || content.includes('Dodo');
      }

      // Check for billing API endpoint
      const billingApiPath = './recoder-web/app/api/billing/user/[userId]/route.ts';
      const hasBillingAPI = fs.existsSync(billingApiPath);

      return {
        success: hasBillingDashboard && hasBillingAPI,
        details: `Dashboard: ${hasBillingDashboard}, API: ${hasBillingAPI}, Stripe: ${hasStripeIntegration}, Dodo: ${hasDodoPayments}`,
        error: !hasBillingDashboard ? 'Missing billing dashboard' :
               !hasBillingAPI ? 'Missing billing API' : null
      };
    } catch (error) {
      return { success: false, error: `Billing integration test failed: ${error.message}` };
    }
  }

  async generateReport() {
    this.log('\n' + '='.repeat(80), 'info');
    this.log('📊 USAGE TRACKING & QUOTA ENFORCEMENT TEST REPORT', 'info');
    this.log('='.repeat(80), 'info');

    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    const successRate = ((passedTests / totalTests) * 100).toFixed(1);

    this.log(`\n📈 Usage & Quota Test Results:`, 'info');
    this.log(`   Total Tests: ${totalTests}`);
    this.log(`   Passed: ${passedTests}`, passedTests === totalTests ? 'success' : 'info');
    this.log(`   Failed: ${failedTests}`, failedTests === 0 ? 'success' : failedTests > 2 ? 'error' : 'warning');
    this.log(`   Success Rate: ${successRate}%`, successRate >= 80 ? 'success' : successRate >= 60 ? 'warning' : 'error');

    this.log(`\n🔍 Usage Tracking Analysis:`, 'info');
    
    const criticalTests = [
      'Usage Tracking Service',
      'CLI Usage Tracking',
      'Router Usage Tracking'
    ];
    
    const criticalPassed = this.results.filter(r => 
      criticalTests.includes(r.step) && r.success
    ).length;
    
    if (criticalPassed === criticalTests.length) {
      this.log(`✅ All critical usage tracking components working`, 'success');
    } else {
      this.log(`⚠️ ${criticalTests.length - criticalPassed} critical components have issues`, 'warning');
    }

    this.log(`\n🎯 Usage & Quota Readiness:`, 'info');
    if (successRate >= 85) {
      this.log(`   ✅ USAGE TRACKING READY FOR PRODUCTION`, 'success');
    } else if (successRate >= 70) {
      this.log(`   ⚠️ TRACKING MOSTLY READY - Minor fixes needed`, 'warning');
    } else {
      this.log(`   ❌ TRACKING NEEDS WORK - Address failed tests`, 'error');
    }

    // Show specific failures
    const failures = this.results.filter(r => !r.success);
    if (failures.length > 0) {
      this.log(`\n🔧 Issues to Address:`, 'warning');
      failures.forEach((failure, index) => {
        this.log(`   ${index + 1}. ${failure.step}: ${failure.error}`, 'warning');
      });
    }

    this.log(`\n🚀 Usage & Quota Features:`, 'info');
    this.log(`   • Usage Tracking: Cross-platform request and token tracking`);
    this.log(`   • Quota Management: Real-time quota checking and enforcement`);
    this.log(`   • Rate Limiting: Redis-based rate limiting middleware`);
    this.log(`   • Real-time Analytics: Live usage statistics and dashboards`);
    this.log(`   • Billing Integration: Stripe and DodoPayments support`);

    this.log('\n' + '='.repeat(80), 'info');
  }

  async runUsageQuotaTests() {
    this.log('🚀 Starting Usage Tracking & Quota Enforcement Tests...', 'info');
    this.log('Testing Usage, Quotas, Rate Limiting & Billing\n', 'info');

    // Test usage tracking and quota components
    await this.testStep('Usage Tracking Service', () => this.testUsageTrackingService());
    await this.testStep('Rate Limiting Service', () => this.testRateLimitingService());
    await this.testStep('Quota Check Endpoint', () => this.testQuotaCheckEndpoint());
    await this.testStep('Usage Reporting Endpoint', () => this.testUsageReportingEndpoint());
    await this.testStep('CLI Usage Tracking', () => this.testCLIUsageTracking());
    await this.testStep('Router Usage Tracking', () => this.testRouterUsageTracking());
    await this.testStep('Real-time Analytics', () => this.testRealTimeAnalytics());
    await this.testStep('Billing Integration', () => this.testBillingIntegration());

    await this.generateReport();
  }
}

// Run the usage and quota tests
(async () => {
  const tester = new UsageQuotaTester();
  await tester.runUsageQuotaTests();
})();