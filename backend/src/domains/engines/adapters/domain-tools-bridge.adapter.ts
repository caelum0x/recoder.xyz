/**
 * `registerDomainToolsOnHost` — the BATCH bridge between the domains' flat
 * `mcp()` surfaces (`McpToolRegistration[]`, see `shared/module-base.ts`) and the
 * interop-gated host's `serverId + toolNames` catalog model.
 *
 * Bootstrap builds each capability domain (agent-os / conductor / memory / …),
 * collects `{ serverId, tools: domain.mcp() }` pairs, and hands them here (or one
 * at a time through the engines module's `registerDomainTools`). Per source this
 * bridge delegates to the single-domain registrar (`mcp/host-registrar.ts`),
 * which (1) registers ONE `McpServerRegistration` whose `toolNames` allowlist the
 * host's `authorize` step consults, and (2) binds a delegating IN-PROCESS handler
 * per tool — the registration's own `handler` is what runs, invoked by the host
 * ONLY AFTER `authorize → risk` succeed, then audited. Registering here never
 * bypasses the gate; it is exactly the same gated route the engine tools use.
 *
 * Collision semantics (truthful, first wins):
 *  - serverId collision — the id is already in the host's gated registry (the
 *    seeded catalog, a prior bridge call, or an earlier batch entry): log + skip
 *    the WHOLE source; the existing registration is never clobbered.
 *  - tool-name collision within one source: log + skip the duplicate; the first
 *    tool with that name keeps the handler. Skipped names are reported in
 *    `collisions` so bootstrap can surface them.
 *  - an empty batch or an empty tool list is a truthful no-op (never a fake
 *    registration), as is an absent host (degrade-safe warn).
 */
import type { Logger } from '../../../shared/logger.js';
import type { McpToolRegistration } from '../../../shared/module-base.js';
import type { McpHostPort } from '../ports/mcp-host.port.js';
import {
  registerModuleToolsOnHost,
  type ModuleToolsRegistration,
} from '../mcp/host-registrar.js';

/** One domain's contribution: the server id it registers under + its flat tools. */
export interface DomainToolsSource {
  /** The catalog server id (conventionally the domain name, e.g. `'conductor'`). */
  readonly serverId: string;
  /** The domain's flat `mcp()` registrations (each carries its in-proc handler). */
  readonly tools: readonly McpToolRegistration[];
}

/** Truthful per-source outcome: the registrar record + any skipped duplicates. */
export interface DomainToolsRegistration extends ModuleToolsRegistration {
  /** Tool names skipped because an earlier tool already claimed the name (first wins). */
  readonly collisions: readonly string[];
}

/** Split one source's tools into first-wins uniques + the skipped duplicates. */
function dedupeToolNames(
  serverId: string,
  tools: readonly McpToolRegistration[],
  logger: Logger,
): { readonly unique: readonly McpToolRegistration[]; readonly collisions: readonly string[] } {
  const seen = new Set<string>();
  const unique: McpToolRegistration[] = [];
  const collisions: string[] = [];
  for (const tool of tools) {
    if (seen.has(tool.name)) {
      collisions.push(tool.name);
      logger.warn(
        { serverId, toolName: tool.name },
        'engines domain-tools bridge: duplicate tool name; skipped (first registration wins)',
      );
      continue;
    }
    seen.add(tool.name);
    unique.push(tool);
  }
  return { unique, collisions };
}

/** Bridge ONE source onto the host (collision-checked, then delegated). */
function registerSource(
  host: McpHostPort | null,
  source: DomainToolsSource,
  logger: Logger,
): DomainToolsRegistration {
  const id = source.serverId.trim();

  // serverId collision: the gated registry already has this id (seeded catalog,
  // a prior bridge call, or an earlier entry of this batch). First wins — log +
  // skip so an existing registration is never silently clobbered.
  if (id && host && host.getServer(id) !== null) {
    logger.warn(
      { serverId: id },
      'engines domain-tools bridge: serverId already registered on the host; skipped (first registration wins)',
    );
    return {
      serverId: id,
      registered: [],
      skipped: true,
      reason: `serverId collision: '${id}' already registered (first wins)`,
      collisions: [],
    };
  }

  const { unique, collisions } = dedupeToolNames(id || source.serverId, source.tools, logger);
  // The single-domain registrar owns the empty-id / absent-host / empty-tools
  // truthful skips and the actual register+bind (gated delegating handlers).
  const base = registerModuleToolsOnHost(host, source.serverId, unique, logger);
  return { ...base, collisions };
}

/**
 * Register every source's flat tools into the gated host. Returns one truthful
 * record per source, in input order. An empty batch is a no-op (`[]`).
 */
export function registerDomainToolsOnHost(
  host: McpHostPort | null,
  sources: readonly DomainToolsSource[],
  logger: Logger,
): readonly DomainToolsRegistration[] {
  if (sources.length === 0) return [];
  return sources.map((source) => registerSource(host, source, logger));
}
