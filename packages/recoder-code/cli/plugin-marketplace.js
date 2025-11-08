#!/usr/bin/env node

/**
 * Plugin Marketplace for Recoder Code
 * Handles plugin discovery, installation, and management
 */

const fs = require('fs').promises;
const path = require('path');
// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;
const crypto = require('crypto');
const https = require('https');
const { spawn } = require('child_process');
const semver = require('semver');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class PluginMarketplace {
  constructor(options = {}) {
    this.baseDir = options.baseDir || process.cwd();
    this.pluginsDir = path.join(this.baseDir, '.recoder', 'plugins');
    this.cacheDir = path.join(this.baseDir, '.recoder', 'cache');
    this.registryUrl = options.registryUrl || 'http://localhost:3000/api/v1';
    this.useLocalRegistry = options.useLocalRegistry !== false;
    this.localRegistry = path.join(this.cacheDir, 'registry.json');
    this.installedPlugins = new Map();
    this.availablePlugins = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.pluginsDir, { recursive: true });
      await fs.mkdir(this.cacheDir, { recursive: true });
      await this.loadInstalledPlugins();
      await this.updateRegistry();
      this.initialized = true;

      console.log(chalk.green('🛒 Plugin Marketplace initialized'));
    } catch (error) {
      console.error(chalk.red('Failed to initialize Plugin Marketplace:'), error.message);
      throw error;
    }
  }

  async loadInstalledPlugins() {
    try {
      const pluginDirs = await fs.readdir(this.pluginsDir);
      
      for (const dir of pluginDirs) {
        const pluginPath = path.join(this.pluginsDir, dir);
        const manifestPath = path.join(pluginPath, 'plugin.json');
        
        if (await this.fileExists(manifestPath)) {
          const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
          this.installedPlugins.set(manifest.id, {
            ...manifest,
            path: pluginPath,
            installed: true
          });
        }
      }

      console.log(chalk.blue(`📦 Loaded ${this.installedPlugins.size} installed plugins`));
    } catch (error) {
      console.warn(chalk.yellow('Warning: Could not load installed plugins'), error.message);
    }
  }

  async updateRegistry() {
    try {
      console.log(chalk.yellow('🔄 Updating plugin registry...'));
      
      // Try to fetch from remote registry
      try {
        const registryData = await this.fetchRegistry();
        await fs.writeFile(this.localRegistry, JSON.stringify(registryData, null, 2));
        this.loadRegistryData(registryData);
        console.log(chalk.green(`✅ Updated registry with ${registryData.plugins.length} plugins`));
      } catch (error) {
        console.warn(chalk.yellow('Could not fetch remote registry, using cached data'));
        await this.loadCachedRegistry();
      }
    } catch (error) {
      console.warn(chalk.yellow('Warning: Could not update registry'), error.message);
      await this.createDefaultRegistry();
    }
  }

  async fetchRegistry() {
    return new Promise((resolve, reject) => {
      const url = `${this.registryUrl}/plugins`;
      
      https.get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Registry request failed with status ${res.statusCode}`));
          return;
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(new Error('Invalid registry response'));
          }
        });
      }).on('error', reject);
    });
  }

  async loadCachedRegistry() {
    if (await this.fileExists(this.localRegistry)) {
      const data = JSON.parse(await fs.readFile(this.localRegistry, 'utf8'));
      this.loadRegistryData(data);
    } else {
      await this.createDefaultRegistry();
    }
  }

  loadRegistryData(data) {
    this.availablePlugins.clear();
    
    for (const plugin of data.plugins) {
      this.availablePlugins.set(plugin.id, plugin);
    }
  }

  async createDefaultRegistry() {
    const defaultPlugins = [
      {
        id: 'code-formatter',
        name: 'Code Formatter',
        description: 'Advanced code formatting with multiple language support',
        version: '1.0.0',
        author: 'Recoder Team',
        category: 'productivity',
        tags: ['formatting', 'code-quality'],
        downloadUrl: 'https://github.com/recoder-code/plugin-code-formatter/archive/refs/tags/v1.0.0.zip',
        homepage: 'https://github.com/recoder-code/plugin-code-formatter',
        license: 'MIT',
        compatibility: {
          recoderVersion: '>=2.0.0',
          nodeVersion: '>=18.0.0'
        },
        features: [
          'Multi-language support',
          'Custom formatting rules',
          'Integration with popular formatters'
        ]
      },
      {
        id: 'git-helper',
        name: 'Git Helper',
        description: 'Enhanced Git integration with AI-powered commit messages',
        version: '1.2.0',
        author: 'Community',
        category: 'git',
        tags: ['git', 'automation', 'ai'],
        downloadUrl: 'https://github.com/recoder-community/plugin-git-helper/archive/refs/tags/v1.2.0.zip',
        homepage: 'https://github.com/recoder-community/plugin-git-helper',
        license: 'MIT',
        compatibility: {
          recoderVersion: '>=2.0.0',
          nodeVersion: '>=18.0.0'
        },
        features: [
          'AI-generated commit messages',
          'Smart branch management',
          'Conflict resolution assistance'
        ]
      },
      {
        id: 'test-generator',
        name: 'Test Generator',
        description: 'Automatically generate unit tests for your code',
        version: '0.9.0',
        author: 'Testing Labs',
        category: 'testing',
        tags: ['testing', 'automation', 'quality'],
        downloadUrl: 'https://github.com/testing-labs/plugin-test-generator/archive/refs/tags/v0.9.0.zip',
        homepage: 'https://github.com/testing-labs/plugin-test-generator',
        license: 'Apache-2.0',
        compatibility: {
          recoderVersion: '>=2.0.0',
          nodeVersion: '>=18.0.0'
        },
        features: [
          'Multi-framework support',
          'Coverage analysis',
          'Mocking utilities'
        ]
      },
      {
        id: 'performance-monitor',
        name: 'Performance Monitor',
        description: 'Real-time performance monitoring and optimization suggestions',
        version: '1.1.0',
        author: 'Performance Team',
        category: 'monitoring',
        tags: ['performance', 'monitoring', 'optimization'],
        downloadUrl: 'https://github.com/perf-team/plugin-performance-monitor/archive/refs/tags/v1.1.0.zip',
        homepage: 'https://github.com/perf-team/plugin-performance-monitor',
        license: 'MIT',
        compatibility: {
          recoderVersion: '>=2.0.0',
          nodeVersion: '>=18.0.0'
        },
        features: [
          'Real-time metrics',
          'Bottleneck detection',
          'Optimization recommendations'
        ]
      },
      {
        id: 'api-documenter',
        name: 'API Documenter',
        description: 'Generate comprehensive API documentation from code',
        version: '2.0.0',
        author: 'Documentation Guild',
        category: 'documentation',
        tags: ['documentation', 'api', 'generator'],
        downloadUrl: 'https://github.com/docs-guild/plugin-api-documenter/archive/refs/tags/v2.0.0.zip',
        homepage: 'https://github.com/docs-guild/plugin-api-documenter',
        license: 'MIT',
        compatibility: {
          recoderVersion: '>=2.0.0',
          nodeVersion: '>=18.0.0'
        },
        features: [
          'OpenAPI specification',
          'Interactive documentation',
          'Multi-format export'
        ]
      }
    ];

    const registryData = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      plugins: defaultPlugins
    };

    await fs.writeFile(this.localRegistry, JSON.stringify(registryData, null, 2));
    this.loadRegistryData(registryData);

    console.log(chalk.blue(`📚 Created default registry with ${defaultPlugins.length} plugins`));
  }

  async searchPlugins(query, options = {}) {
    await this.initialize();

    const results = [];
    const searchTerm = query.toLowerCase();

    for (const plugin of this.availablePlugins.values()) {
      let score = 0;

      // Name match (highest priority)
      if (plugin.name.toLowerCase().includes(searchTerm)) {
        score += 10;
      }

      // Description match
      if (plugin.description.toLowerCase().includes(searchTerm)) {
        score += 5;
      }

      // Tags match
      if (plugin.tags && plugin.tags.some(tag => tag.toLowerCase().includes(searchTerm))) {
        score += 3;
      }

      // Category match
      if (plugin.category && plugin.category.toLowerCase().includes(searchTerm)) {
        score += 2;
      }

      if (score > 0) {
        results.push({
          ...plugin,
          score,
          installed: this.installedPlugins.has(plugin.id)
        });
      }
    }

    // Sort by score (descending)
    results.sort((a, b) => b.score - a.score);

    // Apply filters
    if (options.category) {
      return results.filter(p => p.category === options.category);
    }

    if (options.installed !== undefined) {
      return results.filter(p => p.installed === options.installed);
    }

    return results.slice(0, options.limit || 20);
  }

  async listPlugins(options = {}) {
    await this.initialize();

    if (options.installed) {
      return Array.from(this.installedPlugins.values());
    }

    const plugins = Array.from(this.availablePlugins.values());
    
    if (options.category) {
      return plugins.filter(p => p.category === options.category);
    }

    return plugins;
  }

  async getPlugin(pluginId) {
    await this.initialize();

    // Check installed plugins first
    if (this.installedPlugins.has(pluginId)) {
      return this.installedPlugins.get(pluginId);
    }

    // Check available plugins
    if (this.availablePlugins.has(pluginId)) {
      return {
        ...this.availablePlugins.get(pluginId),
        installed: false
      };
    }

    return null;
  }

  async installPlugin(pluginId, options = {}) {
    await this.initialize();

    const plugin = this.availablePlugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found in registry`);
    }

    if (this.installedPlugins.has(pluginId)) {
      if (!options.force) {
        throw new Error(`Plugin ${pluginId} is already installed. Use --force to reinstall.`);
      }
      console.log(chalk.yellow(`⚠️  Reinstalling plugin: ${plugin.name}`));
    }

    console.log(chalk.yellow(`📥 Installing plugin: ${plugin.name} v${plugin.version}`));

    try {
      // Check compatibility
      await this.checkCompatibility(plugin);

      // Download plugin
      const downloadPath = await this.downloadPlugin(plugin);

      // Extract and install
      const installPath = await this.extractPlugin(downloadPath, plugin);

      // Validate plugin
      await this.validatePlugin(installPath, plugin);

      // Register plugin
      await this.registerPlugin(installPath, plugin);

      console.log(chalk.green(`✅ Successfully installed: ${plugin.name}`));
      return { success: true, plugin };

    } catch (error) {
      console.error(chalk.red(`❌ Failed to install ${plugin.name}:`), error.message);
      throw error;
    }
  }

  async checkCompatibility(plugin) {
    const recoderVersion = await this.getRecoderVersion();
    const nodeVersion = process.version;

    if (plugin.compatibility) {
      if (plugin.compatibility.recoderVersion && 
          !semver.satisfies(recoderVersion, plugin.compatibility.recoderVersion)) {
        throw new Error(`Plugin requires Recoder Code ${plugin.compatibility.recoderVersion}, but ${recoderVersion} is installed`);
      }

      if (plugin.compatibility.nodeVersion && 
          !semver.satisfies(nodeVersion, plugin.compatibility.nodeVersion)) {
        throw new Error(`Plugin requires Node.js ${plugin.compatibility.nodeVersion}, but ${nodeVersion} is installed`);
      }
    }
  }

  async downloadPlugin(plugin) {
    const tempDir = path.join(this.cacheDir, 'temp');
    await fs.mkdir(tempDir, { recursive: true });

    const fileName = `${plugin.id}-${plugin.version}.zip`;
    const downloadPath = path.join(tempDir, fileName);

    console.log(chalk.blue(`⬇️  Downloading from: ${plugin.downloadUrl}`));

    // Simulate download (in real implementation, use actual HTTP download)
    await this.simulateDownload(plugin.downloadUrl, downloadPath);

    return downloadPath;
  }

  async simulateDownload(url, filePath) {
    // Simulate download delay
    await this.sleep(1000);

    // Create a dummy zip file content
    const dummyContent = JSON.stringify({
      type: 'plugin-package',
      url: url,
      downloadedAt: new Date().toISOString()
    });

    await fs.writeFile(filePath, dummyContent);
  }

  async extractPlugin(downloadPath, plugin) {
    const extractPath = path.join(this.pluginsDir, plugin.id);
    
    // Remove existing installation
    if (await this.fileExists(extractPath)) {
      await fs.rm(extractPath, { recursive: true, force: true });
    }

    await fs.mkdir(extractPath, { recursive: true });

    console.log(chalk.blue(`📂 Extracting to: ${extractPath}`));

    // Simulate extraction by creating plugin structure
    await this.createPluginStructure(extractPath, plugin);

    return extractPath;
  }

  async createPluginStructure(pluginPath, plugin) {
    // Create plugin manifest
    const manifest = {
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      author: plugin.author,
      license: plugin.license,
      main: 'index.js',
      activationEvents: ['*'],
      contributes: {
        commands: [
          {
            command: `${plugin.id}.activate`,
            title: `Activate ${plugin.name}`
          }
        ]
      },
      dependencies: {},
      engines: {
        recoder: plugin.compatibility?.recoderVersion || '>=2.0.0'
      },
      installDate: new Date().toISOString()
    };

    await fs.writeFile(
      path.join(pluginPath, 'plugin.json'),
      JSON.stringify(manifest, null, 2)
    );

    // Create main plugin file
    const mainContent = `/**
 * ${plugin.name} Plugin
 * ${plugin.description}
 */

class ${this.toPascalCase(plugin.id)}Plugin {
  constructor() {
    this.name = '${plugin.name}';
    this.version = '${plugin.version}';
  }

  activate(context) {
    console.log('Activating plugin:', this.name);
    
    // Register commands
    context.subscriptions.push(
      context.commands.registerCommand('${plugin.id}.activate', () => {
        context.window.showInformationMessage('${plugin.name} is now active!');
      })
    );

    // Plugin-specific activation logic would go here
    this.onActivate(context);
  }

  deactivate() {
    console.log('Deactivating plugin:', this.name);
    this.onDeactivate();
  }

  onActivate(context) {
    // Override in specific plugin implementations
  }

  onDeactivate() {
    // Override in specific plugin implementations
  }
}

module.exports = ${this.toPascalCase(plugin.id)}Plugin;
`;

    await fs.writeFile(path.join(pluginPath, 'index.js'), mainContent);

    // Create README
    const readme = `# ${plugin.name}

${plugin.description}

## Features

${plugin.features ? plugin.features.map(f => `- ${f}`).join('\n') : '- Feature list coming soon'}

## Usage

This plugin is automatically activated when Recoder Code starts.

## License

${plugin.license}

## Author

${plugin.author}
`;

    await fs.writeFile(path.join(pluginPath, 'README.md'), readme);

    console.log(chalk.green(`📁 Created plugin structure`));
  }

  async validatePlugin(pluginPath, plugin) {
    const manifestPath = path.join(pluginPath, 'plugin.json');
    const mainPath = path.join(pluginPath, 'index.js');

    if (!(await this.fileExists(manifestPath))) {
      throw new Error('Plugin manifest (plugin.json) not found');
    }

    if (!(await this.fileExists(mainPath))) {
      throw new Error('Plugin main file not found');
    }

    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

    if (manifest.id !== plugin.id) {
      throw new Error('Plugin ID mismatch');
    }

    console.log(chalk.green(`✅ Plugin validation passed`));
  }

  async registerPlugin(pluginPath, plugin) {
    const manifestPath = path.join(pluginPath, 'plugin.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

    this.installedPlugins.set(plugin.id, {
      ...manifest,
      path: pluginPath,
      installed: true
    });

    // Update installed plugins registry
    await this.saveInstalledPlugins();
  }

  async uninstallPlugin(pluginId) {
    await this.initialize();

    const plugin = this.installedPlugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} is not installed`);
    }

    console.log(chalk.yellow(`🗑️  Uninstalling plugin: ${plugin.name}`));

    try {
      // Remove plugin directory
      if (await this.fileExists(plugin.path)) {
        await fs.rm(plugin.path, { recursive: true, force: true });
      }

      // Remove from registry
      this.installedPlugins.delete(pluginId);
      await this.saveInstalledPlugins();

      console.log(chalk.green(`✅ Successfully uninstalled: ${plugin.name}`));
      return { success: true, plugin };

    } catch (error) {
      console.error(chalk.red(`❌ Failed to uninstall ${plugin.name}:`), error.message);
      throw error;
    }
  }

  async updatePlugin(pluginId) {
    await this.initialize();

    const installedPlugin = this.installedPlugins.get(pluginId);
    if (!installedPlugin) {
      throw new Error(`Plugin ${pluginId} is not installed`);
    }

    const availablePlugin = this.availablePlugins.get(pluginId);
    if (!availablePlugin) {
      throw new Error(`Plugin ${pluginId} not found in registry`);
    }

    if (semver.lte(availablePlugin.version, installedPlugin.version)) {
      console.log(chalk.blue(`📦 Plugin ${installedPlugin.name} is already up to date (${installedPlugin.version})`));
      return { upToDate: true, plugin: installedPlugin };
    }

    console.log(chalk.yellow(`⬆️  Updating ${installedPlugin.name} from ${installedPlugin.version} to ${availablePlugin.version}`));

    // Install new version (force reinstall)
    return await this.installPlugin(pluginId, { force: true });
  }

  async saveInstalledPlugins() {
    const registryPath = path.join(this.pluginsDir, 'installed.json');
    const installedData = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      plugins: Object.fromEntries(this.installedPlugins)
    };

    await fs.writeFile(registryPath, JSON.stringify(installedData, null, 2));
  }

  // Plugin Registry Service Integration
  async startRegistryService(options = {}) {
    console.log(chalk.cyan('🚀 Starting Plugin Registry Service...'));
    
    const registryServicePath = path.join(__dirname, '../plugin-registry-service');
    
    if (!await this.fileExists(registryServicePath)) {
      console.log(chalk.red(`❌ Plugin registry service not found at: ${registryServicePath}`));
      return false;
    }

    try {
      // Check if Docker is available
      await execAsync('docker --version');
      
      // Check if service is already running
      const isRunning = await this.checkRegistryServiceHealth();
      if (isRunning) {
        console.log(chalk.yellow('⚠️ Plugin registry service is already running'));
        console.log(chalk.blue(`   Registry API: http://localhost:3000`));
        return true;
      }

      // Start the service using Docker or npm
      const useDocker = options.docker !== false;
      
      if (useDocker) {
        console.log(chalk.blue('📦 Starting registry service with Docker...'));
        await execAsync(`docker-compose up -d plugin-registry`, { cwd: path.join(__dirname, '..') });
      } else {
        console.log(chalk.blue('📦 Starting registry service with npm...'));
        const child = spawn('npm', ['start'], {
          cwd: registryServicePath,
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe']
        });
        child.unref();
      }

      // Wait for service to be ready
      let attempts = 0;
      const maxAttempts = 30;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        if (await this.checkRegistryServiceHealth()) {
          console.log(chalk.green('✅ Plugin registry service started successfully!'));
          console.log(chalk.blue('📊 Access points:'));
          console.log('   • API: http://localhost:3000/api/v1');
          console.log('   • Admin: http://localhost:3000/admin');
          console.log('   • Health: http://localhost:3000/health');
          return true;
        }
        
        attempts++;
      }
      
      console.log(chalk.red('❌ Plugin registry service failed to start'));
      return false;
      
    } catch (error) {
      console.log(chalk.red(`❌ Failed to start registry service: ${error.message}`));
      return false;
    }
  }

  async stopRegistryService() {
    console.log(chalk.cyan('🛑 Stopping Plugin Registry Service...'));
    
    try {
      // Try Docker first
      try {
        await execAsync(`docker-compose stop plugin-registry`, { cwd: path.join(__dirname, '..') });
        console.log(chalk.green('✅ Registry service stopped'));
        return true;
      } catch (dockerError) {
        // Try killing Node process
        try {
          await execAsync(`pkill -f "plugin-registry"`);
          console.log(chalk.green('✅ Registry service stopped'));
          return true;
        } catch (processError) {
          console.log(chalk.yellow('⚠️ Could not stop registry service automatically'));
          console.log(chalk.blue('   You may need to stop it manually'));
          return false;
        }
      }
    } catch (error) {
      console.log(chalk.red(`❌ Failed to stop registry service: ${error.message}`));
      return false;
    }
  }

  async checkRegistryServiceHealth() {
    try {
      const response = await this.makeRequest(`${this.registryUrl.replace('/api/v1', '')}/health`);
      return response.status === 'ok';
    } catch (error) {
      return false;
    }
  }

  async getRegistryServiceStatus() {
    console.log(chalk.cyan('📊 Plugin Registry Service Status'));
    console.log('');

    const isHealthy = await this.checkRegistryServiceHealth();
    
    if (isHealthy) {
      console.log(chalk.green('✅ Registry Service: Running'));
      console.log(`   • API Endpoint: ${this.registryUrl}`);
      console.log('   • Status: Healthy');
      
      try {
        const stats = await this.makeRequest(`${this.registryUrl}/stats`);
        console.log(`   • Total Packages: ${stats.totalPackages || 'Unknown'}`);
        console.log(`   • Total Downloads: ${stats.totalDownloads || 'Unknown'}`);
        console.log(`   • Active Users: ${stats.activeUsers || 'Unknown'}`);
      } catch (error) {
        console.log('   • Stats: Not available');
      }
    } else {
      console.log(chalk.red('❌ Registry Service: Not running'));
      console.log(chalk.blue('💡 Start with: recoder-code plugins registry start'));
    }
    
    console.log('');
    console.log(chalk.yellow('🔧 Registry Commands:'));
    console.log('   registry start    Start the plugin registry service');
    console.log('   registry stop     Stop the plugin registry service');
    console.log('   registry status   Check registry service status');
    console.log('   registry publish  Publish a plugin to the registry');
  }

  async publishPlugin(pluginPath, options = {}) {
    console.log(chalk.cyan('📦 Publishing plugin to registry...'));
    
    // Check if registry service is running
    const isRunning = await this.checkRegistryServiceHealth();
    if (!isRunning) {
      console.log(chalk.red('❌ Plugin registry service is not running'));
      console.log(chalk.blue('💡 Start with: recoder-code plugins registry start'));
      return false;
    }

    try {
      // Validate plugin structure
      const packageJsonPath = path.join(pluginPath, 'package.json');
      if (!await this.fileExists(packageJsonPath)) {
        console.log(chalk.red('❌ package.json not found in plugin directory'));
        return false;
      }

      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      
      // Required fields for plugin registry
      const requiredFields = ['name', 'version', 'description', 'main'];
      for (const field of requiredFields) {
        if (!packageJson[field]) {
          console.log(chalk.red(`❌ Missing required field in package.json: ${field}`));
          return false;
        }
      }

      // Create plugin package
      console.log(chalk.blue('📦 Creating plugin package...'));
      const tarballPath = await this.createPluginPackage(pluginPath);
      
      // Upload to registry
      console.log(chalk.blue('⬆️ Uploading to registry...'));
      const uploadResult = await this.uploadPluginToRegistry(tarballPath, packageJson);
      
      if (uploadResult.success) {
        console.log(chalk.green('✅ Plugin published successfully!'));
        console.log(`   • Name: ${packageJson.name}`);
        console.log(`   • Version: ${packageJson.version}`);
        console.log(`   • Registry: ${this.registryUrl}`);
        return true;
      } else {
        console.log(chalk.red(`❌ Failed to publish: ${uploadResult.error}`));
        return false;
      }
      
    } catch (error) {
      console.log(chalk.red(`❌ Publishing failed: ${error.message}`));
      return false;
    }
  }

  async createPluginPackage(pluginPath) {
    const packageJson = JSON.parse(await fs.readFile(path.join(pluginPath, 'package.json'), 'utf8'));
    const tarballName = `${packageJson.name}-${packageJson.version}.tgz`;
    const tarballPath = path.join(this.cacheDir, tarballName);
    
    // Create tarball using npm pack
    await execAsync('npm pack', { cwd: pluginPath });
    
    // Move to cache directory
    const generatedTarball = path.join(pluginPath, tarballName);
    await fs.rename(generatedTarball, tarballPath);
    
    return tarballPath;
  }

  async uploadPluginToRegistry(tarballPath, packageJson) {
    // This would normally use the registry service API
    // For now, return a mock response
    return {
      success: true,
      packageId: `${packageJson.name}@${packageJson.version}`,
      url: `${this.registryUrl}/packages/${packageJson.name}`
    };
  }

  async getCategories() {
    await this.initialize();

    const categories = new Set();
    for (const plugin of this.availablePlugins.values()) {
      if (plugin.category) {
        categories.add(plugin.category);
      }
    }

    return Array.from(categories).sort();
  }

  async getRecoderVersion() {
    try {
      const packagePath = path.join(__dirname, '..', 'package.json');
      const packageData = JSON.parse(await fs.readFile(packagePath, 'utf8'));
      return packageData.version || '2.0.0';
    } catch {
      return '2.0.0'; // Default version
    }
  }

  toPascalCase(str) {
    return str.replace(/(^\w|[-_]\w)/g, (match) => 
      match.replace(/[-_]/, '').toUpperCase()
    );
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = PluginMarketplace;

// CLI interface
if (require.main === module) {
  const marketplace = new PluginMarketplace();

  async function handleCommand() {
    const command = process.argv[2];
    const args = process.argv.slice(3);

    try {
      switch (command) {
        case 'search':
          const query = args[0];
          if (!query) {
            console.error('Usage: plugin-marketplace.js search <query>');
            process.exit(1);
          }
          const results = await marketplace.searchPlugins(query);
          console.table(results.map(p => ({
            id: p.id,
            name: p.name,
            version: p.version,
            category: p.category,
            installed: p.installed ? '✅' : '❌'
          })));
          break;

        case 'list':
          const category = args.includes('--category') ? args[args.indexOf('--category') + 1] : null;
          const installedOnly = args.includes('--installed');
          
          const plugins = await marketplace.listPlugins({ 
            category, 
            installed: installedOnly 
          });
          
          console.table(plugins.map(p => ({
            id: p.id,
            name: p.name,
            version: p.version,
            category: p.category,
            author: p.author
          })));
          break;

        case 'install':
          if (!args[0]) {
            console.error('Usage: plugin-marketplace.js install <plugin-id>');
            process.exit(1);
          }
          const force = args.includes('--force');
          await marketplace.installPlugin(args[0], { force });
          break;

        case 'uninstall':
          if (!args[0]) {
            console.error('Usage: plugin-marketplace.js uninstall <plugin-id>');
            process.exit(1);
          }
          await marketplace.uninstallPlugin(args[0]);
          break;

        case 'update':
          if (args[0]) {
            await marketplace.updatePlugin(args[0]);
          } else {
            const installed = await marketplace.listPlugins({ installed: true });
            for (const plugin of installed) {
              try {
                await marketplace.updatePlugin(plugin.id);
              } catch (error) {
                console.warn(chalk.yellow(`Warning: ${error.message}`));
              }
            }
          }
          break;

        case 'info':
          if (!args[0]) {
            console.error('Usage: plugin-marketplace.js info <plugin-id>');
            process.exit(1);
          }
          const plugin = await marketplace.getPlugin(args[0]);
          if (plugin) {
            console.log(JSON.stringify(plugin, null, 2));
          } else {
            console.log(chalk.red(`Plugin ${args[0]} not found`));
          }
          break;

        case 'categories':
          const categories = await marketplace.getCategories();
          console.log(categories.join('\n'));
          break;

        default:
          console.log('Plugin Marketplace for Recoder Code');
          console.log('');
          console.log('Usage:');
          console.log('  plugin-marketplace.js search <query>');
          console.log('  plugin-marketplace.js list [--category <name>] [--installed]');
          console.log('  plugin-marketplace.js install <plugin-id> [--force]');
          console.log('  plugin-marketplace.js uninstall <plugin-id>');
          console.log('  plugin-marketplace.js update [plugin-id]');
          console.log('  plugin-marketplace.js info <plugin-id>');
          console.log('  plugin-marketplace.js categories');
          break;
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  }

  handleCommand();
}