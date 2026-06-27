import type { DriverFrame } from '../contracts/driver-frame';
import type { SecretRedactor } from '../policy/secret-redactor';
import type { RuntimeLogger } from './runtime-logger';

/**
 * Opt-in raw-frame debug tap. Dumps each `DriverFrame` to the logger for debugging ONLY when
 * explicitly enabled, and ALWAYS after secret redaction — never before. Disabled by default
 * so production runs never leak frame bodies.
 */
export type FrameDebugTapOptions = {
  enabled: boolean;
  logger: RuntimeLogger;
  redactor?: SecretRedactor;
};

export class FrameDebugTap {
  readonly #enabled: boolean;
  readonly #logger: RuntimeLogger;
  readonly #redactor?: SecretRedactor;

  constructor(options: FrameDebugTapOptions) {
    this.#enabled = options.enabled;
    this.#logger = options.logger;
    this.#redactor = options.redactor;
  }

  tap(frame: DriverFrame): void {
    if (!this.#enabled) return;
    const safe = this.#redactor
      ? (this.#redactor.redactValue(frame) as Record<string, unknown>)
      : (frame as unknown as Record<string, unknown>);
    this.#logger.debug('driver_frame', { frame: safe });
  }
}

export function createFrameDebugTap(options: FrameDebugTapOptions): FrameDebugTap {
  return new FrameDebugTap(options);
}
