/**
 * Beads issue-tracker sync — the PRODUCT-path bridge between the canonical
 * Agent OS task store (owned by docker-backend's repository) and the external
 * `bd`/beads issue graph.
 *
 * This wires the Agent OS seam end to end on the real conductor surface:
 *
 *   @recoder/beads-adapter   BeadsIssueTracker (implements IssueTrackerPort)
 *           │                       └─ createBeadsClient → shells to the `bd` CLI
 *           ▼
 *   @recoder/agent-os        IssueTrackerSyncService (depends only on the port)
 *           │
 *           ▼
 *   docker-backend           upsert canonical TaskSpecs into agentOsContainer.repository
 *
 * Agent OS owns canonical task state; beads is a replaceable adapter. The CLI is
 * invoked as a subprocess (no in-process beads runtime). Every entry point is
 * DEGRADE-SAFE: if the `bd` binary is absent or the CLI throws, we log and return
 * an empty/skip result — we never crash a request or block a launch.
 */
import { execFileSync } from 'node:child_process';
import {
  BEADS_TRACKER_ID,
  BeadsIssueTracker,
  createBeadsClient,
  syncTaskSpecToBeads,
  type BeadsClient,
  type BeadsCommandRunner,
} from '@recoder/beads-adapter';
import {
  IssueTrackerSyncService,
  type Artifact,
  type TaskIntent,
  type TaskSpec,
} from '@recoder/agent-os';
import { createLogger } from '../logger.js';
import { agentOsContainer } from '../agent-os/service-container.js';
import type { AgentOsRepository } from '../agent-os/repositories/agent-os.repository.js';

const logger = createLogger('conductor:beads-sync');

/** Binary name used to shell out to beads. Overridable for vendored installs. */
export function beadsBin(): string {
  return process.env.CONDUCTOR_BD_BIN?.trim() || process.env.BD_BIN?.trim() || 'bd';
}

export type BeadsAvailability = {
  available: boolean;
  bin: string;
  version?: string;
  reason?: string;
};

/**
 * Truthful availability of the `bd` CLI. Runs `bd --version` as a subprocess and
 * reports whether it succeeded — never throws. When this returns
 * `available: false`, every sync entry point cleanly skips.
 */
export function beadsAvailability(): BeadsAvailability {
  const bin = beadsBin();
  try {
    const out = execFileSync(bin, ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
    });
    return { available: true, bin, version: out.trim() || undefined };
  } catch (err) {
    return {
      available: false,
      bin,
      reason: err instanceof Error ? err.message : 'bd not available',
    };
  }
}

export type BeadsSyncDeps = {
  /** Inject a BeadsClient (for tests / vendored transports). Defaults to the CLI runner. */
  client?: BeadsClient;
  /** Canonical task repository. Defaults to the live Agent OS container repository. */
  repository?: AgentOsRepository;
  /** Working directory the `bd` CLI runs in (the beads-tracked repo). */
  cwd?: string;
};

/**
 * Construct the Agent OS IssueTrackerSyncService over the REAL BeadsIssueTracker
 * adapter, returning both the service (the port seam Agent OS depends on) and the
 * concrete BeadsClient so callers that need to make a CREATE decision the narrow
 * port can't express (create-then-update for Agent-OS-native tasks) can drive the
 * same `bd` transport. Agent OS still only ever sees the IssueTrackerPort; the
 * client is the local escape hatch, not new canonical state.
 */
function buildSyncService(deps: BeadsSyncDeps = {}): {
  service: IssueTrackerSyncService;
  client: BeadsClient;
} {
  const client = deps.client ?? createBeadsClient(beadsCliRunner(deps.cwd));
  const tracker = new BeadsIssueTracker({ client });
  return { service: new IssueTrackerSyncService(tracker), client };
}

/**
 * Inverse of the adapter's issue-type → intent map: pick the bd `-t <type>` for a
 * canonical TaskSpec so a freshly CREATED bd issue lands with a sensible native
 * type. Unknown/custom intents fall back to `task` (beads' generic work type).
 */
const INTENT_TO_BEADS_TYPE: Partial<Record<TaskIntent, string>> = {
  bugfix: 'bug',
  feature_delivery: 'feature',
  platform_hardening: 'task',
  refactor: 'task',
  code_review: 'review',
  test_generation: 'test',
  verification: 'test',
  documentation: 'docs',
  research: 'research',
  migration: 'task',
};

function beadsTypeForIntent(intent: TaskIntent): string {
  return INTENT_TO_BEADS_TYPE[intent] ?? 'task';
}

/**
 * Derive a bd priority (lower = more urgent in beads) from the canonical task's
 * approval posture. Tasks gated on approval are treated as higher priority so they
 * surface in `bd ready`; everything else gets the default middle priority.
 */
function beadsPriorityForTask(task: TaskSpec): number {
  return task.approvalRequired.length > 0 ? 1 : 2;
}

/**
 * CLI transport that shells to the resolved `bd` binary (honoring CONDUCTOR_BD_BIN)
 * in the given working directory. Mirrors @recoder/beads-adapter's createBeadsCliRunner
 * but respects the binary override so vendored installs work.
 */
function beadsCliRunner(cwd = process.cwd()): BeadsCommandRunner {
  const bin = beadsBin();
  return (args) => execFileSync(bin, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function resolveRepository(deps: BeadsSyncDeps): AgentOsRepository {
  return deps.repository ?? agentOsContainer.repository;
}

export type ImportReadyResult = {
  imported: number;
  taskIds: string[];
  skipped?: string;
};

/**
 * Pull ready beads issues into the canonical Agent OS task store, through the
 * IssueTrackerPort seam, and UPSERT each resulting TaskSpec into the repository.
 *
 * Degrade-safe: when `bd` is unavailable (or an explicit client is not provided),
 * returns `{ imported: 0, skipped }` without touching the repository. CLI failures
 * are logged and surfaced as a skip rather than thrown.
 */
export async function importReadyBeadsTasks(
  input: { spaceId: string; repo?: string },
  deps: BeadsSyncDeps = {},
): Promise<ImportReadyResult> {
  // When a transport is injected (tests / vendored), skip the binary probe.
  if (!deps.client) {
    const availability = beadsAvailability();
    if (!availability.available) {
      logger.info({ reason: availability.reason }, 'beads import skipped — bd CLI unavailable');
      return { imported: 0, taskIds: [], skipped: availability.reason ?? 'bd unavailable' };
    }
  }

  try {
    const { service } = buildSyncService(deps);
    const tasks = await service.importReadyTasks({ spaceId: input.spaceId, repo: input.repo });
    const repository = resolveRepository(deps);
    const taskIds: string[] = [];
    for (const task of tasks) {
      await Promise.resolve(repository.upsertTask(task));
      taskIds.push(task.taskId);
    }
    logger.info({ spaceId: input.spaceId, imported: taskIds.length }, 'beads import complete');
    return { imported: taskIds.length, taskIds };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'beads import failed';
    logger.warn({ reason }, 'beads import failed — degrading to skip');
    return { imported: 0, taskIds: [], skipped: reason };
  }
}

export type ExportResult = {
  exported: boolean;
  externalId?: string;
  tracker?: string;
  skipped?: string;
};

/**
 * Push a single canonical TaskSpec (plus optional artifacts) back to beads as a
 * genuine CREATE-OR-UPDATE — the half of two-way sync the narrow IssueTrackerPort
 * cannot express on its own.
 *
 * The port's `exportTask` only ever runs `bd update <task.taskId>`, which lands an
 * issue's metadata description but fails for any Agent-OS-native task whose
 * `taskId` is not already a `bd` issue id. So before delegating we probe with the
 * engine's `client.show(taskId)`:
 *
 *  - issue exists  → drive it through the real IssueTrackerSyncService seam
 *                    (update path), preserving the existing contract.
 *  - issue missing → `client.create(...)` a real `bd` issue first, capture the
 *                    bd-assigned id, then `syncTaskSpecToBeads` the full metadata
 *                    onto it. `externalId` reports the id beads actually assigned
 *                    so the caller can round-trip back to canonical state.
 *
 * Degrade-safe: returns `{ exported: false, skipped }` when `bd` is unavailable
 * or the CLI throws; never crashes the caller and never blocks a launch.
 */
export async function exportTaskToBeads(
  input: { task: TaskSpec; artifacts?: Artifact[] },
  deps: BeadsSyncDeps = {},
): Promise<ExportResult> {
  if (!deps.client) {
    const availability = beadsAvailability();
    if (!availability.available) {
      logger.info({ reason: availability.reason }, 'beads export skipped — bd CLI unavailable');
      return { exported: false, skipped: availability.reason ?? 'bd unavailable' };
    }
  }

  try {
    const { service, client } = buildSyncService(deps);

    // Does a bd issue already exist under the canonical taskId? `show` is read-only
    // and tolerates absence (the engine returns null when the id is unknown).
    const existing = client.show(input.task.taskId);

    if (existing) {
      // Existing issue → go through the real Agent OS port seam (drives bd update).
      const result = await service.exportTask({ task: input.task, artifacts: input.artifacts });
      logger.info(
        { taskId: input.task.taskId, externalId: result.ref.externalId, mode: 'update' },
        'beads export complete',
      );
      return { exported: true, externalId: result.ref.externalId, tracker: result.ref.tracker };
    }

    // Agent-OS-native task with no bd issue yet → genuinely CREATE one, then push
    // the full canonical metadata onto the freshly created issue via the engine's
    // own description writer so create and update share one source of truth.
    const created = client.create({
      title: input.task.title,
      description: input.task.goal,
      type: beadsTypeForIntent(input.task.intent),
      priority: beadsPriorityForTask(input.task),
    });

    syncTaskSpecToBeads({
      client,
      task: { ...input.task, taskId: created.id },
      artifacts: input.artifacts,
    });

    logger.info(
      { taskId: input.task.taskId, externalId: created.id, mode: 'create' },
      'beads export complete',
    );
    return { exported: true, externalId: created.id, tracker: BEADS_TRACKER_ID };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'beads export failed';
    logger.warn({ reason }, 'beads export failed — degrading to skip');
    return { exported: false, skipped: reason };
  }
}
