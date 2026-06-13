import { Router } from 'express';
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
  TaskRunState,
  TaskSpec,
  WorkSignal,
  WorkLock,
} from '@recoder/agent-os';
import {
  AgentProfileReconciliationService,
  ApprovalService,
  ArtifactService,
  GitHubDeliveryService,
  isAllowedTaskRunTransition,
  MemoryService,
  RuntimeEvidenceService,
  RunService,
  RunHistoryService,
  TaskRoutingService,
  transitionTaskRun,
  WorkSignalService,
  WorkLockService,
} from '@recoder/agent-os';
import {
  compileAgentOsInstructionBundle,
  type CompileAgentOsInstructionBundleInput,
} from '@recoder/agent-instructions/agent-os-compiler';
import {
  createOutboxRecord,
  mapApprovalToCloudEvent,
  mapArtifactToCloudEvent,
  mapMemoryCandidateToCloudEvent,
  mapMemoryItemAcceptedToCloudEvent,
  mapRuntimeEvidenceToCloudEvent,
  mapRunEventToCloudEvent,
  mapTaskCreatedToCloudEvent,
  mapTaskRunStateToCloudEvent,
  mapWorkSignalToCloudEvent,
  type OutboxRecord,
} from '@recoder/agent-events';
import {
  createRecoderComponentRegistry,
  type RecoderComponentDescriptor,
} from '@recoder/oss-registry';
import { buildAgentOsCockpitSummary } from '@recoder/ui-agent-os';

export type AgentOsGatewayState = {
  agents: Map<string, AgentProfile>;
  spaces: Map<string, Space>;
  tasks: Map<string, TaskSpec>;
  runs: Map<string, TaskRun>;
  artifacts: Map<string, Artifact>;
  runtimeEvidence: Map<string, RuntimeEvidence>;
  githubDeliveryLinks: Map<string, GitHubDeliveryLink>;
  workSignals: Map<string, WorkSignal>;
  approvals: Map<string, Approval>;
  memoryItems: Map<string, MemoryItem>;
  memoryCandidates: Map<string, MemoryCandidate>;
  instructionBundles: Map<string, InstructionBundle>;
  policyDecisions: Map<string, PolicyDecision>;
  workLocks: Map<string, WorkLock>;
  events: RunEvent[];
  outbox: OutboxRecord<unknown>[];
  ossComponents: Map<string, RecoderComponentDescriptor>;
};

export function createAgentOsGatewayState(): AgentOsGatewayState {
  return {
    agents: new Map(),
    spaces: new Map(),
    tasks: new Map(),
    runs: new Map(),
    artifacts: new Map(),
    runtimeEvidence: new Map(),
    githubDeliveryLinks: new Map(),
    workSignals: new Map(),
    approvals: new Map(),
    memoryItems: new Map(),
    memoryCandidates: new Map(),
    instructionBundles: new Map(),
    policyDecisions: new Map(),
    workLocks: new Map(),
    events: [],
    outbox: [],
    ossComponents: new Map(),
  };
}

export function createAgentOsResourceRouter(
  state: AgentOsGatewayState = createAgentOsGatewayState(),
): Router {
  const router = Router();
  const locks = new WorkLockService();
  const agentProfiles = new AgentProfileReconciliationService();
  const approvalService = new ApprovalService();
  const artifacts = new ArtifactService();
  const runtimeEvidence = new RuntimeEvidenceService();
  const githubDelivery = new GitHubDeliveryService();
  const history = new RunHistoryService();
  const memory = new MemoryService();
  const runs = new RunService();
  const routing = new TaskRoutingService();
  const workSignals = new WorkSignalService();

  router.get('/summary', (_req, res) => {
    const registry = createRecoderComponentRegistry(list(state.ossComponents));
    res.json(ok(buildAgentOsCockpitSummary({
      agents: list(state.agents),
      tasks: list(state.tasks),
      runs: list(state.runs),
      instructionBundles: list(state.instructionBundles),
      approvals: list(state.approvals),
      artifacts: list(state.artifacts),
      runtimeEvidence: list(state.runtimeEvidence),
      workSignals: refreshWorkSignals(state, workSignals),
      memoryCandidates: list(state.memoryCandidates),
      policyDecisions: list(state.policyDecisions),
      workLocks: list(state.workLocks),
      ossComponents: registry.list(),
      securityRisks: registry.securityRisks(),
    })));
  });

  router.get('/agents', (_req, res) => res.json(ok(list(state.agents))));
  router.post('/agents', (req, res) => res.status(201).json(ok(upsert(state.agents, req.body, 'agentId'))));
  router.post('/agents/reconcile', (req, res) => {
    try {
      const incoming = isRecord(req.body?.incoming) ? req.body.incoming : req.body?.profile;
      if (!isRecord(incoming)) {
        res.status(400).json(fail('incoming AgentProfile is required'));
        return;
      }

      const result = agentProfiles.reconcile({
        existingAgents: list(state.agents),
        incoming: incoming as AgentProfile,
        binding: isRecord(req.body?.binding) ? req.body.binding as { workspaceId?: string; projectId?: string; sessionScope?: string } : undefined,
        policyMode: req.body?.policyMode === 'replace_with_incoming' ? 'replace_with_incoming' : 'preserve_existing',
      });
      state.agents.set(result.profile.agentId, result.profile);
      res.status(result.action === 'created' ? 201 : 200).json(ok(result));
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'agent_reconcile_failed'));
    }
  });

  router.get('/spaces', (_req, res) => res.json(ok(list(state.spaces))));
  router.post('/spaces', (req, res) => res.status(201).json(ok(upsert(state.spaces, req.body, 'spaceId'))));
  router.post('/spaces/:spaceId/repositories/github', (req, res) => {
    try {
      const space = state.spaces.get(req.params.spaceId);
      if (!space) {
        res.status(404).json(fail(`space not found: ${req.params.spaceId}`));
        return;
      }
      const updated = githubDelivery.connectRepository(space, {
        owner: requiredString(req.body?.owner, 'owner'),
        name: requiredString(req.body?.name, 'name'),
        repoId: optionalString(req.body?.repoId),
        defaultBranch: optionalString(req.body?.defaultBranch),
        url: optionalString(req.body?.url),
      });
      state.spaces.set(updated.spaceId, updated);
      res.status(201).json(ok(updated));
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'github_repository_connect_failed'));
    }
  });

  router.get('/tasks', (_req, res) => res.json(ok(list(state.tasks))));
  router.post('/tasks', (req, res) => {
    try {
      const task = upsert(state.tasks, req.body, 'taskId') as TaskSpec;
      appendTaskOutbox(state, task);
      res.status(201).json(ok(task));
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'task_upsert_failed'));
    }
  });
  router.post('/tasks/route', (req, res) => {
    try {
      const task = resolveTask(state, req.body);
      const route = routing.route({
        task,
        agents: list(state.agents),
        space: state.spaces.get(task.spaceId),
        requestedAssigneeAgentId: optionalString(req.body?.assigneeAgentId) ?? optionalString(req.body?.requestedAssigneeAgentId),
        requiredCapabilityIds: stringArray(req.body?.requiredCapabilityIds),
      });
      const run = markRoutedRun(state, req.body, route);
      res.json(ok({ route, run }));
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'task_route_failed'));
    }
  });
  router.get('/tasks/:taskId/history', (req, res) => {
    const runs = list(state.runs).filter((run) => run.taskId === req.params.taskId);
    if (runs.length === 0) {
      res.status(404).json(fail(`task history not found: ${req.params.taskId}`));
      return;
    }

    res.json(ok(runs.map((run) => buildRunHistory(state, history, run))));
  });

  router.get('/runs', (_req, res) => res.json(ok(list(state.runs))));
  router.post('/runs', (req, res) => {
    try {
      const run = upsert(state.runs, req.body, 'runId') as TaskRun;
      appendTaskRunOutbox(state, run);
      res.status(201).json(ok(run));
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'run_upsert_failed'));
    }
  });
  router.get('/runs/:runId/history', (req, res) => {
    const run = state.runs.get(req.params.runId);
    if (!run) {
      res.status(404).json(fail(`run not found: ${req.params.runId}`));
      return;
    }

    res.json(ok(buildRunHistory(state, history, run)));
  });
  router.post('/runs/:runId/claim', (req, res) => {
    try {
      const run = markClaimedRun(state, req.params.runId, req.body);
      res.json(ok(run));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'run_claim_failed';
      res.status(message.includes('not found') ? 404 : 409).json(fail(message));
    }
  });
  router.post('/runs/:runId/transition', (req, res) => {
    try {
      const run = markRequestedRunTransition(state, req.params.runId, req.body);
      res.json(ok(run));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'run_transition_failed';
      res.status(message.includes('not found') ? 404 : 409).json(fail(message));
    }
  });
  router.post('/runs/:runId/verification-results', (req, res) => {
    try {
      const run = state.runs.get(req.params.runId);
      if (!run) {
        res.status(404).json(fail(`run not found: ${req.params.runId}`));
        return;
      }

      const artifact = artifacts.createVerification({
        taskId: run.taskId,
        runId: run.runId,
        mimeType: optionalString(req.body?.mimeType) ?? 'text/plain',
        content: optionalString(req.body?.content),
        path: optionalString(req.body?.path),
        contentHash: optionalString(req.body?.contentHash),
        public: typeof req.body?.public === 'boolean' ? req.body.public : false,
        createdBy: optionalString(req.body?.createdBy) ?? optionalString(req.body?.agentId) ?? 'agent-os',
        command: optionalString(req.body?.command),
        passed: typeof req.body?.passed === 'boolean' ? req.body.passed : undefined,
        metadata: isRecord(req.body?.metadata) ? req.body.metadata : undefined,
      });
      state.artifacts.set(artifact.artifactId, artifact);
      appendArtifactOutbox(state, artifact);
      appendArtifactEvent(state, run, artifact, 'verification_result');

      const transitionedRun = maybeTransitionRunForArtifact(state, run, req.body, artifact);
      res.status(201).json(ok({ artifact, run: transitionedRun ?? state.runs.get(run.runId) ?? run }));
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'verification_result_failed'));
    }
  });

  router.get('/artifacts', (_req, res) => res.json(ok(list(state.artifacts))));
  router.post('/artifacts', (req, res) => {
    try {
      const artifact = upsert(state.artifacts, req.body, 'artifactId') as Artifact;
      appendArtifactOutbox(state, artifact);
      res.status(201).json(ok(artifact));
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'artifact_upsert_failed'));
    }
  });
  router.post('/artifacts/pull-request', (req, res) => {
    try {
      const artifact = artifacts.createPullRequest({
        taskId: requiredString(req.body?.taskId, 'taskId'),
        runId: optionalString(req.body?.runId),
        url: requiredString(req.body?.url, 'url'),
        number: typeof req.body?.number === 'string' || typeof req.body?.number === 'number' ? req.body.number : undefined,
        branch: optionalString(req.body?.branch),
        repository: optionalString(req.body?.repository),
        title: optionalString(req.body?.title),
        public: typeof req.body?.public === 'boolean' ? req.body.public : false,
        createdBy: optionalString(req.body?.createdBy) ?? optionalString(req.body?.agentId) ?? 'agent-os',
        metadata: isRecord(req.body?.metadata) ? req.body.metadata : undefined,
      });
      state.artifacts.set(artifact.artifactId, artifact);
      appendArtifactOutbox(state, artifact);
      const run = markDeliveredRun(state, req.body, artifact);
      res.status(201).json(ok({ artifact, run }));
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'pull_request_artifact_failed'));
    }
  });

  router.get('/runtime-evidence', (_req, res) => res.json(ok(list(state.runtimeEvidence))));
  router.post('/runtime-evidence', (req, res) => {
    try {
      const evidence = runtimeEvidence.create({
        taskId: requiredString(req.body?.taskId, 'taskId'),
        runId: optionalString(req.body?.runId),
        kind: requiredString(req.body?.kind, 'kind') as RuntimeEvidence['kind'],
        status: readRuntimeEvidenceStatus(req.body?.status),
        title: optionalString(req.body?.title),
        summary: optionalString(req.body?.summary),
        source: isRecord(req.body?.source) ? req.body.source as RuntimeEvidence['source'] : undefined,
        artifactIds: stringArray(req.body?.artifactIds),
        observedAt: optionalString(req.body?.observedAt),
        metadata: isRecord(req.body?.metadata) ? req.body.metadata : undefined,
      });
      state.runtimeEvidence.set(evidence.evidenceId, evidence);
      appendRuntimeEvidenceOutbox(state, evidence);
      res.status(201).json(ok(evidence));
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'runtime_evidence_failed'));
    }
  });
  router.post('/artifacts/preview', (req, res) => {
    try {
      const artifact = artifacts.createPreview({
        taskId: requiredString(req.body?.taskId, 'taskId'),
        runId: optionalString(req.body?.runId),
        url: requiredString(req.body?.url, 'url'),
        provider: optionalString(req.body?.provider),
        environment: optionalString(req.body?.environment),
        public: typeof req.body?.public === 'boolean' ? req.body.public : false,
        createdBy: optionalString(req.body?.createdBy) ?? optionalString(req.body?.agentId) ?? 'agent-os',
        metadata: isRecord(req.body?.metadata) ? req.body.metadata : undefined,
      });
      state.artifacts.set(artifact.artifactId, artifact);
      appendArtifactOutbox(state, artifact);
      const run = markDeliveredRun(state, req.body, artifact);
      res.status(201).json(ok({ artifact, run }));
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'preview_artifact_failed'));
    }
  });

  router.get('/work-signals', (_req, res) => {
    res.json(ok(refreshWorkSignals(state, workSignals)));
  });
  router.post('/work-signals', (req, res) => {
    try {
      const signal = upsert(state.workSignals, req.body, 'signalId') as WorkSignal;
      appendWorkSignalOutbox(state, signal);
      res.status(201).json(ok(signal));
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'work_signal_upsert_failed'));
    }
  });
  router.patch('/work-signals/:signalId/status', (req, res) => {
    try {
      refreshWorkSignals(state, workSignals);
      const signal = state.workSignals.get(req.params.signalId);
      if (!signal) {
        res.status(404).json(fail(`work signal not found: ${req.params.signalId}`));
        return;
      }
      if (req.body?.status !== 'resolved') {
        res.status(400).json(fail('Only status=resolved is supported for now'));
        return;
      }
      const resolved = workSignals.resolve(signal, {
        resolvedBy: requiredString(req.body?.resolvedBy, 'resolvedBy'),
        resolvedAt: optionalString(req.body?.resolvedAt),
      });
      state.workSignals.set(resolved.signalId, resolved);
      appendWorkSignalOutbox(state, resolved);
      res.json(ok(resolved));
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'work_signal_status_failed'));
    }
  });

  router.get('/github/delivery-links', (_req, res) => res.json(ok(list(state.githubDeliveryLinks))));
  router.post('/github/delivery-links', (req, res) => {
    try {
      const task = resolveTask(state, req.body);
      const run = optionalString(req.body?.runId) ? state.runs.get(requiredString(req.body?.runId, 'runId')) : undefined;
      const link = githubDelivery.createLink({
        task,
        run,
        space: state.spaces.get(task.spaceId),
        repoId: optionalString(req.body?.repoId),
        repository: optionalString(req.body?.repository),
        branch: optionalString(req.body?.branch),
        baseBranch: optionalString(req.body?.baseBranch),
        issueNumber: typeof req.body?.issueNumber === 'string' || typeof req.body?.issueNumber === 'number' ? req.body.issueNumber : undefined,
        issueUrl: optionalString(req.body?.issueUrl),
        createdBy: optionalString(req.body?.createdBy) ?? optionalString(req.body?.agentId) ?? 'agent-os',
        metadata: isRecord(req.body?.metadata) ? req.body.metadata : undefined,
      });
      state.githubDeliveryLinks.set(link.linkId, link);
      res.status(201).json(ok(link));
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'github_delivery_link_failed'));
    }
  });
  router.post('/github/delivery-links/:linkId/pull-request', (req, res) => {
    try {
      const link = requiredGitHubDeliveryLink(state, req.params.linkId);
      const artifact = resolveOrCreatePullRequestArtifact(state, artifacts, req.body, link);
      const updated = githubDelivery.attachPullRequest(link, artifact);
      state.githubDeliveryLinks.set(updated.linkId, updated);
      res.json(ok({ link: updated, artifact }));
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'github_delivery_pr_link_failed'));
    }
  });
  router.post('/github/delivery-links/:linkId/previews', (req, res) => {
    try {
      const link = requiredGitHubDeliveryLink(state, req.params.linkId);
      const artifact = resolveOrCreatePreviewArtifact(state, artifacts, req.body, link);
      const updated = githubDelivery.attachPreview(link, artifact);
      state.githubDeliveryLinks.set(updated.linkId, updated);
      res.json(ok({ link: updated, artifact }));
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'github_delivery_preview_link_failed'));
    }
  });
  router.post('/github/delivery-links/:linkId/checks', (req, res) => {
    try {
      const link = requiredGitHubDeliveryLink(state, req.params.linkId);
      const updated = githubDelivery.syncChecks(link, Array.isArray(req.body?.checks) ? req.body.checks : []);
      state.githubDeliveryLinks.set(updated.linkId, updated);
      res.json(ok(updated));
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'github_delivery_checks_failed'));
    }
  });
  router.post('/github/delivery-links/:linkId/reviews', (req, res) => {
    try {
      const link = requiredGitHubDeliveryLink(state, req.params.linkId);
      const updated = githubDelivery.syncReviews(link, Array.isArray(req.body?.reviews) ? req.body.reviews : []);
      state.githubDeliveryLinks.set(updated.linkId, updated);
      res.json(ok(updated));
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'github_delivery_reviews_failed'));
    }
  });
  router.post('/github/delivery-links/:linkId/issue', (req, res) => {
    try {
      const link = requiredGitHubDeliveryLink(state, req.params.linkId);
      const updated = githubDelivery.linkIssue(link, {
        issueNumber: typeof req.body?.issueNumber === 'string' || typeof req.body?.issueNumber === 'number' ? req.body.issueNumber : undefined,
        issueUrl: optionalString(req.body?.issueUrl),
      });
      state.githubDeliveryLinks.set(updated.linkId, updated);
      res.json(ok(updated));
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'github_delivery_issue_link_failed'));
    }
  });

  router.get('/approvals', (_req, res) => res.json(ok(list(state.approvals))));
  router.post('/approvals', (req, res) => {
    try {
      const approval = upsert(state.approvals, req.body, 'approvalId') as Approval;
      appendApprovalOutbox(state, approval);
      res.status(201).json(ok(approval));
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'approval_upsert_failed'));
    }
  });
  router.post('/approvals/:approvalId/approve', (req, res) => {
    decideApprovalRequest(state, approvalService, req.params.approvalId, 'approved', req.body, res);
  });
  router.post('/approvals/:approvalId/reject', (req, res) => {
    decideApprovalRequest(state, approvalService, req.params.approvalId, 'rejected', req.body, res);
  });

  router.get('/memory', (_req, res) => res.json(ok({
    items: list(state.memoryItems),
    candidates: list(state.memoryCandidates),
  })));
  router.post('/memory/items', (req, res) => {
    try {
      const item = upsert(state.memoryItems, req.body, 'memoryId') as MemoryItem;
      appendMemoryItemOutbox(state, item);
      res.status(201).json(ok(item));
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'memory_item_upsert_failed'));
    }
  });
  router.post('/memory/candidates', (req, res) => {
    try {
      const candidate = upsert(state.memoryCandidates, req.body, 'candidateId') as MemoryCandidate;
      appendMemoryCandidateOutbox(state, candidate);
      res.status(201).json(ok(candidate));
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'memory_candidate_upsert_failed'));
    }
  });
  router.post('/memory/candidates/:candidateId/review', (req, res) => {
    try {
      const candidate = state.memoryCandidates.get(req.params.candidateId);
      if (!candidate) {
        res.status(404).json(fail(`memory candidate not found: ${req.params.candidateId}`));
        return;
      }
      const accepted = readBoolean(req.body?.accepted, 'accepted');
      const result = memory.review(candidate, {
        accepted,
        reviewedBy: requiredString(req.body?.reviewedBy, 'reviewedBy'),
        reviewedAt: optionalString(req.body?.reviewedAt),
        reason: optionalString(req.body?.reason),
        memoryId: optionalString(req.body?.memoryId),
        supersedesMemoryId: optionalString(req.body?.supersedesMemoryId),
      });
      state.memoryCandidates.set(result.candidate.candidateId, result.candidate);
      appendMemoryCandidateOutbox(state, result.candidate);
      if (result.memory) {
        state.memoryItems.set(result.memory.memoryId, result.memory);
        appendMemoryItemOutbox(state, result.memory);
      }
      res.json(ok(result));
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'memory_review_failed'));
    }
  });

  router.get('/instructions', (_req, res) => res.json(ok(list(state.instructionBundles))));
  router.post('/instructions', (req, res) => {
    try {
      const bundle = upsert(state.instructionBundles, req.body, 'bundleId') as InstructionBundle;
      const artifact = maybeCreateInstructionBundleArtifact(state, artifacts, bundle, req.body);
      res.status(201).json(ok({ bundle, artifact }));
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'instruction_upsert_failed'));
    }
  });
  router.post('/instructions/compile', (req, res) => {
    try {
      const result = compileInstructionRequest(state, req.body);
      state.instructionBundles.set(result.runtimeBundle.bundleId, result.runtimeBundle);
      const artifact = maybeCreateInstructionBundleArtifact(state, artifacts, result.runtimeBundle, {
        ...req.body,
        auditBundle: result.auditBundle,
      });
      const run = markCompiledRun(state, req.body, result.runtimeBundle.bundleId);
      res.status(201).json(ok({ ...result, artifact, run }));
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'instruction_compile_failed'));
    }
  });

  router.get('/policies', (_req, res) => res.json(ok({
    decisions: list(state.policyDecisions),
    spacePolicies: list(state.spaces).map((space) => ({ spaceId: space.spaceId, ...space.policy })),
    workLocks: list(state.workLocks),
  })));
  router.post('/policies/decisions', (req, res) => {
    try {
      const decision = upsert(state.policyDecisions, req.body, 'decisionId') as PolicyDecision;
      const approval = maybeCreateApprovalFromPolicyDecision(state, approvalService, decision, req.body);
      res.status(201).json(ok({ decision, approval }));
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'policy_decision_failed'));
    }
  });
  router.post('/policies/space', (req, res) => {
    const { spaceId, policy } = req.body as { spaceId?: string; policy?: SpacePolicy };
    const space = spaceId ? state.spaces.get(spaceId) : undefined;
    if (!space || !policy) {
      res.status(400).json(fail('spaceId and policy for an existing space are required'));
      return;
    }

    const updated = { ...space, policy, updatedAt: new Date().toISOString() };
    state.spaces.set(space.spaceId, updated);
    res.status(201).json(ok({ spaceId, ...policy }));
  });

  router.get('/work-locks', (_req, res) => res.json(ok(list(state.workLocks))));
  router.post('/work-locks/acquire', (req, res) => {
    try {
      const result = locks.acquire({
        ...req.body,
        existingLocks: list(state.workLocks),
      });
      replaceAll(state.workLocks, result.locks, 'lockId');
      res.status(201).json(ok(result.lock));
    } catch (error) {
      res.status(409).json({
        ...fail(error instanceof Error ? error.message : 'work_lock_conflict'),
        conflicts: error instanceof Error && 'conflicts' in error ? error.conflicts : undefined,
      });
    }
  });
  router.delete('/work-locks/:lockId', (req, res) => {
    const released = locks.release(list(state.workLocks), {
      lockId: req.params.lockId,
      ownerAgentId: typeof req.body?.ownerAgentId === 'string' ? req.body.ownerAgentId : undefined,
      taskId: typeof req.body?.taskId === 'string' ? req.body.taskId : undefined,
    });
    replaceAll(state.workLocks, released, 'lockId');
    res.json(ok(released));
  });

  router.get('/events', (_req, res) => res.json(ok([...state.events])));
  router.post('/events', (req, res) => {
    const event = req.body as RunEvent;
    state.events.push(event);
    appendRunEventOutbox(state, event);
    const application = applyRunEvent(state, runs, event);
    res.status(201).json(ok({
      event,
      run: application?.run,
      eventAppliedToRun: application?.applied ?? false,
      eventApplicationReason: application?.reason,
    }));
  });
  router.get('/outbox', (_req, res) => res.json(ok([...state.outbox])));

  router.get('/oss', (_req, res) => {
    const registry = createRecoderComponentRegistry(list(state.ossComponents));
    res.json(ok({
      components: registry.list(),
      canonicalStateOwners: registry.canonicalStateOwners(),
      securityRisks: registry.securityRisks(),
      findings: registry.validateAll(),
    }));
  });
  router.get('/oss/components/:componentId', (req, res) => {
    const component = state.ossComponents.get(req.params.componentId);
    if (!component) {
      res.status(404).json(fail(`component not found: ${req.params.componentId}`));
      return;
    }
    res.json(ok(component));
  });
  router.post('/oss/components', (req, res) => {
    try {
      res.status(201).json(ok(upsert(state.ossComponents, req.body, 'id')));
    } catch (error) {
      res.status(400).json(fail(error instanceof Error ? error.message : 'oss_component_upsert_failed'));
    }
  });

  router.get('/workflows', (_req, res) => res.json(ok({
    status: 'available',
    driver: 'agent-os-workflow-runner',
  })));

  return router;
}

function ok<T>(data: T): { success: true; data: T } {
  return { success: true, data };
}

function fail(error: string): { success: false; error: string } {
  return { success: false, error };
}

function list<T>(map: Map<string, T>): T[] {
  return [...map.values()];
}

function upsert<T>(map: Map<string, T>, value: T, key: string): T {
  const id = (value as Record<string, unknown>)[key];
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error(`${key} is required`);
  }
  map.set(id, value);
  return value;
}

function replaceAll<T>(map: Map<string, T>, values: T[], key: string): void {
  map.clear();
  for (const value of values) {
    upsert(map, value, key);
  }
}

function refreshWorkSignals(
  state: AgentOsGatewayState,
  workSignals: WorkSignalService,
): WorkSignal[] {
  const detected = workSignals.detect({
    tasks: list(state.tasks),
    runs: list(state.runs),
    artifacts: list(state.artifacts),
    approvals: list(state.approvals),
    githubDeliveryLinks: list(state.githubDeliveryLinks),
    runtimeEvidence: list(state.runtimeEvidence),
    policyDecisions: list(state.policyDecisions),
    existingSignals: list(state.workSignals),
  });
  const detectedIds = new Set(detected.map((signal) => signal.signalId));

  for (const signal of list(state.workSignals)) {
    if (signal.metadata?.['generatedBy'] === 'work_signal_service' && !detectedIds.has(signal.signalId)) {
      state.workSignals.delete(signal.signalId);
    }
  }

  for (const signal of detected) {
    const isNewSignal = !state.workSignals.has(signal.signalId);
    state.workSignals.set(signal.signalId, signal);
    if (isNewSignal) {
      appendWorkSignalOutbox(state, signal);
    }
  }

  return list(state.workSignals).sort((a, b) => (
    workSignalSeverityRank(a.severity) - workSignalSeverityRank(b.severity)
    || a.detectedAt.localeCompare(b.detectedAt)
  ));
}

function workSignalSeverityRank(severity: WorkSignal['severity']): number {
  return { critical: 0, high: 1, medium: 2, low: 3 }[severity];
}

function appendOutboxRecord(state: AgentOsGatewayState, record: OutboxRecord<unknown>): OutboxRecord<unknown> {
  const existing = state.outbox.find((candidate) => candidate.outboxId === record.outboxId);
  if (existing) {
    return existing;
  }
  state.outbox.push(record);
  return record;
}

function appendRunEventOutbox(state: AgentOsGatewayState, event: RunEvent): OutboxRecord<unknown> {
  return appendOutboxRecord(state, createOutboxRecord(mapRunEventToCloudEvent(event)));
}

function appendTaskOutbox(state: AgentOsGatewayState, task: TaskSpec): OutboxRecord<unknown> {
  return appendOutboxRecord(state, createOutboxRecord(mapTaskCreatedToCloudEvent({ data: task })));
}

function appendTaskRunOutbox(state: AgentOsGatewayState, run: TaskRun): OutboxRecord<unknown> {
  return appendOutboxRecord(state, createOutboxRecord(mapTaskRunStateToCloudEvent({ data: run })));
}

function appendArtifactOutbox(state: AgentOsGatewayState, artifact: Artifact): OutboxRecord<unknown> {
  return appendOutboxRecord(state, createOutboxRecord(mapArtifactToCloudEvent({ data: artifact })));
}

function appendRuntimeEvidenceOutbox(state: AgentOsGatewayState, evidence: RuntimeEvidence): OutboxRecord<unknown> {
  return appendOutboxRecord(state, createOutboxRecord(mapRuntimeEvidenceToCloudEvent({ data: evidence })));
}

function appendWorkSignalOutbox(state: AgentOsGatewayState, signal: WorkSignal): OutboxRecord<unknown> {
  return appendOutboxRecord(state, createOutboxRecord(mapWorkSignalToCloudEvent({ data: signal })));
}

function appendApprovalOutbox(state: AgentOsGatewayState, approval: Approval): OutboxRecord<unknown> {
  return appendOutboxRecord(state, createOutboxRecord(mapApprovalToCloudEvent({ data: approval })));
}

function appendMemoryCandidateOutbox(state: AgentOsGatewayState, candidate: MemoryCandidate): OutboxRecord<unknown> {
  return appendOutboxRecord(state, createOutboxRecord(mapMemoryCandidateToCloudEvent({ data: candidate })));
}

function appendMemoryItemOutbox(state: AgentOsGatewayState, item: MemoryItem): OutboxRecord<unknown> {
  return appendOutboxRecord(state, createOutboxRecord(mapMemoryItemAcceptedToCloudEvent({ data: item })));
}

function applyRunEvent(
  state: AgentOsGatewayState,
  runs: RunService,
  event: RunEvent,
): ReturnType<RunService['applyEvent']> | undefined {
  if (!event.runId) {
    return undefined;
  }

  const run = state.runs.get(event.runId);
  if (!run) {
    return undefined;
  }

  const application = runs.applyEvent(run, event);
  state.runs.set(application.run.runId, application.run);
  if (application.applied) {
    appendTaskRunOutbox(state, application.run);
  }
  return application;
}

function buildRunHistory(state: AgentOsGatewayState, history: RunHistoryService, run: TaskRun) {
  return history.build({
    run,
    task: state.tasks.get(run.taskId),
    events: state.events,
    artifacts: list(state.artifacts),
    runtimeEvidence: list(state.runtimeEvidence),
    approvals: list(state.approvals),
    policyDecisions: list(state.policyDecisions),
    memoryCandidates: list(state.memoryCandidates),
    memoryItems: list(state.memoryItems),
    instructionBundles: list(state.instructionBundles),
    githubDeliveryLinks: list(state.githubDeliveryLinks),
    workLocks: list(state.workLocks),
  });
}

function requiredGitHubDeliveryLink(state: AgentOsGatewayState, linkId: string): GitHubDeliveryLink {
  const link = state.githubDeliveryLinks.get(linkId);
  if (!link) {
    throw new Error(`github delivery link not found: ${linkId}`);
  }
  return link;
}

function resolveOrCreatePullRequestArtifact(
  state: AgentOsGatewayState,
  artifacts: ArtifactService,
  body: Record<string, unknown>,
  link: GitHubDeliveryLink,
): Artifact {
  const artifactId = optionalString(body['artifactId']);
  if (artifactId) {
    const artifact = state.artifacts.get(artifactId);
    if (!artifact) {
      throw new Error(`artifact not found: ${artifactId}`);
    }
    return artifact;
  }

  const artifact = artifacts.createPullRequest({
    taskId: link.taskId,
    runId: link.runId,
    url: requiredString(body['url'], 'url'),
    number: typeof body['number'] === 'string' || typeof body['number'] === 'number' ? body['number'] : undefined,
    branch: optionalString(body['branch']) ?? link['branch'],
    repository: optionalString(body['repository']) ?? link['repository'],
    title: optionalString(body['title']),
    public: typeof body['public'] === 'boolean' ? body['public'] : false,
    createdBy: optionalString(body['createdBy']) ?? optionalString(body['agentId']) ?? 'agent-os',
    metadata: isRecord(body['metadata']) ? body['metadata'] : undefined,
  });
  state.artifacts.set(artifact.artifactId, artifact);
  appendArtifactOutbox(state, artifact);
  return artifact;
}

function resolveOrCreatePreviewArtifact(
  state: AgentOsGatewayState,
  artifacts: ArtifactService,
  body: Record<string, unknown>,
  link: GitHubDeliveryLink,
): Artifact {
  const artifactId = optionalString(body['artifactId']);
  if (artifactId) {
    const artifact = state.artifacts.get(artifactId);
    if (!artifact) {
      throw new Error(`artifact not found: ${artifactId}`);
    }
    return artifact;
  }

  const artifact = artifacts.createPreview({
    taskId: link.taskId,
    runId: link.runId,
    url: requiredString(body['url'], 'url'),
    provider: optionalString(body['provider']),
    environment: optionalString(body['environment']),
    public: typeof body['public'] === 'boolean' ? body['public'] : false,
    createdBy: optionalString(body['createdBy']) ?? optionalString(body['agentId']) ?? 'agent-os',
    metadata: isRecord(body['metadata']) ? body['metadata'] : undefined,
  });
  state.artifacts.set(artifact.artifactId, artifact);
  appendArtifactOutbox(state, artifact);
  return artifact;
}

function decideApprovalRequest(
  state: AgentOsGatewayState,
  approvalService: ApprovalService,
  approvalId: string,
  status: 'approved' | 'rejected',
  body: Record<string, unknown>,
  res: { status(code: number): { json(value: unknown): unknown }; json(value: unknown): unknown },
): void {
  try {
    const approval = state.approvals.get(approvalId);
    if (!approval) {
      res.status(404).json(fail(`approval not found: ${approvalId}`));
      return;
    }

    const decided = approvalService.decide(
      approval,
      status,
      requiredString(body?.['decidedBy'], 'decidedBy'),
      optionalString(body?.['reason']) ?? optionalString(body?.['decisionReason']),
    );
    state.approvals.set(decided.approvalId, decided);
    appendApprovalOutbox(state, decided);
    const run = markApprovalDecisionRun(state, decided, status);
    res.json(ok({ approval: decided, run }));
  } catch (error) {
    res.status(400).json(fail(error instanceof Error ? error.message : 'approval_decision_failed'));
  }
}

function maybeCreateApprovalFromPolicyDecision(
  state: AgentOsGatewayState,
  approvalService: ApprovalService,
  decision: PolicyDecision,
  body: Record<string, unknown>,
): Approval | undefined {
  if (body['createApproval'] === false) {
    return undefined;
  }

  const approval = approvalService.requestFromPolicyDecision({
    decision,
    runId: optionalString(body['runId']),
    requestedBy: optionalString(body['requestedBy']),
    requiredAt: readApprovalRequiredAt(body['requiredAt']),
    target: readApprovalTarget(body['target']) ?? readApprovalTarget(decision.metadata),
    metadata: {
      source: 'policy_decision_ingress',
    },
  });
  if (!approval) {
    return undefined;
  }

  state.approvals.set(approval.approvalId, approval);
  appendApprovalOutbox(state, approval);
  return approval;
}

function maybeCreateInstructionBundleArtifact(
  state: AgentOsGatewayState,
  artifacts: ArtifactService,
  bundle: InstructionBundle,
  body: Record<string, unknown>,
): Artifact | undefined {
  if (body['createArtifact'] === false) {
    return undefined;
  }

  const artifact = artifacts.createInstructionBundle({
    taskId: bundle.taskId,
    runId: optionalString(body['runId']),
    bundle,
    auditBundle: body['auditBundle'],
    createdBy: optionalString(body['createdBy']) ?? bundle.agentId,
    public: body['public'] === true,
    metadata: isRecord(body['metadata']) ? body['metadata'] : undefined,
  });
  state.artifacts.set(artifact.artifactId, artifact);
  appendArtifactOutbox(state, artifact);
  return artifact;
}

function compileInstructionRequest(
  state: AgentOsGatewayState,
  body: Record<string, unknown>,
): ReturnType<typeof compileAgentOsInstructionBundle> {
  const task = resolveTask(state, body);
  const agent = resolveAgent(state, body);
  const input = {
    ...body,
    task,
    agent,
    repoRoot: typeof body['repoRoot'] === 'string' && body['repoRoot'].length > 0 ? body['repoRoot'] : process.cwd(),
  } as CompileAgentOsInstructionBundleInput;

  return compileAgentOsInstructionBundle(input);
}

function resolveTask(state: AgentOsGatewayState, body: Record<string, unknown>): TaskSpec {
  if (isRecord(body['task'])) {
    return body['task'] as TaskSpec;
  }
  const taskId = typeof body['taskId'] === 'string' ? body['taskId'] : undefined;
  const task = taskId ? state.tasks.get(taskId) : undefined;
  if (!task) {
    throw new Error('task or taskId for an existing task is required');
  }
  return task;
}

function resolveAgent(state: AgentOsGatewayState, body: Record<string, unknown>): AgentProfile {
  if (isRecord(body['agent'])) {
    return body['agent'] as AgentProfile;
  }
  const agentId = typeof body['agentId'] === 'string' ? body['agentId'] : undefined;
  const agent = agentId ? state.agents.get(agentId) : undefined;
  if (!agent) {
    throw new Error('agent or agentId for an existing agent is required');
  }
  return agent;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function requiredString(value: unknown, field: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new Error(`${field} is required`);
  }
  return stringValue;
}

function readBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${field} boolean is required`);
  }
  return value;
}

function readApprovalRequiredAt(value: unknown): Approval['requiredAt'] | undefined {
  const candidate = optionalString(value);
  if (
    candidate === 'before_execution'
    || candidate === 'before_write'
    || candidate === 'before_push'
    || candidate === 'before_pr'
    || candidate === 'before_sensitive_action'
    || candidate === 'after_verification'
    || candidate === 'custom'
  ) {
    return candidate;
  }
  return undefined;
}

function readApprovalTarget(value: unknown): Approval['target'] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const path = optionalString(value['path']);
  const command = optionalString(value['command']);
  const toolName = optionalString(value['toolName']);
  return path || command || toolName ? { path, command, toolName } : undefined;
}

function readRuntimeEvidenceStatus(value: unknown): RuntimeEvidence['status'] | undefined {
  if (value === 'observed' || value === 'passed' || value === 'failed' || value === 'warning') {
    return value;
  }
  return undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}

function markCompiledRun(
  state: AgentOsGatewayState,
  body: Record<string, unknown>,
  instructionBundleId: string,
): TaskRun | undefined {
  const requestedRunId = typeof body['runId'] === 'string' ? body['runId'] : undefined;
  const taskId = typeof body['taskId'] === 'string'
    ? body['taskId']
    : isRecord(body['task']) && typeof body['task']['taskId'] === 'string'
      ? body['task']['taskId']
      : undefined;
  const run = requestedRunId
    ? state.runs.get(requestedRunId)
    : list(state.runs).find((candidate) => candidate.taskId === taskId && candidate.state === 'created');

  if (!run || !isAllowedTaskRunTransition(run.state, 'compiled')) {
    return undefined;
  }

  const transitioned = transitionTaskRun(run, 'compiled', {
    metadata: {
      instructionBundleId,
    },
  });
  const updated = {
    ...transitioned,
    instructionBundleId,
  };
  state.runs.set(updated.runId, updated);
  appendStateTransitionEvent(state, run.state, updated, 'instruction_compile', {
    instructionBundleId,
  });
  return updated;
}

function markRoutedRun(
  state: AgentOsGatewayState,
  body: Record<string, unknown>,
  route: ReturnType<TaskRoutingService['route']>,
): TaskRun | undefined {
  if (body['routeRun'] !== true && body['transitionToRouted'] !== true) {
    return undefined;
  }
  if (route.blocked || !route.selectedAgentId) {
    return undefined;
  }

  const requestedRunId = optionalString(body['runId']);
  const run = requestedRunId
    ? state.runs.get(requestedRunId)
    : list(state.runs).find((candidate) => candidate.taskId === route.taskId && candidate.state === 'compiled');

  if (!run || !isAllowedTaskRunTransition(run.state, 'routed')) {
    return undefined;
  }

  const transitioned = transitionTaskRun(run, 'routed', {
    metadata: {
      routeSelectedAgentId: route.selectedAgentId,
      routeCandidateCount: route.candidates.length,
      routePolicyFindings: route.policyFindings,
    },
  });
  const updated = {
    ...transitioned,
    assigneeAgentId: route.selectedAgentId,
  };
  state.runs.set(updated.runId, updated);
  appendStateTransitionEvent(state, run.state, updated, 'task_route', {
    selectedAgentId: route.selectedAgentId,
    blocked: route.blocked,
  });
  return updated;
}

function markClaimedRun(
  state: AgentOsGatewayState,
  runId: string,
  body: Record<string, unknown>,
): TaskRun {
  const agentId = requiredString(body['agentId'], 'agentId');
  const run = state.runs.get(runId);
  if (!run) {
    throw new Error(`run not found: ${runId}`);
  }

  const agent = state.agents.get(agentId);
  if (!agent) {
    throw new Error(`agent not found: ${agentId}`);
  }
  if (agent.health.status !== 'healthy' && agent.health.status !== 'degraded') {
    throw new Error(`agent health is ${agent.health.status}`);
  }
  if (run.assigneeAgentId && run.assigneeAgentId !== agentId) {
    throw new Error(`run is assigned to ${run.assigneeAgentId}`);
  }

  const task = state.tasks.get(run.taskId);
  if (task && !supportsAgentIntent(agent, task.intent)) {
    throw new Error(`agent does not support task intent ${task.intent}`);
  }
  if (!isAllowedTaskRunTransition(run.state, 'claimed')) {
    throw new Error(`Invalid task run transition: ${run.state} -> claimed`);
  }

  const now = new Date().toISOString();
  const transitioned = transitionTaskRun(run, 'claimed', {
    now,
    metadata: {
      claimedByAgentId: agentId,
      claimedAt: now,
      claimConnectorId: agent.connectorId,
    },
  });
  const updated = {
    ...transitioned,
    assigneeAgentId: agentId,
  };
  state.runs.set(updated.runId, updated);
  appendStateTransitionEvent(state, run.state, updated, 'run_claim', {
    agentId,
  });
  return updated;
}

function markRequestedRunTransition(
  state: AgentOsGatewayState,
  runId: string,
  body: Record<string, unknown>,
): TaskRun {
  const run = state.runs.get(runId);
  if (!run) {
    throw new Error(`run not found: ${runId}`);
  }

  const nextState = requiredString(body['state'], 'state') as TaskRunState;
  if (!isAllowedTaskRunTransition(run.state, nextState)) {
    throw new Error(`Invalid task run transition: ${run.state} -> ${nextState}`);
  }

  const now = optionalString(body['now']) ?? new Date().toISOString();
  const transitioned = transitionTaskRun(run, nextState, {
    now,
    metadata: {
      ...(isRecord(body['metadata']) ? body['metadata'] : {}),
      transitionRequestedBy: optionalString(body['agentId']) ?? optionalString(body['requestedBy']) ?? 'agent-os',
      transitionedAt: now,
    },
  });
  const updated = {
    ...transitioned,
    assigneeAgentId: optionalString(body['assigneeAgentId']) ?? transitioned['assigneeAgentId'],
  };
  state.runs.set(updated.runId, updated);
  appendStateTransitionEvent(state, run.state, updated, 'run_transition', {
    requestedBy: optionalString(body['agentId']) ?? optionalString(body['requestedBy']),
  });
  return updated;
}

function markDeliveredRun(
  state: AgentOsGatewayState,
  body: Record<string, unknown>,
  artifact: Artifact,
): TaskRun | undefined {
  if (body['deliver'] !== true && body['transitionToDelivered'] !== true) {
    return undefined;
  }
  if (!artifact.runId) {
    return undefined;
  }

  const run = state.runs.get(artifact.runId);
  if (!run || !isAllowedTaskRunTransition(run.state, 'delivered')) {
    return undefined;
  }

  const previousIds = Array.isArray(run.metadata?.['deliveryArtifactIds'])
    ? run.metadata['deliveryArtifactIds'].filter((value): value is string => typeof value === 'string')
    : [];
  const transitioned = transitionTaskRun(run, 'delivered', {
    metadata: {
      deliveryArtifactIds: [...new Set([...previousIds, artifact.artifactId])],
      lastDeliveryArtifactId: artifact.artifactId,
      lastDeliveryArtifactKind: artifact.kind,
    },
  });
  state.runs.set(transitioned.runId, transitioned);
  appendStateTransitionEvent(state, run.state, transitioned, 'delivery_artifact', {
    artifactId: artifact.artifactId,
    artifactKind: artifact.kind,
  });
  return transitioned;
}

function supportsAgentIntent(agent: AgentProfile, intent: TaskSpec['intent']): boolean {
  return agent.supportedTaskIntents.includes(intent) || agent.supportedTaskIntents.includes('*');
}

function appendStateTransitionEvent(
  state: AgentOsGatewayState,
  fromState: TaskRunState,
  run: TaskRun,
  reason: string,
  data: Record<string, unknown> = {},
): void {
  const event: RunEvent = {
    eventId: `event_${run.runId}_${fromState}_${run.state}_${Date.now()}`,
    type: 'state_transition',
    taskId: run.taskId,
    runId: run.runId,
    agentId: run.assigneeAgentId,
    state: run.state,
    message: `Run transitioned ${fromState} -> ${run.state}`,
    createdAt: run.updatedAt,
    data: {
      fromState,
      toState: run.state,
      reason,
      ...data,
    },
  };
  state.events.push(event);
  appendRunEventOutbox(state, event);
  appendTaskRunOutbox(state, run);
}

function appendArtifactEvent(
  state: AgentOsGatewayState,
  run: TaskRun,
  artifact: Artifact,
  reason: string,
): void {
  const event: RunEvent = {
    eventId: `event_${run.runId}_artifact_${artifact.artifactId}_${Date.now()}`,
    type: 'artifact',
    taskId: run.taskId,
    runId: run.runId,
    agentId: run.assigneeAgentId,
    state: run.state,
    message: `Artifact created: ${artifact.kind}`,
    artifactId: artifact.artifactId,
    createdAt: artifact.createdAt,
    data: {
      reason,
      artifactKind: artifact.kind,
      metadata: artifact.metadata,
    },
  };
  state.events.push(event);
  appendRunEventOutbox(state, event);
}

function maybeTransitionRunForArtifact(
  state: AgentOsGatewayState,
  run: TaskRun,
  body: Record<string, unknown>,
  artifact: Artifact,
): TaskRun | undefined {
  const requestedState = optionalString(body['transitionState']) ?? optionalString(body['state']);
  if (!requestedState) {
    return undefined;
  }

  const nextState = requestedState as TaskRunState;
  if (!isAllowedTaskRunTransition(run.state, nextState)) {
    throw new Error(`Invalid task run transition: ${run.state} -> ${nextState}`);
  }

  const transitioned = transitionTaskRun(run, nextState, {
    metadata: {
      verificationArtifactId: artifact.artifactId,
      verificationPassed: artifact.metadata?.['passed'],
      verificationCommand: artifact.metadata?.['command'],
    },
  });
  state.runs.set(transitioned.runId, transitioned);
  appendStateTransitionEvent(state, run.state, transitioned, 'verification_result', {
    artifactId: artifact.artifactId,
  });
  return transitioned;
}

function markApprovalDecisionRun(
  state: AgentOsGatewayState,
  approval: Approval,
  status: 'approved' | 'rejected',
): TaskRun | undefined {
  if (!approval.runId) {
    return undefined;
  }

  const run = state.runs.get(approval.runId);
  if (!run || !isAllowedTaskRunTransition(run.state, status)) {
    return undefined;
  }

  const transitioned = transitionTaskRun(run, status, {
    metadata: {
      approvalId: approval.approvalId,
      approvalStatus: status,
      approvalDecidedBy: approval.decidedBy,
      approvalDecidedAt: approval.decidedAt,
    },
  });
  state.runs.set(transitioned.runId, transitioned);
  appendStateTransitionEvent(state, run.state, transitioned, 'approval_decision', {
    approvalId: approval.approvalId,
    approvalStatus: status,
  });
  return transitioned;
}
