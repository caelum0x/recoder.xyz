#!/usr/bin/env node

/**
 * Recoder CLI
 * AI-powered development platform with production-ready code generation
 */

import { Command } from 'commander';
import chalk from 'chalk';
import figlet from 'figlet';
import boxen from 'boxen';
import updateNotifier from 'update-notifier';
import { Logger, VERSION } from '@recoder/shared';
import { ConfigManager } from './utils/config';
import { setupCommands } from './commands';
import { checkAuth } from './utils/auth';

const pkg = require('../package.json');

async function main() {
  // Check for updates
  const notifier = updateNotifier({ pkg });
  notifier.notify({
    defer: false,
    isGlobal: true,
  });

  // Display Recoder banner
  console.log(
    chalk.cyan(
      figlet.textSync('Recoder', {
        font: 'ANSI Shadow',
        horizontalLayout: 'default',
        verticalLayout: 'default',
      })
    )
  );

  console.log(
    boxen(
      chalk.white('🚀 AI-powered development platform with production-ready code generation\n') +
      chalk.gray('Generate real working code, not mock implementations'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
        textAlignment: 'center',
      }
    )
  );

  // Initialize configuration
  ConfigManager.initialize();

  // Create main program
  const program = new Command();
  
  program
    .name('recoder')
    .description('AI-powered development platform with production-ready code generation')
    .version(VERSION, '-v, --version', 'display version number')
    .option('--verbose', 'enable verbose logging')
    .option('--config <path>', 'specify config file path')
    .option('--no-color', 'disable colored output')
    .hook('preAction', async (thisCommand) => {
      // Set up logging based on verbose flag
      if (thisCommand.opts().verbose) {
        process.env.LOG_LEVEL = 'debug';
      }
      
      // Disable colors if requested
      if (thisCommand.opts().noColor) {
        chalk.level = 0;
      }
      
      // Load custom config if specified
      if (thisCommand.opts().config) {
        ConfigManager.loadFromFile(thisCommand.opts().config);
      }
    });

  // Setup all commands
  setupCommands(program);

  // Handle unknown commands
  program.on('command:*', (operands) => {
    Logger.error(`Unknown command: ${operands[0]}`);
    console.log(chalk.yellow('Run ') + chalk.cyan('recoder --help') + chalk.yellow(' to see available commands.'));
    process.exitCode = 1;
  });

  // Parse command line arguments
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    Logger.error(`Command failed: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

// Handle unhandled rejections and exceptions
process.on('unhandledRejection', (reason, promise) => {
  Logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
  process.exitCode = 1;
});

process.on('uncaughtException', (error) => {
  Logger.error(`Uncaught Exception: ${error.message}`);
  process.exitCode = 1;
});

// Run the CLI
if (require.main === module) {
  main().catch((error) => {
    Logger.error(`Fatal error: ${error.message}`);
    process.exitCode = 1;
  });
}

export default main;