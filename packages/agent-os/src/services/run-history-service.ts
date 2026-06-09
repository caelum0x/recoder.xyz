import type {
  Approval,
  Artifact,
  GitHubDeliveryLink,
  InstructionBundle,
  MemoryCandidate,
  MemoryItem,
  PolicyDecision,
  RunEvent,
  RuntimeEvidence,
  TaskRun,
  TaskSpec,
  WorkLock,
} from '../domain';

export type RunHistoryItemKind =
  | 'run_state'
  | 'run_event'
  | 'artifact'
  | 'runtime_evidence'
  | 'approval'
  | 'policy_decision'
  | 'memory_candidate'
  | 'memory_item'
  | 'instruction_bundle'
  | 'github_delivery_link'
  | 'work_lock';

export type RunHistoryItemSeverity = 'info' | 'success' | 'warning' | 'block';

export type RunHistoryItem = {
  itemId: string;
  kind: RunHistoryItemKind;
  taskId: string;
  runId?: string;
  createdAt: string;
  title: string;
  summary?: string;
  severity: RunHistoryItemSeverity;
  refs?: Record<string, string>;
  data?: Record<string, unknown>;
};

export type BuildRunHistoryInput = {
  run: TaskRun;
  task?: TaskSpec;
  events?: RunEvent[];
  artifacts?: Artifact[];
  runtimeEvidence?: RuntimeEvidence[];
  approvals?: Approval[];
  policyDecisions?: PolicyDecision[];
  memoryCandidates?: MemoryCandidate[];
  memoryItems?: MemoryItem[];
  instructionBundles?: InstructionBundle[];
  githubDeliveryLinks?: GitHubDeliveryLink[];
  workLocks?: WorkLock[];
};

export type RunHistory = {
  run: TaskRun;
  task?: TaskSpec;
  items: RunHistoryItem[];
  counts: {
    events: number;
    artifacts: number;
    runtimeEvidence: number;
    approvals: number;
    policyDecisions: number;
    memoryCandidates: number;
    memoryItems: number;
    instructionBundles: number;
    githubDeliveryLinks: number;
    workLocks: number;
  };
  latest: {
    state: TaskRun['state'];
    updatedAt: string;
    lastEventAt?: string;
    waitingApprovalIds: string[];
    artifactIds: string[];
    previewArtifactIds: string[];
    pullRequestArtifactIds: string[];
    runtimeEvidenceIds: string[];
    githubDeliveryLinkIds: string[];
  };
};

export class RunHistoryService {
  build(input: BuildRunHistoryInput): RunHistory {
    const run = input.run;
    const taskId = run.taskId;
    const artifacts = (input.artifacts ?? []).filter((artifact) => isTaskOrRunLinked(artifact, taskId, run.runId));
    const artifactIds = new Set(artifacts.map((artifact) => artifact.artifactId));
    const runtimeEvidence = (input.runtimeEvidence ?? []).filter((evidence) => isTaskOrRunLinked(evidence, taskId, run.runId));
    const approvals = (input.approvals ?? []).filter((approval) => isTaskOrRunLinked(approval, taskId, run.runId));
    const events = (input.events ?? []).filter((event) => isTaskOrRunLinked(event, taskId, run.runId));
    const policyDecisions = (input.policyDecisions ?? []).filter((decision) => decision.taskId === taskId);
    const memoryCandidates = (input.memoryCandidates ?? []).filter((candidate) => {
      return candidate.evidence.taskId === taskId || artifactIds.has(candidate.evidence.artifactId);
    });
    const memoryItems = (input.memoryItems ?? []).filter((memory) => {
      return memory.evidence.taskId === taskId || artifactIds.has(memory.evidence.artifactId);
    });
    const instructionBundles = (input.instructionBundles ?? []).filter((bundle) => {
      return bundle.taskId === taskId || bundle.bundleId === run.instructionBundleId;
    });
    const githubDeliveryLinks = (input.githubDeliveryLinks ?? []).filter((link) => isTaskOrRunLinked(link, taskId, run.runId));
    const workLocks = (input.workLocks ?? []).filter((lock) => lock.taskId === taskId);

    const items = [
      this.runStateItem(run),
      ...events.map((event) => this.eventItem(event, run.runId)),
      ...artifacts.map((artifact) => this.artifactItem(artifact, run.runId)),
      ...runtimeEvidence.map((evidence) => this.runtimeEvidenceItem(evidence, run.runId)),
      ...approvals.map((approval) => this.approvalItem(approval, run.runId)),
      ...policyDecisions.map((decision) => this.policyDecisionItem(decision, taskId, run.runId)),
      ...memoryCandidates.map((candidate) => this.memoryCandidateItem(candidate, run.runId)),
      ...memoryItems.map((memory) => this.memoryItem(memory, run.runId)),
      ...instructionBundles.map((bundle) => this.instructionBundleItem(bundle, run.runId)),
      ...githubDeliveryLinks.map((link) => this.githubDeliveryLinkItem(link, run.runId)),
      ...workLocks.map((lock) => this.workLockItem(lock, run.runId)),
    ].sort(compareHistoryItems);

    const lastEventAt = items.length > 0 ? items[items.length - 1]?.createdAt : undefined;
    const waitingApprovalIds = approvals
      .filter((approval) => approval.status === 'pending' || approval.status === 'escalated')
      .map((approval) => approval.approvalId);
    const previewArtifactIds = artifacts
      .filter((artifact) => artifact.kind === 'preview')
      .map((artifact) => artifact.artifactId);
    const pullRequestArtifactIds = artifacts
      .filter((artifact) => artifact.kind === 'pull_request')
      .map((artifact) => artifact.artifactId);

    return {
      run,
      task: input.task,
      items,
      counts: {
        events: events.length,
        artifacts: artifacts.length,
        runtimeEvidence: runtimeEvidence.length,
        approvals: approvals.length,
        policyDecisions: policyDecisions.length,
        memoryCandidates: memoryCandidates.length,
        memoryItems: memoryItems.length,
        instructionBundles: instructionBundles.length,
        githubDeliveryLinks: githubDeliveryLinks.length,
        workLocks: workLocks.length,
      },
      latest: {
        state: run.state,
        updatedAt: run.updatedAt,
        lastEventAt,
        waitingApprovalIds,
        artifactIds: artifacts.map((artifact) => artifact.artifactId),
        previewArtifactIds,
        pullRequestArtifactIds,
        runtimeEvidenceIds: runtimeEvidence.map((evidence) => evidence.evidenceId),
        githubDeliveryLinkIds: githubDeliveryLinks.map((link) => link.linkId),
      },
    };
  }

  private runStateItem(run: TaskRun): RunHistoryItem {
    return {
      itemId: `run_state:${run.runId}:${run.updatedAt}`,
      kind: 'run_state',
      taskId: run.taskId,
      runId: run.runId,
      createdAt: run.updatedAt,
      title: `Run state: ${run.state}`,
      severity: stateSeverity(run.state),
      refs: {
        runId: run.runId,
        ...(run.instructionBundleId ? { instructionBundleId: run.instructionBundleId } : {}),
      },
      data: {
        state: run.state,
        assigneeAgentId: run.assigneeAgentId,
        metadata: run.metadata,
      },
    };
  }

  private eventItem(event: RunEvent, fallbackRunId: string): RunHistoryItem {
    return {
      itemId: `event:${event.eventId}`,
      kind: 'run_event',
      taskId: event.taskId,
      runId: event.runId ?? fallbackRunId,
      createdAt: event.createdAt,
      title: `Run event: ${event.type}`,
      summary: event.message,
      severity: eventSeverity(event),
      refs: {
        eventId: event.eventId,
        ...(event.artifactId ? { artifactId: event.artifactId } : {}),
      },
      data: {
        type: event.type,
        state: event.state,
        agentId: event.agentId,
        data: event.data,
      },
    };
  }

  private artifactItem(artifact: Artifact, fallbackRunId: string): RunHistoryItem {
    return {
      itemId: `artifact:${artifact.artifactId}`,
      kind: 'artifact',
      taskId: artifact.taskId,
      runId: artifact.runId ?? fallbackRunId,
      createdAt: artifact.createdAt,
      title: `Artifact: ${artifact.kind}`,
      summary: artifactSummary(artifact),
      severity: artifact.kind === 'verification' && artifact.metadata?.passed === false ? 'block' : 'info',
      refs: {
        artifactId: artifact.artifactId,
        ...(artifact.path ? { path: artifact.path } : {}),
        ...(artifact.metadata?.url && typeof artifact.metadata.url === 'string' ? { url: artifact.metadata.url } : {}),
      },
      data: {
        kind: artifact.kind,
        mimeType: artifact.mimeType,
        public: artifact.public,
        contentHash: artifact.contentHash,
        provenance: artifact.provenance,
        metadata: artifact.metadata,
      },
    };
  }

  private runtimeEvidenceItem(evidence: RuntimeEvidence, fallbackRunId: string): RunHistoryItem {
    return {
      itemId: `runtime_evidence:${evidence.evidenceId}`,
      kind: 'runtime_evidence',
      taskId: evidence.taskId,
      runId: evidence.runId ?? fallbackRunId,
      createdAt: evidence.observedAt,
      title: `Runtime evidence: ${evidence.kind}`,
      summary: evidence.summary ?? evidence.title,
      severity: runtimeEvidenceSeverity(evidence.status),
      refs: {
        evidenceId: evidence.evidenceId,
        ...(evidence.source.runtimeId ? { runtimeId: evidence.source.runtimeId } : {}),
        ...(evidence.source.sandboxId ? { sandboxId: evidence.source.sandboxId } : {}),
        ...(evidence.source.sessionId ? { sessionId: evidence.source.sessionId } : {}),
        ...(evidence.source.url ? { url: evidence.source.url } : {}),
      },
      data: {
        kind: evidence.kind,
        status: evidence.status,
        source: evidence.source,
        artifactIds: evidence.artifactIds,
        metadata: evidence.metadata,
      },
    };
  }

  private approvalItem(approval: Approval, fallbackRunId: string): RunHistoryItem {
    return {
      itemId: `approval:${approval.approvalId}`,
      kind: 'approval',
      taskId: approval.taskId,
      runId: approval.runId ?? fallbackRunId,
      createdAt: approval.decidedAt ?? approval.requestedAt,
      title: `Approval: ${approval.status}`,
      summary: approval.decisionReason ?? approval.reason,
      severity: approvalSeverity(approval.status),
      refs: {
        approvalId: approval.approvalId,
      },
      data: {
        status: approval.status,
        requiredAt: approval.requiredAt,
        requestedBy: approval.requestedBy,
        requestedAt: approval.requestedAt,
        decidedBy: approval.decidedBy,
        decidedAt: approval.decidedAt,
        target: approval.target,
        metadata: approval.metadata,
      },
    };
  }

  private policyDecisionItem(decision: PolicyDecision, taskId: string, runId: string): RunHistoryItem {
    return {
      itemId: `policy:${decision.decisionId}`,
      kind: 'policy_decision',
      taskId,
      runId,
      createdAt: decision.createdAt,
      title: `Policy: ${decision.effect}`,
      summary: decision.reason,
      severity: policySeverity(decision.effect),
      refs: {
        decisionId: decision.decisionId,
        actorAgentId: decision.actorAgentId,
        ...(decision.approval?.gateId ? { approvalGateId: decision.approval.gateId } : {}),
      },
      data: {
        action: decision.action,
        effect: decision.effect,
        approval: decision.approval,
        findings: decision.findings,
      },
    };
  }

  private memoryCandidateItem(candidate: MemoryCandidate, fallbackRunId: string): RunHistoryItem {
    return {
      itemId: `memory_candidate:${candidate.candidateId}`,
      kind: 'memory_candidate',
      taskId: candidate.evidence.taskId,
      runId: fallbackRunId,
      createdAt: candidate.reviewedAt ?? candidate.proposedAt,
      title: `Memory candidate: ${candidate.status}`,
      summary: candidate.title,
      severity: candidate.status === 'rejected' ? 'warning' : candidate.status === 'accepted' ? 'success' : 'info',
      refs: {
        candidateId: candidate.candidateId,
        artifactId: candidate.evidence.artifactId,
      },
      data: {
        scope: candidate.scope,
        body: candidate.body,
        proposedBy: candidate.proposedBy,
        proposedAt: candidate.proposedAt,
        reviewedBy: candidate.reviewedBy,
        reviewedAt: candidate.reviewedAt,
        reviewReason: candidate.reviewReason,
        expiresAt: candidate.expiresAt,
      },
    };
  }

  private memoryItem(memory: MemoryItem, fallbackRunId: string): RunHistoryItem {
    return {
      itemId: `memory_item:${memory.memoryId}`,
      kind: 'memory_item',
      taskId: memory.evidence.taskId,
      runId: fallbackRunId,
      createdAt: memory.createdAt,
      title: `Memory accepted: ${memory.title}`,
      summary: memory.body,
      severity: memory.status === 'active' ? 'success' : 'info',
      refs: {
        memoryId: memory.memoryId,
        artifactId: memory.evidence.artifactId,
      },
      data: {
        scope: memory.scope,
        status: memory.status,
        acceptedBy: memory.acceptedBy,
        expiresAt: memory.expiresAt,
        supersedesMemoryId: memory.supersedesMemoryId,
      },
    };
  }

  private instructionBundleItem(bundle: InstructionBundle, fallbackRunId: string): RunHistoryItem {
    return {
      itemId: `instruction_bundle:${bundle.bundleId}`,
      kind: 'instruction_bundle',
      taskId: bundle.taskId,
      runId: fallbackRunId,
      createdAt: bundle.compiledAt,
      title: `Instruction bundle: ${bundle.runtime}`,
      summary: bundle.sharedGoal,
      severity: 'info',
      refs: {
        bundleId: bundle.bundleId,
        agentId: bundle.agentId,
      },
      data: {
        runtime: bundle.runtime,
        compilerVersion: bundle.compilerVersion,
        sourceRefs: bundle.sourceRefs,
        verificationCommands: bundle.verificationCommands,
        approvalGateIds: bundle.approvalGateIds,
        memoryRefIds: bundle.memoryRefIds,
      },
    };
  }

  private githubDeliveryLinkItem(link: GitHubDeliveryLink, fallbackRunId: string): RunHistoryItem {
    return {
      itemId: `github_delivery:${link.linkId}`,
      kind: 'github_delivery_link',
      taskId: link.taskId,
      runId: link.runId ?? fallbackRunId,
      createdAt: link.updatedAt,
      title: `GitHub delivery: ${link.status}`,
      summary: `${link.repository}#${link.pullRequestNumber ?? link.branch}`,
      severity: githubDeliverySeverity(link.status),
      refs: {
        linkId: link.linkId,
        repository: link.repository,
        branch: link.branch,
        ...(link.pullRequestArtifactId ? { pullRequestArtifactId: link.pullRequestArtifactId } : {}),
        ...(link.pullRequestUrl ? { pullRequestUrl: link.pullRequestUrl } : {}),
        ...(link.issueUrl ? { issueUrl: link.issueUrl } : {}),
      },
      data: {
        repoId: link.repoId,
        baseBranch: link.baseBranch,
        issueNumber: link.issueNumber,
        pullRequestNumber: link.pullRequestNumber,
        previewArtifactIds: link.previewArtifactIds,
        checks: link.checks,
        reviews: link.reviews,
        metadata: link.metadata,
      },
    };
  }

  private workLockItem(lock: WorkLock, fallbackRunId: string): RunHistoryItem {
    return {
      itemId: `work_lock:${lock.lockId}`,
      kind: 'work_lock',
      taskId: lock.taskId,
      runId: fallbackRunId,
      createdAt: lock.acquiredAt,
      title: 'Work lock acquired',
      summary: lock.pathGlob,
      severity: 'info',
      refs: {
        lockId: lock.lockId,
        ownerAgentId: lock.ownerAgentId,
      },
      data: {
        pathGlob: lock.pathGlob,
        repo: lock.repo,
        status: 'active',
        expiresAt: lock.expiresAt,
      },
    };
  }
}

function isTaskOrRunLinked(value: { taskId: string; runId?: string }, taskId: string, runId: string): boolean {
  return value.runId === runId || (!value.runId && value.taskId === taskId);
}

function compareHistoryItems(left: RunHistoryItem, right: RunHistoryItem): number {
  const byTime = left.createdAt.localeCompare(right.createdAt);
  if (byTime !== 0) {
    return byTime;
  }
  return left.itemId.localeCompare(right.itemId);
}

function stateSeverity(state: TaskRun['state']): RunHistoryItemSeverity {
  if (state === 'failed' || state === 'rejected') {
    return 'block';
  }
  if (state === 'waiting_for_approval' || state === 'needs_input') {
    return 'warning';
  }
  if (state === 'completed' || state === 'approved' || state === 'delivered') {
    return 'success';
  }
  return 'info';
}

function eventSeverity(event: RunEvent): RunHistoryItemSeverity {
  if (event.type === 'state_transition' && event.state) {
    return stateSeverity(event.state);
  }
  if (event.type === 'failed') {
    return 'block';
  }
  if (event.type === 'needs_input' || event.type === 'approval_requested') {
    return 'warning';
  }
  if (event.type === 'completed' || event.type === 'verified') {
    return 'success';
  }
  return 'info';
}

function approvalSeverity(status: Approval['status']): RunHistoryItemSeverity {
  if (status === 'rejected' || status === 'expired') {
    return 'block';
  }
  if (status === 'pending' || status === 'escalated') {
    return 'warning';
  }
  return 'success';
}

function policySeverity(effect: PolicyDecision['effect']): RunHistoryItemSeverity {
  if (effect === 'deny') {
    return 'block';
  }
  if (effect === 'needs_approval') {
    return 'warning';
  }
  return 'info';
}

function githubDeliverySeverity(status: GitHubDeliveryLink['status']): RunHistoryItemSeverity {
  if (status === 'checks_failed' || status === 'blocked' || status === 'closed') {
    return 'block';
  }
  if (status === 'checks_pending' || status === 'review_required') {
    return 'warning';
  }
  if (status === 'ready_for_approval' || status === 'merged') {
    return 'success';
  }
  return 'info';
}

function artifactSummary(artifact: Artifact): string | undefined {
  if (artifact.metadata?.url && typeof artifact.metadata.url === 'string') {
    return artifact.metadata.url;
  }
  if (artifact.path) {
    return artifact.path;
  }
  if (artifact.contentHash) {
    return artifact.contentHash;
  }
  return undefined;
}

function runtimeEvidenceSeverity(status: RuntimeEvidence['status']): RunHistoryItemSeverity {
  if (status === 'failed') {
    return 'block';
  }
  if (status === 'warning') {
    return 'warning';
  }
  if (status === 'passed') {
    return 'success';
  }
  return 'info';
}
