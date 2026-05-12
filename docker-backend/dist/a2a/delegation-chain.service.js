"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DelegationChainService = void 0;
exports.resetDelegationIdCounter = resetDelegationIdCounter;
exports.getDelegationChainService = getDelegationChainService;
exports.resetDelegationChainService = resetDelegationChainService;
const events_1 = require("events");
const logger_1 = require("../logger");
const a2a_1 = require("@recoder/shared/a2a");
const logger = (0, logger_1.createLogger)('a2a-delegation-chain');
// ---------------------------------------------------------------------------
// Config defaults
// ---------------------------------------------------------------------------
const DEFAULT_CONFIG = {
    maxDepth: 5,
    defaultTimeoutMs: 60_000,
    allowSelfDelegation: false,
    allowCircular: false,
};
// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------
let _idCounter = 0;
function generateDelegationId() {
    const ts = Date.now().toString(36);
    const counter = (_idCounter++).toString(36).padStart(4, '0');
    return `dlg_${ts}_${counter}`;
}
/** Reset the ID counter (visible for testing). */
function resetDelegationIdCounter() {
    _idCounter = 0;
}
// ---------------------------------------------------------------------------
// DelegationChainService
// ---------------------------------------------------------------------------
class DelegationChainService extends events_1.EventEmitter {
    /** All delegations indexed by delegationId. */
    delegations = new Map();
    /** Resolved config. */
    config;
    constructor(config) {
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
    delegate(input) {
        // Calculate depth
        let depth = 0;
        if (input.parentDelegationId) {
            const parent = this.delegations.get(input.parentDelegationId);
            if (!parent) {
                throw new a2a_1.A2AStructuredError((0, a2a_1.buildA2AError)({
                    code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
                    message: `Parent delegation not found: ${input.parentDelegationId}`,
                }));
            }
            depth = parent.depth + 1;
        }
        // Validate depth
        if (depth > this.config.maxDepth) {
            logger.warn({ fromAgentId: input.fromAgentId, toAgentId: input.toAgentId, depth, maxDepth: this.config.maxDepth }, 'delegation depth exceeded');
            this.emit('delegation:depth-exceeded', { fromAgentId: input.fromAgentId, toAgentId: input.toAgentId, depth });
            throw new a2a_1.A2AStructuredError((0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.PolicyDenied,
                message: `Delegation depth ${depth} exceeds maximum allowed depth ${this.config.maxDepth}`,
                details: { depth, maxDepth: this.config.maxDepth },
            }));
        }
        // Validate self-delegation
        if (!this.config.allowSelfDelegation && input.fromAgentId === input.toAgentId) {
            throw new a2a_1.A2AStructuredError((0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.PolicyDenied,
                message: `Self-delegation is not allowed: ${input.fromAgentId} -> ${input.toAgentId}`,
            }));
        }
        // Validate circular delegation
        if (!this.config.allowCircular && input.parentDelegationId) {
            const agentsInChain = this.getAgentsInChainAbove(input.parentDelegationId);
            if (agentsInChain.has(input.toAgentId)) {
                throw new a2a_1.A2AStructuredError((0, a2a_1.buildA2AError)({
                    code: a2a_1.A2AErrorCodeEnum.PolicyDenied,
                    message: `Circular delegation detected: ${input.toAgentId} already appears in the delegation chain`,
                    details: { toAgentId: input.toAgentId, chainAgents: Array.from(agentsInChain) },
                }));
            }
        }
        const now = new Date().toISOString();
        const delegation = {
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
        logger.debug({ delegationId: delegation.delegationId, fromAgentId: delegation.fromAgentId, toAgentId: delegation.toAgentId, depth }, 'delegation created');
        this.emit('delegation:created', delegation);
        return delegation;
    }
    // -----------------------------------------------------------------------
    // Accept
    // -----------------------------------------------------------------------
    /**
     * Accept a delegation (agent agrees to work on it).
     */
    accept(delegationId) {
        const delegation = this.delegations.get(delegationId);
        if (!delegation)
            return undefined;
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
    reject(delegationId, reason) {
        const delegation = this.delegations.get(delegationId);
        if (!delegation)
            return undefined;
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
    complete(delegationId, result) {
        const delegation = this.delegations.get(delegationId);
        if (!delegation)
            return undefined;
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
    fail(delegationId, error) {
        const delegation = this.delegations.get(delegationId);
        if (!delegation)
            return undefined;
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
    cancel(delegationId) {
        const delegation = this.delegations.get(delegationId);
        if (!delegation)
            return undefined;
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
    getDelegation(delegationId) {
        return this.delegations.get(delegationId);
    }
    /**
     * Get all delegations from a specific agent.
     */
    getDelegationsFrom(agentId) {
        const results = [];
        for (const d of this.delegations.values()) {
            if (d.fromAgentId === agentId)
                results.push(d);
        }
        return results;
    }
    /**
     * Get all delegations to a specific agent.
     */
    getDelegationsTo(agentId) {
        const results = [];
        for (const d of this.delegations.values()) {
            if (d.toAgentId === agentId)
                results.push(d);
        }
        return results;
    }
    list(filter = {}) {
        const statusSet = filter.statuses && filter.statuses.length > 0 ? new Set(filter.statuses) : null;
        return [...this.delegations.values()].filter((delegation) => {
            if (filter.fromAgentId && delegation.fromAgentId !== filter.fromAgentId)
                return false;
            if (filter.toAgentId && delegation.toAgentId !== filter.toAgentId)
                return false;
            if (statusSet && !statusSet.has(delegation.status))
                return false;
            return true;
        });
    }
    // -----------------------------------------------------------------------
    // Chain
    // -----------------------------------------------------------------------
    /**
     * Get the full delegation chain starting from a root delegation.
     */
    getChain(delegationId) {
        // Find root
        const rootId = this.findRootDelegationId(delegationId);
        const root = this.delegations.get(rootId);
        if (!root)
            return undefined;
        // Collect all delegations in this chain via BFS
        const chainDelegations = [root];
        const visited = new Set([rootId]);
        const queue = [rootId];
        while (queue.length > 0) {
            const currentId = queue.shift();
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
        const anyFailed = chainDelegations.some((d) => d.status === 'failed' || d.status === 'rejected');
        const allTerminal = chainDelegations.every((d) => d.status === 'completed' || d.status === 'failed' || d.status === 'rejected' || d.status === 'cancelled');
        let status;
        if (anyFailed) {
            status = 'failed';
        }
        else if (allTerminal) {
            status = 'completed';
        }
        else {
            status = 'in-progress';
        }
        // Compute total duration from root creation to the latest completedAt
        let totalDurationMs;
        if (allTerminal) {
            const latestCompletion = chainDelegations.reduce((latest, d) => {
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
    getStats() {
        let totalDelegations = 0;
        let totalCompleted = 0;
        let totalFailed = 0;
        let totalRejected = 0;
        let depthSum = 0;
        let maxDepthReached = 0;
        const byAgent = {};
        for (const d of this.delegations.values()) {
            totalDelegations++;
            depthSum += d.depth;
            if (d.depth > maxDepthReached)
                maxDepthReached = d.depth;
            if (d.status === 'completed')
                totalCompleted++;
            if (d.status === 'failed')
                totalFailed++;
            if (d.status === 'rejected')
                totalRejected++;
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
    reset() {
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
    getAgentsInChainAbove(delegationId) {
        const agents = new Set();
        let currentId = delegationId;
        while (currentId) {
            const d = this.delegations.get(currentId);
            if (!d)
                break;
            agents.add(d.fromAgentId);
            agents.add(d.toAgentId);
            currentId = d.parentDelegationId;
        }
        return agents;
    }
    /**
     * Follow parentDelegationId pointers to find the root delegation ID.
     */
    findRootDelegationId(delegationId) {
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
    isChainComplete(rootId) {
        const root = this.delegations.get(rootId);
        if (!root)
            return false;
        // Collect all delegations in this chain
        const visited = new Set([rootId]);
        const queue = [rootId];
        while (queue.length > 0) {
            const currentId = queue.shift();
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
            if (!d || d.status !== 'completed')
                return false;
        }
        return true;
    }
}
exports.DelegationChainService = DelegationChainService;
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let _instance = null;
/** Get or create the default singleton instance. */
function getDelegationChainService(config) {
    if (!_instance) {
        _instance = new DelegationChainService(config);
    }
    return _instance;
}
/** Reset the singleton (for testing). */
function resetDelegationChainService() {
    if (_instance) {
        _instance.reset();
    }
    _instance = null;
}
