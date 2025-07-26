/**
 * Authentication commands
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import boxen from 'boxen';
import open from 'open';
import { Logger } from '../../../shared/src/logger';
import { AuthService } from '../services/auth';
import { ConfigManager } from '../utils/config';

export function setupAuthCommands(program: Command): void {
  const auth = program
    .command('auth')
    .description('Authentication and account management');

  // Login command
  auth
    .command('login')
    .description('Login to your Recoder account')
    .option('-e, --email <email>', 'email address')
    .option('-p, --password <password>', 'password')
    .option('-t, --token <token>', 'API token')
    .option('--browser', 'use browser-based OAuth login')
    .action(async (options) => {
      try {
        await handleLogin(options);
      } catch (error) {
        Logger.error(`Login failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Register command
  auth
    .command('register')
    .description('Register a new Recoder account')
    .option('-e, --email <email>', 'email address')
    .option('-u, --username <username>', 'username')
    .option('-p, --password <password>', 'password')
    .option('--browser', 'use browser-based registration')
    .action(async (options) => {
      try {
        await handleRegister(options);
      } catch (error) {
        Logger.error(`Registration failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Logout command
  auth
    .command('logout')
    .description('Logout from your Recoder account')
    .option('-a, --all', 'logout from all devices')
    .action(async (options) => {
      try {
        await handleLogout(options);
      } catch (error) {
        Logger.error(`Logout failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Whoami command
  auth
    .command('whoami')
    .description('Display current user information')
    .option('-j, --json', 'output as JSON')
    .option('-v, --verbose', 'show detailed information')
    .action(async (options) => {
      try {
        await handleWhoami(options);
      } catch (error) {
        Logger.error(`Failed to get user info: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Status command (includes subscription info)
  auth
    .command('status')
    .description('Show authentication and subscription status')
    .option('-j, --json', 'output as JSON')
    .action(async (options) => {
      try {
        await handleStatus(options);
      } catch (error) {
        Logger.error(`Failed to get status: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Usage command
  auth
    .command('usage')
    .description('Show detailed usage statistics and limits')
    .option('-j, --json', 'output as JSON')
    .action(async (options) => {
      try {
        await handleUsage(options);
      } catch (error) {
        Logger.error(`Failed to get usage info: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Upgrade command
  auth
    .command('upgrade')
    .description('Upgrade your subscription plan')
    .action(async () => {
      try {
        await handleUpgrade();
      } catch (error) {
        Logger.error(`Failed to open upgrade page: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Token command
  auth
    .command('token')
    .description('Manage API tokens')
    .option('-c, --create', 'create new token')
    .option('-l, --list', 'list existing tokens')
    .option('-r, --revoke <tokenId>', 'revoke a token')
    .action(async (options) => {
      try {
        await handleToken(options);
      } catch (error) {
        Logger.error(`Token management failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });
}

async function handleLogin(options: any): Promise<void> {
  console.log(
    boxen(
      chalk.cyan('🔐 Recoder Login'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  if (options.browser) {
    await handleBrowserLogin();
    return;
  }

  if (options.token) {
    await handleTokenLogin(options.token);
    return;
  }

  // Interactive login
  const credentials = await inquirer.prompt([
    {
      type: 'input',
      name: 'email',
      message: 'Email address:',
      default: options.email,
      validate: (input) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(input) || 'Please enter a valid email address';
      },
    },
    {
      type: 'password',
      name: 'password',
      message: 'Password:',
      default: options.password,
      mask: '*',
    },
  ]);

  const spinner = ora('Logging in...').start();

  try {
    const result = await AuthService.login(credentials.email, credentials.password);
    
    if (result.success) {
      spinner.succeed(chalk.green('Successfully logged in!'));
      
      // Save authentication
      ConfigManager.set('auth.token', result.token);
      ConfigManager.set('auth.user', result.user);
      
      console.log(
        boxen(
          chalk.white(`Welcome back, ${result.user.name}!\n`) +
          chalk.gray(`Account: ${result.user.email}\n`) +
          chalk.gray(`Plan: ${result.user.plan || 'Free'}`),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'green',
          }
        )
      );
    } else {
      spinner.fail(chalk.red('Login failed'));
      console.log(chalk.red(result.error || 'Invalid credentials'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Login failed'));
    throw error;
  }
}

async function handleBrowserLogin(): Promise<void> {
  const spinner = ora('Opening browser for authentication...').start();
  
  try {
    const authUrl = await AuthService.getBrowserAuthUrl();
    await open(authUrl);
    
    spinner.text = 'Waiting for authentication...';
    
    const result = await AuthService.waitForBrowserAuth();
    
    if (result.success) {
      spinner.succeed(chalk.green('Successfully logged in via browser!'));
      
      ConfigManager.set('auth.token', result.token);
      ConfigManager.set('auth.user', result.user);
      
      console.log(
        boxen(
          chalk.white(`Welcome, ${result.user.name}!`),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'green',
          }
        )
      );
    } else {
      spinner.fail(chalk.red('Browser authentication failed'));
      console.log(chalk.red(result.error || 'Authentication cancelled or timed out'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Browser authentication failed'));
    throw error;
  }
}

async function handleTokenLogin(token: string): Promise<void> {
  const spinner = ora('Validating token...').start();
  
  try {
    const result = await AuthService.validateToken(token);
    
    if (result.success) {
      spinner.succeed(chalk.green('Token validated successfully!'));
      
      ConfigManager.set('auth.token', token);
      ConfigManager.set('auth.user', result.user);
      
      console.log(
        boxen(
          chalk.white(`Logged in as ${result.user.name}`),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'green',
          }
        )
      );
    } else {
      spinner.fail(chalk.red('Invalid token'));
      console.log(chalk.red(result.error || 'Token validation failed'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Token validation failed'));
    throw error;
  }
}

async function handleRegister(options: any): Promise<void> {
  console.log(
    boxen(
      chalk.cyan('📝 Recoder Registration'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  if (options.browser) {
    const authUrl = await AuthService.getBrowserRegisterUrl();
    await open(authUrl);
    console.log(chalk.yellow('Browser opened for registration. Complete the process and then run "codecraft auth login"'));
    return;
  }

  // Interactive registration
  const details = await inquirer.prompt([
    {
      type: 'input',
      name: 'email',
      message: 'Email address:',
      default: options.email,
      validate: (input) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(input) || 'Please enter a valid email address';
      },
    },
    {
      type: 'input',
      name: 'username',
      message: 'Username:',
      default: options.username,
      validate: (input) => {
        return input.length >= 3 || 'Username must be at least 3 characters long';
      },
    },
    {
      type: 'password',
      name: 'password',
      message: 'Password:',
      default: options.password,
      mask: '*',
      validate: (input) => {
        return input.length >= 8 || 'Password must be at least 8 characters long';
      },
    },
    {
      type: 'password',
      name: 'confirmPassword',
      message: 'Confirm password:',
      mask: '*',
      validate: (input, answers) => {
        return input === answers?.password || 'Passwords do not match';
      },
    },
    {
      type: 'confirm',
      name: 'terms',
      message: 'I accept the Terms of Service and Privacy Policy:',
      default: false,
    },
  ]);

  if (!details.terms) {
    console.log(chalk.yellow('Registration cancelled. You must accept the terms to continue.'));
    return;
  }

  const spinner = ora('Creating account...').start();

  try {
    const result = await AuthService.register({
      email: details.email,
      username: details.username,
      password: details.password,
    });
    
    if (result.success) {
      spinner.succeed(chalk.green('Account created successfully!'));
      
      console.log(
        boxen(
          chalk.white('🎉 Welcome to Recoder!\n') +
          chalk.gray('Please check your email to verify your account.\n') +
          chalk.gray('Then run "recoder auth login" to get started.'),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'green',
          }
        )
      );
    } else {
      spinner.fail(chalk.red('Registration failed'));
      console.log(chalk.red(result.error || 'Registration error'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Registration failed'));
    throw error;
  }
}

async function handleLogout(options: any): Promise<void> {
  const currentUser = ConfigManager.get('auth.user');
  
  if (!currentUser) {
    console.log(chalk.yellow('You are not currently logged in.'));
    return;
  }

  const confirmed = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'logout',
      message: `Logout from account "${currentUser.email}"?`,
      default: true,
    },
  ]);

  if (!confirmed.logout) {
    console.log(chalk.yellow('Logout cancelled.'));
    return;
  }

  const spinner = ora('Logging out...').start();

  try {
    const token = ConfigManager.get('auth.token');
    
    if (token) {
      await AuthService.logout(token, options.all);
    }
    
    // Clear local authentication
    ConfigManager.delete('auth.token');
    ConfigManager.delete('auth.user');
    
    spinner.succeed(chalk.green('Successfully logged out!'));
    
    console.log(
      boxen(
        chalk.white('👋 Goodbye!\n') +
        chalk.gray('You have been logged out of Recoder.'),
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'yellow',
        }
      )
    );
  } catch (error) {
    spinner.fail(chalk.red('Logout failed'));
    throw error;
  }
}

async function handleWhoami(options: any): Promise<void> {
  const currentUser = ConfigManager.get('auth.user');
  const currentToken = ConfigManager.get('auth.token');
  
  if (!currentUser || !currentToken) {
    console.log(chalk.yellow('You are not currently logged in.'));
    console.log(chalk.gray('Run "recoder auth login" to authenticate.'));
    return;
  }

  const spinner = ora('Fetching user information...').start();

  try {
    const result = await AuthService.getCurrentUser(currentToken);
    
    if (result.success) {
      spinner.succeed(chalk.green('User information retrieved'));
      
      const user = result.user;
      
      if (options.json) {
        console.log(JSON.stringify(user, null, 2));
      } else {
        console.log(
          boxen(
            chalk.white(`👤 ${user.name}\n`) +
            chalk.gray(`Email: ${user.email}\n`) +
            chalk.gray(`Username: ${user.username}\n`) +
            chalk.gray(`Plan: ${user.plan || 'Free'}\n`) +
            chalk.gray(`Joined: ${new Date(user.createdAt).toLocaleDateString()}\n`) +
            (options.verbose ? chalk.gray(`User ID: ${user.id}\n`) : '') +
            (options.verbose ? chalk.gray(`Last login: ${new Date(user.lastLogin).toLocaleString()}`) : ''),
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'cyan',
              title: 'Current User',
            }
          )
        );
        
        if (options.verbose && user.usage) {
          console.log(
            boxen(
              chalk.white('📊 Usage Statistics\n') +
              chalk.gray(`Projects created: ${user.usage.projects}\n`) +
              chalk.gray(`Code generations: ${user.usage.generations}\n`) +
              chalk.gray(`API calls this month: ${user.usage.apiCalls}`),
              {
                padding: 1,
                borderStyle: 'round',
                borderColor: 'blue',
                title: 'Usage',
              }
            )
          );
        }
      }
    } else {
      spinner.fail(chalk.red('Failed to get user information'));
      console.log(chalk.red(result.error || 'Authentication may have expired'));
      console.log(chalk.yellow('Try running "recoder auth login" again.'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Failed to get user information'));
    throw error;
  }
}

async function handleToken(options: any): Promise<void> {
  const currentToken = ConfigManager.get('auth.token');
  
  if (!currentToken) {
    console.log(chalk.yellow('You are not currently logged in.'));
    return;
  }

  if (options.create) {
    await createToken(currentToken);
  } else if (options.list) {
    await listTokens(currentToken);
  } else if (options.revoke) {
    await revokeToken(currentToken, options.revoke);
  } else {
    console.log(chalk.yellow('Please specify an action: --create, --list, or --revoke <tokenId>'));
  }
}

async function createToken(authToken: string): Promise<void> {
  const details = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Token name:',
      validate: (input) => input.length > 0 || 'Token name is required',
    },
    {
      type: 'list',
      name: 'scope',
      message: 'Token scope:',
      choices: [
        { name: 'Read-only', value: 'read' },
        { name: 'Read and Write', value: 'write' },
        { name: 'Full access', value: 'admin' },
      ],
    },
    {
      type: 'input',
      name: 'expiresIn',
      message: 'Expires in (days, leave empty for no expiration):',
      validate: (input) => {
        if (!input) return true;
        const days = parseInt(input);
        return !isNaN(days) && days > 0 || 'Please enter a valid number of days';
      },
    },
  ]);

  const spinner = ora('Creating token...').start();

  try {
    const result = await AuthService.createToken(authToken, {
      name: details.name,
      scope: details.scope,
      expiresIn: details.expiresIn ? parseInt(details.expiresIn) : undefined,
    });
    
    if (result.success) {
      spinner.succeed(chalk.green('Token created successfully!'));
      
      console.log(
        boxen(
          chalk.white(`🔑 New API Token\n`) +
          chalk.gray(`Name: ${result.token.name}\n`) +
          chalk.gray(`Token: ${result.token.value}\n`) +
          chalk.yellow(`⚠️  Save this token now - you won't see it again!`),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'green',
          }
        )
      );
    } else {
      spinner.fail(chalk.red('Token creation failed'));
      console.log(chalk.red(result.error || 'Unknown error'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Token creation failed'));
    throw error;
  }
}

async function listTokens(authToken: string): Promise<void> {
  const spinner = ora('Fetching tokens...').start();

  try {
    const result = await AuthService.listTokens(authToken);
    
    if (result.success) {
      spinner.succeed(chalk.green('Tokens retrieved'));
      
      if (result.tokens.length === 0) {
        console.log(chalk.yellow('No API tokens found.'));
        return;
      }
      
      console.log(
        boxen(
          chalk.white('🔑 API Tokens\n') +
          result.tokens.map((token: any) => 
            chalk.gray(`• ${token.name} (${token.scope}) - `) +
            (token.expiresAt ? chalk.yellow(`Expires: ${new Date(token.expiresAt).toLocaleDateString()}`) : chalk.green('Never expires'))
          ).join('\n'),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'cyan',
          }
        )
      );
    } else {
      spinner.fail(chalk.red('Failed to fetch tokens'));
      console.log(chalk.red(result.error || 'Unknown error'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Failed to fetch tokens'));
    throw error;
  }
}

async function revokeToken(authToken: string, tokenId: string): Promise<void> {
  const confirmed = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'revoke',
      message: `Revoke token "${tokenId}"?`,
      default: false,
    },
  ]);

  if (!confirmed.revoke) {
    console.log(chalk.yellow('Token revocation cancelled.'));
    return;
  }

  const spinner = ora('Revoking token...').start();

  try {
    const result = await AuthService.revokeToken(authToken, tokenId);
    
    if (result.success) {
      spinner.succeed(chalk.green('Token revoked successfully!'));
    } else {
      spinner.fail(chalk.red('Token revocation failed'));
      console.log(chalk.red(result.error || 'Unknown error'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Token revocation failed'));
    throw error;
  }
}

async function handleStatus(options: any): Promise<void> {
  console.log(chalk.blue('🔐 Recoder.xyz Status'));
  console.log();

  const currentUser = ConfigManager.get('auth.user');
  const currentToken = ConfigManager.get('auth.token');

  if (!currentUser || !currentToken) {
    console.log(chalk.yellow('❌ Not authenticated'));
    console.log(chalk.gray('Available features:'));
    console.log(chalk.gray('  • Local AI models (Ollama)'));
    console.log(chalk.gray('  • Basic CLI functionality'));
    console.log(chalk.gray('  • Community support'));
    console.log();
    console.log(chalk.blue('💡 Login to access premium features:'));
    console.log(chalk.gray('   recoder auth login'));
    return;
  }

  const spinner = ora('Checking subscription status...').start();

  try {
    const result = await AuthService.getCurrentUser(currentToken);
    const subscription = await AuthService.getSubscription(currentToken);
    
    if (!result.success || !subscription.success) {
      spinner.fail(chalk.red('Failed to fetch account information'));
      return;
    }

    spinner.stop();

    const user = result.user;
    const sub = subscription.data;

    if (!sub) {
      console.log(chalk.red('❌ No subscription data available'));
      return;
    }

    if (options.json) {
      console.log(JSON.stringify({ user, subscription: sub }, null, 2));
      return;
    }

    console.log(chalk.green('✅ Authenticated'));
    console.log();
    
    // User info
    console.log(chalk.bold('Account Information:'));
    console.log(`  Email: ${chalk.cyan(user.email)}`);
    console.log(`  Plan: ${chalk.cyan(sub.plan.toUpperCase())}`);
    console.log(`  Status: ${sub.isActive ? chalk.green('Active') : chalk.red('Inactive')}`);
    
    if (sub.expiresAt) {
      const expiresAt = new Date(sub.expiresAt);
      const isExpiringSoon = expiresAt.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000; // 7 days
      console.log(`  Expires: ${isExpiringSoon ? chalk.yellow(expiresAt.toLocaleDateString()) : chalk.gray(expiresAt.toLocaleDateString())}`);
    }
    
    console.log();

    // Usage info for paid plans
    if (sub.plan !== 'free' && sub.usage) {
      console.log(chalk.bold('Usage This Month:'));
      const tokenPercent = Math.round((sub.usage.tokensUsed / sub.usage.tokensLimit) * 100);
      const requestPercent = Math.round((sub.usage.requestsUsed / sub.usage.requestsLimit) * 100);
      
      console.log(`  Tokens: ${chalk.cyan(sub.usage.tokensUsed.toLocaleString())} / ${chalk.gray(sub.usage.tokensLimit.toLocaleString())} (${tokenPercent}%)`);
      console.log(`  Requests: ${chalk.cyan(sub.usage.requestsUsed.toLocaleString())} / ${chalk.gray(sub.usage.requestsLimit.toLocaleString())} (${requestPercent}%)`);
      
      if (tokenPercent > 80 || requestPercent > 80) {
        console.log(chalk.yellow('  ⚠️ High usage detected - consider upgrading'));
      }
      
      console.log(`  Resets: ${chalk.gray(new Date(sub.usage.resetDate).toLocaleDateString())}`);
      console.log();
    }

    // Available features
    console.log(chalk.bold('Available Features:'));
    const features = getFeaturesByPlan(sub.plan);
    features.forEach(feature => {
      console.log(`  ${chalk.green('✅')} ${feature}`);
    });

    // Upgrade suggestions
    if (sub.plan === 'free') {
      console.log();
      console.log(chalk.blue('💡 Upgrade to Premium ($20/month) for more features:'));
      console.log(chalk.gray('   • Cloud AI models (Claude, GPT, Gemini, Groq)'));
      console.log(chalk.gray('   • Production engine access'));
      console.log(chalk.gray('   • Priority support'));
      console.log(chalk.gray('   • Advanced templates'));
      console.log(chalk.blue('   Run: recoder auth upgrade'));
    } else if (sub.plan === 'premium') {
      console.log();
      console.log(chalk.blue('💡 Upgrade to Pro ($100/month) for 5x more usage:'));
      console.log(chalk.gray('   • 10M tokens vs 2M tokens'));
      console.log(chalk.gray('   • 50K requests vs 10K requests'));
      console.log(chalk.gray('   • Team collaboration'));
      console.log(chalk.blue('   Run: recoder auth upgrade'));
    }

  } catch (error) {
    spinner.fail(chalk.red('Failed to fetch subscription status'));
    console.log(chalk.gray('Error: ' + (error as Error).message));
    console.log();
    console.log(chalk.blue('💡 Try logging out and back in:'));
    console.log(chalk.gray('   recoder auth logout && recoder auth login'));
  }
}

async function handleUsage(options: any): Promise<void> {
  const currentToken = ConfigManager.get('auth.token');
  
  if (!currentToken) {
    console.log(chalk.yellow('❌ Please login first: recoder auth login'));
    return;
  }

  const spinner = ora('Fetching usage data...').start();

  try {
    const subscription = await AuthService.getSubscription(currentToken);
    
    if (!subscription.success) {
      spinner.fail(chalk.red('Failed to fetch usage data'));
      return;
    }

    spinner.stop();
    const sub = subscription.data;

    if (!sub) {
      console.log(chalk.red('❌ No subscription data available'));
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(sub.usage, null, 2));
      return;
    }

    console.log(chalk.blue('📊 Usage Statistics'));
    console.log();

    if (sub.plan === 'free') {
      console.log(chalk.gray('Free plan - unlimited local model usage'));
      console.log(chalk.gray('Upgrade to premium for cloud AI models'));
      console.log();
      console.log(chalk.blue('💡 Run: recoder auth upgrade'));
      return;
    }

    const { usage } = sub;
    if (!usage) {
      console.log(chalk.gray('No usage data available'));
      return;
    }

    const tokenPercent = Math.round((usage.tokensUsed / usage.tokensLimit) * 100);
    const requestPercent = Math.round((usage.requestsUsed / usage.requestsLimit) * 100);

    console.log(chalk.bold('Current Month:'));
    console.log();

    // Token usage with progress bar
    console.log('Tokens:');
    console.log(`  ${chalk.cyan(usage.tokensUsed.toLocaleString())} / ${usage.tokensLimit.toLocaleString()} (${tokenPercent}%)`);
    console.log(`  ${createProgressBar(tokenPercent)}`);
    console.log();

    // Request usage with progress bar  
    console.log('Requests:');
    console.log(`  ${chalk.cyan(usage.requestsUsed.toLocaleString())} / ${usage.requestsLimit.toLocaleString()} (${requestPercent}%)`);
    console.log(`  ${createProgressBar(requestPercent)}`);
    console.log();

    console.log(`Resets on: ${chalk.gray(new Date(usage.resetDate).toLocaleDateString())}`);

    // Warnings
    if (tokenPercent > 90 || requestPercent > 90) {
      console.log();
      console.log(chalk.red('⚠️ Warning: Usage is very high'));
      console.log(chalk.gray('Consider upgrading your plan or wait for monthly reset'));
    } else if (tokenPercent > 75 || requestPercent > 75) {
      console.log();
      console.log(chalk.yellow('⚠️ Notice: Usage is high'));
      console.log(chalk.gray('Monitor usage to avoid hitting limits'));
    }

  } catch (error) {
    spinner.fail(chalk.red('Failed to fetch usage data'));
    console.log(chalk.gray('Error: ' + (error as Error).message));
  }
}

async function handleUpgrade(): Promise<void> {
  console.log(chalk.blue('🚀 Upgrade Your Recoder.xyz Plan'));
  console.log();

  const currentToken = ConfigManager.get('auth.token');
  
  if (!currentToken) {
    console.log(chalk.yellow('❌ Please login first: recoder auth login'));
    return;
  }

  try {
    // Get current subscription
    const subscription = await AuthService.getSubscription(currentToken);
    
    if (subscription.success && subscription.data) {
      const currentPlan = subscription.data.plan;
      console.log(chalk.gray(`Current plan: ${currentPlan.toUpperCase()}`));
      console.log();
    }

    // Show pricing options
    console.log(chalk.bold('Available Plans:'));
    console.log();
    
    console.log(chalk.cyan('📦 Premium - $20/month'));
    console.log(chalk.gray('  • Cloud AI models (Claude, GPT, Gemini, Groq)'));
    console.log(chalk.gray('  • 2M tokens/month (~$15 cost to us)'));
    console.log(chalk.gray('  • 10K requests/month'));
    console.log(chalk.gray('  • Production engine access'));
    console.log(chalk.gray('  • Priority support'));
    console.log();
    
    console.log(chalk.cyan('🚀 Pro - $100/month'));
    console.log(chalk.gray('  • Everything in Premium'));
    console.log(chalk.gray('  • 10M tokens/month (5x more)'));
    console.log(chalk.gray('  • 50K requests/month (5x more)'));
    console.log(chalk.gray('  • Team collaboration'));
    console.log(chalk.gray('  • Phone support'));
    console.log();
    
    console.log(chalk.cyan('🏢 Enterprise - Custom pricing'));
    console.log(chalk.gray('  • Unlimited usage'));
    console.log(chalk.gray('  • On-premise deployment'));
    console.log(chalk.gray('  • SLA guarantees'));
    console.log(chalk.gray('  • Dedicated support'));
    console.log();

    // Confirm and open browser
    const confirmed = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'upgrade',
        message: 'Open pricing page to upgrade?',
        default: true,
      },
    ]);

    if (confirmed.upgrade) {
      const upgradeUrl = 'https://recoder.xyz/pricing?utm_source=cli&utm_campaign=upgrade';
      console.log(chalk.blue('🌐 Opening pricing page...'));
      await open(upgradeUrl);
      console.log(chalk.green('✅ Pricing page opened in your browser'));
      console.log(chalk.gray('After upgrading, your new features will be available immediately'));
    } else {
      console.log(chalk.yellow('Upgrade cancelled'));
    }

  } catch (error) {
    console.log(chalk.red('Error fetching subscription info: ' + (error as Error).message));
    
    // Fallback to just opening pricing page
    const upgradeUrl = 'https://recoder.xyz/pricing?utm_source=cli&utm_campaign=upgrade';
    console.log(chalk.blue('🌐 Opening pricing page...'));
    await open(upgradeUrl);
  }
}

function getFeaturesByPlan(plan: string): string[] {
  const features = {
    free: [
      'Local AI models (Ollama)',
      'Basic CLI functionality',
      'Community support',
      'Open source templates'
    ],
    premium: [
      'All Free features',
      'Cloud AI models (Claude, GPT, Gemini, Groq)',
      'Production engine access',
      '2M tokens/month',
      '10K requests/month',
      'Priority support',
      'Advanced templates'
    ],
    pro: [
      'All Premium features',
      '10M tokens/month (5x more)',
      '50K requests/month (5x more)', 
      'Team collaboration',
      'Custom integrations',
      'Phone support'
    ],
    enterprise: [
      'Unlimited usage',
      'On-premise deployment',
      'Custom AI models',
      'SLA guarantees',
      'Dedicated support',
      'White-label options'
    ]
  };

  return features[plan as keyof typeof features] || features.free;
}

function createProgressBar(percent: number, width: number = 30): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  
  let color = chalk.green;
  if (percent > 75) color = chalk.yellow;
  if (percent > 90) color = chalk.red;

  return color('█'.repeat(filled)) + chalk.gray('░'.repeat(empty)) + ` ${percent}%`;
}