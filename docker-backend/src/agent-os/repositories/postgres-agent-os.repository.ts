import type { Pool, PoolClient, QueryResultRow } from 'pg';
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
  Workspace,
} from '@recoder/agent-os';
import type { OutboxRecord } from '@recoder/agent-events';
import type { RecoderComponentDescriptor } from '@recoder/oss-registry';
import type { AgentOsRepository, AgentOsRepositorySnapshot } from './agent-os.repository';
import { InMemoryAgentOsRepository } from './in-memory-agent-os.repository';

type Queryable = Pick<Pool | PoolClient, 'query'>;

const DOMAIN_KEY = '__recoderDomain';

export class PostgresAgentOsRepository implements AgentOsRepository {
  private readonly fallback = new InMemoryAgentOsRepository();

  constructor(private readonly db: Queryable) {}

  async snapshot(): Promise<AgentOsRepositorySnapshot> {
    return {
      agents: await this.listAgents(),
      tasks: await this.listTasks(),
      runs: await this.listRuns(),
      approvals: await this.listApprovals(),
      artifacts: await this.listArtifacts(),
      runtimeEvidence: await this.listRuntimeEvidence(),
      githubDeliveryLinks: await this.listGitHubDeliveryLinks(),
      workSignals: await this.listWorkSignals(),
      memoryItems: await this.listMemoryItems(),
      memoryCandidates: await this.listMemoryCandidates(),
      instructionBundles: await this.listInstructionBundles(),
      policyDecisions: await this.listPolicyDecisions(),
      workLocks: await this.listWorkLocks(),
      events: await this.listEvents(),
      outbox: await this.listOutbox(),
      spaces: await this.listSpaces(),
      ossComponents: await this.listOssComponents(),
      workspaces: await this.listWorkspaces(),
    };
  }

  async listWorkspaces(): Promise<Workspace[]> {
    const rows = await queryRows<WorkspaceRow>(this.db, 'select * from conductor_workspaces order by created_at asc');
    return rows
      .map((row) => domainFromJson<Workspace>(row.metadata))
      .filter((workspace): workspace is Workspace => workspace !== undefined);
  }

  async upsertWorkspace(workspace: Workspace): Promise<Workspace> {
    await this.db.query(
      `insert into conductor_workspaces (
         workspace_id, space_id, project_id, task_id, run_id, runtime_id, substrate,
         branch, base_ref, worktree_path, session_name, state, created_by, metadata, created_at, updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       on conflict (workspace_id) do update set
         space_id = excluded.space_id,
         project_id = excluded.project_id,
         task_id = excluded.task_id,
         run_id = excluded.run_id,
         runtime_id = excluded.runtime_id,
         substrate = excluded.substrate,
         branch = excluded.branch,
         base_ref = excluded.base_ref,
         worktree_path = excluded.worktree_path,
         session_name = excluded.session_name,
         state = excluded.state,
         metadata = excluded.metadata,
         updated_at = excluded.updated_at`,
      [
        workspace.workspaceId,
        workspace.spaceId,
        workspace.projectId,
        workspace.taskId,
        workspace.runId ?? null,
        workspace.runtimeId,
        workspace.substrate,
        workspace.branch,
        workspace.baseRef,
        workspace.worktreePath ?? null,
        workspace.sessionName ?? null,
        workspace.state,
        workspace.createdBy,
        withDomain(workspace.metadata, workspace),
        workspace.createdAt,
        workspace.updatedAt,
      ],
    );
    return workspace;
  }

  async getWorkspace(workspaceId: string): Promise<Workspace | null> {
    const rows = await queryRows<WorkspaceRow>(
      this.db,
      'select * from conductor_workspaces where workspace_id = $1 limit 1',
      [workspaceId],
    );
    return rows[0] ? domainFromJson<Workspace>(rows[0].metadata) ?? null : null;
  }

  async listSpaces(): Promise<Space[]> {
    const rows = await queryRows<SpaceRow>(this.db, 'select * from spaces order by created_at asc');
    return rows.map((row) => domainFromJson<Space>(row.metadata) ?? ({
      spaceId: row.space_id,
      displayName: row.display_name,
      ownerId: row.owner_id,
      repositories: [],
      policy: row.policy,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
      metadata: stripDomain(row.metadata),
    }));
  }

  async upsertSpace(space: Space): Promise<Space> {
    await this.db.query(
      `insert into spaces (space_id, display_name, owner_id, policy, metadata, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (space_id) do update set
         display_name = excluded.display_name,
         owner_id = excluded.owner_id,
         policy = excluded.policy,
         metadata = excluded.metadata,
         updated_at = excluded.updated_at`,
      [
        space.spaceId,
        space.displayName,
        space.ownerId,
        space.policy,
        withDomain(space.metadata, space),
        space.createdAt,
        space.updatedAt,
      ],
    );
    return space;
  }

  async listSpacePolicies(): Promise<Array<SpacePolicy & { spaceId: string }>> {
    return (await this.listSpaces()).map((space) => ({ ...space.policy, spaceId: space.spaceId }));
  }

  async upsertSpacePolicy(spaceId: string, policy: SpacePolicy): Promise<SpacePolicy & { spaceId: string }> {
    const existing = (await this.listSpaces()).find((space) => space.spaceId === spaceId);
    if (!existing) throw new Error(`Space not found: ${spaceId}`);
    await this.upsertSpace({ ...existing, policy, updatedAt: new Date().toISOString() });
    return { ...policy, spaceId };
  }

  async listAgents(): Promise<AgentProfile[]> {
    const rows = await queryRows<AgentProfileRow>(this.db, 'select * from agent_profiles order by last_seen_at desc');
    return rows.map((row) => domainFromJson<AgentProfile>(row.health) ?? ({
      agentId: row.agent_id,
      displayName: row.display_name,
      vendorSurface: row.vendor_surface as AgentProfile['vendorSurface'],
      connectorId: row.connector_id,
      runtimeKind: row.runtime_kind as AgentProfile['runtimeKind'],
      capabilities: [],
      tools: [],
      supportedTaskIntents: [],
      permissions: row.permissions,
      approvalPolicy: row.approval_policy,
      memoryScope: row.memory_scope as AgentProfile['memoryScope'],
      cwdPolicy: row.cwd_policy,
      health: stripDomain(row.health) as AgentProfile['health'],
      lastSeenAt: iso(row.last_seen_at),
    }));
  }

  async upsertAgent(agent: AgentProfile): Promise<AgentProfile> {
    await this.db.query(
      `insert into agent_profiles (
         agent_id, display_name, vendor_surface, connector_id, runtime_kind, memory_scope,
         permissions, approval_policy, cwd_policy, health, last_seen_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (agent_id) do update set
         display_name = excluded.display_name,
         vendor_surface = excluded.vendor_surface,
         connector_id = excluded.connector_id,
         runtime_kind = excluded.runtime_kind,
         memory_scope = excluded.memory_scope,
         permissions = excluded.permissions,
         approval_policy = excluded.approval_policy,
         cwd_policy = excluded.cwd_policy,
         health = excluded.health,
         last_seen_at = excluded.last_seen_at,
         updated_at = now()`,
      [
        agent.agentId,
        agent.displayName,
        agent.vendorSurface,
        agent.connectorId,
        agent.runtimeKind,
        agent.memoryScope,
        agent.permissions,
        agent.approvalPolicy,
        agent.cwdPolicy,
        withDomain(agent.health.details, agent, agent.health),
        agent.lastSeenAt,
      ],
    );
    return agent;
  }

  async listTasks(): Promise<TaskSpec[]> {
    const rows = await queryRows<TaskRow>(this.db, 'select * from tasks order by created_at asc');
    return rows.map((row) => domainFromJson<TaskSpec>(row.spec) ?? row.spec);
  }

  async upsertTask(task: TaskSpec): Promise<TaskSpec> {
    await this.db.query(
      `insert into tasks (task_id, space_id, title, intent, goal, spec, status, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, coalesce($7, 'created'), now(), now())
       on conflict (task_id) do update set
         space_id = excluded.space_id,
         title = excluded.title,
         intent = excluded.intent,
         goal = excluded.goal,
         spec = excluded.spec,
         status = excluded.status,
         updated_at = now()`,
      [task.taskId, task.spaceId, task.title, task.intent, task.goal, withDomain(task.metadata, task, task), stringMeta(task.metadata, 'status')],
    );
    return task;
  }

  async listRuns(): Promise<TaskRun[]> {
    const rows = await queryRows<TaskRunRow>(this.db, 'select * from task_runs order by updated_at asc');
    return rows.map((row) => domainFromJson<TaskRun>(row.metadata) ?? ({
      runId: row.run_id,
      taskId: row.task_id,
      spaceId: row.space_id,
      state: row.state as TaskRun['state'],
      assigneeAgentId: row.assignee_agent_id ?? undefined,
      instructionBundleId: row.instruction_bundle_id ?? undefined,
      startedAt: isoOptional(row.started_at),
      completedAt: isoOptional(row.completed_at),
      updatedAt: iso(row.updated_at),
      metadata: stripDomain(row.metadata),
    }));
  }

  async upsertRun(run: TaskRun): Promise<TaskRun> {
    await this.db.query(
      `insert into task_runs (
         run_id, task_id, space_id, state, assignee_agent_id, instruction_bundle_id,
         started_at, completed_at, metadata, updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       on conflict (run_id) do update set
         task_id = excluded.task_id,
         space_id = excluded.space_id,
         state = excluded.state,
         assignee_agent_id = excluded.assignee_agent_id,
         instruction_bundle_id = excluded.instruction_bundle_id,
         started_at = excluded.started_at,
         completed_at = excluded.completed_at,
         metadata = excluded.metadata,
         updated_at = excluded.updated_at`,
      [
        run.runId,
        run.taskId,
        run.spaceId,
        run.state,
        run.assigneeAgentId ?? null,
        run.instructionBundleId ?? null,
        run.startedAt ?? null,
        run.completedAt ?? null,
        withDomain(run.metadata, run),
        run.updatedAt,
      ],
    );
    return run;
  }

  async listApprovals(): Promise<Approval[]> {
    const rows = await queryRows<ApprovalRow>(this.db, 'select * from approval_requests order by requested_at asc');
    return rows.map((row) => domainFromJson<Approval>(row.metadata) ?? ({
      approvalId: row.approval_id,
      taskId: row.task_id,
      runId: row.run_id ?? undefined,
      status: row.status as Approval['status'],
      reason: row.reason,
      requestedBy: row.requested_by,
      requestedAt: iso(row.requested_at),
      requiredAt: row.required_at as Approval['requiredAt'],
      target: row.target,
      decidedBy: row.decided_by ?? undefined,
      decidedAt: isoOptional(row.decided_at),
      decisionReason: row.decision_reason ?? undefined,
      metadata: stripDomain(row.metadata),
    }));
  }

  async upsertApproval(approval: Approval): Promise<Approval> {
    await this.db.query(
      `insert into approval_requests (
         approval_id, task_id, run_id, status, reason, requested_by, requested_at,
         required_at, target, decided_by, decided_at, decision_reason, metadata
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       on conflict (approval_id) do update set
         task_id = excluded.task_id,
         run_id = excluded.run_id,
         status = excluded.status,
         reason = excluded.reason,
         requested_by = excluded.requested_by,
         requested_at = excluded.requested_at,
         required_at = excluded.required_at,
         target = excluded.target,
         decided_by = excluded.decided_by,
         decided_at = excluded.decided_at,
         decision_reason = excluded.decision_reason,
         metadata = excluded.metadata`,
      [
        approval.approvalId,
        approval.taskId,
        approval.runId ?? null,
        approval.status,
        approval.reason,
        approval.requestedBy,
        approval.requestedAt,
        approval.requiredAt,
        approval.target ?? {},
        approval.decidedBy ?? null,
        approval.decidedAt ?? null,
        approval.decisionReason ?? null,
        withDomain(approval.metadata, approval),
      ],
    );
    return approval;
  }

  async listArtifacts(): Promise<Artifact[]> {
    const rows = await queryRows<ArtifactRow>(this.db, 'select * from artifacts order by created_at asc');
    return rows.map((row) => domainFromJson<Artifact>(row.metadata) ?? ({
      artifactId: row.artifact_id,
      taskId: row.task_id,
      runId: row.run_id ?? undefined,
      kind: row.kind as Artifact['kind'],
      mimeType: row.mime_type,
      path: row.path ?? undefined,
      contentHash: row.content_hash ?? undefined,
      public: row.public,
      createdAt: iso(row.created_at),
      createdBy: row.created_by,
      provenance: row.provenance,
      metadata: stripDomain(row.metadata),
    }));
  }

  async upsertArtifact(artifact: Artifact): Promise<Artifact> {
    await this.db.query(
      `insert into artifacts (
         artifact_id, task_id, run_id, kind, mime_type, path, content_hash,
         public, created_by, provenance, metadata, created_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       on conflict (artifact_id) do update set
         task_id = excluded.task_id,
         run_id = excluded.run_id,
         kind = excluded.kind,
         mime_type = excluded.mime_type,
         path = excluded.path,
         content_hash = excluded.content_hash,
         public = excluded.public,
         created_by = excluded.created_by,
         provenance = excluded.provenance,
         metadata = excluded.metadata`,
      [
        artifact.artifactId,
        artifact.taskId,
        artifact.runId ?? null,
        artifact.kind,
        artifact.mimeType,
        artifact.path ?? null,
        artifact.contentHash ?? null,
        artifact.public,
        artifact.createdBy,
        artifact.provenance ?? {},
        withDomain(artifact.metadata, artifact),
        artifact.createdAt,
      ],
    );
    return artifact;
  }

  async listRuntimeEvidence(): Promise<RuntimeEvidence[]> {
    const rows = await queryRows<RuntimeEvidenceRow>(this.db, 'select * from runtime_evidence order by observed_at asc');
    return rows.map((row) => domainFromJson<RuntimeEvidence>(row.metadata) ?? ({
      evidenceId: row.evidence_id,
      taskId: row.task_id,
      runId: row.run_id ?? undefined,
      kind: row.kind as RuntimeEvidence['kind'],
      status: row.status as RuntimeEvidence['status'],
      title: row.title,
      summary: row.summary ?? undefined,
      source: row.source,
      artifactIds: row.artifact_ids,
      observedAt: iso(row.observed_at),
      metadata: stripDomain(row.metadata),
    }));
  }

  async upsertRuntimeEvidence(evidence: RuntimeEvidence): Promise<RuntimeEvidence> {
    await this.db.query(
      `insert into runtime_evidence (
         evidence_id, task_id, run_id, kind, status, title, summary, source,
         artifact_ids, metadata, observed_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (evidence_id) do update set
         task_id = excluded.task_id,
         run_id = excluded.run_id,
         kind = excluded.kind,
         status = excluded.status,
         title = excluded.title,
         summary = excluded.summary,
         source = excluded.source,
         artifact_ids = excluded.artifact_ids,
         metadata = excluded.metadata,
         observed_at = excluded.observed_at`,
      [
        evidence.evidenceId,
        evidence.taskId,
        evidence.runId ?? null,
        evidence.kind,
        evidence.status,
        evidence.title,
        evidence.summary ?? null,
        evidence.source,
        evidence.artifactIds,
        withDomain(evidence.metadata, evidence),
        evidence.observedAt,
      ],
    );
    return evidence;
  }

  async listGitHubDeliveryLinks(): Promise<GitHubDeliveryLink[]> {
    const rows = await queryRows<PayloadRow>(this.db, 'select payload from github_delivery_links order by updated_at asc');
    return rows.map((row) => row.payload as GitHubDeliveryLink);
  }

  async upsertGitHubDeliveryLink(link: GitHubDeliveryLink): Promise<GitHubDeliveryLink> {
    await this.db.query(
      `insert into github_delivery_links (
         link_id, task_id, run_id, space_id, repository, branch, status,
         pull_request_number, pull_request_url, payload, created_at, updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       on conflict (link_id) do update set
         task_id = excluded.task_id,
         run_id = excluded.run_id,
         space_id = excluded.space_id,
         repository = excluded.repository,
         branch = excluded.branch,
         status = excluded.status,
         pull_request_number = excluded.pull_request_number,
         pull_request_url = excluded.pull_request_url,
         payload = excluded.payload,
         updated_at = excluded.updated_at`,
      [
        link.linkId,
        link.taskId,
        link.runId ?? null,
        link.spaceId,
        link.repository,
        link.branch,
        link.status,
        link.pullRequestNumber === undefined ? null : String(link.pullRequestNumber),
        link.pullRequestUrl ?? null,
        link,
        link.createdAt,
        link.updatedAt,
      ],
    );
    return link;
  }

  async getGitHubDeliveryLink(linkId: string): Promise<GitHubDeliveryLink | null> {
    const rows = await queryRows<PayloadRow>(this.db, 'select payload from github_delivery_links where link_id = $1', [linkId]);
    return rows[0]?.payload as GitHubDeliveryLink | undefined ?? null;
  }

  async listWorkSignals(): Promise<WorkSignal[]> {
    const rows = await queryRows<WorkSignalRow>(this.db, 'select * from work_signals order by detected_at asc');
    return rows.map((row) => domainFromJson<WorkSignal>(row.metadata) ?? ({
      signalId: row.signal_id,
      taskId: row.task_id,
      runId: row.run_id ?? undefined,
      spaceId: row.space_id ?? undefined,
      source: row.source as WorkSignal['source'],
      sourceId: row.source_id,
      title: row.title,
      severity: row.severity as WorkSignal['severity'],
      status: row.status as WorkSignal['status'],
      detectedReason: row.detected_reason as WorkSignal['detectedReason'],
      whyItMatters: row.why_it_matters,
      recommendedNextAction: row.recommended_next_action,
      agentHandoffPrompt: row.agent_handoff_prompt,
      detectedAt: iso(row.detected_at),
      resolvedAt: isoOptional(row.resolved_at),
      resolvedBy: row.resolved_by ?? undefined,
      metadata: stripDomain(row.metadata),
    }));
  }

  async upsertWorkSignal(signal: WorkSignal): Promise<WorkSignal> {
    await this.db.query(
      `insert into work_signals (
         signal_id, task_id, run_id, space_id, source, source_id, title, severity,
         status, detected_reason, why_it_matters, recommended_next_action,
         agent_handoff_prompt, metadata, detected_at, resolved_at, resolved_by
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       on conflict (signal_id) do update set
         task_id = excluded.task_id,
         run_id = excluded.run_id,
         space_id = excluded.space_id,
         source = excluded.source,
         source_id = excluded.source_id,
         title = excluded.title,
         severity = excluded.severity,
         status = excluded.status,
         detected_reason = excluded.detected_reason,
         why_it_matters = excluded.why_it_matters,
         recommended_next_action = excluded.recommended_next_action,
         agent_handoff_prompt = excluded.agent_handoff_prompt,
         metadata = excluded.metadata,
         detected_at = excluded.detected_at,
         resolved_at = excluded.resolved_at,
         resolved_by = excluded.resolved_by`,
      [
        signal.signalId,
        signal.taskId,
        signal.runId ?? null,
        signal.spaceId ?? null,
        signal.source,
        signal.sourceId,
        signal.title,
        signal.severity,
        signal.status,
        signal.detectedReason,
        signal.whyItMatters,
        signal.recommendedNextAction,
        signal.agentHandoffPrompt,
        withDomain(signal.metadata, signal),
        signal.detectedAt,
        signal.resolvedAt ?? null,
        signal.resolvedBy ?? null,
      ],
    );
    return signal;
  }

  async getWorkSignal(signalId: string): Promise<WorkSignal | null> {
    return (await this.listWorkSignals()).find((signal) => signal.signalId === signalId) ?? null;
  }

  async deleteWorkSignal(signalId: string): Promise<boolean> {
    const result = await this.db.query('delete from work_signals where signal_id = $1', [signalId]);
    return (result.rowCount ?? 0) > 0;
  }

  async listPolicyDecisions(): Promise<PolicyDecision[]> {
    const rows = await queryRows<PayloadRow>(this.db, 'select payload from policy_decisions order by created_at asc');
    return rows.map((row) => row.payload as PolicyDecision);
  }

  async upsertPolicyDecision(decision: PolicyDecision): Promise<PolicyDecision> {
    await this.db.query(
      `insert into policy_decisions (decision_id, task_id, actor_agent_id, effect, action, payload, created_at)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (decision_id) do update set
         task_id = excluded.task_id,
         actor_agent_id = excluded.actor_agent_id,
         effect = excluded.effect,
         action = excluded.action,
         payload = excluded.payload,
         created_at = excluded.created_at`,
      [
        decision.decisionId,
        decision.taskId ?? null,
        decision.actorAgentId,
        decision.effect,
        decision.action,
        decision,
        decision.createdAt,
      ],
    );
    return decision;
  }

  async appendEvent(event: RunEvent): Promise<RunEvent> {
    await this.db.query(
      `insert into events (event_id, type, task_id, run_id, agent_id, payload, created_at)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (event_id) do nothing`,
      [event.eventId, event.type, event.taskId, event.runId ?? null, event.agentId ?? null, event, event.createdAt],
    );
    return event;
  }

  async listEvents(): Promise<RunEvent[]> {
    const rows = await queryRows<PayloadRow>(this.db, 'select payload from events order by created_at asc');
    return rows.map((row) => row.payload as RunEvent);
  }

  async appendOutbox(record: OutboxRecord): Promise<OutboxRecord> {
    const existing = await this.findOutbox(record.outboxId);
    if (existing) return existing;
    return await this.upsertOutbox(record);
  }

  async upsertOutbox(record: OutboxRecord): Promise<OutboxRecord> {
    await this.db.query(
      `insert into event_outbox (outbox_id, event_id, event, status, attempts, last_error, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (outbox_id) do update set
         event_id = excluded.event_id,
         event = excluded.event,
         status = excluded.status,
         attempts = excluded.attempts,
         last_error = excluded.last_error,
         updated_at = excluded.updated_at`,
      [
        record.outboxId,
        record.event.id,
        record.event,
        record.status,
        record.attempts,
        record.lastError ?? null,
        record.createdAt,
        record.updatedAt,
      ],
    );
    return record;
  }

  async listOutbox(): Promise<OutboxRecord[]> {
    const rows = await queryRows<OutboxRow>(this.db, 'select * from event_outbox order by created_at asc');
    return rows.map(mapOutboxRow);
  }

  async listOssComponents(): Promise<RecoderComponentDescriptor[]> {
    const rows = await queryRows<PayloadRow>(this.db, 'select payload from oss_components order by id asc');
    return rows.map((row) => row.payload as RecoderComponentDescriptor);
  }

  async upsertOssComponent(component: RecoderComponentDescriptor): Promise<RecoderComponentDescriptor> {
    await this.db.query(
      `insert into oss_components (id, payload, updated_at)
       values ($1, $2, now())
       on conflict (id) do update set payload = excluded.payload, updated_at = now()`,
      [component.id, component],
    );
    return component;
  }

  async getOssComponent(componentId: string): Promise<RecoderComponentDescriptor | null> {
    const rows = await queryRows<PayloadRow>(this.db, 'select payload from oss_components where id = $1', [componentId]);
    return rows[0]?.payload as RecoderComponentDescriptor | undefined ?? null;
  }

  listMemoryItems(): MemoryItem[] {
    return this.fallback.listMemoryItems();
  }

  upsertMemoryItem(memory: MemoryItem): MemoryItem {
    return this.fallback.upsertMemoryItem(memory);
  }

  listMemoryCandidates(): MemoryCandidate[] {
    return this.fallback.listMemoryCandidates();
  }

  upsertMemoryCandidate(candidate: MemoryCandidate): MemoryCandidate {
    return this.fallback.upsertMemoryCandidate(candidate);
  }

  listInstructionBundles(): InstructionBundle[] {
    return this.fallback.listInstructionBundles();
  }

  upsertInstructionBundle(bundle: InstructionBundle): InstructionBundle {
    return this.fallback.upsertInstructionBundle(bundle);
  }

  listWorkLocks(): WorkLock[] {
    return this.fallback.listWorkLocks();
  }

  upsertWorkLock(lock: WorkLock): WorkLock {
    return this.fallback.upsertWorkLock(lock);
  }

  replaceWorkLocks(locks: WorkLock[]): WorkLock[] {
    return this.fallback.replaceWorkLocks(locks);
  }

  deleteWorkLock(lockId: string): boolean {
    return this.fallback.deleteWorkLock(lockId);
  }

  private async findOutbox(outboxId: string): Promise<OutboxRecord | null> {
    const rows = await queryRows<OutboxRow>(this.db, 'select * from event_outbox where outbox_id = $1', [outboxId]);
    return rows[0] ? mapOutboxRow(rows[0]) : null;
  }
}

type SpaceRow = QueryResultRow & {
  space_id: string;
  display_name: string;
  owner_id: string;
  policy: SpacePolicy;
  metadata: Record<string, unknown>;
  created_at: string | Date;
  updated_at: string | Date;
};

type AgentProfileRow = QueryResultRow & {
  agent_id: string;
  display_name: string;
  vendor_surface: string;
  connector_id: string;
  runtime_kind: string;
  memory_scope: string;
  permissions: AgentProfile['permissions'];
  approval_policy: AgentProfile['approvalPolicy'];
  cwd_policy: AgentProfile['cwdPolicy'];
  health: Record<string, unknown>;
  last_seen_at: string | Date;
};

type TaskRow = QueryResultRow & {
  spec: TaskSpec & Record<string, unknown>;
};

type TaskRunRow = QueryResultRow & {
  run_id: string;
  task_id: string;
  space_id: string;
  state: string;
  assignee_agent_id: string | null;
  instruction_bundle_id: string | null;
  started_at: string | Date | null;
  completed_at: string | Date | null;
  updated_at: string | Date;
  metadata: Record<string, unknown>;
};

type ApprovalRow = QueryResultRow & {
  approval_id: string;
  task_id: string;
  run_id: string | null;
  status: string;
  reason: string;
  requested_by: string;
  requested_at: string | Date;
  required_at: string;
  target: Approval['target'];
  decided_by: string | null;
  decided_at: string | Date | null;
  decision_reason: string | null;
  metadata: Record<string, unknown>;
};

type ArtifactRow = QueryResultRow & {
  artifact_id: string;
  task_id: string;
  run_id: string | null;
  kind: string;
  mime_type: string;
  path: string | null;
  content_hash: string | null;
  public: boolean;
  created_by: string;
  provenance: Artifact['provenance'];
  metadata: Record<string, unknown>;
  created_at: string | Date;
};

type RuntimeEvidenceRow = QueryResultRow & {
  evidence_id: string;
  task_id: string;
  run_id: string | null;
  kind: string;
  status: string;
  title: string;
  summary: string | null;
  source: RuntimeEvidence['source'];
  artifact_ids: string[];
  metadata: Record<string, unknown>;
  observed_at: string | Date;
};

type WorkSignalRow = QueryResultRow & {
  signal_id: string;
  task_id: string;
  run_id: string | null;
  space_id: string | null;
  source: string;
  source_id: string;
  title: string;
  severity: string;
  status: string;
  detected_reason: string;
  why_it_matters: string;
  recommended_next_action: string;
  agent_handoff_prompt: string;
  metadata: Record<string, unknown>;
  detected_at: string | Date;
  resolved_at: string | Date | null;
  resolved_by: string | null;
};

type WorkspaceRow = QueryResultRow & {
  workspace_id: string;
  space_id: string;
  project_id: string;
  task_id: string;
  run_id: string | null;
  runtime_id: string;
  substrate: string;
  branch: string;
  base_ref: string;
  worktree_path: string | null;
  session_name: string | null;
  state: string;
  created_by: string;
  metadata: Record<string, unknown>;
  created_at: string | Date;
  updated_at: string | Date;
};

type PayloadRow = QueryResultRow & {
  payload: unknown;
};

type OutboxRow = QueryResultRow & {
  outbox_id: string;
  event: OutboxRecord['event'];
  status: OutboxRecord['status'];
  attempts: number;
  last_error: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

async function queryRows<T extends QueryResultRow>(db: Queryable, sql: string, values: unknown[] = []): Promise<T[]> {
  const result = await db.query<T>(sql, values);
  return result.rows;
}

function mapOutboxRow(row: OutboxRow): OutboxRecord {
  return {
    outboxId: row.outbox_id,
    event: row.event,
    status: row.status,
    attempts: row.attempts,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    lastError: row.last_error ?? undefined,
  };
}

function withDomain<T>(metadata: Record<string, unknown> | undefined, domain: T, base: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...base,
    ...(metadata ?? {}),
    [DOMAIN_KEY]: domain,
  };
}

function domainFromJson<T>(value: unknown): T | undefined {
  if (!isRecord(value)) return undefined;
  return value[DOMAIN_KEY] as T | undefined;
}

function stripDomain(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const { [DOMAIN_KEY]: _domain, ...rest } = value;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

function stringMeta(metadata: Record<string, unknown> | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : null;
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function isoOptional(value: string | Date | null | undefined): string | undefined {
  return value ? iso(value) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
