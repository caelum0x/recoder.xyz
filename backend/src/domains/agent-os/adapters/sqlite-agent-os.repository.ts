/**
 * `SqliteAgentOsRepository` — the DURABLE embedded driver behind
 * {@link AgentOsRepositoryPort} for the DB-less desktop (solo mode). One local
 * better-sqlite3 file IS the state-of-record: every aggregate survives a
 * restart without a Postgres server.
 *
 * Shape mirrors the postgres driver's doc-store layout, flattened to one table
 * per aggregate (`id TEXT PRIMARY KEY, json TEXT, updated_at INTEGER`) plus the
 * append-only `agentos_event_log` (autoincrement seq + task/run indexes for the
 * NEWEST-first filtered page) and the ordered `agentos_outbox`. All methods are
 * SYNC (better-sqlite3) — legal under `RepositoryResult<T> = T | Promise<T>`.
 *
 * Semantics proven by the shared contract suite
 * (`__tests__/agent-os-repository.contract.test.ts`):
 *  - upsert replaces by id and preserves first-insert list order (SQLite upsert
 *    keeps the original rowid, so `ORDER BY rowid` is insertion order),
 *  - `appendEvent` is idempotent by eventId (`INSERT OR IGNORE` on the unique
 *    event_id index),
 *  - outbox append is first-write-wins; upsert replaces,
 *  - space policies derive from the space rows (no shadow table to drift).
 *
 * WAL mode + busy timeout: the conductor's sqlite workspace repository opens a
 * SECOND connection onto the same file; WAL lets the two write without
 * `SQLITE_BUSY` storms. Workspaces stay a READ-ONLY mirror here (conductor owns
 * writes into `conductor_workspaces`; this driver's `listWorkspaces` reads it).
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import type {
  AgentProfile,
  Approval,
  Artifact,
  GitHubDeliveryLink,
  InstructionBundle,
  MemoryCandidate,
  MemoryItem,
  PolicyDecision,
  RunEvent,
  RuntimeEvidence,
  Space,
  SpacePolicy,
  TaskRun,
  TaskSpec,
  Workspace,
} from '@recoder/agent-os';
import type { OutboxRecord } from '@recoder/agent-events';
import type { RecoderComponentDescriptor } from '@recoder/oss-registry';
import type { Logger } from '../../../shared/logger.js';
import {
  SNAPSHOT_EVENTS_TAIL,
  type AgentOsRepositoryPort,
  type AgentOsRepositorySnapshot,
  type EventsPageQuery,
  type ListPage,
  type PageQuery,
} from '../ports/agent-os-repository.port.js';

const AGGREGATE_TABLES = [
  'agentos_spaces',
  'agentos_agents',
  'agentos_tasks',
  'agentos_runs',
  'agentos_approvals',
  'agentos_artifacts',
  'agentos_runtime_evidence',
  'agentos_github_delivery_links',
  'agentos_memory_items',
  'agentos_memory_candidates',
  'agentos_instruction_bundles',
  'agentos_policy_decisions',
  'agentos_oss_components',
  'agentos_workspaces',
] as const;

type AggregateTable = (typeof AGGREGATE_TABLES)[number];

interface JsonRow {
  json: string;
}

interface CountRow {
  count: number;
}

export class SqliteAgentOsRepository implements AgentOsRepositoryPort {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    // First boot on a fresh desktop: the data dir may not exist yet.
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.migrate();
  }

  close(): void {
    if (this.db.open) this.db.close();
  }

  private migrate(): void {
    for (const table of AGGREGATE_TABLES) {
      this.db.exec(
        `create table if not exists ${table} (
           id text primary key,
           json text not null,
           updated_at integer not null
         )`,
      );
    }
    this.db.exec(
      `create table if not exists agentos_event_log (
         seq integer primary key autoincrement,
         event_id text not null unique,
         task_id text,
         run_id text,
         json text not null,
         created_at integer not null
       );
       create index if not exists idx_agentos_event_log_task_id on agentos_event_log(task_id);
       create index if not exists idx_agentos_event_log_run_id on agentos_event_log(run_id);
       create table if not exists agentos_outbox (
         id text primary key,
         json text not null,
         updated_at integer not null
       )`,
    );
  }

  // --- Generic doc-store helpers (one table per aggregate). ---

  private upsertDoc<T>(table: AggregateTable, id: string, doc: T): T {
    this.db
      .prepare(
        `insert into ${table} (id, json, updated_at) values (?, ?, ?)
         on conflict(id) do update set json = excluded.json, updated_at = excluded.updated_at`,
      )
      .run(id, JSON.stringify(doc), Date.now());
    return doc;
  }

  private getDoc<T>(table: AggregateTable, id: string): T | null {
    const row = this.db
      .prepare<[string], JsonRow>(`select json from ${table} where id = ?`)
      .get(id);
    return row ? (JSON.parse(row.json) as T) : null;
  }

  private listDocs<T>(table: AggregateTable): T[] {
    return this.db
      .prepare<[], JsonRow>(`select json from ${table} order by rowid`)
      .all()
      .map((row) => JSON.parse(row.json) as T);
  }

  private pageDocs<T>(table: AggregateTable, page: PageQuery): ListPage<T> {
    const rows = this.db
      .prepare<[number, number], JsonRow>(
        `select json from ${table} order by rowid limit ? offset ?`,
      )
      .all(page.limit, page.offset);
    const count = this.db
      .prepare<[], CountRow>(`select count(*) as count from ${table}`)
      .get();
    return {
      items: rows.map((row) => JSON.parse(row.json) as T),
      total: Number(count?.count ?? 0),
      limit: page.limit,
      offset: page.offset,
    };
  }

  snapshot(): AgentOsRepositorySnapshot {
    return {
      agents: this.listAgents(),
      tasks: this.listTasks(),
      runs: this.listRuns(),
      approvals: this.listApprovals(),
      artifacts: this.listArtifacts(),
      runtimeEvidence: this.listRuntimeEvidence(),
      githubDeliveryLinks: this.listGitHubDeliveryLinks(),
      memoryItems: this.listMemoryItems(),
      memoryCandidates: this.listMemoryCandidates(),
      instructionBundles: this.listInstructionBundles(),
      policyDecisions: this.listPolicyDecisions(),
      events: this.listEventsTail(),
      outbox: this.listOutbox(),
      spaces: this.listSpaces(),
      ossComponents: this.listOssComponents(),
    };
  }

  // — Spaces + policies (policies derive from the space rows; no shadow table) —
  listSpaces(): Space[] {
    return this.listDocs<Space>('agentos_spaces');
  }
  upsertSpace(space: Space): Space {
    return this.upsertDoc('agentos_spaces', space.spaceId, space);
  }
  listSpacePolicies(): Array<SpacePolicy & { spaceId: string }> {
    return this.listSpaces().map((space) => ({ ...space.policy, spaceId: space.spaceId }));
  }
  upsertSpacePolicy(spaceId: string, policy: SpacePolicy): SpacePolicy & { spaceId: string } {
    const space = this.getDoc<Space>('agentos_spaces', spaceId);
    if (!space) throw new Error(`Space not found: ${spaceId}`);
    this.upsertDoc('agentos_spaces', spaceId, {
      ...space,
      policy,
      updatedAt: new Date().toISOString(),
    });
    return { ...policy, spaceId };
  }

  // — Agents —
  listAgents(): AgentProfile[] {
    return this.listDocs<AgentProfile>('agentos_agents');
  }
  listAgentsPage(page: PageQuery): ListPage<AgentProfile> {
    return this.pageDocs<AgentProfile>('agentos_agents', page);
  }
  upsertAgent(agent: AgentProfile): AgentProfile {
    return this.upsertDoc('agentos_agents', agent.agentId, agent);
  }

  // — Tasks + runs —
  listTasks(): TaskSpec[] {
    return this.listDocs<TaskSpec>('agentos_tasks');
  }
  listTasksPage(page: PageQuery): ListPage<TaskSpec> {
    return this.pageDocs<TaskSpec>('agentos_tasks', page);
  }
  upsertTask(task: TaskSpec): TaskSpec {
    return this.upsertDoc('agentos_tasks', task.taskId, task);
  }
  listRuns(): TaskRun[] {
    return this.listDocs<TaskRun>('agentos_runs');
  }
  listRunsPage(page: PageQuery): ListPage<TaskRun> {
    return this.pageDocs<TaskRun>('agentos_runs', page);
  }
  upsertRun(run: TaskRun): TaskRun {
    return this.upsertDoc('agentos_runs', run.runId, run);
  }

  // — Approvals (read mirror) —
  listApprovals(): Approval[] {
    return this.listDocs<Approval>('agentos_approvals');
  }
  listApprovalsPage(page: PageQuery): ListPage<Approval> {
    return this.pageDocs<Approval>('agentos_approvals', page);
  }
  getApproval(approvalId: string): Approval | null {
    return this.getDoc<Approval>('agentos_approvals', approvalId);
  }
  upsertApproval(approval: Approval): Approval {
    return this.upsertDoc('agentos_approvals', approval.approvalId, approval);
  }

  // — Artifacts —
  listArtifacts(): Artifact[] {
    return this.listDocs<Artifact>('agentos_artifacts');
  }
  listArtifactsPage(page: PageQuery): ListPage<Artifact> {
    return this.pageDocs<Artifact>('agentos_artifacts', page);
  }
  getArtifact(artifactId: string): Artifact | null {
    return this.getDoc<Artifact>('agentos_artifacts', artifactId);
  }
  upsertArtifact(artifact: Artifact): Artifact {
    return this.upsertDoc('agentos_artifacts', artifact.artifactId, artifact);
  }

  // — Runtime evidence —
  listRuntimeEvidence(): RuntimeEvidence[] {
    return this.listDocs<RuntimeEvidence>('agentos_runtime_evidence');
  }
  upsertRuntimeEvidence(evidence: RuntimeEvidence): RuntimeEvidence {
    return this.upsertDoc('agentos_runtime_evidence', evidence.evidenceId, evidence);
  }

  // — GitHub delivery links —
  listGitHubDeliveryLinks(): GitHubDeliveryLink[] {
    return this.listDocs<GitHubDeliveryLink>('agentos_github_delivery_links');
  }
  upsertGitHubDeliveryLink(link: GitHubDeliveryLink): GitHubDeliveryLink {
    return this.upsertDoc('agentos_github_delivery_links', link.linkId, link);
  }
  getGitHubDeliveryLink(linkId: string): GitHubDeliveryLink | null {
    return this.getDoc<GitHubDeliveryLink>('agentos_github_delivery_links', linkId);
  }

  // — Memory —
  listMemoryItems(): MemoryItem[] {
    return this.listDocs<MemoryItem>('agentos_memory_items');
  }
  listMemoryItemsPage(page: PageQuery): ListPage<MemoryItem> {
    return this.pageDocs<MemoryItem>('agentos_memory_items', page);
  }
  upsertMemoryItem(memory: MemoryItem): MemoryItem {
    return this.upsertDoc('agentos_memory_items', memory.memoryId, memory);
  }
  listMemoryCandidates(): MemoryCandidate[] {
    return this.listDocs<MemoryCandidate>('agentos_memory_candidates');
  }
  listMemoryCandidatesPage(page: PageQuery): ListPage<MemoryCandidate> {
    return this.pageDocs<MemoryCandidate>('agentos_memory_candidates', page);
  }
  upsertMemoryCandidate(candidate: MemoryCandidate): MemoryCandidate {
    return this.upsertDoc('agentos_memory_candidates', candidate.candidateId, candidate);
  }

  // — Instruction bundles —
  listInstructionBundles(): InstructionBundle[] {
    return this.listDocs<InstructionBundle>('agentos_instruction_bundles');
  }
  listInstructionBundlesPage(page: PageQuery): ListPage<InstructionBundle> {
    return this.pageDocs<InstructionBundle>('agentos_instruction_bundles', page);
  }
  upsertInstructionBundle(bundle: InstructionBundle): InstructionBundle {
    return this.upsertDoc('agentos_instruction_bundles', bundle.bundleId, bundle);
  }

  // — Policy decisions —
  listPolicyDecisions(): PolicyDecision[] {
    return this.listDocs<PolicyDecision>('agentos_policy_decisions');
  }
  listPolicyDecisionsPage(page: PageQuery): ListPage<PolicyDecision> {
    return this.pageDocs<PolicyDecision>('agentos_policy_decisions', page);
  }
  upsertPolicyDecision(decision: PolicyDecision): PolicyDecision {
    return this.upsertDoc('agentos_policy_decisions', decision.decisionId, decision);
  }

  // — Event log (append-only, idempotent by eventId) —
  appendEvent(event: RunEvent): RunEvent {
    this.db
      .prepare(
        `insert or ignore into agentos_event_log (event_id, task_id, run_id, json, created_at)
         values (?, ?, ?, ?, ?)`,
      )
      .run(event.eventId, event.taskId ?? null, event.runId ?? null, JSON.stringify(event), Date.now());
    return event;
  }
  /**
   * ATOMIC append of the event + its outbox record in ONE better-sqlite3
   * transaction — both commit or the whole thing rolls back (recoder-kvb2), so a
   * restart never re-seeds `seen` for an event whose outbox write was lost.
   */
  appendEventWithOutbox(event: RunEvent, outbox?: OutboxRecord): void {
    this.db.transaction(() => {
      this.appendEvent(event);
      if (outbox) this.appendOutbox(outbox);
    })();
  }
  listEvents(): RunEvent[] {
    return this.db
      .prepare<[], JsonRow>(`select json from agentos_event_log order by seq`)
      .all()
      .map((row) => JSON.parse(row.json) as RunEvent);
  }
  /** Bounded, NEWEST-FIRST page with driver-side taskId/runId `WHERE` filters. */
  listEventsPage(query: EventsPageQuery): ListPage<RunEvent> {
    const clauses: string[] = [];
    const filterParams: unknown[] = [];
    if (query.taskId) {
      clauses.push('task_id = ?');
      filterParams.push(query.taskId);
    }
    if (query.runId) {
      clauses.push('run_id = ?');
      filterParams.push(query.runId);
    }
    const where = clauses.length > 0 ? ` where ${clauses.join(' and ')}` : '';
    const rows = this.db
      .prepare<unknown[], JsonRow>(
        `select json from agentos_event_log${where} order by seq desc limit ? offset ?`,
      )
      .all(...filterParams, query.limit, query.offset);
    const count = this.db
      .prepare<unknown[], CountRow>(`select count(*) as count from agentos_event_log${where}`)
      .get(...filterParams);
    return {
      items: rows.map((row) => JSON.parse(row.json) as RunEvent),
      total: Number(count?.count ?? 0),
      limit: query.limit,
      offset: query.offset,
    };
  }
  /** The bounded most-recent event tail for `snapshot()` (ascending order kept). */
  private listEventsTail(): RunEvent[] {
    return this.db
      .prepare<[number], JsonRow>(
        `select json from agentos_event_log order by seq desc limit ?`,
      )
      .all(SNAPSHOT_EVENTS_TAIL)
      .map((row) => JSON.parse(row.json) as RunEvent)
      .reverse();
  }

  // — Outbox (append = first-write-wins; upsert replaces) —
  appendOutbox(record: OutboxRecord): OutboxRecord {
    const result = this.db
      .prepare(
        `insert into agentos_outbox (id, json, updated_at) values (?, ?, ?)
         on conflict(id) do nothing`,
      )
      .run(record.outboxId, JSON.stringify(record), Date.now());
    if (result.changes > 0) return record;
    const existing = this.db
      .prepare<[string], JsonRow>(`select json from agentos_outbox where id = ?`)
      .get(record.outboxId);
    return existing ? (JSON.parse(existing.json) as OutboxRecord) : record;
  }
  upsertOutbox(record: OutboxRecord): OutboxRecord {
    this.db
      .prepare(
        `insert into agentos_outbox (id, json, updated_at) values (?, ?, ?)
         on conflict(id) do update set json = excluded.json, updated_at = excluded.updated_at`,
      )
      .run(record.outboxId, JSON.stringify(record), Date.now());
    return record;
  }
  listOutbox(): OutboxRecord[] {
    return this.db
      .prepare<[], JsonRow>(`select json from agentos_outbox order by rowid`)
      .all()
      .map((row) => JSON.parse(row.json) as OutboxRecord);
  }

  // — OSS components —
  listOssComponents(): RecoderComponentDescriptor[] {
    return this.listDocs<RecoderComponentDescriptor>('agentos_oss_components');
  }
  upsertOssComponent(component: RecoderComponentDescriptor): RecoderComponentDescriptor {
    return this.upsertDoc('agentos_oss_components', component.id, component);
  }
  getOssComponent(componentId: string): RecoderComponentDescriptor | null {
    return this.getDoc<RecoderComponentDescriptor>('agentos_oss_components', componentId);
  }

  // — Workspaces (READ-ONLY cross-domain mirror; conductor owns writes) —
  listWorkspaces(): Workspace[] {
    return this.listDocs<Workspace>('agentos_workspaces');
  }
  getWorkspace(workspaceId: string): Workspace | null {
    return this.getDoc<Workspace>('agentos_workspaces', workspaceId);
  }
}

/**
 * Composer seam: open the sqlite state-of-record, or `null` when the file/dir
 * is unopenable — the composer then degrades to in-memory with a truthful warn
 * (never a crash, never a faked durable driver).
 */
export function tryCreateSqliteAgentOsRepository(
  dbPath: string,
  logger: Logger,
): SqliteAgentOsRepository | null {
  try {
    return new SqliteAgentOsRepository(dbPath);
  } catch (error) {
    logger.warn(
      { dbPath, error: error instanceof Error ? error.message : String(error) },
      'agent-os: sqlite state-of-record failed to open — degrading to in-memory',
    );
    return null;
  }
}
