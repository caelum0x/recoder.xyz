/**
 * Ollama Management Command
 * Provides easy management of local AI models
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { Logger } from '@recoder/shared';
import { OllamaManager_Instance } from '../services/ollama-manager';
import { spinner } from '../utils/spinner';

export function createOllamaCommand(): Command {
  const ollamaCmd = new Command('ollama')
    .description('🦙 Manage local AI models with Ollama')
    .addHelpText('after', `
${chalk.yellow('Examples:')}
  recoder ollama status          Show Ollama installation and models status
  recoder ollama setup           Auto-install Ollama and recommended models
  recoder ollama install phi3.5  Install a specific model
  recoder ollama list            List available models
  recoder ollama remove codellama Remove a model
  recoder ollama optimize        Get hardware-specific optimization tips
    `);

  // Status command
  ollamaCmd
    .command('status')
    .description('Show Ollama status and installed models')
    .action(async () => {
      try {
        const status = await OllamaManager_Instance.getStatus();
        
        console.log(`\n🦙 ${chalk.bold('Ollama Status')}`);
        console.log('='.repeat(40));
        
        console.log(`📦 Installed: ${status.installed ? chalk.green('✅ Yes') : chalk.red('❌ No')}`);
        console.log(`🔄 Running: ${status.running ? chalk.green('✅ Yes') : chalk.red('❌ No')}`);
        
        if (status.version) {
          console.log(`📋 Version: ${chalk.blue(status.version)}`);
        }
        
        console.log(`\n🤖 ${chalk.bold('Installed Models')} (${status.modelsInstalled.length})`);
        if (status.modelsInstalled.length > 0) {
          status.modelsInstalled.forEach(model => {
            console.log(`  ${chalk.green('●')} ${model}`);
          });
        } else {
          console.log(`  ${chalk.yellow('No models installed')}`);
        }
        
        console.log(`\n📚 ${chalk.bold('Available Models')}`);
        status.availableModels.forEach(model => {
          const installed = status.modelsInstalled.includes(model.name);
          const icon = installed ? '✅' : model.recommended ? '⭐' : '📦';
          console.log(`  ${icon} ${chalk.blue(model.name)} ${chalk.gray(`(${model.size})`)}`);
          console.log(`     ${model.description}`);
          if (model.recommended) {
            console.log(`     ${chalk.yellow('👍 Recommended')}`);
          }
        });
        
      } catch (error) {
        Logger.error('Failed to get Ollama status:', error);
        process.exit(1);
      }
    });

  // Auto-setup command
  ollamaCmd
    .command('setup')
    .description('Auto-install Ollama and set up recommended models')
    .action(async () => {
      const setupSpinner = spinner('Setting up Ollama...').start();
      
      try {
        const result = await OllamaManager_Instance.autoSetup();
        
        setupSpinner.stop();
        
        if (result.success) {
          console.log(`\n${chalk.green('✅ Success!')} ${result.message}`);
          console.log(`\n${chalk.blue('💡 Next steps:')}`);
          console.log(`  • Run "recoder chat" to start using local AI`);
          console.log(`  • Use "recoder ollama status" to check installation`);
          console.log(`  • Install more models with "recoder ollama install <model>"`);
        } else {
          console.log(`\n${chalk.red('❌ Setup failed:')} ${result.message}`);
          
          // Provide troubleshooting tips
          console.log(`\n${chalk.yellow('💡 Troubleshooting:')}`);
          console.log('  • Make sure you have sufficient disk space (5GB+)');
          console.log('  • Check internet connection for model downloads');
          console.log('  • On Windows, manually install from https://ollama.com/download');
        }
        
      } catch (error) {
        setupSpinner.stop();
        Logger.error('Setup failed:', error);
        process.exit(1);
      }
    });

  // Install model command
  ollamaCmd
    .command('install <model>')
    .description('Install a specific model')
    .action(async (model: string) => {
      const installSpinner = spinner(`Installing model: ${model}...`).start();
      
      try {
        const result = await OllamaManager_Instance.installModel(model);
        
        installSpinner.stop();
        
        if (result.success) {
          console.log(`\n${chalk.green('✅ Success!')} Model ${chalk.blue(model)} installed`);
        } else {
          console.log(`\n${chalk.red('❌ Installation failed:')} ${result.message}`);
        }
        
      } catch (error) {
        installSpinner.stop();
        Logger.error('Installation failed:', error);
        process.exit(1);
      }
    });

  // Remove model command
  ollamaCmd
    .command('remove <model>')
    .alias('rm')
    .description('Remove an installed model')
    .action(async (model: string) => {
      try {
        const result = await OllamaManager_Instance.removeModel(model);
        
        if (result.success) {
          console.log(`\n${chalk.green('✅ Success!')} Model ${chalk.blue(model)} removed`);
        } else {
          console.log(`\n${chalk.red('❌ Removal failed:')} ${result.message}`);
        }
        
      } catch (error) {
        Logger.error('Removal failed:', error);
        process.exit(1);
      }
    });

  // List models command
  ollamaCmd
    .command('list')
    .alias('ls')
    .description('List all available models')
    .action(async () => {
      try {
        const status = await OllamaManager_Instance.getStatus();
        
        console.log(`\n📚 ${chalk.bold('Available Local AI Models')}`);
        console.log('='.repeat(50));
        
        for (const model of status.availableModels) {
          const installed = status.modelsInstalled.includes(model.name);
          
          console.log(`\n${installed ? '✅' : '📦'} ${chalk.blue(model.name)} ${chalk.gray(`(${model.size})`)}`);
          console.log(`   ${model.description}`);
          console.log(`   ${chalk.green('Strengths:')} ${model.strengths.join(', ')}`);
          console.log(`   ${chalk.yellow('RAM Required:')} ${(model.ramRequired / 1024).toFixed(1)}GB`);
          
          if (model.recommended) {
            console.log(`   ${chalk.yellow('👍 Recommended for general use')}`);
          }
          
          if (installed) {
            console.log(`   ${chalk.green('✅ Already installed')}`);
          }
        }
        
        console.log(`\n${chalk.blue('💡 Usage:')}`);
        console.log(`  recoder ollama install <model-name>  # Install a model`);
        console.log(`  recoder ollama remove <model-name>   # Remove a model`);
        
      } catch (error) {
        Logger.error('Failed to list models:', error);
        process.exit(1);
      }
    });

  // Optimize command
  ollamaCmd
    .command('optimize')
    .description('Get hardware-specific optimization recommendations')
    .action(async () => {
      try {
        const result = await OllamaManager_Instance.optimizeForHardware();
        const stats = await OllamaManager_Instance.getUsageStats();
        
        console.log(`\n🚀 ${chalk.bold('Ollama Optimization Report')}`);
        console.log('='.repeat(40));
        
        console.log(`📊 ${chalk.bold('Current Status:')}`);
        console.log(`  Models Installed: ${stats.totalModels}`);
        console.log(`  Estimated Disk Usage: ${(stats.diskUsage / 1024).toFixed(1)}GB`);
        console.log(`  Most Used Model: ${stats.mostUsedModel}`);
        
        if (result.recommendations.length > 0) {
          console.log(`\n💡 ${chalk.bold('Hardware Recommendations:')}`);
          result.recommendations.forEach(rec => {
            console.log(`  ${chalk.yellow('•')} ${rec}`);
          });
        }
        
        if (stats.recommendations.length > 0) {
          console.log(`\n📋 ${chalk.bold('Usage Recommendations:')}`);
          stats.recommendations.forEach(rec => {
            console.log(`  ${chalk.blue('•')} ${rec}`);
          });
        }
        
      } catch (error) {
        Logger.error('Optimization analysis failed:', error);
        process.exit(1);
      }
    });

  // Info command
  ollamaCmd
    .command('info <model>')
    .description('Get detailed information about a model')
    .action(async (model: string) => {
      try {
        const info = await OllamaManager_Instance.getModelInfo(model);
        
        console.log(`\n📋 ${chalk.bold(`Model Information: ${model}`)}`);
        console.log('='.repeat(40));
        console.log(JSON.stringify(info, null, 2));
        
      } catch (error) {
        Logger.error(`Failed to get info for ${model}:`, error);
        console.log(`\n${chalk.red('❌')} Model ${chalk.blue(model)} not found or not installed`);
        console.log(`${chalk.yellow('💡')} Use "recoder ollama list" to see available models`);
      }
    });

  return ollamaCmd;
}