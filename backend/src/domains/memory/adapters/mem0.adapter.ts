/**
 * mem0.adapter — adapts the legacy fail-safe mem0 client
 * (`backend/src/engines/mem0-client.ts`, modes platform | oss | none) to the
 * domain `Mem0Port`. The legacy client already resolves its own provider from
 * the environment and degrades to `available:false`; this adapter only narrows
 * its return shapes to the port and never re-reads the environment itself.
 *
 * Optional self-hosted transport: when the in-lib client reports `none` AND a
 * mem0 sidecar URL is configured, calls fall through to a `Mem0SidecarClient`
 * (the `engines/py/mem0` FastAPI server). Either way the port stays fully
 * degrade-safe — no provider anywhere → `search → []`, `health → available:false`.
 */
import type {
  Mem0Availability,
  Mem0ConsolidateResult,
  Mem0Message,
  Mem0Port,
  Mem0Result,
  Mem0Scope,
} from '../ports/mem0.port.js';
import type { Mem0EnginePort } from '../ports/mem0-engine.port.js';
import type { Mem0SidecarClient } from './mem0-sidecar.client.js';

export interface Mem0AdapterDeps {
  /**
   * The engines mem0 client, injected at the composition root as the consumer-owned
   * {@link Mem0EnginePort} (the adapter never value-imports `engines/mem0-client`).
   * Absent ⇒ a truthful `available:false` engine (search → `[]`, health down) — the
   * degrade-safe contract is unchanged whether the engine is unwired or unconfigured.
   */
  readonly mem0Engine?: Mem0EnginePort;
  /** Optional self-hosted sidecar used only when the in-lib client is `none`. */
  readonly sidecar?: Mem0SidecarClient | null;
}

/**
 * The truthful-unavailable engine used when no `mem0Engine` is injected. Keeps the
 * adapter's degrade contract identical to an unconfigured in-lib client: nothing
 * is fabricated, the sidecar (when wired) still handles the fallthrough.
 */
const UNAVAILABLE_ENGINE: Mem0EnginePort = {
  async add() {
    return { available: false, reason: 'mem0 engine not wired' };
  },
  async search() {
    return { available: false, reason: 'mem0 engine not wired', results: [] };
  },
  async health() {
    return { available: false, mode: 'none', reason: 'mem0 engine not wired' };
  },
};

/** Narrow a legacy mem0 record `{ id, memory, [k]:unknown }` to `Mem0Result`. */
function toResult(row: {
  id: string;
  memory: string;
  [k: string]: unknown;
}): Mem0Result | null {
  if (!row?.id || typeof row.memory !== 'string' || !row.memory) return null;
  const score = row.score;
  return typeof score === 'number'
    ? { id: row.id, memory: row.memory, score }
    : { id: row.id, memory: row.memory };
}

function scopeArg(scope: Mem0Scope): {
  userId: string;
  agentId?: string;
  runId?: string;
  metadata?: Record<string, unknown>;
} {
  const out: {
    userId: string;
    agentId?: string;
    runId?: string;
    metadata?: Record<string, unknown>;
  } = {
    userId: scope.userId,
  };
  if (scope.agentId) out.agentId = scope.agentId;
  if (scope.runId) out.runId = scope.runId;
  if (scope.metadata) out.metadata = { ...scope.metadata };
  return out;
}

/**
 * Build the mem0 adapter. Delegates to the in-lib client first; falls through to
 * the injected sidecar (when present) only if the in-lib client is unconfigured.
 */
export function createMem0Adapter(deps: Mem0AdapterDeps = {}): Mem0Port {
  const sidecar = deps.sidecar ?? null;
  const engine = deps.mem0Engine ?? UNAVAILABLE_ENGINE;

  return {
    async search(query, scope, limit = 10): Promise<readonly Mem0Result[]> {
      const res = await engine.search(query, scopeArg(scope), limit);
      if (res.available) {
        return res.results
          .map(toResult)
          .filter((r): r is Mem0Result => r !== null);
      }
      // In-lib client unconfigured → try the self-hosted sidecar if wired.
      if (sidecar) return sidecar.search(query, scope, limit);
      return [];
    },

    async add(messages, scope): Promise<{ ok: boolean; reason?: string }> {
      const res = await engine.add(messages as Mem0Message[], scopeArg(scope));
      if (res.available)
        return res.reason ? { ok: false, reason: res.reason } : { ok: true };
      if (sidecar) return sidecar.add(messages, scope);
      return { ok: false, reason: res.reason ?? 'mem0 unavailable' };
    },

    async consolidate(scope?: Mem0Scope): Promise<Mem0ConsolidateResult> {
      // The in-lib `@recoder/mem0` client has NO batch consolidate: mem0's
      // fact-merge / dedup / decay runs INLINE on every `add` (closed by the
      // lifecycle write-half). Only a self-hosted sidecar exposes a batch pass,
      // so a driver-triggered sweep is a truthful no-op unless one is wired.
      const h = await engine.health();
      if (h.available) {
        return {
          ok: false,
          reason:
            'mem0 consolidation runs inline on add (no batch trigger in-lib)',
        };
      }
      if (sidecar) return sidecar.consolidate(scope);
      return { ok: false, reason: h.reason ?? 'mem0 unavailable' };
    },

    async health(): Promise<Mem0Availability> {
      const h = await engine.health();
      if (h.available) {
        const detail: Record<string, unknown> = {};
        if (h.vectorStore) detail.vectorStore = h.vectorStore;
        if (h.llmProvider) detail.llmProvider = h.llmProvider;
        if (h.embedderProvider) detail.embedderProvider = h.embedderProvider;
        return { available: true, mode: h.mode, detail };
      }
      if (sidecar) {
        const s = await sidecar.health();
        if (s.available)
          return {
            available: true,
            mode: 'platform',
            detail: { transport: 'sidecar', host: sidecar.baseUrl },
          };
        return { available: false, mode: h.mode, reason: s.reason ?? h.reason };
      }
      return { available: false, mode: h.mode, reason: h.reason };
    },
  };
}
