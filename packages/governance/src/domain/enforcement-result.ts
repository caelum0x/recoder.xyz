import type { PermissionMode } from './permission-mode';

/**
 * EnforcementResult — TS mirror of the Rust `permission_enforcer.rs`
 * `EnforcementResult`. Either the action is allowed, or it is denied with a
 * structured reason (active vs required mode + a sanitized explanation).
 *
 * This is deliberately a discriminated union so callers cannot read `.reason`
 * off an allow by accident.
 */
export type EnforcementResult =
  | {
      readonly outcome: 'allowed';
      /** True when produced by the pure-TS fallback rather than the daemon. */
      readonly degraded?: boolean;
    }
  | {
      readonly outcome: 'denied';
      readonly tool: string;
      readonly activeMode: PermissionMode;
      readonly requiredMode: PermissionMode;
      readonly reason: string;
      /** True when produced by the pure-TS fallback rather than the daemon. */
      readonly degraded?: boolean;
    };

export function allowed(degraded = false): EnforcementResult {
  return degraded ? { outcome: 'allowed', degraded } : { outcome: 'allowed' };
}

export function denied(input: {
  tool: string;
  activeMode: PermissionMode;
  requiredMode: PermissionMode;
  reason: string;
  degraded?: boolean;
}): EnforcementResult {
  return {
    outcome: 'denied',
    tool: input.tool,
    activeMode: input.activeMode,
    requiredMode: input.requiredMode,
    reason: input.reason,
    degraded: input.degraded ?? false,
  };
}

export function isAllowed(result: EnforcementResult): boolean {
  return result.outcome === 'allowed';
}

export function isDenied(result: EnforcementResult): result is Extract<EnforcementResult, { outcome: 'denied' }> {
  return result.outcome === 'denied';
}
