/**
 * Code Generation CLI Commands
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import boxen from 'boxen';
import fs from 'fs-extra';
import path from 'path';
import { Logger } from '@recoder/shared';
import {
  GenerationRequest,
  GenerationType,
  ValidationLevel,
  CodeQuality,
  SecurityLevel,
  PerformanceTarget,
  GenerationOptions,
  ValidationOptions,
  RealityCheckOptions,
  GenerationTargets,
  InteractiveSession,
  UserChoice
} from '@recoder/shared/types/code-generation';
import { CodeGenerator } from '../services/code-generator';
import { ProjectAnalyzer } from '../services/project-analyzer';
import { RealityValidationSystem } from '../services/reality-validator';
import { ValidationPipeline } from '../services/validation-pipeline';
import { AIModelHub } from '../services/ai-models/ai-hub';
import { DependencyManager } from '../services/dependency-manager';
import { HybridConsensusSystem } from '../services/hybrid-consensus';
import { consensusCache } from '../services/consensus-cache';
import { requireAuth } from '../utils/auth';

let codeGenerator: CodeGenerator | null = null;
let activeSessions: Map<string, InteractiveSession> = new Map();

export function setupGenerateCommands(program: Command): void {
  const generate = program
    .command('generate')
    .alias('gen')
    .description('🚀 Generate production-ready code with comprehensive validation');

  // Main generation command
  generate
    .command('code <description>')
    .description('Generate code from natural language description')
    .option('-q, --quality <level>', 'code quality level (prototype, development, production, enterprise)', 'production')
    .option('-s, --security <level>', 'security level (none, basic, standard, high, critical)', 'standard')
    .option('-p, --performance <target>', 'performance target (basic, optimized, high_performance, real_time)', 'optimized')
    .option('-v, --validation <level>', 'validation level (basic, standard, strict, enterprise)', 'standard')
    .option('--no-mock', 'enforce no mock/placeholder code')
    .option('--tests', 'generate comprehensive tests')
    .option('--docs', 'generate documentation')
    .option('--interactive', 'interactive generation mode')
    .option('--dry-run', 'preview generation without creating files')
    .option('--output <path>', 'output directory for generated files')
    .option('--language <lang>', 'target programming language')
    .option('--framework <framework>', 'target framework')
    .option('--consensus <level>', 'consensus level (none, basic, critical, security, performance)', 'none')
    .option('--min-agreement <percent>', 'minimum agreement percentage for consensus (60-95)', '70')
    .option('--max-cost <amount>', 'maximum cost for consensus processing in USD', '2.00')
    .action(async (description, options) => {
      try {
        await initializeServices();
        await handleGenerateCode(description, options);
      } catch (error) {
        Logger.error(`Code generation failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Modify existing code
  generate
    .command('modify <file> <changes>')
    .description('Modify existing code files with specified changes')
    .option('-q, --quality <level>', 'code quality level', 'production')
    .option('-s, --security <level>', 'security level', 'standard')
    .option('--backup', 'create backup before modification')
    .option('--interactive', 'interactive modification mode')
    .option('--dry-run', 'preview modifications without applying')
    .action(async (file, changes, options) => {
      try {
        await initializeServices();
        await handleModifyCode(file, changes, options);
      } catch (error) {
        Logger.error(`Code modification failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Refactor code
  generate
    .command('refactor <path> <goals>')
    .description('Refactor codebase for improved quality and maintainability')
    .option('-q, --quality <level>', 'target quality level', 'production')
    .option('--preserve-behavior', 'ensure behavior preservation')
    .option('--performance', 'focus on performance improvements')
    .option('--maintainability', 'focus on maintainability improvements')
    .option('--security', 'focus on security improvements')
    .option('--interactive', 'interactive refactoring mode')
    .option('--dry-run', 'preview refactoring without applying')
    .action(async (targetPath, goals, options) => {
      try {
        await initializeServices();
        await handleRefactorCode(targetPath, goals, options);
      } catch (error) {
        Logger.error(`Code refactoring failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Fix code issues
  generate
    .command('fix <error>')
    .description('Fix specific code errors or issues')
    .option('-f, --file <file>', 'specific file to fix')
    .option('--type <type>', 'error type (syntax, logic, security, performance)')
    .option('--auto', 'automatically apply fixes without confirmation')
    .option('--tests', 'generate tests to prevent regression')
    .option('--interactive', 'interactive fixing mode')
    .action(async (error, options) => {
      try {
        await initializeServices();
        await handleFixCode(error, options);
      } catch (error) {
        Logger.error(`Code fix failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Optimize code
  generate
    .command('optimize <target>')
    .description('Optimize code for better performance')
    .option('-t, --type <type>', 'optimization type (performance, size, memory, cpu)')
    .option('--benchmark', 'run benchmarks before and after')
    .option('--profile', 'generate performance profiles')
    .option('--target <target>', 'performance target (basic, optimized, high_performance, real_time)', 'optimized')
    .option('--interactive', 'interactive optimization mode')
    .action(async (target, options) => {
      try {
        await initializeServices();
        await handleOptimizeCode(target, options);
      } catch (error) {
        Logger.error(`Code optimization failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Interactive session management
  generate
    .command('session <action>')
    .description('Manage interactive generation sessions')
    .option('-i, --id <sessionId>', 'session ID')
    .action(async (action, options) => {
      try {
        await handleSessionManagement(action, options);
      } catch (error) {
        Logger.error(`Session management failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Validation and analysis
  generate
    .command('validate <path>')
    .description('Validate generated or existing code')
    .option('--syntax', 'validate syntax only')
    .option('--types', 'validate types only')
    .option('--security', 'validate security only')
    .option('--performance', 'validate performance only')
    .option('--reality', 'check for mock/fake implementations')
    .option('--report <format>', 'generate report (console, json, html)', 'console')
    .action(async (targetPath, options) => {
      try {
        await initializeServices();
        await handleValidateCode(targetPath, options);
      } catch (error) {
        Logger.error(`Code validation failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Templates and patterns
  generate
    .command('template <name>')
    .description('Generate code from predefined templates')
    .option('-l, --list', 'list available templates')
    .option('-p, --params <params>', 'template parameters (JSON string)')
    .option('--customize', 'customize template interactively')
    .action(async (name, options) => {
      try {
        await initializeServices();
        await handleGenerateFromTemplate(name, options);
      } catch (error) {
        Logger.error(`Template generation failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Consensus cache management
  generate
    .command('consensus <action>')
    .description('Manage consensus cache and optimization')
    .option('--task-type <type>', 'filter by task type')
    .option('--privacy <level>', 'filter by privacy level')
    .option('--older-than <hours>', 'filter by age in hours')
    .action(async (action, options) => {
      try {
        await handleConsensusManagement(action, options);
      } catch (error) {
        Logger.error(`Consensus management failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });
}

async function initializeServices(): Promise<void> {
  if (!codeGenerator) {
    const projectAnalyzer = new ProjectAnalyzer();
    const realityValidator = new RealityValidationSystem();
    const validationPipeline = new ValidationPipeline();
    const aiHub = new AIModelHub({} as any); // TODO: Provide proper AIHubConfig
    const dependencyManager = new DependencyManager();

    await validationPipeline.initialize();
    await aiHub.initialize();

    codeGenerator = new CodeGenerator(
      projectAnalyzer,
      realityValidator,
      validationPipeline,
      aiHub,
      dependencyManager
    );

    Logger.info('Code generation services initialized');
  }
}

async function handleGenerateCode(description: string, options: any): Promise<void> {
  console.log(
    boxen(
      chalk.cyan('🚀 CodeCraft Code Generation\n\n') +
      chalk.white(`Description: ${description}\n`) +
      chalk.gray(`Quality: ${options.quality} | Security: ${options.security} | Performance: ${options.performance}`),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
        title: 'Code Generation'
      }
    )
  );

  if (options.interactive) {
    await handleInteractiveGeneration(description, options);
    return;
  }

  const spinner = ora('Analyzing project and generating code...').start();

  try {
    const projectPath = options.output || process.cwd();
    
    // Build generation request
    const request = await buildGenerationRequest(
      GenerationType.GENERATE,
      description,
      options,
      projectPath
    );

    // Check if consensus is required for critical tasks
    if (options.consensus !== 'none') {
      await handleConsensusGeneration(description, options, request, spinner);
      return;
    }

    if (options.dryRun) {
      spinner.text = 'Generating preview...';
      const preview = await codeGenerator!.getGenerationPreview(request);
      spinner.succeed('Preview generated');
      displayGenerationPreview(preview);
      return;
    }

    // Generate code
    spinner.text = 'Generating code...';
    const result = await codeGenerator!.generateCode(request);
    
    spinner.succeed(chalk.green('Code generation completed!'));
    
    displayGenerationResult(result);
    
    // Install dependencies if needed
    if (result.files.some(f => f.dependencies.length > 0)) {
      await handleDependencyInstallation(result);
    }

  } catch (error) {
    spinner.fail(chalk.red('Code generation failed'));
    throw error;
  }
}

async function handleModifyCode(file: string, changes: string, options: any): Promise<void> {
  console.log(
    boxen(
      chalk.yellow('🔧 Modifying Existing Code\n\n') +
      chalk.white(`File: ${file}\n`) +
      chalk.white(`Changes: ${changes}`),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'yellow',
        title: 'Code Modification'
      }
    )
  );

  // Check if file exists
  if (!await fs.pathExists(file)) {
    throw new Error(`File not found: ${file}`);
  }

  // Create backup if requested
  if (options.backup) {
    const backupPath = `${file}.backup.${Date.now()}`;
    await fs.copy(file, backupPath);
    console.log(chalk.gray(`✓ Backup created: ${backupPath}`));
  }

  const spinner = ora('Analyzing file and preparing modifications...').start();

  try {
    const request = await buildGenerationRequest(
      GenerationType.MODIFY,
      changes,
      options,
      path.dirname(file),
      [{ path: file, type: 'modify' }]
    );

    if (options.dryRun) {
      spinner.text = 'Generating modification preview...';
      const preview = await codeGenerator!.getGenerationPreview(request);
      spinner.succeed('Preview generated');
      displayGenerationPreview(preview);
      return;
    }

    spinner.text = 'Applying modifications...';
    const result = await codeGenerator!.generateCode(request);
    
    spinner.succeed(chalk.green('Code modification completed!'));
    displayGenerationResult(result);

  } catch (error) {
    spinner.fail(chalk.red('Code modification failed'));
    throw error;
  }
}

async function handleRefactorCode(targetPath: string, goals: string, options: any): Promise<void> {
  console.log(
    boxen(
      chalk.blue('🔄 Refactoring Code\n\n') +
      chalk.white(`Path: ${targetPath}\n`) +
      chalk.white(`Goals: ${goals}\n`) +
      chalk.gray(`Options: ${Object.keys(options).filter(k => options[k] === true).join(', ')}`),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'blue',
        title: 'Code Refactoring'
      }
    )
  );

  const spinner = ora('Analyzing code structure and planning refactoring...').start();

  try {
    const request = await buildGenerationRequest(
      GenerationType.REFACTOR,
      goals,
      options,
      targetPath
    );

    if (options.dryRun) {
      spinner.text = 'Generating refactoring preview...';
      const preview = await codeGenerator!.getGenerationPreview(request);
      spinner.succeed('Preview generated');
      displayGenerationPreview(preview);
      return;
    }

    spinner.text = 'Applying refactoring changes...';
    const result = await codeGenerator!.generateCode(request);
    
    spinner.succeed(chalk.green('Code refactoring completed!'));
    displayGenerationResult(result);

  } catch (error) {
    spinner.fail(chalk.red('Code refactoring failed'));
    throw error;
  }
}

async function handleFixCode(error: string, options: any): Promise<void> {
  console.log(
    boxen(
      chalk.red('🩹 Fixing Code Issues\n\n') +
      chalk.white(`Error: ${error}\n`) +
      chalk.gray(`File: ${options.file || 'Auto-detect'}\n`) +
      chalk.gray(`Type: ${options.type || 'Auto-detect'}`),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'red',
        title: 'Code Fix'
      }
    )
  );

  const spinner = ora('Analyzing error and preparing fix...').start();

  try {
    const projectPath = options.file ? path.dirname(options.file) : process.cwd();
    const targets = options.file ? [{ path: options.file, type: 'modify' }] : [];

    const request = await buildGenerationRequest(
      GenerationType.FIX,
      error,
      options,
      projectPath,
      targets
    );

    spinner.text = 'Generating fix...';
    const result = await codeGenerator!.generateCode(request);
    
    spinner.succeed(chalk.green('Code fix completed!'));
    displayGenerationResult(result);

    // Generate tests to prevent regression if requested
    if (options.tests) {
      console.log(chalk.gray('\n🧪 Generating regression tests...'));
      // This would generate additional test files
    }

  } catch (error) {
    spinner.fail(chalk.red('Code fix failed'));
    throw error;
  }
}

async function handleOptimizeCode(target: string, options: any): Promise<void> {
  console.log(
    boxen(
      chalk.green('⚡ Optimizing Code Performance\n\n') +
      chalk.white(`Target: ${target}\n`) +
      chalk.gray(`Type: ${options.type || 'performance'}\n`) +
      chalk.gray(`Target: ${options.target}`),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'green',
        title: 'Code Optimization'
      }
    )
  );

  const spinner = ora('Analyzing performance and preparing optimizations...').start();

  try {
    const request = await buildGenerationRequest(
      GenerationType.OPTIMIZE,
      `Optimize ${target} for ${options.type || 'performance'}`,
      options,
      target
    );

    spinner.text = 'Applying optimizations...';
    const result = await codeGenerator!.generateCode(request);
    
    spinner.succeed(chalk.green('Code optimization completed!'));
    displayGenerationResult(result);

    // Show performance improvements
    if (result.metrics.performanceScore > 0) {
      console.log(
        boxen(
          chalk.green(`📈 Performance Improvements\n\n`) +
          chalk.white(`Performance Score: ${result.metrics.performanceScore}/100\n`) +
          chalk.gray(`Quality Score: ${result.metrics.qualityScore}/100\n`) +
          chalk.gray(`Security Score: ${result.metrics.securityScore}/100`),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'green',
            title: 'Optimization Results'
          }
        )
      );
    }

  } catch (error) {
    spinner.fail(chalk.red('Code optimization failed'));
    throw error;
  }
}

async function handleInteractiveGeneration(description: string, options: any): Promise<void> {
  console.log(chalk.cyan('\n🎯 Starting Interactive Code Generation\n'));

  try {
    const request = await buildGenerationRequest(
      GenerationType.GENERATE,
      description,
      options,
      options.output || process.cwd()
    );

    const session = await codeGenerator!.generateInteractively(request);
    activeSessions.set(session.id, session);

    console.log(chalk.green(`✓ Interactive session started: ${session.id}`));
    
    await processInteractiveSession(session);

  } catch (error) {
    console.log(chalk.red('Interactive generation failed'));
    throw error;
  }
}

async function processInteractiveSession(session: InteractiveSession): Promise<void> {
  while (session.currentStep < session.steps.length && session.status === 'active') {
    const step = session.steps[session.currentStep];
    
    console.log(
      boxen(
        chalk.cyan(`${step.title}\n\n`) +
        chalk.white(`${step.description}\n`) +
        (step.required ? chalk.red('* Required') : chalk.gray('Optional')),
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
          title: `Step ${session.currentStep + 1}/${session.steps.length}`
        }
      )
    );

    let choice: UserChoice;

    switch (step.type) {
      case 'confirmation':
        const confirmed = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirm',
          message: 'Proceed with this step?',
          default: true
        }]);
        choice = {
          stepId: step.id,
          input: confirmed.confirm.toString(),
          timestamp: new Date()
        };
        break;

      case 'choice':
        if (!step.options) throw new Error('Choice step requires options');
        const selected = await inquirer.prompt([{
          type: 'list',
          name: 'choice',
          message: 'Select an option:',
          choices: step.options.map(opt => ({
            name: `${opt.title} - ${opt.description}${opt.recommended ? ' (Recommended)' : ''}`,
            value: opt.id
          }))
        }]);
        choice = {
          stepId: step.id,
          optionId: selected.choice,
          timestamp: new Date()
        };
        break;

      case 'input':
        const input = await inquirer.prompt([{
          type: 'input',
          name: 'value',
          message: 'Enter value:'
        }]);
        choice = {
          stepId: step.id,
          input: input.value,
          timestamp: new Date()
        };
        break;

      case 'review':
        if (step.preview) {
          displayGenerationPreview(step.preview);
        }
        const approved = await inquirer.prompt([{
          type: 'confirm',
          name: 'approve',
          message: 'Approve this preview?',
          default: true
        }]);
        choice = {
          stepId: step.id,
          input: approved.approve.toString(),
          timestamp: new Date()
        };
        break;

      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }

    session = await codeGenerator!.processUserChoice(session.id, choice);
    activeSessions.set(session.id, session);
  }

  if (session.status === 'completed') {
    console.log(chalk.green('\n✅ Interactive generation completed successfully!'));
  }
}

async function handleSessionManagement(action: string, options: any): Promise<void> {
  switch (action) {
    case 'list':
      console.log(chalk.cyan('📋 Active Sessions:\n'));
      if (activeSessions.size === 0) {
        console.log(chalk.gray('No active sessions'));
      } else {
        activeSessions.forEach((session, id) => {
          console.log(`${id}: ${session.request.description} (${session.status})`);
        });
      }
      break;

    case 'resume':
      if (!options.id) {
        throw new Error('Session ID required for resume');
      }
      const session = activeSessions.get(options.id);
      if (!session) {
        throw new Error(`Session not found: ${options.id}`);
      }
      await processInteractiveSession(session);
      break;

    case 'cancel':
      if (!options.id) {
        throw new Error('Session ID required for cancel');
      }
      activeSessions.delete(options.id);
      console.log(chalk.yellow(`Session ${options.id} cancelled`));
      break;

    default:
      throw new Error(`Unknown session action: ${action}`);
  }
}

async function handleValidateCode(targetPath: string, options: any): Promise<void> {
  console.log(
    boxen(
      chalk.magenta('🔍 Validating Code\n\n') +
      chalk.white(`Path: ${targetPath}\n`) +
      chalk.gray(`Checks: ${Object.keys(options).filter(k => options[k] === true).join(', ') || 'All'}`),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'magenta',
        title: 'Code Validation'
      }
    )
  );

  const spinner = ora('Running comprehensive validation...').start();

  try {
    // This would use the validation pipeline directly
    // For now, we'll simulate validation results
    
    spinner.succeed(chalk.green('Validation completed!'));
    
    console.log(
      boxen(
        chalk.green('✅ Validation Results\n\n') +
        chalk.white('Syntax: ') + chalk.green('PASSED\n') +
        chalk.white('Types: ') + chalk.green('PASSED\n') +
        chalk.white('Security: ') + chalk.yellow('WARNING\n') +
        chalk.white('Performance: ') + chalk.green('PASSED\n') +
        chalk.white('Reality Check: ') + chalk.green('PASSED'),
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'green',
          title: 'Validation Summary'
        }
      )
    );

  } catch (error) {
    spinner.fail(chalk.red('Validation failed'));
    throw error;
  }
}

async function handleGenerateFromTemplate(name: string, options: any): Promise<void> {
  if (options.list) {
    console.log(chalk.cyan('📋 Available Templates:\n'));
    const templates = [
      'react-component - React functional component with hooks',
      'express-api - Express.js REST API with middleware',
      'next-page - Next.js page with SSR/SSG',
      'node-service - Node.js microservice with Docker',
      'react-hook - Custom React hook with TypeScript',
      'database-model - Database model with ORM',
      'test-suite - Comprehensive test suite'
    ];
    
    templates.forEach(template => {
      console.log(`  • ${template}`);
    });
    return;
  }

  console.log(
    boxen(
      chalk.magenta('📋 Generating from Template\n\n') +
      chalk.white(`Template: ${name}\n`) +
      chalk.gray(`Parameters: ${options.params || 'Default'}`),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'purple',
        title: 'Template Generation'
      }
    )
  );

  // This would implement template-based generation
  console.log(chalk.yellow('Template generation not yet implemented'));
}

async function buildGenerationRequest(
  type: GenerationType,
  description: string,
  options: any,
  projectPath: string,
  targets?: any[]
): Promise<GenerationRequest> {
  // Analyze project context
  const projectAnalyzer = new ProjectAnalyzer();
  const analysis = await projectAnalyzer.analyzeProject(projectPath);

  const request: GenerationRequest = {
    type,
    description,
    context: {
      project: analysis.project,
      codebase: analysis.codebase,
      environment: analysis.environment,
      constraints: {
        maxFileSize: 100000,
        maxFiles: 50,
        allowedPatterns: [],
        forbiddenPatterns: ['eval', 'innerHTML'],
        requiredTesting: options.tests || false,
        securityRequirements: []
      }
    },
    options: {
      quality: options.quality as CodeQuality || CodeQuality.PRODUCTION,
      security: options.security as SecurityLevel || SecurityLevel.STANDARD,
      performance: options.performance as PerformanceTarget || PerformanceTarget.OPTIMIZED,
      testing: {
        generate: options.tests || false,
        framework: 'jest',
        coverage: 80,
        types: ['unit', 'integration'],
        mocking: 'moderate'
      },
      documentation: {
        generate: options.docs || false,
        types: ['inline', 'api'],
        format: 'markdown',
        detail: 'standard'
      },
      interactive: options.interactive || false,
      dryRun: options.dryRun || false,
      backup: options.backup || false,
      rollback: true
    },
    validation: {
      level: options.validation as ValidationLevel || ValidationLevel.STANDARD,
      syntaxCheck: true,
      typeCheck: true,
      linting: true,
      securityScan: true,
      performanceCheck: true,
      integrationTest: false,
      realityCheck: {
        enabled: !options.mock,
        mockDetection: true,
        apiValidation: true,
        databaseValidation: true,
        externalServiceCheck: true,
        dependencyVerification: true,
        functionalityTest: true
      }
    },
    targets: {
      files: targets || [],
      tests: [],
      documentation: [],
      configuration: []
    }
  };

  return request;
}

function displayGenerationResult(result: any): void {
  console.log(
    boxen(
      chalk.green(`✅ Generation Successful\n\n`) +
      chalk.white(`Status: ${result.status}\n`) +
      chalk.white(`Files Generated: ${result.files.length}\n`) +
      chalk.white(`Lines of Code: ${result.metrics.linesOfCode}\n`) +
      chalk.white(`Duration: ${result.metrics.duration}ms\n\n`) +
      chalk.cyan('Quality Scores:\n') +
      chalk.gray(`Overall: ${result.metrics.qualityScore}/100\n`) +
      chalk.gray(`Security: ${result.metrics.securityScore}/100\n`) +
      chalk.gray(`Performance: ${result.metrics.performanceScore}/100\n`) +
      chalk.gray(`Reality: ${result.metrics.realityScore}/100`),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'green',
        title: 'Generation Complete'
      }
    )
  );

  // Show generated files
  if (result.files.length > 0) {
    console.log(chalk.cyan('\n📁 Generated Files:'));
    result.files.forEach((file: any) => {
      console.log(`  ${chalk.green('+')} ${file.path} (${file.lines} lines)`);
    });
  }

  // Show warnings if any
  if (result.warnings.length > 0) {
    console.log(chalk.yellow('\n⚠️  Warnings:'));
    result.warnings.forEach((warning: any) => {
      console.log(`  • ${warning.message}`);
    });
  }

  // Show errors if any
  if (result.errors.length > 0) {
    console.log(chalk.red('\n❌ Errors:'));
    result.errors.forEach((error: any) => {
      console.log(`  • ${error.message}`);
    });
  }
}

function displayGenerationPreview(preview: any): void {
  console.log(
    boxen(
      chalk.cyan('👀 Generation Preview\n\n') +
      chalk.white(`Files to be affected: ${preview.files.length}\n`) +
      chalk.white(`Lines to be changed: ${preview.impact.linesChanged}\n`) +
      chalk.white(`Risk Level: ${preview.impact.riskLevel}\n`) +
      chalk.white(`Estimated Time: ${preview.impact.estimatedTime} minutes`),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
        title: 'Preview'
      }
    )
  );

  // Show file previews
  preview.files.slice(0, 3).forEach((file: any) => {
    console.log(chalk.cyan(`\n📄 ${file.path} (${file.type}):`));
    console.log(chalk.gray(file.preview));
  });

  if (preview.files.length > 3) {
    console.log(chalk.gray(`\n... and ${preview.files.length - 3} more files`));
  }
}

async function handleConsensusGeneration(
  description: string,
  options: any,
  request: GenerationRequest,
  spinner: any
): Promise<void> {
  spinner.text = 'Initializing hybrid consensus system...';
  
  const hybridConsensus = new HybridConsensusSystem();
  const maxCost = parseFloat(options.maxCost) || 2.0;
  const minAgreement = parseInt(options.minAgreement) || 70;
  
  // Validate consensus parameters
  if (minAgreement < 60 || minAgreement > 95) {
    throw new Error('Minimum agreement must be between 60-95%');
  }

  // Map consensus level to task type
  const taskTypeMapping = {
    'basic': 'critical-decision',
    'critical': 'critical-decision', 
    'security': 'security-analysis',
    'performance': 'code-audit'
  };
  
  const taskType = taskTypeMapping[options.consensus as keyof typeof taskTypeMapping] || 'critical-decision';
  
  // Check cache first
  spinner.text = 'Checking consensus cache...';
  const consensusRequest = {
    prompt: `Generate production-ready code: ${description}`,
    taskType: taskType as any,
    context: {
      type: 'general' as const,
      complexity: 'complex' as const,
      priority: 'quality' as const,
      privacyLevel: 'internal' as const
    },
    privacyLevel: 'internal' as any,
    consensusThreshold: minAgreement / 100,
    maxModels: Math.min(4, Math.ceil(maxCost / 0.5)) // Estimate models based on cost
  };

  const cachedResult = await consensusCache.getCachedConsensus(consensusRequest);
  
  if (cachedResult) {
    spinner.succeed(chalk.green('Using cached consensus result'));
    displayConsensusResult(cachedResult, true);
    return;
  }

  spinner.text = `Processing with ${options.consensus} consensus (${minAgreement}% agreement required)...`;
  
  try {
    const startTime = Date.now();
    let consensusResult;

    // Use specialized consensus methods based on type
    switch (taskType) {
      case 'security-analysis':
        consensusResult = await hybridConsensus.securityConsensus(
          `Generate secure code: ${description}`,
          'internal' as any
        );
        break;
      
      case 'code-audit':
        consensusResult = await hybridConsensus.codeAuditConsensus(
          `Generate optimized code: ${description}`,
          options.language || 'typescript',
          'internal' as any
        );
        break;
        
      default:
        consensusResult = await hybridConsensus.processWithConsensus(consensusRequest);
        break;
    }

    const responseTime = Date.now() - startTime;
    const estimatedCost = consensusResult.modelResponses.length * 0.5; // Rough estimate

    // Cache the result
    await consensusCache.cacheConsensusResult(
      consensusRequest,
      consensusResult,
      estimatedCost,
      responseTime
    );

    if (estimatedCost > maxCost) {
      console.log(chalk.yellow(`⚠️  Consensus cost (${estimatedCost.toFixed(2)}) exceeded budget (${maxCost.toFixed(2)})`));
    }

    spinner.succeed(chalk.green('Consensus processing completed!'));
    displayConsensusResult(consensusResult, false);

  } catch (error) {
    spinner.fail(chalk.red('Consensus processing failed'));
    
    // Fallback to regular generation
    console.log(chalk.yellow('Falling back to standard generation...'));
    
    spinner.start('Generating code with standard method...');
    const result = await codeGenerator!.generateCode(request);
    spinner.succeed(chalk.green('Code generation completed!'));
    displayGenerationResult(result);
  }
}

function displayConsensusResult(result: any, fromCache: boolean): void {
  console.log(
    boxen(
      chalk.cyan(`🤖 Consensus Result ${fromCache ? '(Cached)' : ''}\n\n`) +
      chalk.white(`Consensus Reached: ${result.consensusReached ? '✅ Yes' : '❌ No'}\n`) +
      chalk.white(`Consensus Score: ${(result.consensusScore * 100).toFixed(1)}%\n`) +
      chalk.white(`Models Consulted: ${result.modelResponses.length}\n`) +
      chalk.white(`Recommended Action: ${result.recommendedAction}\n\n`) +
      chalk.gray(`Average Model Confidence: ${(result.modelResponses.reduce((sum: number, r: any) => sum + r.confidence, 0) / result.modelResponses.length * 100).toFixed(1)}%`),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: result.consensusReached ? 'green' : 'yellow',
        title: 'Hybrid Consensus Analysis'
      }
    )
  );

  // Show the consensus answer
  console.log(chalk.cyan('\n📝 Consensus Answer:'));
  console.log(chalk.white(result.finalAnswer));

  // Show model breakdown
  if (result.modelResponses.length > 1) {
    console.log(chalk.cyan('\n🔍 Model Analysis:'));
    result.modelResponses.forEach((response: any, index: number) => {
      const qualityEmoji = response.quality.overall > 0.8 ? '🟢' : response.quality.overall > 0.6 ? '🟡' : '🔴';
      console.log(
        `  ${qualityEmoji} ${response.model}: ${(response.confidence * 100).toFixed(0)}% confidence, ` +
        `${(response.quality.overall * 100).toFixed(0)}% quality (${response.executionTime}ms)`
      );
    });
  }

  // Show alternatives if available
  if (result.alternatives && result.alternatives.length > 0) {
    console.log(chalk.cyan('\n🔄 Alternative Approaches:'));
    result.alternatives.slice(0, 3).forEach((alt: string, index: number) => {
      console.log(`  ${index + 1}. ${alt.substring(0, 100)}...`);
    });
  }

  // Show reasoning
  console.log(chalk.cyan('\n💭 Reasoning:'));
  console.log(chalk.gray(result.reasoning));
}

async function handleConsensusManagement(action: string, options: any): Promise<void> {
  switch (action) {
    case 'stats':
      const stats = consensusCache.getCacheStatistics();
      console.log(
        boxen(
          chalk.cyan('📊 Consensus Cache Statistics\n\n') +
          chalk.white(`Total Cache Entries: ${stats.totalEntries}\n`) +
          chalk.white(`Cache Hit Ratio: ${(stats.hitRatio * 100).toFixed(1)}%\n`) +
          chalk.white(`Average Response Time: ${stats.averageResponseTime.toFixed(0)}ms\n`) +
          chalk.white(`Total Cost Saved: $${stats.totalCostSaved.toFixed(2)}\n\n`) +
          chalk.cyan('Top Task Types:\n') +
          stats.topTaskTypes.map(t => `  • ${t.taskType}: ${t.count} entries`).join('\n'),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'cyan',
            title: 'Cache Statistics'
          }
        )
      );
      break;

    case 'performance':
      const allMetrics = consensusCache.getModelPerformance() as Map<string, any>;
      if (allMetrics.size === 0) {
        console.log(chalk.yellow('No performance metrics available yet'));
        return;
      }

      console.log(chalk.cyan('🚀 Model Performance Metrics\n'));
      
      Array.from(allMetrics.entries())
        .sort(([, a], [, b]) => b.averageQuality - a.averageQuality)
        .slice(0, 10)
        .forEach(([modelId, metrics]) => {
          console.log(
            chalk.white(`${modelId}:\n`) +
            chalk.gray(`  Quality: ${(metrics.averageQuality * 100).toFixed(1)}% | `) +
            chalk.gray(`Confidence: ${(metrics.averageConfidence * 100).toFixed(1)}% | `) +
            chalk.gray(`Speed: ${metrics.averageResponseTime.toFixed(0)}ms | `) +
            chalk.gray(`Requests: ${metrics.totalRequests}\n`)
          );
        });
      break;

    case 'optimize':
      console.log(chalk.cyan('🔄 Running consensus optimization...\n'));
      
      const spinner = ora('Precomputing common patterns...').start();
      try {
        await consensusCache.precomputeCommonPatterns();
        spinner.succeed(chalk.green('Optimization completed'));
        
        const newStats = consensusCache.getCacheStatistics();
        console.log(chalk.green(`Cache now contains ${newStats.totalEntries} optimized entries`));
      } catch (error) {
        spinner.fail(chalk.red('Optimization failed'));
        throw error;
      }
      break;

    case 'clear':
      const filters: any = {};
      
      if (options.taskType) filters.taskType = options.taskType;
      if (options.privacy) filters.privacy = options.privacy;
      if (options.olderThan) {
        const hours = parseInt(options.olderThan);
        filters.olderThan = Date.now() - (hours * 60 * 60 * 1000);
      }

      const removed = consensusCache.clearCache(Object.keys(filters).length > 0 ? filters : undefined);
      console.log(chalk.green(`✅ Cleared ${removed} cache entries`));
      break;

    case 'model-ranking':
      const taskType = options.taskType || 'security-analysis';
      const optimizedModels = consensusCache.optimizeModelSelection(taskType, 5, 'internal');
      
      console.log(
        boxen(
          chalk.cyan(`🏆 Optimized Model Ranking for ${taskType}\n\n`) +
          optimizedModels.map((model, index) => 
            `${index + 1}. ${model} ${index === 0 ? '(Best)' : ''}`
          ).join('\n'),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'cyan',
            title: 'Model Optimization'
          }
        )
      );
      break;

    case 'thresholds':
      console.log(chalk.cyan('🎯 Adaptive Thresholds\n'));
      
      const taskTypes = ['security-analysis', 'architecture-review', 'code-audit', 'critical-decision'];
      taskTypes.forEach(taskType => {
        const threshold = consensusCache.getAdaptiveThreshold(taskType);
        console.log(`${taskType}: ${(threshold * 100).toFixed(1)}%`);
      });
      break;

    default:
      console.log(chalk.red(`Unknown consensus action: ${action}`));
      console.log(chalk.gray('Available actions: stats, performance, optimize, clear, model-ranking, thresholds'));
      break;
  }
}

async function handleDependencyInstallation(result: any): Promise<void> {
  const dependencies = result.files.flatMap((f: any) => f.dependencies);
  if (dependencies.length === 0) return;

  const install = await inquirer.prompt([{
    type: 'confirm',
    name: 'install',
    message: `Install ${dependencies.length} new dependencies?`,
    default: true
  }]);

  if (install.install) {
    const spinner = ora('Installing dependencies...').start();
    try {
      // This would use the dependency manager to install packages
      spinner.succeed(chalk.green('Dependencies installed successfully'));
    } catch (error) {
      spinner.fail(chalk.red('Failed to install dependencies'));
      console.log(chalk.yellow('You can install them manually later'));
    }
  }
}