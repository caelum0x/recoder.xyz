"use strict";
/**
 * @module a2a-persistence
 *
 * JSON file persistence helpers for A2A workspaces, dispatches, tasks,
 * approval requests, and recent events.
 * Uses the same data/ directory and loadStore/saveStore pattern as the rest
 * of the codebase.
 *
 * Maps are serialised as arrays of [key, value] entries so that standard
 * JSON round-tripping works correctly.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadA2AWorkspaces = loadA2AWorkspaces;
exports.saveA2AWorkspaces = saveA2AWorkspaces;
exports.loadA2ADispatches = loadA2ADispatches;
exports.saveA2ADispatches = saveA2ADispatches;
exports.loadA2ATasks = loadA2ATasks;
exports.saveA2ATasks = saveA2ATasks;
exports.saveA2ATasksImmediate = saveA2ATasksImmediate;
exports.loadA2AApprovals = loadA2AApprovals;
exports.saveA2AApprovals = saveA2AApprovals;
exports.loadA2AEvents = loadA2AEvents;
exports.saveA2AEvents = saveA2AEvents;
const persistence_js_1 = require("../persistence.js");
// ---------------------------------------------------------------------------
// Store names (resolve to data/a2a-*.json)
// ---------------------------------------------------------------------------
const WORKSPACES_STORE = 'a2a-workspaces';
const DISPATCHES_STORE = 'a2a-dispatches';
const TASKS_STORE = 'a2a-tasks';
const APPROVALS_STORE = 'a2a-approvals';
const EVENTS_STORE = 'a2a-events';
/** Maximum number of recent events persisted to disk. */
const MAX_PERSISTED_EVENTS = 1000;
/** Debounce delay for high-frequency writes (tasks, events). */
const DEBOUNCE_MS = 250;
// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------
function loadA2AWorkspaces() {
    const entries = (0, persistence_js_1.loadStore)(WORKSPACES_STORE, []);
    try {
        return new Map(entries);
    }
    catch {
        return new Map();
    }
}
function saveA2AWorkspaces(workspaces) {
    (0, persistence_js_1.saveStore)(WORKSPACES_STORE, [...workspaces.entries()]);
}
// ---------------------------------------------------------------------------
// Dispatches
// ---------------------------------------------------------------------------
function loadA2ADispatches() {
    const entries = (0, persistence_js_1.loadStore)(DISPATCHES_STORE, []);
    try {
        return new Map(entries);
    }
    catch {
        return new Map();
    }
}
function saveA2ADispatches(dispatches) {
    (0, persistence_js_1.saveStore)(DISPATCHES_STORE, [...dispatches.entries()]);
}
// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
function loadA2ATasks() {
    const entries = (0, persistence_js_1.loadStore)(TASKS_STORE, []);
    try {
        return new Map(entries);
    }
    catch {
        return new Map();
    }
}
function saveA2ATasks(tasks) {
    (0, persistence_js_1.debouncedSave)(TASKS_STORE, [...tasks.entries()], DEBOUNCE_MS);
}
/** Force an immediate (non-debounced) save -- useful during shutdown. */
function saveA2ATasksImmediate(tasks) {
    (0, persistence_js_1.saveStore)(TASKS_STORE, [...tasks.entries()]);
}
// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------
function loadA2AApprovals() {
    const entries = (0, persistence_js_1.loadStore)(APPROVALS_STORE, []);
    try {
        return new Map(entries);
    }
    catch {
        return new Map();
    }
}
function saveA2AApprovals(approvals) {
    (0, persistence_js_1.saveStore)(APPROVALS_STORE, [...approvals.entries()]);
}
// ---------------------------------------------------------------------------
// Recent events (capped at MAX_PERSISTED_EVENTS)
// ---------------------------------------------------------------------------
function loadA2AEvents() {
    const events = (0, persistence_js_1.loadStore)(EVENTS_STORE, []);
    try {
        // Ensure the cap is honoured on load
        if (events.length > MAX_PERSISTED_EVENTS) {
            return events.slice(-MAX_PERSISTED_EVENTS);
        }
        return events;
    }
    catch {
        return [];
    }
}
function saveA2AEvents(events) {
    // Cap before writing
    const capped = events.length > MAX_PERSISTED_EVENTS
        ? events.slice(-MAX_PERSISTED_EVENTS)
        : events;
    (0, persistence_js_1.debouncedSave)(EVENTS_STORE, capped, DEBOUNCE_MS);
}
