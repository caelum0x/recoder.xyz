#!/usr/bin/env node

/**
 * Multi-platform build script for CodeCraft CLI
 * Builds NPM package, native binaries, and installers
 */

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const chalk = require('chalk');

const BUILD_CONFIG = {
  targets: {
    npm: {
      name: 'NPM Package',
      command: 'npm run build:core',
      output: 'dist/',
      enabled: true
    },
    binaries: {
      name: 'Native Binaries',
      command: 'npm run build:pkg',
      output: 'build/',
      platforms: ['linux-x64', 'linux-arm64', 'macos-x64', 'macos-arm64', 'win-x64'],
      enabled: true
    },
    docker: {
      name: 'Docker Image',
      command: 'npm run build:docker',
      output: 'docker image',
      enabled: true
    },
    installers: {
      name: 'Native Installers',
      command: 'npm run build:installers',
      output: 'build/installers/',
      platforms: ['mac.dmg', 'win.exe', 'linux.deb', 'linux.rpm', 'linux.AppImage'],
      enabled: true
    }
  },
  cleanup: {
    before: ['dist', 'build', 'temp'],
    after: ['temp', 'node_modules/.cache']
  }
};

class BuildManager {
  constructor() {
    this.startTime = Date.now();
    this.results = {};
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
    const colors = {
      info: chalk.blue,
      success: chalk.green,
      warning: chalk.yellow,
      error: chalk.red,
      header: chalk.cyan.bold
    };
    console.log(`${colors[type](`[${timestamp}]`)} ${message}`);
  }

  async cleanup(stage) {
    const dirs = BUILD_CONFIG.cleanup[stage] || [];
    for (const dir of dirs) {
      if (await fs.pathExists(dir)) {
        this.log(`Cleaning ${dir}...`, 'info');
        await fs.remove(dir);
      }
    }
  }

  async ensureDirectories() {
    const dirs = ['dist', 'build', 'build/installers', 'temp'];
    for (const dir of dirs) {
      await fs.ensureDir(dir);
    }
  }

  async validateEnvironment() {
    this.log('Validating build environment...', 'info');
    
    const checks = [
      { command: 'node --version', name: 'Node.js', min: '18.0.0' },
      { command: 'npm --version', name: 'NPM', min: '8.0.0' },
      { command: 'git --version', name: 'Git', required: true },
      { command: 'docker --version', name: 'Docker', required: false }
    ];

    for (const check of checks) {
      try {
        const output = execSync(check.command, { encoding: 'utf8' }).trim();
        this.log(`✓ ${check.name}: ${output}`, 'success');
      } catch (error) {
        if (check.required) {
          this.log(`✗ ${check.name}: Not found (required)`, 'error');
          throw new Error(`Missing required dependency: ${check.name}`);
        } else {
          this.log(`⚠ ${check.name}: Not found (optional)`, 'warning');
        }
      }
    }
  }

  async buildTarget(targetName, config) {
    if (!config.enabled) {
      this.log(`Skipping ${config.name} (disabled)`, 'warning');
      return { skipped: true };
    }

    this.log(`Building ${config.name}...`, 'header');
    const startTime = Date.now();

    try {
      // Execute build command
      this.log(`Running: ${config.command}`, 'info');
      const output = execSync(config.command, { 
        encoding: 'utf8',
        stdio: 'pipe',
        cwd: process.cwd()
      });

      // Verify output
      if (config.output && config.output !== 'docker image') {
        const outputExists = await fs.pathExists(config.output);
        if (!outputExists) {
          throw new Error(`Build output not found: ${config.output}`);
        }

        // Check platform-specific outputs
        if (config.platforms) {
          for (const platform of config.platforms) {
            const platformPath = path.join(config.output, `codecraft-${platform}`);
            if (!(await fs.pathExists(platformPath))) {
              this.log(`⚠ Platform build missing: ${platform}`, 'warning');
            } else {
              this.log(`✓ Platform build: ${platform}`, 'success');
            }
          }
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      this.log(`✓ ${config.name} completed in ${duration}s`, 'success');
      
      return {
        success: true,
        duration: duration,
        output: output.slice(-500) // Last 500 chars
      };

    } catch (error) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      this.log(`✗ ${config.name} failed after ${duration}s`, 'error');
      this.log(`Error: ${error.message}`, 'error');
      
      return {
        success: false,
        duration: duration,
        error: error.message
      };
    }
  }

  async generateBuildReport() {
    const totalDuration = ((Date.now() - this.startTime) / 1000).toFixed(2);
    const successful = Object.values(this.results).filter(r => r.success).length;
    const failed = Object.values(this.results).filter(r => r.success === false).length;
    const skipped = Object.values(this.results).filter(r => r.skipped).length;

    this.log('\n' + '='.repeat(60), 'header');
    this.log('BUILD REPORT', 'header');
    this.log('='.repeat(60), 'header');
    
    for (const [target, result] of Object.entries(this.results)) {
      const status = result.skipped ? '⊝ SKIPPED' : 
                    result.success ? '✓ SUCCESS' : '✗ FAILED';
      const duration = result.duration ? ` (${result.duration}s)` : '';
      this.log(`${status} ${BUILD_CONFIG.targets[target].name}${duration}`, 
               result.success ? 'success' : result.skipped ? 'warning' : 'error');
    }

    this.log('', 'info');
    this.log(`Summary: ${successful} successful, ${failed} failed, ${skipped} skipped`, 'info');
    this.log(`Total build time: ${totalDuration}s`, 'info');

    // Generate detailed JSON report
    const report = {
      timestamp: new Date().toISOString(),
      totalDuration: totalDuration,
      summary: { successful, failed, skipped },
      results: this.results,
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        cwd: process.cwd()
      }
    };

    await fs.writeJSON('build/build-report.json', report, { spaces: 2 });
    this.log('Build report saved to build/build-report.json', 'info');

    return failed === 0;
  }

  async run() {
    try {
      this.log('Starting CodeCraft CLI build process...', 'header');
      
      // Environment validation
      await this.validateEnvironment();
      
      // Pre-build cleanup
      await this.cleanup('before');
      await this.ensureDirectories();

      // Build all targets
      for (const [targetName, config] of Object.entries(BUILD_CONFIG.targets)) {
        this.results[targetName] = await this.buildTarget(targetName, config);
      }

      // Post-build cleanup
      await this.cleanup('after');

      // Generate report
      const success = await this.generateBuildReport();
      
      if (success) {
        this.log('🎉 All builds completed successfully!', 'success');
        process.exit(0);
      } else {
        this.log('❌ Some builds failed. Check the report for details.', 'error');
        process.exit(1);
      }

    } catch (error) {
      this.log(`💥 Build process failed: ${error.message}`, 'error');
      process.exit(1);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const builder = new BuildManager();
  builder.run().catch(console.error);
}

module.exports = BuildManager;