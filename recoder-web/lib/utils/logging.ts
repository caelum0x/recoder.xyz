/**
 * Client-safe logging utility for recoder-web
 * Falls back to console logging when winston is not available (client-side)
 */

interface Logger {
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
}

class ClientSafeLogger implements Logger {
  private isServer = typeof window === 'undefined';

  info(message: string, ...args: any[]): void {
    if (this.isServer) {
      // On server side, try to use winston logger from shared package
      try {
        const { Logger } = require('@recoder/shared');
        const logger = new Logger('recoder-web');
        logger.info(message, ...args);
      } catch {
        console.log(`[INFO] ${message}`, ...args);
      }
    } else {
      console.log(`[INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.isServer) {
      try {
        const { Logger } = require('@recoder/shared');
        const logger = new Logger('recoder-web');
        logger.warn(message, ...args);
      } catch {
        console.warn(`[WARN] ${message}`, ...args);
      }
    } else {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.isServer) {
      try {
        const { Logger } = require('@recoder/shared');
        const logger = new Logger('recoder-web');
        logger.error(message, ...args);
      } catch {
        console.error(`[ERROR] ${message}`, ...args);
      }
    } else {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.isServer) {
      try {
        const { Logger } = require('@recoder/shared');
        const logger = new Logger('recoder-web');
        logger.debug(message, ...args);
      } catch {
        console.debug(`[DEBUG] ${message}`, ...args);
      }
    } else {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  }
}

export const logger = new ClientSafeLogger();