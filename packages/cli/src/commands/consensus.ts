/**
 * Consensus Command - Triple-Verified Code Generation
 * KILLER FEATURE: Generate same code with 3+ AI models and pick the best
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { Logger } from '../utils/logger';
import { AIModelHub } from '../services/ai-models/ai-hub';

// Define TaskType locally
enum TaskType {
  CODE_GENERATION = 'CODE_GENERATION',
  CODE_REVIEW = 'CODE_REVIEW',
  DEBUGGING = 'DEBUGGING',
  SECURITY_ANALYSIS = 'SECURITY_ANALYSIS',
  DOCUMENTATION = 'DOCUMENTATION',
  CHAT = 'CHAT'
}

export function createConsensusCommand(aiHub: AIModelHub): Command {
  const consensus = new Command('consensus')
    .description('🏆 Generate code with multi-model consensus (Triple-Verified AI)')
    .argument('<prompt>', 'What code to generate')
    .option('-l, --language <lang>', 'Programming language', 'typescript')
    .option('-m, --models <models>', 'Specific models to use (comma-separated)')
    .option('-t, --threshold <number>', 'Consensus threshold (0.6-1.0)', '0.7')
    .option('--max-attempts <number>', 'Maximum models to try', '3')
    .option('--prefer-accuracy', 'Prioritize accuracy over speed/cost')
    .option('--prefer-speed', 'Prioritize speed over accuracy/cost')
    .option('--prefer-cost', 'Prioritize cost efficiency')
    .option('--show-all', 'Show all model responses, not just winner')
    .option('--task <type>', 'Task type', 'code_generation')
    .action(async (prompt: string, options) => {
      try {
        console.log(chalk.blue('🚀 Starting Triple-Verified Code Generation...'));
        console.log(chalk.gray(`Prompt: ${prompt}`));
        console.log(chalk.gray(`Language: ${options.language}`));
        console.log();

        const startTime = Date.now();

        // Parse models if provided
        let models: string[] = [];
        if (options.models) {
          models = options.models.split(',').map((m: string) => m.trim());
          console.log(chalk.cyan(`🎯 Using specific models: ${models.join(', ')}`));
        } else {
          console.log(chalk.cyan('🎯 Auto-selecting optimal models for consensus'));
        }

        // Parse task type
        const taskMap: Record<string, TaskType> = {
          'code_generation': TaskType.CODE_GENERATION,
          'code_review': TaskType.CODE_REVIEW,
          'debugging': TaskType.DEBUGGING,
          'documentation': TaskType.DOCUMENTATION,
          'security': TaskType.SECURITY_ANALYSIS,
        };

        const task = taskMap[options.task] || TaskType.CODE_GENERATION;

        // Generate with consensus
        const result = await aiHub.generateWithConsensus({
          prompt,
          language: options.language,
          models,
          task,
          consensusThreshold: parseFloat(options.threshold),
          maxAttempts: parseInt(options.maxAttempts),
          preferences: {
            preferAccuracy: options.preferAccuracy || false,
            preferSpeed: options.preferSpeed || false,
            preferCost: options.preferCost || true, // Default to cost efficiency
          }
        });

        const executionTime = Date.now() - startTime;

        if (result.success) {
          console.log(chalk.green('✅ Consensus Generation Successful!'));
          console.log();

          // Show consensus metrics
          console.log(chalk.blue('📊 CONSENSUS METRICS'));
          console.log(`${chalk.cyan('Models Used:')} ${result.modelResponses.length}`);
          console.log(`${chalk.cyan('Confidence:')} ${result.confidence}%`);
          console.log(`${chalk.cyan('Quality Score:')} ${result.qualityScore}/100`);
          console.log(`${chalk.cyan('Agreement Level:')} ${Math.round(result.consensusMetrics.agreementLevel * 100)}%`);
          console.log(`${chalk.cyan('Diversity Score:')} ${Math.round(result.consensusMetrics.diversityScore * 100)}%`);
          console.log(`${chalk.cyan('Execution Time:')} ${executionTime}ms`);
          console.log();

          // Show voting results
          console.log(chalk.blue('🗳️  VOTING RESULTS'));
          console.log(`${chalk.green('Winner:')} ${result.votingResults.winningApproach}`);
          Object.entries(result.votingResults.votes).forEach(([approach, score]) => {
            const isWinner = approach === result.votingResults.winningApproach;
            const color = isWinner ? chalk.green : chalk.gray;
            console.log(`  ${color(approach)}: ${color(score.toFixed(2))}`);
          });
          console.log();

          // Show final code
          console.log(chalk.blue('💎 TRIPLE-VERIFIED CODE'));
          console.log(chalk.gray('─'.repeat(60)));
          console.log(result.finalCode);
          console.log(chalk.gray('─'.repeat(60)));
          console.log();

          // Show reasoning
          console.log(chalk.blue('🧠 CONSENSUS REASONING'));
          console.log(chalk.white(result.reasoning));
          console.log();

          // Show individual model responses if requested
          if (options.showAll) {
            console.log(chalk.blue('🤖 ALL MODEL RESPONSES'));
            result.modelResponses.forEach((response, index) => {
              console.log(chalk.cyan(`\n${index + 1}. ${response.model} (${response.provider})`));
              console.log(`Confidence: ${Math.round(response.confidence * 100)}%`);
              console.log(`Cost: $${response.cost.toFixed(6)}`);
              console.log(`Time: ${response.executionTime}ms`);
              console.log(`Quality: ${Math.round((response.qualityMetrics.syntaxScore + response.qualityMetrics.logicScore) * 50)}/100`);
              console.log(chalk.gray('Code:'));
              console.log(response.code);
              console.log(chalk.gray('-'.repeat(40)));
            });
          }

          // Show competitive advantage message
          console.log(chalk.magenta('🏆 COMPETITIVE ADVANTAGE'));
          console.log(chalk.white('This code has been verified by multiple AI models.'));
          console.log(chalk.white('Cursor and GitHub Copilot cannot offer this level of quality assurance.'));
          console.log(chalk.green('✨ Welcome to the future of AI-assisted development!'));

        } else {
          console.log(chalk.red('❌ Consensus Generation Failed'));
          console.log(chalk.red(`Error: ${result.error}`));
          process.exit(1);
        }

      } catch (error: any) {
        Logger.error('Consensus command failed', error);
        console.log(chalk.red(`❌ Command failed: ${error.message}`));
        process.exit(1);
      }
    });

  // Add subcommand to show consensus status
  consensus
    .command('status')
    .description('Show consensus engine status')
    .action(async () => {
      try {
        const status = aiHub.getConsensusStatus();
        console.log(chalk.blue('📊 CONSENSUS ENGINE STATUS'));
        console.log(`${chalk.cyan('Active Requests:')} ${status.active}`);
        
        if (status.requests.length > 0) {
          console.log('\n🔄 ACTIVE CONSENSUS REQUESTS:');
          status.requests.forEach((req, index) => {
            console.log(`${index + 1}. ${req.id}`);
            console.log(`   Prompt: ${req.prompt.substring(0, 60)}...`);
            console.log(`   Models: ${req.models.length > 0 ? req.models.join(', ') : 'auto-select'}`);
            console.log(`   Task: ${req.task}`);
          });
        } else {
          console.log(chalk.green('✨ No active consensus requests'));
        }

      } catch (error: any) {
        console.log(chalk.red(`❌ Status check failed: ${error.message}`));
        process.exit(1);
      }
    });

  // Add subcommand to cancel consensus
  consensus
    .command('cancel <requestId>')
    .description('Cancel a consensus request')
    .action(async (requestId: string) => {
      try {
        const cancelled = aiHub.cancelConsensus(requestId);
        if (cancelled) {
          console.log(chalk.green(`✅ Cancelled consensus request: ${requestId}`));
        } else {
          console.log(chalk.yellow(`⚠️  Request not found: ${requestId}`));
        }
      } catch (error: any) {
        console.log(chalk.red(`❌ Cancel failed: ${error.message}`));
        process.exit(1);
      }
    });

  return consensus;
}