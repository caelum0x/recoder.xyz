/**
 * `toLoggerPort` — bridge the spine's pino `Logger` (`info(obj, msg)`) to the
 * `@recoder/substrate` `LoggerPort` (`info(msg, ctx)`) the `WorkspaceEngine`,
 * run-tailer, and substrates code to.
 *
 * The two logging shapes are transposed (pino puts the bindings first, the port
 * puts them last); this thin adapter re-orders them so the substrate package
 * logs through the SAME child logger the rest of the domain uses. No new sink,
 * no swallowed context — the structured `ctx` is forwarded verbatim.
 */
import type { Logger } from '../../../shared/logger.js';
import type { LoggerPort } from '@recoder/substrate';

/** Wrap a spine `Logger` as the substrate `LoggerPort` (arg order transposed). */
export function toLoggerPort(log: Logger): LoggerPort {
  return {
    info: (message, context) => log.info(context ?? {}, message),
    warn: (message, context) => log.warn(context ?? {}, message),
    error: (message, context) => log.error(context ?? {}, message),
    debug: (message, context) => log.debug(context ?? {}, message),
  };
}
