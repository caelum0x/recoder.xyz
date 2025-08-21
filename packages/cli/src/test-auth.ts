/**
 * Test CLI Authentication
 * Simple test script to verify authentication flows
 */

import AuthService from './services/auth-service';
import chalk from 'chalk';

async function testAuth() {
  console.log(chalk.cyan('\n🔐 Testing CLI Authentication System\n'));

  const authService = new AuthService({
    webAuthUrl: 'http://localhost:3000',
    apiUrl: 'http://localhost:3000/api/auth/cli',
    clientId: 'recoder-cli-test',
    redirectPort: 8080
  });

  try {
    // Initialize auth service
    await authService.initialize();
    
    if (authService.isAuthenticated()) {
      const session = authService.getSession()!;
      console.log(chalk.green('✅ Already authenticated!'));
      console.log(chalk.white(`👤 User: ${session.user.name} (${session.user.email})`));
      console.log(chalk.white(`📋 Plan: ${session.user.subscription_plan}`));
      console.log(chalk.white(`🎯 Quota: ${session.user.quota.requests_remaining}/${session.user.quota.requests_limit}`));
      return;
    }

    console.log(chalk.yellow('No existing authentication found.'));
    console.log(chalk.blue('\n📱 Starting device flow authentication...'));

    // Test device flow
    const session = await authService.authenticateWithDeviceFlow();
    
    console.log(chalk.green('\n✅ Authentication successful!'));
    console.log(chalk.white(`👤 User: ${session.user.name} (${session.user.email})`));
    console.log(chalk.white(`📋 Plan: ${session.user.subscription_plan}`));
    console.log(chalk.white(`🎯 Quota: ${session.user.quota.requests_remaining}/${session.user.quota.requests_limit}`));

  } catch (error: any) {
    console.log(chalk.red(`\n❌ Authentication failed: ${error.message}`));
  }
}

// Run the test if called directly
if (require.main === module) {
  testAuth().catch(console.error);
}

export { testAuth };