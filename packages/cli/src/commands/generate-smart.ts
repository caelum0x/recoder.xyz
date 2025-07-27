/**
 * Smart Code Generation Command
 * Primary interface for natural language development requests
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import boxen from 'boxen';
import { Logger } from '../../../shared/src/logger';
import { AIRouter } from '../services/ai-router';
import { AgentManager } from '../services/specialized-agents';
import { ConfigManager } from '../utils/config';
import { AuthService } from '../services/auth';
import fs from 'fs-extra';
import path from 'path';

export interface GenerationOptions {
  agent?: string;
  output?: string;
  project?: string;
  verbose?: boolean;
  dryRun?: boolean;
  cost?: boolean;
  interactive?: boolean;
}

export function setupGenerateCommand(program: Command): void {
  program
    .command('generate')
    .alias('gen')
    .description('🚀 Generate production-ready code using AI agents')
    .argument('[request]', 'Natural language description of what to build')
    .option('-a, --agent <agent>', 'Specific agent to use (blockchain, web, mobile, security, devops)')
    .option('-o, --output <path>', 'Output directory for generated code', './generated')
    .option('-p, --project <name>', 'Project name for generated files')
    .option('-v, --verbose', 'Show detailed generation process')
    .option('--dry-run', 'Show what would be generated without creating files')
    .option('--cost', 'Show estimated cost before generation')
    .option('-i, --interactive', 'Interactive mode with follow-up questions')
    .action(async (request: string, options: GenerationOptions) => {
      try {
        await handleGenerate(request, options);
      } catch (error) {
        Logger.error(`Generation failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Add the main conversational interface
  program
    .argument('[prompt]', 'What do you want to build?')
    .description('🎯 AI-powered development assistant - just describe what you want to build')
    .action(async (prompt: string) => {
      if (!prompt && process.argv.length === 2) {
        await startInteractiveMode();
      } else if (prompt) {
        await handleGenerate(prompt, { interactive: true });
      } else {
        program.help();
      }
    });
}

async function handleGenerate(request: string, options: GenerationOptions): Promise<void> {
  console.log(
    boxen(
      chalk.cyan('🚀 Recoder.xyz - Production Code Generator'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  // Check authentication and plan
  const userInfo = await checkUserAccess();
  if (!userInfo.authenticated) {
    console.log(chalk.yellow('🔑 Authentication required for cloud AI models.'));
    console.log(chalk.gray('Run: recoder auth login'));
    console.log(chalk.blue('💡 Or use local models with Ollama (requires installation)'));
    
    const useLocal = await inquirer.prompt([{
      type: 'confirm',
      name: 'proceed',
      message: 'Continue with local models only?',
      default: false
    }]);

    if (!useLocal.proceed) {
      return;
    }
  }

  // Interactive request if not provided
  if (!request) {
    const response = await inquirer.prompt([
      {
        type: 'input',
        name: 'description',
        message: 'What would you like to build?',
        validate: (input) => input.length > 10 || 'Please provide a more detailed description'
      },
      {
        type: 'list',
        name: 'complexity',
        message: 'Project complexity:',
        choices: [
          { name: '🟢 Simple - Basic functionality', value: 'simple' },
          { name: '🟡 Moderate - Standard features', value: 'moderate' },
          { name: '🟠 Complex - Advanced architecture', value: 'complex' },
          { name: '🔴 Expert - Enterprise-grade system', value: 'expert' }
        ]
      }
    ]);

    request = `${response.description} (Complexity: ${response.complexity})`;
  }

  // Show cost estimate if requested
  if (options.cost || userInfo.plan === 'premium') {
    await showCostEstimate(request, userInfo.plan);
  }

  console.log(chalk.blue('\n🎯 Analyzing your request...'));

  // Route to appropriate agent
  const spinner = ora('Finding the best AI agent for your task...').start();
  
  try {
    // Determine routing decision
    const routing = await AIRouter.routeRequest(request, 'generation', userInfo.plan);
    
    spinner.succeed(
      chalk.green(`Selected: ${routing.selectedModel.name}`) + 
      chalk.gray(` (${routing.reasoning})`)
    );

    if (options.verbose) {
      console.log(chalk.gray(`Estimated cost: $${routing.estimatedCost.toFixed(4)}`));
    }

    // Check usage limits
    if (userInfo.plan !== 'free') {
      const usageCheck = await AuthService.checkUsageLimit(
        ConfigManager.getAuthToken()!,
        2000 // Estimated tokens for generation
      );

      if (!usageCheck.allowed) {
        console.log(chalk.red('❌ Usage limit exceeded'));
        console.log(chalk.yellow(usageCheck.reason || 'Please upgrade your plan'));
        console.log(chalk.blue('💡 Run: recoder auth upgrade'));
        return;
      }
    }

    // Generate code using specialized agent
    const generationSpinner = ora('Generating your code...').start();
    
    const agentManager = new AgentManager();
    const agentResponse = await agentManager.executeTask({
      task: request,
      context: { userTier: userInfo.plan }
    } as any);

    generationSpinner.succeed(chalk.green('Code generation completed!'));

    // Display results
    await displayResults(agentResponse, options);

    // Save to files if not dry run
    if (!options.dryRun) {
      await saveGeneratedCode(agentResponse, options);
    }

    // Track usage
    if (userInfo.authenticated && routing.selectedModel.id !== 'ollama-local') {
      await AIRouter.trackUsage(routing.selectedModel.id, 1500); // Estimated tokens used
    }

    // Interactive follow-up
    if (options.interactive) {
      await handleInteractiveFollowup(agentResponse, options);
    }

  } catch (error) {
    spinner.fail(chalk.red('Generation failed'));
    throw error;
  }
}

async function checkUserAccess(): Promise<{
  authenticated: boolean;
  plan: 'free' | 'premium' | 'pro' | 'enterprise';
  usage?: any;
}> {
  const token = ConfigManager.getAuthToken();
  
  if (!token) {
    return { authenticated: false, plan: 'free' };
  }

  try {
    const userResult = await AuthService.getCurrentUser(token);
    if (!userResult.success) {
      return { authenticated: false, plan: 'free' };
    }

    const subscriptionResult = await AuthService.getSubscription(token);
    const plan = subscriptionResult.success ? subscriptionResult.data?.plan || 'free' : 'free';

    return {
      authenticated: true,
      plan: plan as any,
      usage: subscriptionResult.success ? subscriptionResult.data?.usage : undefined
    };
  } catch (error) {
    Logger.warn('Failed to check user access:', error);
    return { authenticated: false, plan: 'free' };
  }
}

async function showCostEstimate(request: string, plan: string): Promise<void> {
  const routing = await AIRouter.routeRequest(request, 'generation', plan as any);
  
  console.log(
    boxen(
      chalk.white('💰 Cost Estimate\n') +
      chalk.gray(`Model: ${routing.selectedModel.name}\n`) +
      chalk.gray(`Estimated tokens: ~2,000\n`) +
      chalk.cyan(`Estimated cost: $${routing.estimatedCost.toFixed(4)}\n`) +
      chalk.yellow(`Reason: ${routing.reasoning}`),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'yellow',
      }
    )
  );

  const proceed = await inquirer.prompt([{
    type: 'confirm',
    name: 'continue',
    message: 'Continue with generation?',
    default: true
  }]);

  if (!proceed.continue) {
    process.exit(0);
  }
}

async function displayResults(response: any, options: GenerationOptions): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log(chalk.bold.green('🎉 Generation Results'));
  console.log('='.repeat(60));

  if (response.explanation) {
    console.log(chalk.white('\n📋 Overview:'));
    console.log(chalk.gray(response.explanation));
  }

  if (response.code) {
    console.log(chalk.white('\n💻 Generated Code:'));
    if (options.verbose) {
      console.log(response.code);
    } else {
      const lines = response.code.split('\n');
      console.log(chalk.gray(`${lines.length} lines of code generated`));
      console.log(chalk.blue('💡 Use --verbose to see full code output'));
    }
  }

  if (response.nextSteps && response.nextSteps.length > 0) {
    console.log(chalk.white('\n🔄 Next Steps:'));
    response.nextSteps.forEach((step: string, index: number) => {
      console.log(chalk.cyan(`${index + 1}. ${step}`));
    });
  }

  if (response.warnings && response.warnings.length > 0) {
    console.log(chalk.white('\n⚠️  Important Notes:'));
    response.warnings.forEach((warning: string) => {
      console.log(chalk.yellow(`• ${warning}`));
    });
  }

  console.log(chalk.gray(`\n💡 Confidence: ${response.confidence || 85}%`));
  console.log(chalk.gray(`🤖 Agent: ${response.agentName || 'General'}`));
  
  if (response.estimatedCost) {
    console.log(chalk.gray(`💰 Cost: $${response.estimatedCost.toFixed(4)}`));
  }
}

async function saveGeneratedCode(response: any, options: GenerationOptions): Promise<void> {
  if (!response.code) {
    console.log(chalk.yellow('No code to save'));
    return;
  }

  const outputDir = options.output || './generated';
  const projectName = options.project || 'recoder-project';

  await fs.ensureDir(outputDir);

  // Save main code file
  const mainFile = path.join(outputDir, `${projectName}.ts`);
  await fs.writeFile(mainFile, response.code);

  // Save README with instructions
  const readmeContent = `# ${projectName}\n\n${response.explanation}\n\n## Next Steps\n\n${
    response.nextSteps?.map((step: string, i: number) => `${i + 1}. ${step}`).join('\n') || 'No additional steps'
  }\n\n## Generated by Recoder.xyz\n\nThis code was generated using AI agents specialized for production development.\n`;

  await fs.writeFile(path.join(outputDir, 'README.md'), readmeContent);

  console.log(
    boxen(
      chalk.green('✅ Files saved successfully!\n') +
      chalk.gray(`📁 Output directory: ${outputDir}\n`) +
      chalk.gray(`📄 Main file: ${mainFile}\n`) +
      chalk.gray(`📖 README: ${path.join(outputDir, 'README.md')}`),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'green',
      }
    )
  );
}

async function handleInteractiveFollowup(response: any, options: GenerationOptions): Promise<void> {
  console.log(chalk.blue('\n🔄 Interactive Mode'));
  
  const followup = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do next?',
      choices: [
        { name: '✨ Refine the generated code', value: 'refine' },
        { name: '🔒 Run security audit', value: 'security' },
        { name: '🚀 Add deployment configuration', value: 'deploy' },
        { name: '📖 Generate documentation', value: 'docs' },
        { name: '🧪 Add tests', value: 'tests' },
        { name: '✅ I\'m satisfied', value: 'done' }
      ]
    }
  ]);

  if (followup.action === 'done') {
    console.log(chalk.green('🎉 Happy coding with your generated project!'));
    return;
  }

  // Handle follow-up actions
  const followupActions: Record<string, string> = {
    'refine': 'Refine and improve the generated code with better error handling and optimization',
    'security': 'Perform a security audit on the generated code and suggest improvements',
    'deploy': 'Add production deployment configuration with Docker and CI/CD',
    'docs': 'Generate comprehensive documentation for the project',
    'tests': 'Add comprehensive test suite with unit and integration tests'
  };

  const followupRequest = followupActions[followup.action];
  if (followupRequest) {
    console.log(chalk.blue(`\n🔄 Processing: ${followupRequest}`));
    await handleGenerate(followupRequest + '\n\nContext:\n' + response.code, {
      ...options,
      output: options.output + '/followup',
      interactive: false
    });
  }
}

async function startInteractiveMode(): Promise<void> {
  console.log(
    boxen(
      chalk.cyan.bold('🚀 Welcome to Recoder.xyz') + '\n' +
      chalk.white('AI-powered development that generates REAL, production-ready code') + '\n\n' +
      chalk.gray('Examples:') + '\n' +
      chalk.gray('• "Build a Solana DEX with token swapping"') + '\n' +
      chalk.gray('• "Create a React dashboard with real-time data"') + '\n' +
      chalk.gray('• "Build a mobile app with push notifications"'),
      {
        padding: 1,
        borderStyle: 'double',
        borderColor: 'cyan',
      }
    )
  );

  while (true) {
    const { request } = await inquirer.prompt([
      {
        type: 'input',
        name: 'request',
        message: chalk.cyan('What would you like to build?'),
        prefix: '🤖'
      }
    ]);

    if (request.toLowerCase() === 'exit' || request.toLowerCase() === 'quit') {
      console.log(chalk.green('👋 Happy coding!'));
      break;
    }

    if (request.trim()) {
      await handleGenerate(request, { interactive: true });
    }

    const { continue: continueSession } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continue',
        message: 'Start another project?',
        default: true
      }
    ]);

    if (!continueSession) {
      console.log(chalk.green('👋 Happy coding!'));
      break;
    }
  }
}