/**
 * `PolicyUpdateEmitter` — the agent-os `policy.updated` fan-out (§4c).
 *
 * A control-plane space policy carries the forbidden/secret-path globs and the
 * approval-required rules that the governance kernel enforces. When one of those
 * artifacts changes (a `PUT /spaces/:id/policy` or a `POST /spaces` that upserts
 * the policy), agent-os emits a `policy.updated` signal. The bootstrap hook
 * consumes it to hot-swap the kernel's live policy bundle
 * (`governance.reloadPolicies`) so an edited forbidden-path/approval policy takes
 * effect for subsequent `decide()`/`enforceTool` without a restart.
 *
 * Listeners run FIRE-AND-FORGET so a slow/faulted hook (e.g. a kernel reload)
 * never blocks or fails the policy write that triggered it; a listener throw is
 * logged and swallowed, never propagated back into the request path.
 */
import type { Logger } from '../../../shared/logger.js';

/** A `policy.updated` signal (secret-free — carries only policy globs + provenance). */
export interface PolicyUpdatedEvent {
  /** Provenance of the change, e.g. `space:<id>` — never a secret. */
  readonly source: string;
  /**
   * The serialized policy the kernel should reload — a `GovernanceKernelConfig`
   * shape (`{ forbiddenPathGlobs }`). The napi rung swaps its live bundle from
   * this; static rungs (daemon/ts) report `reloaded:false` truthfully.
   */
  readonly configJson: string;
}

export type PolicyUpdatedListener = (event: PolicyUpdatedEvent) => void | Promise<void>;

/**
 * Project a control-plane space policy into the kernel-config JSON the governance
 * reload verb consumes. Only the fields the kernel enforces are carried: the
 * forbidden/secret-path globs (`approvalRequiredFor` gates human approval on the
 * gate side and has no kernel-config field — it still TRIGGERS a reload so the
 * kernel re-reads its bundle, but it is not serialized into a field it lacks).
 */
export function spacePolicyToKernelConfigJson(policy: {
  readonly forbiddenPaths: readonly string[];
}): string {
  return JSON.stringify({ forbiddenPathGlobs: [...policy.forbiddenPaths] });
}

export class PolicyUpdateEmitter {
  private readonly listeners: PolicyUpdatedListener[] = [];

  constructor(private readonly log: Logger) {}

  /** Register a `policy.updated` listener (bootstrap wires the reload hook here). */
  on(listener: PolicyUpdatedListener): void {
    this.listeners.push(listener);
  }

  /** Fan the event out to every listener, fire-and-forget + error-isolated. */
  emit(event: PolicyUpdatedEvent): void {
    for (const listener of this.listeners) {
      void Promise.resolve()
        .then(() => listener(event))
        .catch((err: unknown) => {
          this.log.warn(
            { err: err instanceof Error ? err.message : String(err), source: event.source },
            'policy.updated listener failed',
          );
        });
    }
  }
}
