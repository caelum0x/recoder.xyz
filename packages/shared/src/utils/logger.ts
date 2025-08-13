/**
 * Shared logger utility for all packages
 */

export interface LogLevel {
  DEBUG: number;
  INFO: number;
  WARN: number;
  ERROR: number;
}

export const LOG_LEVELS: LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

export class Logger {
  private static currentLevel: number = LOG_LEVELS.INFO;

  static setLevel(level: number): void {
    this.currentLevel = level;
  }

  static debug(message: string, meta?: any): void {
    if (this.currentLevel <= LOG_LEVELS.DEBUG) {
      console.log(`[DEBUG] ${message}`, meta || '');
    }
  }

  static info(message: string, meta?: any): void {
    if (this.currentLevel <= LOG_LEVELS.INFO) {
      console.log(`[INFO] ${message}`, meta || '');
    }
  }

  static warn(message: string, meta?: any): void {
    if (this.currentLevel <= LOG_LEVELS.WARN) {
      console.warn(`[WARN] ${message}`, meta || '');
    }
  }

  static error(message: string, meta?: any): void {
    if (this.currentLevel <= LOG_LEVELS.ERROR) {
      console.error(`[ERROR] ${message}`, meta || '');
    }
  }

  static log(level: keyof LogLevel, message: string, meta?: any): void {
    switch (level) {
      case 'DEBUG':
        this.debug(message, meta);
        break;
      case 'INFO':
        this.info(message, meta);
        break;
      case 'WARN':
        this.warn(message, meta);
        break;
      case 'ERROR':
        this.error(message, meta);
        break;
      default:
        this.info(message, meta);
    }
  }
}