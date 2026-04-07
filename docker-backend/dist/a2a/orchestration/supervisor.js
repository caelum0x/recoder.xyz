"use strict";
/**
 * @module orchestration/supervisor
 *
 * Supervisor Orchestration Pattern for the A2A ecosystem.
 *
 * Implements an Erlang/OTP-inspired supervisor tree that manages child agent
 * lifecycles with configurable restart policies and strategies:
 *
 * - **Restart policies**: `always`, `on-failure`, `never`
 * - **Strategies**: `one-for-one` (restart only the failed child) or
 *   `one-for-all` (restart every child when any one fails)
 * - **Exponential backoff**: Configurable base and ceiling for restart delays
 * - **Max restart limits**: Per-child and per-supervisor caps to prevent
 *   restart storms
 *
 * All state is in-memory. The class extends EventEmitter to surface lifecycle
 * events (`child:started`, `child:failed`, `supervisor:max-restarts-reached`,
 * etc.) for observability integration.
 *
 * Singleton access: `getSupervisorOrchestrator()` / `resetSupervisorOrchestrator()`
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupervisorOrchestrator = void 0;
exports.getSupervisorOrchestrator = getSupervisorOrchestrator;
exports.resetSupervisorOrchestrator = resetSupervisorOrchestrator;
const events_1 = require("events");
const logger_1 = require("../../logger");
const logger = (0, logger_1.createLogger)('a2a-supervisor');
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
const DEFAULT_MAX_RESTARTS = 3;
const DEFAULT_BACKOFF_BASE_MS = 1000;
const DEFAULT_MAX_BACKOFF_MS = 30_000;
function computeBackoff(spec, restartCount) {
    const base = spec.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
    const ceiling = spec.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
    // restartCount is already incremented before calling, use restartCount - 1
    // for the exponent so the first restart has exponent 0 (i.e., 1x base).
    return Math.min(base * Math.pow(2, restartCount - 1), ceiling);
}
function nowISO() {
    return new Date().toISOString();
}
/** Promisified delay that can be interrupted via AbortSignal in the future. */
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function makeChildState(spec) {
    return {
        childId: spec.childId,
        agentId: spec.agentId,
        status: 'stopped',
        restartCount: 0,
        uptimeMs: 0,
    };
}
// ---------------------------------------------------------------------------
// SupervisorOrchestrator
// ---------------------------------------------------------------------------
class SupervisorOrchestrator extends events_1.EventEmitter {
    /** Registered definitions keyed by supervisorId. */
    definitions = new Map();
    /** Runtime state keyed by supervisorId. */
    states = new Map();
    /** Per-child start timestamps used to compute uptimeMs. */
    childStartTimestamps = new Map();
    // -----------------------------------------------------------------------
    // Registration
    // -----------------------------------------------------------------------
    registerSupervisor(definition) {
        if (this.definitions.has(definition.supervisorId)) {
            logger.warn({ supervisorId: definition.supervisorId }, 'Overwriting existing supervisor definition');
        }
        this.definitions.set(definition.supervisorId, definition);
        // Initialise runtime state
        this.states.set(definition.supervisorId, {
            supervisorId: definition.supervisorId,
            status: 'idle',
            children: definition.children.map(makeChildState),
            totalRestarts: 0,
        });
        logger.info({ supervisorId: definition.supervisorId, childCount: definition.children.length }, 'Supervisor registered');
    }
    getSupervisor(supervisorId) {
        return this.definitions.get(supervisorId);
    }
    listSupervisors() {
        return Array.from(this.definitions.values());
    }
    removeSupervisor(supervisorId) {
        const state = this.states.get(supervisorId);
        if (state && state.status === 'running') {
            logger.warn({ supervisorId }, 'Cannot remove a running supervisor');
            return false;
        }
        const deleted = this.definitions.delete(supervisorId);
        this.states.delete(supervisorId);
        if (deleted) {
            logger.info({ supervisorId }, 'Supervisor removed');
        }
        return deleted;
    }
    // -----------------------------------------------------------------------
    // Start
    // -----------------------------------------------------------------------
    async start(supervisorId, startChild) {
        const def = this.definitions.get(supervisorId);
        if (!def) {
            throw new Error(`Supervisor ${supervisorId} not found`);
        }
        const state = this.states.get(supervisorId);
        state.status = 'running';
        state.startedAt = nowISO();
        logger.info({ supervisorId }, 'Starting supervisor');
        for (const spec of def.children) {
            await this.startSingleChild(supervisorId, spec, startChild);
        }
        this.emit('supervisor:started', { supervisorId });
        logger.info({ supervisorId }, 'Supervisor started');
        return { ...state, children: state.children.map((c) => ({ ...c })) };
    }
    // -----------------------------------------------------------------------
    // Stop
    // -----------------------------------------------------------------------
    stop(supervisorId) {
        const def = this.definitions.get(supervisorId);
        if (!def) {
            throw new Error(`Supervisor ${supervisorId} not found`);
        }
        const state = this.states.get(supervisorId);
        state.status = 'stopping';
        for (const child of state.children) {
            if (child.status === 'running' || child.status === 'restarting') {
                this.stopChild(supervisorId, child);
            }
        }
        state.status = 'stopped';
        this.emit('supervisor:stopped', { supervisorId });
        logger.info({ supervisorId }, 'Supervisor stopped');
        return { ...state, children: state.children.map((c) => ({ ...c })) };
    }
    // -----------------------------------------------------------------------
    // Report child failure
    // -----------------------------------------------------------------------
    async reportChildFailure(supervisorId, childId, error, startChild) {
        const def = this.definitions.get(supervisorId);
        if (!def) {
            throw new Error(`Supervisor ${supervisorId} not found`);
        }
        const state = this.states.get(supervisorId);
        const childState = state.children.find((c) => c.childId === childId);
        if (!childState) {
            throw new Error(`Child ${childId} not found in supervisor ${supervisorId}`);
        }
        const spec = def.children.find((c) => c.childId === childId);
        // Mark as failed
        childState.status = 'failed';
        childState.lastError = error;
        childState.lastStoppedAt = nowISO();
        this.finaliseChildUptime(childId, childState);
        this.emit('child:failed', { supervisorId, childId, error });
        logger.warn({ supervisorId, childId, error }, 'Child failed');
        // Check supervisor-level total restart cap
        const maxTotal = def.maxTotalRestarts;
        // Determine strategy
        if (def.strategy === 'one-for-all') {
            await this.handleOneForAll(supervisorId, def, state, spec, startChild);
        }
        else {
            // one-for-one: only restart the failed child
            await this.handleOneForOne(supervisorId, def, state, spec, childState, startChild);
        }
        // After restart attempts, re-check the total cap
        if (maxTotal !== undefined && state.totalRestarts >= maxTotal) {
            this.emit('supervisor:max-restarts-reached', { supervisorId, totalRestarts: state.totalRestarts });
            logger.error({ supervisorId, totalRestarts: state.totalRestarts }, 'Max total restarts reached — stopping supervisor');
            this.stop(supervisorId);
        }
    }
    // -----------------------------------------------------------------------
    // State query
    // -----------------------------------------------------------------------
    getState(supervisorId) {
        const state = this.states.get(supervisorId);
        if (!state)
            return undefined;
        // Snapshot with live uptimeMs for running children
        return {
            ...state,
            children: state.children.map((c) => {
                if (c.status === 'running') {
                    const startTs = this.childStartTimestamps.get(this.childKey(supervisorId, c.childId));
                    return { ...c, uptimeMs: startTs ? Date.now() - startTs : c.uptimeMs };
                }
                return { ...c };
            }),
        };
    }
    // -----------------------------------------------------------------------
    // Reset
    // -----------------------------------------------------------------------
    reset() {
        this.definitions.clear();
        this.states.clear();
        this.childStartTimestamps.clear();
        this.removeAllListeners();
        logger.info('Supervisor orchestrator reset');
    }
    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------
    childKey(supervisorId, childId) {
        return `${supervisorId}::${childId}`;
    }
    async startSingleChild(supervisorId, spec, startChild) {
        const state = this.states.get(supervisorId);
        const childState = state.children.find((c) => c.childId === spec.childId);
        try {
            childState.status = 'restarting';
            await startChild(spec.childId, spec.agentId);
            childState.status = 'running';
            childState.lastStartedAt = nowISO();
            this.childStartTimestamps.set(this.childKey(supervisorId, spec.childId), Date.now());
            this.emit('child:started', { supervisorId, childId: spec.childId });
            logger.info({ supervisorId, childId: spec.childId }, 'Child started');
        }
        catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            childState.status = 'failed';
            childState.lastError = errMsg;
            childState.lastStoppedAt = nowISO();
            this.emit('child:failed', { supervisorId, childId: spec.childId, error: errMsg });
            logger.error({ supervisorId, childId: spec.childId, error: errMsg }, 'Child failed to start');
            // Attempt restart according to policy
            await this.attemptRestart(supervisorId, spec, childState, startChild);
        }
    }
    stopChild(supervisorId, childState) {
        childState.status = 'stopped';
        childState.lastStoppedAt = nowISO();
        this.finaliseChildUptime(childState.childId, childState);
        this.emit('child:stopped', { supervisorId, childId: childState.childId });
        logger.info({ supervisorId, childId: childState.childId }, 'Child stopped');
    }
    finaliseChildUptime(childId, childState) {
        // Look up any key that ends with the childId (we don't know the supervisorId here,
        // but we use it only for the combined key; iterate is fine for in-memory.)
        for (const [key, startTs] of this.childStartTimestamps) {
            if (key.endsWith(`::${childId}`)) {
                childState.uptimeMs += Date.now() - startTs;
                this.childStartTimestamps.delete(key);
                break;
            }
        }
    }
    shouldRestart(spec, childState) {
        const maxRestarts = spec.maxRestarts ?? DEFAULT_MAX_RESTARTS;
        if (childState.restartCount >= maxRestarts) {
            return false;
        }
        switch (spec.restartPolicy) {
            case 'always':
            case 'on-failure':
                return true;
            case 'never':
                return false;
        }
    }
    async attemptRestart(supervisorId, spec, childState, startChild) {
        if (!this.shouldRestart(spec, childState)) {
            logger.info({ supervisorId, childId: spec.childId, policy: spec.restartPolicy, restartCount: childState.restartCount }, 'Restart not applicable');
            return;
        }
        const state = this.states.get(supervisorId);
        // Check supervisor-level cap before attempting
        const def = this.definitions.get(supervisorId);
        if (def.maxTotalRestarts !== undefined && state.totalRestarts >= def.maxTotalRestarts) {
            return;
        }
        childState.restartCount++;
        state.totalRestarts++;
        const backoff = computeBackoff(spec, childState.restartCount);
        logger.info({ supervisorId, childId: spec.childId, restartCount: childState.restartCount, backoffMs: backoff }, 'Scheduling child restart');
        childState.status = 'restarting';
        await delay(backoff);
        // After waiting, the supervisor might have been stopped
        if (state.status !== 'running') {
            return;
        }
        try {
            await startChild(spec.childId, spec.agentId);
            childState.status = 'running';
            childState.lastStartedAt = nowISO();
            this.childStartTimestamps.set(this.childKey(supervisorId, spec.childId), Date.now());
            this.emit('child:restarted', { supervisorId, childId: spec.childId, restartCount: childState.restartCount });
            logger.info({ supervisorId, childId: spec.childId, restartCount: childState.restartCount }, 'Child restarted');
        }
        catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            childState.status = 'failed';
            childState.lastError = errMsg;
            childState.lastStoppedAt = nowISO();
            this.emit('child:failed', { supervisorId, childId: spec.childId, error: errMsg });
            logger.error({ supervisorId, childId: spec.childId, error: errMsg }, 'Child restart failed');
        }
    }
    // -----------------------------------------------------------------------
    // Strategy handlers
    // -----------------------------------------------------------------------
    async handleOneForOne(supervisorId, def, state, spec, childState, startChild) {
        await this.attemptRestart(supervisorId, spec, childState, startChild);
    }
    async handleOneForAll(supervisorId, def, state, failedSpec, startChild) {
        // Stop all other running children first
        for (const child of state.children) {
            if (child.childId !== failedSpec.childId && (child.status === 'running' || child.status === 'restarting')) {
                this.stopChild(supervisorId, child);
            }
        }
        // Restart all children (including the one that failed)
        for (const spec of def.children) {
            const childState = state.children.find((c) => c.childId === spec.childId);
            if (!this.shouldRestart(spec, childState)) {
                continue;
            }
            // Check supervisor-level cap before each child restart
            if (def.maxTotalRestarts !== undefined && state.totalRestarts >= def.maxTotalRestarts) {
                return;
            }
            childState.restartCount++;
            state.totalRestarts++;
            const backoff = computeBackoff(spec, childState.restartCount);
            childState.status = 'restarting';
            await delay(backoff);
            if (state.status !== 'running')
                return;
            try {
                await startChild(spec.childId, spec.agentId);
                childState.status = 'running';
                childState.lastStartedAt = nowISO();
                this.childStartTimestamps.set(this.childKey(supervisorId, spec.childId), Date.now());
                this.emit('child:restarted', { supervisorId, childId: spec.childId, restartCount: childState.restartCount });
                logger.info({ supervisorId, childId: spec.childId }, 'Child restarted (one-for-all)');
            }
            catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                childState.status = 'failed';
                childState.lastError = errMsg;
                childState.lastStoppedAt = nowISO();
                this.emit('child:failed', { supervisorId, childId: spec.childId, error: errMsg });
                logger.error({ supervisorId, childId: spec.childId, error: errMsg }, 'Child restart failed (one-for-all)');
            }
        }
    }
}
exports.SupervisorOrchestrator = SupervisorOrchestrator;
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let instance;
function getSupervisorOrchestrator() {
    if (!instance) {
        instance = new SupervisorOrchestrator();
    }
    return instance;
}
function resetSupervisorOrchestrator() {
    if (instance) {
        instance.reset();
    }
    instance = undefined;
}
