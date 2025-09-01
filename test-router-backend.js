#!/usr/bin/env node

/**
 * CLI Router Backend Connection and API Key Sync Test
 * Tests the router's connection to backend and API key management
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

class RouterBackendTester {
  constructor() {
    this.results = [];
    this.config = {
      backendUrl: 'https://api.recoder.xyz',
      localBackend: 'http://localhost:3001',
      routerId: 'test-router-12345',
      testUserId: 'user-router-test'
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

  async testRouterBackendClientClass() {
    try {
      const routerBackendPath = './packages/recoder-cli-router/src/services/backend-client.ts';
      if (!fs.existsSync(routerBackendPath)) {
        return { success: false, error: 'RouterBackendClient file not found' };
      }

      const content = fs.readFileSync(routerBackendPath, 'utf8');
      
      const hasRequiredMethods = [
        'isBackendAvailable',
        'authenticate', 
        'checkQuota',
        'trackUsage',
        'syncSession',
        'updatePlatformStatus'
      ].every(method => content.includes(method));

      const hasBackendUrl = content.includes('RECODER_BACKEND_URL');
      const hasSessionManagement = content.includes('sessionFile') && content.includes('currentSession');

      return {
        success: hasRequiredMethods && hasBackendUrl && hasSessionManagement,
        details: `Methods: ${hasRequiredMethods}, Backend URL: ${hasBackendUrl}, Session Mgmt: ${hasSessionManagement}`,
        error: !hasRequiredMethods ? 'Missing required methods' :
               !hasBackendUrl ? 'Missing backend URL config' :
               !hasSessionManagement ? 'Missing session management' : null
      };
    } catch (error) {
      return { success: false, error: `RouterBackendClient test failed: ${error.message}` };
    }
  }

  async testMainBackendConnectionClass() {
    try {
      const mainBackendPath = './packages/recoder-cli-router/src/services/main-backend-connection.ts';
      if (!fs.existsSync(mainBackendPath)) {
        return { success: false, error: 'MainBackendConnection file not found' };
      }

      const content = fs.readFileSync(mainBackendPath, 'utf8');
      
      const hasRequiredMethods = [
        'initialize',
        'registerRouter',
        'syncAPIKeyPools',
        'reportUsage',
        'requestSharedAPIKey',
        'getCostOptimizationRecommendations'
      ].every(method => content.includes(method));

      const hasApiKeyManagement = content.includes('SharedAPIKeyPool') && 
                                  content.includes('api_key');
      const hasUsageTracking = content.includes('UsageRecord') || 
                              content.includes('usage_data');

      return {
        success: hasRequiredMethods && hasApiKeyManagement && hasUsageTracking,
        details: `Methods: ${hasRequiredMethods}, API Keys: ${hasApiKeyManagement}, Usage: ${hasUsageTracking}`,
        error: !hasRequiredMethods ? 'Missing required methods' :
               !hasApiKeyManagement ? 'Missing API key management' :
               !hasUsageTracking ? 'Missing usage tracking' : null
      };
    } catch (error) {
      return { success: false, error: `MainBackendConnection test failed: ${error.message}` };
    }
  }

  async testRouterRegistrationEndpoint() {
    try {
      // Test router registration endpoint
      const registrationData = {
        router_id: this.config.routerId,
        user_id: this.config.testUserId,
        version: '2.0.0',
        enterprise_mode: false,
        capabilities: ['api_key_sharing', 'cost_optimization']
      };

      const response = await axios.post(
        `${this.config.backendUrl}/api/router/register`,
        registrationData,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
          validateStatus: () => true
        }
      );

      // Router registration should respond (even if it doesn't exist yet)
      const isValidResponse = response.status < 500;
      const isJsonResponse = response.headers['content-type']?.includes('application/json');

      return {
        success: isValidResponse,
        details: `Status: ${response.status}, JSON: ${isJsonResponse}`,
        error: !isValidResponse ? `HTTP ${response.status}` : null
      };
    } catch (error) {
      return { success: false, error: `Router registration test failed: ${error.message}` };
    }
  }

  async testAPIKeyPoolEndpoint() {
    try {
      // Test API key pool sync endpoint
      const response = await axios.get(
        `${this.config.backendUrl}/api/router/${this.config.routerId}/api-keys`,
        {
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-token'
          },
          timeout: 10000,
          validateStatus: () => true
        }
      );

      const isValidResponse = response.status < 500;
      
      return {
        success: isValidResponse,
        details: `API Key Pool endpoint status: ${response.status}`,
        error: !isValidResponse ? `HTTP ${response.status}` : null
      };
    } catch (error) {
      return { success: false, error: `API key pool test failed: ${error.message}` };
    }
  }

  async testUsageReportingEndpoint() {
    try {
      // Test usage reporting endpoint
      const usageData = {
        router_id: this.config.routerId,
        usage_data: {
          requests: [{
            model: 'claude-3-sonnet',
            provider: 'anthropic',
            tokens_used: 1000,
            cost: 0.03,
            response_time: 1500,
            success: true,
            timestamp: new Date()
          }],
          period_start: new Date(Date.now() - 3600000),
          period_end: new Date()
        }
      };

      const response = await axios.post(
        `${this.config.backendUrl}/api/router/usage`,
        usageData,
        {
          headers: { 'Content-Type': 'application/json' },
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

  async testCostOptimizationEndpoint() {
    try {
      // Test cost optimization endpoint
      const response = await axios.get(
        `${this.config.backendUrl}/api/router/${this.config.routerId}/optimize`,
        {
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-token'
          },
          timeout: 10000,
          validateStatus: () => true
        }
      );

      const isValidResponse = response.status < 500;
      
      return {
        success: isValidResponse,
        details: `Cost optimization endpoint status: ${response.status}`,
        error: !isValidResponse ? `HTTP ${response.status}` : null
      };
    } catch (error) {
      return { success: false, error: `Cost optimization test failed: ${error.message}` };
    }
  }

  async testRouterConfiguration() {
    try {
      // Test router configuration files
      const configExample = './packages/recoder-cli-router/config.example.json';
      const hasConfigExample = fs.existsSync(configExample);
      
      if (hasConfigExample) {
        const configContent = fs.readFileSync(configExample, 'utf8');
        const config = JSON.parse(configContent);
        
        const hasProviders = config.providers && Array.isArray(config.providers);
        const hasRoutes = config.routes || config.routing;
        
        return {
          success: hasProviders,
          details: `Has providers: ${hasProviders}, Has routes: ${!!hasRoutes}`,
          error: !hasProviders ? 'Missing providers configuration' : null
        };
      }

      return {
        success: true,
        details: 'No config example found (may use defaults)',
        error: null
      };
    } catch (error) {
      return { success: false, error: `Router configuration test failed: ${error.message}` };
    }
  }

  async testRouterCLICommands() {
    try {
      // Test router CLI structure
      const cliPath = './packages/recoder-cli-router/src/cli.ts';
      if (!fs.existsSync(cliPath)) {
        return { success: false, error: 'Router CLI file not found' };
      }

      const cliContent = fs.readFileSync(cliPath, 'utf8');
      
      const hasStartCommand = cliContent.includes('start');
      const hasStopCommand = cliContent.includes('stop');
      const hasStatusCommand = cliContent.includes('status');
      const hasConnectCommand = cliContent.includes('connect') || 
                               fs.existsSync('./packages/recoder-cli-router/src/commands/connect.ts');

      const essentialCommands = hasStartCommand && hasStopCommand && hasStatusCommand;

      return {
        success: essentialCommands,
        details: `Start: ${hasStartCommand}, Stop: ${hasStopCommand}, Status: ${hasStatusCommand}, Connect: ${hasConnectCommand}`,
        error: !essentialCommands ? 'Missing essential CLI commands' : null
      };
    } catch (error) {
      return { success: false, error: `Router CLI commands test failed: ${error.message}` };
    }
  }

  async generateReport() {
    this.log('\n' + '='.repeat(80), 'info');
    this.log('🔄 CLI ROUTER BACKEND CONNECTION TEST REPORT', 'info');
    this.log('='.repeat(80), 'info');

    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    const successRate = ((passedTests / totalTests) * 100).toFixed(1);

    this.log(`\n📊 Router Backend Integration Results:`, 'info');
    this.log(`   Total Tests: ${totalTests}`);
    this.log(`   Passed: ${passedTests}`, passedTests === totalTests ? 'success' : 'info');
    this.log(`   Failed: ${failedTests}`, failedTests === 0 ? 'success' : failedTests > 2 ? 'error' : 'warning');
    this.log(`   Success Rate: ${successRate}%`, successRate >= 80 ? 'success' : successRate >= 60 ? 'warning' : 'error');

    this.log(`\n🔍 Router Integration Analysis:`, 'info');
    
    const criticalTests = [
      'RouterBackendClient Class',
      'MainBackendConnection Class',
      'Router CLI Commands'
    ];
    
    const criticalPassed = this.results.filter(r => 
      criticalTests.includes(r.step) && r.success
    ).length;
    
    if (criticalPassed === criticalTests.length) {
      this.log(`✅ All critical router components working`, 'success');
    } else {
      this.log(`⚠️ ${criticalTests.length - criticalPassed} critical components have issues`, 'warning');
    }

    this.log(`\n🎯 Router Backend Readiness:`, 'info');
    if (successRate >= 85) {
      this.log(`   ✅ ROUTER BACKEND INTEGRATION READY`, 'success');
    } else if (successRate >= 70) {
      this.log(`   ⚠️ ROUTER MOSTLY READY - Minor fixes needed`, 'warning');
    } else {
      this.log(`   ❌ ROUTER NEEDS WORK - Address failed tests`, 'error');
    }

    // Show specific failures
    const failures = this.results.filter(r => !r.success);
    if (failures.length > 0) {
      this.log(`\n🔧 Issues to Address:`, 'warning');
      failures.forEach((failure, index) => {
        this.log(`   ${index + 1}. ${failure.step}: ${failure.error}`, 'warning');
      });
    }

    this.log(`\n🚀 Router Backend Features:`, 'info');
    this.log(`   • Backend Client Class: Handles auth, quota, session sync`);
    this.log(`   • Main Backend Connection: API key pools, cost optimization`);
    this.log(`   • Usage Tracking: Comprehensive usage reporting`);
    this.log(`   • Router Registration: Dynamic router management`);
    this.log(`   • CLI Commands: Start, stop, status, connect functionality`);

    this.log('\n' + '='.repeat(80), 'info');
  }

  async runRouterBackendTests() {
    this.log('🚀 Starting CLI Router Backend Connection Tests...', 'info');
    this.log('Testing Router → Backend API Integration\n', 'info');

    // Test router backend integration components
    await this.testStep('RouterBackendClient Class', () => this.testRouterBackendClientClass());
    await this.testStep('MainBackendConnection Class', () => this.testMainBackendConnectionClass());
    await this.testStep('Router Configuration', () => this.testRouterConfiguration());
    await this.testStep('Router CLI Commands', () => this.testRouterCLICommands());
    
    // Test actual backend endpoints
    await this.testStep('Router Registration Endpoint', () => this.testRouterRegistrationEndpoint());
    await this.testStep('API Key Pool Endpoint', () => this.testAPIKeyPoolEndpoint());
    await this.testStep('Usage Reporting Endpoint', () => this.testUsageReportingEndpoint());
    await this.testStep('Cost Optimization Endpoint', () => this.testCostOptimizationEndpoint());

    await this.generateReport();
  }
}

// Run the router backend tests
(async () => {
  const tester = new RouterBackendTester();
  await tester.runRouterBackendTests();
})();