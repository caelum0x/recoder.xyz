/**
 * Port Testing Command - Real Implementation
 * Test all services to ensure they start without conflicts
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { spawn } from 'child_process';
import { Logger } from '../utils/logger';
import { portManager } from '../utils/port-manager';

export function createTestPortsCommand(): Command {
  return new Command('test-ports')
    .description('Test all services starting without port conflicts')
    .option('--timeout <seconds>', 'Timeout for each service test', '30')
    .option('--verbose', 'Show detailed output')
    .action(async (options) => {
      console.log(chalk.cyan('🔌 Testing Service Port Configurations'));
      console.log(chalk.gray('Checking if all services can start without conflicts'));
      console.log();

      const spinner = ora('Initializing port tests...').start();
      const timeout = parseInt(options.timeout) * 1000;

      try {
        // Resolve any existing conflicts first
        spinner.text = 'Resolving port conflicts...';
        const conflicts = await portManager.detectConflicts();
        
        if (conflicts.length > 0) {
          spinner.text = `Found ${conflicts.length} conflicts, resolving...`;
          await portManager.resolveConflicts();
        }

        spinner.text = 'Getting port assignments...';
        const assignments = portManager.getPortAssignments();
        
        spinner.succeed(chalk.green('Port configuration ready'));
        console.log();

        // Test each service
        const testResults: Record<string, { success: boolean; port: number; error?: string }> = {};
        
        for (const assignment of assignments) {
          const testSpinner = ora(`Testing ${assignment.service} on port ${assignment.port}...`).start();
          
          try {
            const result = await testServicePort(assignment.service, assignment.port, timeout, options.verbose);
            testResults[assignment.service] = {
              success: result.success,
              port: assignment.port,
              error: result.error
            };
            
            if (result.success) {
              testSpinner.succeed(chalk.green(`✅ ${assignment.service} - Port ${assignment.port} OK`));
            } else {
              testSpinner.fail(chalk.red(`❌ ${assignment.service} - Port ${assignment.port} FAILED`));
              if (result.error && options.verbose) {
                console.log(chalk.gray(`   Error: ${result.error}`));
              }
            }
          } catch (error) {
            testResults[assignment.service] = {
              success: false,
              port: assignment.port,
              error: error instanceof Error ? error.message : String(error)
            };
            testSpinner.fail(chalk.red(`❌ ${assignment.service} - Test failed`));
          }
        }

        // Print summary
        console.log();
        console.log(chalk.blue('📊 Test Results Summary:'));
        console.log(chalk.gray('─'.repeat(60)));

        const successful = Object.values(testResults).filter(r => r.success).length;
        const total = Object.keys(testResults).length;

        for (const [service, result] of Object.entries(testResults)) {
          const status = result.success ? chalk.green('✅ PASS') : chalk.red('❌ FAIL');
          console.log(`${status} ${service.padEnd(25)} Port ${result.port}`);
        }

        console.log(chalk.gray('─'.repeat(60)));
        console.log(`${chalk.white('Success Rate:')} ${successful}/${total} (${Math.round(successful/total*100)}%)`);

        if (successful === total) {
          console.log();
          console.log(chalk.green('🎉 All services passed port tests!'));
          console.log(chalk.white('Your system is ready for deployment.'));
        } else {
          console.log();
          console.log(chalk.yellow('⚠️  Some services failed port tests.'));
          console.log(chalk.white('Check the errors above and resolve conflicts.'));
          
          // Generate port configuration file
          await portManager.exportConfig('./port-config.json');
          console.log(chalk.gray('Port configuration exported to ./port-config.json'));
        }

        // Print port report
        console.log();
        portManager.printPortReport();

      } catch (error) {
        spinner.fail(chalk.red('❌ Port testing failed'));
        Logger.error('Port testing failed:', error);
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

async function testServicePort(
  service: string, 
  port: number, 
  timeout: number,
  verbose: boolean
): Promise<{ success: boolean; error?: string }> {
  
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve({ success: false, error: 'Service startup timeout' });
    }, timeout);

    try {
      // Service-specific test commands
      const testCommand = getServiceTestCommand(service, port);
      
      if (!testCommand) {
        clearTimeout(timeoutId);
        resolve({ success: false, error: 'No test command defined for this service' });
        return;
      }

      const childProcess = spawn(testCommand.cmd, testCommand.args, {
        stdio: verbose ? 'inherit' : 'pipe',
        env: { ...process.env, PORT: port.toString() }
      });

      let output = '';
      let errorOutput = '';

      if (!verbose) {
        childProcess.stdout?.on('data', (data) => {
          output += data.toString();
        });

        childProcess.stderr?.on('data', (data) => {
          errorOutput += data.toString();
        });
      }

      childProcess.on('exit', (code) => {
        clearTimeout(timeoutId);
        
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({ 
            success: false, 
            error: errorOutput || output || `Process exited with code ${code}` 
          });
        }
      });

      childProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        resolve({ success: false, error: error.message });
      });

    } catch (error) {
      clearTimeout(timeoutId);
      resolve({ 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });
}

function getServiceTestCommand(service: string, port: number): { cmd: string; args: string[] } | null {
  const commands: Record<string, { cmd: string; args: string[] }> = {
    'web-platform': {
      cmd: 'npm',
      args: ['run', 'test:port', '--', '--port', port.toString()]
    },
    'chat-platform': {
      cmd: 'npm',
      args: ['run', 'test:port', '--', '--port', port.toString()]
    },
    'backend-api': {
      cmd: 'node',
      args: ['-e', `
        const express = require('express');
        const app = express();
        const server = app.listen(${port}, () => {
          console.log('Backend test server started on port ${port}');
          server.close();
          process.exit(0);
        });
        server.on('error', (err) => {
          console.error('Backend test failed:', err.message);
          process.exit(1);
        });
      `]
    },
    'production-engine': {
      cmd: 'node',
      args: ['-e', `
        const express = require('express');
        const app = express();
        const server = app.listen(${port}, () => {
          console.log('Production engine test server started on port ${port}');
          server.close();
          process.exit(0);
        });
        server.on('error', (err) => {
          console.error('Production engine test failed:', err.message);
          process.exit(1);
        });
      `]
    },
    'collaboration-server': {
      cmd: 'node',
      args: ['-e', `
        const { Server } = require('ws');
        const server = new Server({ port: ${port} });
        server.on('listening', () => {
          console.log('Collaboration server test started on port ${port}');
          server.close();
          process.exit(0);
        });
        server.on('error', (err) => {
          console.error('Collaboration server test failed:', err.message);
          process.exit(1);
        });
      `]
    },
    'ollama': {
      cmd: 'curl',
      args: ['-f', '-s', `http://localhost:${port}/api/version`]
    },
    'lm-studio': {
      cmd: 'curl',
      args: ['-f', '-s', `http://localhost:${port}/v1/models`]
    }
  };

  return commands[service] || null;
}

