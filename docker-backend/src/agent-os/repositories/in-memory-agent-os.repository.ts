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
  WorkLock,
  WorkSignal,
} from '@recoder/agent-os';
import type { OutboxRecord } from '@recoder/agent-events';
import type { RecoderComponentDescriptor } from '@recoder/oss-registry';
import type { AgentOsRepository, AgentOsRepositorySnapshot } from './agent-os.repository';

export type AgentOsRecordMap = {
  agents: Map<string, AgentProfile>;
  tasks: Map<string, TaskSpec>;
  runs: Map<string, TaskRun>;
  approvals: Map<string, Approval>;
  artifacts: Map<string, Artifact>;
  runtimeEvidence: Map<string, RuntimeEvidence>;
  githubDeliveryLinks: Map<string, GitHubDeliveryLink>;
  workSignals: Map<string, WorkSignal>;
  memoryItems: Map<string, MemoryItem>;
  memoryCandidates: Map<string, MemoryCandidate>;
  instructionBundles: Map<string, InstructionBundle>;
  policyDecisions: Map<string, PolicyDecision>;
  workLocks: Map<string, WorkLock>;
  events: RunEvent[];
  outbox: OutboxRecord[];
  spaces: Map<string, Space>;
  ossComponents: Map<string, RecoderComponentDescriptor>;
};

export class InMemoryAgentOsRepository implements AgentOsRepository {
  private readonly records: AgentOsRecordMap = {
    agents: new Map(),
    tasks: new Map(),
    runs: new Map(),
    approvals: new Map(),
    artifacts: new Map(),
    runtimeEvidence: new Map(),
    githubDeliveryLinks: new Map(),
    workSignals: new Map(),
    memoryItems: new Map(),
    memoryCandidates: new Map(),
    instructionBundles: new Map(),
    policyDecisions: new Map(),
    workLocks: new Map(),
    events: [],
    outbox: [],
    spaces: new Map(),
    ossComponents: new Map(),
  };

  private onChange: (() => void) | null = null;

  constructor(snapshot?: Partial<AgentOsRepositorySnapshot>) {
    if (snapshot) {
      this.hydrate(snapshot);
    }
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
      workSignals: this.listWorkSignals(),
      memoryItems: this.listMemoryItems(),
      memoryCandidates: this.listMemoryCandidates(),
      instructionBundles: this.listInstructionBundles(),
      policyDecisions: this.listPolicyDecisions(),
      workLocks: this.listWorkLocks(),
      events: this.listEvents(),
      outbox: this.listOutbox(),
      spaces: this.listSpaces(),
      ossComponents: this.listOssComponents(),
    };
  }

  listSpaces(): Space[] {
    return [...this.records.spaces.values()];
  }

  upsertSpace(space: Space): Space {
    this.records.spaces.set(space.spaceId, space);
    this.changed();
    return space;
  }

  listSpacePolicies(): Array<SpacePolicy & { spaceId: string }> {
    return [...this.records.spaces.values()].map((space) => ({
      ...space.policy,
      spaceId: space.spaceId,
    }));
  }

  upsertSpacePolicy(spaceId: string, policy: SpacePolicy): SpacePolicy & { spaceId: string } {
    const space = this.records.spaces.get(spaceId);
    if (!space) {
      throw new Error(`Space not found: ${spaceId}`);
    }
    const updated = {
      ...space,
      policy,
      updatedAt: new Date().toISOString(),
    };
    this.records.spaces.set(spaceId, updated);
    this.changed();
    return { ...policy, spaceId };
  }

  listAgents(): AgentProfile[] {
    return [...this.records.agents.values()];
  }

  upsertAgent(agent: AgentProfile): AgentProfile {
    this.records.agents.set(agent.agentId, agent);
    this.changed();
    return agent;
  }

  listTasks(): TaskSpec[] {
    return [...this.records.tasks.values()];
  }

  upsertTask(task: TaskSpec): TaskSpec {
    this.records.tasks.set(task.taskId, task);
    this.changed();
    return task;
  }

  listRuns(): TaskRun[] {
    return [...this.records.runs.values()];
  }

  upsertRun(run: TaskRun): TaskRun {
    this.records.runs.set(run.runId, run);
    this.changed();
    return run;
  }

  listApprovals(): Approval[] {
    return [...this.records.approvals.values()];
  }

  upsertApproval(approval: Approval): Approval {
    this.records.approvals.set(approval.approvalId, approval);
    this.changed();
    return approval;
  }

  listArtifacts(): Artifact[] {
    return [...this.records.artifacts.values()];
  }

  upsertArtifact(artifact: Artifact): Artifact {
    this.records.artifacts.set(artifact.artifactId, artifact);
    this.changed();
    return artifact;
  }

  listRuntimeEvidence(): RuntimeEvidence[] {
    return [...this.records.runtimeEvidence.values()];
  }

  upsertRuntimeEvidence(evidence: RuntimeEvidence): RuntimeEvidence {
    this.records.runtimeEvidence.set(evidence.evidenceId, evidence);
    this.changed();
    return evidence;
  }

  listGitHubDeliveryLinks(): GitHubDeliveryLink[] {
    return [...this.records.githubDeliveryLinks.values()];
  }

  upsertGitHubDeliveryLink(link: GitHubDeliveryLink): GitHubDeliveryLink {
    this.records.githubDeliveryLinks.set(link.linkId, link);
    this.changed();
    return link;
  }

  getGitHubDeliveryLink(linkId: string): GitHubDeliveryLink | null {
    return this.records.githubDeliveryLinks.get(linkId) ?? null;
  }

  listWorkSignals(): WorkSignal[] {
    return [...this.records.workSignals.values()];
  }

  upsertWorkSignal(signal: WorkSignal): WorkSignal {
    this.records.workSignals.set(signal.signalId, signal);
    this.changed();
    return signal;
  }

  getWorkSignal(signalId: string): WorkSignal | null {
    return this.records.workSignals.get(signalId) ?? null;
  }

  deleteWorkSignal(signalId: string): boolean {
    const deleted = this.records.workSignals.delete(signalId);
    if (deleted) {
      this.changed();
    }
    return deleted;
  }

  listMemoryItems(): MemoryItem[] {
    return [...this.records.memoryItems.values()];
  }

  upsertMemoryItem(memory: MemoryItem): MemoryItem {
    this.records.memoryItems.set(memory.memoryId, memory);
    this.changed();
    return memory;
  }

  listMemoryCandidates(): MemoryCandidate[] {
    return [...this.records.memoryCandidates.values()];
  }

  upsertMemoryCandidate(candidate: MemoryCandidate): MemoryCandidate {
    this.records.memoryCandidates.set(candidate.candidateId, candidate);
    this.changed();
    return candidate;
  }

  listInstructionBundles(): InstructionBundle[] {
    return [...this.records.instructionBundles.values()];
  }

  upsertInstructionBundle(bundle: InstructionBundle): InstructionBundle {
    this.records.instructionBundles.set(bundle.bundleId, bundle);
    this.changed();
    return bundle;
  }

  listPolicyDecisions(): PolicyDecision[] {
    return [...this.records.policyDecisions.values()];
  }

  upsertPolicyDecision(decision: PolicyDecision): PolicyDecision {
    this.records.policyDecisions.set(decision.decisionId, decision);
    this.changed();
    return decision;
  }

  listWorkLocks(): WorkLock[] {
    return [...this.records.workLocks.values()];
  }

  upsertWorkLock(lock: WorkLock): WorkLock {
    this.records.workLocks.set(lock.lockId, lock);
    this.changed();
    return lock;
  }

  replaceWorkLocks(locks: WorkLock[]): WorkLock[] {
    this.records.workLocks.clear();
    for (const lock of locks) {
      this.records.workLocks.set(lock.lockId, lock);
    }
    this.changed();
    return this.listWorkLocks();
  }

  deleteWorkLock(lockId: string): boolean {
    const deleted = this.records.workLocks.delete(lockId);
    if (deleted) {
      this.changed();
    }
    return deleted;
  }

  appendEvent(event: RunEvent): RunEvent {
    this.records.events.push(event);
    this.changed();
    return event;
  }

  listEvents(): RunEvent[] {
    return [...this.records.events];
  }

  appendOutbox(record: OutboxRecord): OutboxRecord {
    const existing = this.records.outbox.find((candidate) => candidate.outboxId === record.outboxId);
    if (existing) {
      return existing;
    }
    this.records.outbox.push(record);
    this.changed();
    return record;
  }

  upsertOutbox(record: OutboxRecord): OutboxRecord {
    const index = this.records.outbox.findIndex((candidate) => candidate.outboxId === record.outboxId);
    if (index >= 0) {
      this.records.outbox[index] = record;
      this.changed();
      return record;
    }
    this.records.outbox.push(record);
    this.changed();
    return record;
  }

  listOutbox(): OutboxRecord[] {
    return [...this.records.outbox];
  }

  listOssComponents(): RecoderComponentDescriptor[] {
    return [...this.records.ossComponents.values()];
  }

  upsertOssComponent(component: RecoderComponentDescriptor): RecoderComponentDescriptor {
    this.records.ossComponents.set(component.id, component);
    this.changed();
    return component;
  }

  getOssComponent(componentId: string): RecoderComponentDescriptor | null {
    return this.records.ossComponents.get(componentId) ?? null;
  }

  private hydrate(snapshot: Partial<AgentOsRepositorySnapshot>): void {
    for (const agent of snapshot.agents ?? []) this.records.agents.set(agent.agentId, agent);
    for (const task of snapshot.tasks ?? []) this.records.tasks.set(task.taskId, task);
    for (const run of snapshot.runs ?? []) this.records.runs.set(run.runId, run);
    for (const approval of snapshot.approvals ?? []) this.records.approvals.set(approval.approvalId, approval);
    for (const artifact of snapshot.artifacts ?? []) this.records.artifacts.set(artifact.artifactId, artifact);
    for (const evidence of snapshot.runtimeEvidence ?? []) this.records.runtimeEvidence.set(evidence.evidenceId, evidence);
    for (const link of snapshot.githubDeliveryLinks ?? []) this.records.githubDeliveryLinks.set(link.linkId, link);
    for (const signal of snapshot.workSignals ?? []) this.records.workSignals.set(signal.signalId, signal);
    for (const memory of snapshot.memoryItems ?? []) this.records.memoryItems.set(memory.memoryId, memory);
    for (const candidate of snapshot.memoryCandidates ?? []) this.records.memoryCandidates.set(candidate.candidateId, candidate);
    for (const bundle of snapshot.instructionBundles ?? []) this.records.instructionBundles.set(bundle.bundleId, bundle);
    for (const decision of snapshot.policyDecisions ?? []) this.records.policyDecisions.set(decision.decisionId, decision);
    for (const lock of snapshot.workLocks ?? []) this.records.workLocks.set(lock.lockId, lock);
    for (const space of snapshot.spaces ?? []) this.records.spaces.set(space.spaceId, space);
    for (const component of snapshot.ossComponents ?? []) this.records.ossComponents.set(component.id, component);
    this.records.events.push(...(snapshot.events ?? []));
    this.records.outbox.push(...(snapshot.outbox ?? []));
  }

  private changed(): void {
    this.onChange?.();
  }
}
