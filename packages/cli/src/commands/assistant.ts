/**
 * AI Assistant Commands
 * Manage the web AI assistant from CLI
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { getWebAIIntegration } from '../services/web-ai-integration';
import fs from 'fs-extra';

export function createAssistantCommand(): Command {
  const assistantCommand = new Command('assistant')
    .alias('ai')
    .description('AI-powered development assistant');

  // Status command
  assistantCommand
    .command('status')
    .description('Show AI assistant status')
    .action(async () => {
      console.log(chalk.cyan('\n🤖 RECODER - AI Assistant Status\n'));

      try {
        const aiIntegration = getWebAIIntegration();
        const status = aiIntegration.getStatus();

        console.log(chalk.blue('AI Assistant Status:'));
        console.log(`  Initialized: ${status.initialized ? chalk.green('✅ Yes') : chalk.red('❌ No')}`);
        console.log(`  Code Completion: ${status.features.completion ? chalk.green('✅ Enabled') : chalk.gray('❌ Disabled')}`);
        console.log(`  Code Refactoring: ${status.features.refactoring ? chalk.green('✅ Enabled') : chalk.gray('❌ Disabled')}`);
        console.log(`  Code Analysis: ${status.features.analysis ? chalk.green('✅ Enabled') : chalk.gray('❌ Disabled')}`);
        console.log(`  Context Memory: ${status.config.contextMemorySize} lines`);
        console.log(`  Available Models: ${status.config.models.join(', ')}`);
        console.log();
      } catch (error: any) {
        console.error(chalk.red(`❌ Failed to get status: ${error.message}`));
        process.exit(1);
      }
    });

  // Complete command
  assistantCommand
    .command('complete')
    .description('Get intelligent code completion')
    .option('-f, --file <file>', 'File to analyze for completion')
    .option('-l, --line <line>', 'Line number for completion', '1')
    .action(async (options) => {
      console.log(chalk.cyan('\n🧠 RECODER - Code Completion\n'));

      try {
        const aiIntegration = getWebAIIntegration();
        
        let context = '';
        let position = parseInt(options.line) || 1;

        if (options.file) {
          if (!await fs.pathExists(options.file)) {
            console.error(chalk.red(`❌ File not found: ${options.file}`));
            process.exit(1);
          }
          context = await fs.readFile(options.file, 'utf8');
        } else {
          // Interactive input
          const { code } = await inquirer.prompt([
            {
              type: 'editor',
              name: 'code',
              message: 'Enter your code for completion analysis:'
            }
          ]);
          context = code;
        }

        console.log(chalk.blue('Analyzing code for completion suggestions...\n'));
        
        const suggestions = await aiIntegration.getCodeCompletion(context, position);

        if (suggestions.length === 0) {
          console.log(chalk.yellow('No completion suggestions found.'));
        } else {
          console.log(chalk.green(`Found ${suggestions.length} completion suggestions:\n`));
          suggestions.forEach((suggestion, index) => {
            console.log(chalk.blue(`${index + 1}. `) + suggestion);
          });
        }
        console.log();
      } catch (error: any) {
        console.error(chalk.red(`❌ Failed to get completions: ${error.message}`));
        process.exit(1);
      }
    });

  // Analyze command
  assistantCommand
    .command('analyze')
    .description('Analyze code for issues and improvements')
    .option('-f, --file <file>', 'File to analyze')
    .action(async (options) => {
      console.log(chalk.cyan('\n📊 RECODER - Code Analysis\n'));

      try {
        const aiIntegration = getWebAIIntegration();
        
        let code = '';

        if (options.file) {
          if (!await fs.pathExists(options.file)) {
            console.error(chalk.red(`❌ File not found: ${options.file}`));
            process.exit(1);
          }
          code = await fs.readFile(options.file, 'utf8');
        } else {
          // Interactive input
          const { inputCode } = await inquirer.prompt([
            {
              type: 'editor',
              name: 'inputCode',
              message: 'Enter your code for analysis:'
            }
          ]);
          code = inputCode;
        }

        console.log(chalk.blue('Analyzing code...\n'));
        
        const analysis = await aiIntegration.analyzeCode(code);

        // Display metrics
        console.log(chalk.blue('📈 Code Metrics:'));
        console.log(`  Complexity: ${analysis.metrics.complexity}/10`);
        console.log(`  Maintainability: ${analysis.metrics.maintainability}/10`);
        console.log(`  Testability: ${analysis.metrics.testability}/10\n`);

        // Display issues
        if (analysis.issues.length > 0) {
          console.log(chalk.blue('🔍 Issues Found:'));
          analysis.issues.forEach((issue, index) => {
            const severityColor = issue.severity === 'error' ? chalk.red : 
                                 issue.severity === 'warning' ? chalk.yellow : chalk.blue;
            console.log(`  ${index + 1}. Line ${issue.line}: ${severityColor(issue.message)}`);
          });
          console.log();
        }

        // Display suggestions
        if (analysis.suggestions.length > 0) {
          console.log(chalk.blue('💡 Improvement Suggestions:'));
          analysis.suggestions.forEach((suggestion, index) => {
            console.log(`  ${index + 1}. ${suggestion}`);
          });
          console.log();
        }

        if (analysis.issues.length === 0 && analysis.suggestions.length === 0) {
          console.log(chalk.green('✅ No issues found! Your code looks good.\n'));
        }
      } catch (error: any) {
        console.error(chalk.red(`❌ Failed to analyze code: ${error.message}`));
        process.exit(1);
      }
    });

  // Refactor command
  assistantCommand
    .command('refactor')
    .description('Get refactoring suggestions')
    .option('-f, --file <file>', 'File to refactor')
    .action(async (options) => {
      console.log(chalk.cyan('\n🔧 RECODER - Code Refactoring\n'));

      try {
        const aiIntegration = getWebAIIntegration();
        
        let code = '';

        if (options.file) {
          if (!await fs.pathExists(options.file)) {
            console.error(chalk.red(`❌ File not found: ${options.file}`));
            process.exit(1);
          }
          code = await fs.readFile(options.file, 'utf8');
        } else {
          // Interactive input
          const { inputCode } = await inquirer.prompt([
            {
              type: 'editor',
              name: 'inputCode',
              message: 'Enter your code for refactoring analysis:'
            }
          ]);
          code = inputCode;
        }

        console.log(chalk.blue('Analyzing code for refactoring opportunities...\n'));
        
        const suggestions = await aiIntegration.getRefactoringSuggestions(code);

        if (suggestions.length === 0) {
          console.log(chalk.green('✅ No refactoring opportunities found. Your code is well-structured!\n'));
        } else {
          console.log(chalk.blue(`Found ${suggestions.length} refactoring opportunities:\n`));
          
          suggestions.forEach((suggestion, index) => {
            console.log(chalk.blue(`${index + 1}. ${suggestion.type.toUpperCase()}`));
            console.log(`   Description: ${suggestion.description}`);
            console.log(chalk.gray('   Before:'));
            console.log(chalk.red(`     ${suggestion.before.replace(/\n/g, '\n     ')}`));
            console.log(chalk.gray('   After:'));
            console.log(chalk.green(`     ${suggestion.after.replace(/\n/g, '\n     ')}`));
            console.log();
          });
        }
      } catch (error: any) {
        console.error(chalk.red(`❌ Failed to get refactoring suggestions: ${error.message}`));
        process.exit(1);
      }
    });

  // Initialize command
  assistantCommand
    .command('init')
    .description('Initialize AI assistant with custom configuration')
    .action(async () => {
      console.log(chalk.cyan('\n🤖 RECODER - Initialize AI Assistant\n'));

      try {
        const answers = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'enableCompletion',
            message: 'Enable intelligent code completion?',
            default: true
          },
          {
            type: 'confirm',
            name: 'enableRefactoring',
            message: 'Enable automated refactoring suggestions?',
            default: true
          },
          {
            type: 'confirm',
            name: 'enableAnalysis',
            message: 'Enable real-time code analysis?',
            default: true
          },
          {
            type: 'number',
            name: 'contextMemorySize',
            message: 'Context memory size (lines):',
            default: 1000,
            validate: (value) => value > 0 || 'Must be greater than 0'
          }
        ]);

        const aiIntegration = getWebAIIntegration(answers);
        await aiIntegration.initialize();

        console.log(chalk.green('✅ AI Assistant initialized successfully!\n'));
      } catch (error: any) {
        console.error(chalk.red(`❌ Failed to initialize AI assistant: ${error.message}`));
        process.exit(1);
      }
    });

  return assistantCommand;
}