/**
 * Authentication Commands
 * Unified authentication system for recoder.xyz CLI
 * Enables cross-platform session synchronization and quota sharing
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { Logger } from '@recoder/shared';
import { backendClient } from '../services/backend-client';
import { billingIntegration } from '../services/billing-integration';
import { webCLIAuthBridge } from '../services/web-cli-auth-bridge';

/**
 * Create authentication command with login, register, status, logout subcommands
 */
export function createAuthCommand(): Command {
  const authCommand = new Command('auth')
    .description('Manage user authentication across all recoder.xyz platforms');

  // Login command with multiple authentication methods
  authCommand
    .command('login')
    .description('Login to your recoder.xyz account')
    .option('-w, --web', 'Use recoder.xyz website for authentication (recommended)')
    .option('-e, --email <email>', 'Your email address')
    .option('-t, --token <token>', 'Login with token instead of email/password')
    .option('-k, --api-key <key>', 'Login with API key')
    .option('-d, --device-flow', 'Use device flow for headless authentication')
    .option('--headless', 'Run in headless mode (forces device flow)')
    .action(async (options) => {
      console.log(chalk.cyan('\n🔐 RECODER - User Authentication\n'));

      try {
        // Check if already logged in
        if (backendClient.isAuthenticated()) {
          const session = backendClient.getCurrentSession() || backendClient.getUnifiedSession();
          const email = ('email' in session! && session.email) || 'authenticated user';
          console.log(chalk.yellow(`Already logged in as ${email}`));
          console.log(chalk.gray('Run "recoder auth logout" to logout first\n'));
          return;
        }

        // Check backend availability
        const isBackendAvailable = await backendClient.isBackendAvailable();
        if (!isBackendAvailable) {
          console.log(chalk.red('❌ Backend server is not available'));
          console.log(chalk.yellow('Please check your internet connection or try again later\n'));
          return;
        }

        // Handle different authentication methods
        if (options.web) {
          // Web-based authentication (recommended)
          console.log(chalk.blue('🌐 Authenticating via recoder.xyz...'));
          
          const webAuth = await webCLIAuthBridge.initiateWebAuth();
          
          console.log(chalk.cyan('\n' + webAuth.instructions.join('\n')));
          
          // Open browser automatically
          await webCLIAuthBridge.openBrowserAuth(webAuth.authUrl);
          
          console.log(chalk.blue('\n⏳ Waiting for authentication in browser...'));
          console.log(chalk.gray('Press Ctrl+C to cancel\n'));
          
          try {
            const token = await webCLIAuthBridge.pollForAuthCompletion(webAuth.deviceCode);
            
            console.log(chalk.green('\n✅ Successfully authenticated via recoder.xyz!'));
            console.log(chalk.white(`📧 User: ${token.email}`));
            console.log(chalk.white(`📋 Plan: ${token.plan.toUpperCase()}`));
            console.log(chalk.white(`🔒 Scopes: ${token.scopes.join(', ')}`));
            console.log(chalk.green('\n🎉 You can now use the CLI with your recoder.xyz account!\n'));
          } catch (authError: any) {
            console.log(chalk.red(`\n❌ Web authentication failed: ${authError.message}`));
            console.log(chalk.yellow('💡 Try: recoder auth login --email <your-email>'));
          }
          return;
        }

        if (options.apiKey) {
          // API Key authentication
          console.log(chalk.blue('🔑 Authenticating with API key...'));
          const success = await backendClient.authenticateWithAPIKey(options.apiKey);
          
          if (success) {
            const unifiedSession = backendClient.getUnifiedSession();
            console.log(chalk.green('\n✅ Successfully authenticated with API key'));
            console.log(chalk.white(`🆔 User ID: ${unifiedSession?.userId}`));
            console.log(chalk.white(`🔒 Scopes: ${unifiedSession?.scopes.join(', ')}`));
            console.log(chalk.green('\n🎉 Your session is now active!\n'));
          } else {
            console.log(chalk.red('\n❌ Invalid API key'));
          }
          return;
        }

        if (options.deviceFlow || options.headless) {
          // Device flow authentication
          console.log(chalk.blue('📱 Initiating device flow authentication...'));
          
          const deviceFlow = await backendClient.initiateDeviceFlow();
          
          console.log(chalk.cyan('\n🔐 Device Authorization Required'));
          console.log(chalk.white(`1. Open this URL in your browser: ${deviceFlow.verificationUri}`));
          console.log(chalk.white(`2. Enter this code: ${chalk.yellow(deviceFlow.userCode)}`));
          console.log(chalk.gray(`\nOr visit: ${deviceFlow.verificationUriComplete}\n`));
          
          console.log(chalk.blue('⏳ Waiting for authorization...'));
          console.log(chalk.gray(`(This will expire in ${Math.floor(deviceFlow.expiresIn / 60)} minutes)\n`));
          
          // Poll for authorization
          const pollInterval = setInterval(async () => {
            try {
              const result = await backendClient.pollDeviceAuthorization(deviceFlow.deviceCode);
              
              if (result.status === 'authorized') {
                clearInterval(pollInterval);
                const unifiedSession = backendClient.getUnifiedSession();
                console.log(chalk.green('✅ Device authorized successfully!'));
                console.log(chalk.white(`🆔 User ID: ${unifiedSession?.userId}`));
                console.log(chalk.white(`📱 Device ID: ${unifiedSession?.deviceId}`));
                console.log(chalk.white(`🔒 Scopes: ${unifiedSession?.scopes.join(', ')}`));
                console.log(chalk.green('\n🎉 Your session is now synced across all platforms!\n'));
                
                // Update platform status
                await backendClient.updatePlatformStatus('cli', true);
              } else if (result.status === 'denied') {
                clearInterval(pollInterval);
                console.log(chalk.red('\n❌ Device authorization was denied'));
              } else if (result.status === 'expired') {
                clearInterval(pollInterval);
                console.log(chalk.red('\n⏰ Device authorization expired. Please try again.'));
              }
            } catch (pollError) {
              clearInterval(pollInterval);
              console.log(chalk.red(`\n❌ Authorization polling failed: ${pollError}`));
            }
          }, deviceFlow.interval * 1000);
          
          // Set timeout to stop polling
          setTimeout(() => {
            clearInterval(pollInterval);
            console.log(chalk.red('\n⏰ Device authorization timed out'));
          }, deviceFlow.expiresIn * 1000);
          
          return;
        }

        // Traditional email/password or token login
        let credentials: any = {};

        if (options.token) {
          // Token-based login
          credentials = { token: options.token };
          console.log(chalk.blue('🎫 Authenticating with token...'));
        } else {
          // Email/password login
          const readline = require('readline');
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });

          const email = options.email || await new Promise<string>((resolve) => {
            rl.question(chalk.cyan('Email: '), resolve);
          });

          const password = await new Promise<string>((resolve) => {
            rl.question(chalk.cyan('Password: '), (answer: string) => {
              resolve(answer);
            });
            rl.stdoutMuted = true;
          });

          rl.close();

          credentials = { email, password };
          console.log(chalk.blue(`\n🔍 Authenticating ${email}...`));
        }

        // Authenticate with traditional method
        const session = await backendClient.authenticate(credentials);

        // Update platform status
        await backendClient.updatePlatformStatus('cli', true);

        // Display success information and billing info
        const billing = await billingIntegration.getUserBilling(session.userId);
        const tier = billing ? billingIntegration.getSubscriptionTiers()[billing.subscription.name] : null;
        
        console.log(chalk.green(`\n✅ Successfully logged in as ${session.email}`));
        console.log(chalk.white(`📋 Plan: ${session.plan.toUpperCase()}`));
        
        if (billing && tier) {
          console.log(chalk.white(`💰 Subscription: ${tier.name.toUpperCase()} ($${tier.price / 100}/month)`));
          console.log(chalk.white(`📊 Usage: ${billing.current_usage}/${tier.requests_per_month === -1 ? '∞' : tier.requests_per_month} requests`));
          console.log(chalk.white(`💳 Status: ${billing.payment_status.toUpperCase()}`));
        } else {
          console.log(chalk.white(`📊 Quota: ${session.quotas.usedRequests}/${session.quotas.totalRequests} requests`));
          console.log(chalk.gray(`🔄 Quota resets: ${new Date(session.quotas.resetDate).toLocaleDateString()}`));
        }

        // Show connected platforms
        const activePlatforms = Object.entries(session.platforms).filter(([_, active]) => active);
        if (activePlatforms.length > 0) {
          console.log(chalk.cyan(`\n🌐 Connected platforms: ${activePlatforms.map(([platform]) => platform).join(', ')}`));
        }

        console.log(chalk.green('\n🎉 Your session is now synced across all recoder.xyz platforms!\n'));

      } catch (error: any) {
        console.log(chalk.red(`\n❌ Login failed: ${error.message}`));
        Logger.error(`Authentication failed: ${error.message}`);
      }
    });

  // Register command
  authCommand
    .command('register')
    .description('Create a new recoder.xyz account')
    .option('-e, --email <email>', 'Your email address')
    .option('-n, --name <name>', 'Your full name')
    .action(async (options) => {
      console.log(chalk.cyan('\n📝 RECODER - Create Account\n'));

      try {
        // Check if already logged in
        if (backendClient.isAuthenticated()) {
          const session = backendClient.getCurrentSession();
          console.log(chalk.yellow(`Already logged in as ${session?.email}`));
          console.log(chalk.gray('Run "recoder auth logout" to logout first\n'));
          return;
        }

        // Check backend availability
        const isBackendAvailable = await backendClient.isBackendAvailable();
        if (!isBackendAvailable) {
          console.log(chalk.red('❌ Backend server is not available'));
          console.log(chalk.yellow('Please check your internet connection or try again later\n'));
          return;
        }

        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        // Collect user information
        const name = options.name || await new Promise<string>((resolve) => {
          rl.question(chalk.cyan('Full name: '), resolve);
        });

        const email = options.email || await new Promise<string>((resolve) => {
          rl.question(chalk.cyan('Email: '), resolve);
        });

        const password = await new Promise<string>((resolve) => {
          rl.question(chalk.cyan('Password: '), (answer: string) => {
            resolve(answer);
          });
          rl.stdoutMuted = true;
        });

        const confirmPassword = await new Promise<string>((resolve) => {
          rl.question(chalk.cyan('\nConfirm password: '), (answer: string) => {
            resolve(answer);
          });
          rl.stdoutMuted = true;
        });

        rl.close();

        // Validate passwords match
        if (password !== confirmPassword) {
          console.log(chalk.red('\n❌ Passwords do not match'));
          return;
        }

        console.log(chalk.blue('\n🚀 Creating your account...'));

        // Register user
        const session = await backendClient.register({ email, password, name });

        // Update platform status
        await backendClient.updatePlatformStatus('cli', true);

        // Display success information
        console.log(chalk.green(`\n🎉 Account created successfully!`));
        console.log(chalk.white(`👋 Welcome ${name}!`));
        console.log(chalk.white(`📧 Email: ${session.email}`));
        console.log(chalk.white(`📋 Plan: ${session.plan.toUpperCase()}`));
        console.log(chalk.white(`📊 Quota: ${session.quotas.totalRequests} requests per month`));

        console.log(chalk.cyan('\n✨ Your account is ready to use across all recoder.xyz platforms!'));
        console.log(chalk.gray('Run "recoder generate" to start building amazing projects\n'));

      } catch (error: any) {
        console.log(chalk.red(`\n❌ Registration failed: ${error.message}`));
        Logger.error(`Registration failed: ${error.message}`);
      }
    });

  // Status command
  authCommand
    .command('status')
    .description('Show current authentication status and quota information')
    .option('--sync', 'Sync session with backend before showing status')
    .action(async (options) => {
      console.log(chalk.cyan('\n👤 RECODER - Account Status\n'));

      try {
        if (!backendClient.isAuthenticated()) {
          console.log(chalk.yellow('❌ Not logged in'));
          console.log(chalk.gray('Run "recoder auth login" to authenticate\n'));
          return;
        }

        // Get both legacy and unified sessions
        let session = backendClient.getCurrentSession();
        let unifiedSession = backendClient.getUnifiedSession();

        // Sync with backend if requested or check availability
        const isBackendAvailable = await backendClient.isBackendAvailable();
        
        if (isBackendAvailable && options.sync) {
          console.log(chalk.blue('🔄 Syncing session with backend...'));
          if (session) {
            const syncedSession = await backendClient.syncSession();
            if (syncedSession) {
              session = syncedSession;
            }
          }
          if (unifiedSession) {
            await backendClient.refreshUnifiedSession();
            unifiedSession = backendClient.getUnifiedSession();
          }
          console.log(chalk.green('✅ Session synced successfully\n'));
        }

        // Display session information
        if (unifiedSession) {
          console.log(chalk.green('🔐 Unified Authentication Active'));
          console.log(chalk.white(`🆔 User ID: ${unifiedSession.userId}`));
          console.log(chalk.white(`📱 Platform: ${unifiedSession.platform.toUpperCase()}`));
          console.log(chalk.white(`🔧 Device ID: ${unifiedSession.deviceId}`));
          console.log(chalk.white(`🔒 Scopes: ${unifiedSession.scopes.join(', ')}`));
          console.log(chalk.white(`⚠️ Risk Level: ${unifiedSession.riskLevel.toUpperCase()}`));
          console.log(chalk.white(`📅 Created: ${new Date(unifiedSession.createdAt).toLocaleDateString()}`));
          console.log(chalk.white(`🕐 Last Used: ${new Date(unifiedSession.lastUsed).toLocaleDateString()}`));
          console.log(chalk.white(`⏰ Expires: ${new Date(unifiedSession.expiresAt).toLocaleDateString()}`));
          
          if (unifiedSession.metadata.type === 'api_key') {
            console.log(chalk.yellow('\n🔑 Authenticated via API Key'));
          }
        } else if (session) {
          console.log(chalk.yellow('📊 Legacy Authentication (consider upgrading)'));
          console.log(chalk.white(`📧 Email: ${session.email}`));
          console.log(chalk.white(`🆔 User ID: ${session.userId}`));
          console.log(chalk.white(`📋 Plan: ${session.plan.toUpperCase()}`));

          // Display quota information
          console.log(chalk.cyan('\n📊 Usage Quota:'));
          const quotaPercentage = Math.round((session.quotas.usedRequests / session.quotas.totalRequests) * 100);
          const quotaColor = quotaPercentage >= 90 ? 'red' : quotaPercentage >= 70 ? 'yellow' : 'green';
          
          console.log(chalk.white(`  Used: ${session.quotas.usedRequests}/${session.quotas.totalRequests} requests (${quotaPercentage}%)`));
          console.log(chalk[quotaColor](`  Status: ${quotaPercentage >= 100 ? 'QUOTA EXCEEDED' : quotaPercentage >= 90 ? 'NEAR LIMIT' : 'HEALTHY'}`));
          console.log(chalk.gray(`  Resets: ${new Date(session.quotas.resetDate).toLocaleDateString()}`));

          // Display platform connections
          console.log(chalk.cyan('\n🌐 Connected Platforms:'));
          Object.entries(session.platforms).forEach(([platform, connected]) => {
            const icon = connected ? '✅' : '❌';
            const status = connected ? 'Connected' : 'Not connected';
            console.log(chalk.white(`  ${icon} ${platform}: ${status}`));
          });
        }

        // Backend connection status
        console.log(chalk.cyan('\n🔗 Backend Connection:'));
        if (isBackendAvailable) {
          console.log(chalk.green('  ✅ Connected - real-time sync enabled'));
        } else {
          console.log(chalk.yellow('  ⚠️ Offline - using cached session data'));
        }

        // Additional session management options
        console.log(chalk.cyan('\n💡 Session Management:'));
        console.log(chalk.white('  recoder auth sessions    # Manage active sessions'));
        console.log(chalk.white('  recoder auth keys        # Manage API keys'));
        console.log(chalk.white('  recoder auth logout      # Sign out'));
        if (!unifiedSession && session) {
          console.log(chalk.yellow('  Consider using "recoder auth login --device-flow" for enhanced security'));
        }

        console.log('');

      } catch (error: any) {
        console.log(chalk.red(`\n❌ Status check failed: ${error.message}`));
        Logger.error(`Status check failed: ${error.message}`);
      }
    });

  // Logout command
  authCommand
    .command('logout')
    .description('Logout from your recoder.xyz account')
    .option('--all-platforms', 'Logout from all platforms (CLI, web, extension, router)')
    .action(async (options) => {
      console.log(chalk.cyan('\n👋 RECODER - Logout\n'));

      try {
        if (!backendClient.isAuthenticated()) {
          console.log(chalk.yellow('❌ Not currently logged in\n'));
          return;
        }

        const session = backendClient.getCurrentSession();
        const unifiedSession = backendClient.getUnifiedSession();
        const userIdentifier = session?.email || unifiedSession?.userId || 'user';
        
        console.log(chalk.blue(`Logging out ${userIdentifier}...`));

        // Update platform status before logout
        if (await backendClient.isBackendAvailable()) {
          await backendClient.updatePlatformStatus('cli', false);
          
          if (options.allPlatforms) {
            console.log(chalk.blue('🌐 Logging out from all platforms...'));
            await backendClient.updatePlatformStatus('web', false);
            await backendClient.updatePlatformStatus('extension', false);
            await backendClient.updatePlatformStatus('router', false);
          }
        }

        // Perform enhanced logout (handles both legacy and unified sessions)
        if (unifiedSession) {
          await backendClient.logoutUnified();
        } else {
          await backendClient.logout();
        }

        console.log(chalk.green('✅ Successfully logged out'));
        
        if (options.allPlatforms) {
          console.log(chalk.gray('You have been logged out from all recoder.xyz platforms'));
        } else {
          console.log(chalk.gray('You remain logged in on other platforms (web, extension, router)'));
          console.log(chalk.gray('Use --all-platforms flag to logout everywhere'));
        }

        console.log(chalk.white('\nRun "recoder auth login" to authenticate again\n'));

      } catch (error: any) {
        console.log(chalk.red(`\n❌ Logout failed: ${error.message}`));
        Logger.error(`Logout failed: ${error.message}`);
      }
    });

  // Session management commands
  authCommand
    .command('sessions')
    .description('Manage authentication sessions')
    .option('--list', 'List all active sessions')
    .option('--revoke <deviceId>', 'Revoke a specific session')
    .option('--revoke-all', 'Revoke all sessions except current')
    .action(async (options) => {
      console.log(chalk.cyan('\n🔐 RECODER - Session Management\n'));

      try {
        if (!backendClient.isAuthenticated()) {
          console.log(chalk.yellow('❌ Not logged in'));
          console.log(chalk.gray('Run "recoder auth login" to authenticate\n'));
          return;
        }

        if (options.revoke) {
          // Revoke specific session
          console.log(chalk.blue(`🗑️ Revoking session ${options.revoke}...`));
          const success = await backendClient.revokeSession(options.revoke);
          
          if (success) {
            console.log(chalk.green('✅ Session revoked successfully'));
          } else {
            console.log(chalk.red('❌ Failed to revoke session'));
          }
          return;
        }

        if (options.revokeAll) {
          // Revoke all other sessions
          console.log(chalk.blue('🗑️ Revoking all other sessions...'));
          const sessions = await backendClient.getActiveSessions();
          const currentDeviceId = backendClient.getUnifiedSession()?.deviceId;
          
          let revokedCount = 0;
          for (const session of sessions) {
            if (session.deviceId !== currentDeviceId) {
              try {
                await backendClient.revokeSession(session.deviceId!);
                revokedCount++;
              } catch (error) {
                console.log(chalk.yellow(`⚠️ Failed to revoke session ${session.deviceId}`));
              }
            }
          }
          
          console.log(chalk.green(`✅ Revoked ${revokedCount} sessions`));
          return;
        }

        // List all sessions (default)
        console.log(chalk.blue('📱 Fetching active sessions...'));
        const sessions = await backendClient.getActiveSessions();
        const currentDeviceId = backendClient.getUnifiedSession()?.deviceId;

        if (sessions.length === 0) {
          console.log(chalk.yellow('No active sessions found\n'));
          return;
        }

        console.log(chalk.white(`\n📱 Active Sessions (${sessions.length}):\n`));

        sessions.forEach((session, index) => {
          const isCurrent = session.deviceId === currentDeviceId;
          const statusColor = isCurrent ? chalk.green : chalk.white;
          const currentLabel = isCurrent ? ' (current)' : '';
          
          console.log(statusColor(`${index + 1}. ${session.platform.toUpperCase()}${currentLabel}`));
          console.log(chalk.gray(`   Device ID: ${session.deviceId}`));
          console.log(chalk.gray(`   Created: ${new Date(session.createdAt).toLocaleDateString()}`));
          console.log(chalk.gray(`   Last used: ${new Date(session.lastUsed).toLocaleDateString()}`));
          console.log(chalk.gray(`   Risk level: ${session.riskLevel}`));
          console.log(chalk.gray(`   Scopes: ${session.scopes.join(', ')}`));
          console.log('');
        });

        console.log(chalk.cyan('💡 Commands:'));
        console.log(chalk.white('  recoder auth sessions --revoke <deviceId>  # Revoke specific session'));
        console.log(chalk.white('  recoder auth sessions --revoke-all         # Revoke all other sessions'));
        console.log('');

      } catch (error: any) {
        console.log(chalk.red(`\n❌ Session management failed: ${error.message}`));
        Logger.error(`Session management failed: ${error.message}`);
      }
    });

  // API Key management commands
  authCommand
    .command('keys')
    .description('Manage API keys')
    .option('--list', 'List all API keys')
    .option('--generate', 'Generate a new API key')
    .option('--revoke <keyId>', 'Revoke an API key')
    .option('--name <name>', 'Name for new API key')
    .option('--scopes <scopes>', 'Comma-separated scopes for new API key')
    .action(async (options) => {
      console.log(chalk.cyan('\n🔑 RECODER - API Key Management\n'));

      try {
        if (!backendClient.isAuthenticated()) {
          console.log(chalk.yellow('❌ Not logged in'));
          console.log(chalk.gray('Run "recoder auth login" to authenticate\n'));
          return;
        }

        if (options.generate) {
          // Generate new API key
          const keyOptions: any = {};
          
          if (options.name) {
            keyOptions.name = options.name;
          }
          
          if (options.scopes) {
            keyOptions.scopes = options.scopes.split(',').map((s: string) => s.trim());
          }

          console.log(chalk.blue('🔑 Generating new API key...'));
          const result = await backendClient.generateAPIKey(keyOptions);
          
          console.log(chalk.green('\n✅ API key generated successfully!'));
          console.log(chalk.yellow('\n⚠️ IMPORTANT: Save this API key securely. It will not be shown again.'));
          console.log(chalk.white(`\n🔑 API Key: ${chalk.cyan(result.apiKey)}`));
          console.log(chalk.white(`🆔 Key ID: ${result.keyId}`));
          console.log(chalk.white(`🔒 Scopes: ${keyOptions.scopes?.join(', ') || 'basic'}`));
          console.log(chalk.gray('\nYou can use this API key with: recoder auth login --api-key <key>\n'));
          return;
        }

        if (options.revoke) {
          // Revoke API key
          console.log(chalk.blue(`🗑️ Revoking API key ${options.revoke}...`));
          const success = await backendClient.revokeAPIKey(options.revoke);
          
          if (success) {
            console.log(chalk.green('✅ API key revoked successfully'));
          } else {
            console.log(chalk.red('❌ Failed to revoke API key'));
          }
          return;
        }

        // List API keys (default)
        console.log(chalk.blue('🔑 Fetching API keys...'));
        const apiKeys = await backendClient.getAPIKeys();

        if (apiKeys.length === 0) {
          console.log(chalk.yellow('No API keys found'));
          console.log(chalk.gray('Run "recoder auth keys --generate" to create one\n'));
          return;
        }

        console.log(chalk.white(`\n🔑 API Keys (${apiKeys.length}):\n`));

        apiKeys.forEach((key, index) => {
          console.log(chalk.white(`${index + 1}. ${key.name}`));
          console.log(chalk.gray(`   Key ID: ${key.keyId}`));
          console.log(chalk.gray(`   Created: ${new Date(key.createdAt).toLocaleDateString()}`));
          console.log(chalk.gray(`   Last used: ${key.lastUsed ? new Date(key.lastUsed).toLocaleDateString() : 'Never'}`));
          console.log(chalk.gray(`   Scopes: ${key.scopes.join(', ')}`));
          console.log('');
        });

        console.log(chalk.cyan('💡 Commands:'));
        console.log(chalk.white('  recoder auth keys --generate --name "My Key"   # Generate new API key'));
        console.log(chalk.white('  recoder auth keys --revoke <keyId>             # Revoke API key'));
        console.log('');

      } catch (error: any) {
        console.log(chalk.red(`\n❌ API key management failed: ${error.message}`));
        Logger.error(`API key management failed: ${error.message}`);
      }
    });

  // Billing management commands
  authCommand
    .command('upgrade')
    .description('Upgrade your subscription plan')
    .option('--plan <plan>', 'Target plan (pro, team, enterprise)')
    .action(async (options) => {
      console.log(chalk.cyan('\n💰 RECODER - Subscription Upgrade\n'));

      try {
        if (!backendClient.isAuthenticated()) {
          console.log(chalk.yellow('❌ Not logged in'));
          console.log(chalk.gray('Run "recoder auth login" to authenticate\n'));
          return;
        }

        const session = backendClient.getCurrentSession();
        if (!session) {
          console.log(chalk.red('❌ No valid session found'));
          return;
        }

        const tiers = billingIntegration.getSubscriptionTiers();
        let targetPlan = options.plan;

        if (!targetPlan) {
          // Show current plan and available upgrades
          const currentBilling = await billingIntegration.getUserBilling(session.userId);
          const currentTier = currentBilling?.subscription.name || 'free';
          
          console.log(chalk.white(`Current plan: ${currentTier.toUpperCase()}\n`));
          console.log(chalk.white('Available plans:\n'));
          
          Object.entries(tiers).forEach(([key, tier]) => {
            const price = tier.price === 0 ? 'Free' : `$${tier.price / 100}/month`;
            const requests = tier.requests_per_month === -1 ? 'Unlimited' : `${tier.requests_per_month.toLocaleString()}`;
            
            console.log(chalk.blue(`  ${tier.name.toUpperCase()}`));
            console.log(chalk.white(`    Price: ${price}`));
            console.log(chalk.white(`    Requests: ${requests}/month`));
            console.log(chalk.white(`    Models: ${tier.models.join(', ')}`));
            console.log(chalk.white(`    Support: ${tier.support_level}\n`));
          });
          
          console.log(chalk.gray('Run "recoder auth upgrade --plan <plan>" to upgrade\n'));
          return;
        }

        if (!tiers[targetPlan]) {
          console.log(chalk.red('❌ Invalid plan. Available plans: pro, team, enterprise'));
          return;
        }

        const tier = tiers[targetPlan];
        console.log(chalk.blue(`🚀 Upgrading to ${tier.name.toUpperCase()} plan...`));
        console.log(chalk.white(`Price: $${tier.price / 100}/month`));
        console.log(chalk.white(`Requests: ${tier.requests_per_month === -1 ? 'Unlimited' : tier.requests_per_month.toLocaleString()}/month\n`));

        const checkout = await billingIntegration.createCheckoutSession(session.userId, targetPlan);
        
        console.log(chalk.green('✅ Checkout session created'));
        console.log(chalk.blue('🌐 Opening payment page...'));
        console.log(chalk.blue(`If browser doesn't open, visit: ${checkout.checkout_url}\n`));

        try {
          const open = await import('open');
          await open.default(checkout.checkout_url);
        } catch (error) {
          console.log(chalk.yellow('⚠️ Failed to open browser automatically'));
        }

        console.log(chalk.yellow('⏳ Complete payment in browser, then run "recoder auth status" to verify upgrade\n'));

      } catch (error: any) {
        console.log(chalk.red(`\n❌ Upgrade failed: ${error.message}`));
        Logger.error(`Subscription upgrade failed: ${error.message}`);
      }
    });

  // Usage analytics command
  authCommand
    .command('usage')
    .description('Show usage analytics and cost savings')
    .option('--detailed', 'Show detailed breakdown')
    .action(async (options) => {
      console.log(chalk.cyan('\n📊 RECODER - Usage Analytics\n'));

      try {
        if (!backendClient.isAuthenticated()) {
          console.log(chalk.yellow('❌ Not logged in'));
          console.log(chalk.gray('Run "recoder auth login" to authenticate\n'));
          return;
        }

        const session = backendClient.getCurrentSession();
        if (!session) {
          console.log(chalk.red('❌ No valid session found'));
          return;
        }

        console.log(chalk.blue('📈 Fetching usage data...'));
        
        const [analytics, savings, billing] = await Promise.all([
          billingIntegration.getUsageAnalytics(session.userId),
          billingIntegration.getCostSavings(session.userId),
          billingIntegration.getUserBilling(session.userId)
        ]);

        const tier = billing ? billingIntegration.getSubscriptionTiers()[billing.subscription.name] : null;

        // Current usage summary
        console.log(chalk.green('\n📊 Current Usage:'));
        console.log(chalk.white(`  Requests this period: ${analytics.current_period_usage.toLocaleString()}`));
        console.log(chalk.white(`  Daily average: ${analytics.daily_average.toFixed(1)} requests`));
        
        if (tier && tier.requests_per_month > 0) {
          const usagePercent = (analytics.current_period_usage / tier.requests_per_month * 100).toFixed(1);
          const remaining = tier.requests_per_month - analytics.current_period_usage;
          console.log(chalk.white(`  Quota usage: ${usagePercent}% (${remaining.toLocaleString()} remaining)`));
        }

        // Cost savings
        console.log(chalk.green('\n💰 Cost Analysis:'));
        console.log(chalk.white(`  Your plan cost: $${savings.current_plan_cost.toFixed(2)}/month`));
        console.log(chalk.white(`  Equivalent API cost: $${savings.api_cost_equivalent.toFixed(2)}/month`));
        console.log(chalk.white(`  Monthly savings: ${chalk.green(`$${savings.monthly_savings.toFixed(2)} (${savings.savings_percentage.toFixed(1)}%)`)}`));

        // Detailed breakdown
        if (options.detailed && analytics.most_used_models.length > 0) {
          console.log(chalk.green('\n🤖 Model Usage:'));
          analytics.most_used_models.slice(0, 5).forEach((model, index) => {
            console.log(chalk.white(`  ${index + 1}. ${model.model}: ${model.count} requests ($${model.cost.toFixed(2)})`));
          });
        }

        if (options.detailed && analytics.cost_breakdown.length > 0) {
          console.log(chalk.green('\n📈 Daily Costs (last 7 days):'));
          analytics.cost_breakdown.slice(-7).forEach(day => {
            console.log(chalk.white(`  ${day.date}: $${day.cost.toFixed(2)}`));
          });
        }

        // Recommendations
        console.log(chalk.green('\n💡 Recommendations:'));
        if (savings.savings_percentage < 50) {
          console.log(chalk.yellow('  Consider upgrading to a higher tier for better cost efficiency'));
        } else {
          console.log(chalk.green('  Great job! You\'re maximizing your savings'));
        }
        
        if (tier && tier.requests_per_month > 0 && analytics.current_period_usage > tier.requests_per_month * 0.8) {
          console.log(chalk.yellow('  You\'re approaching your quota limit - consider upgrading'));
        }

        console.log('');

      } catch (error: any) {
        console.log(chalk.red(`\n❌ Usage analytics failed: ${error.message}`));
        Logger.error(`Usage analytics failed: ${error.message}`);
      }
    });

  return authCommand;
}

export default createAuthCommand;