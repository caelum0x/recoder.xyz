/**
 * `AgentOsRepositoryPort` — the state-of-record CRUD seam every stateful
 * control-plane operation depends on (domain doc §1, §6). The domain services
 * ("business logic") depend ONLY on this port; `domains/persistence` (or the pg
 * adapter here) provides the concrete impl. Three degrade-safe drivers exist:
 * postgres (primary), json-file (dev), in-memory (tests / no-DB degrade).
 *
 * FROZEN CONTRACT — Phase 5a seam. This is the widened, formalized successor to
 * the legacy `AgentOsRepository` interface (`src/agent-os/repositories/
 * agent-os.repository.ts`), carried forward verbatim so the three legacy
 * adapters MOVE behind it without a rewrite. Conductor/interop read-models and
 * the memory domain (Phase 8, `memory_relations` only) compile against it.
 *
 * Boundary rules honored:
 *  - Approvals + work-locks are CEDED to the governance domain (conflicts
 *    #2/#5). This port does NOT own `governance_approvals` / `governance_work_locks`
 *    tables — governance owns them and agent-os consumes the governance ports.
 *    (The legacy `*Approval` / `*WorkLock` methods are intentionally DROPPED here.)
 *  - Conductor workspaces are CEDED to the conductor domain (conflict #4). The
 *    `0002-conductor-workspaces` migration is dropped from agent-os; the
 *    `Workspace` read accessors are retained read-only for cross-domain read
 *    models but the write path lives in conductor.
 *  - All access is app-layer scoped (`WHERE user_id = :user_id` / space
 *    membership) — NO Supabase RLS. Owner scoping is applied in the service
 *    layer and pushed into the adapter via query context, not encoded per-method
 *    here (kept CRUD-shaped for the legacy MOVE).
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

/** Repository methods may run sync (memory/json) or async (postgres) — both are legal. */
export type RepositoryResult<T> = T | Promise<T>;

/**
 * A full read of every state-of-record aggregate this domain owns. Used by the
 * composer to hydrate read models and by `/summary`. Approvals + work-locks are
 * intentionally ABSENT — they live in the governance domain.
 */
export interface AgentOsRepositorySnapshot {
  readonly agents: AgentProfile[];
  readonly tasks: TaskSpec[];
  readonly runs: TaskRun[];
  readonly approvals: Approval[];
  readonly artifacts: Artifact[];
  readonly runtimeEvidence: RuntimeEvidence[];
  readonly githubDeliveryLinks: GitHubDeliveryLink[];
  readonly memoryItems: MemoryItem[];
  readonly memoryCandidates: MemoryCandidate[];
  readonly instructionBundles: InstructionBundle[];
  readonly policyDecisions: PolicyDecision[];
  readonly events: RunEvent[];
  readonly outbox: OutboxRecord[];
  readonly spaces: Space[];
  readonly ossComponents: RecoderComponentDescriptor[];
}

/**
 * The state-of-record CRUD port. One `list*` + `upsert*` pair per aggregate,
 * plus the append-only event log and the CloudEvents outbox. Kept CRUD-shaped so
 * the three legacy repositories MOVE behind it unchanged.
 *
 * NOTE (ceded aggregates): `Approval` accessors are retained read-only for
 * cross-domain read models, but the AUTHORITATIVE approval lifecycle (request/
 * approve/reject + audit) is the governance domain's — writes route through the
 * governance gate, not a bare `upsertApproval`. Work-locks are absent entirely.
 */
export interface AgentOsRepositoryPort {
  /** Full read of every owned aggregate (hydration + `/summary`). */
  snapshot(): RepositoryResult<AgentOsRepositorySnapshot>;

  // — Spaces + space policies —
  listSpaces(): RepositoryResult<Space[]>;
  upsertSpace(space: Space): RepositoryResult<Space>;
  listSpacePolicies(): RepositoryResult<Array<SpacePolicy & { spaceId: string }>>;
  upsertSpacePolicy(
    spaceId: string,
    policy: SpacePolicy,
  ): RepositoryResult<SpacePolicy & { spaceId: string }>;

  // — Agents —
  listAgents(): RepositoryResult<AgentProfile[]>;
  upsertAgent(agent: AgentProfile): RepositoryResult<AgentProfile>;

  // — Tasks + runs —
  listTasks(): RepositoryResult<TaskSpec[]>;
  upsertTask(task: TaskSpec): RepositoryResult<TaskSpec>;
  listRuns(): RepositoryResult<TaskRun[]>;
  upsertRun(run: TaskRun): RepositoryResult<TaskRun>;

  // — Approvals (read-only mirror; authoritative writes route via governance) —
  listApprovals(): RepositoryResult<Approval[]>;
  upsertApproval(approval: Approval): RepositoryResult<Approval>;

  // — Artifacts —
  listArtifacts(): RepositoryResult<Artifact[]>;
  upsertArtifact(artifact: Artifact): RepositoryResult<Artifact>;

  // — Runtime evidence —
  listRuntimeEvidence(): RepositoryResult<RuntimeEvidence[]>;
  upsertRuntimeEvidence(evidence: RuntimeEvidence): RepositoryResult<RuntimeEvidence>;

  // — GitHub delivery links —
  listGitHubDeliveryLinks(): RepositoryResult<GitHubDeliveryLink[]>;
  upsertGitHubDeliveryLink(link: GitHubDeliveryLink): RepositoryResult<GitHubDeliveryLink>;
  getGitHubDeliveryLink(linkId: string): RepositoryResult<GitHubDeliveryLink | null>;

  // — Memory items + candidates (items/candidates owned here; relations owned by memory domain) —
  listMemoryItems(): RepositoryResult<MemoryItem[]>;
  upsertMemoryItem(memory: MemoryItem): RepositoryResult<MemoryItem>;
  listMemoryCandidates(): RepositoryResult<MemoryCandidate[]>;
  upsertMemoryCandidate(candidate: MemoryCandidate): RepositoryResult<MemoryCandidate>;

  // — Instruction bundles —
  listInstructionBundles(): RepositoryResult<InstructionBundle[]>;
  upsertInstructionBundle(bundle: InstructionBundle): RepositoryResult<InstructionBundle>;

  // — Policy decisions —
  listPolicyDecisions(): RepositoryResult<PolicyDecision[]>;
  upsertPolicyDecision(decision: PolicyDecision): RepositoryResult<PolicyDecision>;

  // — Immutable event log (append-only) —
  appendEvent(event: RunEvent): RepositoryResult<RunEvent>;
  listEvents(): RepositoryResult<RunEvent[]>;

  // — CloudEvents outbox (at-least-once delivery spine) —
  appendOutbox(record: OutboxRecord): RepositoryResult<OutboxRecord>;
  upsertOutbox(record: OutboxRecord): RepositoryResult<OutboxRecord>;
  listOutbox(): RepositoryResult<OutboxRecord[]>;

  // — OSS component registry mirror —
  listOssComponents(): RepositoryResult<RecoderComponentDescriptor[]>;
  upsertOssComponent(
    component: RecoderComponentDescriptor,
  ): RepositoryResult<RecoderComponentDescriptor>;
  getOssComponent(componentId: string): RepositoryResult<RecoderComponentDescriptor | null>;

  // — Conductor workspaces (READ-ONLY cross-domain read model; writes owned by conductor) —
  listWorkspaces(): RepositoryResult<Workspace[]>;
  getWorkspace(workspaceId: string): RepositoryResult<Workspace | null>;
}
