/**
 * The Recoder-native surface (`recoder_code`). It is the first-party default and delegates
 * to either the `pi` driver (default) or the in-process ToolLoopAgent driver per config —
 * it owns no run logic of its own, it routes (docs §3.5).
 *
 * Delegation keeps a single canonical `recoder_code` driver id (`recoder-code`) while reusing
 * the fully-fused pi / in-process drivers underneath. The chosen delegate's `descriptor`
 * capabilities are surfaced, but the recoder-code descriptor id/label are preserved so the
 * registry resolves this as the first-party surface driver.
 */
import type { RuntimeDriver, DriverProbe, ApprovalDecision } from '../../contracts/runtime-driver';
import type { DriverContext, DriverProbeContext } from '../../contracts/driver-context';
import type { DriverFrame } from '../../contracts/driver-frame';
import type { DriverDescriptor } from '../../registry/driver-descriptor';
import { RECODER_CODE_DESCRIPTOR } from './recoder-code-descriptor';

export type RecoderCodeDelegate = 'pi' | 'in_process';

export type RecoderCodeDriverOptions = {
  /** Which fused driver to delegate to. Defaults to `pi`. */
  delegate?: RecoderCodeDelegate;
  /** The concrete pi driver instance (already constructed by the host/builtin wiring). */
  piDriver?: RuntimeDriver;
  /** The concrete in-process driver instance. */
  inProcessDriver?: RuntimeDriver;
};

export class RecoderCodeDriver implements RuntimeDriver {
  readonly descriptor: DriverDescriptor = RECODER_CODE_DESCRIPTOR;

  readonly #options: RecoderCodeDriverOptions;

  constructor(options: RecoderCodeDriverOptions = {}) {
    this.#options = options;
  }

  async probe(ctx: DriverProbeContext): Promise<DriverProbe> {
    return this.#delegate().probe(ctx);
  }

  run(ctx: DriverContext): AsyncIterable<DriverFrame> {
    return this.#delegate().run(ctx);
  }

  async cancel(runId: string): Promise<void> {
    await this.#delegate().cancel?.(runId);
  }

  async approve(approvalId: string, decision: ApprovalDecision): Promise<void> {
    await this.#delegate().approve?.(approvalId, decision);
  }

  #delegate(): RuntimeDriver {
    const choice = this.#options.delegate ?? 'pi';
    if (choice === 'in_process') {
      const driver = this.#options.inProcessDriver ?? this.#options.piDriver;
      if (!driver) {
        throw new Error('recoder-code: no in-process delegate driver was provided.');
      }
      return driver;
    }
    const driver = this.#options.piDriver ?? this.#options.inProcessDriver;
    if (!driver) {
      throw new Error('recoder-code: no pi delegate driver was provided.');
    }
    return driver;
  }
}

export function createRecoderCodeDriver(
  options: RecoderCodeDriverOptions = {},
): RuntimeDriver {
  return new RecoderCodeDriver(options);
}
