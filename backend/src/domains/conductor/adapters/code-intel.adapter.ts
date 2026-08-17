/**
 * `createConductorCodeIntel` — the conductor adapter that gives a freshly created
 * workspace CODE INTELLIGENCE: on launch it indexes the repo through the LIVE
 * recodergit code-knowledge-graph engine, so the coding agent (external CLI in the
 * tmux worktree, or the native openfang runtime) queries a real graph instead of
 * grepping blind. It composes the beads issue-graph tracker
 * (`adapters/issue-graph.adapter.ts`) so the ONE `CodeIntelPort` the composer
 * consumes covers both index (recodergit) and track/complete (beads).
 *
 * It depends ONLY on the engines domain's FROZEN `EngineClientPort` for the
 * `recodergit` engine (`engines.client('recodergit')`) — never on the engines
 * module, never on `recodergit-service` internals (mirrors the inference domain
 * consuming `engines.tensorzero()`). The recodergit adapter maps `op:'index'`
 * onto the flag-gated, fail-safe `RecoderGitService.indexRepo` (launch-time build)
 * and `op:'reindex'` onto `RecoderGitService.reindexOnPush` (completion-time
 * refresh, so the graph does not go stale as the agent commits).
 *
 * SEAM LAW (degrade-safe, truthful): `RECODER_CODE_GRAPH_ENABLED` off, an unbuilt
 * engine, empty inputs, or an `{ ok:false }` invoke all fold into a LOGGED SKIP —
 * the run proceeds with the capability simply absent. It never throws across the
 * boundary and never fabricates an index.
 */
import type { Logger } from '../../../shared/logger.js';
import type { EngineClientPort } from '../../engines/ports/engine-client.port.js';
import type {
  CodeIntelPort,
  IssueGraphPort,
} from '../ports/code-intel.port.js';
import {
  createIssueGraphTracker,
  type IssueGraphWriter,
} from './issue-graph.adapter.js';

export interface ConductorCodeIntelDeps {
  /**
   * The recodergit `EngineClientPort` (`engines.client('recodergit')`).
   * `null`/`undefined` when the code-graph engine is not declared/wired ⇒ every
   * `indexRepo` is a truthful logged skip.
   */
  readonly recodergit: EngineClientPort | null | undefined;
  /**
   * The issue-graph write slice of the memory module facet
   * (`memory.issueGraph()`) — NOT the raw engine seam. Bootstrap injects it at
   * the composition root; `null` ⇒ track/complete are truthful logged skips.
   */
  readonly beads: IssueGraphWriter | null | undefined;
  readonly logger: Logger;
  /**
   * Inject a pre-built issue-graph tracker (tests / custom composition). Defaults
   * to `createIssueGraphTracker` over the injected `beads` client.
   */
  readonly issueGraph?: IssueGraphPort;
}

/** Bounded deadline for a repo index (never let a slow index stall a launch). */
const INDEX_TIMEOUT_MS = 120_000;
/** Bounded deadline for an incremental reindex on completion. */
const REINDEX_TIMEOUT_MS = 120_000;
/** Bounded deadline for the launch-time code-context query (never stall launch). */
const QUERY_CONTEXT_TIMEOUT_MS = 20_000;
/** Per-payload char cap when rendering opaque engine results into the prompt. */
const RENDER_PAYLOAD_CAP = 800;

/** The composed code-context shape the recodergit `query-context` op returns. */
interface CodeContextPayload {
  readonly repoId: string;
  readonly available: boolean;
  readonly reason?: string;
  readonly domainMap?: {
    readonly domains?: ReadonlyArray<{
      readonly name?: string;
      readonly files?: readonly string[];
    }>;
  };
  readonly symbols?: ReadonlyArray<{
    readonly term: string;
    readonly result: unknown;
  }>;
  readonly definitions?: ReadonlyArray<{
    readonly symbol: string;
    readonly result: unknown;
  }>;
}

const SEED_STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'into',
  'your',
  'you',
  'add',
  'fix',
  'use',
  'make',
  'run',
  'code',
  'file',
  'files',
  'please',
  'need',
  'want',
  'should',
  'when',
  'then',
  'have',
  'been',
  'will',
  'can',
  'all',
  'any',
  'new',
  'get',
  'set',
  'via',
  'not',
  'but',
  'are',
  'was',
  'its',
  'our',
]);

/**
 * Derive code-graph SEED TERMS from a natural-language launch prompt: keep
 * identifier-ish tokens (camelCase / snake_case / dotted / PascalCase / long
 * words), drop stopwords + short noise, dedupe (first spelling wins), bound to
 * `max`. Pure + exported so the conductor wiring stays a one-liner and the
 * extraction is directly testable. Empty prompt ⇒ `[]`.
 */
export function deriveSeedTerms(prompt: string, max = 8): string[] {
  if (typeof prompt !== 'string') return [];
  const tokens = prompt.match(/[A-Za-z_][A-Za-z0-9_.]{2,}/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokens) {
    const codey =
      /[A-Z]/.test(token.slice(1)) || // camelCase / PascalCase inner cap
      token.includes('_') ||
      token.includes('.') ||
      token.length >= 6;
    if (!codey) continue;
    const key = token.toLowerCase();
    if (SEED_STOPWORDS.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(token);
    if (out.length >= max) break;
  }
  return out;
}

/** Compact one opaque engine payload to a bounded single-line JSON string. */
function renderPayload(value: unknown): string {
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    text = String(value);
  }
  text = (text ?? '').replace(/\s+/g, ' ').trim();
  return text.length > RENDER_PAYLOAD_CAP
    ? `${text.slice(0, RENDER_PAYLOAD_CAP)}…`
    : text;
}

/**
 * Render a {@link CodeContextPayload} into a compact prompt block, or `null`
 * when there is nothing truthful to inject (`available:false` or empty). The
 * block is deterministic and bounded so it never blows the launch prompt.
 */
export function renderCodeContext(ctx: CodeContextPayload): string | null {
  if (!ctx || ctx.available !== true) return null;
  const lines: string[] = [];

  const domains = ctx.domainMap?.domains ?? [];
  if (domains.length > 0) {
    const named = domains
      .filter(
        (d): d is { name: string; files?: readonly string[] } =>
          typeof d?.name === 'string'
      )
      .slice(0, 12)
      .map(d => {
        const count = Array.isArray(d.files) ? d.files.length : 0;
        return count > 0 ? `${d.name} (${count} files)` : d.name;
      });
    if (named.length > 0) {
      lines.push(`Domains: ${named.join(', ')}`);
    }
  }

  for (const s of ctx.symbols ?? []) {
    if (s?.result === undefined) continue;
    lines.push(`Symbols for "${s.term}": ${renderPayload(s.result)}`);
  }
  for (const d of ctx.definitions ?? []) {
    if (d?.result === undefined) continue;
    lines.push(`Definition of "${d.symbol}": ${renderPayload(d.result)}`);
  }

  if (lines.length === 0) return null;
  return [
    `## Code context (recodergit code-graph, repo ${ctx.repoId})`,
    ...lines,
  ].join('\n');
}

export function createConductorCodeIntel(
  deps: ConductorCodeIntelDeps
): CodeIntelPort {
  const { recodergit, beads, logger } = deps;
  const issueGraph =
    deps.issueGraph ?? createIssueGraphTracker({ beads, logger });

  return {
    async indexRepo(repoPath: string, repoId: string): Promise<void> {
      const root = repoPath?.trim();
      const id = repoId?.trim();
      if (!root || !id) {
        logger.debug(
          { repoPath, repoId },
          'code-intel: missing repoPath/repoId — index skipped'
        );
        return;
      }
      if (!recodergit) {
        logger.debug(
          { repoId: id },
          'code-intel: recodergit engine not wired — index skipped'
        );
        return;
      }
      try {
        const result = await recodergit.invoke({
          op: 'index',
          input: { repoRoot: root, repoId: id },
          timeoutMs: INDEX_TIMEOUT_MS,
        });
        if (!result.ok) {
          // Disabled / unbuilt / bad input — truthful skip, run proceeds.
          logger.info(
            { repoId: id, reason: result.reason, code: result.code },
            'code-intel: repo index skipped (recodergit unavailable)'
          );
          return;
        }
        logger.info({ repoId: id }, 'code-intel: repo indexed via recodergit');
      } catch (err) {
        // Defensive: the seam should not throw, but an index must never crash launch.
        logger.warn(
          { repoId: id, err },
          'code-intel: repo index errored — skipped'
        );
      }
    },

    async reindexRepo(repoId: string): Promise<void> {
      const id = repoId?.trim();
      if (!id) {
        logger.debug(
          { repoId },
          'code-intel: missing repoId — reindex skipped'
        );
        return;
      }
      if (!recodergit) {
        logger.debug(
          { repoId: id },
          'code-intel: recodergit engine not wired — reindex skipped'
        );
        return;
      }
      try {
        const result = await recodergit.invoke({
          op: 'reindex',
          input: { repoId: id },
          timeoutMs: REINDEX_TIMEOUT_MS,
        });
        if (!result.ok) {
          // Disabled / unbuilt / bad input — truthful skip, run proceeds.
          logger.info(
            { repoId: id, reason: result.reason, code: result.code },
            'code-intel: repo reindex skipped (recodergit unavailable)'
          );
          return;
        }
        // The engine returns `not_indexed` when there is no prior index to
        // refresh — a truthful skip, not a fabricated success.
        const status =
          result.value && typeof result.value === 'object'
            ? (result.value as { status?: string }).status
            : undefined;
        if (status === 'not_indexed') {
          logger.info(
            { repoId: id },
            'code-intel: repo reindex skipped (no prior index for this repoId)'
          );
          return;
        }
        logger.info(
          { repoId: id, status },
          'code-intel: repo reindexed via recodergit'
        );
      } catch (err) {
        // Defensive: the seam should not throw, but a reindex must never crash
        // the terminal-event path.
        logger.warn(
          { repoId: id, err },
          'code-intel: repo reindex errored — skipped'
        );
      }
    },

    async queryContext(
      repoId: string,
      seedTerms: string[]
    ): Promise<string | null> {
      const id = repoId?.trim();
      if (!id) {
        logger.debug(
          { repoId },
          'code-intel: missing repoId — query-context skipped'
        );
        return null;
      }
      if (!recodergit) {
        logger.debug(
          { repoId: id },
          'code-intel: recodergit engine not wired — query-context skipped'
        );
        return null;
      }
      const terms = Array.isArray(seedTerms)
        ? seedTerms.filter(t => typeof t === 'string' && t.trim())
        : [];
      try {
        const result = await recodergit.invoke({
          op: 'query-context',
          input: { repoId: id, seedTerms: terms },
          timeoutMs: QUERY_CONTEXT_TIMEOUT_MS,
        });
        if (!result.ok) {
          // Disabled / unbuilt / bad input — truthful skip, run proceeds raw.
          logger.info(
            { repoId: id, reason: result.reason, code: result.code },
            'code-intel: code-context skipped (recodergit unavailable)'
          );
          return null;
        }
        const ctx = result.value as CodeContextPayload | undefined;
        if (!ctx || ctx.available !== true) {
          // Not indexed / graph empty for seeds — truthful skip (no fabrication).
          logger.info(
            { repoId: id, reason: ctx?.reason },
            'code-intel: code-context empty (repo not indexed or no seed matches)'
          );
          return null;
        }
        const block = renderCodeContext(ctx);
        if (block) {
          logger.info(
            { repoId: id, symbols: ctx.symbols?.length ?? 0 },
            'code-intel: code-context injected into launch prompt'
          );
        }
        return block;
      } catch (err) {
        // Defensive: the seam should not throw, but a query must never crash launch.
        logger.warn(
          { repoId: id, err },
          'code-intel: code-context errored — skipped'
        );
        return null;
      }
    },

    // Issue-graph (beads) subset delegated to the dedicated tracker.
    trackWork: (taskId, workspaceId) =>
      issueGraph.trackWork(taskId, workspaceId),
    completeWork: (taskId, outcome) => issueGraph.completeWork(taskId, outcome),
    // Read a bd issue to START a workspace from it (reverse of trackWork). The
    // tracker's readIssue is always present here; the guard keeps the type honest.
    readIssue: (id) => issueGraph.readIssue?.(id) ?? Promise.resolve(null),
  };
}
