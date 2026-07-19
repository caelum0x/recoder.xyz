/**
 * beads-memory — beads (bd) as the agents' SHARED MEMORY LAYER (backend service).
 *
 * Not an MCP seam: this is the backend's own memory API over the issue graph.
 * The lifecycle honors the control-plane rule (AGENTS.md: agents never write
 * durable memory directly):
 *
 *   remember  → `bd create --ephemeral -l memory` — an EPHEMERAL WISP (memory
 *               CANDIDATE with evidence; subject to TTL compaction, never
 *               silently durable).
 *   recall    → `bd search --label memory --status all` — candidates AND
 *               promoted memories, queryable by text + scope label.
 *   promote   → `bd promote` — the REVIEW step: copies the wisp into the
 *               permanent Dolt-versioned table (id preserved, links kept).
 *   note      → `bd note` — append evidence to an existing memory/work item.
 *
 * Consumers:
 *   - bundle.ts enrichPrompt: recalls relevant memories into every agent launch.
 *   - completion-watcher: persists each generated MemoryCandidate as a wisp.
 *   - conductor routes: human recall/promote surface.
 *
 * Degrade-safe: when bd is unavailable (binary missing, DB locked/migrating)
 * every function returns undefined/[] with a truthful warn — never throws to
 * callers, never fakes a memory.
 */
import { execFileSync } from 'node:child_process';
import { createLogger } from '../../../shared/logger.js';
import { beadsBin } from '../../engines/beads-bin.js';

const logger = createLogger('conductor:beads-memory');

/** Runs a `bd` invocation and returns stdout. Injectable for tests. */
export type BeadsMemoryRunner = (args: string[]) => string;

let runnerOverride: BeadsMemoryRunner | undefined;

function run(args: string[]): string {
  if (runnerOverride) return runnerOverride(args);
  const cwd = process.env.CONDUCTOR_REPO_ROOT || process.cwd();
  return execFileSync(beadsBin(), args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15_000,
  });
}

function parseJson(out: string): unknown {
  const trimmed = out.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export interface MemoryEntry {
  id: string;
  title: string;
  description: string;
  status: string;
  labels: string[];
}

function normalizeEntry(raw: unknown): MemoryEntry | undefined {
  if (typeof raw !== 'object' || raw == null) return undefined;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id : '';
  if (!id) return undefined;
  return {
    id,
    title: typeof r.title === 'string' ? r.title : '',
    description: typeof r.description === 'string' ? r.description : '',
    status: typeof r.status === 'string' ? r.status : '',
    labels: Array.isArray(r.labels) ? r.labels.map(String) : [],
  };
}

export interface RememberInput {
  /** Short memory statement (the fact/pattern learned). */
  title: string;
  /** The memory content + evidence backing it. */
  body: string;
  /** Optional scope label suffix (e.g. a repo, subsystem, or 'task'). */
  scope?: string;
  /** Optional bd issue id this memory was discovered from (adds a dep edge). */
  discoveredFrom?: string;
}

/**
 * Persist a memory CANDIDATE as an ephemeral wisp. Returns the bd id, or
 * `undefined` when bd is unavailable (truthful degrade — the caller may still
 * hold the candidate in its own metadata, as completion-watcher does).
 */
export function rememberCandidate(input: RememberInput): string | undefined {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || !body) return undefined;
  const labels = ['memory'];
  if (input.scope?.trim()) labels.push(`memory-scope:${input.scope.trim()}`);
  const args = [
    'create',
    title,
    '--ephemeral',
    '-l',
    labels.join(','),
    '-d',
    body,
    '--json',
  ];
  if (input.discoveredFrom?.trim())
    args.push('--deps', `discovered-from:${input.discoveredFrom.trim()}`);
  try {
    const created = parseJson(run(args));
    const id =
      typeof created === 'object' &&
      created != null &&
      typeof (created as Record<string, unknown>).id === 'string'
        ? ((created as Record<string, unknown>).id as string)
        : undefined;
    if (id)
      logger.info(
        { id, scope: input.scope },
        'memory candidate persisted to beads (wisp)'
      );
    return id;
  } catch (err) {
    logger.warn(
      { err: String(err).slice(0, 200) },
      'beads remember unavailable — candidate not persisted to graph'
    );
    return undefined;
  }
}

/**
 * Recall memories (candidates + promoted) matching a text query. Empty array on
 * any failure — recall must never block or break a launch.
 */
export function recallMemories(
  query: string,
  options: { scope?: string; limit?: number } = {}
): MemoryEntry[] {
  const q = query.trim();
  if (!q) return [];
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 50);
  const args = [
    'search',
    q,
    '--label',
    'memory',
    '--status',
    'all',
    '--json',
    '-n',
    String(limit),
  ];
  if (options.scope?.trim())
    args.push('--label', `memory-scope:${options.scope.trim()}`);
  try {
    const found = parseJson(run(args));
    if (!Array.isArray(found)) return [];
    return found
      .map(normalizeEntry)
      .filter((e): e is MemoryEntry => e !== undefined);
  } catch (err) {
    logger.warn(
      { err: String(err).slice(0, 200) },
      'beads recall unavailable — continuing without graph memory'
    );
    return [];
  }
}

/**
 * Promote a memory candidate (wisp) to a durable bead — the REVIEW step. Only
 * exposed to policy-gated/human surfaces, never as a direct agent tool.
 */
export function promoteMemory(id: string): boolean {
  const trimmed = id.trim();
  if (!trimmed) return false;
  try {
    run(['promote', trimmed, '--json']);
    logger.info({ id: trimmed }, 'memory candidate promoted to durable bead');
    return true;
  } catch (err) {
    logger.warn(
      { id: trimmed, err: String(err).slice(0, 200) },
      'beads promote failed'
    );
    return false;
  }
}

export interface BeadsCommitResult {
  committed: boolean;
  hash?: string;
  reason?: string;
}

/**
 * Durability flush: commit the working-set of the Dolt-versioned issue graph
 * (`bd vc commit`) so note/update/close mutations become a durable, versioned
 * checkpoint. `bd` normally auto-commits per command, but a periodic explicit
 * flush guarantees any coalesced/deferred working-set is sealed.
 *
 * Degrade-safe: a clean graph yields `{ committed:false, reason:'nothing to
 * commit' }` (the `bd vc commit --json` "committed:false" contract); `bd` down
 * yields `{ committed:false, reason }`. Never throws, never fabricates a commit.
 */
export function commitMemoryGraph(
  message = 'bd: memory durability flush'
): BeadsCommitResult {
  const msg = message.trim() || 'bd: memory durability flush';
  try {
    const parsed = parseJson(run(['vc', 'commit', '-m', msg, '--json']));
    if (typeof parsed === 'object' && parsed != null) {
      const rec = parsed as Record<string, unknown>;
      const committed = rec.committed === true;
      const hash = typeof rec.hash === 'string' ? rec.hash : undefined;
      if (committed) {
        logger.info(
          { hash },
          'beads durability flush committed the versioned graph'
        );
        return hash ? { committed: true, hash } : { committed: true };
      }
      const reason =
        typeof rec.message === 'string' ? rec.message : 'nothing to commit';
      return { committed: false, reason };
    }
    return { committed: false, reason: 'nothing to commit' };
  } catch (err) {
    logger.warn(
      { err: String(err).slice(0, 200) },
      'beads durability flush failed — graph not committed'
    );
    return {
      committed: false,
      reason: err instanceof Error ? err.message : 'bd vc commit failed',
    };
  }
}

/** Append an evidence/progress note to an existing memory or work item. */
export function appendMemoryNote(id: string, text: string): boolean {
  const trimmed = id.trim();
  const note = text.trim();
  if (!trimmed || !note) return false;
  try {
    run(['note', trimmed, note, '--json']);
    return true;
  } catch (err) {
    logger.warn(
      { id: trimmed, err: String(err).slice(0, 200) },
      'beads note failed'
    );
    return false;
  }
}

/** Test seam: inject a fake runner. Pass undefined to restore the real one. */
export function __setBeadsMemoryRunnerForTest(
  runner: BeadsMemoryRunner | undefined
): void {
  runnerOverride = runner;
}
