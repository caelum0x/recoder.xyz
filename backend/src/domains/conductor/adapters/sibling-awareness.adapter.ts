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

/** Wrap `inner` so a terminal event fans a sibling-update note to live siblings. */
export function createSiblingAwarenessSink(deps: SiblingAwarenessSinkDeps): RunEventSinkPort {
  const { inner, getWorkspace, siblings, steer, logger } = deps;
  const now = deps.now ?? (() => new Date().toISOString());
  const id = deps.id ?? (() => `sibctx_${randomUUID()}`);

  async function deliverToSibling(
    sibling: SiblingCompareEntry,
    note: string,
    from: { workspaceId: string; agent: string },
  ): Promise<void> {
    // Steer needs a LIVE turn: skip a non-running sibling or one with no
    // session handle truthfully (steerWorkspace would refuse the same way).
    if (sibling.state !== 'running' || !sibling.sessionName) return;
    const receiver = await getWorkspace(sibling.workspaceId);
    if (!receiver || !siblingAwarenessEnabled(receiver)) return; // opted out
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

  async function fanOut(event: RunEvent, outcome: 'completed' | 'failed'): Promise<void> {
    const fromId =
      typeof event.data?.workspaceId === 'string' ? event.data.workspaceId : undefined;
    if (!fromId) return;
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
        await deliverToSibling(sibling, note, { workspaceId: fromId, agent });
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
      if (!isTerminal(event.type)) return;
      void fanOut(event, event.type).catch(err =>
        logger.warn(
          { err, eventId: event.eventId },
          'conductor sibling-awareness hook faulted — terminal event unaffected',
        ),
      );
    },
  };
}
