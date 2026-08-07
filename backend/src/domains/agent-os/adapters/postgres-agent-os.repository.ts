/**
 * `PostgresAgentOsRepository` — the DURABLE driver behind
 * {@link AgentOsRepositoryPort} (GAP Wave 4: Postgres state-of-record).
 *
 * Binds to the persistence domain's `QueryExecutor` seam (never `pg` directly)
 * over the `agentos_0004_state_of_record` tables:
 *  - `agentos_records`   — one jsonb document per aggregate record, keyed
 *    `(aggregate, record_id)`; `seq` preserves insertion order so `list*`
 *    ordering matches the in-memory driver exactly (contract parity).
 *  - `agentos_event_log` — the append-only RunEvent log.
 *  - `agentos_outbox`    — the CloudEvents outbox (at-least-once spine).
 *
 * Degrade posture: this adapter NEVER fakes success. When the pool is down a
 * query rejects and the caller (routes → 503, ingest → structured rejection)
 * surfaces the truth; the composer only selects this driver when an executor is
 * injected, and health reports `repository:postgres` degraded while the
 * executor is unavailable. Workspaces stay a READ-ONLY cross-domain mirror
 * (aggregate `workspace`, hydrated by integration — conductor owns writes).
 */
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
import type { QueryExecutor, QueryParams } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';
import {
  SNAPSHOT_EVENTS_TAIL,
  type AgentOsRepositoryPort,
  type AgentOsRepositorySnapshot,
  type EventsPageQuery,
  type ListPage,
  type PageQuery,
} from '../ports/agent-os-repository.port.js';

/** The aggregate discriminators stored in `agentos_records.aggregate`. */
const AGG = {
  space: 'space',
  agent: 'agent',
  task: 'task',
  run: 'run',
  approval: 'approval',
  artifact: 'artifact',
  runtimeEvidence: 'runtime_evidence',
  githubDeliveryLink: 'github_delivery_link',
  memoryItem: 'memory_item',
  memoryCandidate: 'memory_candidate',
  instructionBundle: 'instruction_bundle',
  policyDecision: 'policy_decision',
  ossComponent: 'oss_component',
  workspace: 'workspace',
} as const;

const UPSERT_RECORD_SQL = `insert into agentos_records (aggregate, record_id, payload)
   values (:aggregate, :record_id, :payload::jsonb)
   on conflict (aggregate, record_id)
   do update set payload = excluded.payload, updated_at = now()`;

const LIST_RECORDS_SQL = `select payload from agentos_records
   where aggregate = :aggregate order by seq asc`;

const LIST_RECORDS_PAGE_SQL = `select payload from agentos_records
   where aggregate = :aggregate order by seq asc limit :limit offset :offset`;

const COUNT_RECORDS_SQL = `select count(*)::int as count from agentos_records
   where aggregate = :aggregate`;

const GET_RECORD_SQL = `select payload from agentos_records
   where aggregate = :aggregate and record_id = :record_id`;

export class PostgresAgentOsRepository implements AgentOsRepositoryPort {
  constructor(private readonly executor: QueryExecutor) {}

  async snapshot(): Promise<AgentOsRepositorySnapshot> {
    const [
      agents, tasks, runs, approvals, artifacts, runtimeEvidence,
      githubDeliveryLinks, memoryItems, memoryCandidates, instructionBundles,
      policyDecisions, events, outbox, spaces, ossComponents,
    ] = await Promise.all([
      this.listAgents(), this.listTasks(), this.listRuns(), this.listApprovals(),
      this.listArtifacts(), this.listRuntimeEvidence(), this.listGitHubDeliveryLinks(),
      this.listMemoryItems(), this.listMemoryCandidates(), this.listInstructionBundles(),
      this.listPolicyDecisions(), this.listEventsTail(), this.listOutbox(),
      this.listSpaces(), this.listOssComponents(),
    ]);
    return {
      agents, tasks, runs, approvals, artifacts, runtimeEvidence,
      githubDeliveryLinks, memoryItems, memoryCandidates, instructionBundles,
      policyDecisions, events, outbox, spaces, ossComponents,
    };
  }

  // — Spaces + policies —
  listSpaces(): Promise<Space[]> {
    return this.list<Space>(AGG.space);
  }
  upsertSpace(space: Space): Promise<Space> {
    return this.upsert(AGG.space, space.spaceId, space);
  }
  async listSpacePolicies(): Promise<Array<SpacePolicy & { spaceId: string }>> {
    const spaces = await this.listSpaces();
    return spaces.map((space) => ({ ...space.policy, spaceId: space.spaceId }));
  }
  async upsertSpacePolicy(
    spaceId: string,
    policy: SpacePolicy,
  ): Promise<SpacePolicy & { spaceId: string }> {
    return this.executor.withTransaction(async (tx) => {
      const row = await tx.one<QueryRow>(GET_RECORD_SQL, {
        aggregate: AGG.space,
        record_id: spaceId,
      });
      if (!row) throw new Error(`Space not found: ${spaceId}`);
      const space = row.payload as Space;
      const next: Space = { ...space, policy, updatedAt: new Date().toISOString() };
      await tx.mutate(UPSERT_RECORD_SQL, {
        aggregate: AGG.space,
        record_id: spaceId,
        payload: JSON.stringify(next),
      });
      return { ...policy, spaceId };
    });
  }

  // — Agents —
  listAgents(): Promise<AgentProfile[]> {
    return this.list<AgentProfile>(AGG.agent);
  }
  listAgentsPage(page: PageQuery): Promise<ListPage<AgentProfile>> {
    return this.listPage<AgentProfile>(AGG.agent, page);
  }
  upsertAgent(agent: AgentProfile): Promise<AgentProfile> {
    return this.upsert(AGG.agent, agent.agentId, agent);
  }

  // — Tasks + runs —
  listTasks(): Promise<TaskSpec[]> {
    return this.list<TaskSpec>(AGG.task);
  }
  listTasksPage(page: PageQuery): Promise<ListPage<TaskSpec>> {
    return this.listPage<TaskSpec>(AGG.task, page);
  }
  upsertTask(task: TaskSpec): Promise<TaskSpec> {
    return this.upsert(AGG.task, task.taskId, task);
  }
  listRuns(): Promise<TaskRun[]> {
    return this.list<TaskRun>(AGG.run);
  }
  listRunsPage(page: PageQuery): Promise<ListPage<TaskRun>> {
    return this.listPage<TaskRun>(AGG.run, page);
  }
  upsertRun(run: TaskRun): Promise<TaskRun> {
    return this.upsert(AGG.run, run.runId, run);
  }

  // — Approvals (read mirror; authoritative lifecycle is governance's) —
  listApprovals(): Promise<Approval[]> {
    return this.list<Approval>(AGG.approval);
  }
  listApprovalsPage(page: PageQuery): Promise<ListPage<Approval>> {
    return this.listPage<Approval>(AGG.approval, page);
  }
  getApproval(approvalId: string): Promise<Approval | null> {
    return this.get<Approval>(AGG.approval, approvalId);
  }
  upsertApproval(approval: Approval): Promise<Approval> {
    return this.upsert(AGG.approval, approval.approvalId, approval);
  }

  // — Artifacts —
  listArtifacts(): Promise<Artifact[]> {
    return this.list<Artifact>(AGG.artifact);
  }
  listArtifactsPage(page: PageQuery): Promise<ListPage<Artifact>> {
    return this.listPage<Artifact>(AGG.artifact, page);
  }
  getArtifact(artifactId: string): Promise<Artifact | null> {
    return this.get<Artifact>(AGG.artifact, artifactId);
  }
  upsertArtifact(artifact: Artifact): Promise<Artifact> {
    return this.upsert(AGG.artifact, artifact.artifactId, artifact);
  }

  // — Runtime evidence —
  listRuntimeEvidence(): Promise<RuntimeEvidence[]> {
    return this.list<RuntimeEvidence>(AGG.runtimeEvidence);
  }
  upsertRuntimeEvidence(evidence: RuntimeEvidence): Promise<RuntimeEvidence> {
    return this.upsert(AGG.runtimeEvidence, evidence.evidenceId, evidence);
  }

  // — GitHub delivery links —
  listGitHubDeliveryLinks(): Promise<GitHubDeliveryLink[]> {
    return this.list<GitHubDeliveryLink>(AGG.githubDeliveryLink);
  }
  upsertGitHubDeliveryLink(link: GitHubDeliveryLink): Promise<GitHubDeliveryLink> {
    return this.upsert(AGG.githubDeliveryLink, link.linkId, link);
  }
  getGitHubDeliveryLink(linkId: string): Promise<GitHubDeliveryLink | null> {
    return this.get<GitHubDeliveryLink>(AGG.githubDeliveryLink, linkId);
  }

  // — Memory items + candidates —
  listMemoryItems(): Promise<MemoryItem[]> {
    return this.list<MemoryItem>(AGG.memoryItem);
  }
  listMemoryItemsPage(page: PageQuery): Promise<ListPage<MemoryItem>> {
    return this.listPage<MemoryItem>(AGG.memoryItem, page);
  }
  upsertMemoryItem(memory: MemoryItem): Promise<MemoryItem> {
    return this.upsert(AGG.memoryItem, memory.memoryId, memory);
  }
  listMemoryCandidates(): Promise<MemoryCandidate[]> {
    return this.list<MemoryCandidate>(AGG.memoryCandidate);
  }
  listMemoryCandidatesPage(page: PageQuery): Promise<ListPage<MemoryCandidate>> {
    return this.listPage<MemoryCandidate>(AGG.memoryCandidate, page);
  }
  upsertMemoryCandidate(candidate: MemoryCandidate): Promise<MemoryCandidate> {
    return this.upsert(AGG.memoryCandidate, candidate.candidateId, candidate);
  }

  // — Instruction bundles —
  listInstructionBundles(): Promise<InstructionBundle[]> {
    return this.list<InstructionBundle>(AGG.instructionBundle);
  }
  listInstructionBundlesPage(page: PageQuery): Promise<ListPage<InstructionBundle>> {
    return this.listPage<InstructionBundle>(AGG.instructionBundle, page);
  }
  upsertInstructionBundle(bundle: InstructionBundle): Promise<InstructionBundle> {
    return this.upsert(AGG.instructionBundle, bundle.bundleId, bundle);
  }

  // — Policy decisions —
  listPolicyDecisions(): Promise<PolicyDecision[]> {
    return this.list<PolicyDecision>(AGG.policyDecision);
  }
  listPolicyDecisionsPage(page: PageQuery): Promise<ListPage<PolicyDecision>> {
    return this.listPage<PolicyDecision>(AGG.policyDecision, page);
  }
  upsertPolicyDecision(decision: PolicyDecision): Promise<PolicyDecision> {
    return this.upsert(AGG.policyDecision, decision.decisionId, decision);
  }

  // — Immutable event log (append-only) —
  async appendEvent(event: RunEvent): Promise<RunEvent> {
    // Idempotent by `event_id` (defense-in-depth durability, recoder-4euj):
    // conductor RunEvents persist through this path (P1 #8) with deterministic
    // eventIds, so a re-emit of the same terminal event is a truthful no-op —
    // `on conflict (event_id) do nothing` (backed by the unique index from
    // agentos_0006) never writes a duplicate durable row.
    await this.executor.mutate(
      `insert into agentos_event_log (event_id, payload) values (:event_id, :payload::jsonb)
       on conflict (event_id) do nothing`,
      { event_id: event.eventId, payload: JSON.stringify(event) },
    );
    return event;
  }
  /**
   * ATOMIC append of the event + its outbox record in ONE transaction — both
   * `insert ... on conflict do nothing` commit together or roll back
   * (recoder-kvb2). The ingest idempotency index re-seeds from the event log on
   * restart, so a committed event with a lost separate outbox write would be
   * skipped forever; the shared transaction closes that durable drop.
   */
  async appendEventWithOutbox(event: RunEvent, outbox?: OutboxRecord): Promise<void> {
    await this.executor.withTransaction(async (tx) => {
      await tx.mutate(
        `insert into agentos_event_log (event_id, payload) values (:event_id, :payload::jsonb)
         on conflict (event_id) do nothing`,
        { event_id: event.eventId, payload: JSON.stringify(event) },
      );
      if (outbox) {
        await tx.mutate(
          `insert into agentos_outbox (outbox_id, payload) values (:outbox_id, :payload::jsonb)
           on conflict (outbox_id) do nothing`,
          { outbox_id: outbox.outboxId, payload: JSON.stringify(outbox) },
        );
      }
    });
  }
  async listEvents(): Promise<RunEvent[]> {
    const rows = await this.executor.read<QueryRow>(
      `select payload from agentos_event_log order by seq asc`,
    );
    return rows.map((row) => row.payload as RunEvent);
  }
  /**
   * Bounded, NEWEST-FIRST page over the append-only log. The `taskId`/`runId`
   * filters and the `LIMIT/OFFSET` run IN the database (jsonb `->>` on the
   * payload) — the edge never pulls the whole log to filter in JS. A companion
   * filtered `count(*)` yields the truthful pagination total.
   */
  async listEventsPage(query: EventsPageQuery): Promise<ListPage<RunEvent>> {
    const clauses: string[] = [];
    const filterParams: Record<string, unknown> = {};
    if (query.taskId) {
      clauses.push(`payload->>'taskId' = :task_id`);
      filterParams.task_id = query.taskId;
    }
    if (query.runId) {
      clauses.push(`payload->>'runId' = :run_id`);
      filterParams.run_id = query.runId;
    }
    const where = clauses.length > 0 ? ` where ${clauses.join(' and ')}` : '';
    const [rows, countRow] = await Promise.all([
      this.executor.read<QueryRow>(
        `select payload from agentos_event_log${where} order by seq desc limit :limit offset :offset`,
        { ...filterParams, limit: query.limit, offset: query.offset } as QueryParams,
      ),
      this.executor.one<QueryRow>(
        `select count(*)::int as count from agentos_event_log${where}`,
        filterParams as QueryParams,
      ),
    ]);
    return {
      items: rows.map((row) => row.payload as RunEvent),
      total: Number(countRow?.count ?? 0),
      limit: query.limit,
      offset: query.offset,
    };
  }
  /** The bounded most-recent event tail for `snapshot()` (ascending order kept). */
  private async listEventsTail(): Promise<RunEvent[]> {
    const rows = await this.executor.read<QueryRow>(
      `select payload from agentos_event_log order by seq desc limit :limit`,
      { limit: SNAPSHOT_EVENTS_TAIL },
    );
    return rows.map((row) => row.payload as RunEvent).reverse();
  }

  // — CloudEvents outbox —
  async appendOutbox(record: OutboxRecord): Promise<OutboxRecord> {
    const inserted = await this.executor.mutate(
      `insert into agentos_outbox (outbox_id, payload) values (:outbox_id, :payload::jsonb)
       on conflict (outbox_id) do nothing`,
      { outbox_id: record.outboxId, payload: JSON.stringify(record) },
    );
    if (inserted > 0) return record;
    // Append is first-write-wins (parity with the in-memory driver): a conflict
    // returns the EXISTING record untouched.
    const existing = await this.executor.one<QueryRow>(
      `select payload from agentos_outbox where outbox_id = :outbox_id`,
      { outbox_id: record.outboxId },
    );
    return (existing?.payload as OutboxRecord | undefined) ?? record;
  }
  async upsertOutbox(record: OutboxRecord): Promise<OutboxRecord> {
    await this.executor.mutate(
      `insert into agentos_outbox (outbox_id, payload) values (:outbox_id, :payload::jsonb)
       on conflict (outbox_id)
       do update set payload = excluded.payload, updated_at = now()`,
      { outbox_id: record.outboxId, payload: JSON.stringify(record) },
    );
    return record;
  }
  async listOutbox(): Promise<OutboxRecord[]> {
    const rows = await this.executor.read<QueryRow>(
      `select payload from agentos_outbox order by seq asc`,
    );
    return rows.map((row) => row.payload as OutboxRecord);
  }

  // — OSS component registry mirror —
  listOssComponents(): Promise<RecoderComponentDescriptor[]> {
    return this.list<RecoderComponentDescriptor>(AGG.ossComponent);
  }
  upsertOssComponent(component: RecoderComponentDescriptor): Promise<RecoderComponentDescriptor> {
    return this.upsert(AGG.ossComponent, component.id, component);
  }
  getOssComponent(componentId: string): Promise<RecoderComponentDescriptor | null> {
    return this.get<RecoderComponentDescriptor>(AGG.ossComponent, componentId);
  }

  // — Workspaces (READ-ONLY cross-domain mirror; conductor owns writes) —
  listWorkspaces(): Promise<Workspace[]> {
    return this.list<Workspace>(AGG.workspace);
  }
  getWorkspace(workspaceId: string): Promise<Workspace | null> {
    return this.get<Workspace>(AGG.workspace, workspaceId);
  }

  // — Generic jsonb document access —
  private async list<T>(aggregate: string): Promise<T[]> {
    const rows = await this.executor.read<QueryRow>(LIST_RECORDS_SQL, { aggregate });
    return rows.map((row) => row.payload as T);
  }

  /**
   * Bounded page over one aggregate. The DB applies the `LIMIT/OFFSET` (never a
   * fetch-all-then-slice), and a companion `count(*)` yields the total so the
   * edge can report truthful pagination `meta`.
   */
  private async listPage<T>(aggregate: string, page: PageQuery): Promise<ListPage<T>> {
    const [rows, countRow] = await Promise.all([
      this.executor.read<QueryRow>(LIST_RECORDS_PAGE_SQL, {
        aggregate,
        limit: page.limit,
        offset: page.offset,
      }),
      this.executor.one<QueryRow>(COUNT_RECORDS_SQL, { aggregate }),
    ]);
    return {
      items: rows.map((row) => row.payload as T),
      total: Number(countRow?.count ?? 0),
      limit: page.limit,
      offset: page.offset,
    };
  }

  private async get<T>(aggregate: string, recordId: string): Promise<T | null> {
    const row = await this.executor.one<QueryRow>(GET_RECORD_SQL, {
      aggregate,
      record_id: recordId,
    });
    return (row?.payload as T | undefined) ?? null;
  }

  private async upsert<T>(aggregate: string, recordId: string, doc: T): Promise<T> {
    await this.executor.mutate(UPSERT_RECORD_SQL, {
      aggregate,
      record_id: recordId,
      payload: JSON.stringify(doc),
    });
    return doc;
  }
}
