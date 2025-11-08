const fs = require('fs');
const path = require('path');
// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;
const util = require('util');

class DebugLogger {
  constructor() {
    this.debugEnabled = process.env.RECODER_DEBUG === 'true' || process.env.NODE_ENV === 'development';
    this.logLevel = process.env.RECODER_LOG_LEVEL || 'info';
    this.logDir = path.join(process.cwd(), 'logs');
    this.sessionId = Date.now().toString();
    this.startTime = Date.now();
    this.metrics = {
      apiCalls: 0,
      tokensUsed: 0,
      errors: 0,
      warnings: 0,
      commandsExecuted: 0,
      sessionDuration: 0
    };
    
    // Ensure logs directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    
    this.initializeLogging();
  }

  initializeLogging() {
    // Set up log rotation and file streams
    this.debugLogFile = path.join(this.logDir, `debug-${this.sessionId}.log`);
    this.errorLogFile = path.join(this.logDir, `error-${this.sessionId}.log`);
    this.metricsLogFile = path.join(this.logDir, `metrics-${this.sessionId}.log`);
    
    // Create initial log entry
    this.log('info', 'Debug logger initialized', {
      sessionId: this.sessionId,
      debugEnabled: this.debugEnabled,
      logLevel: this.logLevel,
      environment: process.env.NODE_ENV || 'production'
    });
  }

  // Core logging methods
  log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      sessionId: this.sessionId,
      ...data
    };

    // Console output with colors
    if (this.shouldLog(level)) {
      this.outputToConsole(level, message, data);
    }

    // File output
    this.writeToFile(this.debugLogFile, logEntry);
    
    // Error-specific logging
    if (level === 'error') {
      this.writeToFile(this.errorLogFile, logEntry);
      this.metrics.errors++;
    }
    
    if (level === 'warn') {
      this.metrics.warnings++;
    }
  }

  debug(message, data = {}) {
    if (this.debugEnabled) {
      this.log('debug', message, data);
    }
  }

  info(message, data = {}) {
    this.log('info', message, data);
  }

  warn(message, data = {}) {
    this.log('warn', message, data);
  }

  error(message, error = null, data = {}) {
    const errorData = error ? {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      ...data
    } : data;
    
    this.log('error', message, errorData);
  }

  // Performance tracking
  startTimer(name) {
    this.timers = this.timers || new Map();
    this.timers.set(name, Date.now());
    this.debug(`Timer started: ${name}`);
  }

  endTimer(name) {
    if (!this.timers || !this.timers.has(name)) {
      this.warn(`Timer not found: ${name}`);
      return 0;
    }
    
    const duration = Date.now() - this.timers.get(name);
    this.timers.delete(name);
    this.debug(`Timer ended: ${name}`, { duration: `${duration}ms` });
    return duration;
  }

  // API call tracking
  logAPICall(endpoint, model, tokens, duration, success = true) {
    this.metrics.apiCalls++;
    this.metrics.tokensUsed += tokens || 0;
    
    const callData = {
      type: 'api_call',
      endpoint,
      model,
      tokens,
      duration,
      success,
      timestamp: new Date().toISOString()
    };
    
    this.debug('API call completed', callData);
    this.logMetrics('api_call', callData);
    
    if (!success) {
      this.error('API call failed', null, callData);
    }
  }

  // Command execution tracking
  logCommand(command, args, success = true, duration = 0) {
    this.metrics.commandsExecuted++;
    
    const commandData = {
      type: 'command_execution',
      command,
      args,
      success,
      duration,
      timestamp: new Date().toISOString()
    };
    
    this.debug(`Command executed: ${command}`, commandData);
    
    if (!success) {
      this.error(`Command failed: ${command}`, null, commandData);
    }
  }

  // Plugin activity tracking
  logPluginActivity(pluginName, action, data = {}) {
    const pluginData = {
      type: 'plugin_activity',
      plugin: pluginName,
      action,
      ...data,
      timestamp: new Date().toISOString()
    };
    
    this.debug(`Plugin activity: ${pluginName} - ${action}`, pluginData);
  }

  // Voice activity tracking
  logVoiceActivity(action, data = {}) {
    const voiceData = {
      type: 'voice_activity',
      action,
      ...data,
      timestamp: new Date().toISOString()
    };
    
    this.debug(`Voice activity: ${action}`, voiceData);
  }

  // Collaboration tracking
  logCollaborationActivity(action, data = {}) {
    const collabData = {
      type: 'collaboration_activity',
      action,
      ...data,
      timestamp: new Date().toISOString()
    };
    
    this.debug(`Collaboration activity: ${action}`, collabData);
  }

  // Metrics logging
  logMetrics(type, data = {}) {
    const metricsEntry = {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      type,
      metrics: { ...this.metrics },
      ...data
    };
    
    this.writeToFile(this.metricsLogFile, metricsEntry);
  }

  // Session management
  startSession(sessionData = {}) {
    this.startTime = Date.now();
    this.info('Session started', {
      type: 'session_start',
      ...sessionData
    });
  }

  endSession() {
    this.metrics.sessionDuration = Date.now() - this.startTime;
    
    this.info('Session ended', {
      type: 'session_end',
      metrics: this.metrics,
      duration: this.metrics.sessionDuration
    });
    
    this.logMetrics('session_summary', {
      totalDuration: this.metrics.sessionDuration,
      finalMetrics: this.metrics
    });
  }

  // Utility methods
  shouldLog(level) {
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    
    if (level === 'debug' && !this.debugEnabled) {
      return false;
    }
    
    return messageLevelIndex >= currentLevelIndex;
  }

  outputToConsole(level, message, data) {
    const timestamp = new Date().toLocaleTimeString();
    let coloredMessage;
    
    switch (level) {
      case 'debug':
        coloredMessage = chalk.gray(`[${timestamp}] DEBUG: ${message}`);
        break;
      case 'info':
        coloredMessage = chalk.blue(`[${timestamp}] INFO: ${message}`);
        break;
      case 'warn':
        coloredMessage = chalk.yellow(`[${timestamp}] WARN: ${message}`);
        break;
      case 'error':
        coloredMessage = chalk.red(`[${timestamp}] ERROR: ${message}`);
        break;
      default:
        coloredMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    }
    
    console.log(coloredMessage);
    
    if (this.debugEnabled && Object.keys(data).length > 0) {
      console.log(chalk.gray(util.inspect(data, { depth: 2, colors: true })));
    }
  }

  writeToFile(filePath, logEntry) {
    try {
      const logLine = JSON.stringify(logEntry) + '\n';
      fs.appendFileSync(filePath, logLine);
    } catch (error) {
      console.error('Failed to write to log file:', error.message);
    }
  }

  // Report generation
  generateDebugReport() {
    const report = {
      sessionId: this.sessionId,
      sessionDuration: Date.now() - this.startTime,
      metrics: this.metrics,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        memory: process.memoryUsage(),
        uptime: process.uptime()
      },
      timestamp: new Date().toISOString()
    };
    
    return report;
  }

  exportLogs(format = 'json') {
    const reportData = this.generateDebugReport();
    const exportDir = path.join(this.logDir, 'exports');
    
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir);
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `debug-report-${timestamp}.${format}`;
    const filepath = path.join(exportDir, filename);
    
    try {
      if (format === 'json') {
        fs.writeFileSync(filepath, JSON.stringify(reportData, null, 2));
      } else if (format === 'txt') {
        const textReport = this.formatReportAsText(reportData);
        fs.writeFileSync(filepath, textReport);
      }
      
      this.info('Debug report exported', { filepath, format });
      return filepath;
    } catch (error) {
      this.error('Failed to export debug report', error);
      return null;
    }
  }

  formatReportAsText(reportData) {
    let text = `Recoder Debug Report\n`;
    text += `=====================\n\n`;
    text += `Session ID: ${reportData.sessionId}\n`;
    text += `Generated: ${reportData.timestamp}\n`;
    text += `Duration: ${Math.round(reportData.sessionDuration / 1000)}s\n\n`;
    
    text += `Metrics:\n`;
    text += `--------\n`;
    Object.entries(reportData.metrics).forEach(([key, value]) => {
      text += `${key}: ${value}\n`;
    });
    
    text += `\nEnvironment:\n`;
    text += `------------\n`;
    Object.entries(reportData.environment).forEach(([key, value]) => {
      if (typeof value === 'object') {
        text += `${key}: ${JSON.stringify(value)}\n`;
      } else {
        text += `${key}: ${value}\n`;
      }
    });
    
    return text;
  }

  // Clean up old logs
  cleanupOldLogs(daysToKeep = 7) {
    try {
      const files = fs.readdirSync(this.logDir);
      const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
      
      files.forEach(file => {
        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime.getTime() < cutoffTime) {
          fs.unlinkSync(filePath);
          this.debug(`Cleaned up old log file: ${file}`);
        }
      });
    } catch (error) {
      this.error('Failed to cleanup old logs', error);
    }
  }

  // Memory and performance monitoring
  logMemoryUsage() {
    const usage = process.memoryUsage();
    this.debug('Memory usage', {
      type: 'memory_usage',
      rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
      external: `${Math.round(usage.external / 1024 / 1024)}MB`
    });
  }

  // Error boundary for capturing unhandled errors
  setupErrorHandlers() {
    process.on('uncaughtException', (error) => {
      this.error('Uncaught exception', error, {
        type: 'uncaught_exception',
        fatal: true
      });
      
      // Give logger time to write, then exit
      setTimeout(() => process.exit(1), 100);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      this.error('Unhandled promise rejection', reason, {
        type: 'unhandled_rejection',
        promise: promise.toString()
      });
    });
  }

  // Get current metrics
  getMetrics() {
    return {
      ...this.metrics,
      sessionDuration: Date.now() - this.startTime,
      memoryUsage: process.memoryUsage()
    };
  }
}

module.exports = DebugLogger;