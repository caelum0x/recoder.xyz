/**
 * Agent management commands - Enhanced with full CRUD operations
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import boxen from 'boxen';
import Table from 'cli-table3';
import { Logger } from 'recoder-shared';
import { apiClient } from '../services/api';
import { ValidationHelper } from '../utils/validation';
import { FileSystemUtils } from '../utils/filesystem';

// Type definitions for agents
interface Agent {
  id: string;
  name: string;
  description: string;
  specialization: string;
  capabilities: AgentCapabilities;
  personality: AgentPersonality;
  preferences: AgentPreferences;
  status: 'active' | 'inactive' | 'archived';
  created_at: Date;
  updated_at: Date;
  usage_stats: AgentUsageStats;
  version: string;
}

interface AgentCapabilities {
  web_development: boolean;
  mobile_development: boolean;
  blockchain_development: boolean;
  ai_ml_development: boolean;
  backend_development: boolean;
  devops_deployment: boolean;
  security_auditing: boolean;
  code_review: boolean;
  documentation: boolean;
  testing: boolean;
}

interface AgentPersonality {
  tone: 'professional' | 'casual' | 'friendly' | 'technical' | 'creative';
  verbosity: 'concise' | 'detailed' | 'comprehensive';
  formality: 'formal' | 'informal' | 'mixed';
  approach: 'step_by_step' | 'big_picture' | 'problem_solving' | 'exploratory';
  feedback_style: 'direct' | 'encouraging' | 'analytical' | 'collaborative';
}

interface AgentPreferences {
  preferred_languages: string[];
  preferred_frameworks: string[];
  coding_style: 'clean' | 'functional' | 'object_oriented' | 'minimalist';
  test_coverage_preference: number;
  documentation_level: 'minimal' | 'standard' | 'comprehensive';
  security_focus: 'low' | 'medium' | 'high' | 'critical';
}

interface AgentUsageStats {
  total_projects: number;
  total_code_generated: number;
  success_rate: number;
  average_rating: number;
  last_used: Date;
}

interface CreateAgentRequest {
  name: string;
  description: string;
  specialization: string;
  capabilities: Partial<AgentCapabilities>;
  personality?: Partial<AgentPersonality>;
  preferences?: Partial<AgentPreferences>;
}

interface AgentListOptions {
  specialization?: string;
  status?: string;
  sort?: 'name' | 'created' | 'usage' | 'rating';
  limit?: number;
}

interface AgentSearchOptions {
  query: string;
  capabilities?: string[];
  specialization?: string;
}

export function createAgentCommand(): Command {
  const command = new Command('agent');
  
  command
    .description('Manage AI agents for code generation and assistance')
    .addCommand(createCreateCommand())
    .addCommand(createListCommand())
    .addCommand(createShowCommand())
    .addCommand(createUpdateCommand())
    .addCommand(createDeleteCommand())
    .addCommand(createSearchCommand())
    .addCommand(createActivateCommand())
    .addCommand(createDeactivateCommand())
    .addCommand(createCloneCommand())
    .addCommand(createExportCommand())
    .addCommand(createImportCommand())
    .addCommand(createStatsCommand());

  return command;
}

function createCreateCommand(): Command {
  return new Command('create')
    .description('Create a new AI agent')
    .option('-n, --name <name>', 'Agent name')
    .option('-d, --description <description>', 'Agent description')
    .option('-s, --specialization <specialization>', 'Agent specialization')
    .option('-i, --interactive', 'Interactive mode', false)
    .option('--template <template>', 'Use predefined template')
    .action(async (options) => {
      const spinner = ora('Creating agent...').start();
      
      try {
        let agentData: CreateAgentRequest;

        if (options.interactive || !options.name) {
          spinner.stop();
          agentData = await promptForAgentCreation(options);
          spinner.start('Creating agent...');
        } else {
          agentData = {
            name: options.name,
            description: options.description || '',
            specialization: options.specialization || 'general',
            capabilities: {}
          };
        }

        const agent = await createAgent(agentData);
        
        spinner.succeed(chalk.green('Agent created successfully!'));
        
        displayAgentInfo(agent);
        
        Logger.info('Agent created', { agentId: agent.id, name: agent.name });
        
      } catch (error) {
        spinner.fail(chalk.red('Failed to create agent'));
        Logger.error('Agent creation failed', { error: error instanceof Error ? error.message : String(error) });
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

function createListCommand(): Command {
  return new Command('list')
    .alias('ls')
    .description('List all available agents')
    .option('-s, --specialization <specialization>', 'Filter by specialization')
    .option('--status <status>', 'Filter by status (active|inactive|archived)')
    .option('--sort <sort>', 'Sort by (name|created|usage|rating)', 'name')
    .option('-l, --limit <limit>', 'Limit number of results', '20')
    .option('--json', 'Output as JSON', false)
    .action(async (options) => {
      const spinner = ora('Fetching agents...').start();
      
      try {
        const listOptions: AgentListOptions = {
          specialization: options.specialization,
          status: options.status,
          sort: options.sort as any,
          limit: parseInt(options.limit)
        };

        const agents = await listAgents(listOptions);
        
        spinner.succeed(`Found ${agents.length} agents`);
        
        if (options.json) {
          console.log(JSON.stringify(agents, null, 2));
        } else {
          displayAgentsList(agents);
        }
        
      } catch (error) {
        spinner.fail(chalk.red('Failed to fetch agents'));
        Logger.error('Agent list failed', { error: error instanceof Error ? error.message : String(error) });
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

function createShowCommand(): Command {
  return new Command('show')
    .alias('info')
    .description('Show detailed information about an agent')
    .argument('<agent-id>', 'Agent ID or name')
    .option('--json', 'Output as JSON', false)
    .action(async (agentId, options) => {
      const spinner = ora('Fetching agent details...').start();
      
      try {
        const agent = await getAgent(agentId);
        
        spinner.succeed('Agent details retrieved');
        
        if (options.json) {
          console.log(JSON.stringify(agent, null, 2));
        } else {
          displayAgentDetails(agent);
        }
        
      } catch (error) {
        spinner.fail(chalk.red('Failed to fetch agent details'));
        Logger.error('Agent show failed', { error: error instanceof Error ? error.message : String(error), agentId });
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

function createUpdateCommand(): Command {
  return new Command('update')
    .description('Update an existing agent')
    .argument('<agent-id>', 'Agent ID or name')
    .option('-n, --name <name>', 'Update agent name')
    .option('-d, --description <description>', 'Update agent description')
    .option('-s, --specialization <specialization>', 'Update agent specialization')
    .option('-i, --interactive', 'Interactive mode', false)
    .action(async (agentId, options) => {
      const spinner = ora('Updating agent...').start();
      
      try {
        if (options.interactive) {
          spinner.stop();
          const updateData = await promptForAgentUpdate(agentId);
          spinner.start('Updating agent...');
          
          const agent = await updateAgent(agentId, updateData);
          spinner.succeed(chalk.green('Agent updated successfully!'));
          displayAgentInfo(agent);
        } else {
          const updateData: Partial<CreateAgentRequest> = {};
          if (options.name) updateData.name = options.name;
          if (options.description) updateData.description = options.description;
          if (options.specialization) updateData.specialization = options.specialization;
          
          const agent = await updateAgent(agentId, updateData);
          spinner.succeed(chalk.green('Agent updated successfully!'));
          displayAgentInfo(agent);
        }
        
        Logger.info('Agent updated', { agentId });
        
      } catch (error) {
        spinner.fail(chalk.red('Failed to update agent'));
        Logger.error('Agent update failed', { error: error instanceof Error ? error.message : String(error), agentId });
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

function createDeleteCommand(): Command {
  return new Command('delete')
    .alias('rm')
    .description('Delete an agent')
    .argument('<agent-id>', 'Agent ID or name')
    .option('-f, --force', 'Force deletion without confirmation', false)
    .action(async (agentId, options) => {
      try {
        if (!options.force) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Are you sure you want to delete agent "${agentId}"?`,
              default: false
            }
          ]);
          
          if (!confirm) {
            console.log(chalk.yellow('Deletion cancelled'));
            return;
          }
        }
        
        const spinner = ora('Deleting agent...').start();
        
        await deleteAgent(agentId);
        
        spinner.succeed(chalk.green('Agent deleted successfully'));
        Logger.info('Agent deleted', { agentId });
        
      } catch (error) {
        console.error(chalk.red('Failed to delete agent'));
        Logger.error('Agent deletion failed', { error: error instanceof Error ? error.message : String(error), agentId });
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

function createSearchCommand(): Command {
  return new Command('search')
    .description('Search for agents')
    .argument('<query>', 'Search query')
    .option('-c, --capabilities <capabilities>', 'Filter by capabilities (comma-separated)')
    .option('-s, --specialization <specialization>', 'Filter by specialization')
    .option('--json', 'Output as JSON', false)
    .action(async (query, options) => {
      const spinner = ora('Searching agents...').start();
      
      try {
        const searchOptions: AgentSearchOptions = {
          query,
          capabilities: options.capabilities?.split(','),
          specialization: options.specialization
        };

        const agents = await searchAgents(searchOptions);
        
        spinner.succeed(`Found ${agents.length} matching agents`);
        
        if (options.json) {
          console.log(JSON.stringify(agents, null, 2));
        } else {
          displayAgentsList(agents);
        }
        
      } catch (error) {
        spinner.fail(chalk.red('Search failed'));
        Logger.error('Agent search failed', { error: error instanceof Error ? error.message : String(error), query });
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

function createActivateCommand(): Command {
  return new Command('activate')
    .description('Activate an agent')
    .argument('<agent-id>', 'Agent ID or name')
    .action(async (agentId) => {
      const spinner = ora('Activating agent...').start();
      
      try {
        await updateAgentStatus(agentId, 'active');
        
        spinner.succeed(chalk.green('Agent activated successfully'));
        Logger.info('Agent activated', { agentId });
        
      } catch (error) {
        spinner.fail(chalk.red('Failed to activate agent'));
        Logger.error('Agent activation failed', { error: error instanceof Error ? error.message : String(error), agentId });
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

function createDeactivateCommand(): Command {
  return new Command('deactivate')
    .description('Deactivate an agent')
    .argument('<agent-id>', 'Agent ID or name')
    .action(async (agentId) => {
      const spinner = ora('Deactivating agent...').start();
      
      try {
        await updateAgentStatus(agentId, 'inactive');
        
        spinner.succeed(chalk.green('Agent deactivated successfully'));
        Logger.info('Agent deactivated', { agentId });
        
      } catch (error) {
        spinner.fail(chalk.red('Failed to deactivate agent'));
        Logger.error('Agent deactivation failed', { error: error instanceof Error ? error.message : String(error), agentId });
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

function createCloneCommand(): Command {
  return new Command('clone')
    .description('Clone an existing agent')
    .argument('<agent-id>', 'Agent ID or name to clone')
    .option('-n, --name <name>', 'Name for the cloned agent')
    .action(async (agentId, options) => {
      const spinner = ora('Cloning agent...').start();
      
      try {
        const clonedAgent = await cloneAgent(agentId, options.name);
        
        spinner.succeed(chalk.green('Agent cloned successfully!'));
        displayAgentInfo(clonedAgent);
        
        Logger.info('Agent cloned', { originalId: agentId, clonedId: clonedAgent.id });
        
      } catch (error) {
        spinner.fail(chalk.red('Failed to clone agent'));
        Logger.error('Agent cloning failed', { error: error instanceof Error ? error.message : String(error), agentId });
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

function createExportCommand(): Command {
  return new Command('export')
    .description('Export agent configuration')
    .argument('<agent-id>', 'Agent ID or name')
    .option('-o, --output <file>', 'Output file path')
    .action(async (agentId, options) => {
      const spinner = ora('Exporting agent...').start();
      
      try {
        const agent = await getAgent(agentId);
        const exportData = await exportAgent(agent);
        
        const outputFile = options.output || `${agent.name.toLowerCase().replace(/\s+/g, '-')}-agent.json`;
        await FileSystemUtils.writeFile(outputFile, JSON.stringify(exportData, null, 2));
        
        spinner.succeed(chalk.green(`Agent exported to ${outputFile}`));
        Logger.info('Agent exported', { agentId, outputFile });
        
      } catch (error) {
        spinner.fail(chalk.red('Failed to export agent'));
        Logger.error('Agent export failed', { error: error instanceof Error ? error.message : String(error), agentId });
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

function createImportCommand(): Command {
  return new Command('import')
    .description('Import agent configuration')
    .argument('<file>', 'Agent configuration file')
    .action(async (file) => {
      const spinner = ora('Importing agent...').start();
      
      try {
        const fileContent = await FileSystemUtils.readFile(file);
        if (!fileContent) {
          throw new Error('File is empty or could not be read');
        }
        const agentData = JSON.parse(fileContent);
        
        const agent = await importAgent(agentData);
        
        spinner.succeed(chalk.green('Agent imported successfully!'));
        displayAgentInfo(agent);
        
        Logger.info('Agent imported', { agentId: agent.id, file });
        
      } catch (error) {
        spinner.fail(chalk.red('Failed to import agent'));
        Logger.error('Agent import failed', { error: error instanceof Error ? error.message : String(error), file });
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

function createStatsCommand(): Command {
  return new Command('stats')
    .description('Show agent usage statistics')
    .argument('[agent-id]', 'Agent ID or name (optional, shows all if not provided)')
    .option('--json', 'Output as JSON', false)
    .action(async (agentId, options) => {
      const spinner = ora('Fetching statistics...').start();
      
      try {
        const stats = agentId ? await getAgentStats(agentId) : await getAllAgentStats();
        
        spinner.succeed('Statistics retrieved');
        
        if (options.json) {
          console.log(JSON.stringify(stats, null, 2));
        } else {
          displayAgentStats(stats, agentId);
        }
        
      } catch (error) {
        spinner.fail(chalk.red('Failed to fetch statistics'));
        Logger.error('Agent stats failed', { error: error instanceof Error ? error.message : String(error), agentId });
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

// Implementation functions
async function promptForAgentCreation(options: any): Promise<CreateAgentRequest> {
  const questions = [
    {
      type: 'input',
      name: 'name',
      message: 'Agent name:',
      default: options.name,
      validate: (input: string) => input.trim().length > 0 || 'Name is required'
    },
    {
      type: 'input',
      name: 'description',
      message: 'Agent description:',
      default: options.description
    },
    {
      type: 'list',
      name: 'specialization',
      message: 'Agent specialization:',
      choices: [
        'web_development',
        'mobile_development',
        'blockchain_development',
        'ai_ml_development',
        'backend_development',
        'devops_deployment',
        'security_auditing',
        'general'
      ],
      default: options.specialization || 'general'
    },
    {
      type: 'checkbox',
      name: 'capabilities',
      message: 'Select capabilities:',
      choices: [
        { name: 'Web Development', value: 'web_development' },
        { name: 'Mobile Development', value: 'mobile_development' },
        { name: 'Blockchain Development', value: 'blockchain_development' },
        { name: 'AI/ML Development', value: 'ai_ml_development' },
        { name: 'Backend Development', value: 'backend_development' },
        { name: 'DevOps & Deployment', value: 'devops_deployment' },
        { name: 'Security Auditing', value: 'security_auditing' },
        { name: 'Code Review', value: 'code_review' },
        { name: 'Documentation', value: 'documentation' },
        { name: 'Testing', value: 'testing' }
      ]
    }
  ];

  const answers = await inquirer.prompt(questions as any);
  
  const capabilities: Partial<AgentCapabilities> = {};
  answers.capabilities.forEach((cap: string) => {
    (capabilities as any)[cap] = true;
  });

  return {
    name: answers.name,
    description: answers.description,
    specialization: answers.specialization,
    capabilities
  };
}

async function promptForAgentUpdate(agentId: string): Promise<Partial<CreateAgentRequest>> {
  // Get current agent data
  const currentAgent = await getAgent(agentId);
  
  const questions = [
    {
      type: 'input',
      name: 'name',
      message: 'Agent name:',
      default: currentAgent.name
    },
    {
      type: 'input',
      name: 'description',
      message: 'Agent description:',
      default: currentAgent.description
    },
    {
      type: 'list',
      name: 'specialization',
      message: 'Agent specialization:',
      choices: [
        'web_development',
        'mobile_development',
        'blockchain_development',
        'ai_ml_development',
        'backend_development',
        'devops_deployment',
        'security_auditing',
        'general'
      ],
      default: currentAgent.specialization
    }
  ];

  const answers = await inquirer.prompt(questions as any);
  
  return {
    name: answers.name,
    description: answers.description,
    specialization: answers.specialization
  };
}

// API functions
async function createAgent(agentData: CreateAgentRequest): Promise<Agent> {
  const response = await apiClient.post('/agents', agentData);
  return response.data;
}

async function listAgents(options: AgentListOptions): Promise<Agent[]> {
  const queryParams = new URLSearchParams();
  
  if (options.specialization) queryParams.append('specialization', options.specialization);
  if (options.status) queryParams.append('status', options.status);
  if (options.sort) queryParams.append('sort', options.sort);
  if (options.limit) queryParams.append('limit', options.limit.toString());
  
  const response = await apiClient.get(`/agents?${queryParams.toString()}`);
  return response.data;
}

async function getAgent(agentId: string): Promise<Agent> {
  const response = await apiClient.get(`/agents/${agentId}`);
  return response.data;
}

async function updateAgent(agentId: string, updateData: Partial<CreateAgentRequest>): Promise<Agent> {
  const response = await apiClient.put(`/agents/${agentId}`, updateData);
  return response.data;
}

async function deleteAgent(agentId: string): Promise<void> {
  await apiClient.delete(`/agents/${agentId}`);
}

async function searchAgents(options: AgentSearchOptions): Promise<Agent[]> {
  const response = await apiClient.post('/agents/search', options);
  return response.data;
}

async function updateAgentStatus(agentId: string, status: 'active' | 'inactive'): Promise<void> {
  await apiClient.patch(`/agents/${agentId}/status`, { status });
}

async function cloneAgent(agentId: string, newName?: string): Promise<Agent> {
  const response = await apiClient.post(`/agents/${agentId}/clone`, { name: newName });
  return response.data;
}

async function exportAgent(agent: Agent): Promise<any> {
  return {
    name: agent.name,
    description: agent.description,
    specialization: agent.specialization,
    capabilities: agent.capabilities,
    personality: agent.personality,
    preferences: agent.preferences,
    version: agent.version,
    exported_at: new Date().toISOString()
  };
}

async function importAgent(agentData: any): Promise<Agent> {
  const createData: CreateAgentRequest = {
    name: agentData.name,
    description: agentData.description,
    specialization: agentData.specialization,
    capabilities: agentData.capabilities,
    personality: agentData.personality,
    preferences: agentData.preferences
  };
  
  return await createAgent(createData);
}

async function getAgentStats(agentId: string): Promise<any> {
  const response = await apiClient.get(`/agents/${agentId}/stats`);
  return response.data;
}

async function getAllAgentStats(): Promise<any> {
  const response = await apiClient.get('/agents/stats');
  return response.data;
}

// Display functions
function displayAgentInfo(agent: Agent): void {
  const info = boxen(
    `${chalk.bold.blue(agent.name)}\n` +
    `${chalk.gray(agent.description)}\n\n` +
    `${chalk.yellow('Specialization:')} ${agent.specialization}\n` +
    `${chalk.yellow('Status:')} ${getStatusColor(agent.status)}\n` +
    `${chalk.yellow('Version:')} ${agent.version}\n` +
    `${chalk.yellow('Created:')} ${new Date(agent.created_at).toLocaleDateString()}`,
    {
      padding: 1,
      borderColor: 'blue',
      borderStyle: 'round'
    }
  );
  
  console.log(info);
}

function displayAgentsList(agents: Agent[]): void {
  if (agents.length === 0) {
    console.log(chalk.yellow('No agents found.'));
    return;
  }

  const table = new Table({
    head: [
      chalk.blue('Name'),
      chalk.blue('Specialization'),
      chalk.blue('Status'),
      chalk.blue('Projects'),
      chalk.blue('Rating'),
      chalk.blue('Last Used')
    ],
    colWidths: [20, 15, 10, 10, 8, 12]
  });

  agents.forEach(agent => {
    table.push([
      agent.name,
      agent.specialization,
      getStatusColor(agent.status),
      agent.usage_stats.total_projects.toString(),
      agent.usage_stats.average_rating.toFixed(1),
      agent.usage_stats.last_used ? new Date(agent.usage_stats.last_used).toLocaleDateString() : 'Never'
    ]);
  });

  console.log(table.toString());
}

function displayAgentDetails(agent: Agent): void {
  console.log(boxen(
    `${chalk.bold.blue(agent.name)}\n` +
    `${chalk.gray(agent.description)}\n\n` +
    `${chalk.yellow('ID:')} ${agent.id}\n` +
    `${chalk.yellow('Specialization:')} ${agent.specialization}\n` +
    `${chalk.yellow('Status:')} ${getStatusColor(agent.status)}\n` +
    `${chalk.yellow('Version:')} ${agent.version}\n` +
    `${chalk.yellow('Created:')} ${new Date(agent.created_at).toLocaleDateString()}\n` +
    `${chalk.yellow('Updated:')} ${new Date(agent.updated_at).toLocaleDateString()}\n\n` +
    `${chalk.bold('Capabilities:')}\n` +
    Object.entries(agent.capabilities)
      .filter(([_, enabled]) => enabled)
      .map(([cap, _]) => `  • ${cap.replace(/_/g, ' ')}`)
      .join('\n') + '\n\n' +
    `${chalk.bold('Usage Statistics:')}\n` +
    `  • Total Projects: ${agent.usage_stats.total_projects}\n` +
    `  • Success Rate: ${(agent.usage_stats.success_rate * 100).toFixed(1)}%\n` +
    `  • Average Rating: ${agent.usage_stats.average_rating.toFixed(1)}/5\n` +
    `  • Last Used: ${agent.usage_stats.last_used ? new Date(agent.usage_stats.last_used).toLocaleDateString() : 'Never'}`,
    {
      padding: 1,
      borderColor: 'blue',
      borderStyle: 'round'
    }
  ));
}

function displayAgentStats(stats: any, agentId?: string): void {
  if (agentId) {
    // Single agent stats
    console.log(boxen(
      `${chalk.bold('Agent Statistics')}\n\n` +
      `${chalk.yellow('Total Projects:')} ${stats.total_projects}\n` +
      `${chalk.yellow('Code Generated:')} ${stats.total_code_generated} lines\n` +
      `${chalk.yellow('Success Rate:')} ${(stats.success_rate * 100).toFixed(1)}%\n` +
      `${chalk.yellow('Average Rating:')} ${stats.average_rating.toFixed(1)}/5\n` +
      `${chalk.yellow('Last Used:')} ${stats.last_used ? new Date(stats.last_used).toLocaleDateString() : 'Never'}`,
      {
        padding: 1,
        borderColor: 'green',
        borderStyle: 'round'
      }
    ));
  } else {
    // All agents stats
    console.log(boxen(
      `${chalk.bold('Overall Agent Statistics')}\n\n` +
      `${chalk.yellow('Total Agents:')} ${stats.total_agents}\n` +
      `${chalk.yellow('Active Agents:')} ${stats.active_agents}\n` +
      `${chalk.yellow('Total Projects:')} ${stats.total_projects}\n` +
      `${chalk.yellow('Total Code Generated:')} ${stats.total_code_generated} lines\n` +
      `${chalk.yellow('Average Success Rate:')} ${(stats.average_success_rate * 100).toFixed(1)}%\n` +
      `${chalk.yellow('Average Rating:')} ${stats.average_rating.toFixed(1)}/5`,
      {
        padding: 1,
        borderColor: 'green',
        borderStyle: 'round'
      }
    ));
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'active':
      return chalk.green(status);
    case 'inactive':
      return chalk.yellow(status);
    case 'archived':
      return chalk.gray(status);
    default:
      return status;
  }
}

export { Agent, AgentCapabilities, AgentPersonality, AgentPreferences, CreateAgentRequest };