/**
 * Simple logger utility for CLI
 */

export class Logger {
  static info(message: string): void {
    console.log(`[INFO] ${message}`);
  }

  static error(message: string): void {
    console.error(`[ERROR] ${message}`);
  }

  static debug(message: string): void {
    if (process.env.LOG_LEVEL === 'debug' || process.env.DEBUG) {
      console.log(`[DEBUG] ${message}`);
    }
  }

  static warn(message: string): void {
    console.warn(`[WARN] ${message}`);
  }
}