/**
 * Web Dashboard Commands
 * Manage the recoder web dashboard from CLI
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { getWebIntegration } from '../services/web-integration';
import { Logger } from '@recoder/shared';

const logger = Logger.getInstance();

export function createWebCommand(): Command {
  const webCommand = new Command('web')
    .description('Manage recoder web dashboard');

  // Start dashboard command
  webCommand
    .command('start')
    .description('Start the recoder web dashboard')
    .option('-p, --port <port>', 'Port to run the dashboard on', '3000')
    .option('-h, --host <host>', 'Host to bind the dashboard to', 'localhost')
    .option('--prod', 'Start in production mode')
    .action(async (options) => {
      console.log(chalk.cyan('\n🌐 RECODER - Web Dashboard\n'));

      try {
        const webIntegration = getWebIntegration({
          port: parseInt(options.port),
          host: options.host,
          env: options.prod ? 'production' : 'development'
        });

        await webIntegration.startDashboard();
        
        console.log(chalk.green(`✅ Dashboard started successfully!`));
        console.log(chalk.blue(`🔗 URL: ${webIntegration.getDashboardUrl()}`));
        console.log(chalk.gray('Press Ctrl+C to stop\n'));

        // Keep the process alive
        process.on('SIGINT', async () => {
          console.log(chalk.yellow('\n🛑 Stopping dashboard...'));
          await webIntegration.stopDashboard();
          process.exit(0);
        });

        // Prevent process from exiting
        await new Promise(() => {});
      } catch (error: any) {
        console.error(chalk.red(`❌ Failed to start dashboard: ${error.message}`));
        process.exit(1);
      }
    });

  // Stop dashboard command
  webCommand
    .command('stop')
    .description('Stop the recoder web dashboard')
    .action(async () => {
      console.log(chalk.cyan('\n🛑 RECODER - Stop Dashboard\n'));

      try {
        const webIntegration = getWebIntegration();
        await webIntegration.stopDashboard();
        console.log(chalk.green('✅ Dashboard stopped successfully\n'));
      } catch (error: any) {
        console.error(chalk.red(`❌ Failed to stop dashboard: ${error.message}`));
        process.exit(1);
      }
    });

  // Open dashboard command
  webCommand
    .command('open')
    .description('Open the recoder web dashboard in browser')
    .action(async () => {
      console.log(chalk.cyan('\n🌐 RECODER - Open Dashboard\n'));

      try {
        const webIntegration = getWebIntegration();
        await webIntegration.openDashboard();
        console.log(chalk.green('✅ Dashboard opened in browser\n'));
      } catch (error: any) {
        console.error(chalk.red(`❌ Failed to open dashboard: ${error.message}`));
        process.exit(1);
      }
    });

  // Status command
  webCommand
    .command('status')
    .description('Check web dashboard status')
    .action(async () => {
      console.log(chalk.cyan('\n📊 RECODER - Dashboard Status\n'));

      try {
        const webIntegration = getWebIntegration();
        const status = webIntegration.getDashboardStatus();

        console.log(chalk.blue('Dashboard Status:'));
        console.log(`  Running: ${status.running ? chalk.green('✅ Yes') : chalk.red('❌ No')}`);
        console.log(`  URL: ${chalk.blue(status.url)}`);
        console.log(`  Host: ${status.config.host}`);
        console.log(`  Port: ${status.config.port}`);
        console.log(`  Environment: ${status.config.env}`);
        console.log();
      } catch (error: any) {
        console.error(chalk.red(`❌ Failed to get status: ${error.message}`));
        process.exit(1);
      }
    });

  return webCommand;
}