/**
 * RecoderGit code-INTELLIGENCE MCP tools — the gated agent-facing surface for the
 * DEEP read-only queries over an already-indexed repo graph that the indexing
 * lifecycle ops (index / connect / status / reindex / domain-map) do not cover.
 * Every call passes the interop `authorize → risk → policy → audit` chain at the
 * MCP host boundary, so these handlers stay thin + truthful over the recodergit
 * adapter seam (which runs the vendored engine's in-process `LocalBackend.callTool`).
 *
 *  - `recodergit.symbol_search`  — READ: hybrid BM25 + vector symbol/flow search
 *    over the indexed graph (find symbols/execution-flows by concept or name).
 *  - `recodergit.find_references` — READ: the upstream reference set of a symbol
 *    (its callers / dependents — "what uses this?"), the blast radius.
 *  - `recodergit.call_graph`     — READ: the downstream call graph of a symbol
 *    (its callees / dependencies — "what does this reach?").
 *  - `recodergit.definition`     — READ: a symbol's 360° context (definition,
 *    location, callers, callees, and the execution flows it participates in).
 *  - `recodergit.query_context`  — READ: the COMPOSED code-aware launch context
 *    (projected DomainMap overview + per-seed-term `symbol_search` + `definition`)
 *    the conductor folds into an agent's launch prompt — reachable on demand.
 *
 * IDENTITY (SECURITY): the code graph is a shared per-repo resource, not per-user
 * tenant data, so there is no `userId` subject to rewrite. But these tools are
 * EDGE-EXPOSED, so an ANONYMOUS call is refused (`AUTH_REQUIRED`) rather than
 * served — the cross-tenant class stays CLOSED: a caller identity is BOUND from
 * the host-authorized {@link McpToolCaller} (`callerFromInput`), never inferred
 * from free-form args. `repoId` selects which indexed graph to query.
 *
 * DEGRADE-SAFE: every handler delegates to `deps.invoke`, which returns a typed
 * `{ ok:false, reason }` when the engine is disabled, or a truthful
 * `{ available:false, reason }` payload when the repo is not indexed / the
 * in-process lib is absent / the engine query errors. The tool surfaces that
 * truthfully — it NEVER throws the seam and NEVER fabricates a symbol, reference,
 * or edge.
 */
import type {
  McpToolCaller,
  McpToolRegistration,
} from '../../../shared/module-base.js';
import { createError, ErrorCode } from '../../../shared/errors.js';
import type { InvokeResult } from '../types.js';

/** The `recodergit` in-proc MCP server id (distinct from the engine descriptor). */
export const RECODERGIT_INTEL_MCP_SERVER_ID = 'recodergit';

/** The code-intel adapter ops the tools drive on the recodergit adapter seam. */
export type RecodergitIntelOp =
  | 'symbol-search'
  | 'find-references'
  | 'call-graph'
  | 'definition'
  // Composed CODE-AWARE launch context (domainMap + symbol_search + definition).
  | 'query-context';

/** The seam the tools bind to — one `invoke` over the recodergit adapter's ops. */
export interface RecodergitIntelMcpDeps {
  invoke(
    op: RecodergitIntelOp,
    input: Record<string, unknown>
  ): Promise<InvokeResult<unknown>>;
}

interface SymbolSearchInput {
  readonly repoId?: string;
  readonly query?: string;
  readonly repo?: string;
  readonly limit?: number;
  readonly maxSymbols?: number;
  readonly includeContent?: boolean;
}

interface ReferencesInput {
  readonly repoId?: string;
  readonly symbol?: string;
  readonly repo?: string;
  readonly filePath?: string;
  readonly kind?: string;
  readonly maxDepth?: number;
  readonly limit?: number;
}

interface DefinitionInput {
  readonly repoId?: string;
  readonly symbol?: string;
  readonly uid?: string;
  readonly repo?: string;
  readonly filePath?: string;
  readonly kind?: string;
  readonly includeContent?: boolean;
}

interface QueryContextInput {
  readonly repoId?: string;
  readonly seedTerms?: readonly unknown[];
  readonly maxTerms?: number;
  readonly symbolLimit?: number;
}

/** The authenticated caller's own id, or a refusal for an absent identity. */
function requireCaller(caller: McpToolCaller | undefined): string {
  const userId = caller?.userId?.trim();
  if (!caller || !userId) {
    throw createError(
      ErrorCode.AUTH_REQUIRED,
      'recodergit code-intel: no authorized caller identity'
    );
  }
  return userId;
}

/** Require a non-empty string arg, else a truthful VALIDATION_ERROR (never a guess). */
function requireArg(value: unknown, field: string): string {
  const str = typeof value === 'string' ? value.trim() : '';
  if (!str) {
    throw createError(
      ErrorCode.VALIDATION_ERROR,
      `recodergit code-intel: '${field}' is required`
    );
  }
  return str;
}

/** Copy an optional string arg when present + non-empty. */
function putStr(
  payload: Record<string, unknown>,
  key: string,
  value: unknown
): void {
  if (typeof value === 'string' && value.trim()) payload[key] = value.trim();
}

/** Copy an optional finite-number arg when present. */
function putNum(
  payload: Record<string, unknown>,
  key: string,
  value: unknown
): void {
  if (typeof value === 'number' && Number.isFinite(value)) payload[key] = value;
}

/** Copy an optional boolean arg when present. */
function putBool(
  payload: Record<string, unknown>,
  key: string,
  value: unknown
): void {
  if (typeof value === 'boolean') payload[key] = value;
}

/** Copy an optional array-of-strings arg, keeping only non-empty string entries. */
function putStrArray(
  payload: Record<string, unknown>,
  key: string,
  value: unknown
): void {
  if (!Array.isArray(value)) return;
  const terms = value.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0
  );
  if (terms.length > 0) payload[key] = terms;
}

/** Present an invoke result truthfully: the value on ok, a degrade object on fail. */
function present(result: InvokeResult<unknown>): unknown {
  if (result.ok) return result.value;
  return {
    available: false,
    reason: result.reason,
    ...(result.code ? { code: result.code } : {}),
  };
}

/** Build the recodergit code-intel MCP tool registrations over the adapter seam. */
export function buildRecodergitIntelMcpTools(
  deps: RecodergitIntelMcpDeps
): readonly McpToolRegistration[] {
  return [
    {
      name: 'recodergit.symbol_search',
      description:
        'Search an indexed repo code graph for symbols and execution flows related to a concept ' +
        '(hybrid BM25 + vector). Requires repoId (which indexed repo) + query. Read-only; returns ' +
        '{ available:false, reason } truthfully when the repo is not indexed or the engine lib is absent.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        requireCaller(caller);
        const input = (raw ?? {}) as SymbolSearchInput;
        const payload: Record<string, unknown> = {
          repoId: requireArg(input.repoId, 'repoId'),
          query: requireArg(input.query, 'query'),
        };
        putStr(payload, 'repo', input.repo);
        putNum(payload, 'limit', input.limit);
        putNum(payload, 'maxSymbols', input.maxSymbols);
        putBool(payload, 'includeContent', input.includeContent);
        return present(await deps.invoke('symbol-search', payload));
      },
    },
    {
      name: 'recodergit.find_references',
      description:
        'Find the upstream references of a symbol in an indexed repo — its callers / dependents ' +
        '("what uses this?"), the change blast radius. Requires repoId + symbol; optional filePath/kind ' +
        'disambiguate a common name. Read-only; truthful degrade when not indexed / engine lib absent.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        requireCaller(caller);
        const input = (raw ?? {}) as ReferencesInput;
        return present(
          await deps.invoke('find-references', referencesPayload(input))
        );
      },
    },
    {
      name: 'recodergit.call_graph',
      description:
        'Walk the downstream call graph of a symbol in an indexed repo — its callees / dependencies ' +
        '("what does this reach?"). Requires repoId + symbol; optional filePath/kind disambiguate and ' +
        'maxDepth bounds the walk. Read-only; truthful degrade when not indexed / engine lib absent.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        requireCaller(caller);
        const input = (raw ?? {}) as ReferencesInput;
        return present(
          await deps.invoke('call-graph', referencesPayload(input))
        );
      },
    },
    {
      name: 'recodergit.definition',
      description:
        'Resolve a symbol to its 360° context in an indexed repo: definition, location, callers, callees, ' +
        'and the execution flows it participates in. Requires repoId + (symbol or uid); optional ' +
        'filePath/kind disambiguate. Read-only; truthful degrade when not indexed / engine lib absent.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        requireCaller(caller);
        const input = (raw ?? {}) as DefinitionInput;
        const payload: Record<string, unknown> = {
          repoId: requireArg(input.repoId, 'repoId'),
        };
        const symbol =
          typeof input.symbol === 'string' ? input.symbol.trim() : '';
        const uid = typeof input.uid === 'string' ? input.uid.trim() : '';
        if (!symbol && !uid) {
          throw createError(
            ErrorCode.VALIDATION_ERROR,
            "recodergit code-intel: 'symbol' or 'uid' is required"
          );
        }
        if (symbol) payload.symbol = symbol;
        if (uid) payload.uid = uid;
        putStr(payload, 'repo', input.repo);
        putStr(payload, 'filePath', input.filePath);
        putStr(payload, 'kind', input.kind);
        putBool(payload, 'includeContent', input.includeContent);
        return present(await deps.invoke('definition', payload));
      },
    },
    {
      name: 'recodergit.query_context',
      description:
        'Compose the CODE-AWARE launch context for an indexed repo: the projected DomainMap overview plus ' +
        'a bounded per-seed-term symbol_search + definition lookup (the same block the conductor folds into ' +
        'an agent launch prompt), reachable on demand. Requires repoId; optional seedTerms (string[]) focus ' +
        'the search, maxTerms/symbolLimit bound it. Read-only; truthful { available:false, reason } when the ' +
        'repo is not indexed, the engine lib is absent, or the graph is empty for the given seeds.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        requireCaller(caller);
        const input = (raw ?? {}) as QueryContextInput;
        const payload: Record<string, unknown> = {
          repoId: requireArg(input.repoId, 'repoId'),
        };
        putStrArray(payload, 'seedTerms', input.seedTerms);
        putNum(payload, 'maxTerms', input.maxTerms);
        putNum(payload, 'symbolLimit', input.symbolLimit);
        return present(await deps.invoke('query-context', payload));
      },
    },
  ];
}

/** Shared payload builder for the two impact-backed ops (find_references / call_graph). */
function referencesPayload(input: ReferencesInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    repoId: requireArg(input.repoId, 'repoId'),
    symbol: requireArg(input.symbol, 'symbol'),
  };
  putStr(payload, 'repo', input.repo);
  putStr(payload, 'filePath', input.filePath);
  putStr(payload, 'kind', input.kind);
  putNum(payload, 'maxDepth', input.maxDepth);
  putNum(payload, 'limit', input.limit);
  return payload;
}

/**
 * The `recodergit` server descriptor for the gated registry catalog. The composer
 * adds this to the host registry + binds the handlers above (mirroring the
 * `mem0MemoryMcpServer` self-registration). Tool names MUST match
 * `buildRecodergitIntelMcpTools`.
 */
export const recodergitIntelMcpServer = {
  serverId: RECODERGIT_INTEL_MCP_SERVER_ID,
  kind: 'custom' as const,
  displayName: 'RecoderGit code intelligence',
  transport: 'custom' as const,
  enabled: true,
  toolNames: [
    'recodergit.symbol_search',
    'recodergit.find_references',
    'recodergit.call_graph',
    'recodergit.definition',
    'recodergit.query_context',
  ],
  metadata: { external: false },
};
