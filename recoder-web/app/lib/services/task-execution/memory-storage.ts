/**
 * Memory Storage Implementation
 * An in-memory storage implementation for development and testing
 */

import type { TaskStorage, TaskLogger, TaskExecutionContext } from './types';

/**
 * Create an in-memory storage implementation
 */
export function createMemoryStorage(): TaskStorage {
  const store = new Map<string, string>();

  return {
    async getJson<T>(args: { path: string }): Promise<T> {
      const data = store.get(args.path);
      if (!data) {
        throw new Error(`Not found: ${args.path}`);
      }
      return JSON.parse(data) as T;
    },

    async setJson<T>(args: { path: string; data: T }): Promise<void> {
      store.set(args.path, JSON.stringify(args.data));
    },

    async deleteJson(args: { path: string }): Promise<void> {
      store.delete(args.path);
    },

    async exists(args: { path: string }): Promise<boolean> {
      return store.has(args.path);
    },
  };
}

/**
 * Create a console logger implementation
 */
export function createConsoleLogger(prefix = '[TaskExecution]'): TaskLogger {
  return {
    debug(message: string, data?: Record<string, unknown>) {
      if (process.env.NODE_ENV === 'development') {
        console.debug(`${prefix} DEBUG:`, message, data || '');
      }
    },
    info(message: string, data?: Record<string, unknown>) {
      console.info(`${prefix} INFO:`, message, data || '');
    },
    warn(message: string, data?: Record<string, unknown>) {
      console.warn(`${prefix} WARN:`, message, data || '');
    },
    error(message: string, data?: Record<string, unknown>) {
      console.error(`${prefix} ERROR:`, message, data || '');
    },
  };
}

/**
 * Create a no-op logger that silently ignores all log messages
 */
export function createNoopLogger(): TaskLogger {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

/**
 * Create a task execution context with memory storage
 * Useful for development and testing
 */
export function createMemoryContext(): TaskExecutionContext {
  const pendingPromises: Promise<void>[] = [];

  return {
    storage: createMemoryStorage(),
    logger: createConsoleLogger(),
    waitUntil(fn: () => Promise<void>) {
      const promise = fn().catch((error) => {
        console.error('Background task error:', error);
      });
      pendingPromises.push(promise);
    },
  };
}

/**
 * Create a task execution context with custom storage
 */
export function createTaskContext(options: {
  storage: TaskStorage;
  logger?: TaskLogger;
}): TaskExecutionContext {
  return {
    storage: options.storage,
    logger: options.logger || createConsoleLogger(),
    waitUntil(fn: () => Promise<void>) {
      fn().catch((error) => {
        console.error('Background task error:', error);
      });
    },
  };
}
