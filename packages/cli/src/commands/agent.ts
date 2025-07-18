/**
 * Agent management commands
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import boxen from 'boxen';
import { Logger } from '@recoder/shared';
import { AgentService } from '../services/agent';
import { ConfigManager } from '../utils/config';
import { requireAuth } from '../utils/auth';

export function setupAgentCommands(program: Command): void {
  const agent = program
    .command('agent')
    .description('AI agent management and configuration');

  // Create agent command
  agent
    .command('create')
    .description('Create a new AI agent')
    .option('-n, --name <name>', 'agent name')
    .option('-t, --type <type>', 'agent specialization type')
    .option('-m, --model <model>', 'AI model to use')
    .option('-d, --description <description>', 'agent description')
    .option('--interactive', 'interactive agent creation')
    .action(async (options) => {
      try {
        await requireAuth();
        await handleCreateAgent(options);
      } catch (error) {
        Logger.error(`Agent creation failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // List agents command
  agent
    .command('list')
    .alias('ls')
    .description('List all available agents')
    .option('-j, --json', 'output as JSON')
    .option('-f, --filter <type>', 'filter by agent type')
    .option('--mine', 'show only my agents')
    .option('--public', 'show only public agents')
    .action(async (options) => {
      try {
        await requireAuth();
        await handleListAgents(options);
      } catch (error) {
        Logger.error(`Failed to list agents: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Show agent command
  agent
    .command('show <agentId>')
    .description('Show detailed information about an agent')
    .option('-j, --json', 'output as JSON')
    .option('--config', 'show configuration')
    .option('--usage', 'show usage statistics')
    .action(async (agentId, options) => {
      try {
        await requireAuth();
        await handleShowAgent(agentId, options);
      } catch (error) {
        Logger.error(`Failed to show agent: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Edit agent command
  agent
    .command('edit <agentId>')
    .description('Edit an existing agent')
    .option('-n, --name <name>', 'new agent name')
    .option('-d, --description <description>', 'new description')
    .option('-m, --model <model>', 'change AI model')
    .option('--config <file>', 'load configuration from file')
    .option('--interactive', 'interactive editing')
    .action(async (agentId, options) => {
      try {
        await requireAuth();
        await handleEditAgent(agentId, options);
      } catch (error) {
        Logger.error(`Agent editing failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Delete agent command
  agent
    .command('delete <agentId>')
    .alias('rm')
    .description('Delete an agent')
    .option('-f, --force', 'force deletion without confirmation')
    .action(async (agentId, options) => {
      try {
        await requireAuth();
        await handleDeleteAgent(agentId, options);
      } catch (error) {
        Logger.error(`Agent deletion failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Models command
  agent
    .command('models')
    .description('List available AI models')
    .option('-j, --json', 'output as JSON')
    .option('-p, --provider <provider>', 'filter by provider')
    .option('--pricing', 'show pricing information')
    .action(async (options) => {
      try {
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
  console.log(
    boxen(
      chalk.cyan('🤖 Create AI Agent'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  let agentConfig: any;

  if (options.interactive || !options.name) {
    agentConfig = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Agent name:',
        default: options.name,
        validate: (input) => input.length >= 3 || 'Agent name must be at least 3 characters',
      },
      {
        type: 'list',
        name: 'type',
        message: 'Agent specialization:',
        default: options.type,
        choices: [
          { name: '🌐 Web Development', value: 'web' },
          { name: '📱 Mobile Development', value: 'mobile' },
          { name: '⛓️  Blockchain/Web3', value: 'blockchain' },
          { name: '🧠 AI/ML Development', value: 'ai' },
          { name: '🔧 Backend Development', value: 'backend' },
          { name: '☁️  DevOps/Cloud', value: 'devops' },
          { name: '🎨 UI/UX Design', value: 'design' },
          { name: '📊 Data Science', value: 'data' },
          { name: '🔒 Security', value: 'security' },
          { name: '⚡ Performance', value: 'performance' },
        ],
      },
      {
        type: 'list',
        name: 'model',
        message: 'AI model:',
        default: options.model || 'gpt-4',
        choices: [
          { name: 'GPT-4 (OpenAI) - Most capable', value: 'gpt-4' },
          { name: 'GPT-3.5 Turbo (OpenAI) - Fast and efficient', value: 'gpt-3.5-turbo' },
          { name: 'Claude 3 Opus (Anthropic) - Excellent reasoning', value: 'claude-3-opus' },
          { name: 'Claude 3 Sonnet (Anthropic) - Balanced', value: 'claude-3-sonnet' },
          { name: 'Claude 3 Haiku (Anthropic) - Fast', value: 'claude-3-haiku' },
          { name: 'Gemini Pro (Google) - Multimodal', value: 'gemini-pro' },
          { name: 'Local Llama2 (Ollama)', value: 'ollama/llama2' },
          { name: 'Local CodeLlama (Ollama)', value: 'ollama/codellama' },
        ],
      },
      {
        type: 'input',
        name: 'description',
        message: 'Agent description:',
        default: options.description,
        validate: (input) => input.length >= 10 || 'Description must be at least 10 characters',
      },
      {
        type: 'input',
        name: 'systemPrompt',
        message: 'System prompt (optional):',
        validate: (input) => !input || input.length >= 20 || 'System prompt must be at least 20 characters if provided',
      },
      {
        type: 'input',
        name: 'temperature',
        message: 'Temperature (0.0 - 1.0):',
        default: '0.7',
        validate: (input) => {
          const temp = parseFloat(input);
          return (!isNaN(temp) && temp >= 0 && temp <= 1) || 'Temperature must be between 0.0 and 1.0';
        },
      },
      {
        type: 'number',
        name: 'maxTokens',
        message: 'Max tokens:',
        default: 2048,
        validate: (input) => input > 0 || 'Max tokens must be greater than 0',
      },
      {
        type: 'confirm',
        name: 'public',
        message: 'Make agent public?',
        default: false,
      },
      {
        type: 'checkbox',
        name: 'capabilities',
        message: 'Agent capabilities:',
        choices: [
          { name: 'Code Generation', value: 'code-generation' },
          { name: 'Code Review', value: 'code-review' },
          { name: 'Documentation', value: 'documentation' },
          { name: 'Testing', value: 'testing' },
          { name: 'Debugging', value: 'debugging' },
          { name: 'Architecture Design', value: 'architecture' },
          { name: 'Performance Optimization', value: 'performance' },
          { name: 'Security Analysis', value: 'security' },
        ],
      },
    ]);
  } else {
    agentConfig = {
      name: options.name,
      type: options.type || 'web',
      model: options.model || 'gpt-4',
      description: options.description || `${options.name} agent`,
      temperature: 0.7,
      maxTokens: 2048,
      public: false,
      capabilities: ['code-generation'],
    };
  }

  const spinner = ora('Creating agent...').start();

  try {
    const token = ConfigManager.get('auth.token');
    const result = await AgentService.createAgent(token, agentConfig);
    
    if (result.success) {
      spinner.succeed(chalk.green('Agent created successfully!'));
      
      console.log(
        boxen(
          chalk.white(`🤖 ${result.agent.name}\n`) +
          chalk.gray(`ID: ${result.agent.id}\n`) +
          chalk.gray(`Type: ${result.agent.type}\n`) +
          chalk.gray(`Model: ${result.agent.model}\n`) +
          chalk.gray(`Status: ${result.agent.status}\n`) +
          (result.agent.public ? chalk.green('Public') : chalk.yellow('Private')),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'green',
            title: 'Agent Created',
          }
        )
      );

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
        await handleTestAgent(result.agent.id, { prompt: 'Hello! Can you help me with a simple code example?' });
      }
    } else {
      spinner.fail(chalk.red('Agent creation failed'));
      console.log(chalk.red(result.error || 'Unknown error'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Agent creation failed'));
    throw error;
  }
}

async function handleListAgents(options: any): Promise<void> {
  const spinner = ora('Fetching agents...').start();

  try {
    const token = ConfigManager.get('auth.token');
    const result = await AgentService.listAgents(token, {
      filter: options.filter,
      mine: options.mine,
      public: options.public,
    });
    
    if (result.success) {
      spinner.succeed(chalk.green(`Found ${result.agents?.length || 0} agents`));
      
      if (!result.agents || result.agents.length === 0) {
        console.log(chalk.yellow('No agents found.'));
        console.log(chalk.gray('Create your first agent with: recoder agent create'));
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(result.agents, null, 2));
      } else {
        console.log(
          boxen(
            chalk.white('🤖 Available Agents\n') +
            (result.agents || []).map((agent: any) => 
              chalk.cyan(`• ${agent.name}`) + chalk.gray(` (${agent.id})\n`) +
              chalk.gray(`  Type: ${agent.type} | Model: ${agent.model}\n`) +
              chalk.gray(`  ${agent.description}\n`) +
              (agent.public ? chalk.green('  Public') : chalk.yellow('  Private')) +
              chalk.gray(` | Created: ${new Date(agent.createdAt).toLocaleDateString()}`)
            ).join('\n\n'),
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'cyan',
            }
          )
        );
      }
    } else {
      spinner.fail(chalk.red('Failed to fetch agents'));
      console.log(chalk.red(result.error || 'Unknown error'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Failed to fetch agents'));
    throw error;
  }
}

async function handleShowAgent(agentId: string, options: any): Promise<void> {
  const spinner = ora('Fetching agent details...').start();

  try {
    const token = ConfigManager.get('auth.token');
    const result = await AgentService.getAgent(token, agentId);
    
    if (result.success) {
      spinner.succeed(chalk.green('Agent details retrieved'));
      
      const agent = result.agent;

      if (options.json) {
        console.log(JSON.stringify(agent, null, 2));
      } else {
        console.log(
          boxen(
            chalk.white(`🤖 ${agent.name}\n`) +
            chalk.gray(`ID: ${agent.id}\n`) +
            chalk.gray(`Type: ${agent.type}\n`) +
            chalk.gray(`Model: ${agent.model}\n`) +
            chalk.gray(`Description: ${agent.description}\n`) +
            chalk.gray(`Status: ${agent.status}\n`) +
            chalk.gray(`Visibility: ${agent.public ? 'Public' : 'Private'}\n`) +
            chalk.gray(`Created: ${new Date(agent.createdAt).toLocaleString()}\n`) +
            chalk.gray(`Updated: ${new Date(agent.updatedAt).toLocaleString()}`),
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'cyan',
              title: 'Agent Details',
            }
          )
        );

        if (options.config && agent.config) {
          console.log(
            boxen(
              chalk.white('⚙️  Configuration\n') +
              chalk.gray(`Temperature: ${agent.config.temperature}\n`) +
              chalk.gray(`Max Tokens: ${agent.config.maxTokens}\n`) +
              chalk.gray(`Capabilities: ${agent.config.capabilities?.join(', ') || 'None'}\n`) +
              (agent.config.systemPrompt ? chalk.gray(`System Prompt: ${agent.config.systemPrompt.substring(0, 100)}...`) : ''),
              {
                padding: 1,
                borderStyle: 'round',
                borderColor: 'blue',
                title: 'Configuration',
              }
            )
          );
        }

        if (options.usage && agent.usage) {
          console.log(
            boxen(
              chalk.white('📊 Usage Statistics\n') +
              chalk.gray(`Total Requests: ${agent.usage.totalRequests}\n`) +
              chalk.gray(`This Month: ${agent.usage.thisMonth}\n`) +
              chalk.gray(`Average Response Time: ${agent.usage.avgResponseTime}ms\n`) +
              chalk.gray(`Last Used: ${agent.usage.lastUsed ? new Date(agent.usage.lastUsed).toLocaleString() : 'Never'}`),
              {
                padding: 1,
                borderStyle: 'round',
                borderColor: 'green',
                title: 'Usage',
              }
            )
          );
        }
      }
    } else {
      spinner.fail(chalk.red('Failed to fetch agent details'));
      console.log(chalk.red(result.error || 'Agent not found'));
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