/**
 * `SquadService` — leader-routing cohorts ported from multica (domain doc §5a
 * NEW; schema in `migrations/0003-squads.sql`). A squad is a named cohort of
 * agents with one leader; routing a task picks the leader when it is an eligible
 * member, else a weighted-highest eligible member, else fails closed with a
 * truthful reason. Every routing decision is recorded as squad activity.
 *
 * Phase 5a ships the pure routing logic over an in-memory {@link SquadStore}
 * (degrade-safe, test-friendly). A postgres store over the persistence executor
 * (tables in 0003) is the integration follow-up — the routing logic is unchanged
 * behind the store seam.
 */
import type { AgentProfile } from '@recoder/agent-os';

export type SquadRoutingStrategy = 'leader' | 'weighted' | 'round_robin';

export interface Squad {
  readonly squadId: string;
  readonly spaceId: string;
  readonly displayName: string;
  readonly leaderAgentId?: string;
  readonly routingStrategy: SquadRoutingStrategy;
  readonly status: 'active' | 'archived';
}

export interface SquadMember {
  readonly squadId: string;
  readonly agentId: string;
  readonly role: 'leader' | 'member';
  readonly weight: number;
}

export interface SquadActivity {
  readonly activityId: string;
  readonly squadId: string;
  readonly taskId?: string;
  readonly runId?: string;
  readonly routedAgentId?: string;
  readonly strategy: SquadRoutingStrategy;
  readonly reason: string;
  readonly createdAt: string;
}

export interface SquadRouteResult {
  readonly squadId: string;
  readonly routedAgentId?: string;
  readonly strategy: SquadRoutingStrategy;
  readonly reason: string;
  readonly routed: boolean;
}

/** Storage seam for squads. In-memory now; postgres (0003 tables) at integration. */
export interface SquadStore {
  upsertSquad(squad: Squad): Squad | Promise<Squad>;
  getSquad(squadId: string): (Squad | null) | Promise<Squad | null>;
  listSquads(spaceId?: string): Squad[] | Promise<Squad[]>;
  upsertMember(member: SquadMember): SquadMember | Promise<SquadMember>;
  listMembers(squadId: string): SquadMember[] | Promise<SquadMember[]>;
  appendActivity(activity: SquadActivity): SquadActivity | Promise<SquadActivity>;
  listActivity(squadId: string): SquadActivity[] | Promise<SquadActivity[]>;
}

/** The zero-dependency store (tests + no-DB degrade). */
export class InMemorySquadStore implements SquadStore {
  private readonly squads = new Map<string, Squad>();
  private readonly members = new Map<string, SquadMember[]>();
  private readonly activity = new Map<string, SquadActivity[]>();

  upsertSquad(squad: Squad): Squad {
    this.squads.set(squad.squadId, squad);
    return squad;
  }
  getSquad(squadId: string): Squad | null {
    return this.squads.get(squadId) ?? null;
  }
  listSquads(spaceId?: string): Squad[] {
    const all = [...this.squads.values()];
    return spaceId ? all.filter((s) => s.spaceId === spaceId) : all;
  }
  upsertMember(member: SquadMember): SquadMember {
    const list = this.members.get(member.squadId) ?? [];
    const next = list.filter((m) => m.agentId !== member.agentId);
    next.push(member);
    this.members.set(member.squadId, next);
    return member;
  }
  listMembers(squadId: string): SquadMember[] {
    return [...(this.members.get(squadId) ?? [])];
  }
  appendActivity(activity: SquadActivity): SquadActivity {
    const list = this.activity.get(activity.squadId) ?? [];
    list.push(activity);
    this.activity.set(activity.squadId, list);
    return activity;
  }
  listActivity(squadId: string): SquadActivity[] {
    return [...(this.activity.get(squadId) ?? [])];
  }
}

/** Predicate: is an agent eligible to receive routed work right now? */
export type AgentEligibility = (agentId: string) => boolean | Promise<boolean>;

export interface SquadServiceDeps {
  readonly store: SquadStore;
  /** Eligibility gate (e.g. agent online + healthy). Defaults to always-eligible. */
  readonly isEligible?: AgentEligibility;
  readonly now?: () => string;
  readonly newId?: () => string;
}

export class SquadService {
  private readonly store: SquadStore;
  private readonly isEligible: AgentEligibility;
  private readonly now: () => string;
  private readonly newId: () => string;

  constructor(deps: SquadServiceDeps) {
    this.store = deps.store;
    this.isEligible = deps.isEligible ?? (() => true);
    this.now = deps.now ?? (() => new Date().toISOString());
    this.newId = deps.newId ?? (() => `sq-${Math.random().toString(36).slice(2, 12)}`);
  }

  async createSquad(input: Omit<Squad, 'status'> & { status?: Squad['status'] }): Promise<Squad> {
    const squad: Squad = { ...input, status: input.status ?? 'active' };
    return this.store.upsertSquad(squad);
  }

  async addMember(member: Omit<SquadMember, 'weight' | 'role'> & Partial<Pick<SquadMember, 'weight' | 'role'>>): Promise<SquadMember> {
    return this.store.upsertMember({
      squadId: member.squadId,
      agentId: member.agentId,
      role: member.role ?? 'member',
      weight: member.weight ?? 1,
    });
  }

  async listSquads(spaceId?: string): Promise<Squad[]> {
    return this.store.listSquads(spaceId);
  }

  /**
   * Route a task to a squad member. Leader-first (when eligible), else the
   * highest-weight eligible member (deterministic tie-break by agentId). Records
   * the decision as squad activity. Fails closed (`routed: false`) when no
   * eligible member exists — never invents an assignee.
   */
  async route(squadId: string, taskId?: string, runId?: string): Promise<SquadRouteResult> {
    const squad = await this.store.getSquad(squadId);
    if (!squad) {
      return this.record(squadId, 'leader', undefined, taskId, runId, `squad not found: ${squadId}`);
    }
    if (squad.status !== 'active') {
      return this.record(squadId, squad.routingStrategy, undefined, taskId, runId, 'squad archived');
    }

    const members = await this.store.listMembers(squadId);
    const eligible: SquadMember[] = [];
    for (const m of members) {
      if (await this.isEligible(m.agentId)) eligible.push(m);
    }
    if (eligible.length === 0) {
      return this.record(squadId, squad.routingStrategy, undefined, taskId, runId, 'no eligible members');
    }

    if (squad.routingStrategy === 'leader' && squad.leaderAgentId) {
      const leader = eligible.find((m) => m.agentId === squad.leaderAgentId);
      if (leader) {
        return this.record(squadId, 'leader', leader.agentId, taskId, runId, 'routed to leader');
      }
    }

    // Weighted fallback: highest weight wins, ties broken by agentId for determinism.
    const best = [...eligible].sort((a, b) => b.weight - a.weight || a.agentId.localeCompare(b.agentId))[0];
    return this.record(squadId, 'weighted', best.agentId, taskId, runId, 'routed to highest-weight eligible member');
  }

  private async record(
    squadId: string,
    strategy: SquadRoutingStrategy,
    routedAgentId: string | undefined,
    taskId: string | undefined,
    runId: string | undefined,
    reason: string,
  ): Promise<SquadRouteResult> {
    await this.store.appendActivity({
      activityId: this.newId(),
      squadId,
      ...(taskId ? { taskId } : {}),
      ...(runId ? { runId } : {}),
      ...(routedAgentId ? { routedAgentId } : {}),
      strategy,
      reason,
      createdAt: this.now(),
    });
    return { squadId, ...(routedAgentId ? { routedAgentId } : {}), strategy, reason, routed: routedAgentId !== undefined };
  }
}

/** Convenience: an agent's id (kept for callers that pass full profiles). */
export function agentId(agent: AgentProfile): string {
  return agent.agentId;
}
