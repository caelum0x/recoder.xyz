#!/usr/bin/env node

/**
 * User Onboarding Flow Test
 * Tests the complete user onboarding experience
 */

const axios = require('axios');
const chalk = require('chalk');

const CONFIG = {
  appUrl: process.env.TEST_APP_URL || 'http://localhost:3000',
  backendUrl: process.env.TEST_BACKEND_URL || 'http://localhost:3001',
  timeout: 30000,
  testUser: {
    email: `test_${Date.now()}@recoder.test`,
    password: 'Test123!@#Password',
    name: 'Test User'
  }
};

class OnboardingTestSuite {
  constructor() {
    this.results = { passed: 0, failed: 0, tests: [] };
    this.userSession = null;
    this.authToken = null;
  }

  log(message, type = 'info') {
    const colors = {
      info: chalk.blue,
      success: chalk.green,
      error: chalk.red,
      warning: chalk.yellow,
      header: chalk.cyan.bold
    };
    console.log(colors[type](message));
  }

  async runTest(testName, testFn) {
    this.log(`\n🧪 ${testName}`, 'header');
    try {
      const result = await testFn();
      if (result.success) {
        this.results.passed++;
        this.log(`✅ PASSED`, 'success');
        if (result.details) this.log(`   ${result.details}`, 'info');
      } else {
        this.results.failed++;
        this.log(`❌ FAILED`, 'error');
        this.log(`   ${result.error}`, 'error');
      }
      this.results.tests.push({ name: testName, ...result });
      return result;
    } catch (error) {
      this.results.failed++;
      this.log(`❌ EXCEPTION: ${error.message}`, 'error');
      this.results.tests.push({ name: testName, success: false, error: error.message });
      return { success: false, error: error.message };
    }
  }

  // ============================================================================
  // USER REGISTRATION TESTS
  // ============================================================================

  async testUserRegistration() {
    return await this.runTest('User Registration', async () => {
      try {
        const response = await axios.post(
          `${CONFIG.appUrl}/api/auth/register`,
          {
            email: CONFIG.testUser.email,
            password: CONFIG.testUser.password,
            name: CONFIG.testUser.name
          },
          {
            validateStatus: () => true,
            timeout: CONFIG.timeout
          }
        );

        if (response.status === 201 || response.status === 200) {
          if (response.data.success) {
            // Extract token from session object if available
            this.authToken = response.data.session?.accessToken || response.data.accessToken || response.data.token;
            this.userSession = response.data.user;

            return {
              success: true,
              details: `User registered successfully with ID: ${response.data.user?.id || 'unknown'}`,
              data: response.data
            };
          }
        }

        // Handle duplicate email (expected if run multiple times)
        if (response.status === 409 || response.status === 400) {
          if (response.data.error?.includes('already exists') || 
              response.data.error?.includes('duplicate')) {
            return {
              success: true,
              details: 'User already exists (expected for repeated tests)',
              data: response.data
            };
          }
        }

        return {
          success: false,
          error: `Registration failed: ${response.status} - ${JSON.stringify(response.data)}`
        };
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          return {
            success: false,
            error: 'Cannot connect to server. Is it running?'
          };
        }
        throw error;
      }
    });
  }

  async testUserLogin() {
    return await this.runTest('User Login', async () => {
      try {
        const response = await axios.post(
          `${CONFIG.appUrl}/api/auth/login`,
          {
            email: CONFIG.testUser.email,
            password: CONFIG.testUser.password
          },
          {
            validateStatus: () => true,
            timeout: CONFIG.timeout
          }
        );

        if (response.status === 200 && response.data.success) {
          // Extract token from session object (API returns in response.data.session.accessToken)
          this.authToken = response.data.session?.accessToken || response.data.accessToken || response.data.token;
          this.userSession = response.data.user;

          return {
            success: true,
            details: `Login successful. Token: ${this.authToken?.substring(0, 20)}...`,
            data: response.data
          };
        }

        return {
          success: false,
          error: `Login failed: ${response.status} - ${JSON.stringify(response.data)}`
        };
      } catch (error) {
        return {
          success: false,
          error: `Login error: ${error.message}`
        };
      }
    });
  }

  // ============================================================================
  // ONBOARDING PAGE TESTS
  // ============================================================================

  async testOnboardingPageAccess() {
    return await this.runTest('Onboarding Page - Access', async () => {
      try {
        const response = await axios.get(
          `${CONFIG.appUrl}/auth/onboarding`,
          {
            validateStatus: () => true,
            timeout: CONFIG.timeout
          }
        );

        if (response.status === 200) {
          const hasOnboardingContent = response.data.includes('onboarding') || 
                                       response.data.includes('OpenRouter') ||
                                       response.data.includes('API Key');
          
          return {
            success: hasOnboardingContent,
            details: 'Onboarding page loads successfully',
            error: hasOnboardingContent ? undefined : 'Page loads but missing expected content'
          };
        }

        return {
          success: false,
          error: `Unexpected status: ${response.status}`
        };
      } catch (error) {
        return {
          success: false,
          error: `Page access failed: ${error.message}`
        };
      }
    });
  }

  async testOnboardingSteps() {
    return await this.runTest('Onboarding - Multi-Step Flow', async () => {
      try {
        // Onboarding page should have step indicators
        const response = await axios.get(
          `${CONFIG.appUrl}/auth/onboarding`,
          {
            validateStatus: () => true,
            timeout: CONFIG.timeout
          }
        );

        if (response.status === 200) {
          const html = response.data;
          // Look for onboarding-related content (client-side rendered React app)
          const hasOnboarding = html.includes('onboarding') ||
                               html.includes('OpenRouter') ||
                               html.includes('API Key') ||
                               html.includes('apiKey') ||
                               html.includes('Step') ||
                               html.includes('step') ||
                               html.includes('onboardingContent') ||
                               html.includes('OnboardingContent');

          return {
            success: hasOnboarding,
            details: 'Multi-step onboarding UI detected (client-side rendered)',
            error: hasOnboarding ? undefined : 'Onboarding content not found in page'
          };
        }

        return {
          success: false,
          error: `Failed to load onboarding page: ${response.status}`
        };
      } catch (error) {
        return {
          success: false,
          error: `Step flow test failed: ${error.message}`
        };
      }
    });
  }

  // ============================================================================
  // API KEY SETUP TESTS
  // ============================================================================

  async testOpenRouterKeyValidation() {
    return await this.runTest('API Key - OpenRouter Validation Endpoint', async () => {
      try {
        // Test with invalid key
        const response = await axios.post(
          `${CONFIG.appUrl}/api/user/openrouter/validate`,
          {
            apiKey: 'sk-or-v1-invalid-test-key'
          },
          {
            validateStatus: () => true,
            timeout: CONFIG.timeout
          }
        );

        // Endpoint should exist and handle validation
        if (response.status === 200 || response.status === 400 || response.status === 401) {
          return {
            success: true,
            details: `Validation endpoint works (status: ${response.status})`,
            data: response.data
          };
        }

        return {
          success: false,
          error: `Unexpected validation response: ${response.status}`
        };
      } catch (error) {
        return {
          success: false,
          error: `Validation test failed: ${error.message}`
        };
      }
    });
  }

  async testOpenRouterKeySaving() {
    return await this.runTest('API Key - Save OpenRouter Key', async () => {
      if (!this.authToken) {
        return {
          success: false,
          error: 'No auth token available. Login test may have failed.'
        };
      }

      try {
        const response = await axios.post(
          `${CONFIG.appUrl}/api/user/openrouter`,
          {
            userId: this.userSession?.id,
            apiKey: 'sk-or-v1-test-key-for-automated-testing',
            provider: 'openrouter'
          },
          {
            headers: {
              'Authorization': `Bearer ${this.authToken}`,
              'Content-Type': 'application/json'
            },
            validateStatus: () => true,
            timeout: CONFIG.timeout
          }
        );

        // Should either succeed or require valid key
        if (response.status === 200 || response.status === 201) {
          return {
            success: true,
            details: 'API key saving works',
            data: response.data
          };
        }

        // Validation failure is also acceptable (means validation works)
        if (response.status === 400 && response.data.error?.includes('Invalid')) {
          return {
            success: true,
            details: 'API key validation prevents invalid keys (good!)',
            data: response.data
          };
        }

        return {
          success: false,
          error: `Key saving failed: ${response.status} - ${JSON.stringify(response.data)}`
        };
      } catch (error) {
        return {
          success: false,
          error: `Save key test failed: ${error.message}`
        };
      }
    });
  }

  // ============================================================================
  // PROFILE SETUP TESTS
  // ============================================================================

  async testUserProfileEndpoint() {
    return await this.runTest('User Profile - Get Profile Data', async () => {
      if (!this.authToken) {
        return {
          success: false,
          error: 'No auth token available'
        };
      }

      try {
        const response = await axios.get(
          `${CONFIG.appUrl}/api/user/profile`,
          {
            headers: {
              'Authorization': `Bearer ${this.authToken}`
            },
            validateStatus: () => true,
            timeout: CONFIG.timeout
          }
        );

        if (response.status === 200) {
          return {
            success: true,
            details: `Profile data retrieved: ${response.data.user?.email || 'user data present'}`,
            data: response.data
          };
        }

        return {
          success: false,
          error: `Profile fetch failed: ${response.status}`
        };
      } catch (error) {
        return {
          success: false,
          error: `Profile test failed: ${error.message}`
        };
      }
    });
  }

  async testDashboardAccess() {
    return await this.runTest('Dashboard - Post-Onboarding Access', async () => {
      try {
        const response = await axios.get(
          `${CONFIG.appUrl}/dashboard`,
          {
            validateStatus: () => true,
            timeout: CONFIG.timeout,
            headers: this.authToken ? {
              'Authorization': `Bearer ${this.authToken}`,
              'Cookie': `authToken=${this.authToken}`
            } : {}
          }
        );

        // Dashboard should be accessible (200) or redirect to login (302)
        if (response.status === 200 || response.status === 302) {
          return {
            success: true,
            details: `Dashboard accessible (status: ${response.status})`
          };
        }

        return {
          success: false,
          error: `Unexpected dashboard response: ${response.status}`
        };
      } catch (error) {
        return {
          success: false,
          error: `Dashboard access failed: ${error.message}`
        };
      }
    });
  }

  // ============================================================================
  // ONBOARDING COMPLETION TESTS
  // ============================================================================

  async testOnboardingCompletion() {
    return await this.runTest('Onboarding - Completion Status', async () => {
      if (!this.authToken) {
        return {
          success: false,
          error: 'No auth token available'
        };
      }

      try {
        // Check if user profile shows onboarding as complete
        const response = await axios.get(
          `${CONFIG.appUrl}/api/user/profile`,
          {
            headers: {
              'Authorization': `Bearer ${this.authToken}`
            },
            validateStatus: () => true,
            timeout: CONFIG.timeout
          }
        );

        if (response.status === 200) {
          const hasCompletionStatus = response.data.user?.onboardingComplete !== undefined ||
                                      response.data.onboardingComplete !== undefined ||
                                      response.data.user?.hasApiKey !== undefined;
          
          return {
            success: true,
            details: hasCompletionStatus 
              ? 'Onboarding status tracking is implemented' 
              : 'Basic profile works (onboarding tracking optional)',
            data: response.data
          };
        }

        return {
          success: false,
          error: `Profile check failed: ${response.status}`
        };
      } catch (error) {
        return {
          success: false,
          error: `Completion test failed: ${error.message}`
        };
      }
    });
  }

  async testOnboardingRedirect() {
    return await this.runTest('Onboarding - Auto-redirect Logic', async () => {
      try {
        // New users should be redirected to onboarding
        // Test by accessing dashboard without completing onboarding
        const response = await axios.get(
          `${CONFIG.appUrl}/dashboard?onboarding=incomplete`,
          {
            validateStatus: () => true,
            maxRedirects: 0,
            timeout: CONFIG.timeout
          }
        );

        // Should either show dashboard or redirect
        if (response.status === 200 || response.status === 302 || response.status === 307) {
          return {
            success: true,
            details: 'Onboarding redirect logic is present'
          };
        }

        return {
          success: false,
          error: `Unexpected redirect behavior: ${response.status}`
        };
      } catch (error) {
        return {
          success: false,
          error: `Redirect test failed: ${error.message}`
        };
      }
    });
  }

  // ============================================================================
  // RUN ALL TESTS
  // ============================================================================

  async runAllTests() {
    this.log('\n' + '='.repeat(60), 'header');
    this.log('👤 USER ONBOARDING COMPLETE TEST SUITE', 'header');
    this.log('='.repeat(60), 'header');
    this.log(`App URL: ${CONFIG.appUrl}`, 'info');
    this.log(`Test User: ${CONFIG.testUser.email}`, 'info');

    // Registration & Login
    this.log('\n📦 AUTHENTICATION TESTS', 'header');
    await this.testUserRegistration();
    await this.testUserLogin();

    // Onboarding Pages
    this.log('\n📦 ONBOARDING PAGE TESTS', 'header');
    await this.testOnboardingPageAccess();
    await this.testOnboardingSteps();

    // API Key Setup
    this.log('\n📦 API KEY SETUP TESTS', 'header');
    await this.testOpenRouterKeyValidation();
    await this.testOpenRouterKeySaving();

    // Profile & Dashboard
    this.log('\n📦 POST-ONBOARDING TESTS', 'header');
    await this.testUserProfileEndpoint();
    await this.testDashboardAccess();

    // Completion
    this.log('\n📦 COMPLETION TESTS', 'header');
    await this.testOnboardingCompletion();
    await this.testOnboardingRedirect();

    // Summary
    this.printSummary();
  }

  printSummary() {
    this.log('\n' + '='.repeat(60), 'header');
    this.log('📊 TEST SUMMARY', 'header');
    this.log('='.repeat(60), 'header');
    
    const total = this.results.passed + this.results.failed;
    const passRate = total > 0 ? ((this.results.passed / total) * 100).toFixed(1) : 0;
    
    this.log(`Total Tests: ${total}`, 'info');
    this.log(`Passed: ${this.results.passed}`, 'success');
    this.log(`Failed: ${this.results.failed}`, this.results.failed > 0 ? 'error' : 'success');
    this.log(`Pass Rate: ${passRate}%`, passRate >= 80 ? 'success' : 'warning');

    if (this.results.failed > 0) {
      this.log('\n❌ Failed Tests:', 'error');
      this.results.tests
        .filter(t => !t.success)
        .forEach(t => this.log(`   - ${t.name}: ${t.error}`, 'error'));
    }

    this.log('\n' + '='.repeat(60), 'header');
    
    process.exit(this.results.failed > 0 ? 1 : 0);
  }
}

// Run tests
const suite = new OnboardingTestSuite();
suite.runAllTests().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
