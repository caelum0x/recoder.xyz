import type { RuntimePolicy } from '@recoder/agent-runtimes';

/**
 * Enforces `policy.allowNetwork` by reporting whether network access is permitted and
 * which CLI flag toggles it. Enforcement-only: the decision lives in the policy.
 */
export type NetworkFlagSpec = {
  allowed: boolean;
  /** CLI flag to apply when network must be disabled (driver-specific). */
  disableFlag?: string;
  enableFlag?: string;
};

export function resolveNetworkAccess(
  policy: Pick<RuntimePolicy, 'allowNetwork'>,
  flags: { disableFlag?: string; enableFlag?: string } = {},
): NetworkFlagSpec {
  return {
    allowed: policy.allowNetwork,
    disableFlag: flags.disableFlag,
    enableFlag: flags.enableFlag,
  };
}
