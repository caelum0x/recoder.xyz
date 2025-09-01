#!/usr/bin/env node

/**
 * End-to-End Authentication Flow Test
 * Tests the complete authentication workflow from CLI to Backend
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Test configuration
const config = {
  production: {
    authUrl: 'https://api.recoder.xyz',
    webUrl: 'https://recoder.xyz',
    backendUrl: 'https://api.recoder.xyz'
  },
  testData: {
    testEmail: 'test@recoder.xyz',
    testDeviceCode: 'test-device-12345',
    testUserId: 'user_test_auth'
  }
};

class AuthFlowTester {
  constructor() {
    this.sessionDir = path.join(os.homedir(), '.recoder');
    this.authFile = path.join(this.sessionDir, 'auth.json');
    this.unifiedSessionFile = path.join(this.sessionDir, 'unified-session.json');
    this.results = [];
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

  async testDeviceFlowInitiation() {
    try {
      // Test device flow initiation
      const response = await axios.post(`${config.production.authUrl}/api/auth/device`, {
        client_id: 'recoder-cli',
        scope: 'basic profile'
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
        validateStatus: () => true
      });

      const isValidResponse = response.status < 500;
      const hasDeviceCode = response.data && (response.data.device_code || response.data.deviceCode);
      
      return {
        success: isValidResponse,
        details: `Status: ${response.status}, Has device code: ${!!hasDeviceCode}`,
        error: !isValidResponse ? `HTTP ${response.status}` : 
               !hasDeviceCode && response.status === 200 ? 'Missing device code in response' : null,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: `Device flow initiation failed: ${error.message}`
      };
    }
  }

  async testCLITokenExchange() {
    try {
      // Test CLI token exchange endpoint
      const response = await axios.post(`${config.production.authUrl}/api/auth/cli/token`, {
        code: 'test-auth-code',
        clientId: 'recoder-cli'
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
        validateStatus: () => true
      });

      const isValidResponse = response.status < 500;
      const isJsonResponse = response.headers['content-type']?.includes('application/json');
      
      return {
        success: isValidResponse && isJsonResponse,
        details: `Status: ${response.status}, Content-Type: ${response.headers['content-type']}`,
        error: !isValidResponse ? `HTTP ${response.status}` : 
               !isJsonResponse ? 'Expected JSON response' : null
      };
    } catch (error) {
      return {
        success: false,
        error: `Token exchange failed: ${error.message}`
      };
    }
  }

  async testSessionFileManagement() {
    try {
      // Ensure .recoder directory exists
      if (!fs.existsSync(this.sessionDir)) {
        fs.mkdirSync(this.sessionDir, { recursive: true });
      }

      // Test session file creation
      const testSession = {
        userId: config.testData.testUserId,
        token: 'test-token-12345',
        email: config.testData.testEmail,
        plan: 'free',
        expiresAt: Date.now() + 3600000, // 1 hour
        createdAt: Date.now()
      };

      fs.writeFileSync(this.authFile, JSON.stringify(testSession, null, 2));
      
      // Test reading session file
      const savedSession = JSON.parse(fs.readFileSync(this.authFile, 'utf8'));
      const isValid = savedSession.userId === testSession.userId && 
                     savedSession.email === testSession.email;

      // Clean up test file
      if (fs.existsSync(this.authFile)) {
        fs.unlinkSync(this.authFile);
      }

      return {
        success: isValid,
        details: `Session file created and read successfully`,
        error: !isValid ? 'Session data mismatch' : null
      };
    } catch (error) {
      return {
        success: false,
        error: `Session management failed: ${error.message}`
      };
    }
  }

  async testBackendHealthWithAuth() {
    try {
      // Test backend health endpoint with auth headers
      const response = await axios.get(`${config.production.backendUrl}/health`, {
        headers: {
          'Authorization': 'Bearer test-token',
          'User-Agent': 'recoder-cli/1.0.0'
        },
        timeout: 10000,
        validateStatus: () => true
      });

      const isHealthy = response.status === 200;
      const hasHealthData = response.data && (response.data.status || response.data.service);
      
      return {
        success: isHealthy,
        details: `Backend health: ${response.status}, Has health data: ${hasHealthData}`,
        error: !isHealthy ? `Backend unhealthy: ${response.status}` : null
      };
    } catch (error) {
      return {
        success: false,
        error: `Backend health check failed: ${error.message}`
      };
    }
  }

  async testCLIConfigLoad() {
    try {
      // Test CLI configuration loading
      const configPath = './packages/cli/src/utils/config.ts';
      if (!fs.existsSync(configPath)) {
        return {
          success: false,
          error: 'CLI config file not found'
        };
      }

      const configContent = fs.readFileSync(configPath, 'utf8');
      const hasApiUrl = configContent.includes('api.recoder.xyz');
      const hasDefaults = configContent.includes('baseUrl') && 
                         configContent.includes('timeout') &&
                         configContent.includes('retries');
      
      return {
        success: hasApiUrl && hasDefaults,
        details: `API URL configured: ${hasApiUrl}, Defaults present: ${hasDefaults}`,
        error: !hasApiUrl ? 'Missing api.recoder.xyz configuration' :
               !hasDefaults ? 'Missing configuration defaults' : null
      };
    } catch (error) {
      return {
        success: false,
        error: `Config load test failed: ${error.message}`
      };
    }
  }

  async testAuthManagerIntegration() {
    try {
      // Test AuthManager class existence and structure
      const authManagerPath = './packages/cli/src/services/auth-manager.ts';
      if (!fs.existsSync(authManagerPath)) {
        return {
          success: false,
          error: 'AuthManager file not found'
        };
      }

      const authContent = fs.readFileSync(authManagerPath, 'utf8');
      const hasRequiredMethods = [
        'isAuthenticated',
        'login',
        'logout', 
        'storeAuth',
        'getStoredAuth',
        'exchangeCodeForTokens'
      ].every(method => authContent.includes(method));

      const hasRecoderApiUrl = authContent.includes('RECODER_API_URL') || 
                              authContent.includes('api.recoder.xyz');
      
      return {
        success: hasRequiredMethods && hasRecoderApiUrl,
        details: `Required methods: ${hasRequiredMethods}, API URL config: ${hasRecoderApiUrl}`,
        error: !hasRequiredMethods ? 'Missing required authentication methods' :
               !hasRecoderApiUrl ? 'Missing API URL configuration' : null
      };
    } catch (error) {
      return {
        success: false,
        error: `AuthManager integration test failed: ${error.message}`
      };
    }
  }

  async testWebAuthRedirect() {
    try {
      // Test web auth redirect URL (used in device flow)
      const response = await axios.get(`${config.production.webUrl}/auth/cli`, {
        timeout: 10000,
        validateStatus: () => true,
        maxRedirects: 0
      });

      // Should either load the auth page (200) or redirect (3xx)
      const isValidResponse = response.status === 200 || 
                             (response.status >= 300 && response.status < 400);
      
      return {
        success: isValidResponse,
        details: `Auth page status: ${response.status}`,
        error: !isValidResponse ? `Unexpected status: ${response.status}` : null
      };
    } catch (error) {
      if (error.code === 'ENOTFOUND') {
        return {
          success: false,
          error: 'Auth page domain not resolved'
        };
      }
      return {
        success: false,
        error: `Web auth redirect test failed: ${error.message}`
      };
    }
  }

  async generateReport() {
    this.log('\n' + '='.repeat(80), 'info');
    this.log('🔐 END-TO-END AUTHENTICATION FLOW TEST REPORT', 'info');
    this.log('='.repeat(80), 'info');

    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    const successRate = ((passedTests / totalTests) * 100).toFixed(1);

    this.log(`\n📊 Authentication Test Results:`, 'info');
    this.log(`   Total Tests: ${totalTests}`);
    this.log(`   Passed: ${passedTests}`, passedTests === totalTests ? 'success' : 'info');
    this.log(`   Failed: ${failedTests}`, failedTests === 0 ? 'success' : failedTests > 2 ? 'error' : 'warning');
    this.log(`   Success Rate: ${successRate}%`, successRate >= 80 ? 'success' : successRate >= 60 ? 'warning' : 'error');

    this.log(`\n🔍 Authentication Flow Analysis:`, 'info');
    
    const criticalTests = [
      'CLI Configuration Load',
      'AuthManager Integration', 
      'Backend Health Check',
      'Session File Management'
    ];
    
    const criticalPassed = this.results.filter(r => 
      criticalTests.includes(r.step) && r.success
    ).length;
    
    if (criticalPassed === criticalTests.length) {
      this.log(`✅ All critical authentication components working`, 'success');
    } else {
      this.log(`⚠️ ${criticalTests.length - criticalPassed} critical components have issues`, 'warning');
    }

    this.log(`\n🎯 Authentication Readiness:`, 'info');
    if (successRate >= 85) {
      this.log(`   ✅ AUTHENTICATION READY FOR PRODUCTION`, 'success');
    } else if (successRate >= 70) {
      this.log(`   ⚠️ AUTHENTICATION MOSTLY READY - Minor fixes needed`, 'warning');
    } else {
      this.log(`   ❌ AUTHENTICATION NEEDS WORK - Address failed tests`, 'error');
    }

    // Show specific failures
    const failures = this.results.filter(r => !r.success);
    if (failures.length > 0) {
      this.log(`\n🔧 Issues to Address:`, 'warning');
      failures.forEach((failure, index) => {
        this.log(`   ${index + 1}. ${failure.step}: ${failure.error}`, 'warning');
      });
    }

    this.log('\n' + '='.repeat(80), 'info');
  }

  async runAuthFlowTests() {
    this.log('🚀 Starting End-to-End Authentication Flow Tests...', 'info');
    this.log('Testing CLI → Backend → Web Authentication Pipeline\n', 'info');

    // Run authentication flow tests
    await this.testStep('CLI Configuration Load', () => this.testCLIConfigLoad());
    await this.testStep('AuthManager Integration', () => this.testAuthManagerIntegration());
    await this.testStep('Session File Management', () => this.testSessionFileManagement());
    await this.testStep('Backend Health Check', () => this.testBackendHealthWithAuth());
    await this.testStep('Device Flow Initiation', () => this.testDeviceFlowInitiation());
    await this.testStep('CLI Token Exchange', () => this.testCLITokenExchange());
    await this.testStep('Web Auth Redirect', () => this.testWebAuthRedirect());

    await this.generateReport();
  }
}

// Run the authentication flow tests
(async () => {
  const tester = new AuthFlowTester();
  await tester.runAuthFlowTests();
})();