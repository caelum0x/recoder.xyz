/**
 * `handoff` — the explicit A2A HANDOFF verb: transfer an in-flight task from the
 * current worker to another registered target (a local runtime or a remote peer),
 * carrying the accumulated CONTEXT BUNDLE so the receiver inherits prior turns +
 * peer notes without re-deriving them.
 *
 * It composes three owned services — it invents no state of its own:
 *   1. {@link ContextBridgeService} builds the read-only bundle + records the
 *      handoff on the shared scratchpad;
 *   2. {@link TaskLifecycleService} owner-scopes the task (a not-owned/absent task
 *      is a truthful `not_found`, never a fabricated handoff) and logs a `system`
 *      handoff message into the projection;
 *   3. {@link MultiDispatchService} seals + routes the handoff envelope onto the
 *      SAME `taskId` (single target, `all` strategy).
 *
 * Fail-closed + degrade-safe: with no conductor/remote seam wired the dispatch
 * leg fails truthfully and the handoff returns `ok:false` carrying that leg's
 * reason — the receiver is never reported as engaged when it was not reached.
 */
import type { EnvelopeService } from '../wire/a2a-envelope.service.js';
import type { ContextBridgeService, ContextBundle } from '../bridge/context-bridge.js';
import type { DispatchLeg, MultiDispatchService } from './multi-dispatch.js';
import type { TaskLifecycleService } from './task-lifecycle.js';

export interface HandoffInput {
  readonly taskId: string;
  /** Owner scope — a handoff is only performed for a task the caller owns. */
  readonly userId: string;
  /** The registered agent id to hand the task off to. */
  readonly target: string;
  /** Optional human-readable reason recorded on the scratchpad + handoff message. */
  readonly note?: string;
  /** Optional prompt override for a runtime target (defaults to the note/summary). */
  readonly prompt?: string;
}

export interface HandoffResult {
  readonly ok: boolean;
  readonly taskId: string;
  readonly target: string;
  /** Stable outcome code (`handed_off | not_found | dispatch_failed`). */
  readonly code: string;
  readonly reason: string;
  /** The dispatch leg to the receiver — present once the task is owned. */
  readonly leg?: DispatchLeg;
  /** The context bundle that was handed over — present once the task is owned. */
  readonly bundle?: ContextBundle;
}

export interface HandoffService {
  handoff(input: HandoffInput): Promise<HandoffResult>;
}

export interface HandoffDeps {
  readonly tasks: TaskLifecycleService;
  readonly contextBridge: ContextBridgeService;
  readonly dispatch: MultiDispatchService;
  readonly envelope: EnvelopeService;
}

/** Build the handoff service. Pure factory; degrade-safe by construction. */
export function createHandoffService(deps: HandoffDeps): HandoffService {
  const { tasks, contextBridge, dispatch, envelope } = deps;

  return {
    async handoff(input: HandoffInput): Promise<HandoffResult> {
      // Owner-scope first: refuse to hand off a task the caller does not own.
      const task = await tasks.get(input.taskId, input.userId);
      if (!task) {
        return { ok: false, taskId: input.taskId, target: input.target, code: 'not_found', reason: `Task ${input.taskId} not found or not owned.` };
      }

      const bundle = await contextBridge.build({ taskId: input.taskId, userId: input.userId });
      const summary = `Handoff to ${input.target}${input.note ? `: ${input.note}` : ''}`;

      // Record the handoff on the projection + shared scratchpad (auditable trail).
      await tasks.appendMessage({
        taskId: input.taskId,
        role: 'system',
        parts: [{ kind: 'handoff', to: input.target, note: input.note ?? null, messageCount: bundle.messages.length }],
      });
      await contextBridge.note({ taskId: input.taskId, author: input.userId, note: summary });

      // Seal + route the handoff envelope onto the SAME task (single target).
      const env = envelope.buildEnvelope({
        from: input.userId,
        to: input.target,
        kind: 'handoff',
        payload: {
          text: input.prompt ?? input.note ?? summary,
          handoff: { taskId: input.taskId, from: task.runtimeId ?? input.userId, note: input.note ?? null },
        },
        ...(task.correlation !== undefined ? { correlationId: task.correlation } : {}),
      });

      const dispatched = await dispatch.dispatch({
        userId: input.userId,
        targets: [input.target],
        envelope: env,
        taskId: input.taskId,
        strategy: 'all',
        ...(input.prompt !== undefined || input.note !== undefined
          ? { prompt: input.prompt ?? input.note }
          : {}),
      });

      const leg = dispatched.legs[0];
      if (!dispatched.ok || !leg?.ok) {
        return {
          ok: false,
          taskId: input.taskId,
          target: input.target,
          code: 'dispatch_failed',
          reason: leg?.reason ?? 'Handoff dispatch failed — receiver not reached.',
          ...(leg ? { leg } : {}),
          bundle,
        };
      }
      return { ok: true, taskId: input.taskId, target: input.target, code: 'handed_off', reason: `Task ${input.taskId} handed off to ${input.target}.`, leg, bundle };
    },
  };
}
