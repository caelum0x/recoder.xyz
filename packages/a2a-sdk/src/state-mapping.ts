/**
 * @module state-mapping
 *
 * Task state mapping helpers for connector adapters.
 *
 * Each external connector (Codex, Claude Code, etc.) has its own native state
 * vocabulary. This module provides bidirectional mapping functions that
 * translate between connector-specific states and the canonical
 * `TaskState` enum defined in `@recoder/shared/a2a/schemas`.
 *
 * Adapter authors should use these mappers at the boundary where connector
 * events enter (or leave) the Recoder A2A control plane, ensuring that all
 * internal logic operates exclusively on canonical states.
 *
 * @example
 * ```ts
 * import { mapCodexState, mapClaudeState } from '@recoder/a2a-sdk/state-mapping';
 *
 * const canonical = mapCodexState('running');   // => 'working'
 * const claude    = mapClaudeState('streaming'); // => 'working'
 * ```
 */

import {
  type TaskState,
  TaskStateEnum,
  isValidTransition,
  isTerminalState,
} from '@recoder/shared/a2a/schemas';

// ---------------------------------------------------------------------------
// Connector platform identifier
// ---------------------------------------------------------------------------

/** Supported connector platforms for state mapping. */
export type ConnectorPlatform = 'codex' | 'claude_code';

// ---------------------------------------------------------------------------
// Codex state mapping
// ---------------------------------------------------------------------------

/**
 * Native states reported by the OpenAI Codex CLI / API adapter.
 * These are the raw status strings that appear in Codex task events.
 */
export type CodexNativeState =
  | 'queued'
  | 'running'
  | 'waiting_for_input'
  | 'completed'
  | 'failed'
  | 'error'
  | 'cancelled'
  | 'timeout';

/**
 * Map from Codex native states to canonical TaskState values.
 * Every known Codex state must appear exactly once as a key.
 */
const CODEX_TO_CANONICAL: Readonly<Record<CodexNativeState, TaskState>> = {
  queued: TaskStateEnum.Submitted,
  running: TaskStateEnum.Working,
  waiting_for_input: TaskStateEnum.InputRequired,
  completed: TaskStateEnum.Completed,
  failed: TaskStateEnum.Failed,
  error: TaskStateEnum.Failed,
  cancelled: TaskStateEnum.Cancelled,
  timeout: TaskStateEnum.Failed,
};

/**
 * Reverse map from canonical TaskState to the "primary" Codex native state.
 * When multiple Codex states map to the same canonical state, the most
 * common / expected one is chosen as the primary reverse mapping.
 */
const CANONICAL_TO_CODEX: Readonly<Record<TaskState, CodexNativeState>> = {
  [TaskStateEnum.Submitted]: 'queued',
  [TaskStateEnum.Working]: 'running',
  [TaskStateEnum.InputRequired]: 'waiting_for_input',
  [TaskStateEnum.Completed]: 'completed',
  [TaskStateEnum.Failed]: 'failed',
  [TaskStateEnum.Cancelled]: 'cancelled',
};

/**
 * Map a Codex native state string to the canonical `TaskState`.
 *
 * @param nativeState - The raw state string from a Codex event.
 * @returns The canonical `TaskState`, or `undefined` if the state is unknown.
 */
export function mapCodexState(nativeState: string): TaskState | undefined {
  return CODEX_TO_CANONICAL[nativeState as CodexNativeState];
}

/**
 * Map a Codex native state to canonical, throwing if the state is unknown.
 *
 * @param nativeState - The raw state string from a Codex event.
 * @returns The canonical `TaskState`.
 * @throws {Error} If the state cannot be mapped.
 */
export function mapCodexStateStrict(nativeState: string): TaskState {
  const mapped = mapCodexState(nativeState);
  if (mapped === undefined) {
    throw new Error(`Unknown Codex state: "${nativeState}"`);
  }
  return mapped;
}

/**
 * Map a canonical `TaskState` back to the primary Codex native state.
 *
 * @param canonicalState - The canonical task state.
 * @returns The Codex native state string.
 */
export function canonicalToCodexState(canonicalState: TaskState): CodexNativeState {
  return CANONICAL_TO_CODEX[canonicalState];
}

// ---------------------------------------------------------------------------
// Claude Code state mapping
// ---------------------------------------------------------------------------

/**
 * Native states reported by the Claude Code CLI / API adapter.
 * These are the raw status strings that appear in Claude Code events.
 */
export type ClaudeNativeState =
  | 'pending'
  | 'streaming'
  | 'processing'
  | 'waiting_for_approval'
  | 'waiting_for_input'
  | 'done'
  | 'completed'
  | 'error'
  | 'failed'
  | 'aborted'
  | 'cancelled'
  | 'timeout';

/**
 * Map from Claude Code native states to canonical TaskState values.
 */
const CLAUDE_TO_CANONICAL: Readonly<Record<ClaudeNativeState, TaskState>> = {
  pending: TaskStateEnum.Submitted,
  streaming: TaskStateEnum.Working,
  processing: TaskStateEnum.Working,
  waiting_for_approval: TaskStateEnum.InputRequired,
  waiting_for_input: TaskStateEnum.InputRequired,
  done: TaskStateEnum.Completed,
  completed: TaskStateEnum.Completed,
  error: TaskStateEnum.Failed,
  failed: TaskStateEnum.Failed,
  aborted: TaskStateEnum.Cancelled,
  cancelled: TaskStateEnum.Cancelled,
  timeout: TaskStateEnum.Failed,
};

/**
 * Reverse map from canonical TaskState to the primary Claude Code native state.
 */
const CANONICAL_TO_CLAUDE: Readonly<Record<TaskState, ClaudeNativeState>> = {
  [TaskStateEnum.Submitted]: 'pending',
  [TaskStateEnum.Working]: 'streaming',
  [TaskStateEnum.InputRequired]: 'waiting_for_input',
  [TaskStateEnum.Completed]: 'done',
  [TaskStateEnum.Failed]: 'error',
  [TaskStateEnum.Cancelled]: 'aborted',
};

/**
 * Map a Claude Code native state string to the canonical `TaskState`.
 *
 * @param nativeState - The raw state string from a Claude Code event.
 * @returns The canonical `TaskState`, or `undefined` if the state is unknown.
 */
export function mapClaudeState(nativeState: string): TaskState | undefined {
  return CLAUDE_TO_CANONICAL[nativeState as ClaudeNativeState];
}

/**
 * Map a Claude Code native state to canonical, throwing if the state is unknown.
 *
 * @param nativeState - The raw state string from a Claude Code event.
 * @returns The canonical `TaskState`.
 * @throws {Error} If the state cannot be mapped.
 */
export function mapClaudeStateStrict(nativeState: string): TaskState {
  const mapped = mapClaudeState(nativeState);
  if (mapped === undefined) {
    throw new Error(`Unknown Claude Code state: "${nativeState}"`);
  }
  return mapped;
}

/**
 * Map a canonical `TaskState` back to the primary Claude Code native state.
 *
 * @param canonicalState - The canonical task state.
 * @returns The Claude Code native state string.
 */
export function canonicalToClaudeState(canonicalState: TaskState): ClaudeNativeState {
  return CANONICAL_TO_CLAUDE[canonicalState];
}

// ---------------------------------------------------------------------------
// Generic / platform-agnostic mapping
// ---------------------------------------------------------------------------

/**
 * Map a native state from any supported connector to canonical `TaskState`.
 *
 * @param platform - The connector platform identifier.
 * @param nativeState - The raw state string from the connector.
 * @returns The canonical `TaskState`, or `undefined` if unmappable.
 */
export function mapConnectorState(
  platform: ConnectorPlatform,
  nativeState: string,
): TaskState | undefined {
  switch (platform) {
    case 'codex':
      return mapCodexState(nativeState);
    case 'claude_code':
      return mapClaudeState(nativeState);
    default:
      return undefined;
  }
}

/**
 * Map a native state from any supported connector to canonical `TaskState`,
 * throwing if the mapping fails.
 *
 * @param platform - The connector platform identifier.
 * @param nativeState - The raw state string from the connector.
 * @returns The canonical `TaskState`.
 * @throws {Error} If the platform or state is unknown.
 */
export function mapConnectorStateStrict(
  platform: ConnectorPlatform,
  nativeState: string,
): TaskState {
  const mapped = mapConnectorState(platform, nativeState);
  if (mapped === undefined) {
    throw new Error(
      `Cannot map state "${nativeState}" for platform "${platform}"`,
    );
  }
  return mapped;
}

/**
 * Map a canonical `TaskState` back to the primary native state for a given
 * connector platform.
 *
 * @param platform - The connector platform identifier.
 * @param canonicalState - The canonical task state.
 * @returns The native state string, or `undefined` if the platform is unknown.
 */
export function canonicalToConnectorState(
  platform: ConnectorPlatform,
  canonicalState: TaskState,
): string | undefined {
  switch (platform) {
    case 'codex':
      return canonicalToCodexState(canonicalState);
    case 'claude_code':
      return canonicalToClaudeState(canonicalState);
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Transition safety helpers
// ---------------------------------------------------------------------------

/**
 * Given the current canonical state and a new native state from a connector,
 * determine whether the implied transition is valid according to the
 * canonical lifecycle rules.
 *
 * This is the main "guard" function that adapters should call before
 * applying a state update from a connector event.
 *
 * @param currentCanonical - The current canonical task state.
 * @param platform - The connector platform identifier.
 * @param newNativeState - The new native state reported by the connector.
 * @returns An object indicating whether the transition is valid, the mapped
 *          canonical state, and an error message if invalid.
 */
export function checkConnectorTransition(
  currentCanonical: TaskState,
  platform: ConnectorPlatform,
  newNativeState: string,
): {
  valid: boolean;
  mappedState: TaskState | undefined;
  error?: string;
} {
  const mappedState = mapConnectorState(platform, newNativeState);

  if (mappedState === undefined) {
    return {
      valid: false,
      mappedState: undefined,
      error: `Unknown ${platform} state: "${newNativeState}"`,
    };
  }

  // Same state is a no-op, always valid
  if (mappedState === currentCanonical) {
    return { valid: true, mappedState };
  }

  if (!isValidTransition(currentCanonical, mappedState)) {
    return {
      valid: false,
      mappedState,
      error: `Invalid transition: ${currentCanonical} -> ${mappedState} (from ${platform} state "${newNativeState}")`,
    };
  }

  return { valid: true, mappedState };
}

/**
 * Check whether a connector-reported native state maps to a terminal
 * canonical state.
 *
 * @param platform - The connector platform identifier.
 * @param nativeState - The native state to check.
 * @returns `true` if the mapped canonical state is terminal; `false` if
 *          non-terminal or unmappable.
 */
export function isConnectorTerminalState(
  platform: ConnectorPlatform,
  nativeState: string,
): boolean {
  const mapped = mapConnectorState(platform, nativeState);
  return mapped !== undefined && isTerminalState(mapped);
}
