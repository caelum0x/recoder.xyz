"use strict";
/**
 * @module task-scheduler.service
 *
 * A2A Task Scheduler Service for cron-like scheduled or interval-based task
 * submissions.
 *
 * Provides:
 * - Interval schedules (repeat every N ms)
 * - One-shot schedules (execute once at a specific time)
 * - Pause / resume / delete lifecycle
 * - Manual trigger (immediate execution)
 * - Execution history tracking
 * - Event emission for all state transitions
 * - tick()-based evaluation (no external cron libraries)
 *
 * Singleton access via `getA2ATaskScheduler()` / `resetA2ATaskScheduler()`.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.A2ATaskScheduler = void 0;
exports.getA2ATaskScheduler = getA2ATaskScheduler;
exports.resetA2ATaskScheduler = resetA2ATaskScheduler;
const events_1 = require("events");
const crypto_1 = require("crypto");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('a2a-task-scheduler');
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function generateScheduleId() {
    return `sched_${(0, crypto_1.randomBytes)(8).toString('hex')}`;
}
function generateExecutionId() {
    return `exec_${(0, crypto_1.randomBytes)(8).toString('hex')}`;
}
// ---------------------------------------------------------------------------
// A2ATaskScheduler
// ---------------------------------------------------------------------------
class A2ATaskScheduler extends events_1.EventEmitter {
    schedules = new Map();
    // -----------------------------------------------------------------------
    // Create
    // -----------------------------------------------------------------------
    createSchedule(input) {
        const scheduleId = input.scheduleId || generateScheduleId();
        const enabled = input.enabled ?? true;
        const type = input.type;
        // Compute default maxExecutions
        let maxExecutions = input.maxExecutions;
        if (maxExecutions === undefined) {
            maxExecutions = type === 'once' ? 1 : 0;
        }
        const definition = {
            ...input,
            scheduleId,
            enabled,
            maxExecutions,
            priority: input.priority ?? 'normal',
        };
        // Calculate nextRunAt
        let nextRunAt;
        if (type === 'interval' && definition.intervalMs) {
            nextRunAt = new Date(Date.now() + definition.intervalMs).toISOString();
        }
        else if (type === 'once' && definition.executeAt) {
            nextRunAt = definition.executeAt;
        }
        const state = {
            definition,
            status: enabled ? 'active' : 'disabled',
            nextRunAt,
            executionCount: 0,
            createdAt: new Date().toISOString(),
            executionHistory: [],
        };
        this.schedules.set(scheduleId, state);
        logger.info({ scheduleId, name: definition.name, type }, 'schedule created');
        this.emit('schedule:created', { scheduleId, definition });
        return definition;
    }
    // -----------------------------------------------------------------------
    // Get / List
    // -----------------------------------------------------------------------
    getSchedule(scheduleId) {
        return this.schedules.get(scheduleId)?.definition;
    }
    listSchedules() {
        return [...this.schedules.values()].map((s) => s.definition);
    }
    // -----------------------------------------------------------------------
    // Update
    // -----------------------------------------------------------------------
    updateSchedule(scheduleId, updates) {
        const state = this.schedules.get(scheduleId);
        if (!state)
            return undefined;
        const def = state.definition;
        if (updates.name !== undefined)
            def.name = updates.name;
        if (updates.intervalMs !== undefined)
            def.intervalMs = updates.intervalMs;
        if (updates.executeAt !== undefined)
            def.executeAt = updates.executeAt;
        if (updates.prompt !== undefined)
            def.prompt = updates.prompt;
        if (updates.priority !== undefined)
            def.priority = updates.priority;
        if (updates.maxExecutions !== undefined)
            def.maxExecutions = updates.maxExecutions;
        // Recalculate nextRunAt if interval changed
        if (updates.intervalMs !== undefined && def.type === 'interval') {
            state.nextRunAt = new Date(Date.now() + updates.intervalMs).toISOString();
        }
        if (updates.executeAt !== undefined && def.type === 'once') {
            state.nextRunAt = updates.executeAt;
        }
        // Update name in state for getState() convenience
        logger.info({ scheduleId, updates }, 'schedule updated');
        this.emit('schedule:updated', { scheduleId, definition: def });
        return def;
    }
    // -----------------------------------------------------------------------
    // Delete
    // -----------------------------------------------------------------------
    deleteSchedule(scheduleId) {
        const existed = this.schedules.delete(scheduleId);
        if (existed) {
            logger.info({ scheduleId }, 'schedule deleted');
            this.emit('schedule:deleted', { scheduleId });
        }
        return existed;
    }
    // -----------------------------------------------------------------------
    // Pause / Resume
    // -----------------------------------------------------------------------
    pauseSchedule(scheduleId) {
        const state = this.schedules.get(scheduleId);
        if (!state || state.status !== 'active')
            return false;
        state.status = 'paused';
        state.definition.enabled = false;
        logger.info({ scheduleId }, 'schedule paused');
        this.emit('schedule:paused', { scheduleId });
        return true;
    }
    resumeSchedule(scheduleId) {
        const state = this.schedules.get(scheduleId);
        if (!state || state.status !== 'paused')
            return false;
        state.status = 'active';
        state.definition.enabled = true;
        // Recalculate nextRunAt for interval schedules
        if (state.definition.type === 'interval' && state.definition.intervalMs) {
            state.nextRunAt = new Date(Date.now() + state.definition.intervalMs).toISOString();
        }
        logger.info({ scheduleId }, 'schedule resumed');
        this.emit('schedule:resumed', { scheduleId });
        return true;
    }
    // -----------------------------------------------------------------------
    // State query
    // -----------------------------------------------------------------------
    getState(scheduleId) {
        const state = this.schedules.get(scheduleId);
        if (!state)
            return undefined;
        return {
            scheduleId: state.definition.scheduleId,
            name: state.definition.name,
            status: state.status,
            type: state.definition.type,
            nextRunAt: state.nextRunAt,
            executionCount: state.executionCount,
            lastExecution: state.lastExecution,
            createdAt: state.createdAt,
        };
    }
    // -----------------------------------------------------------------------
    // Execution history
    // -----------------------------------------------------------------------
    getExecutionHistory(scheduleId, limit) {
        const state = this.schedules.get(scheduleId);
        if (!state)
            return [];
        // Return most recent first
        const history = [...state.executionHistory].reverse();
        if (limit !== undefined && limit > 0) {
            return history.slice(0, limit);
        }
        return history;
    }
    // -----------------------------------------------------------------------
    // Manual trigger
    // -----------------------------------------------------------------------
    async triggerExecution(scheduleId, executor) {
        const state = this.schedules.get(scheduleId);
        if (!state)
            return undefined;
        const execution = await this.executeSchedule(state, executor);
        // triggerExecution does NOT affect nextRunAt
        return execution;
    }
    // -----------------------------------------------------------------------
    // Tick -- check all schedules and execute those that are due
    // -----------------------------------------------------------------------
    async tick(executor) {
        const now = Date.now();
        const executions = [];
        for (const state of this.schedules.values()) {
            // Skip non-active schedules
            if (state.status !== 'active')
                continue;
            // Skip schedules with no nextRunAt
            if (!state.nextRunAt)
                continue;
            // Check if schedule is due
            const nextRunMs = new Date(state.nextRunAt).getTime();
            if (now < nextRunMs)
                continue;
            // Execute
            const execution = await this.executeSchedule(state, executor);
            // Update nextRunAt for interval schedules
            if (state.definition.type === 'interval' && state.definition.intervalMs) {
                // Check if maxExecutions reached
                const max = state.definition.maxExecutions ?? 0;
                if (max > 0 && state.executionCount >= max) {
                    state.status = 'completed';
                    state.nextRunAt = undefined;
                    logger.info({ scheduleId: state.definition.scheduleId }, 'schedule completed (max executions reached)');
                    this.emit('schedule:completed', { scheduleId: state.definition.scheduleId });
                }
                else {
                    state.nextRunAt = new Date(Date.now() + state.definition.intervalMs).toISOString();
                }
            }
            else if (state.definition.type === 'once') {
                state.status = 'completed';
                state.nextRunAt = undefined;
                logger.info({ scheduleId: state.definition.scheduleId }, 'once schedule completed');
                this.emit('schedule:completed', { scheduleId: state.definition.scheduleId });
            }
            executions.push(execution);
        }
        return executions;
    }
    // -----------------------------------------------------------------------
    // Reset
    // -----------------------------------------------------------------------
    reset() {
        this.schedules.clear();
        this.removeAllListeners();
        logger.info('task scheduler reset');
    }
    // -----------------------------------------------------------------------
    // Internal execution
    // -----------------------------------------------------------------------
    async executeSchedule(state, executor) {
        const executionId = generateExecutionId();
        const startMs = Date.now();
        let execution;
        try {
            const output = await executor(state.definition.agentId, state.definition.prompt);
            const durationMs = Date.now() - startMs;
            execution = {
                executionId,
                scheduleId: state.definition.scheduleId,
                executedAt: new Date(startMs).toISOString(),
                status: 'success',
                output,
                durationMs,
            };
            logger.info({ scheduleId: state.definition.scheduleId, executionId, durationMs }, 'schedule executed successfully');
            this.emit('schedule:executed', { scheduleId: state.definition.scheduleId, execution });
        }
        catch (err) {
            const durationMs = Date.now() - startMs;
            const errorMessage = err instanceof Error ? err.message : String(err);
            execution = {
                executionId,
                scheduleId: state.definition.scheduleId,
                executedAt: new Date(startMs).toISOString(),
                status: 'failed',
                error: errorMessage,
                durationMs,
            };
            logger.warn({ scheduleId: state.definition.scheduleId, executionId, error: errorMessage, durationMs }, 'schedule execution failed');
            this.emit('schedule:failed', { scheduleId: state.definition.scheduleId, execution });
        }
        // Record execution
        state.executionCount++;
        state.lastExecution = execution;
        state.executionHistory.push(execution);
        return execution;
    }
}
exports.A2ATaskScheduler = A2ATaskScheduler;
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let _instance = null;
function getA2ATaskScheduler() {
    if (!_instance) {
        _instance = new A2ATaskScheduler();
    }
    return _instance;
}
function resetA2ATaskScheduler() {
    if (_instance) {
        _instance.reset();
    }
    _instance = null;
}
