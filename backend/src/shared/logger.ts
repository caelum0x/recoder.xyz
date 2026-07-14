/**
 * Structured logger for the spine — a thin re-export of the existing pino
 * factory in `backend/src/logger.ts`.
 *
 * The original module stays in place (many v1 files still import `./logger.js`);
 * the spine consumes it through this shared surface so all new code imports from
 * `shared/logger.js` and never reads `pino` directly.
 */
import type { Logger } from 'pino';
import { createLogger, rootLogger, logger } from '../logger.js';

export { createLogger, rootLogger, logger };
export type { Logger };

/** Child logger bound to a domain, e.g. `childLogger('edge')`. */
export function childLogger(domain: string, bindings?: Record<string, unknown>): Logger {
  return rootLogger.child({ domain, ...(bindings ?? {}) });
}
