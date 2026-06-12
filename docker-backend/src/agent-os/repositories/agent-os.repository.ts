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
  snapshot(): AgentOsRepositorySnapshot;
  listSpaces(): Space[];
  upsertSpace(space: Space): Space;
  listSpacePolicies(): Array<SpacePolicy & { spaceId: string }>;
  upsertSpacePolicy(spaceId: string, policy: SpacePolicy): SpacePolicy & { spaceId: string };
  listAgents(): AgentProfile[];
  upsertAgent(agent: AgentProfile): AgentProfile;
  listTasks(): TaskSpec[];
  upsertTask(task: TaskSpec): TaskSpec;
  listRuns(): TaskRun[];
  upsertRun(run: TaskRun): TaskRun;
  listApprovals(): Approval[];
  upsertApproval(approval: Approval): Approval;
  listArtifacts(): Artifact[];
  upsertArtifact(artifact: Artifact): Artifact;
  listRuntimeEvidence(): RuntimeEvidence[];
  upsertRuntimeEvidence(evidence: RuntimeEvidence): RuntimeEvidence;
  listGitHubDeliveryLinks(): GitHubDeliveryLink[];
  upsertGitHubDeliveryLink(link: GitHubDeliveryLink): GitHubDeliveryLink;
  getGitHubDeliveryLink(linkId: string): GitHubDeliveryLink | null;
  listWorkSignals(): WorkSignal[];
  upsertWorkSignal(signal: WorkSignal): WorkSignal;
  getWorkSignal(signalId: string): WorkSignal | null;
  deleteWorkSignal(signalId: string): boolean;
  listMemoryItems(): MemoryItem[];
  upsertMemoryItem(memory: MemoryItem): MemoryItem;
  listMemoryCandidates(): MemoryCandidate[];
  upsertMemoryCandidate(candidate: MemoryCandidate): MemoryCandidate;
  listInstructionBundles(): InstructionBundle[];
  upsertInstructionBundle(bundle: InstructionBundle): InstructionBundle;
  listPolicyDecisions(): PolicyDecision[];
  upsertPolicyDecision(decision: PolicyDecision): PolicyDecision;
  listWorkLocks(): WorkLock[];
  upsertWorkLock(lock: WorkLock): WorkLock;
  replaceWorkLocks(locks: WorkLock[]): WorkLock[];
  deleteWorkLock(lockId: string): boolean;
  appendEvent(event: RunEvent): RunEvent;
  listEvents(): RunEvent[];
  appendOutbox(record: OutboxRecord): OutboxRecord;
  upsertOutbox(record: OutboxRecord): OutboxRecord;
  listOutbox(): OutboxRecord[];
  listOssComponents(): RecoderComponentDescriptor[];
  upsertOssComponent(component: RecoderComponentDescriptor): RecoderComponentDescriptor;
  getOssComponent(componentId: string): RecoderComponentDescriptor | null;
}
