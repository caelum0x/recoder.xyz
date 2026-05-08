import type { TaskEnvelope, TaskEvidenceItem } from '@recoder/shared/a2a';
import { getTaskLifecycleService } from './task-lifecycle.service';
import { getApprovalGateService } from './approval-gate.service';
import { getDelegationChainService } from './delegation-chain.service';
import { getAgentRegistryService } from './agent-registry.service';
import { getAgentBridgeService } from './agent-bridge.service';
import { listBridgeSessionsForBinding } from '../a2a-gateway';

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

function collectFilesChanged(evidence: TaskEvidenceItem[]): string[] {
  return evidence
    .filter((item) => item.kind === 'file-change')
    .map((item) => item.ref || item.label)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
}

export async function buildTaskRunContext(task: TaskEnvelope) {
  const service = getTaskLifecycleService();
  const transitionsResult = service.getTaskHistory(task.id);
  const transitions = transitionsResult.ok ? transitionsResult.data : [];
  const audit = service.getRecentAuditEventsForTask(task.id, 100);

  const approvalId = extractApprovalId(task);
  const delegationId = extractDelegationId(task);
  const approval = approvalId ? getApprovalGateService().get(approvalId) : undefined;
  const delegation = delegationId ? getDelegationChainService().getDelegation(delegationId) : undefined;
  const delegationChain = delegationId ? getDelegationChainService().getChain(delegationId) : undefined;

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
        scope: session.scope || null,
        agentName: session.agentName || null,
        agentPlatform: session.agentPlatform || null,
        workspaceId: session.workspaceId || null,
        projectId: session.projectId || null,
        capabilities: session.capabilities || [],
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        heartbeat: session.heartbeat,
      })),
    },
    runtime: {
      evidence,
      preview,
      artifacts,
      filesChanged,
      evidenceCount: evidence.length,
      previewCount: preview.length,
      artifactCount: artifacts.length,
    },
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
        }
      : null,
    handoff: context.links.delegation
      ? {
          delegationId: context.links.delegation.delegationId,
          status: context.links.delegation.status,
          toAgentId: context.links.delegation.toAgentId,
        }
      : null,
    assignee: context.assignee,
    runtime: context.runtime,
    transitionCount: context.transitions.length,
    auditCount: context.audit.length,
  };
}
