/**
 * `createSiblingAwarenessSink` — mid-run agent communication v1 (recoder-i499):
 * "sibling awareness". Today parallel siblings of one taskGroup are strangers —
 * recall at launch, harvest at completion, nothing in between. This decorator
 * closes that gap: the moment sibling A emits a TERMINAL RunEvent
 * (`completed`/`failed`), every still-RUNNING sibling of the same taskGroup gets
 * a TERSE context note steered into its live session — paths + stats ONLY, never
 * file contents (the prompt-injection surface stays minimal).
 *
 * SEAM LAW (mirrors the completion-hook sink): `inner.append` runs FIRST and is
 * always awaited — the terminal event is never delayed or dropped by a delivery.
 * The fan-out is fire-and-forget with a PER-SIBLING try/catch: one failed steer
 * never breaks the terminal path or the other siblings' deliveries.
 *
 * Truthful skips, never faked: an ungrouped/singleton workspace has no siblings;
 * a non-running sibling or one with no live session cannot be steered; a
 * workspace whose `metadata.siblingAwareness` is `false` opted out (the flag is
 * stamped at launch — default TRUE for taskGroup launches, the whole point). A
 * delivered note is evidenced by a `log` RunEvent on the RECEIVING workspace
 * whose `data.kind` is `sibling_context_delivered` (`RunEventType` is a frozen
 * union mirrored by zod at both ingest edges — a new type would be silently
 * REJECTED by the durable bus, so the discriminator rides `data`, truthfully).
 *
 * v2 — MID-RUN milestones (same issue): siblings learn about each other BEFORE
 * anyone finishes. RunEvents carry no diffstat (the substrate tailer emits pane
 * deltas only), so each non-terminal event is a cheap TICK: at most once per
 * {@link MIDRUN_CHECK_INTERVAL_MS} per sender the sink re-reads the SAME
 * `siblings()` CompareView it already uses for v1 (never its own git calls) and
 * compares the sender's changedFiles/diffStat against the last-broadcast
 * snapshot. Crossing a milestone — FIRST nonzero diff, then every
 * +{@link MIDRUN_FILES_STEP} files or +{@link MIDRUN_LINES_STEP} changed lines —
 * steers a one-line progress note into the OTHER running siblings. Rate
 * discipline per receiver: max one mid-run note per
 * {@link MIDRUN_NOTE_INTERVAL_MS} AND identical path sets from the same sender
 * are deduped. All state is an in-memory bounded Map, EVICTED on the sender's
 * terminal event; every delivery reuses the v1 degrade discipline (governed
 * steer, `sibling_context_delivered` evidence with a `milestone` marker, a
 * failed steer never breaks anything) and the same opt-in flag.
 */
import { randomUUID } from 'node:crypto';
import type { RunEvent, Workspace } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import type { RunEventSinkPort } from '../ports/run-event-sink.port.js';
import {
  TASK_GROUP_METADATA_KEY,
  type CompareView,
  type DiffStat,
  type SiblingCompareEntry,
} from '../services/compare.service.js';

/** The metadata key the launch path stamps the opt-in/out flag under. */
export const SIBLING_AWARENESS_METADATA_KEY = 'siblingAwareness';

/** The `data.kind` discriminator of the delivered-evidence RunEvent. */
export const SIBLING_CONTEXT_DELIVERED = 'sibling_context_delivered';

/** At most this many changed-file paths ride the note (then a truthful "+N more"). */
const MAX_NOTE_FILES = 12;

/** Mid-run notes are shorter — at most this many paths (then "+N more"). */
const MAX_PROGRESS_NOTE_FILES = 6;

/** A mid-run milestone every +N changed files since the last broadcast. */
export const MIDRUN_FILES_STEP = 5;

/** …or every +N changed lines (additions + deletions) since the last broadcast. */
export const MIDRUN_LINES_STEP = 200;

/** Per RECEIVER: at most one mid-run note per this window (3 minutes). */
export const MIDRUN_NOTE_INTERVAL_MS = 3 * 60_000;

/**
 * Per SENDER: the sibling read model is consulted at most this often. Every
 * mid-run RunEvent is a tick, and `siblings()` computes real diffs for the whole
 * group — unthrottled it would run git per pane-delta log line.
 */
export const MIDRUN_CHECK_INTERVAL_MS = 30_000;

/**
 * Progress/rate maps are bounded: beyond this many tracked workspaces the
 * OLDEST entry is dropped (insertion order). Terminal eviction is the primary
 * cleanup; the bound is the backstop against leaked never-terminal workspaces.
 */
const MAX_TRACKED_WORKSPACES = 512;

/** Longest single interpolated field (a path/branch/agent) kept in the note. */
const MAX_FIELD_CHARS = 120;

/**
 * One-line-safe field: control characters (incl. newlines — a path/branch must
 * never smuggle extra note lines) collapse to a space, then a hard length cap.
 */
function oneLine(value: string): string {
  // eslint-disable-next-line no-control-regex
  const flat = value.replace(/[\u0000-\u001F\u007F]+/g, ' ').trim();
  return flat.length > MAX_FIELD_CHARS ? `${flat.slice(0, MAX_FIELD_CHARS)}…` : flat;
}

/** What the note composer needs to know about the FINISHED sibling. */
export interface SiblingNoteInput {
  /** The agent that ran the finished sibling (workspace runtimeId). */
  readonly agent: string;
  readonly branch: string;
  /** The terminal outcome the RunEvent carried. */
  readonly outcome: 'completed' | 'failed';
  /** Tracked changed-file PATHS (never contents) — absent = unreadable. */
  readonly changedFiles?: readonly string[];
  /** Diff footprint vs base — absent = uncomputable (never fabricated 0/0/0). */
  readonly diffStat?: DiffStat;
}

/**
 * Compose the terse (4-line, bounded) sibling-update note. Pure + truthful:
 * paths + stats only, unreadable inputs say so instead of fabricating, and every
 * interpolated field is flattened to one line so the shape is always ≤ 4 lines.
 */
export function composeSiblingNote(input: SiblingNoteInput): string {
  const files = input.changedFiles;
  let filesLine: string;
  if (!files) {
    filesLine = 'unavailable (diff not readable).';
  } else if (files.length === 0) {
    filesLine = 'none reported by git.';
  } else {
    const shown = files.slice(0, MAX_NOTE_FILES).map(oneLine).join(', ');
    const rest = files.length - MAX_NOTE_FILES;
    filesLine = rest > 0 ? `${shown} (+${rest} more)` : shown;
  }
  const diffLine = input.diffStat
    ? `+${input.diffStat.additions}/-${input.diffStat.deletions} across ${input.diffStat.files} file(s).`
    : 'unavailable.';
  return [
    `[Recoder] Parallel sibling update: ${oneLine(input.agent)} on branch ${oneLine(input.branch)} finished (${input.outcome}).`,
    `Files it changed: ${filesLine}`,
    `Diff: ${diffLine}`,
    'Yours differs — avoid duplicating; focus on your distinct approach or address gaps it left.',
  ].join('\n');
}

/** The sender-side progress observation a mid-run milestone is measured against. */
export interface ProgressSnapshot {
  /** Changed files observed (diffStat preferred, else the changed-file count). */
  readonly files: number;
  /** Changed lines observed (additions + deletions; 0 when only paths are known). */
  readonly lines: number;
}

/** Why a mid-run broadcast fired — rides the evidence payload as the marker. */
export type MidRunMilestone = 'first_diff' | 'files_step' | 'lines_step';

/**
 * Observe a sibling's progress from the compare entry. `null` when NEITHER the
 * diffStat nor the changed-file list is readable — an unreadable diff is never
 * fabricated into a 0/0 observation (it would suppress the first-diff milestone).
 */
export function progressSnapshotOf(
  entry: Pick<SiblingCompareEntry, 'changedFiles' | 'diffStat'>,
): ProgressSnapshot | null {
  if (!entry.diffStat && !entry.changedFiles) return null;
  return {
    files: entry.diffStat?.files ?? entry.changedFiles?.length ?? 0,
    lines: entry.diffStat ? entry.diffStat.additions + entry.diffStat.deletions : 0,
  };
}

/**
 * Milestone crossing: FIRST nonzero diff, then every +{@link MIDRUN_FILES_STEP}
 * files or +{@link MIDRUN_LINES_STEP} lines SINCE THE LAST BROADCAST (`prev` is
 * the snapshot at the last broadcast, not the last check). A regressed diff
 * (checkpoint restore) is simply not a milestone.
 */
export function crossedMilestone(
  prev: ProgressSnapshot | undefined,
  current: ProgressSnapshot,
): MidRunMilestone | null {
  if (current.files <= 0 && current.lines <= 0) return null;
  if (!prev) return 'first_diff';
  if (current.files - prev.files >= MIDRUN_FILES_STEP) return 'files_step';
  if (current.lines - prev.lines >= MIDRUN_LINES_STEP) return 'lines_step';
  return null;
}

/** What the mid-run progress-note composer needs about the STILL-RUNNING sender. */
export interface SiblingProgressInput {
  readonly agent: string;
  /** Tracked changed-file PATHS (never contents) — absent = unreadable. */
  readonly changedFiles?: readonly string[];
  /** Diff footprint vs base — absent = uncomputable (never fabricated 0/0/0). */
  readonly diffStat?: DiffStat;
}

/**
 * Compose the one-line mid-run progress note (shorter than the terminal note —
 * a running agent should not be interrupted by a wall of text). Pure + truthful:
 * top paths + stats only, unreadable inputs say so, fields flattened to one line.
 */
export function composeSiblingProgressNote(input: SiblingProgressInput): string {
  const files = input.changedFiles;
  let pathsPart: string;
  if (!files || files.length === 0) {
    pathsPart = `${input.diffStat?.files ?? 0} file(s) (paths not readable)`;
  } else {
    const shown = files.slice(0, MAX_PROGRESS_NOTE_FILES).map(oneLine).join(', ');
    const rest = files.length - MAX_PROGRESS_NOTE_FILES;
    pathsPart = rest > 0 ? `${shown} (+${rest} more)` : shown;
  }
  const statPart = input.diffStat
    ? `+${input.diffStat.additions}/-${input.diffStat.deletions}`
    : `${files?.length ?? 0} file(s) changed`;
  return `[Recoder] Sibling progress: ${oneLine(input.agent)} is editing ${pathsPart}, ${statPart} so far. Coordinate: avoid these files or build on them.`;
}

/**
 * The dedupe key of a broadcast: the sender's FULL sorted changed-file set (a
 * receiver is never re-steered the same path set from the same sender — a
 * lines-only milestone in the same files is noise it already coordinated on).
 * Paths unreadable ⇒ key on the observed file count, the only signal there is.
 */
function pathsKeyOf(entry: Pick<SiblingCompareEntry, 'changedFiles' | 'diffStat'>): string {
  return entry.changedFiles
    ? [...entry.changedFiles].sort().join('\n')
    : `files#${entry.diffStat?.files ?? 0}`;
}

/**
 * Whether a workspace participates in sibling awareness. The launch path stamps
 * `metadata.siblingAwareness` (TRUE by default for taskGroup launches); ONLY an
 * explicit `false` opts out, so pre-flag grouped workspaces still participate.
 */
export function siblingAwarenessEnabled(workspace: Pick<Workspace, 'metadata'>): boolean {
  const raw = workspace.metadata?.[SIBLING_AWARENESS_METADATA_KEY];
  return raw !== false && raw !== 'false';
}

/**
 * Resolve the metadata to persist at launch. An explicit input flag wins; else a
 * boolean already on the metadata is kept; else a taskGroup launch defaults TRUE
 * (mid-run awareness is the point of launching 2+ parallel agents); else the
 * metadata is returned unchanged (an ungrouped launch stays byte-identical).
 */
export function stampSiblingAwareness(
  metadata: Record<string, unknown> | undefined,
  flag: boolean | undefined,
): Record<string, unknown> | undefined {
  const existing = metadata?.[SIBLING_AWARENESS_METADATA_KEY];
  const grouped =
    typeof metadata?.[TASK_GROUP_METADATA_KEY] === 'string' &&
    (metadata[TASK_GROUP_METADATA_KEY] as string).trim().length > 0;
  const resolved =
    flag ?? (typeof existing === 'boolean' ? existing : grouped ? true : undefined);
  if (resolved === undefined || existing === resolved) return metadata;
  return { ...(metadata ?? {}), [SIBLING_AWARENESS_METADATA_KEY]: resolved };
}

export interface SiblingAwarenessSinkDeps {
  /** The already-composed durable+live(+completion-hook) sink to wrap. */
  readonly inner: RunEventSinkPort;
  /** Resolve a workspace record (metadata flag + task/run anchors). */
  readonly getWorkspace: (workspaceId: string) => Promise<Workspace | null>;
  /**
   * The FULL sibling read model of a workspace's taskGroup (the module's
   * principal-less `workspaceSiblings` — an internal read, like the merge-time
   * evidence read). Carries agent/branch/state/sessionName/changedFiles/diffStat.
   */
  readonly siblings: (workspaceId: string) => Promise<CompareView | null>;
  /**
   * The GOVERNED steer seam (the module's `steerWorkspace` under an internal
   * principal). It re-verifies state === 'running' + a live session + a wired
   * transport and refuses truthfully — this sink treats `ok:false` as a skip.
   */
  readonly steer: (input: {
    workspaceId: string;
    keys: string;
    submit: boolean;
  }) => Promise<{ ok: boolean; reason?: string }>;
  readonly logger: Logger;
  /** Injectable clock/id for deterministic tests. */
  readonly now?: () => string;
  readonly id?: () => string;
}

/** True for the two terminal RunEvent types the fan-out fires on. */
function isTerminal(type: RunEvent['type']): type is 'completed' | 'failed' {
  return type === 'completed' || type === 'failed';
}

/**
 * Resolve the workspace a RunEvent belongs to. Substrate-tailed mid-run events
 * carry no `data.workspaceId`, but every engine mints the deterministic
 * `run_<workspaceId>` runId (workspace-engine.ts) — a truthful fallback: the id
 * is always verified against the repository before anything acts on it.
 */
function eventWorkspaceId(event: RunEvent): string | undefined {
  if (typeof event.data?.workspaceId === 'string' && event.data.workspaceId) {
    return event.data.workspaceId;
  }
  if (event.runId && event.runId.startsWith('run_')) {
    return event.runId.slice('run_'.length);
  }
  return undefined;
}

/** Per-SENDER mid-run state: read throttle + the snapshot at the last broadcast. */
interface SenderProgress {
  readonly lastCheckMs: number;
  readonly lastBroadcast?: ProgressSnapshot;
}

/** Per-RECEIVER mid-run state: the note rate window + per-sender dedupe keys. */
interface ReceiverState {
  readonly lastNoteMs: number;
  /** Last delivered path-set key by sender workspaceId (dedupe). */
  readonly pathsKeyBySender: Map<string, string>;
}

/** Insert keeping the map bounded: beyond the cap the OLDEST entry drops. */
function boundedSet<V>(map: Map<string, V>, key: string, value: V): void {
  map.delete(key); // re-insert so a live workspace is never the eviction victim
  map.set(key, value);
  while (map.size > MAX_TRACKED_WORKSPACES) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

/** Wrap `inner` so a terminal event fans a sibling-update note to live siblings. */
export function createSiblingAwarenessSink(deps: SiblingAwarenessSinkDeps): RunEventSinkPort {
  const { inner, getWorkspace, siblings, steer, logger } = deps;
  const now = deps.now ?? (() => new Date().toISOString());
  const id = deps.id ?? (() => `sibctx_${randomUUID()}`);
  const senders = new Map<string, SenderProgress>();
  const receivers = new Map<string, ReceiverState>();

  /** Terminal ⇒ this workspace's mid-run state is dead weight — drop it. */
  function evictProgress(workspaceId: string): void {
    senders.delete(workspaceId);
    receivers.delete(workspaceId);
    for (const rx of receivers.values()) rx.pathsKeyBySender.delete(workspaceId);
  }

  async function deliverToSibling(
    sibling: SiblingCompareEntry,
    note: string,
    from: { workspaceId: string; agent: string; createdBy: string },
  ): Promise<void> {
    // Steer needs a LIVE turn: skip a non-running sibling or one with no
    // session handle truthfully (steerWorkspace would refuse the same way).
    if (sibling.state !== 'running' || !sibling.sessionName) return;
    const receiver = await getWorkspace(sibling.workspaceId);
    if (!receiver || !siblingAwarenessEnabled(receiver)) return; // opted out
    // OWNERSHIP GATE: taskGroup is a caller-supplied string, so group
    // membership alone must never bridge owners — a colliding group id would
    // otherwise leak the sender's paths to a stranger AND inject text into
    // their live session under the internal principal.
    if (receiver.createdBy !== from.createdBy) return;
    const steered = await steer({
      workspaceId: sibling.workspaceId,
      keys: note,
      submit: true,
    });
    if (!steered.ok) {
      logger.debug(
        { workspaceId: sibling.workspaceId, reason: steered.reason },
        'conductor sibling-awareness steer refused — skipped truthfully',
      );
      return;
    }
    // Evidence on the RECEIVING workspace: the audit trail shows the
    // cross-pollination truthfully (type stays inside the frozen union; the
    // discriminator + provenance ride `data`).
    await inner.append({
      eventId: id(),
      type: 'log',
      taskId: receiver.taskId,
      ...(receiver.runId ? { runId: receiver.runId } : {}),
      createdAt: now(),
      message: `[${SIBLING_CONTEXT_DELIVERED}] from ${oneLine(from.agent)} (${from.workspaceId})`,
      data: {
        kind: SIBLING_CONTEXT_DELIVERED,
        workspaceId: sibling.workspaceId,
        fromWorkspaceId: from.workspaceId,
        agent: from.agent,
      },
    });
  }

  interface ProgressDelivery {
    readonly note: string;
    readonly pathsKey: string;
    readonly milestone: MidRunMilestone;
    readonly nowMs: number;
    readonly from: { workspaceId: string; agent: string; createdBy: string };
  }

  /** Steer one mid-run progress note, under the receiver rate cap + dedupe. */
  async function deliverProgressToSibling(
    sibling: SiblingCompareEntry,
    delivery: ProgressDelivery,
  ): Promise<void> {
    if (sibling.state !== 'running' || !sibling.sessionName) return;
    const rx = receivers.get(sibling.workspaceId);
    // Rate cap: one mid-run note per receiver per window, whoever the sender is.
    if (rx && delivery.nowMs - rx.lastNoteMs < MIDRUN_NOTE_INTERVAL_MS) return;
    // Dedupe: the receiver already coordinated on this exact path set.
    if (rx?.pathsKeyBySender.get(delivery.from.workspaceId) === delivery.pathsKey) return;
    // Claim the receiver window SYNCHRONOUSLY before the awaits — two senders
    // crossing milestones concurrently would otherwise both read the stale
    // window and double-deliver inside it (the sender side claims the same
    // way). Rolled back below when the delivery is refused.
    const priorRx = rx;
    const pathsKeyBySender = rx?.pathsKeyBySender ?? new Map<string, string>();
    boundedSet(receivers, sibling.workspaceId, {
      lastNoteMs: delivery.nowMs,
      pathsKeyBySender,
    });
    const rollback = () => {
      if (priorRx) {
        boundedSet(receivers, sibling.workspaceId, priorRx);
      } else {
        receivers.delete(sibling.workspaceId);
      }
    };
    const receiver = await getWorkspace(sibling.workspaceId);
    if (!receiver || !siblingAwarenessEnabled(receiver)) {
      rollback();
      return;
    }
    // OWNERSHIP GATE: caller-supplied taskGroup strings never bridge owners
    // (see deliverToSibling).
    if (receiver.createdBy !== delivery.from.createdBy) {
      rollback();
      return;
    }
    const steered = await steer({
      workspaceId: sibling.workspaceId,
      keys: delivery.note,
      submit: true,
    });
    if (!steered.ok) {
      logger.debug(
        { workspaceId: sibling.workspaceId, reason: steered.reason },
        'conductor sibling-awareness mid-run steer refused — skipped truthfully',
      );
      rollback();
      return;
    }
    pathsKeyBySender.set(delivery.from.workspaceId, delivery.pathsKey);
    boundedSet(receivers, sibling.workspaceId, {
      lastNoteMs: delivery.nowMs,
      pathsKeyBySender,
    });
    // Same evidence event as v1, with the milestone marker riding the payload.
    await inner.append({
      eventId: id(),
      type: 'log',
      taskId: receiver.taskId,
      ...(receiver.runId ? { runId: receiver.runId } : {}),
      createdAt: now(),
      message: `[${SIBLING_CONTEXT_DELIVERED}] progress from ${oneLine(delivery.from.agent)} (${delivery.from.workspaceId})`,
      data: {
        kind: SIBLING_CONTEXT_DELIVERED,
        milestone: delivery.milestone,
        workspaceId: sibling.workspaceId,
        fromWorkspaceId: delivery.from.workspaceId,
        agent: delivery.from.agent,
      },
    });
  }

  /**
   * A mid-run event is a TICK: throttled per sender, re-observe the sibling read
   * model, and on a milestone crossing broadcast a progress note to the OTHER
   * running siblings. The broadcast snapshot advances the moment a milestone is
   * detected — one broadcast attempt per milestone (a receiver its rate cap
   * blocked catches up on the next milestone, never a duplicate).
   */
  async function probeMidRun(fromId: string): Promise<void> {
    const nowMs = Date.parse(now());
    const known = senders.get(fromId);
    if (known && nowMs - known.lastCheckMs < MIDRUN_CHECK_INTERVAL_MS) return;
    // Claim the check window BEFORE the async reads so concurrent pane-delta
    // events cannot stampede the (git-backed) sibling read.
    boundedSet(senders, fromId, {
      lastCheckMs: nowMs,
      ...(known?.lastBroadcast ? { lastBroadcast: known.lastBroadcast } : {}),
    });
    const sender = await getWorkspace(fromId);
    // Mid-run only, and the sender must participate (same flag as v1).
    if (!sender || sender.state !== 'running' || !siblingAwarenessEnabled(sender)) return;
    const view = await siblings(fromId);
    if (!view || !view.taskGroup || view.count < 2) return;
    const source = view.siblings.find(s => s.workspaceId === fromId);
    if (!source || source.state !== 'running') return;
    const snapshot = progressSnapshotOf(source);
    if (!snapshot) return; // diff unreadable — never fabricate a 0/0 observation
    const milestone = crossedMilestone(known?.lastBroadcast, snapshot);
    if (!milestone) return;
    // A terminal event may have evicted this sender while the reads above were
    // in flight — re-inserting here would resurrect dead state and let a
    // 'progress' note fire after the sender already finished.
    if (!senders.has(fromId)) return;
    boundedSet(senders, fromId, { lastCheckMs: nowMs, lastBroadcast: snapshot });
    const agent = source.agent ?? sender.runtimeId;
    const delivery: ProgressDelivery = {
      note: composeSiblingProgressNote({
        agent,
        ...(source.changedFiles ? { changedFiles: source.changedFiles } : {}),
        ...(source.diffStat ? { diffStat: source.diffStat } : {}),
      }),
      pathsKey: pathsKeyOf(source),
      milestone,
      nowMs,
      from: { workspaceId: fromId, agent, createdBy: sender.createdBy },
    };
    for (const sibling of view.siblings) {
      if (sibling.workspaceId === fromId) continue;
      try {
        await deliverProgressToSibling(sibling, delivery);
      } catch (err) {
        // Per-sibling isolation: one failed delivery never touches the others.
        logger.warn(
          { err, workspaceId: sibling.workspaceId, fromWorkspaceId: fromId },
          'conductor sibling-awareness mid-run delivery faulted — sibling skipped',
        );
      }
    }
  }

  async function fanOut(outcome: 'completed' | 'failed', fromId: string): Promise<void> {
    const finished = await getWorkspace(fromId);
    // The finishing side opted out ⇒ no broadcast at all.
    if (!finished || !siblingAwarenessEnabled(finished)) return;
    const view = await siblings(fromId);
    // Ungrouped/singleton ⇒ no siblings to inform (truthful no-op).
    if (!view || !view.taskGroup || view.count < 2) return;
    const source = view.siblings.find(s => s.workspaceId === fromId);
    const agent = source?.agent ?? finished.runtimeId;
    const note = composeSiblingNote({
      agent,
      branch: source?.branch ?? finished.branch,
      outcome,
      ...(source?.changedFiles ? { changedFiles: source.changedFiles } : {}),
      ...(source?.diffStat ? { diffStat: source.diffStat } : {}),
    });
    for (const sibling of view.siblings) {
      if (sibling.workspaceId === fromId) continue;
      try {
        await deliverToSibling(sibling, note, { workspaceId: fromId, agent, createdBy: finished.createdBy });
      } catch (err) {
        // Per-sibling isolation: one failed delivery never touches the others.
        logger.warn(
          { err, workspaceId: sibling.workspaceId, fromWorkspaceId: fromId },
          'conductor sibling-awareness delivery faulted — sibling skipped',
        );
      }
    }
  }

  return {
    async append(event: RunEvent): Promise<void> {
      // Durable audit + live stream FIRST — never delayed by the fan-out.
      await inner.append(event);
      const fromId = eventWorkspaceId(event);
      if (!fromId) return;
      if (isTerminal(event.type)) {
        evictProgress(fromId);
        void fanOut(event.type, fromId).catch(err =>
          logger.warn(
            { err, eventId: event.eventId },
            'conductor sibling-awareness hook faulted — terminal event unaffected',
          ),
        );
        return;
      }
      // v2: every mid-run event is a (throttled) milestone tick — fire-and-forget.
      void probeMidRun(fromId).catch(err =>
        logger.warn(
          { err, eventId: event.eventId },
          'conductor sibling-awareness mid-run probe faulted — event unaffected',
        ),
      );
    },
  };
}
