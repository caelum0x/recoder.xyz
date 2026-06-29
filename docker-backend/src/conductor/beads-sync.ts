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
  BeadsIssueTracker,
  createBeadsClient,
  type BeadsClient,
  type BeadsCommandRunner,
} from '@recoder/beads-adapter';
import {
  IssueTrackerSyncService,
  type Artifact,
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
 * adapter. Agent OS depends only on the IssueTrackerPort; the concrete beads
 * adapter is injected here. The CLI transport shells to `bd` in `cwd`.
 */
function buildSyncService(deps: BeadsSyncDeps = {}): IssueTrackerSyncService {
  const client = deps.client ?? createBeadsClient(beadsCliRunner(deps.cwd));
  const tracker = new BeadsIssueTracker({ client });
  return new IssueTrackerSyncService(tracker);
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
    const service = buildSyncService(deps);
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
 * Push a single canonical TaskSpec (plus optional artifacts) back to beads
 * through the IssueTrackerPort seam.
 *
 * Degrade-safe: returns `{ exported: false, skipped }` when `bd` is unavailable
 * or the CLI throws; never crashes the caller.
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
    const service = buildSyncService(deps);
    const result = await service.exportTask({ task: input.task, artifacts: input.artifacts });
    logger.info({ taskId: input.task.taskId, externalId: result.ref.externalId }, 'beads export complete');
    return { exported: true, externalId: result.ref.externalId, tracker: result.ref.tracker };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'beads export failed';
    logger.warn({ reason }, 'beads export failed — degrading to skip');
    return { exported: false, skipped: reason };
  }
}
