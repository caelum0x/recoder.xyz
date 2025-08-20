/**
 * Connect Command
 * Connects CLI router to main recoder.xyz backend for shared API key pools
 * Enables enterprise features and centralized billing
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { Logger } from '../services/logger';
import MainBackendConnection from '../services/main-backend-connection';
import SharedAPIKeyManager from '../services/shared-api-key-manager';
import inquirer from 'inquirer';
import open from 'open';

interface ConnectOptions {
  backend?: string;
  apiKey?: string;
  userId?: string;
  enterprise?: boolean;
  sync?: number;
  interactive?: boolean;
}

export function createConnectCommand(): Command {
  const connectCommand = new Command('connect')
    .description('Connect to recoder.xyz backend for shared API keys and enterprise features')
    .option('-b, --backend <url>', 'Backend URL (default: https://api.recoder.xyz)')
    .option('-k, --api-key <key>', 'API key for authentication')
    .option('-u, --user-id <id>', 'User ID for individual account linking')
    .option('-e, --enterprise', 'Enable enterprise mode with enhanced features')
    .option('-s, --sync <minutes>', 'Sync interval in minutes (default: 5)', parseInt)
    .option('-i, --interactive', 'Interactive connection setup')
    .action(async (options: ConnectOptions) => {
      console.log(chalk.cyan('\n🔗 RECODER ROUTER - Backend Connection\n'));

      try {
        // Interactive setup if requested
        if (options.interactive) {
          const answers = await runInteractiveSetup();
          Object.assign(options, answers);
        }

        // Validate required options
        if (!options.backend) {
          options.backend = 'https://api.recoder.xyz';
        }

        if (!options.apiKey && !options.userId) {
          console.log(chalk.red('❌ Either API key or User ID is required'));
          console.log(chalk.yellow('💡 Use --interactive for guided setup'));
          return;
        }

        console.log(chalk.blue('🚀 Initializing backend connection...'));
        console.log(chalk.gray(`Backend: ${options.backend}`));
        console.log(chalk.gray(`Mode: ${options.enterprise ? 'Enterprise' : 'Individual'}`));

        // Initialize backend connection
        const backendConnection = new MainBackendConnection({
          backendUrl: options.backend,
          apiKey: options.apiKey,
          userId: options.userId,
          enterpriseMode: options.enterprise || false,
          syncInterval: (options.sync || 5) * 60 * 1000 // Convert to milliseconds
        });

        // Initialize shared API key manager
        const sharedKeyManager = new SharedAPIKeyManager();

        // Setup event listeners
        setupEventListeners(backendConnection, sharedKeyManager);

        // Connect to backend
        await backendConnection.initialize();
        await sharedKeyManager.initialize(backendConnection);

        // Show connection status
        await displayConnectionStatus(backendConnection, sharedKeyManager);

        // Show cost optimization info
        await displayCostOptimization(sharedKeyManager);

        // Save connection config
        await saveConnectionConfig(options);

        console.log(chalk.green('\n✅ Successfully connected to recoder.xyz backend!'));
        console.log(chalk.cyan('\n🎉 Your router is now part of the shared infrastructure'));
        console.log(chalk.white('\nAvailable commands:'));
        console.log(chalk.gray('  recoder-router status    # View connection status'));
        console.log(chalk.gray('  recoder-router optimize  # Get cost recommendations'));
        console.log(chalk.gray('  recoder-router analytics # View usage analytics'));

      } catch (error: any) {
        console.log(chalk.red(`\n❌ Connection failed: ${error.message}`));
        
        if (error.code === 'ECONNREFUSED') {
          console.log(chalk.yellow('💡 Backend server may be unavailable'));
        } else if (error.response?.status === 401) {
          console.log(chalk.yellow('💡 Check your API key or user credentials'));
        } else if (error.response?.status === 403) {
          console.log(chalk.yellow('💡 Access denied - verify your permissions'));
        }
        
        console.log(chalk.gray('\nTroubleshooting:'));
        console.log(chalk.gray('  1. Verify backend URL is correct'));
        console.log(chalk.gray('  2. Check your API key or user ID'));
        console.log(chalk.gray('  3. Ensure network connectivity'));
        console.log(chalk.gray('  4. Try: recoder-router connect --interactive'));
      }
    });

  return connectCommand;
}

/**
 * Run interactive setup wizard
 */
async function runInteractiveSetup(): Promise<Partial<ConnectOptions>> {
  console.log(chalk.cyan('🔧 Interactive Connection Setup\n'));

  const questions = [
    {
      type: 'list',
      name: 'mode',
      message: 'How do you want to connect?',
      choices: [
        { name: '👤 Individual Account (link to your recoder.xyz account)', value: 'individual' },
        { name: '🏢 Enterprise/Team Account (use API key)', value: 'enterprise' },
        { name: '🆔 Custom Backend (specify URL and credentials)', value: 'custom' }
      ]
    }
  ];

  const { mode } = await inquirer.prompt(questions);
  const answers: Partial<ConnectOptions> = {};

  switch (mode) {
    case 'individual':
      await setupIndividualAccount(answers);
      break;
    case 'enterprise':
      await setupEnterpriseAccount(answers);
      break;
    case 'custom':
      await setupCustomBackend(answers);
      break;
  }

  // Common settings
  const commonQuestions = [
    {
      type: 'number',
      name: 'sync',
      message: 'Sync interval (minutes):',
      default: 5,
      validate: (input: number) => input > 0 || 'Sync interval must be positive'
    }
  ];

  const commonAnswers = await inquirer.prompt(commonQuestions);
  Object.assign(answers, commonAnswers);

  return answers;
}

/**
 * Setup individual account connection
 */
async function setupIndividualAccount(answers: Partial<ConnectOptions>): Promise<void> {
  console.log(chalk.blue('\n👤 Individual Account Setup'));
  console.log(chalk.gray('Connect your router to your personal recoder.xyz account\n'));

  const questions = [
    {
      type: 'confirm',
      name: 'openWeb',
      message: 'Open recoder.xyz to get your connection details?',
      default: true
    }
  ];

  const { openWeb } = await inquirer.prompt(questions);

  if (openWeb) {
    const authUrl = 'https://recoder.xyz/account/router-connection';
    console.log(chalk.blue(`\n🌐 Opening: ${authUrl}`));
    
    try {
      await open(authUrl);
      console.log(chalk.green('✅ Opened browser - please complete authentication'));
    } catch {
      console.log(chalk.yellow('⚠️ Failed to open browser automatically'));
      console.log(chalk.blue(`Please visit: ${authUrl}`));
    }
  }

  const authQuestions = [
    {
      type: 'input',
      name: 'userId',
      message: 'Enter your User ID (from recoder.xyz account page):',
      validate: (input: string) => input.length > 0 || 'User ID is required'
    },
    {
      type: 'input',
      name: 'backend',
      message: 'Backend URL:',
      default: 'https://api.recoder.xyz'
    }
  ];

  const authAnswers = await inquirer.prompt(authQuestions);
  Object.assign(answers, authAnswers, { enterprise: false });
}

/**
 * Setup enterprise account connection
 */
async function setupEnterpriseAccount(answers: Partial<ConnectOptions>): Promise<void> {
  console.log(chalk.blue('\n🏢 Enterprise Account Setup'));
  console.log(chalk.gray('Connect using enterprise API key for team features\n'));

  const questions = [
    {
      type: 'input',
      name: 'apiKey',
      message: 'Enter your Enterprise API Key:',
      validate: (input: string) => {
        if (input.length === 0) return 'API Key is required';
        if (!input.startsWith('rck_')) return 'Invalid API key format';
        return true;
      }
    },
    {
      type: 'input',
      name: 'backend',
      message: 'Backend URL:',
      default: 'https://api.recoder.xyz'
    }
  ];

  const authAnswers = await inquirer.prompt(questions);
  Object.assign(answers, authAnswers, { enterprise: true });
}

/**
 * Setup custom backend connection
 */
async function setupCustomBackend(answers: Partial<ConnectOptions>): Promise<void> {
  console.log(chalk.blue('\n🆔 Custom Backend Setup'));
  console.log(chalk.gray('Connect to a custom recoder backend instance\n'));

  const questions = [
    {
      type: 'input',
      name: 'backend',
      message: 'Backend URL:',
      validate: (input: string) => {
        try {
          new URL(input);
          return true;
        } catch {
          return 'Please enter a valid URL';
        }
      }
    },
    {
      type: 'list',
      name: 'authType',
      message: 'Authentication method:',
      choices: [
        { name: 'API Key', value: 'api_key' },
        { name: 'User ID', value: 'user_id' }
      ]
    }
  ];

  const { backend, authType } = await inquirer.prompt(questions);
  answers.backend = backend;

  if (authType === 'api_key') {
    const { apiKey } = await inquirer.prompt([
      {
        type: 'input',
        name: 'apiKey',
        message: 'API Key:',
        validate: (input: string) => input.length > 0 || 'API Key is required'
      }
    ]);
    answers.apiKey = apiKey;
    answers.enterprise = true;
  } else {
    const { userId } = await inquirer.prompt([
      {
        type: 'input',
        name: 'userId',
        message: 'User ID:',
        validate: (input: string) => input.length > 0 || 'User ID is required'
      }
    ]);
    answers.userId = userId;
    answers.enterprise = false;
  }
}

/**
 * Setup event listeners for connection monitoring
 */
function setupEventListeners(
  backendConnection: MainBackendConnection,
  sharedKeyManager: SharedAPIKeyManager
): void {
  const logger = new Logger('Connect');

  backendConnection.on('connected', () => {
    console.log(chalk.green('🔗 Backend connection established'));
  });

  backendConnection.on('disconnected', () => {
    console.log(chalk.yellow('🔌 Backend connection lost'));
  });

  backendConnection.on('auth_failed', () => {
    console.log(chalk.red('🚫 Authentication failed - check credentials'));
  });

  backendConnection.on('updates_available', (updates) => {
    console.log(chalk.blue(`📦 Router updates available: ${updates.length} updates`));
  });

  sharedKeyManager.on('pools_updated', (pools) => {
    const totalKeys = pools.reduce((sum: number, pool: any) => sum + pool.keys.length, 0);
    console.log(chalk.green(`🔑 API key pools updated: ${totalKeys} keys across ${pools.length} providers`));
  });
}

/**
 * Display connection status
 */
async function displayConnectionStatus(
  backendConnection: MainBackendConnection,
  sharedKeyManager: SharedAPIKeyManager
): Promise<void> {
  const connectionStatus = backendConnection.getStatus();
  const keyStatus = sharedKeyManager.getStatus();

  console.log(chalk.cyan('\n📊 Connection Status:'));
  console.log(chalk.white(`  Backend: ${connectionStatus.backend_url}`));
  console.log(chalk.white(`  Router ID: ${connectionStatus.router_id}`));
  console.log(chalk.white(`  Status: ${connectionStatus.connected ? chalk.green('Connected') : chalk.red('Disconnected')}`));
  
  console.log(chalk.cyan('\n🔑 API Key Pools:'));
  console.log(chalk.white(`  Pools available: ${keyStatus.pools_available}`));
  console.log(chalk.white(`  Total shared keys: ${keyStatus.total_keys}`));
  console.log(chalk.white(`  Fallback keys: ${keyStatus.fallback_keys}`));
  
  if (keyStatus.last_sync) {
    console.log(chalk.white(`  Last sync: ${keyStatus.last_sync.toLocaleString()}`));
  }
}

/**
 * Display cost optimization information
 */
async function displayCostOptimization(sharedKeyManager: SharedAPIKeyManager): Promise<void> {
  try {
    const recommendations = await sharedKeyManager.getCostOptimizationRecommendations();
    
    console.log(chalk.cyan('\n💰 Cost Optimization:'));
    console.log(chalk.white(`  Current efficiency: ${recommendations.current_efficiency.toFixed(1)}%`));
    
    if (recommendations.projected_savings > 0) {
      console.log(chalk.green(`  Projected savings: $${recommendations.projected_savings.toFixed(2)}/month`));
    }
    
    if (recommendations.recommendations.length > 0) {
      console.log(chalk.cyan('\n📈 Recommendations:'));
      recommendations.recommendations.slice(0, 3).forEach((rec: any, index: number) => {
        console.log(chalk.white(`  ${index + 1}. ${rec.description}`));
      });
    }

  } catch (error) {
    console.log(chalk.yellow('⚠️ Unable to get cost optimization data'));
  }
}

/**
 * Save connection configuration
 */
async function saveConnectionConfig(options: ConnectOptions): Promise<void> {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');

    const configDir = path.join(os.homedir(), '.recoder-router');
    const configFile = path.join(configDir, 'connection.json');

    await fs.mkdir(configDir, { recursive: true });
    
    const config = {
      backend_url: options.backend,
      enterprise_mode: options.enterprise,
      sync_interval: options.sync,
      connected_at: new Date().toISOString(),
      // Don't save sensitive data in plain text
      has_api_key: !!options.apiKey,
      has_user_id: !!options.userId
    };

    await fs.writeFile(configFile, JSON.stringify(config, null, 2));
    console.log(chalk.gray(`💾 Configuration saved to ${configFile}`));

  } catch (error) {
    console.log(chalk.yellow('⚠️ Failed to save configuration'));
  }
}

export default createConnectCommand;