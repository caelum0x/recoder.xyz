/**
 * Social Media Deployment Commands - Real Implementation
 * CLI commands to setup and manage automated social media deployments
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { Logger } from '../utils/logger';
import { socialMediaDeployer } from '../services/social-media-deployer';
import { deploymentHooks } from '../hooks/deployment-hooks';

export function createSocialDeployCommand(): Command {
  const command = new Command('social-deploy');
  
  command
    .description('Setup and manage automated social media deployment announcements')
    .addCommand(createSetupCommand())
    .addCommand(createTestCommand())
    .addCommand(createAnnounceCommand())
    .addCommand(createStatusCommand())
    .addCommand(createConfigCommand());

  return command;
}

function createSetupCommand(): Command {
  return new Command('setup')
    .description('Setup automated social media deployment hooks')
    .option('--git-hooks', 'Install git hooks for automatic posting')
    .option('--ci', 'Setup CI/CD integration (GitHub Actions, etc.)')
    .option('--vercel', 'Setup Vercel deployment integration')
    .option('--netlify', 'Setup Netlify deployment integration')
    .option('--all', 'Setup all available integrations')
    .action(async (options) => {
      console.log(chalk.cyan('🚀 Setting up automated social media deployments'));
      console.log(chalk.gray('This will configure your project to automatically post about deployments'));
      console.log();

      const spinner = ora('Initializing deployment hooks...').start();

      try {
        if (options.all) {
          spinner.text = 'Setting up all integrations...';
          await deploymentHooks.setupAll();
          spinner.succeed(chalk.green('✅ All integrations setup successfully!'));
        } else {
          if (options.gitHooks) {
            spinner.text = 'Installing git hooks...';
            await deploymentHooks.installGitHooks();
            spinner.succeed(chalk.green('✅ Git hooks installed'));
          }

          if (options.ci) {
            spinner.text = 'Setting up CI/CD integration...';
            await deploymentHooks.setupCIIntegration();
            spinner.succeed(chalk.green('✅ CI/CD integration setup'));
          }

          if (options.vercel) {
            spinner.text = 'Setting up Vercel integration...';
            await deploymentHooks.setupVercelIntegration();
            spinner.succeed(chalk.green('✅ Vercel integration setup'));
          }

          if (options.netlify) {
            spinner.text = 'Setting up Netlify integration...';
            await deploymentHooks.setupNetlifyIntegration();
            spinner.succeed(chalk.green('✅ Netlify integration setup'));
          }

          if (!options.gitHooks && !options.ci && !options.vercel && !options.netlify) {
            // Interactive setup
            spinner.stop();
            
            const answers = await inquirer.prompt([
              {
                type: 'checkbox',
                name: 'integrations',
                message: 'Which integrations would you like to setup?',
                choices: [
                  { name: 'Git Hooks (automatic on push/deploy)', value: 'git' },
                  { name: 'GitHub Actions / CI Integration', value: 'ci' },
                  { name: 'Vercel Deployment Hooks', value: 'vercel' },
                  { name: 'Netlify Deployment Hooks', value: 'netlify' }
                ]
              }
            ]);

            spinner.start();

            for (const integration of answers.integrations) {
              switch (integration) {
                case 'git':
                  spinner.text = 'Installing git hooks...';
                  await deploymentHooks.installGitHooks();
                  break;
                case 'ci':
                  spinner.text = 'Setting up CI/CD integration...';
                  await deploymentHooks.setupCIIntegration();
                  break;
                case 'vercel':
                  spinner.text = 'Setting up Vercel integration...';
                  await deploymentHooks.setupVercelIntegration();
                  break;
                case 'netlify':
                  spinner.text = 'Setting up Netlify integration...';
                  await deploymentHooks.setupNetlifyIntegration();
                  break;
              }
            }

            spinner.succeed(chalk.green('✅ Selected integrations setup successfully!'));
          }
        }

        console.log();
        console.log(chalk.yellow('📋 Next Steps:'));
        console.log(chalk.white('1. Configure your social media API keys in environment variables:'));
        console.log(chalk.gray('   TWITTER_API_KEY, TWITTER_ACCESS_TOKEN'));
        console.log(chalk.gray('   LINKEDIN_CLIENT_ID, LINKEDIN_ACCESS_TOKEN'));
        console.log(chalk.gray('   (AI content generation uses our built-in system)'));
        console.log(chalk.white('2. Test the integration with: recoder social-deploy test'));
        console.log(chalk.white('3. Deploy your project to see automatic social media posts!'));
        console.log();

      } catch (error) {
        spinner.fail(chalk.red('❌ Setup failed'));
        Logger.error('Social deploy setup failed:', error);
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

function createTestCommand(): Command {
  return new Command('test')
    .description('Test social media deployment announcements')
    .option('--platform <platform>', 'Test specific platform (twitter, linkedin, mastodon)')
    .option('--environment <env>', 'Test environment (development, staging, production)', 'development')
    .action(async (options) => {
      console.log(chalk.cyan('🧪 Testing social media deployment announcements'));
      console.log();

      const spinner = ora('Checking platform configurations...').start();

      try {
        // Check platform status
        const platformStatus = socialMediaDeployer.getPlatformStatus();
        spinner.stop();

        console.log(chalk.blue('📊 Platform Status:'));
        for (const [platform, status] of Object.entries(platformStatus)) {
          const statusIcon = status.enabled ? chalk.green('✅') : chalk.red('❌');
          const configIcon = status.configured ? chalk.green('🔑') : chalk.yellow('⚠️');
          console.log(`${statusIcon} ${configIcon} ${platform.padEnd(10)} ${status.enabled ? 'Enabled' : 'Disabled'} / ${status.configured ? 'Configured' : 'Not Configured'}`);
        }

        console.log();

        if (options.platform) {
          // Test specific platform
          spinner.start(`Testing ${options.platform} connection...`);
          const results = await socialMediaDeployer.testConnections();
          
          if (results[options.platform]) {
            spinner.succeed(chalk.green(`✅ ${options.platform} connection successful`));
          } else {
            spinner.fail(chalk.red(`❌ ${options.platform} connection failed`));
          }
        } else {
          // Test all platforms
          spinner.start('Testing all platform connections...');
          const results = await socialMediaDeployer.testConnections();
          spinner.stop();

          console.log(chalk.blue('🔗 Connection Test Results:'));
          for (const [platform, success] of Object.entries(results)) {
            const icon = success ? chalk.green('✅') : chalk.red('❌');
            console.log(`${icon} ${platform}: ${success ? 'Connected' : 'Failed'}`);
          }
        }

        console.log();

        // Test actual deployment announcement
        const { shouldTest } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldTest',
            message: 'Would you like to send a test deployment announcement?',
            default: false
          }
        ]);

        if (shouldTest) {
          spinner.start('Sending test deployment announcement...');
          await deploymentHooks.announceManualDeployment(options.environment as any);
          spinner.succeed(chalk.green('✅ Test announcement sent successfully!'));
          
          console.log();
          console.log(chalk.yellow('📱 Check your social media accounts to see the test post'));
        }

      } catch (error) {
        spinner.fail(chalk.red('❌ Test failed'));
        Logger.error('Social deploy test failed:', error);
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

function createAnnounceCommand(): Command {
  return new Command('announce')
    .description('Manually announce a deployment')
    .option('--project <name>', 'Project name')
    .option('--version <version>', 'Version number')
    .option('--environment <env>', 'Environment (development, staging, production)', 'development')
    .option('--url <url>', 'Deployment URL')
    .option('--changes <changes...>', 'List of changes')
    .action(async (options) => {
      console.log(chalk.cyan('📢 Manually announcing deployment'));
      console.log();

      let deploymentData = {
        projectName: options.project,
        version: options.version,
        environment: options.environment,
        deploymentUrl: options.url,
        changes: options.changes
      };

      // Interactive mode if no options provided
      if (!options.project || !options.version) {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'projectName',
            message: 'Project name:',
            default: deploymentData.projectName,
            validate: (input) => input.trim().length > 0 || 'Project name is required'
          },
          {
            type: 'input',
            name: 'version',
            message: 'Version:',
            default: deploymentData.version,
            validate: (input) => input.trim().length > 0 || 'Version is required'
          },
          {
            type: 'list',
            name: 'environment',
            message: 'Environment:',
            choices: ['development', 'staging', 'production'],
            default: deploymentData.environment
          },
          {
            type: 'input',
            name: 'deploymentUrl',
            message: 'Deployment URL (optional):',
            default: deploymentData.deploymentUrl
          },
          {
            type: 'input',
            name: 'changes',
            message: 'Key changes (comma-separated):',
            filter: (input) => input ? input.split(',').map((s: string) => s.trim()) : []
          }
        ]);

        deploymentData = { ...deploymentData, ...answers };
      }

      const spinner = ora('Generating and posting announcement...').start();

      try {
        const deploymentEvent = {
          projectName: deploymentData.projectName!,
          deploymentId: `manual_${Date.now()}`,
          version: deploymentData.version!,
          environment: deploymentData.environment as any,
          status: 'success' as const,
          timestamp: new Date(),
          deploymentUrl: deploymentData.deploymentUrl,
          changes: deploymentData.changes
        };

        const results = await socialMediaDeployer.announceDeployment(deploymentEvent);

        spinner.succeed(chalk.green('✅ Deployment announced successfully!'));

        console.log();
        console.log(chalk.blue('📊 Posting Results:'));
        for (const [platform, success] of results.entries()) {
          const icon = success ? chalk.green('✅') : chalk.red('❌');
          console.log(`${icon} ${platform}: ${success ? 'Posted' : 'Failed'}`);
        }

      } catch (error) {
        spinner.fail(chalk.red('❌ Announcement failed'));
        Logger.error('Manual announcement failed:', error);
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

function createStatusCommand(): Command {
  return new Command('status')
    .description('Show social media deployment status')
    .action(async () => {
      console.log(chalk.cyan('📊 Social Media Deployment Status'));
      console.log();

      const spinner = ora('Gathering status information...').start();

      try {
        const platformStatus = socialMediaDeployer.getPlatformStatus();
        spinner.stop();

        console.log(chalk.blue('🔗 Platform Configurations:'));
        console.log();

        for (const [platform, status] of Object.entries(platformStatus)) {
          const enabledIcon = status.enabled ? chalk.green('✅ Enabled') : chalk.red('❌ Disabled');
          const configIcon = status.configured ? chalk.green('🔑 Configured') : chalk.yellow('⚠️  Not Configured');
          
          console.log(chalk.white(`${platform.toUpperCase()}:`));
          console.log(`  Status: ${enabledIcon}`);
          console.log(`  Config: ${configIcon}`);
          
          if (!status.configured) {
            console.log(chalk.gray(`  Setup: Add environment variables for ${platform}`));
          }
          console.log();
        }

        // Check for deployment hooks
        console.log(chalk.blue('🪝 Deployment Hooks:'));
        
        const fs = await import('fs/promises');
        const path = await import('path');
        
        const gitHookExists = await fs.access(path.join(process.cwd(), '.git', 'hooks', 'post-receive')).then(() => true).catch(() => false);
        const vercelConfigExists = await fs.access(path.join(process.cwd(), 'vercel.json')).then(() => true).catch(() => false);
        const netlifyConfigExists = await fs.access(path.join(process.cwd(), 'netlify.toml')).then(() => true).catch(() => false);
        const ciConfigExists = await fs.access(path.join(process.cwd(), '.github', 'workflows')).then(() => true).catch(() => false);

        console.log(`${gitHookExists ? chalk.green('✅') : chalk.gray('⚪')} Git Hooks`);
        console.log(`${ciConfigExists ? chalk.green('✅') : chalk.gray('⚪')} CI/CD Integration`);
        console.log(`${vercelConfigExists ? chalk.green('✅') : chalk.gray('⚪')} Vercel Integration`);
        console.log(`${netlifyConfigExists ? chalk.green('✅') : chalk.gray('⚪')} Netlify Integration`);

        console.log();
        console.log(chalk.yellow('💡 Tips:'));
        console.log(chalk.white('• Run `recoder social-deploy setup` to configure integrations'));
        console.log(chalk.white('• Run `recoder social-deploy test` to test your configuration'));
        console.log(chalk.white('• Use `recoder social-deploy announce` for manual announcements'));

      } catch (error) {
        spinner.fail(chalk.red('❌ Failed to get status'));
        Logger.error('Status check failed:', error);
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

function createConfigCommand(): Command {
  return new Command('config')
    .description('Configure social media platform settings')
    .action(async () => {
      console.log(chalk.cyan('⚙️  Configure Social Media Platforms'));
      console.log(chalk.gray('This will help you setup API keys and tokens for social media posting'));
      console.log();

      const answers = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'platforms',
          message: 'Which platforms would you like to configure?',
          choices: [
            { name: 'Twitter/X (API v2)', value: 'twitter' },
            { name: 'LinkedIn', value: 'linkedin' },
            { name: 'Mastodon', value: 'mastodon' }
          ]
        }
      ]);

      console.log();

      for (const platform of answers.platforms) {
        console.log(chalk.blue(`📝 Configuring ${platform.toUpperCase()}:`));
        
        switch (platform) {
          case 'twitter':
            console.log(chalk.yellow('Required environment variables:'));
            console.log(chalk.gray('TWITTER_API_KEY=your_api_key'));
            console.log(chalk.gray('TWITTER_ACCESS_TOKEN=your_access_token'));
            console.log(chalk.gray('TWITTER_CLIENT_ID=your_client_id (optional)'));
            console.log(chalk.gray('TWITTER_CLIENT_SECRET=your_client_secret (optional)'));
            console.log();
            console.log(chalk.white('Get these from: https://developer.twitter.com/'));
            break;
            
          case 'linkedin':
            console.log(chalk.yellow('Required environment variables:'));
            console.log(chalk.gray('LINKEDIN_CLIENT_ID=your_client_id'));
            console.log(chalk.gray('LINKEDIN_CLIENT_SECRET=your_client_secret'));
            console.log(chalk.gray('LINKEDIN_ACCESS_TOKEN=your_access_token'));
            console.log(chalk.gray('LINKEDIN_PERSON_ID=your_person_id'));
            console.log();
            console.log(chalk.white('Get these from: https://developer.linkedin.com/'));
            break;
            
          case 'mastodon':
            console.log(chalk.yellow('Required environment variables:'));
            console.log(chalk.gray('MASTODON_INSTANCE_URL=https://your.instance.url'));
            console.log(chalk.gray('MASTODON_ACCESS_TOKEN=your_access_token'));
            console.log();
            console.log(chalk.white('Get access token from your Mastodon instance settings'));
            break;
        }
        
        console.log();
      }

      console.log(chalk.green('✅ Configuration complete!'));
      console.log(chalk.white('Add the environment variables to your .env file or deployment environment'));
      console.log(chalk.white('Then run `recoder social-deploy test` to verify your setup'));
    });
}

