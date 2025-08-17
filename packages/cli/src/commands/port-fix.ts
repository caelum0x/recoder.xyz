/**
 * Port Fix Command - Resolve Port Conflicts Automatically
 * REAL IMPLEMENTATION: Detects and resolves EADDRINUSE errors
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { Logger } from '../utils/logger';
import { portManager } from '../utils/port-manager';

export function createPortFixCommand(): Command {
  const portFix = new Command('port-fix')
    .description('🔧 Detect and resolve port conflicts automatically')
    .option('--scan', 'Scan for port conflicts without fixing')
    .option('--export <file>', 'Export port configuration to file')
    .option('--report', 'Show detailed port usage report')
    .action(async (options) => {
      try {
        console.log(chalk.blue('🔧 RECODER PORT CONFLICT RESOLVER'));
        console.log(chalk.gray('Detecting and resolving EADDRINUSE errors...'));
        console.log();

        if (options.report) {
          portManager.printPortReport();
          return;
        }

        if (options.scan) {
          console.log(chalk.yellow('🔍 Scanning for port conflicts...'));
          const conflicts = await portManager.detectConflicts();
          
          if (conflicts.length === 0) {
            console.log(chalk.green('✅ No port conflicts detected!'));
          } else {
            console.log(chalk.red(`❌ Found ${conflicts.length} port conflicts:`));
            conflicts.forEach(conflict => {
              console.log(chalk.red(`  • ${conflict.service} on port ${conflict.port} conflicts with ${conflict.conflictWith}`));
            });
          }
          return;
        }

        console.log(chalk.yellow('🔍 Detecting port conflicts...'));
        const conflicts = await portManager.detectConflicts();
        
        if (conflicts.length === 0) {
          console.log(chalk.green('✅ No port conflicts detected!'));
          portManager.printPortReport();
          return;
        }

        console.log(chalk.red(`❌ Found ${conflicts.length} port conflicts`));
        console.log(chalk.yellow('🔧 Resolving conflicts automatically...'));
        
        const resolutions = await portManager.resolveConflicts();
        
        if (resolutions.size > 0) {
          console.log(chalk.green(`✅ Resolved ${resolutions.size} conflicts:`));
          for (const [service, newPort] of resolutions.entries()) {
            console.log(chalk.green(`  • ${service} moved to port ${newPort}`));
          }
        }

        if (options.export) {
          await portManager.exportConfig(options.export);
          console.log(chalk.blue(`📄 Configuration exported to ${options.export}`));
        }

        console.log();
        console.log(chalk.cyan('💡 Updated port assignments:'));
        portManager.printPortReport();

        // Generate environment variables
        const envVars = portManager.generateEnvVars();
        if (Object.keys(envVars).length > 0) {
          console.log();
          console.log(chalk.cyan('🔧 Environment variables to set:'));
          Object.entries(envVars).forEach(([key, value]) => {
            console.log(chalk.gray(`export ${key}=${value}`));
          });
        }

      } catch (error) {
        Logger.error('Port fix failed:', error);
        console.log(chalk.red('❌ Port conflict resolution failed'));
        process.exit(1);
      }
    });

  return portFix;
}