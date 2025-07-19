/**
 * Agent management commands - Enhanced with full CRUD operations
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import boxen from 'boxen';
import Table from 'cli-table3';
import fs from 'fs-extra';
import { Logger } from '@recoder/shared';
import {
  Agent,
  AgentStatus,
  AgentCategory,
  ExpertiseLevel,
  PersonalityTone,
  VerbosityLevel,
  FormalityLevel,
  ApproachStyle,
  FeedbackStyle,
  CommunicationStyle,
  WebFramework,
  MobileFramework,
  BlockchainNetwork,
  ProgrammingLanguage,
  CreateAgentRequest,
  UpdateAgentRequest,
  AgentListFilter,
  AgentListSort
} from '@recoder/shared/types/agent';
import { AgentManager } from '../services/agent-manager';
import { AIModelHub } from '../services/ai-models/ai-hub';
import { ConfigManager } from '../utils/config';
import { requireAuth } from '../utils/auth';

let agentManager: AgentManager | null = null;
let aiHub: AIModelHub | null = null;

export function setupAgentCommands(program: Command): void {
  const agent = program
    .command('agent')
    .description('AI agent management and configuration with full CRUD operations');

  // Create agent command - Enhanced interactive creation
  agent
    .command('create')
    .description('Create a new AI agent with comprehensive configuration')
    .option('-n, --name <name>', 'agent name')
    .option('-t, --type <type>', 'agent specialization category')
    .option('-m, --model <model>', 'AI model to use')
    .option('-d, --description <description>', 'agent description')
    .option('-c, --config <file>', 'load configuration from JSON file')
    .option('--template <template>', 'use predefined template')
    .option('--interactive', 'interactive agent creation wizard')
    .action(async (options) => {
      try {
        await initializeServices();
        await handleCreateAgent(options);
      } catch (error) {
        Logger.error(`Agent creation failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // List agents command - Enhanced with filtering and sorting
  agent
    .command('list')
    .alias('ls')
    .description('List agents with advanced filtering and sorting')
    .option('-j, --json', 'output as JSON')
    .option('-t, --table', 'display as formatted table')
    .option('-s, --status <status>', 'filter by status (active, inactive, error, maintenance)')
    .option('-c, --category <category>', 'filter by category')
    .option('-m, --model <model>', 'filter by AI model')
    .option('-l, --language <language>', 'filter by programming language')
    .option('-f, --framework <framework>', 'filter by framework')
    .option('--search <query>', 'search agents by name or description')
    .option('--tags <tags>', 'filter by tags (comma-separated)')
    .option('--sort <field>', 'sort by field (name, created, updated, used, performance)')
    .option('--order <direction>', 'sort order (asc, desc)', 'desc')
    .option('--limit <number>', 'limit number of results')
    .option('--stats', 'show usage statistics')
    .action(async (options) => {
      try {
        await initializeServices();
        await handleListAgents(options);
      } catch (error) {
        Logger.error(`Failed to list agents: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Show agent command - Enhanced with comprehensive details
  agent
    .command('show <agentId>')
    .description('Show comprehensive agent information and analytics')
    .option('-j, --json', 'output as JSON')
    .option('--config', 'show detailed configuration')
    .option('--capabilities', 'show capabilities breakdown')
    .option('--personality', 'show personality settings')
    .option('--performance', 'show performance metrics')
    .option('--history', 'show usage history')
    .option('--export <file>', 'export agent configuration to file')
    .action(async (agentId, options) => {
      try {
        await initializeServices();
        await handleShowAgent(agentId, options);
      } catch (error) {
        Logger.error(`Failed to show agent: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Edit agent command - Enhanced with comprehensive editing
  agent
    .command('edit <agentId>')
    .description('Edit agent configuration with guided wizard')
    .option('-n, --name <name>', 'update agent name')
    .option('-d, --description <description>', 'update description')
    .option('-m, --model <model>', 'change AI model')
    .option('-s, --status <status>', 'update status')
    .option('-c, --config <file>', 'load configuration from JSON file')
    .option('--capabilities', 'edit capabilities interactively')
    .option('--personality', 'edit personality settings')
    .option('--preferences', 'edit language and framework preferences')
    .option('--instructions', 'edit custom instructions')
    .option('--settings', 'edit model settings (temperature, tokens, etc.)')
    .option('--interactive', 'full interactive editing wizard')
    .action(async (agentId, options) => {
      try {
        await initializeServices();
        await handleEditAgent(agentId, options);
      } catch (error) {
        Logger.error(`Agent editing failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Delete agent command - Enhanced with safety checks
  agent
    .command('delete <agentId>')
    .alias('rm')
    .description('Delete an agent with confirmation and backup options')
    .option('-f, --force', 'force deletion without confirmation')
    .option('--backup', 'create backup before deletion')
    .option('--multiple <ids>', 'delete multiple agents (comma-separated IDs)')
    .action(async (agentId, options) => {
      try {
        await initializeServices();
        await handleDeleteAgent(agentId, options);
      } catch (error) {
        Logger.error(`Agent deletion failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Models command - Enhanced with comprehensive model information
  agent
    .command('models')
    .description('List and compare available AI models with detailed information')
    .option('-j, --json', 'output as JSON')
    .option('-t, --table', 'display as formatted table')
    .option('-p, --provider <provider>', 'filter by provider (openai, anthropic, google, ollama, etc.)')
    .option('-c, --capabilities <caps>', 'filter by capabilities (code, chat, vision, reasoning)')
    .option('-l, --local', 'show only local models')
    .option('--cloud', 'show only cloud models')
    .option('--available', 'show only available models')
    .option('--pricing', 'show detailed pricing information')
    .option('--performance', 'show performance metrics')
    .option('--compare <models>', 'compare specific models (comma-separated)')
    .option('--recommend <task>', 'get model recommendations for specific task')
    .action(async (options) => {
      try {
        await initializeServices();
        await handleListModels(options);
      } catch (error) {
        Logger.error(`Failed to list models: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Test agent command
  agent
    .command('test <agentId>')
    .description('Test an agent with a sample prompt')
    .option('-p, --prompt <prompt>', 'test prompt')
    .option('-f, --file <file>', 'load prompt from file')
    .option('--stream', 'stream response')
    .action(async (agentId, options) => {
      try {
        await requireAuth();
        await handleTestAgent(agentId, options);
      } catch (error) {
        Logger.error(`Agent test failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Clone agent command
  agent
    .command('clone <agentId>')
    .description('Clone an existing agent')
    .option('-n, --name <name>', 'name for cloned agent')
    .option('--public', 'make clone public')
    .action(async (agentId, options) => {
      try {
        await requireAuth();
        await handleCloneAgent(agentId, options);
      } catch (error) {
        Logger.error(`Agent cloning failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });
}

async function handleCreateAgent(options: any): Promise<void> {
  if (!agentManager) {
    throw new Error('Agent manager not initialized');
  }

  console.log(
    boxen(
      chalk.cyan('🤖 Create AI Agent - Enhanced Configuration Wizard'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  let agentConfig: CreateAgentRequest;

  if (options.config) {
    // Load configuration from file
    try {
      const configData = await fs.readJson(options.config);
      agentConfig = configData;
    } catch (error) {
      Logger.error(`Failed to load config file: ${error}`);
      return;
    }
  } else if (options.template) {
    // Use predefined template
    agentConfig = getAgentTemplate(options.template);
    
    // Override with command line options
    if (options.name) agentConfig.name = options.name;
    if (options.description) agentConfig.description = options.description;
    if (options.model) agentConfig.model = options.model;
  } else if (options.interactive || !options.name) {
    // Interactive creation wizard
    agentConfig = await runInteractiveAgentCreation(options);
  } else {
    // Quick creation from command line options
    agentConfig = {
      name: options.name,
      description: options.description || `${options.name} - AI coding assistant`,
      model: options.model || 'gpt-4',
      capabilities: {
        general: {
          codeGeneration: true,
          codeReview: true,
          debugging: true,
          testing: true,
          documentation: true
        }
      },
      preferences: {
        languages: [options.language || 'typescript'],
        frameworks: [],
        tools: []
      },
      personality: {
        tone: PersonalityTone.PROFESSIONAL,
        verbosity: VerbosityLevel.CONCISE,
        formality: FormalityLevel.NEUTRAL
      },
      metadata: {
        category: AgentCategory.GENERAL,
        tags: [options.type || 'general'],
        visibility: 'private'
      }
    };
  }

  const spinner = ora('Creating agent with enhanced configuration...').start();

  try {
    const agent = await agentManager.createAgent(agentConfig);
    
    spinner.succeed(chalk.green('Agent created successfully!'));
    
    // Display comprehensive agent information
    displayAgentCreated(agent);

    // Ask if user wants to test the agent
    const testAgent = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'test',
        message: 'Test the agent now?',
        default: true,
      },
    ]);

    if (testAgent.test) {
      await handleTestAgent(agent.id, { prompt: 'Hello! Can you help me with a simple code example?' });
    }
  } catch (error) {
    spinner.fail(chalk.red('Agent creation failed'));
    Logger.error(`Error: ${error instanceof Error ? error.message : error}`);
  }
}

async function handleListAgents(options: any): Promise<void> {
  if (!agentManager) {
    throw new Error('Agent manager not initialized');
  }

  const spinner = ora('Fetching agents...').start();

  try {
    // Build filter from options
    const filter: AgentListFilter = {};
    if (options.status) {
      filter.status = Array.isArray(options.status) ? options.status : [options.status];
    }
    if (options.category) {
      filter.category = Array.isArray(options.category) ? options.category : [options.category];
    }
    if (options.search) {
      filter.search = options.search;
    }
    if (options.tags) {
      filter.tags = options.tags.split(',').map((t: string) => t.trim());
    }
    if (options.language) {
      filter.languages = [options.language];
    }
    if (options.framework) {
      filter.frameworks = [options.framework];
    }
    
    // Build sort from options
    const sort: AgentListSort = {
      field: options.sort || 'updatedAt',
      direction: options.order === 'asc' ? 'asc' : 'desc'
    };
    
    const limit = options.limit ? parseInt(options.limit) : undefined;
    
    const agents = await agentManager.listAgents(filter, sort, limit);
    
    spinner.succeed(chalk.green(`Found ${agents.length} agent${agents.length !== 1 ? 's' : ''}`));
    
    if (agents.length === 0) {
      console.log(chalk.yellow('No agents found matching your criteria.'));
      console.log(chalk.gray('Create your first agent with: codecraft agent create'));
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(agents, null, 2));
      return;
    }

    if (options.table) {
      displayAgentsTable(agents, options.stats);
    } else {
      displayAgentsList(agents, options.stats);
    }
  } catch (error) {
    spinner.fail(chalk.red('Failed to fetch agents'));
    throw error;
  }
}

async function handleShowAgent(agentId: string, options: any): Promise<void> {
  if (!agentManager) {
    throw new Error('Agent manager not initialized');
  }

  const spinner = ora('Fetching agent details...').start();

  try {
    const agent = await agentManager.getAgent(agentId);
    
    if (!agent) {
      spinner.fail(chalk.red('Agent not found'));
      console.log(chalk.red(`No agent found with ID: ${agentId}`));
      return;
    }

    spinner.succeed(chalk.green('Agent details retrieved'));

    if (options.json) {
      console.log(JSON.stringify(agent, null, 2));
      return;
    }

    // Basic agent information
    console.log(
      boxen(
        chalk.white(`🤖 ${agent.name}\n`) +
        chalk.gray(`ID: ${agent.id}\n`) +
        chalk.gray(`Model: ${agent.model}\n`) +
        chalk.gray(`Category: ${agent.metadata.category}\n`) +
        chalk.gray(`Status: ${getStatusIcon(agent.status)} ${agent.status}\n`) +
        chalk.gray(`Description: ${agent.description}\n`) +
        chalk.gray(`Tags: ${agent.metadata.tags.join(', ') || 'None'}\n`) +
        chalk.gray(`Created: ${agent.createdAt.toLocaleString()}\n`) +
        chalk.gray(`Updated: ${agent.updatedAt.toLocaleString()}\n`) +
        getVisibilityBadge(agent.metadata.visibility),
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
          title: 'Agent Details',
        }
      )
    );

    // Show capabilities if requested
    if (options.capabilities) {
      displayCapabilitiesSection(agent);
    }

    // Show personality if requested
    if (options.personality) {
      displayPersonalitySection(agent);
    }

    // Show configuration if requested
    if (options.config) {
      displayConfigurationSection(agent);
    }

    // Show performance metrics if requested
    if (options.performance) {
      displayPerformanceSection(agent);
    }

    // Show usage history if requested
    if (options.history) {
      displayHistorySection(agent);
    }

    // Export agent configuration if requested
    if (options.export) {
      await exportAgentConfiguration(agent, options.export);
    }
  } catch (error) {
    spinner.fail(chalk.red('Failed to fetch agent details'));
    throw error;
  }
}

async function handleEditAgent(agentId: string, options: any): Promise<void> {
  console.log(
    boxen(
      chalk.cyan(`🔧 Edit Agent: ${agentId}`),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  // First fetch current agent details
  const spinner = ora('Fetching current agent configuration...').start();
  
  try {
    const token = ConfigManager.get('auth.token');
    const result = await AgentService.getAgent(token, agentId);
    
    if (!result.success) {
      spinner.fail(chalk.red('Failed to fetch agent'));
      console.log(chalk.red(result.error || 'Agent not found'));
      return;
    }

    spinner.succeed(chalk.green('Agent configuration loaded'));
    
    const currentAgent = result.agent;
    let updates: any = {};

    if (options.interactive || (!options.name && !options.description && !options.model)) {
      updates = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Agent name:',
          default: currentAgent.name,
        },
        {
          type: 'input',
          name: 'description',
          message: 'Description:',
          default: currentAgent.description,
        },
        {
          type: 'list',
          name: 'model',
          message: 'AI model:',
          default: currentAgent.model,
          choices: [
            { name: 'GPT-4 (OpenAI)', value: 'gpt-4' },
            { name: 'GPT-3.5 Turbo (OpenAI)', value: 'gpt-3.5-turbo' },
            { name: 'Claude 3 Opus (Anthropic)', value: 'claude-3-opus' },
            { name: 'Claude 3 Sonnet (Anthropic)', value: 'claude-3-sonnet' },
            { name: 'Claude 3 Haiku (Anthropic)', value: 'claude-3-haiku' },
            { name: 'Gemini Pro (Google)', value: 'gemini-pro' },
          ],
        },
        {
          type: 'confirm',
          name: 'public',
          message: 'Make agent public?',
          default: currentAgent.public,
        },
      ]);
    } else {
      if (options.name) updates.name = options.name;
      if (options.description) updates.description = options.description;
      if (options.model) updates.model = options.model;
    }

    // Remove undefined values
    updates = Object.fromEntries(Object.entries(updates).filter(([_, v]) => v !== undefined));

    if (Object.keys(updates).length === 0) {
      console.log(chalk.yellow('No changes specified.'));
      return;
    }

    const updateSpinner = ora('Updating agent...').start();

    const updateResult = await AgentService.updateAgent(token, agentId, updates);
    
    if (updateResult.success) {
      updateSpinner.succeed(chalk.green('Agent updated successfully!'));
      
      console.log(
        boxen(
          chalk.white(`✅ ${updateResult.agent.name} Updated\n`) +
          Object.entries(updates).map(([key, value]) => 
            chalk.gray(`${key}: ${value}`)
          ).join('\n'),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'green',
          }
        )
      );
    } else {
      updateSpinner.fail(chalk.red('Agent update failed'));
      console.log(chalk.red(updateResult.error || 'Unknown error'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Agent update failed'));
    throw error;
  }
}

async function handleDeleteAgent(agentId: string, options: any): Promise<void> {
  if (!options.force) {
    const confirmed = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'delete',
        message: `Are you sure you want to delete agent "${agentId}"?`,
        default: false,
      },
    ]);

    if (!confirmed.delete) {
      console.log(chalk.yellow('Agent deletion cancelled.'));
      return;
    }
  }

  const spinner = ora('Deleting agent...').start();

  try {
    const token = ConfigManager.get('auth.token');
    const result = await AgentService.deleteAgent(token, agentId);
    
    if (result.success) {
      spinner.succeed(chalk.green('Agent deleted successfully!'));
    } else {
      spinner.fail(chalk.red('Agent deletion failed'));
      console.log(chalk.red(result.error || 'Unknown error'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Agent deletion failed'));
    throw error;
  }
}

async function handleListModels(options: any): Promise<void> {
  const spinner = ora('Fetching available models...').start();

  try {
    const result = await AgentService.listModels({
      provider: options.provider,
      includePricing: options.pricing,
    });
    
    if (result.success) {
      spinner.succeed(chalk.green(`Found ${result.models.length} models`));
      
      if (options.json) {
        console.log(JSON.stringify(result.models, null, 2));
      } else {
        const groupedModels = result.models.reduce((acc: any, model: any) => {
          if (!acc[model.provider]) acc[model.provider] = [];
          acc[model.provider].push(model);
          return acc;
        }, {});

        for (const [provider, models] of Object.entries(groupedModels)) {
          console.log(
            boxen(
              chalk.white(`🤖 ${provider.toUpperCase()} Models\n`) +
              (models as any[]).map((model: any) => 
                chalk.cyan(`• ${model.name}\n`) +
                chalk.gray(`  ID: ${model.id}\n`) +
                chalk.gray(`  Context: ${model.contextLength || 'Unknown'} tokens\n`) +
                (options.pricing && model.pricing ? 
                  chalk.gray(`  Input: $${model.pricing.input}/1K tokens | Output: $${model.pricing.output}/1K tokens\n`) : ''
                ) +
                chalk.gray(`  ${model.description || 'No description'}`)
              ).join('\n\n'),
              {
                padding: 1,
                borderStyle: 'round',
                borderColor: 'cyan',
                title: provider,
              }
            )
          );
        }
      }
    } else {
      spinner.fail(chalk.red('Failed to fetch models'));
      console.log(chalk.red(result.error || 'Unknown error'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Failed to fetch models'));
    throw error;
  }
}

async function handleTestAgent(agentId: string, options: any): Promise<void> {
  let prompt = options.prompt;

  if (options.file) {
    const fs = require('fs-extra');
    try {
      prompt = await fs.readFile(options.file, 'utf8');
    } catch (error) {
      Logger.error(`Failed to read prompt file: ${error}`);
      return;
    }
  }

  if (!prompt) {
    const response = await inquirer.prompt([
      {
        type: 'input',
        name: 'prompt',
        message: 'Test prompt:',
        validate: (input) => input.length > 0 || 'Prompt cannot be empty',
      },
    ]);
    prompt = response.prompt;
  }

  console.log(
    boxen(
      chalk.cyan(`🧪 Testing Agent: ${agentId}\n`) +
      chalk.gray(`Prompt: ${prompt}`),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  const spinner = ora('Generating response...').start();

  try {
    const token = ConfigManager.get('auth.token');
    
    if (options.stream) {
      spinner.succeed(chalk.green('Starting stream...'));
      console.log(chalk.white('\n📝 Agent Response:\n'));
      
      await AgentService.testAgentStream(token, agentId, prompt, (chunk: string) => {
        process.stdout.write(chunk);
      });
      
      console.log('\n');
    } else {
      const result = await AgentService.testAgent(token, agentId, prompt);
      
      if (result.success) {
        spinner.succeed(chalk.green('Response generated'));
        
        console.log(
          boxen(
            chalk.white('📝 Agent Response\n') +
            chalk.gray(result.response),
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'green',
              title: 'Response',
            }
          )
        );

        if (result.usage) {
          console.log(
            boxen(
              chalk.white('📊 Usage\n') +
              chalk.gray(`Tokens: ${result.usage.totalTokens}\n`) +
              chalk.gray(`Response Time: ${result.usage.responseTime}ms\n`) +
              chalk.gray(`Cost: $${result.usage.cost || 'N/A'}`),
              {
                padding: 1,
                borderStyle: 'round',
                borderColor: 'blue',
                title: 'Usage',
              }
            )
          );
        }
      } else {
        spinner.fail(chalk.red('Test failed'));
        console.log(chalk.red(result.error || 'Unknown error'));
      }
    }
  } catch (error) {
    spinner.fail(chalk.red('Agent test failed'));
    throw error;
  }
}

async function handleCloneAgent(agentId: string, options: any): Promise<void> {
  const spinner = ora('Cloning agent...').start();

  try {
    const token = ConfigManager.get('auth.token');
    const result = await AgentService.cloneAgent(token, agentId, {
      name: options.name,
      public: options.public,
    });
    
    if (result.success) {
      spinner.succeed(chalk.green('Agent cloned successfully!'));
      
      console.log(
        boxen(
          chalk.white(`🤖 ${result.agent.name}\n`) +
          chalk.gray(`Original ID: ${agentId}\n`) +
          chalk.gray(`Clone ID: ${result.agent.id}\n`) +
          chalk.gray(`Status: ${result.agent.status}`),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'green',
            title: 'Agent Cloned',
          }
        )
      );
    } else {
      spinner.fail(chalk.red('Agent cloning failed'));
      console.log(chalk.red(result.error || 'Unknown error'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Agent cloning failed'));
    throw error;
  }
}

async function runInteractiveAgentCreation(options: any): Promise<CreateAgentRequest> {
  console.log(chalk.cyan('\n📋 Starting Enhanced Agent Creation Wizard\n'));

  // Step 1: Basic Information
  const basicInfo = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: '👤 Agent name:',
      default: options.name,
      validate: (input) => {
        if (input.length < 3) return 'Name must be at least 3 characters';
        if (!/^[a-zA-Z0-9\s\-_]+$/.test(input)) return 'Name can only contain letters, numbers, spaces, hyphens, and underscores';
        return true;
      },
    },
    {
      type: 'editor',
      name: 'description',
      message: '📝 Agent description (opens editor):',
      default: options.description || 'An intelligent AI coding assistant specialized in...',
      validate: (input) => input.length >= 10 || 'Description must be at least 10 characters',
    }
  ]);

  // Step 2: Category and Specialization
  const specialization = await inquirer.prompt([
    {
      type: 'list',
      name: 'category',
      message: '🎯 Primary specialization category:',
      choices: [
        { name: '🌐 Web Development - Frontend, backend, full-stack', value: AgentCategory.WEB },
        { name: '📱 Mobile Development - iOS, Android, cross-platform', value: AgentCategory.MOBILE },
        { name: '⛓️  Blockchain/Web3 - Smart contracts, DeFi, NFTs', value: AgentCategory.BLOCKCHAIN },
        { name: '🧠 AI/ML Development - Machine learning, deep learning', value: AgentCategory.AI },
        { name: '🔧 Backend Development - APIs, databases, microservices', value: AgentCategory.BACKEND },
        { name: '☁️  DevOps/Cloud - Infrastructure, deployment, monitoring', value: AgentCategory.DEVOPS },
        { name: '🎨 UI/UX Design - Design systems, prototyping', value: AgentCategory.DESIGN },
        { name: '📊 Data Science - Analytics, visualization, modeling', value: AgentCategory.DATA },
        { name: '🔒 Security - Cybersecurity, penetration testing', value: AgentCategory.SECURITY },
        { name: '⚡ Performance - Optimization, profiling, scaling', value: AgentCategory.PERFORMANCE },
        { name: '🏗️  General - Multi-purpose development assistant', value: AgentCategory.GENERAL },
      ],
    },
    {
      type: 'checkbox',
      name: 'tags',
      message: '🏷️  Additional tags (select all that apply):',
      choices: [
        'frontend', 'backend', 'fullstack', 'api', 'database', 'testing',
        'security', 'performance', 'cloud', 'devops', 'mobile', 'web3',
        'ai', 'ml', 'data', 'analytics', 'ui', 'ux', 'design'
      ],
    }
  ]);

  // Step 3: AI Model Selection
  const availableModels = aiHub ? await aiHub.getAvailableModels() : [];
  const modelChoices = availableModels.length > 0 
    ? availableModels.map(model => ({
        name: `${model.name} (${model.provider}) - ${model.description}`,
        value: model.id
      }))
    : [
        { name: 'GPT-4o (OpenAI) - Most capable, latest model', value: 'gpt-4o' },
        { name: 'GPT-4 Turbo (OpenAI) - High capability, cost effective', value: 'gpt-4-turbo' },
        { name: 'Claude 3.5 Sonnet (Anthropic) - Excellent reasoning', value: 'claude-3.5-sonnet' },
        { name: 'Claude 3 Opus (Anthropic) - Most powerful', value: 'claude-3-opus' },
        { name: 'Claude 3 Haiku (Anthropic) - Fast and efficient', value: 'claude-3-haiku' },
        { name: 'Gemini Pro 1.5 (Google) - Multimodal capabilities', value: 'gemini-pro-1.5' },
        { name: 'Qwen2.5-Coder:7B (Local/Ollama) - Code-focused, private', value: 'ollama/qwen2.5-coder:7b' },
        { name: 'CodeLlama:13B (Local/Ollama) - Code generation, private', value: 'ollama/codellama:13b' },
        { name: 'DeepSeek Coder:6.7B (Local/Ollama) - Fast coding, private', value: 'ollama/deepseek-coder:6.7b' },
      ];

  const modelSelection = await inquirer.prompt([
    {
      type: 'list',
      name: 'model',
      message: '🤖 Select AI model:',
      default: options.model || 'claude-3.5-sonnet',
      choices: modelChoices,
    },
    {
      type: 'confirm',
      name: 'configureAdvanced',
      message: '⚙️  Configure advanced model settings?',
      default: false,
    }
  ]);

  let modelSettings = {
    temperature: 0.7,
    maxTokens: 2000,
    topP: 1.0
  };

  if (modelSelection.configureAdvanced) {
    const advancedSettings = await inquirer.prompt([
      {
        type: 'number',
        name: 'temperature',
        message: '🌡️  Temperature (creativity vs consistency, 0.0-1.0):',
        default: 0.7,
        validate: (input) => input >= 0 && input <= 1 || 'Must be between 0.0 and 1.0',
      },
      {
        type: 'number',
        name: 'maxTokens',
        message: '📏 Maximum tokens per response:',
        default: 2000,
        validate: (input) => input > 100 && input <= 32000 || 'Must be between 100 and 32000',
      }
    ]);
    modelSettings = { ...modelSettings, ...advancedSettings };
  }

  // Step 4: Capabilities Configuration
  const capabilities = await configureCapabilities(specialization.category);

  // Step 5: Language and Framework Preferences
  const preferences = await configurePreferences();

  // Step 6: Personality Configuration
  const personality = await configurePersonality();

  // Step 7: Custom Instructions
  const instructions = await configureInstructions();

  // Step 8: Final Configuration
  const finalConfig = await inquirer.prompt([
    {
      type: 'list',
      name: 'visibility',
      message: '👁️  Agent visibility:',
      default: 'private',
      choices: [
        { name: '🔒 Private - Only you can use this agent', value: 'private' },
        { name: '🏢 Team - Team members can use this agent', value: 'team' },
        { name: '🌐 Public - Anyone can discover and use this agent', value: 'public' },
      ],
    },
    {
      type: 'input',
      name: 'version',
      message: '🏷️  Initial version:',
      default: '1.0.0',
      validate: (input) => /^\d+\.\d+\.\d+$/.test(input) || 'Version must be in semver format (e.g., 1.0.0)',
    }
  ]);

  // Construct the complete agent configuration
  const agentConfig: CreateAgentRequest = {
    name: basicInfo.name,
    description: basicInfo.description,
    model: modelSelection.model,
    capabilities,
    preferences,
    personality,
    instructions,
    metadata: {
      category: specialization.category,
      tags: specialization.tags,
      visibility: finalConfig.visibility,
      version: finalConfig.version,
      author: 'user'
    },
    settings: modelSettings
  };

  // Show configuration summary
  displayConfigurationSummary(agentConfig);

  const confirmation = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'create',
      message: '✅ Create agent with this configuration?',
      default: true,
    }
  ]);

  if (!confirmation.create) {
    throw new Error('Agent creation cancelled by user');
  }

  return agentConfig;
}

async function configureCapabilities(category: AgentCategory): Promise<any> {
  console.log(chalk.cyan('\n🛠️  Configuring Agent Capabilities\n'));

  const generalCapabilities = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'general',
      message: '⚙️  General capabilities:',
      choices: [
        { name: '💻 Code Generation - Write new code from scratch', value: 'codeGeneration', checked: true },
        { name: '👁️  Code Review - Analyze and improve existing code', value: 'codeReview', checked: true },
        { name: '🐛 Debugging - Find and fix code issues', value: 'debugging', checked: true },
        { name: '🧪 Testing - Create and manage tests', value: 'testing', checked: true },
        { name: '📚 Documentation - Generate docs and comments', value: 'documentation', checked: true },
        { name: '🔄 Refactoring - Improve code structure', value: 'refactoring' },
        { name: '🏗️  Architecture - Design system architecture', value: 'architecture' },
        { name: '🔐 Security - Security analysis and hardening', value: 'security' },
        { name: '⚡ Performance - Optimization and profiling', value: 'performance' },
        { name: '🚀 Deployment - Deployment and DevOps tasks', value: 'deployment' },
      ],
    }
  ]);

  // Category-specific capabilities
  let specificCapabilities = {};
  
  if (category === AgentCategory.WEB) {
    const webCapabilities = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'frameworks',
        message: '🌐 Web frameworks expertise:',
        choices: [
          'React', 'Vue.js', 'Angular', 'Svelte', 'Next.js', 'Nuxt.js',
          'Express.js', 'Fastify', 'NestJS', 'Koa.js'
        ],
      },
      {
        type: 'checkbox',
        name: 'features',
        message: '✨ Web-specific features:',
        choices: [
          'PWA Development', 'SSR/SSG', 'Performance Optimization',
          'SEO Optimization', 'Accessibility', 'Responsive Design'
        ],
      }
    ]);
    specificCapabilities = { web: { enabled: true, ...webCapabilities } };
  }

  // Similar for other categories...
  
  return {
    general: generalCapabilities.general.reduce((acc: any, cap: string) => {
      acc[cap] = true;
      return acc;
    }, {}),
    ...specificCapabilities
  };
}

async function configurePreferences(): Promise<any> {
  console.log(chalk.cyan('\n🎯 Configuring Language & Framework Preferences\n'));

  return await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'languages',
      message: '💬 Preferred programming languages:',
      choices: [
        'TypeScript', 'JavaScript', 'Python', 'Java', 'C#', 'Go',
        'Rust', 'C++', 'Swift', 'Kotlin', 'PHP', 'Ruby', 'Scala'
      ],
    },
    {
      type: 'checkbox',
      name: 'tools',
      message: '🔧 Preferred development tools:',
      choices: [
        'VS Code', 'IntelliJ', 'Vim/Neovim', 'Git', 'Docker',
        'Kubernetes', 'AWS', 'Azure', 'GCP', 'Terraform'
      ],
    },
    {
      type: 'list',
      name: 'codingStyle',
      message: '📝 Coding style preference:',
      choices: [
        { name: 'Minimal - Clean and concise code', value: 'minimal' },
        { name: 'Documented - Well-commented code', value: 'documented' },
        { name: 'Verbose - Explicit and detailed code', value: 'verbose' },
        { name: 'Enterprise - Enterprise-grade patterns', value: 'enterprise' }
      ],
    }
  ]);
}

async function configurePersonality(): Promise<any> {
  console.log(chalk.cyan('\n🎭 Configuring Agent Personality\n'));

  return await inquirer.prompt([
    {
      type: 'list',
      name: 'tone',
      message: '🗣️  Communication tone:',
      choices: [
        { name: '👔 Professional - Formal and business-like', value: PersonalityTone.PROFESSIONAL },
        { name: '😊 Friendly - Warm and approachable', value: PersonalityTone.FRIENDLY },
        { name: '🤝 Casual - Relaxed and informal', value: PersonalityTone.CASUAL },
        { name: '🎓 Academic - Scholarly and detailed', value: PersonalityTone.ACADEMIC },
        { name: '💡 Enthusiastic - Energetic and positive', value: PersonalityTone.ENTHUSIASTIC }
      ],
    },
    {
      type: 'list',
      name: 'verbosity',
      message: '📏 Response length preference:',
      choices: [
        { name: '📝 Concise - Short and to the point', value: VerbosityLevel.CONCISE },
        { name: '📄 Detailed - Comprehensive explanations', value: VerbosityLevel.DETAILED },
        { name: '📚 Verbose - Extensive documentation', value: VerbosityLevel.VERBOSE }
      ],
    },
    {
      type: 'list',
      name: 'approach',
      message: '🎯 Problem-solving approach:',
      choices: [
        { name: '⚡ Pragmatic - Practical, get-it-done solutions', value: ApproachStyle.PRAGMATIC },
        { name: '🔬 Methodical - Systematic, step-by-step approach', value: ApproachStyle.METHODICAL },
        { name: '💡 Creative - Innovative and unconventional solutions', value: ApproachStyle.CREATIVE },
        { name: '🎓 Academic - Research-based, theoretical approach', value: ApproachStyle.ACADEMIC }
      ],
    }
  ]);
}

async function configureInstructions(): Promise<any> {
  console.log(chalk.cyan('\n📋 Configuring Custom Instructions\n'));

  return await inquirer.prompt([
    {
      type: 'editor',
      name: 'system',
      message: '🤖 System prompt (defines agent behavior):',
      default: 'You are an expert software developer and coding assistant. Always provide high-quality, production-ready code with proper error handling and best practices.',
    },
    {
      type: 'editor',
      name: 'context',
      message: '📄 Additional context (optional):',
      default: '',
    },
    {
      type: 'input',
      name: 'constraints',
      message: '🚫 Constraints or limitations (comma-separated):',
      filter: (input: string) => input.split(',').map(s => s.trim()).filter(Boolean),
    }
  ]);
}

function displayConfigurationSummary(config: CreateAgentRequest): void {
  console.log(
    boxen(
      chalk.white('📋 Agent Configuration Summary\n\n') +
      chalk.cyan('Basic Information:\n') +
      chalk.gray(`• Name: ${config.name}\n`) +
      chalk.gray(`• Model: ${config.model}\n`) +
      chalk.gray(`• Category: ${config.metadata?.category}\n`) +
      chalk.gray(`• Visibility: ${config.metadata?.visibility}\n\n`) +
      chalk.cyan('Capabilities:\n') +
      chalk.gray(`• General: ${Object.keys(config.capabilities?.general || {}).filter(k => (config.capabilities?.general as any)?.[k]).join(', ')}\n`) +
      chalk.gray(`• Languages: ${config.preferences?.languages?.join(', ') || 'None specified'}\n`) +
      chalk.gray(`• Personality: ${config.personality?.tone} / ${config.personality?.verbosity}\n`),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
        title: 'Configuration Summary'
      }
    )
  );
}

function displayAgentCreated(agent: Agent): void {
  console.log(
    boxen(
      chalk.white(`🤖 ${agent.name}\n`) +
      chalk.gray(`ID: ${agent.id}\n`) +
      chalk.gray(`Model: ${agent.model}\n`) +
      chalk.gray(`Category: ${agent.metadata.category}\n`) +
      chalk.gray(`Status: ${agent.status}\n`) +
      chalk.gray(`Created: ${agent.createdAt.toLocaleString()}\n`) +
      (agent.metadata.visibility === 'public' ? chalk.green('🌐 Public') : 
       agent.metadata.visibility === 'team' ? chalk.yellow('🏢 Team') : 
       chalk.blue('🔒 Private')),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'green',
        title: 'Agent Created Successfully',
      }
    )
  );
}

function getAgentTemplate(templateName: string): CreateAgentRequest {
  const templates: Record<string, CreateAgentRequest> = {
    'web-developer': {
      name: 'Web Developer',
      description: 'Full-stack web development specialist with expertise in modern frameworks and best practices.',
      model: 'claude-3.5-sonnet',
      capabilities: {
        web: { enabled: true, frameworks: ['React', 'Next.js', 'Express.js'], features: ['SSR/SSG', 'Performance'] },
        general: { codeGeneration: true, codeReview: true, debugging: true, testing: true }
      },
      preferences: {
        languages: ['TypeScript', 'JavaScript'],
        frameworks: ['React', 'Next.js', 'Express.js'],
        tools: ['VS Code', 'Git', 'Docker']
      },
      personality: {
        tone: PersonalityTone.PROFESSIONAL,
        verbosity: VerbosityLevel.DETAILED,
        approach: ApproachStyle.PRAGMATIC
      },
      metadata: {
        category: AgentCategory.WEB,
        tags: ['web', 'frontend', 'backend', 'fullstack'],
        visibility: 'private'
      }
    },
    'mobile-developer': {
      name: 'Mobile Developer',
      description: 'Cross-platform mobile development expert with React Native and native development experience.',
      model: 'gpt-4o',
      capabilities: {
        mobile: { enabled: true, platforms: ['iOS', 'Android'], frameworks: ['React Native', 'Flutter'] },
        general: { codeGeneration: true, codeReview: true, debugging: true, testing: true }
      },
      preferences: {
        languages: ['TypeScript', 'Swift', 'Kotlin', 'Dart'],
        frameworks: ['React Native', 'Flutter'],
        tools: ['Xcode', 'Android Studio', 'VS Code']
      },
      personality: {
        tone: PersonalityTone.FRIENDLY,
        verbosity: VerbosityLevel.DETAILED,
        approach: ApproachStyle.METHODICAL
      },
      metadata: {
        category: AgentCategory.MOBILE,
        tags: ['mobile', 'ios', 'android', 'cross-platform'],
        visibility: 'private'
      }
    }
  };

  return templates[templateName] || templates['web-developer'];
}

function displayAgentsList(agents: Agent[], showStats: boolean): void {
  for (const agent of agents) {
    console.log(
      boxen(
        chalk.white(`🤖 ${agent.name}\n`) +
        chalk.gray(`ID: ${agent.id}\n`) +
        chalk.gray(`Model: ${agent.model}\n`) +
        chalk.gray(`Category: ${agent.metadata.category}\n`) +
        chalk.gray(`Status: ${getStatusIcon(agent.status)} ${agent.status}\n`) +
        chalk.gray(`Description: ${agent.description}\n`) +
        chalk.gray(`Tags: ${agent.metadata.tags.join(', ') || 'None'}\n`) +
        (showStats ? displayPerformanceStats(agent) : '') +
        chalk.gray(`Created: ${agent.createdAt.toLocaleDateString()} | `) +
        chalk.gray(`Updated: ${agent.updatedAt.toLocaleDateString()}\n`) +
        getVisibilityBadge(agent.metadata.visibility),
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: getStatusColor(agent.status),
          title: `Agent ${agent.id.substring(0, 8)}`
        }
      )
    );
  }
}

function displayAgentsTable(agents: Agent[], showStats: boolean): void {
  const table = new Table({
    head: [
      chalk.cyan('Name'),
      chalk.cyan('ID'),
      chalk.cyan('Model'),
      chalk.cyan('Category'),
      chalk.cyan('Status'),
      chalk.cyan('Performance'),
      chalk.cyan('Updated')
    ],
    style: {
      head: [],
      border: []
    }
  });

  for (const agent of agents) {
    table.push([
      agent.name,
      agent.id.substring(0, 12) + '...',
      agent.model,
      agent.metadata.category,
      `${getStatusIcon(agent.status)} ${agent.status}`,
      showStats ? `${agent.performance.successRate}% | ${agent.performance.totalRequests} req` : 'N/A',
      agent.updatedAt.toLocaleDateString()
    ]);
  }

  console.log(table.toString());
}

function displayPerformanceStats(agent: Agent): string {
  return chalk.gray(`Performance: ${agent.performance.successRate}% success | `) +
         chalk.gray(`${agent.performance.totalRequests} requests | `) +
         chalk.gray(`${agent.performance.averageResponseTime}ms avg\n`);
}

function getStatusIcon(status: AgentStatus): string {
  switch (status) {
    case AgentStatus.ACTIVE: return '🟢';
    case AgentStatus.INACTIVE: return '🔴';
    case AgentStatus.ERROR: return '🔴';
    case AgentStatus.MAINTENANCE: return '🟡';
    default: return '⚪';
  }
}

function getStatusColor(status: AgentStatus): string {
  switch (status) {
    case AgentStatus.ACTIVE: return 'green';
    case AgentStatus.INACTIVE: return 'red';
    case AgentStatus.ERROR: return 'red';
    case AgentStatus.MAINTENANCE: return 'yellow';
    default: return 'gray';
  }
}

function getVisibilityBadge(visibility: string): string {
  switch (visibility) {
    case 'public': return chalk.green('🌐 Public');
    case 'team': return chalk.yellow('🏢 Team');
    case 'private': return chalk.blue('🔒 Private');
    default: return chalk.gray('👁️  Unknown');
  }
}

function displayCapabilitiesSection(agent: Agent): void {
  const generalCaps = Object.entries(agent.capabilities.general || {})
    .filter(([_, enabled]) => enabled)
    .map(([cap]) => cap)
    .join(', ');
    
  console.log(
    boxen(
      chalk.white('🛠️  Agent Capabilities\n\n') +
      chalk.cyan('General Capabilities:\n') +
      chalk.gray(`${generalCaps || 'None'}\n\n`) +
      chalk.cyan('Specialized Capabilities:\n') +
      (agent.capabilities.web?.enabled ? chalk.gray(`Web: ${agent.capabilities.web.frameworks?.join(', ') || 'General'}\n`) : '') +
      (agent.capabilities.mobile?.enabled ? chalk.gray(`Mobile: ${agent.capabilities.mobile.platforms?.join(', ') || 'General'}\n`) : '') +
      (agent.capabilities.blockchain?.enabled ? chalk.gray(`Blockchain: ${agent.capabilities.blockchain.networks?.join(', ') || 'General'}\n`) : '') +
      (agent.capabilities.ai?.enabled ? chalk.gray(`AI/ML: ${agent.capabilities.ai.domains?.join(', ') || 'General'}\n`) : ''),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'blue',
        title: 'Capabilities'
      }
    )
  );
}

function displayPersonalitySection(agent: Agent): void {
  console.log(
    boxen(
      chalk.white('🎭 Agent Personality\n\n') +
      chalk.cyan('Communication Style:\n') +
      chalk.gray(`Tone: ${agent.personality.tone}\n`) +
      chalk.gray(`Verbosity: ${agent.personality.verbosity}\n`) +
      chalk.gray(`Formality: ${agent.personality.formality}\n`) +
      chalk.gray(`Approach: ${agent.personality.approach}\n`) +
      chalk.gray(`Feedback Style: ${agent.personality.feedback}\n`) +
      chalk.gray(`Communication: ${agent.personality.communication}\n`) +
      (agent.personality.customTraits?.length ? 
        chalk.cyan(`\nCustom Traits:\n`) + chalk.gray(agent.personality.customTraits.join(', ')) : ''),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'magenta',
        title: 'Personality'
      }
    )
  );
}

function displayConfigurationSection(agent: Agent): void {
  console.log(
    boxen(
      chalk.white('⚙️  Model Configuration\n\n') +
      chalk.cyan('Model Settings:\n') +
      chalk.gray(`Temperature: ${agent.settings.temperature}\n`) +
      chalk.gray(`Max Tokens: ${agent.settings.maxTokens}\n`) +
      chalk.gray(`Top P: ${agent.settings.topP}\n`) +
      chalk.gray(`Response Format: ${agent.settings.responseFormat}\n`) +
      chalk.gray(`Streaming: ${agent.settings.streaming ? 'Enabled' : 'Disabled'}\n`) +
      chalk.gray(`Timeout: ${agent.settings.timeout}ms\n\n`) +
      chalk.cyan('Instructions:\n') +
      chalk.gray(`System: ${agent.instructions.system.substring(0, 100)}${agent.instructions.system.length > 100 ? '...' : ''}\n`) +
      (agent.instructions.context ? chalk.gray(`Context: ${agent.instructions.context.substring(0, 100)}...\n`) : '') +
      (agent.instructions.constraints?.length ? chalk.gray(`Constraints: ${agent.instructions.constraints.join(', ')}\n`) : ''),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'yellow',
        title: 'Configuration'
      }
    )
  );
}

function displayPerformanceSection(agent: Agent): void {
  console.log(
    boxen(
      chalk.white('📊 Performance Metrics\n\n') +
      chalk.cyan('Usage Statistics:\n') +
      chalk.gray(`Total Requests: ${agent.performance.totalRequests}\n`) +
      chalk.gray(`Success Rate: ${agent.performance.successRate}%\n`) +
      chalk.gray(`Average Response Time: ${agent.performance.averageResponseTime}ms\n`) +
      chalk.gray(`Average Tokens: ${agent.performance.averageTokens}\n`) +
      chalk.gray(`Total Cost: $${agent.performance.totalCost}\n\n`) +
      chalk.cyan('Quality Metrics:\n') +
      chalk.gray(`User Ratings: ${agent.performance.ratings?.length || 0} reviews\n`) +
      chalk.gray(`Last Evaluated: ${agent.performance.lastEvaluated ? new Date(agent.performance.lastEvaluated).toLocaleDateString() : 'Never'}\n`),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'green',
        title: 'Performance'
      }
    )
  );
}

function displayHistorySection(agent: Agent): void {
  console.log(
    boxen(
      chalk.white('📈 Usage History\n\n') +
      chalk.cyan('Recent Activity:\n') +
      chalk.gray(`Last Used: ${agent.lastUsed ? new Date(agent.lastUsed).toLocaleString() : 'Never'}\n`) +
      chalk.gray(`Created: ${agent.createdAt.toLocaleString()}\n`) +
      chalk.gray(`Last Updated: ${agent.updatedAt.toLocaleString()}\n\n`) +
      chalk.cyan('Feedback Summary:\n') +
      chalk.gray(`Total Feedback: ${agent.performance.feedback?.length || 0} items\n`) +
      (agent.performance.feedback?.slice(0, 3).map((feedback: any, i: number) => 
        chalk.gray(`${i + 1}. ${feedback.comment?.substring(0, 50)}...\n`)
      ).join('') || chalk.gray('No feedback available\n')),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
        title: 'History'
      }
    )
  );
}

async function exportAgentConfiguration(agent: Agent, filePath: string): Promise<void> {
  try {
    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      agent: {
        ...agent,
        // Remove runtime data that shouldn't be exported
        performance: undefined,
        lastUsed: undefined
      }
    };
    
    await fs.writeJson(filePath, exportData, { spaces: 2 });
    console.log(
      boxen(
        chalk.green(`✅ Agent configuration exported successfully!\n`) +
        chalk.gray(`File: ${filePath}\n`) +
        chalk.gray(`Size: ${JSON.stringify(exportData).length} bytes`),
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'green',
          title: 'Export Complete'
        }
      )
    );
  } catch (error) {
    Logger.error(`Failed to export agent configuration: ${error}`);
  }
}