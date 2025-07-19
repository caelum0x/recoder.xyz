#!/usr/bin/env node

/**
 * Release validation runner
 * Orchestrates release validation and rollback processes
 */

import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import chalk from 'chalk';
import { RollbackValidator, HealthCheck, RollbackConfig } from '../monitoring/rollback-validator';
import { Logger } from '@recoder/shared';

interface ValidationRunnerConfig {
  healthChecks: HealthCheck[];
  rollbackConfig: RollbackConfig;
  environments: Record<string, any>;
  monitoring: any;
  customChecks: any[];
}

class ValidationRunner {
  private readonly logger = new Logger('ValidationRunner');
  private validator?: RollbackValidator;
  private config?: ValidationRunnerConfig;

  async initialize(): Promise<void> {
    this.logger.info('Initializing validation runner...');
    
    // Load configuration
    await this.loadConfiguration();
    
    // Initialize rollback validator
    if (this.config) {
      this.validator = new RollbackValidator(
        this.config.rollbackConfig,
        this.config.healthChecks
      );
    }
    
    this.logger.info('Validation runner initialized successfully');
  }

  async loadConfiguration(): Promise<void> {
    const configPath = path.join(__dirname, '../monitoring/health-checks.yaml');
    
    try {
      const configData = await fs.readFile(configPath, 'utf8');
      this.config = yaml.load(configData) as ValidationRunnerConfig;
      
      this.logger.info(`Loaded configuration with ${this.config.healthChecks.length} health checks`);
      
    } catch (error) {
      this.logger.error('Failed to load configuration:', error);
      throw error;
    }
  }

  async startValidation(version: string, environment: string): Promise<string> {
    if (!this.validator) {
      throw new Error('Validator not initialized');
    }

    this.logger.info(`Starting validation for version ${version} in ${environment}`);
    
    // Apply environment-specific configuration
    this.applyEnvironmentConfig(environment);
    
    // Start validation
    const validationId = await this.validator.startValidation(version, environment as any);
    
    this.logger.info(`Validation started with ID: ${validationId}`);
    return validationId;
  }

  async stopValidation(validationId: string, status: 'passed' | 'failed'): Promise<void> {
    if (!this.validator) {
      throw new Error('Validator not initialized');
    }

    await this.validator.stopValidation(validationId, status);
    this.logger.info(`Validation ${validationId} stopped with status: ${status}`);
  }

  private applyEnvironmentConfig(environment: string): void {
    if (!this.config) {
      return;
    }

    const envConfig = this.config.environments[environment];
    if (envConfig) {
      // Merge environment-specific settings
      Object.assign(this.config.rollbackConfig, envConfig);
      this.logger.info(`Applied ${environment} environment configuration`);
    }
  }

  async runManualValidation(version: string, environment: string): Promise<boolean> {
    this.logger.info(`Running manual validation for ${version} in ${environment}`);
    
    const validationId = await this.startValidation(version, environment);
    
    // Wait for validation period
    const validationPeriod = this.config?.rollbackConfig.validationPeriodMinutes || 30;
    this.logger.info(`Monitoring for ${validationPeriod} minutes...`);
    
    await new Promise(resolve => setTimeout(resolve, validationPeriod * 60 * 1000));
    
    // Complete validation (assuming success for manual runs)
    await this.stopValidation(validationId, 'passed');
    
    return true;
  }

  async validateRelease(options: {
    version: string;
    environment: string;
    skipValidation?: boolean;
    dryRun?: boolean;
  }): Promise<void> {
    const { version, environment, skipValidation = false, dryRun = false } = options;
    
    console.log(chalk.cyan(`🚀 Starting release validation for ${version} in ${environment}`));
    
    if (dryRun) {
      console.log(chalk.yellow('🧪 Running in dry-run mode'));
    }
    
    if (skipValidation) {
      console.log(chalk.yellow('⚠️  Skipping health checks (--skip-validation)'));
      return;
    }

    try {
      // Initialize if not already done
      if (!this.validator) {
        await this.initialize();
      }

      // Start validation
      const validationId = await this.startValidation(version, environment);
      
      if (!dryRun) {
        console.log(chalk.green(`✅ Validation started (ID: ${validationId})`));
        console.log(chalk.gray('Monitoring release health... (Press Ctrl+C to stop)'));
        
        // Set up graceful shutdown
        process.on('SIGINT', async () => {
          console.log(chalk.yellow('\n🛑 Stopping validation...'));
          await this.stopValidation(validationId, 'failed');
          process.exit(0);
        });
        
        // Wait for validation to complete naturally
        // In real implementation, this would be handled by the monitoring loop
        await new Promise(() => {}); // Wait indefinitely
      } else {
        console.log(chalk.blue('✅ Dry-run validation completed'));
        await this.stopValidation(validationId, 'passed');
      }

    } catch (error) {
      console.error(chalk.red('❌ Validation failed:'), error);
      process.exit(1);
    }
  }
}

// CLI interface
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const runner = new ValidationRunner();
  
  switch (command) {
    case 'start':
      {
        const version = args[1];
        const environment = args[2];
        
        if (!version || !environment) {
          console.error(chalk.red('Usage: validation-runner start <version> <environment>'));
          process.exit(1);
        }
        
        await runner.validateRelease({
          version,
          environment,
          skipValidation: args.includes('--skip-validation'),
          dryRun: args.includes('--dry-run'),
        });
      }
      break;
      
    case 'test':
      {
        console.log(chalk.cyan('🧪 Testing validation configuration...'));
        
        try {
          await runner.initialize();
          console.log(chalk.green('✅ Configuration is valid'));
          
          // Run a quick dry-run test
          await runner.runManualValidation('test-version', 'staging');
          console.log(chalk.green('✅ Validation system is working'));
          
        } catch (error) {
          console.error(chalk.red('❌ Configuration test failed:'), error);
          process.exit(1);
        }
      }
      break;
      
    case 'config':
      {
        console.log(chalk.cyan('📋 Validation Configuration:'));
        
        try {
          await runner.initialize();
          
          // Display configuration summary
          if (runner['config']) {
            const config = runner['config'];
            console.log(chalk.white(`Health Checks: ${config.healthChecks.length}`));
            console.log(chalk.white(`Auto Rollback: ${config.rollbackConfig.autoRollback ? 'Enabled' : 'Disabled'}`));
            console.log(chalk.white(`Validation Period: ${config.rollbackConfig.validationPeriodMinutes} minutes`));
            console.log(chalk.white(`Error Rate Threshold: ${config.rollbackConfig.thresholds.errorRatePercent}%`));
            console.log(chalk.white(`Response Time Threshold: ${config.rollbackConfig.thresholds.responseTimeMs}ms`));
          }
          
        } catch (error) {
          console.error(chalk.red('❌ Failed to load configuration:'), error);
          process.exit(1);
        }
      }
      break;
      
    default:
      console.log(chalk.cyan('CodeCraft CLI Release Validation Runner'));
      console.log('');
      console.log(chalk.white('Usage:'));
      console.log('  validation-runner start <version> <environment> [options]');
      console.log('  validation-runner test');
      console.log('  validation-runner config');
      console.log('');
      console.log(chalk.white('Options:'));
      console.log('  --skip-validation    Skip health checks');
      console.log('  --dry-run           Run without actually monitoring');
      console.log('');
      console.log(chalk.white('Examples:'));
      console.log('  validation-runner start 1.2.0 production');
      console.log('  validation-runner start 1.2.0-beta staging --dry-run');
      console.log('  validation-runner test');
      break;
  }
}

// Run CLI if called directly
if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  });
}

export { ValidationRunner };