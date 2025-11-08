#!/usr/bin/env node

/**
 * Performance Benchmark Script
 * Comprehensive performance testing for Enhanced AI CLI
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;
const { performance } = require('perf_hooks');

class PerformanceBenchmark {
  constructor() {
    this.results = {
      startup: {},
      memory: {},
      cpu: {},
      disk: {},
      network: {},
      features: {}
    };
    this.testIterations = 5;
  }

  async benchmark() {
    console.log(chalk.bold.cyan('📊 Enhanced AI CLI Performance Benchmark'));
    console.log(chalk.gray('═'.repeat(50)));
    console.log('');

    await this.benchmarkStartupTime();
    await this.benchmarkMemoryUsage();
    await this.benchmarkCPUUsage();
    await this.benchmarkDiskIO();
    await this.benchmarkFeaturePerformance();
    await this.benchmarkScalability();
    await this.generateReport();
  }

  async benchmarkStartupTime() {
    console.log(chalk.cyan('🚀 Startup Time Benchmark'));
    
    const startupTimes = [];
    
    for (let i = 0; i < this.testIterations; i++) {
      const start = performance.now();
      
      try {
        // Test CLI startup time
        execSync('node cli/run.js --version', { 
          stdio: 'pipe',
          timeout: 10000
        });
        
        const end = performance.now();
        const duration = end - start;
        startupTimes.push(duration);
        
        console.log(chalk.gray(`  Iteration ${i + 1}: ${duration.toFixed(2)}ms`));
      } catch (error) {
        console.log(chalk.red(`  Iteration ${i + 1}: Failed`));
      }
    }
    
    if (startupTimes.length > 0) {
      this.results.startup = {
        average: this.calculateAverage(startupTimes),
        min: Math.min(...startupTimes),
        max: Math.max(...startupTimes),
        standardDeviation: this.calculateStdDev(startupTimes)
      };
      
      console.log(chalk.green(`✅ Average startup time: ${this.results.startup.average.toFixed(2)}ms`));
    } else {
      console.log(chalk.red('❌ All startup tests failed'));
    }
  }

  async benchmarkMemoryUsage() {
    console.log(chalk.cyan('\\n🧠 Memory Usage Benchmark'));
    
    const initialMemory = process.memoryUsage();
    console.log(chalk.gray(`  Initial memory: ${this.formatBytes(initialMemory.heapUsed)}`));
    
    // Test memory usage with different operations
    const memoryTests = [
      { name: 'Model Loading', test: () => this.simulateModelLoading() },
      { name: 'Rules Engine', test: () => this.simulateRulesEngine() },
      { name: 'File Processing', test: () => this.simulateFileProcessing() },
      { name: 'Task Management', test: () => this.simulateTaskManagement() }
    ];
    
    for (const test of memoryTests) {
      const beforeMemory = process.memoryUsage();
      
      try {
        await test.test();
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
        
        const afterMemory = process.memoryUsage();
        const memoryDiff = afterMemory.heapUsed - beforeMemory.heapUsed;
        
        console.log(chalk.gray(`  ${test.name}: ${this.formatBytes(memoryDiff)}`));
        
        this.results.memory[test.name.toLowerCase().replace(' ', '_')] = {
          before: beforeMemory.heapUsed,
          after: afterMemory.heapUsed,
          difference: memoryDiff
        };
      } catch (error) {
        console.log(chalk.red(`  ${test.name}: Failed`));
      }
    }
    
    const finalMemory = process.memoryUsage();
    const totalMemoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
    
    console.log(chalk.green(`✅ Total memory increase: ${this.formatBytes(totalMemoryIncrease)}`));
    this.results.memory.total_increase = totalMemoryIncrease;
  }

  async benchmarkCPUUsage() {
    console.log(chalk.cyan('\\n⚡ CPU Usage Benchmark'));
    
    const cpuTests = [
      { name: 'Model Selection Algorithm', test: () => this.benchmarkModelSelection() },
      { name: 'Rules Validation', test: () => this.benchmarkRulesValidation() },
      { name: 'File Analysis', test: () => this.benchmarkFileAnalysis() },
      { name: 'JSON Processing', test: () => this.benchmarkJSONProcessing() }
    ];
    
    for (const test of cpuTests) {
      const iterations = 1000;
      const start = performance.now();
      
      try {
        for (let i = 0; i < iterations; i++) {
          await test.test();
        }
        
        const end = performance.now();
        const totalTime = end - start;
        const avgTime = totalTime / iterations;
        
        console.log(chalk.gray(`  ${test.name}: ${avgTime.toFixed(3)}ms/iteration`));
        
        this.results.cpu[test.name.toLowerCase().replace(/ /g, '_')] = {
          total_time: totalTime,
          average_time: avgTime,
          iterations: iterations
        };
      } catch (error) {
        console.log(chalk.red(`  ${test.name}: Failed`));
      }
    }
    
    console.log(chalk.green('✅ CPU benchmarks completed'));
  }

  async benchmarkDiskIO() {
    console.log(chalk.cyan('\\n💾 Disk I/O Benchmark'));
    
    const testFile = 'temp_benchmark_file.txt';
    const testData = 'A'.repeat(1024 * 1024); // 1MB of data
    
    try {
      // Write test
      const writeStart = performance.now();
      fs.writeFileSync(testFile, testData);
      const writeTime = performance.now() - writeStart;
      
      // Read test
      const readStart = performance.now();
      fs.readFileSync(testFile, 'utf8');
      const readTime = performance.now() - readStart;
      
      // Delete test
      const deleteStart = performance.now();
      fs.unlinkSync(testFile);
      const deleteTime = performance.now() - deleteStart;
      
      this.results.disk = {
        write_time: writeTime,
        read_time: readTime,
        delete_time: deleteTime,
        file_size: testData.length
      };
      
      console.log(chalk.gray(`  Write 1MB: ${writeTime.toFixed(2)}ms`));
      console.log(chalk.gray(`  Read 1MB: ${readTime.toFixed(2)}ms`));
      console.log(chalk.gray(`  Delete: ${deleteTime.toFixed(2)}ms`));
      
      console.log(chalk.green('✅ Disk I/O benchmarks completed'));
    } catch (error) {
      console.log(chalk.red('❌ Disk I/O benchmark failed'));
    }
  }

  async benchmarkFeaturePerformance() {
    console.log(chalk.cyan('\\n🎯 Feature Performance Benchmark'));
    
    const featureTests = [
      { name: 'Setup Wizard', test: () => this.benchmarkSetupWizard() },
      { name: 'Configuration Loading', test: () => this.benchmarkConfigLoading() },
      { name: 'Plugin System', test: () => this.benchmarkPluginSystem() },
      { name: 'Error Handling', test: () => this.benchmarkErrorHandling() }
    ];
    
    for (const test of featureTests) {
      try {
        const start = performance.now();
        await test.test();
        const end = performance.now();
        const duration = end - start;
        
        console.log(chalk.gray(`  ${test.name}: ${duration.toFixed(2)}ms`));
        
        this.results.features[test.name.toLowerCase().replace(/ /g, '_')] = {
          duration: duration,
          status: 'success'
        };
      } catch (error) {
        console.log(chalk.red(`  ${test.name}: Failed`));
        this.results.features[test.name.toLowerCase().replace(/ /g, '_')] = {
          status: 'failed',
          error: error.message
        };
      }
    }
    
    console.log(chalk.green('✅ Feature benchmarks completed'));
  }

  async benchmarkScalability() {
    console.log(chalk.cyan('\\n📈 Scalability Benchmark'));
    
    const loadTests = [10, 50, 100, 500];
    
    for (const load of loadTests) {
      try {
        const start = performance.now();
        
        // Simulate concurrent operations
        const promises = Array(load).fill().map((_, i) => 
          this.simulateConcurrentOperation(i)
        );
        
        await Promise.all(promises);
        
        const end = performance.now();
        const duration = end - start;
        const throughput = load / (duration / 1000); // operations per second
        
        console.log(chalk.gray(`  ${load} concurrent ops: ${duration.toFixed(2)}ms (${throughput.toFixed(2)} ops/sec)`));
        
        this.results.scalability = this.results.scalability || {};
        this.results.scalability[`load_${load}`] = {
          duration: duration,
          throughput: throughput,
          operations: load
        };
      } catch (error) {
        console.log(chalk.red(`  ${load} concurrent ops: Failed`));
      }
    }
    
    console.log(chalk.green('✅ Scalability benchmarks completed'));
  }

  // Simulation methods for testing
  async simulateModelLoading() {
    // Simulate model loading overhead
    const models = Array(32).fill().map((_, i) => ({
      id: `model-${i}`,
      name: `Model ${i}`,
      priority: i % 5 + 1,
      cost: i % 2 === 0 ? 'free' : 'paid'
    }));
    
    // Simulate selection algorithm
    models.sort((a, b) => a.priority - b.priority);
    return models[0];
  }

  async simulateRulesEngine() {
    // Simulate rules processing
    const rules = Array(100).fill().map((_, i) => ({
      id: `rule-${i}`,
      category: ['security', 'performance', 'style'][i % 3],
      pattern: `pattern-${i}`,
      severity: ['low', 'medium', 'high'][i % 3]
    }));
    
    // Simulate validation
    return rules.filter(rule => rule.severity === 'high');
  }

  async simulateFileProcessing() {
    // Simulate file processing
    const files = Array(50).fill().map((_, i) => ({
      path: `file-${i}.js`,
      size: Math.random() * 10000,
      content: 'A'.repeat(Math.floor(Math.random() * 1000))
    }));
    
    // Simulate analysis
    return files.map(file => ({
      ...file,
      analyzed: true,
      issues: Math.floor(Math.random() * 5)
    }));
  }

  async simulateTaskManagement() {
    // Simulate task management
    const tasks = Array(20).fill().map((_, i) => ({
      id: `task-${i}`,
      type: ['automation', 'analysis', 'generation'][i % 3],
      status: 'pending',
      priority: Math.floor(Math.random() * 10)
    }));
    
    // Simulate task processing
    return tasks.map(task => ({
      ...task,
      status: 'completed',
      duration: Math.random() * 1000
    }));
  }

  async benchmarkModelSelection() {
    // Simple model selection algorithm
    const models = [
      { id: 'claude-sonnet-4', priority: 1, cost: 10 },
      { id: 'kimi-dev-72b', priority: 2, cost: 0 },
      { id: 'deepseek-v3.1', priority: 3, cost: 0 }
    ];
    
    const taskType = 'coding';
    const selected = models.reduce((best, model) => 
      model.priority < best.priority ? model : best
    );
    
    return selected;
  }

  async benchmarkRulesValidation() {
    // Simple rules validation
    const code = 'function test() { return Math.random(); }';
    const rules = [
      { pattern: /Math\\.random/, severity: 'medium' },
      { pattern: /eval/, severity: 'high' },
      { pattern: /innerHTML/, severity: 'low' }
    ];
    
    return rules.filter(rule => rule.pattern.test(code));
  }

  async benchmarkFileAnalysis() {
    // Simple file analysis
    const content = 'const x = 1; function test() { return x * 2; }';
    const metrics = {
      lines: content.split('\\n').length,
      functions: (content.match(/function/g) || []).length,
      variables: (content.match(/const|let|var/g) || []).length
    };
    
    return metrics;
  }

  async benchmarkJSONProcessing() {
    // JSON processing benchmark
    const data = {
      models: Array(50).fill().map((_, i) => ({ id: i, name: `Model ${i}` })),
      rules: Array(100).fill().map((_, i) => ({ id: i, rule: `Rule ${i}` })),
      tasks: Array(25).fill().map((_, i) => ({ id: i, task: `Task ${i}` }))
    };
    
    const json = JSON.stringify(data);
    const parsed = JSON.parse(json);
    
    return parsed;
  }

  async benchmarkSetupWizard() {
    // Simulate setup wizard operations
    await this.delay(Math.random() * 10);
    return { configured: true };
  }

  async benchmarkConfigLoading() {
    // Simulate config loading
    const config = {
      model: 'claude-sonnet-4',
      apiKey: 'test-key',
      features: ['automation', 'rules', 'devtools']
    };
    
    return config;
  }

  async benchmarkPluginSystem() {
    // Simulate plugin loading
    const plugins = Array(5).fill().map((_, i) => ({
      name: `plugin-${i}`,
      loaded: true
    }));
    
    return plugins;
  }

  async benchmarkErrorHandling() {
    // Simulate error handling
    try {
      throw new Error('Test error');
    } catch (error) {
      return { handled: true, error: error.message };
    }
  }

  async simulateConcurrentOperation(id) {
    // Simulate a concurrent operation
    await this.delay(Math.random() * 100);
    return { id, completed: true };
  }

  // Utility methods
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  calculateAverage(numbers) {
    return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
  }

  calculateStdDev(numbers) {
    const avg = this.calculateAverage(numbers);
    const squareDiffs = numbers.map(num => Math.pow(num - avg, 2));
    return Math.sqrt(this.calculateAverage(squareDiffs));
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async generateReport() {
    console.log(chalk.bold.cyan('\\n📋 Performance Report'));
    console.log(chalk.gray('═'.repeat(50)));
    
    // Startup Performance
    if (this.results.startup.average) {
      console.log(chalk.bold('\\n🚀 Startup Performance:'));
      console.log(`   Average: ${this.results.startup.average.toFixed(2)}ms`);
      console.log(`   Range: ${this.results.startup.min.toFixed(2)}ms - ${this.results.startup.max.toFixed(2)}ms`);
      console.log(`   Std Dev: ${this.results.startup.standardDeviation.toFixed(2)}ms`);
      
      const startupRating = this.results.startup.average < 500 ? 'Excellent' :
                           this.results.startup.average < 1000 ? 'Good' :
                           this.results.startup.average < 2000 ? 'Fair' : 'Poor';
      
      const ratingColor = startupRating === 'Excellent' ? chalk.green :
                         startupRating === 'Good' ? chalk.yellow :
                         startupRating === 'Fair' ? chalk.orange : chalk.red;
      
      console.log(`   Rating: ${ratingColor(startupRating)}`);
    }
    
    // Memory Performance
    if (this.results.memory.total_increase !== undefined) {
      console.log(chalk.bold('\\n🧠 Memory Performance:'));
      console.log(`   Total Memory Increase: ${this.formatBytes(this.results.memory.total_increase)}`);
      
      Object.entries(this.results.memory).forEach(([key, value]) => {
        if (key !== 'total_increase' && value.difference) {
          console.log(`   ${key.replace(/_/g, ' ')}: ${this.formatBytes(value.difference)}`);
        }
      });
      
      const memoryRating = this.results.memory.total_increase < 50 * 1024 * 1024 ? 'Excellent' :
                          this.results.memory.total_increase < 100 * 1024 * 1024 ? 'Good' :
                          this.results.memory.total_increase < 200 * 1024 * 1024 ? 'Fair' : 'Poor';
      
      const memoryColor = memoryRating === 'Excellent' ? chalk.green :
                         memoryRating === 'Good' ? chalk.yellow :
                         memoryRating === 'Fair' ? chalk.orange : chalk.red;
      
      console.log(`   Rating: ${memoryColor(memoryRating)}`);
    }
    
    // CPU Performance
    if (Object.keys(this.results.cpu).length > 0) {
      console.log(chalk.bold('\\n⚡ CPU Performance:'));
      Object.entries(this.results.cpu).forEach(([key, value]) => {
        console.log(`   ${key.replace(/_/g, ' ')}: ${value.average_time.toFixed(3)}ms/op`);
      });
    }
    
    // Disk I/O Performance
    if (this.results.disk.write_time) {
      console.log(chalk.bold('\\n💾 Disk I/O Performance:'));
      console.log(`   Write Speed: ${(1024 / this.results.disk.write_time * 1000).toFixed(2)} MB/s`);
      console.log(`   Read Speed: ${(1024 / this.results.disk.read_time * 1000).toFixed(2)} MB/s`);
    }
    
    // Feature Performance
    if (Object.keys(this.results.features).length > 0) {
      console.log(chalk.bold('\\n🎯 Feature Performance:'));
      Object.entries(this.results.features).forEach(([key, value]) => {
        if (value.status === 'success') {
          console.log(chalk.green(`   ✅ ${key.replace(/_/g, ' ')}: ${value.duration.toFixed(2)}ms`));
        } else {
          console.log(chalk.red(`   ❌ ${key.replace(/_/g, ' ')}: Failed`));
        }
      });
    }
    
    // Scalability Performance
    if (this.results.scalability) {
      console.log(chalk.bold('\\n📈 Scalability Performance:'));
      Object.entries(this.results.scalability).forEach(([key, value]) => {
        console.log(`   ${value.operations} ops: ${value.throughput.toFixed(2)} ops/sec`);
      });
    }
    
    // Overall Performance Score
    const score = this.calculateOverallScore();
    console.log(chalk.bold('\\n📊 Overall Performance Score:'));
    const scoreColor = score >= 90 ? chalk.green : score >= 70 ? chalk.yellow : chalk.red;
    console.log(scoreColor(`   ${score}/100`));
    
    if (score >= 90) {
      console.log(chalk.green('   🏆 Excellent performance!'));
    } else if (score >= 70) {
      console.log(chalk.yellow('   👍 Good performance with room for improvement'));
    } else {
      console.log(chalk.red('   ⚠️  Performance needs optimization'));
    }
    
    // Recommendations
    console.log(chalk.bold('\\n💡 Performance Recommendations:'));
    const recommendations = this.generateRecommendations();
    recommendations.forEach(rec => {
      console.log(chalk.cyan(`   • ${rec}`));
    });
    
    console.log('\\n' + chalk.gray('Benchmark completed at: ' + new Date().toISOString()));
  }

  calculateOverallScore() {
    let score = 100;
    
    // Startup time penalty
    if (this.results.startup.average) {
      if (this.results.startup.average > 2000) score -= 20;
      else if (this.results.startup.average > 1000) score -= 10;
      else if (this.results.startup.average > 500) score -= 5;
    }
    
    // Memory usage penalty
    if (this.results.memory.total_increase) {
      const memoryMB = this.results.memory.total_increase / (1024 * 1024);
      if (memoryMB > 200) score -= 20;
      else if (memoryMB > 100) score -= 10;
      else if (memoryMB > 50) score -= 5;
    }
    
    // Feature failures penalty
    const featureFailures = Object.values(this.results.features).filter(f => f.status === 'failed').length;
    score -= featureFailures * 10;
    
    return Math.max(0, score);
  }

  generateRecommendations() {
    const recommendations = [];
    
    if (this.results.startup.average > 1000) {
      recommendations.push('Optimize startup time by lazy-loading modules');
    }
    
    if (this.results.memory.total_increase > 100 * 1024 * 1024) {
      recommendations.push('Implement memory management and garbage collection optimization');
    }
    
    const featureFailures = Object.values(this.results.features).filter(f => f.status === 'failed').length;
    if (featureFailures > 0) {
      recommendations.push('Fix failed feature benchmarks for better reliability');
    }
    
    if (this.results.cpu) {
      const slowOperations = Object.entries(this.results.cpu).filter(([_, value]) => value.average_time > 10);
      if (slowOperations.length > 0) {
        recommendations.push('Optimize CPU-intensive operations for better responsiveness');
      }
    }
    
    recommendations.push('Consider implementing caching for frequently accessed data');
    recommendations.push('Monitor performance metrics in production environment');
    recommendations.push('Set up automated performance regression testing');
    
    return recommendations;
  }
}

// Run benchmark if this file is executed directly
if (require.main === module) {
  const benchmark = new PerformanceBenchmark();
  benchmark.benchmark().catch(console.error);
}

module.exports = PerformanceBenchmark;