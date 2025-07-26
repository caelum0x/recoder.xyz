/**
 * Simple logger utility for CLI
 */

export class Logger {
  static info(message: string): void {
    console.log(`[INFO] ${message}`);
  }

  static error(message: string, context?: any): void {
    if (context) {
      console.error(`[ERROR] ${message}`, context);
    } else {
      console.error(`[ERROR] ${message}`);
    }
  }

  static debug(message: string): void {
    if (process.env.LOG_LEVEL === 'debug' || process.env.DEBUG) {
      console.log(`[DEBUG] ${message}`);
    }
  }

  static warn(message: string, context?: any): void {
    if (context) {
      console.warn(`[WARN] ${message}`, context);
    } else {
      console.warn(`[WARN] ${message}`);
    }
  }
}