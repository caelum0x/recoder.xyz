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
  /** True when EVERY leg succeeded (fan-out is all-or-reported). */
  readonly ok: boolean;
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
      const taskId = input.taskId ?? newTaskId();
      if (!input.taskId) {
        await safe(() =>
          tasks.create({ id: taskId, userId: input.userId, state: 'submitted', correlation: input.envelope.correlationId }),
        );
      }
      await safe(() =>
        tasks.appendMessage({ taskId, role: 'user', parts: [{ kind: 'text', text: extractText(input.envelope) }] }),
      );

      // Seal ONCE (signing never skipped silently), then fan out.
      const sealed = await transport.egressEnvelope(input.envelope);

      const legs: DispatchLeg[] = [];
      for (const targetId of input.targets) {
        const target = await safe(() => registry.get(targetId, input.userId));
        if (!target) {
          legs.push({ targetId, kind: 'remote_a2a', ok: false, code: 'target_not_found', reason: `Target ${targetId} not found or not owned.` });
          continue;
        }
        legs.push(await dispatchLeg(target, input, sealed));
      }

      const ok = legs.length > 0 && legs.every((l) => l.ok);
      // Advance the projection: working when any leg launched, else failed.
      await safe(() => tasks.transition(taskId, input.userId, ok ? 'working' : 'failed'));
      return { taskId, legs, ok };
    },
  };
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
