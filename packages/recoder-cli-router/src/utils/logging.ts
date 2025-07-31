/**
 * Router logging utilities (stub implementation)
 */

export class Logger {
  private prefix: string;

  constructor(prefix: string = 'Router') {
    this.prefix = prefix;
  }

  info(message: string, ...args: any[]): void {
    console.log(`[${this.prefix}] INFO: ${message}`, ...args);
  }

  warn(message: string, ...args: any[]): void {
    console.warn(`[${this.prefix}] WARN: ${message}`, ...args);
  }

  error(message: string, ...args: any[]): void {
    console.error(`[${this.prefix}] ERROR: ${message}`, ...args);
  }

  debug(message: string, ...args: any[]): void {
    console.debug(`[${this.prefix}] DEBUG: ${message}`, ...args);
  }

  trace(message: string, ...args: any[]): void {
    console.trace(`[${this.prefix}] TRACE: ${message}`, ...args);
  }

  // Static methods for compatibility
  static info(message: string, ...args: any[]): void {
    console.log(`[Router] INFO: ${message}`, ...args);
  }

  static warn(message: string, ...args: any[]): void {
    console.warn(`[Router] WARN: ${message}`, ...args);
  }

  static error(message: string, ...args: any[]): void {
    console.error(`[Router] ERROR: ${message}`, ...args);
  }

  static debug(message: string, ...args: any[]): void {
    console.debug(`[Router] DEBUG: ${message}`, ...args);
  }

  static trace(message: string, ...args: any[]): void {
    console.trace(`[Router] TRACE: ${message}`, ...args);
  }
}

// Export a default logger instance
export const logger = new Logger();

// Export the default logger as Logger for compatibility
export default Logger;