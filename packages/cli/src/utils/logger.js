const chalk = require('chalk');

class Logger {
  constructor() {
    this.level = process.env.LOG_LEVEL || 'info';
    this.levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
      success: 1
    };
  }

  setLevel(level) {
    this.level = level;
  }

  shouldLog(level) {
    return this.levels[level] >= this.levels[this.level];
  }

  debug(message, ...args) {
    if (this.shouldLog('debug')) {
      console.log(chalk.gray(`[DEBUG] ${message}`), ...args);
    }
  }

  info(message, ...args) {
    if (this.shouldLog('info')) {
      console.log(chalk.blue(`[INFO] ${message}`), ...args);
    }
  }

  warn(message, ...args) {
    if (this.shouldLog('warn')) {
      console.log(chalk.yellow(`[WARN] ${message}`), ...args);
    }
  }

  error(message, ...args) {
    if (this.shouldLog('error')) {
      console.error(chalk.red(`[ERROR] ${message}`), ...args);
    }
  }

  success(message, ...args) {
    if (this.shouldLog('success')) {
      console.log(chalk.green(`[SUCCESS] ${message}`), ...args);
    }
  }

  // Styled logging methods
  title(message) {
    console.log(chalk.bold.cyan(`\\n🚀 ${message}`));
  }

  step(message) {
    console.log(chalk.cyan(`📋 ${message}`));
  }

  result(message) {
    console.log(chalk.green(`✅ ${message}`));
  }

  warning(message) {
    console.log(chalk.yellow(`⚠️  ${message}`));
  }

  failure(message) {
    console.log(chalk.red(`❌ ${message}`));
  }

  progress(message) {
    console.log(chalk.blue(`⏳ ${message}`));
  }
}

const logger = new Logger();

module.exports = { logger, Logger };