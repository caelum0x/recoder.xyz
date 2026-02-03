/**
 * Centralized logging utility for Recoder
 * Provides structured logging with consistent formatting across all components
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogContext {
  component?: string;
  operation?: string;
  userId?: string;
  projectId?: string;
  sessionId?: string;
  requestId?: string;
  [key: string]: unknown;
}

class Logger {
  private static instance: Logger;
  private minLevel: LogLevel = LogLevel.INFO;
  private isDevelopment: boolean =
    typeof process !== 'undefined' &&
    (process.env['NODE_ENV'] as string) === 'development';

  private constructor() {
    // Set log level based on environment
    if (this.isDevelopment) {
      this.minLevel = LogLevel.DEBUG;
    } else if (typeof process !== 'undefined' && process.env['LOG_LEVEL']) {
      this.minLevel = this.parseLogLevel(process.env['LOG_LEVEL']);
    }
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private parseLogLevel(level: string): LogLevel {
    switch (level.toUpperCase()) {
      case 'DEBUG':
        return LogLevel.DEBUG;
      case 'INFO':
        return LogLevel.INFO;
      case 'WARN':
        return LogLevel.WARN;
      case 'ERROR':
        return LogLevel.ERROR;
      default:
        return LogLevel.INFO;
    }
  }

  private formatMessage(
    level: string,
    message: string,
    context?: LogContext,
    error?: Error
  ): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` | ${JSON.stringify(context)}` : '';
    const errorStr = error
      ? ` | ERROR: ${error.message} | STACK: ${error.stack}`
      : '';

    return `[${timestamp}] [${level}] ${message}${contextStr}${errorStr}`;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.minLevel;
  }

  public setLogLevel(level: LogLevel | string): void {
    if (typeof level === 'string') {
      this.minLevel = this.parseLogLevel(level);
    } else {
      this.minLevel = level;
    }
  }

  public getLogLevel(): LogLevel {
    return this.minLevel;
  }

  public debug(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(this.formatMessage('DEBUG', message, context));
    }
  }

  public info(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.formatMessage('INFO', message, context));
    }
  }

  public warn(message: string, context?: LogContext, error?: Error): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage('WARN', message, context, error));
    }
  }

  public error(message: string, context?: LogContext, error?: Error): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage('ERROR', message, context, error));
    }
  }

  // Convenience methods for specific operations
  public auth(
    level: 'info' | 'warn' | 'error',
    message: string,
    context?: LogContext,
    error?: Error
  ): void {
    const authContext = { ...context, component: 'AUTH' };
    this[level](message, authContext, error);
  }

  public api(
    level: 'info' | 'warn' | 'error',
    message: string,
    context?: LogContext,
    error?: Error
  ): void {
    const apiContext = { ...context, component: 'API' };
    this[level](message, apiContext, error);
  }

  public db(
    level: 'info' | 'warn' | 'error',
    message: string,
    context?: LogContext,
    error?: Error
  ): void {
    const dbContext = { ...context, component: 'DB' };
    this[level](message, dbContext, error);
  }

  public ai(
    level: 'info' | 'warn' | 'error',
    message: string,
    context?: LogContext,
    error?: Error
  ): void {
    const aiContext = { ...context, component: 'AI' };
    this[level](message, aiContext, error);
  }

  public cdn(
    level: 'info' | 'warn' | 'error',
    message: string,
    context?: LogContext,
    error?: Error
  ): void {
    const cdnContext = { ...context, component: 'CDN' };
    this[level](message, cdnContext, error);
  }

  public runtime(
    level: 'info' | 'warn' | 'error',
    message: string,
    context?: LogContext,
    error?: Error
  ): void {
    const runtimeContext = { ...context, component: 'RUNTIME' };
    this[level](message, runtimeContext, error);
  }

  public project(
    level: 'info' | 'warn' | 'error',
    message: string,
    context?: LogContext,
    error?: Error
  ): void {
    const projectContext = { ...context, component: 'PROJECT' };
    this[level](message, projectContext, error);
  }

  public github(
    level: 'info' | 'warn' | 'error',
    message: string,
    context?: LogContext,
    error?: Error
  ): void {
    const githubContext = { ...context, component: 'GITHUB' };
    this[level](message, githubContext, error);
  }

  public file(
    level: 'info' | 'warn' | 'error',
    message: string,
    context?: LogContext,
    error?: Error
  ): void {
    const fileContext = { ...context, component: 'FILE' };
    this[level](message, fileContext, error);
  }

  public websocket(
    level: 'info' | 'warn' | 'error',
    message: string,
    context?: LogContext,
    error?: Error
  ): void {
    const wsContext = { ...context, component: 'WEBSOCKET' };
    this[level](message, wsContext, error);
  }

  public chat(
    level: 'info' | 'warn' | 'error',
    message: string,
    context?: LogContext,
    error?: Error
  ): void {
    const chatContext = { ...context, component: 'CHAT' };
    this[level](message, chatContext, error);
  }
}

// Export singleton instance
export const logger = Logger.getInstance();

// Export convenience functions
export const log = {
  debug: (message: string, context?: LogContext) => logger.debug(message, context),
  info: (message: string, context?: LogContext) => logger.info(message, context),
  warn: (message: string, context?: LogContext, error?: Error) =>
    logger.warn(message, context, error),
  error: (message: string, context?: LogContext, error?: Error) =>
    logger.error(message, context, error),

  // Component-specific loggers
  auth: (
    level: 'info' | 'warn' | 'error',
    message: string,
    context?: LogContext,
    error?: Error
  ) => logger.auth(level, message, context, error),
  api: (
    level: 'info' | 'warn' | 'error',
    message: string,
    context?: LogContext,
    error?: Error
  ) => logger.api(level, message, context, error),
  db: (
    level: 'info' | 'warn' | 'error',
    message: string,
    context?: LogContext,
    error?: Error
  ) => logger.db(level, message, context, error),
  ai: (
    level: 'info' | 'warn' | 'error',
    message: string,
    context?: LogContext,
    error?: Error
  ) => logger.ai(level, message, context, error),
  cdn: (
    level: 'info' | 'warn' | 'error',
    message: string,
    context?: LogContext,
    error?: Error
  ) => logger.cdn(level, message, context, error),
  runtime: (
    level: 'info' | 'warn' | 'error',
    message: string,
    context?: LogContext,
    error?: Error
  ) => logger.runtime(level, message, context, error),
  project: (
    level: 'info' | 'warn' | 'error',
    message: string,
    context?: LogContext,
    error?: Error
  ) => logger.project(level, message, context, error),
  github: (
    level: 'info' | 'warn' | 'error',
    message: string,
    context?: LogContext,
    error?: Error
  ) => logger.github(level, message, context, error),
  file: (
    level: 'info' | 'warn' | 'error',
    message: string,
    context?: LogContext,
    error?: Error
  ) => logger.file(level, message, context, error),
  websocket: (
    level: 'info' | 'warn' | 'error',
    message: string,
    context?: LogContext,
    error?: Error
  ) => logger.websocket(level, message, context, error),
  chat: (
    level: 'info' | 'warn' | 'error',
    message: string,
    context?: LogContext,
    error?: Error
  ) => logger.chat(level, message, context, error),
};
