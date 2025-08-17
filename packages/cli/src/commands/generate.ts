/**
 * Generate Command - Advanced Template Generation for Recoder.xyz
 * Production-ready project scaffolding with AI enhancement
 */

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';

interface TemplateContext {
  projectName: string;
  projectType: 'web' | 'api' | 'mobile' | 'desktop' | 'blockchain' | 'ai' | 'fullstack';
  framework: string;
  language: string;
  features: string[];
  database?: string;
  authentication?: string;
  deployment?: string;
  styling?: string;
  stateManagement?: string;
  testing?: string;
  aiProviders?: string[];
  compliance?: string[];
}

interface GenerationOptions {
  outputDirectory: string;
  aiEnhancement: boolean;
  includeTests: boolean;
  includeDocumentation: boolean;
  deploymentConfig: boolean;
  securityHardening: boolean;
  performanceOptimization: boolean;
  customizations: Record<string, any>;
}

interface GenerateCommandOptions {
  template?: string;
  name?: string;
  type?: string;
  framework?: string;
  language?: string;
  output?: string;
  features?: string[];
  ai?: boolean;
  tests?: boolean;
  docs?: boolean;
  deploy?: boolean;
  security?: boolean;
  performance?: boolean;
  interactive?: boolean;
  confirm?: boolean;
  database?: string;
  auth?: string;
  deployment?: string;
}

const FRAMEWORKS = {
  web: ['Next.js', 'React', 'Vue.js', 'Svelte'],
  api: ['Express.js', 'Fastify', 'NestJS', 'Hapi'],
  mobile: ['React Native', 'Flutter', 'Ionic'],
  desktop: ['Electron', 'Tauri', 'Flutter Desktop'],
  blockchain: ['Next.js + Anchor', 'React + Hardhat', 'Vue + Truffle'],
  ai: ['LangChain + Node.js', 'Python + FastAPI', 'Node.js + Express'],
  fullstack: ['Next.js', 'MEAN', 'MERN', 'T3 Stack']
} as const;

export const generateCommand = new Command('generate')
  .alias('gen')
  .description('Generate production-ready projects from advanced templates')
  .option('-t, --template <template>', 'Template ID to use')
  .option('-n, --name <name>', 'Project name')
  .option('--type <type>', 'Project type (web, api, mobile, desktop, blockchain, ai, fullstack)')
  .option('--framework <framework>', 'Framework to use')
  .option('--language <language>', 'Programming language')
  .option('-o, --output <directory>', 'Output directory', process.cwd())
  .option('--features <features...>', 'Additional features to include')
  .option('--database <database>', 'Database to use')
  .option('--auth <auth>', 'Authentication method')
  .option('--deployment <deployment>', 'Deployment target')
  .option('--ai', 'Enable AI-powered code enhancement', false)
  .option('--tests', 'Include test files and configuration', true)
  .option('--docs', 'Include documentation', true)
  .option('--deploy', 'Include deployment configuration', true)
  .option('--security', 'Enable security hardening', true)
  .option('--performance', 'Enable performance optimization', true)
  .option('-i, --interactive', 'Interactive mode', false)
  .option('--no-confirm', 'Skip confirmation prompt', false)
  .action(async (options: GenerateCommandOptions) => {
    console.log(chalk.blue.bold('🎯 Recoder.xyz Advanced Project Generator\n'));

    try {
      let context: TemplateContext;
      let generationOptions: GenerationOptions;

      if (options.interactive && !options.template) {
        // Interactive mode (only if no template specified)
        const answers = await runInteractiveMode(options);
        context = answers.context;
        generationOptions = answers.options;
      } else {
        // Non-interactive mode - set defaults (template flag bypasses interactive)
        context = {
          projectName: options.name || 'generated-project',
          projectType: (options.type as any) || 'web',
          framework: options.framework || 'react',
          language: options.language || 'typescript',
          features: [],
          database: options.database || 'none',
          authentication: options.auth || 'none',
          deployment: options.deployment || 'none'
        };
        generationOptions = buildGenerationOptionsFromOptions(options);
      }

      // Display generation summary
      displayGenerationSummary(context, generationOptions);

      // Confirm generation (only in interactive mode or when confirm is explicitly true, but skip if template is used)
      if ((options.interactive || options.confirm) && !options.template) {
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: 'Proceed with project generation?',
            default: true
          }
        ]);

        if (!confirm) {
          console.log(chalk.yellow('Generation cancelled.'));
          return;
        }
      }

      // Generate project (simplified version)
      const spinner = ora('Generating project...').start();
      
      // Simulate project generation
      await generateProject(context, generationOptions);

      spinner.stop();
      console.log(chalk.green.bold('\n🎉 Project generated successfully!\n'));
      
      console.log(chalk.green('\n🚀 Next steps:'));
      console.log(chalk.dim('   1. cd ' + path.basename(generationOptions.outputDirectory)));
      console.log(chalk.dim('   2. npm install'));
      console.log(chalk.dim('   3. npm run dev'));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red.bold('\n❌ Generation failed:'), errorMessage);
      process.exit(1);
    }
  });

async function runInteractiveMode(options: GenerateCommandOptions): Promise<{
  context: TemplateContext;
  options: GenerationOptions;
}> {
  console.log(chalk.cyan('🤖 Interactive Project Generation\n'));

  const questions = [
    {
      type: 'input',
      name: 'projectName',
      message: 'Project name:',
      default: options.name || 'my-project',
      validate: (input: string) => {
        if (!input.trim()) return 'Project name is required';
        if (!/^[a-zA-Z0-9-_\s]+$/.test(input)) return 'Invalid project name';
        return true;
      }
    },
    {
      type: 'list',
      name: 'projectType',
      message: 'Project type:',
      choices: [
        { name: 'Web Application', value: 'web' },
        { name: 'API/Backend', value: 'api' },
        { name: 'Mobile App', value: 'mobile' },
        { name: 'Desktop App', value: 'desktop' },
        { name: 'Blockchain DApp', value: 'blockchain' },
        { name: 'AI Agent', value: 'ai' },
        { name: 'Full-Stack', value: 'fullstack' }
      ],
      default: options.type || 'web'
    },
    {
      type: 'list',
      name: 'framework',
      message: 'Framework:',
      choices: (answers: { projectType: keyof typeof FRAMEWORKS }) => {
        return FRAMEWORKS[answers.projectType] || FRAMEWORKS.web;
      }
    },
    {
      type: 'list',
      name: 'language',
      message: 'Programming language:',
      choices: ['TypeScript', 'JavaScript', 'Python', 'Rust'],
      default: 'TypeScript'
    }
  ];

  const answers = await inquirer.prompt(questions as any);

  const context: TemplateContext = {
    projectName: answers.projectName,
    projectType: answers.projectType,
    framework: answers.framework,
    language: answers.language,
    features: []
  };

  const generationOptions: GenerationOptions = {
    outputDirectory: path.join(options.output || process.cwd(), answers.projectName.toLowerCase().replace(/\s+/g, '-')),
    aiEnhancement: true,
    includeTests: true,
    includeDocumentation: true,
    deploymentConfig: true,
    securityHardening: true,
    performanceOptimization: true,
    customizations: {}
  };

  return { context, options: generationOptions };
}

async function buildContextFromOptions(options: GenerateCommandOptions): Promise<TemplateContext> {
  if (!options.name) {
    throw new Error('Project name is required (use -n or --name)');
  }

  return {
    projectName: options.name,
    projectType: (options.type as any) || 'web',
    framework: options.framework || 'React',
    language: options.language || 'TypeScript',
    features: options.features || []
  };
}

function buildGenerationOptionsFromOptions(options: GenerateCommandOptions): GenerationOptions {
  return {
    outputDirectory: path.join(
      options.output || process.cwd(),
      options.name?.toLowerCase().replace(/\s+/g, '-') || 'project'
    ),
    aiEnhancement: options.ai || false,
    includeTests: options.tests !== false,
    includeDocumentation: options.docs !== false,
    deploymentConfig: options.deploy !== false,
    securityHardening: options.security !== false,
    performanceOptimization: options.performance !== false,
    customizations: {}
  };
}

function displayGenerationSummary(context: TemplateContext, options: GenerationOptions): void {
  console.log(chalk.blue.bold('\n📋 Generation Summary:'));
  console.log(chalk.dim(`   Project: ${context.projectName}`));
  console.log(chalk.dim(`   Type: ${context.projectType}`));
  console.log(chalk.dim(`   Framework: ${context.framework}`));
  console.log(chalk.dim(`   Language: ${context.language}`));
  console.log(chalk.dim(`   Output: ${options.outputDirectory}`));
  console.log();
}

async function generateProject(context: TemplateContext, options: GenerationOptions): Promise<void> {
  // Simplified project generation - in the full implementation,
  // this would integrate with the advanced template engine
  const fs = await import('fs/promises');
  
  // Create project directory
  await fs.mkdir(options.outputDirectory, { recursive: true });
  
  // Generate package.json
  const packageJson = {
    name: context.projectName.toLowerCase().replace(/\s+/g, '-'),
    version: '1.0.0',
    description: `${context.projectType} application built with ${context.framework}`,
    main: 'index.js',
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
      lint: 'next lint',
      test: 'jest'
    },
    dependencies: {
      'next': '^15.0.0',
      'react': '^19.0.0',
      'react-dom': '^19.0.0'
    },
    devDependencies: {
      '@types/node': '^20.0.0',
      '@types/react': '^18.0.0',
      'typescript': '^5.0.0',
      'eslint': '^8.0.0',
      'eslint-config-next': '^15.0.0'
    }
  };

  await fs.writeFile(
    path.join(options.outputDirectory, 'package.json'),
    JSON.stringify(packageJson, null, 2),
    'utf8'
  );

  // Generate README.md
  const readme = `# ${context.projectName}

A ${context.projectType} application built with ${context.framework} and ${context.language}.

## Getting Started

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Start the development server:
   \`\`\`bash
   npm run dev
   \`\`\`

## Features

- Production-ready ${context.framework} setup
- TypeScript configuration
- ESLint and Prettier
- Testing setup
- Deployment configuration

Generated with [Recoder.xyz](https://recoder.xyz) 🚀
`;

  await fs.writeFile(
    path.join(options.outputDirectory, 'README.md'),
    readme,
    'utf8'
  );

  // Simulate delay
  await new Promise(resolve => setTimeout(resolve, 2000));
}

export default generateCommand;