/**
 * TaskClaim — an idempotent, lease-bounded claim that a single agent holds on a
 * task. The fence token + recovery window make double-dispatch impossible: a
 * retry never produces a second live claim.
 *
 * Fuses multica's claim semantics (claimResponseRecoveryWindow) with agent-os
 * task/run identity.
 */

export type ClaimStatus = 'claimed' | 'recovering' | 'released' | 'lost';

export const CLAIM_STATUSES: readonly ClaimStatus[] = [
  'claimed',
  'recovering',
  'released',
  'lost',
] as const;

export type TaskClaim = {
  claimId: string;
  taskId: string;
  spaceId: string;
  agentId: string;
  runId?: string;
  status: ClaimStatus;
  claimedAt: string;
  /** Lease end; a claim past this with no live run is reclaimable. */
  leaseUntil: string;
  /** Monotonic write-fence token for the claimed work. */
  fenceToken: number;
  /** Idempotency key — the same logical dispatch never produces two claims. */
  idempotencyKey: string;
};
