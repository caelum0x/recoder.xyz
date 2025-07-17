const { Command } = require('commander');
const { AgentService } = require('../../lib/agent-service');
const { logger } = require('../../utils/logger');
const { spinner } = require('../../utils/spinner');

class CreateAgentCommand {
  constructor() {
    this.command = new Command('create');
    this.agentService = new AgentService();
    this.setupCommand();
  }

  setupCommand() {
    this.command
      .description('Create a new specialized agent')
      .argument('<name>', 'Agent name')
      .option('-t, --type <type>', 'Agent type (web, mobile, blockchain, ai, backend, devops)', 'web')
      .option('-m, --model <model>', 'AI model to use', 'gpt-4')
      .option('-c, --config <config>', 'Configuration file path')
      .option('--template <template>', 'Use template configuration')
      .action(this.createAgent.bind(this));
  }

  async createAgent(name, options) {
    const loadingSpinner = spinner('Creating agent...');
    
    try {
      loadingSpinner.start();

      const agentConfig = {
        name,
        type: options.type,
        model: options.model,
        capabilities: this.getCapabilitiesForType(options.type),
        config: options.config ? require(options.config) : {},
        template: options.template
      };

      const agent = await this.agentService.createAgent(agentConfig);
      
      loadingSpinner.stop();
      logger.success(`Agent '${name}' created successfully!`);
      logger.info(`Type: ${agent.type}`);
      logger.info(`Model: ${agent.model}`);
      logger.info(`ID: ${agent.id}`);

      return agent;
    } catch (error) {
      loadingSpinner.stop();
      logger.error('Failed to create agent:', error.message);
      process.exit(1);
    }
  }

  getCapabilitiesForType(type) {
    const capabilities = {
      web: ['react', 'vue', 'angular', 'nextjs', 'svelte', 'css', 'javascript', 'typescript'],
      mobile: ['react-native', 'flutter', 'expo', 'ios', 'android', 'cross-platform'],
      blockchain: ['solana', 'ethereum', 'polygon', 'smart-contracts', 'defi', 'nft', 'dex'],
      ai: ['machine-learning', 'deep-learning', 'nlp', 'computer-vision', 'langchain', 'openai'],
      backend: ['nodejs', 'python', 'go', 'rust', 'apis', 'databases', 'microservices'],
      devops: ['docker', 'kubernetes', 'aws', 'ci-cd', 'monitoring', 'deployment']
    };

    return capabilities[type] || capabilities.web;
  }
}

module.exports = { CreateAgentCommand };