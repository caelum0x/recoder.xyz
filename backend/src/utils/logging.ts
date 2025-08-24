/**
 * Logging utilities for the backend
 */

import { Logger } from 'recoder-shared';

// Export logging functions
export function logInfo(message: string, meta?: any) {
  Logger.info(message, meta);
}

export function logError(message: string, error?: Error | any) {
  Logger.error(message, error);
}

export function logWarn(message: string, meta?: any) {
  Logger.warn(message, meta);
}

export function logDebug(message: string, meta?: any) {
  Logger.info(message, meta); // Use info for debug as well
}

// Re-export Logger for direct use
export { Logger as logger };
export default Logger;
