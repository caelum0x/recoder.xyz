/**
 * Simple logger utility for the Recoder CLI Router
 * Provides consistent logging across all services and providers
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export class Logger {
  private static level: LogLevel = LogLevel.INFO;
  private static prefix = '[Recoder Router]';

  static setLevel(level: LogLevel): void {
    this.level = level;
  }

  static debug(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.debug(`${this.prefix} 🐛`, message, ...args);
    }
  }

  static info(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.INFO) {
      console.log(`${this.prefix} ℹ️`, message, ...args);
    }
  }

  static warn(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(`${this.prefix} ⚠️`, message, ...args);
    }
  }

  static error(message: string, error?: any): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(`${this.prefix} ❌`, message);
      if (error) {
        console.error(error);
      }
    }
  }

  static success(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.INFO) {
      console.log(`${this.prefix} ✅`, message, ...args);
    }
  }

  static progress(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.INFO) {
      console.log(`${this.prefix} 🚀`, message, ...args);
    }
  }

  static quota(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.INFO) {
      console.log(`${this.prefix} 📊`, message, ...args);
    }
  }
}

// Create provider-specific loggers
export class ProviderLogger {
  constructor(private providerName: string) {}

  debug(message: string, ...args: any[]): void {
    Logger.debug(`[${this.providerName}] ${message}`, ...args);
  }

  info(message: string, ...args: any[]): void {
    Logger.info(`[${this.providerName}] ${message}`, ...args);
  }

  warn(message: string, ...args: any[]): void {
    Logger.warn(`[${this.providerName}] ${message}`, ...args);
  }

  error(message: string, error?: any): void {
    Logger.error(`[${this.providerName}] ${message}`, error);
  }

  success(message: string, ...args: any[]): void {
    Logger.success(`[${this.providerName}] ${message}`, ...args);
  }
}