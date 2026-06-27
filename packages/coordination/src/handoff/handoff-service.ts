/**
 * handoff-service — initiate / accept / complete a handoff.
 *
 * MERGED from the `processHandoff` / `executeDelegation` flow of
 * `docker-backend/src/a2a/autonomous-routing.service.ts`, decoupled from the
 * backend singletons (`getTaskLifecycleService` / `getApprovalGateService` /
 * `getA2AEventBus`). Instead of globals it takes PORTS
 * (`agent-directory`, `approval-gate`, `handoff-store`, `id-generator`, `clock`)
 * and pure helpers (parser, depth/cycle guards, envelope codec, dedup ledger,
 * context transfer, events).
 *
 * Two layers:
 *  - `planHandoff` (PURE): validate depth + cycle, mint the `Handoff` value, and
 *    emit the `handoff.initiated` effect — no IO, fully unit-testable.
 *  - `HandoffService` (IMPURE SHELL): resolve target via the directory, gate via
 *    approval, dedup via store + ledger, transfer context best-effort, then
 *    deliver the envelope + publish the event. Mirrors the source ordering
 *    (approval → delegate → context transfer → completed) but returns
 *    `Result`/effects rather than mutating task metadata.
 */

import { assertDepth, nextDepth } from './depth-guard';
import { assertNoCycle } from './cycle-detector';
import { encodeEnvelope } from './envelope-codec';
import { handoffInitiatedEvent } from './handoff-events';
import { gateHandoff } from './approval-gate-adapter';
import { transferContext, type ContextTransferPort } from './context-transfer';
import { CoordinationError, CoordinationErrorCode, isCoordinationError } from '../errors';
import { err, ok, type Result } from '../result';
import type {
  Effect,
  Handoff,
  HandoffEnvelope,
  HandoffIntent,
  ParsedHandoffIntent,
} from '../domain';
import type { AgentDirectoryPort } from '../ports/agent-directory';
import type { ApprovalGatePort } from '../ports/approval-gate';
import type { ClockPort } from '../ports/clock';
import type { HandoffStorePort } from '../ports/handoff-store';
import type { IdGeneratorPort } from '../ports/id-generator';

// ---------------------------------------------------------------------------
// Pure planning
// ---------------------------------------------------------------------------

export type PlanHandoffInput = {
  intent: HandoffIntent;
  fromAgentId: string;
  toAgentId: string;
  prompt: string;
  handoffId: string;
  eventId: string;
  now: string;
  maxDepth: number;
  spaceId?: string;
  channelId?: string;
  sourceTaskId?: string;
  /** Parent handoff in the chain, if this is a sub-handoff. */
  parent?: { handoffId: string; depth: number; rootHandoffId?: string; participants: ReadonlySet<string> };
};

export type PlannedHandoff = {
  handoff: Handoff;
  effects: Effect[];
};

/**
 * PURE: validate depth + cycle and mint the initiated handoff. Throws typed
 * coordination errors (`HandoffDepthExceededError` / `HandoffCycleError`) which
 * the shell maps to `Result.err`. Returns the new handoff + its initiated effect.
 */
export function planHandoff(input: PlanHandoffInput): PlannedHandoff {
  const depth = assertDepth(nextDepth(input.parent?.depth), input.maxDepth);
  assertNoCycle(input.parent?.participants ?? new Set<string>(), input.fromAgentId, input.toAgentId);

  const handoff: Handoff = {
    handoffId: input.handoffId,
    intent: input.intent,
    fromAgentId: input.fromAgentId,
    toAgentId: input.toAgentId,
    ...(input.spaceId ? { spaceId: input.spaceId } : {}),
    ...(input.channelId ? { channelId: input.channelId } : {}),
    ...(input.sourceTaskId ? { sourceTaskId: input.sourceTaskId } : {}),
    prompt: input.prompt,
    status: 'initiated',
    depth,
    ...(input.parent ? { parentHandoffId: input.parent.handoffId } : {}),
    rootHandoffId: input.parent?.rootHandoffId ?? input.parent?.handoffId ?? input.handoffId,
    initiatedAt: input.now,
  };

  const initiated: Effect = {
    type: 'PublishEvent',
    event: handoffInitiatedEvent({
      handoff,
      eventId: input.eventId,
      time: input.now,
      dedupKey: `handoff.initiated:${handoff.handoffId}`,
    }),
  };

  return { handoff, effects: [initiated] };
}

// ---------------------------------------------------------------------------
// Impure orchestration
// ---------------------------------------------------------------------------

export type InitiateHandoffInput = {
  parsed: ParsedHandoffIntent;
  fromAgentId: string;
  maxDepth: number;
  spaceId?: string;
  channelId?: string;
  sourceTaskId?: string;
  /** Optional context source task to carry forward (handoff context transfer). */
  contextSourceTaskId?: string;
  contextTargetTaskId?: string;
};

export type InitiateHandoffSuccess = {
  handoff: Handoff;
  envelope: HandoffEnvelope;
  effects: Effect[];
};

export type HandoffServiceDeps = {
  directory: AgentDirectoryPort;
  approvals: ApprovalGatePort;
  store: HandoffStorePort;
  ids: IdGeneratorPort;
  clock: ClockPort;
  /** Optional context-transfer port; absent → context transfer is skipped. */
  context?: ContextTransferPort;
  /** Whether the space requires approval for handoffs. */
  spaceApprovalRequired: boolean;
};

export class HandoffService {
  constructor(private readonly deps: HandoffServiceDeps) {}

  /**
   * Initiate a handoff end-to-end. Mirrors the source ordering:
   *   resolve target → (approval gate) → dedup → mint+deliver → context transfer.
   * Returns a `Result`: `Ok` with the handoff + envelope + effects to run, or
   * `Err` with a typed `CoordinationError` (target unknown, approval rejected,
   * depth/cycle exceeded, duplicate).
   */
  async initiate(
    input: InitiateHandoffInput,
  ): Promise<Result<InitiateHandoffSuccess, CoordinationError>> {
    const { directory, approvals, store, ids, clock, context, spaceApprovalRequired } = this.deps;
    const now = clock.iso();

    // 1) Resolve + validate the target agent (was capability/registry lookup).
    const target = await directory.get(input.parsed.targetAgentId);
    if (!target) {
      return err(
        new CoordinationError(
          CoordinationErrorCode.INTERNAL,
          `Handoff target agent not found: ${input.parsed.targetAgentId}`,
          { targetAgentId: input.parsed.targetAgentId },
        ),
      );
    }

    // 2) Plan (depth + cycle) and mint the handoff — pure; map typed throws.
    let planned: PlannedHandoff;
    try {
      planned = planHandoff({
        intent: input.parsed.intent,
        fromAgentId: input.fromAgentId,
        toAgentId: input.parsed.targetAgentId,
        prompt: input.parsed.prompt,
        handoffId: ids.handoffId(),
        eventId: ids.eventId(),
        now,
        maxDepth: input.maxDepth,
        ...(input.spaceId ? { spaceId: input.spaceId } : {}),
        ...(input.channelId ? { channelId: input.channelId } : {}),
        ...(input.sourceTaskId ? { sourceTaskId: input.sourceTaskId } : {}),
      });
    } catch (error: unknown) {
      if (isCoordinationError(error)) {
        return err(error);
      }
      throw error;
    }

    const handoff = planned.handoff;
    const effects: Effect[] = [...planned.effects];

    // 3) Approval gate (was workspace.approvalRequired → open/await/granted).
    const decision = await gateHandoff(approvals, handoff, spaceApprovalRequired);
    if (decision.outcome === 'rejected') {
      return err(
        new CoordinationError(
          CoordinationErrorCode.APPROVAL_REQUIRED,
          `Handoff ${handoff.handoffId} was rejected at the approval gate.`,
          { handoffId: handoff.handoffId, approvalId: decision.record.approvalId },
        ),
      );
    }

    // 4) Dedup against the durable ledger (survives restart; was in-memory only).
    const envelope = encodeEnvelope({
      handoff,
      envelopeId: ids.eventId(),
      emittedAt: now,
    });
    if (await store.hasDedupKey(envelope.dedupKey)) {
      return err(
        new CoordinationError(
          CoordinationErrorCode.INTERNAL,
          `Duplicate handoff dropped (dedup key already seen): ${handoff.handoffId}`,
          { handoffId: handoff.handoffId, dedupKey: envelope.dedupKey },
        ),
      );
    }
    await store.recordDedupKey(envelope.dedupKey);
    await store.put(handoff);

    // 5) Deliver the envelope (effect) — the bus runs it effectively-once.
    effects.push({ type: 'DeliverHandoff', envelope });

    // 6) Best-effort context transfer — degraded-visible, never fatal.
    if (context && input.contextSourceTaskId && input.contextTargetTaskId) {
      const outcome = await transferContext(
        context,
        input.contextSourceTaskId,
        input.contextTargetTaskId,
        now,
      );
      if (!outcome.ok && outcome.degraded.reason === 'error') {
        effects.push(this.contextDegradedSignal(handoff, outcome.degraded.detail));
      }
    }

    return ok({ handoff, envelope, effects });
  }

  /** A low-severity signal when context transfer degrades (design §9). */
  private contextDegradedSignal(handoff: Handoff, detail: string | undefined): Effect {
    return {
      type: 'EmitSignal',
      signal: {
        signalId: this.deps.ids.signalId(),
        taskId: handoff.targetTaskId ?? handoff.sourceTaskId ?? '',
        ...(handoff.spaceId ? { spaceId: handoff.spaceId } : {}),
        source: 'handoff',
        sourceId: handoff.handoffId,
        title: 'Handoff context transfer degraded',
        severity: 'low',
        status: 'open',
        detectedReason: 'handoff_stuck',
        whyItMatters:
          'The target agent received the handoff but not its source context, so it may repeat discovery work.',
        recommendedNextAction:
          'Re-run the handoff or attach the source context manually if the target lacks needed state.',
        agentHandoffPrompt: `Context for handoff ${handoff.handoffId} could not be transferred${detail ? ` (${detail})` : ''}. Proceed with the prompt and request any missing context.`,
        detectedAt: this.deps.clock.iso(),
      },
    };
  }
}
