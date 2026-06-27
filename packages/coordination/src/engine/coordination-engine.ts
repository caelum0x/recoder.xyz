/**
 * CoordinationEngine — the composed facade consumers use (design §4.6). It owns
 * NO coordination state; it wires the four capability modules (locks, dispatch,
 * handoff, coherence) to the injected ports through a validated command/query
 * boundary.
 *
 * Construct it with `buildCoordinationEngine` (engine-builder) which assembles
 * the module shells from ports + config. The engine exposes:
 *  - `execute(command)` — the validated write boundary (command-bus).
 *  - `query(query)`     — the validated read boundary (query-bus).
 *  - `reconcile()`      — run one coherence pass (convenience over the command).
 *  - the wired module shells (for advanced callers that want direct access).
 *
 * Every entry returns a `Result` (the boundary never throws, per design §9).
 */

import type { CoordinationError } from '../errors';
import type { Result } from '../result';
import type { LockManager } from '../locks';
import type { DispatchManager } from '../dispatch';
import type { HandoffService } from '../handoff/handoff-service';
import type { Reconciler } from '../coherence';
import type { ReconcileResult } from '../coherence/reconciler';
import { CommandBus, type CommandResult } from './command-bus';
import { QueryBus, type QueryResult } from './query-bus';

export type CoordinationEngineParts = {
  commandBus: CommandBus;
  queryBus: QueryBus;
  lockManager: LockManager;
  dispatchManager: DispatchManager;
  handoffService: HandoffService;
  reconciler: Reconciler;
};

export class CoordinationEngine {
  private readonly commandBus: CommandBus;
  private readonly queryBus: QueryBus;

  /** The wired module shells, exposed for advanced/direct use. */
  readonly locks: LockManager;
  readonly dispatch: DispatchManager;
  readonly handoff: HandoffService;
  readonly coherence: Reconciler;

  constructor(parts: CoordinationEngineParts) {
    this.commandBus = parts.commandBus;
    this.queryBus = parts.queryBus;
    this.locks = parts.lockManager;
    this.dispatch = parts.dispatchManager;
    this.handoff = parts.handoffService;
    this.coherence = parts.reconciler;
  }

  /** Validated write boundary: parse + execute a command. */
  execute(command: unknown): Promise<Result<CommandResult, CoordinationError>> {
    return this.commandBus.execute(command);
  }

  /** Validated read boundary: parse + execute a query. */
  query(query: unknown): Promise<Result<QueryResult, CoordinationError>> {
    return this.queryBus.execute(query);
  }

  /** Run one coherence reconcile pass (convenience over the Reconcile command). */
  reconcile(): Promise<ReconcileResult> {
    return this.coherence.tick();
  }
}
