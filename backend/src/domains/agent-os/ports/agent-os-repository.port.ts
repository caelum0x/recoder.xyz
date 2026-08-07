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
 * A validated, bounded page request for the (formerly unbounded) `list*` edges.
 * The route boundary fail-fast-validates `limit`/`offset` BEFORE constructing
 * this — the adapter trusts them and pushes a real `LIMIT/OFFSET` to the driver.
 */
export interface PageQuery {
  readonly limit: number;
  readonly offset: number;
}

/** One bounded page of a `list*` aggregate plus the total for pagination meta. */
export interface ListPage<T> {
  readonly items: T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

/**
 * A bounded page request over the append-only RunEvent log. The optional
 * `taskId`/`runId` filters are pushed into the driver (`WHERE` on postgres) —
 * never a full-log scan followed by an in-JS filter. Pages are NEWEST-FIRST
 * (descending append order): the log only grows and every known consumer (the
 * desktop Hub poll) wants the most recent tail.
 */
export interface EventsPageQuery extends PageQuery {
  readonly taskId?: string;
  readonly runId?: string;
}

/**
 * Cap on the RunEvent tail included in {@link AgentOsRepositoryPort.snapshot}.
 * The append-only log grows without bound, so `/summary` hydration carries the
 * most-recent tail (ascending order preserved) instead of the whole log.
 */
export const SNAPSHOT_EVENTS_TAIL = 200;

/**
 * A full read of every state-of-record aggregate this domain owns. Used by the
 * composer to hydrate read models and by `/summary`. Approvals + work-locks are
 * intentionally ABSENT — they live in the governance domain. `events` is the
 * BOUNDED most-recent tail ({@link SNAPSHOT_EVENTS_TAIL}, ascending) — the full
 * append-only log is reachable only via `listEvents`/`listEventsPage`.
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
  /** Bounded page of agents (real `LIMIT/OFFSET`) — the scalable list edge. */
  listAgentsPage(page: PageQuery): RepositoryResult<ListPage<AgentProfile>>;
  upsertAgent(agent: AgentProfile): RepositoryResult<AgentProfile>;

  // — Tasks + runs —
  listTasks(): RepositoryResult<TaskSpec[]>;
  /** Bounded page of tasks (real `LIMIT/OFFSET`) — the scalable list edge. */
  listTasksPage(page: PageQuery): RepositoryResult<ListPage<TaskSpec>>;
  upsertTask(task: TaskSpec): RepositoryResult<TaskSpec>;
  listRuns(): RepositoryResult<TaskRun[]>;
  /** Bounded page of runs (real `LIMIT/OFFSET`) — the scalable list edge. */
  listRunsPage(page: PageQuery): RepositoryResult<ListPage<TaskRun>>;
  upsertRun(run: TaskRun): RepositoryResult<TaskRun>;

  // — Approvals (read-only mirror; authoritative writes route via governance) —
  listApprovals(): RepositoryResult<Approval[]>;
  /** Bounded page of approvals (real `LIMIT/OFFSET`) — the scalable list edge. */
  listApprovalsPage(page: PageQuery): RepositoryResult<ListPage<Approval>>;
  /** O(1) point read (never a list-then-find). `null` when unknown. */
  getApproval(approvalId: string): RepositoryResult<Approval | null>;
  upsertApproval(approval: Approval): RepositoryResult<Approval>;

  // — Artifacts —
  listArtifacts(): RepositoryResult<Artifact[]>;
  /** Bounded page of artifacts (real `LIMIT/OFFSET`) — the scalable list edge. */
  listArtifactsPage(page: PageQuery): RepositoryResult<ListPage<Artifact>>;
  /** O(1) point read (never a list-then-find). `null` when unknown. */
  getArtifact(artifactId: string): RepositoryResult<Artifact | null>;
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
  /** Bounded page of memory items (real `LIMIT/OFFSET`) — the scalable list edge. */
  listMemoryItemsPage(page: PageQuery): RepositoryResult<ListPage<MemoryItem>>;
  upsertMemoryItem(memory: MemoryItem): RepositoryResult<MemoryItem>;
  listMemoryCandidates(): RepositoryResult<MemoryCandidate[]>;
  /** Bounded page of memory candidates (real `LIMIT/OFFSET`) — the scalable list edge. */
  listMemoryCandidatesPage(page: PageQuery): RepositoryResult<ListPage<MemoryCandidate>>;
  upsertMemoryCandidate(candidate: MemoryCandidate): RepositoryResult<MemoryCandidate>;

  // — Instruction bundles —
  listInstructionBundles(): RepositoryResult<InstructionBundle[]>;
  /** Bounded page of instruction bundles (real `LIMIT/OFFSET`) — the scalable list edge. */
  listInstructionBundlesPage(page: PageQuery): RepositoryResult<ListPage<InstructionBundle>>;
  upsertInstructionBundle(bundle: InstructionBundle): RepositoryResult<InstructionBundle>;

  // — Policy decisions —
  listPolicyDecisions(): RepositoryResult<PolicyDecision[]>;
  /** Bounded page of policy decisions (real `LIMIT/OFFSET`) — the scalable list edge. */
  listPolicyDecisionsPage(page: PageQuery): RepositoryResult<ListPage<PolicyDecision>>;
  upsertPolicyDecision(decision: PolicyDecision): RepositoryResult<PolicyDecision>;

  // — Immutable event log (append-only) —
  appendEvent(event: RunEvent): RepositoryResult<RunEvent>;
  /**
   * ATOMIC append: persist the immutable event AND (optionally) its CloudEvents
   * outbox record in ONE transaction — both commit or neither (recoder-kvb2).
   * The ingest idempotency index re-seeds from the event log on restart, so an
   * event that committed while its separate outbox write failed would be
   * permanently skipped (dropped CloudEvent). Writing both atomically closes
   * that durable drop. `outbox` omitted ⇒ event-only (log-only event types).
   */
  appendEventWithOutbox(event: RunEvent, outbox?: OutboxRecord): RepositoryResult<void>;
  listEvents(): RepositoryResult<RunEvent[]>;
  /**
   * Bounded, NEWEST-FIRST page of the append-only log with driver-side
   * `taskId`/`runId` filtering (`WHERE` + `LIMIT/OFFSET` on postgres — never a
   * full-log scan filtered in JS). The scalable read behind `GET /events`.
   */
  listEventsPage(query: EventsPageQuery): RepositoryResult<ListPage<RunEvent>>;

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
