/**
 * Mutation Tracking - Debug state changes easily
 * Logs all mutations with IDs for debugging
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('MutationTracking');

let mutationId = 0;
const DEBUG = process.env.NODE_ENV === 'development';

export function trackMutation<T>(
  name: string,
  fn: () => T | Promise<T>
): T | Promise<T> {
  if (!DEBUG) return fn();

  const id = ++mutationId;
  logger.info(`>> mutation #${id} ${name}`);
  
  const result = fn();
  
  if (result instanceof Promise) {
    return result.then((value) => {
      logger.info(`<< mutation #${id} ${name}`);
      return value;
    }).catch((error) => {
      logger.info(`<< mutation #${id} ${name} [ERROR]`, error.message);
      throw error;
    });
  }
  
  logger.info(`<< mutation #${id} ${name}`);
  return result;
}

export function logMutation(name: string, data?: any): void {
  if (!DEBUG) return;
  const id = ++mutationId;
  logger.info(`>> mutation #${id} ${name}`, data ?? '');
}
