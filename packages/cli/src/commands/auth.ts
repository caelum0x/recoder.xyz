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
      expiresIn: details.expiresIn ? parseInt(details.expiresIn) : null,
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