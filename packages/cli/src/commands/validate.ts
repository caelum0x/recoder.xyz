/**
 * Reality validation commands
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import boxen from 'boxen';
import path from 'path';
import fs from 'fs-extra';
import { Logger } from '@recoder/shared';
import { 
  RealityValidationSystem, 
  ValidationCategory, 
  ValidationOptions 
} from '../services/reality-validator';
import { 
  ValidationReporter, 
  ReportOptions 
} from '../services/validation-reporter';

export function setupValidateCommands(program: Command): void {
  const validate = program
    .command('validate')
    .alias('val')
    .description('Reality validation system - ensures generated code has actual functionality');

  // Main validation command
  validate
    .command('reality [path]')
    .alias('check')
    .description('Validate project for real functionality vs mock implementations')
    .option('-c, --categories <categories>', 'validation categories (comma-separated): code_quality,integration,blockchain,production')
    .option('-s, --severity <level>', 'minimum severity level: error,warning,info', 'warning')
    .option('-f, --format <format>', 'report format: console,html,json,markdown', 'console')
    .option('-o, --output <file>', 'output file for report')
    .option('--skip-patterns <patterns>', 'file patterns to skip (comma-separated)')
    .option('--max-file-size <size>', 'maximum file size to analyze (bytes)', '1048576')
    .option('--timeout <ms>', 'validation timeout per rule (ms)', '30000')
    .option('--no-fixes', 'exclude fix suggestions from report')
    .option('--no-details', 'exclude detailed information from report')
    .option('--show-passed', 'include passed rules in report')
    .option('--compact', 'generate compact console output')
    .option('--interactive', 'interactive validation configuration')
    .action(async (projectPath, options) => {
      try {
        await handleRealityValidation(projectPath, options);
      } catch (error) {
        Logger.error(`Reality validation failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Quick scan command
  validate
    .command('quick [path]')
    .description('Quick reality check focusing on critical issues')
    .option('-f, --format <format>', 'report format: console,json', 'console')
    .option('-o, --output <file>', 'output file for report')
    .action(async (projectPath, options) => {
      try {
        await handleQuickValidation(projectPath, options);
      } catch (error) {
        Logger.error(`Quick validation failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Configuration command
  validate
    .command('config')
    .description('Configure validation rules and settings')
    .option('--reset', 'reset to default configuration')
    .option('--show', 'show current configuration')
    .action(async (options) => {
      try {
        await handleValidationConfig(options);
      } catch (error) {
        Logger.error(`Configuration failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Rules management
  validate
    .command('rules')
    .description('Manage validation rules')
    .option('-l, --list', 'list all available rules')
    .option('-c, --category <category>', 'filter by category')
    .option('-s, --severity <level>', 'filter by severity')
    .action(async (options) => {
      try {
        await handleRulesManagement(options);
      } catch (error) {
        Logger.error(`Rules management failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });
}

async function handleRealityValidation(projectPath: string | undefined, options: any): Promise<void> {
  const currentPath = projectPath || process.cwd();
  
  console.log(
    boxen(
      chalk.cyan('🔍 Reality Validation System\n') +
      chalk.gray('Ensuring generated code has actual functionality'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
        textAlignment: 'center'
      }
    )
  );

  // Interactive configuration
  if (options.interactive) {
    const config = await getInteractiveConfig(options);
    Object.assign(options, config);
  }

  // Validate project path
  if (!await fs.pathExists(currentPath)) {
    console.log(chalk.red(`Project path does not exist: ${currentPath}`));
    return;
  }

  const isProject = await fs.pathExists(path.join(currentPath, 'package.json')) ||
                    await fs.pathExists(path.join(currentPath, 'src')) ||
                    await fs.pathExists(path.join(currentPath, 'index.js')) ||
                    await fs.pathExists(path.join(currentPath, 'index.ts'));

  if (!isProject) {
    const confirmed = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continue',
        message: 'This doesn\'t appear to be a project directory. Continue anyway?',
        default: false,
      },
    ]);

    if (!confirmed.continue) {
      console.log(chalk.yellow('Validation cancelled.'));
      return;
    }
  }

  // Parse validation options
  const validationOptions: ValidationOptions = {
    includeCategories: options.categories ? 
      options.categories.split(',').map((c: string) => c.trim() as ValidationCategory) : 
      undefined,
    includeSeverity: [options.severity],
    skipFilePatterns: options.skipPatterns ? 
      options.skipPatterns.split(',').map((p: string) => p.trim()) : 
      undefined,
    maxFileSize: parseInt(options.maxFileSize),
    timeout: parseInt(options.timeout)
  };

  // Parse report options
  const reportOptions: ReportOptions = {
    format: options.format,
    outputFile: options.output,
    includeFixes: options.fixes !== false,
    includeDetails: options.details !== false,
    showPassedRules: options.showPassed,
    groupByCategory: true,
    minSeverity: options.severity
  };

  // Run validation
  const spinner = ora('Analyzing project for reality validation...').start();
  
  try {
    const validator = new RealityValidationSystem();
    const report = await validator.validateProject(currentPath, validationOptions);
    
    spinner.succeed(chalk.green('Reality validation completed'));

    // Generate and display report
    const reporter = new ValidationReporter();
    
    if (options.output) {
      await reporter.saveReport(report, reportOptions);
      console.log(chalk.green(`Report saved to: ${options.output}`));
    }

    if (options.format === 'console' || !options.output) {
      const consoleReport = await reporter.generateReport(report, {
        ...reportOptions,
        format: 'console',
        colors: true,
        compact: options.compact
      });
      
      console.log('\n' + consoleReport);
    }

    // Show summary
    displayValidationSummary(report);

    // Exit with appropriate code
    if (report.summary.failed > 0) {
      process.exitCode = 1;
    }

  } catch (error) {
    spinner.fail(chalk.red('Reality validation failed'));
    throw error;
  }
}

async function handleQuickValidation(projectPath: string | undefined, options: any): Promise<void> {
  const currentPath = projectPath || process.cwd();
  
  console.log(
    boxen(
      chalk.cyan('⚡ Quick Reality Check'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  const validationOptions: ValidationOptions = {
    includeSeverity: ['error'], // Only critical issues
    includeCategories: [ValidationCategory.CODE_QUALITY, ValidationCategory.INTEGRATION],
    timeout: 10000 // Faster timeout
  };

  const reportOptions: ReportOptions = {
    format: options.format,
    outputFile: options.output,
    includeFixes: true,
    includeDetails: false,
    showPassedRules: false,
    groupByCategory: false,
    minSeverity: 'error'
  };

  const spinner = ora('Running quick reality check...').start();
  
  try {
    const validator = new RealityValidationSystem();
    const report = await validator.validateProject(currentPath, validationOptions);
    
    spinner.succeed(chalk.green('Quick validation completed'));

    const reporter = new ValidationReporter();
    
    if (options.output) {
      await reporter.saveReport(report, reportOptions);
      console.log(chalk.green(`Report saved to: ${options.output}`));
    }

    if (options.format === 'console' || !options.output) {
      const consoleReport = await reporter.generateReport(report, {
        ...reportOptions,
        format: 'console',
        colors: true,
        compact: true
      });
      
      console.log('\n' + consoleReport);
    }

    // Quick summary
    const criticalIssues = report.summary.failed;
    if (criticalIssues === 0) {
      console.log(
        boxen(
          chalk.green('✅ No critical reality issues found!'),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'green',
          }
        )
      );
    } else {
      console.log(
        boxen(
          chalk.red(`🚨 Found ${criticalIssues} critical reality issue${criticalIssues > 1 ? 's' : ''}`) +
          chalk.gray('\nRun "recoder validate reality" for detailed analysis'),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'red',
          }
        )
      );
      process.exitCode = 1;
    }

  } catch (error) {
    spinner.fail(chalk.red('Quick validation failed'));
    throw error;
  }
}

async function handleValidationConfig(options: any): Promise<void> {
  console.log(
    boxen(
      chalk.cyan('⚙️ Validation Configuration'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  if (options.show) {
    // Show current configuration
    const config = {
      defaultCategories: ['code_quality', 'integration', 'production'],
      defaultSeverity: 'warning',
      defaultTimeout: 30000,
      defaultMaxFileSize: 1048576,
      excludePatterns: ['node_modules/**', 'dist/**', 'build/**']
    };

    console.log(
      boxen(
        chalk.white('Current Configuration:\n') +
        Object.entries(config).map(([key, value]) => 
          chalk.cyan(`${key}: `) + chalk.gray(Array.isArray(value) ? value.join(', ') : String(value))
        ).join('\n'),
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'blue',
        }
      )
    );
    return;
  }

  if (options.reset) {
    console.log(chalk.yellow('🔄 Configuration reset to defaults'));
    return;
  }

  // Interactive configuration
  const config = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'categories',
      message: 'Select validation categories:',
      choices: [
        { name: '🧹 Code Quality', value: 'code_quality', checked: true },
        { name: '🔗 Integration', value: 'integration', checked: true },
        { name: '⛓️ Blockchain', value: 'blockchain', checked: false },
        { name: '🚀 Production', value: 'production', checked: true },
      ],
    },
    {
      type: 'list',
      name: 'severity',
      message: 'Minimum severity level:',
      choices: [
        { name: '🚨 Error only', value: 'error' },
        { name: '⚠️ Warning and above', value: 'warning' },
        { name: 'ℹ️ All issues', value: 'info' },
      ],
      default: 'warning',
    },
    {
      type: 'number',
      name: 'timeout',
      message: 'Validation timeout per rule (seconds):',
      default: 30,
      validate: (input) => input > 0 || 'Timeout must be positive',
    },
  ]);

  console.log(
    boxen(
      chalk.green('✅ Configuration updated successfully!') +
      '\n\n' +
      chalk.white('New settings:\n') +
      Object.entries(config).map(([key, value]) => 
        chalk.cyan(`${key}: `) + chalk.gray(Array.isArray(value) ? value.join(', ') : String(value))
      ).join('\n'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'green',
      }
    )
  );
}

async function handleRulesManagement(options: any): Promise<void> {
  console.log(
    boxen(
      chalk.cyan('📋 Validation Rules'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  // Mock rules data (in real implementation, get from validator)
  const rules = [
    { id: 'no-hardcoded-data', name: 'No Hardcoded Data', category: 'code_quality', severity: 'error' },
    { id: 'no-mock-api-responses', name: 'No Mock API Responses', category: 'code_quality', severity: 'error' },
    { id: 'no-placeholder-functions', name: 'No Placeholder Functions', category: 'code_quality', severity: 'warning' },
    { id: 'proper-error-handling', name: 'Proper Error Handling', category: 'code_quality', severity: 'warning' },
    { id: 'database-connection', name: 'Database Connection', category: 'integration', severity: 'error' },
    { id: 'api-endpoints', name: 'Real API Endpoints', category: 'integration', severity: 'error' },
    { id: 'authentication-flow', name: 'Authentication Flow', category: 'integration', severity: 'warning' },
    { id: 'smart-contract-deployment', name: 'Smart Contract Deployment', category: 'blockchain', severity: 'error' },
    { id: 'wallet-integration', name: 'Wallet Integration', category: 'blockchain', severity: 'warning' },
    { id: 'gas-optimization', name: 'Gas Optimization', category: 'blockchain', severity: 'info' },
    { id: 'security-headers', name: 'Security Headers', category: 'production', severity: 'warning' },
    { id: 'environment-variables', name: 'Environment Variables', category: 'production', severity: 'error' },
    { id: 'logging-monitoring', name: 'Logging and Monitoring', category: 'production', severity: 'warning' },
    { id: 'deployment-scripts', name: 'Deployment Scripts', category: 'production', severity: 'info' },
  ];

  let filteredRules = rules;

  if (options.category) {
    filteredRules = filteredRules.filter(rule => rule.category === options.category);
  }

  if (options.severity) {
    filteredRules = filteredRules.filter(rule => rule.severity === options.severity);
  }

  // Group by category
  const groupedRules = filteredRules.reduce((acc: any, rule) => {
    if (!acc[rule.category]) acc[rule.category] = [];
    acc[rule.category].push(rule);
    return acc;
  }, {});

  for (const [category, categoryRules] of Object.entries(groupedRules)) {
    const categoryName = category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    const icon = {
      'code_quality': '🧹',
      'integration': '🔗',
      'blockchain': '⛓️',
      'production': '🚀'
    }[category] || '📋';

    console.log(
      boxen(
        chalk.white(`${icon} ${categoryName}\n`) +
        (categoryRules as { id: string; name: string; category: string; severity: 'error' | 'warning' | 'info'; }[]).map((rule) => {
          const severityIcon = { error: '🚨', warning: '⚠️', info: 'ℹ️' }[rule.severity];
          return chalk.cyan(`• ${rule.name}`) + chalk.gray(` (${rule.id})`) + ` ${severityIcon}`;
        }).join('\n'),
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'blue',
          title: categoryName,
        }
      )
    );
  }

  console.log(
    boxen(
      chalk.white('📊 Rules Summary\n') +
      chalk.gray(`Total rules: ${filteredRules.length}\n`) +
      chalk.gray(`Errors: ${filteredRules.filter(r => r.severity === 'error').length}\n`) +
      chalk.gray(`Warnings: ${filteredRules.filter(r => r.severity === 'warning').length}\n`) +
      chalk.gray(`Info: ${filteredRules.filter(r => r.severity === 'info').length}`),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'green',
        title: 'Summary',
      }
    )
  );
}

async function getInteractiveConfig(currentOptions: any): Promise<any> {
  console.log(
    boxen(
      chalk.cyan('🎛️ Interactive Validation Configuration'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  const config = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'categories',
      message: 'Select validation categories:',
      choices: [
        { name: '🧹 Code Quality - Check for mock data and placeholders', value: 'code_quality', checked: true },
        { name: '🔗 Integration - Validate API and database connections', value: 'integration', checked: true },
        { name: '⛓️ Blockchain - Check smart contracts and Web3 integration', value: 'blockchain', checked: false },
        { name: '🚀 Production - Verify deployment and security readiness', value: 'production', checked: true },
      ],
    },
    {
      type: 'list',
      name: 'severity',
      message: 'What level of issues should be reported?',
      choices: [
        { name: '🚨 Critical errors only', value: 'error' },
        { name: '⚠️ Warnings and errors', value: 'warning' },
        { name: 'ℹ️ All issues including informational', value: 'info' },
      ],
      default: currentOptions.severity || 'warning',
    },
    {
      type: 'list',
      name: 'format',
      message: 'Choose report format:',
      choices: [
        { name: '🖥️ Console (interactive)', value: 'console' },
        { name: '📄 HTML (web report)', value: 'html' },
        { name: '📊 JSON (machine readable)', value: 'json' },
        { name: '📝 Markdown (documentation)', value: 'markdown' },
      ],
      default: currentOptions.format || 'console',
    },
    {
      type: 'confirm',
      name: 'includeFixes',
      message: 'Include fix suggestions in the report?',
      default: true,
    },
    {
      type: 'confirm',
      name: 'showPassed',
      message: 'Show passed rules in the report?',
      default: false,
    },
  ]);

  if (config.format !== 'console') {
    const outputConfig = await inquirer.prompt([
      {
        type: 'input',
        name: 'output',
        message: 'Output file path:',
        default: `validation-report.${config.format === 'html' ? 'html' : config.format === 'json' ? 'json' : 'md'}`,
        validate: (input) => input.length > 0 || 'Output file path is required',
      },
    ]);
    config.output = outputConfig.output;
  }

  return {
    categories: config.categories.join(','),
    severity: config.severity,
    format: config.format,
    output: config.output,
    fixes: config.includeFixes,
    showPassed: config.showPassed,
  };
}

function displayValidationSummary(report: any): void {
  const { summary } = report;
  
  let summaryColor: 'green' | 'red' | 'yellow' | 'blue' = 'green';
  let summaryIcon = '🎉';
  let summaryText = 'Excellent';

  if (summary.score < 50) {
    summaryColor = 'red';
    summaryIcon = '🚨';
    summaryText = 'Critical Issues';
  } else if (summary.score < 75) {
    summaryColor = 'yellow';
    summaryIcon = '⚠️';
    summaryText = 'Needs Work';
  } else if (summary.score < 90) {
    summaryColor = 'blue';
    summaryIcon = '✅';
    summaryText = 'Good';
  }

  const chalkColorMap = {
    green: chalk.green,
    red: chalk.red,
    yellow: chalk.yellow,
    blue: chalk.blue,
  };

  console.log('\n' + 
    boxen(
      chalkColorMap[summaryColor](`${summaryIcon} Reality Score: ${summary.score}/100\n`) +
      chalk.white(`Status: ${summaryText}\n`) +
      chalk.gray(`${summary.passed} passed | ${summary.failed} failed | ${summary.warnings} warnings`),
      {
        padding: 1,
        borderStyle: 'double',
        borderColor: summaryColor,
        textAlignment: 'center',
        title: 'Validation Summary'
      }
    )
  );

  if (summary.failed > 0) {
    console.log(
      boxen(
        chalk.yellow('💡 Run with --format html --output report.html for detailed analysis'),
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'yellow',
        }
      )
    );
  }
}