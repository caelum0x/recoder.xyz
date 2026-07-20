/**
 * `SquadAutopilotService` — the cron→beads→conductor loop (docs/modules/
 * squads.md `autopilot`). Each tick pulls READY issues from the beads issue
 * graph (through the typed {@link SquadIssuePort} over the memory-owned module
 * facet — never a direct shell, never the raw engine seam) and dispatches each
 * as a conductor workspace through the narrow {@link SquadConductorPort}. When
 * a squad is configured, the tick routes each issue through
 * {@link SquadService} first (leader-first / weighted) and a fail-closed route
 * SKIPS the dispatch with the routing reason.
 *
 * DEGRADE LAW (truthful, never faked):
 *  - issue-graph seam unattached / `bd` down ⇒ tick is `degraded` with the
 *    seam reason (the port's `health()` is the truthful probe — its reads
 *    degrade to `[]`, so "down" and "no work" are told apart by probing);
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
import type {
  SquadIssuePort,
  SquadReadyIssue,
  SquadStaleIssue,
} from '../ports/squad-issue.port.js';
import type { SquadConductorPort } from '../ports/squad-autopilot.port.js';
import type { SquadService } from './squad.service.js';

/** A ready issue as the issue-graph port reports it (`bd ready --json`). */
type ReadyIssue = SquadReadyIssue;

/** One accumulated NOTE (bd comment) another agent wrote onto the issue. */
interface IssueNote {
  readonly author?: string;
  readonly text: string;
}

/** One dependency edge in the issue's lineage (discovered-from / blocks / …). */
interface IssueDependency {
  readonly id: string;
  readonly title?: string;
  readonly type?: string;
  readonly status?: string;
}

/**
 * The shared-memory context read back off the issue graph (`bd show --long`):
 * the NOTE evidence + dependency lineage prior agents wrote onto this very
 * issue. Woven into the conductor launch prompt so the new agent inherits it.
 */
interface IssueLineage {
  readonly notes: readonly IssueNote[];
  readonly dependencies: readonly IssueDependency[];
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
  /**
   * Stalled in-flight work (`bd stale` via the issue-graph port) — explicit
   * control-plane state, never a generic "working". `[]` when the seam is
   * unattached or down (the `beads` section carries the truthful reason).
   */
  readonly staleIssues: readonly SquadStaleIssue[];
}

export interface SquadAutopilotDeps {
  /**
   * The issue-graph read seam; usually attached late via `attachIssueGraph`
   * (bootstrap builds memory after agent-os). Unattached ⇒ degraded ticks.
   */
  readonly issueGraph?: SquadIssuePort | null;
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

/** Board retention: oldest entries evicted beyond this many issues. */
const MAX_BOARD_ENTRIES = 200;

export class SquadAutopilotService {
  private issueGraph: SquadIssuePort | null;
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
    this.issueGraph = deps.issueGraph ?? null;
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

  /** Late-bind the issue-graph seam (bootstrap builds memory after agent-os). */
  attachIssueGraph(port: SquadIssuePort): void {
    this.issueGraph = port;
  }

  /** Run one autopilot pass. Never throws — every fault is a truthful result. */
  async tickOnce(): Promise<AutopilotTickResult> {
    const missing: string[] = [];
    if (!this.issueGraph) missing.push('issue-graph seam not attached');
    if (!this.conductor) missing.push('conductor dispatch seam not wired');
    if (missing.length > 0) {
      return this.finish({ status: 'degraded', reason: missing.join('; '), ready: 0, dispatched: 0, failed: 0, skipped: 0 });
    }

    const readyResult = await this.pullReady();
    if (!readyResult.ok) {
      return this.finish({ status: 'degraded', reason: `issue-graph ready failed: ${readyResult.reason}`, ready: 0, dispatched: 0, failed: 0, skipped: 0 });
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

  /** The truthful board read model. Non-throwing; probes the issue-graph seam's health. */
  async board(): Promise<AutopilotBoardView> {
    let beads: AutopilotBoardView['beads'] = { wired: false };
    let staleIssues: readonly SquadStaleIssue[] = [];
    if (this.issueGraph) {
      try {
        const health = await this.issueGraph.health();
        beads = {
          wired: true,
          status: health.available ? 'up' : 'down',
          ...(health.reason ? { reason: health.reason } : {}),
        };
      } catch (err) {
        beads = { wired: true, status: 'down', reason: err instanceof Error ? err.message : 'issue-graph health probe failed' };
      }
      try {
        // Stalled in-flight work surfaced as board state; the port's degrade
        // law makes a down graph read as `[]` (the health above tells why).
        staleIssues = await this.issueGraph.stale();
      } catch (err) {
        // Defensive: the port should not throw — a stale read never breaks the board.
        this.logger.debug?.(
          { err: err instanceof Error ? err.message : String(err) },
          'squad-autopilot: issue-graph stale read threw (board serves without it)',
        );
      }
    }
    return {
      running: this.timer !== null,
      beads,
      conductor: { wired: this.conductor !== null },
      lastTick: this.lastTick,
      entries: [...this.entries.values()].reverse(), // newest first
      staleIssues,
    };
  }

  /** True when both load-bearing seams are attached (health rollup input). */
  seams(): { beadsWired: boolean; conductorWired: boolean } {
    return { beadsWired: this.issueGraph !== null, conductorWired: this.conductor !== null };
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

  /**
   * Pull ready work through the typed issue-graph port (never throws). The
   * port's DEGRADE LAW makes a down graph read as `[]`, so an EMPTY pull is
   * followed by the truthful `health()` probe to tell "no ready work" apart
   * from "graph down" — a busy pull never pays the extra probe.
   */
  private async pullReady(): Promise<{ ok: true; issues: readonly ReadyIssue[] } | { ok: false; reason: string }> {
    try {
      const issues = await this.issueGraph!.ready();
      if (issues.length > 0) return { ok: true, issues };
      const health = await this.issueGraph!.health();
      if (!health.available) return { ok: false, reason: health.reason ?? 'issue graph unavailable' };
      return { ok: true, issues };
    } catch (err) {
      // Defensive: the port should not throw, but the loop must never crash.
      return { ok: false, reason: err instanceof Error ? err.message : 'issue-graph read threw' };
    }
  }

  /**
   * Read the issue's shared-memory context (`bd show <id> --long`) back off the
   * graph: the accumulated NOTE evidence + dependency lineage. Degrade-truthful
   * — any fault (seam down, absent issue, throw) returns `null` and the
   * dispatch proceeds on the flat title+description; the loop is never blocked.
   */
  private async pullLineage(issueId: string): Promise<IssueLineage | null> {
    try {
      const detail = await this.issueGraph!.show(issueId, { long: true });
      if (!detail) {
        this.logger.debug?.(
          { issueId },
          'squad-autopilot: issue-graph show unavailable (dispatching without lineage)',
        );
        return null;
      }
      return parseIssueLineage(detail);
    } catch (err) {
      // Defensive: the port should not throw, but a lineage read must never
      // fail a dispatch.
      this.logger.debug?.(
        { issueId, err: err instanceof Error ? err.message : String(err) },
        'squad-autopilot: issue-graph show threw (dispatching without lineage)',
      );
      return null;
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
    // FUSION: read the issue's accumulated NOTE evidence + dependency lineage
    // back off the shared issue graph and weave it into the launch prompt so the
    // dispatched agent inherits what prior agents wrote onto this issue — not
    // just the flat title+description. Degrade-truthful: a failed `show` skips
    // the section, it never blocks the dispatch.
    const lineage = await this.pullLineage(issue.id);
    const prompt = composeLaunchPrompt(issue, lineage);
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
 * Compose the conductor launch prompt for an issue. The base is the flat
 * `id + title + description`; when the issue graph yielded lineage (`bd show
 * --long`), a "Shared memory" block is appended carrying the dependency lineage
 * and the accumulated NOTE evidence prior agents wrote onto the issue. Empty
 * sections are omitted — a lineage-less issue reads exactly as before.
 */
export function composeLaunchPrompt(issue: ReadyIssue, lineage: IssueLineage | null): string {
  const parts = [`Work the beads issue ${issue.id}: ${issue.title}`];
  if (issue.description) parts.push(issue.description);

  const memory: string[] = [];
  if (lineage && lineage.dependencies.length > 0) {
    memory.push('Dependency lineage (from the issue graph):');
    for (const dep of lineage.dependencies) {
      const rel = dep.type ? `${dep.type} ` : 'depends-on ';
      const title = dep.title ? ` (${dep.title})` : '';
      const status = dep.status ? ` [${dep.status}]` : '';
      memory.push(`- ${rel}${dep.id}${title}${status}`);
    }
  }
  if (lineage && lineage.notes.length > 0) {
    if (memory.length > 0) memory.push('');
    memory.push('Accumulated notes / evidence prior agents recorded on this issue:');
    for (const note of lineage.notes) {
      memory.push(`- ${note.author ? `[${note.author}] ` : ''}${note.text}`);
    }
  }
  if (memory.length > 0) {
    parts.push(
      ['--- Shared memory from the beads issue graph ---', ...memory].join('\n'),
    );
  }
  return parts.join('\n\n');
}

/**
 * Narrow a `bd show <id> --long` payload (the port's `SquadIssueDetail`, or a
 * raw bd one-element array / bare object; either is accepted) into the lineage.
 * `comments` become notes (text required), `dependencies` become the lineage
 * (id required, `dependency_type` → `type`). A malformed payload ⇒ `null`
 * (truthful degrade — the dispatch proceeds without a lineage block).
 */
export function parseIssueLineage(payload: unknown): IssueLineage | null {
  const issue = Array.isArray(payload)
    ? payload[0]
    : payload !== null && typeof payload === 'object'
      ? payload
      : null;
  if (issue === null || typeof issue !== 'object') return null;
  const rec = issue as Record<string, unknown>;

  const notes: IssueNote[] = [];
  if (Array.isArray(rec.comments)) {
    for (const item of rec.comments) {
      if (item === null || typeof item !== 'object') continue;
      const c = item as Record<string, unknown>;
      const text = typeof c.text === 'string' && c.text.trim() ? c.text.trim() : undefined;
      if (!text) continue;
      const author = typeof c.author === 'string' && c.author.trim() ? c.author.trim() : undefined;
      notes.push({ text, ...(author ? { author } : {}) });
    }
  }

  const dependencies: IssueDependency[] = [];
  if (Array.isArray(rec.dependencies)) {
    for (const item of rec.dependencies) {
      if (item === null || typeof item !== 'object') continue;
      const d = item as Record<string, unknown>;
      const id = typeof d.id === 'string' && d.id.trim() ? d.id.trim() : undefined;
      if (!id) continue;
      const title = typeof d.title === 'string' && d.title.trim() ? d.title.trim() : undefined;
      const type =
        typeof d.dependency_type === 'string' && d.dependency_type.trim()
          ? d.dependency_type.trim()
          : undefined;
      const status = typeof d.status === 'string' && d.status.trim() ? d.status.trim() : undefined;
      dependencies.push({ id, ...(title ? { title } : {}), ...(type ? { type } : {}), ...(status ? { status } : {}) });
    }
  }

  return { notes, dependencies };
}
