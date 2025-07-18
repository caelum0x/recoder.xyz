/**
 * Enhanced logging utilities
 */

import winston from 'winston';
import chalk from 'chalk';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
  VERBOSE = 'verbose',
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: Record<string, any>;
  error?: Error;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  component?: string;
  operation?: string;
}

export interface LoggerConfig {
  level: LogLevel;
  format: 'json' | 'simple' | 'pretty';
  outputs: LogOutput[];
  enableColors: boolean;
  enableTimestamp: boolean;
  enableStack: boolean;
  maxFileSize: number;
  maxFiles: number;
  datePattern: string;
}

export interface LogOutput {
  type: 'console' | 'file' | 'http' | 'database';
  config: Record<string, any>;
  level?: LogLevel;
  format?: string;
  enabled: boolean;
}

export interface LoggerContext {
  component?: string;
  operation?: string;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  metadata?: Record<string, any>;
}

export class RecoderLogger {
  private winston: winston.Logger;
  private context: LoggerContext;
  private config: LoggerConfig;

  constructor(config: Partial<LoggerConfig> = {}, context: LoggerContext = {}) {
    this.config = {
      level: LogLevel.INFO,
      format: 'pretty',
      outputs: [{ type: 'console', config: {}, enabled: true }],
      enableColors: true,
      enableTimestamp: true,
      enableStack: true,
      maxFileSize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5,
      datePattern: 'YYYY-MM-DD',
      ...config,
    };

    this.context = context;
    this.winston = this.createWinstonLogger();
  }

  private createWinstonLogger(): winston.Logger {
    const transports: winston.transport[] = [];

    // Console transport
    if (this.config.outputs.some(o => o.type === 'console' && o.enabled)) {
      transports.push(new winston.transports.Console({
        level: this.config.level,
        format: this.getConsoleFormat(),
        handleExceptions: true,
        handleRejections: true,
      }));
    }

    return winston.createLogger({
      level: this.config.level,
      transports,
      exitOnError: false,
    });
  }

  private getConsoleFormat(): winston.Logform.Format {
    const formats: winston.Logform.Format[] = [];

    if (this.config.enableTimestamp) {
      formats.push(winston.format.timestamp());
    }

    if (this.config.format === 'json') {
      formats.push(winston.format.json());
    } else if (this.config.format === 'simple') {
      formats.push(winston.format.simple());
    } else {
      formats.push(winston.format.printf(this.prettyFormat.bind(this)));
    }

    if (this.config.enableColors) {
      formats.push(winston.format.colorize({ all: true }));
    }

    return winston.format.combine(...formats);
  }

  private prettyFormat(info: any): string {
    const { timestamp, level, message, ...meta } = info;
    const ts = timestamp ? chalk.gray(timestamp) : '';
    const lvl = this.colorizeLevel(level);
    const msg = message;
    const context = this.formatContext(meta);
    
    return `${ts} ${lvl} ${msg}${context}`;
  }

  private colorizeLevel(level: string): string {
    const colors: Record<string, any> = {
      error: chalk.red,
      warn: chalk.yellow,
      info: chalk.blue,
      debug: chalk.green,
      verbose: chalk.cyan,
    };
    
    const colorFn = colors[level] || chalk.white;
    return colorFn(level.toUpperCase().padEnd(7));
  }

  private formatContext(meta: any): string {
    if (!meta || Object.keys(meta).length === 0) {
      return '';
    }

    const contextString = Object.entries(meta)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(' ');
    
    return chalk.gray(` [${contextString}]`);
  }

  // Core logging methods
  public error(message: string, meta?: Record<string, any>): void;
  public error(error: Error, meta?: Record<string, any>): void;
  public error(messageOrError: string | Error, meta: Record<string, any> = {}): void {
    if (messageOrError instanceof Error) {
      this.winston.error(messageOrError.message, {
        ...meta,
        error: messageOrError,
        stack: messageOrError.stack,
      });
    } else {
      this.winston.error(messageOrError, meta);
    }
  }

  public warn(message: string, meta: Record<string, any> = {}): void {
    this.winston.warn(message, meta);
  }

  public info(message: string, meta: Record<string, any> = {}): void {
    this.winston.info(message, meta);
  }

  public debug(message: string, meta: Record<string, any> = {}): void {
    this.winston.debug(message, meta);
  }

  public verbose(message: string, meta: Record<string, any> = {}): void {
    this.winston.verbose(message, meta);
  }

  // Context management
  public withContext(context: LoggerContext): RecoderLogger {
    return new RecoderLogger(this.config, { ...this.context, ...context });
  }

  public withComponent(component: string): RecoderLogger {
    return this.withContext({ component });
  }

  public withOperation(operation: string): RecoderLogger {
    return this.withContext({ operation });
  }

  public withUser(userId: string): RecoderLogger {
    return this.withContext({ userId });
  }

  public withSession(sessionId: string): RecoderLogger {
    return this.withContext({ sessionId });
  }

  public withRequest(requestId: string): RecoderLogger {
    return this.withContext({ requestId });
  }

  // Configuration methods
  public setLevel(level: LogLevel): void {
    this.config.level = level;
    this.winston.level = level;
  }

  public getLevel(): LogLevel {
    return this.config.level;
  }

  public isLevelEnabled(level: LogLevel): boolean {
    const levels: Record<string, number> = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      verbose: 4,
    };
    
    return levels[level] <= levels[this.config.level];
  }

  public close(): Promise<void> {
    return new Promise((resolve) => {
      this.winston.close(() => resolve());
    });
  }
}

// Logger factory
export class LoggerFactory {
  private static instances: Map<string, RecoderLogger> = new Map();
  private static defaultConfig: LoggerConfig = {
    level: LogLevel.INFO,
    format: 'pretty',
    outputs: [{ type: 'console', config: {}, enabled: true }],
    enableColors: true,
    enableTimestamp: true,
    enableStack: true,
    maxFileSize: 5 * 1024 * 1024,
    maxFiles: 5,
    datePattern: 'YYYY-MM-DD',
  };

  public static getLogger(name: string = 'default', config?: Partial<LoggerConfig>): RecoderLogger {
    if (!this.instances.has(name)) {
      const loggerConfig = { ...this.defaultConfig, ...config };
      const logger = new RecoderLogger(loggerConfig, { component: name });
      this.instances.set(name, logger);
    }
    return this.instances.get(name)!;
  }

  public static setDefaultConfig(config: Partial<LoggerConfig>): void {
    this.defaultConfig = { ...this.defaultConfig, ...config };
  }

  public static getDefaultConfig(): LoggerConfig {
    return { ...this.defaultConfig };
  }

  public static clearInstances(): void {
    this.instances.clear();
  }

  public static async closeAll(): Promise<void> {
    const promises = Array.from(this.instances.values()).map(logger => logger.close());
    await Promise.all(promises);
    this.clearInstances();
  }
}

// Default logger instance
export const logger = LoggerFactory.getLogger('recoder');

// Convenience functions
export const log = {
  error: (message: string | Error, meta?: Record<string, any>) => logger.error(message as any, meta),
  warn: (message: string, meta?: Record<string, any>) => logger.warn(message, meta),
  info: (message: string, meta?: Record<string, any>) => logger.info(message, meta),
  debug: (message: string, meta?: Record<string, any>) => logger.debug(message, meta),
  verbose: (message: string, meta?: Record<string, any>) => logger.verbose(message, meta),
};

// Export types
export type { LogEntry, LoggerConfig, LogOutput, LoggerContext };