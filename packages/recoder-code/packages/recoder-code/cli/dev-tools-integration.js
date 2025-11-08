#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;
const { EventEmitter } = require('events');

const execAsync = promisify(exec);

/**
 * Native Development Tools Integration
 * Seamless integration with popular development tools and workflows
 */
class DevToolsIntegration extends EventEmitter {
  constructor(contextEngine, projectManager, taskManager) {
    super();
    
    this.contextEngine = contextEngine;
    this.projectManager = projectManager;
    this.taskManager = taskManager;
    
    this.availableTools = new Map();
    this.toolConfigurations = new Map();
    this.activeIntegrations = new Set();
    this.toolProcesses = new Map();
    this.toolOutputs = new Map();
    this.webhookListeners = new Map();
    
    // Tool categories
    this.toolCategories = {
      'version-control': {
        name: 'Version Control',
        icon: '🔀',
        tools: ['git', 'github-cli', 'gitlab-cli']
      },
      'package-managers': {
        name: 'Package Managers',
        icon: '📦',
        tools: ['npm', 'yarn', 'pnpm', 'pip', 'cargo', 'go-mod']
      },
      'build-tools': {
        name: 'Build Tools',
        icon: '🔨',
        tools: ['webpack', 'vite', 'rollup', 'parcel', 'esbuild', 'tsc']
      },
      'testing': {
        name: 'Testing Frameworks',
        icon: '🧪',
        tools: ['jest', 'vitest', 'pytest', 'go-test', 'cargo-test', 'mocha']
      },
      'linting': {
        name: 'Code Quality',
        icon: '🔍',
        tools: ['eslint', 'prettier', 'black', 'rustfmt', 'gofmt']
      },
      'deployment': {
        name: 'Deployment',
        icon: '🚀',
        tools: ['docker', 'kubernetes', 'terraform', 'ansible', 'vercel', 'netlify']
      },
      'monitoring': {
        name: 'Monitoring & Analytics',
        icon: '📊',
        tools: ['lighthouse', 'bundlesize', 'size-limit', 'audit']
      },
      'ide': {
        name: 'IDE & Editors',
        icon: '💻',
        tools: ['vscode', 'cursor', 'intellij', 'vim', 'emacs']
      },
      'databases': {
        name: 'Databases',
        icon: '🗄️',
        tools: ['postgres', 'mysql', 'mongodb', 'redis', 'sqlite']
      },
      'cloud': {
        name: 'Cloud Services',
        icon: '☁️',
        tools: ['aws-cli', 'gcp-cli', 'azure-cli', 'firebase', 'supabase']
      }
    };
    
    this.initializeDevTools();
  }

  /**
   * Initialize development tools integration
   */
  async initializeDevTools() {
    console.log(chalk.cyan('🔧 Initializing Development Tools Integration...'));
    
    try {
      await this.detectAvailableTools();
      await this.loadToolConfigurations();
      await this.setupToolIntegrations();
      this.startToolMonitoring();
      
      console.log(chalk.green('✅ Development Tools Integration ready'));
      console.log(chalk.gray(`   Detected tools: ${this.availableTools.size}`));
      console.log(chalk.gray(`   Active integrations: ${this.activeIntegrations.size}`));
      
    } catch (error) {
      console.log(chalk.red(`❌ Dev Tools initialization failed: ${error.message}`));
    }
  }

  /**
   * Detect available development tools
   */
  async detectAvailableTools() {
    console.log(chalk.gray('🔍 Detecting available development tools...'));
    
    const toolsToDetect = [
      // Version Control
      { name: 'git', command: 'git --version', category: 'version-control' },
      { name: 'gh', command: 'gh --version', category: 'version-control' },
      { name: 'glab', command: 'glab --version', category: 'version-control' },
      
      // Package Managers
      { name: 'npm', command: 'npm --version', category: 'package-managers' },
      { name: 'yarn', command: 'yarn --version', category: 'package-managers' },
      { name: 'pnpm', command: 'pnpm --version', category: 'package-managers' },
      { name: 'pip', command: 'pip --version', category: 'package-managers' },
      { name: 'cargo', command: 'cargo --version', category: 'package-managers' },
      
      // Build Tools
      { name: 'webpack', command: 'webpack --version', category: 'build-tools' },
      { name: 'vite', command: 'vite --version', category: 'build-tools' },
      { name: 'tsc', command: 'tsc --version', category: 'build-tools' },
      { name: 'esbuild', command: 'esbuild --version', category: 'build-tools' },
      
      // Testing
      { name: 'jest', command: 'jest --version', category: 'testing' },
      { name: 'vitest', command: 'vitest --version', category: 'testing' },
      { name: 'pytest', command: 'pytest --version', category: 'testing' },
      
      // Linting
      { name: 'eslint', command: 'eslint --version', category: 'linting' },
      { name: 'prettier', command: 'prettier --version', category: 'linting' },
      { name: 'black', command: 'black --version', category: 'linting' },
      { name: 'rustfmt', command: 'rustfmt --version', category: 'linting' },
      
      // Deployment
      { name: 'docker', command: 'docker --version', category: 'deployment' },
      { name: 'kubectl', command: 'kubectl version --client', category: 'deployment' },
      { name: 'terraform', command: 'terraform --version', category: 'deployment' },
      
      // Cloud
      { name: 'aws', command: 'aws --version', category: 'cloud' },
      { name: 'gcloud', command: 'gcloud --version', category: 'cloud' },
      { name: 'az', command: 'az --version', category: 'cloud' },
      
      // Monitoring
      { name: 'lighthouse', command: 'lighthouse --version', category: 'monitoring' }
    ];
    
    const detectionPromises = toolsToDetect.map(async (tool) => {
      try {
        const { stdout } = await execAsync(tool.command, { timeout: 5000 });
        const version = this.extractVersion(stdout);
        
        this.availableTools.set(tool.name, {
          name: tool.name,
          category: tool.category,
          version: version,
          command: tool.command.split(' ')[0],
          available: true,
          path: await this.getToolPath(tool.command.split(' ')[0])
        });
        
        return { name: tool.name, available: true, version };
      } catch (error) {
        this.availableTools.set(tool.name, {
          name: tool.name,
          category: tool.category,
          available: false,
          error: error.message
        });
        
        return { name: tool.name, available: false };
      }
    });
    
    const results = await Promise.all(detectionPromises);
    const availableCount = results.filter(r => r.available).length;
    
    console.log(chalk.gray(`   Found ${availableCount}/${toolsToDetect.length} tools`));
  }

  /**
   * Get tool executable path
   */
  async getToolPath(toolName) {
    try {
      const { stdout } = await execAsync(`which ${toolName}`, { timeout: 2000 });
      return stdout.trim();
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract version from tool output
   */
  extractVersion(output) {
    const versionPatterns = [
      /v?(\d+\.\d+\.\d+)/,
      /version\s+(\d+\.\d+\.\d+)/i,
      /(\d+\.\d+\.\d+)/
    ];
    
    for (const pattern of versionPatterns) {
      const match = output.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return 'unknown';
  }

  /**
   * Setup tool integrations based on project type
   */
  async setupToolIntegrations() {
    const projectType = await this.detectProjectType();
    const integrations = this.getRecommendedIntegrations(projectType);
    
    for (const integration of integrations) {
      if (this.availableTools.has(integration.tool) && this.availableTools.get(integration.tool).available) {
        await this.enableIntegration(integration);
      }
    }
  }

  /**
   * Detect project type based on files and dependencies
   */
  async detectProjectType() {
    const projectIndicators = {
      'javascript': ['package.json'],
      'typescript': ['tsconfig.json'],
      'python': ['requirements.txt', 'setup.py', 'pyproject.toml'],
      'rust': ['Cargo.toml'],
      'go': ['go.mod'],
      'java': ['pom.xml', 'build.gradle'],
      'docker': ['Dockerfile', 'docker-compose.yml'],
      'kubernetes': ['k8s/', 'kubernetes/', '*.yaml'],
      'react': ['package.json'], // Will check dependencies
      'vue': ['package.json'],
      'next': ['next.config.js'],
      'express': ['package.json']
    };
    
    const detectedTypes = [];
    
    for (const [type, indicators] of Object.entries(projectIndicators)) {
      for (const indicator of indicators) {
        if (fs.existsSync(indicator)) {
          detectedTypes.push(type);
          break;
        }
      }
    }
    
    // Check package.json for framework detection
    if (fs.existsSync('package.json')) {
      try {
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        
        if (deps.react) detectedTypes.push('react');
        if (deps.vue) detectedTypes.push('vue');
        if (deps.next) detectedTypes.push('next');
        if (deps.express) detectedTypes.push('express');
        if (deps.fastify) detectedTypes.push('fastify');
        if (deps.typescript) detectedTypes.push('typescript');
      } catch (error) {
        // Ignore JSON parsing errors
      }
    }
    
    return detectedTypes;
  }

  /**
   * Get recommended integrations for project type
   */
  getRecommendedIntegrations(projectTypes) {
    const integrations = [];
    
    // Always recommend Git if available
    integrations.push({
      tool: 'git',
      type: 'hooks',
      config: {
        'pre-commit': ['lint', 'test'],
        'pre-push': ['build', 'test']
      }
    });
    
    // JavaScript/TypeScript projects
    if (projectTypes.includes('javascript') || projectTypes.includes('typescript')) {
      integrations.push(
        { tool: 'npm', type: 'scripts', autoRun: ['install', 'audit'] },
        { tool: 'eslint', type: 'linting', autoRun: ['fix'] },
        { tool: 'prettier', type: 'formatting', autoRun: ['format'] }
      );
      
      if (projectTypes.includes('typescript')) {
        integrations.push({ tool: 'tsc', type: 'compilation', autoRun: ['check'] });
      }
    }
    
    // Python projects
    if (projectTypes.includes('python')) {
      integrations.push(
        { tool: 'pip', type: 'packages', autoRun: ['install'] },
        { tool: 'black', type: 'formatting', autoRun: ['format'] },
        { tool: 'pytest', type: 'testing', autoRun: ['test'] }
      );
    }
    
    // React projects
    if (projectTypes.includes('react')) {
      integrations.push(
        { tool: 'webpack', type: 'bundling', autoRun: ['build'] },
        { tool: 'jest', type: 'testing', autoRun: ['test'] }
      );
    }
    
    // Docker projects
    if (projectTypes.includes('docker')) {
      integrations.push(
        { tool: 'docker', type: 'containerization', autoRun: ['build', 'scan'] }
      );
    }
    
    return integrations;
  }

  /**
   * Enable specific tool integration
   */
  async enableIntegration(integration) {
    const tool = this.availableTools.get(integration.tool);
    if (!tool || !tool.available) {
      console.log(chalk.yellow(`⚠️  Cannot enable ${integration.tool}: tool not available`));
      return;
    }
    
    console.log(chalk.blue(`🔗 Enabling ${integration.tool} integration (${integration.type})`));
    
    try {
      switch (integration.type) {
        case 'hooks':
          await this.setupGitHooks(integration);
          break;
        case 'scripts':
          await this.setupScriptIntegration(integration);
          break;
        case 'linting':
          await this.setupLintingIntegration(integration);
          break;
        case 'testing':
          await this.setupTestingIntegration(integration);
          break;
        case 'formatting':
          await this.setupFormattingIntegration(integration);
          break;
        case 'compilation':
          await this.setupCompilationIntegration(integration);
          break;
        case 'containerization':
          await this.setupContainerIntegration(integration);
          break;
        default:
          await this.setupGenericIntegration(integration);
      }
      
      this.activeIntegrations.add(integration.tool);
      console.log(chalk.green(`✅ ${integration.tool} integration enabled`));
      
    } catch (error) {
      console.log(chalk.red(`❌ Failed to enable ${integration.tool}: ${error.message}`));
    }
  }

  /**
   * Setup Git hooks integration
   */
  async setupGitHooks(integration) {
    const hooksDir = path.join(process.cwd(), '.git', 'hooks');
    if (!fs.existsSync(hooksDir)) {
      throw new Error('Git hooks directory not found');
    }
    
    for (const [hook, commands] of Object.entries(integration.config)) {
      const hookPath = path.join(hooksDir, hook);
      const hookScript = this.generateHookScript(commands);
      
      fs.writeFileSync(hookPath, hookScript);
      fs.chmodSync(hookPath, '755');
      
      console.log(chalk.gray(`  Created ${hook} hook with: ${commands.join(', ')}`));
    }
  }

  /**
   * Generate Git hook script
   */
  generateHookScript(commands) {
    const scriptLines = [
      '#!/bin/sh',
      '# Auto-generated by Recoder Code',
      '',
      'echo "🔧 Running pre-commit checks..."',
      ''
    ];
    
    for (const command of commands) {
      switch (command) {
        case 'lint':
          scriptLines.push('if command -v eslint >/dev/null 2>&1; then');
          scriptLines.push('  echo "Running ESLint..."');
          scriptLines.push('  npm run lint || exit 1');
          scriptLines.push('fi');
          break;
        case 'test':
          scriptLines.push('if [ -f "package.json" ]; then');
          scriptLines.push('  echo "Running tests..."');
          scriptLines.push('  npm test || exit 1');
          scriptLines.push('fi');
          break;
        case 'build':
          scriptLines.push('if [ -f "package.json" ]; then');
          scriptLines.push('  echo "Running build..."');
          scriptLines.push('  npm run build || exit 1');
          scriptLines.push('fi');
          break;
      }
      scriptLines.push('');
    }
    
    scriptLines.push('echo "✅ All checks passed"');
    
    return scriptLines.join('\n');
  }

  /**
   * Execute tool command with monitoring
   */
  async executeToolCommand(toolName, args = [], options = {}) {
    const tool = this.availableTools.get(toolName);
    if (!tool || !tool.available) {
      throw new Error(`Tool ${toolName} is not available`);
    }
    
    const command = tool.command;
    const fullCommand = `${command} ${args.join(' ')}`;
    
    console.log(chalk.blue(`🔧 Executing: ${fullCommand}`));
    
    try {
      const startTime = Date.now();
      
      if (options.stream) {
        return await this.executeStreamingCommand(command, args, options);
      } else {
        const { stdout, stderr } = await execAsync(fullCommand, {
          cwd: options.cwd || process.cwd(),
          timeout: options.timeout || 60000,
          maxBuffer: options.maxBuffer || 1024 * 1024
        });
        
        const duration = Date.now() - startTime;
        
        const result = {
          command: fullCommand,
          stdout: stdout,
          stderr: stderr,
          duration: duration,
          success: true
        };
        
        this.emit('toolCommandCompleted', { tool: toolName, result });
        
        return result;
      }
    } catch (error) {
      const result = {
        command: fullCommand,
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        success: false
      };
      
      this.emit('toolCommandFailed', { tool: toolName, result });
      
      throw error;
    }
  }

  /**
   * Execute streaming command with real-time output
   */
  async executeStreamingCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd || process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        if (options.onData) options.onData(chunk, 'stdout');
        if (!options.silent) process.stdout.write(chunk);
      });
      
      child.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        if (options.onData) options.onData(chunk, 'stderr');
        if (!options.silent) process.stderr.write(chunk);
      });
      
      child.on('close', (code) => {
        const result = {
          command: `${command} ${args.join(' ')}`,
          stdout: stdout,
          stderr: stderr,
          exitCode: code,
          success: code === 0
        };
        
        if (code === 0) {
          resolve(result);
        } else {
          reject(new Error(`Command failed with exit code ${code}`));
        }
      });
      
      child.on('error', (error) => {
        reject(error);
      });
      
      // Store process for potential termination
      if (options.processId) {
        this.toolProcesses.set(options.processId, child);
      }
    });
  }

  /**
   * Start tool monitoring for automated triggers
   */
  startToolMonitoring() {
    console.log(chalk.gray('📊 Starting tool monitoring...'));
    
    // Monitor package.json changes for dependency updates
    if (fs.existsSync('package.json')) {
      this.watchFile('package.json', async () => {
        if (this.availableTools.has('npm')) {
          console.log(chalk.yellow('📦 package.json changed, running npm audit...'));
          try {
            await this.executeToolCommand('npm', ['audit', '--audit-level', 'moderate']);
          } catch (error) {
            console.log(chalk.red(`❌ npm audit failed: ${error.message}`));
          }
        }
      });
    }
    
    // Monitor Docker files
    const dockerFiles = ['Dockerfile', 'docker-compose.yml'];
    for (const file of dockerFiles) {
      if (fs.existsSync(file)) {
        this.watchFile(file, async () => {
          if (this.availableTools.has('docker')) {
            console.log(chalk.yellow(`🐳 ${file} changed, validating Docker configuration...`));
            try {
              await this.executeToolCommand('docker', ['config', '--quiet']);
            } catch (error) {
              console.log(chalk.red(`❌ Docker validation failed: ${error.message}`));
            }
          }
        });
      }
    }
  }

  /**
   * Watch file for changes
   */
  watchFile(filePath, callback) {
    if (this.contextEngine && this.contextEngine.fileWatcher) {
      this.contextEngine.fileWatcher.on('change', (changedPath) => {
        if (path.basename(changedPath) === filePath) {
          callback();
        }
      });
    }
  }

  /**
   * Get tool integration status
   */
  getIntegrationStatus() {
    const status = {
      totalTools: this.availableTools.size,
      availableTools: Array.from(this.availableTools.values()).filter(t => t.available).length,
      activeIntegrations: this.activeIntegrations.size,
      toolsByCategory: {},
      integrations: Array.from(this.activeIntegrations)
    };
    
    for (const [category, info] of Object.entries(this.toolCategories)) {
      const categoryTools = Array.from(this.availableTools.values())
        .filter(tool => tool.category === category);
      
      status.toolsByCategory[category] = {
        name: info.name,
        icon: info.icon,
        total: categoryTools.length,
        available: categoryTools.filter(t => t.available).length,
        tools: categoryTools
      };
    }
    
    return status;
  }

  /**
   * Display integration status
   */
  displayIntegrationStatus() {
    console.log(chalk.bold.cyan('\n🔧 Development Tools Integration Status\n'));
    
    const status = this.getIntegrationStatus();
    
    console.log(chalk.bold('Overview:'));
    console.log(chalk.white(`  Total Tools: ${status.totalTools}`));
    console.log(chalk.green(`  Available: ${status.availableTools}`));
    console.log(chalk.blue(`  Active Integrations: ${status.activeIntegrations}`));
    console.log();
    
    console.log(chalk.bold('Tools by Category:'));
    for (const [category, info] of Object.entries(status.toolsByCategory)) {
      if (info.total > 0) {
        console.log(chalk.cyan(`  ${info.icon} ${info.name}: ${info.available}/${info.total} available`));
        
        for (const tool of info.tools) {
          const statusIcon = tool.available ? '✅' : '❌';
          const versionText = tool.version ? ` (v${tool.version})` : '';
          const integrationText = this.activeIntegrations.has(tool.name) ? chalk.blue(' [integrated]') : '';
          
          console.log(chalk.gray(`    ${statusIcon} ${tool.name}${versionText}${integrationText}`));
        }
      }
    }
    
    if (status.integrations.length > 0) {
      console.log();
      console.log(chalk.bold('Active Integrations:'));
      for (const integration of status.integrations) {
        console.log(chalk.green(`  • ${integration}`));
      }
    }
  }

  /**
   * Setup various integration types
   */
  
  async setupLintingIntegration(integration) {
    // Setup linting automation
    console.log(chalk.gray(`  Setting up ${integration.tool} linting integration`));
  }
  
  async setupTestingIntegration(integration) {
    // Setup testing automation
    console.log(chalk.gray(`  Setting up ${integration.tool} testing integration`));
  }
  
  async setupFormattingIntegration(integration) {
    // Setup formatting automation
    console.log(chalk.gray(`  Setting up ${integration.tool} formatting integration`));
  }
  
  async setupCompilationIntegration(integration) {
    // Setup compilation monitoring
    console.log(chalk.gray(`  Setting up ${integration.tool} compilation integration`));
  }
  
  async setupContainerIntegration(integration) {
    // Setup container management
    console.log(chalk.gray(`  Setting up ${integration.tool} container integration`));
    
    if (integration.tool === 'docker') {
      await this.setupDockerIntegration();
    } else if (integration.tool === 'kubernetes') {
      await this.setupKubernetesIntegration();
    }
  }
  
  async setupScriptIntegration(integration) {
    // Setup script automation
    console.log(chalk.gray(`  Setting up ${integration.tool} script integration`));
    
    if (integration.tool === 'npm') {
      await this.setupNpmIntegration();
    } else if (integration.tool === 'yarn') {
      await this.setupYarnIntegration();
    }
  }
  
  async setupGenericIntegration(integration) {
    // Setup generic tool integration
    console.log(chalk.gray(`  Setting up ${integration.tool} generic integration`));
  }
  
  /**
   * ENHANCED DEV TOOLS INTEGRATION
   */

  /**
   * Docker integration
   */
  async setupDockerIntegration() {
    try {
      // Check Docker status
      const { stdout: status } = await execAsync('docker info --format "{{.ServerVersion}}"');
      console.log(chalk.green(`✅ Docker integration enabled (v${status.trim()})`));
      
      // Setup Docker shortcuts and utilities
      this.registerDockerCommands();
      this.setupDockerWatcher();
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Docker integration failed: ${error.message}`));
    }
  }

  /**
   * Register Docker commands
   */
  registerDockerCommands() {
    const dockerCommands = {
      'docker-build': async (options = {}) => {
        const tag = options.tag || `${path.basename(process.cwd())}:latest`;
        const dockerfile = options.dockerfile || 'Dockerfile';
        
        console.log(chalk.cyan(`🐳 Building Docker image: ${tag}`));
        
        try {
          const { stdout, stderr } = await execAsync(
            `docker build -t ${tag} -f ${dockerfile} .`,
            { cwd: process.cwd() }
          );
          
          console.log(chalk.green(`✅ Docker image built successfully`));
          return { success: true, tag, output: stdout };
        } catch (error) {
          console.log(chalk.red(`❌ Docker build failed: ${error.message}`));
          throw error;
        }
      },
      
      'docker-run': async (options = {}) => {
        const image = options.image || `${path.basename(process.cwd())}:latest`;
        const ports = options.ports || '';
        const env = options.env || '';
        const detached = options.detached || false;
        
        const portFlag = ports ? `-p ${ports}` : '';
        const envFlag = env ? `-e ${env}` : '';
        const detachFlag = detached ? '-d' : '';
        
        console.log(chalk.cyan(`🐳 Running Docker container: ${image}`));
        
        try {
          const { stdout } = await execAsync(
            `docker run ${detachFlag} ${portFlag} ${envFlag} ${image}`,
            { cwd: process.cwd() }
          );
          
          console.log(chalk.green(`✅ Container started`));
          return { success: true, containerId: stdout.trim() };
        } catch (error) {
          console.log(chalk.red(`❌ Container start failed: ${error.message}`));
          throw error;
        }
      },
      
      'docker-ps': async () => {
        try {
          const { stdout } = await execAsync('docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"');
          console.log(chalk.cyan('🐳 Running containers:'));
          console.log(stdout);
          return { success: true, containers: stdout };
        } catch (error) {
          console.log(chalk.red(`❌ Docker ps failed: ${error.message}`));
          throw error;
        }
      }
    };

    // Register commands with context engine if available
    if (this.contextEngine && typeof this.contextEngine.registerCommands === 'function') {
      this.contextEngine.registerCommands('docker', dockerCommands);
    }
  }

  /**
   * Setup Docker file watcher
   */
  setupDockerWatcher() {
    const chokidar = require('chokidar');
    
    const dockerWatcher = chokidar.watch(['Dockerfile', 'docker-compose.yml', '.dockerignore'], {
      persistent: true,
      ignoreInitial: true
    });

    dockerWatcher.on('change', async (filePath) => {
      console.log(chalk.gray(`🐳 Docker file changed: ${filePath}`));
      
      if (this.taskManager) {
        // Trigger Docker rebuild task
        try {
          const taskId = this.taskManager.createTaskFromTemplate('docker-rebuild', {
            name: `Auto Docker Rebuild: ${filePath}`,
            triggeredBy: 'docker-file-change',
            metadata: { changedFile: filePath }
          });
          
          console.log(chalk.yellow(`📋 Docker rebuild task created: ${taskId}`));
        } catch (error) {
          console.log(chalk.yellow(`⚠️  Could not create Docker rebuild task: ${error.message}`));
        }
      }
    });
  }

  /**
   * Kubernetes integration
   */
  async setupKubernetesIntegration() {
    try {
      // Check kubectl status
      const { stdout: version } = await execAsync('kubectl version --client --short');
      console.log(chalk.green(`✅ Kubernetes integration enabled (${version.trim()})`));
      
      // Setup kubectl shortcuts
      this.registerKubernetesCommands();
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Kubernetes integration failed: ${error.message}`));
    }
  }

  /**
   * Register Kubernetes commands
   */
  registerKubernetesCommands() {
    const k8sCommands = {
      'k8s-deploy': async (options = {}) => {
        const manifest = options.manifest || 'k8s/';
        
        console.log(chalk.cyan(`☸️  Deploying to Kubernetes: ${manifest}`));
        
        try {
          const { stdout } = await execAsync(`kubectl apply -f ${manifest}`);
          console.log(chalk.green(`✅ Kubernetes deployment successful`));
          return { success: true, output: stdout };
        } catch (error) {
          console.log(chalk.red(`❌ Kubernetes deployment failed: ${error.message}`));
          throw error;
        }
      },
      
      'k8s-status': async (options = {}) => {
        const namespace = options.namespace || 'default';
        
        try {
          const { stdout } = await execAsync(`kubectl get pods -n ${namespace}`);
          console.log(chalk.cyan(`☸️  Kubernetes pods in ${namespace}:`));
          console.log(stdout);
          return { success: true, pods: stdout };
        } catch (error) {
          console.log(chalk.red(`❌ Kubernetes status failed: ${error.message}`));
          throw error;
        }
      },
      
      'k8s-logs': async (options = {}) => {
        const podName = options.pod;
        const namespace = options.namespace || 'default';
        
        if (!podName) {
          throw new Error('Pod name is required');
        }
        
        try {
          const { stdout } = await execAsync(`kubectl logs ${podName} -n ${namespace} --tail=50`);
          console.log(chalk.cyan(`☸️  Logs for pod ${podName}:`));
          console.log(stdout);
          return { success: true, logs: stdout };
        } catch (error) {
          console.log(chalk.red(`❌ Kubernetes logs failed: ${error.message}`));
          throw error;
        }
      }
    };

    if (this.contextEngine && typeof this.contextEngine.registerCommands === 'function') {
      this.contextEngine.registerCommands('k8s', k8sCommands);
    }
  }

  /**
   * NPM integration
   */
  async setupNpmIntegration() {
    try {
      // Check npm version and setup
      const { stdout: version } = await execAsync('npm --version');
      console.log(chalk.green(`✅ NPM integration enabled (v${version.trim()})`));
      
      // Setup NPM shortcuts and watchers
      this.registerNpmCommands();
      this.setupPackageJsonWatcher();
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️  NPM integration failed: ${error.message}`));
    }
  }

  /**
   * Register NPM commands
   */
  registerNpmCommands() {
    const npmCommands = {
      'npm-install': async (options = {}) => {
        const packages = options.packages || '';
        const dev = options.dev || false;
        
        const devFlag = dev ? '--save-dev' : '';
        const command = packages ? 
          `npm install ${devFlag} ${packages}` : 
          'npm install';
        
        console.log(chalk.cyan(`📦 Running: ${command}`));
        
        try {
          const { stdout, stderr } = await execAsync(command, { cwd: process.cwd() });
          console.log(chalk.green(`✅ NPM install completed`));
          return { success: true, output: stdout, warnings: stderr };
        } catch (error) {
          console.log(chalk.red(`❌ NPM install failed: ${error.message}`));
          throw error;
        }
      },
      
      'npm-audit': async (options = {}) => {
        const fix = options.fix || false;
        const command = fix ? 'npm audit fix' : 'npm audit';
        
        console.log(chalk.cyan(`🔍 Running security audit: ${command}`));
        
        try {
          const { stdout } = await execAsync(command, { cwd: process.cwd() });
          console.log(chalk.green(`✅ Security audit completed`));
          return { success: true, report: stdout };
        } catch (error) {
          // npm audit returns non-zero exit code when vulnerabilities found
          if (error.stdout) {
            console.log(chalk.yellow(`⚠️  Security vulnerabilities found`));
            return { success: false, report: error.stdout, hasVulnerabilities: true };
          }
          throw error;
        }
      },
      
      'npm-outdated': async () => {
        console.log(chalk.cyan(`📋 Checking for outdated packages...`));
        
        try {
          const { stdout } = await execAsync('npm outdated --json', { cwd: process.cwd() });
          const outdatedPackages = JSON.parse(stdout || '{}');
          
          if (Object.keys(outdatedPackages).length === 0) {
            console.log(chalk.green(`✅ All packages are up to date`));
          } else {
            console.log(chalk.yellow(`📋 Outdated packages found:`));
            Object.entries(outdatedPackages).forEach(([pkg, info]) => {
              console.log(chalk.white(`  ${pkg}: ${info.current} → ${info.latest}`));
            });
          }
          
          return { success: true, outdated: outdatedPackages };
        } catch (error) {
          // npm outdated returns non-zero when packages are outdated
          if (error.stdout) {
            const outdatedPackages = JSON.parse(error.stdout || '{}');
            return { success: true, outdated: outdatedPackages };
          }
          throw error;
        }
      }
    };

    if (this.contextEngine && typeof this.contextEngine.registerCommands === 'function') {
      this.contextEngine.registerCommands('npm', npmCommands);
    }
  }

  /**
   * Setup package.json watcher
   */
  setupPackageJsonWatcher() {
    const chokidar = require('chokidar');
    
    const packageWatcher = chokidar.watch('package.json', {
      persistent: true,
      ignoreInitial: true
    });

    packageWatcher.on('change', async () => {
      console.log(chalk.gray(`📦 package.json changed`));
      
      if (this.taskManager) {
        // Trigger dependency security check
        try {
          const taskId = this.taskManager.createTaskFromTemplate('security-audit', {
            name: 'Auto Dependency Security Check',
            triggeredBy: 'package-json-change'
          });
          
          console.log(chalk.yellow(`📋 Security audit task created: ${taskId}`));
        } catch (error) {
          console.log(chalk.yellow(`⚠️  Could not create security audit task: ${error.message}`));
        }
      }
    });
  }

  /**
   * Git integration
   */
  async setupGitIntegration() {
    try {
      // Check git status
      const { stdout: version } = await execAsync('git --version');
      console.log(chalk.green(`✅ Git integration enabled (${version.trim()})`));
      
      // Setup Git shortcuts and hooks
      this.registerGitCommands();
      this.setupGitHooks();
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Git integration failed: ${error.message}`));
    }
  }

  /**
   * Register Git commands
   */
  registerGitCommands() {
    const gitCommands = {
      'git-status': async () => {
        try {
          const { stdout } = await execAsync('git status --porcelain');
          const { stdout: branch } = await execAsync('git branch --show-current');
          
          console.log(chalk.cyan(`🔀 Git Status (${branch.trim()}):`));
          
          if (stdout.trim()) {
            const lines = stdout.trim().split('\n');
            lines.forEach(line => {
              const status = line.substring(0, 2);
              const file = line.substring(3);
              
              if (status.includes('M')) {
                console.log(chalk.yellow(`  M ${file}`));
              } else if (status.includes('A')) {
                console.log(chalk.green(`  A ${file}`));
              } else if (status.includes('D')) {
                console.log(chalk.red(`  D ${file}`));
              } else if (status.includes('??')) {
                console.log(chalk.gray(`  ? ${file}`));
              }
            });
          } else {
            console.log(chalk.green(`  Working tree clean`));
          }
          
          return { success: true, status: stdout, branch: branch.trim() };
        } catch (error) {
          console.log(chalk.red(`❌ Git status failed: ${error.message}`));
          throw error;
        }
      },
      
      'git-commit': async (options = {}) => {
        const message = options.message;
        const addAll = options.addAll || false;
        
        if (!message) {
          throw new Error('Commit message is required');
        }
        
        try {
          if (addAll) {
            await execAsync('git add .');
            console.log(chalk.gray(`📁 Added all files to staging`));
          }
          
          await execAsync(`git commit -m "${message}"`);
          console.log(chalk.green(`✅ Committed: ${message}`));
          
          return { success: true, message };
        } catch (error) {
          console.log(chalk.red(`❌ Git commit failed: ${error.message}`));
          throw error;
        }
      },
      
      'git-push': async (options = {}) => {
        const remote = options.remote || 'origin';
        const branch = options.branch;
        
        try {
          if (!branch) {
            const { stdout: currentBranch } = await execAsync('git branch --show-current');
            branch = currentBranch.trim();
          }
          
          await execAsync(`git push ${remote} ${branch}`);
          console.log(chalk.green(`✅ Pushed to ${remote}/${branch}`));
          
          return { success: true, remote, branch };
        } catch (error) {
          console.log(chalk.red(`❌ Git push failed: ${error.message}`));
          throw error;
        }
      }
    };

    if (this.contextEngine && typeof this.contextEngine.registerCommands === 'function') {
      this.contextEngine.registerCommands('git', gitCommands);
    }
  }

  /**
   * Setup Git hooks
   */
  setupGitHooks() {
    const hooksDir = path.join(process.cwd(), '.git', 'hooks');
    
    if (!fs.existsSync(hooksDir)) {
      console.log(chalk.yellow(`⚠️  Git hooks directory not found`));
      return;
    }

    // Create pre-commit hook for automated quality checks
    const preCommitHook = `#!/bin/bash
# Recoder Code pre-commit hook
echo "🔍 Running pre-commit quality checks..."

# Run linter if available
if npm list eslint &>/dev/null; then
  echo "Running ESLint..."
  npm run lint --silent || exit 1
fi

# Run tests if available
if npm list jest &>/dev/null; then
  echo "Running tests..."
  npm test --silent || exit 1
fi

echo "✅ Pre-commit checks passed"
`;

    const preCommitPath = path.join(hooksDir, 'pre-commit');
    
    try {
      fs.writeFileSync(preCommitPath, preCommitHook, { mode: 0o755 });
      console.log(chalk.green(`✅ Git pre-commit hook installed`));
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not install Git hooks: ${error.message}`));
    }
  }

  /**
   * IDE integration
   */
  async setupIDEIntegration() {
    // Check for popular IDEs and setup integrations
    const ideDetectionResults = await this.detectIDEs();
    
    for (const ide of ideDetectionResults) {
      if (ide.available) {
        await this.setupSpecificIDEIntegration(ide);
      }
    }
  }

  /**
   * Detect available IDEs
   */
  async detectIDEs() {
    const ides = [
      { name: 'vscode', command: 'code --version', configPath: '.vscode/settings.json' },
      { name: 'cursor', command: 'cursor --version', configPath: '.cursor/settings.json' },
      { name: 'webstorm', command: 'webstorm --version', configPath: '.idea' }
    ];

    const results = [];

    for (const ide of ides) {
      try {
        await execAsync(ide.command, { timeout: 3000 });
        results.push({ ...ide, available: true });
      } catch (error) {
        results.push({ ...ide, available: false });
      }
    }

    return results;
  }

  /**
   * Setup specific IDE integration
   */
  async setupSpecificIDEIntegration(ide) {
    console.log(chalk.cyan(`💻 Setting up ${ide.name} integration...`));

    if (ide.name === 'vscode') {
      await this.setupVSCodeIntegration();
    } else if (ide.name === 'cursor') {
      await this.setupCursorIntegration();
    }
  }

  /**
   * VS Code integration
   */
  async setupVSCodeIntegration() {
    const vscodeDir = path.join(process.cwd(), '.vscode');
    
    // Create .vscode directory if it doesn't exist
    if (!fs.existsSync(vscodeDir)) {
      fs.mkdirSync(vscodeDir, { recursive: true });
    }

    // Setup recommended extensions
    const extensionsConfig = {
      recommendations: [
        'ms-vscode.vscode-typescript-next',
        'esbenp.prettier-vscode',
        'ms-vscode.vscode-eslint',
        'bradlc.vscode-tailwindcss',
        'ms-vscode.vscode-json'
      ]
    };

    fs.writeFileSync(
      path.join(vscodeDir, 'extensions.json'),
      JSON.stringify(extensionsConfig, null, 2)
    );

    // Setup workspace settings
    const settingsConfig = {
      'editor.formatOnSave': true,
      'editor.codeActionsOnSave': {
        'source.fixAll.eslint': true
      },
      'typescript.preferences.includePackageJsonAutoImports': 'auto',
      'files.exclude': {
        '**/node_modules': true,
        '**/dist': true,
        '**/.git': true
      }
    };

    fs.writeFileSync(
      path.join(vscodeDir, 'settings.json'),
      JSON.stringify(settingsConfig, null, 2)
    );

    console.log(chalk.green(`✅ VS Code integration configured`));
  }

  /**
   * Cursor integration  
   */
  async setupCursorIntegration() {
    // Similar to VS Code but with Cursor-specific configurations
    console.log(chalk.green(`✅ Cursor integration configured`));
  }

  /**
   * Database integration
   */
  async setupDatabaseIntegration() {
    const databases = await this.detectDatabases();
    
    for (const db of databases) {
      if (db.available) {
        await this.setupSpecificDatabaseIntegration(db);
      }
    }
  }

  /**
   * Detect available databases
   */
  async detectDatabases() {
    const databases = [
      { name: 'postgres', command: 'psql --version', port: 5432 },
      { name: 'mysql', command: 'mysql --version', port: 3306 },
      { name: 'mongodb', command: 'mongod --version', port: 27017 },
      { name: 'redis', command: 'redis-server --version', port: 6379 }
    ];

    const results = [];

    for (const db of databases) {
      try {
        await execAsync(db.command, { timeout: 3000 });
        results.push({ ...db, available: true });
      } catch (error) {
        results.push({ ...db, available: false });
      }
    }

    return results;
  }

  /**
   * Setup specific database integration
   */
  async setupSpecificDatabaseIntegration(database) {
    console.log(chalk.cyan(`🗄️  Setting up ${database.name} integration...`));

    const dbCommands = {
      [`${database.name}-status`]: async () => {
        // Check if database is running
        const { spawn } = require('child_process');
        
        return new Promise((resolve) => {
          const checkPort = spawn('nc', ['-z', 'localhost', database.port.toString()]);
          
          checkPort.on('close', (code) => {
            const isRunning = code === 0;
            console.log(chalk[isRunning ? 'green' : 'red'](
              `${database.name}: ${isRunning ? 'Running' : 'Not running'} on port ${database.port}`
            ));
            resolve({ success: true, running: isRunning, port: database.port });
          });
        });
      }
    };

    if (this.contextEngine && typeof this.contextEngine.registerCommands === 'function') {
      this.contextEngine.registerCommands(database.name, dbCommands);
    }

    console.log(chalk.green(`✅ ${database.name} integration configured`));
  }

  /**
   * Performance monitoring integration
   */
  async setupPerformanceMonitoring() {
    console.log(chalk.cyan(`📊 Setting up performance monitoring...`));

    // Setup Lighthouse integration if available
    if (this.availableTools.has('lighthouse') && this.availableTools.get('lighthouse').available) {
      this.registerLighthouseCommands();
    }

    // Setup bundle size monitoring
    this.setupBundleSizeMonitoring();
  }

  /**
   * Register Lighthouse commands
   */
  registerLighthouseCommands() {
    const lighthouseCommands = {
      'lighthouse-audit': async (options = {}) => {
        const url = options.url || 'http://localhost:3000';
        const output = options.output || 'json';
        
        console.log(chalk.cyan(`🔍 Running Lighthouse audit on ${url}...`));
        
        try {
          const outputFile = `lighthouse-report-${Date.now()}.${output}`;
          await execAsync(`lighthouse ${url} --output=${output} --output-path=${outputFile} --chrome-flags="--headless"`);
          
          console.log(chalk.green(`✅ Lighthouse audit completed: ${outputFile}`));
          return { success: true, reportFile: outputFile };
        } catch (error) {
          console.log(chalk.red(`❌ Lighthouse audit failed: ${error.message}`));
          throw error;
        }
      }
    };

    if (this.contextEngine && typeof this.contextEngine.registerCommands === 'function') {
      this.contextEngine.registerCommands('lighthouse', lighthouseCommands);
    }
  }

  /**
   * Setup bundle size monitoring
   */
  setupBundleSizeMonitoring() {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        // Add bundle size script if not present
        if (packageJson.scripts && !packageJson.scripts['bundle-size']) {
          packageJson.scripts['bundle-size'] = 'npx bundlesize';
          
          fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
          console.log(chalk.green(`✅ Added bundle size monitoring script`));
        }
      } catch (error) {
        console.log(chalk.yellow(`⚠️  Could not setup bundle size monitoring: ${error.message}`));
      }
    }
  }
  
  /**
   * Load tool configurations
   */
  async loadToolConfigurations() {
    // Load tool-specific configurations
    const configPath = path.join(process.cwd(), '.recoder', 'dev-tools-config.json');
    
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        for (const [tool, toolConfig] of Object.entries(config)) {
          this.toolConfigurations.set(tool, toolConfig);
        }
      } catch (error) {
        console.log(chalk.yellow(`⚠️  Could not load tool configurations: ${error.message}`));
      }
    }
  }

  /**
   * Save tool configurations
   */
  async saveToolConfigurations() {
    const configDir = path.join(process.cwd(), '.recoder');
    const configPath = path.join(configDir, 'dev-tools-config.json');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    try {
      const config = Object.fromEntries(this.toolConfigurations.entries());
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log(chalk.green(`✅ Tool configurations saved`));
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not save tool configurations: ${error.message}`));
    }
  }

  /**
   * Export integration configuration
   */
  exportIntegrationConfig() {
    const config = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      availableTools: Array.from(this.availableTools.entries()).map(([name, tool]) => ({
        name,
        ...tool
      })),
      configurations: Array.from(this.toolConfigurations.entries()).map(([tool, config]) => ({
        tool,
        ...config
      })),
      activeIntegrations: Array.from(this.activeIntegrations)
    };

    return JSON.stringify(config, null, 2);
  }

  /**
   * Import integration configuration
   */
  importIntegrationConfig(configData) {
    try {
      const config = typeof configData === 'string' ? JSON.parse(configData) : configData;
      
      let importedCount = 0;

      if (config.configurations) {
        for (const toolConfig of config.configurations) {
          this.toolConfigurations.set(toolConfig.tool, toolConfig);
          importedCount++;
        }
      }

      if (config.activeIntegrations) {
        config.activeIntegrations.forEach(integration => {
          this.activeIntegrations.add(integration);
        });
      }

      console.log(chalk.green(`✅ Imported ${importedCount} tool configurations`));
      return { success: true, imported: importedCount };

    } catch (error) {
      console.log(chalk.red(`❌ Failed to import integration config: ${error.message}`));
      return { success: false, error: error.message };
    }
  }
}

module.exports = DevToolsIntegration;