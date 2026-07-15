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
import { mem0Add, mem0Health, mem0Search } from '../../../engines/mem0-client.js';
import type { Mem0Availability, Mem0Message, Mem0Port, Mem0Result, Mem0Scope } from '../ports/mem0.port.js';
import type { Mem0SidecarClient } from './mem0-sidecar.client.js';

export interface Mem0AdapterDeps {
  /** Optional self-hosted sidecar used only when the in-lib client is `none`. */
  readonly sidecar?: Mem0SidecarClient | null;
}

/** Narrow a legacy mem0 record `{ id, memory, [k]:unknown }` to `Mem0Result`. */
function toResult(row: { id: string; memory: string; [k: string]: unknown }): Mem0Result | null {
  if (!row?.id || typeof row.memory !== 'string' || !row.memory) return null;
  const score = row.score;
  return typeof score === 'number' ? { id: row.id, memory: row.memory, score } : { id: row.id, memory: row.memory };
}

function scopeArg(scope: Mem0Scope): { userId: string; agentId?: string; runId?: string; metadata?: Record<string, unknown> } {
  const out: { userId: string; agentId?: string; runId?: string; metadata?: Record<string, unknown> } = {
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

  return {
    async search(query, scope, limit = 10): Promise<readonly Mem0Result[]> {
      const res = await mem0Search(query, scopeArg(scope), limit);
      if (res.available) {
        return res.results.map(toResult).filter((r): r is Mem0Result => r !== null);
      }
      // In-lib client unconfigured → try the self-hosted sidecar if wired.
      if (sidecar) return sidecar.search(query, scope, limit);
      return [];
    },

    async add(messages, scope): Promise<{ ok: boolean; reason?: string }> {
      const res = await mem0Add(messages as Mem0Message[], scopeArg(scope));
      if (res.available) return res.reason ? { ok: false, reason: res.reason } : { ok: true };
      if (sidecar) return sidecar.add(messages, scope);
      return { ok: false, reason: res.reason ?? 'mem0 unavailable' };
    },

    async health(): Promise<Mem0Availability> {
      const h = await mem0Health();
      if (h.available) {
        const detail: Record<string, unknown> = {};
        if (h.vectorStore) detail.vectorStore = h.vectorStore;
        if (h.llmProvider) detail.llmProvider = h.llmProvider;
        if (h.embedderProvider) detail.embedderProvider = h.embedderProvider;
        return { available: true, mode: h.mode, detail };
      }
      if (sidecar) {
        const s = await sidecar.health();
        if (s.available) return { available: true, mode: 'platform', detail: { transport: 'sidecar', host: sidecar.baseUrl } };
        return { available: false, mode: h.mode, reason: s.reason ?? h.reason };
      }
      return { available: false, mode: h.mode, reason: h.reason };
    },
  };
}
