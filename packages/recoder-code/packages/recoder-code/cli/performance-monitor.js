#!/usr/bin/env node

/**
 * Performance Monitor - Track and optimize system performance
 * Memory usage, timing, bottleneck detection
 */

const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      apiCalls: [],
      fileOperations: [],
      contextBuilds: [],
      compactions: []
    };
    
    this.timers = new Map();
    this.enabled = true;
  }

  /**
   * Start timing an operation
   */
  startTimer(operation) {
    if (!this.enabled) return;
    
    this.timers.set(operation, {
      start: Date.now(),
      memory: process.memoryUsage()
    });
  }

  /**
   * End timing and record metrics
   */
  endTimer(operation) {
    if (!this.enabled) return null;
    
    const timer = this.timers.get(operation);
    if (!timer) return null;
    
    const duration = Date.now() - timer.start;
    const memory = process.memoryUsage();
    const memoryDelta = {
      heapUsed: memory.heapUsed - timer.memory.heapUsed,
      external: memory.external - timer.memory.external
    };
    
    this.timers.delete(operation);
    
    return {
      operation,
      duration,
      memoryDelta,
      timestamp: Date.now()
    };
  }

  /**
   * Record API call metrics
   */
  recordAPICall(model, tokens, duration, cost = 0) {
    this.metrics.apiCalls.push({
      model,
      tokens,
      duration,
      cost,
      timestamp: Date.now()
    });
    
    // Keep only last 100 calls
    if (this.metrics.apiCalls.length > 100) {
      this.metrics.apiCalls = this.metrics.apiCalls.slice(-100);
    }
  }

  /**
   * Record file operation
   */
  recordFileOperation(operation, file, duration) {
    this.metrics.fileOperations.push({
      operation,
      file,
      duration,
      timestamp: Date.now()
    });
    
    if (this.metrics.fileOperations.length > 100) {
      this.metrics.fileOperations = this.metrics.fileOperations.slice(-100);
    }
  }

  /**
   * Record context build
   */
  recordContextBuild(tokens, duration) {
    this.metrics.contextBuilds.push({
      tokens,
      duration,
      timestamp: Date.now()
    });
    
    if (this.metrics.contextBuilds.length > 50) {
      this.metrics.contextBuilds = this.metrics.contextBuilds.slice(-50);
    }
  }

  /**
   * Record compaction
   */
  recordCompaction(originalTokens, finalTokens, duration) {
    this.metrics.compactions.push({
      originalTokens,
      finalTokens,
      saved: originalTokens - finalTokens,
      duration,
      timestamp: Date.now()
    });
  }

  /**
   * Get performance summary
   */
  getSummary() {
    const now = Date.now();
    const lastHour = now - 3600000;
    
    // Recent API calls
    const recentAPICalls = this.metrics.apiCalls.filter(c => c.timestamp > lastHour);
    const avgAPITime = recentAPICalls.length > 0 
      ? recentAPICalls.reduce((sum, c) => sum + c.duration, 0) / recentAPICalls.length 
      : 0;
    const totalTokens = recentAPICalls.reduce((sum, c) => sum + c.tokens, 0);
    const totalCost = recentAPICalls.reduce((sum, c) => sum + c.cost, 0);
    
    // Recent file operations
    const recentFileOps = this.metrics.fileOperations.filter(o => o.timestamp > lastHour);
    const avgFileOpTime = recentFileOps.length > 0
      ? recentFileOps.reduce((sum, o) => sum + o.duration, 0) / recentFileOps.length
      : 0;
    
    // Recent context builds
    const recentContexts = this.metrics.contextBuilds.filter(c => c.timestamp > lastHour);
    const avgContextTime = recentContexts.length > 0
      ? recentContexts.reduce((sum, c) => sum + c.duration, 0) / recentContexts.length
      : 0;
    
    // Memory usage
    const memory = process.memoryUsage();
    
    return {
      apiCalls: {
        count: recentAPICalls.length,
        avgDuration: Math.round(avgAPITime),
        totalTokens,
        totalCost  // Keep as number
      },
      fileOperations: {
        count: recentFileOps.length,
        avgDuration: Math.round(avgFileOpTime)
      },
      contextBuilds: {
        count: recentContexts.length,
        avgDuration: Math.round(avgContextTime)
      },
      compactions: {
        count: this.metrics.compactions.length,
        totalSaved: this.metrics.compactions.reduce((sum, c) => sum + c.saved, 0)
      },
      memory: {
        heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
        external: Math.round(memory.external / 1024 / 1024),
        rss: Math.round(memory.rss / 1024 / 1024)
      }
    };
  }

  /**
   * Display performance report
   */
  displayReport() {
    const summary = this.getSummary();
    
    console.log('');
    console.log(chalk.bold.cyan('⚡ Performance Report'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log('');
    
    console.log(chalk.blue('API Calls (last hour):'));
    console.log(chalk.gray(`  Count: ${summary.apiCalls.count}`));
    console.log(chalk.gray(`  Avg duration: ${summary.apiCalls.avgDuration}ms`));
    console.log(chalk.gray(`  Total tokens: ${summary.apiCalls.totalTokens.toLocaleString()}`));
    console.log(chalk.gray(`  Est. cost: $${summary.apiCalls.totalCost}`));
    console.log('');
    
    console.log(chalk.blue('File Operations:'));
    console.log(chalk.gray(`  Count: ${summary.fileOperations.count}`));
    console.log(chalk.gray(`  Avg duration: ${summary.fileOperations.avgDuration}ms`));
    console.log('');
    
    console.log(chalk.blue('Context Builds:'));
    console.log(chalk.gray(`  Count: ${summary.contextBuilds.count}`));
    console.log(chalk.gray(`  Avg duration: ${summary.contextBuilds.avgDuration}ms`));
    console.log('');
    
    if (summary.compactions.count > 0) {
      console.log(chalk.blue('Compactions:'));
      console.log(chalk.gray(`  Count: ${summary.compactions.count}`));
      console.log(chalk.gray(`  Tokens saved: ${summary.compactions.totalSaved.toLocaleString()}`));
      console.log('');
    }
    
    console.log(chalk.blue('Memory Usage:'));
    console.log(chalk.gray(`  Heap used: ${summary.memory.heapUsed} MB`));
    console.log(chalk.gray(`  Heap total: ${summary.memory.heapTotal} MB`));
    console.log(chalk.gray(`  RSS: ${summary.memory.rss} MB`));
    console.log('');
    
    // Detect bottlenecks
    const bottlenecks = this.detectBottlenecks(summary);
    if (bottlenecks.length > 0) {
      console.log(chalk.yellow('⚠️  Potential Bottlenecks:'));
      bottlenecks.forEach(b => {
        console.log(chalk.yellow(`  • ${b}`));
      });
      console.log('');
    }
  }

  /**
   * Detect performance bottlenecks
   */
  detectBottlenecks(summary) {
    const bottlenecks = [];
    
    if (summary.apiCalls.avgDuration > 5000) {
      bottlenecks.push('API calls are slow (avg >5s)');
    }
    
    if (summary.contextBuilds.avgDuration > 500) {
      bottlenecks.push('Context building is slow (avg >500ms)');
    }
    
    if (summary.memory.heapUsed > 500) {
      bottlenecks.push('High memory usage (>500 MB)');
    }
    
    if (summary.fileOperations.avgDuration > 100) {
      bottlenecks.push('File operations are slow (avg >100ms)');
    }
    
    return bottlenecks;
  }

  /**
   * Enable/disable monitoring
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Clear all metrics
   */
  clear() {
    this.metrics = {
      apiCalls: [],
      fileOperations: [],
      contextBuilds: [],
      compactions: []
    };
    this.timers.clear();
  }

  /**
   * Start operation tracking (returns operation ID)
   */
  startOperation(operationType) {
    const opId = `${operationType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.startTimer(opId);
    return opId;
  }

  /**
   * End operation tracking
   */
  endOperation(opId) {
    const result = this.endTimer(opId);
    if (result) {
      // Record based on operation type
      const type = opId.split('_')[0];
      if (type === 'file') {
        this.recordFileOperation(type, 'operation', result.duration);
      }
    }
    return result;
  }

  /**
   * Get all metrics
   */
  getMetrics() {
    const summary = this.getSummary();
    return {
      totalOperations: this.metrics.apiCalls.length + 
                      this.metrics.fileOperations.length + 
                      this.metrics.contextBuilds.length + 
                      this.metrics.compactions.length,
      apiCalls: this.metrics.apiCalls.length,
      fileOperations: this.metrics.fileOperations.length,
      contextBuilds: this.metrics.contextBuilds.length,
      compactions: this.metrics.compactions.length,
      summary: summary
    };
  }

  /**
   * Get stats by operation type
   */
  getStatsByType(type) {
    const operations = this.metrics[type] || [];
    
    if (operations.length === 0) {
      return {
        count: 0,
        avgDuration: 0,
        totalDuration: 0,
        min: 0,
        max: 0
      };
    }

    const durations = operations.map(op => op.duration);
    const total = durations.reduce((a, b) => a + b, 0);

    return {
      count: operations.length,
      avgDuration: total / operations.length,
      totalDuration: total,
      min: Math.min(...durations),
      max: Math.max(...durations)
    };
  }

  /**
   * Get current memory usage
   */
  getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
      heapUsedMB: (usage.heapUsed / 1024 / 1024).toFixed(2),
      heapTotalMB: (usage.heapTotal / 1024 / 1024).toFixed(2)
    };
  }

  /**
   * Get performance report
   */
  getReport() {
    const summary = this.getSummary();
    const bottlenecks = this.detectBottlenecks(summary);
    
    const lines = [];
    lines.push(chalk.bold.cyan('📊 Performance Report'));
    lines.push(chalk.gray('─'.repeat(60)));
    lines.push('');
    
    lines.push(chalk.bold('API Calls:'));
    lines.push(`  Total: ${summary.apiCalls.count}`);
    lines.push(`  Avg Duration: ${summary.apiCalls.avgDuration.toFixed(2)}ms`);
    lines.push(`  Total Tokens: ${summary.apiCalls.totalTokens}`);
    lines.push(`  Total Cost: $${summary.apiCalls.totalCost.toFixed(4)}`);
    lines.push('');
    
    lines.push(chalk.bold('File Operations:'));
    lines.push(`  Total: ${summary.fileOperations.count}`);
    lines.push(`  Avg Duration: ${summary.fileOperations.avgDuration.toFixed(2)}ms`);
    lines.push('');
    
    lines.push(chalk.bold('Memory:'));
    lines.push(`  Heap Used: ${summary.memory.heapUsed.toFixed(2)} MB`);
    lines.push(`  RSS: ${summary.memory.rss.toFixed(2)} MB`);
    lines.push('');
    
    if (bottlenecks.length > 0) {
      lines.push(chalk.yellow.bold('⚠️  Bottlenecks Detected:'));
      bottlenecks.forEach(b => lines.push(chalk.yellow(`  • ${b}`)));
    } else {
      lines.push(chalk.green('✅ No performance issues detected'));
    }
    
    return lines.join('\n');
  }
}

module.exports = PerformanceMonitor;
