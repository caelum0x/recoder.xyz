import { createHash } from 'node:crypto';
import type {
  Artifact,
  ArtifactKind,
  RunEvent,
  RuntimeEvidence,
  TaskIntent,
  TaskRun,
  TaskRunState,
  TaskSpec,
} from '@recoder/agent-os';
import {
  isAllowedTaskRunTransition,
  transitionTaskRun,
} from '@recoder/agent-os';
import type {
  RecoderPayload,
  TaskArtifact,
  TaskEnvelope,
  TaskState,
} from '@recoder/a2a-sdk';
import {
  createOutboxRecord,
  mapArtifactToCloudEvent,
  mapRunEventToCloudEvent,
  mapRuntimeEvidenceToCloudEvent,
} from '@recoder/agent-events';
import type { AgentOsGatewayState } from '../http/agent-os-resources';

export type A2ATaskProjectionChange = {
  previous: TaskEnvelope;
  current: TaskEnvelope;
  reason: string;
};

export type A2AArtifactProjectionInput = {
  task: TaskEnvelope;
  artifact: TaskArtifact;
};

export type A2AAgentOsProjection = {
  onTaskCreated(task: TaskEnvelope): void;
  onTaskStateChanged(change: A2ATaskProjectionChange): void;
  onArtifactAttached(input: A2AArtifactProjectionInput): void;
};

const TASK_INTENTS: readonly TaskIntent[] = [
  'bugfix',
  'feature_delivery',
  'platform_hardening',
  'refactor',
  'code_review',
  'test_generation',
  'verification',
  'documentation',
  'research',
  'release',
  'incident_response',
  'migration',
  'handoff',
  'custom',
];

const BRANCH_POLICIES = new Set([
  'reuse_branch',
  'create_worktree_branch',
  'no_git_write',
  'custom',
]);

export function createA2AAgentOsProjection(state: AgentOsGatewayState): A2AAgentOsProjection {
  return {
    onTaskCreated(task) {
      ensureProjectionSpace(state, task);
      const spec = taskSpecFromEnvelope(task);
      state.tasks.set(spec.taskId, spec);

      const existingRun = state.runs.get(runIdForTask(task.id));
      if (!existingRun) {
        const now = new Date().toISOString();
        const run: TaskRun = {
          runId: runIdForTask(task.id),
          taskId: spec.taskId,
          spaceId: spec.spaceId,
          state: 'created',
          assigneeAgentId: task.assignee.agent_id,
          updatedAt: now,
          metadata: {
            a2aTaskId: task.id,
            a2aThreadId: task.thread_id,
            a2aTraceId: task.trace_id,
            a2aState: task.state,
            connectorId: task.connector.connector_id,
            connectorProtocol: task.connector.protocol,
            source: 'a2a',
          },
        };
        state.runs.set(run.runId, run);
        appendRunEvent(state, {
          type: 'started',
          taskId: spec.taskId,
          runId: run.runId,
          agentId: run.assigneeAgentId,
          state: run.state,
          message: 'A2A task projected into Agent OS.',
          createdAt: now,
          data: {
            a2aTaskId: task.id,
            a2aState: task.state,
            threadId: task.thread_id,
            traceId: task.trace_id,
          },
        });
      }
    },

    onTaskStateChanged(change) {
      ensureProjectionSpace(state, change.current);
      const spec = taskSpecFromEnvelope(change.current);
      state.tasks.set(spec.taskId, spec);

      const run = ensureProjectionRun(state, change.current, spec);
      const target = taskRunStateFromA2A(change.current.state);
      const updated = transitionRunTo(state, run, target, change.reason, {
        a2aPreviousState: change.previous.state,
        a2aState: change.current.state,
      });
      state.runs.set(updated.runId, {
        ...updated,
        assigneeAgentId: change.current.assignee.agent_id,
      });
    },

    onArtifactAttached(input) {
      ensureProjectionSpace(state, input.task);
      const spec = taskSpecFromEnvelope(input.task);
      state.tasks.set(spec.taskId, spec);

      const run = ensureProjectionRun(state, input.task, spec);
      const artifact = artifactFromA2A(input.task, run, input.artifact);
      state.artifacts.set(artifact.artifactId, artifact);
      appendArtifactOutbox(state, artifact);
      const evidence = runtimeEvidenceFromA2A(input.task, run, input.artifact, artifact);
      if (evidence) {
        state.runtimeEvidence.set(evidence.evidenceId, evidence);
        appendRuntimeEvidenceOutbox(state, evidence);
      }
      appendRunEvent(state, {
        type: 'artifact',
        taskId: artifact.taskId,
        runId: artifact.runId,
        agentId: run.assigneeAgentId,
        state: run.state,
        artifactId: artifact.artifactId,
        message: `A2A artifact attached: ${input.artifact.artifact_type}`,
        createdAt: artifact.createdAt,
        data: {
          source: 'a2a',
          a2aTaskId: input.task.id,
          a2aArtifactKey: input.artifact.key,
          a2aArtifactType: input.artifact.artifact_type,
          runtimeEvidenceId: evidence?.evidenceId,
        },
      });
    },
  };
}

function ensureProjectionSpace(state: AgentOsGatewayState, task: TaskEnvelope): void {
  if (state.spaces.has(task.workspace_id)) {
    return;
  }

  const now = new Date().toISOString();
  state.spaces.set(task.workspace_id, {
    spaceId: task.workspace_id,
    displayName: `A2A workspace ${task.workspace_id}`,
    ownerId: task.requester.agent_id,
    repositories: [],
    policy: {
      policyId: `policy_${task.workspace_id}`,
      approvalRequiredFor: [],
      forbiddenPaths: [],
      defaultVerificationCommands: [],
      allowNetworkByDefault: false,
      allowShellByDefault: false,
      metadata: {
        source: 'a2a-projection',
      },
    },
    createdAt: now,
    updatedAt: now,
    metadata: {
      source: 'a2a-projection',
      a2aThreadId: task.thread_id,
      a2aTraceId: task.trace_id,
    },
  });
}

function ensureProjectionRun(state: AgentOsGatewayState, task: TaskEnvelope, spec: TaskSpec): TaskRun {
  const runId = runIdForTask(task.id);
  const existing = state.runs.get(runId);
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const run: TaskRun = {
    runId,
    taskId: spec.taskId,
    spaceId: spec.spaceId,
    state: 'created',
    assigneeAgentId: task.assignee.agent_id,
    updatedAt: now,
    metadata: {
      a2aTaskId: task.id,
      a2aThreadId: task.thread_id,
      a2aTraceId: task.trace_id,
      a2aState: task.state,
      connectorId: task.connector.connector_id,
      connectorProtocol: task.connector.protocol,
      source: 'a2a',
    },
  };
  state.runs.set(runId, run);
  return run;
}

function taskSpecFromEnvelope(task: TaskEnvelope): TaskSpec {
  const metadata = record(task.metadata);
  const data = payloadData(task.payload);
  const taskData = record(data.task) ?? record(data.taskSpec);
  const text = payloadText(task.payload);
  const title = stringValue(taskData?.title)
    ?? stringValue(data.title)
    ?? stringValue(metadata?.title)
    ?? firstLine(text)
    ?? `A2A task ${task.id}`;

  return {
    taskId: task.id,
    title,
    intent: taskIntent(stringValue(taskData?.intent) ?? stringValue(data.intent) ?? stringValue(metadata?.intent)),
    goal: stringValue(taskData?.goal) ?? stringValue(data.goal) ?? stringValue(data.prompt) ?? text ?? title,
    spaceId: task.workspace_id,
    repo: stringValue(taskData?.repo) ?? stringValue(data.repo) ?? stringValue(metadata?.repo),
    branchPolicy: branchPolicy(stringValue(taskData?.branchPolicy) ?? stringValue(taskData?.branch_policy) ?? stringValue(data.branchPolicy)),
    targetPaths: stringList(taskData?.targetPaths) ?? stringList(taskData?.target_paths) ?? stringList(data.targetPaths) ?? [],
    forbiddenPaths: stringList(taskData?.forbiddenPaths) ?? stringList(taskData?.forbidden_paths) ?? stringList(data.forbiddenPaths) ?? [],
    acceptanceCriteria: stringList(taskData?.acceptanceCriteria) ?? stringList(taskData?.acceptance) ?? stringList(data.acceptanceCriteria) ?? [],
    verification: {
      commands: verificationCommands(taskData) ?? verificationCommands(data) ?? [],
      browserChecks: stringList(record(taskData?.verification)?.browserChecks) ?? stringList(record(data.verification)?.browserChecks),
      evidenceRequired: stringList(record(taskData?.verification)?.evidenceRequired) ?? stringList(record(data.verification)?.evidenceRequired),
    },
    approvalRequired: stringList(taskData?.approvalRequired) ?? stringList(taskData?.approval_required) ?? stringList(data.approvalRequired) ?? [],
    artifactRequired: stringList(taskData?.artifactRequired) ?? stringList(taskData?.artifact_required) ?? stringList(data.artifactRequired) ?? [],
    handoff: handoffFromRecord(record(taskData?.handoff) ?? record(data.handoff)),
    metadata: {
      ...metadata,
      source: 'a2a',
      a2aTaskId: task.id,
      a2aThreadId: task.thread_id,
      a2aTraceId: task.trace_id,
      a2aState: task.state,
      requesterAgentId: task.requester.agent_id,
      requesterPlatform: task.requester.platform,
      assigneeAgentId: task.assignee.agent_id,
      assigneePlatform: task.assignee.platform,
      connectorId: task.connector.connector_id,
      connectorPlatform: task.connector.platform,
    },
  };
}

function transitionRunTo(
  state: AgentOsGatewayState,
  run: TaskRun,
  target: TaskRunState,
  reason: string,
  metadata: Record<string, unknown>,
): TaskRun {
  if (run.state === target) {
    const updated = {
      ...run,
      updatedAt: new Date().toISOString(),
      metadata: {
        ...(run.metadata ?? {}),
        ...metadata,
      },
    };
    state.runs.set(updated.runId, updated);
    return updated;
  }

  let current = run;
  for (const next of transitionPath(current.state, target)) {
    if (!isAllowedTaskRunTransition(current.state, next)) {
      break;
    }
    const previous = current;
    current = transitionTaskRun(current, next, {
      metadata: {
        ...metadata,
        transitionProjectedFrom: 'a2a',
      },
    });
    state.runs.set(current.runId, current);
    appendRunEvent(state, {
      type: 'state_transition',
      taskId: current.taskId,
      runId: current.runId,
      agentId: current.assigneeAgentId,
      state: current.state,
      message: `Run transitioned ${previous.state} -> ${current.state}`,
      createdAt: current.updatedAt,
      data: {
        fromState: previous.state,
        toState: current.state,
        reason,
        ...metadata,
      },
    });
  }

  return current;
}

function transitionPath(from: TaskRunState, target: TaskRunState): TaskRunState[] {
  if (isAllowedTaskRunTransition(from, target)) {
    return [target];
  }

  const paths: Record<TaskRunState, TaskRunState[]> = {
    created: ['created'],
    compiled: ['created', 'compiled'],
    routed: ['created', 'compiled', 'routed'],
    claimed: ['created', 'compiled', 'routed', 'claimed'],
    running: ['created', 'compiled', 'routed', 'claimed', 'running'],
    needs_input: ['created', 'compiled', 'routed', 'claimed', 'running', 'needs_input'],
    verifying: ['created', 'compiled', 'routed', 'claimed', 'running', 'verifying'],
    waiting_for_approval: ['created', 'compiled', 'routed', 'claimed', 'running', 'waiting_for_approval'],
    approved: ['created', 'compiled', 'routed', 'claimed', 'running', 'waiting_for_approval', 'approved'],
    delivered: ['created', 'compiled', 'routed', 'claimed', 'running', 'delivered'],
    completed: ['created', 'compiled', 'routed', 'claimed', 'running', 'completed'],
    failed: [from, 'failed'],
    cancelled: [from, 'cancelled'],
    rejected: [from, 'rejected'],
  };

  const path = paths[target] ?? [];
  const start = path.indexOf(from);
  return start >= 0 ? path.slice(start + 1) : [];
}

function taskRunStateFromA2A(state: TaskState): TaskRunState {
  switch (state) {
    case 'working':
      return 'running';
    case 'input-required':
      return 'needs_input';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'submitted':
    default:
      return 'created';
  }
}

function artifactFromA2A(task: TaskEnvelope, run: TaskRun, artifact: TaskArtifact): Artifact {
  const now = new Date().toISOString();
  return {
    artifactId: `artifact_a2a_${safeId(task.id)}_${safeId(artifact.key)}`,
    taskId: task.id,
    runId: run.runId,
    kind: artifactKind(artifact.artifact_type),
    mimeType: artifact.mime_type,
    path: artifact.path,
    content: artifact.content,
    contentHash: contentHash(artifact.content),
    public: false,
    createdAt: now,
    createdBy: task.assignee.agent_id,
    provenance: {
      sourceTaskId: task.id,
      sourceRunId: run.runId,
    },
    metadata: {
      ...(artifact.metadata ?? {}),
      source: 'a2a',
      a2aArtifactKey: artifact.key,
      a2aArtifactType: artifact.artifact_type,
      a2aThreadId: task.thread_id,
      a2aTraceId: task.trace_id,
    },
  };
}

function artifactKind(type: TaskArtifact['artifact_type']): ArtifactKind {
  switch (type) {
    case 'log':
      return 'log';
    case 'pull_request':
      return 'pull_request';
    case 'preview':
      return 'preview';
    case 'screenshot':
      return 'screenshot';
    case 'verification':
      return 'verification';
    case 'plan':
    case 'report':
      return 'summary';
    case 'patch':
    case 'file':
    case 'custom':
    default:
      return 'custom';
  }
}

function runtimeEvidenceFromA2A(
  task: TaskEnvelope,
  run: TaskRun,
  a2aArtifact: TaskArtifact,
  artifact: Artifact,
): RuntimeEvidence | undefined {
  const kind = runtimeEvidenceKindForA2AArtifact(a2aArtifact.artifact_type);
  if (!kind) {
    return undefined;
  }

  const observedAt = artifact.createdAt;
  return {
    evidenceId: `evidence_a2a_${safeId(task.id)}_${safeId(a2aArtifact.key)}`,
    taskId: task.id,
    runId: run.runId,
    kind,
    status: runtimeEvidenceStatusFromArtifact(a2aArtifact),
    title: `A2A ${a2aArtifact.artifact_type}`,
    summary: artifact.path ?? (typeof artifact.metadata?.url === 'string' ? artifact.metadata.url : undefined),
    source: {
      runtimeId: task.assignee.agent_id,
      adapterId: task.connector.connector_id,
      url: typeof artifact.metadata?.url === 'string' ? artifact.metadata.url : undefined,
    },
    artifactIds: [artifact.artifactId],
    observedAt,
    metadata: {
      source: 'a2a',
      a2aArtifactKey: a2aArtifact.key,
      a2aArtifactType: a2aArtifact.artifact_type,
      a2aThreadId: task.thread_id,
      a2aTraceId: task.trace_id,
      mimeType: a2aArtifact.mime_type,
    },
  };
}

function runtimeEvidenceKindForA2AArtifact(type: TaskArtifact['artifact_type']): RuntimeEvidence['kind'] | undefined {
  switch (type) {
    case 'log':
      return 'stdout';
    case 'preview':
      return 'preview_link';
    case 'screenshot':
      return 'browser_check';
    case 'verification':
      return 'verification';
    default:
      return undefined;
  }
}

function runtimeEvidenceStatusFromArtifact(artifact: TaskArtifact): RuntimeEvidence['status'] {
  const status = artifact.metadata?.status;
  if (status === 'passed' || status === 'failed' || status === 'warning' || status === 'observed') {
    return status;
  }
  if (artifact.metadata?.passed === true) {
    return 'passed';
  }
  if (artifact.metadata?.passed === false) {
    return 'failed';
  }
  return 'observed';
}

function appendRunEvent(state: AgentOsGatewayState, input: Omit<RunEvent, 'eventId'>): void {
  const event: RunEvent = {
    eventId: `event_a2a_${safeId(input.taskId)}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    ...input,
  };
  state.events.push(event);
  appendRunEventOutbox(state, event);
}

function appendRunEventOutbox(state: AgentOsGatewayState, event: RunEvent): void {
  appendOutboxRecord(state, createOutboxRecord(mapRunEventToCloudEvent(event)));
}

function appendArtifactOutbox(state: AgentOsGatewayState, artifact: Artifact): void {
  appendOutboxRecord(state, createOutboxRecord(mapArtifactToCloudEvent({ data: artifact })));
}

function appendRuntimeEvidenceOutbox(state: AgentOsGatewayState, evidence: RuntimeEvidence): void {
  appendOutboxRecord(state, createOutboxRecord(mapRuntimeEvidenceToCloudEvent({ data: evidence })));
}

function appendOutboxRecord(state: AgentOsGatewayState, record: ReturnType<typeof createOutboxRecord>): void {
  if (!state.outbox.some((candidate) => candidate.outboxId === record.outboxId)) {
    state.outbox.push(record);
  }
}

function payloadData(payload: RecoderPayload | RecoderPayload[]): Record<string, unknown> {
  const payloads = Array.isArray(payload) ? payload : [payload];
  for (const item of payloads) {
    if (item.kind === 'json') {
      return item.data;
    }
  }
  return {};
}

function payloadText(payload: RecoderPayload | RecoderPayload[]): string | undefined {
  const payloads = Array.isArray(payload) ? payload : [payload];
  const texts = payloads
    .filter((item): item is Extract<RecoderPayload, { kind: 'text' }> => item.kind === 'text')
    .map((item) => item.text.trim())
    .filter(Boolean);
  return texts.length > 0 ? texts.join('\n\n') : undefined;
}

function taskIntent(value: string | undefined): TaskIntent {
  return TASK_INTENTS.includes(value as TaskIntent) ? value as TaskIntent : 'custom';
}

function branchPolicy(value: string | undefined): TaskSpec['branchPolicy'] {
  return value && BRANCH_POLICIES.has(value) ? value as TaskSpec['branchPolicy'] : undefined;
}

function handoffFromRecord(value: Record<string, unknown> | undefined): TaskSpec['handoff'] {
  if (!value) {
    return undefined;
  }
  const reviewer = stringValue(value.reviewer);
  const finalOwner = stringValue(value.finalOwner) ?? stringValue(value.final_owner);
  return reviewer || finalOwner ? { reviewer, finalOwner } : undefined;
}

function verificationCommands(value: Record<string, unknown> | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }
  const verification = record(value.verification);
  return stringList(verification?.commands)
    ?? stringList(value.verificationCommands)
    ?? stringList(value.verify);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const values = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  return values.length > 0 ? values : undefined;
}

function firstLine(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const line = value.split('\n').map((part) => part.trim()).find(Boolean);
  return line ? line.slice(0, 120) : undefined;
}

function runIdForTask(taskId: string): string {
  return `run_a2a_${safeId(taskId)}`;
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function contentHash(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}
