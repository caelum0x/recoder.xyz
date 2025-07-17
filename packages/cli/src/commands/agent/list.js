const { Command } = require('commander');
const { AgentService } = require('../../lib/agent-service');
const { logger } = require('../../utils/logger');

class ListAgentsCommand {
  constructor() {
    this.command = new Command('list');
    this.agentService = new AgentService();
    this.setupCommand();
  }

  setupCommand() {
    this.command
      .description('List all agents')
      .option('-t, --type <type>', 'Filter by agent type')
      .option('-s, --status <status>', 'Filter by status (active, inactive)')
      .option('--json', 'Output in JSON format')
      .action(this.listAgents.bind(this));
  }

  async listAgents(options) {
    try {
      const filters = {
        type: options.type,
        status: options.status
      };

      const agents = await this.agentService.listAgents(filters);

      if (options.json) {
        console.log(JSON.stringify(agents, null, 2));
        return;
      }

      if (agents.length === 0) {
        logger.info('No agents found.');
        return;
      }

      logger.info(`Found ${agents.length} agent(s):`);
      console.log();

      agents.forEach(agent => {
        console.log(`📱 ${agent.name} (${agent.type})`);
        console.log(`   ID: ${agent.id}`);
        console.log(`   Model: ${agent.model}`);
        console.log(`   Status: ${agent.status}`);
        console.log(`   Created: ${new Date(agent.createdAt).toLocaleDateString()}`);
        console.log(`   Capabilities: ${agent.capabilities.join(', ')}`);
        console.log();
      });

    } catch (error) {
      logger.error('Failed to list agents:', error.message);
      process.exit(1);
    }
  }
}

module.exports = { ListAgentsCommand };