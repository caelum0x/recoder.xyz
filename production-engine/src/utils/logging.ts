/**
 * Logging utilities for production engine
 */

export function log(message: string, ...args: any[]): void {
  console.log(`[${new Date().toISOString()}] ${message}`, ...args);
}

export function logError(message: string, error?: any): void {
  console.error(`[${new Date().toISOString()}] ERROR: ${message}`, error);
}

export function logWarn(message: string, ...args: any[]): void {
  console.warn(`[${new Date().toISOString()}] WARN: ${message}`, ...args);
}

export function logInfo(message: string, ...args: any[]): void {
  console.info(`[${new Date().toISOString()}] INFO: ${message}`, ...args);
}