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

import { loadStore, saveStore, debouncedSave } from '../persistence.js';
import type { A2AWorkspace } from './workspace.service';
import type { DispatchRecord, ApprovalRequest } from '@recoder/shared/a2a';
import type { TaskEnvelope } from '@recoder/shared/a2a';
import type { A2AEvent } from './a2a-event-bus';
import type { RegisteredAgent } from '@recoder/shared/a2a';
import type { AgentLifecycleMetadata } from './agent-registry.service';

// ---------------------------------------------------------------------------
// Store names (resolve to data/a2a-*.json)
// ---------------------------------------------------------------------------

const WORKSPACES_STORE = 'a2a-workspaces';
const DISPATCHES_STORE = 'a2a-dispatches';
const TASKS_STORE = 'a2a-tasks';
const APPROVALS_STORE = 'a2a-approvals';
const EVENTS_STORE = 'a2a-events';
const AGENT_REGISTRY_STORE = 'a2a-agent-registry';
const MEMORY_CANDIDATES_STORE = 'a2a-memory-candidates';

/** Maximum number of recent events persisted to disk. */
const MAX_PERSISTED_EVENTS = 1000;

/** Debounce delay for high-frequency writes (tasks, events). */
const DEBOUNCE_MS = 250;

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

export function loadA2AWorkspaces(): Map<string, A2AWorkspace> {
  const entries = loadStore<[string, A2AWorkspace][]>(WORKSPACES_STORE, []);
  try {
    return new Map(entries);
  } catch {
    return new Map();
  }
}

export function saveA2AWorkspaces(workspaces: Map<string, A2AWorkspace>): void {
  saveStore(WORKSPACES_STORE, [...workspaces.entries()]);
}

// ---------------------------------------------------------------------------
// Dispatches
// ---------------------------------------------------------------------------

export function loadA2ADispatches(): Map<string, DispatchRecord> {
  const entries = loadStore<[string, DispatchRecord][]>(DISPATCHES_STORE, []);
  try {
    return new Map(entries);
  } catch {
    return new Map();
  }
}

export function saveA2ADispatches(dispatches: Map<string, DispatchRecord>): void {
  saveStore(DISPATCHES_STORE, [...dispatches.entries()]);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export function loadA2ATasks(): Map<string, TaskEnvelope> {
  const entries = loadStore<[string, TaskEnvelope][]>(TASKS_STORE, []);
  try {
    return new Map(entries);
  } catch {
    return new Map();
  }
}

export function saveA2ATasks(tasks: Map<string, TaskEnvelope>): void {
  debouncedSave(TASKS_STORE, [...tasks.entries()], DEBOUNCE_MS);
}

/** Force an immediate (non-debounced) save -- useful during shutdown. */
export function saveA2ATasksImmediate(tasks: Map<string, TaskEnvelope>): void {
  saveStore(TASKS_STORE, [...tasks.entries()]);
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export function loadA2AApprovals(): Map<string, ApprovalRequest> {
  const entries = loadStore<[string, ApprovalRequest][]>(APPROVALS_STORE, []);
  try {
    return new Map(entries);
  } catch {
    return new Map();
  }
}

export function saveA2AApprovals(approvals: Map<string, ApprovalRequest>): void {
  saveStore(APPROVALS_STORE, [...approvals.entries()]);
}

// ---------------------------------------------------------------------------
// Recent events (capped at MAX_PERSISTED_EVENTS)
// ---------------------------------------------------------------------------

export function loadA2AEvents(): A2AEvent[] {
  const events = loadStore<A2AEvent[]>(EVENTS_STORE, []);
  try {
    // Ensure the cap is honoured on load
    if (events.length > MAX_PERSISTED_EVENTS) {
      return events.slice(-MAX_PERSISTED_EVENTS);
    }
    return events;
  } catch {
    return [];
  }
}

export function saveA2AEvents(events: A2AEvent[]): void {
  // Cap before writing
  const capped =
    events.length > MAX_PERSISTED_EVENTS
      ? events.slice(-MAX_PERSISTED_EVENTS)
      : events;
  debouncedSave(EVENTS_STORE, capped, DEBOUNCE_MS);
}

// ---------------------------------------------------------------------------
// Agent registry
// ---------------------------------------------------------------------------

export interface PersistedA2AAgentRegistryState {
  agents: Array<[string, RegisteredAgent]>;
  heartbeats: Array<[string, string]>;
  lifecycle?: Array<[string, AgentLifecycleMetadata]>;
}

export function loadA2AAgentRegistryState(): {
  agents: Map<string, RegisteredAgent>;
  heartbeats: Map<string, string>;
  lifecycle: Map<string, AgentLifecycleMetadata>;
} {
  const raw = loadStore<PersistedA2AAgentRegistryState | null>(AGENT_REGISTRY_STORE, null);
  if (!raw || typeof raw !== 'object') {
    return {
      agents: new Map(),
      heartbeats: new Map(),
      lifecycle: new Map(),
    };
  }

  try {
    return {
      agents: new Map(raw.agents || []),
      heartbeats: new Map(raw.heartbeats || []),
      lifecycle: new Map(raw.lifecycle || []),
    };
  } catch {
    return {
      agents: new Map(),
      heartbeats: new Map(),
      lifecycle: new Map(),
    };
  }
}

export function saveA2AAgentRegistryState(input: {
  agents: Map<string, RegisteredAgent>;
  heartbeats: Map<string, string>;
  lifecycle: Map<string, AgentLifecycleMetadata>;
}): void {
  debouncedSave(
    AGENT_REGISTRY_STORE,
    {
      agents: [...input.agents.entries()],
      heartbeats: [...input.heartbeats.entries()],
      lifecycle: [...input.lifecycle.entries()],
    },
    DEBOUNCE_MS,
  );
}

// ---------------------------------------------------------------------------
// Memory candidates
// ---------------------------------------------------------------------------

export function loadA2AMemoryCandidates<T>(): Map<string, T> {
  const entries = loadStore<[string, T][]>(MEMORY_CANDIDATES_STORE, []);
  try {
    return new Map(entries);
  } catch {
    return new Map();
  }
}

export function saveA2AMemoryCandidates<T>(candidates: Map<string, T>): void {
  saveStore(MEMORY_CANDIDATES_STORE, [...candidates.entries()]);
}
