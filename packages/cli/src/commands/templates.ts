/**
 * Template management commands
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import boxen from 'boxen';
import path from 'path';
import fs from 'fs-extra';
import { Logger } from '@codecraft/shared';
import { TemplateService } from '../services/template';
import { ConfigManager } from '../utils/config';
import { requireAuth } from '../utils/auth';

export function setupTemplateCommands(program: Command): void {
  const templates = program
    .command('templates')
    .alias('tpl')
    .description('Template management and code generation');

  // List templates command
  templates
    .command('list')
    .alias('ls')
    .description('List available templates')
    .option('-c, --category <category>', 'filter by category')
    .option('-t, --type <type>', 'filter by template type')
    .option('-j, --json', 'output as JSON')
    .option('--mine', 'show only my templates')
    .option('--public', 'show only public templates')
    .option('--featured', 'show only featured templates')
    .action(async (options) => {
      try {
        await handleListTemplates(options);
      } catch (error) {
        Logger.error(`Failed to list templates: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Show template details
  templates
    .command('show <templateId>')
    .description('Show template details and preview')
    .option('-j, --json', 'output as JSON')
    .option('--preview', 'show template preview')
    .option('--files', 'show template file structure')
    .action(async (templateId, options) => {
      try {
        await handleShowTemplate(templateId, options);
      } catch (error) {
        Logger.error(`Failed to show template: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Create new template
  templates
    .command('create')
    .description('Create a new template')
    .option('-n, --name <name>', 'template name')
    .option('-d, --description <description>', 'template description')
    .option('-c, --category <category>', 'template category')
    .option('-s, --source <path>', 'source directory to create template from')
    .option('--interactive', 'interactive template creation')
    .option('--public', 'make template public')
    .action(async (options) => {
      try {
        await requireAuth();
        await handleCreateTemplate(options);
      } catch (error) {
        Logger.error(`Template creation failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Use template
  templates
    .command('use <templateId>')
    .description('Use a template to generate code')
    .option('-o, --output <directory>', 'output directory')
    .option('-n, --name <name>', 'project/component name')
    .option('-v, --variables <vars>', 'template variables (key=value,key2=value2)')
    .option('-c, --config <file>', 'load variables from config file')
    .option('--interactive', 'interactive variable input')
    .option('--preview', 'preview without generating files')
    .action(async (templateId, options) => {
      try {
        await handleUseTemplate(templateId, options);
      } catch (error) {
        Logger.error(`Template usage failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Edit template
  templates
    .command('edit <templateId>')
    .description('Edit an existing template')
    .option('-n, --name <name>', 'new template name')
    .option('-d, --description <description>', 'new description')
    .option('-c, --category <category>', 'new category')
    .option('--add-file <path>', 'add file to template')
    .option('--remove-file <path>', 'remove file from template')
    .option('--interactive', 'interactive editing')
    .action(async (templateId, options) => {
      try {
        await requireAuth();
        await handleEditTemplate(templateId, options);
      } catch (error) {
        Logger.error(`Template editing failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Delete template
  templates
    .command('delete <templateId>')
    .alias('rm')
    .description('Delete a template')
    .option('-f, --force', 'force deletion without confirmation')
    .action(async (templateId, options) => {
      try {
        await requireAuth();
        await handleDeleteTemplate(templateId, options);
      } catch (error) {
        Logger.error(`Template deletion failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Clone template
  templates
    .command('clone <templateId>')
    .description('Clone an existing template')
    .option('-n, --name <name>', 'name for cloned template')
    .option('--public', 'make clone public')
    .action(async (templateId, options) => {
      try {
        await requireAuth();
        await handleCloneTemplate(templateId, options);
      } catch (error) {
        Logger.error(`Template cloning failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Publish template
  templates
    .command('publish <templateId>')
    .description('Publish template to public registry')
    .option('--featured', 'request featured status')
    .option('--category <category>', 'template category')
    .option('--tags <tags>', 'template tags (comma-separated)')
    .action(async (templateId, options) => {
      try {
        await requireAuth();
        await handlePublishTemplate(templateId, options);
      } catch (error) {
        Logger.error(`Template publishing failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });

  // Search templates
  templates
    .command('search <query>')
    .description('Search templates')
    .option('-c, --category <category>', 'filter by category')
    .option('-t, --tags <tags>', 'filter by tags (comma-separated)')
    .option('-l, --limit <number>', 'limit results', '20')
    .option('-j, --json', 'output as JSON')
    .action(async (query, options) => {
      try {
        await handleSearchTemplates(query, options);
      } catch (error) {
        Logger.error(`Template search failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });
}

async function handleListTemplates(options: any): Promise<void> {
  const spinner = ora('Fetching templates...').start();

  try {
    const token = options.mine ? ConfigManager.get('auth.token') : null;
    const result = await TemplateService.listTemplates(token, {
      category: options.category,
      type: options.type,
      mine: options.mine,
      public: options.public,
      featured: options.featured,
    });
    
    if (result.success) {
      spinner.succeed(chalk.green(`Found ${result.templates.length} templates`));
      
      if (result.templates.length === 0) {
        console.log(chalk.yellow('No templates found.'));
        console.log(chalk.gray('Browse public templates or create your own with: codecraft templates create'));
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(result.templates, null, 2));
      } else {
        // Group templates by category
        const groupedTemplates = result.templates.reduce((acc: any, template: any) => {
          const category = template.category || 'Other';
          if (!acc[category]) acc[category] = [];
          acc[category].push(template);
          return acc;
        }, {});

        for (const [category, templates] of Object.entries(groupedTemplates)) {
          console.log(
            boxen(
              chalk.white(`📁 ${category.toUpperCase()}\n`) +
              (templates as any[]).map((template: any) => 
                chalk.cyan(`• ${template.name}`) + chalk.gray(` (${template.id})\n`) +
                chalk.gray(`  ${template.description}\n`) +
                chalk.gray(`  Type: ${template.type} | `) +
                (template.public ? chalk.green('Public') : chalk.yellow('Private')) +
                (template.featured ? chalk.blue(' ⭐ Featured') : '') +
                chalk.gray(` | Downloads: ${template.downloads || 0}\n`) +
                (template.tags ? chalk.gray(`  Tags: ${template.tags.join(', ')}`) : '')
              ).join('\n\n'),
              {
                padding: 1,
                borderStyle: 'round',
                borderColor: 'cyan',
                title: category,
              }
            )
          );
        }

        // Show usage stats
        const totalDownloads = result.templates.reduce((sum: number, t: any) => sum + (t.downloads || 0), 0);
        console.log(
          boxen(
            chalk.white('📊 Template Statistics\n') +
            chalk.gray(`Total templates: ${result.templates.length}\n`) +
            chalk.gray(`Public templates: ${result.templates.filter((t: any) => t.public).length}\n`) +
            chalk.gray(`Featured templates: ${result.templates.filter((t: any) => t.featured).length}\n`) +
            chalk.gray(`Total downloads: ${totalDownloads}`),
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'blue',
              title: 'Statistics',
            }
          )
        );
      }
    } else {
      spinner.fail(chalk.red('Failed to fetch templates'));
      console.log(chalk.red(result.error || 'Unknown error'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Failed to fetch templates'));
    throw error;
  }
}

async function handleShowTemplate(templateId: string, options: any): Promise<void> {
  const spinner = ora('Fetching template details...').start();

  try {
    const result = await TemplateService.getTemplate(templateId);
    
    if (result.success) {
      spinner.succeed(chalk.green('Template details retrieved'));
      
      const template = result.template;

      if (options.json) {
        console.log(JSON.stringify(template, null, 2));
      } else {
        console.log(
          boxen(
            chalk.white(`📄 ${template.name}\n`) +
            chalk.gray(`ID: ${template.id}\n`) +
            chalk.gray(`Type: ${template.type}\n`) +
            chalk.gray(`Category: ${template.category || 'Uncategorized'}\n`) +
            chalk.gray(`Description: ${template.description}\n`) +
            chalk.gray(`Author: ${template.author}\n`) +
            chalk.gray(`Version: ${template.version}\n`) +
            chalk.gray(`Downloads: ${template.downloads || 0}\n`) +
            chalk.gray(`Created: ${new Date(template.createdAt).toLocaleDateString()}\n`) +
            (template.tags ? chalk.gray(`Tags: ${template.tags.join(', ')}\n`) : '') +
            (template.public ? chalk.green('Public') : chalk.yellow('Private')) +
            (template.featured ? chalk.blue(' ⭐ Featured') : ''),
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'cyan',
              title: 'Template Details',
            }
          )
        );

        if (template.variables && template.variables.length > 0) {
          console.log(
            boxen(
              chalk.white('⚙️  Template Variables\n') +
              template.variables.map((variable: any) => 
                chalk.cyan(`• ${variable.name}`) + chalk.gray(` (${variable.type})\n`) +
                chalk.gray(`  ${variable.description}\n`) +
                (variable.default ? chalk.gray(`  Default: ${variable.default}\n`) : '') +
                (variable.required ? chalk.red('  Required') : chalk.green('  Optional'))
              ).join('\n\n'),
              {
                padding: 1,
                borderStyle: 'round',
                borderColor: 'blue',
                title: 'Variables',
              }
            )
          );
        }

        if (options.files && template.files) {
          console.log(
            boxen(
              chalk.white('📁 Template Files\n') +
              template.files.map((file: any) => 
                chalk.gray(`• ${file.path}`) +
                (file.template ? chalk.yellow(' (template)') : '') +
                (file.binary ? chalk.blue(' (binary)') : '')
              ).join('\n'),
              {
                padding: 1,
                borderStyle: 'round',
                borderColor: 'green',
                title: 'File Structure',
              }
            )
          );
        }

        if (options.preview && template.readme) {
          console.log(
            boxen(
              template.readme,
              {
                padding: 1,
                borderStyle: 'round',
                borderColor: 'yellow',
                title: 'README',
              }
            )
          );
        }

        // Show usage example
        console.log(
          boxen(
            chalk.white('🚀 Usage Example\n') +
            chalk.gray(`codecraft templates use ${template.id} --output ./my-project --name MyProject`),
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'green',
              title: 'Usage',
            }
          )
        );
      }
    } else {
      spinner.fail(chalk.red('Failed to fetch template details'));
      console.log(chalk.red(result.error || 'Template not found'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Failed to fetch template details'));
    throw error;
  }
}

async function handleCreateTemplate(options: any): Promise<void> {
  console.log(
    boxen(
      chalk.cyan('📝 Create New Template'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  let templateConfig: any;

  if (options.interactive || !options.name) {
    templateConfig = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Template name:',
        default: options.name,
        validate: (input) => input.length >= 3 || 'Template name must be at least 3 characters',
      },
      {
        type: 'input',
        name: 'description',
        message: 'Template description:',
        default: options.description,
        validate: (input) => input.length >= 10 || 'Description must be at least 10 characters',
      },
      {
        type: 'list',
        name: 'category',
        message: 'Template category:',
        default: options.category,
        choices: [
          { name: '🌐 Web Application', value: 'web' },
          { name: '📱 Mobile Application', value: 'mobile' },
          { name: '⛓️  Blockchain/Web3', value: 'blockchain' },
          { name: '🧠 AI/ML', value: 'ai' },
          { name: '🔧 Backend/API', value: 'backend' },
          { name: '📊 Data Science', value: 'data' },
          { name: '🎮 Game Development', value: 'game' },
          { name: '🖥️  Desktop Application', value: 'desktop' },
          { name: '🧩 Component/Library', value: 'component' },
          { name: '📋 Boilerplate', value: 'boilerplate' },
        ],
      },
      {
        type: 'list',
        name: 'type',
        message: 'Template type:',
        choices: [
          { name: 'Full Project', value: 'project' },
          { name: 'Component', value: 'component' },
          { name: 'Feature', value: 'feature' },
          { name: 'Configuration', value: 'config' },
          { name: 'Documentation', value: 'docs' },
        ],
      },
      {
        type: 'input',
        name: 'source',
        message: 'Source directory:',
        default: options.source || '.',
        validate: async (input) => {
          const exists = await fs.pathExists(input);
          return exists || 'Source directory does not exist';
        },
      },
      {
        type: 'input',
        name: 'tags',
        message: 'Tags (comma-separated):',
        filter: (input) => input.split(',').map((tag: string) => tag.trim()).filter(Boolean),
      },
      {
        type: 'confirm',
        name: 'public',
        message: 'Make template public?',
        default: options.public || false,
      },
    ]);
  } else {
    templateConfig = {
      name: options.name,
      description: options.description || `${options.name} template`,
      category: options.category || 'component',
      type: 'component',
      source: options.source || '.',
      tags: [],
      public: options.public || false,
    };
  }

  // Validate source directory
  if (!await fs.pathExists(templateConfig.source)) {
    console.log(chalk.red(`Source directory does not exist: ${templateConfig.source}`));
    return;
  }

  const spinner = ora('Creating template...').start();

  try {
    const token = ConfigManager.get('auth.token');
    const result = await TemplateService.createTemplate(token, templateConfig);
    
    if (result.success) {
      spinner.succeed(chalk.green('Template created successfully!'));
      
      console.log(
        boxen(
          chalk.white(`📄 ${result.template.name}\n`) +
          chalk.gray(`ID: ${result.template.id}\n`) +
          chalk.gray(`Type: ${result.template.type}\n`) +
          chalk.gray(`Category: ${result.template.category}\n`) +
          chalk.gray(`Files: ${result.template.fileCount}\n`) +
          (result.template.public ? chalk.green('Public') : chalk.yellow('Private')),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'green',
            title: 'Template Created',
          }
        )
      );

      // Ask if user wants to test the template
      const testTemplate = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'test',
          message: 'Test the template now?',
          default: true,
        },
      ]);

      if (testTemplate.test) {
        await handleUseTemplate(result.template.id, { 
          output: './test-template-output',
          preview: true 
        });
      }
    } else {
      spinner.fail(chalk.red('Template creation failed'));
      console.log(chalk.red(result.error || 'Unknown error'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Template creation failed'));
    throw error;
  }
}

async function handleUseTemplate(templateId: string, options: any): Promise<void> {
  console.log(
    boxen(
      chalk.cyan(`🚀 Using Template: ${templateId}`),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  // First get template details to understand variables
  const spinner = ora('Loading template...').start();
  
  try {
    const templateResult = await TemplateService.getTemplate(templateId);
    
    if (!templateResult.success) {
      spinner.fail(chalk.red('Failed to load template'));
      console.log(chalk.red(templateResult.error || 'Template not found'));
      return;
    }

    spinner.succeed(chalk.green('Template loaded'));
    
    const template = templateResult.template;
    let variables: any = {};

    // Parse variables from command line
    if (options.variables) {
      const varPairs = options.variables.split(',');
      for (const pair of varPairs) {
        const [key, value] = pair.split('=');
        if (key && value) {
          variables[key.trim()] = value.trim();
        }
      }
    }

    // Load variables from config file
    if (options.config) {
      try {
        const configVars = await fs.readJson(options.config);
        variables = { ...variables, ...configVars };
      } catch (error) {
        console.log(chalk.yellow(`Warning: Could not load config file: ${options.config}`));
      }
    }

    // Interactive variable input
    if (options.interactive || (template.variables && template.variables.length > 0)) {
      const promptVars = template.variables.filter((v: any) => 
        variables[v.name] === undefined && (v.required || options.interactive)
      );

      if (promptVars.length > 0) {
        console.log(
          boxen(
            chalk.white('⚙️  Template Variables'),
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'blue',
            }
          )
        );

        const responses = await inquirer.prompt(
          promptVars.map((variable: any) => ({
            type: variable.type === 'boolean' ? 'confirm' : 'input',
            name: variable.name,
            message: `${variable.description}:`,
            default: variable.default || variables[variable.name],
            validate: variable.required ? 
              (input: any) => (input !== '' && input !== null && input !== undefined) || `${variable.name} is required` :
              () => true,
          }))
        );

        variables = { ...variables, ...responses };
      }
    }

    // Set default values for missing variables
    if (template.variables) {
      for (const variable of template.variables) {
        if (variables[variable.name] === undefined && variable.default !== undefined) {
          variables[variable.name] = variable.default;
        }
      }
    }

    // Add common variables
    const projectName = options.name || path.basename(options.output || process.cwd());
    variables = {
      projectName,
      projectNamePascal: projectName.replace(/[-_]/g, ' ').replace(/\w\S*/g, (txt) => 
        txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
      ).replace(/\s/g, ''),
      projectNameKebab: projectName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      projectNameSnake: projectName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      timestamp: new Date().toISOString(),
      year: new Date().getFullYear(),
      ...variables,
    };

    const outputDir = options.output || `./${projectName}`;

    if (options.preview) {
      // Show preview without generating files
      console.log(
        boxen(
          chalk.white('👀 Template Preview\n') +
          chalk.gray(`Template: ${template.name}\n`) +
          chalk.gray(`Output: ${outputDir}\n`) +
          chalk.gray(`Variables: ${Object.keys(variables).length}\n`) +
          chalk.gray('Files will be generated with provided variables'),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
            title: 'Preview Mode',
          }
        )
      );

      if (Object.keys(variables).length > 0) {
        console.log(
          boxen(
            chalk.white('Variables:\n') +
            Object.entries(variables).map(([key, value]) => 
              chalk.cyan(`${key}: `) + chalk.gray(String(value))
            ).join('\n'),
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'blue',
              title: 'Variables',
            }
          )
        );
      }
      return;
    }

    // Check if output directory exists and is not empty
    if (await fs.pathExists(outputDir)) {
      const files = await fs.readdir(outputDir);
      if (files.length > 0) {
        const confirmed = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'overwrite',
            message: `Output directory "${outputDir}" is not empty. Continue?`,
            default: false,
          },
        ]);

        if (!confirmed.overwrite) {
          console.log(chalk.yellow('Template usage cancelled.'));
          return;
        }
      }
    }

    const generateSpinner = ora('Generating files from template...').start();

    const result = await TemplateService.useTemplate(templateId, {
      outputDir,
      variables,
    });
    
    if (result.success) {
      generateSpinner.succeed(chalk.green('Template generated successfully!'));
      
      console.log(
        boxen(
          chalk.white(`🎉 Generated: ${template.name}\n`) +
          chalk.gray(`Output: ${outputDir}\n`) +
          chalk.gray(`Files created: ${result.generation.filesCreated}\n`) +
          chalk.gray(`Directories created: ${result.generation.directoriesCreated}`),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'green',
            title: 'Generation Complete',
          }
        )
      );

      if (result.generation.createdFiles && result.generation.createdFiles.length > 0) {
        console.log(
          boxen(
            chalk.white('📁 Created Files:\n') +
            result.generation.createdFiles.slice(0, 10).map((file: string) => 
              chalk.gray(`• ${file}`)
            ).join('\n') +
            (result.generation.createdFiles.length > 10 ? 
              chalk.gray(`\n... and ${result.generation.createdFiles.length - 10} more files`) : ''),
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'blue',
              title: 'Files',
            }
          )
        );
      }

      // Show next steps if available
      if (template.instructions) {
        console.log(
          boxen(
            template.instructions,
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
              title: 'Next Steps',
            }
          )
        );
      } else {
        console.log(
          boxen(
            chalk.white('🚀 Next Steps:\n') +
            chalk.gray(`1. cd ${outputDir}\n`) +
            chalk.gray('2. Review generated files\n') +
            chalk.gray('3. Install dependencies (if applicable)\n') +
            chalk.gray('4. Start development!'),
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
              title: 'Next Steps',
            }
          )
        );
      }
    } else {
      generateSpinner.fail(chalk.red('Template generation failed'));
      console.log(chalk.red(result.error || 'Unknown error'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Template usage failed'));
    throw error;
  }
}

async function handleEditTemplate(templateId: string, options: any): Promise<void> {
  console.log(
    boxen(
      chalk.cyan(`✏️  Edit Template: ${templateId}`),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  // Implementation for editing templates
  console.log(chalk.yellow('🚧 Template editing functionality coming soon!'));
  
  console.log(
    boxen(
      chalk.white('📝 Planned Features:\n') +
      chalk.gray('• Edit template metadata\n') +
      chalk.gray('• Add/remove template files\n') +
      chalk.gray('• Modify template variables\n') +
      chalk.gray('• Update template logic\n') +
      chalk.gray('• Version management'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'blue',
        title: 'Coming Soon',
      }
    )
  );
}

async function handleDeleteTemplate(templateId: string, options: any): Promise<void> {
  if (!options.force) {
    const confirmed = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'delete',
        message: `Are you sure you want to delete template "${templateId}"?`,
        default: false,
      },
    ]);

    if (!confirmed.delete) {
      console.log(chalk.yellow('Template deletion cancelled.'));
      return;
    }
  }

  const spinner = ora('Deleting template...').start();

  try {
    const token = ConfigManager.get('auth.token');
    const result = await TemplateService.deleteTemplate(token, templateId);
    
    if (result.success) {
      spinner.succeed(chalk.green('Template deleted successfully!'));
    } else {
      spinner.fail(chalk.red('Template deletion failed'));
      console.log(chalk.red(result.error || 'Unknown error'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Template deletion failed'));
    throw error;
  }
}

async function handleCloneTemplate(templateId: string, options: any): Promise<void> {
  const spinner = ora('Cloning template...').start();

  try {
    const token = ConfigManager.get('auth.token');
    const result = await TemplateService.cloneTemplate(token, templateId, {
      name: options.name,
      public: options.public,
    });
    
    if (result.success) {
      spinner.succeed(chalk.green('Template cloned successfully!'));
      
      console.log(
        boxen(
          chalk.white(`📄 ${result.template.name}\n`) +
          chalk.gray(`Original ID: ${templateId}\n`) +
          chalk.gray(`Clone ID: ${result.template.id}\n`) +
          chalk.gray(`Status: ${result.template.public ? 'Public' : 'Private'}`),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'green',
            title: 'Template Cloned',
          }
        )
      );
    } else {
      spinner.fail(chalk.red('Template cloning failed'));
      console.log(chalk.red(result.error || 'Unknown error'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Template cloning failed'));
    throw error;
  }
}

async function handlePublishTemplate(templateId: string, options: any): Promise<void> {
  const spinner = ora('Publishing template...').start();

  try {
    const token = ConfigManager.get('auth.token');
    const result = await TemplateService.publishTemplate(token, templateId, {
      featured: options.featured,
      category: options.category,
      tags: options.tags ? options.tags.split(',').map((tag: string) => tag.trim()) : [],
    });
    
    if (result.success) {
      spinner.succeed(chalk.green('Template published successfully!'));
      
      console.log(
        boxen(
          chalk.white(`🎉 Template Published!\n`) +
          chalk.gray(`Template ID: ${templateId}\n`) +
          chalk.gray(`Status: Public\n`) +
          (options.featured ? chalk.blue('Featured request submitted\n') : '') +
          chalk.gray(`Registry URL: ${result.registryUrl}`),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'green',
            title: 'Published',
          }
        )
      );
    } else {
      spinner.fail(chalk.red('Template publishing failed'));
      console.log(chalk.red(result.error || 'Unknown error'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Template publishing failed'));
    throw error;
  }
}

async function handleSearchTemplates(query: string, options: any): Promise<void> {
  const spinner = ora('Searching templates...').start();

  try {
    const result = await TemplateService.searchTemplates(query, {
      category: options.category,
      tags: options.tags ? options.tags.split(',').map((tag: string) => tag.trim()) : [],
      limit: parseInt(options.limit),
    });
    
    if (result.success) {
      spinner.succeed(chalk.green(`Found ${result.templates.length} templates matching "${query}"`));
      
      if (result.templates.length === 0) {
        console.log(chalk.yellow('No templates found matching your search.'));
        console.log(chalk.gray('Try different keywords or create your own template.'));
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(result.templates, null, 2));
      } else {
        console.log(
          boxen(
            chalk.white(`🔍 Search Results for "${query}"\n`) +
            result.templates.map((template: any) => 
              chalk.cyan(`• ${template.name}`) + chalk.gray(` (${template.id})\n`) +
              chalk.gray(`  ${template.description}\n`) +
              chalk.gray(`  Category: ${template.category} | Type: ${template.type}\n`) +
              chalk.gray(`  Author: ${template.author} | Downloads: ${template.downloads || 0}\n`) +
              (template.tags ? chalk.gray(`  Tags: ${template.tags.join(', ')}`) : '') +
              (template.featured ? chalk.blue(' ⭐ Featured') : '')
            ).join('\n\n'),
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'cyan',
            }
          )
        );

        console.log(
          boxen(
            chalk.white('💡 Usage Tip\n') +
            chalk.gray('Use template with: ') + chalk.cyan('codecraft templates use <template-id>'),
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'blue',
              title: 'Tip',
            }
          )
        );
      }
    } else {
      spinner.fail(chalk.red('Template search failed'));
      console.log(chalk.red(result.error || 'Unknown error'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Template search failed'));
    throw error;
  }
}