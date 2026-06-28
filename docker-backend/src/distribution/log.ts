/**
 * Thin logging wrapper around the docker-backend pino logger that accepts a
 * `(message, meta)` call shape and forwards to pino's `(obj, msg)` form, so the
 * distribution module can log structured metadata without fighting pino's
 * overload typing.
 */
import { createLogger as createPinoLogger } from '../logger.js';

export interface DistLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

export function createLogger(name: string): DistLogger {
  const pino = createPinoLogger(name);
  return {
    info: (message, meta) => (meta ? pino.info(meta, message) : pino.info(message)),
    warn: (message, meta) => (meta ? pino.warn(meta, message) : pino.warn(message)),
    error: (message, meta) => (meta ? pino.error(meta, message) : pino.error(message)),
    debug: (message, meta) => (meta ? pino.debug(meta, message) : pino.debug(message)),
  };
}
