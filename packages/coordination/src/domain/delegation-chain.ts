/**
 * DelegationChain — the root + ordered links + depth + cycle-set of a handoff
 * chain. MERGED from `docker-backend/src/a2a/delegation-chain.service.ts`
 * (`DelegationChain`, depth tracking, circular detection). Kept as a pure value;
 * the depth/cycle guards live in `handoff/{depth-guard,cycle-detector}`.
 */

export type DelegationLink = {
  delegationId: string;
  fromAgentId: string;
  toAgentId: string;
  depth: number;
};

export type DelegationChain = {
  /** Root handoff/delegation id of the chain. */
  rootId: string;
  /** Links ordered by depth. */
  links: DelegationLink[];
  /** Maximum depth reached. */
  maxDepth: number;
  /** Set of agent ids already in the chain — used for cycle detection. */
  participants: ReadonlySet<string>;
};
