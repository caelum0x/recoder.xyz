/**
 * `WaitService` — the agent-invokable SYNCHRONOUS wait-until-settled primitive
 * (herdr's `agent wait --until blocked`, `src/api/wait.rs::wait_for_resolved_agent`).
 *
 * An agent (or an orchestrating runtime) asks: "block until this workspace needs
 * me, then return the settled state." The service watches the workspace's event
 * stream from a seq cursor (replay-then-live), RE-DERIVES the authoritative
 * attention state via {@link classifyAttention} on each new frame, and resolves
 * when that state enters the SETTLE SET:
 *
 *   DEFAULT: agent_idle_prompt · review_ready · awaiting_approval · error
 *
 * `unknown` / `working` are NON-terminal → KEEP WAITING (a mid-turn agent is not
 * something to hand back to). This mirrors herdr, which loops on live events and
 * re-probes the authoritative agent state rather than trusting a single read.
 *
 * TRUTHFULNESS INVARIANT (non-negotiable): the service NEVER fabricates a settle.
 *  - On timeout it resolves `{ settled:false, reason:'timeout', lastState }` — the
 *    last state it actually classified, never a guessed "idle".
 *  - IDENTITY GUARD: when the caller pins `identity.runId`/`identity.runtimeId` and
 *    a frame shows the workspace's current run no longer matches (a superseding
 *    run replaced it), it resolves `{ settled:false, reason:'run-superseded' }`
 *    WITHOUT settling — it will not report a stale/replaced run as "done".
 *
 * TESTABILITY: the event source and the timeout clock are BOTH injected seams
 * ({@link WaitEventSource}, {@link WaitTimer}), so the loop is exercised with a
 * scripted async source and a manually-fired timer — no real hub, socket, or
 * wall-clock timer is needed. The seq cursor gives replay-then-live with no gap
 * and no duplicate: a frame at or below the last-seen seq is dropped (the
 * replay/live boundary overlap), so a stale replayed settle can never fire.
 *
 * Clean-room note: behaviour absorbed from herdr (Apache-2.0) by design only — no
 * code was copied; herdr's Rust poll+probe loop becomes this stream+re-classify
 * loop over the conductor's own attention authority.
 */
import type { AttentionSignals } from '../attention/attention-classifier.js';
import { classifyAttention } from '../attention/attention-classifier.js';
import type { AttentionState } from '../types.js';

/**
 * The attention states that END a wait. A workspace entering any of these is
 * "settled" — it needs the human/agent (a prompt, a review, an approval, or a
 * failure). `working`/`unknown` are deliberately excluded: they are not terminal.
 */
export const DEFAULT_SETTLE_SET: readonly AttentionState[] = [
  'agent_idle_prompt',
  'review_ready',
  'awaiting_approval',
  'error',
];

/** The authoritative signal snapshot a single stream frame carries. */
export interface WaitFrameData {
  /** The signals {@link classifyAttention} re-derives the state from on this frame. */
  readonly signals: AttentionSignals;
  /** The workspace's CURRENT run id at this frame (for the identity guard); null = none. */
  readonly runId?: string | null;
  /** The workspace's CURRENT runtime id at this frame (for the identity guard); null = none. */
  readonly runtimeId?: string | null;
}

/** A stream frame: an authoritative snapshot stamped with its monotonic seq. */
export interface WaitFrame extends WaitFrameData {
  /** Monotonic per-workspace sequence id (the ring cursor); strictly increasing. */
  readonly seq: number;
}

/** The run identity a caller may PIN a wait to, so it never settles on a replaced run. */
export interface WaitIdentity {
  readonly runId?: string;
  readonly runtimeId?: string;
}

/** A request to wait until a workspace settles. */
export interface WaitRequest {
  readonly workspaceId: string;
  /** Override the settle set; defaults to {@link DEFAULT_SETTLE_SET}. */
  readonly settleSet?: readonly AttentionState[];
  /** Pin the wait to a specific run — a superseding run resolves `run-superseded`. */
  readonly identity?: WaitIdentity;
  /** Hard wall-clock budget; on expiry resolves `{ settled:false, reason:'timeout' }`. */
  readonly timeoutMs: number;
  /** Resume cursor: only frames with `seq > sinceSeq` are considered (default 0). */
  readonly sinceSeq?: number;
}

/**
 * The event source seam: replay-then-live frames for a workspace from a seq
 * cursor. Real impls back this with the run-event ring + live hub (replay the
 * retained window, then continue live); tests back it with a scripted queue.
 * Closing the returned iterator (`return()`) MUST stop the subscription/poll.
 */
export interface WaitEventSource {
  watch(workspaceId: string, sinceSeq: number): AsyncIterable<WaitFrame>;
}

/** The timeout clock seam: arm a one-shot timer, return a disarm fn. */
export interface WaitTimer {
  arm(ms: number, onFire: () => void): () => void;
}

/** The reason a wait resolved WITHOUT settling — always truthful, never faked. */
export type WaitUnsettledReason = 'timeout' | 'run-superseded' | 'stream-ended';

/** The outcome of a wait: a truthful settle, or a truthful non-settle + why. */
export type WaitOutcome =
  | {
      readonly settled: true;
      /** The settle-set state the workspace entered. */
      readonly state: AttentionState;
      /** The truthful signal that produced the settle (classifier reason). */
      readonly reason: string;
      /** The seq of the frame that settled the wait. */
      readonly seq: number;
    }
  | {
      readonly settled: false;
      readonly reason: WaitUnsettledReason;
      /** The last state actually classified before giving up (never fabricated). */
      readonly lastState: AttentionState;
    };

/** Injected wiring for {@link WaitService}. */
export interface WaitServiceDeps {
  readonly source: WaitEventSource;
  readonly timer: WaitTimer;
}

/** Internal race discriminant: a delivered frame step, or the timeout firing. */
type RaceResult =
  | { readonly kind: 'frame'; readonly step: IteratorResult<WaitFrame> }
  | { readonly kind: 'timeout' };

/**
 * Has the workspace's current run been SUPERSEDED relative to the pinned identity?
 * Only fields the caller actually pinned are checked; an absent pin never guards.
 * A pinned id that no longer matches (including a run that vanished → null) is a
 * supersede — the run the caller waited on is gone/replaced.
 */
function isRunSuperseded(
  identity: WaitIdentity | undefined,
  frame: WaitFrame
): boolean {
  if (!identity) return false;
  if (identity.runId != null && (frame.runId ?? null) !== identity.runId)
    return true;
  if (
    identity.runtimeId != null &&
    (frame.runtimeId ?? null) !== identity.runtimeId
  )
    return true;
  return false;
}

export class WaitService {
  private readonly source: WaitEventSource;
  private readonly timer: WaitTimer;

  constructor(deps: WaitServiceDeps) {
    this.source = deps.source;
    this.timer = deps.timer;
  }

  /**
   * Block until the workspace settles, times out, or its pinned run is superseded.
   * Consumes the replay-then-live stream, re-classifying every fresh frame, and
   * resolves the FIRST settle-set state it sees. Deterministic given the source +
   * timer seams: no wall-clock timer, no hub.
   */
  async waitUntilSettled(request: WaitRequest): Promise<WaitOutcome> {
    const settleSet = request.settleSet ?? DEFAULT_SETTLE_SET;
    const sinceSeq = request.sinceSeq ?? 0;
    const iterator = this.source
      .watch(request.workspaceId, sinceSeq)
      [Symbol.asyncIterator]();

    let lastState: AttentionState = 'unknown';
    let lastSeq = sinceSeq;

    let fireTimeout!: () => void;
    const timeoutPromise = new Promise<RaceResult>(resolve => {
      fireTimeout = () => resolve({ kind: 'timeout' });
    });
    const disarm = this.timer.arm(request.timeoutMs, fireTimeout);

    try {
      while (true) {
        const nextPromise = iterator
          .next()
          .then((step): RaceResult => ({ kind: 'frame', step }));
        const race = await Promise.race([nextPromise, timeoutPromise]);

        if (race.kind === 'timeout') {
          return { settled: false, reason: 'timeout', lastState };
        }
        if (race.step.done) {
          // The source ended without a settle — truthful, never a faked idle.
          return { settled: false, reason: 'stream-ended', lastState };
        }

        const frame = race.step.value;
        // Replay/live boundary overlap: a frame at or below the last-seen seq is a
        // duplicate — drop it so a stale replayed settle can never fire (no dup),
        // and every accepted frame is strictly newer (no gap in what we act on).
        if (frame.seq <= lastSeq) continue;
        lastSeq = frame.seq;

        // IDENTITY GUARD FIRST: never settle on a stale/replaced run. Checked
        // before classification so a settle-looking frame from a superseding run
        // resolves `run-superseded`, not a fabricated settle.
        if (isRunSuperseded(request.identity, frame)) {
          return { settled: false, reason: 'run-superseded', lastState };
        }

        const result = classifyAttention(frame.signals);
        lastState = result.attention;
        if (settleSet.includes(result.attention)) {
          return {
            settled: true,
            state: result.attention,
            reason: result.reason,
            seq: frame.seq,
          };
        }
        // `unknown` / `working` (or any non-settle state) ⇒ keep waiting.
      }
    } finally {
      disarm();
      // Best-effort close of the subscription/poll — fire-and-forget so the
      // resolved outcome returns immediately (a real source may finish an
      // in-flight poll/sleep before honoring `return()`).
      void Promise.resolve(iterator.return?.()).catch(() => undefined);
    }
  }
}
