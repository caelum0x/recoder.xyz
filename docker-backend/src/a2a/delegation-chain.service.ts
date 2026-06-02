/**
 * @module delegation-chain.service
 *
 * In-memory delegation chain service for the docker-backend A2A ecosystem.
 *
 * Enables agents to delegate tasks to other agents, forming delegation chains
 * with depth tracking, circular detection, and result propagation.
 *
 * Features:
 * - Agent-to-agent task delegation with priority levels
 * - Configurable max chain depth with enforcement
 * - Circular delegation detection
 * - Self-delegation prevention (configurable)
 * - Result propagation up the delegation chain
 * - Chain-level completion tracking
 * - Event emission for lifecycle transitions
 * - Delegation statistics
 *
 * This is a pure in-memory implementation suitable for single-process
 * deployments.
 */

import { EventEmitter } from 'events';
import { createLogger } from '../logger';
import {
  A2AErrorCodeEnum,
  buildA2AError,
  A2AStructuredError,
} from '@recoder/shared/a2a';

const logger = createLogger('a2a-delegation-chain');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DelegationStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface DelegationRequest {
  /** Unique delegation ID */
  delegationId: string;
  /** Agent requesting the delegation */
  fromAgentId: string;
  /** Agent being delegated to */
  toAgentId: string;
  /** Task prompt/description */
  prompt: string;
  /** Priority */
  priority: 'critical' | 'high' | 'normal' | 'low';
  /** Parent delegation ID (if this is a sub-delegation) */
  parentDelegationId?: string;
  /** Current depth in the delegation chain */
  depth: number;
  /** Status */
  status: DelegationStatus;
  /** Result from the delegated agent */
  result?: string;
  /** Error message if failed */
  error?: string;
  /** When the delegation was created */
  createdAt: string;
  /** When the delegation was accepted */
  acceptedAt?: string;
  /** When the delegation was completed */
  completedAt?: string;
  /** Total duration in ms */
  durationMs?: number;
  /** Metadata */
  metadata?: Record<string, string>;
}

export interface DelegateInput {
  fromAgentId: string;
  toAgentId: string;
  prompt: string;
  priority?: 'critical' | 'high' | 'normal' | 'low';
  parentDelegationId?: string;
  metadata?: Record<string, string>;
}

export interface DelegationListFilter {
  fromAgentId?: string;
  toAgentId?: string;
  statuses?: DelegationStatus[];
}

export interface DelegationChain {
  /** Root delegation ID */
  rootDelegationId: string;
  /** All delegations in the chain, ordered by depth */
  delegations: DelegationRequest[];
  /** Maximum depth reached */
  maxDepth: number;
  /** Overall chain status */
  status: 'in-progress' | 'completed' | 'failed';
  /** Total chain duration */
  totalDurationMs?: number;
}

export interface DelegationStats {
  totalDelegations: number;
  totalCompleted: number;
  totalFailed: number;
  totalRejected: number;
  avgDepth: number;
  maxDepthReached: number;
  byAgent: Record<string, { delegated: number; received: number; completed: number }>;
}

export interface DelegationConfig {
  /** Maximum delegation chain depth (default 5) */
  maxDepth: number;
  /** Default timeout per delegation in ms (default 60000) */
  defaultTimeoutMs: number;
  /** Whether to allow self-delegation (default false) */
  allowSelfDelegation: boolean;
  /** Whether to allow circular delegation chains (default false) */
  allowCircular: boolean;
}

export type DelegationEventName =
  | 'delegation:created'
  | 'delegation:accepted'
  | 'delegation:rejected'
  | 'delegation:completed'
  | 'delegation:failed'
  | 'delegation:chain-completed'
  | 'delegation:depth-exceeded';

// ---------------------------------------------------------------------------
// Config defaults
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: DelegationConfig = {
  maxDepth: 5,
  defaultTimeoutMs: 60_000,
  allowSelfDelegation: false,
  allowCircular: false,
};

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let _idCounter = 0;

function generateDelegationId(): string {
  const ts = Date.now().toString(36);
  const counter = (_idCounter++).toString(36).padStart(4, '0');
  return `dlg_${ts}_${counter}`;
}

/** Reset the ID counter (visible for testing). */
export function resetDelegationIdCounter(): void {
  _idCounter = 0;
}

// ---------------------------------------------------------------------------
// DelegationChainService
// ---------------------------------------------------------------------------

export class DelegationChainService extends EventEmitter {
  /** All delegations indexed by delegationId. */
  private readonly delegations = new Map<string, DelegationRequest>();

  /** Resolved config. */
  private readonly config: DelegationConfig;

  constructor(config?: Partial<DelegationConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // -----------------------------------------------------------------------
  // Delegate
  // -----------------------------------------------------------------------

  /**
   * Create a new delegation request.
   * Validates depth limit and circular delegation rules.
   */
  delegate(input: DelegateInput): DelegationRequest {
    // Calculate depth
    let depth = 0;
    if (input.parentDelegationId) {
      const parent = this.delegations.get(input.parentDelegationId);
      if (!parent) {
        throw new A2AStructuredError(
          buildA2AError({
            code: A2AErrorCodeEnum.TaskNotFound,
            message: `Parent delegation not found: ${input.parentDelegationId}`,
          }),
        );
      }
      depth = parent.depth + 1;
    }

    // Validate depth
    if (depth > this.config.maxDepth) {
      logger.warn(
        { fromAgentId: input.fromAgentId, toAgentId: input.toAgentId, depth, maxDepth: this.config.maxDepth },
        'delegation depth exceeded',
      );
      this.emit('delegation:depth-exceeded', { fromAgentId: input.fromAgentId, toAgentId: input.toAgentId, depth });
      throw new A2AStructuredError(
        buildA2AError({
          code: A2AErrorCodeEnum.PolicyDenied,
          message: `Delegation depth ${depth} exceeds maximum allowed depth ${this.config.maxDepth}`,
          details: { depth, maxDepth: this.config.maxDepth },
        }),
      );
    }

    // Validate self-delegation
    if (!this.config.allowSelfDelegation && input.fromAgentId === input.toAgentId) {
      throw new A2AStructuredError(
        buildA2AError({
          code: A2AErrorCodeEnum.PolicyDenied,
          message: `Self-delegation is not allowed: ${input.fromAgentId} -> ${input.toAgentId}`,
        }),
      );
    }

    // Validate circular delegation
    if (!this.config.allowCircular && input.parentDelegationId) {
      const agentsInChain = this.getAgentsInChainAbove(input.parentDelegationId);
      if (agentsInChain.has(input.toAgentId)) {
        throw new A2AStructuredError(
          buildA2AError({
            code: A2AErrorCodeEnum.PolicyDenied,
            message: `Circular delegation detected: ${input.toAgentId} already appears in the delegation chain`,
            details: { toAgentId: input.toAgentId, chainAgents: Array.from(agentsInChain) },
          }),
        );
      }
    }

    const now = new Date().toISOString();

    const delegation: DelegationRequest = {
      delegationId: generateDelegationId(),
      fromAgentId: input.fromAgentId,
      toAgentId: input.toAgentId,
      prompt: input.prompt,
      priority: input.priority ?? 'normal',
      parentDelegationId: input.parentDelegationId,
      depth,
      status: 'pending',
      createdAt: now,
      metadata: input.metadata,
    };

    this.delegations.set(delegation.delegationId, delegation);

    logger.debug(
      { delegationId: delegation.delegationId, fromAgentId: delegation.fromAgentId, toAgentId: delegation.toAgentId, depth },
      'delegation created',
    );

    this.emit('delegation:created', delegation);
    return delegation;
  }

  // -----------------------------------------------------------------------
  // Accept
  // -----------------------------------------------------------------------

  /**
   * Accept a delegation (agent agrees to work on it).
   */
  accept(delegationId: string): DelegationRequest | undefined {
    const delegation = this.delegations.get(delegationId);
    if (!delegation) return undefined;

    delegation.status = 'accepted';
    delegation.acceptedAt = new Date().toISOString();

    logger.debug({ delegationId }, 'delegation accepted');
    this.emit('delegation:accepted', delegation);
    return delegation;
  }

  // -----------------------------------------------------------------------
  // Reject
  // -----------------------------------------------------------------------

  /**
   * Reject a delegation.
   */
  reject(delegationId: string, reason?: string): DelegationRequest | undefined {
    const delegation = this.delegations.get(delegationId);
    if (!delegation) return undefined;

    delegation.status = 'rejected';
    delegation.error = reason;
    delegation.completedAt = new Date().toISOString();
    delegation.durationMs = new Date(delegation.completedAt).getTime() - new Date(delegation.createdAt).getTime();

    logger.debug({ delegationId, reason }, 'delegation rejected');
    this.emit('delegation:rejected', delegation);
    return delegation;
  }

  // -----------------------------------------------------------------------
  // Complete
  // -----------------------------------------------------------------------

  /**
   * Complete a delegation with a result.
   * If this delegation has a parent, propagate the result up the chain.
   */
  complete(delegationId: string, result: string): DelegationRequest | undefined {
    const delegation = this.delegations.get(delegationId);
    if (!delegation) return undefined;

    const now = new Date().toISOString();
    delegation.status = 'completed';
    delegation.result = result;
    delegation.completedAt = now;
    delegation.durationMs = new Date(now).getTime() - new Date(delegation.createdAt).getTime();

    logger.debug({ delegationId, result: result.slice(0, 80) }, 'delegation completed');
    this.emit('delegation:completed', delegation);

    // Check if the entire chain rooted at the root delegation is complete
    const rootId = this.findRootDelegationId(delegationId);
    if (this.isChainComplete(rootId)) {
      const chain = this.getChain(rootId);
      if (chain) {
        logger.debug({ rootDelegationId: rootId }, 'delegation chain completed');
        this.emit('delegation:chain-completed', chain);
      }
    }

    return delegation;
  }

  // -----------------------------------------------------------------------
  // Fail
  // -----------------------------------------------------------------------

  /**
   * Fail a delegation with an error.
   */
  fail(delegationId: string, error: string): DelegationRequest | undefined {
    const delegation = this.delegations.get(delegationId);
    if (!delegation) return undefined;

    const now = new Date().toISOString();
    delegation.status = 'failed';
    delegation.error = error;
    delegation.completedAt = now;
    delegation.durationMs = new Date(now).getTime() - new Date(delegation.createdAt).getTime();

    logger.debug({ delegationId, error }, 'delegation failed');
    this.emit('delegation:failed', delegation);
    return delegation;
  }

  // -----------------------------------------------------------------------
  // Cancel
  // -----------------------------------------------------------------------

  /**
   * Cancel a delegation.
   */
  cancel(delegationId: string): DelegationRequest | undefined {
    const delegation = this.delegations.get(delegationId);
    if (!delegation) return undefined;

    const now = new Date().toISOString();
    delegation.status = 'cancelled';
    delegation.completedAt = now;
    delegation.durationMs = new Date(now).getTime() - new Date(delegation.createdAt).getTime();

    logger.debug({ delegationId }, 'delegation cancelled');
    return delegation;
  }

  // -----------------------------------------------------------------------
  // Query
  // -----------------------------------------------------------------------

  /**
   * Get a delegation by ID.
   */
  getDelegation(delegationId: string): DelegationRequest | undefined {
    return this.delegations.get(delegationId);
  }

  /**
   * Get all delegations from a specific agent.
   */
  getDelegationsFrom(agentId: string): DelegationRequest[] {
    const results: DelegationRequest[] = [];
    for (const d of this.delegations.values()) {
      if (d.fromAgentId === agentId) results.push(d);
    }
    return results;
  }

  /**
   * Get all delegations to a specific agent.
   */
  getDelegationsTo(agentId: string): DelegationRequest[] {
    const results: DelegationRequest[] = [];
    for (const d of this.delegations.values()) {
      if (d.toAgentId === agentId) results.push(d);
    }
    return results;
  }

  list(filter: DelegationListFilter = {}): DelegationRequest[] {
    const statusSet = filter.statuses && filter.statuses.length > 0 ? new Set(filter.statuses) : null;
    return [...this.delegations.values()].filter((delegation) => {
      if (filter.fromAgentId && delegation.fromAgentId !== filter.fromAgentId) return false;
      if (filter.toAgentId && delegation.toAgentId !== filter.toAgentId) return false;
      if (statusSet && !statusSet.has(delegation.status)) return false;
      return true;
    });
  }

  // -----------------------------------------------------------------------
  // Chain
  // -----------------------------------------------------------------------

  /**
   * Get the full delegation chain starting from a root delegation.
   */
  getChain(delegationId: string): DelegationChain | undefined {
    // Find root
    const rootId = this.findRootDelegationId(delegationId);
    const root = this.delegations.get(rootId);
    if (!root) return undefined;

    // Collect all delegations in this chain via BFS
    const chainDelegations: DelegationRequest[] = [root];
    const visited = new Set<string>([rootId]);
    const queue = [rootId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      for (const d of this.delegations.values()) {
        if (d.parentDelegationId === currentId && !visited.has(d.delegationId)) {
          visited.add(d.delegationId);
          chainDelegations.push(d);
          queue.push(d.delegationId);
        }
      }
    }

    // Sort by depth
    chainDelegations.sort((a, b) => a.depth - b.depth);

    // Compute max depth
    const maxDepth = chainDelegations.reduce((max, d) => Math.max(max, d.depth), 0);

    // Compute overall status
    const anyFailed = chainDelegations.some(
      (d) => d.status === 'failed' || d.status === 'rejected',
    );
    const allTerminal = chainDelegations.every(
      (d) => d.status === 'completed' || d.status === 'failed' || d.status === 'rejected' || d.status === 'cancelled',
    );

    let status: DelegationChain['status'];
    if (anyFailed) {
      status = 'failed';
    } else if (allTerminal) {
      status = 'completed';
    } else {
      status = 'in-progress';
    }

    // Compute total duration from root creation to the latest completedAt
    let totalDurationMs: number | undefined;
    if (allTerminal) {
      const latestCompletion = chainDelegations.reduce<number>((latest, d) => {
        if (d.completedAt) {
          return Math.max(latest, new Date(d.completedAt).getTime());
        }
        return latest;
      }, 0);
      if (latestCompletion > 0) {
        totalDurationMs = latestCompletion - new Date(root.createdAt).getTime();
      }
    }

    return {
      rootDelegationId: rootId,
      delegations: chainDelegations,
      maxDepth,
      status,
      totalDurationMs,
    };
  }

  // -----------------------------------------------------------------------
  // Stats
  // -----------------------------------------------------------------------

  /**
   * Get statistics.
   */
  getStats(): DelegationStats {
    let totalDelegations = 0;
    let totalCompleted = 0;
    let totalFailed = 0;
    let totalRejected = 0;
    let depthSum = 0;
    let maxDepthReached = 0;
    const byAgent: Record<string, { delegated: number; received: number; completed: number }> = {};

    for (const d of this.delegations.values()) {
      totalDelegations++;
      depthSum += d.depth;
      if (d.depth > maxDepthReached) maxDepthReached = d.depth;

      if (d.status === 'completed') totalCompleted++;
      if (d.status === 'failed') totalFailed++;
      if (d.status === 'rejected') totalRejected++;

      // Track by agent
      if (!byAgent[d.fromAgentId]) {
        byAgent[d.fromAgentId] = { delegated: 0, received: 0, completed: 0 };
      }
      byAgent[d.fromAgentId].delegated++;

      if (!byAgent[d.toAgentId]) {
        byAgent[d.toAgentId] = { delegated: 0, received: 0, completed: 0 };
      }
      byAgent[d.toAgentId].received++;

      if (d.status === 'completed') {
        byAgent[d.toAgentId].completed++;
      }
    }

    return {
      totalDelegations,
      totalCompleted,
      totalFailed,
      totalRejected,
      avgDepth: totalDelegations > 0 ? depthSum / totalDelegations : 0,
      maxDepthReached,
      byAgent,
    };
  }

  // -----------------------------------------------------------------------
  // Reset
  // -----------------------------------------------------------------------

  /**
   * Reset all state.
   */
  reset(): void {
    this.delegations.clear();
    this.removeAllListeners();
    logger.debug('delegation chain service reset');
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Collect all agent IDs (both from and to) in the chain above the given
   * delegation (inclusive), traversing up through parentDelegationId.
   */
  private getAgentsInChainAbove(delegationId: string): Set<string> {
    const agents = new Set<string>();
    let currentId: string | undefined = delegationId;

    while (currentId) {
      const d = this.delegations.get(currentId);
      if (!d) break;
      agents.add(d.fromAgentId);
      agents.add(d.toAgentId);
      currentId = d.parentDelegationId;
    }

    return agents;
  }

  /**
   * Follow parentDelegationId pointers to find the root delegation ID.
   */
  private findRootDelegationId(delegationId: string): string {
    let currentId = delegationId;
    let current = this.delegations.get(currentId);

    while (current?.parentDelegationId) {
      currentId = current.parentDelegationId;
      current = this.delegations.get(currentId);
    }

    return currentId;
  }

  /**
   * Check if the entire chain rooted at rootId is complete
   * (all delegations are in a terminal state with no failures).
   */
  private isChainComplete(rootId: string): boolean {
    const root = this.delegations.get(rootId);
    if (!root) return false;

    // Collect all delegations in this chain
    const visited = new Set<string>([rootId]);
    const queue = [rootId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      for (const d of this.delegations.values()) {
        if (d.parentDelegationId === currentId && !visited.has(d.delegationId)) {
          visited.add(d.delegationId);
          queue.push(d.delegationId);
        }
      }
    }

    // Check all are completed
    for (const id of visited) {
      const d = this.delegations.get(id);
      if (!d || d.status !== 'completed') return false;
    }

    return true;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: DelegationChainService | null = null;

/** Get or create the default singleton instance. */
export function getDelegationChainService(config?: Partial<DelegationConfig>): DelegationChainService {
  if (!_instance) {
    _instance = new DelegationChainService(config);
  }
  return _instance;
}

/** Reset the singleton (for testing). */
export function resetDelegationChainService(): void {
  if (_instance) {
    _instance.reset();
  }
  _instance = null;
}
