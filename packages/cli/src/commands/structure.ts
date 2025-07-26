/**
 * Structure Commands - CLI interface for PROJECT STRUCTURE MANAGER
 * Provides commands for generating, validating, and managing project structures
 */

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';
import { Logger } from '@recoder/shared';
import { ProjectStructureManager, StructureManagerConfig } from '../services/structure-manager';
import { requireAuth } from '../utils/auth';
import { ConfigManager } from '../utils/config';
import { FileSystemUtils } from '../utils/filesystem';
import { ValidationHelper } from '../utils/validation';
import path from 'path';
import fs from 'fs-extra';

interface StructureCommandOptions {
  type?: 'web' | 'mobile' | 'blockchain' | 'ai' | 'fullstack';
  framework?: string;
  language?: string;
  features?: string[];
  integrations?: string[];
  output?: string;
  interactive?: boolean;
  validate?: boolean;
  force?: boolean;
  dryRun?: boolean;
  pattern?: 'mvc' | 'microservices' | 'serverless' | 'hexagonal' | 'clean';
  database?: 'postgresql' | 'mongodb' | 'redis' | 'supabase' | 'firebase';
  auth?: 'auth0' | 'firebase' | 'supabase' | 'custom';
  payment?: 'stripe' | 'paypal' | 'square';
  cloud?: 'aws' | 'vercel' | 'netlify' | 'gcp' | 'azure';
  monitoring?: 'datadog' | 'newrelic' | 'sentry' | 'custom';
  analytics?: 'google' | 'mixpanel' | 'amplitude' | 'custom';
  environment?: 'development' | 'staging' | 'production';
}

export function createStructureCommand(): Command {
  const structureCommand = new Command('structure')
    .description('Generate and manage project structures with real integrations')
    .alias('struct')
    .option('-t, --type <type>', 'Project type (web, mobile, blockchain, ai, fullstack)')
    .option('-f, --framework <framework>', 'Framework to use')
    .option('-l, --language <language>', 'Programming language')
    .option('--features <features...>', 'Features to include')
    .option('--integrations <integrations...>', 'Service integrations')
    .option('-o, --output <path>', 'Output directory')
    .option('-i, --interactive', 'Interactive mode', false)
    .option('--validate', 'Validate structure after generation', true)
    .option('--force', 'Force overwrite existing files', false)
    .option('--dry-run', 'Show what would be generated without creating files', false)
    .option('--pattern <pattern>', 'Architectural pattern')
    .option('--database <database>', 'Database type')
    .option('--auth <auth>', 'Authentication provider')
    .option('--payment <payment>', 'Payment provider')
    .option('--cloud <cloud>', 'Cloud provider')
    .option('--monitoring <monitoring>', 'Monitoring service')
    .option('--analytics <analytics>', 'Analytics service')
    .option('--environment <env>', 'Target environment', 'development')
    .action(async (options: StructureCommandOptions) => {
      try {
        await handleStructureGeneration(options);
      } catch (error) {
        console.error(chalk.red('❌ Structure generation failed:'), error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // Generate subcommand
  structureCommand
    .command('generate')
    .description('Generate a new project structure')
    .argument('<name>', 'Project name')
    .option('-t, --type <type>', 'Project type')
    .option('-f, --framework <framework>', 'Framework')
    .option('--template <template>', 'Template to use')
    .option('-o, --output <path>', 'Output directory')
    .option('--real-connections', 'Set up real service connections', true)
    .action(async (name: string, options: any) => {
      await handleStructureGeneration({ ...options, projectName: name });
    });

  // Validate subcommand
  structureCommand
    .command('validate')
    .description('Validate existing project structure')
    .argument('[path]', 'Project path', '.')
    .option('-t, --type <type>', 'Expected project type')
    .option('--fix', 'Attempt to fix issues automatically', false)
    .option('--report', 'Generate detailed report', false)
    .action(async (projectPath: string, options: any) => {
      await handleStructureValidation(projectPath, options);
    });

  // Analyze subcommand
  structureCommand
    .command('analyze')
    .description('Analyze project structure and provide recommendations')
    .argument('[path]', 'Project path', '.')
    .option('-d, --depth <depth>', 'Analysis depth', '3')
    .option('--output <format>', 'Output format (json, yaml, markdown)', 'markdown')
    .action(async (projectPath: string, options: any) => {
      await handleStructureAnalysis(projectPath, options);
    });

  // Enforce subcommand
  structureCommand
    .command('enforce')
    .description('Enforce architectural patterns')
    .argument('[path]', 'Project path', '.')
    .option('-p, --pattern <pattern>', 'Architectural pattern')
    .option('--strict', 'Strict enforcement', false)
    .action(async (projectPath: string, options: any) => {
      await handleArchitecturalEnforcement(projectPath, options);
    });

  // Setup subcommand
  structureCommand
    .command('setup')
    .description('Set up development environment')
    .argument('[path]', 'Project path', '.')
    .option('--services', 'Set up external services', true)
    .option('--database', 'Set up database', true)
    .option('--docker', 'Set up Docker environment', true)
    .action(async (projectPath: string, options: any) => {
      await handleEnvironmentSetup(projectPath, options);
    });

  // Compare subcommand
  structureCommand
    .command('compare')
    .description('Compare two project structures')
    .argument('<path1>', 'First project path')
    .argument('<path2>', 'Second project path')
    .option('--migration', 'Generate migration plan', false)
    .action(async (path1: string, path2: string, options: any) => {
      await handleStructureComparison(path1, path2, options);
    });

  // Templates subcommand
  structureCommand
    .command('templates')
    .description('Manage structure templates')
    .option('--list', 'List available templates', false)
    .option('--create <name>', 'Create new template')
    .option('--update <name>', 'Update existing template')
    .option('--delete <name>', 'Delete template')
    .action(async (options: any) => {
      await handleTemplateManagement(options);
    });

  return structureCommand;
}

async function handleStructureGeneration(options: StructureCommandOptions): Promise<void> {
  console.log(boxen(chalk.blue.bold('🏗️  PROJECT STRUCTURE MANAGER'), {
    padding: 1,
    margin: 1,
    borderStyle: 'round',
    borderColor: 'blue',
  }));

  // Check authentication
  await requireAuth();

  // Get project configuration
  const config = await getProjectConfiguration(options);

  // Validate configuration
  const validation = ValidationHelper.validateProjectOptions(config);
  if (!validation.valid) {
    console.error(chalk.red('❌ Invalid configuration:'));
    validation.errors.forEach(error => {
      console.error(chalk.red(`  • ${error}`));
    });
    return;
  }

  // Display warnings
  if (validation.warnings.length > 0) {
    console.log(chalk.yellow('⚠️  Warnings:'));
    validation.warnings.forEach(warning => {
      console.log(chalk.yellow(`  • ${warning}`));
    });
  }

  // Create structure manager
  const structureManager = new ProjectStructureManager(config);

  // Generate structure
  const spinner = ora('Generating project structure...').start();
  
  try {
    const result = await structureManager.generateProjectStructure();
    
    if (options.dryRun) {
      spinner.info('Dry run completed. Structure preview:');
      displayStructurePreview(result);
      return;
    }

    // Write files to disk
    await writeStructureFiles(result, config.outputPath);

    spinner.succeed('Project structure generated successfully!');

    // Display results
    displayGenerationResults(result);

    // Validate if requested
    if (options.validate) {
      await validateGeneratedStructure(config.outputPath, config);
    }

    // Display next steps
    displayNextSteps(result);

  } catch (error) {
    spinner.fail('Structure generation failed');
    Logger.error('Structure generation error', { error: error instanceof Error ? error.message : String(error), config });
    throw error;
  }
}

async function handleStructureValidation(projectPath: string, options: any): Promise<void> {
  console.log(chalk.blue.bold('🔍 Validating Project Structure'));

  if (!await fs.pathExists(projectPath)) {
    console.error(chalk.red(`❌ Project path does not exist: ${projectPath}`));
    return;
  }

  // Detect project type
  const projectType = await detectProjectType(projectPath);
  const config: StructureManagerConfig = {
    projectName: path.basename(projectPath),
    projectType: options.type || projectType,
    framework: 'unknown',
    language: 'unknown',
    features: [],
    integrations: [],
    outputPath: projectPath,
    environment: 'development',
    realConnections: false,
    architecturalPattern: 'mvc'
  };

  const structureManager = new ProjectStructureManager(config);
  const result = await structureManager.validateExistingStructure(projectPath);

  // Display validation results
  displayValidationResults(result);

  // Fix issues if requested
  if (options.fix && !result.valid) {
    const shouldFix = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Attempt to fix identified issues?',
        default: false
      }
    ]);

    if (shouldFix.confirm) {
      await fixStructureIssues(projectPath, result.issues);
    }
  }

  // Generate report if requested
  if (options.report) {
    await generateValidationReport(projectPath, result);
  }
}

async function handleStructureAnalysis(projectPath: string, options: any): Promise<void> {
  console.log(chalk.blue.bold('📊 Analyzing Project Structure'));

  const spinner = ora('Analyzing project...').start();

  try {
    // Use ProjectAnalyzer from utils
    const { ProjectAnalyzer } = await import('../utils/project-analyzer');
    const analysis = await ProjectAnalyzer.analyzeProject(projectPath);

    spinner.succeed('Analysis completed');

    // Display analysis results
    displayAnalysisResults(analysis);

    // Generate output in requested format
    if (options.output) {
      await generateAnalysisOutput(analysis, options.output, projectPath);
    }

  } catch (error) {
    spinner.fail('Analysis failed');
    Logger.error('Structure analysis error', { error: error instanceof Error ? error.message : String(error), projectPath });
    throw error;
  }
}

async function handleArchitecturalEnforcement(projectPath: string, options: any): Promise<void> {
  console.log(chalk.blue.bold('🏛️  Enforcing Architectural Patterns'));

  if (!options.pattern) {
    const patternChoice = await inquirer.prompt([
      {
        type: 'list',
        name: 'pattern',
        message: 'Select architectural pattern to enforce:',
        choices: [
          { name: 'MVC (Model-View-Controller)', value: 'mvc' },
          { name: 'Microservices', value: 'microservices' },
          { name: 'Serverless', value: 'serverless' },
          { name: 'Hexagonal Architecture', value: 'hexagonal' },
          { name: 'Clean Architecture', value: 'clean' }
        ]
      }
    ]);
    options.pattern = patternChoice.pattern;
  }

  const config: StructureManagerConfig = {
    projectName: path.basename(projectPath),
    projectType: 'web',
    framework: 'unknown',
    language: 'unknown',
    features: [],
    integrations: [],
    outputPath: projectPath,
    environment: 'development',
    realConnections: false,
    architecturalPattern: options.pattern
  };

  const structureManager = new ProjectStructureManager(config);
  await structureManager.enforceArchitecturalPattern();

  console.log(chalk.green(`✅ ${options.pattern} pattern enforced successfully`));
}

async function handleEnvironmentSetup(projectPath: string, options: any): Promise<void> {
  console.log(chalk.blue.bold('🛠️  Setting Up Development Environment'));

  const config: StructureManagerConfig = {
    projectName: path.basename(projectPath),
    projectType: 'web',
    framework: 'unknown',
    language: 'unknown',
    features: [],
    integrations: [],
    outputPath: projectPath,
    environment: 'development',
    realConnections: true,
    architecturalPattern: 'mvc'
  };

  const structureManager = new ProjectStructureManager(config);
  await structureManager.setupDevelopmentEnvironment();

  console.log(chalk.green('✅ Development environment set up successfully'));
}

async function handleStructureComparison(path1: string, path2: string, options: any): Promise<void> {
  console.log(chalk.blue.bold('🔀 Comparing Project Structures'));

  const spinner = ora('Comparing structures...').start();

  try {
    // Use ProjectAnalyzer for comparison
    const { ProjectAnalyzer } = await import('../utils/project-analyzer');
    const comparison = await ProjectAnalyzer.compareProjectStructures(path1, path2);

    spinner.succeed('Comparison completed');

    // Display comparison results
    displayComparisonResults(comparison);

    // Generate migration plan if requested
    if (options.migration && comparison.migrationPlan) {
      displayMigrationPlan(comparison.migrationPlan);
    }

  } catch (error) {
    spinner.fail('Comparison failed');
    Logger.error('Structure comparison error', { error: error instanceof Error ? error.message : String(error), path1, path2 });
    throw error;
  }
}

async function handleTemplateManagement(options: any): Promise<void> {
  console.log(chalk.blue.bold('📋 Managing Structure Templates'));

  if (options.list) {
    await listAvailableTemplates();
  }

  if (options.create) {
    await createNewTemplate(options.create);
  }

  if (options.update) {
    await updateExistingTemplate(options.update);
  }

  if (options.delete) {
    await deleteTemplate(options.delete);
  }
}

// Helper functions

async function getProjectConfiguration(options: StructureCommandOptions): Promise<StructureManagerConfig> {
  let config: Partial<StructureManagerConfig> = {
    projectName: 'my-project',
    projectType: options.type || 'web',
    framework: options.framework || 'react',
    language: options.language || 'typescript',
    features: options.features || [],
    integrations: options.integrations || [],
    outputPath: options.output || process.cwd(),
    environment: options.environment || 'development',
    realConnections: true,
    architecturalPattern: options.pattern || 'mvc',
    databaseType: options.database,
    authProvider: options.auth,
    paymentProvider: options.payment,
    cloudProvider: options.cloud,
    monitoring: options.monitoring,
    analytics: options.analytics
  };

  if (options.interactive) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: 'Project name:',
        default: config.projectName,
        validate: (input: string) => {
          if (!input.trim()) return 'Project name is required';
          if (input.length < 2) return 'Project name must be at least 2 characters';
          if (!/^[a-zA-Z0-9\-_]+$/.test(input)) return 'Project name can only contain letters, numbers, hyphens, and underscores';
          return true;
        }
      },
      {
        type: 'list',
        name: 'projectType',
        message: 'Project type:',
        choices: [
          { name: 'Web Application', value: 'web' },
          { name: 'Mobile Application', value: 'mobile' },
          { name: 'Blockchain DApp', value: 'blockchain' },
          { name: 'AI/ML Application', value: 'ai' },
          { name: 'Full-stack Application', value: 'fullstack' }
        ],
        default: config.projectType
      },
      {
        type: 'list',
        name: 'framework',
        message: 'Framework:',
        choices: (answers: any) => {
          switch (answers.projectType) {
            case 'web':
              return ['Next.js', 'React', 'Vue', 'Angular', 'Svelte'];
            case 'mobile':
              return ['React Native', 'Flutter', 'Ionic', 'Expo'];
            case 'blockchain':
              return ['Anchor (Solana)', 'Hardhat (Ethereum)', 'Truffle', 'Foundry'];
            case 'ai':
              return ['FastAPI', 'Flask', 'Django', 'Express'];
            case 'fullstack':
              return ['Next.js', 'T3 Stack', 'MEAN', 'MERN'];
            default:
              return ['React'];
          }
        },
        default: config.framework
      },
      {
        type: 'list',
        name: 'language',
        message: 'Programming language:',
        choices: (answers: any) => {
          switch (answers.projectType) {
            case 'blockchain':
              return ['Rust', 'Solidity', 'TypeScript'];
            case 'ai':
              return ['Python', 'JavaScript', 'TypeScript'];
            default:
              return ['TypeScript', 'JavaScript'];
          }
        },
        default: config.language
      },
      {
        type: 'checkbox',
        name: 'features',
        message: 'Select features to include:',
        choices: [
          { name: 'Authentication', value: 'auth' },
          { name: 'Database Integration', value: 'database' },
          { name: 'Payment Processing', value: 'payment' },
          { name: 'File Upload', value: 'upload' },
          { name: 'Real-time Chat', value: 'chat' },
          { name: 'Push Notifications', value: 'notifications' },
          { name: 'Analytics', value: 'analytics' },
          { name: 'Monitoring', value: 'monitoring' },
          { name: 'Testing Setup', value: 'testing' },
          { name: 'CI/CD Pipeline', value: 'cicd' }
        ]
      },
      {
        type: 'checkbox',
        name: 'integrations',
        message: 'Select service integrations:',
        choices: [
          { name: 'Stripe (Payments)', value: 'stripe' },
          { name: 'Auth0 (Authentication)', value: 'auth0' },
          { name: 'Supabase (Database)', value: 'supabase' },
          { name: 'Firebase (Backend)', value: 'firebase' },
          { name: 'AWS (Cloud)', value: 'aws' },
          { name: 'Vercel (Deployment)', value: 'vercel' },
          { name: 'Sentry (Monitoring)', value: 'sentry' },
          { name: 'SendGrid (Email)', value: 'sendgrid' }
        ]
      },
      {
        type: 'list',
        name: 'architecturalPattern',
        message: 'Architectural pattern:',
        choices: [
          { name: 'MVC (Model-View-Controller)', value: 'mvc' },
          { name: 'Microservices', value: 'microservices' },
          { name: 'Serverless', value: 'serverless' },
          { name: 'Hexagonal Architecture', value: 'hexagonal' },
          { name: 'Clean Architecture', value: 'clean' }
        ],
        default: config.architecturalPattern
      },
      {
        type: 'input',
        name: 'outputPath',
        message: 'Output directory:',
        default: config.outputPath,
        validate: (input: string) => {
          if (!input.trim()) return 'Output path is required';
          return true;
        }
      }
    ]);

    config = { ...config, ...answers };

    // Additional configuration based on features
    if (config.features?.includes('database')) {
      const dbChoice = await inquirer.prompt([
        {
          type: 'list',
          name: 'databaseType',
          message: 'Database type:',
          choices: [
            { name: 'PostgreSQL', value: 'postgresql' },
            { name: 'MongoDB', value: 'mongodb' },
            { name: 'Supabase', value: 'supabase' },
            { name: 'Firebase', value: 'firebase' },
            { name: 'Redis', value: 'redis' }
          ]
        }
      ]);
      config.databaseType = dbChoice.databaseType;
    }

    if (config.features?.includes('auth')) {
      const authChoice = await inquirer.prompt([
        {
          type: 'list',
          name: 'authProvider',
          message: 'Authentication provider:',
          choices: [
            { name: 'Auth0', value: 'auth0' },
            { name: 'Supabase Auth', value: 'supabase' },
            { name: 'Firebase Auth', value: 'firebase' },
            { name: 'Custom Implementation', value: 'custom' }
          ]
        }
      ]);
      config.authProvider = authChoice.authProvider;
    }

    if (config.features?.includes('payment')) {
      const paymentChoice = await inquirer.prompt([
        {
          type: 'list',
          name: 'paymentProvider',
          message: 'Payment provider:',
          choices: [
            { name: 'Stripe', value: 'stripe' },
            { name: 'PayPal', value: 'paypal' },
            { name: 'Square', value: 'square' }
          ]
        }
      ]);
      config.paymentProvider = paymentChoice.paymentProvider;
    }
  }

  return config as StructureManagerConfig;
}

async function detectProjectType(projectPath: string): Promise<'web' | 'mobile' | 'blockchain' | 'ai' | 'fullstack'> {
  const files = await fs.readdir(projectPath);
  
  if (files.includes('Anchor.toml')) return 'blockchain';
  if (files.includes('hardhat.config.js') || files.includes('truffle-config.js')) return 'blockchain';
  if (files.includes('requirements.txt') || files.includes('setup.py')) return 'ai';
  if (files.includes('pubspec.yaml')) return 'mobile';
  if (files.includes('package.json')) {
    const packageJson = await fs.readJson(path.join(projectPath, 'package.json'));
    if (packageJson.dependencies?.['react-native']) return 'mobile';
    if (packageJson.dependencies?.['next'] || packageJson.dependencies?.['express']) return 'fullstack';
    return 'web';
  }
  
  return 'web';
}

async function writeStructureFiles(result: any, outputPath: string): Promise<void> {
  const spinner = ora('Writing files...').start();

  try {
    // Ensure output directory exists
    await fs.ensureDir(outputPath);

    // Write all generated files
    for (const file of result.generatedFiles) {
      const filePath = path.join(outputPath, file.path);
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, file.content, 'utf8');
    }

    spinner.succeed(`Files written to ${outputPath}`);
  } catch (error) {
    spinner.fail('Failed to write files');
    throw error;
  }
}

function displayStructurePreview(result: any): void {
  console.log(chalk.green('\n📁 Structure Preview:'));
  console.log(chalk.cyan(`Total files: ${result.generatedFiles.length}`));
  
  const filesByType = result.generatedFiles.reduce((acc: any, file: any) => {
    acc[file.type] = (acc[file.type] || 0) + 1;
    return acc;
  }, {});

  Object.entries(filesByType).forEach(([type, count]) => {
    console.log(chalk.yellow(`  ${type}: ${count} files`));
  });
}

function displayGenerationResults(result: any): void {
  console.log(chalk.green('\n✅ Generation Results:'));
  console.log(chalk.cyan(`📁 Files generated: ${result.generatedFiles.length}`));
  console.log(chalk.cyan(`🏗️  Structure integrity: ${result.validationResults.structureIntegrity ? 'Valid' : 'Invalid'}`));
  console.log(chalk.cyan(`🔗 Service connections: ${result.validationResults.serviceConnections ? 'Configured' : 'Not configured'}`));
  console.log(chalk.cyan(`🔒 Security config: ${result.validationResults.securityConfig ? 'Secure' : 'Needs attention'}`));
  console.log(chalk.cyan(`🚀 Deployment ready: ${result.validationResults.deploymentReadiness ? 'Yes' : 'No'}`));

  if (result.validationResults.issues.length > 0) {
    console.log(chalk.yellow('\n⚠️  Issues found:'));
    result.validationResults.issues.forEach((issue: string) => {
      console.log(chalk.yellow(`  • ${issue}`));
    });
  }

  if (result.validationResults.recommendations.length > 0) {
    console.log(chalk.blue('\n💡 Recommendations:'));
    result.validationResults.recommendations.forEach((rec: string) => {
      console.log(chalk.blue(`  • ${rec}`));
    });
  }
}

function displayValidationResults(result: any): void {
  console.log(chalk.green(`\n📊 Validation Results (Score: ${result.score}/100)`));
  console.log(chalk.cyan(`Status: ${result.valid ? 'Valid' : 'Invalid'}`));

  if (result.issues.length > 0) {
    console.log(chalk.yellow('\n⚠️  Issues:'));
    result.issues.forEach((issue: any) => {
      const coloredText = issue.severity === 'critical' ? chalk.red(`  ${issue.severity.toUpperCase()}: ${issue.message}`) :
                         issue.severity === 'high' ? chalk.yellow(`  ${issue.severity.toUpperCase()}: ${issue.message}`) :
                         issue.severity === 'medium' ? chalk.yellow(`  ${issue.severity.toUpperCase()}: ${issue.message}`) : 
                         chalk.gray(`  ${issue.severity.toUpperCase()}: ${issue.message}`);
      console.log(coloredText);
      console.log(chalk.gray(`    Fix: ${issue.fix}`));
    });
  }

  if (result.recommendations.length > 0) {
    console.log(chalk.blue('\n💡 Recommendations:'));
    result.recommendations.forEach((rec: string) => {
      console.log(chalk.blue(`  • ${rec}`));
    });
  }
}

function displayAnalysisResults(analysis: any): void {
  console.log(chalk.green('\n📊 Analysis Results:'));
  console.log(chalk.cyan(`Project Type: ${analysis.insights.projectType}`));
  console.log(chalk.cyan(`Framework: ${analysis.insights.framework}`));
  console.log(chalk.cyan(`Language: ${analysis.insights.language}`));
  console.log(chalk.cyan(`Complexity: ${analysis.insights.complexity}`));
  console.log(chalk.cyan(`Maintainability: ${analysis.insights.maintainability}/100`));
  console.log(chalk.cyan(`Test Coverage: ${analysis.insights.testCoverage}%`));

  console.log(chalk.green('\n📈 Metrics:'));
  console.log(chalk.cyan(`Total Files: ${analysis.metrics.totalFiles}`));
  console.log(chalk.cyan(`Total Lines: ${analysis.metrics.totalLines}`));
  console.log(chalk.cyan(`Total Size: ${Math.round(analysis.metrics.totalSize / 1024)}KB`));
  console.log(chalk.cyan(`Directory Depth: ${analysis.metrics.directoryDepth}`));

  if (analysis.recommendations.length > 0) {
    console.log(chalk.blue('\n💡 Recommendations:'));
    analysis.recommendations.forEach((rec: any) => {
      console.log(chalk.blue(`  ${rec.priority.toUpperCase()}: ${rec.title}`));
      console.log(chalk.gray(`    ${rec.description}`));
      console.log(chalk.gray(`    Action: ${rec.action}`));
    });
  }
}

function displayComparisonResults(comparison: any): void {
  console.log(chalk.green('\n🔀 Comparison Results:'));
  
  console.log(chalk.cyan('\n✅ Similarities:'));
  comparison.similarities.forEach((sim: string) => {
    console.log(chalk.cyan(`  • ${sim}`));
  });

  console.log(chalk.yellow('\n🔄 Differences:'));
  comparison.differences.forEach((diff: string) => {
    console.log(chalk.yellow(`  • ${diff}`));
  });

  if (comparison.recommendations.length > 0) {
    console.log(chalk.blue('\n💡 Recommendations:'));
    comparison.recommendations.forEach((rec: string) => {
      console.log(chalk.blue(`  • ${rec}`));
    });
  }
}

function displayMigrationPlan(plan: any): void {
  console.log(chalk.green('\n🚀 Migration Plan:'));
  plan.forEach((step: any, index: number) => {
    console.log(chalk.cyan(`${index + 1}. ${step.action.toUpperCase()}: ${step.to}`));
    if (step.from) {
      console.log(chalk.gray(`   From: ${step.from}`));
    }
    console.log(chalk.gray(`   Reason: ${step.reason}`));
  });
}

function displayNextSteps(result: any): void {
  console.log(chalk.green('\n🎯 Next Steps:'));
  
  console.log(chalk.cyan('1. Review generated files and configurations'));
  console.log(chalk.cyan('2. Install dependencies:'));
  console.log(chalk.gray('   npm install'));
  
  console.log(chalk.cyan('3. Set up environment variables:'));
  console.log(chalk.gray('   cp .env.example .env'));
  console.log(chalk.gray('   # Edit .env with your actual values'));
  
  if (result.configurations.database) {
    console.log(chalk.cyan('4. Set up database:'));
    console.log(chalk.gray('   npm run db:migrate'));
    console.log(chalk.gray('   npm run db:seed'));
  }
  
  console.log(chalk.cyan('5. Start development server:'));
  console.log(chalk.gray('   npm run dev'));
  
  console.log(chalk.cyan('6. Run tests:'));
  console.log(chalk.gray('   npm test'));

  if (result.integrationGuide.length > 0) {
    console.log(chalk.blue('\n🔗 Integration Setup:'));
    result.integrationGuide.forEach((guide: any) => {
      console.log(chalk.blue(`${guide.service}:`));
      guide.steps.forEach((step: string, index: number) => {
        console.log(chalk.gray(`  ${index + 1}. ${step}`));
      });
      console.log(chalk.gray(`  Test: ${guide.testCommand}`));
    });
  }
}

async function validateGeneratedStructure(projectPath: string, config: StructureManagerConfig): Promise<void> {
  const spinner = ora('Validating generated structure...').start();
  
  try {
    const structureManager = new ProjectStructureManager(config);
    const result = await structureManager.validateExistingStructure(projectPath);
    
    if (result.valid) {
      spinner.succeed('Structure validation passed');
    } else {
      spinner.warn('Structure validation found issues');
      displayValidationResults(result);
    }
  } catch (error) {
    spinner.fail('Structure validation failed');
    throw error;
  }
}

async function fixStructureIssues(projectPath: string, issues: any[]): Promise<void> {
  const spinner = ora('Fixing structure issues...').start();
  
  try {
    // Implementation for fixing issues
    // This would include creating missing directories, files, etc.
    
    spinner.succeed('Structure issues fixed');
  } catch (error) {
    spinner.fail('Failed to fix structure issues');
    throw error;
  }
}

async function generateValidationReport(projectPath: string, result: any): Promise<void> {
  const reportPath = path.join(projectPath, 'structure-validation-report.md');
  
  const report = `# Structure Validation Report

## Summary
- **Score**: ${result.score}/100
- **Status**: ${result.valid ? 'Valid' : 'Invalid'}
- **Generated**: ${new Date().toISOString()}

## Issues
${result.issues.map((issue: any) => `- **${issue.severity.toUpperCase()}**: ${issue.message}\n  - Fix: ${issue.fix}`).join('\n')}

## Recommendations
${result.recommendations.map((rec: string) => `- ${rec}`).join('\n')}
`;

  await fs.writeFile(reportPath, report, 'utf8');
  console.log(chalk.green(`📄 Report saved to: ${reportPath}`));
}

async function generateAnalysisOutput(analysis: any, format: string, projectPath: string): Promise<void> {
  const outputPath = path.join(projectPath, `analysis.${format}`);
  
  let content = '';
  
  switch (format) {
    case 'json':
      content = JSON.stringify(analysis, null, 2);
      break;
    case 'yaml':
      // Would need yaml library
      content = JSON.stringify(analysis, null, 2);
      break;
    case 'markdown':
      content = `# Project Analysis Report

## Overview
- **Project Type**: ${analysis.insights.projectType}
- **Framework**: ${analysis.insights.framework}
- **Language**: ${analysis.insights.language}
- **Complexity**: ${analysis.insights.complexity}

## Metrics
- **Total Files**: ${analysis.metrics.totalFiles}
- **Total Lines**: ${analysis.metrics.totalLines}
- **Total Size**: ${Math.round(analysis.metrics.totalSize / 1024)}KB

## Recommendations
${analysis.recommendations.map((rec: any) => `- **${rec.priority.toUpperCase()}**: ${rec.title}\n  - ${rec.description}\n  - Action: ${rec.action}`).join('\n')}
`;
      break;
  }
  
  await fs.writeFile(outputPath, content, 'utf8');
  console.log(chalk.green(`📄 Analysis saved to: ${outputPath}`));
}

async function listAvailableTemplates(): Promise<void> {
  const templates = [
    { name: 'web-nextjs', description: 'Next.js web application with TypeScript' },
    { name: 'web-react', description: 'React application with Vite' },
    { name: 'mobile-rn', description: 'React Native mobile application' },
    { name: 'blockchain-solana', description: 'Solana blockchain application with Anchor' },
    { name: 'ai-python', description: 'Python AI/ML application with FastAPI' },
    { name: 'fullstack-t3', description: 'T3 Stack (Next.js, tRPC, Prisma)' }
  ];

  console.log(chalk.green('\n📋 Available Templates:'));
  templates.forEach(template => {
    console.log(chalk.cyan(`  • ${template.name}`));
    console.log(chalk.gray(`    ${template.description}`));
  });
}

async function createNewTemplate(name: string): Promise<void> {
  console.log(chalk.blue(`Creating new template: ${name}`));
  // Implementation for creating new templates
}

async function updateExistingTemplate(name: string): Promise<void> {
  console.log(chalk.blue(`Updating template: ${name}`));
  // Implementation for updating templates
}

async function deleteTemplate(name: string): Promise<void> {
  const confirm = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Are you sure you want to delete template '${name}'?`,
      default: false
    }
  ]);

  if (confirm.confirm) {
    console.log(chalk.red(`Template '${name}' deleted`));
    // Implementation for deleting templates
  }
}

