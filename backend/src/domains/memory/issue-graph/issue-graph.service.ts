/**
 * issue-graph/issue-graph.service — the concrete `IssueGraphService`: every
 * beads verb the memory domain owns, composed over the INJECTED engines
 * transport (`EngineClientPort` = `BeadsAdapter`, the single `bd` spawner/argv
 * owner in `backend/src`). This file maps typed verbs onto `{op, input}` calls
 * and narrows the raw JSON into the port shapes — it never spawns `bd`, never
 * imports `engines/beads-bin`, and never builds an argv.
 *
 * DEGRADE LAW (enforced per verb): a null/down/faulted transport degrades
 * truthfully — reads return `[]`/`null` with a logged reason, writes return
 * `false`/`undefined` with a warn; NOTHING throws across the facet and nothing
 * is fabricated. Write verbs thread the caller's `actor` into the input so the
 * adapter stamps bd's global `--actor` audit-trail flag.
 */
import type { Logger } from '../../../shared/logger.js';
import type { EngineClientPort } from '../../engines/ports/engine-client.port.js';
import type { InvokeResult } from '../../engines/types.js';
import type {
  BeadsFlushResult,
  BeadsMemoryEntry,
  BeadsRememberInput,
  BlockedIssue,
  IssueDetail,
  IssueGraphHealth,
  IssueGraphService,
  IssueSummary,
  ReadyIssue,
} from '../ports/issue-graph.port.js';

export interface IssueGraphServiceDeps {
  /** The beads raw transport (engines `BeadsAdapter`); null ⇒ every verb degrades. */
  readonly engine: EngineClientPort | null;
  readonly logger: Logger;
}

const NOT_WIRED = 'beads engine client not wired';

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** bd list payloads are arrays; a single-object `show` payload is wrapped. */
function items(v: unknown): readonly unknown[] {
  if (Array.isArray(v)) return v;
  const r = rec(v);
  if (r && Array.isArray(r.issues)) return r.issues;
  return r ? [r] : [];
}

function toSummary(raw: unknown): IssueSummary | undefined {
  const r = rec(raw);
  const id = r ? str(r.id) : undefined;
  if (!r || !id) return undefined;
  return {
    id,
    title: typeof r.title === 'string' ? r.title : '',
    status: typeof r.status === 'string' ? r.status : '',
    labels: Array.isArray(r.labels) ? r.labels.map(String) : [],
  };
}

function toReady(raw: unknown): ReadyIssue | undefined {
  const summary = toSummary(raw);
  const r = rec(raw);
  if (!summary || !r) return undefined;
  return {
    ...summary,
    description: typeof r.description === 'string' ? r.description : '',
    ...(typeof r.priority === 'number' ? { priority: r.priority } : {}),
    ...(str(r.issue_type ?? r.issueType ?? r.type)
      ? { issueType: str(r.issue_type ?? r.issueType ?? r.type) }
      : {}),
  };
}

function toBlocked(raw: unknown): BlockedIssue | undefined {
  const summary = toSummary(raw);
  const r = rec(raw);
  if (!summary || !r) return undefined;
  const blockedBy = r.blocked_by ?? r.blockedBy;
  return {
    ...summary,
    blockedBy: Array.isArray(blockedBy) ? blockedBy.map(String) : [],
  };
}

function toDetail(raw: unknown): IssueDetail | undefined {
  const summary = toSummary(raw);
  const r = rec(raw);
  if (!summary || !r) return undefined;
  return {
    ...summary,
    description: typeof r.description === 'string' ? r.description : '',
    ...(Array.isArray(r.comments) ? { comments: r.comments } : {}),
    ...(Array.isArray(r.dependencies) ? { dependencies: r.dependencies } : {}),
  };
}

/** bd uses `description` for the memory body; normalize the field name. */
function toMemoryEntry(raw: unknown): BeadsMemoryEntry | undefined {
  const summary = toSummary(raw);
  const r = rec(raw);
  if (!summary || !r) return undefined;
  return {
    id: summary.id,
    title: summary.title,
    body: typeof r.description === 'string' ? r.description : '',
    status: summary.status,
    labels: summary.labels,
  };
}

function narrow<T>(raw: readonly unknown[], map: (v: unknown) => T | undefined): T[] {
  return raw.map(map).filter((e): e is T => e !== undefined);
}

/** Build the issue-graph facet over the injected beads engine transport. */
export function createIssueGraphService(deps: IssueGraphServiceDeps): IssueGraphService {
  const { engine, logger } = deps;

  /**
   * Route one op through the transport. NEVER throws: a null engine, a failed
   * invoke, or a (contract-violating) throw all become a truthful `{ok:false}`.
   */
  async function invoke(
    op: string,
    input: Record<string, unknown>,
  ): Promise<InvokeResult<unknown>> {
    if (!engine) return { ok: false, reason: NOT_WIRED };
    try {
      return await engine.invoke({ op, input });
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  /** A degraded READ: log the truthful reason, return the empty value. */
  function readDown<T>(op: string, reason: string, empty: T): T {
    logger.info({ op, reason }, 'issue-graph read unavailable — degrading truthfully');
    return empty;
  }

  /** A degraded WRITE: warn with the truthful reason, return the false value. */
  function writeDown<T>(op: string, reason: string, value: T): T {
    logger.warn({ op, reason }, 'issue-graph write failed — nothing written');
    return value;
  }

  /** Thread the audit actor into a write input (bd's global `--actor` flag). */
  function withActor(input: Record<string, unknown>, actor: string): Record<string, unknown> {
    const trimmed = actor.trim();
    return trimmed ? { ...input, actor: trimmed } : input;
  }

  return {
    async health(): Promise<IssueGraphHealth> {
      if (!engine) return { available: false, reason: NOT_WIRED };
      try {
        const h = await engine.health();
        if (h.status === 'up') {
          return { available: true, ...(h.version ? { version: h.version } : {}) };
        }
        return { available: false, reason: h.reason ?? `beads engine ${h.status}` };
      } catch (err) {
        return { available: false, reason: err instanceof Error ? err.message : String(err) };
      }
    },

    async ready(): Promise<readonly ReadyIssue[]> {
      const result = await invoke('ready', {});
      if (!result.ok) return readDown('ready', result.reason, []);
      return narrow(items(result.value), toReady);
    },

    async show(id: string, opts: { long?: boolean } = {}): Promise<IssueDetail | null> {
      const trimmed = id.trim();
      if (!trimmed) return null;
      const result = await invoke('show', {
        id: trimmed,
        ...(opts.long === true ? { long: true } : {}),
      });
      if (!result.ok) return readDown('show', result.reason, null);
      return narrow(items(result.value), toDetail)[0] ?? null;
    },

    async search(
      query: string,
      opts: { label?: string; status?: string; limit?: number } = {},
    ): Promise<readonly IssueSummary[]> {
      const q = query.trim();
      if (!q) return [];
      const result = await invoke('search', {
        query: q,
        ...(opts.label ? { label: opts.label } : {}),
        ...(opts.status ? { status: opts.status } : {}),
        ...(typeof opts.limit === 'number' && opts.limit > 0 ? { limit: opts.limit } : {}),
      });
      if (!result.ok) return readDown('search', result.reason, []);
      return narrow(items(result.value), toSummary);
    },

    async blocked(opts: { parent?: string } = {}): Promise<readonly BlockedIssue[]> {
      const result = await invoke('blocked', {
        ...(opts.parent ? { parent: opts.parent } : {}),
      });
      if (!result.ok) return readDown('blocked', result.reason, []);
      return narrow(items(result.value), toBlocked);
    },

    async depTree(
      id: string,
      opts: { direction?: 'down' | 'up' | 'both'; maxDepth?: number } = {},
    ): Promise<unknown | null> {
      const trimmed = id.trim();
      if (!trimmed) return null;
      const result = await invoke('graph', {
        id: trimmed,
        ...(opts.direction ? { direction: opts.direction } : {}),
        ...(typeof opts.maxDepth === 'number' ? { maxDepth: opts.maxDepth } : {}),
      });
      if (!result.ok) return readDown('graph', result.reason, null);
      return result.value ?? null;
    },

    async depList(
      id: string,
      opts: { direction?: 'down' | 'up'; type?: string } = {},
    ): Promise<unknown | null> {
      const trimmed = id.trim();
      if (!trimmed) return null;
      const result = await invoke('deps', {
        id: trimmed,
        ...(opts.direction ? { direction: opts.direction } : {}),
        ...(opts.type ? { type: opts.type } : {}),
      });
      if (!result.ok) return readDown('deps', result.reason, null);
      return result.value ?? null;
    },

    async stats(
      opts: {
        groupBy?: 'status' | 'priority' | 'type' | 'assignee' | 'label';
        status?: string;
      } = {},
    ): Promise<unknown | null> {
      const result = await invoke('stats', {
        ...(opts.groupBy ? { groupBy: opts.groupBy } : {}),
        ...(opts.status ? { status: opts.status } : {}),
      });
      if (!result.ok) return readDown('stats', result.reason, null);
      return result.value ?? null;
    },

    async stale(opts: { limit?: number } = {}): Promise<readonly IssueSummary[]> {
      const result = await invoke('stale', {
        ...(typeof opts.limit === 'number' && opts.limit > 0 ? { limit: opts.limit } : {}),
      });
      if (!result.ok) return readDown('stale', result.reason, []);
      return narrow(items(result.value), toSummary);
    },

    async create(
      input: { title: string; description?: string; labels?: string; discoveredFrom?: string },
      actor: string,
    ): Promise<{ id: string } | null> {
      const title = input.title.trim();
      if (!title) return null;
      const result = await invoke(
        'create',
        withActor(
          {
            title,
            ...(input.description ? { description: input.description } : {}),
            ...(input.labels ? { labels: input.labels } : {}),
            ...(input.discoveredFrom ? { discoveredFrom: input.discoveredFrom } : {}),
          },
          actor,
        ),
      );
      if (!result.ok) return writeDown('create', result.reason, null);
      const id = str(rec(result.value)?.id);
      return id ? { id } : writeDown('create', 'bd returned no issue id', null);
    },

    async update(id: string, patch: { status?: string }, actor: string): Promise<boolean> {
      const trimmed = id.trim();
      if (!trimmed) return false;
      const result = await invoke(
        'update',
        withActor({ id: trimmed, ...(patch.status ? { status: patch.status } : {}) }, actor),
      );
      return result.ok ? true : writeDown('update', result.reason, false);
    },

    async claim(id: string, actor: string): Promise<boolean> {
      const trimmed = id.trim();
      if (!trimmed) return false;
      const result = await invoke('claim', withActor({ id: trimmed }, actor));
      return result.ok ? true : writeDown('claim', result.reason, false);
    },

    async close(id: string, reason: string, actor: string): Promise<boolean> {
      const trimmed = id.trim();
      if (!trimmed) return false;
      const result = await invoke(
        'close',
        withActor({ id: trimmed, ...(reason.trim() ? { reason: reason.trim() } : {}) }, actor),
      );
      return result.ok ? true : writeDown('close', result.reason, false);
    },

    async note(id: string, text: string, actor: string): Promise<boolean> {
      const trimmed = id.trim();
      const body = text.trim();
      if (!trimmed || !body) return false;
      const result = await invoke('note', withActor({ id: trimmed, text: body }, actor));
      return result.ok ? true : writeDown('note', result.reason, false);
    },

    async remember(input: BeadsRememberInput, actor: string): Promise<string | undefined> {
      const title = input.title.trim();
      const body = input.body.trim();
      if (!title || !body) return undefined;
      const result = await invoke(
        'remember',
        withActor(
          {
            title,
            body,
            ...(input.scope?.trim() ? { scope: input.scope.trim() } : {}),
            ...(input.discoveredFrom?.trim()
              ? { discoveredFrom: input.discoveredFrom.trim() }
              : {}),
          },
          actor,
        ),
      );
      if (!result.ok) {
        return writeDown<string | undefined>('remember', result.reason, undefined);
      }
      const id = str(rec(result.value)?.id);
      if (id) logger.info({ id, scope: input.scope }, 'memory candidate persisted to beads (wisp)');
      return id;
    },

    async recallMemories(
      query: string,
      opts: { scope?: string; limit?: number } = {},
    ): Promise<readonly BeadsMemoryEntry[]> {
      const q = query.trim();
      if (!q) return [];
      const result = await invoke('recall_memory', {
        query: q,
        ...(opts.scope?.trim() ? { scope: opts.scope.trim() } : {}),
        ...(typeof opts.limit === 'number' && opts.limit > 0 ? { limit: opts.limit } : {}),
      });
      if (!result.ok) return readDown('recall_memory', result.reason, []);
      return narrow(items(result.value), toMemoryEntry);
    },

    async promote(id: string, actor: string): Promise<boolean> {
      const trimmed = id.trim();
      if (!trimmed) return false;
      const result = await invoke('promote', withActor({ id: trimmed }, actor));
      if (!result.ok) return writeDown('promote', result.reason, false);
      logger.info({ id: trimmed }, 'memory candidate promoted to durable bead');
      return true;
    },

    async vcStatus(): Promise<unknown | null> {
      const result = await invoke('sync', {});
      if (!result.ok) return readDown('sync', result.reason, null);
      return result.value ?? null;
    },

    async flush(message?: string, actor?: string): Promise<BeadsFlushResult> {
      const result = await invoke(
        'flush',
        withActor({ ...(message?.trim() ? { message: message.trim() } : {}) }, actor ?? ''),
      );
      if (!result.ok) {
        return writeDown<BeadsFlushResult>('flush', result.reason, {
          committed: false,
          reason: result.reason,
        });
      }
      const parsed = rec(result.value);
      if (parsed?.committed === true) {
        const hash = str(parsed.hash);
        logger.info({ hash: hash ?? null }, 'beads durability flush committed the versioned graph');
        return hash ? { committed: true, hash } : { committed: true };
      }
      // bd's truthful "nothing to commit" contract (a clean graph is not a fault).
      const reason = str(parsed?.message) ?? 'nothing to commit';
      return { committed: false, reason };
    },

    async gc(actor?: string): Promise<{ ran: boolean; reason?: string }> {
      const result = await invoke('gc', withActor({}, actor ?? ''));
      if (!result.ok) {
        return writeDown<{ ran: boolean; reason?: string }>('gc', result.reason, {
          ran: false,
          reason: result.reason,
        });
      }
      return { ran: true };
    },
  };
}
