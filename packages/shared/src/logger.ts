import winston from 'winston';
import chalk from 'chalk';

// Create logger instance
const logger = winston.createLogger({
  level: process.env['LOG_LEVEL'] || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

export class Logger {
  private static instance: Logger;

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  static info(message: string, meta?: any): void {
    console.log(chalk.blue('ℹ'), message);
    if (meta) logger.info(message, meta);
  }

  static warn(message: string, meta?: any): void {
    console.log(chalk.yellow('⚠'), message);
    if (meta) logger.warn(message, meta);
  }

  static error(message: string, meta?: any): void {
    console.log(chalk.red('✗'), message);
    if (meta) logger.error(message, meta);
  }

  static success(message: string, meta?: any): void {
    console.log(chalk.green('✓'), message);
    if (meta) logger.info(message, meta);
  }

  static debug(message: string, meta?: any): void {
    if (process.env['LOG_LEVEL'] === 'debug') {
      console.log(chalk.gray('🐛'), message);
      if (meta) logger.debug(message, meta);
    }
  }

  // Instance methods that delegate to static methods
  info(message: string, meta?: any): void {
    Logger.info(message, meta);
  }

  warn(message: string, meta?: any): void {
    Logger.warn(message, meta);
  }

  error(message: string, meta?: any): void {
    Logger.error(message, meta);
  }

  success(message: string, meta?: any): void {
    Logger.success(message, meta);
  }

  debug(message: string, meta?: any): void {
    Logger.debug(message, meta);
  }
}
