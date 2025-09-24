/**
 * Platform Integration Command
 * Manages cross-platform connectivity and synchronization
 */

import { Command } from 'commander';
import { platformIntegration } from '../services/platform-integration';
import { Logger } from '../utils/logger';
import { ConfigManager } from '../utils/config-manager';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';

const logger = new Logger('PlatformCommand');
const config = new ConfigManager();

export const platformCommand = new Command('platform')
  .description('Manage platform integration and cross-platform sync')
  .addHelpText('after', `
Examples:
  $ recoder platform status          # Check platform connection status
  $ recoder platform connect         # Connect to platform ecosystem
  $ recoder platform sync            # Sync current project to other platforms
  $ recoder platform sessions        # List active sessions across platforms
  $ recoder platform share <project> # Share project with other platforms
  $ recoder platform assist          # Request remote assistance from web platform
  $ recoder platform disconnect      # Disconnect from platform ecosystem
`);

/**
 * Check platform connection status
 */
platformCommand
  .command('status')
  .description('Check platform connection status')
  .option('-v, --verbose', 'Show detailed status information')
  .action(async (options) => {
    try {
      const spinner = ora('Checking platform status...').start();

      const sessionInfo = platformIntegration.getSessionInfo();
      const isConnected = platformIntegration.isConnected();

      spinner.stop();

      console.log(chalk.blue('\n🌐 Platform Integration Status\n'));
      
      console.log(`Connection: ${isConnected ? chalk.green('✅ Connected') : chalk.red('❌ Disconnected')}`);
      console.log(`Session ID: ${sessionInfo.sessionId || chalk.gray('None')}`);
      
      if (options.verbose && isConnected) {
        const sessions = await platformIntegration.getActiveSessions();
        const usageStats = await platformIntegration.getUsageStats();

        console.log(chalk.blue('\n📱 Active Sessions:'));
        sessions.forEach(session => {
          const status = session.connected ? chalk.green('●') : chalk.gray('○');
          console.log(`  ${status} ${session.platform} - ${session.lastSeen}`);
        });

        if (usageStats) {
          console.log(chalk.blue('\n📊 Usage Statistics:'));
          Object.entries(usageStats.platformUsage || {}).forEach(([platform, stats]: [string, any]) => {
            console.log(`  ${platform}: ${stats.requests} requests, ${stats.tokens} tokens`);
          });
        }
      }

      if (!isConnected) {
        console.log(chalk.yellow('\n💡 Run "recoder platform connect" to connect to the platform ecosystem'));
      }

    } catch (error) {
      console.error(chalk.red('Failed to check platform status:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Connect to platform ecosystem
 */
platformCommand
  .command('connect')
  .description('Connect to platform ecosystem')
  .option('--auto-sync', 'Enable automatic project synchronization')
  .action(async (options) => {
    try {
      // Check if already connected
      if (platformIntegration.isConnected()) {
        console.log(chalk.yellow('Already connected to platform ecosystem'));
        return;
      }

      // Check authentication
      const authToken = config.get('authToken');
      if (!authToken) {
        console.log(chalk.red('Please login first using "recoder auth login"'));
        return;
      }

      const spinner = ora('Connecting to platform ecosystem...').start();

      // Initialize platform integration
      await platformIntegration.initialize();

      spinner.succeed('Connected to platform ecosystem');

      // Set up event listeners
      platformIntegration.on('projectUpdate', (data) => {
        console.log(chalk.cyan('📦 Project updated from another platform'));
      });

      platformIntegration.on('generationComplete', (data) => {
        console.log(chalk.green('🤖 AI generation completed on another platform'));
      });

      platformIntegration.on('notification', (data) => {
        console.log(chalk.blue(`📱 ${data.title}: ${data.message}`));
      });

      if (options.autoSync) {
        config.set('autoSync', true);
        console.log(chalk.green('✅ Auto-sync enabled'));
      }

      console.log(chalk.blue('\n🌐 Platform integration active. You can now:'));
      console.log('  • Sync projects across platforms');
      console.log('  • Receive real-time notifications');
      console.log('  • Request remote assistance');
      console.log('  • Share projects with team members');

    } catch (error) {
      console.error(chalk.red('Failed to connect to platform:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Sync current project to other platforms
 */
platformCommand
  .command('sync')
  .description('Sync current project to other platforms')
  .option('-f, --force', 'Force sync even if no changes detected')
  .action(async (options) => {
    try {
      if (!platformIntegration.isConnected()) {
        console.log(chalk.red('Not connected to platform. Run "recoder platform connect" first.'));
        return;
      }

      const spinner = ora('Syncing project...').start();

      // Get current project data
      const projectData = {
        name: 'Current CLI Project',
        framework: 'react', // Detect from current directory
        files: [], // Scan current directory
        lastModified: new Date(),
        source: 'cli'
      };

      await platformIntegration.syncProject(projectData);

      spinner.succeed('Project synced to other platforms');
      
      console.log(chalk.green('✅ Your project is now available on:'));
      console.log('  • Web platform (recoder.xyz)');
      console.log('  • Chat platform');
      console.log('  • Mobile app');

    } catch (error) {
      console.error(chalk.red('Failed to sync project:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * List active sessions across platforms
 */
platformCommand
  .command('sessions')
  .description('List active sessions across platforms')
  .option('-a, --all', 'Show all sessions including inactive ones')
  .action(async (options) => {
    try {
      if (!platformIntegration.isConnected()) {
        console.log(chalk.red('Not connected to platform. Run "recoder platform connect" first.'));
        return;
      }

      const spinner = ora('Fetching sessions...').start();
      const sessions = await platformIntegration.getActiveSessions();
      spinner.stop();

      if (sessions.length === 0) {
        console.log(chalk.yellow('No active sessions found'));
        return;
      }

      console.log(chalk.blue('\n📱 Active Platform Sessions\n'));
      
      sessions.forEach(session => {
        const status = session.connected ? chalk.green('●') : chalk.gray('○');
        const platform = session.platform.padEnd(8);
        const lastSeen = new Date(session.lastActivity).toLocaleString();
        
        console.log(`${status} ${platform} | ${session.version.padEnd(10)} | ${lastSeen}`);
        
        if (session.capabilities?.length > 0) {
          console.log(`   Capabilities: ${chalk.gray(session.capabilities.join(', '))}`);
        }
      });

      console.log(chalk.gray(`\nTotal: ${sessions.length} sessions`));

    } catch (error) {
      console.error(chalk.red('Failed to fetch sessions:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Share project with other platforms
 */
platformCommand
  .command('share')
  .description('Share project with other platforms')
  .argument('[project]', 'Project ID or name to share')
  .option('-p, --platforms <platforms>', 'Comma-separated list of platforms to share with')
  .action(async (project, options) => {
    try {
      if (!platformIntegration.isConnected()) {
        console.log(chalk.red('Not connected to platform. Run "recoder platform connect" first.'));
        return;
      }

      let projectId = project;
      let platforms = options.platforms?.split(',') || [];

      // Interactive prompts if not provided
      if (!projectId) {
        const { selectedProject } = await inquirer.prompt([
          {
            type: 'input',
            name: 'selectedProject',
            message: 'Enter project ID or name:',
            validate: (input) => input.trim().length > 0 || 'Project ID/name is required'
          }
        ]);
        projectId = selectedProject;
      }

      if (platforms.length === 0) {
        const { selectedPlatforms } = await inquirer.prompt([
          {
            type: 'checkbox',
            name: 'selectedPlatforms',
            message: 'Select platforms to share with:',
            choices: [
              { name: 'Web Platform', value: 'web' },
              { name: 'Chat Platform', value: 'chat' },
              { name: 'Mobile App', value: 'mobile' },
              { name: 'Desktop App', value: 'desktop' }
            ],
            validate: (choices) => choices.length > 0 || 'Select at least one platform'
          }
        ]);
        platforms = selectedPlatforms;
      }

      const spinner = ora('Sharing project...').start();

      await platformIntegration.shareProject(projectId, platforms);

      spinner.succeed('Project shared successfully');

      console.log(chalk.green(`✅ Project "${projectId}" shared with:`));
      platforms.forEach(platform => {
        console.log(`  • ${platform.charAt(0).toUpperCase() + platform.slice(1)} Platform`);
      });

    } catch (error) {
      console.error(chalk.red('Failed to share project:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Request remote assistance
 */
platformCommand
  .command('assist')
  .description('Request remote assistance from web platform')
  .option('-d, --description <desc>', 'Description of the issue')
  .action(async (options) => {
    try {
      if (!platformIntegration.isConnected()) {
        console.log(chalk.red('Not connected to platform. Run "recoder platform connect" first.'));
        return;
      }

      let description = options.description;

      if (!description) {
        const { issueDescription } = await inquirer.prompt([
          {
            type: 'input',
            name: 'issueDescription',
            message: 'Describe the issue you need help with:',
            validate: (input) => input.trim().length > 0 || 'Description is required'
          }
        ]);
        description = issueDescription;
      }

      const spinner = ora('Creating remote assistance session...').start();

      const sessionData = {
        description,
        platform: 'cli',
        timestamp: new Date(),
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch
        }
      };

      const assistanceUrl = await platformIntegration.requestRemoteAssistance(sessionData);

      spinner.succeed('Remote assistance session created');

      console.log(chalk.green('\n✅ Remote assistance requested successfully!'));
      console.log(chalk.blue('\n🔗 Assistance URL:'));
      console.log(chalk.underline(assistanceUrl));
      console.log(chalk.gray('\nShare this URL with someone who can help you.'));
      console.log(chalk.gray('The session will expire in 1 hour.'));

    } catch (error) {
      console.error(chalk.red('Failed to request assistance:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Disconnect from platform ecosystem
 */
platformCommand
  .command('disconnect')
  .description('Disconnect from platform ecosystem')
  .option('-f, --force', 'Force disconnect without confirmation')
  .action(async (options) => {
    try {
      if (!platformIntegration.isConnected()) {
        console.log(chalk.yellow('Not connected to platform ecosystem'));
        return;
      }

      if (!options.force) {
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: 'Are you sure you want to disconnect from the platform ecosystem?',
            default: false
          }
        ]);

        if (!confirm) {
          console.log(chalk.gray('Disconnect cancelled'));
          return;
        }
      }

      const spinner = ora('Disconnecting from platform...').start();

      await platformIntegration.cleanup();

      spinner.succeed('Disconnected from platform ecosystem');

      console.log(chalk.yellow('🔌 Platform integration disabled'));
      console.log(chalk.gray('You can reconnect anytime using "recoder platform connect"'));

    } catch (error) {
      console.error(chalk.red('Failed to disconnect:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

export default platformCommand;