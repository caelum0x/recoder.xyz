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
} from '@recoder/agent-os';
import type { OutboxRecord } from '@recoder/agent-events';
import type { RecoderComponentDescriptor } from '@recoder/oss-registry';

export type AgentOsRecordMap = {
  agents: Map<string, AgentProfile>;
  tasks: Map<string, TaskSpec>;
  runs: Map<string, TaskRun>;
  approvals: Map<string, Approval>;
  artifacts: Map<string, Artifact>;
  runtimeEvidence: Map<string, RuntimeEvidence>;
  githubDeliveryLinks: Map<string, GitHubDeliveryLink>;
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

export class InMemoryAgentOsRepository {
  private readonly records: AgentOsRecordMap = {
    agents: new Map(),
    tasks: new Map(),
    runs: new Map(),
    approvals: new Map(),
    artifacts: new Map(),
    runtimeEvidence: new Map(),
    githubDeliveryLinks: new Map(),
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

  listSpaces(): Space[] {
    return [...this.records.spaces.values()];
  }

  upsertSpace(space: Space): Space {
    this.records.spaces.set(space.spaceId, space);
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
    return { ...policy, spaceId };
  }

  listAgents(): AgentProfile[] {
    return [...this.records.agents.values()];
  }

  upsertAgent(agent: AgentProfile): AgentProfile {
    this.records.agents.set(agent.agentId, agent);
    return agent;
  }

  listTasks(): TaskSpec[] {
    return [...this.records.tasks.values()];
  }

  upsertTask(task: TaskSpec): TaskSpec {
    this.records.tasks.set(task.taskId, task);
    return task;
  }

  listRuns(): TaskRun[] {
    return [...this.records.runs.values()];
  }

  upsertRun(run: TaskRun): TaskRun {
    this.records.runs.set(run.runId, run);
    return run;
  }

  listApprovals(): Approval[] {
    return [...this.records.approvals.values()];
  }

  upsertApproval(approval: Approval): Approval {
    this.records.approvals.set(approval.approvalId, approval);
    return approval;
  }

  listArtifacts(): Artifact[] {
    return [...this.records.artifacts.values()];
  }

  upsertArtifact(artifact: Artifact): Artifact {
    this.records.artifacts.set(artifact.artifactId, artifact);
    return artifact;
  }

  listRuntimeEvidence(): RuntimeEvidence[] {
    return [...this.records.runtimeEvidence.values()];
  }

  upsertRuntimeEvidence(evidence: RuntimeEvidence): RuntimeEvidence {
    this.records.runtimeEvidence.set(evidence.evidenceId, evidence);
    return evidence;
  }

  listGitHubDeliveryLinks(): GitHubDeliveryLink[] {
    return [...this.records.githubDeliveryLinks.values()];
  }

  upsertGitHubDeliveryLink(link: GitHubDeliveryLink): GitHubDeliveryLink {
    this.records.githubDeliveryLinks.set(link.linkId, link);
    return link;
  }

  getGitHubDeliveryLink(linkId: string): GitHubDeliveryLink | null {
    return this.records.githubDeliveryLinks.get(linkId) ?? null;
  }

  listMemoryItems(): MemoryItem[] {
    return [...this.records.memoryItems.values()];
  }

  upsertMemoryItem(memory: MemoryItem): MemoryItem {
    this.records.memoryItems.set(memory.memoryId, memory);
    return memory;
  }

  listMemoryCandidates(): MemoryCandidate[] {
    return [...this.records.memoryCandidates.values()];
  }

  upsertMemoryCandidate(candidate: MemoryCandidate): MemoryCandidate {
    this.records.memoryCandidates.set(candidate.candidateId, candidate);
    return candidate;
  }

  listInstructionBundles(): InstructionBundle[] {
    return [...this.records.instructionBundles.values()];
  }

  upsertInstructionBundle(bundle: InstructionBundle): InstructionBundle {
    this.records.instructionBundles.set(bundle.bundleId, bundle);
    return bundle;
  }

  listPolicyDecisions(): PolicyDecision[] {
    return [...this.records.policyDecisions.values()];
  }

  upsertPolicyDecision(decision: PolicyDecision): PolicyDecision {
    this.records.policyDecisions.set(decision.decisionId, decision);
    return decision;
  }

  listWorkLocks(): WorkLock[] {
    return [...this.records.workLocks.values()];
  }

  upsertWorkLock(lock: WorkLock): WorkLock {
    this.records.workLocks.set(lock.lockId, lock);
    return lock;
  }

  replaceWorkLocks(locks: WorkLock[]): WorkLock[] {
    this.records.workLocks.clear();
    for (const lock of locks) {
      this.records.workLocks.set(lock.lockId, lock);
    }
    return this.listWorkLocks();
  }

  deleteWorkLock(lockId: string): boolean {
    return this.records.workLocks.delete(lockId);
  }

  appendEvent(event: RunEvent): RunEvent {
    this.records.events.push(event);
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
    return record;
  }

  upsertOutbox(record: OutboxRecord): OutboxRecord {
    const index = this.records.outbox.findIndex((candidate) => candidate.outboxId === record.outboxId);
    if (index >= 0) {
      this.records.outbox[index] = record;
      return record;
    }
    this.records.outbox.push(record);
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
    return component;
  }

  getOssComponent(componentId: string): RecoderComponentDescriptor | null {
    return this.records.ossComponents.get(componentId) ?? null;
  }
}
