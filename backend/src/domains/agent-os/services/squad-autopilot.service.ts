/**
 * `SquadAutopilotService` — the cron→beads→conductor loop (docs/modules/
 * squads.md `autopilot`). Each tick pulls READY issues from the beads issue
 * graph (through the engines `EngineClientPort` seam — never a direct shell)
 * and dispatches each as a conductor workspace through the narrow
 * {@link SquadConductorPort}. When a squad is configured, the tick routes each
 * issue through {@link SquadService} first (leader-first / weighted) and a
 * fail-closed route SKIPS the dispatch with the routing reason.
 *
 * DEGRADE LAW (truthful, never faked):
 *  - beads seam absent / `bd` down  ⇒ tick is `degraded` with the seam reason;
 *  - conductor seam absent          ⇒ tick is `degraded`, nothing dispatched;
 *  - conductor refuses a dispatch   ⇒ the issue is recorded `failed` with the
 *    refusal reason and retried on a later tick.
 * The board read model is the audit surface: every dispatch / failure / skip
 * is recorded per issue, and already-dispatched issues are never re-launched.
 *
 * Interval driver mirrors `OutboxDrainService`: idempotent start/stop, unref'd
 * timer, overlapping passes skipped.
 */
import type { Logger } from '../../../shared/logger.js';
import type { EngineClientPort } from '../../engines/ports/engine-client.port.js';
import type { SquadConductorPort } from '../ports/squad-autopilot.port.js';
import type { SquadService } from './squad.service.js';

/** A parsed ready issue from `bd ready --json`. */
interface ReadyIssue {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
}

/** One board row — the truthful record of what the autopilot did with an issue. */
export interface AutopilotBoardEntry {
  readonly issueId: string;
  readonly title: string;
  readonly status: 'dispatched' | 'failed' | 'skipped';
  readonly workspaceId?: string;
  readonly runId?: string;
  readonly routedAgentId?: string;
  readonly reason?: string;
  readonly at: string;
}

/** The truthful result of one autopilot pass. */
export interface AutopilotTickResult {
  readonly operation: 'squad-autopilot.tick';
  /** `degraded` when a load-bearing seam (beads / conductor) is absent or down. */
  readonly status: 'ok' | 'degraded';
  readonly reason?: string;
  /** Ready issues seen this pass. */
  readonly ready: number;
  /** Workspaces genuinely launched this pass. */
  readonly dispatched: number;
  /** Dispatches the conductor refused / failed. */
  readonly failed: number;
  /** Issues skipped (already dispatched, un-routable, or missing an id). */
  readonly skipped: number;
  readonly at: string;
}

/** The board read model (`GET /api/agent-os/squads/board`). */
export interface AutopilotBoardView {
  readonly running: boolean;
  readonly beads: { readonly wired: boolean; readonly status?: string; readonly reason?: string };
  readonly conductor: { readonly wired: boolean };
  readonly lastTick: AutopilotTickResult | null;
  readonly entries: readonly AutopilotBoardEntry[];
}

export interface SquadAutopilotDeps {
  /** The beads `EngineClientPort` (`engines.client('beads')`); null ⇒ degraded ticks. */
  readonly beads?: EngineClientPort | null;
  /** The conductor dispatch seam; attachable late (bootstrap builds conductor after agent-os). */
  readonly conductor?: SquadConductorPort | null;
  /** Optional squad routing: when set with `squadId`, each issue routes through the squad. */
  readonly squads?: SquadService | null;
  /** The squad every autopilot dispatch routes through (requires `squads`). */
  readonly squadId?: string;
  readonly logger: Logger;
  readonly intervalMs: number;
  readonly maxDispatchesPerTick: number;
  readonly now?: () => string;
}

/** Per-call deadline for the `bd ready` pull (a slow CLI never stalls the loop). */
const BEADS_READY_TIMEOUT_MS = 15_000;
/** Board retention: oldest entries evicted beyond this many issues. */
const MAX_BOARD_ENTRIES = 200;

export class SquadAutopilotService {
  private readonly beads: EngineClientPort | null;
  private conductor: SquadConductorPort | null;
  private readonly squads: SquadService | null;
  private readonly squadId: string | null;
  private readonly logger: Logger;
  private readonly intervalMs: number;
  private readonly maxDispatchesPerTick: number;
  private readonly now: () => string;

  /** Latest board entry per issue id (insertion-ordered for bounded eviction). */
  private readonly entries = new Map<string, AutopilotBoardEntry>();
  private lastTick: AutopilotTickResult | null = null;
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(deps: SquadAutopilotDeps) {
    this.beads = deps.beads ?? null;
    this.conductor = deps.conductor ?? null;
    this.squads = deps.squads ?? null;
    this.squadId = deps.squadId ?? null;
    this.logger = deps.logger;
    this.intervalMs = deps.intervalMs;
    this.maxDispatchesPerTick = deps.maxDispatchesPerTick;
    this.now = deps.now ?? (() => new Date().toISOString());
  }

  /** Late-bind the conductor seam (bootstrap builds the conductor after agent-os). */
  attachConductor(port: SquadConductorPort): void {
    this.conductor = port;
  }

  /** Run one autopilot pass. Never throws — every fault is a truthful result. */
  async tickOnce(): Promise<AutopilotTickResult> {
    const missing: string[] = [];
    if (!this.beads) missing.push('beads engine client not wired');
    if (!this.conductor) missing.push('conductor dispatch seam not wired');
    if (missing.length > 0) {
      return this.finish({ status: 'degraded', reason: missing.join('; '), ready: 0, dispatched: 0, failed: 0, skipped: 0 });
    }

    const readyResult = await this.pullReady();
    if (!readyResult.ok) {
      return this.finish({ status: 'degraded', reason: `beads ready failed: ${readyResult.reason}`, ready: 0, dispatched: 0, failed: 0, skipped: 0 });
    }

    const issues = readyResult.issues;
    let dispatched = 0;
    let failed = 0;
    let skipped = 0;

    for (const issue of issues) {
      if (dispatched >= this.maxDispatchesPerTick) break; // rest waits for the next tick
      if (this.entries.get(issue.id)?.status === 'dispatched') {
        skipped += 1; // already launched — never re-dispatch a live workspace
        continue;
      }

      const routed = await this.routeThroughSquad(issue);
      if (!routed.ok) {
        skipped += 1;
        this.record({ issueId: issue.id, title: issue.title, status: 'skipped', reason: routed.reason, at: this.now() });
        continue;
      }

      const outcome = await this.dispatch(issue, routed.agentId);
      if (outcome.ok) {
        dispatched += 1;
        this.record({
          issueId: issue.id,
          title: issue.title,
          status: 'dispatched',
          ...(outcome.workspaceId ? { workspaceId: outcome.workspaceId } : {}),
          ...(outcome.runId ? { runId: outcome.runId } : {}),
          ...(routed.agentId ? { routedAgentId: routed.agentId } : {}),
          at: this.now(),
        });
      } else {
        failed += 1;
        this.record({
          issueId: issue.id,
          title: issue.title,
          status: 'failed',
          reason: outcome.reason ?? 'conductor refused the dispatch',
          ...(routed.agentId ? { routedAgentId: routed.agentId } : {}),
          at: this.now(),
        });
        this.logger.warn({ issueId: issue.id, reason: outcome.reason }, 'squad-autopilot: dispatch failed (left for retry)');
      }
    }

    return this.finish({ status: 'ok', ready: issues.length, dispatched, failed, skipped });
  }

  /** The truthful board read model. Non-throwing; probes the beads seam's health. */
  async board(): Promise<AutopilotBoardView> {
    let beads: AutopilotBoardView['beads'] = { wired: false };
    if (this.beads) {
      try {
        const health = await this.beads.health();
        beads = { wired: true, status: health.status, ...(health.reason ? { reason: health.reason } : {}) };
      } catch (err) {
        beads = { wired: true, status: 'down', reason: err instanceof Error ? err.message : 'beads health probe failed' };
      }
    }
    return {
      running: this.timer !== null,
      beads,
      conductor: { wired: this.conductor !== null },
      lastTick: this.lastTick,
      entries: [...this.entries.values()].reverse(), // newest first
    };
  }

  /** True when both load-bearing seams are attached (health rollup input). */
  seams(): { beadsWired: boolean; conductorWired: boolean } {
    return { beadsWired: this.beads !== null, conductorWired: this.conductor !== null };
  }

  /** Start the interval driver. Idempotent; overlapping passes are skipped. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.ticking) return;
      this.ticking = true;
      void this.tickOnce()
        .catch((error) => {
          // Defensive: tickOnce never throws by contract, but the loop must survive.
          this.logger.warn(
            { err: error instanceof Error ? error.message : String(error) },
            'squad-autopilot tick failed',
          );
        })
        .finally(() => {
          this.ticking = false;
        });
    }, this.intervalMs);
    // Do not keep the event loop alive solely for the autopilot.
    this.timer.unref?.();
  }

  /** Stop the interval driver. Idempotent, degrade-safe. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // ---- internals ----------------------------------------------------------

  /** Pull + narrow `bd ready --json` through the engines seam (never throws). */
  private async pullReady(): Promise<{ ok: true; issues: ReadyIssue[] } | { ok: false; reason: string }> {
    try {
      const result = await this.beads!.invoke({ op: 'ready', input: {}, timeoutMs: BEADS_READY_TIMEOUT_MS });
      if (!result.ok) return { ok: false, reason: result.reason };
      const issues = parseReadyIssues(result.value);
      if (issues === null) return { ok: false, reason: 'bd ready returned an unrecognized payload' };
      return { ok: true, issues };
    } catch (err) {
      // Defensive: the seam should not throw, but the loop must never crash.
      return { ok: false, reason: err instanceof Error ? err.message : 'beads invoke threw' };
    }
  }

  /** Route through the configured squad; no squad configured ⇒ pass-through. */
  private async routeThroughSquad(
    issue: ReadyIssue,
  ): Promise<{ ok: true; agentId?: string } | { ok: false; reason: string }> {
    if (!this.squads || !this.squadId) return { ok: true };
    try {
      const route = await this.squads.route(this.squadId, issue.id);
      if (!route.routed) return { ok: false, reason: `squad routing failed closed: ${route.reason}` };
      return { ok: true, ...(route.routedAgentId ? { agentId: route.routedAgentId } : {}) };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : 'squad routing threw' };
    }
  }

  /** Dispatch one issue through the conductor seam (never throws). */
  private async dispatch(
    issue: ReadyIssue,
    routedAgentId: string | undefined,
  ): Promise<{ ok: boolean; workspaceId?: string; runId?: string; reason?: string }> {
    const prompt = [`Work the beads issue ${issue.id}: ${issue.title}`, issue.description ?? '']
      .filter(Boolean)
      .join('\n\n');
    try {
      return await this.conductor!.dispatch({
        taskId: issue.id,
        title: issue.title,
        prompt,
        ...(routedAgentId ? { routedAgentId } : {}),
      });
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : 'conductor dispatch threw' };
    }
  }

  private record(entry: AutopilotBoardEntry): void {
    this.entries.delete(entry.issueId); // refresh insertion order (newest last)
    this.entries.set(entry.issueId, entry);
    while (this.entries.size > MAX_BOARD_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  private finish(partial: Omit<AutopilotTickResult, 'operation' | 'at'>): AutopilotTickResult {
    const result: AutopilotTickResult = { operation: 'squad-autopilot.tick', ...partial, at: this.now() };
    this.lastTick = result;
    if (result.status === 'degraded') {
      this.logger.warn({ reason: result.reason }, 'squad-autopilot tick degraded');
    }
    return result;
  }
}

/**
 * Narrow the `bd ready --json` payload into issues. Accepts a bare array or an
 * `{ issues: [...] }` envelope; anything else is `null` (truthful degrade —
 * never guess work out of an unrecognized payload). Items without a string id
 * are dropped.
 */
function parseReadyIssues(payload: unknown): ReadyIssue[] | null {
  const list = Array.isArray(payload)
    ? payload
    : payload !== null && typeof payload === 'object' && Array.isArray((payload as { issues?: unknown }).issues)
      ? ((payload as { issues: unknown[] }).issues)
      : null;
  if (list === null) return null;

  const issues: ReadyIssue[] = [];
  for (const item of list) {
    if (item === null || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === 'string' && rec.id.trim() ? rec.id.trim() : undefined;
    if (!id) continue;
    const title = typeof rec.title === 'string' && rec.title.trim() ? rec.title.trim() : id;
    const description =
      typeof rec.description === 'string' && rec.description.trim() ? rec.description.trim() : undefined;
    issues.push({ id, title, ...(description ? { description } : {}) });
  }
  return issues;
}
