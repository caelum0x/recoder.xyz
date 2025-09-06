/**
 * Logger interface and implementation
 * Replaces recoder-shared Logger dependency
 */

export interface LoggerInterface {
  info(message: string, meta?: any): void;
  error(message: string, error?: Error | any): void;
  warn(message: string, meta?: any): void;
  debug(message: string, meta?: any): void;
}

class SimpleLogger implements LoggerInterface {
  info(message: string, meta?: any): void {
    console.log(`[INFO] ${message}`, meta ? JSON.stringify(meta) : '');
  }

  error(message: string, error?: Error | any): void {
    console.error(`[ERROR] ${message}`, error);
  }

  warn(message: string, meta?: any): void {
    console.warn(`[WARN] ${message}`, meta ? JSON.stringify(meta) : '');
  }

  debug(message: string, meta?: any): void {
    console.debug(`[DEBUG] ${message}`, meta ? JSON.stringify(meta) : '');
  }
}

export const Logger = new SimpleLogger();
export const logger = Logger; // for backwards compatibility
