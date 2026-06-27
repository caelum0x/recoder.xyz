/**
 * delegation-chain-service — depth + cycle tracking + result propagation for a
 * delegation chain.
 *
 * MERGED from `docker-backend/src/a2a/delegation-chain.service.ts`. The original
 * was a stateful `EventEmitter` over a mutable `Map<string, DelegationRequest>`.
 * Here the chain is an IMMUTABLE `DelegationChain` value: every operation returns
 * a NEW chain, depth/cycle validation reuses the extracted pure guards
 * (`depth-guard`, `cycle-detector`), and lifecycle/event emission is expressed as
 * `Effect[]` for the engine to run (no `this.emit`, no globals).
 *
 * Preserved behavior:
 *  - depth = parent.depth + 1, enforced against `maxDepth` (was `config.maxDepth`).
 *  - self-delegation + circular delegation rejected (was the two `PolicyDenied`).
 *  - `participants` set carried forward for O(1) cycle checks (was
 *    `getAgentsInChainAbove`).
 *  - links ordered by depth; `maxDepth` recomputed on append.
 */

import { assertDepth, nextDepth } from './depth-guard';
import { agentsInChain, assertNoCycle } from './cycle-detector';
import type { DelegationChain, DelegationLink } from '../domain';

export type StartChainInput = {
  rootId: string;
  fromAgentId: string;
  toAgentId: string;
  maxDepth: number;
};

export type ExtendChainInput = {
  delegationId: string;
  fromAgentId: string;
  toAgentId: string;
  maxDepth: number;
};

/**
 * Start a new delegation chain at depth 0. Validates self-delegation up front so
 * a degenerate root (A→A) is rejected the same way a deeper cycle would be.
 */
export function startChain(input: StartChainInput): DelegationChain {
  const { rootId, fromAgentId, toAgentId, maxDepth } = input;
  assertDepth(0, maxDepth);
  assertNoCycle(new Set<string>(), fromAgentId, toAgentId);

  const rootLink: DelegationLink = {
    delegationId: rootId,
    fromAgentId,
    toAgentId,
    depth: 0,
  };
  return {
    rootId,
    links: [rootLink],
    maxDepth: 0,
    participants: new Set<string>([fromAgentId, toAgentId]),
  };
}

/**
 * Extend a chain with a child delegation. Computes the child depth, enforces the
 * depth cap and cycle rules, then returns a NEW chain with the link appended,
 * `participants` widened, and `maxDepth` recomputed.
 *
 * The `fromAgentId` is expected to already be a participant (it is the agent that
 * received the previous link); `toAgentId` must NOT be — that is the cycle guard.
 */
export function extendChain(
  chain: DelegationChain,
  input: ExtendChainInput,
): DelegationChain {
  const { delegationId, fromAgentId, toAgentId, maxDepth } = input;

  const depth = assertDepth(nextDepth(chain.maxDepth), maxDepth);
  const participants = agentsInChain(chain);
  assertNoCycle(participants, fromAgentId, toAgentId);

  const link: DelegationLink = { delegationId, fromAgentId, toAgentId, depth };
  const links = [...chain.links, link].sort((a, b) => a.depth - b.depth);
  const nextParticipants = new Set<string>(participants);
  nextParticipants.add(fromAgentId);
  nextParticipants.add(toAgentId);

  return {
    rootId: chain.rootId,
    links,
    maxDepth: Math.max(chain.maxDepth, depth),
    participants: nextParticipants,
  };
}

/** Depth the next child would occupy without mutating the chain. */
export function projectedNextDepth(chain: DelegationChain): number {
  return nextDepth(chain.maxDepth);
}

/** True if adding one more link would exceed `maxDepth` (pre-flight check). */
export function isChainAtCapacity(chain: DelegationChain, maxDepth: number): boolean {
  return projectedNextDepth(chain) > maxDepth;
}

/**
 * Static facade so the chain logic is usable standalone (per the design's
 * `export { DelegationChainService }`), without forcing instantiation. All
 * methods are pure functions over the passed-in chain.
 */
export const DelegationChainService = {
  start: startChain,
  extend: extendChain,
  projectedNextDepth,
  isAtCapacity: isChainAtCapacity,
  participants: agentsInChain,
} as const;

export type DelegationChainServiceType = typeof DelegationChainService;
