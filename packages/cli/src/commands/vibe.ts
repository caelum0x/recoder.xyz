/**
 * Vibe Code Mode CLI Commands - Real Implementation
 * Live AI-powered coding assistance with real-time suggestions
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import boxen from 'boxen';
import { Logger } from '../utils/logger';
import { vibeCodeMode, VibeCodeConfig } from '../services/vibe-code-mode';

export function createVibeCommand(): Command {
  const command = new Command('vibe');
  
  command
    .description('🎯 Vibe Code Mode - AI-powered live coding assistance')
    .addCommand(createStartCommand())
    .addCommand(createStopCommand())
    .addCommand(createStatusCommand())
    .addCommand(createConfigCommand())
    .addCommand(createApplyCommand())
    .addCommand(createRejectCommand());

  return command;
}

function createStartCommand(): Command {
  return new Command('start')
    .description('Start Vibe Code Mode session')
    .option('-d, --directory <path>', 'Workspace directory', process.cwd())
    .option('--auto-suggest', 'Enable auto-suggestions', true)
    .option('--delay <ms>', 'Suggestion delay in milliseconds', '2000')
    .option('--context <lines>', 'Context window size', '50')
    .option('--aggressive', 'Aggressive suggestion mode')
    .option('--conservative', 'Conservative suggestion mode')
    .action(async (options) => {
      console.log(boxen(
        chalk.cyan.bold('🎯 VIBE CODE MODE') + '\n' +
        chalk.gray('AI-powered live coding assistance') + '\n\n' +
        chalk.yellow('• Real-time code suggestions') + '\n' +
        chalk.yellow('• Intelligent completions') + '\n' +
        chalk.yellow('• Auto-refactoring') + '\n' +
        chalk.yellow('• Performance optimizations'),
        {
          padding: 1,
          borderColor: 'cyan',
          borderStyle: 'round'
        }
      ));

      console.log();

      const spinner = ora('Initializing Vibe Code Mode...').start();

      try {
        // Setup configuration
        const config: Partial<VibeCodeConfig> = {
          autoSuggest: options.autoSuggest,
          suggestionsDelay: parseInt(options.delay),
          contextWindow: parseInt(options.context)
        };

        if (options.aggressive) {
          config.aggressiveness = 'aggressive';
        } else if (options.conservative) {
          config.aggressiveness = 'conservative';
        } else {
          config.aggressiveness = 'balanced';
        }

        vibeCodeMode.updateConfig(config);

        // Start session
        const sessionId = await vibeCodeMode.startSession(options.directory);

        spinner.succeed(chalk.green('🚀 Vibe Code Mode activated!'));

        console.log();
        console.log(chalk.blue('📊 Session Info:'));
        console.log(chalk.gray(`   Session ID: ${sessionId}`));
        console.log(chalk.gray(`   Directory: ${options.directory}`));
        console.log(chalk.gray(`   Mode: ${config.aggressiveness}`));
        console.log(chalk.gray(`   Auto-suggest: ${config.autoSuggest ? 'ON' : 'OFF'}`));
        console.log();

        // Setup event listeners for real-time feedback
        setupEventListeners();

        console.log(chalk.yellow('💡 How to use:'));
        console.log(chalk.white('• Start coding - suggestions appear automatically'));
        console.log(chalk.white('• Use `recoder vibe apply <id>` to apply suggestions'));
        console.log(chalk.white('• Use `recoder vibe reject <id>` to reject suggestions'));
        console.log(chalk.white('• Use `recoder vibe status` to see current suggestions'));
        console.log(chalk.white('• Use `recoder vibe stop` to end the session'));
        console.log();

        console.log(chalk.green('🎉 Happy coding! Vibe Mode is watching and ready to help.'));

        // Keep process alive
        process.stdin.resume();

      } catch (error) {
        spinner.fail(chalk.red('❌ Failed to start Vibe Code Mode'));
        Logger.error('Vibe Code Mode startup failed:', error);
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

function createStopCommand(): Command {
  return new Command('stop')
    .description('Stop current Vibe Code Mode session')
    .action(async () => {
      const spinner = ora('Stopping Vibe Code Mode...').start();

      try {
        await vibeCodeMode.stopSession();
        
        const metrics = vibeCodeMode.getSessionMetrics();
        
        spinner.succeed(chalk.green('✅ Vibe Code Mode stopped'));

        if (metrics) {
          console.log();
          console.log(chalk.blue('📊 Session Summary:'));
          console.log(chalk.gray(`   Suggestions Generated: ${metrics.suggestionsGenerated}`));
          console.log(chalk.gray(`   Suggestions Applied: ${metrics.suggestionsApplied}`));
          console.log(chalk.gray(`   Lines Generated: ${metrics.linesGenerated}`));
          console.log(chalk.gray(`   Estimated Time Saved: ${Math.round(metrics.timesSaved)} minutes`));
          
          if (metrics.suggestionsGenerated > 0) {
            const acceptanceRate = (metrics.suggestionsApplied / metrics.suggestionsGenerated * 100).toFixed(1);
            console.log(chalk.gray(`   Acceptance Rate: ${acceptanceRate}%`));
          }
        }

        console.log();
        console.log(chalk.yellow('Thanks for using Vibe Code Mode! 🎯'));

      } catch (error) {
        spinner.fail(chalk.red('❌ Failed to stop Vibe Code Mode'));
        Logger.error('Vibe Code Mode stop failed:', error);
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

function createStatusCommand(): Command {
  return new Command('status')
    .description('Show current Vibe Code Mode status and suggestions')
    .option('--detailed', 'Show detailed suggestion information')
    .action(async (options) => {
      const suggestions = vibeCodeMode.getCurrentSuggestions();
      const metrics = vibeCodeMode.getSessionMetrics();

      if (!metrics) {
        console.log(chalk.yellow('⚠️  Vibe Code Mode is not currently active'));
        console.log(chalk.gray('Use `recoder vibe start` to begin a session'));
        return;
      }

      console.log(chalk.cyan('🎯 Vibe Code Mode Status'));
      console.log(chalk.gray('─'.repeat(50)));

      console.log(chalk.blue('📊 Session Metrics:'));
      console.log(chalk.gray(`   Suggestions Generated: ${metrics.suggestionsGenerated}`));
      console.log(chalk.gray(`   Suggestions Applied: ${metrics.suggestionsApplied}`));
      console.log(chalk.gray(`   Lines Generated: ${metrics.linesGenerated}`));
      console.log(chalk.gray(`   Time Saved: ~${Math.round(metrics.timesSaved)} minutes`));

      console.log();
      console.log(chalk.blue(`🔮 Current Suggestions (${suggestions.length}):`));

      if (suggestions.length === 0) {
        console.log(chalk.gray('   No pending suggestions'));
      } else {
        suggestions.forEach((suggestion, index) => {
          const confidenceColor = suggestion.confidence > 0.8 ? chalk.green : 
                                  suggestion.confidence > 0.6 ? chalk.yellow : chalk.red;
          const impactIcon = suggestion.impact === 'high' ? '🔥' : 
                           suggestion.impact === 'medium' ? '⚡' : '💡';
          
          console.log();
          console.log(`${impactIcon} ${chalk.white(`#${index + 1}`)} ${chalk.cyan(suggestion.type)} in ${chalk.gray(suggestion.file)}`);
          console.log(`   Line ${suggestion.line} | ${confidenceColor(Math.round(suggestion.confidence * 100) + '%')} | ${suggestion.category}`);
          
          if (options.detailed) {
            console.log(chalk.gray(`   ${suggestion.explanation}`));
            if (suggestion.suggestedCode.length < 100) {
              console.log(chalk.dim(`   Suggestion: ${suggestion.suggestedCode.replace(/\n/g, '\\n')}`));
            }
          }
          
          console.log(chalk.gray(`   ID: ${suggestion.id}`));
        });

        console.log();
        console.log(chalk.yellow('💡 Commands:'));
        console.log(chalk.white(`   recoder vibe apply <id>   # Apply a suggestion`));
        console.log(chalk.white(`   recoder vibe reject <id>  # Reject a suggestion`));
      }
    });
}

function createApplyCommand(): Command {
  return new Command('apply')
    .description('Apply a code suggestion')
    .argument('<suggestion-id>', 'Suggestion ID to apply')
    .action(async (suggestionId) => {
      const spinner = ora(`Applying suggestion ${suggestionId}...`).start();

      try {
        const success = await vibeCodeMode.applySuggestion(suggestionId);

        if (success) {
          spinner.succeed(chalk.green(`✅ Suggestion ${suggestionId} applied successfully`));
          
          const metrics = vibeCodeMode.getSessionMetrics();
          if (metrics) {
            console.log(chalk.gray(`Total applied: ${metrics.suggestionsApplied}`));
          }
        } else {
          spinner.fail(chalk.red(`❌ Failed to apply suggestion ${suggestionId}`));
          console.log(chalk.yellow('Suggestion may have already been applied or rejected'));
        }

      } catch (error) {
        spinner.fail(chalk.red('❌ Error applying suggestion'));
        Logger.error('Suggestion application failed:', error);
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

function createRejectCommand(): Command {
  return new Command('reject')
    .description('Reject a code suggestion')
    .argument('<suggestion-id>', 'Suggestion ID to reject')
    .action(async (suggestionId) => {
      try {
        const success = vibeCodeMode.rejectSuggestion(suggestionId);

        if (success) {
          console.log(chalk.yellow(`🗑️  Suggestion ${suggestionId} rejected`));
        } else {
          console.log(chalk.red(`❌ Failed to reject suggestion ${suggestionId}`));
          console.log(chalk.gray('Suggestion may not exist or already been processed'));
        }

      } catch (error) {
        Logger.error('Suggestion rejection failed:', error);
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

function createConfigCommand(): Command {
  return new Command('config')
    .description('Configure Vibe Code Mode settings')
    .action(async () => {
      console.log(chalk.cyan('⚙️  Configure Vibe Code Mode'));
      console.log();

      const answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'autoSuggest',
          message: 'Enable automatic suggestions?',
          default: true
        },
        {
          type: 'number',
          name: 'suggestionsDelay',
          message: 'Suggestion delay (milliseconds):',
          default: 2000,
          validate: (input) => input >= 500 || 'Minimum delay is 500ms'
        },
        {
          type: 'number',
          name: 'contextWindow',
          message: 'Context window (lines of code):',
          default: 50,
          validate: (input) => input >= 10 || 'Minimum context is 10 lines'
        },
        {
          type: 'list',
          name: 'aggressiveness',
          message: 'Suggestion aggressiveness:',
          choices: [
            { name: 'Conservative - Only high-confidence suggestions', value: 'conservative' },
            { name: 'Balanced - Reasonable suggestions (recommended)', value: 'balanced' },
            { name: 'Aggressive - All potential improvements', value: 'aggressive' }
          ],
          default: 'balanced'
        },
        {
          type: 'checkbox',
          name: 'languages',
          message: 'Enable for languages:',
          choices: [
            { name: 'TypeScript', value: 'typescript', checked: true },
            { name: 'JavaScript', value: 'javascript', checked: true },
            { name: 'Python', value: 'python', checked: true },
            { name: 'Rust', value: 'rust' },
            { name: 'Go', value: 'go' },
            { name: 'Java', value: 'java' }
          ]
        }
      ]);

      vibeCodeMode.updateConfig(answers);

      console.log();
      console.log(chalk.green('✅ Configuration updated!'));
      console.log(chalk.gray('Changes will take effect in the next session'));
    });
}

function setupEventListeners(): void {
  vibeCodeMode.on('suggestion-generated', (suggestion) => {
    const impactIcon = suggestion.impact === 'high' ? '🔥' : 
                      suggestion.impact === 'medium' ? '⚡' : '💡';
    
    console.log(chalk.dim('─'.repeat(50)));
    console.log(`${impactIcon} ${chalk.cyan('New suggestion')} in ${chalk.gray(suggestion.file)}`);
    console.log(`   ${chalk.white(suggestion.type)} at line ${suggestion.line} (${Math.round(suggestion.confidence * 100)}% confidence)`);
    console.log(`   ${chalk.gray(suggestion.explanation)}`);
    console.log(`   ${chalk.yellow(`Apply: recoder vibe apply ${suggestion.id}`)}`);
    console.log(chalk.dim('─'.repeat(50)));
  });

  vibeCodeMode.on('suggestion-applied', (suggestion) => {
    console.log(chalk.green(`✅ Applied suggestion in ${suggestion.file} at line ${suggestion.line}`));
  });

  vibeCodeMode.on('suggestion-rejected', (suggestion) => {
    console.log(chalk.yellow(`🗑️  Rejected suggestion in ${suggestion.file}`));
  });

  vibeCodeMode.on('file-changed', (data) => {
    console.log(chalk.dim(`📝 Analyzing changes in ${data.file}...`));
  });

  vibeCodeMode.on('template-suggestion', (suggestion) => {
    console.log(chalk.blue(`📄 Template generated for new file: ${suggestion.file}`));
    console.log(chalk.yellow(`   Apply: recoder vibe apply ${suggestion.id}`));
  });
}

