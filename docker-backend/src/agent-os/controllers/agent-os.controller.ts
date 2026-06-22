import type { Request, Response } from 'express';
import type { AgentProfile, Approval, Artifact, CreateRuntimeEvidenceInput, GitHubDeliveryLink, InstructionBundle, MemoryCandidate, MemoryItem, PolicyDecision, RunEvent, RuntimeEvidence, SpacePolicy, TaskRun, TaskRunState, TaskSpec, WorkLockService, WorkSignal } from '@recoder/agent-os';
import {
  AgentProfileReconciliationService,
  ApprovalService,
  ArtifactService,
  GitHubDeliveryService,
  isAllowedTaskRunTransition,
  isTerminalTaskRunState,
  MemoryService,
  RuntimeEvidenceService,
  RunHistoryService,
  RunService,
  TaskRoutingService,
  transitionTaskRun,
  WorkSignalService,
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
} from '@recoder/agent-events';
import { createRecoderComponentRegistry } from '@recoder/oss-registry';
import { buildAgentOsCockpitSummary } from '@recoder/ui-agent-os';
import type { AgentOsRepository } from '../repositories/agent-os.repository';
import type { AgentOsRepositoryDriver } from '../service-container';
import { buildTaskContextPack } from '../../git-context.js';

export class AgentOsController {
  constructor(
    private readonly repository: AgentOsRepository,
    private readonly workLockService?: WorkLockService,
    private readonly repositoryDriver?: AgentOsRepositoryDriver,
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
  private readonly workSignalService = new WorkSignalService();

  health = async (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        status: 'healthy',
        service: 'agent-os',
        repository: this.repositoryDriver ?? 'unknown',
        timestamp: new Date().toISOString(),
      },
    });
  };

  summary = async (_req: Request, res: Response) => {
    const registry = createRecoderComponentRegistry((await this.repository.listOssComponents()));
    res.json({
      success: true,
      data: buildAgentOsCockpitSummary({
        agents: (await this.repository.listAgents()),
        tasks: (await this.repository.listTasks()),
        runs: (await this.repository.listRuns()),
        instructionBundles: (await this.repository.listInstructionBundles()),
        approvals: (await this.repository.listApprovals()),
        artifacts: (await this.repository.listArtifacts()),
        runtimeEvidence: (await this.repository.listRuntimeEvidence()),
        workSignals: await this.refreshWorkSignals(),
        memoryCandidates: (await this.repository.listMemoryCandidates()),
        policyDecisions: (await this.repository.listPolicyDecisions()),
        workLocks: (await this.repository.listWorkLocks()),
        ossComponents: registry.list(),
        securityRisks: registry.securityRisks(),
      }),
    });
  };

  agents = async (_req: Request, res: Response) => {
    res.json({ success: true, data: (await this.repository.listAgents()) });
  };

  upsertAgent = async (req: Request, res: Response) => {
    res.status(201).json({ success: true, data: (await this.repository.upsertAgent(req.body)) });
  };

  reconcileAgent = async (req: Request, res: Response) => {
    try {
      const incoming = isRecord(req.body?.incoming) ? req.body.incoming : req.body?.profile;
      if (!isRecord(incoming)) {
        res.status(400).json({ success: false, error: 'incoming AgentProfile is required' });
        return;
      }

      const result = this.agentProfiles.reconcile({
        existingAgents: (await this.repository.listAgents()),
        incoming: incoming as AgentProfile,
        binding: isRecord(req.body?.binding) ? req.body.binding as { workspaceId?: string; projectId?: string; sessionScope?: string } : undefined,
        policyMode: req.body?.policyMode === 'replace_with_incoming' ? 'replace_with_incoming' : 'preserve_existing',
      });
      (await this.repository.upsertAgent(result.profile));
      res.status(result.action === 'created' ? 201 : 200).json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'agent_reconcile_failed',
      });
    }
  };

  spaces = async (_req: Request, res: Response) => {
    res.json({ success: true, data: (await this.repository.listSpaces()) });
  };

  upsertSpace = async (req: Request, res: Response) => {
    res.status(201).json({ success: true, data: (await this.repository.upsertSpace(req.body)) });
  };

  connectGitHubRepository = async (req: Request, res: Response) => {
    try {
      const space = (await this.repository.listSpaces()).find((candidate) => candidate.spaceId === req.params.spaceId);
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
      res.status(201).json({ success: true, data: (await this.repository.upsertSpace(updated)) });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'github_repository_connect_failed',
      });
    }
  };

  tasks = async (_req: Request, res: Response) => {
    res.json({ success: true, data: (await this.repository.listTasks()) });
  };

  upsertTask = async (req: Request, res: Response) => {
    try {
      const task = (await this.repository.upsertTask(req.body));
      await this.appendTaskOutbox(task);
      res.status(201).json({ success: true, data: task });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'task_upsert_failed',
      });
    }
  };

  routeTask = async (req: Request, res: Response) => {
    try {
      const task = await this.resolveTask(req.body);
      const route = this.routingService.route({
        task,
        agents: (await this.repository.listAgents()),
        space: (await this.repository.listSpaces()).find((candidate) => candidate.spaceId === task.spaceId),
        requestedAssigneeAgentId: optionalString(req.body?.assigneeAgentId) ?? optionalString(req.body?.requestedAssigneeAgentId),
        requiredCapabilityIds: stringArray(req.body?.requiredCapabilityIds),
      });
      const run = await this.markRoutedRun(req.body, route);
      res.json({ success: true, data: { route, run } });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'task_route_failed',
      });
    }
  };

  runs = async (_req: Request, res: Response) => {
    res.json({ success: true, data: (await this.repository.listRuns()) });
  };

  upsertRun = async (req: Request, res: Response) => {
    try {
      const run = (await this.repository.upsertRun(req.body));
      await this.appendTaskRunOutbox(run);
      res.status(201).json({ success: true, data: run });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'run_upsert_failed',
      });
    }
  };

  runHistory = async (req: Request, res: Response) => {
    const run = (await this.repository.listRuns()).find((candidate) => candidate.runId === req.params.runId);
    if (!run) {
      res.status(404).json({ success: false, error: `run not found: ${req.params.runId}` });
      return;
    }

    res.json({ success: true, data: await this.buildRunHistory(run) });
  };

  claimRun = async (req: Request, res: Response) => {
    try {
      const run = await this.markClaimedRun(req.params.runId, req.body);
      res.json({ success: true, data: run });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'run_claim_failed';
      res.status(message.includes('not found') ? 404 : 409).json({ success: false, error: message });
    }
  };

  transitionRun = async (req: Request, res: Response) => {
    try {
      const run = await this.markRequestedRunTransition(req.params.runId, req.body);
      res.json({ success: true, data: run });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'run_transition_failed';
      res.status(message.includes('not found') ? 404 : 409).json({ success: false, error: message });
    }
  };

  handoffRun = async (req: Request, res: Response) => {
    try {
      const run = await this.markHandoffRun(req.params.runId, req.body);
      res.json({ success: true, data: run });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'run_handoff_failed';
      res.status(message.includes('not found') ? 404 : 409).json({ success: false, error: message });
    }
  };

  createVerificationResult = async (req: Request, res: Response) => {
    try {
      const run = (await this.repository.listRuns()).find((candidate) => candidate.runId === req.params.runId);
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
      (await this.repository.upsertArtifact(artifact));
      await this.appendArtifactOutbox(artifact);
      await this.appendArtifactEvent(run, artifact, 'verification_result');

      const transitionedRun = await this.maybeTransitionRunForArtifact(run, req.body, artifact);
      res.status(201).json({ success: true, data: { artifact, run: transitionedRun ?? (await this.repository.listRuns()).find((candidate) => candidate.runId === run.runId) ?? run } });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'verification_result_failed',
      });
    }
  };

  taskHistory = async (req: Request, res: Response) => {
    const runs = (await this.repository.listRuns()).filter((candidate) => candidate.taskId === req.params.taskId);
    if (runs.length === 0) {
      res.status(404).json({ success: false, error: `task history not found: ${req.params.taskId}` });
      return;
    }

    res.json({ success: true, data: await Promise.all(runs.map((run) => this.buildRunHistory(run))) });
  };

  /**
   * Git Nexus code-context pack for a task — dependency graph, ownership map,
   * test targets, impact report, and source refs, produced by the owned
   * @recoder/git-nexus engine. Surfaces repo intelligence into the control plane.
   */
  taskContextPack = async (req: Request, res: Response) => {
    const task = (await this.repository.listTasks()).find((candidate) => candidate.taskId === req.params.taskId);
    if (!task) {
      res.status(404).json({ success: false, error: `task not found: ${req.params.taskId}` });
      return;
    }
    const repoRoot = optionalString(req.query?.repoRoot) ?? process.cwd();
    res.json({ success: true, data: buildTaskContextPack(task, repoRoot) });
  };

  approvals = async (_req: Request, res: Response) => {
    res.json({ success: true, data: (await this.repository.listApprovals()) });
  };

  upsertApproval = async (req: Request, res: Response) => {
    try {
      const approval = (await this.repository.upsertApproval(req.body));
      await this.appendApprovalOutbox(approval);
      res.status(201).json({ success: true, data: approval });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'approval_upsert_failed',
      });
    }
  };

  approve = async (req: Request, res: Response) => {
    await this.decideApproval(req, res, 'approved');
  };

  reject = async (req: Request, res: Response) => {
    await this.decideApproval(req, res, 'rejected');
  };

  artifacts = async (_req: Request, res: Response) => {
    res.json({ success: true, data: (await this.repository.listArtifacts()) });
  };

  upsertArtifact = async (req: Request, res: Response) => {
    try {
      const artifact = (await this.repository.upsertArtifact(req.body));
      await this.appendArtifactOutbox(artifact);
      res.status(201).json({ success: true, data: artifact });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'artifact_upsert_failed',
      });
    }
  };

  runtimeEvidence = async (_req: Request, res: Response) => {
    res.json({ success: true, data: (await this.repository.listRuntimeEvidence()) });
  };

  createRuntimeEvidence = async (req: Request, res: Response) => {
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
      const stored = (await this.repository.upsertRuntimeEvidence(evidence));
      await this.appendRuntimeEvidenceOutbox(stored);
      res.status(201).json({ success: true, data: stored });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'runtime_evidence_failed',
      });
    }
  };

  createPullRequestArtifact = async (req: Request, res: Response) => {
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
      (await this.repository.upsertArtifact(artifact));
      await this.appendArtifactOutbox(artifact);
      const run = await this.markDeliveredRun(req.body, artifact);
      res.status(201).json({ success: true, data: { artifact, run } });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'pull_request_artifact_failed',
      });
    }
  };

  createPreviewArtifact = async (req: Request, res: Response) => {
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
      (await this.repository.upsertArtifact(artifact));
      await this.appendArtifactOutbox(artifact);
      const run = await this.markDeliveredRun(req.body, artifact);
      res.status(201).json({ success: true, data: { artifact, run } });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'preview_artifact_failed',
      });
    }
  };

  githubDeliveryLinks = async (_req: Request, res: Response) => {
    res.json({ success: true, data: (await this.repository.listGitHubDeliveryLinks()) });
  };

  createGitHubDeliveryLink = async (req: Request, res: Response) => {
    try {
      const task = await this.resolveTask(req.body);
      const run = optionalString(req.body?.runId)
        ? (await this.repository.listRuns()).find((candidate) => candidate.runId === req.body.runId)
        : undefined;
      const link = this.githubDeliveryService.createLink({
        task,
        run,
        space: (await this.repository.listSpaces()).find((candidate) => candidate.spaceId === task.spaceId),
        repoId: optionalString(req.body?.repoId),
        repository: optionalString(req.body?.repository),
        branch: optionalString(req.body?.branch),
        baseBranch: optionalString(req.body?.baseBranch),
        issueNumber: typeof req.body?.issueNumber === 'string' || typeof req.body?.issueNumber === 'number' ? req.body.issueNumber : undefined,
        issueUrl: optionalString(req.body?.issueUrl),
        createdBy: optionalString(req.body?.createdBy) ?? optionalString(req.body?.agentId) ?? 'agent-os',
        metadata: isRecord(req.body?.metadata) ? req.body.metadata : undefined,
      });
      res.status(201).json({ success: true, data: (await this.repository.upsertGitHubDeliveryLink(link)) });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'github_delivery_link_failed',
      });
    }
  };

  attachGitHubPullRequest = async (req: Request, res: Response) => {
    try {
      const link = await this.requiredGitHubDeliveryLink(req.params.linkId);
      const artifact = await this.resolveOrCreatePullRequestArtifact(req.body, link);
      const updated = this.githubDeliveryService.attachPullRequest(link, artifact);
      res.json({ success: true, data: { link: (await this.repository.upsertGitHubDeliveryLink(updated)), artifact } });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'github_delivery_pr_link_failed',
      });
    }
  };

  attachGitHubPreview = async (req: Request, res: Response) => {
    try {
      const link = await this.requiredGitHubDeliveryLink(req.params.linkId);
      const artifact = await this.resolveOrCreatePreviewArtifact(req.body, link);
      const updated = this.githubDeliveryService.attachPreview(link, artifact);
      res.json({ success: true, data: { link: (await this.repository.upsertGitHubDeliveryLink(updated)), artifact } });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'github_delivery_preview_link_failed',
      });
    }
  };

  syncGitHubChecks = async (req: Request, res: Response) => {
    try {
      const link = await this.requiredGitHubDeliveryLink(req.params.linkId);
      const updated = this.githubDeliveryService.syncChecks(link, Array.isArray(req.body?.checks) ? req.body.checks : []);
      res.json({ success: true, data: (await this.repository.upsertGitHubDeliveryLink(updated)) });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'github_delivery_checks_failed',
      });
    }
  };

  syncGitHubReviews = async (req: Request, res: Response) => {
    try {
      const link = await this.requiredGitHubDeliveryLink(req.params.linkId);
      const updated = this.githubDeliveryService.syncReviews(link, Array.isArray(req.body?.reviews) ? req.body.reviews : []);
      res.json({ success: true, data: (await this.repository.upsertGitHubDeliveryLink(updated)) });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'github_delivery_reviews_failed',
      });
    }
  };

  linkGitHubIssue = async (req: Request, res: Response) => {
    try {
      const link = await this.requiredGitHubDeliveryLink(req.params.linkId);
      const updated = this.githubDeliveryService.linkIssue(link, {
        issueNumber: typeof req.body?.issueNumber === 'string' || typeof req.body?.issueNumber === 'number' ? req.body.issueNumber : undefined,
        issueUrl: optionalString(req.body?.issueUrl),
      });
      res.json({ success: true, data: (await this.repository.upsertGitHubDeliveryLink(updated)) });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'github_delivery_issue_link_failed',
      });
    }
  };

  workSignals = async (_req: Request, res: Response) => {
    res.json({ success: true, data: await this.refreshWorkSignals() });
  };

  upsertWorkSignal = async (req: Request, res: Response) => {
    try {
      const signal = (await this.repository.upsertWorkSignal(req.body));
      await this.appendWorkSignalOutbox(signal);
      res.status(201).json({ success: true, data: signal });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'work_signal_upsert_failed',
      });
    }
  };

  resolveWorkSignal = async (req: Request, res: Response) => {
    try {
      await this.refreshWorkSignals();
      const signal = (await this.repository.getWorkSignal(req.params.signalId));
      if (!signal) {
        res.status(404).json({ success: false, error: `work signal not found: ${req.params.signalId}` });
        return;
      }
      if (req.body?.status !== 'resolved') {
        res.status(400).json({ success: false, error: 'Only status=resolved is supported for now' });
        return;
      }
      const resolved = this.workSignalService.resolve(signal, {
        resolvedBy: requiredString(req.body?.resolvedBy, 'resolvedBy'),
        resolvedAt: optionalString(req.body?.resolvedAt),
      });
      const stored = (await this.repository.upsertWorkSignal(resolved));
      await this.appendWorkSignalOutbox(stored);
      res.json({ success: true, data: stored });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'work_signal_status_failed',
      });
    }
  };

  memory = async (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        items: (await this.repository.listMemoryItems()),
        candidates: (await this.repository.listMemoryCandidates()),
      },
    });
  };

  upsertMemoryCandidate = async (req: Request, res: Response) => {
    try {
      const candidate = (await this.repository.upsertMemoryCandidate(req.body));
      await this.appendMemoryCandidateOutbox(candidate);
      res.status(201).json({ success: true, data: candidate });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'memory_candidate_upsert_failed',
      });
    }
  };

  upsertMemoryItem = async (req: Request, res: Response) => {
    try {
      const item = (await this.repository.upsertMemoryItem(req.body));
      await this.appendMemoryItemOutbox(item);
      res.status(201).json({ success: true, data: item });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'memory_item_upsert_failed',
      });
    }
  };

  reviewMemoryCandidate = async (req: Request, res: Response) => {
    try {
      const candidate = (await this.repository.listMemoryCandidates()).find((item) => item.candidateId === req.params.candidateId);
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
      (await this.repository.upsertMemoryCandidate(result.candidate));
      await this.appendMemoryCandidateOutbox(result.candidate);
      if (result.memory) {
        (await this.repository.upsertMemoryItem(result.memory));
        await this.appendMemoryItemOutbox(result.memory);
      }
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'memory_review_failed',
      });
    }
  };

  instructions = async (_req: Request, res: Response) => {
    res.json({ success: true, data: (await this.repository.listInstructionBundles()) });
  };

  upsertInstructionBundle = async (req: Request, res: Response) => {
    try {
      const bundle = (await this.repository.upsertInstructionBundle(req.body));
      const artifact = await this.maybeCreateInstructionBundleArtifact(bundle, req.body);
      res.status(201).json({ success: true, data: { bundle, artifact } });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'instruction_upsert_failed',
      });
    }
  };

  compileInstructionBundle = async (req: Request, res: Response) => {
    try {
      const result = compileAgentOsInstructionBundle(await this.buildInstructionCompileInput(req.body));
      (await this.repository.upsertInstructionBundle(result.runtimeBundle));
      const artifact = await this.maybeCreateInstructionBundleArtifact(result.runtimeBundle, {
        ...req.body,
        auditBundle: result.auditBundle,
      });
      const run = await this.markCompiledRun(req.body, result.runtimeBundle.bundleId);
      res.status(201).json({ success: true, data: { ...result, artifact, run } });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'instruction_compile_failed',
      });
    }
  };

  policies = async (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        policies: (await this.repository.listSpacePolicies()),
        decisions: (await this.repository.listPolicyDecisions()),
        workLocks: (await this.repository.listWorkLocks()),
      },
    });
  };

  upsertPolicy = async (req: Request, res: Response) => {
    try {
      const { spaceId, policy } = req.body as { spaceId?: string; policy?: SpacePolicy };
      if (!spaceId || !policy) {
        res.status(400).json({ success: false, error: 'spaceId and policy are required' });
        return;
      }
      res.status(201).json({
        success: true,
        data: (await this.repository.upsertSpacePolicy(spaceId, policy)),
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        error: error instanceof Error ? error.message : 'policy_upsert_failed',
      });
    }
  };

  upsertPolicyDecision = async (req: Request, res: Response) => {
    try {
      const decision = (await this.repository.upsertPolicyDecision(req.body));
      const approval = await this.maybeCreateApprovalFromPolicyDecision(decision, req.body);
      res.status(201).json({ success: true, data: { decision, approval } });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'policy_decision_failed',
      });
    }
  };

  workLocks = async (_req: Request, res: Response) => {
    res.json({ success: true, data: (await this.repository.listWorkLocks()) });
  };

  upsertWorkLock = async (req: Request, res: Response) => {
    res.status(201).json({ success: true, data: (await this.repository.upsertWorkLock(req.body)) });
  };

  acquireWorkLock = async (req: Request, res: Response) => {
    if (!this.workLockService) {
      res.status(503).json({ success: false, error: 'work_lock_service_unavailable' });
      return;
    }

    try {
      const result = this.workLockService.acquire({
        ...req.body,
        existingLocks: (await this.repository.listWorkLocks()),
      });
      (await this.repository.replaceWorkLocks(result.locks));
      res.status(201).json({ success: true, data: result.lock });
    } catch (error) {
      res.status(409).json({
        success: false,
        error: error instanceof Error ? error.message : 'work_lock_conflict',
        conflicts: error instanceof Error && 'conflicts' in error ? error.conflicts : undefined,
      });
    }
  };

  releaseWorkLock = async (req: Request, res: Response) => {
    if (!this.workLockService) {
      res.status(503).json({ success: false, error: 'work_lock_service_unavailable' });
      return;
    }

    const lockId = req.params.lockId;
    if (!lockId) {
      res.status(400).json({ success: false, error: 'lockId is required' });
      return;
    }

    const locks = this.workLockService.release((await this.repository.listWorkLocks()), {
      lockId,
      ownerAgentId: typeof req.body?.ownerAgentId === 'string' ? req.body.ownerAgentId : undefined,
      taskId: typeof req.body?.taskId === 'string' ? req.body.taskId : undefined,
    });
    (await this.repository.replaceWorkLocks(locks));
    res.json({ success: true, data: locks });
  };

  events = async (_req: Request, res: Response) => {
    res.json({ success: true, data: (await this.repository.listEvents()) });
  };

  appendEvent = async (req: Request, res: Response) => {
    try {
      const runtimeEvidenceInputs = this.runtimeEvidenceInputsFromRunEvent(req.body as RunEvent);
      const event = (await this.repository.appendEvent(req.body));
      await this.appendRunEventOutbox(event);
      const runtimeEvidence = await this.projectRuntimeEvidenceFromRunEvent(runtimeEvidenceInputs);
      const application = await this.applyRunEvent(event);
      res.status(201).json({
        success: true,
        data: {
          event,
          run: application?.run,
          eventAppliedToRun: application?.applied ?? false,
          eventApplicationReason: application?.reason,
          runtimeEvidence,
        },
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'run_event_append_failed',
      });
    }
  };

  outbox = async (_req: Request, res: Response) => {
    res.json({ success: true, data: (await this.repository.listOutbox()) });
  };

  oss = async (_req: Request, res: Response) => {
    const registry = createRecoderComponentRegistry((await this.repository.listOssComponents()));
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

  ossComponent = async (req: Request, res: Response) => {
    const component = (await this.repository.getOssComponent(req.params.componentId));
    if (!component) {
      res.status(404).json({ success: false, error: `component not found: ${req.params.componentId}` });
      return;
    }
    res.json({ success: true, data: component });
  };

  upsertOssComponent = async (req: Request, res: Response) => {
    res.status(201).json({ success: true, data: (await this.repository.upsertOssComponent(req.body)) });
  };

  workflows = async (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        status: 'available',
        driver: 'agent-os-port',
      },
    });
  };

  private async appendRunEventOutbox(event: RunEvent): Promise<void> {
    (await this.repository.appendOutbox(createOutboxRecord(mapRunEventToCloudEvent(event))));
  }

  private async appendTaskOutbox(task: TaskSpec): Promise<void> {
    (await this.repository.appendOutbox(createOutboxRecord(mapTaskCreatedToCloudEvent({ data: task }))));
  }

  private async appendTaskRunOutbox(run: TaskRun): Promise<void> {
    (await this.repository.appendOutbox(createOutboxRecord(mapTaskRunStateToCloudEvent({ data: run }))));
  }

  private async appendArtifactOutbox(artifact: Artifact): Promise<void> {
    (await this.repository.appendOutbox(createOutboxRecord(mapArtifactToCloudEvent({ data: artifact }))));
  }

  private async appendRuntimeEvidenceOutbox(evidence: RuntimeEvidence): Promise<void> {
    (await this.repository.appendOutbox(createOutboxRecord(mapRuntimeEvidenceToCloudEvent({ data: evidence }))));
  }

  private async appendWorkSignalOutbox(signal: WorkSignal): Promise<void> {
    (await this.repository.appendOutbox(createOutboxRecord(mapWorkSignalToCloudEvent({ data: signal }))));
  }

  private async appendApprovalOutbox(approval: Approval): Promise<void> {
    (await this.repository.appendOutbox(createOutboxRecord(mapApprovalToCloudEvent({ data: approval }))));
  }

  private async appendMemoryCandidateOutbox(candidate: MemoryCandidate): Promise<void> {
    (await this.repository.appendOutbox(createOutboxRecord(mapMemoryCandidateToCloudEvent({ data: candidate }))));
  }

  private async appendMemoryItemOutbox(item: MemoryItem): Promise<void> {
    (await this.repository.appendOutbox(createOutboxRecord(mapMemoryItemAcceptedToCloudEvent({ data: item }))));
  }

  private async applyRunEvent(event: RunEvent): Promise<ReturnType<RunService['applyEvent']> | undefined> {
    if (!event.runId) {
      return undefined;
    }

    const run = (await this.repository.listRuns()).find((candidate) => candidate.runId === event.runId);
    if (!run) {
      return undefined;
    }

    const application = this.runService.applyEvent(run, event);
    (await this.repository.upsertRun(application.run));
    if (application.applied) {
      await this.appendTaskRunOutbox(application.run);
    }
    return application;
  }

  private runtimeEvidenceInputsFromRunEvent(event: RunEvent): CreateRuntimeEvidenceInput[] {
    return runtimeEvidencePayloads(event.data).map((payload, index) => {
      if (!isRecord(payload)) {
        throw new Error(`runtimeEvidence[${index}] object is required`);
      }
      const kind = requiredString(payload.kind, `runtimeEvidence[${index}].kind`) as RuntimeEvidence['kind'];
      const metadata = isRecord(payload.metadata) ? payload.metadata : {};
      return {
        evidenceId: optionalString(payload.evidenceId),
        taskId: optionalString(payload.taskId) ?? event.taskId,
        runId: optionalString(payload.runId) ?? event.runId,
        kind,
        status: readRuntimeEvidenceStatus(payload.status),
        title: optionalString(payload.title),
        summary: optionalString(payload.summary),
        source: readRuntimeEvidenceSource(payload.source, event),
        artifactIds: stringArray(payload.artifactIds),
        observedAt: optionalString(payload.observedAt) ?? event.createdAt,
        metadata: {
          ...metadata,
          sourceRunEventId: event.eventId,
          sourceRunEventType: event.type,
          ...(event.agentId ? { sourceAgentId: event.agentId } : {}),
        },
      };
    });
  }

  private async projectRuntimeEvidenceFromRunEvent(inputs: CreateRuntimeEvidenceInput[]): Promise<RuntimeEvidence[]> {
    if (inputs.length === 0) {
      return [];
    }

    const existingEvidenceIds = new Set((await this.repository.listRuntimeEvidence()).map((evidence) => evidence.evidenceId));
    const projected: RuntimeEvidence[] = [];
    for (const input of inputs) {
      const evidence = this.runtimeEvidenceService.create(input);
      const stored = (await this.repository.upsertRuntimeEvidence(evidence));
      if (!existingEvidenceIds.has(stored.evidenceId)) {
        await this.appendRuntimeEvidenceOutbox(stored);
        existingEvidenceIds.add(stored.evidenceId);
      }
      projected.push(stored);
    }
    return projected;
  }

  private async maybeCreateApprovalFromPolicyDecision(
    decision: PolicyDecision,
    body: Record<string, unknown>,
  ): Promise<Approval | undefined> {
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
    const stored = (await this.repository.upsertApproval(approval));
    await this.appendApprovalOutbox(stored);
    return stored;
  }

  private async maybeCreateInstructionBundleArtifact(
    bundle: InstructionBundle,
    body: Record<string, unknown>,
  ): Promise<Artifact | undefined> {
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
    const stored = (await this.repository.upsertArtifact(artifact));
    await this.appendArtifactOutbox(stored);
    return stored;
  }

  private async buildInstructionCompileInput(body: Record<string, unknown>): Promise<CompileAgentOsInstructionBundleInput> {
    return {
      ...body,
      task: await this.resolveTask(body),
      agent: await this.resolveAgent(body),
      repoRoot: typeof body.repoRoot === 'string' && body.repoRoot.length > 0 ? body.repoRoot : process.cwd(),
    } as CompileAgentOsInstructionBundleInput;
  }

  private async buildRunHistory(run: TaskRun) {
    return this.historyService.build({
      run,
      task: (await this.repository.listTasks()).find((candidate) => candidate.taskId === run.taskId),
      events: (await this.repository.listEvents()),
      artifacts: (await this.repository.listArtifacts()),
      runtimeEvidence: (await this.repository.listRuntimeEvidence()),
      approvals: (await this.repository.listApprovals()),
      policyDecisions: (await this.repository.listPolicyDecisions()),
      memoryCandidates: (await this.repository.listMemoryCandidates()),
      memoryItems: (await this.repository.listMemoryItems()),
      instructionBundles: (await this.repository.listInstructionBundles()),
      githubDeliveryLinks: (await this.repository.listGitHubDeliveryLinks()),
      workLocks: (await this.repository.listWorkLocks()),
      workSignals: (await this.repository.listWorkSignals()),
    });
  }

  private async requiredGitHubDeliveryLink(linkId: string): Promise<GitHubDeliveryLink> {
    const link = (await this.repository.getGitHubDeliveryLink(linkId));
    if (!link) {
      throw new Error(`github delivery link not found: ${linkId}`);
    }
    return link;
  }

  private async refreshWorkSignals(): Promise<WorkSignal[]> {
    const detected: WorkSignal[] = this.workSignalService.detect({
      tasks: (await this.repository.listTasks()),
      runs: (await this.repository.listRuns()),
      artifacts: (await this.repository.listArtifacts()),
      approvals: (await this.repository.listApprovals()),
      githubDeliveryLinks: (await this.repository.listGitHubDeliveryLinks()),
      runtimeEvidence: (await this.repository.listRuntimeEvidence()),
      policyDecisions: (await this.repository.listPolicyDecisions()),
      existingSignals: (await this.repository.listWorkSignals()),
    });
    const detectedIds = new Set(detected.map((signal: WorkSignal) => signal.signalId));

    for (const signal of (await this.repository.listWorkSignals())) {
      if (signal.metadata?.generatedBy === 'work_signal_service' && !detectedIds.has(signal.signalId)) {
        (await this.repository.deleteWorkSignal(signal.signalId));
      }
    }

    for (const signal of detected) {
      const isNewSignal = !(await this.repository.getWorkSignal(signal.signalId));
      const stored = (await this.repository.upsertWorkSignal(signal));
      if (isNewSignal) {
        await this.appendWorkSignalOutbox(stored);
      }
    }

    return (await this.repository.listWorkSignals()).sort((a: WorkSignal, b: WorkSignal) => (
      workSignalSeverityRank(a.severity) - workSignalSeverityRank(b.severity)
      || a.detectedAt.localeCompare(b.detectedAt)
    ));
  }

  private async appendStateTransitionEvent(
    fromState: TaskRunState,
    run: TaskRun,
    reason: string,
    data: Record<string, unknown> = {},
  ): Promise<void> {
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
    (await this.repository.appendEvent(event));
    await this.appendRunEventOutbox(event);
    await this.appendTaskRunOutbox(run);
  }

  private async appendArtifactEvent(run: TaskRun, artifact: Artifact, reason: string): Promise<void> {
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
    (await this.repository.appendEvent(event));
    await this.appendRunEventOutbox(event);
  }

  private async maybeTransitionRunForArtifact(run: TaskRun, body: Record<string, unknown>, artifact: Artifact): Promise<TaskRun | undefined> {
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
    const updated = (await this.repository.upsertRun(transitioned));
    await this.appendStateTransitionEvent(run.state, updated, 'verification_result', {
      artifactId: artifact.artifactId,
    });
    return updated;
  }

  private async resolveOrCreatePullRequestArtifact(body: Record<string, unknown>, link: GitHubDeliveryLink): Promise<Artifact> {
    const artifactId = optionalString(body.artifactId);
    if (artifactId) {
      const artifact = (await this.repository.listArtifacts()).find((candidate) => candidate.artifactId === artifactId);
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
    const stored = (await this.repository.upsertArtifact(artifact));
    await this.appendArtifactOutbox(stored);
    return stored;
  }

  private async resolveOrCreatePreviewArtifact(body: Record<string, unknown>, link: GitHubDeliveryLink): Promise<Artifact> {
    const artifactId = optionalString(body.artifactId);
    if (artifactId) {
      const artifact = (await this.repository.listArtifacts()).find((candidate) => candidate.artifactId === artifactId);
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
    const stored = (await this.repository.upsertArtifact(artifact));
    await this.appendArtifactOutbox(stored);
    return stored;
  }

  private async decideApproval(req: Request, res: Response, status: 'approved' | 'rejected'): Promise<void> {
    try {
      const approval = (await this.repository.listApprovals()).find((candidate) => candidate.approvalId === req.params.approvalId);
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
      (await this.repository.upsertApproval(decided));
      await this.appendApprovalOutbox(decided);
      const run = await this.markApprovalDecisionRun(decided, status);
      res.json({ success: true, data: { approval: decided, run } });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'approval_decision_failed',
      });
    }
  }

  private async markCompiledRun(body: Record<string, unknown>, instructionBundleId: string) {
    const requestedRunId = typeof body.runId === 'string' ? body.runId : undefined;
    const taskId = typeof body.taskId === 'string'
      ? body.taskId
      : isRecord(body.task) && typeof body.task.taskId === 'string'
        ? body.task.taskId
        : undefined;
    const run = requestedRunId
      ? (await this.repository.listRuns()).find((candidate) => candidate.runId === requestedRunId)
      : (await this.repository.listRuns()).find((candidate) => candidate.taskId === taskId && candidate.state === 'created');

    if (!run || !isAllowedTaskRunTransition(run.state, 'compiled')) {
      return undefined;
    }

    const transitioned = transitionTaskRun(run, 'compiled', {
      metadata: {
        instructionBundleId,
      },
    });
    const updated = await this.repository.upsertRun({
      ...transitioned,
      instructionBundleId,
    });
    await this.appendStateTransitionEvent(run.state, updated, 'instruction_compile', { instructionBundleId });
    return updated;
  }

  private async markRoutedRun(body: Record<string, unknown>, route: ReturnType<TaskRoutingService['route']>): Promise<TaskRun | undefined> {
    if (body.routeRun !== true && body.transitionToRouted !== true) {
      return undefined;
    }
    if (route.blocked || !route.selectedAgentId) {
      return undefined;
    }

    const requestedRunId = optionalString(body.runId);
    const run = requestedRunId
      ? (await this.repository.listRuns()).find((candidate) => candidate.runId === requestedRunId)
      : (await this.repository.listRuns()).find((candidate) => candidate.taskId === route.taskId && candidate.state === 'compiled');

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
    const updated = await this.repository.upsertRun({
      ...transitioned,
      assigneeAgentId: route.selectedAgentId,
    });
    await this.appendStateTransitionEvent(run.state, updated, 'task_route', {
      selectedAgentId: route.selectedAgentId,
      blocked: route.blocked,
    });
    return updated;
  }

  private async markClaimedRun(runId: string, body: Record<string, unknown>): Promise<TaskRun> {
    const agentId = requiredString(body.agentId, 'agentId');
    const run = (await this.repository.listRuns()).find((candidate) => candidate.runId === runId);
    if (!run) {
      throw new Error(`run not found: ${runId}`);
    }

    const agent = (await this.repository.listAgents()).find((candidate) => candidate.agentId === agentId);
    if (!agent) {
      throw new Error(`agent not found: ${agentId}`);
    }
    if (agent.health.status !== 'healthy' && agent.health.status !== 'degraded') {
      throw new Error(`agent health is ${agent.health.status}`);
    }
    if (run.assigneeAgentId && run.assigneeAgentId !== agentId) {
      throw new Error(`run is assigned to ${run.assigneeAgentId}`);
    }

    const task = (await this.repository.listTasks()).find((candidate) => candidate.taskId === run.taskId);
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
    const updated = await this.repository.upsertRun({
      ...transitioned,
      assigneeAgentId: agentId,
    });
    await this.appendStateTransitionEvent(run.state, updated, 'run_claim', { agentId });
    return updated;
  }

  private async markHandoffRun(runId: string, body: Record<string, unknown>): Promise<TaskRun> {
    const toAgentId = requiredString(body.toAgentId ?? body.assigneeAgentId, 'toAgentId');
    const run = (await this.repository.listRuns()).find((candidate) => candidate.runId === runId);
    if (!run) {
      throw new Error(`run not found: ${runId}`);
    }
    if (isTerminalTaskRunState(run.state)) {
      throw new Error(`cannot hand off a run in terminal state ${run.state}`);
    }

    const toAgent = (await this.repository.listAgents()).find((candidate) => candidate.agentId === toAgentId);
    if (!toAgent) {
      throw new Error(`agent not found: ${toAgentId}`);
    }
    if (toAgent.health.status !== 'healthy' && toAgent.health.status !== 'degraded') {
      throw new Error(`agent health is ${toAgent.health.status}`);
    }

    const task = (await this.repository.listTasks()).find((candidate) => candidate.taskId === run.taskId);
    if (task && !supportsAgentIntent(toAgent, task.intent)) {
      throw new Error(`agent does not support task intent ${task.intent}`);
    }

    const fromAgentId = run.assigneeAgentId;
    const now = optionalString(body.now) ?? new Date().toISOString();
    const reason = optionalString(body.reason);
    const handoffPrompt = optionalString(body.handoffPrompt);
    const requestedBy = optionalString(body.requestedBy) ?? optionalString(body.agentId) ?? 'agent-os';

    // State is preserved on handoff: ownership, artifacts, approvals, and history
    // stay attached to the same run; only the assignee changes.
    const updated = await this.repository.upsertRun({
      ...run,
      assigneeAgentId: toAgentId,
      updatedAt: now,
      metadata: {
        ...(run.metadata ?? {}),
        lastHandoff: {
          fromAgentId: fromAgentId ?? null,
          toAgentId,
          reason: reason ?? null,
          handoffPrompt: handoffPrompt ?? null,
          requestedBy,
          handedOffAt: now,
        },
      },
    });

    const event: RunEvent = {
      eventId: `event_${run.runId}_handoff_${Date.now()}`,
      type: 'handoff',
      taskId: run.taskId,
      runId: run.runId,
      agentId: toAgentId,
      state: updated.state,
      message: `Run handed off ${fromAgentId ?? 'unassigned'} -> ${toAgentId}`,
      createdAt: now,
      data: {
        fromAgentId: fromAgentId ?? null,
        toAgentId,
        reason: reason ?? null,
        handoffPrompt: handoffPrompt ?? null,
        requestedBy,
      },
    };
    (await this.repository.appendEvent(event));
    await this.appendRunEventOutbox(event);
    await this.appendTaskRunOutbox(updated);
    return updated;
  }

  private async markRequestedRunTransition(runId: string, body: Record<string, unknown>): Promise<TaskRun> {
    const run = (await this.repository.listRuns()).find((candidate) => candidate.runId === runId);
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
    const updated = await this.repository.upsertRun({
      ...transitioned,
      assigneeAgentId: optionalString(body.assigneeAgentId) ?? transitioned.assigneeAgentId,
    });
    await this.appendStateTransitionEvent(run.state, updated, 'run_transition', {
      requestedBy: optionalString(body.agentId) ?? optionalString(body.requestedBy),
    });
    return updated;
  }

  private async markDeliveredRun(body: Record<string, unknown>, artifact: Artifact): Promise<TaskRun | undefined> {
    if (body.deliver !== true && body.transitionToDelivered !== true) {
      return undefined;
    }
    if (!artifact.runId) {
      return undefined;
    }

    const run = (await this.repository.listRuns()).find((candidate) => candidate.runId === artifact.runId);
    if (!run || !isAllowedTaskRunTransition(run.state, 'delivered')) {
      return undefined;
    }

    const previousIds = Array.isArray(run.metadata?.deliveryArtifactIds)
      ? run.metadata.deliveryArtifactIds.filter((value: unknown): value is string => typeof value === 'string')
      : [];
    const transitioned = transitionTaskRun(run, 'delivered', {
      metadata: {
        deliveryArtifactIds: [...new Set([...previousIds, artifact.artifactId])],
        lastDeliveryArtifactId: artifact.artifactId,
        lastDeliveryArtifactKind: artifact.kind,
      },
    });
    const updated = (await this.repository.upsertRun(transitioned));
    await this.appendStateTransitionEvent(run.state, updated, 'delivery_artifact', {
      artifactId: artifact.artifactId,
      artifactKind: artifact.kind,
    });
    return updated;
  }

  private async markApprovalDecisionRun(approval: { approvalId: string; runId?: string; decidedBy?: string; decidedAt?: string }, status: 'approved' | 'rejected'): Promise<TaskRun | undefined> {
    if (!approval.runId) {
      return undefined;
    }

    const run = (await this.repository.listRuns()).find((candidate) => candidate.runId === approval.runId);
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
    const updated = (await this.repository.upsertRun(transitioned));
    await this.appendStateTransitionEvent(run.state, updated, 'approval_decision', {
      approvalId: approval.approvalId,
      approvalStatus: status,
    });
    return updated;
  }

  private async resolveTask(body: Record<string, unknown>): Promise<TaskSpec> {
    if (isRecord(body.task)) {
      return body.task as TaskSpec;
    }
    const taskId = typeof body.taskId === 'string' ? body.taskId : undefined;
    const task = taskId ? (await this.repository.listTasks()).find((candidate) => candidate.taskId === taskId) : undefined;
    if (!task) {
      throw new Error('task or taskId for an existing task is required');
    }
    return task;
  }

  private async resolveAgent(body: Record<string, unknown>): Promise<AgentProfile> {
    if (isRecord(body.agent)) {
      return body.agent as AgentProfile;
    }
    const agentId = typeof body.agentId === 'string' ? body.agentId : undefined;
    const agent = agentId ? (await this.repository.listAgents()).find((candidate) => candidate.agentId === agentId) : undefined;
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

function runtimeEvidencePayloads(data: unknown): unknown[] {
  if (!isRecord(data)) {
    return [];
  }

  const payloads: unknown[] = [];
  const direct = data.runtimeEvidence;
  if (Array.isArray(direct)) {
    payloads.push(...direct);
  } else if (direct !== undefined) {
    payloads.push(direct);
  }

  const items = data.runtimeEvidenceItems;
  if (Array.isArray(items)) {
    payloads.push(...items);
  }

  return payloads;
}

function readRuntimeEvidenceSource(value: unknown, event: RunEvent): RuntimeEvidence['source'] {
  if (isRecord(value)) {
    return value as RuntimeEvidence['source'];
  }

  const data = isRecord(event.data) ? event.data : {};
  return {
    ...(optionalString(data.runtimeId) ? { runtimeId: optionalString(data.runtimeId) } : {}),
    ...(event.agentId ? { adapterId: event.agentId } : {}),
    ...(optionalString(data.sandboxId) ? { sandboxId: optionalString(data.sandboxId) } : {}),
    ...(optionalString(data.sessionId) ? { sessionId: optionalString(data.sessionId) } : {}),
    ...(optionalString(data.command) ? { command: optionalString(data.command) } : {}),
    ...(optionalString(data.url) ? { url: optionalString(data.url) } : {}),
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}

function workSignalSeverityRank(severity: 'critical' | 'high' | 'medium' | 'low'): number {
  return { critical: 0, high: 1, medium: 2, low: 3 }[severity];
}

function supportsAgentIntent(agent: AgentProfile, intent: TaskSpec['intent']): boolean {
  return agent.supportedTaskIntents.includes(intent) || agent.supportedTaskIntents.includes('*');
}
