/**
 * `agent-card.service` — serves this instance's local A2A agent-card (the
 * `/.well-known/agent.json` capability advertisement) and resolves + caches
 * remote agent-cards.
 *
 * Degrade-safe + truthful: the local card is served from the injected static
 * identity (empty capability set until bootstrap supplies the real one — never a
 * fabricated capability). `resolveRemoteCard` fetches over the injected fetcher
 * and caches by ref; a fetch failure or a malformed card yields `null` (unknown),
 * never a fabricated card. A `null` fetcher (no network dep on disk) ⇒ every
 * remote resolve is truthfully `null`.
 */
import type { AgentCard } from '../types.js';

/** Static inputs for the local agent-card (bootstrap-provided). */
export interface LocalCardInput {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly url?: string;
  readonly capabilities: readonly string[];
  readonly publicKey?: string;
  readonly version?: string;
}

/** Injected remote-card fetcher (degrade-safe seam; absent ⇒ resolves `null`). */
export interface RemoteCardFetcher {
  fetch(ref: string): Promise<unknown>;
}

/** Options controlling remote-card caching. */
export interface AgentCardServiceOptions {
  readonly fetcher?: RemoteCardFetcher | null;
  /** Cache TTL for a resolved remote card (ms); default 5 min. */
  readonly cacheTtlMs?: number;
  /** Injected clock (tests). */
  readonly now?: () => number;
}

/** Local + remote agent-card surface. */
export interface AgentCardService {
  getLocalAgentCard(): AgentCard;
  resolveRemoteCard(ref: string): Promise<AgentCard | null>;
}

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

/** Structural guard for a remote agent-card shape (no trust beyond structure). */
function coerceCard(raw: unknown): AgentCard | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.name !== 'string') return null;
  const capabilities = Array.isArray(r.capabilities)
    ? r.capabilities.filter((c): c is string => typeof c === 'string')
    : [];
  return {
    id: r.id,
    name: r.name,
    description: typeof r.description === 'string' ? r.description : undefined,
    url: typeof r.url === 'string' ? r.url : undefined,
    capabilities,
    publicKey: typeof r.publicKey === 'string' ? r.publicKey : undefined,
    version: typeof r.version === 'string' ? r.version : undefined,
  };
}

/** Build the agent-card service. Pure factory. */
export function createAgentCardService(
  local: LocalCardInput,
  options: AgentCardServiceOptions = {},
): AgentCardService {
  const localCard: AgentCard = {
    id: local.id,
    name: local.name,
    description: local.description,
    url: local.url,
    capabilities: [...local.capabilities],
    publicKey: local.publicKey,
    version: local.version,
  };
  const fetcher = options.fetcher ?? null;
  const ttl = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const now = options.now ?? (() => Date.now());
  const cache = new Map<string, { card: AgentCard; expiresAt: number }>();

  return {
    getLocalAgentCard(): AgentCard {
      return localCard;
    },

    async resolveRemoteCard(ref: string): Promise<AgentCard | null> {
      const cached = cache.get(ref);
      if (cached && cached.expiresAt > now()) return cached.card;
      if (!fetcher) return null; // No network dep on disk ⇒ truthfully unknown.
      let raw: unknown;
      try {
        raw = await fetcher.fetch(ref);
      } catch {
        return null; // Fetch fault ⇒ unknown, never a fabricated card.
      }
      const card = coerceCard(raw);
      if (card) cache.set(ref, { card, expiresAt: now() + ttl });
      return card;
    },
  };
}
