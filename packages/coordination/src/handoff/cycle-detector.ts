/**
 * cycle-detector — pure detection of A→B→A delegation cycles.
 *
 * MERGED from the circular-detection path of
 * `docker-backend/src/a2a/delegation-chain.service.ts`
 * (`getAgentsInChainAbove` + the `agentsInChain.has(toAgentId)` check, plus the
 * self-delegation guard). Extracted as pure functions over an explicit
 * participant set so there is no in-memory `Map` traversal and no IO.
 */

import { HandoffCycleError } from '../errors';
import type { DelegationChain } from '../domain';

/**
 * Collect the agent ids already present in a chain. Mirrors
 * `getAgentsInChainAbove`: both endpoints of every link participate, plus the
 * chain's recorded `participants` set (which the chain carries forward).
 */
export function agentsInChain(chain: DelegationChain): ReadonlySet<string> {
  const agents = new Set<string>(chain.participants);
  for (const link of chain.links) {
    agents.add(link.fromAgentId);
    agents.add(link.toAgentId);
  }
  return agents;
}

/**
 * True if delegating to `toAgentId` would close a cycle — i.e. the target is
 * already a participant in the chain. (Self-delegation, `from === to`, is a
 * degenerate cycle and is reported separately by `assertNoCycle`.)
 */
export function wouldCreateCycle(
  participants: ReadonlySet<string>,
  toAgentId: string,
): boolean {
  return participants.has(toAgentId);
}

/**
 * Throw `HandoffCycleError` if delegating `from → to` within `participants`
 * would create a cycle (target already in chain) or is a self-delegation.
 * Mirrors the source's two `PolicyDenied` branches (self + circular).
 */
export function assertNoCycle(
  participants: ReadonlySet<string>,
  fromAgentId: string,
  toAgentId: string,
): void {
  if (fromAgentId === toAgentId) {
    throw new HandoffCycleError(toAgentId, [...participants, fromAgentId]);
  }
  if (wouldCreateCycle(participants, toAgentId)) {
    throw new HandoffCycleError(toAgentId, [...participants]);
  }
}
