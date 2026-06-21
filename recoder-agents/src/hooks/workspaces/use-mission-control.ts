'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import {
  dockerBackendApi,
  connectDockerSSE,
  type DockerSSEConnection,
} from '@/lib/docker-backend-api';
import {
  useAgentTeamStore,
  type AgentTeamMember,
} from '@/stores/agent-team-store';

const missionControlKeys = {
  snapshot: (wsId: string) => ['mission-control', 'snapshot', wsId] as const,
  fleet: (wsId: string) => ['mission-control', 'fleet', wsId] as const,
  pipeline: (wsId: string) => ['mission-control', 'pipeline', wsId] as const,
  metrics: (wsId: string) => ['mission-control', 'metrics', wsId] as const,
  agentOsSummary: () => ['mission-control', 'agent-os-summary'] as const,
  agentOsRunHistory: (runId: string) =>
    ['mission-control', 'agent-os-run-history', runId] as const,
};

export interface MissionControlSummary {
  totalAgents: number;
  onlineAgents: number;
  offlineAgents: number;
  localBridgeSessions: number;
  pairedBridgeSessions: number;
  healthyPairedBridgeSessions?: number;
  unhealthyPairedBridgeSessions?: number;
  totalTasks: number;
  activeTasks: number;
  tasksByState: Record<string, number>;
  pendingApprovals: number;
  totalApprovals: number;
  activeHandoffs: number;
  totalHandoffs: number;
  evidenceItems: number;
  previews: number;
  artifacts: number;
  logEvidence: number;
  runtimeEvidence: number;
}

export interface MissionControlSnapshot {
  workspace: Record<string, unknown>;
  summary: MissionControlSummary;
  agents: AgentTeamMember[];
  tasks: Record<string, unknown>[];
  approvals: Record<string, unknown>[];
  handoffs: Record<string, unknown>[];
  bridgeSessions: Record<string, unknown>[];
}

export interface AgentOsWorkSignal {
  signalId: string;
  taskId: string;
  runId?: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'resolved';
  detectedReason: string;
  source: string;
  recommendedNextAction: string;
  detectedAt: string;
  spaceId?: string;
}

export interface AgentOsInstructionBundle {
  bundleId: string;
  taskId: string;
  agentId: string;
  runtime: string;
  sourceCount: number;
  memoryRefCount: number;
  verificationCommands: string[];
  forbiddenActions: string[];
  compiledAt: string;
}

export interface AgentOsInstructionBundleArtifact {
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
}

export interface AgentOsRuntimeEvidence {
  evidenceId: string;
  taskId: string;
  runId?: string;
  kind: string;
  status: 'observed' | 'passed' | 'failed' | 'warning';
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
}

export interface AgentOsDeliveryArtifact {
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
}

export interface AgentOsRunSummary {
  runId: string;
  taskId: string;
  title?: string;
  state: string;
  assigneeAgentId?: string;
  instructionBundleId?: string;
  artifactCount: number;
  runtimeEvidenceCount: number;
  approvalCount: number;
  updatedAt: string;
}

export interface AgentOsApprovalSummary {
  approvalId: string;
  taskId: string;
  runId?: string;
  status: string;
  reason: string;
  requiredAt: string;
  requestedAt: string;
}

export interface AgentOsOssComponent {
  componentId: string;
  name: string;
  contract: string;
  owner?: string;
  status: string;
  risk?: 'low' | 'medium' | 'high';
  canExecuteCode: boolean;
  canTouchProduction: boolean;
}

export interface AgentOsSummary {
  generatedAt: string;
  counts: {
    openWorkSignals: number;
    [key: string]: number;
  };
  workSignals: AgentOsWorkSignal[];
  runs: AgentOsRunSummary[];
  approvals: AgentOsApprovalSummary[];
  instructionBundles: AgentOsInstructionBundle[];
  instructionBundleArtifacts: AgentOsInstructionBundleArtifact[];
  runtimeEvidence: AgentOsRuntimeEvidence[];
  deliveryArtifacts: AgentOsDeliveryArtifact[];
  ossComponents: AgentOsOssComponent[];
}

export type AgentOsRunHistoryItemKind =
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

export type AgentOsRunHistoryItemSeverity =
  | 'info'
  | 'success'
  | 'warning'
  | 'block';

export interface AgentOsRunHistoryItem {
  itemId: string;
  kind: AgentOsRunHistoryItemKind;
  taskId: string;
  runId?: string;
  createdAt: string;
  title: string;
  summary?: string;
  severity: AgentOsRunHistoryItemSeverity;
  refs?: Record<string, string>;
  data?: Record<string, unknown>;
}

export interface AgentOsRunHistory {
  run: {
    runId: string;
    taskId: string;
    state: string;
    assigneeAgentId?: string;
    instructionBundleId?: string;
    updatedAt: string;
    metadata?: Record<string, unknown>;
  };
  task?: {
    taskId: string;
    prompt?: string;
    intent?: string;
    [key: string]: unknown;
  };
  items: AgentOsRunHistoryItem[];
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
    state: string;
    updatedAt: string;
    lastEventAt?: string;
    waitingApprovalIds: string[];
    artifactIds: string[];
    previewArtifactIds: string[];
    pullRequestArtifactIds: string[];
    runtimeEvidenceIds: string[];
    githubDeliveryLinkIds: string[];
  };
}

function mapSnapshotAgents(
  input: Array<string | Record<string, unknown>>,
): AgentTeamMember[] {
  return input.map((a) => ({
    agentId: typeof a === 'string' ? a : (a.agentId as string),
    name:
      typeof a === 'string' ? a : ((a.name as string) ?? (a.agentId as string)),
    platform:
      typeof a === 'string' ? 'custom' : ((a.platform as string) ?? 'custom'),
    status:
      typeof a === 'string'
        ? ('idle' as const)
        : ((a.status as AgentTeamMember['status']) ?? 'idle'),
    skills:
      typeof a === 'string'
        ? []
        : ((a.skills as string[]) ?? (a.capabilities as string[]) ?? []),
    isLocal: typeof a === 'string' ? false : ((a.isLocal as boolean) ?? false),
    capabilities:
      typeof a === 'string' ? [] : ((a.capabilities as string[]) ?? []),
    lastSeen:
      typeof a === 'string' ? undefined : (a.lastSeen as string | undefined),
  }));
}

export function useControlPlaneSnapshot(wsId: string | null) {
  const setAgents = useAgentTeamStore((s) => s.setAgents);

  return useQuery({
    queryKey: missionControlKeys.snapshot(wsId ?? ''),
    queryFn: async () => {
      const res = await dockerBackendApi.get<MissionControlSnapshot>(
        `/api/a2a/workspaces/${wsId}/control-plane`,
      );
      if (res.success && res.data) {
        const members = mapSnapshotAgents(
          (res.data.agents as unknown as Array<
            string | Record<string, unknown>
          >) ?? [],
        );
        setAgents(members);
        return {
          ...res.data,
          agents: members,
        };
      }
      throw new Error(
        res.error?.message || 'Failed to fetch control-plane snapshot',
      );
    },
    enabled: !!wsId,
    refetchInterval: 5_000,
  });
}

export function useAgentOsSummary() {
  return useQuery({
    queryKey: missionControlKeys.agentOsSummary(),
    queryFn: async () => {
      const res = await dockerBackendApi.get<AgentOsSummary>(
        '/api/agent-os/summary',
      );
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to fetch Agent OS summary');
    },
    refetchInterval: 10_000,
  });
}

/**
 * Fetch the unified, chronologically-sorted run history (task -> instruction
 * bundle -> artifact -> PR -> preview -> runtime evidence -> approval -> handoff)
 * for a single Agent OS run from shared control-plane history.
 */
export function useAgentOsRunHistory(runId: string | null) {
  return useQuery({
    queryKey: missionControlKeys.agentOsRunHistory(runId ?? ''),
    queryFn: async () => {
      const res = await dockerBackendApi.get<AgentOsRunHistory>(
        `/api/agent-os/runs/${runId}/history`,
      );
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to fetch run history');
    },
    enabled: !!runId,
    refetchInterval: 10_000,
  });
}

export interface AgentOsApprovalDecisionInput {
  approvalId: string;
  decision: 'approved' | 'rejected';
  decidedBy: string;
  reason?: string;
  runId?: string;
}

/**
 * Decide a pending Agent OS approval (approve or reject) and refresh the shared
 * summary + affected run-history timeline so the gate result is visible
 * immediately. Backs the human-in-the-loop approval gate in the control plane.
 */
export function useAgentOsApprovalDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AgentOsApprovalDecisionInput) => {
      const res = await dockerBackendApi.post<{
        approval: AgentOsApprovalSummary;
        run?: AgentOsRunSummary;
      }>(`/api/agent-os/approvals/${input.approvalId}/${input.decision}`, {
        decidedBy: input.decidedBy,
        reason: input.reason,
      });
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to record approval decision');
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({
        queryKey: missionControlKeys.agentOsSummary(),
      });
      if (input.runId) {
        queryClient.invalidateQueries({
          queryKey: missionControlKeys.agentOsRunHistory(input.runId),
        });
      }
    },
  });
}

export function useAgentFleet(wsId: string | null) {
  const setAgents = useAgentTeamStore((s) => s.setAgents);

  return useQuery({
    queryKey: missionControlKeys.fleet(wsId ?? ''),
    queryFn: async () => {
      const res = await dockerBackendApi.get<{ agents: AgentTeamMember[] }>(
        `/api/a2a/workspaces/${wsId}/agents`,
      );
      if (res.success && res.data) {
        const members = mapSnapshotAgents(
          res.data.agents as unknown as Array<string | Record<string, unknown>>,
        );
        setAgents(members);
        return members;
      }
      throw new Error(res.error?.message || 'Failed to fetch fleet');
    },
    enabled: !!wsId,
    staleTime: 15_000,
  });
}

export function useTaskPipeline(wsId: string | null) {
  return useQuery({
    queryKey: missionControlKeys.pipeline(wsId ?? ''),
    queryFn: async () => {
      const res = await dockerBackendApi.get<{
        tasks: Record<string, unknown>[];
      }>(`/api/a2a/workspaces/${wsId}/tasks`);
      if (res.success && res.data) return res.data.tasks;
      throw new Error(res.error?.message || 'Failed to fetch tasks');
    },
    enabled: !!wsId,
    refetchInterval: 5_000,
  });
}

export function useSLOMetrics(wsId: string | null) {
  return useQuery({
    queryKey: missionControlKeys.metrics(wsId ?? ''),
    queryFn: async () => {
      const res =
        await dockerBackendApi.get<Record<string, unknown>>('/api/a2a/metrics');
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to fetch metrics');
    },
    enabled: !!wsId,
    staleTime: 30_000,
  });
}

/**
 * Subscribe to workspace-wide SSE for live activity updates.
 */
export function useActivityTimeline(
  wsId: string | null,
  onEvent?: (event: Record<string, unknown>) => void,
) {
  const connectionRef = useRef<DockerSSEConnection | null>(null);

  useEffect(() => {
    if (!wsId) return;

    connectionRef.current?.close();

    function forward(event: MessageEvent) {
      try {
        const data = JSON.parse(event.data);
        onEvent?.(data);
      } catch {
        /* ignore */
      }
    }

    const connection = connectDockerSSE(`/api/a2a/workspaces/${wsId}/stream`, {
      'task.submitted': forward,
      'task.started': forward,
      'artifact.attached': forward,
      'evidence.attached': forward,
      'task.completed': forward,
      'task.failed': forward,
      'task.input-required': forward,
      'message.new': forward,
      'handoff.initiated': forward,
      'handoff.accepted': forward,
      'handoff.completed': forward,
      'handoff.declined': forward,
      'review.accepted': forward,
      'merge.requested': forward,
      'approval.requested': forward,
      'approval.granted': forward,
      'approval.rejected': forward,
      'approval.escalated': forward,
      'agent.online': forward,
      'agent.offline': forward,
    });

    connectionRef.current = connection;

    return () => {
      connection.close();
      connectionRef.current = null;
    };
  }, [wsId, onEvent]);
}
