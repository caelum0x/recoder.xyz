/**
 * MemoryModule — the single owner of the MEMORY domain (see ./types).
 *
 * Composes the absorbed engines behind ONE interface:
 *   recall   → ./recall fuseRecall (mem0 ∪ beads ∪ agent-os → colbert → dedupe)
 *   remember → ./remember rememberDraft (beads wisp + mem0 mirror)
 *   promote  → the review gate (bd promote)
 *   forget   → mem0 delete
 *   relate   → beads dep edge
 *   health   → truthful liveness of every engine
 *
 * Every caller (bundle.enrichPrompt, the memory-store MCP adapter, the
 * completion-watcher) depends on THIS interface — never on a raw engine binding.
 * The engine bindings (conductor/beads-*, mem0-client, conductor/colbert-rerank)
 * stay where they are and are consumed here; nothing is duplicated.
 */
import { execFileSync } from 'node:child_process';

import type { MemoryStore } from '@recoder/agent-memory';
import type { MemoryCandidate, MemoryItem } from '@recoder/agent-os';

import {
  recallMemories,
  rememberCandidate,
  promoteMemory,
  linkMemories,
} from '../../conductor/beads-memory.js';
import { queryMemories, resolveDoltConnection } from '../../conductor/beads-sql.js';
import { beadsBin } from '../../conductor/beads-sync.js';
import { colbertRerank, colbertRerankAvailability } from '../../conductor/colbert-rerank.js';
import { mem0Search, mem0Add, mem0Delete, mem0Health, resolveMode } from '../../mem0-client.js';
import { createLogger } from '../../logger.js';

import { fuseRecall, type RecallEngines } from './recall.js';
import {
  rememberDraft,
  promoteDraft,
  forgetMemory,
  relateMemories,
  type RememberEngines,
} from './remember.js';
import type {
  MemoryModule,
  MemoryDraft,
  MemoryHealth,
  MemoryHealthSnapshot,
  MemoryScopeRef,
  MemoryStoreId,
  RecallOptions,
  RecalledMemory,
  RelationKind,
  ReviewRef,
} from './types.js';

const logger = createLogger('modules:memory');

/** Injectable engine seams — defaults wire the real bindings. */
export interface MemoryModuleDeps {
  recall?: Partial<RecallEngines>;
  remember?: Partial<RememberEngines>;
  /** beads CLI liveness probe. Defaults to `bd --version`. */
  beadsCliProbe?: () => boolean;
  /** mem0 async health probe. Defaults to mem0Health(). */
  mem0HealthProbe?: typeof mem0Health;
  agentOsStore?: MemoryStore;
}

function defaultBeadsCliProbe(): boolean {
  try {
    execFileSync(beadsBin(), ['--version'], { stdio: ['ignore', 'ignore', 'ignore'], timeout: 3_000 });
    return true;
  } catch {
    return false;
  }
}

/** A degrade-safe empty store used before the agent-os repository is attached. */
const EMPTY_STORE: MemoryStore = {
  async createCandidate(candidate: MemoryCandidate): Promise<MemoryCandidate> {
    return candidate;
  },
  async listCandidates(): Promise<MemoryCandidate[]> {
    return [];
  },
  async upsertMemory(item: MemoryItem): Promise<MemoryItem> {
    return item;
  },
  async search(): Promise<MemoryItem[]> {
    return [];
  },
};

class ComposedMemoryModule implements MemoryModule {
  private agentOsStore: MemoryStore | undefined;
  private readonly recallEngines: Omit<RecallEngines, 'agentOsStore'>;
  private readonly rememberEngines: RememberEngines;
  private readonly beadsCliProbe: () => boolean;
  private readonly mem0HealthProbe: typeof mem0Health;

  constructor(deps: MemoryModuleDeps = {}) {
    this.agentOsStore = deps.agentOsStore;
    this.beadsCliProbe = deps.beadsCliProbe ?? defaultBeadsCliProbe;
    this.mem0HealthProbe = deps.mem0HealthProbe ?? mem0Health;
    // agentOsStore is injected live per-call in recall(), so a late attach() is
    // always picked up.
    const r = deps.recall ?? {};
    this.recallEngines = {
      queryMemories: r.queryMemories ?? queryMemories,
      recallMemories: r.recallMemories ?? recallMemories,
      mem0Search: r.mem0Search ?? mem0Search,
      colbertRerank: r.colbertRerank ?? colbertRerank,
    };
    const w = deps.remember ?? {};
    this.rememberEngines = {
      rememberCandidate: w.rememberCandidate ?? rememberCandidate,
      promoteMemory: w.promoteMemory ?? promoteMemory,
      linkMemories: w.linkMemories ?? linkMemories,
      mem0Add: w.mem0Add ?? mem0Add,
      mem0Delete: w.mem0Delete ?? mem0Delete,
    };
  }

  attachAgentOsStore(store: MemoryStore): void {
    this.agentOsStore = store;
  }

  recall(query: string, scope?: MemoryScopeRef, opts: RecallOptions = {}): Promise<RecalledMemory[]> {
    return fuseRecall(query, scope, opts, { ...this.recallEngines, agentOsStore: this.agentOsStore });
  }

  async remember(fact: MemoryDraft): Promise<{ id: string; store: MemoryStoreId }> {
    // Route evidence-backed candidates through the agent-os store-of-record too,
    // so durable review has a canonical record — best-effort, never blocks beads.
    const result = await rememberDraft(fact, this.rememberEngines);
    logger.info({ store: result.store, scope: fact.scope }, 'memory candidate proposed via module');
    return result;
  }

  promote(id: string, review: ReviewRef): Promise<void> {
    return promoteDraft(id, review, this.rememberEngines);
  }

  forget(id: string): Promise<void> {
    return forgetMemory(id, this.rememberEngines);
  }

  relate(fromId: string, toId: string, kind: RelationKind): Promise<void> {
    return relateMemories(fromId, toId, kind, this.rememberEngines);
  }

  async health(): Promise<MemoryHealth> {
    const [mem0] = await Promise.all([this.mem0HealthProbe()]);
    const dolt = resolveDoltConnection();
    const cliUp = this.beadsCliProbe();
    const colbert = colbertRerankAvailability();
    const agentOsUp = this.agentOsStore !== undefined;

    const mem0Status = mem0.available ? 'up' : 'down';
    const beadsSqlStatus = dolt ? 'up' : 'down';
    const beadsCliStatus = cliUp ? 'up' : 'down';
    const colbertStatus = colbert.available ? 'up' : 'down';
    const agentOsStatus = agentOsUp ? 'up' : 'down';

    const ups = [mem0Status, beadsSqlStatus, beadsCliStatus, agentOsStatus].filter((s) => s === 'up').length;
    const overall = ups === 4 ? 'healthy' : ups === 0 ? 'down' : 'degraded';

    return {
      mem0: { status: mem0Status, mode: mem0.mode, vectorStore: mem0.vectorStore, reason: mem0.reason },
      beadsSql: dolt
        ? { status: 'up', port: dolt.port }
        : { status: 'down', reason: 'dolt sql-server not running (no .beads/dolt-server.port)' },
      beadsCli: { status: beadsCliStatus, bin: beadsBin(), reason: cliUp ? undefined : 'bd --version failed' },
      colbert: { status: colbertStatus, url: colbert.url },
      agentOs: { status: agentOsStatus },
      overall,
    };
  }

  healthSnapshot(): MemoryHealthSnapshot {
    const mode = resolveMode();
    const dolt = resolveDoltConnection();
    const colbert = colbertRerankAvailability();
    return {
      mem0: { configured: mode !== 'none', mode },
      beadsSql: { configured: dolt !== undefined, port: dolt?.port },
      colbert: { configured: colbert.available, url: colbert.url },
      agentOs: { configured: this.agentOsStore !== undefined },
    };
  }

  asMemoryStore(): MemoryStore {
    return this.agentOsStore ?? EMPTY_STORE;
  }
}

export function createMemoryModule(deps: MemoryModuleDeps = {}): MemoryModule {
  return new ComposedMemoryModule(deps);
}

let singleton: MemoryModule | undefined;

/** The process-wide MemoryModule. The ONLY memory entry point for callers. */
export function getMemoryModule(): MemoryModule {
  if (!singleton) singleton = createMemoryModule();
  return singleton;
}

/** Test seam: reset the singleton (and optionally install a custom module). */
export function __setMemoryModuleForTest(module: MemoryModule | undefined): void {
  singleton = module;
}

export type { MemoryModule } from './types.js';
export * from './types.js';
