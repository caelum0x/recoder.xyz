/**
 * command-bus — the single validated write entry to the engine (design §4.6).
 *
 * Every command is zod-parsed (`commandSchema`) before it reaches a module
 * shell; an invalid command fails fast with `INVALID_COMMAND` and never touches
 * the core. The bus owns NO domain logic — it validates, then delegates each
 * command kind to the already-wired module shell (LockManager, DispatchManager,
 * HandoffService, Reconciler) and returns a `Result` (the boundary never
 * throws, per design §9).
 */

import { CoordinationError, CoordinationErrorCode } from '../errors';
import { err, type Result } from '../result';
import type { DispatchDecision, WorkLock } from '../domain';
import type { LockManager } from '../locks';
import type { DispatchManager } from '../dispatch';
import type { HandoffService, InitiateHandoffSuccess } from '../handoff/handoff-service';
import type { Reconciler } from '../coherence';
import type { ReconcileResult } from '../coherence/reconciler';
import {
  commandSchema,
  type CoordinationCommand,
} from './commands';

export type CommandBusDeps = {
  lockManager: LockManager;
  dispatchManager: DispatchManager;
  handoffService: HandoffService;
  reconciler: Reconciler;
  /** Max delegation-chain depth a root handoff may seed (config.handoff.maxDepth). */
  handoffMaxDepth: number;
};

/** Discriminated result of a command, mirroring the command kind. */
export type CommandResult =
  | { kind: 'AcquireLock'; lock: WorkLock }
  | { kind: 'ReleaseLock' }
  | { kind: 'RenewLock'; lock: WorkLock }
  | { kind: 'DispatchTask'; decision: DispatchDecision }
  | { kind: 'InitiateHandoff'; handoff: InitiateHandoffSuccess }
  | { kind: 'Reconcile'; result: ReconcileResult };

export class CommandBus {
  constructor(private readonly deps: CommandBusDeps) {}

  /**
   * Validate + execute a command. Returns a `Result`: `Ok` with the
   * kind-specific payload, or `Err` with a typed `CoordinationError`.
   */
  async execute(input: unknown): Promise<Result<CommandResult, CoordinationError>> {
    const parsed = commandSchema.safeParse(input);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      return err(
        new CoordinationError(
          CoordinationErrorCode.INVALID_COMMAND,
          `Invalid coordination command: ${detail}`,
        ),
      );
    }
    return this.dispatch(parsed.data);
  }

  private async dispatch(
    command: CoordinationCommand,
  ): Promise<Result<CommandResult, CoordinationError>> {
    switch (command.kind) {
      case 'AcquireLock': {
        const result = await this.deps.lockManager.acquire({
          spaceId: command.spaceId,
          ...(command.repo ? { repo: command.repo } : {}),
          pathGlob: command.pathGlob,
          ownerAgentId: command.ownerAgentId,
          taskId: command.taskId,
          kind: command.lockKind,
          ...(command.ttlMs ? { ttlMs: command.ttlMs } : {}),
        });
        return result.ok ? { ok: true, value: { kind: 'AcquireLock', lock: result.value } } : result;
      }
      case 'ReleaseLock': {
        const result = await this.deps.lockManager.release({
          lockId: command.lockId,
          ...(command.ownerAgentId ? { ownerAgentId: command.ownerAgentId } : {}),
          ...(command.taskId ? { taskId: command.taskId } : {}),
          ...(command.fenceToken !== undefined ? { fenceToken: command.fenceToken } : {}),
        });
        return result.ok ? { ok: true, value: { kind: 'ReleaseLock' } } : result;
      }
      case 'RenewLock': {
        const result = await this.deps.lockManager.renew({
          lockId: command.lockId,
          ownerAgentId: command.ownerAgentId,
          taskId: command.taskId,
          fenceToken: command.fenceToken,
          ...(command.ttlMs ? { ttlMs: command.ttlMs } : {}),
        });
        return result.ok ? { ok: true, value: { kind: 'RenewLock', lock: result.value } } : result;
      }
      case 'DispatchTask': {
        const result = await this.deps.dispatchManager.dispatch({
          task: command.task,
          ...(command.space ? { space: command.space } : {}),
          ...(command.requestedAssigneeAgentId
            ? { requestedAssigneeAgentId: command.requestedAssigneeAgentId }
            : {}),
          ...(command.pattern ? { pattern: command.pattern } : {}),
        });
        return result.ok
          ? { ok: true, value: { kind: 'DispatchTask', decision: result.value } }
          : result;
      }
      case 'InitiateHandoff': {
        const result = await this.deps.handoffService.initiate({
          parsed: {
            intent: command.intent,
            targetAgentId: command.targetAgentId,
            prompt: command.prompt,
          },
          fromAgentId: command.fromAgentId,
          maxDepth: this.deps.handoffMaxDepth,
          ...(command.spaceId ? { spaceId: command.spaceId } : {}),
          ...(command.channelId ? { channelId: command.channelId } : {}),
          ...(command.sourceTaskId ? { sourceTaskId: command.sourceTaskId } : {}),
          ...(command.contextSourceTaskId
            ? { contextSourceTaskId: command.contextSourceTaskId }
            : {}),
          ...(command.contextTargetTaskId
            ? { contextTargetTaskId: command.contextTargetTaskId }
            : {}),
        });
        return result.ok
          ? { ok: true, value: { kind: 'InitiateHandoff', handoff: result.value } }
          : result;
      }
      case 'Reconcile': {
        const result = await this.deps.reconciler.tick();
        return { ok: true, value: { kind: 'Reconcile', result } };
      }
    }
  }
}
