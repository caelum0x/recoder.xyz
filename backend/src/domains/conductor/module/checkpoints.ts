/**
 * Checkpoint & restore (git snapshot capability) behind the `ConductorComposer`
 * facade: governed checkpoint/restore/branch plus the read-only list. Every
 * method body moved VERBATIM from the composer.
 */
import { systemClock, uuidId } from '@recoder/substrate';
import type { Principal } from '../../identity/types.js';
import type { CheckpointRecord } from '../ports/checkpoint-store.port.js';
import {
  branchFromCheckpoint as branchFromCheckpointOp,
  createCheckpoint as createCheckpointOp,
  listCheckpoints as listCheckpointsOp,
  restoreCheckpoint as restoreCheckpointOp,
  type BranchFromCheckpointInput,
  type BranchOpsDeps,
  type BranchResultView,
  type CheckpointOpsDeps,
  type CreateCheckpointInput,
  type RestoreResultView,
} from '../services/checkpoint.service.js';
import {
  conductorAuditEntry,
  conductorTarget,
  guardConductorWrite,
  recordConductorAudit,
} from '../audit/conductor-audit.js';
import {
  injectWorktreeMcp,
  type ConductorContext,
  type ConductorWriteResult,
} from './shared.js';

export class ConductorCheckpoints {
  constructor(private readonly ctx: ConductorContext) {}

  /** The narrow deps slice the checkpoint ops run over (git seams + store). */
  private checkpointDeps(): CheckpointOpsDeps {
    return {
      getWorkspace: id => this.ctx.engine.getWorkspace(id),
      store: this.ctx.checkpointStore,
      logger: this.ctx.log,
      newId: () => uuidId.newId(),
      now: () => systemClock.now(),
    };
  }

  /**
   * Capture a CHECKPOINT of the workspace's git state — GATED
   * (`workspace.checkpoint`). Non-destructive: tags the committed HEAD plus any
   * captured uncommitted work. A missing worktree refuses truthfully.
   */
  async checkpointWorkspace(
    workspaceId: string,
    input: { label?: string; description?: string },
    principal: Principal
  ): Promise<ConductorWriteResult<CheckpointRecord>> {
    const action = 'workspace.checkpoint';
    const workspace = await this.ctx.engine.getWorkspace(workspaceId);
    const { allowed, verdict } = await guardConductorWrite(
      this.ctx.gate,
      action,
      principal,
      {
        target: conductorTarget('workspace', workspaceId),
        ...(workspace?.taskId ? { taskId: workspace.taskId } : {}),
        metadata: { workspaceId },
      }
    );
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    try {
      const opInput: CreateCheckpointInput = {
        ...(input.label ? { label: input.label } : {}),
        ...(input.description ? { description: input.description } : {}),
        createdBy: principal.userId,
      };
      const record = await createCheckpointOp(
        this.checkpointDeps(),
        workspaceId,
        opInput
      );
      await recordConductorAudit(
        this.ctx.gate,
        conductorAuditEntry(action, principal, verdict, {
          workspaceId,
          checkpointId: record.checkpointId,
          ref: record.ref,
        })
      );
      return { ok: true, verdict, value: record };
    } catch (err) {
      return {
        ok: false,
        verdict,
        reason: err instanceof Error ? err.message : 'checkpoint failed',
      };
    }
  }

  /** List a workspace's checkpoints (newest-first). Read-only. */
  async listWorkspaceCheckpoints(
    workspaceId: string
  ): Promise<readonly CheckpointRecord[]> {
    return listCheckpointsOp({ store: this.ctx.checkpointStore }, workspaceId);
  }

  /**
   * RESTORE a workspace's worktree to a checkpoint — GATED (`workspace.restore`).
   * Takes an automatic safety snapshot first, then reproduces the checkpoint's
   * file state. A missing worktree / unknown checkpoint refuses truthfully.
   */
  async restoreCheckpoint(
    workspaceId: string,
    checkpointId: string,
    principal: Principal
  ): Promise<ConductorWriteResult<RestoreResultView>> {
    const action = 'workspace.restore';
    const workspace = await this.ctx.engine.getWorkspace(workspaceId);
    const { allowed, verdict } = await guardConductorWrite(
      this.ctx.gate,
      action,
      principal,
      {
        target: conductorTarget('workspace', workspaceId, 'checkpoint', checkpointId),
        ...(workspace?.taskId ? { taskId: workspace.taskId } : {}),
        metadata: { workspaceId, checkpointId },
      }
    );
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    try {
      const result = await restoreCheckpointOp(
        this.checkpointDeps(),
        workspaceId,
        checkpointId
      );
      await recordConductorAudit(
        this.ctx.gate,
        conductorAuditEntry(action, principal, verdict, {
          workspaceId,
          checkpointId,
          restoredTo: result.restoredTo,
        })
      );
      return { ok: true, verdict, value: result };
    } catch (err) {
      return {
        ok: false,
        verdict,
        reason: err instanceof Error ? err.message : 'restore failed',
      };
    }
  }

  /**
   * BRANCH a NEW workspace from a checkpoint — GATED (`workspace.branch`): launch
   * a fresh workspace whose base ref is the checkpoint tag. The launched workspace
   * runs the same capability seams as a normal create (`.mcp.json` injection).
   */
  async branchFromCheckpoint(
    workspaceId: string,
    checkpointId: string,
    input: {
      branch?: string;
      runtimeId?: string;
      taskId?: string;
      prompt?: string;
    },
    principal: Principal
  ): Promise<ConductorWriteResult<BranchResultView>> {
    const action = 'workspace.branch';
    const source = await this.ctx.engine.getWorkspace(workspaceId);
    const { allowed, verdict } = await guardConductorWrite(
      this.ctx.gate,
      action,
      principal,
      {
        target: conductorTarget('workspace', workspaceId, 'checkpoint', checkpointId),
        ...(source?.taskId ? { taskId: source.taskId } : {}),
        metadata: { workspaceId, checkpointId },
      }
    );
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    try {
      const branchInput: BranchFromCheckpointInput = {
        ...(input.branch ? { branch: input.branch } : {}),
        ...(input.runtimeId ? { runtimeId: input.runtimeId } : {}),
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.prompt ? { prompt: input.prompt } : {}),
        createdBy: principal.userId,
      };
      const deps: BranchOpsDeps = {
        ...this.checkpointDeps(),
        createWorkspace: createInput =>
          this.ctx.engine.createWorkspace(createInput),
      };
      const result = await branchFromCheckpointOp(
        deps,
        workspaceId,
        checkpointId,
        branchInput
      );
      // Same post-launch seam as createWorkspace: point the branched agent at the
      // governed backend MCP host (fire-and-forget + degrade-safe).
      injectWorktreeMcp(this.ctx, result.workspace);
      await recordConductorAudit(
        this.ctx.gate,
        conductorAuditEntry(action, principal, verdict, {
          workspaceId,
          checkpointId,
          newWorkspaceId: result.workspace.workspaceId,
        })
      );
      return { ok: true, verdict, value: result };
    } catch (err) {
      return {
        ok: false,
        verdict,
        reason: err instanceof Error ? err.message : 'branch failed',
      };
    }
  }
}
