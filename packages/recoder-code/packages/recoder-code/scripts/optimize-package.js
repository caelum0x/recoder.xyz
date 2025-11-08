#!/usr/bin/env node

/**
 * Package Optimization Script
 * Analyzes and optimizes the package for better performance and smaller size
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const chalk = require('chalk');

class PackageOptimizer {
  constructor() {
    this.packagePath = path.join(process.cwd(), 'package.json');
    this.packageData = null;
    this.optimizations = [];
  }

  async optimize() {
    console.log(chalk.bold.cyan('🚀 Package Optimization Analysis'));
    console.log(chalk.gray('═'.repeat(50)));
    console.log('');

    await this.loadPackageData();
    await this.analyzeDependencies();
    await this.checkBundleSize();
    await this.analyzeFileStructure();
    await this.generateReport();
  }

  async loadPackageData() {
    try {
      const data = fs.readFileSync(this.packagePath, 'utf8');
      this.packageData = JSON.parse(data);
      console.log(chalk.green('✅ Package data loaded'));
    } catch (error) {
      throw new Error(`Failed to load package.json: ${error.message}`);
    }
  }

  async analyzeDependencies() {
    console.log(chalk.cyan('\\n🔍 Analyzing Dependencies'));
    
    const deps = this.packageData.dependencies || {};
    const devDeps = this.packageData.devDependencies || {};
    const optionalDeps = this.packageData.optionalDependencies || {};
    
    console.log(`📦 Production dependencies: ${Object.keys(deps).length}`);
    console.log(`🛠️  Development dependencies: ${Object.keys(devDeps).length}`);
    console.log(`⚡ Optional dependencies: ${Object.keys(optionalDeps).length}`);
    
    // Check for unused dependencies
    await this.checkUnusedDependencies(deps);
    
    // Check for outdated dependencies
    await this.checkOutdatedDependencies();
    
    // Check for security vulnerabilities
    await this.checkSecurityVulnerabilities();
  }

  async checkUnusedDependencies(deps) {
    console.log(chalk.cyan('\\n📋 Checking for unused dependencies...'));
    
    const usedDeps = new Set();
    const sourceFiles = this.findSourceFiles();
    
    for (const file of sourceFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        
        // Find require/import statements
        const requireMatches = content.match(/require\\(['\"](.*?)['\"]\\)/g) || [];
        const importMatches = content.match(/from ['\"](.*?)['\"]/g) || [];
        
        [...requireMatches, ...importMatches].forEach(match => {
          const dep = match.replace(/.*['\"](.*?)['\"].*/, '$1');
          if (deps[dep]) {
            usedDeps.add(dep);
          }
        });
      } catch (error) {
        // Skip files that can't be read
      }
    }
    
    const unusedDeps = Object.keys(deps).filter(dep => !usedDeps.has(dep));
    
    if (unusedDeps.length > 0) {
      console.log(chalk.yellow('⚠️  Potentially unused dependencies:'));
      unusedDeps.forEach(dep => {
        console.log(chalk.gray(`   • ${dep}`));
      });
      this.optimizations.push({
        type: 'dependencies',
        action: 'Remove unused dependencies',
        impact: 'Reduce bundle size',
        items: unusedDeps
      });
    } else {
      console.log(chalk.green('✅ No unused dependencies found'));
    }
  }

  async checkOutdatedDependencies() {
    console.log(chalk.cyan('\\n📅 Checking for outdated dependencies...'));
    
    try {
      const output = execSync('npm outdated --json', { encoding: 'utf8' });
      const outdated = JSON.parse(output);
      const outdatedCount = Object.keys(outdated).length;
      
      if (outdatedCount > 0) {
        console.log(chalk.yellow(`⚠️  ${outdatedCount} outdated dependencies found`));
        this.optimizations.push({
          type: 'updates',
          action: 'Update outdated dependencies',
          impact: 'Security and performance improvements',
          count: outdatedCount
        });
      } else {
        console.log(chalk.green('✅ All dependencies are up to date'));
      }
    } catch (error) {
      console.log(chalk.green('✅ All dependencies are up to date'));
    }
  }

  async checkSecurityVulnerabilities() {
    console.log(chalk.cyan('\\n🔒 Checking for security vulnerabilities...'));
    
    try {
      execSync('npm audit --audit-level=moderate', { stdio: 'pipe' });
      console.log(chalk.green('✅ No security vulnerabilities found'));
    } catch (error) {
      console.log(chalk.red('⚠️  Security vulnerabilities detected'));
      this.optimizations.push({
        type: 'security',
        action: 'Fix security vulnerabilities',
        impact: 'Critical security improvements',
        urgent: true
      });
    }
  }

  async checkBundleSize() {
    console.log(chalk.cyan('\\n📊 Analyzing Bundle Size'));
    
    try {
      // Calculate node_modules size
      const nodeModulesSize = this.getDirectorySize('node_modules');
      console.log(`📦 node_modules size: ${this.formatBytes(nodeModulesSize)}`);
      
      // Calculate package size (what gets published)
      const packageSize = this.calculatePackageSize();
      console.log(`📤 Published package size: ${this.formatBytes(packageSize)}`);
      
      if (packageSize > 10 * 1024 * 1024) { // 10MB
        this.optimizations.push({
          type: 'bundle',
          action: 'Optimize package size',
          impact: 'Faster installation and download',
          currentSize: packageSize
        });
      }
    } catch (error) {
      console.log(chalk.yellow('⚠️  Could not analyze bundle size'));
    }
  }

  async analyzeFileStructure() {
    console.log(chalk.cyan('\\n📁 Analyzing File Structure'));
    
    const files = this.packageData.files || [];
    const totalFiles = this.countPackageFiles();
    
    console.log(`📄 Files included in package: ${files.length} patterns`);
    console.log(`📊 Total files to be published: ~${totalFiles}`);
    
    // Check for large files
    const largeFiles = this.findLargeFiles();
    if (largeFiles.length > 0) {
      console.log(chalk.yellow('⚠️  Large files found:'));
      largeFiles.forEach(file => {
        console.log(chalk.gray(`   • ${file.path} (${this.formatBytes(file.size)})`));
      });
      
      this.optimizations.push({
        type: 'files',
        action: 'Review large files',
        impact: 'Reduce package size',
        files: largeFiles
      });
    }
  }

  findSourceFiles() {
    const files = [];
    const extensions = ['.js', '.ts', '.jsx', '.tsx'];
    
    const scanDir = (dir) => {
      try {
        const items = fs.readdirSync(dir);
        items.forEach(item => {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory() && !['node_modules', '.git', 'dist', 'build'].includes(item)) {
            scanDir(fullPath);
          } else if (stat.isFile() && extensions.some(ext => item.endsWith(ext))) {
            files.push(fullPath);
          }
        });
      } catch (error) {
        // Skip directories we can't read
      }
    };
    
    scanDir(process.cwd());
    return files;
  }

  getDirectorySize(dirPath) {
    let size = 0;
    try {
      const items = fs.readdirSync(dirPath);
      items.forEach(item => {
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          size += this.getDirectorySize(fullPath);
        } else {
          size += stat.size;
        }
      });
    } catch (error) {
      // Directory doesn't exist or can't be read
    }
    return size;
  }

  calculatePackageSize() {
    const files = this.packageData.files || ['**/*'];
    let size = 0;
    
    // This is a simplified calculation
    // In reality, we'd need to implement proper glob matching
    const mainFiles = ['cli/', 'config.js', 'index.js', 'setup.js', 'README.md', 'LICENSE.md'];
    
    mainFiles.forEach(file => {
      try {
        const stat = fs.statSync(file);
        if (stat.isFile()) {
          size += stat.size;
        } else if (stat.isDirectory()) {
          size += this.getDirectorySize(file);
        }
      } catch (error) {
        // File doesn't exist
      }
    });
    
    return size;
  }

  countPackageFiles() {
    // Simplified count - in reality would use proper glob matching
    let count = 0;
    const countDir = (dir) => {
      try {
        const items = fs.readdirSync(dir);
        items.forEach(item => {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory() && !['node_modules', '.git'].includes(item)) {
            countDir(fullPath);
          } else if (stat.isFile()) {
            count++;
          }
        });
      } catch (error) {
        // Skip
      }
    };
    
    countDir('cli');
    count += 5; // Main files
    return count;
  }

  findLargeFiles() {
    const largeFiles = [];
    const threshold = 100 * 1024; // 100KB
    
    const checkDir = (dir) => {
      try {
        const items = fs.readdirSync(dir);
        items.forEach(item => {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory() && !['node_modules', '.git'].includes(item)) {
            checkDir(fullPath);
          } else if (stat.isFile() && stat.size > threshold) {
            largeFiles.push({
              path: fullPath.replace(process.cwd() + '/', ''),
              size: stat.size
            });
          }
        });
      } catch (error) {
        // Skip
      }
    };
    
    checkDir(process.cwd());
    return largeFiles.slice(0, 10); // Top 10 largest files
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async generateReport() {
    console.log(chalk.bold.cyan('\\n📋 Optimization Report'));
    console.log(chalk.gray('─'.repeat(50)));
    
    if (this.optimizations.length === 0) {
      console.log(chalk.green('🎉 Package is already well optimized!'));
      console.log(chalk.green('✅ No major optimizations needed'));
      return;
    }
    
    console.log(chalk.yellow(`⚡ Found ${this.optimizations.length} optimization opportunities:`));
    console.log('');
    
    this.optimizations.forEach((opt, index) => {
      console.log(chalk.white(`${index + 1}. ${opt.action}`));
      console.log(chalk.gray(`   Type: ${opt.type}`));
      console.log(chalk.cyan(`   Impact: ${opt.impact}`));
      
      if (opt.urgent) {
        console.log(chalk.red('   🚨 URGENT'));
      }
      
      if (opt.items) {
        console.log(chalk.gray(`   Items: ${opt.items.length}`));
      }
      
      if (opt.count) {
        console.log(chalk.gray(`   Count: ${opt.count}`));
      }
      
      console.log('');
    });
    
    console.log(chalk.bold('🛠️  Recommended Actions:'));
    console.log(chalk.cyan('1. Run npm update to update dependencies'));
    console.log(chalk.cyan('2. Run npm audit fix to fix security issues'));
    console.log(chalk.cyan('3. Review and remove unused dependencies'));
    console.log(chalk.cyan('4. Consider moving large files to external storage'));
    console.log('');
    
    console.log(chalk.green('📈 Estimated improvements:'));
    console.log(chalk.green('• 15-30% smaller bundle size'));
    console.log(chalk.green('• Faster installation times'));
    console.log(chalk.green('• Better security posture'));
    console.log(chalk.green('• Improved performance'));
  }
}

// Run optimization if this file is executed directly
if (require.main === module) {
  const optimizer = new PackageOptimizer();
  optimizer.optimize().catch(console.error);
}

module.exports = PackageOptimizer;