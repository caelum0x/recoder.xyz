#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

/**
 * Production Logger for Recoder Code
 * Handles different log levels and environments
 */
class Logger {
  constructor(options = {}) {
    this.logLevel = options.logLevel || process.env.LOG_LEVEL || 'info';
    this.silent = options.silent || process.env.RECODER_SILENT === 'true';
    this.logFile = options.logFile || path.join(process.cwd(), 'logs', 'recoder.log');
    this.enableFileLogging = options.enableFileLogging !== false;
    
    // Create logs directory
    if (this.enableFileLogging) {
      const logDir = path.dirname(this.logFile);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    }
    
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
  }

  _shouldLog(level) {
    return this.levels[level] <= this.levels[this.logLevel];
  }

  _formatMessage(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    
    return {
      console: this._colorizeMessage(level, message, formattedArgs),
      file: `[${timestamp}] ${level.toUpperCase()}: ${message} ${formattedArgs}`.trim()
    };
  }

  _colorizeMessage(level, message, args) {
    const fullMessage = `${message} ${args}`.trim();
    
    switch (level) {
      case 'error':
        return chalk.red(`❌ ${fullMessage}`);
      case 'warn':
        return chalk.yellow(`⚠️  ${fullMessage}`);
      case 'info':
        return chalk.blue(`ℹ️  ${fullMessage}`);
      case 'debug':
        return chalk.gray(`🔍 ${fullMessage}`);
      default:
        return fullMessage;
    }
  }

  _writeToFile(message) {
    if (this.enableFileLogging) {
      try {
        fs.appendFileSync(this.logFile, message + '\n');
      } catch (error) {
        // Fail silently for file logging errors
      }
    }
  }

  error(message, ...args) {
    if (this._shouldLog('error')) {
      const formatted = this._formatMessage('error', message, ...args);
      if (!this.silent) {
        console.error(formatted.console);
      }
      this._writeToFile(formatted.file);
    }
  }

  warn(message, ...args) {
    if (this._shouldLog('warn')) {
      const formatted = this._formatMessage('warn', message, ...args);
      if (!this.silent) {
        console.warn(formatted.console);
      }
      this._writeToFile(formatted.file);
    }
  }

  info(message, ...args) {
    if (this._shouldLog('info')) {
      const formatted = this._formatMessage('info', message, ...args);
      if (!this.silent) {
        console.log(formatted.console);
      }
      this._writeToFile(formatted.file);
    }
  }

  debug(message, ...args) {
    if (this._shouldLog('debug')) {
      const formatted = this._formatMessage('debug', message, ...args);
      if (!this.silent) {
        console.log(formatted.console);
      }
      this._writeToFile(formatted.file);
    }
  }

  // Production-safe console.log replacement
  log(message, ...args) {
    // In production, treat as info level
    if (process.env.NODE_ENV === 'production') {
      this.info(message, ...args);
    } else {
      // In development, allow direct logging
      console.log(message, ...args);
    }
  }

  // Success messages for user feedback
  success(message, ...args) {
    const formatted = `✅ ${message} ${args.join(' ')}`.trim();
    if (!this.silent) {
      console.log(chalk.green(formatted));
    }
    this._writeToFile(`[${new Date().toISOString()}] SUCCESS: ${message} ${args.join(' ')}`.trim());
  }

  // Progress indicators
  progress(message, ...args) {
    const formatted = `⏳ ${message} ${args.join(' ')}`.trim();
    if (!this.silent) {
      console.log(chalk.cyan(formatted));
    }
  }

  // User prompts and interactive messages
  user(message, ...args) {
    const formatted = `${message} ${args.join(' ')}`.trim();
    if (!this.silent) {
      console.log(formatted);
    }
  }
}

// Global logger instance
const logger = new Logger();

// Replace console methods in production
if (process.env.NODE_ENV === 'production') {
  // Store original methods
  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info
  };

  // Override console methods
  console.log = (...args) => logger.log(...args);
  console.error = (...args) => logger.error(...args);
  console.warn = (...args) => logger.warn(...args);
  console.info = (...args) => logger.info(...args);

  // Provide way to restore original console
  console._restore = () => {
    Object.assign(console, originalConsole);
  };
}

module.exports = Logger;
module.exports.logger = logger;