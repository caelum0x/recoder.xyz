/**
 * `MulticaCoordinationAdapter` — the DEFAULT {@link CoordinationEnginePort} over
 * the Multica engine's REAL squad/coordination HTTP surface. It DEEPENS (does not
 * shallow-stub) the vendored Go server by exercising the endpoints that actually
 * carry coordination state:
 *
 *   - `GET  /api/squads`                      → routing introspection (leader + members)
 *   - `GET  /api/squads/{id}/members/status`  → per-member work-lock status
 *                                               (`working` ⇒ active-task lock held)
 *   - `POST /api/issues/{id}/squad-evaluated` → the governed reroute write (leader
 *                                               re-evaluation of a contended issue)
 *
 * Conflict detection is DERIVED, not a separate endpoint: the same issue id
 * appearing under two or more `working` members is a contended assignment.
 *
 * DEGRADE-SAFE (truthful, never faked): the base URL is resolved lazily; when no
 * `MULTICA_URL` is configured (the engine — which needs PG15 — is absent) every
 * read returns `{ available: false, reason }` and the write `{ routed: false }`.
 * A failed/timed-out/non-2xx call degrades the SAME way — we never invent squads,
 * locks, or a routed result. Auth (`Authorization` bearer + `X-Workspace-ID`) is
 * taken ONLY from the injected config, never spread from `process.env`.
 *
 * LIVE PATH: set `MULTICA_URL` (external mode) + `MULTICA_API_KEY` +
 * `MULTICA_WORKSPACE_ID`; the composer's default resolver reads `MULTICA_URL`.
 * Tests inject `fetchImpl` + `baseUrlResolver` to exercise every branch offline.
 */
import type { Logger } from '../../../shared/logger.js';
import type {
  CoordinationConflict,
  CoordinationConflictResult,
  CoordinationEngineMode,
  CoordinationEnginePort,
  CoordinationRoutingResult,
  CoordinationStatusResult,
  MemberLockStatus,
  RerouteRequest,
  RerouteResult,
  SquadMemberLock,
  SquadRoutingEntry,
} from '../ports/coordination-engine.port.js';

/** Minimal `fetch` surface — injectable so tests never touch the network. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface MulticaCoordinationConfig {
  /**
   * Resolves the Multica base URL (e.g. `http://127.0.0.1:38080`) or `null` when
   * unconfigured. Async so the composer may consult a live handle. NEVER throws.
   */
  readonly baseUrlResolver: () => string | null | Promise<string | null>;
  /** Bearer token for Multica's auth layer (from config, never process.env spread). */
  readonly apiKey?: string;
  /** Workspace id routed via `X-Workspace-ID` (Multica is multi-tenant). */
  readonly workspaceId?: string;
  /** Per-call timeout (ms). */
  readonly timeoutMs?: number;
  /** Injectable fetch (default `globalThis.fetch`). */
  readonly fetchImpl?: FetchLike;
  readonly logger: Logger;
}

const DEFAULT_TIMEOUT_MS = 5_000;

/** Wire shape of a Multica squad (subset we consume). */
interface WireSquad {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly leader_id?: unknown;
  readonly member_count?: unknown;
}

/** Wire shape of `GET /api/squads/{id}/members/status`. */
interface WireMemberStatusList {
  readonly members?: readonly WireMember[];
}
interface WireMember {
  readonly member_type?: unknown;
  readonly member_id?: unknown;
  readonly status?: unknown;
  readonly active_issues?: readonly WireActiveIssue[];
  readonly last_active_at?: unknown;
}
interface WireActiveIssue {
  readonly issue_id?: unknown;
  readonly identifier?: unknown;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Narrow an untrusted status string to the derived lock status (drift ⇒ 'unknown'). */
function toLockStatus(v: unknown): MemberLockStatus {
  switch (str(v)) {
    case 'working':
      return 'working';
    case 'idle':
      return 'idle';
    case 'unstable':
      return 'unstable';
    case 'offline':
      return 'offline';
    default:
      return 'unknown';
  }
}

export class MulticaCoordinationAdapter implements CoordinationEnginePort {
  private readonly cfg: MulticaCoordinationConfig;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(cfg: MulticaCoordinationConfig) {
    this.cfg = cfg;
    this.fetchImpl = cfg.fetchImpl ?? ((input, init) => (globalThis.fetch as FetchLike)(input, init));
    this.timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const apiKey = str(this.cfg.apiKey);
    const workspaceId = str(this.cfg.workspaceId);
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    if (workspaceId) headers['X-Workspace-ID'] = workspaceId;
    return headers;
  }

  /** Resolve the base URL, swallowing resolver faults into a truthful `null`. */
  private async resolveBase(): Promise<string | null> {
    try {
      const base = await this.cfg.baseUrlResolver();
      return str(base) ?? null;
    } catch (err) {
      this.cfg.logger.warn({ err }, 'multica-coordination: base URL resolver failed — degrading');
      return null;
    }
  }

  /** GET+parse JSON, or `undefined` on any fault (never throws). */
  private async getJson<T>(base: string, pathAndQuery: string): Promise<T | undefined> {
    try {
      const resp = await this.fetchImpl(`${base}${pathAndQuery}`, {
        method: 'GET',
        headers: this.headers(),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!resp.ok) {
        this.cfg.logger.warn({ status: resp.status, pathAndQuery }, 'multica-coordination: non-2xx read');
        return undefined;
      }
      return (await resp.json()) as T;
    } catch (err) {
      this.cfg.logger.warn({ err, pathAndQuery }, 'multica-coordination: read failed — degrading');
      return undefined;
    }
  }

  async routingStatus(): Promise<CoordinationRoutingResult> {
    const base = await this.resolveBase();
    if (!base) return unavailableRouting();
    const squads = await this.fetchSquads(base);
    if (!squads) {
      return {
        available: false,
        mode: 'external',
        reason: 'Multica /api/squads unreachable — local squad.service.ts is authoritative',
        squads: [],
      };
    }
    return {
      available: true,
      mode: 'external',
      squads: squads.map(toRoutingEntry),
    };
  }

  async coordinationStatus(): Promise<CoordinationStatusResult> {
    const base = await this.resolveBase();
    if (!base) {
      const down = unavailableRouting();
      return { available: false, mode: down.mode, reason: down.reason, locks: [], workingCount: 0, idleCount: 0 };
    }
    const collected = await this.collectLocks(base);
    if (!collected) {
      return {
        available: false,
        mode: 'external',
        reason: 'Multica squad member-status unreachable',
        locks: [],
        workingCount: 0,
        idleCount: 0,
      };
    }
    const workingCount = collected.filter((l) => l.status === 'working').length;
    const idleCount = collected.filter((l) => l.status === 'idle').length;
    return { available: true, mode: 'external', locks: collected, workingCount, idleCount };
  }

  async conflictStatus(): Promise<CoordinationConflictResult> {
    const base = await this.resolveBase();
    if (!base) {
      const down = unavailableRouting();
      return { available: false, mode: down.mode, reason: down.reason, conflicts: [] };
    }
    const collected = await this.collectLocks(base);
    if (!collected) {
      return { available: false, mode: 'external', reason: 'Multica squad member-status unreachable', conflicts: [] };
    }
    return { available: true, mode: 'external', conflicts: deriveConflicts(collected) };
  }

  async requestReroute(req: RerouteRequest): Promise<RerouteResult> {
    const issueId = str(req.issueId);
    if (!issueId) return { routed: false, reason: 'issueId is required' };
    const base = await this.resolveBase();
    if (!base) {
      return { routed: false, reason: 'Multica engine unavailable — reroute not routed (degrade-safe)' };
    }
    try {
      const resp = await this.fetchImpl(`${base}/api/issues/${encodeURIComponent(issueId)}/squad-evaluated`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ reason: str(req.reason) ?? 'coordination reroute requested' }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!resp.ok) {
        return { routed: false, reason: `Multica reroute returned ${resp.status}`, issueId };
      }
      return { routed: true, issueId };
    } catch (err) {
      this.cfg.logger.warn({ err, issueId }, 'multica-coordination: reroute failed — degrading');
      return { routed: false, reason: `reroute failed: ${err instanceof Error ? err.message : String(err)}`, issueId };
    }
  }

  private async fetchSquads(base: string): Promise<WireSquad[] | undefined> {
    const data = await this.getJson<unknown>(base, '/api/squads');
    if (data === undefined) return undefined;
    return Array.isArray(data) ? (data as WireSquad[]) : [];
  }

  /**
   * Collect the per-member work-lock view across every squad. Returns `undefined`
   * only when the squad LIST itself is unreachable; a failed per-squad status
   * probe is skipped (best-effort) so one bad squad never blanks the whole view.
   */
  private async collectLocks(base: string): Promise<SquadMemberLock[] | undefined> {
    const squads = await this.fetchSquads(base);
    if (!squads) return undefined;
    const perSquad = await Promise.all(
      squads.map(async (squad) => {
        const squadId = str(squad.id);
        if (!squadId) return [] as SquadMemberLock[];
        const status = await this.getJson<WireMemberStatusList>(
          base,
          `/api/squads/${encodeURIComponent(squadId)}/members/status`,
        );
        const members = status?.members ?? [];
        return members.flatMap((m) => toMemberLock(squadId, m));
      }),
    );
    return perSquad.flat();
  }
}

function unavailableRouting(): CoordinationRoutingResult {
  return {
    available: false,
    mode: 'unconfigured' satisfies CoordinationEngineMode,
    reason:
      'Multica engine not configured (set MULTICA_URL; the Go squads server needs PG15) — ' +
      'local squad.service.ts is authoritative',
    squads: [],
  };
}

function toRoutingEntry(s: WireSquad): SquadRoutingEntry {
  return {
    squadId: str(s.id) ?? '',
    name: str(s.name) ?? '',
    leaderId: str(s.leader_id) ?? '',
    memberCount: num(s.member_count),
  };
}

function toMemberLock(squadId: string, m: WireMember): SquadMemberLock[] {
  const memberId = str(m.member_id);
  if (!memberId) return [];
  const activeIssueIds = (m.active_issues ?? [])
    .map((issue) => str(issue.issue_id))
    .filter((id): id is string => Boolean(id));
  const lastActiveAt = str(m.last_active_at);
  return [
    {
      squadId,
      memberId,
      memberType: str(m.member_type) ?? 'unknown',
      status: toLockStatus(m.status),
      activeIssueIds,
      ...(lastActiveAt ? { lastActiveAt } : {}),
    },
  ];
}

/** Derive contended assignments: one issue actively held by 2+ members. */
function deriveConflicts(locks: readonly SquadMemberLock[]): CoordinationConflict[] {
  const byIssue = new Map<string, { squadId: string; memberId: string }[]>();
  for (const lock of locks) {
    if (lock.status !== 'working') continue;
    for (const issueId of lock.activeIssueIds) {
      const contenders = byIssue.get(issueId) ?? [];
      contenders.push({ squadId: lock.squadId, memberId: lock.memberId });
      byIssue.set(issueId, contenders);
    }
  }
  const conflicts: CoordinationConflict[] = [];
  for (const [issueId, contenders] of byIssue) {
    if (contenders.length >= 2) conflicts.push({ issueId, contenders });
  }
  return conflicts;
}
