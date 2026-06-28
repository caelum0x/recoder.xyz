/**
 * LoggerPort — the structured logging seam (design §4.9 / §7).
 *
 * The substrate package never imports `docker-backend`'s logger; the backend
 * injects a concrete pino-backed adapter, tests inject a recording or no-op
 * logger. Interface only: no behavior lives here.
 */
export interface LoggerPort {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  debug?(message: string, context?: Record<string, unknown>): void;
}
