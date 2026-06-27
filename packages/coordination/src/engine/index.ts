/**
 * engine barrel — the composed CORE ENGINE (facade over the four modules).
 *
 * `CoordinationEngine` + `buildCoordinationEngine` are the primary public entry;
 * the command/query ADTs + schemas are the validated boundary; the effect-runner
 * + transaction are the single IO + atomic-commit seam.
 */

export { CoordinationEngine, type CoordinationEngineParts } from './coordination-engine';
export {
  buildCoordinationEngine,
  type CoordinationEngineOptions,
} from './engine-builder';

export { CommandBus, type CommandBusDeps, type CommandResult } from './command-bus';
export { QueryBus, type QueryBusDeps, type QueryResult } from './query-bus';

export {
  EffectRunner,
  runEffect,
  runEffects,
  type EffectRunnerPorts,
} from './effect-runner';
export { commitTransaction, type TransactionPorts } from './transaction';

// ── Command ADT + schemas ──────────────────────────────────────────────────────
export {
  commandSchema,
  acquireLockCommandSchema,
  releaseLockCommandSchema,
  renewLockCommandSchema,
  dispatchTaskCommandSchema,
  initiateHandoffCommandSchema,
  reconcileCommandSchema,
} from './commands';
export type {
  CoordinationCommand,
  CommandKind,
  AcquireLockCommand,
  ReleaseLockCommand,
  RenewLockCommand,
  DispatchTaskCommand,
  InitiateHandoffCommand,
  ReconcileCommand,
} from './commands';

// ── Query ADT + schemas ──────────────────────────────────────────────────────
export {
  querySchema,
  activeLocksQuerySchema,
  readySetQuerySchema,
  driftReportQuerySchema,
} from './queries';
export type {
  CoordinationQuery,
  QueryKind,
  ActiveLocksQuery,
  ReadySetQuery,
  DriftReportQuery,
} from './queries';
