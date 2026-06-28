/**
 * AuditEntry + AuditAction — TS mirror of the Rust `audit.rs` audit record. Each
 * entry is one link in the SHA-256 Merkle hash chain. The hashed fields and
 * their order MUST match the verifier exactly:
 *
 *   seq | timestamp | actor | action | detail | outcome | prevHash
 *
 * Any reordering or field change is a chain-breaking change and must be matched
 * on the Rust side.
 */

export type AuditAction =
  | 'policy.evaluated'
  | 'decision.made'
  | 'enforcement.checked'
  | 'tool.invoked'
  | 'approval.requested'
  | 'approval.resolved'
  | 'route.selected'
  | 'auth.attempt'
  | 'config.reloaded'
  | 'work_signal.observed'
  | 'custom';

export const AUDIT_ACTIONS: readonly AuditAction[] = [
  'policy.evaluated',
  'decision.made',
  'enforcement.checked',
  'tool.invoked',
  'approval.requested',
  'approval.resolved',
  'route.selected',
  'auth.attempt',
  'config.reloaded',
  'work_signal.observed',
  'custom',
] as const;

export type AuditOutcome = 'allow' | 'deny' | 'needs_approval' | 'success' | 'failure' | 'info';

/**
 * AuditInput — what a caller supplies to record an entry. The chain assigns
 * `seq`, `prevHash`, and `hash`; the caller never sets those.
 */
export type AuditInput = {
  readonly timestamp: string;
  readonly actor: string;
  readonly action: AuditAction;
  /** Sanitized human/machine detail. MUST NOT contain secret-shaped material. */
  readonly detail: string;
  readonly outcome: AuditOutcome;
  readonly runId?: string;
  readonly metadata?: Record<string, unknown>;
};

/**
 * AuditEntry — a sealed, hash-chained record. Immutable once appended.
 */
export type AuditEntry = AuditInput & {
  readonly seq: number;
  /** Hash of the previous entry; the genesis sentinel for seq 0. */
  readonly prevHash: string;
  /** SHA-256 over the canonical field tuple including prevHash. */
  readonly hash: string;
};

export function isAuditAction(value: unknown): value is AuditAction {
  return typeof value === 'string' && (AUDIT_ACTIONS as readonly string[]).includes(value);
}
