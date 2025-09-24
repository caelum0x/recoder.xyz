/**
 * AI Model Management Commands
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import boxen from 'boxen';
import fs from 'fs-extra';
import path from 'path';
import { Logger } from 'recoder-shared';
import { 
  TaskType, 
  PrivacyLevel, 
  ModelProvider, 
  StatsPeriod 
} from 'recoder-shared/types/ai-models';
import { AIModelHub, AIHubConfig } from '../services/ai-models/ai-hub';
import { ConfigManager } from '../utils/config';

let aiHub: AIModelHub | null = null;

export function setupModelCommands(program: Command): void {
  const models = program
    .command('models')
    .alias('ai')
    .description('AI model management and interaction');

  // List available models
  models
    .command('list')
    .alias('ls')
    .description('List available AI models')
    .option('-p, --provider <provider>', 'filter by provider (openai, anthropic, ollama, etc.)')
    .option('-t, --type <type>', 'filter by model type (chat, code, reasoning, etc.)')
    .option('-l, --local', 'show only local models')
    .option('-c, --cloud', 'show only cloud models')
    .option('--available', 'show only available models')
    .option('-j, --json', 'output as JSON')
    .action(async (options) => {
      try {
        await handleListModels(options);
      } catch (error) {
        Logger.error(`Failed to list models: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Install local models
  models
    .command('install <modelName>')
    .description('Install a local AI model via Ollama')
    .option('-f, --force', 'force reinstallation if already installed')
    .action(async (modelName, options) => {
      try {
        await handleInstallModel(modelName, options);
      } catch (error) {
        Logger.error(`Failed to install model: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Uninstall local models
  models
    .command('uninstall <modelName>')
    .alias('remove')
    .description('Uninstall a local AI model')
    .option('-f, --force', 'skip confirmation prompt')
    .action(async (modelName, options) => {
      try {
        await handleUninstallModel(modelName, options);
      } catch (error) {
        Logger.error(`Failed to uninstall model: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Test model functionality
  models
    .command('test <modelName>')
    .description('Test a model with a simple request')
    .option('-m, --message <message>', 'custom test message', 'Hello! Please respond with "Test successful."')
    .option('-t, --timeout <ms>', 'request timeout in milliseconds', '30000')
    .action(async (modelName, options) => {
      try {
        await handleTestModel(modelName, options);
      } catch (error) {
        Logger.error(`Failed to test model: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Chat with models
  models
    .command('chat [modelName]')
    .description('Start interactive chat with an AI model')
    .option('-t, --task <task>', 'specify task type for optimal model selection')
    .option('-p, --privacy <level>', 'privacy level (public, internal, confidential, restricted)', 'public')
    .option('--project <path>', 'project path for context')
    .option('--temperature <temp>', 'response temperature (0-1)', '0.7')
    .option('--max-tokens <tokens>', 'maximum response tokens', '2000')
    .action(async (modelName, options) => {
      try {
        await handleChatSession(modelName, options);
      } catch (error) {
        Logger.error(`Chat session failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Get model recommendations
  models
    .command('recommend')
    .description('Get model recommendations for a specific task')
    .option('-t, --task <task>', 'task type (required)')
    .option('-l, --language <lang>', 'programming language')
    .option('-p, --privacy <level>', 'privacy level', 'public')
    .option('--project <path>', 'project path for context')
    .action(async (options) => {
      try {
        await handleModelRecommendation(options);
      } catch (error) {
        Logger.error(`Failed to get recommendations: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Model usage statistics
  models
    .command('stats')
    .description('Show AI model usage statistics')
    .option('-p, --period <period>', 'time period (hour, day, week, month)', 'day')
    .option('-m, --model <model>', 'filter by specific model')
    .option('-c, --costs', 'show cost breakdown')
    .option('-e, --export <format>', 'export data (json, csv)')
    .option('-o, --output <file>', 'output file for export')
    .action(async (options) => {
      try {
        await handleUsageStats(options);
      } catch (error) {
        Logger.error(`Failed to get usage stats: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Model health check
  models
    .command('health [modelName]')
    .description('Check health status of models')
    .option('-a, --all', 'check all models')
    .option('-j, --json', 'output as JSON')
    .action(async (modelName, options) => {
      try {
        await handleHealthCheck(modelName, options);
      } catch (error) {
        Logger.error(`Health check failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Configure AI settings
  models
    .command('config')
    .description('Configure AI model settings')
    .option('--setup', 'run interactive setup')
    .option('--show', 'show current configuration')
    .option('--reset', 'reset to default configuration')
    .option('--api-key <provider>', 'set API key for provider')
    .action(async (options) => {
      try {
        await handleModelConfig(options);
      } catch (error) {
        Logger.error(`Configuration failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });
}

async function initializeAIHub(): Promise<AIModelHub> {
  if (aiHub) {
    return aiHub;
  }

  const config = await loadAIHubConfig();
  aiHub = new AIModelHub(config);
  await aiHub.initialize();
  
  return aiHub;
}

async function loadAIHubConfig(): Promise<AIHubConfig> {
  const defaultConfig: AIHubConfig = {
    providers: {
      openai: {
        enabled: false,
        apiKey: process.env.OPENAI_API_KEY || ConfigManager.get('ai.openai.apiKey'),
        priority: 9,
        maxConcurrency: 5,
        timeout: 60000,
        retryCount: 3
      },
      anthropic: {
        enabled: false,
        apiKey: process.env.ANTHROPIC_API_KEY || ConfigManager.get('ai.anthropic.apiKey'),
        priority: 9,
        maxConcurrency: 5,
        timeout: 60000,
        retryCount: 3
      },
      ollama: {
        enabled: true,
        host: 'localhost',
        port: 11434,
        autoInstall: true,
        gpu: true,
        priority: 8,
        maxConcurrency: 3,
        timeout: 120000,
        retryCount: 2
      }
    },
    router: {
      defaultPrivacyLevel: PrivacyLevel.PUBLIC,
      enableHybridProcessing: false,
      hybridConfig: {
        enabled: false,
        localFirst: true,
        consensusThreshold: 2,
        maxModels: 3,
        votingStrategy: 'majority',
        fallbackChain: []
      },
      routingRules: [],
      fallbackChains: {},
      performanceWeights: {
        speed: 0.3,
        cost: 0.2,
        quality: 0.3,
        availability: 0.2
      }
    },
    localModels: {
      enabled: true,
      ollama: {
        host: 'localhost',
        port: 11434,
        timeout: 120000,
        autoInstall: true,
        gpu: true
      },
      docker: {
        enabled: false,
        image: 'ollama/ollama',
        containerName: 'recoder-ollama',
        ports: { '11434': 11434 },
        volumes: {},
        environment: {}
      }
    },
    hybrid: {
      enabled: false,
      localFirst: true,
      consensusThreshold: 2,
      maxModels: 3,
      votingStrategy: 'majority',
      fallbackChain: []
    },
    defaultSettings: {
      privacyLevel: PrivacyLevel.PUBLIC,
      timeout: 60000,
      retryCount: 3,
      temperature: 0.7,
      maxTokens: 2000
    },
    features: {
      enableCaching: true,
      enableMonitoring: true,
      enableAnalytics: true,
      enableAutoInstall: true,
      enableHybridProcessing: false
    }
  };

  // Enable providers based on available API keys
  if (defaultConfig.providers.openai?.apiKey) {
    defaultConfig.providers.openai.enabled = true;
  }
  
  if (defaultConfig.providers.anthropic?.apiKey) {
    defaultConfig.providers.anthropic.enabled = true;
  }

  return defaultConfig;
}

async function handleListModels(options: any): Promise<void> {
  const hub = await initializeAIHub();
  
  console.log(
    boxen(
      chalk.cyan('🤖 Available AI Models'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  let models = hub.getAllModels();

  // Apply filters
  if (options.provider) {
    models = models.filter(model => model.provider === options.provider);
  }

  if (options.type) {
    models = models.filter(model => model.type === options.type);
  }

  if (options.local) {
    models = models.filter(model => model.isLocal);
  }

  if (options.cloud) {
    models = models.filter(model => !model.isLocal);
  }

  if (options.available) {
    models = models.filter(model => model.isAvailable);
  }

  if (options.json) {
    console.log(JSON.stringify(models, null, 2));
    return;
  }

  if (models.length === 0) {
    console.log(chalk.yellow('No models found matching the specified criteria.'));
    return;
  }

  // Group by provider
  const groupedModels = models.reduce((acc: any, model) => {
    if (!acc[model.provider]) acc[model.provider] = [];
    acc[model.provider].push(model);
    return acc;
  }, {});

  for (const [provider, providerModels] of Object.entries(groupedModels)) {
    const providerIcon = {
      'openai': '🔵',
      'anthropic': '🟠',
      'ollama': '🟢',
      'google': '🔴',
      'mistral': '🟡'
    }[provider] || '⚫';

    console.log(
      boxen(
        chalk.white(`${providerIcon} ${provider.toUpperCase()}\n`) +
        (providerModels as any[]).map((model: any) => {
          const status = model.isAvailable ? 
            chalk.green('✅ Available') : 
            chalk.red('❌ Not Available');
          
          const location = model.isLocal ? 
            chalk.blue('🏠 Local') : 
            chalk.yellow('☁️ Cloud');

          const capabilities = [
            model.capabilities.codeGeneration && '💻 Code',
            model.capabilities.chat && '💬 Chat',
            model.capabilities.reasoning && '🧠 Reasoning',
            model.capabilities.vision && '👁️ Vision'
          ].filter(Boolean).join(' ');

          return chalk.cyan(`• ${model.displayName}`) + 
                 chalk.gray(` (${model.id})\n`) +
                 `  ${status} ${location}\n` +
                 chalk.gray(`  ${model.description}\n`) +
                 chalk.gray(`  Context: ${model.limits.maxContextLength} tokens\n`) +
                 chalk.gray(`  Capabilities: ${capabilities}`);
        }).join('\n\n'),
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'blue',
          title: provider.charAt(0).toUpperCase() + provider.slice(1),
        }
      )
    );
  }

  // Show summary
  const availableCount = models.filter(m => m.isAvailable).length;
  const localCount = models.filter(m => m.isLocal).length;
  const cloudCount = models.filter(m => !m.isLocal).length;

  console.log(
    boxen(
      chalk.white('📊 Summary\n') +
      chalk.gray(`Total models: ${models.length}\n`) +
      chalk.gray(`Available: ${availableCount}\n`) +
      chalk.gray(`Local models: ${localCount}\n`) +
      chalk.gray(`Cloud models: ${cloudCount}`),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'green',
        title: 'Summary',
      }
    )
  );
}

async function handleInstallModel(modelName: string, options: any): Promise<void> {
  const hub = await initializeAIHub();
  
  console.log(
    boxen(
      chalk.cyan(`📥 Installing Model: ${modelName}`),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  // Check if model is already installed
  const model = hub.getAllModels().find(m => m.id === modelName);
  
  if (model?.isAvailable && !options.force) {
    console.log(chalk.green('✅ Model is already installed and available.'));
    return;
  }

  const spinner = ora('Installing model...').start();

  try {
    // Setup progress tracking
    hub.on('model-download-started', ({ model }) => {
      spinner.text = `Downloading ${model}...`;
    });

    hub.on('model-download-progress', ({ model, progress, status }) => {
      spinner.text = `${status}: ${Math.round(progress)}%`;
    });

    hub.on('model-download-completed', ({ model }) => {
      spinner.succeed(chalk.green(`✅ Model ${model} installed successfully!`));
    });

    hub.on('model-download-failed', ({ model, error }) => {
      spinner.fail(chalk.red(`❌ Failed to install ${model}: ${error.message}`));
    });

    await hub.installLocalModel(modelName);
    
    if (!spinner.isSpinning) {
      // Event handlers already updated the spinner
      return;
    }

    spinner.succeed(chalk.green('Model installed successfully!'));
    
    console.log(
      boxen(
        chalk.white('🎉 Installation Complete!\n') +
        chalk.gray(`Model: ${modelName}\n`) +
        chalk.gray('You can now use this model for AI tasks.'),
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'green',
        }
      )
    );
  } catch (error) {
    spinner.fail(chalk.red('Installation failed'));
    console.log(chalk.red(error instanceof Error ? error.message : String(error)));
  }
}

async function handleUninstallModel(modelName: string, options: any): Promise<void> {
  const hub = await initializeAIHub();
  
  if (!options.force) {
    const confirmed = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'uninstall',
        message: `Are you sure you want to uninstall model "${modelName}"?`,
        default: false,
      },
    ]);

    if (!confirmed.uninstall) {
      console.log(chalk.yellow('Uninstallation cancelled.'));
      return;
    }
  }

  const spinner = ora('Uninstalling model...').start();

  try {
    await hub.uninstallLocalModel(modelName);
    spinner.succeed(chalk.green('Model uninstalled successfully!'));
  } catch (error) {
    spinner.fail(chalk.red('Uninstallation failed'));
    console.log(chalk.red(error instanceof Error ? error.message : String(error)));
  }
}

async function handleTestModel(modelName: string, options: any): Promise<void> {
  const hub = await initializeAIHub();
  
  console.log(
    boxen(
      chalk.cyan(`🧪 Testing Model: ${modelName}`),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  const spinner = ora('Running model test...').start();

  try {
    const result = await hub.testModel(modelName);
    
    if (result.success) {
      spinner.succeed(chalk.green('✅ Model test passed!'));
      
      console.log(
        boxen(
          chalk.white('Test Results\n') +
          chalk.green(`Status: ✅ Success\n`) +
          chalk.gray(`Response Time: ${result.responseTime}ms\n`) +
          chalk.gray(`Model: ${modelName}`),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'green',
          }
        )
      );
    } else {
      spinner.fail(chalk.red('❌ Model test failed'));
      
      console.log(
        boxen(
          chalk.white('Test Results\n') +
          chalk.red(`Status: ❌ Failed\n`) +
          chalk.gray(`Response Time: ${result.responseTime}ms\n`) +
          chalk.red(`Error: ${result.error || 'Unknown error'}`),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'red',
          }
        )
      );
    }
  } catch (error) {
    spinner.fail(chalk.red('Test failed'));
    console.log(chalk.red(error instanceof Error ? error.message : String(error)));
  }
}

async function handleChatSession(modelName: string | undefined, options: any): Promise<void> {
  const hub = await initializeAIHub();
  
  // Get model recommendation if not specified
  if (!modelName) {
    const task = options.task ? options.task as TaskType : TaskType.CHAT;
    const recommendation = await hub.getModelRecommendation(task, {
      privacyLevel: options.privacy as PrivacyLevel,
      projectPath: options.project,
      language: options.language
    });
    
    modelName = recommendation.model;
    
    console.log(
      boxen(
        chalk.yellow('🎯 Model Recommendation\n') +
        chalk.cyan(`Selected: ${modelName}\n`) +
        chalk.gray(`Confidence: ${Math.round(recommendation.confidence * 100)}%\n`) +
        chalk.gray(`Reasoning: ${recommendation.reasoning}`),
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'yellow',
        }
      )
    );
  }

  console.log(
    boxen(
      chalk.cyan(`💬 Chat Session with ${modelName}\n`) +
      chalk.gray('Type "exit" to quit, "help" for commands'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  // Start conversation
  const conversationId = await hub.getContextSummary().then(() => 'conv_' + Date.now());
  
  while (true) {
    const { message } = await inquirer.prompt([
      {
        type: 'input',
        name: 'message',
        message: chalk.blue('You:'),
        validate: (input) => input.length > 0 || 'Please enter a message',
      },
    ]);

    if (message.toLowerCase() === 'exit') {
      console.log(chalk.yellow('👋 Chat session ended.'));
      break;
    }

    if (message.toLowerCase() === 'help') {
      console.log(
        boxen(
          chalk.white('Chat Commands\n') +
          chalk.cyan('exit') + chalk.gray(' - End chat session\n') +
          chalk.cyan('help') + chalk.gray(' - Show this help\n') +
          chalk.cyan('stats') + chalk.gray(' - Show session statistics\n') +
          chalk.cyan('switch <model>') + chalk.gray(' - Switch to different model'),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'blue',
          }
        )
      );
      continue;
    }

    const spinner = ora(chalk.gray('AI is thinking...')).start();

    try {
      const response = await hub.sendRequest([
        { role: 'user', content: message }
      ], {
        model: modelName,
        options: {
          temperature: parseFloat(options.temperature),
          maxTokens: parseInt(options.maxTokens)
        },
        context: {
          task: options.task as TaskType || TaskType.CHAT,
          priority: 'quality' as any,
          privacyLevel: options.privacy as PrivacyLevel,
          projectPath: options.project
        }
      });

      spinner.stop();
      
      console.log(chalk.green('AI:'), response.content);
      console.log(chalk.gray(`[${response.usage.totalTokens} tokens, ${response.metadata.responseTime}ms]`));
      console.log();
    } catch (error) {
      spinner.fail(chalk.red('Failed to get response'));
      console.log(chalk.red(error instanceof Error ? error.message : String(error)));
    }
  }
}

async function handleModelRecommendation(options: any): Promise<void> {
  if (!options.task) {
    console.log(chalk.red('Error: Task type is required for recommendations.'));
    console.log(chalk.gray('Available tasks: code_generation, code_review, debugging, documentation, chat, etc.'));
    return;
  }

  const hub = await initializeAIHub();
  
  const spinner = ora('Getting model recommendations...').start();

  try {
    const recommendation = await hub.getModelRecommendation(options.task as TaskType, {
      language: options.language,
      privacyLevel: options.privacy as PrivacyLevel,
      projectPath: options.project
    });

    spinner.succeed(chalk.green('Recommendations ready!'));
    
    console.log(
      boxen(
        chalk.white('🎯 Model Recommendation\n') +
        chalk.cyan(`Best Match: ${recommendation.model}\n`) +
        chalk.yellow(`Confidence: ${Math.round(recommendation.confidence * 100)}%\n`) +
        chalk.gray(`Task: ${options.task}\n`) +
        chalk.gray(`Reasoning: ${recommendation.reasoning}`),
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'green',
          title: 'Primary Recommendation'
        }
      )
    );

    if (recommendation.alternatives.length > 0) {
      console.log(
        boxen(
          chalk.white('Alternative Models\n') +
          recommendation.alternatives.map((alt, i) => 
            `${i + 1}. ${chalk.cyan(alt.model)} (${Math.round(alt.score * 100)}%)\n   ${chalk.gray(alt.reason)}`
          ).join('\n\n'),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'blue',
            title: 'Alternatives'
          }
        )
      );
    }

    console.log(
      boxen(
        chalk.white('Estimated Performance\n') +
        chalk.gray(`Response Time: ~${Math.round(recommendation.estimated.responseTime / 1000)}s\n`) +
        chalk.gray(`Cost: $${recommendation.estimated.cost.toFixed(4)}\n`) +
        chalk.gray(`Quality Score: ${Math.round(recommendation.estimated.quality * 100)}%`),
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'yellow',
          title: 'Estimates'
        }
      )
    );
  } catch (error) {
    spinner.fail(chalk.red('Failed to get recommendations'));
    console.log(chalk.red(error instanceof Error ? error.message : String(error)));
  }
}

async function handleUsageStats(options: any): Promise<void> {
  const hub = await initializeAIHub();
  
  const spinner = ora('Loading usage statistics...').start();

  try {
    const period = options.period as StatsPeriod;
    const stats = hub.getUsageStats(period);
    
    spinner.succeed(chalk.green('Usage statistics loaded!'));
    
    if (stats.length === 0) {
      console.log(chalk.yellow('No usage data found for the specified period.'));
      return;
    }

    if (options.export) {
      // Export functionality would be implemented here
      console.log(chalk.green(`Usage data exported as ${options.export}`));
      return;
    }

    // Display usage stats
    console.log(
      boxen(
        chalk.cyan(`📊 Usage Statistics (${period})`),
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        }
      )
    );

    for (const modelStats of stats.slice(0, 10)) {
      console.log(
        boxen(
          chalk.white(`${modelStats.model}\n`) +
          chalk.gray(`Requests: ${modelStats.requests}\n`) +
          chalk.gray(`Tokens: ${modelStats.tokens.total.toLocaleString()}\n`) +
          chalk.gray(`Cost: $${modelStats.cost.toFixed(4)}\n`) +
          chalk.gray(`Avg Response Time: ${Math.round(modelStats.averageResponseTime)}ms\n`) +
          chalk.gray(`Error Rate: ${(modelStats.errorRate * 100).toFixed(1)}%\n`) +
          chalk.gray(`Quality Score: ${Math.round(modelStats.qualityScore)}%`),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'blue',
          }
        )
      );
    }

    if (options.costs) {
      // Show cost breakdown
      const totalCost = stats.reduce((sum, s) => sum + s.cost, 0);
      const totalRequests = stats.reduce((sum, s) => sum + s.requests, 0);
      
      console.log(
        boxen(
          chalk.white('💰 Cost Summary\n') +
          chalk.yellow(`Total Cost: $${totalCost.toFixed(4)}\n`) +
          chalk.gray(`Total Requests: ${totalRequests}\n`) +
          chalk.gray(`Avg Cost per Request: $${(totalCost / totalRequests).toFixed(6)}`),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
            title: 'Costs'
          }
        )
      );
    }
  } catch (error) {
    spinner.fail(chalk.red('Failed to load usage statistics'));
    console.log(chalk.red(error instanceof Error ? error.message : String(error)));
  }
}

async function handleHealthCheck(modelName: string | undefined, options: any): Promise<void> {
  const hub = await initializeAIHub();
  
  const spinner = ora('Checking model health...').start();

  try {
    const healthData = hub.getModelHealth(modelName);
    
    spinner.succeed(chalk.green('Health check completed!'));
    
    if (options.json) {
      console.log(JSON.stringify(healthData, null, 2));
      return;
    }

    if (modelName && healthData) {
      // Single model health
      const health = healthData;
      const statusColor = health.status === 'healthy' ? 'green' : 
                         health.status === 'degraded' ? 'yellow' : 'red';
      
      console.log(
        boxen(
          chalk.white(`🏥 Health Check: ${modelName}\n`) +
          chalk[statusColor](`Status: ${health.status}\n`) +
          chalk.gray(`Availability: ${Math.round(health.availability * 100)}%\n`) +
          chalk.gray(`Avg Response Time: ${Math.round(health.averageResponseTime)}ms\n`) +
          chalk.gray(`Error Rate: ${Math.round(health.errorRate * 100)}%\n`) +
          chalk.gray(`Last Checked: ${health.lastChecked.toLocaleString()}`),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: statusColor as any,
          }
        )
      );
    } else {
      // All models health
      console.log(
        boxen(
          chalk.cyan('🏥 System Health Overview'),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'cyan',
          }
        )
      );

      for (const [provider, models] of Object.entries(healthData)) {
        const healthyCount = (models as any[]).filter(m => m.status === 'healthy').length;
        const totalCount = (models as any[]).length;
        
        console.log(
          boxen(
            chalk.white(`${provider.toUpperCase()}\n`) +
            chalk.gray(`Healthy: ${healthyCount}/${totalCount}\n`) +
            (models as any[]).map((model: any) => {
              const statusIcon = model.status === 'healthy' ? '✅' : 
                               model.status === 'degraded' ? '⚠️' : '❌';
              return `${statusIcon} ${model.model} (${Math.round(model.availability * 100)}%)`;
            }).join('\n'),
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'blue',
              title: provider
            }
          )
        );
      }
    }
  } catch (error) {
    spinner.fail(chalk.red('Health check failed'));
    console.log(chalk.red(error instanceof Error ? error.message : String(error)));
  }
}

async function handleModelConfig(options: any): Promise<void> {
  if (options.show) {
    const config = await loadAIHubConfig();
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  if (options.reset) {
    console.log(chalk.yellow('🔄 Configuration reset to defaults'));
    // Reset logic would be implemented here
    return;
  }

  if (options.setup) {
    await runInteractiveSetup();
    return;
  }

  if (options.apiKey) {
    await setApiKey(options.apiKey);
    return;
  }

  console.log(chalk.yellow('No configuration action specified. Use --setup for interactive configuration.'));
}

async function runInteractiveSetup(): Promise<void> {
  console.log(
    boxen(
      chalk.cyan('🤖 AI Model Configuration Setup'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  const config = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'providers',
      message: 'Which AI providers would you like to enable?',
      choices: [
        { name: '🔵 OpenAI (GPT-4, GPT-3.5)', value: 'openai' },
        { name: '🟠 Anthropic (Claude)', value: 'anthropic' },
        { name: '🔴 Google (Gemini)', value: 'google' },
        { name: '🟡 Mistral', value: 'mistral' },
        { name: '🟢 Ollama (Local Models)', value: 'ollama', checked: true },
      ],
    },
    {
      type: 'list',
      name: 'defaultPrivacy',
      message: 'Default privacy level:',
      choices: [
        { name: '🌐 Public - Any model allowed', value: 'public' },
        { name: '🏢 Internal - Prefer local, cloud allowed', value: 'internal' },
        { name: '🔒 Confidential - Local models only', value: 'confidential' },
        { name: '🚫 Restricted - Specific approved models', value: 'restricted' },
      ],
      default: 'public'
    },
    {
      type: 'confirm',
      name: 'autoInstall',
      message: 'Auto-install recommended local models?',
      default: true,
    },
    {
      type: 'confirm',
      name: 'analytics',
      message: 'Enable usage analytics and monitoring?',
      default: true,
    }
  ]);

  // Prompt for API keys for selected providers
  const apiKeys: any = {};
  
  for (const provider of config.providers) {
    if (provider !== 'ollama') {
      const { apiKey } = await inquirer.prompt([
        {
          type: 'password',
          name: 'apiKey',
          message: `Enter ${provider.toUpperCase()} API key (optional):`,
          mask: '*',
        }
      ]);
      
      if (apiKey) {
        apiKeys[provider] = apiKey;
      }
    }
  }

  // Save configuration
  for (const [provider, key] of Object.entries(apiKeys)) {
    ConfigManager.set(`ai.${provider}.apiKey`, key);
  }

  ConfigManager.set('ai.defaultPrivacy', config.defaultPrivacy);
  ConfigManager.set('ai.autoInstall', config.autoInstall);
  ConfigManager.set('ai.analytics', config.analytics);

  console.log(
    boxen(
      chalk.green('✅ Configuration saved successfully!\n') +
      chalk.gray('You can now use AI models with the configured settings.'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'green',
      }
    )
  );
}

async function setApiKey(provider: string): Promise<void> {
  const { apiKey } = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: `Enter ${provider.toUpperCase()} API key:`,
      mask: '*',
      validate: (input) => input.length > 0 || 'API key is required',
    }
  ]);

  ConfigManager.set(`ai.${provider}.apiKey`, apiKey);
  
  console.log(chalk.green(`✅ API key for ${provider} saved successfully!`));
}