import type { TaskEnvelope, TaskEvidenceItem, TaskStateTransition } from '@recoder/shared/a2a';
import { getTaskLifecycleService } from './task-lifecycle.service';
import { getApprovalGateService } from './approval-gate.service';
import { getDelegationChainService } from './delegation-chain.service';
import { getAgentRegistryService } from './agent-registry.service';
import { getAgentBridgeService } from './agent-bridge.service';
import { getOrchestrationHistorySummary, listBridgeSessionsForBinding } from '../a2a-gateway';
import { getApproval as getPolicyApproval } from '../policy/approval-store.js';

function extractApprovalId(task: TaskEnvelope): string | undefined {
  const direct = task.metadata?.approval as Record<string, unknown> | undefined;
  if (direct && typeof direct.approvalId === 'string' && direct.approvalId) {
    return direct.approvalId;
  }
  const nested = task.metadata?.handoff as Record<string, unknown> | undefined;
  if (nested && typeof nested.approvalId === 'string' && nested.approvalId) {
    return nested.approvalId;
  }
  return undefined;
}

function extractDelegationId(task: TaskEnvelope): string | undefined {
  if (typeof task.metadata?.delegationId === 'string' && task.metadata.delegationId) {
    return task.metadata.delegationId;
  }
  const handoff = task.metadata?.handoff as Record<string, unknown> | undefined;
  if (handoff && typeof handoff.delegationId === 'string' && handoff.delegationId) {
    return handoff.delegationId;
  }
  return undefined;
}

function resolveApprovalLink(task: TaskEnvelope) {
  const approvalId = extractApprovalId(task);
  if (!approvalId) return null;

  const gateApproval = getApprovalGateService().get(approvalId);
  if (gateApproval) {
    return {
      approvalId: gateApproval.approvalId,
      status: gateApproval.status,
      action: gateApproval.action,
      targetAgentId: gateApproval.targetAgentId,
      requestedBy: gateApproval.requestingAgentId,
      resolvedBy: gateApproval.resolvedBy ?? null,
      resolvedAt: gateApproval.resolvedAt ?? null,
      createdAt: gateApproval.createdAt,
      source: 'approval-gate' as const,
    };
  }

  const policyApproval = getPolicyApproval(approvalId);
  if (!policyApproval) return null;

  return {
    approvalId: policyApproval.id,
    status: policyApproval.status,
    action: policyApproval.action,
    resource: policyApproval.resource,
    grantedBy: policyApproval.granted_by,
    grantedAt: policyApproval.granted_at,
    expiresAt: policyApproval.expires_at,
    resolvedBy: policyApproval.revoked_by,
    resolvedAt: policyApproval.revoked_at,
    source: 'policy' as const,
  };
}

function collectFilesChanged(evidence: TaskEvidenceItem[]): string[] {
  return evidence
    .filter((item) => item.kind === 'file-change')
    .map((item) => item.ref || item.label)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
}

function readMetadata(item: TaskEvidenceItem): Record<string, unknown> | null {
  return item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
    ? (item.metadata as Record<string, unknown>)
    : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractTaskRun(
  task: TaskEnvelope,
  transitions: TaskStateTransition[],
  reviewHistory: Array<{
    at: string | null;
    type: string | null;
    actor: string | null;
    status: string | null;
    note: string | null;
    branchName: string | null;
    baseBranch: string | null;
    reviewTarget: string | null;
    reviewPath: string | null;
    suggestedAction: string | null;
  }>,
  runtime: {
    evidenceCount: number;
    previewCount: number;
    artifactCount: number;
    logCount: number;
    runtimeCount: number;
    git: {
      branch: string | null;
      status: string | null;
      cloneUrl: string | null;
    } | null;
  },
) {
  const startedAt =
    transitions.find((transition) => transition.to === 'working')?.transitioned_at ??
    null;
  const terminalTransition =
    [...transitions]
      .reverse()
      .find((transition) =>
        transition.to === 'completed' ||
        transition.to === 'failed' ||
        transition.to === 'cancelled',
      ) ?? null;
  const metadata = readRecord(task.metadata);
  const resultData = readRecord(task.result?.data);

  return {
    taskId: task.id,
    state: task.state,
    startedAt,
    completedAt: terminalTransition?.transitioned_at ?? null,
    exitCode:
      typeof resultData?.exitCode === 'number'
        ? resultData.exitCode
        : typeof metadata?.exitCode === 'number'
          ? metadata.exitCode
          : null,
    assigneeAgentId: task.assignee.agent_id,
    branch:
      runtime.git?.branch ??
      (typeof metadata?.worktree === 'object' && metadata?.worktree !== null
        ? (metadata.worktree as Record<string, unknown>).branchName as string | undefined
        : undefined) ??
      null,
    reviewReady: reviewHistory.some((entry) => entry.type === 'review.accepted'),
    mergeRequested: reviewHistory.some((entry) => entry.type === 'merge.requested'),
    artifactCount: runtime.artifactCount,
    previewCount: runtime.previewCount,
    logCount: runtime.logCount,
    evidenceCount: runtime.evidenceCount,
  };
}

function summarizeTaskPrompt(task: TaskEnvelope): string {
  const payload = Array.isArray(task.payload) ? task.payload[0] : task.payload;
  const payloadRecord =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as unknown as Record<string, unknown>)
      : null;
  return typeof payloadRecord?.text === 'string' ? payloadRecord.text : '';
}

function buildTaskTimeline(input: {
  task: TaskEnvelope;
  transitions: TaskStateTransition[];
  artifacts: NonNullable<TaskEnvelope['result']>['artifacts'];
  preview: NonNullable<TaskEnvelope['result']>['preview'];
  filesChanged: string[];
  reviewHistory: Array<{
    at: string | null;
    type: string | null;
    actor: string | null;
    status: string | null;
    note: string | null;
    branchName: string | null;
    baseBranch: string | null;
    reviewTarget: string | null;
    reviewPath: string | null;
    suggestedAction: string | null;
  }>;
}) {
  const timeline: Array<Record<string, unknown>> = [];
  const prompt = summarizeTaskPrompt(input.task);

  timeline.push({
    at: input.task.created_at,
    type: 'task.created',
    title: 'Task created',
    detail: prompt || input.task.id,
  });

  timeline.push({
    at: input.task.created_at,
    type: 'agent.assigned',
    title: 'Agent assigned',
    detail: input.task.assignee.name ?? input.task.assignee.agent_id,
  });

  for (const transition of input.transitions) {
    timeline.push({
      at: transition.transitioned_at,
      type: `task.${transition.to}`,
      title: `Task ${transition.to}`,
      detail: transition.reason ?? transition.triggered_by ?? null,
    });
  }

  for (const reviewEvent of input.reviewHistory) {
    timeline.push({
      at: reviewEvent.at,
      type: reviewEvent.type ?? 'review.event',
      title: reviewEvent.type ?? 'review.event',
      detail: reviewEvent.branchName ?? reviewEvent.reviewTarget ?? reviewEvent.note ?? null,
    });
  }

  if (input.filesChanged.length > 0) {
    timeline.push({
      at: input.task.updated_at,
      type: 'files.changed',
      title: 'Files changed',
      detail: `${input.filesChanged.length} file(s)`,
      files: input.filesChanged,
    });
  }

  if ((input.preview ?? []).length > 0) {
    for (const preview of input.preview ?? []) {
      const previewMetadata = readRecord(preview.metadata);
      timeline.push({
        at:
          typeof previewMetadata?.createdAt === 'string'
            ? previewMetadata.createdAt
            : input.task.updated_at,
        type: 'preview.attached',
        title: 'Preview attached',
        detail: preview.url,
      });
    }
  }

  if (input.artifacts && input.artifacts.length > 0) {
    for (const artifact of input.artifacts) {
      const artifactMetadata = readRecord(artifact.metadata);
      timeline.push({
        at:
          typeof artifactMetadata?.createdAt === 'string'
            ? artifactMetadata.createdAt
            : input.task.updated_at,
        type: `artifact.${artifact.artifact_type}`,
        title: `Artifact: ${artifact.artifact_type}`,
        detail: artifact.key,
      });
    }
  }

  return timeline
    .filter((entry) => typeof entry.at === 'string' && entry.at)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

export async function buildTaskRunContext(task: TaskEnvelope) {
  const service = getTaskLifecycleService();
  const transitionsResult = service.getTaskHistory(task.id);
  const transitions = transitionsResult.ok ? transitionsResult.data : [];
  const audit = service.getRecentAuditEventsForTask(task.id, 100);

  const delegationId = extractDelegationId(task);
  const approval = resolveApprovalLink(task);
  const delegation = delegationId ? getDelegationChainService().getDelegation(delegationId) : undefined;
  const delegationChain = delegationId ? getDelegationChainService().getChain(delegationId) : undefined;
  const orchestration = await getOrchestrationHistorySummary({
    threadId: task.thread_id,
    traceId: task.trace_id,
  });

  const registryAgent = getAgentRegistryService().getWithHealth(task.assignee.agent_id);
  const localBridgeSessions = getAgentBridgeService().getSessionsForAgent(task.assignee.agent_id).map((session) => ({
    sessionId: session.sessionId,
    workspaceIds: session.workspaceIds,
    capabilities: session.capabilities,
    status: session.status,
    connectedAt: session.connectedAt,
    lastHeartbeat: session.lastHeartbeat,
    label: session.label,
  }));
  const pairedBridgeSessions = await listBridgeSessionsForBinding({
    agentId: task.assignee.agent_id,
    workspaceId: task.workspace_id,
  });

  const evidence = task.result?.evidence ?? [];
  const preview = task.result?.preview ?? [];
  const artifacts = task.result?.artifacts ?? [];
  const filesChanged = collectFilesChanged(evidence);
  const logEvidence = evidence.filter((item) => item.kind === 'log');
  const runtimeEvidence = evidence.filter((item) => item.kind === 'runtime');
  const gitEvidence = runtimeEvidence.find((item) => {
    const metadata = readMetadata(item);
    return Boolean(metadata?.gitStatus || metadata?.gitBranch || metadata?.cloneUrl);
  });
  const gitMetadata = gitEvidence ? readMetadata(gitEvidence) : null;
  const worktreeMetadata = readRecord(task.metadata?.worktree);
  const handoffMetadata = readRecord(task.metadata?.handoff);
  const mergeMetadata = readRecord(task.metadata?.merge);
  const reviewHistory = Array.isArray(task.metadata?.reviewHistory)
    ? task.metadata.reviewHistory
        .filter((entry): entry is Record<string, unknown> => Boolean(readRecord(entry)))
        .map((entry) => {
          const record = readRecord(entry)!;
          return {
            at: typeof record.at === 'string' ? record.at : null,
            type: typeof record.type === 'string' ? record.type : null,
            actor: typeof record.actor === 'string' ? record.actor : null,
            status: typeof record.status === 'string' ? record.status : null,
            note: typeof record.note === 'string' ? record.note : null,
            branchName: typeof record.branchName === 'string' ? record.branchName : null,
            baseBranch: typeof record.baseBranch === 'string' ? record.baseBranch : null,
            reviewTarget: typeof record.reviewTarget === 'string' ? record.reviewTarget : null,
            reviewPath: typeof record.reviewPath === 'string' ? record.reviewPath : null,
            suggestedAction:
              typeof record.suggestedAction === 'string' ? record.suggestedAction : null,
          };
        })
    : [];

  return {
    task,
    transitions,
    audit,
    links: {
      ...(approval ? { approval } : {}),
      ...(delegation ? { delegation } : {}),
      ...(delegationChain ? { delegationChain } : {}),
    },
    assignee: {
      agentId: task.assignee.agent_id,
      name: registryAgent?.identity.name ?? task.assignee.name ?? task.assignee.agent_id,
      platform: registryAgent?.identity.platform ?? task.assignee.platform,
      registry: registryAgent
        ? {
            online: registryAgent.health.online,
            lastHeartbeat: registryAgent.health.lastHeartbeat,
            reconnectCount: registryAgent.lifecycle.reconnectCount,
            registrationCount: registryAgent.lifecycle.registrationCount,
          }
        : null,
      localBridgeSessions,
      pairedBridgeSessions: pairedBridgeSessions.map((session) => ({
        bridgeId: session.bridgeId,
        durableIdentity: session.durableIdentity,
        scope: session.scope || null,
        agentName: session.agentName || null,
        agentPlatform: session.agentPlatform || null,
        workspaceId: session.workspaceId || null,
        projectId: session.projectId || null,
        capabilities: session.capabilities || [],
        normalizedCapabilities: session.capabilities || [],
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        heartbeat: session.heartbeat,
        registry: session.registry,
      })),
    },
    review: {
      worktree: worktreeMetadata
        ? {
            isolated: worktreeMetadata.isolated === true,
            reviewReady: worktreeMetadata.reviewReady === true,
            branchName: typeof worktreeMetadata.branchName === 'string' ? worktreeMetadata.branchName : null,
            baseBranch: typeof worktreeMetadata.baseBranch === 'string' ? worktreeMetadata.baseBranch : null,
            worktreePath: typeof worktreeMetadata.worktreePath === 'string' ? worktreeMetadata.worktreePath : null,
            changedFiles: Array.isArray(worktreeMetadata.changedFiles)
              ? worktreeMetadata.changedFiles.filter((value): value is string => typeof value === 'string')
              : [],
          }
        : null,
      handoff: handoffMetadata
        ? {
            status: typeof handoffMetadata.status === 'string' ? handoffMetadata.status : null,
            intent: typeof handoffMetadata.intent === 'string' ? handoffMetadata.intent : null,
            reviewTarget: typeof handoffMetadata.reviewTarget === 'string' ? handoffMetadata.reviewTarget : null,
            reviewPath: typeof handoffMetadata.reviewPath === 'string' ? handoffMetadata.reviewPath : null,
            assignedBy: typeof handoffMetadata.assignedBy === 'string' ? handoffMetadata.assignedBy : null,
          }
        : null,
      merge: mergeMetadata
        ? {
            status: typeof mergeMetadata.status === 'string' ? mergeMetadata.status : null,
            branchName: typeof mergeMetadata.branchName === 'string' ? mergeMetadata.branchName : null,
            baseBranch: typeof mergeMetadata.baseBranch === 'string' ? mergeMetadata.baseBranch : null,
            suggestedAction: typeof mergeMetadata.suggestedAction === 'string' ? mergeMetadata.suggestedAction : null,
            changedFiles: Array.isArray(mergeMetadata.changedFiles)
              ? mergeMetadata.changedFiles.filter((value): value is string => typeof value === 'string')
              : [],
          }
        : null,
      history: reviewHistory,
    },
    runtime: {
      evidence,
      preview,
      artifacts,
      filesChanged,
      evidenceCount: evidence.length,
      previewCount: preview.length,
      artifactCount: artifacts.length,
      logCount: logEvidence.length,
      runtimeCount: runtimeEvidence.length,
      logs: logEvidence.map((item) => ({
        label: item.label,
        ref: item.ref || null,
        excerpt: typeof readMetadata(item)?.excerpt === 'string' ? readMetadata(item)?.excerpt : null,
      })),
      git: gitMetadata
        ? {
            branch: typeof gitMetadata.gitBranch === 'string' ? gitMetadata.gitBranch : null,
            status: typeof gitMetadata.gitStatus === 'string' ? gitMetadata.gitStatus : null,
            cloneUrl: typeof gitMetadata.cloneUrl === 'string' ? gitMetadata.cloneUrl : null,
          }
        : null,
    },
    controlPlane: orchestration
      ? {
          historyVersion:
            typeof orchestration.historyVersion === 'string' ? orchestration.historyVersion : null,
          workspaceId:
            typeof orchestration.workspaceId === 'string' ? orchestration.workspaceId : null,
          summary:
            orchestration.summary && typeof orchestration.summary === 'object'
              ? (orchestration.summary as Record<string, unknown>)
              : null,
        }
      : null,
    run: extractTaskRun(
      task,
      transitions,
      reviewHistory,
      {
        evidenceCount: evidence.length,
        previewCount: preview.length,
        artifactCount: artifacts.length,
        logCount: logEvidence.length,
        runtimeCount: runtimeEvidence.length,
        git: gitMetadata
          ? {
              branch: typeof gitMetadata.gitBranch === 'string' ? gitMetadata.gitBranch : null,
              status: typeof gitMetadata.gitStatus === 'string' ? gitMetadata.gitStatus : null,
              cloneUrl: typeof gitMetadata.cloneUrl === 'string' ? gitMetadata.cloneUrl : null,
            }
          : null,
      },
    ),
    timeline: buildTaskTimeline({
      task,
      transitions,
      artifacts,
      preview,
      filesChanged,
      reviewHistory,
    }),
  };
}

export async function buildTaskRunSummary(task: TaskEnvelope) {
  const context = await buildTaskRunContext(task);
  return {
    id: task.id,
    prompt: (() => {
      const payload = Array.isArray(task.payload) ? task.payload[0] : task.payload;
      const payloadRecord =
        payload && typeof payload === 'object' && !Array.isArray(payload)
          ? (payload as unknown as Record<string, unknown>)
          : null;
      if (payloadRecord) {
        const text = payloadRecord.text;
        if (typeof text === 'string') return text;
      }
      return '';
    })(),
    state: task.state,
    assignee_agent_id: task.assignee.agent_id,
    requester_agent_id: task.requester.agent_id,
    workspace_id: task.workspace_id,
    thread_id: task.thread_id,
    trace_id: task.trace_id,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    metadata: task.metadata ?? {},
    approval: context.links.approval
      ? {
          approvalId: context.links.approval.approvalId,
          status: context.links.approval.status,
          action: context.links.approval.action,
          resolvedBy: context.links.approval.resolvedBy,
          source: context.links.approval.source,
          grantedBy: 'grantedBy' in context.links.approval ? context.links.approval.grantedBy : null,
        }
      : null,
    handoff: context.links.delegation
      ? {
          delegationId: context.links.delegation.delegationId,
          status: context.links.delegation.status,
          toAgentId: context.links.delegation.toAgentId,
        }
      : null,
    review: context.review,
    assignee: context.assignee,
    runtime: context.runtime,
    controlPlane: context.controlPlane
      ? {
          historyVersion: context.controlPlane.historyVersion,
          workspaceId: context.controlPlane.workspaceId,
          mode:
            typeof context.controlPlane.summary?.mode === 'string'
              ? context.controlPlane.summary.mode
              : null,
          lifecycleCount:
            typeof context.controlPlane.summary?.lifecycleCount === 'number'
              ? context.controlPlane.summary.lifecycleCount
              : 0,
          evidenceCount:
            typeof context.controlPlane.summary?.evidenceCount === 'number'
              ? context.controlPlane.summary.evidenceCount
              : 0,
          totalTimelineCount:
            typeof context.controlPlane.summary?.totalTimelineCount === 'number'
              ? context.controlPlane.summary.totalTimelineCount
              : 0,
          successfulAgents: Array.isArray(context.controlPlane.summary?.successfulAgents)
            ? context.controlPlane.summary.successfulAgents
            : [],
        }
      : null,
    transitionCount: context.transitions.length,
    auditCount: context.audit.length,
  };
}
