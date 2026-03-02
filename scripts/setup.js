#!/usr/bin/env node

const { execSync } = require('child_process');
const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs-extra');
const path = require('path');

class SetupScript {
  constructor() {
    this.rootDir = path.resolve(__dirname, '..');
  }

  async run() {
    console.log(chalk.cyan('🚀 Setting up Recoder Development Environment\n'));

    try {
      await this.checkPrerequisites();
      await this.setupEnvironment();
      await this.installDependencies();
      await this.setupHusky();
      await this.generatePrismaClient();
      await this.runInitialBuild();
      await this.setupDevelopmentConfig();
      
      console.log(chalk.green('\n✅ Setup completed successfully!'));
      this.printNextSteps();
    } catch (error) {
      console.error(chalk.red('\n❌ Setup failed:'), error.message);
      process.exit(1);
    }
  }

  async checkPrerequisites() {
    const spinner = ora('Checking prerequisites...').start();
    
    try {
      // Check Node.js version
      const nodeVersion = process.version;
      const requiredVersion = '18.0.0';
      
      if (!this.versionSatisfies(nodeVersion.slice(1), requiredVersion)) {
        throw new Error(`Node.js ${requiredVersion} or higher required. Current: ${nodeVersion}`);
      }
      
      // Check npm
      this.exec('npm --version');
      
      // Check if git is available
      this.exec('git --version');
      
      spinner.succeed('Prerequisites checked');
    } catch (error) {
      spinner.fail('Prerequisites check failed');
      throw error;
    }
  }

  async setupEnvironment() {
    const spinner = ora('Setting up environment...').start();
    
    try {
      // Copy environment files
      const envExample = path.join(this.rootDir, '.env.example');
      const envFile = path.join(this.rootDir, '.env');
      
      if (await fs.pathExists(envExample) && !await fs.pathExists(envFile)) {
        await fs.copy(envExample, envFile);
      }
      
      // Setup backend environment
      const backendEnvExample = path.join(this.rootDir, 'backend/.env.example');
      const backendEnvFile = path.join(this.rootDir, 'backend/.env');
      
      if (await fs.pathExists(backendEnvExample) && !await fs.pathExists(backendEnvFile)) {
        await fs.copy(backendEnvExample, backendEnvFile);
      }
      
      spinner.succeed('Environment files created');
    } catch (error) {
      spinner.fail('Environment setup failed');
      throw error;
    }
  }

  async installDependencies() {
    const spinner = ora('Installing dependencies...').start();
    
    try {
      // Install root dependencies first
      spinner.text = 'Installing root dependencies...';
      this.exec('npm install --ignore-workspace-root-check', { cwd: this.rootDir });
      
      // Install CLI package dependencies
      spinner.text = 'Installing CLI dependencies...';
      const cliPath = path.join(this.rootDir, 'packages/cli');
      if (await fs.pathExists(cliPath)) {
        this.exec('npm install', { cwd: cliPath });
      }
      
      // Install shared package dependencies
      spinner.text = 'Installing shared dependencies...';
      const sharedPath = path.join(this.rootDir, 'packages/shared');
      if (await fs.pathExists(sharedPath)) {
        this.exec('npm install', { cwd: sharedPath });
      }
      
      // Install backend dependencies
      spinner.text = 'Installing backend dependencies...';
      const backendPath = path.join(this.rootDir, 'backend');
      if (await fs.pathExists(backendPath)) {
        this.exec('npm install', { cwd: backendPath });
      }
      
      // Install docker-backend dependencies
      spinner.text = 'Installing docker-backend dependencies...';
      const enginePath = path.join(this.rootDir, 'docker-backend');
      if (await fs.pathExists(enginePath)) {
        this.exec('npm install', { cwd: enginePath });
      }
      
      spinner.succeed('All dependencies installed successfully');
    } catch (error) {
      spinner.fail('Failed to install dependencies');
      console.error(chalk.yellow('\n💡 Try running these commands manually:'));
      console.error(chalk.gray('  npm install --ignore-workspace-root-check'));
      console.error(chalk.gray('  cd packages/cli && npm install'));
      console.error(chalk.gray('  cd ../shared && npm install'));
      console.error(chalk.gray('  cd ../../backend && npm install'));
      console.error(chalk.gray('  cd ../docker-backend && npm install'));
      throw error;
    }
  }

  async setupHusky() {
    const spinner = ora('Setting up Git hooks...').start();
    
    try {
      this.exec('npx husky install', { cwd: this.rootDir });
      
      // Add pre-commit hook
      const preCommitHook = `#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npm run lint-staged
`;
      
      await fs.ensureDir(path.join(this.rootDir, '.husky'));
      await fs.writeFile(path.join(this.rootDir, '.husky/pre-commit'), preCommitHook);
      await fs.chmod(path.join(this.rootDir, '.husky/pre-commit'), '755');
      
      spinner.succeed('Git hooks configured');
    } catch (error) {
      spinner.fail('Failed to setup Git hooks');
      // Don't fail the entire setup for this
      console.warn(chalk.yellow('Warning: Git hooks setup failed, continuing...'));
    }
  }

  async generatePrismaClient() {
    const spinner = ora('Generating Prisma client...').start();
    
    try {
      const prismaSchema = path.join(this.rootDir, 'backend/prisma/schema.prisma');
      
      if (await fs.pathExists(prismaSchema)) {
        this.exec('npx prisma generate', { cwd: path.join(this.rootDir, 'backend') });
        spinner.succeed('Prisma client generated');
      } else {
        spinner.info('No Prisma schema found, skipping');
      }
    } catch (error) {
      spinner.warn('Prisma client generation failed');
      // Don't fail setup for this
    }
  }

  async runInitialBuild() {
    const spinner = ora('Running initial build...').start();
    
    try {
      this.exec('npm run build', { cwd: this.rootDir });
      spinner.succeed('Initial build completed');
    } catch (error) {
      spinner.fail('Initial build failed');
      throw error;
    }
  }

  async setupDevelopmentConfig() {
    const spinner = ora('Setting up development configuration...').start();
    
    try {
      // Create development directories
      const devDirs = [
        'logs',
        'uploads',
        'temp'
      ];
      
      for (const dir of devDirs) {
        await fs.ensureDir(path.join(this.rootDir, dir));
      }
      
      // Add to .gitignore if not present
      const gitignorePath = path.join(this.rootDir, '.gitignore');
      let gitignoreContent = '';
      
      if (await fs.pathExists(gitignorePath)) {
        gitignoreContent = await fs.readFile(gitignorePath, 'utf8');
      }
      
      const ignorePatterns = [
        'logs/',
        'uploads/',
        'temp/',
        '.env.local',
        '.env.development.local',
        '.env.test.local',
        '.env.production.local'
      ];
      
      let needsUpdate = false;
      for (const pattern of ignorePatterns) {
        if (!gitignoreContent.includes(pattern)) {
          gitignoreContent += `\n${pattern}`;
          needsUpdate = true;
        }
      }
      
      if (needsUpdate) {
        await fs.writeFile(gitignorePath, gitignoreContent);
      }
      
      spinner.succeed('Development configuration completed');
    } catch (error) {
      spinner.fail('Development configuration failed');
      throw error;
    }
  }

  versionSatisfies(current, required) {
    const [currentMajor, currentMinor, currentPatch] = current.split('.').map(Number);
    const [requiredMajor, requiredMinor, requiredPatch] = required.split('.').map(Number);
    
    if (currentMajor > requiredMajor) return true;
    if (currentMajor < requiredMajor) return false;
    if (currentMinor > requiredMinor) return true;
    if (currentMinor < requiredMinor) return false;
    return currentPatch >= requiredPatch;
  }

  exec(command, options = {}) {
    return execSync(command, {
      stdio: 'pipe',
      encoding: 'utf8',
      ...options
    });
  }

  printNextSteps() {
    console.log(chalk.blue('\n📋 Next Steps:\n'));
    console.log('1. Configure your environment variables:');
    console.log(chalk.gray('   - Edit .env for root configuration'));
    console.log(chalk.gray('   - Edit backend/.env for API configuration'));
    console.log('');
    console.log('2. Start development servers:');
    console.log(chalk.gray('   npm run dev              # Start all services'));
    console.log(chalk.gray('   npm run dev:cli          # CLI development'));
    console.log(chalk.gray('   npm run dev:backend      # Backend API'));
    console.log(chalk.gray('   npm run dev:web          # Web dashboard'));
    console.log('');
    console.log('3. Run tests:');
    console.log(chalk.gray('   npm test                 # Run all tests'));
    console.log(chalk.gray('   npm run test:coverage    # With coverage'));
    console.log('');
    console.log('4. Build for production:');
    console.log(chalk.gray('   npm run build            # Build all packages'));
    console.log('');
    console.log(chalk.green('Happy coding! 🚀'));
  }
}

// Run if executed directly
if (require.main === module) {
  const setup = new SetupScript();
  setup.run();
}

module.exports = SetupScript;
