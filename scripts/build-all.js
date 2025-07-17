#!/usr/bin/env node

const { execSync } = require('child_process');
const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs-extra');
const path = require('path');

class BuildScript {
  constructor() {
    this.rootDir = path.resolve(__dirname, '..');
    this.packages = ['shared', 'cli', 'vscode-extension', 'web'];
    this.apps = ['backend'];
  }

  async run() {
    console.log(chalk.cyan('🏗️  Building CodeCraft Monorepo\n'));

    try {
      // Clean previous builds
      await this.clean();
      
      // Install dependencies
      await this.installDependencies();
      
      // Build packages in order
      await this.buildPackages();
      
      // Build applications
      await this.buildApplications();
      
      // Verify builds
      await this.verifyBuilds();
      
      console.log(chalk.green('\n✅ Build completed successfully!'));
    } catch (error) {
      console.error(chalk.red('\n❌ Build failed:'), error.message);
      process.exit(1);
    }
  }

  async clean() {
    const spinner = ora('Cleaning previous builds...').start();
    
    try {
      // Clean dist directories
      const cleanPaths = [
        'packages/*/dist',
        'packages/*/out',
        'backend/dist',
        'packages/web/.next'
      ];
      
      for (const pattern of cleanPaths) {
        const fullPattern = path.join(this.rootDir, pattern);
        await fs.remove(fullPattern).catch(() => {}); // Ignore errors
      }
      
      spinner.succeed('Cleaned previous builds');
    } catch (error) {
      spinner.fail('Failed to clean builds');
      throw error;
    }
  }

  async installDependencies() {
    const spinner = ora('Installing dependencies...').start();
    
    try {
      this.exec('npm install', { cwd: this.rootDir });
      spinner.succeed('Dependencies installed');
    } catch (error) {
      spinner.fail('Failed to install dependencies');
      throw error;
    }
  }

  async buildPackages() {
    console.log(chalk.blue('\n📦 Building packages...\n'));
    
    for (const pkg of this.packages) {
      const spinner = ora(`Building ${pkg}...`).start();
      
      try {
        this.exec('npm run build', { 
          cwd: path.join(this.rootDir, 'packages', pkg) 
        });
        spinner.succeed(`Built ${pkg}`);
      } catch (error) {
        spinner.fail(`Failed to build ${pkg}`);
        throw new Error(`Package ${pkg} build failed: ${error.message}`);
      }
    }
  }

  async buildApplications() {
    console.log(chalk.blue('\n🚀 Building applications...\n'));
    
    for (const app of this.apps) {
      const spinner = ora(`Building ${app}...`).start();
      
      try {
        this.exec('npm run build', { 
          cwd: path.join(this.rootDir, app) 
        });
        spinner.succeed(`Built ${app}`);
      } catch (error) {
        spinner.fail(`Failed to build ${app}`);
        throw new Error(`Application ${app} build failed: ${error.message}`);
      }
    }
  }

  async verifyBuilds() {
    const spinner = ora('Verifying builds...').start();
    
    try {
      const checks = [
        { name: 'CLI', path: 'packages/cli/dist/index.js' },
        { name: 'Shared', path: 'packages/shared/dist/index.js' },
        { name: 'Backend', path: 'backend/dist/server.js' },
        { name: 'VSCode Extension', path: 'packages/vscode-extension/dist/extension.js' }
      ];
      
      for (const check of checks) {
        const filePath = path.join(this.rootDir, check.path);
        if (!await fs.pathExists(filePath)) {
          throw new Error(`${check.name} build output not found: ${check.path}`);
        }
      }
      
      spinner.succeed('All builds verified');
    } catch (error) {
      spinner.fail('Build verification failed');
      throw error;
    }
  }

  exec(command, options = {}) {
    return execSync(command, {
      stdio: 'pipe',
      encoding: 'utf8',
      ...options
    });
  }
}

// Run if executed directly
if (require.main === module) {
  const builder = new BuildScript();
  builder.run();
}

module.exports = BuildScript;