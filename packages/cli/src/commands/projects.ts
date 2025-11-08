/**
 * Projects Commands
 * Manage projects from web.recoder.xyz
 * Enables seamless Web ↔ CLI workflow
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import open from 'open';
import Table from 'cli-table3';
import * as fs from 'fs-extra';
import * as path from 'path';
import { backendClient } from '../services/backend-client';
import { Logger } from 'recoder-shared';

const logger = Logger.getInstance();

export function createProjectsCommand(): Command {
  const projectsCommand = new Command('projects')
    .description('Manage projects from web.recoder.xyz');

  /**
   * List all projects from web.recoder.xyz
   * Usage: recoder projects list
   */
  projectsCommand
    .command('list')
    .description('List your projects from web.recoder.xyz')
    .option('-l, --limit <number>', 'Number of projects to show', '50')
    .action(async (options) => {
      const spinner = ora('Fetching projects from web.recoder.xyz...').start();

      try {
        // Get user's anonymous ID or user ID from config
        const config = await import('../utils/config');
        const userConfig = config.getConfig();

        const anonymousId = userConfig.anonymousId;
        const userId = userConfig.userId;

        if (!anonymousId && !userId) {
          spinner.fail('Not authenticated. Please run: recoder auth login');
          console.log(chalk.gray('\nTip: Authenticate with device flow:'));
          console.log(chalk.cyan('  recoder auth login --device-flow'));
          return;
        }

        // Call backend API
        const params = new URLSearchParams();
        if (userId) params.append('userId', userId);
        if (anonymousId) params.append('anonymousId', anonymousId);
        params.append('limit', options.limit);

        const webAppUrl = process.env.RECODER_WEB_URL || 'https://web.recoder.xyz';
        const response = await fetch(`${webAppUrl}/api/chat-history?${params.toString()}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch projects: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.success || !data.data) {
          throw new Error('Invalid response from server');
        }

        const projects = data.data;

        spinner.stop();

        if (projects.length === 0) {
          console.log(chalk.yellow('\n📭 No projects found'));
          console.log(chalk.gray('\nCreate your first project at: ') + chalk.cyan(webAppUrl));
          return;
        }

        // Display projects in a table
        const table = new Table({
          head: [
            chalk.cyan('ID'),
            chalk.cyan('Title'),
            chalk.cyan('Messages'),
            chalk.cyan('Last Updated')
          ],
          colWidths: [15, 40, 12, 15],
          style: {
            head: [],
            border: ['gray']
          }
        });

        projects.forEach((project: any) => {
          const shortId = project.urlId.substring(0, 12) + '...';
          const title = (project.description || 'Untitled Project').substring(0, 35);
          const messages = project.messageCount || 0;
          const date = new Date(project.timestamp).toLocaleDateString();

          table.push([shortId, title, messages.toString(), date]);
        });

        console.log('\n' + table.toString());

        console.log(chalk.gray('\n💡 Tips:'));
        console.log(chalk.gray('  • Open in browser:  ') + chalk.cyan(`recoder projects open <id>`));
        console.log(chalk.gray('  • Download to local: ') + chalk.cyan(`recoder projects download <id>`));
        console.log(chalk.gray(`\n📊 Showing ${projects.length} project(s)\n`));

      } catch (error: any) {
        spinner.fail('Failed to fetch projects');
        console.error(chalk.red(`\n❌ Error: ${error.message}`));
        logger.error('Failed to fetch projects:', error);
        process.exit(1);
      }
    });

  /**
   * Open project in browser
   * Usage: recoder projects open <projectId>
   */
  projectsCommand
    .command('open <projectId>')
    .description('Open project in web.recoder.xyz browser')
    .action(async (projectId: string) => {
      const webAppUrl = process.env.RECODER_WEB_URL || 'https://web.recoder.xyz';
      const url = `${webAppUrl}/chat/${projectId}`;

      console.log(chalk.blue(`\n🌐 Opening project in browser...`));
      console.log(chalk.gray(`   ${url}\n`));

      try {
        await open(url);
        console.log(chalk.green('✅ Opened successfully!\n'));
      } catch (error: any) {
        console.error(chalk.red(`❌ Failed to open browser: ${error.message}`));
        console.log(chalk.gray(`\nManually open: ${url}\n`));
      }
    });

  /**
   * Download project files from web to local
   * Usage: recoder projects download <projectId> [--dir ./my-project]
   */
  projectsCommand
    .command('download <projectId>')
    .description('Download project files from web.recoder.xyz to local directory')
    .option('-d, --dir <directory>', 'Output directory', './project')
    .option('-f, --force', 'Overwrite existing files')
    .action(async (projectId: string, options: any) => {
      const spinner = ora('Downloading project from web.recoder.xyz...').start();

      try {
        const webAppUrl = process.env.RECODER_WEB_URL || 'https://web.recoder.xyz';

        // Fetch project with files
        const response = await fetch(`${webAppUrl}/api/chat-history?urlId=${projectId}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch project: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.success || !data.data || data.data.length === 0) {
          throw new Error('Project not found');
        }

        const chat = data.data[0]; // API returns array

        if (!chat.fileSnapshot || Object.keys(chat.fileSnapshot).length === 0) {
          spinner.warn('Project has no files to download');
          console.log(chalk.yellow('\n⚠️  This project doesn\'t have any files yet'));
          console.log(chalk.gray('   Create files in the web editor first\n'));
          return;
        }

        spinner.text = 'Creating directory structure...';

        const outputDir = path.resolve(options.dir);

        // Check if directory exists
        if (await fs.pathExists(outputDir) && !options.force) {
          spinner.fail('Directory already exists');
          console.log(chalk.red(`\n❌ Directory already exists: ${outputDir}`));
          console.log(chalk.gray('   Use --force to overwrite, or choose a different directory\n'));
          return;
        }

        // Create output directory
        await fs.ensureDir(outputDir);

        spinner.text = 'Writing files to disk...';

        // Write all files
        let fileCount = 0;
        const files = chat.fileSnapshot;

        for (const [filePath, content] of Object.entries(files)) {
          // Remove leading /home/project/ or / from path
          let relativePath = filePath;
          if (relativePath.startsWith('/home/project/')) {
            relativePath = relativePath.substring('/home/project/'.length);
          } else if (relativePath.startsWith('/')) {
            relativePath = relativePath.substring(1);
          }

          const fullPath = path.join(outputDir, relativePath);

          // Ensure parent directory exists
          await fs.ensureDir(path.dirname(fullPath));

          // Write file
          await fs.writeFile(fullPath, content as string);
          fileCount++;
        }

        spinner.succeed(`Downloaded ${fileCount} files to ${outputDir}`);

        console.log(chalk.green(`\n✅ Project downloaded successfully!`));
        console.log(chalk.gray('\n📁 Project location: ') + chalk.cyan(outputDir));
        console.log(chalk.gray('\n💡 Next steps:'));
        console.log(chalk.gray('   1. ') + chalk.cyan(`cd ${path.basename(outputDir)}`));
        console.log(chalk.gray('   2. ') + chalk.cyan('npm install'));
        console.log(chalk.gray('   3. ') + chalk.cyan('npm run dev'));
        console.log();

        logger.info(`Downloaded project ${projectId} to ${outputDir} (${fileCount} files)`);

      } catch (error: any) {
        spinner.fail('Download failed');
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
        logger.error('Failed to download project:', error);
        process.exit(1);
      }
    });

  /**
   * Show project info
   * Usage: recoder projects info <projectId>
   */
  projectsCommand
    .command('info <projectId>')
    .description('Show detailed information about a project')
    .action(async (projectId: string) => {
      const spinner = ora('Fetching project details...').start();

      try {
        const webAppUrl = process.env.RECODER_WEB_URL || 'https://web.recoder.xyz';
        const response = await fetch(`${webAppUrl}/api/chat-history?urlId=${projectId}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch project: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.success || !data.data || data.data.length === 0) {
          throw new Error('Project not found');
        }

        const chat = data.data[0];
        const fileCount = chat.fileSnapshot ? Object.keys(chat.fileSnapshot).length : 0;
        const totalSize = chat.fileSnapshot
          ? Object.values(chat.fileSnapshot).reduce((sum: number, content: any) => sum + (content?.length || 0), 0)
          : 0;

        spinner.stop();

        console.log(chalk.cyan('\n📊 Project Information\n'));
        console.log(chalk.gray('ID:          ') + chalk.white(chat.urlId));
        console.log(chalk.gray('Title:       ') + chalk.white(chat.description || 'Untitled'));
        console.log(chalk.gray('Messages:    ') + chalk.white(chat.messages?.length || 0));
        console.log(chalk.gray('Files:       ') + chalk.white(fileCount));
        console.log(chalk.gray('Total Size:  ') + chalk.white(`${(totalSize / 1024).toFixed(2)} KB`));

        if (fileCount > 0) {
          console.log(chalk.cyan('\n📁 Files:\n'));
          const fileList = Object.keys(chat.fileSnapshot).slice(0, 10);
          fileList.forEach((filePath: string) => {
            console.log(chalk.gray('   • ') + filePath);
          });

          if (fileCount > 10) {
            console.log(chalk.gray(`   ... and ${fileCount - 10} more files`));
          }
        }

        console.log(chalk.cyan('\n🔗 Links:\n'));
        console.log(chalk.gray('   Web:  ') + chalk.blue(`${webAppUrl}/chat/${chat.urlId}`));
        console.log();

      } catch (error: any) {
        spinner.fail('Failed to fetch project info');
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
        process.exit(1);
      }
    });

  return projectsCommand;
}
