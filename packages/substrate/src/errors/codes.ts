/**
 * SubstrateErrorCode — stable, narrow-able codes (design §8).
 *
 * Routes map a code → HTTP status, replacing today's brittle
 * `msg.includes('not found')` logic in the conductor routes.
 */
export const SubstrateErrorCode = {
  /** A binary or credential needed by the substrate is missing. */
  UNAVAILABLE: 'SUBSTRATE_UNAVAILABLE',
  /** No substrate registered for the requested id. */
  NOT_REGISTERED: 'SUBSTRATE_NOT_REGISTERED',
  /** A referenced workspace/handle/session/sandbox was not found. */
  NOT_FOUND: 'SUBSTRATE_NOT_FOUND',
  /** Provisioning isolation (worktree add / sandbox create) failed. */
  PROVISION_FAILED: 'SUBSTRATE_PROVISION_FAILED',
  /** The agent CLI failed to start. */
  LAUNCH_FAILED: 'SUBSTRATE_LAUNCH_FAILED',
  /** The live session/sandbox vanished out from under a handle. */
  HANDLE_GONE: 'SUBSTRATE_HANDLE_GONE',
  /** Computing the reviewable git diff failed. */
  DIFF_FAILED: 'SUBSTRATE_DIFF_FAILED',
  /** Best-effort teardown/cleanup failed. */
  TEARDOWN_FAILED: 'SUBSTRATE_TEARDOWN_FAILED',
  /** An untrusted/invalid input was rejected at the boundary. */
  INVALID_INPUT: 'SUBSTRATE_INVALID_INPUT',
} as const;

export type SubstrateErrorCode =
  (typeof SubstrateErrorCode)[keyof typeof SubstrateErrorCode];
