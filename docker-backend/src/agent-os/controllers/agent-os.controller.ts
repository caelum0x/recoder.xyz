import type { Request, Response } from 'express';
import type { AgentProfile, Approval, Artifact, GitHubDeliveryLink, InstructionBundle, MemoryCandidate, MemoryItem, PolicyDecision, RunEvent, RuntimeEvidence, SpacePolicy, TaskRun, TaskRunState, TaskSpec, WorkLockService } from '@recoder/agent-os';
import {
  AgentProfileReconciliationService,
  ApprovalService,
  ArtifactService,
  GitHubDeliveryService,
  isAllowedTaskRunTransition,
  MemoryService,
  RuntimeEvidenceService,
  RunHistoryService,
  RunService,
  TaskRoutingService,
  transitionTaskRun,
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
} from '@recoder/agent-events';
import { createRecoderComponentRegistry } from '@recoder/oss-registry';
import { buildAgentOsCockpitSummary } from '@recoder/ui-agent-os';
import type { InMemoryAgentOsRepository } from '../repositories/in-memory-agent-os.repository';

export class AgentOsController {
  constructor(
    private readonly repository: InMemoryAgentOsRepository,
    private readonly workLockService?: WorkLockService,
  ) {}

  private readonly agentProfiles = new AgentProfileReconciliationService();
  private readonly approvalService = new ApprovalService();
  private readonly artifactService = new ArtifactService();
  private readonly githubDeliveryService = new GitHubDeliveryService();
  private readonly historyService = new RunHistoryService();
  private readonly memoryService = new MemoryService();
  private readonly runtimeEvidenceService = new RuntimeEvidenceService();
  private readonly routingService = new TaskRoutingService();
  private readonly runService = new RunService();

  health = (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        status: 'healthy',
        service: 'agent-os',
        timestamp: new Date().toISOString(),
      },
    });
  };

  summary = (_req: Request, res: Response) => {
    const registry = createRecoderComponentRegistry(this.repository.listOssComponents());
    res.json({
      success: true,
      data: buildAgentOsCockpitSummary({
        agents: this.repository.listAgents(),
        tasks: this.repository.listTasks(),
        runs: this.repository.listRuns(),
        instructionBundles: this.repository.listInstructionBundles(),
        approvals: this.repository.listApprovals(),
        artifacts: this.repository.listArtifacts(),
        runtimeEvidence: this.repository.listRuntimeEvidence(),
        memoryCandidates: this.repository.listMemoryCandidates(),
        policyDecisions: this.repository.listPolicyDecisions(),
        workLocks: this.repository.listWorkLocks(),
        ossComponents: registry.list(),
        securityRisks: registry.securityRisks(),
      }),
    });
  };

  agents = (_req: Request, res: Response) => {
    res.json({ success: true, data: this.repository.listAgents() });
  };

  upsertAgent = (req: Request, res: Response) => {
    res.status(201).json({ success: true, data: this.repository.upsertAgent(req.body) });
  };

  reconcileAgent = (req: Request, res: Response) => {
    try {
      const incoming = isRecord(req.body?.incoming) ? req.body.incoming : req.body?.profile;
      if (!isRecord(incoming)) {
        res.status(400).json({ success: false, error: 'incoming AgentProfile is required' });
        return;
      }

      const result = this.agentProfiles.reconcile({
        existingAgents: this.repository.listAgents(),
        incoming: incoming as AgentProfile,
        binding: isRecord(req.body?.binding) ? req.body.binding as { workspaceId?: string; projectId?: string; sessionScope?: string } : undefined,
        policyMode: req.body?.policyMode === 'replace_with_incoming' ? 'replace_with_incoming' : 'preserve_existing',
      });
      this.repository.upsertAgent(result.profile);
      res.status(result.action === 'created' ? 201 : 200).json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'agent_reconcile_failed',
      });
    }
  };

  spaces = (_req: Request, res: Response) => {
    res.json({ success: true, data: this.repository.listSpaces() });
  };

  upsertSpace = (req: Request, res: Response) => {
    res.status(201).json({ success: true, data: this.repository.upsertSpace(req.body) });
  };

  connectGitHubRepository = (req: Request, res: Response) => {
    try {
      const space = this.repository.listSpaces().find((candidate) => candidate.spaceId === req.params.spaceId);
      if (!space) {
        res.status(404).json({ success: false, error: `space not found: ${req.params.spaceId}` });
        return;
      }
      const updated = this.githubDeliveryService.connectRepository(space, {
        owner: requiredString(req.body?.owner, 'owner'),
        name: requiredString(req.body?.name, 'name'),
        repoId: optionalString(req.body?.repoId),
        defaultBranch: optionalString(req.body?.defaultBranch),
        url: optionalString(req.body?.url),
      });
      res.status(201).json({ success: true, data: this.repository.upsertSpace(updated) });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'github_repository_connect_failed',
      });
    }
  };

  tasks = (_req: Request, res: Response) => {
    res.json({ success: true, data: this.repository.listTasks() });
  };

  upsertTask = (req: Request, res: Response) => {
    try {
      const task = this.repository.upsertTask(req.body);
      this.appendTaskOutbox(task);
      res.status(201).json({ success: true, data: task });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'task_upsert_failed',
      });
    }
  };

  routeTask = (req: Request, res: Response) => {
    try {
      const task = this.resolveTask(req.body);
      const route = this.routingService.route({
        task,
        agents: this.repository.listAgents(),
        space: this.repository.listSpaces().find((candidate) => candidate.spaceId === task.spaceId),
        requestedAssigneeAgentId: optionalString(req.body?.assigneeAgentId) ?? optionalString(req.body?.requestedAssigneeAgentId),
        requiredCapabilityIds: stringArray(req.body?.requiredCapabilityIds),
      });
      const run = this.markRoutedRun(req.body, route);
      res.json({ success: true, data: { route, run } });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'task_route_failed',
      });
    }
  };

  runs = (_req: Request, res: Response) => {
    res.json({ success: true, data: this.repository.listRuns() });
  };

  upsertRun = (req: Request, res: Response) => {
    try {
      const run = this.repository.upsertRun(req.body);
      this.appendTaskRunOutbox(run);
      res.status(201).json({ success: true, data: run });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'run_upsert_failed',
      });
    }
  };

  runHistory = (req: Request, res: Response) => {
    const run = this.repository.listRuns().find((candidate) => candidate.runId === req.params.runId);
    if (!run) {
      res.status(404).json({ success: false, error: `run not found: ${req.params.runId}` });
      return;
    }

    res.json({ success: true, data: this.buildRunHistory(run) });
  };

  claimRun = (req: Request, res: Response) => {
    try {
      const run = this.markClaimedRun(req.params.runId, req.body);
      res.json({ success: true, data: run });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'run_claim_failed';
      res.status(message.includes('not found') ? 404 : 409).json({ success: false, error: message });
    }
  };

  transitionRun = (req: Request, res: Response) => {
    try {
      const run = this.markRequestedRunTransition(req.params.runId, req.body);
      res.json({ success: true, data: run });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'run_transition_failed';
      res.status(message.includes('not found') ? 404 : 409).json({ success: false, error: message });
    }
  };

  createVerificationResult = (req: Request, res: Response) => {
    try {
      const run = this.repository.listRuns().find((candidate) => candidate.runId === req.params.runId);
      if (!run) {
        res.status(404).json({ success: false, error: `run not found: ${req.params.runId}` });
        return;
      }

      const artifact = this.artifactService.createVerification({
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
      this.repository.upsertArtifact(artifact);
      this.appendArtifactOutbox(artifact);
      this.appendArtifactEvent(run, artifact, 'verification_result');

      const transitionedRun = this.maybeTransitionRunForArtifact(run, req.body, artifact);
      res.status(201).json({ success: true, data: { artifact, run: transitionedRun ?? this.repository.listRuns().find((candidate) => candidate.runId === run.runId) ?? run } });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'verification_result_failed',
      });
    }
  };

  taskHistory = (req: Request, res: Response) => {
    const runs = this.repository.listRuns().filter((candidate) => candidate.taskId === req.params.taskId);
    if (runs.length === 0) {
      res.status(404).json({ success: false, error: `task history not found: ${req.params.taskId}` });
      return;
    }

    res.json({ success: true, data: runs.map((run) => this.buildRunHistory(run)) });
  };

  approvals = (_req: Request, res: Response) => {
    res.json({ success: true, data: this.repository.listApprovals() });
  };

  upsertApproval = (req: Request, res: Response) => {
    try {
      const approval = this.repository.upsertApproval(req.body);
      this.appendApprovalOutbox(approval);
      res.status(201).json({ success: true, data: approval });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'approval_upsert_failed',
      });
    }
  };

  approve = (req: Request, res: Response) => {
    this.decideApproval(req, res, 'approved');
  };

  reject = (req: Request, res: Response) => {
    this.decideApproval(req, res, 'rejected');
  };

  artifacts = (_req: Request, res: Response) => {
    res.json({ success: true, data: this.repository.listArtifacts() });
  };

  upsertArtifact = (req: Request, res: Response) => {
    try {
      const artifact = this.repository.upsertArtifact(req.body);
      this.appendArtifactOutbox(artifact);
      res.status(201).json({ success: true, data: artifact });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'artifact_upsert_failed',
      });
    }
  };

  runtimeEvidence = (_req: Request, res: Response) => {
    res.json({ success: true, data: this.repository.listRuntimeEvidence() });
  };

  createRuntimeEvidence = (req: Request, res: Response) => {
    try {
      const evidence = this.runtimeEvidenceService.create({
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
      const stored = this.repository.upsertRuntimeEvidence(evidence);
      this.appendRuntimeEvidenceOutbox(stored);
      res.status(201).json({ success: true, data: stored });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'runtime_evidence_failed',
      });
    }
  };

  createPullRequestArtifact = (req: Request, res: Response) => {
    try {
      const artifact = this.artifactService.createPullRequest({
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
      this.repository.upsertArtifact(artifact);
      this.appendArtifactOutbox(artifact);
      const run = this.markDeliveredRun(req.body, artifact);
      res.status(201).json({ success: true, data: { artifact, run } });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'pull_request_artifact_failed',
      });
    }
  };

  createPreviewArtifact = (req: Request, res: Response) => {
    try {
      const artifact = this.artifactService.createPreview({
        taskId: requiredString(req.body?.taskId, 'taskId'),
        runId: optionalString(req.body?.runId),
        url: requiredString(req.body?.url, 'url'),
        provider: optionalString(req.body?.provider),
        environment: optionalString(req.body?.environment),
        public: typeof req.body?.public === 'boolean' ? req.body.public : false,
        createdBy: optionalString(req.body?.createdBy) ?? optionalString(req.body?.agentId) ?? 'agent-os',
        metadata: isRecord(req.body?.metadata) ? req.body.metadata : undefined,
      });
      this.repository.upsertArtifact(artifact);
      this.appendArtifactOutbox(artifact);
      const run = this.markDeliveredRun(req.body, artifact);
      res.status(201).json({ success: true, data: { artifact, run } });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'preview_artifact_failed',
      });
    }
  };

  githubDeliveryLinks = (_req: Request, res: Response) => {
    res.json({ success: true, data: this.repository.listGitHubDeliveryLinks() });
  };

  createGitHubDeliveryLink = (req: Request, res: Response) => {
    try {
      const task = this.resolveTask(req.body);
      const run = optionalString(req.body?.runId)
        ? this.repository.listRuns().find((candidate) => candidate.runId === req.body.runId)
        : undefined;
      const link = this.githubDeliveryService.createLink({
        task,
        run,
        space: this.repository.listSpaces().find((candidate) => candidate.spaceId === task.spaceId),
        repoId: optionalString(req.body?.repoId),
        repository: optionalString(req.body?.repository),
        branch: optionalString(req.body?.branch),
        baseBranch: optionalString(req.body?.baseBranch),
        issueNumber: typeof req.body?.issueNumber === 'string' || typeof req.body?.issueNumber === 'number' ? req.body.issueNumber : undefined,
        issueUrl: optionalString(req.body?.issueUrl),
        createdBy: optionalString(req.body?.createdBy) ?? optionalString(req.body?.agentId) ?? 'agent-os',
        metadata: isRecord(req.body?.metadata) ? req.body.metadata : undefined,
      });
      res.status(201).json({ success: true, data: this.repository.upsertGitHubDeliveryLink(link) });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'github_delivery_link_failed',
      });
    }
  };

  attachGitHubPullRequest = (req: Request, res: Response) => {
    try {
      const link = this.requiredGitHubDeliveryLink(req.params.linkId);
      const artifact = this.resolveOrCreatePullRequestArtifact(req.body, link);
      const updated = this.githubDeliveryService.attachPullRequest(link, artifact);
      res.json({ success: true, data: { link: this.repository.upsertGitHubDeliveryLink(updated), artifact } });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'github_delivery_pr_link_failed',
      });
    }
  };

  attachGitHubPreview = (req: Request, res: Response) => {
    try {
      const link = this.requiredGitHubDeliveryLink(req.params.linkId);
      const artifact = this.resolveOrCreatePreviewArtifact(req.body, link);
      const updated = this.githubDeliveryService.attachPreview(link, artifact);
      res.json({ success: true, data: { link: this.repository.upsertGitHubDeliveryLink(updated), artifact } });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'github_delivery_preview_link_failed',
      });
    }
  };

  syncGitHubChecks = (req: Request, res: Response) => {
    try {
      const link = this.requiredGitHubDeliveryLink(req.params.linkId);
      const updated = this.githubDeliveryService.syncChecks(link, Array.isArray(req.body?.checks) ? req.body.checks : []);
      res.json({ success: true, data: this.repository.upsertGitHubDeliveryLink(updated) });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'github_delivery_checks_failed',
      });
    }
  };

  syncGitHubReviews = (req: Request, res: Response) => {
    try {
      const link = this.requiredGitHubDeliveryLink(req.params.linkId);
      const updated = this.githubDeliveryService.syncReviews(link, Array.isArray(req.body?.reviews) ? req.body.reviews : []);
      res.json({ success: true, data: this.repository.upsertGitHubDeliveryLink(updated) });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'github_delivery_reviews_failed',
      });
    }
  };

  linkGitHubIssue = (req: Request, res: Response) => {
    try {
      const link = this.requiredGitHubDeliveryLink(req.params.linkId);
      const updated = this.githubDeliveryService.linkIssue(link, {
        issueNumber: typeof req.body?.issueNumber === 'string' || typeof req.body?.issueNumber === 'number' ? req.body.issueNumber : undefined,
        issueUrl: optionalString(req.body?.issueUrl),
      });
      res.json({ success: true, data: this.repository.upsertGitHubDeliveryLink(updated) });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'github_delivery_issue_link_failed',
      });
    }
  };

  memory = (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        items: this.repository.listMemoryItems(),
        candidates: this.repository.listMemoryCandidates(),
      },
    });
  };

  upsertMemoryCandidate = (req: Request, res: Response) => {
    try {
      const candidate = this.repository.upsertMemoryCandidate(req.body);
      this.appendMemoryCandidateOutbox(candidate);
      res.status(201).json({ success: true, data: candidate });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'memory_candidate_upsert_failed',
      });
    }
  };

  upsertMemoryItem = (req: Request, res: Response) => {
    try {
      const item = this.repository.upsertMemoryItem(req.body);
      this.appendMemoryItemOutbox(item);
      res.status(201).json({ success: true, data: item });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'memory_item_upsert_failed',
      });
    }
  };

  reviewMemoryCandidate = (req: Request, res: Response) => {
    try {
      const candidate = this.repository.listMemoryCandidates().find((item) => item.candidateId === req.params.candidateId);
      if (!candidate) {
        res.status(404).json({ success: false, error: `memory candidate not found: ${req.params.candidateId}` });
        return;
      }

      const result = this.memoryService.review(candidate, {
        accepted: readBoolean(req.body?.accepted, 'accepted'),
        reviewedBy: requiredString(req.body?.reviewedBy, 'reviewedBy'),
        reviewedAt: optionalString(req.body?.reviewedAt),
        reason: optionalString(req.body?.reason),
        memoryId: optionalString(req.body?.memoryId),
        supersedesMemoryId: optionalString(req.body?.supersedesMemoryId),
      });
      this.repository.upsertMemoryCandidate(result.candidate);
      this.appendMemoryCandidateOutbox(result.candidate);
      if (result.memory) {
        this.repository.upsertMemoryItem(result.memory);
        this.appendMemoryItemOutbox(result.memory);
      }
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'memory_review_failed',
      });
    }
  };

  instructions = (_req: Request, res: Response) => {
    res.json({ success: true, data: this.repository.listInstructionBundles() });
  };

  upsertInstructionBundle = (req: Request, res: Response) => {
    try {
      const bundle = this.repository.upsertInstructionBundle(req.body);
      const artifact = this.maybeCreateInstructionBundleArtifact(bundle, req.body);
      res.status(201).json({ success: true, data: { bundle, artifact } });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'instruction_upsert_failed',
      });
    }
  };

  compileInstructionBundle = (req: Request, res: Response) => {
    try {
      const result = compileAgentOsInstructionBundle(this.buildInstructionCompileInput(req.body));
      this.repository.upsertInstructionBundle(result.runtimeBundle);
      const artifact = this.maybeCreateInstructionBundleArtifact(result.runtimeBundle, {
        ...req.body,
        auditBundle: result.auditBundle,
      });
      const run = this.markCompiledRun(req.body, result.runtimeBundle.bundleId);
      res.status(201).json({ success: true, data: { ...result, artifact, run } });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'instruction_compile_failed',
      });
    }
  };

  policies = (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        policies: this.repository.listSpacePolicies(),
        decisions: this.repository.listPolicyDecisions(),
        workLocks: this.repository.listWorkLocks(),
      },
    });
  };

  upsertPolicy = (req: Request, res: Response) => {
    try {
      const { spaceId, policy } = req.body as { spaceId?: string; policy?: SpacePolicy };
      if (!spaceId || !policy) {
        res.status(400).json({ success: false, error: 'spaceId and policy are required' });
        return;
      }
      res.status(201).json({
        success: true,
        data: this.repository.upsertSpacePolicy(spaceId, policy),
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        error: error instanceof Error ? error.message : 'policy_upsert_failed',
      });
    }
  };

  upsertPolicyDecision = (req: Request, res: Response) => {
    try {
      const decision = this.repository.upsertPolicyDecision(req.body);
      const approval = this.maybeCreateApprovalFromPolicyDecision(decision, req.body);
      res.status(201).json({ success: true, data: { decision, approval } });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'policy_decision_failed',
      });
    }
  };

  workLocks = (_req: Request, res: Response) => {
    res.json({ success: true, data: this.repository.listWorkLocks() });
  };

  upsertWorkLock = (req: Request, res: Response) => {
    res.status(201).json({ success: true, data: this.repository.upsertWorkLock(req.body) });
  };

  acquireWorkLock = (req: Request, res: Response) => {
    if (!this.workLockService) {
      res.status(503).json({ success: false, error: 'work_lock_service_unavailable' });
      return;
    }

    try {
      const result = this.workLockService.acquire({
        ...req.body,
        existingLocks: this.repository.listWorkLocks(),
      });
      this.repository.replaceWorkLocks(result.locks);
      res.status(201).json({ success: true, data: result.lock });
    } catch (error) {
      res.status(409).json({
        success: false,
        error: error instanceof Error ? error.message : 'work_lock_conflict',
        conflicts: error instanceof Error && 'conflicts' in error ? error.conflicts : undefined,
      });
    }
  };

  releaseWorkLock = (req: Request, res: Response) => {
    if (!this.workLockService) {
      res.status(503).json({ success: false, error: 'work_lock_service_unavailable' });
      return;
    }

    const lockId = req.params.lockId;
    if (!lockId) {
      res.status(400).json({ success: false, error: 'lockId is required' });
      return;
    }

    const locks = this.workLockService.release(this.repository.listWorkLocks(), {
      lockId,
      ownerAgentId: typeof req.body?.ownerAgentId === 'string' ? req.body.ownerAgentId : undefined,
      taskId: typeof req.body?.taskId === 'string' ? req.body.taskId : undefined,
    });
    this.repository.replaceWorkLocks(locks);
    res.json({ success: true, data: locks });
  };

  events = (_req: Request, res: Response) => {
    res.json({ success: true, data: this.repository.listEvents() });
  };

  appendEvent = (req: Request, res: Response) => {
    const event = this.repository.appendEvent(req.body);
    this.appendRunEventOutbox(event);
    const application = this.applyRunEvent(event);
    res.status(201).json({
      success: true,
      data: {
        event,
        run: application?.run,
        eventAppliedToRun: application?.applied ?? false,
        eventApplicationReason: application?.reason,
      },
    });
  };

  outbox = (_req: Request, res: Response) => {
    res.json({ success: true, data: this.repository.listOutbox() });
  };

  oss = (_req: Request, res: Response) => {
    const registry = createRecoderComponentRegistry(this.repository.listOssComponents());
    res.json({
      success: true,
      data: {
        components: registry.list(),
        canonicalStateOwners: registry.canonicalStateOwners(),
        securityRisks: registry.securityRisks(),
        findings: registry.validateAll(),
      },
    });
  };

  ossComponent = (req: Request, res: Response) => {
    const component = this.repository.getOssComponent(req.params.componentId);
    if (!component) {
      res.status(404).json({ success: false, error: `component not found: ${req.params.componentId}` });
      return;
    }
    res.json({ success: true, data: component });
  };

  upsertOssComponent = (req: Request, res: Response) => {
    res.status(201).json({ success: true, data: this.repository.upsertOssComponent(req.body) });
  };

  workflows = (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        status: 'available',
        driver: 'agent-os-port',
      },
    });
  };

  private appendRunEventOutbox(event: RunEvent): void {
    this.repository.appendOutbox(createOutboxRecord(mapRunEventToCloudEvent(event)));
  }

  private appendTaskOutbox(task: TaskSpec): void {
    this.repository.appendOutbox(createOutboxRecord(mapTaskCreatedToCloudEvent({ data: task })));
  }

  private appendTaskRunOutbox(run: TaskRun): void {
    this.repository.appendOutbox(createOutboxRecord(mapTaskRunStateToCloudEvent({ data: run })));
  }

  private appendArtifactOutbox(artifact: Artifact): void {
    this.repository.appendOutbox(createOutboxRecord(mapArtifactToCloudEvent({ data: artifact })));
  }

  private appendRuntimeEvidenceOutbox(evidence: RuntimeEvidence): void {
    this.repository.appendOutbox(createOutboxRecord(mapRuntimeEvidenceToCloudEvent({ data: evidence })));
  }

  private appendApprovalOutbox(approval: Approval): void {
    this.repository.appendOutbox(createOutboxRecord(mapApprovalToCloudEvent({ data: approval })));
  }

  private appendMemoryCandidateOutbox(candidate: MemoryCandidate): void {
    this.repository.appendOutbox(createOutboxRecord(mapMemoryCandidateToCloudEvent({ data: candidate })));
  }

  private appendMemoryItemOutbox(item: MemoryItem): void {
    this.repository.appendOutbox(createOutboxRecord(mapMemoryItemAcceptedToCloudEvent({ data: item })));
  }

  private applyRunEvent(event: RunEvent): ReturnType<RunService['applyEvent']> | undefined {
    if (!event.runId) {
      return undefined;
    }

    const run = this.repository.listRuns().find((candidate) => candidate.runId === event.runId);
    if (!run) {
      return undefined;
    }

    const application = this.runService.applyEvent(run, event);
    this.repository.upsertRun(application.run);
    if (application.applied) {
      this.appendTaskRunOutbox(application.run);
    }
    return application;
  }

  private maybeCreateApprovalFromPolicyDecision(
    decision: PolicyDecision,
    body: Record<string, unknown>,
  ): Approval | undefined {
    if (body.createApproval === false) {
      return undefined;
    }

    const approval = this.approvalService.requestFromPolicyDecision({
      decision,
      runId: optionalString(body.runId),
      requestedBy: optionalString(body.requestedBy),
      requiredAt: readApprovalRequiredAt(body.requiredAt),
      target: readApprovalTarget(body.target) ?? readApprovalTarget(decision.metadata),
      metadata: {
        source: 'policy_decision_ingress',
      },
    });
    if (!approval) {
      return undefined;
    }
    const stored = this.repository.upsertApproval(approval);
    this.appendApprovalOutbox(stored);
    return stored;
  }

  private maybeCreateInstructionBundleArtifact(
    bundle: InstructionBundle,
    body: Record<string, unknown>,
  ): Artifact | undefined {
    if (body.createArtifact === false) {
      return undefined;
    }

    const artifact = this.artifactService.createInstructionBundle({
      taskId: bundle.taskId,
      runId: optionalString(body.runId),
      bundle,
      auditBundle: body.auditBundle,
      createdBy: optionalString(body.createdBy) ?? bundle.agentId,
      public: body.public === true,
      metadata: isRecord(body.metadata) ? body.metadata : undefined,
    });
    const stored = this.repository.upsertArtifact(artifact);
    this.appendArtifactOutbox(stored);
    return stored;
  }

  private buildInstructionCompileInput(body: Record<string, unknown>): CompileAgentOsInstructionBundleInput {
    return {
      ...body,
      task: this.resolveTask(body),
      agent: this.resolveAgent(body),
      repoRoot: typeof body.repoRoot === 'string' && body.repoRoot.length > 0 ? body.repoRoot : process.cwd(),
    } as CompileAgentOsInstructionBundleInput;
  }

  private buildRunHistory(run: TaskRun) {
    return this.historyService.build({
      run,
      task: this.repository.listTasks().find((candidate) => candidate.taskId === run.taskId),
      events: this.repository.listEvents(),
      artifacts: this.repository.listArtifacts(),
      runtimeEvidence: this.repository.listRuntimeEvidence(),
      approvals: this.repository.listApprovals(),
      policyDecisions: this.repository.listPolicyDecisions(),
      memoryCandidates: this.repository.listMemoryCandidates(),
      memoryItems: this.repository.listMemoryItems(),
      instructionBundles: this.repository.listInstructionBundles(),
      githubDeliveryLinks: this.repository.listGitHubDeliveryLinks(),
      workLocks: this.repository.listWorkLocks(),
    });
  }

  private requiredGitHubDeliveryLink(linkId: string): GitHubDeliveryLink {
    const link = this.repository.getGitHubDeliveryLink(linkId);
    if (!link) {
      throw new Error(`github delivery link not found: ${linkId}`);
    }
    return link;
  }

  private appendStateTransitionEvent(
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
    this.repository.appendEvent(event);
    this.appendRunEventOutbox(event);
    this.appendTaskRunOutbox(run);
  }

  private appendArtifactEvent(run: TaskRun, artifact: Artifact, reason: string): void {
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
    this.repository.appendEvent(event);
    this.appendRunEventOutbox(event);
  }

  private maybeTransitionRunForArtifact(run: TaskRun, body: Record<string, unknown>, artifact: Artifact): TaskRun | undefined {
    const requestedState = optionalString(body.transitionState) ?? optionalString(body.state);
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
        verificationPassed: artifact.metadata?.passed,
        verificationCommand: artifact.metadata?.command,
      },
    });
    const updated = this.repository.upsertRun(transitioned);
    this.appendStateTransitionEvent(run.state, updated, 'verification_result', {
      artifactId: artifact.artifactId,
    });
    return updated;
  }

  private resolveOrCreatePullRequestArtifact(body: Record<string, unknown>, link: GitHubDeliveryLink): Artifact {
    const artifactId = optionalString(body.artifactId);
    if (artifactId) {
      const artifact = this.repository.listArtifacts().find((candidate) => candidate.artifactId === artifactId);
      if (!artifact) {
        throw new Error(`artifact not found: ${artifactId}`);
      }
      return artifact;
    }

    const artifact = this.artifactService.createPullRequest({
      taskId: link.taskId,
      runId: link.runId,
      url: requiredString(body.url, 'url'),
      number: typeof body.number === 'string' || typeof body.number === 'number' ? body.number : undefined,
      branch: optionalString(body.branch) ?? link.branch,
      repository: optionalString(body.repository) ?? link.repository,
      title: optionalString(body.title),
      public: typeof body.public === 'boolean' ? body.public : false,
      createdBy: optionalString(body.createdBy) ?? optionalString(body.agentId) ?? 'agent-os',
      metadata: isRecord(body.metadata) ? body.metadata : undefined,
    });
    const stored = this.repository.upsertArtifact(artifact);
    this.appendArtifactOutbox(stored);
    return stored;
  }

  private resolveOrCreatePreviewArtifact(body: Record<string, unknown>, link: GitHubDeliveryLink): Artifact {
    const artifactId = optionalString(body.artifactId);
    if (artifactId) {
      const artifact = this.repository.listArtifacts().find((candidate) => candidate.artifactId === artifactId);
      if (!artifact) {
        throw new Error(`artifact not found: ${artifactId}`);
      }
      return artifact;
    }

    const artifact = this.artifactService.createPreview({
      taskId: link.taskId,
      runId: link.runId,
      url: requiredString(body.url, 'url'),
      provider: optionalString(body.provider),
      environment: optionalString(body.environment),
      public: typeof body.public === 'boolean' ? body.public : false,
      createdBy: optionalString(body.createdBy) ?? optionalString(body.agentId) ?? 'agent-os',
      metadata: isRecord(body.metadata) ? body.metadata : undefined,
    });
    const stored = this.repository.upsertArtifact(artifact);
    this.appendArtifactOutbox(stored);
    return stored;
  }

  private decideApproval(req: Request, res: Response, status: 'approved' | 'rejected'): void {
    try {
      const approval = this.repository.listApprovals().find((candidate) => candidate.approvalId === req.params.approvalId);
      if (!approval) {
        res.status(404).json({ success: false, error: `approval not found: ${req.params.approvalId}` });
        return;
      }

      const decided = this.approvalService.decide(
        approval,
        status,
        requiredString(req.body?.decidedBy, 'decidedBy'),
        optionalString(req.body?.reason) ?? optionalString(req.body?.decisionReason),
      );
      this.repository.upsertApproval(decided);
      this.appendApprovalOutbox(decided);
      const run = this.markApprovalDecisionRun(decided, status);
      res.json({ success: true, data: { approval: decided, run } });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'approval_decision_failed',
      });
    }
  }

  private markCompiledRun(body: Record<string, unknown>, instructionBundleId: string) {
    const requestedRunId = typeof body.runId === 'string' ? body.runId : undefined;
    const taskId = typeof body.taskId === 'string'
      ? body.taskId
      : isRecord(body.task) && typeof body.task.taskId === 'string'
        ? body.task.taskId
        : undefined;
    const run = requestedRunId
      ? this.repository.listRuns().find((candidate) => candidate.runId === requestedRunId)
      : this.repository.listRuns().find((candidate) => candidate.taskId === taskId && candidate.state === 'created');

    if (!run || !isAllowedTaskRunTransition(run.state, 'compiled')) {
      return undefined;
    }

    const transitioned = transitionTaskRun(run, 'compiled', {
      metadata: {
        instructionBundleId,
      },
    });
    const updated = this.repository.upsertRun({
      ...transitioned,
      instructionBundleId,
    });
    this.appendStateTransitionEvent(run.state, updated, 'instruction_compile', { instructionBundleId });
    return updated;
  }

  private markRoutedRun(body: Record<string, unknown>, route: ReturnType<TaskRoutingService['route']>): TaskRun | undefined {
    if (body.routeRun !== true && body.transitionToRouted !== true) {
      return undefined;
    }
    if (route.blocked || !route.selectedAgentId) {
      return undefined;
    }

    const requestedRunId = optionalString(body.runId);
    const run = requestedRunId
      ? this.repository.listRuns().find((candidate) => candidate.runId === requestedRunId)
      : this.repository.listRuns().find((candidate) => candidate.taskId === route.taskId && candidate.state === 'compiled');

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
    const updated = this.repository.upsertRun({
      ...transitioned,
      assigneeAgentId: route.selectedAgentId,
    });
    this.appendStateTransitionEvent(run.state, updated, 'task_route', {
      selectedAgentId: route.selectedAgentId,
      blocked: route.blocked,
    });
    return updated;
  }

  private markClaimedRun(runId: string, body: Record<string, unknown>): TaskRun {
    const agentId = requiredString(body.agentId, 'agentId');
    const run = this.repository.listRuns().find((candidate) => candidate.runId === runId);
    if (!run) {
      throw new Error(`run not found: ${runId}`);
    }

    const agent = this.repository.listAgents().find((candidate) => candidate.agentId === agentId);
    if (!agent) {
      throw new Error(`agent not found: ${agentId}`);
    }
    if (agent.health.status !== 'healthy' && agent.health.status !== 'degraded') {
      throw new Error(`agent health is ${agent.health.status}`);
    }
    if (run.assigneeAgentId && run.assigneeAgentId !== agentId) {
      throw new Error(`run is assigned to ${run.assigneeAgentId}`);
    }

    const task = this.repository.listTasks().find((candidate) => candidate.taskId === run.taskId);
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
    const updated = this.repository.upsertRun({
      ...transitioned,
      assigneeAgentId: agentId,
    });
    this.appendStateTransitionEvent(run.state, updated, 'run_claim', { agentId });
    return updated;
  }

  private markRequestedRunTransition(runId: string, body: Record<string, unknown>): TaskRun {
    const run = this.repository.listRuns().find((candidate) => candidate.runId === runId);
    if (!run) {
      throw new Error(`run not found: ${runId}`);
    }

    const nextState = requiredString(body.state, 'state') as TaskRunState;
    if (!isAllowedTaskRunTransition(run.state, nextState)) {
      throw new Error(`Invalid task run transition: ${run.state} -> ${nextState}`);
    }

    const now = optionalString(body.now) ?? new Date().toISOString();
    const transitioned = transitionTaskRun(run, nextState, {
      now,
      metadata: {
        ...(isRecord(body.metadata) ? body.metadata : {}),
        transitionRequestedBy: optionalString(body.agentId) ?? optionalString(body.requestedBy) ?? 'agent-os',
        transitionedAt: now,
      },
    });
    const updated = this.repository.upsertRun({
      ...transitioned,
      assigneeAgentId: optionalString(body.assigneeAgentId) ?? transitioned.assigneeAgentId,
    });
    this.appendStateTransitionEvent(run.state, updated, 'run_transition', {
      requestedBy: optionalString(body.agentId) ?? optionalString(body.requestedBy),
    });
    return updated;
  }

  private markDeliveredRun(body: Record<string, unknown>, artifact: Artifact): TaskRun | undefined {
    if (body.deliver !== true && body.transitionToDelivered !== true) {
      return undefined;
    }
    if (!artifact.runId) {
      return undefined;
    }

    const run = this.repository.listRuns().find((candidate) => candidate.runId === artifact.runId);
    if (!run || !isAllowedTaskRunTransition(run.state, 'delivered')) {
      return undefined;
    }

    const previousIds = Array.isArray(run.metadata?.deliveryArtifactIds)
      ? run.metadata.deliveryArtifactIds.filter((value): value is string => typeof value === 'string')
      : [];
    const transitioned = transitionTaskRun(run, 'delivered', {
      metadata: {
        deliveryArtifactIds: [...new Set([...previousIds, artifact.artifactId])],
        lastDeliveryArtifactId: artifact.artifactId,
        lastDeliveryArtifactKind: artifact.kind,
      },
    });
    const updated = this.repository.upsertRun(transitioned);
    this.appendStateTransitionEvent(run.state, updated, 'delivery_artifact', {
      artifactId: artifact.artifactId,
      artifactKind: artifact.kind,
    });
    return updated;
  }

  private markApprovalDecisionRun(approval: { approvalId: string; runId?: string; decidedBy?: string; decidedAt?: string }, status: 'approved' | 'rejected'): TaskRun | undefined {
    if (!approval.runId) {
      return undefined;
    }

    const run = this.repository.listRuns().find((candidate) => candidate.runId === approval.runId);
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
    const updated = this.repository.upsertRun(transitioned);
    this.appendStateTransitionEvent(run.state, updated, 'approval_decision', {
      approvalId: approval.approvalId,
      approvalStatus: status,
    });
    return updated;
  }

  private resolveTask(body: Record<string, unknown>): TaskSpec {
    if (isRecord(body.task)) {
      return body.task as TaskSpec;
    }
    const taskId = typeof body.taskId === 'string' ? body.taskId : undefined;
    const task = taskId ? this.repository.listTasks().find((candidate) => candidate.taskId === taskId) : undefined;
    if (!task) {
      throw new Error('task or taskId for an existing task is required');
    }
    return task;
  }

  private resolveAgent(body: Record<string, unknown>): AgentProfile {
    if (isRecord(body.agent)) {
      return body.agent as AgentProfile;
    }
    const agentId = typeof body.agentId === 'string' ? body.agentId : undefined;
    const agent = agentId ? this.repository.listAgents().find((candidate) => candidate.agentId === agentId) : undefined;
    if (!agent) {
      throw new Error('agent or agentId for an existing agent is required');
    }
    return agent;
  }
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
  const path = optionalString(value.path);
  const command = optionalString(value.command);
  const toolName = optionalString(value.toolName);
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

function supportsAgentIntent(agent: AgentProfile, intent: TaskSpec['intent']): boolean {
  return agent.supportedTaskIntents.includes(intent) || agent.supportedTaskIntents.includes('*');
}
