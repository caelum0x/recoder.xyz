#!/usr/bin/env node

/**
 * Packages Integration Module
 * 
 * Bridges Recoder Code CLI with Qwen Code Architecture packages
 * - Integrates @qwen-code/qwen-code-core
 * - Integrates @qwen-code/qwen-code CLI
 * - Provides unified interface for both architectures
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk').default || require('chalk');

class PackagesIntegration {
  constructor() {
    this.packagesDir = path.join(__dirname, '..', 'packages');
    this.corePackage = null;
    this.cliPackage = null;
    this.isInitialized = false;
    this.integrationMode = 'hybrid'; // 'recoder', 'qwen', 'hybrid'
  }

  /**
   * Initialize packages integration
   */
  async initialize() {
    try {
      console.log(chalk.cyan('🔗 Initializing packages integration...'));
      
      // Check if packages exist
      if (!fs.existsSync(this.packagesDir)) {
        console.log(chalk.yellow('⚠️  Packages directory not found, running in Recoder-only mode'));
        this.integrationMode = 'recoder';
        return;
      }

      // Try to load packages
      await this.loadCorePackage();
      await this.loadCliPackage();

      this.isInitialized = true;
      console.log(chalk.green(`✓ Packages integration initialized (${this.integrationMode} mode)`));
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Packages integration failed: ${error.message}`));
      console.log(chalk.gray('   Falling back to Recoder-only mode'));
      this.integrationMode = 'recoder';
    }
  }

  /**
   * Load @qwen-code/qwen-code-core package
   */
  async loadCorePackage() {
    try {
      const corePath = path.join(this.packagesDir, 'core');
      const coreDistPath = path.join(corePath, 'dist', 'index.js');
      
      if (fs.existsSync(coreDistPath)) {
        // Try to import as ESM module
        this.corePackage = await this.dynamicImport(coreDistPath);
        console.log(chalk.green('  ✓ Loaded @qwen-code/qwen-code-core'));
      } else {
        console.log(chalk.yellow('  ⚠️  Core package not built, run: npm run build in packages/core'));
      }
    } catch (error) {
      console.log(chalk.yellow(`  ⚠️  Could not load core package: ${error.message}`));
    }
  }

  /**
   * Load @qwen-code/qwen-code CLI package
   */
  async loadCliPackage() {
    try {
      const cliPath = path.join(this.packagesDir, 'cli');
      const cliDistPath = path.join(cliPath, 'dist', 'index.js');
      
      if (fs.existsSync(cliDistPath)) {
        this.cliPackage = await this.dynamicImport(cliDistPath);
        console.log(chalk.green('  ✓ Loaded @qwen-code/qwen-code CLI'));
      } else {
        console.log(chalk.yellow('  ⚠️  CLI package not built, run: npm run build in packages/cli'));
      }
    } catch (error) {
      console.log(chalk.yellow(`  ⚠️  Could not load CLI package: ${error.message}`));
    }
  }

  /**
   * Dynamic import for ESM modules (handles CommonJS to ESM bridge)
   */
  async dynamicImport(modulePath) {
    try {
      // Try native dynamic import (Node 12+)
      return await import(`file://${modulePath}`);
    } catch (error) {
      // Fallback to require for CommonJS
      try {
        return require(modulePath);
      } catch (requireError) {
        throw new Error(`Cannot load module: ${error.message}`);
      }
    }
  }

  /**
   * Get tool executor from core package
   */
  getToolExecutor() {
    if (this.corePackage && this.corePackage.ToolExecutor) {
      return this.corePackage.ToolExecutor;
    }
    return null;
  }

  /**
   * Get MCP client from core package
   */
  getMCPClient() {
    if (this.corePackage && this.corePackage.MCPClient) {
      return this.corePackage.MCPClient;
    }
    return null;
  }

  /**
   * Get context engine from core package
   */
  getContextEngine() {
    if (this.corePackage && this.corePackage.ContextEngine) {
      return this.corePackage.ContextEngine;
    }
    return null;
  }

  /**
   * Get code assist features from core package
   */
  getCodeAssist() {
    if (this.corePackage && this.corePackage.CodeAssist) {
      return this.corePackage.CodeAssist;
    }
    return null;
  }

  /**
   * Get telemetry from core package
   */
  getTelemetry() {
    if (this.corePackage && this.corePackage.Telemetry) {
      return this.corePackage.Telemetry;
    }
    return null;
  }

  /**
   * Check if packages are available
   */
  arePackagesAvailable() {
    return this.corePackage !== null || this.cliPackage !== null;
  }

  /**
   * Get integration status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      mode: this.integrationMode,
      coreLoaded: this.corePackage !== null,
      cliLoaded: this.cliPackage !== null,
      packagesDir: this.packagesDir,
      features: this.getAvailableFeatures()
    };
  }

  /**
   * Get available features from integrated packages
   */
  getAvailableFeatures() {
    const features = [];
    
    if (this.corePackage) {
      features.push('Advanced Tool Execution');
      features.push('Enhanced MCP Protocol');
      features.push('Qwen Code Context Engine');
      features.push('Code Assist');
      features.push('Telemetry & Analytics');
    }
    
    if (this.cliPackage) {
      features.push('Qwen CLI Commands');
      features.push('Interactive UI');
      features.push('Enhanced Formatting');
    }
    
    return features;
  }

  /**
   * Execute tool using enhanced tool executor from packages
   */
  async executeToolEnhanced(toolName, params, fallbackExecutor) {
    const ToolExecutor = this.getToolExecutor();
    
    if (ToolExecutor) {
      try {
        const executor = new ToolExecutor();
        return await executor.execute(toolName, params);
      } catch (error) {
        console.log(chalk.yellow(`⚠️  Enhanced tool execution failed, using fallback`));
      }
    }
    
    // Fallback to recoder's tool executor
    if (fallbackExecutor) {
      return await fallbackExecutor.execute(toolName, params);
    }
    
    throw new Error('No tool executor available');
  }

  /**
   * Build packages if not built
   */
  async buildPackages() {
    console.log(chalk.cyan('🔨 Building packages...'));
    
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    try {
      // Build core
      const corePath = path.join(this.packagesDir, 'core');
      if (fs.existsSync(corePath)) {
        console.log(chalk.gray('  Building @qwen-code/qwen-code-core...'));
        await execAsync('npm run build', { cwd: corePath });
        console.log(chalk.green('  ✓ Core package built'));
      }
      
      // Build cli
      const cliPath = path.join(this.packagesDir, 'cli');
      if (fs.existsSync(cliPath)) {
        console.log(chalk.gray('  Building @qwen-code/qwen-code CLI...'));
        await execAsync('npm run build', { cwd: cliPath });
        console.log(chalk.green('  ✓ CLI package built'));
      }
      
      console.log(chalk.green('✓ All packages built successfully'));
      
      // Reinitialize
      await this.initialize();
      
    } catch (error) {
      console.log(chalk.red(`✗ Build failed: ${error.message}`));
      throw error;
    }
  }
}

// Singleton instance
let instance = null;

module.exports = {
  PackagesIntegration,
  getInstance: () => {
    if (!instance) {
      instance = new PackagesIntegration();
    }
    return instance;
  }
};
