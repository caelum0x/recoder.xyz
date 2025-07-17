/**
 * Project management commands
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import boxen from 'boxen';
import path from 'path';
import fs from 'fs-extra';
import chokidar from 'chokidar';
import { Logger } from '@codecraft/shared';
import { ProjectService } from '../services/project';
import { ConfigManager } from '../utils/config';
import { requireAuth } from '../utils/auth';

export function setupProjectCommands(program: Command): void {
  const project = program
    .command('project')
    .description('Project management and code generation');

  // Initialize project command
  project
    .command('init')
    .description('Initialize a new CodeCraft project')
    .option('-n, --name <name>', 'project name')
    .option('-d, --description <description>', 'project description')
    .option('-t, --type <type>', 'project type')
    .option('-p, --path <path>', 'project path')
    .option('--template <template>', 'use project template')
    .option('--interactive', 'interactive project setup')
    .action(async (options) => {
      try {
        await requireAuth();
        await handleInitProject(options);
      } catch (error) {
        Logger.error(`Project initialization failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Add components/features to project
  project
    .command('add <feature>')
    .description('Add features or components to project')
    .option('-p, --path <path>', 'target path')
    .option('-c, --config <config>', 'feature configuration')
    .option('--interactive', 'interactive feature configuration')
    .action(async (feature, options) => {
      try {
        await requireAuth();
        await handleAddFeature(feature, options);
      } catch (error) {
        Logger.error(`Feature addition failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Analyze existing project
  project
    .command('analyze')
    .description('Analyze existing codebase and suggest improvements')
    .option('-p, --path <path>', 'project path', '.')
    .option('-d, --depth <depth>', 'analysis depth', '3')
    .option('-o, --output <file>', 'output analysis to file')
    .option('--security', 'include security analysis')
    .option('--performance', 'include performance analysis')
    .option('--architecture', 'include architecture analysis')
    .action(async (options) => {
      try {
        await requireAuth();
        await handleAnalyzeProject(options);
      } catch (error) {
        Logger.error(`Project analysis failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Generate code from plan
  project
    .command('generate')
    .description('Generate production-ready code from project plan')
    .option('-p, --plan <file>', 'project plan file')
    .option('-o, --output <dir>', 'output directory')
    .option('-f, --force', 'overwrite existing files')
    .option('--real-integrations', 'include real service integrations')
    .option('--tests', 'generate tests')
    .option('--docs', 'generate documentation')
    .option('--deploy', 'generate deployment configuration')
    .action(async (options) => {
      try {
        await requireAuth();
        await handleGenerateCode(options);
      } catch (error) {
        Logger.error(`Code generation failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Validate project
  project
    .command('validate')
    .description('Validate project structure and integrations')
    .option('-p, --path <path>', 'project path', '.')
    .option('--fix', 'automatically fix issues where possible')
    .option('--strict', 'strict validation mode')
    .option('--report <file>', 'generate validation report')
    .action(async (options) => {
      try {
        await requireAuth();
        await handleValidateProject(options);
      } catch (error) {
        Logger.error(`Project validation failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Deploy project
  project
    .command('deploy')
    .description('Deploy project to cloud providers')
    .option('-p, --provider <provider>', 'deployment provider')
    .option('-e, --env <environment>', 'target environment')
    .option('-c, --config <file>', 'deployment configuration file')
    .option('--dry-run', 'preview deployment without executing')
    .option('--watch', 'watch for changes and auto-deploy')
    .action(async (options) => {
      try {
        await requireAuth();
        await handleDeployProject(options);
      } catch (error) {
        Logger.error(`Project deployment failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // List projects
  project
    .command('list')
    .alias('ls')
    .description('List all projects')
    .option('-j, --json', 'output as JSON')
    .option('-f, --filter <type>', 'filter by project type')
    .option('--local', 'show only local projects')
    .option('--remote', 'show only remote projects')
    .action(async (options) => {
      try {
        await requireAuth();
        await handleListProjects(options);
      } catch (error) {
        Logger.error(`Failed to list projects: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Show project details
  project
    .command('show [projectId]')
    .description('Show project details')
    .option('-p, --path <path>', 'project path for local projects')
    .option('-j, --json', 'output as JSON')
    .option('--status', 'show project status')
    .option('--metrics', 'show project metrics')
    .action(async (projectId, options) => {
      try {
        await requireAuth();
        await handleShowProject(projectId, options);
      } catch (error) {
        Logger.error(`Failed to show project: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Watch project for changes
  project
    .command('watch')
    .description('Watch project for changes and auto-sync')
    .option('-p, --path <path>', 'project path', '.')
    .option('-i, --ignore <patterns>', 'ignore patterns (comma-separated)')
    .option('--validate', 'validate changes automatically')
    .option('--sync', 'sync with remote automatically')
    .action(async (options) => {
      try {
        await requireAuth();
        await handleWatchProject(options);
      } catch (error) {
        Logger.error(`Project watching failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });
}

async function handleInitProject(options: any): Promise<void> {
  console.log(
    boxen(
      chalk.cyan('🚀 Initialize CodeCraft Project'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  let projectConfig: any;

  if (options.interactive || !options.name) {
    projectConfig = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Project name:',
        default: options.name || path.basename(process.cwd()),
        validate: (input) => input.length >= 3 || 'Project name must be at least 3 characters',
      },
      {
        type: 'input',
        name: 'description',
        message: 'Project description:',
        default: options.description,
        validate: (input) => input.length >= 10 || 'Description must be at least 10 characters',
      },
      {
        type: 'list',
        name: 'type',
        message: 'Project type:',
        default: options.type,
        choices: [
          { name: '🌐 Web Application (React/Vue/Angular)', value: 'web' },
          { name: '📱 Mobile Application (React Native/Flutter)', value: 'mobile' },
          { name: '⛓️  Blockchain/Web3 Application', value: 'blockchain' },
          { name: '🧠 AI/ML Application', value: 'ai' },
          { name: '🔧 Backend API/Service', value: 'backend' },
          { name: '📊 Data Pipeline/Analytics', value: 'data' },
          { name: '🎮 Game Development', value: 'game' },
          { name: '🖥️  Desktop Application', value: 'desktop' },
          { name: '⚡ Full-Stack Application', value: 'fullstack' },
        ],
      },
      {
        type: 'input',
        name: 'path',
        message: 'Project path:',
        default: options.path || `./${projectConfig?.name || 'new-project'}`,
        validate: async (input) => {
          const fullPath = path.resolve(input);
          const exists = await fs.pathExists(fullPath);
          if (exists) {
            const isEmpty = (await fs.readdir(fullPath)).length === 0;
            return isEmpty || 'Directory exists and is not empty';
          }
          return true;
        },
      },
      {
        type: 'list',
        name: 'template',
        message: 'Choose a template:',
        choices: [
          { name: 'Minimal starter', value: 'minimal' },
          { name: 'Production-ready template', value: 'production' },
          { name: 'Enterprise template', value: 'enterprise' },
          { name: 'Custom template', value: 'custom' },
        ],
        when: (answers) => !options.template,
      },
      {
        type: 'checkbox',
        name: 'features',
        message: 'Select features to include:',
        choices: [
          { name: 'Authentication & Authorization', value: 'auth' },
          { name: 'Database Integration', value: 'database' },
          { name: 'API Integration', value: 'api' },
          { name: 'Real-time Features (WebSocket)', value: 'realtime' },
          { name: 'File Upload/Storage', value: 'storage' },
          { name: 'Payment Processing', value: 'payments' },
          { name: 'Email/Notifications', value: 'notifications' },
          { name: 'Analytics & Monitoring', value: 'analytics' },
          { name: 'CI/CD Pipeline', value: 'cicd' },
          { name: 'Docker Configuration', value: 'docker' },
        ],
      },
      {
        type: 'checkbox',
        name: 'integrations',
        message: 'Select integrations:',
        choices: [
          { name: 'AWS Services', value: 'aws' },
          { name: 'Google Cloud', value: 'gcp' },
          { name: 'Microsoft Azure', value: 'azure' },
          { name: 'Vercel', value: 'vercel' },
          { name: 'Netlify', value: 'netlify' },
          { name: 'Firebase', value: 'firebase' },
          { name: 'Supabase', value: 'supabase' },
          { name: 'PlanetScale', value: 'planetscale' },
          { name: 'Stripe', value: 'stripe' },
          { name: 'Solana', value: 'solana' },
          { name: 'Ethereum', value: 'ethereum' },
        ],
      },
    ]);
  } else {
    projectConfig = {
      name: options.name,
      description: options.description || `${options.name} project`,
      type: options.type || 'web',
      path: options.path || `./${options.name}`,
      template: options.template || 'production',
      features: ['auth', 'database', 'api'],
      integrations: [],
    };
  }

  const spinner = ora('Creating project structure...').start();

  try {
    const token = ConfigManager.get('auth.token');
    const result = await ProjectService.initializeProject(token, projectConfig);
    
    if (result.success) {
      spinner.succeed(chalk.green('Project initialized successfully!'));
      
      console.log(
        boxen(
          chalk.white(`🎉 ${result.project.name} Created!\n`) +
          chalk.gray(`Path: ${result.project.path}\n`) +
          chalk.gray(`Type: ${result.project.type}\n`) +
          chalk.gray(`Template: ${result.project.template}\n`) +
          chalk.gray(`Features: ${result.project.features.join(', ')}\n`) +
          chalk.gray(`Project ID: ${result.project.id}`),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'green',
            title: 'Project Created',
          }
        )
      );

      // Show next steps
      console.log(
        boxen(
          chalk.white('🚀 Next Steps:\n') +
          chalk.gray(`1. cd ${result.project.path}\n`) +
          chalk.gray('2. codecraft project generate\n') +
          chalk.gray('3. npm install\n') +
          chalk.gray('4. npm run dev'),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'blue',
            title: 'Next Steps',
          }
        )
      );

      // Ask if user wants to generate code immediately
      const generateNow = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'generate',
          message: 'Generate production code now?',
          default: true,
        },
      ]);

      if (generateNow.generate) {
        await handleGenerateCode({
          plan: result.project.planFile,
          output: result.project.path,
          realIntegrations: true,
          tests: true,
          docs: true,
        });
      }
    } else {
      spinner.fail(chalk.red('Project initialization failed'));
      console.log(chalk.red(result.error || 'Unknown error'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Project initialization failed'));
    throw error;
  }
}

async function handleAddFeature(feature: string, options: any): Promise<void> {
  console.log(
    boxen(
      chalk.cyan(`➕ Add Feature: ${feature}`),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  // Check if we're in a CodeCraft project
  const projectPath = options.path || '.';
  const planFile = path.join(projectPath, 'codecraft.json');
  
  if (!await fs.pathExists(planFile)) {
    console.log(chalk.yellow('No CodeCraft project found in current directory.'));
    console.log(chalk.gray('Run "codecraft project init" to initialize a project first.'));
    return;
  }

  let featureConfig: any;

  if (options.interactive || !options.config) {
    // Get available feature templates
    const spinner = ora('Loading feature templates...').start();
    const token = ConfigManager.get('auth.token');
    const templatesResult = await ProjectService.getFeatureTemplates(token, feature);
    
    if (!templatesResult.success) {
      spinner.fail(chalk.red('Failed to load feature templates'));
      console.log(chalk.red(templatesResult.error || 'Unknown error'));
      return;
    }
    
    spinner.succeed(chalk.green('Feature templates loaded'));

    featureConfig = await inquirer.prompt([
      {
        type: 'list',
        name: 'template',
        message: 'Choose feature template:',
        choices: templatesResult.templates.map((t: any) => ({
          name: `${t.name} - ${t.description}`,
          value: t.id,
        })),
      },
      {
        type: 'input',
        name: 'name',
        message: 'Feature name:',
        default: feature,
        validate: (input) => input.length >= 3 || 'Feature name must be at least 3 characters',
      },
      {
        type: 'input',
        name: 'path',
        message: 'Feature path:',
        default: `src/features/${feature}`,
      },
      {
        type: 'checkbox',
        name: 'options',
        message: 'Feature options:',
        choices: [
          { name: 'Include tests', value: 'tests' },
          { name: 'Include documentation', value: 'docs' },
          { name: 'Include stories (Storybook)', value: 'stories' },
          { name: 'Include API endpoints', value: 'api' },
          { name: 'Include database models', value: 'models' },
        ],
      },
    ]);
  } else {
    featureConfig = {
      template: 'default',
      name: feature,
      path: options.path || `src/features/${feature}`,
      options: ['tests', 'docs'],
    };
  }

  const spinner = ora('Adding feature...').start();

  try {
    const token = ConfigManager.get('auth.token');
    const result = await ProjectService.addFeature(token, projectPath, feature, featureConfig);
    
    if (result.success) {
      spinner.succeed(chalk.green('Feature added successfully!'));
      
      console.log(
        boxen(
          chalk.white(`✅ ${featureConfig.name} Added\n`) +
          chalk.gray(`Path: ${result.feature.path}\n`) +
          chalk.gray(`Files created: ${result.feature.files.length}\n`) +
          chalk.gray(`Template: ${featureConfig.template}`),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'green',
          }
        )
      );

      if (result.feature.files.length > 0) {
        console.log(
          boxen(
            chalk.white('📁 Files Created:\n') +
            result.feature.files.map((file: string) => chalk.gray(`• ${file}`)).join('\n'),
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'blue',
              title: 'Created Files',
            }
          )
        );
      }
    } else {
      spinner.fail(chalk.red('Feature addition failed'));
      console.log(chalk.red(result.error || 'Unknown error'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Feature addition failed'));
    throw error;
  }
}

async function handleAnalyzeProject(options: any): Promise<void> {
  console.log(
    boxen(
      chalk.cyan('🔍 Analyzing Project'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  const projectPath = path.resolve(options.path);
  
  if (!await fs.pathExists(projectPath)) {
    console.log(chalk.red(`Project path does not exist: ${projectPath}`));
    return;
  }

  const spinner = ora('Analyzing codebase...').start();

  try {
    const token = ConfigManager.get('auth.token');
    const analysisOptions = {
      depth: parseInt(options.depth),
      includeSecurityAnalysis: options.security,
      includePerformanceAnalysis: options.performance,
      includeArchitectureAnalysis: options.architecture,
    };

    const result = await ProjectService.analyzeProject(token, projectPath, analysisOptions);
    
    if (result.success) {
      spinner.succeed(chalk.green('Analysis completed'));
      
      const analysis = result.analysis;

      // Display summary
      console.log(
        boxen(
          chalk.white('📊 Analysis Summary\n') +
          chalk.gray(`Files analyzed: ${analysis.summary.filesAnalyzed}\n`) +
          chalk.gray(`Lines of code: ${analysis.summary.linesOfCode}\n`) +
          chalk.gray(`Languages: ${analysis.summary.languages.join(', ')}\n`) +
          chalk.gray(`Score: ${analysis.summary.score}/100`),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'blue',
            title: 'Summary',
          }
        )
      );

      // Display issues by severity
      if (analysis.issues && analysis.issues.length > 0) {
        const groupedIssues = analysis.issues.reduce((acc: any, issue: any) => {
          if (!acc[issue.severity]) acc[issue.severity] = [];
          acc[issue.severity].push(issue);
          return acc;
        }, {});

        for (const [severity, issues] of Object.entries(groupedIssues)) {
          const color = severity === 'critical' ? 'red' : 
                       severity === 'high' ? 'yellow' : 
                       severity === 'medium' ? 'cyan' : 'gray';
          
          console.log(
            boxen(
              chalk.white(`${severity.toUpperCase()} Issues\n`) +
              (issues as any[]).map((issue: any) => 
                chalk.gray(`• ${issue.message}\n`) +
                chalk.gray(`  File: ${issue.file}:${issue.line}\n`) +
                (issue.suggestion ? chalk.gray(`  Suggestion: ${issue.suggestion}`) : '')
              ).join('\n\n'),
              {
                padding: 1,
                borderStyle: 'round',
                borderColor: color,
                title: `${severity.toUpperCase()} (${(issues as any[]).length})`,
              }
            )
          );
        }
      }

      // Display recommendations
      if (analysis.recommendations && analysis.recommendations.length > 0) {
        console.log(
          boxen(
            chalk.white('💡 Recommendations\n') +
            analysis.recommendations.map((rec: any) => 
              chalk.gray(`• ${rec.title}\n`) +
              chalk.gray(`  ${rec.description}\n`) +
              (rec.priority ? chalk.gray(`  Priority: ${rec.priority}`) : '')
            ).join('\n\n'),
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'green',
              title: 'Recommendations',
            }
          )
        );
      }

      // Save report if requested
      if (options.output) {
        await fs.writeJson(options.output, analysis, { spaces: 2 });
        console.log(chalk.green(`Analysis report saved to: ${options.output}`));
      }
    } else {
      spinner.fail(chalk.red('Analysis failed'));
      console.log(chalk.red(result.error || 'Unknown error'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Analysis failed'));
    throw error;
  }
}

async function handleGenerateCode(options: any): Promise<void> {
  console.log(
    boxen(
      chalk.cyan('⚡ Generate Production Code'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  let planFile = options.plan;
  let outputDir = options.output;

  // Auto-detect plan file if not specified
  if (!planFile) {
    const possiblePlans = ['codecraft.json', 'project-plan.md', 'plan.json'];
    for (const plan of possiblePlans) {
      if (await fs.pathExists(plan)) {
        planFile = plan;
        break;
      }
    }
  }

  if (!planFile || !await fs.pathExists(planFile)) {
    console.log(chalk.red('No project plan found.'));
    console.log(chalk.gray('Run "codecraft project init" to create a project plan first.'));
    return;
  }

  if (!outputDir) {
    outputDir = path.dirname(planFile);
  }

  // Confirm if output directory is not empty
  if (await fs.pathExists(outputDir)) {
    const files = await fs.readdir(outputDir);
    const nonConfigFiles = files.filter(f => !f.startsWith('.') && !['codecraft.json', 'package.json'].includes(f));
    
    if (nonConfigFiles.length > 0 && !options.force) {
      const confirmed = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: `Output directory "${outputDir}" is not empty. Continue?`,
          default: false,
        },
      ]);

      if (!confirmed.overwrite) {
        console.log(chalk.yellow('Code generation cancelled.'));
        return;
      }
    }
  }

  const spinner = ora('Generating production code...').start();

  try {
    const token = ConfigManager.get('auth.token');
    const generationOptions = {
      outputDir,
      realIntegrations: options.realIntegrations,
      includeTests: options.tests,
      includeDocs: options.docs,
      includeDeployConfig: options.deploy,
      force: options.force,
    };

    const result = await ProjectService.generateCode(token, planFile, generationOptions);
    
    if (result.success) {
      spinner.succeed(chalk.green('Code generated successfully!'));
      
      console.log(
        boxen(
          chalk.white(`🎉 Code Generation Complete!\n`) +
          chalk.gray(`Output: ${result.generation.outputDir}\n`) +
          chalk.gray(`Files created: ${result.generation.filesCreated}\n`) +
          chalk.gray(`Lines of code: ${result.generation.linesOfCode}\n`) +
          chalk.gray(`Generation time: ${result.generation.duration}ms`),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'green',
            title: 'Generation Complete',
          }
        )
      );

      if (result.generation.summary) {
        console.log(
          boxen(
            chalk.white('📁 Generated Components:\n') +
            Object.entries(result.generation.summary).map(([category, count]) => 
              chalk.gray(`• ${category}: ${count} files`)
            ).join('\n'),
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'blue',
              title: 'Summary',
            }
          )
        );
      }

      // Show next steps
      console.log(
        boxen(
          chalk.white('🚀 Next Steps:\n') +
          chalk.gray(`1. cd ${result.generation.outputDir}\n`) +
          chalk.gray('2. npm install\n') +
          chalk.gray('3. codecraft project validate\n') +
          chalk.gray('4. npm run dev'),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
            title: 'Next Steps',
          }
        )
      );

      // Ask if user wants to validate immediately
      const validateNow = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'validate',
          message: 'Validate generated code now?',
          default: true,
        },
      ]);

      if (validateNow.validate) {
        await handleValidateProject({ path: result.generation.outputDir });
      }
    } else {
      spinner.fail(chalk.red('Code generation failed'));
      console.log(chalk.red(result.error || 'Unknown error'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Code generation failed'));
    throw error;
  }
}

async function handleValidateProject(options: any): Promise<void> {
  console.log(
    boxen(
      chalk.cyan('✅ Validate Project'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  const projectPath = path.resolve(options.path);
  
  if (!await fs.pathExists(projectPath)) {
    console.log(chalk.red(`Project path does not exist: ${projectPath}`));
    return;
  }

  const spinner = ora('Validating project...').start();

  try {
    const token = ConfigManager.get('auth.token');
    const validationOptions = {
      autoFix: options.fix,
      strict: options.strict,
    };

    const result = await ProjectService.validateProject(token, projectPath, validationOptions);
    
    if (result.success) {
      const validation = result.validation;
      const passedChecks = validation.checks.filter((c: any) => c.passed).length;
      const totalChecks = validation.checks.length;
      
      spinner.succeed(chalk.green(`Validation complete: ${passedChecks}/${totalChecks} checks passed`));
      
      // Display validation summary
      console.log(
        boxen(
          chalk.white('📊 Validation Summary\n') +
          chalk.gray(`Score: ${validation.score}/100\n`) +
          chalk.gray(`Checks passed: ${passedChecks}/${totalChecks}\n`) +
          chalk.gray(`Issues found: ${validation.issuesCount}\n`) +
          chalk.gray(`Status: ${validation.status}`),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: validation.status === 'passed' ? 'green' : 'yellow',
            title: 'Summary',
          }
        )
      );

      // Group checks by category
      const groupedChecks = validation.checks.reduce((acc: any, check: any) => {
        if (!acc[check.category]) acc[check.category] = [];
        acc[check.category].push(check);
        return acc;
      }, {});

      for (const [category, checks] of Object.entries(groupedChecks)) {
        const categoryPassed = (checks as any[]).filter(c => c.passed).length;
        const categoryTotal = (checks as any[]).length;
        const color = categoryPassed === categoryTotal ? 'green' : 'yellow';
        
        console.log(
          boxen(
            chalk.white(`${category.toUpperCase()}\n`) +
            (checks as any[]).map((check: any) => 
              (check.passed ? chalk.green('✅') : chalk.red('❌')) +
              chalk.gray(` ${check.name}\n`) +
              (check.message ? chalk.gray(`  ${check.message}\n`) : '') +
              (check.suggestion && !check.passed ? chalk.yellow(`  💡 ${check.suggestion}`) : '')
            ).join('\n'),
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: color,
              title: `${category} (${categoryPassed}/${categoryTotal})`,
            }
          )
        );
      }

      // Show auto-fixed issues if any
      if (options.fix && validation.fixed && validation.fixed.length > 0) {
        console.log(
          boxen(
            chalk.white('🔧 Auto-Fixed Issues\n') +
            validation.fixed.map((fix: any) => 
              chalk.gray(`• ${fix.description}\n`) +
              chalk.gray(`  File: ${fix.file}`)
            ).join('\n\n'),
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'blue',
              title: 'Fixed',
            }
          )
        );
      }

      // Generate report if requested
      if (options.report) {
        await fs.writeJson(options.report, validation, { spaces: 2 });
        console.log(chalk.green(`Validation report saved to: ${options.report}`));
      }
    } else {
      spinner.fail(chalk.red('Validation failed'));
      console.log(chalk.red(result.error || 'Unknown error'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Validation failed'));
    throw error;
  }
}

async function handleDeployProject(options: any): Promise<void> {
  console.log(
    boxen(
      chalk.cyan('🚀 Deploy Project'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  // Implementation for deployment
  console.log(chalk.yellow('🚧 Deployment functionality coming soon!'));
  
  const availableProviders = [
    'vercel', 'netlify', 'aws', 'gcp', 'azure', 'digitalocean', 'railway', 'render'
  ];
  
  console.log(
    boxen(
      chalk.white('🌐 Supported Providers:\n') +
      availableProviders.map(provider => chalk.gray(`• ${provider}`)).join('\n'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'blue',
        title: 'Coming Soon',
      }
    )
  );
}

async function handleListProjects(options: any): Promise<void> {
  const spinner = ora('Fetching projects...').start();

  try {
    const token = ConfigManager.get('auth.token');
    const result = await ProjectService.listProjects(token, {
      filter: options.filter,
      local: options.local,
      remote: options.remote,
    });
    
    if (result.success) {
      spinner.succeed(chalk.green(`Found ${result.projects.length} projects`));
      
      if (result.projects.length === 0) {
        console.log(chalk.yellow('No projects found.'));
        console.log(chalk.gray('Create your first project with: codecraft project init'));
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(result.projects, null, 2));
      } else {
        console.log(
          boxen(
            chalk.white('📁 Your Projects\n') +
            result.projects.map((project: any) => 
              chalk.cyan(`• ${project.name}`) + chalk.gray(` (${project.id})\n`) +
              chalk.gray(`  Type: ${project.type} | Status: ${project.status}\n`) +
              chalk.gray(`  ${project.description}\n`) +
              chalk.gray(`  Created: ${new Date(project.createdAt).toLocaleDateString()}`)
            ).join('\n\n'),
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'cyan',
            }
          )
        );
      }
    } else {
      spinner.fail(chalk.red('Failed to fetch projects'));
      console.log(chalk.red(result.error || 'Unknown error'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Failed to fetch projects'));
    throw error;
  }
}

async function handleShowProject(projectId: string, options: any): Promise<void> {
  const spinner = ora('Fetching project details...').start();

  try {
    const token = ConfigManager.get('auth.token');
    
    let result;
    if (projectId) {
      result = await ProjectService.getProject(token, projectId);
    } else if (options.path) {
      result = await ProjectService.getLocalProject(options.path);
    } else {
      // Try to detect local project
      result = await ProjectService.getLocalProject('.');
    }
    
    if (result.success) {
      spinner.succeed(chalk.green('Project details retrieved'));
      
      const project = result.project;

      if (options.json) {
        console.log(JSON.stringify(project, null, 2));
      } else {
        console.log(
          boxen(
            chalk.white(`📁 ${project.name}\n`) +
            chalk.gray(`ID: ${project.id || 'Local project'}\n`) +
            chalk.gray(`Type: ${project.type}\n`) +
            chalk.gray(`Description: ${project.description}\n`) +
            chalk.gray(`Status: ${project.status}\n`) +
            chalk.gray(`Path: ${project.path}\n`) +
            chalk.gray(`Created: ${new Date(project.createdAt).toLocaleString()}`),
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'cyan',
              title: 'Project Details',
            }
          )
        );

        if (options.status && project.buildStatus) {
          console.log(
            boxen(
              chalk.white('🔧 Build Status\n') +
              chalk.gray(`Last build: ${project.buildStatus.lastBuild}\n`) +
              chalk.gray(`Status: ${project.buildStatus.status}\n`) +
              chalk.gray(`Duration: ${project.buildStatus.duration}ms`),
              {
                padding: 1,
                borderStyle: 'round',
                borderColor: 'blue',
                title: 'Build Status',
              }
            )
          );
        }

        if (options.metrics && project.metrics) {
          console.log(
            boxen(
              chalk.white('📊 Project Metrics\n') +
              chalk.gray(`Lines of code: ${project.metrics.linesOfCode}\n`) +
              chalk.gray(`Files: ${project.metrics.fileCount}\n`) +
              chalk.gray(`Dependencies: ${project.metrics.dependencies}\n`) +
              chalk.gray(`Last analysis: ${project.metrics.lastAnalysis}`),
              {
                padding: 1,
                borderStyle: 'round',
                borderColor: 'green',
                title: 'Metrics',
              }
            )
          );
        }
      }
    } else {
      spinner.fail(chalk.red('Failed to fetch project details'));
      console.log(chalk.red(result.error || 'Project not found'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Failed to fetch project details'));
    throw error;
  }
}

async function handleWatchProject(options: any): Promise<void> {
  const projectPath = path.resolve(options.path);
  
  if (!await fs.pathExists(projectPath)) {
    console.log(chalk.red(`Project path does not exist: ${projectPath}`));
    return;
  }

  console.log(
    boxen(
      chalk.cyan(`👁️  Watching: ${projectPath}`),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  const ignorePatterns = options.ignore ? options.ignore.split(',') : [
    'node_modules/**',
    '.git/**',
    'dist/**',
    'build/**',
    '.next/**',
    'coverage/**',
  ];

  const watcher = chokidar.watch(projectPath, {
    ignored: ignorePatterns,
    persistent: true,
    ignoreInitial: true,
  });

  let changeTimeout: NodeJS.Timeout;
  const changeQueue: string[] = [];

  const processChanges = async () => {
    if (changeQueue.length === 0) return;
    
    const changes = [...changeQueue];
    changeQueue.length = 0;

    console.log(chalk.yellow(`\n📝 Detected ${changes.length} changes`));
    
    if (options.validate) {
      const spinner = ora('Validating changes...').start();
      try {
        const token = ConfigManager.get('auth.token');
        const result = await ProjectService.validateChanges(token, projectPath, changes);
        
        if (result.success) {
          spinner.succeed(chalk.green('Changes validated'));
          
          if (result.issues && result.issues.length > 0) {
            console.log(chalk.yellow(`⚠️  Found ${result.issues.length} issues`));
            result.issues.forEach((issue: any) => {
              console.log(chalk.gray(`  • ${issue.message} (${issue.file})`));
            });
          }
        } else {
          spinner.fail(chalk.red('Validation failed'));
        }
      } catch (error) {
        spinner.fail(chalk.red('Validation error'));
        Logger.error(`Validation error: ${error}`);
      }
    }

    if (options.sync) {
      const spinner = ora('Syncing with remote...').start();
      try {
        const token = ConfigManager.get('auth.token');
        const result = await ProjectService.syncProject(token, projectPath);
        
        if (result.success) {
          spinner.succeed(chalk.green('Synced with remote'));
        } else {
          spinner.fail(chalk.red('Sync failed'));
        }
      } catch (error) {
        spinner.fail(chalk.red('Sync error'));
        Logger.error(`Sync error: ${error}`);
      }
    }
  };

  watcher.on('change', (filePath) => {
    changeQueue.push(filePath);
    clearTimeout(changeTimeout);
    changeTimeout = setTimeout(processChanges, 1000); // Debounce changes
  });

  watcher.on('add', (filePath) => {
    console.log(chalk.green(`➕ Added: ${path.relative(projectPath, filePath)}`));
  });

  watcher.on('unlink', (filePath) => {
    console.log(chalk.red(`➖ Removed: ${path.relative(projectPath, filePath)}`));
  });

  console.log(chalk.green('👁️  Watching for changes... (Press Ctrl+C to stop)'));

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n🛑 Stopping file watcher...'));
    watcher.close();
    process.exit(0);
  });
}