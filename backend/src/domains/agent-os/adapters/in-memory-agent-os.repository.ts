/**
 * `InMemoryAgentOsRepository` — the zero-dependency driver behind
 * {@link AgentOsRepositoryPort}. Backs tests and the no-DB degrade path (domain
 * doc §1, §8). Ported from the legacy `src/agent-os/repositories/
 * in-memory-agent-os.repository.ts`, TRIMMED to the frozen port: the
 * `*WorkLock` / `*WorkSignal` accessors and `upsertWorkspace` are DROPPED
 * (ceded to governance / conductor). `Workspace` stays a READ-ONLY hydrate seam.
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
import {
  SNAPSHOT_EVENTS_TAIL,
  type AgentOsRepositoryPort,
  type AgentOsRepositorySnapshot,
  type EventsPageQuery,
  type ListPage,
  type PageQuery,
} from '../ports/agent-os-repository.port.js';

/** Apply a validated `{ limit, offset }` bound over an ordered collection. */
function pageOf<T>(all: readonly T[], page: PageQuery): ListPage<T> {
  return {
    items: all.slice(page.offset, page.offset + page.limit),
    total: all.length,
    limit: page.limit,
    offset: page.offset,
  };
}

/** Optional read-only workspace hydration (conductor is the write-owner). */
export type InMemorySeed = Partial<AgentOsRepositorySnapshot> & {
  readonly workspaces?: readonly Workspace[];
};

export class InMemoryAgentOsRepository implements AgentOsRepositoryPort {
  private readonly agents = new Map<string, AgentProfile>();
  private readonly tasks = new Map<string, TaskSpec>();
  private readonly runs = new Map<string, TaskRun>();
  private readonly approvals = new Map<string, Approval>();
  private readonly artifacts = new Map<string, Artifact>();
  private readonly runtimeEvidence = new Map<string, RuntimeEvidence>();
  private readonly githubDeliveryLinks = new Map<string, GitHubDeliveryLink>();
  private readonly memoryItems = new Map<string, MemoryItem>();
  private readonly memoryCandidates = new Map<string, MemoryCandidate>();
  private readonly instructionBundles = new Map<string, InstructionBundle>();
  private readonly policyDecisions = new Map<string, PolicyDecision>();
  private readonly ossComponents = new Map<string, RecoderComponentDescriptor>();
  private readonly workspaces = new Map<string, Workspace>();
  private readonly spaces = new Map<string, Space>();
  private readonly events: RunEvent[] = [];
  private readonly outbox: OutboxRecord[] = [];

  private onChange: (() => void) | null = null;

  constructor(seed?: InMemorySeed) {
    if (seed) this.hydrate(seed);
  }

  setChangeHandler(onChange: (() => void) | null): void {
    this.onChange = onChange;
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
      // Bounded most-recent tail (parity with the postgres driver's capped read).
      events: this.events.slice(-SNAPSHOT_EVENTS_TAIL),
      outbox: this.listOutbox(),
      spaces: this.listSpaces(),
      ossComponents: this.listOssComponents(),
    };
  }

  // — Spaces + policies —
  listSpaces(): Space[] {
    return [...this.spaces.values()];
  }
  upsertSpace(space: Space): Space {
    this.spaces.set(space.spaceId, space);
    this.changed();
    return space;
  }
  listSpacePolicies(): Array<SpacePolicy & { spaceId: string }> {
    return [...this.spaces.values()].map((space) => ({ ...space.policy, spaceId: space.spaceId }));
  }
  upsertSpacePolicy(spaceId: string, policy: SpacePolicy): SpacePolicy & { spaceId: string } {
    const space = this.spaces.get(spaceId);
    if (!space) throw new Error(`Space not found: ${spaceId}`);
    this.spaces.set(spaceId, { ...space, policy, updatedAt: new Date().toISOString() });
    this.changed();
    return { ...policy, spaceId };
  }

  // — Agents —
  listAgents(): AgentProfile[] {
    return [...this.agents.values()];
  }
  listAgentsPage(page: PageQuery): ListPage<AgentProfile> {
    return pageOf([...this.agents.values()], page);
  }
  upsertAgent(agent: AgentProfile): AgentProfile {
    this.agents.set(agent.agentId, agent);
    this.changed();
    return agent;
  }

  // — Tasks + runs —
  listTasks(): TaskSpec[] {
    return [...this.tasks.values()];
  }
  listTasksPage(page: PageQuery): ListPage<TaskSpec> {
    return pageOf([...this.tasks.values()], page);
  }
  upsertTask(task: TaskSpec): TaskSpec {
    this.tasks.set(task.taskId, task);
    this.changed();
    return task;
  }
  listRuns(): TaskRun[] {
    return [...this.runs.values()];
  }
  listRunsPage(page: PageQuery): ListPage<TaskRun> {
    return pageOf([...this.runs.values()], page);
  }
  upsertRun(run: TaskRun): TaskRun {
    this.runs.set(run.runId, run);
    this.changed();
    return run;
  }

  // — Approvals (read mirror) —
  listApprovals(): Approval[] {
    return [...this.approvals.values()];
  }
  listApprovalsPage(page: PageQuery): ListPage<Approval> {
    return pageOf([...this.approvals.values()], page);
  }
  getApproval(approvalId: string): Approval | null {
    return this.approvals.get(approvalId) ?? null;
  }
  upsertApproval(approval: Approval): Approval {
    this.approvals.set(approval.approvalId, approval);
    this.changed();
    return approval;
  }

  // — Artifacts —
  listArtifacts(): Artifact[] {
    return [...this.artifacts.values()];
  }
  listArtifactsPage(page: PageQuery): ListPage<Artifact> {
    return pageOf([...this.artifacts.values()], page);
  }
  getArtifact(artifactId: string): Artifact | null {
    return this.artifacts.get(artifactId) ?? null;
  }
  upsertArtifact(artifact: Artifact): Artifact {
    this.artifacts.set(artifact.artifactId, artifact);
    this.changed();
    return artifact;
  }

  // — Runtime evidence —
  listRuntimeEvidence(): RuntimeEvidence[] {
    return [...this.runtimeEvidence.values()];
  }
  upsertRuntimeEvidence(evidence: RuntimeEvidence): RuntimeEvidence {
    this.runtimeEvidence.set(evidence.evidenceId, evidence);
    this.changed();
    return evidence;
  }

  // — GitHub delivery links —
  listGitHubDeliveryLinks(): GitHubDeliveryLink[] {
    return [...this.githubDeliveryLinks.values()];
  }
  upsertGitHubDeliveryLink(link: GitHubDeliveryLink): GitHubDeliveryLink {
    this.githubDeliveryLinks.set(link.linkId, link);
    this.changed();
    return link;
  }
  getGitHubDeliveryLink(linkId: string): GitHubDeliveryLink | null {
    return this.githubDeliveryLinks.get(linkId) ?? null;
  }

  // — Memory —
  listMemoryItems(): MemoryItem[] {
    return [...this.memoryItems.values()];
  }
  listMemoryItemsPage(page: PageQuery): ListPage<MemoryItem> {
    return pageOf([...this.memoryItems.values()], page);
  }
  upsertMemoryItem(memory: MemoryItem): MemoryItem {
    this.memoryItems.set(memory.memoryId, memory);
    this.changed();
    return memory;
  }
  listMemoryCandidates(): MemoryCandidate[] {
    return [...this.memoryCandidates.values()];
  }
  listMemoryCandidatesPage(page: PageQuery): ListPage<MemoryCandidate> {
    return pageOf([...this.memoryCandidates.values()], page);
  }
  upsertMemoryCandidate(candidate: MemoryCandidate): MemoryCandidate {
    this.memoryCandidates.set(candidate.candidateId, candidate);
    this.changed();
    return candidate;
  }

  // — Instruction bundles —
  listInstructionBundles(): InstructionBundle[] {
    return [...this.instructionBundles.values()];
  }
  listInstructionBundlesPage(page: PageQuery): ListPage<InstructionBundle> {
    return pageOf([...this.instructionBundles.values()], page);
  }
  upsertInstructionBundle(bundle: InstructionBundle): InstructionBundle {
    this.instructionBundles.set(bundle.bundleId, bundle);
    this.changed();
    return bundle;
  }

  // — Policy decisions —
  listPolicyDecisions(): PolicyDecision[] {
    return [...this.policyDecisions.values()];
  }
  listPolicyDecisionsPage(page: PageQuery): ListPage<PolicyDecision> {
    return pageOf([...this.policyDecisions.values()], page);
  }
  upsertPolicyDecision(decision: PolicyDecision): PolicyDecision {
    this.policyDecisions.set(decision.decisionId, decision);
    this.changed();
    return decision;
  }

  // — Event log —
  appendEvent(event: RunEvent): RunEvent {
    // Idempotent by eventId (parity with the postgres driver's
    // `on conflict (event_id) do nothing`, recoder-4euj): a re-emit of the same
    // deterministic terminal event is a no-op, never a duplicate row.
    if (this.events.some((e) => e.eventId === event.eventId)) return event;
    this.events.push(event);
    this.changed();
    return event;
  }
  listEvents(): RunEvent[] {
    return [...this.events];
  }
  /** Bounded, NEWEST-FIRST filtered page (postgres-driver parity). */
  listEventsPage(query: EventsPageQuery): ListPage<RunEvent> {
    const filtered = this.events.filter(
      (e) =>
        (!query.taskId || e.taskId === query.taskId) &&
        (!query.runId || e.runId === query.runId),
    );
    return pageOf([...filtered].reverse(), { limit: query.limit, offset: query.offset });
  }

  // — Outbox —
  appendOutbox(record: OutboxRecord): OutboxRecord {
    const existing = this.outbox.find((r) => r.outboxId === record.outboxId);
    if (existing) return existing;
    this.outbox.push(record);
    this.changed();
    return record;
  }
  upsertOutbox(record: OutboxRecord): OutboxRecord {
    const index = this.outbox.findIndex((r) => r.outboxId === record.outboxId);
    if (index >= 0) this.outbox[index] = record;
    else this.outbox.push(record);
    this.changed();
    return record;
  }
  listOutbox(): OutboxRecord[] {
    return [...this.outbox];
  }

  // — OSS components —
  listOssComponents(): RecoderComponentDescriptor[] {
    return [...this.ossComponents.values()];
  }
  upsertOssComponent(component: RecoderComponentDescriptor): RecoderComponentDescriptor {
    this.ossComponents.set(component.id, component);
    this.changed();
    return component;
  }
  getOssComponent(componentId: string): RecoderComponentDescriptor | null {
    return this.ossComponents.get(componentId) ?? null;
  }

  // — Workspaces (READ-ONLY cross-domain read model) —
  listWorkspaces(): Workspace[] {
    return [...this.workspaces.values()];
  }
  getWorkspace(workspaceId: string): Workspace | null {
    return this.workspaces.get(workspaceId) ?? null;
  }

  private hydrate(seed: InMemorySeed): void {
    for (const agent of seed.agents ?? []) this.agents.set(agent.agentId, agent);
    for (const task of seed.tasks ?? []) this.tasks.set(task.taskId, task);
    for (const run of seed.runs ?? []) this.runs.set(run.runId, run);
    for (const approval of seed.approvals ?? []) this.approvals.set(approval.approvalId, approval);
    for (const artifact of seed.artifacts ?? []) this.artifacts.set(artifact.artifactId, artifact);
    for (const ev of seed.runtimeEvidence ?? []) this.runtimeEvidence.set(ev.evidenceId, ev);
    for (const link of seed.githubDeliveryLinks ?? []) this.githubDeliveryLinks.set(link.linkId, link);
    for (const m of seed.memoryItems ?? []) this.memoryItems.set(m.memoryId, m);
    for (const c of seed.memoryCandidates ?? []) this.memoryCandidates.set(c.candidateId, c);
    for (const b of seed.instructionBundles ?? []) this.instructionBundles.set(b.bundleId, b);
    for (const d of seed.policyDecisions ?? []) this.policyDecisions.set(d.decisionId, d);
    for (const s of seed.spaces ?? []) this.spaces.set(s.spaceId, s);
    for (const c of seed.ossComponents ?? []) this.ossComponents.set(c.id, c);
    for (const w of seed.workspaces ?? []) this.workspaces.set(w.workspaceId, w);
    this.events.push(...(seed.events ?? []));
    this.outbox.push(...(seed.outbox ?? []));
  }

  private changed(): void {
    this.onChange?.();
  }
}
