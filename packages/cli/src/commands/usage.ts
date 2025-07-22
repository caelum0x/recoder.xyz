/**
 * Usage Analytics and Monitoring Commands
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import boxen from 'boxen';
import { Logger } from '../../../shared/src/logger';
import { UsageTracker_Instance } from '../services/usage-tracker';
import { ConfigManager } from '../utils/config';

export function setupUsageCommands(program: Command): void {
  const usage = program
    .command('usage')
    .description('📊 View usage analytics and cost monitoring');

  // Main usage analytics command
  usage
    .command('analytics')
    .alias('stats')
    .description('Show detailed usage analytics and cost breakdown')
    .option('-e, --export <format>', 'Export data (json|csv)', 'json')
    .option('--reset', 'Reset usage counters (admin only)')
    .action(async (options) => {
      try {
        await handleUsageAnalytics(options);
      } catch (error) {
        Logger.error(`Analytics failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Current status command
  usage
    .command('status')
    .description('Show current usage status and limits')
    .option('-j, --json', 'Output as JSON')
    .action(async (options) => {
      try {
        await handleUsageStatus(options);
      } catch (error) {
        Logger.error(`Status check failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Cost optimization tips
  usage
    .command('optimize')
    .description('Get personalized cost optimization recommendations')
    .action(async () => {
      try {
        await handleOptimizationTips();
      } catch (error) {
        Logger.error(`Optimization analysis failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Export usage data
  usage
    .command('export')
    .description('Export usage data for external analysis')
    .option('-f, --format <format>', 'Export format (json|csv)', 'json')
    .option('-o, --output <path>', 'Output directory')
    .action(async (options) => {
      try {
        await handleDataExport(options);
      } catch (error) {
        Logger.error(`Export failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Usage prediction
  usage
    .command('predict')
    .description('Predict monthly costs based on current usage patterns')
    .action(async () => {
      try {
        await handleUsagePrediction();
      } catch (error) {
        Logger.error(`Prediction failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });
}

async function handleUsageAnalytics(options: any): Promise<void> {
  console.log(
    boxen(
      chalk.blue('📊 Recoder.xyz Usage Analytics'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'blue',
      }
    )
  );

  // Check authentication
  const user = ConfigManager.getCurrentUser();
  if (!user) {
    console.log(chalk.yellow('⚠️ Not authenticated. Showing local usage only.'));
  }

  // Display comprehensive analytics
  await UsageTracker_Instance.displayUsageAnalytics();

  // Handle export option
  if (options.export) {
    const filepath = await UsageTracker_Instance.exportUsageData(options.export);
    console.log(chalk.green(`\n✅ Usage data exported to: ${filepath}`));
  }

  // Handle reset option
  if (options.reset) {
    const confirm = await inquirer.prompt([{
      type: 'confirm',
      name: 'reset',
      message: 'Are you sure you want to reset usage counters?',
      default: false
    }]);

    if (confirm.reset) {
      await UsageTracker_Instance.resetUsage();
      console.log(chalk.green('✅ Usage counters have been reset'));
    }
  }
}

async function handleUsageStatus(options: any): Promise<void> {
  const tokenData = UsageTracker_Instance.getCurrentTokenData();
  const canMakeRequest = await UsageTracker_Instance.canMakeRequest();

  if (options.json) {
    console.log(JSON.stringify({
      tokenData,
      requestStatus: canMakeRequest
    }, null, 2));
    return;
  }

  // Display current status
  console.log(
    boxen(
      chalk.white('📈 Current Usage Status\n') +
      chalk.gray(`User: ${tokenData.userId}\n`) +
      chalk.gray(`Tier: ${tokenData.tier.toUpperCase()}\n`) +
      chalk.gray(`Features: ${tokenData.features.join(', ')}`),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
        title: 'Account Info'
      }
    )
  );

  // Usage bars
  console.log('\n📊 Usage This Month');
  console.log('─'.repeat(40));

  if (tokenData.tokenLimit > 0) {
    const tokenPercent = Math.round((tokenData.tokensUsed / tokenData.tokenLimit) * 100);
    console.log(`Tokens: ${tokenData.tokensUsed.toLocaleString()} / ${tokenData.tokenLimit.toLocaleString()} (${tokenPercent}%)`);
    console.log(createProgressBar(tokenPercent, 30));
  } else {
    console.log('Tokens: Unlimited (Local models only)');
  }

  if (tokenData.requestLimit > 0) {
    const requestPercent = Math.round((tokenData.requestsUsed / tokenData.requestLimit) * 100);
    console.log(`\nRequests: ${tokenData.requestsUsed.toLocaleString()} / ${tokenData.requestLimit.toLocaleString()} (${requestPercent}%)`);
    console.log(createProgressBar(requestPercent, 30));
  } else {
    console.log('\nRequests: Unlimited (Local models only)');
  }

  console.log(`\nNext Reset: ${chalk.cyan(new Date(tokenData.resetDate).toLocaleDateString())}`);

  // Cost tracking
  if (tokenData.costTracking.actualCosts > 0) {
    console.log('\n💰 Cost Summary');
    console.log('─'.repeat(20));
    console.log(`Monthly Spend: $${tokenData.costTracking.actualCosts.toFixed(2)}`);
    console.log(`Estimated: $${tokenData.costTracking.estimatedMonthlyCost.toFixed(2)}`);
    console.log(`Savings: $${tokenData.costTracking.savingsFromOptimization.toFixed(2)}`);
  }

  // Request status
  console.log('\n🚦 Request Status');
  console.log('─'.repeat(20));
  if (canMakeRequest.allowed) {
    console.log(chalk.green('✅ Ready to process requests'));
    if (canMakeRequest.suggestion) {
      console.log(chalk.yellow(`💡 ${canMakeRequest.suggestion}`));
    }
  } else {
    console.log(chalk.red(`❌ ${canMakeRequest.reason}`));
    if (canMakeRequest.suggestion) {
      console.log(chalk.blue(`💡 ${canMakeRequest.suggestion}`));
    }
  }
}

async function handleOptimizationTips(): Promise<void> {
  console.log(
    boxen(
      chalk.yellow('💡 Cost Optimization Analysis'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'yellow',
      }
    )
  );

  const costBreakdown = await UsageTracker_Instance.getCostBreakdown();
  const tokenData = UsageTracker_Instance.getCurrentTokenData();

  // Analyze usage patterns
  const tips = [];

  // Check model distribution
  const totalModelCosts = Object.values(costBreakdown.modelCosts).reduce((a, b) => a + b, 0);
  const expensiveModelUsage = Object.entries(costBreakdown.modelCosts)
    .filter(([model, cost]) => cost > totalModelCosts * 0.3);

  if (expensiveModelUsage.length > 0) {
    tips.push({
      type: '🧠 Model Selection',
      tip: `${expensiveModelUsage[0][0]} accounts for ${((expensiveModelUsage[0][1] / totalModelCosts) * 100).toFixed(0)}% of your costs`,
      action: 'Consider using simpler prompts for basic tasks to trigger cheaper models'
    });
  }

  // Check tier optimization
  if (tokenData.tier === 'premium' && tokenData.tokensUsed > tokenData.tokenLimit * 0.8) {
    tips.push({
      type: '📦 Plan Optimization',
      tip: 'You\'re using 80%+ of your Premium tier limits',
      action: 'Upgrade to Pro tier for 5x more usage and better value per token'
    });
  }

  // Check time patterns
  if (costBreakdown.dailySpend.length > 7) {
    const avgDailyCost = costBreakdown.dailySpend.reduce((sum, day) => sum + day.cost, 0) / costBreakdown.dailySpend.length;
    const peakDays = costBreakdown.dailySpend.filter(day => day.cost > avgDailyCost * 1.5);
    
    if (peakDays.length > 0) {
      tips.push({
        type: '📅 Usage Patterns',
        tip: `You have ${peakDays.length} days with unusually high usage`,
        action: 'Consider batching large tasks to optimize model routing'
      });
    }
  }

  // Show savings from optimization
  if (costBreakdown.optimizationSavings > 0.1) {
    tips.push({
      type: '✅ Smart Routing',
      tip: `You've saved $${costBreakdown.optimizationSavings.toFixed(2)} through intelligent model selection`,
      action: 'Keep using natural language prompts - our AI router optimizes automatically!'
    });
  }

  // Display tips
  if (tips.length === 0) {
    console.log(chalk.green('\n🎉 Your usage is already well optimized!'));
    console.log(chalk.gray('Continue using natural language prompts for the best cost efficiency.'));
  } else {
    console.log('\n🎯 Personalized Recommendations:');
    tips.forEach((tip, index) => {
      console.log(`\n${index + 1}. ${chalk.bold(tip.type)}`);
      console.log(`   ${chalk.white(tip.tip)}`);
      console.log(`   ${chalk.blue('→ ' + tip.action)}`);
    });
  }

  // Monthly projection
  console.log('\n📈 Monthly Projection');
  console.log('─'.repeat(25));
  console.log(`Current spend: $${costBreakdown.totalCost.toFixed(2)}`);
  console.log(`Projected monthly: $${costBreakdown.projectedMonthlyCost.toFixed(2)}`);
  
  const tierCost = tokenData.tier === 'premium' ? 20 : tokenData.tier === 'pro' ? 100 : 0;
  if (tierCost > 0) {
    const totalMonthlyCost = tierCost + costBreakdown.projectedMonthlyCost;
    console.log(`Total with subscription: $${totalMonthlyCost.toFixed(2)}`);
  }
}

async function handleDataExport(options: any): Promise<void> {
  const spinner = require('ora')('Exporting usage data...').start();
  
  try {
    const filepath = await UsageTracker_Instance.exportUsageData(options.format);
    spinner.succeed(chalk.green('Export completed'));
    
    console.log(
      boxen(
        chalk.white('📊 Data Export Complete\n') +
        chalk.gray(`Format: ${options.format.toUpperCase()}\n`) +
        chalk.gray(`File: ${filepath}\n`) +
        chalk.blue('Use this data for custom analysis or reporting'),
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'green',
        }
      )
    );
  } catch (error) {
    spinner.fail(chalk.red('Export failed'));
    throw error;
  }
}

async function handleUsagePrediction(): Promise<void> {
  const costBreakdown = await UsageTracker_Instance.getCostBreakdown();
  const tokenData = UsageTracker_Instance.getCurrentTokenData();

  console.log(
    boxen(
      chalk.cyan('🔮 Usage Prediction Analysis'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  // Calculate usage velocity
  const dailySpend = costBreakdown.dailySpend.slice(-7); // Last 7 days
  const avgDailyCost = dailySpend.length > 0 
    ? dailySpend.reduce((sum, day) => sum + day.cost, 0) / dailySpend.length 
    : 0;

  const avgDailyTokens = dailySpend.length > 0
    ? dailySpend.reduce((sum, day) => sum + day.tokens, 0) / dailySpend.length
    : 0;

  console.log('\n📈 7-Day Average');
  console.log('─'.repeat(20));
  console.log(`Daily tokens: ${avgDailyTokens.toLocaleString()}`);
  console.log(`Daily cost: $${avgDailyCost.toFixed(3)}`);

  // Monthly predictions
  const projectedMonthlyTokens = avgDailyTokens * 30;
  const projectedMonthlyCost = avgDailyCost * 30;

  console.log('\n🎯 Monthly Projection');
  console.log('─'.repeat(22));
  console.log(`Tokens: ${projectedMonthlyTokens.toLocaleString()}`);
  console.log(`Cost: $${projectedMonthlyCost.toFixed(2)}`);

  // Tier recommendations
  if (tokenData.tier === 'free' && projectedMonthlyTokens > 10000) {
    console.log(chalk.yellow('\n💡 Consider upgrading to Premium for cloud models'));
  } else if (tokenData.tier === 'premium' && projectedMonthlyTokens > tokenData.tokenLimit * 0.8) {
    console.log(chalk.yellow('\n💡 Consider upgrading to Pro for higher limits'));
  }

  // Usage trend
  if (dailySpend.length >= 3) {
    const recentTrend = dailySpend.slice(-3).reduce((sum, day) => sum + day.cost, 0) / 3;
    const olderTrend = dailySpend.slice(0, -3).reduce((sum, day) => sum + day.cost, 0) / Math.max(1, dailySpend.length - 3);
    
    const trendDirection = recentTrend > olderTrend * 1.1 ? 'increasing' : 
                          recentTrend < olderTrend * 0.9 ? 'decreasing' : 'stable';
    
    console.log(`\n📊 Trend: ${chalk.cyan(trendDirection.toUpperCase())}`);
    
    if (trendDirection === 'increasing') {
      console.log(chalk.yellow('⚠️ Usage is trending upward - monitor limits'));
    }
  }
}

function createProgressBar(percent: number, width: number = 20): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  
  let color = chalk.green;
  if (percent > 75) color = chalk.yellow;
  if (percent > 90) color = chalk.red;

  return color('█'.repeat(filled)) + chalk.gray('░'.repeat(empty)) + ` ${percent}%`;
}