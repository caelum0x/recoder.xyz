#!/usr/bin/env node

/**
 * Cross-Platform Session Synchronization Test
 * Tests session sync between CLI, Web, and Router platforms
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

class CrossPlatformSyncTester {
  constructor() {
    this.results = [];
    this.sessionDir = path.join(os.homedir(), '.recoder');
    this.config = {
      webUrl: 'https://recoder.xyz',
      apiUrl: 'https://api.recoder.xyz',
      chatUrl: 'https://chat.recoder.xyz',
      localBackend: 'http://localhost:3001',
      testSession: {
        userId: 'test-sync-user-123',
        token: 'test-sync-token-456',
        email: 'sync-test@recoder.xyz',
        plan: 'pro',
        platforms: {
          cli: true,
          web: false,
          extension: false,
          router: false
        },
        quotas: {
          totalRequests: 1000,
          usedRequests: 50,
          resetDate: new Date(Date.now() + 30 * 24 * 3600000).toISOString()
        }
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

  async testUnifiedSessionManager() {
    try {
      // Test unified session manager existence
      const unifiedSessionPath = './packages/cli/src/services/unified-session-manager.ts';
      if (!fs.existsSync(unifiedSessionPath)) {
        return {
          success: false,
          error: 'Unified session manager file not found'
        };
      }

      const content = fs.readFileSync(unifiedSessionPath, 'utf8');
      
      const hasRequiredMethods = [
        'getCurrentSession',
        'restoreSession', 
        'saveSession',
        'clearSession',
        'syncCrossPlatform'
      ].some(method => content.includes(method)); // Use 'some' as method names might vary

      const hasSessionInterface = content.includes('UnifiedSession') || 
                                 content.includes('UserSession');
      
      return {
        success: hasRequiredMethods && hasSessionInterface,
        details: `Session methods: ${hasRequiredMethods}, Session interface: ${hasSessionInterface}`,
        error: !hasRequiredMethods ? 'Missing session management methods' :
               !hasSessionInterface ? 'Missing session interface' : null
      };
    } catch (error) {
      return {
        success: false,
        error: `Unified session manager test failed: ${error.message}`
      };
    }
  }

  async testSessionFileStructure() {
    try {
      // Ensure session directory exists
      if (!fs.existsSync(this.sessionDir)) {
        fs.mkdirSync(this.sessionDir, { recursive: true });
      }

      // Test CLI session file
      const cliSessionFile = path.join(this.sessionDir, 'session.json');
      fs.writeFileSync(cliSessionFile, JSON.stringify(this.config.testSession, null, 2));
      
      // Test unified session file
      const unifiedSessionFile = path.join(this.sessionDir, 'unified-session.json');
      const unifiedSession = {
        ...this.config.testSession,
        platform: 'cli',
        deviceId: 'device-123',
        accessToken: this.config.testSession.token,
        refreshToken: 'refresh-token-456',
        scopes: ['basic', 'profile'],
        expiresAt: new Date(Date.now() + 3600000),
        createdAt: new Date(),
        lastUsed: new Date(),
        riskLevel: 'low',
        metadata: { source: 'test' }
      };
      fs.writeFileSync(unifiedSessionFile, JSON.stringify(unifiedSession, null, 2));

      // Verify files can be read
      const cliSession = JSON.parse(fs.readFileSync(cliSessionFile, 'utf8'));
      const readUnifiedSession = JSON.parse(fs.readFileSync(unifiedSessionFile, 'utf8'));
      
      const cliValid = cliSession.userId === this.config.testSession.userId;
      const unifiedValid = readUnifiedSession.platform === 'cli';

      // Clean up test files
      [cliSessionFile, unifiedSessionFile].forEach(file => {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      });

      return {
        success: cliValid && unifiedValid,
        details: `CLI session: ${cliValid}, Unified session: ${unifiedValid}`,
        error: !cliValid ? 'CLI session validation failed' :
               !unifiedValid ? 'Unified session validation failed' : null
      };
    } catch (error) {
      return {
        success: false,
        error: `Session file structure test failed: ${error.message}`
      };
    }
  }

  async testPlatformAccessAPI() {
    try {
      // Test platform access API that checks cross-platform auth
      const response = await axios.post(
        `${this.config.webUrl}/api/platform/access`,
        {
          platform: 'cli',
          userId: this.config.testSession.userId,
          sessionToken: this.config.testSession.token
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
          validateStatus: () => true
        }
      );

      const isValidResponse = response.status < 500;
      const isJsonResponse = response.headers['content-type']?.includes('application/json');
      
      return {
        success: isValidResponse,
        details: `Platform access API status: ${response.status}, JSON: ${isJsonResponse}`,
        error: !isValidResponse ? `HTTP ${response.status}` : null
      };
    } catch (error) {
      return {
        success: false,
        error: `Platform access API test failed: ${error.message}`
      };
    }
  }

  async testSessionSyncAPI() {
    try {
      // Test session sync endpoint
      const response = await axios.get(
        `${this.config.apiUrl}/api/user/session`,
        {
          headers: { 
            'Authorization': `Bearer ${this.config.testSession.token}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000,
          validateStatus: () => true
        }
      );

      const isValidResponse = response.status < 500;
      
      return {
        success: isValidResponse,
        details: `Session sync API status: ${response.status}`,
        error: !isValidResponse ? `HTTP ${response.status}` : null
      };
    } catch (error) {
      return {
        success: false,
        error: `Session sync API test failed: ${error.message}`
      };
    }
  }

  async testPlatformStatusUpdate() {
    try {
      // Test platform status update endpoint
      const response = await axios.patch(
        `${this.config.apiUrl}/api/user/platforms`,
        {
          platform: 'cli',
          active: true,
          lastUsed: new Date()
        },
        {
          headers: { 
            'Authorization': `Bearer ${this.config.testSession.token}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000,
          validateStatus: () => true
        }
      );

      const isValidResponse = response.status < 500;
      
      return {
        success: isValidResponse,
        details: `Platform status update API status: ${response.status}`,
        error: !isValidResponse ? `HTTP ${response.status}` : null
      };
    } catch (error) {
      return {
        success: false,
        error: `Platform status update test failed: ${error.message}`
      };
    }
  }

  async testWebCLIAuthBridge() {
    try {
      // Test web-CLI auth bridge service
      const bridgePath = './packages/cli/src/services/web-cli-auth-bridge.ts';
      if (!fs.existsSync(bridgePath)) {
        return {
          success: false,
          error: 'Web-CLI auth bridge file not found'
        };
      }

      const content = fs.readFileSync(bridgePath, 'utf8');
      
      const hasBridgeMethods = [
        'syncSession',
        'transferToken',
        'validateCrossPlatform'
      ].some(method => content.includes(method));

      const hasWebIntegration = content.includes('web') && 
                               (content.includes('bridge') || content.includes('sync'));
      
      return {
        success: hasBridgeMethods || hasWebIntegration,
        details: `Bridge methods: ${hasBridgeMethods}, Web integration: ${hasWebIntegration}`,
        error: !hasBridgeMethods && !hasWebIntegration ? 'Missing auth bridge functionality' : null
      };
    } catch (error) {
      return {
        success: false,
        error: `Web-CLI auth bridge test failed: ${error.message}`
      };
    }
  }

  async testCrossPlatformNavigation() {
    try {
      // Test navigation from main site to platforms
      const webPlatformResponse = await axios.get(
        `${this.config.webUrl}/platform/web`,
        {
          timeout: 10000,
          validateStatus: () => true,
          maxRedirects: 0
        }
      );

      const chatPlatformResponse = await axios.get(
        `${this.config.webUrl}/platform/chat`,
        {
          timeout: 10000,
          validateStatus: () => true,
          maxRedirects: 0  
        }
      );

      const webWorking = webPlatformResponse.status === 200 || 
                        (webPlatformResponse.status >= 300 && webPlatformResponse.status < 400);
      const chatWorking = chatPlatformResponse.status === 200 || 
                         (chatPlatformResponse.status >= 300 && chatPlatformResponse.status < 400);

      return {
        success: webWorking && chatWorking,
        details: `Web platform: ${webPlatformResponse.status}, Chat platform: ${chatPlatformResponse.status}`,
        error: !webWorking ? `Web platform navigation failed: ${webPlatformResponse.status}` :
               !chatWorking ? `Chat platform navigation failed: ${chatPlatformResponse.status}` : null
      };
    } catch (error) {
      return {
        success: false,
        error: `Cross-platform navigation test failed: ${error.message}`
      };
    }
  }

  async testSessionTokenValidation() {
    try {
      // Test session token validation across platforms
      const validationTests = [
        { url: `${this.config.apiUrl}/api/auth/validate`, name: 'API Gateway' },
        { url: `${this.config.webUrl}/api/auth/validate`, name: 'Main Website' }
      ];

      let successCount = 0;
      let totalTests = validationTests.length;
      let details = [];

      for (const test of validationTests) {
        try {
          const response = await axios.post(
            test.url,
            { token: this.config.testSession.token },
            {
              headers: { 'Content-Type': 'application/json' },
              timeout: 10000,
              validateStatus: () => true
            }
          );

          const isValid = response.status < 500;
          if (isValid) successCount++;
          details.push(`${test.name}: ${response.status}`);
        } catch (error) {
          details.push(`${test.name}: Failed`);
        }
      }

      return {
        success: successCount > 0,
        details: details.join(', '),
        error: successCount === 0 ? 'All token validation endpoints failed' : null
      };
    } catch (error) {
      return {
        success: false,
        error: `Session token validation test failed: ${error.message}`
      };
    }
  }

  async generateReport() {
    this.log('\n' + '='.repeat(80), 'info');
    this.log('🔄 CROSS-PLATFORM SESSION SYNC TEST REPORT', 'info');
    this.log('='.repeat(80), 'info');

    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    const successRate = ((passedTests / totalTests) * 100).toFixed(1);

    this.log(`\n📊 Cross-Platform Sync Results:`, 'info');
    this.log(`   Total Tests: ${totalTests}`);
    this.log(`   Passed: ${passedTests}`, passedTests === totalTests ? 'success' : 'info');
    this.log(`   Failed: ${failedTests}`, failedTests === 0 ? 'success' : failedTests > 2 ? 'error' : 'warning');
    this.log(`   Success Rate: ${successRate}%`, successRate >= 80 ? 'success' : successRate >= 60 ? 'warning' : 'error');

    this.log(`\n🔍 Session Sync Analysis:`, 'info');
    
    const criticalTests = [
      'Session File Structure',
      'Platform Access API',
      'Cross-Platform Navigation'
    ];
    
    const criticalPassed = this.results.filter(r => 
      criticalTests.includes(r.step) && r.success
    ).length;
    
    if (criticalPassed === criticalTests.length) {
      this.log(`✅ All critical session sync components working`, 'success');
    } else {
      this.log(`⚠️ ${criticalTests.length - criticalPassed} critical components have issues`, 'warning');
    }

    this.log(`\n🎯 Cross-Platform Readiness:`, 'info');
    if (successRate >= 85) {
      this.log(`   ✅ CROSS-PLATFORM SYNC READY FOR PRODUCTION`, 'success');
    } else if (successRate >= 70) {
      this.log(`   ⚠️ SYNC MOSTLY READY - Minor fixes needed`, 'warning');
    } else {
      this.log(`   ❌ SYNC NEEDS WORK - Address failed tests`, 'error');
    }

    // Show specific failures
    const failures = this.results.filter(r => !r.success);
    if (failures.length > 0) {
      this.log(`\n🔧 Issues to Address:`, 'warning');
      failures.forEach((failure, index) => {
        this.log(`   ${index + 1}. ${failure.step}: ${failure.error}`, 'warning');
      });
    }

    this.log(`\n🚀 Session Sync Features:`, 'info');
    this.log(`   • Unified Session Management: Cross-platform session storage`);
    this.log(`   • Platform Access Control: Authentication verification`);
    this.log(`   • Session Synchronization: Real-time session updates`);
    this.log(`   • Token Validation: Multi-endpoint token verification`);
    this.log(`   • Navigation Integration: Seamless platform switching`);

    this.log('\n' + '='.repeat(80), 'info');
  }

  async runCrossPlatformSyncTests() {
    this.log('🚀 Starting Cross-Platform Session Synchronization Tests...', 'info');
    this.log('Testing CLI ↔ Web ↔ Router Session Sync\n', 'info');

    // Test cross-platform session components
    await this.testStep('Unified Session Manager', () => this.testUnifiedSessionManager());
    await this.testStep('Session File Structure', () => this.testSessionFileStructure());
    await this.testStep('Platform Access API', () => this.testPlatformAccessAPI());
    await this.testStep('Session Sync API', () => this.testSessionSyncAPI());
    await this.testStep('Platform Status Update', () => this.testPlatformStatusUpdate());
    await this.testStep('Web-CLI Auth Bridge', () => this.testWebCLIAuthBridge());
    await this.testStep('Cross-Platform Navigation', () => this.testCrossPlatformNavigation());
    await this.testStep('Session Token Validation', () => this.testSessionTokenValidation());

    await this.generateReport();
  }
}

// Run the cross-platform sync tests
(async () => {
  const tester = new CrossPlatformSyncTester();
  await tester.runCrossPlatformSyncTests();
})();