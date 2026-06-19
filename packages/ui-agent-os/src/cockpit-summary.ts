import type {
  AgentProfile,
  Approval,
  Artifact,
  InstructionBundle,
  MemoryCandidate,
  PolicyDecision,
  RuntimeEvidence,
  TaskRun,
  TaskSpec,
  WorkSignal,
  WorkLock,
} from '@recoder/agent-os';
import type {
  ComponentSecurityRisk,
  RecoderComponentDescriptor,
} from '@recoder/oss-registry';

export type AgentOsCockpitInput = {
  agents?: AgentProfile[];
  tasks?: TaskSpec[];
  runs?: TaskRun[];
  instructionBundles?: InstructionBundle[];
  approvals?: Approval[];
  artifacts?: Artifact[];
  runtimeEvidence?: RuntimeEvidence[];
  workSignals?: WorkSignal[];
  memoryCandidates?: MemoryCandidate[];
  policyDecisions?: PolicyDecision[];
  workLocks?: WorkLock[];
  ossComponents?: RecoderComponentDescriptor[];
  securityRisks?: ComponentSecurityRisk[];
  now?: string;
};

export type AgentOsCockpitSummary = {
  generatedAt: string;
  counts: {
    agentsOnline: number;
    agentsTotal: number;
    activeRuns: number;
    waitingApprovals: number;
    artifacts: number;
    runtimeEvidence: number;
    openWorkSignals: number;
    memoryCandidates: number;
    ossComponents: number;
    highRiskComponents: number;
  };
  agents: AgentCockpitCard[];
  runs: RunCockpitCard[];
  approvals: ApprovalCockpitCard[];
  workSignals: WorkSignalCockpitCard[];
  instructionBundles: InstructionCockpitCard[];
  instructionBundleArtifacts: InstructionArtifactCockpitCard[];
  runtimeEvidence: RuntimeEvidenceCockpitCard[];
  deliveryArtifacts: DeliveryArtifactCockpitCard[];
  policyRestrictions: PolicyRestrictionCard[];
  memoryCandidates: MemoryCandidateCard[];
  ossComponents: OssComponentCard[];
};

export type AgentCockpitCard = {
  agentId: string;
  displayName: string;
  runtime: string;
  connectorId: string;
  health: AgentProfile['health'];
  capabilityLabels: string[];
  toolNames: string[];
  activeRunIds: string[];
  lastSeenAt: string;
};

export type RunCockpitCard = {
  runId: string;
  taskId: string;
  title?: string;
  state: TaskRun['state'];
  assigneeAgentId?: string;
  instructionBundleId?: string;
  artifactCount: number;
  runtimeEvidenceCount: number;
  approvalCount: number;
  updatedAt: string;
};

export type ApprovalCockpitCard = {
  approvalId: string;
  taskId: string;
  runId?: string;
  status: Approval['status'];
  reason: string;
  requiredAt: Approval['requiredAt'];
  requestedAt: string;
};

export type WorkSignalCockpitCard = {
  signalId: string;
  taskId: string;
  runId?: string;
  title: string;
  severity: WorkSignal['severity'];
  status: WorkSignal['status'];
  detectedReason: WorkSignal['detectedReason'];
  source: WorkSignal['source'];
  recommendedNextAction: string;
  detectedAt: string;
};

export type InstructionCockpitCard = {
  bundleId: string;
  taskId: string;
  agentId: string;
  runtime: string;
  sourceCount: number;
  memoryRefCount: number;
  verificationCommands: string[];
  forbiddenActions: string[];
  compiledAt: string;
};

export type InstructionArtifactCockpitCard = {
  artifactId: string;
  taskId: string;
  runId?: string;
  bundleId?: string;
  path?: string;
  contentHash?: string;
  createdAt: string;
  createdBy: string;
  compilerVersion?: string;
  runtime?: string;
  sourceCount?: number;
  memoryRefCount?: number;
  approvalGateCount?: number;
};

export type RuntimeEvidenceCockpitCard = {
  evidenceId: string;
  taskId: string;
  runId?: string;
  kind: RuntimeEvidence['kind'];
  status: RuntimeEvidence['status'];
  title: string;
  summary?: string;
  observedAt: string;
  runtimeId?: string;
  adapterId?: string;
  sandboxId?: string;
  sessionId?: string;
  command?: string;
  url?: string;
  artifactIds: string[];
};

export type DeliveryArtifactCockpitCard = {
  artifactId: string;
  taskId: string;
  runId?: string;
  kind: 'pull_request' | 'preview' | 'verification';
  url?: string;
  title?: string;
  repository?: string;
  branch?: string;
  number?: string | number;
  provider?: string;
  environment?: string;
  passed?: boolean;
  createdAt: string;
  createdBy: string;
};

export type PolicyRestrictionCard = {
  source: 'agent' | 'instruction' | 'policy_decision' | 'work_lock';
  severity: 'info' | 'warning' | 'block';
  label: string;
  detail?: string;
  taskId?: string;
  agentId?: string;
};

export type MemoryCandidateCard = {
  candidateId: string;
  scope: MemoryCandidate['scope'];
  title: string;
  status: MemoryCandidate['status'];
  taskId: string;
  artifactId: string;
  proposedAt: string;
};

export type OssComponentCard = {
  componentId: string;
  name: string;
  contract: string;
  owner?: string;
  status: RecoderComponentDescriptor['status'];
  risk?: ComponentSecurityRisk['risk'];
  canExecuteCode: boolean;
  canTouchProduction: boolean;
};

const ACTIVE_RUN_STATES: TaskRun['state'][] = [
  'created',
  'compiled',
  'routed',
  'claimed',
  'running',
  'needs_input',
  'verifying',
  'waiting_for_approval',
  'approved',
  'delivered',
];

export function buildAgentOsCockpitSummary(
  input: AgentOsCockpitInput
): AgentOsCockpitSummary {
  const agents = input.agents ?? [];
  const tasks = input.tasks ?? [];
  const runs = input.runs ?? [];
  const approvals = input.approvals ?? [];
  const artifacts = input.artifacts ?? [];
  const runtimeEvidence = input.runtimeEvidence ?? [];
  const workSignals = input.workSignals ?? [];
  const instructionBundles = input.instructionBundles ?? [];
  const memoryCandidates = input.memoryCandidates ?? [];
  const ossComponents = input.ossComponents ?? [];
  const securityRisks = input.securityRisks ?? [];
  const policyRestrictions = buildPolicyRestrictions(input);

  return {
    generatedAt: input.now ?? new Date().toISOString(),
    counts: {
      agentsOnline: agents.filter(
        agent =>
          agent.health.status === 'healthy' ||
          agent.health.status === 'degraded'
      ).length,
      agentsTotal: agents.length,
      activeRuns: runs.filter(run => ACTIVE_RUN_STATES.includes(run.state))
        .length,
      waitingApprovals: approvals.filter(
        approval =>
          approval.status === 'pending' || approval.status === 'escalated'
      ).length,
      artifacts: artifacts.length,
      runtimeEvidence: runtimeEvidence.length,
      openWorkSignals: workSignals.filter(signal => signal.status === 'open')
        .length,
      memoryCandidates: memoryCandidates.length,
      ossComponents: ossComponents.length,
      highRiskComponents: securityRisks.filter(risk => risk.risk === 'high')
        .length,
    },
    agents: agents.map(agent => ({
      agentId: agent.agentId,
      displayName: agent.displayName,
      runtime: agent.vendorSurface,
      connectorId: agent.connectorId,
      health: agent.health,
      capabilityLabels: agent.capabilities.map(capability => capability.label),
      toolNames: agent.tools.map(tool => tool.toolName),
      activeRunIds: runs
        .filter(
          run =>
            run.assigneeAgentId === agent.agentId &&
            ACTIVE_RUN_STATES.includes(run.state)
        )
        .map(run => run.runId),
      lastSeenAt: agent.lastSeenAt,
    })),
    runs: runs.map(run => ({
      runId: run.runId,
      taskId: run.taskId,
      title: tasks.find(task => task.taskId === run.taskId)?.title,
      state: run.state,
      assigneeAgentId: run.assigneeAgentId,
      instructionBundleId: run.instructionBundleId,
      artifactCount: artifacts.filter(
        artifact =>
          artifact.runId === run.runId || artifact.taskId === run.taskId
      ).length,
      runtimeEvidenceCount: runtimeEvidence.filter(
        evidence =>
          evidence.runId === run.runId || evidence.taskId === run.taskId
      ).length,
      approvalCount: approvals.filter(
        approval =>
          approval.runId === run.runId || approval.taskId === run.taskId
      ).length,
      updatedAt: run.updatedAt,
    })),
    approvals: approvals.map(approval => ({
      approvalId: approval.approvalId,
      taskId: approval.taskId,
      runId: approval.runId,
      status: approval.status,
      reason: approval.reason,
      requiredAt: approval.requiredAt,
      requestedAt: approval.requestedAt,
    })),
    workSignals: workSignals.map(signal => ({
      signalId: signal.signalId,
      taskId: signal.taskId,
      runId: signal.runId,
      title: signal.title,
      severity: signal.severity,
      status: signal.status,
      detectedReason: signal.detectedReason,
      source: signal.source,
      recommendedNextAction: signal.recommendedNextAction,
      detectedAt: signal.detectedAt,
    })),
    instructionBundles: instructionBundles.map(bundle => ({
      bundleId: bundle.bundleId,
      taskId: bundle.taskId,
      agentId: bundle.agentId,
      runtime: bundle.runtime,
      sourceCount: bundle.sourceRefs.length,
      memoryRefCount: bundle.memoryRefIds.length,
      verificationCommands: bundle.verificationCommands,
      forbiddenActions: bundle.forbiddenActions,
      compiledAt: bundle.compiledAt,
    })),
    instructionBundleArtifacts: artifacts
      .filter(artifact => artifact.kind === 'instruction_bundle')
      .map(artifact => ({
        artifactId: artifact.artifactId,
        taskId: artifact.taskId,
        runId: artifact.runId,
        bundleId: optionalStringMetadata(artifact.metadata, 'bundleId'),
        path: artifact.path,
        contentHash: artifact.contentHash,
        createdAt: artifact.createdAt,
        createdBy: artifact.createdBy,
        compilerVersion: optionalStringMetadata(
          artifact.metadata,
          'compilerVersion'
        ),
        runtime: optionalStringMetadata(artifact.metadata, 'runtime'),
        sourceCount: optionalNumberMetadata(artifact.metadata, 'sourceCount'),
        memoryRefCount: optionalNumberMetadata(
          artifact.metadata,
          'memoryRefCount'
        ),
        approvalGateCount: optionalNumberMetadata(
          artifact.metadata,
          'approvalGateCount'
        ),
      })),
    runtimeEvidence: runtimeEvidence.map(evidence => ({
      evidenceId: evidence.evidenceId,
      taskId: evidence.taskId,
      runId: evidence.runId,
      kind: evidence.kind,
      status: evidence.status,
      title: evidence.title,
      summary: evidence.summary,
      observedAt: evidence.observedAt,
      runtimeId: evidence.source.runtimeId,
      adapterId: evidence.source.adapterId,
      sandboxId: evidence.source.sandboxId,
      sessionId: evidence.source.sessionId,
      command: evidence.source.command,
      url: evidence.source.url,
      artifactIds: evidence.artifactIds,
    })),
    deliveryArtifacts: artifacts
      .filter(
        (artifact): artifact is Artifact & {
          kind: 'pull_request' | 'preview' | 'verification';
        } =>
          artifact.kind === 'pull_request' ||
          artifact.kind === 'preview' ||
          artifact.kind === 'verification'
      )
      .map(artifact => ({
        artifactId: artifact.artifactId,
        taskId: artifact.taskId,
        runId: artifact.runId,
        kind: artifact.kind,
        url: optionalStringMetadata(artifact.metadata, 'url'),
        title: optionalStringMetadata(artifact.metadata, 'title'),
        repository: optionalStringMetadata(artifact.metadata, 'repository'),
        branch: optionalStringMetadata(artifact.metadata, 'branch'),
        number: optionalStringOrNumberMetadata(artifact.metadata, 'number'),
        provider: optionalStringMetadata(artifact.metadata, 'provider'),
        environment: optionalStringMetadata(artifact.metadata, 'environment'),
        passed: optionalBooleanMetadata(artifact.metadata, 'passed'),
        createdAt: artifact.createdAt,
        createdBy: artifact.createdBy,
      })),
    policyRestrictions,
    memoryCandidates: memoryCandidates.map(candidate => ({
      candidateId: candidate.candidateId,
      scope: candidate.scope,
      title: candidate.title,
      status: candidate.status,
      taskId: candidate.evidence.taskId,
      artifactId: candidate.evidence.artifactId,
      proposedAt: candidate.proposedAt,
    })),
    ossComponents: ossComponents.map(component => {
      const risk = securityRisks.find(
        item => item.componentId === component.id
      );
      return {
        componentId: component.id,
        name: component.name,
        contract: component.contract,
        owner: component.owner,
        status: component.status,
        risk: risk?.risk,
        canExecuteCode: component.security.canExecuteCode,
        canTouchProduction: component.security.canTouchProduction,
      };
    }),
  };
}

function optionalStringMetadata(
  metadata: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalNumberMetadata(
  metadata: Record<string, unknown> | undefined,
  key: string
): number | undefined {
  const value = metadata?.[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function optionalStringOrNumberMetadata(
  metadata: Record<string, unknown> | undefined,
  key: string
): string | number | undefined {
  const value = metadata?.[key];
  return (typeof value === 'string' && value.length > 0) ||
    (typeof value === 'number' && Number.isFinite(value))
    ? value
    : undefined;
}

function optionalBooleanMetadata(
  metadata: Record<string, unknown> | undefined,
  key: string
): boolean | undefined {
  const value = metadata?.[key];
  return typeof value === 'boolean' ? value : undefined;
}

function buildPolicyRestrictions(
  input: AgentOsCockpitInput
): PolicyRestrictionCard[] {
  const agentRestrictions = (input.agents ?? []).flatMap(agent => [
    ...agent.permissions.pathRules
      .filter(rule => rule.effect === 'deny' || rule.requiresApproval)
      .map(rule => ({
        source: 'agent' as const,
        severity:
          rule.effect === 'deny' ? ('block' as const) : ('warning' as const),
        agentId: agent.agentId,
        label: rule.glob,
        detail: rule.reason,
      })),
    ...agent.permissions.toolRules
      .filter(rule => rule.effect === 'deny' || rule.requiresApproval)
      .map(rule => ({
        source: 'agent' as const,
        severity:
          rule.effect === 'deny' ? ('block' as const) : ('warning' as const),
        agentId: agent.agentId,
        label: rule.toolName,
        detail: rule.reason,
      })),
  ]);

  const bundleRestrictions = (input.instructionBundles ?? []).flatMap(bundle =>
    bundle.forbiddenActions.map(action => ({
      source: 'instruction' as const,
      severity: 'warning' as const,
      agentId: bundle.agentId,
      taskId: bundle.taskId,
      label: action,
      detail: `Instruction bundle ${bundle.bundleId}`,
    }))
  );

  const decisions = (input.policyDecisions ?? []).map(decision => ({
    source: 'policy_decision' as const,
    severity:
      decision.effect === 'deny'
        ? ('block' as const)
        : decision.effect === 'needs_approval'
          ? ('warning' as const)
          : ('info' as const),
    agentId: decision.actorAgentId,
    taskId: decision.taskId,
    label: decision.action,
    detail: decision.reason,
  }));

  const locks = (input.workLocks ?? []).map(lock => ({
    source: 'work_lock' as const,
    severity: 'info' as const,
    agentId: lock.ownerAgentId,
    taskId: lock.taskId,
    label: lock.pathGlob,
    detail: `Locked until ${lock.expiresAt}`,
  }));

  return [...agentRestrictions, ...bundleRestrictions, ...decisions, ...locks];
}
