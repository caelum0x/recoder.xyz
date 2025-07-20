import winston from 'winston';
import chalk from 'chalk';

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
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
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(chalk.gray('🐛'), message);
      if (meta) logger.debug(message, meta);
    }
  }
}
