/**
 * repo-engine — the concrete executor behind the `recoder.repo` MCP server.
 *
 * Gives an AGENT governed, audited repository reads: read a file, search the
 * tree, and see the working-tree diff — over a resolved repo root. Runs behind
 * the interop gate like every other capability. Read-only by design (no writes,
 * no checkout, no network); a coding agent mutates files through its own edit
 * tools, so this surface is deliberately inspection-only.
 *
 * Safe by construction: paths are resolved against the repo root and rejected
 * if they escape it (no `../` traversal); reads are size-capped; search uses
 * `git grep` (respects .gitignore, never scans node_modules). Degrade-safe:
 * a missing repo/file/binary returns a truthful error, never a fake result.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { isAbsolute, resolve, relative } from 'node:path';
import { repoMcpServer } from '@recoder/agent-mcp';
import type { McpToolRouter, McpToolCallInput } from '@recoder/agent-mcp';
import { createEmbeddingPort, createVectorStore, type VectorEnv } from './vector-store.js';

const MAX_READ_BYTES = 256 * 1024; // 256 KB — enough for source files, capped.
const MAX_SEARCH_LINES = 200;
const DEFAULT_SEMANTIC_TOP_K = 10;

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function int(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * Resolve the repo root for a call: an absolute `repo` arg wins; otherwise the
 * injected base root; else cwd. The path must exist and be a directory.
 */
export function resolveRepoRoot(input: McpToolCallInput, baseRepoRoot?: string): string {
  const fromArg = str(input.args.repo) ?? str(input.args.repoPath);
  const candidate =
    fromArg && isAbsolute(fromArg)
      ? fromArg
      : (baseRepoRoot || process.env.CONDUCTOR_REPO_ROOT || process.cwd());
  if (!existsSync(candidate) || !statSync(candidate).isDirectory()) {
    throw new Error(`repo root not found or not a directory: ${candidate}`);
  }
  return resolve(candidate);
}

/** Resolve a repo-relative path safely under root (rejects traversal). */
function resolveWithin(root: string, p: string): string {
  const abs = resolve(root, p);
  const rel = relative(root, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`path escapes the repository: ${p}`);
  }
  return abs;
}

/** The `gh` binary (honoring an override), used for GitHub code search. */
function ghBin(): string {
  return process.env.RECODER_GH_BIN?.trim() || process.env.GH_BIN?.trim() || 'gh';
}

interface GithubSearchResult {
  query: string;
  source: 'github';
  repo?: string;
  owner?: string;
  matches: Array<{ repo: string; path: string; url?: string; fragments: string[] }>;
}

/**
 * Search code across GitHub repositories via `gh search code`. Requires the gh
 * CLI to be installed AND authenticated (gh auth login / GH_TOKEN). Returns a
 * truthful error otherwise. Scoped to a repo (owner/name) or an owner.
 */
export function githubCodeSearch(
  query: string,
  opts: { repo?: string; owner?: string; language?: string; limit?: number },
): GithubSearchResult {
  const args = ['search', 'code', query, '--json', 'path,repository,textMatches', '--limit', String(opts.limit ?? 30)];
  if (opts.repo) args.push('--repo', opts.repo);
  if (opts.owner) args.push('--owner', opts.owner);
  if (opts.language) args.push('--language', opts.language);

  let out = '';
  try {
    out = execFileSync(ghBin(), args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    if (/ENOENT|not found|command not found/i.test(msg)) {
      throw new Error('GitHub search needs the `gh` CLI installed');
    }
    if (/auth|login|token|401|403/i.test(msg)) {
      throw new Error('GitHub search needs `gh` authenticated (run `gh auth login` or set GH_TOKEN)');
    }
    throw new Error(`github search failed: ${msg.slice(0, 200)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(out.trim() || '[]');
  } catch {
    parsed = [];
  }
  const rows = Array.isArray(parsed) ? parsed : [];
  const matches = rows.slice(0, MAX_SEARCH_LINES).map((row) => {
    const r = row as {
      path?: string;
      repository?: { nameWithOwner?: string; name?: string; url?: string };
      textMatches?: Array<{ fragment?: string }>;
    };
    return {
      repo: r.repository?.nameWithOwner ?? r.repository?.name ?? '?',
      path: r.path ?? '?',
      url: r.repository?.url,
      fragments: (r.textMatches ?? [])
        .map((t) => (t.fragment ?? '').trim())
        .filter(Boolean)
        .slice(0, 3),
    };
  });
  return { query, source: 'github', repo: opts.repo, owner: opts.owner, matches };
}

// ── Semantic search seam ─────────────────────────────────────────────────────

/** A semantic hit (path + line window) surfaced by the vector index. */
export interface SemanticHit {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  preview: string;
}

/**
 * Pluggable semantic searcher. Injected in tests with a fake; in production the
 * default below wires the shared embedding + vector-store ports through the
 * recodergit semantic index. MUST be degrade-safe: return [] rather than throw.
 */
export type SemanticSearcher = (
  query: string,
  ctx: { repoRoot: string; topK: number },
) => Promise<SemanticHit[]>;

/** Stable, filesystem-safe collection name for a repo root. */
function repoCollectionName(repoRoot: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < repoRoot.length; i++) {
    h ^= repoRoot.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `recoder-code-${(h >>> 0).toString(16)}`;
}

/**
 * The default semantic searcher: embeds the query and searches a per-repo Qdrant
 * collection via the shared vector foundation, delegating hit-shaping to the
 * recodergit semantic index. DEGRADE-SAFE by construction — no embeddings
 * provider or no QDRANT_URL (or any error) ⇒ []. Nothing here throws.
 *
 * recodergit is imported lazily so this module never hard-couples to the package
 * build; a missing `createSemanticIndex` export simply degrades to [].
 */
async function defaultSemanticSearch(
  query: string,
  ctx: { repoRoot: string; topK: number },
): Promise<SemanticHit[]> {
  try {
    const env = process.env as unknown as VectorEnv;
    const fetchLike = globalThis.fetch as unknown as Parameters<typeof createEmbeddingPort>[0]['fetch'];
    const embedder = createEmbeddingPort({ fetch: fetchLike, env });
    if (embedder.provider === 'none') return [];
    const store = createVectorStore({ fetch: fetchLike, env });
    if (!store.configured) return [];

    const rg = (await import('@recoder/recodergit')) as {
      createSemanticIndex?: (opts: {
        embedder: typeof embedder;
        store: typeof store;
        collection: string;
      }) => { semanticSearch(q: string, topK?: number): Promise<SemanticHit[]> };
    };
    if (typeof rg.createSemanticIndex !== 'function') return [];

    const index = rg.createSemanticIndex({
      embedder,
      store,
      collection: repoCollectionName(ctx.repoRoot),
    });
    const hits = await index.semanticSearch(query, ctx.topK);
    return Array.isArray(hits) ? hits : [];
  } catch {
    // Truthful degrade — the merged search falls back to keyword-only.
    return [];
  }
}

/** A single merged, source-labelled search match. */
export interface RepoSearchMatch {
  source: 'semantic' | 'keyword' | 'github';
  path: string;
  /** 1-based line for local hits (undefined for GitHub matches). */
  line?: number;
  /** The matched line / preview / fragment text. */
  text?: string;
  /** Similarity score (semantic only). */
  score?: number;
  /** Owner/name (GitHub only). */
  repo?: string;
  /** Repository URL (GitHub only). */
  url?: string;
}

/** Parse `git grep -n` output lines (`path:line:content`) into keyword matches. */
function parseGrepMatches(out: string): RepoSearchMatch[] {
  const matches: RepoSearchMatch[] = [];
  for (const raw of out.split('\n')) {
    if (!raw) continue;
    const first = raw.indexOf(':');
    if (first === -1) continue;
    const second = raw.indexOf(':', first + 1);
    if (second === -1) continue;
    const path = raw.slice(0, first);
    const lineNum = Number(raw.slice(first + 1, second));
    matches.push({
      source: 'keyword',
      path,
      line: Number.isFinite(lineNum) ? lineNum : undefined,
      text: raw.slice(second + 1).trim(),
    });
  }
  return matches;
}

export function registerRepoMcpTools(
  router: McpToolRouter,
  options: {
    baseRepoRoot?: string;
    /** Injectable semantic searcher; `null` disables it; default wires vector-store. */
    semanticSearch?: SemanticSearcher | null;
  } = {},
): void {
  const semanticSearch: SemanticSearcher | null =
    options.semanticSearch === undefined ? defaultSemanticSearch : options.semanticSearch;

  router.register(repoMcpServer, 'repo.read', async (input) => {
    const root = resolveRepoRoot(input, options.baseRepoRoot);
    const path = str(input.args.path);
    if (!path) throw new Error('path is required');
    const abs = resolveWithin(root, path);
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      throw new Error(`file not found: ${path}`);
    }
    const size = statSync(abs).size;
    const buf = readFileSync(abs);
    const text = buf.subarray(0, MAX_READ_BYTES).toString('utf8');
    return {
      content: {
        path,
        truncated: size > MAX_READ_BYTES,
        bytes: size,
        content: text,
      },
    };
  });

  /**
   * repo.search — a REAL hybrid code search that MERGES three sources into one
   * de-duped, source-labelled result:
   *   (a) SEMANTIC — the vector index (embeddings + Qdrant), when available.
   *   (b) KEYWORD  — `git grep` over the local worktree (gitignore-aware).
   *   (c) GITHUB   — `gh search code` across remote repos, when a github/owner
   *                  arg is given.
   * Never throws: a failing source contributes nothing (recorded truthfully in
   * `degraded`) and the search degrades to keyword-only.
   */
  router.register(repoMcpServer, 'repo.search', async (input) => {
    const query = str(input.args.query) ?? str(input.args.pattern);
    if (!query) throw new Error('query is required');

    const root = resolveRepoRoot(input, options.baseRepoRoot);
    const topK = int(input.args.topK, DEFAULT_SEMANTIC_TOP_K);
    const githubRepo = str(input.args.github) ?? str(input.args.githubRepo);
    const githubOwner = str(input.args.githubOwner) ?? str(input.args.owner);

    const degraded: { semantic?: string; keyword?: string; github?: string } = {};
    const candidates: RepoSearchMatch[] = [];
    const sources = new Set<string>();

    // (a) SEMANTIC — degrade-safe; [] when no embeddings/Qdrant configured.
    if (semanticSearch) {
      try {
        const hits = await semanticSearch(query, { repoRoot: root, topK });
        for (const h of hits) {
          candidates.push({
            source: 'semantic',
            path: h.path,
            line: h.startLine,
            text: h.preview,
            score: h.score,
          });
        }
        if (hits.length > 0) sources.add('semantic');
      } catch (err) {
        // The searcher SHOULD degrade internally; guard anyway so we never throw.
        degraded.semantic = (err as Error).message?.slice(0, 200) ?? 'semantic search unavailable';
      }
    }

    // (b) KEYWORD — git grep. Exit 1 means "no matches", not an error.
    try {
      let out = '';
      try {
        out = execFileSync('git', ['-C', root, 'grep', '-n', '-I', '--', query], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (err) {
        const e = err as { status?: number };
        if (e.status === 1) out = '';
        else throw err;
      }
      const kw = parseGrepMatches(out);
      candidates.push(...kw);
      if (kw.length > 0) sources.add('keyword');
    } catch (err) {
      degraded.keyword = (err as Error).message?.slice(0, 200) ?? 'keyword search failed';
    }

    // (c) GITHUB — only when a remote repo/owner is requested. Degrade truthfully
    // (missing/unauthenticated `gh`) instead of failing the whole search.
    if (githubRepo || githubOwner) {
      try {
        const gh = githubCodeSearch(query, {
          repo: githubRepo,
          owner: githubOwner,
          language: str(input.args.language),
        });
        for (const m of gh.matches) {
          candidates.push({
            source: 'github',
            path: m.path,
            repo: m.repo,
            url: m.url,
            text: m.fragments[0],
          });
        }
        if (gh.matches.length > 0) sources.add('github');
      } catch (err) {
        degraded.github = (err as Error).message?.slice(0, 200) ?? 'github search unavailable';
      }
    }

    // De-dupe by (repo, path, line): semantic first (richest), then keyword, then
    // github. The same location is listed once, labelled by its winning source.
    const seen = new Set<string>();
    const merged: RepoSearchMatch[] = [];
    for (const m of candidates) {
      const key = `${m.repo ?? ''}|${m.path}|${m.line ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(m);
      if (merged.length >= MAX_SEARCH_LINES) break;
    }

    return {
      content: {
        query,
        source: 'hybrid',
        sources: [...sources],
        matches: merged,
        truncated: candidates.length > merged.length,
        ...(Object.keys(degraded).length > 0 ? { degraded } : {}),
      },
    };
  });

  router.register(repoMcpServer, 'repo.diff', async (input) => {
    const root = resolveRepoRoot(input, options.baseRepoRoot);
    const base = str(input.args.base);
    const args = ['-C', root, 'diff', '--stat'];
    if (base) args.push(base);
    let stat = '';
    let patch = '';
    try {
      stat = execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      patch = execFileSync('git', ['-C', root, 'diff', ...(base ? [base] : [])], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 4 * 1024 * 1024,
      });
    } catch (err) {
      throw new Error(`diff failed: ${(err as Error).message?.slice(0, 200)}`);
    }
    return { content: { stat: stat.trim(), patch: patch.slice(0, 200 * 1024) } };
  });
}
