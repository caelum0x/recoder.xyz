/**
 * Update command for CodeCraft CLI
 * Handles update checking, downloading, and installation
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { AutoUpdater, UpdateOptions, UpdateProgress } from '../services/auto-updater';
import { Logger } from 'recoder-shared';

// Use static Logger methods directly

interface UpdateConfig {
  autoCheck: boolean;
  autoDownload: boolean;
  autoInstall: boolean;
  channel: 'stable' | 'beta' | 'alpha';
  checkInterval: number;
  skipVersion?: string;
  lastCheck?: string;
}

/**
 * Create update command
 */
export function createUpdateCommand(): Command {
  const cmd = new Command('update');
  
  cmd
    .description('Manage CodeCraft CLI updates')
    .action(async () => {
      await checkAndPromptUpdate();
    });

  // Subcommands
  cmd
    .command('check')
    .description('Check for available updates')
    .option('--channel <channel>', 'Update channel (stable, beta, alpha)', 'stable')
    .action(async (options) => {
      await checkForUpdates(options.channel);
    });

  cmd
    .command('install')
    .description('Download and install the latest update')
    .option('--channel <channel>', 'Update channel (stable, beta, alpha)', 'stable')
    .option('--force', 'Force update even if already up to date')
    .action(async (options) => {
      await installUpdate(options.channel, options.force);
    });

  cmd
    .command('config')
    .description('Configure auto-update settings')
    .action(async () => {
      await configureAutoUpdates();
    });

  cmd
    .command('rollback')
    .description('Rollback to the previous version')
    .action(async () => {
      await rollbackUpdate();
    });

  cmd
    .command('status')
    .description('Show current update status and settings')
    .action(async () => {
      await showUpdateStatus();
    });

  return cmd;
}

/**
 * Check and prompt for updates (default action)
 */
async function checkAndPromptUpdate(): Promise<void> {
  const spinner = ora('Checking for updates...').start();
  
  try {
    const config = await loadUpdateConfig();
    const updater = new AutoUpdater(config);
    
    const updateInfo = await updater.checkForUpdates();
    spinner.stop();
    
    if (!updateInfo.available) {
      console.log(chalk.green('✓ You are already running the latest version!'));
      console.log(chalk.gray(`Current version: ${updateInfo.currentVersion}`));
      return;
    }

    console.log(chalk.yellow('🎉 A new version is available!'));
    console.log(chalk.gray(`Current version: ${updateInfo.currentVersion}`));
    console.log(chalk.green(`Latest version:  ${updateInfo.latestVersion}`));
    console.log(chalk.gray(`Release date:    ${new Date(updateInfo.releaseDate).toLocaleDateString()}`));
    console.log(chalk.gray(`Download size:   ${formatBytes(updateInfo.size)}`));
    
    if (updateInfo.critical) {
      console.log(chalk.red('⚠️  This is a critical security update!'));
    }

    if (updateInfo.changelog) {
      console.log(chalk.cyan('\nChangelog:'));
      console.log(updateInfo.changelog);
    }

    const { shouldUpdate } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldUpdate',
        message: 'Would you like to download and install this update?',
        default: true,
      },
    ]);

    if (shouldUpdate) {
      await installUpdateWithProgress(updater, updateInfo);
    } else {
      const { skipVersion } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'skipVersion',
          message: 'Skip this version in future checks?',
          default: false,
        },
      ]);

      if (skipVersion) {
        config.skipVersion = updateInfo.latestVersion;
        await saveUpdateConfig(config);
        console.log(chalk.yellow(`Version ${updateInfo.latestVersion} will be skipped in future checks.`));
      }
    }

  } catch (error) {
    spinner.stop();
    console.error(chalk.red('Failed to check for updates:'), error);
    process.exit(1);
  }
}

/**
 * Check for updates (no prompts)
 */
async function checkForUpdates(channel: string): Promise<void> {
  const spinner = ora('Checking for updates...').start();
  
  try {
    const config = await loadUpdateConfig();
    config.channel = channel as any;
    
    const updater = new AutoUpdater(config);
    const updateInfo = await updater.checkForUpdates();
    
    spinner.stop();
    
    console.log(chalk.cyan('Update Check Results:'));
    console.log(chalk.gray(`Channel:         ${channel}`));
    console.log(chalk.gray(`Current version: ${updateInfo.currentVersion}`));
    console.log(chalk.gray(`Latest version:  ${updateInfo.latestVersion}`));
    console.log(chalk.gray(`Update available: ${updateInfo.available ? chalk.green('Yes') : chalk.red('No')}`));
    
    if (updateInfo.available) {
      console.log(chalk.gray(`Release date:    ${new Date(updateInfo.releaseDate).toLocaleDateString()}`));
      console.log(chalk.gray(`Download size:   ${formatBytes(updateInfo.size)}`));
      
      if (updateInfo.critical) {
        console.log(chalk.red('⚠️  Critical security update'));
      }
      
      console.log(chalk.yellow('\nRun "codecraft update install" to download and install the update.'));
    }

  } catch (error) {
    spinner.stop();
    console.error(chalk.red('Failed to check for updates:'), error);
    process.exit(1);
  }
}

/**
 * Install update
 */
async function installUpdate(channel: string, force: boolean = false): Promise<void> {
  try {
    const config = await loadUpdateConfig();
    config.channel = channel as any;
    
    const updater = new AutoUpdater(config);
    const updateInfo = await updater.checkForUpdates();
    
    if (!updateInfo.available && !force) {
      console.log(chalk.green('✓ You are already running the latest version!'));
      return;
    }

    if (force) {
      console.log(chalk.yellow('Forcing update...'));
    }

    await installUpdateWithProgress(updater, updateInfo);

  } catch (error) {
    console.error(chalk.red('Failed to install update:'), error);
    process.exit(1);
  }
}

/**
 * Install update with progress display
 */
async function installUpdateWithProgress(updater: AutoUpdater, updateInfo: any): Promise<void> {
  let spinner: any = null;
  
  updater.setProgressCallback((progress: UpdateProgress) => {
    if (spinner) {
      spinner.stop();
    }
    
    const progressBar = '█'.repeat(Math.floor(progress.progress / 5)) + 
                       '░'.repeat(20 - Math.floor(progress.progress / 5));
    
    if (progress.stage === 'error') {
      console.error(chalk.red(`✗ ${progress.message}`));
      if (progress.error) {
        console.error(chalk.gray(progress.error.message));
      }
    } else if (progress.stage === 'complete') {
      console.log(chalk.green(`✓ ${progress.message}`));
      console.log(chalk.green('Update completed successfully! Please restart the CLI to use the new version.'));
    } else {
      spinner = ora({
        text: `${progress.message} [${progressBar}] ${progress.progress}%`,
        spinner: 'dots',
      }).start();
    }
  });

  try {
    await updater.updateToLatest(updateInfo);
  } catch (error) {
    if (spinner) {
      spinner.stop();
    }
    throw error;
  }
}

/**
 * Configure auto-updates
 */
async function configureAutoUpdates(): Promise<void> {
  const config = await loadUpdateConfig();
  
  console.log(chalk.cyan('Configure Auto-Update Settings\n'));
  
  const answers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'autoCheck',
      message: 'Automatically check for updates?',
      default: config.autoCheck,
    },
    {
      type: 'list',
      name: 'checkInterval',
      message: 'How often should we check for updates?',
      choices: [
        { name: 'Every 6 hours', value: 6 },
        { name: 'Daily', value: 24 },
        { name: 'Weekly', value: 168 },
        { name: 'Monthly', value: 720 },
      ],
      default: config.checkInterval,
      when: (answers) => answers.autoCheck,
    },
    {
      type: 'list',
      name: 'channel',
      message: 'Which update channel would you like to use?',
      choices: [
        { name: 'Stable (recommended)', value: 'stable' },
        { name: 'Beta (preview features)', value: 'beta' },
        { name: 'Alpha (experimental)', value: 'alpha' },
      ],
      default: config.channel,
    },
    {
      type: 'confirm',
      name: 'autoDownload',
      message: 'Automatically download updates when available?',
      default: config.autoDownload,
      when: (answers) => answers.autoCheck,
    },
    {
      type: 'confirm',
      name: 'autoInstall',
      message: 'Automatically install downloaded updates? (requires restart)',
      default: config.autoInstall,
      when: (answers) => answers.autoDownload,
    },
  ]);

  // Update config
  Object.assign(config, answers);
  await saveUpdateConfig(config);
  
  console.log(chalk.green('\n✓ Auto-update settings saved!'));
  
  if (config.autoCheck) {
    console.log(chalk.gray(`Updates will be checked every ${config.checkInterval} hours.`));
    console.log(chalk.gray(`Channel: ${config.channel}`));
    
    if (config.autoDownload) {
      console.log(chalk.gray('Updates will be downloaded automatically.'));
      
      if (config.autoInstall) {
        console.log(chalk.yellow('⚠️  Updates will be installed automatically (requires CLI restart).'));
      }
    }
  } else {
    console.log(chalk.gray('Automatic update checking is disabled.'));
  }
}

/**
 * Rollback update
 */
async function rollbackUpdate(): Promise<void> {
  console.log(chalk.yellow('⚠️  Rolling back to the previous version...'));
  
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Are you sure you want to rollback to the previous version?',
      default: false,
    },
  ]);

  if (!confirm) {
    console.log(chalk.gray('Rollback cancelled.'));
    return;
  }

  const spinner = ora('Rolling back update...').start();
  
  try {
    const config = await loadUpdateConfig();
    const updater = new AutoUpdater(config);
    
    const success = await updater.rollbackUpdate();
    spinner.stop();
    
    if (success) {
      console.log(chalk.green('✓ Rollback completed successfully!'));
      console.log(chalk.yellow('Please restart the CLI to complete the rollback.'));
    } else {
      console.log(chalk.red('✗ Rollback failed - no backup version found.'));
    }

  } catch (error) {
    spinner.stop();
    console.error(chalk.red('Rollback failed:'), error);
    process.exit(1);
  }
}

/**
 * Show update status
 */
async function showUpdateStatus(): Promise<void> {
  const spinner = ora('Checking update status...').start();
  
  try {
    const config = await loadUpdateConfig();
    const updater = new AutoUpdater(config);
    const updateInfo = await updater.checkForUpdates();
    
    spinner.stop();
    
    console.log(chalk.cyan('Update Status\n'));
    
    // Current version info
    console.log(chalk.white('Current Installation:'));
    console.log(chalk.gray(`  Version: ${updateInfo.currentVersion}`));
    console.log(chalk.gray(`  Channel: ${config.channel}`));
    
    // Update availability
    console.log(chalk.white('\nUpdate Availability:'));
    if (updateInfo.available) {
      console.log(chalk.green(`  ✓ Update available: ${updateInfo.latestVersion}`));
      console.log(chalk.gray(`  Release date: ${new Date(updateInfo.releaseDate).toLocaleDateString()}`));
      console.log(chalk.gray(`  Download size: ${formatBytes(updateInfo.size)}`));
      
      if (updateInfo.critical) {
        console.log(chalk.red('  ⚠️  Critical security update'));
      }
    } else {
      console.log(chalk.green('  ✓ Up to date'));
    }
    
    // Auto-update settings
    console.log(chalk.white('\nAuto-Update Settings:'));
    console.log(chalk.gray(`  Auto-check: ${config.autoCheck ? 'Enabled' : 'Disabled'}`));
    
    if (config.autoCheck) {
      console.log(chalk.gray(`  Check interval: Every ${config.checkInterval} hours`));
      console.log(chalk.gray(`  Auto-download: ${config.autoDownload ? 'Enabled' : 'Disabled'}`));
      console.log(chalk.gray(`  Auto-install: ${config.autoInstall ? 'Enabled' : 'Disabled'}`));
      
      const lastCheck = config.lastCheck ? new Date(config.lastCheck).toLocaleString() : 'Never';
      console.log(chalk.gray(`  Last check: ${lastCheck}`));
    }
    
    if (config.skipVersion) {
      console.log(chalk.yellow(`  Skipping version: ${config.skipVersion}`));
    }

  } catch (error) {
    spinner.stop();
    console.error(chalk.red('Failed to check update status:'), error);
    process.exit(1);
  }
}

/**
 * Load update configuration
 */
async function loadUpdateConfig(): Promise<UpdateConfig> {
  const { promises: fs } = await import('fs');
  const path = await import('path');
  
  const configPath = path.join(process.env.CODECRAFT_HOME || '~/.codecraft', 'update-config.json');
  
  try {
    const configData = await fs.readFile(configPath, 'utf8');
    return { ...defaultConfig, ...JSON.parse(configData) };
  } catch (error) {
    return { ...defaultConfig };
  }
}

/**
 * Save update configuration
 */
async function saveUpdateConfig(config: UpdateConfig): Promise<void> {
  const { promises: fs } = await import('fs');
  const path = await import('path');
  
  const configDir = path.join(process.env.CODECRAFT_HOME || '~/.codecraft');
  const configPath = path.join(configDir, 'update-config.json');
  
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

/**
 * Default configuration
 */
const defaultConfig: UpdateConfig = {
  autoCheck: true,
  autoDownload: false,
  autoInstall: false,
  channel: 'stable',
  checkInterval: 24, // hours
};

/**
 * Format bytes for display
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}