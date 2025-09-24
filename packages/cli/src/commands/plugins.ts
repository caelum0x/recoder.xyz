/**
 * Plugins Commands
 * Manage the recoder plugin system from CLI
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { getPluginsIntegration } from '../services/plugins-integration';
import { Logger } from 'recoder-shared';

const logger = Logger.getInstance();

export function createPluginsCommand(): Command {
  const pluginsCommand = new Command('plugins')
    .alias('plugin')
    .description('Manage recoder plugins');

  // List command
  pluginsCommand
    .command('list')
    .alias('ls')
    .description('List all available plugins')
    .option('-l, --loaded', 'Show only loaded plugins')
    .action(async (options) => {
      console.log(chalk.cyan('\n📦 RECODER - Available Plugins\n'));

      try {
        const pluginsIntegration = getPluginsIntegration();
        await pluginsIntegration.initialize();

        const plugins = options.loaded ? 
          pluginsIntegration.listLoadedPlugins() : 
          pluginsIntegration.listPlugins();

        if (plugins.length === 0) {
          console.log(chalk.yellow(`No ${options.loaded ? 'loaded' : 'available'} plugins found.`));
          console.log(chalk.gray('Use "recoder plugins install <source>" to install plugins.\n'));
          return;
        }

        console.log(chalk.blue(`${options.loaded ? 'Loaded' : 'Available'} Plugins (${plugins.length}):\n`));

        plugins.forEach((plugin, index) => {
          const status = plugin.enabled ? chalk.green('✅ Loaded') : chalk.gray('❌ Not loaded');
          console.log(`${index + 1}. ${chalk.bold(plugin.name)} v${plugin.version} ${status}`);
          console.log(`   ${chalk.gray(plugin.description)}`);
          console.log(`   ${chalk.gray(`Author: ${plugin.author}`)}`);
          console.log(`   ${chalk.gray(`ID: ${plugin.id}`)}`);
          console.log();
        });
      } catch (error: any) {
        console.error(chalk.red(`❌ Failed to list plugins: ${error.message}`));
        process.exit(1);
      }
    });

  // Status command
  pluginsCommand
    .command('status')
    .description('Show plugin system status')
    .action(async () => {
      console.log(chalk.cyan('\n📊 RECODER - Plugin System Status\n'));

      try {
        const pluginsIntegration = getPluginsIntegration();
        await pluginsIntegration.initialize();
        const status = pluginsIntegration.getStatus();

        console.log(chalk.blue('Plugin System:'));
        console.log(`  Initialized: ${status.initialized ? chalk.green('✅ Yes') : chalk.red('❌ No')}`);
        console.log(`  Total plugins: ${status.totalPlugins}`);
        console.log(`  Loaded plugins: ${status.loadedPlugins}`);
        console.log(`  Plugins directory: ${chalk.gray(status.config.pluginsDir)}`);
        console.log(`  Auto-load: ${status.config.autoLoad ? chalk.green('✅ Enabled') : chalk.gray('❌ Disabled')}`);
        console.log();

        if (status.loadedPlugins > 0) {
          console.log(chalk.blue('Loaded Plugins:'));
          const loadedPlugins = pluginsIntegration.listLoadedPlugins();
          loadedPlugins.forEach((plugin, index) => {
            console.log(`  ${index + 1}. ${plugin.name} v${plugin.version}`);
          });
          console.log();
        }
      } catch (error: any) {
        console.error(chalk.red(`❌ Failed to get status: ${error.message}`));
        process.exit(1);
      }
    });

  // Load command
  pluginsCommand
    .command('load <plugin-id>')
    .description('Load a specific plugin')
    .action(async (pluginId) => {
      console.log(chalk.cyan(`\n⚡ RECODER - Load Plugin: ${pluginId}\n`));

      try {
        const pluginsIntegration = getPluginsIntegration();
        await pluginsIntegration.initialize();

        await pluginsIntegration.loadPlugin(pluginId);
        console.log(chalk.green(`✅ Plugin "${pluginId}" loaded successfully\n`));
      } catch (error: any) {
        console.error(chalk.red(`❌ Failed to load plugin: ${error.message}`));
        process.exit(1);
      }
    });

  // Unload command
  pluginsCommand
    .command('unload <plugin-id>')
    .description('Unload a specific plugin')
    .action(async (pluginId) => {
      console.log(chalk.cyan(`\n🛑 RECODER - Unload Plugin: ${pluginId}\n`));

      try {
        const pluginsIntegration = getPluginsIntegration();
        await pluginsIntegration.initialize();

        await pluginsIntegration.unloadPlugin(pluginId);
        console.log(chalk.green(`✅ Plugin "${pluginId}" unloaded successfully\n`));
      } catch (error: any) {
        console.error(chalk.red(`❌ Failed to unload plugin: ${error.message}`));
        process.exit(1);
      }
    });

  // Install command
  pluginsCommand
    .command('install <source>')
    .description('Install a plugin from URL or local path')
    .option('-n, --name <name>', 'Custom name for the plugin')
    .action(async (source, options) => {
      console.log(chalk.cyan(`\n📥 RECODER - Install Plugin\n`));

      try {
        const pluginsIntegration = getPluginsIntegration();
        await pluginsIntegration.initialize();

        console.log(chalk.blue(`Installing plugin from: ${source}`));
        
        await pluginsIntegration.installPlugin(source, { name: options.name });
        
        console.log(chalk.green(`✅ Plugin installed successfully!`));
        
        // Ask if user wants to load it immediately
        const { shouldLoad } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldLoad',
            message: 'Load the plugin now?',
            default: true
          }
        ]);

        if (shouldLoad) {
          const pluginId = options.name || `plugin-${Date.now()}`;
          await pluginsIntegration.loadPlugin(pluginId);
          console.log(chalk.green(`✅ Plugin loaded and ready to use!\n`));
        } else {
          console.log(chalk.gray('Plugin installed but not loaded. Use "recoder plugins load <plugin-id>" to load it.\n'));
        }
      } catch (error: any) {
        console.error(chalk.red(`❌ Failed to install plugin: ${error.message}`));
        process.exit(1);
      }
    });

  // Execute command
  pluginsCommand
    .command('exec <plugin-id> <command>')
    .description('Execute a command in a specific plugin')
    .option('-a, --args <args>', 'Arguments to pass to the plugin command (JSON format)')
    .action(async (pluginId, command, options) => {
      console.log(chalk.cyan(`\n⚡ RECODER - Execute Plugin Command\n`));

      try {
        const pluginsIntegration = getPluginsIntegration();
        await pluginsIntegration.initialize();

        let args = [];
        if (options.args) {
          try {
            args = JSON.parse(options.args);
          } catch (error) {
            console.error(chalk.red(`❌ Invalid JSON arguments: ${options.args}`));
            process.exit(1);
          }
        }

        console.log(chalk.blue(`Executing command "${command}" in plugin "${pluginId}"`));
        
        const result = await pluginsIntegration.executePluginCommand(pluginId, command, args);
        
        console.log(chalk.green(`✅ Command executed successfully!`));
        console.log(chalk.blue('Result:'));
        console.log(JSON.stringify(result, null, 2));
        console.log();
      } catch (error: any) {
        console.error(chalk.red(`❌ Failed to execute plugin command: ${error.message}`));
        process.exit(1);
      }
    });

  // Info command
  pluginsCommand
    .command('info <plugin-id>')
    .description('Show detailed information about a plugin')
    .action(async (pluginId) => {
      console.log(chalk.cyan(`\n📋 RECODER - Plugin Information\n`));

      try {
        const pluginsIntegration = getPluginsIntegration();
        await pluginsIntegration.initialize();

        const plugin = pluginsIntegration.getPlugin(pluginId);
        
        if (!plugin) {
          console.error(chalk.red(`❌ Plugin "${pluginId}" not found`));
          process.exit(1);
        }

        console.log(chalk.blue('Plugin Details:'));
        console.log(`  Name: ${chalk.bold(plugin.name)}`);
        console.log(`  Version: ${plugin.version}`);
        console.log(`  Description: ${plugin.description}`);
        console.log(`  Author: ${plugin.author}`);
        console.log(`  ID: ${plugin.id}`);
        console.log(`  Main: ${plugin.main}`);
        console.log(`  Status: ${plugin.enabled ? chalk.green('✅ Loaded') : chalk.gray('❌ Not loaded')}`);
        
        if (plugin.config && Object.keys(plugin.config).length > 0) {
          console.log(`  Configuration:`);
          console.log(JSON.stringify(plugin.config, null, 4).replace(/^/gm, '    '));
        }
        console.log();
      } catch (error: any) {
        console.error(chalk.red(`❌ Failed to get plugin info: ${error.message}`));
        process.exit(1);
      }
    });

  // Init command
  pluginsCommand
    .command('init')
    .description('Initialize plugin system with custom configuration')
    .action(async () => {
      console.log(chalk.cyan('\n🔧 RECODER - Initialize Plugin System\n'));

      try {
        const answers = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'autoLoad',
            message: 'Auto-load plugins on startup?',
            default: true
          },
          {
            type: 'input',
            name: 'pluginsDir',
            message: 'Plugins directory:',
            default: '.recoder/plugins'
          }
        ]);

        const pluginsIntegration = getPluginsIntegration(answers);
        await pluginsIntegration.initialize();

        console.log(chalk.green('✅ Plugin system initialized successfully!\n'));
      } catch (error: any) {
        console.error(chalk.red(`❌ Failed to initialize plugin system: ${error.message}`));
        process.exit(1);
      }
    });

  return pluginsCommand;
}