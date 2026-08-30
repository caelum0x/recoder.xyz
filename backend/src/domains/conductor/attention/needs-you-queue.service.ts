/**
 * `NeedsYouQueueService` — the LIVE "Needs-You" queue (LOOM-ROADMAP.md build-now #4):
 * a PUSH-driven, in-memory, ranked queue of the panes that NEED THE HUMAN, maintained
 * off the long-lived Loom `events.subscribe` stream instead of a per-tick poll.
 *
 * It subscribes ONCE (via the injected {@link NeedsYouStreamSource}); on each pane
 * `agent_status_changed` event it maps the native Loom `AgentStatus` into a truthful
 * {@link AttentionState} through the SHIPPED classifier chain
 * (`mapLoomStatus` → `nativeAttention` → `classifyAttention`) and UPDATES that pane's
 * single entry (keyed by `workspaceId` — a second event REPLACES, never duplicates).
 * A read {@link snapshot} projects the tracked entries, RANKED by `effectiveRank`
 * (awaiting_approval highest), plus a truthful `count` of panes needing attention.
 *
 * TRUTHFULNESS INVARIANT (adversarially reviewed):
 *  - Entries move on the state-machine EDGE (the received event), never on a poll tick.
 *  - `'unknown'`/no-signal panes are TRACKED but NOT ranked as actionable — they are
 *    truthful unknowns, never fabricated as `agent_idle_prompt`. They are excluded from
 *    the ranked queue and from the `count`.
 *  - `'working'` panes are ranked (a live pane the human may want to watch) but do NOT
 *    count as needing you — only the settle set ({@link NEEDS_YOU_STATES}) counts.
 *  - A disconnected stream degrades to `degraded:true` + a `reason`; the queue NEVER
 *    fabricates entries while disconnected, and a disconnected empty result is flagged
 *    `degraded` so a caller never reads it as a fresh "all clear". On disconnect the
 *    LAST-KNOWN entries are PRESERVED (stale, flagged) rather than cleared to a
 *    look-alike empty — the flag, not silence, carries the truth.
 *  - Resilient lifecycle: on stream error/close it marks degraded and schedules a
 *    BOUNDED re-subscribe (injected {@link NeedsYouScheduler}); it never spins a second
 *    daemon and tears down cleanly.
 */
import type { AgentStatus } from '@recoder/agent-runtimes/loom';
import type { WorkspaceState } from '@recoder/agent-os';
import type { LoggerPort } from '@recoder/substrate';
import type { AttentionState } from '../types.js';
import { mapLoomStatus } from './loom-state.js';
import { classifyAttention } from './attention-classifier.js';
import { effectiveRank } from './attention-priority.js';
import { DEFAULT_SETTLE_SET } from '../wait/wait.service.js';

/**
 * The attention states that count a pane as NEEDING THE HUMAN — the same settle set the
 * wait/cockpit paths use ({@link DEFAULT_SETTLE_SET}: `agent_idle_prompt` / `review_ready`
 * / `awaiting_approval` / `error`). `working` (progressing) and `unknown` (no signal) do
 * NOT count — surfacing them as "needs you" would be a fabrication.
 */
export const NEEDS_YOU_STATES: readonly AttentionState[] = DEFAULT_SETTLE_SET;

/** True when a pane's classified attention counts as needing the human. */
export function isNeedsYouState(state: AttentionState): boolean {
  return NEEDS_YOU_STATES.includes(state);
}

// --- push-stream + scheduler seams ------------------------------------------

/**
 * One normalized pane status-change event. The composition edge translates a raw Loom
 * `pane.agent_status_changed` line (which carries a bare `pane_id` + `agent_status`)
 * into this attributed shape by resolving the pane to its owning Recoder workspace; the
 * service consumes ONLY attributed events (it never guesses ownership).
 */
export interface NeedsYouEvent {
  /** The Recoder workspace id the pane belongs to (the queue's stable key). */
  readonly workspaceId: string;
  /** The agent kind / runtime that ran this pane (e.g. `claude`). */
  readonly agentKind: string;
  /** The pane owner's canonical user id (owner-scoping key). */
  readonly owner: string;
  /** The shared parallel-run group, when the pane belongs to one. */
  readonly taskGroup?: string | null;
  /** The RAW Loom `AgentStatus` this edge carried (the native signal). */
  readonly nativeStatus: AgentStatus;
  /** Whether the human has looked at this pane since it reached its state (rank tiebreak). */
  readonly seen?: boolean;
}

/** The handlers the push source drives — synchronous ingestion keeps the queue deterministic. */
export interface NeedsYouStreamHandlers {
  /** A pane status-change edge arrived (ingested synchronously). */
  onEvent(event: NeedsYouEvent): void;
  /** The stream faulted — degrade + schedule a bounded re-subscribe. */
  onError(error: unknown): void;
  /** The stream closed cleanly — degrade + schedule a bounded re-subscribe. */
  onClose(): void;
}

/** An open push subscription over the Loom event stream. */
export interface NeedsYouSubscription {
  /** Stop the subscription and release the underlying socket. Idempotent. */
  close(): void;
}

/**
 * The ONE long-lived subscription seam. In production this bridges
 * `loomClient.subscribe({ subscriptions:[{type:'pane.agent_status_changed'}] })` (reusing
 * the EXISTING daemon socket — never a second daemon) into push callbacks; tests bind a
 * scripted fake so the queue is provable without a real engine.
 */
export interface NeedsYouStreamSource {
  subscribe(handlers: NeedsYouStreamHandlers): NeedsYouSubscription;
}

/** Injected timer seam so re-subscribe backoff is deterministic under a fake clock. */
export interface NeedsYouScheduler {
  /** Run `fn` after `ms`; returns a cancel handle. */
  schedule(fn: () => void, ms: number): () => void;
}

/** The real scheduler — `setTimeout`, unref'd so a pending reconnect never holds the process. */
export const realNeedsYouScheduler: NeedsYouScheduler = {
  schedule(fn: () => void, ms: number): () => void {
    const timer = setTimeout(fn, ms);
    if (typeof timer.unref === 'function') timer.unref();
    return () => clearTimeout(timer);
  },
};

// --- projection view models --------------------------------------------------

/** The scope a read is narrowed to — owner and/or a shared task group. */
export interface NeedsYouScope {
  /** Restrict to panes owned by this user id. */
  readonly owner?: string;
  /** Restrict to panes in this shared parallel-run group. */
  readonly taskGroup?: string | null;
}

/** One projected queue entry — ranked, with truthful native + needs-you flags. */
export interface NeedsYouEntry {
  readonly workspaceId: string;
  readonly agentKind: string;
  /** The classified attention (never `unknown` here — unknowns are excluded from the queue). */
  readonly state: AttentionState;
  /** `effectiveRank` of the state (higher = more urgent; awaiting_approval highest). */
  readonly rank: number;
  /** The RAW Loom `AgentStatus` that produced the state (the native signal, never guessed). */
  readonly nativeStatus: AgentStatus;
  /** True when {@link isNeedsYouState}(state) — never for `working`. */
  readonly needsYou: boolean;
  /** Whether the human has looked since this pane reached its state. */
  readonly seen: boolean;
}

/** The truthful queue projection a caller reads. */
export interface NeedsYouSnapshot {
  /** The scope this projection was narrowed to (echoed back). */
  readonly scope: NeedsYouScope;
  /** The actionable panes, RANKED most-urgent first (excludes `unknown`). */
  readonly entries: readonly NeedsYouEntry[];
  /** How many entries genuinely NEED THE HUMAN ({@link NEEDS_YOU_STATES}); never counts `working`/`unknown`. */
  readonly count: number;
  /** Every tracked pane in scope, INCLUDING truthful `unknown`s (context for the count). */
  readonly total: number;
  /** True when the subscription is not live — the entries are stale/last-known, NOT a fresh all-clear. */
  readonly degraded: boolean;
  /** Why the queue is degraded (not started / stream error / reconnecting). Absent when live. */
  readonly reason?: string;
}

// --- internal tracked state --------------------------------------------------

/** A tracked pane: the last derived attention + the fields the projection/scoping need. */
interface TrackedPane {
  readonly workspaceId: string;
  readonly agentKind: string;
  readonly owner: string;
  readonly taskGroup: string | null;
  readonly nativeStatus: AgentStatus;
  readonly state: AttentionState;
  readonly seen: boolean;
}

/** Re-subscribe backoff bounds (ms) + the cap on attempts before the queue stays degraded. */
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 10;

const NOOP_LOGGER: LoggerPort = { info() {}, warn() {}, error() {} };

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface NeedsYouQueueDeps {
  readonly source: NeedsYouStreamSource;
  readonly scheduler?: NeedsYouScheduler;
  readonly logger?: LoggerPort;
  /** Publish a native pane-status edge into Recoder's canonical live plane. */
  readonly onChange?: (change: {
    readonly workspaceId: string;
    readonly attention: AttentionState;
    readonly at: string;
  }) => void;
}

/**
 * Maintain the live Needs-You queue off the push stream. Construct once, {@link start} to
 * open the single subscription, {@link snapshot} to read, {@link stop} to tear down.
 */
export class NeedsYouQueueService {
  private readonly source: NeedsYouStreamSource;
  private readonly scheduler: NeedsYouScheduler;
  private readonly logger: LoggerPort;
  private readonly onChange?: NeedsYouQueueDeps['onChange'];

  /** workspaceId → last derived pane entry (a second event REPLACES, never duplicates). */
  private readonly panes = new Map<string, TrackedPane>();

  private subscription: NeedsYouSubscription | null = null;
  private cancelReconnect: (() => void) | null = null;
  private reconnectAttempts = 0;
  private stopped = false;
  /** Truthful liveness: `null` = live; a string = the degrade reason. */
  private degradedReason: string | null = 'queue not started';

  constructor(deps: NeedsYouQueueDeps) {
    this.source = deps.source;
    this.scheduler = deps.scheduler ?? realNeedsYouScheduler;
    this.logger = deps.logger ?? NOOP_LOGGER;
    this.onChange = deps.onChange;
  }

  /** Open the ONE long-lived subscription. Idempotent — a second call is a no-op. */
  start(): void {
    if (this.stopped) return;
    if (this.subscription != null) return;
    this.openSubscription();
  }

  /** Tear down: close the stream, cancel any pending reconnect. Idempotent, degrade-safe. */
  stop(): void {
    this.stopped = true;
    this.degradedReason = 'queue stopped';
    if (this.cancelReconnect != null) {
      this.cancelReconnect();
      this.cancelReconnect = null;
    }
    if (this.subscription != null) {
      try {
        this.subscription.close();
      } catch (err) {
        this.logger.warn('needs-you queue: subscription close failed (ignored)', {
          err: message(err),
        });
      }
      this.subscription = null;
    }
  }

  /**
   * Read the truthful queue projection for a scope. Entries are the actionable
   * (non-`unknown`) tracked panes, RANKED most-urgent first (ties broken by
   * `workspaceId` for a stable order); `count` is only the panes needing the human.
   * `degraded` is surfaced verbatim so a stale/last-known result is never mistaken
   * for a fresh all-clear.
   */
  snapshot(scope: NeedsYouScope = {}): NeedsYouSnapshot {
    const scoped = [...this.panes.values()].filter(pane => inScope(pane, scope));
    const entries = scoped
      .filter(pane => pane.state !== 'unknown')
      .map(toEntry)
      .sort(byRankThenId);
    const count = entries.reduce((n, e) => (e.needsYou ? n + 1 : n), 0);
    return {
      scope,
      entries,
      count,
      total: scoped.length,
      degraded: this.degradedReason != null,
      ...(this.degradedReason != null ? { reason: this.degradedReason } : {}),
    };
  }

  // --- subscription lifecycle ------------------------------------------------

  private openSubscription(): void {
    try {
      this.subscription = this.source.subscribe({
        onEvent: event => this.ingest(event),
        onError: err => this.onStreamDown(`stream error: ${message(err)}`),
        onClose: () => this.onStreamDown('stream closed'),
      });
      // The subscription object exists ⇒ the stream is open; we are LIVE. The
      // first ingested event resets the backoff (proof of a healthy stream).
      this.degradedReason = null;
    } catch (err) {
      this.onStreamDown(`subscribe failed: ${message(err)}`);
    }
  }

  /** Ingest one attributed edge: map native → attention via the SHIPPED classifier, then upsert. */
  private ingest(event: NeedsYouEvent): void {
    if (this.stopped) return;
    // A received event is proof the stream is live — clear degrade + reset backoff.
    this.degradedReason = null;
    this.reconnectAttempts = 0;

    const nativeAttention = mapLoomStatus(event.nativeStatus);
    // A live pane is a `running` workspace with a NATIVE substrate status; the shipped
    // classifier honours that native signal (and yields `unknown` when Loom had none) —
    // we never re-implement the mapping or fabricate a state.
    const { attention } = classifyAttention({
      state: RUNNING_STATE,
      nativeAttention,
    });
    this.panes.set(event.workspaceId, {
      workspaceId: event.workspaceId,
      agentKind: event.agentKind,
      owner: event.owner,
      taskGroup: event.taskGroup ?? null,
      nativeStatus: event.nativeStatus,
      state: attention,
      seen: event.seen ?? false,
    });
    this.onChange?.({
      workspaceId: event.workspaceId,
      attention,
      at: new Date().toISOString(),
    });
  }

  /**
   * The stream faulted or closed: mark degraded (truthful — the entries are now
   * stale/last-known, PRESERVED not cleared) and schedule a bounded re-subscribe.
   * Never fabricates entries while disconnected.
   */
  private onStreamDown(reason: string): void {
    if (this.stopped) return;
    this.subscription = null;
    this.degradedReason = reason;

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.degradedReason = `${reason} — reconnect attempts exhausted (${MAX_RECONNECT_ATTEMPTS})`;
      this.logger.error('needs-you queue: reconnect attempts exhausted, staying degraded', {
        reason,
      });
      return;
    }
    const attempt = this.reconnectAttempts;
    this.reconnectAttempts += 1;
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempt);
    this.degradedReason = `${reason} — reconnecting (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`;
    this.logger.warn('needs-you queue: stream down, scheduling re-subscribe', {
      reason,
      attempt: this.reconnectAttempts,
      delayMs: delay,
    });
    if (this.cancelReconnect != null) this.cancelReconnect();
    this.cancelReconnect = this.scheduler.schedule(() => {
      this.cancelReconnect = null;
      if (this.stopped) return;
      this.openSubscription();
    }, delay);
  }
}

/** A live Loom pane is a `running` workspace as far as the classifier is concerned. */
const RUNNING_STATE = 'running' as WorkspaceState;

/** Is a tracked pane within the requested scope (owner and/or task group)? */
function inScope(pane: TrackedPane, scope: NeedsYouScope): boolean {
  if (scope.owner != null && pane.owner !== scope.owner) return false;
  if (scope.taskGroup != null && pane.taskGroup !== scope.taskGroup) return false;
  return true;
}

/** Project a tracked pane into a ranked queue entry (truthful flags, never guessed). */
function toEntry(pane: TrackedPane): NeedsYouEntry {
  return {
    workspaceId: pane.workspaceId,
    agentKind: pane.agentKind,
    state: pane.state,
    rank: effectiveRank({ attention: pane.state, seen: pane.seen }),
    nativeStatus: pane.nativeStatus,
    needsYou: isNeedsYouState(pane.state),
    seen: pane.seen,
  };
}

/** Rank descending, then workspaceId ascending — a stable, deterministic order. */
function byRankThenId(a: NeedsYouEntry, b: NeedsYouEntry): number {
  if (b.rank !== a.rank) return b.rank - a.rank;
  return a.workspaceId < b.workspaceId ? -1 : a.workspaceId > b.workspaceId ? 1 : 0;
}
