#!/usr/bin/env node

/**
 * Scripts Integration Module
 * 
 * Integrates utility scripts from /scripts directory into CLI
 * Provides easy access to build, optimization, and utility scripts
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const chalk = require('chalk').default || require('chalk');

const execAsync = promisify(exec);

class ScriptsIntegration {
  constructor() {
    this.scriptsDir = path.join(__dirname, '..', 'scripts');
    this.availableScripts = new Map();
    this.isInitialized = false;
  }

  /**
   * Initialize scripts integration
   */
  async initialize() {
    try {
      console.log(chalk.cyan('📜 Initializing scripts integration...'));
      
      if (!fs.existsSync(this.scriptsDir)) {
        console.log(chalk.yellow('⚠️  Scripts directory not found'));
        return;
      }

      await this.scanAvailableScripts();
      this.isInitialized = true;
      
      console.log(chalk.green(`✓ Found ${this.availableScripts.size} scripts`));
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Scripts integration failed: ${error.message}`));
    }
  }

  /**
   * Scan available scripts
   */
  async scanAvailableScripts() {
    const files = fs.readdirSync(this.scriptsDir);
    
    for (const file of files) {
      const filePath = path.join(this.scriptsDir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isFile() && (file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.sh'))) {
        const scriptName = file.replace(/\.(js|ts|sh)$/, '');
        this.availableScripts.set(scriptName, {
          name: scriptName,
          path: filePath,
          type: file.endsWith('.sh') ? 'shell' : 'node',
          description: this.extractDescription(filePath)
        });
      }
    }
  }

  /**
   * Extract description from script file
   */
  extractDescription(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').slice(0, 10);
      
      for (const line of lines) {
        // Look for description comments
        if (line.includes('@description') || line.includes('Description:')) {
          return line.replace(/.*(@description|Description:)\s*/, '').trim();
        }
        // Look for first multi-line comment
        if (line.trim().startsWith('*') && line.length > 3) {
          return line.replace(/^\s*\*\s*/, '').trim();
        }
      }
      
      return 'No description available';
    } catch (error) {
      return 'Unable to read script';
    }
  }

  /**
   * List all available scripts
   */
  listScripts() {
    const scripts = Array.from(this.availableScripts.values());
    
    console.log(chalk.bold.cyan('\n📜 Available Scripts:\n'));
    console.log(chalk.gray('─'.repeat(70)));
    
    // Group by category
    const categories = {
      build: [],
      test: [],
      performance: [],
      security: [],
      utility: [],
      other: []
    };
    
    for (const script of scripts) {
      if (script.name.includes('build')) {
        categories.build.push(script);
      } else if (script.name.includes('test')) {
        categories.test.push(script);
      } else if (script.name.includes('performance') || script.name.includes('benchmark')) {
        categories.performance.push(script);
      } else if (script.name.includes('security') || script.name.includes('audit')) {
        categories.security.push(script);
      } else if (script.name.includes('health') || script.name.includes('optimize') || script.name.includes('clean')) {
        categories.utility.push(script);
      } else {
        categories.other.push(script);
      }
    }
    
    for (const [category, items] of Object.entries(categories)) {
      if (items.length > 0) {
        console.log(chalk.bold.yellow(`\n${category.toUpperCase()}:`));
        for (const script of items) {
          console.log(`  ${chalk.green(script.name.padEnd(30))} ${chalk.gray(script.description)}`);
        }
      }
    }
    
    console.log(chalk.gray('\n' + '─'.repeat(70)));
    console.log(chalk.cyan('Usage: ') + chalk.white('recoder-code --script <name> [args]'));
    console.log();
  }

  /**
   * Execute a script
   */
  async executeScript(scriptName, args = []) {
    if (!this.availableScripts.has(scriptName)) {
      throw new Error(`Script "${scriptName}" not found. Use --list-scripts to see available scripts.`);
    }
    
    const script = this.availableScripts.get(scriptName);
    console.log(chalk.cyan(`\n📜 Executing: ${chalk.bold(script.name)}`));
    console.log(chalk.gray(`   ${script.description}\n`));
    
    try {
      let command;
      if (script.type === 'shell') {
        command = `bash ${script.path} ${args.join(' ')}`;
      } else {
        command = `node ${script.path} ${args.join(' ')}`;
      }
      
      const { stdout, stderr } = await execAsync(command, {
        cwd: path.join(__dirname, '..'),
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });
      
      if (stdout) console.log(stdout);
      if (stderr) console.error(chalk.yellow(stderr));
      
      console.log(chalk.green(`\n✓ Script completed successfully\n`));
      
    } catch (error) {
      console.error(chalk.red(`\n✗ Script failed: ${error.message}\n`));
      if (error.stdout) console.log(error.stdout);
      if (error.stderr) console.error(chalk.red(error.stderr));
      throw error;
    }
  }

  /**
   * Quick access to common scripts
   */
  async healthCheck() {
    return this.executeScript('health-check');
  }

  async performanceBenchmark() {
    return this.executeScript('performance-benchmark');
  }

  async securityAudit() {
    return this.executeScript('security-audit');
  }

  async optimizePackage() {
    return this.executeScript('optimize-package');
  }

  async buildPackages() {
    return this.executeScript('build_package');
  }

  async clean() {
    return this.executeScript('clean');
  }

  /**
   * Get script status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      scriptsDir: this.scriptsDir,
      totalScripts: this.availableScripts.size,
      scripts: Array.from(this.availableScripts.keys())
    };
  }
}

// Singleton instance
let instance = null;

module.exports = {
  ScriptsIntegration,
  getInstance: () => {
    if (!instance) {
      instance = new ScriptsIntegration();
    }
    return instance;
  }
};
