/**
 * `agent-registry` — the domain service over the frozen {@link AgentRegistryRepo}.
 * It adds card-normalization + validation on top of the raw persistence seam so
 * routes / runtime connectors register through ONE guarded surface rather than
 * touching the repo directly.
 *
 * Truthful by construction: a registration never fabricates capabilities the
 * caller did not advertise, and a newly-registered agent starts `unknown` (its
 * real liveness is proven only by a heartbeat, see `heartbeat-slo`).
 */
import type { AgentRegistryRepo } from '../ports/agent-registry.repo.js';
import type { AgentCard, AgentKind, AgentRow, AgentStatus, UpsertAgentInput } from '../types.js';

/** Input to register an agent (card defaulted from id/name when partial). */
export interface RegisterAgentInput {
  readonly id: string;
  readonly userId: string;
  readonly kind: AgentKind;
  readonly runtimeId?: string;
  readonly card: Partial<AgentCard> & { readonly name: string };
  readonly publicKey?: string;
  readonly status?: AgentStatus;
}

export interface AgentRegistryService {
  register(input: RegisterAgentInput): Promise<AgentRow>;
  get(id: string, userId: string): Promise<AgentRow | null>;
  list(userId: string, kind?: AgentKind): Promise<readonly AgentRow[]>;
  setStatus(id: string, userId: string, status: AgentStatus): Promise<boolean>;
  deregister(id: string, userId: string): Promise<boolean>;
}

/** Normalize a partial card into a complete `AgentCard` (never invents caps). */
function normalizeCard(id: string, card: RegisterAgentInput['card']): AgentCard {
  return {
    id: card.id ?? id,
    name: card.name,
    description: card.description,
    url: card.url,
    capabilities: [...(card.capabilities ?? [])],
    publicKey: card.publicKey,
    version: card.version,
  };
}

/** Build the agent-registry service over the frozen repo. */
export function createAgentRegistryService(repo: AgentRegistryRepo): AgentRegistryService {
  return {
    async register(input: RegisterAgentInput): Promise<AgentRow> {
      const card = normalizeCard(input.id, input.card);
      const upsert: UpsertAgentInput = {
        id: input.id,
        userId: input.userId,
        kind: input.kind,
        runtimeId: input.runtimeId,
        card,
        publicKey: input.publicKey ?? card.publicKey,
        // A fresh registration is `unknown` until a heartbeat proves liveness.
        status: input.status ?? 'unknown',
      };
      return repo.upsert(upsert);
    },

    async get(id: string, userId: string): Promise<AgentRow | null> {
      return repo.get(id, userId);
    },

    async list(userId: string, kind?: AgentKind): Promise<readonly AgentRow[]> {
      return repo.list(userId, kind);
    },

    async setStatus(id: string, userId: string, status: AgentStatus): Promise<boolean> {
      return repo.setStatus(id, userId, status);
    },

    async deregister(id: string, userId: string): Promise<boolean> {
      return repo.remove(id, userId);
    },
  };
}
