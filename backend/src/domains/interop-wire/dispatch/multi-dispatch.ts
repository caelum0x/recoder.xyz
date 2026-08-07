/**
 * `multi-dispatch` — routes an admitted A2A `message/send` to one or more
 * registered targets (a local runtime endpoint or a remote A2A peer) and fans the
 * result back. It is the write-side companion to `task-lifecycle`: it opens (or
 * reuses) a task projection, records the inbound message, then dispatches.
 *
 * Consumes two OPTIONAL ports (degrade-safe — never a faked success):
 *   - {@link LocalRunDispatchPort} — the conductor `createWorkspace` seam (Phase 5).
 *     A `kind:'runtime'` target with no local dispatch port ⇒ a truthful `error`.
 *   - {@link RemoteEnvelopeSender} — the outbound A2A transport for `remote_a2a`
 *     peers. Absent ⇒ the sealed envelope is returned unsent with a truthful note.
 *
 * The envelope is ALWAYS sealed through the frozen `A2ATransport.egressEnvelope`
 * (HMAC-signed when a secret is configured, an explicit unsigned marker otherwise)
 * before it leaves this instance — signing is never skipped silently.
 */
import type { A2ATransport } from '../ports/a2a-transport.port.js';
import type { AgentRegistryRepo } from '../ports/agent-registry.repo.js';
import type { A2AEnvelope, AgentRow, EgressEnvelope } from '../types.js';
import type { TaskLifecycleService } from './task-lifecycle.js';

/** The narrow conductor seam: turn a dispatched message into a workspace + run. */
export interface LocalRunDispatchPort {
  /** Launch a run for a local runtime target; returns a truthful run id or error. */
  launch(input: {
    readonly runtimeId: string;
    readonly userId: string;
    readonly prompt: string;
    readonly correlationId?: string;
  }): Promise<{ ok: boolean; runId?: string; error?: string }>;
}

/** The narrow outbound-peer seam: deliver a sealed envelope to a remote A2A peer. */
export interface RemoteEnvelopeSender {
  send(target: AgentRow, sealed: EgressEnvelope): Promise<{ ok: boolean; error?: string }>;
}

/**
 * The multi-peer RESPONSE STRATEGY that decides when a fan-out is "satisfied":
 *  - `all`    — every attempted leg must succeed (the default; all-or-reported).
 *  - `first`  — the FIRST successful leg satisfies it; remaining targets are NOT
 *               attempted (first-wins, short-circuit — the cheapest peer that
 *               answers wins). Truthfully reported via un-attempted `skipped` legs.
 *  - `quorum` — at least `quorum` legs must succeed (default: strict majority).
 *
 * Every strategy is TRUTHFUL: `ok` reflects the real per-leg outcomes, never a
 * faked success, and the task projection transitions to `working` only when the
 * strategy is genuinely satisfied.
 */
export type DispatchStrategy = 'all' | 'first' | 'quorum';

/** One dispatched leg's outcome (per target). */
export interface DispatchLeg {
  readonly targetId: string;
  readonly kind: AgentRow['kind'];
  readonly ok: boolean;
  readonly runId?: string;
  readonly code: string;
  readonly reason: string;
}

/** The aggregate result of a (possibly fan-out) dispatch. */
export interface MultiDispatchResult {
  readonly taskId: string;
  readonly legs: readonly DispatchLeg[];
  /** True when the {@link DispatchStrategy} was genuinely satisfied. */
  readonly ok: boolean;
  /** The strategy that decided `ok` (echoed for truthful downstream logging). */
  readonly strategy: DispatchStrategy;
  /** The number of successful legs / the threshold the strategy required. */
  readonly satisfied: { readonly succeeded: number; readonly required: number };
}

export interface DispatchMessageInput<TPayload = unknown> {
  readonly userId: string;
  /** The target agent ids to fan out to (each resolved via the registry). */
  readonly targets: readonly string[];
  /** The A2A message envelope to seal + route. */
  readonly envelope: A2AEnvelope<TPayload>;
  /** The prompt text a runtime target is launched with (`kind:'runtime'`). */
  readonly prompt?: string;
  /** Reuse an existing task projection instead of creating one. */
  readonly taskId?: string;
  /** The multi-peer response strategy (default `all`). */
  readonly strategy?: DispatchStrategy;
  /**
   * The explicit success threshold for `quorum` (clamped to `[1, targets.length]`).
   * Absent ⇒ strict majority (`floor(n/2) + 1`). Ignored for `all`/`first`.
   */
  readonly quorum?: number;
}

export interface MultiDispatchDeps {
  readonly transport: A2ATransport;
  readonly registry: AgentRegistryRepo;
  readonly tasks: TaskLifecycleService;
  /** Optional conductor seam (Phase 5 `createWorkspace`); absent ⇒ runtime legs error. */
  readonly localRun?: LocalRunDispatchPort;
  /** Optional remote-peer sender; absent ⇒ remote legs return the sealed envelope only. */
  readonly remoteSender?: RemoteEnvelopeSender;
}

let taskSeq = 0;
function newTaskId(): string {
  taskSeq += 1;
  return `a2a_task_${Date.now().toString(36)}_${taskSeq.toString(36)}`;
}

export interface MultiDispatchService {
  dispatch<TPayload = unknown>(input: DispatchMessageInput<TPayload>): Promise<MultiDispatchResult>;
}

/** Build the multi-dispatch service. Pure factory; degrade-safe by construction. */
export function createMultiDispatchService(deps: MultiDispatchDeps): MultiDispatchService {
  const { transport, registry, tasks, localRun, remoteSender } = deps;

  async function dispatchLeg<TPayload>(
    target: AgentRow,
    input: DispatchMessageInput<TPayload>,
    sealed: EgressEnvelope,
  ): Promise<DispatchLeg> {
    if (target.kind === 'runtime') {
      if (!localRun) {
        return leg(target, false, 'no_local_dispatch', 'Conductor dispatch seam is not wired — runtime target unreachable.');
      }
      const prompt = input.prompt ?? extractText(input.envelope);
      const res = await safe(() =>
        localRun.launch({
          runtimeId: target.runtimeId ?? target.id,
          userId: input.userId,
          prompt,
          correlationId: input.envelope.correlationId,
        }),
      );
      if (!res || !res.ok) {
        return leg(target, false, 'runtime_dispatch_failed', res?.error ?? 'runtime dispatch failed');
      }
      return { ...leg(target, true, 'dispatched', 'Runtime run launched.'), runId: res.runId };
    }

    // remote_a2a / connector → deliver the sealed envelope over the peer sender.
    if (!remoteSender) {
      return leg(target, false, 'no_remote_sender', 'Remote A2A sender is not wired — sealed envelope not delivered.');
    }
    const res = await safe(() => remoteSender.send(target, sealed));
    if (!res || !res.ok) {
      return leg(target, false, 'remote_send_failed', res?.error ?? 'remote send failed');
    }
    return leg(target, true, 'dispatched', 'Sealed envelope delivered to remote peer.');
  }

  return {
    async dispatch<TPayload = unknown>(input: DispatchMessageInput<TPayload>): Promise<MultiDispatchResult> {
      const strategy = input.strategy ?? 'all';
      const required = requiredSuccesses(strategy, input.targets.length, input.quorum);
      const taskId = input.taskId ?? newTaskId();
      if (!input.taskId) {
        await safe(() =>
          tasks.create({ id: taskId, userId: input.userId, state: 'submitted', correlation: input.envelope.correlationId }),
        );
      } else {
        // A REUSED taskId must be OWNED by the caller before we append the inbound
        // message into it — else a signed peer can inject messages into any tenant's
        // task by supplying its id (IDOR). A foreign/absent task is a truthful no-op
        // refusal (no append, no transition). (recoder-hdgw)
        const owned = await safe(() => tasks.get(taskId, input.userId));
        if (!owned) {
          return {
            taskId,
            legs: input.targets.map((targetId) => ({
              targetId,
              kind: 'remote_a2a' as const,
              ok: false,
              code: 'task_not_owned',
              reason: 'Task not found or not owned.',
            })),
            ok: false,
            strategy,
            satisfied: { succeeded: 0, required },
          };
        }
      }
      await safe(() =>
        tasks.appendMessage({ taskId, role: 'user', parts: [{ kind: 'text', text: extractText(input.envelope) }] }),
      );

      // Seal ONCE (signing never skipped silently), then fan out.
      const sealed = await transport.egressEnvelope(input.envelope);

      const legs: DispatchLeg[] = [];
      let succeeded = 0;
      for (let i = 0; i < input.targets.length; i += 1) {
        const targetId = input.targets[i]!;
        const target = await safe(() => registry.get(targetId, input.userId));
        const leg = target
          ? await dispatchLeg(target, input, sealed)
          : { targetId, kind: 'remote_a2a' as const, ok: false, code: 'target_not_found', reason: `Target ${targetId} not found or not owned.` };
        legs.push(leg);
        if (leg.ok) succeeded += 1;
        // `first` short-circuits the moment a leg succeeds: the remaining targets
        // are recorded truthfully as `skipped` (not attempted), never faked ok.
        if (strategy === 'first' && leg.ok) {
          for (let j = i + 1; j < input.targets.length; j += 1) {
            legs.push({ targetId: input.targets[j]!, kind: 'remote_a2a', ok: false, code: 'skipped', reason: 'first-wins strategy satisfied — target not attempted.' });
          }
          break;
        }
      }

      const ok = succeeded >= required && input.targets.length > 0;
      // Advance the projection. On success advance to `working`. On failure only
      // terminally `fail` a task THIS dispatch CREATED (`!input.taskId`); a REUSED
      // in-flight task (e.g. a handoff) is left in its prior non-terminal state so
      // a transient/unwired transport can never destroy a live task the original
      // owner still holds and could complete or retry.
      if (ok) {
        await safe(() => tasks.transition(taskId, input.userId, 'working'));
      } else if (!input.taskId) {
        await safe(() => tasks.transition(taskId, input.userId, 'failed'));
      }
      return { taskId, legs, ok, strategy, satisfied: { succeeded, required } };
    },
  };
}

/** The number of successful legs a strategy needs (clamped to `[1, n]`). */
export function requiredSuccesses(strategy: DispatchStrategy, targetCount: number, quorum?: number): number {
  if (targetCount <= 0) return 1; // empty fan-out can never satisfy (ok stays false).
  switch (strategy) {
    case 'all':
      return targetCount;
    case 'first':
      return 1;
    case 'quorum': {
      const majority = Math.floor(targetCount / 2) + 1;
      const want = typeof quorum === 'number' && Number.isFinite(quorum) ? Math.trunc(quorum) : majority;
      return Math.min(Math.max(want, 1), targetCount);
    }
  }
}

function leg(target: AgentRow, ok: boolean, code: string, reason: string): DispatchLeg {
  return { targetId: target.id, kind: target.kind, ok, code, reason };
}

/** Best-effort text extraction from a domain envelope payload (for prompts/logs). */
function extractText(env: A2AEnvelope): string {
  const p = env.payload as unknown;
  if (typeof p === 'string') return p;
  if (p && typeof p === 'object' && 'text' in p && typeof (p as { text: unknown }).text === 'string') {
    return (p as { text: string }).text;
  }
  return JSON.stringify(p ?? {});
}

/** Run an async fn, swallowing faults to `null` (a leg failure, never a crash). */
async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}
