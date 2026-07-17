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
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';
import type {
  AgentOsRepositoryPort,
  AgentOsRepositorySnapshot,
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
      this.listPolicyDecisions(), this.listEvents(), this.listOutbox(),
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
  upsertAgent(agent: AgentProfile): Promise<AgentProfile> {
    return this.upsert(AGG.agent, agent.agentId, agent);
  }

  // — Tasks + runs —
  listTasks(): Promise<TaskSpec[]> {
    return this.list<TaskSpec>(AGG.task);
  }
  upsertTask(task: TaskSpec): Promise<TaskSpec> {
    return this.upsert(AGG.task, task.taskId, task);
  }
  listRuns(): Promise<TaskRun[]> {
    return this.list<TaskRun>(AGG.run);
  }
  upsertRun(run: TaskRun): Promise<TaskRun> {
    return this.upsert(AGG.run, run.runId, run);
  }

  // — Approvals (read mirror; authoritative lifecycle is governance's) —
  listApprovals(): Promise<Approval[]> {
    return this.list<Approval>(AGG.approval);
  }
  upsertApproval(approval: Approval): Promise<Approval> {
    return this.upsert(AGG.approval, approval.approvalId, approval);
  }

  // — Artifacts —
  listArtifacts(): Promise<Artifact[]> {
    return this.list<Artifact>(AGG.artifact);
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
  upsertMemoryItem(memory: MemoryItem): Promise<MemoryItem> {
    return this.upsert(AGG.memoryItem, memory.memoryId, memory);
  }
  listMemoryCandidates(): Promise<MemoryCandidate[]> {
    return this.list<MemoryCandidate>(AGG.memoryCandidate);
  }
  upsertMemoryCandidate(candidate: MemoryCandidate): Promise<MemoryCandidate> {
    return this.upsert(AGG.memoryCandidate, candidate.candidateId, candidate);
  }

  // — Instruction bundles —
  listInstructionBundles(): Promise<InstructionBundle[]> {
    return this.list<InstructionBundle>(AGG.instructionBundle);
  }
  upsertInstructionBundle(bundle: InstructionBundle): Promise<InstructionBundle> {
    return this.upsert(AGG.instructionBundle, bundle.bundleId, bundle);
  }

  // — Policy decisions —
  listPolicyDecisions(): Promise<PolicyDecision[]> {
    return this.list<PolicyDecision>(AGG.policyDecision);
  }
  upsertPolicyDecision(decision: PolicyDecision): Promise<PolicyDecision> {
    return this.upsert(AGG.policyDecision, decision.decisionId, decision);
  }

  // — Immutable event log (append-only) —
  async appendEvent(event: RunEvent): Promise<RunEvent> {
    await this.executor.mutate(
      `insert into agentos_event_log (event_id, payload) values (:event_id, :payload::jsonb)`,
      { event_id: event.eventId, payload: JSON.stringify(event) },
    );
    return event;
  }
  async listEvents(): Promise<RunEvent[]> {
    const rows = await this.executor.read<QueryRow>(
      `select payload from agentos_event_log order by seq asc`,
    );
    return rows.map((row) => row.payload as RunEvent);
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
