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

export type RepositoryResult<T> = T | Promise<T>;

export type AgentOsRepositorySnapshot = {
  agents: AgentProfile[];
  tasks: TaskSpec[];
  runs: TaskRun[];
  approvals: Approval[];
  artifacts: Artifact[];
  runtimeEvidence: RuntimeEvidence[];
  githubDeliveryLinks: GitHubDeliveryLink[];
  workSignals: WorkSignal[];
  memoryItems: MemoryItem[];
  memoryCandidates: MemoryCandidate[];
  instructionBundles: InstructionBundle[];
  policyDecisions: PolicyDecision[];
  workLocks: WorkLock[];
  events: RunEvent[];
  outbox: OutboxRecord[];
  spaces: Space[];
  ossComponents: RecoderComponentDescriptor[];
};

export interface AgentOsRepository {
  snapshot(): RepositoryResult<AgentOsRepositorySnapshot>;
  listSpaces(): RepositoryResult<Space[]>;
  upsertSpace(space: Space): RepositoryResult<Space>;
  listSpacePolicies(): RepositoryResult<Array<SpacePolicy & { spaceId: string }>>;
  upsertSpacePolicy(spaceId: string, policy: SpacePolicy): RepositoryResult<SpacePolicy & { spaceId: string }>;
  listAgents(): RepositoryResult<AgentProfile[]>;
  upsertAgent(agent: AgentProfile): RepositoryResult<AgentProfile>;
  listTasks(): RepositoryResult<TaskSpec[]>;
  upsertTask(task: TaskSpec): RepositoryResult<TaskSpec>;
  listRuns(): RepositoryResult<TaskRun[]>;
  upsertRun(run: TaskRun): RepositoryResult<TaskRun>;
  listApprovals(): RepositoryResult<Approval[]>;
  upsertApproval(approval: Approval): RepositoryResult<Approval>;
  listArtifacts(): RepositoryResult<Artifact[]>;
  upsertArtifact(artifact: Artifact): RepositoryResult<Artifact>;
  listRuntimeEvidence(): RepositoryResult<RuntimeEvidence[]>;
  upsertRuntimeEvidence(evidence: RuntimeEvidence): RepositoryResult<RuntimeEvidence>;
  listGitHubDeliveryLinks(): RepositoryResult<GitHubDeliveryLink[]>;
  upsertGitHubDeliveryLink(link: GitHubDeliveryLink): RepositoryResult<GitHubDeliveryLink>;
  getGitHubDeliveryLink(linkId: string): RepositoryResult<GitHubDeliveryLink | null>;
  listWorkSignals(): RepositoryResult<WorkSignal[]>;
  upsertWorkSignal(signal: WorkSignal): RepositoryResult<WorkSignal>;
  getWorkSignal(signalId: string): RepositoryResult<WorkSignal | null>;
  deleteWorkSignal(signalId: string): RepositoryResult<boolean>;
  listMemoryItems(): RepositoryResult<MemoryItem[]>;
  upsertMemoryItem(memory: MemoryItem): RepositoryResult<MemoryItem>;
  listMemoryCandidates(): RepositoryResult<MemoryCandidate[]>;
  upsertMemoryCandidate(candidate: MemoryCandidate): RepositoryResult<MemoryCandidate>;
  listInstructionBundles(): RepositoryResult<InstructionBundle[]>;
  upsertInstructionBundle(bundle: InstructionBundle): RepositoryResult<InstructionBundle>;
  listPolicyDecisions(): RepositoryResult<PolicyDecision[]>;
  upsertPolicyDecision(decision: PolicyDecision): RepositoryResult<PolicyDecision>;
  listWorkLocks(): RepositoryResult<WorkLock[]>;
  upsertWorkLock(lock: WorkLock): RepositoryResult<WorkLock>;
  replaceWorkLocks(locks: WorkLock[]): RepositoryResult<WorkLock[]>;
  deleteWorkLock(lockId: string): RepositoryResult<boolean>;
  appendEvent(event: RunEvent): RepositoryResult<RunEvent>;
  listEvents(): RepositoryResult<RunEvent[]>;
  appendOutbox(record: OutboxRecord): RepositoryResult<OutboxRecord>;
  upsertOutbox(record: OutboxRecord): RepositoryResult<OutboxRecord>;
  listOutbox(): RepositoryResult<OutboxRecord[]>;
  listOssComponents(): RepositoryResult<RecoderComponentDescriptor[]>;
  upsertOssComponent(component: RecoderComponentDescriptor): RepositoryResult<RecoderComponentDescriptor>;
  getOssComponent(componentId: string): RepositoryResult<RecoderComponentDescriptor | null>;
}
