import type { MemoryPort } from "../ports/memory.port";
import type { BrainMemory } from "../domain/memory.types";
import { createInProcessMemory } from "./in-process-memory";
import { createMem0Memory, type Mem0MemoryOptions } from "./mem0-memory";

/**
 * The single memory-authority factory for `@recoder/brain`.
 *
 * ## Authority model
 *
 * DEFAULT — in-process TS memory (`InProcessMemory`):
 *   A Map-backed `MemoryPort` that lives in the running Node.js process.
 *   No external service, no config, always available.
 *
 * OPTIONAL loopback — py/mem0 REST server (`Mem0Memory`):
 *   Engaged when `MEM0_SERVICE_URL` (preferred) OR the legacy `MEM0_BASE_URL`
 *   is set. Points at the self-hosted FastAPI server in `py/mem0/server/`.
 *   When present, `remember` writes to BOTH stores (in-process first, then
 *   the service best-effort); `recall` merges results (service first, then
 *   in-process for items not already present). When absent, the in-process
 *   store is the sole authority — recall/remember work with zero config.
 *
 * Degrade-safe: if the loopback service is misconfigured or unreachable the
 * `Mem0Memory` adapter already degrades to empty/no-op without throwing. The
 * combined authority therefore degrades to pure in-process behavior without
 * any error surfacing to the caller — presence can only ADD richness.
 *
 * Seam is explicit: the env var `MEM0_SERVICE_URL` is the authoritative key.
 * `MEM0_BASE_URL` is accepted as a legacy alias so existing deployments keep
 * working. The old `Mem0Memory` adapter itself continues to read `MEM0_BASE_URL`
 * directly when invoked without an explicit `baseUrl`; `createMemoryAuthority`
 * resolves the right URL and passes it explicitly so env-var precedence is
 * unambiguous.
 */

export interface MemoryAuthorityOptions {
  /**
   * Base URL for the optional py/mem0 REST loopback service.
   * Defaults to `process.env.MEM0_SERVICE_URL ?? process.env.MEM0_BASE_URL`.
   * Pass an empty string `""` to disable the loopback even when the env var
   * is set (useful for tests that want purely in-process behavior).
   */
  serviceUrl?: string;
  /** Options forwarded verbatim to the `Mem0Memory` adapter when the loopback is active. */
  serviceOptions?: Mem0MemoryOptions;
}

/**
 * The combined memory authority: in-process default + optional REST loopback.
 *
 * `remember` writes to in-process first, then the loopback (best-effort).
 * `recall` merges: service results first, then in-process results for any id
 * not already present, up to `limit`. When the loopback is absent or fails,
 * only in-process results are returned.
 */
class CombinedMemoryAuthority implements MemoryPort {
  constructor(
    private readonly inProcess: MemoryPort,
    private readonly service: MemoryPort | null,
  ) {}

  async recall(query: string, limit: number): Promise<BrainMemory[]> {
    // Run both in parallel (service degrades to [] on any failure).
    const [serviceResults, inProcessResults] = await Promise.all([
      this.service ? this.service.recall(query, limit) : Promise.resolve([]),
      this.inProcess.recall(query, limit),
    ]);

    // Merge: service hits first (highest confidence), then in-process extras.
    const seen = new Set<string>(serviceResults.map((m) => m.id));
    const merged: BrainMemory[] = [...serviceResults];
    for (const m of inProcessResults) {
      if (!seen.has(m.id) && merged.length < limit) {
        merged.push(m);
      }
    }
    return merged.slice(0, limit);
  }

  async remember(
    text: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    // In-process write is synchronous-equivalent and cannot fail (Map.set).
    await this.inProcess.remember(text, metadata);
    // Loopback write is best-effort: failure is already swallowed by Mem0Memory.
    if (this.service) {
      await this.service.remember(text, metadata);
    }
  }
}

/**
 * Resolve the optional loopback URL. Prefers `MEM0_SERVICE_URL` (canonical
 * name for the fused seam); falls back to `MEM0_BASE_URL` (legacy) so
 * existing deployments require no changes.
 */
function resolveServiceUrl(override?: string): string {
  if (typeof override === "string") {
    return override; // explicit (including "")
  }
  return (
    process.env["MEM0_SERVICE_URL"]?.trim() ??
    process.env["MEM0_BASE_URL"]?.trim() ??
    ""
  );
}

/**
 * Create the single memory authority for `@recoder/brain`.
 *
 * - With no config: pure in-process TS memory (Map-backed, always works).
 * - With `MEM0_SERVICE_URL` (or legacy `MEM0_BASE_URL`) set: in-process +
 *   py/mem0 REST loopback combined, degrade-safe when the service is absent.
 */
export function createMemoryAuthority(
  options: MemoryAuthorityOptions = {},
): MemoryPort {
  const inProcess = createInProcessMemory();
  const serviceUrl = resolveServiceUrl(options.serviceUrl);

  if (!serviceUrl) {
    // No loopback configured — pure in-process, zero external dependencies.
    return inProcess;
  }

  const service = createMem0Memory({
    ...options.serviceOptions,
    baseUrl: serviceUrl,
  });
  return new CombinedMemoryAuthority(inProcess, service);
}
