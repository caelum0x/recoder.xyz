/**
 * SubstrateAvailability — the truthful answer to "can this substrate run work?".
 *
 * The shape returned by ConductorSubstrate.available(): promoted from the inline
 * `{ available: boolean; reason?: string }` return in
 * docker-backend/src/conductor/substrate.ts, with an optional structured
 * `detail` for richer (still truthful) diagnostics.
 *
 * Invariant (design §8): missing git/tmux/gh/Daytona creds returns
 * `{ available: false, reason }` — the system degrades, it never fakes.
 */
export interface SubstrateAvailability {
  available: boolean;
  /** Human-readable reason the substrate is unavailable (when available=false). */
  reason?: string;
  /** Optional structured diagnostics (e.g. which binary/cred is missing). */
  detail?: Record<string, unknown>;
}
