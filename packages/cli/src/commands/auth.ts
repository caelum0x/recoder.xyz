/**
 * Authentication Commands
 * Unified authentication system for recoder.xyz CLI
 * Enables cross-platform session synchronization and quota sharing
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { Logger } from '@recoder/shared';
import { backendClient } from '../services/backend-client';

/**
 * Create authentication command with login, register, status, logout subcommands
 */
export function createAuthCommand(): Command {
  const authCommand = new Command('auth')
    .description('Manage user authentication across all recoder.xyz platforms');

  // Login command
  authCommand
    .command('login')
    .description('Login to your recoder.xyz account')
    .option('-e, --email <email>', 'Your email address')
    .option('-t, --token <token>', 'Login with token instead of email/password')
    .action(async (options) => {
      console.log(chalk.cyan('\n🔐 RECODER - User Authentication\n'));

      try {
        // Check if already logged in
        if (backendClient.isAuthenticated()) {
          const session = backendClient.getCurrentSession();
          console.log(chalk.yellow(`Already logged in as ${session?.email}`));
          console.log(chalk.gray('Run "recoder auth logout" to logout first\n'));
          return;
        }

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
            rl.question(chalk.cyan('Password: '), (answer) => {
              resolve(answer);
            });
            rl.stdoutMuted = true;
          });

          rl.close();

          credentials = { email, password };
          console.log(chalk.blue(`\n🔍 Authenticating ${email}...`));
        }

        // Check backend availability
        const isBackendAvailable = await backendClient.isBackendAvailable();
        if (!isBackendAvailable) {
          console.log(chalk.red('❌ Backend server is not available'));
          console.log(chalk.yellow('Please check your internet connection or try again later\n'));
          return;
        }

        // Authenticate
        const session = await backendClient.authenticate(credentials);

        // Update platform status
        await backendClient.updatePlatformStatus('cli', true);

        // Display success information
        console.log(chalk.green(`\n✅ Successfully logged in as ${session.email}`));
        console.log(chalk.white(`📋 Plan: ${session.plan.toUpperCase()}`));
        console.log(chalk.white(`📊 Quota: ${session.quotas.usedRequests}/${session.quotas.totalRequests} requests`));
        console.log(chalk.gray(`🔄 Quota resets: ${new Date(session.quotas.resetDate).toLocaleDateString()}`));

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
          rl.question(chalk.cyan('Password: '), (answer) => {
            resolve(answer);
          });
          rl.stdoutMuted = true;
        });

        const confirmPassword = await new Promise<string>((resolve) => {
          rl.question(chalk.cyan('\nConfirm password: '), (answer) => {
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

        let session = backendClient.getCurrentSession()!;

        // Sync with backend if requested or check availability
        const isBackendAvailable = await backendClient.isBackendAvailable();
        
        if (isBackendAvailable && options.sync) {
          console.log(chalk.blue('🔄 Syncing session with backend...'));
          const syncedSession = await backendClient.syncSession();
          if (syncedSession) {
            session = syncedSession;
            console.log(chalk.green('✅ Session synced successfully\n'));
          }
        }

        // Display user information
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

        // Backend connection status
        console.log(chalk.cyan('\n🔗 Backend Connection:'));
        if (isBackendAvailable) {
          console.log(chalk.green('  ✅ Connected - real-time sync enabled'));
        } else {
          console.log(chalk.yellow('  ⚠️ Offline - using cached session data'));
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

        const session = backendClient.getCurrentSession()!;
        console.log(chalk.blue(`Logging out ${session.email}...`));

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

        // Perform logout
        await backendClient.logout();

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

  return authCommand;
}

export default createAuthCommand;