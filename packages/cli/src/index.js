#!/usr/bin/env node

const { Command } = require('commander');
const { AuthCommand } = require('./commands/auth');
const { CreateAgentCommand } = require('./commands/agent/create');
const { ListAgentsCommand } = require('./commands/agent/list');
const { PlanCommand } = require('./commands/project/plan');
const { GenerateCommand } = require('./commands/project/generate');
const { logger } = require('./utils/logger');
const { config } = require('./lib/config');

class CodeCraftCLI {
  constructor() {
    this.program = new Command();
    this.setupProgram();
    this.setupCommands();
  }

  setupProgram() {
    this.program
      .name('codecraft')
      .description('AI-powered development platform with production-ready code generation')
      .version('1.0.0');
  }

  setupCommands() {
    // Authentication
    const authCommand = new AuthCommand();
    this.program.addCommand(authCommand.command);

    // Agent Management
    const agentGroup = new Command('agent')
      .description('Manage AI agents');
    
    const createAgentCommand = new CreateAgentCommand();
    const listAgentsCommand = new ListAgentsCommand();
    
    agentGroup.addCommand(createAgentCommand.command);
    agentGroup.addCommand(listAgentsCommand.command);
    this.program.addCommand(agentGroup);

    // Project Management
    const projectGroup = new Command('project')
      .description('Manage projects and generate code');
    
    const planCommand = new PlanCommand();
    const generateCommand = new GenerateCommand();
    
    projectGroup.addCommand(planCommand.command);
    projectGroup.addCommand(generateCommand.command);
    this.program.addCommand(projectGroup);

    // Global options
    this.program
      .option('-v, --verbose', 'Verbose output')
      .option('--config <path>', 'Config file path')
      .hook('preAction', (thisCommand, actionCommand) => {
        if (thisCommand.opts().verbose) {
          logger.setLevel('debug');
        }
        if (thisCommand.opts().config) {
          config.load(thisCommand.opts().config);
        }
      });
  }

  async run() {
    try {
      await this.program.parseAsync(process.argv);
    } catch (error) {
      logger.error('CLI Error:', error.message);
      if (logger.level === 'debug') {
        console.error(error.stack);
      }
      process.exit(1);
    }
  }
}

// Run CLI if this file is executed directly
if (require.main === module) {
  const cli = new CodeCraftCLI();
  cli.run();
}

module.exports = { CodeCraftCLI };