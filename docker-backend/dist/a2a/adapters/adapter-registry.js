"use strict";
/**
 * @module adapter-registry
 *
 * Unified Adapter Registry for the A2A protocol adapter layer.
 *
 * Wraps the per-type REST and Git adapter registries into a single facade,
 * providing type-agnostic listing/lookup across all adapters, aggregate
 * health status, and lifecycle event emission.
 *
 * P17-011: Unified Adapter Registry
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdapterRegistry = void 0;
exports.getAdapterRegistry = getAdapterRegistry;
exports.resetAdapterRegistry = resetAdapterRegistry;
const events_1 = require("events");
const logger_1 = require("../../logger");
const rest_adapter_1 = require("./rest-adapter");
const git_adapter_1 = require("./git-adapter");
const logger = (0, logger_1.createLogger)('a2a-adapter-registry');
// ---------------------------------------------------------------------------
// AdapterRegistry
// ---------------------------------------------------------------------------
/**
 * Unified registry that wraps both REST and Git per-type registries
 * into a single facade with lifecycle hooks and event emission.
 */
class AdapterRegistry extends events_1.EventEmitter {
    /** Internal tracking map: adapterId -> AdapterEntry metadata. */
    entries = new Map();
    // -----------------------------------------------------------------------
    // Register
    // -----------------------------------------------------------------------
    /**
     * Register an adapter with both the per-type registry and the unified
     * tracking map. Emits 'adapter:registered'.
     */
    registerAdapter(type, adapter) {
        const adapterId = adapter.adapterId;
        if (type === 'rest') {
            (0, rest_adapter_1.registerRestAdapter)(adapter);
        }
        else {
            (0, git_adapter_1.registerGitAdapter)(adapter);
        }
        const entry = {
            type,
            adapterId,
            status: adapter.status,
            registeredAt: new Date().toISOString(),
        };
        this.entries.set(adapterId, entry);
        const event = {
            type,
            adapterId,
            timestamp: entry.registeredAt,
        };
        this.emit('adapter:registered', event);
        logger.info(event, 'adapter registered in unified registry');
    }
    // -----------------------------------------------------------------------
    // Unregister
    // -----------------------------------------------------------------------
    /**
     * Unregister an adapter from both the per-type registry and the unified
     * tracking map. Emits 'adapter:unregistered'.
     */
    unregisterAdapter(type, adapterId) {
        let removed;
        if (type === 'rest') {
            removed = (0, rest_adapter_1.unregisterRestAdapter)(adapterId);
        }
        else {
            removed = (0, git_adapter_1.unregisterGitAdapter)(adapterId);
        }
        this.entries.delete(adapterId);
        if (removed) {
            const event = {
                type,
                adapterId,
                timestamp: new Date().toISOString(),
            };
            this.emit('adapter:unregistered', event);
            logger.info(event, 'adapter unregistered from unified registry');
        }
        return removed;
    }
    // -----------------------------------------------------------------------
    // Lookup
    // -----------------------------------------------------------------------
    /**
     * Get a specific adapter by type and ID.
     */
    getAdapter(type, adapterId) {
        if (type === 'rest') {
            return (0, rest_adapter_1.getRestAdapter)(adapterId);
        }
        return (0, git_adapter_1.getGitAdapter)(adapterId);
    }
    // -----------------------------------------------------------------------
    // List
    // -----------------------------------------------------------------------
    /**
     * List adapters. If `type` is specified, returns only that type from the
     * per-type registry. If no type, merges both REST and Git registries.
     */
    listAdapters(type) {
        if (type === 'rest') {
            return (0, rest_adapter_1.listRestAdapters)().map((a) => this.toEntry('rest', a));
        }
        if (type === 'git') {
            return (0, git_adapter_1.listGitAdapters)().map((a) => this.toEntry('git', a));
        }
        // Merge both
        const restEntries = (0, rest_adapter_1.listRestAdapters)().map((a) => this.toEntry('rest', a));
        const gitEntries = (0, git_adapter_1.listGitAdapters)().map((a) => this.toEntry('git', a));
        return [...restEntries, ...gitEntries];
    }
    // -----------------------------------------------------------------------
    // Health
    // -----------------------------------------------------------------------
    /**
     * Iterate all registered adapters, call getStatus() / status on each,
     * and return aggregate counts.
     */
    getHealthSummary() {
        const adapters = [];
        const byType = { rest: 0, git: 0 };
        const byStatus = {};
        // REST adapters
        for (const adapter of (0, rest_adapter_1.listRestAdapters)()) {
            const entry = this.toEntry('rest', adapter);
            adapters.push(entry);
            byType.rest++;
            byStatus[entry.status] = (byStatus[entry.status] ?? 0) + 1;
        }
        // Git adapters
        for (const adapter of (0, git_adapter_1.listGitAdapters)()) {
            const entry = this.toEntry('git', adapter);
            adapters.push(entry);
            byType.git++;
            byStatus[entry.status] = (byStatus[entry.status] ?? 0) + 1;
        }
        return {
            total: adapters.length,
            byType,
            byStatus,
            adapters,
        };
    }
    // -----------------------------------------------------------------------
    // Reset (for testing)
    // -----------------------------------------------------------------------
    /**
     * Reset the unified registry and both per-type registries.
     */
    reset() {
        this.entries.clear();
        (0, rest_adapter_1.resetRestAdapters)();
        (0, git_adapter_1.resetGitAdapters)();
        this.removeAllListeners();
        logger.info('adapter registry reset');
    }
    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------
    toEntry(type, adapter) {
        const tracked = this.entries.get(adapter.adapterId);
        return {
            type,
            adapterId: adapter.adapterId,
            status: adapter.status,
            registeredAt: tracked?.registeredAt ?? new Date().toISOString(),
        };
    }
}
exports.AdapterRegistry = AdapterRegistry;
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let instance = null;
/** Get the singleton AdapterRegistry instance. */
function getAdapterRegistry() {
    if (!instance) {
        instance = new AdapterRegistry();
    }
    return instance;
}
/** Reset the singleton (for testing). */
function resetAdapterRegistry() {
    if (instance) {
        instance.reset();
    }
    instance = null;
}
