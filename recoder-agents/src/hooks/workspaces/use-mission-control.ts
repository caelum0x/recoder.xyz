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
  agentOsDeliveryLinks: () =>
    ['mission-control', 'agent-os-delivery-links'] as const,
  agentOsSpaces: () => ['mission-control', 'agent-os-spaces'] as const,
  agentOsOutbox: () => ['mission-control', 'agent-os-outbox'] as const,
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

export type AgentOsOutboxStatus =
  | 'pending'
  | 'published'
  | 'failed'
  | 'discarded';

export interface AgentOsOutboxRecord {
  outboxId: string;
  status: AgentOsOutboxStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
  event: {
    id: string;
    type: string;
    source: string;
    subject: string;
    time: string;
    data?: Record<string, unknown>;
  };
}

export interface AgentOsSpaceRepository {
  repoId: string;
  provider: 'github' | 'gitlab' | 'bitbucket' | 'local' | 'custom';
  owner: string;
  name: string;
  defaultBranch?: string;
  url?: string;
}

export interface AgentOsSpace {
  spaceId: string;
  displayName: string;
  ownerId: string;
  repositories: AgentOsSpaceRepository[];
  createdAt: string;
  updatedAt: string;
}

export type GitHubDeliveryLinkStatus =
  | 'branch_mapped'
  | 'pr_open'
  | 'checks_pending'
  | 'checks_failed'
  | 'review_required'
  | 'ready_for_approval'
  | 'merged'
  | 'closed'
  | 'blocked';

export interface GitHubCheckSummary {
  name: string;
  state:
    | 'success'
    | 'failure'
    | 'pending'
    | 'skipped'
    | 'cancelled'
    | 'neutral'
    | 'action_required';
  url?: string;
  completedAt?: string;
}

export interface GitHubReviewSummary {
  reviewer: string;
  state:
    | 'approved'
    | 'changes_requested'
    | 'commented'
    | 'pending'
    | 'dismissed';
  url?: string;
  submittedAt?: string;
}

export interface AgentOsGitHubDeliveryLink {
  linkId: string;
  taskId: string;
  runId?: string;
  spaceId: string;
  repository: string;
  branch: string;
  baseBranch?: string;
  issueNumber?: number | string;
  issueUrl?: string;
  pullRequestUrl?: string;
  pullRequestNumber?: number | string;
  previewArtifactIds: string[];
  checks: GitHubCheckSummary[];
  reviews: GitHubReviewSummary[];
  status: GitHubDeliveryLinkStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
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

/**
 * Fetch the Agent OS CloudEvent outbox so the operator can see pending /
 * published / failed control-plane event delivery for the launch loop.
 */
export function useAgentOsOutbox() {
  return useQuery({
    queryKey: missionControlKeys.agentOsOutbox(),
    queryFn: async () => {
      const res = await dockerBackendApi.get<AgentOsOutboxRecord[]>(
        '/api/agent-os/outbox',
      );
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to fetch event outbox');
    },
    refetchInterval: 10_000,
  });
}

/**
 * Fetch Agent OS control-plane Spaces and their connected repositories so the
 * operator can see and manage the 'connect repo' step of the paid-user loop.
 */
export function useAgentOsSpaces() {
  return useQuery({
    queryKey: missionControlKeys.agentOsSpaces(),
    queryFn: async () => {
      const res = await dockerBackendApi.get<AgentOsSpace[]>(
        '/api/agent-os/spaces',
      );
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to fetch Agent OS spaces');
    },
    refetchInterval: 30_000,
  });
}

export interface ConnectAgentOsRepositoryInput {
  spaceId: string;
  owner: string;
  name: string;
  defaultBranch?: string;
  url?: string;
}

/**
 * Connect a GitHub repository to an Agent OS Space, then refresh spaces and
 * delivery links so the new repo is available for the task → PR pipeline.
 */
export function useConnectAgentOsRepository() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ConnectAgentOsRepositoryInput) => {
      const res = await dockerBackendApi.post<AgentOsSpace>(
        `/api/agent-os/spaces/${input.spaceId}/repositories/github`,
        {
          owner: input.owner,
          name: input.name,
          defaultBranch: input.defaultBranch,
          url: input.url,
        },
      );
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to connect repository');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: missionControlKeys.agentOsSpaces(),
      });
      queryClient.invalidateQueries({
        queryKey: missionControlKeys.agentOsDeliveryLinks(),
      });
    },
  });
}

/**
 * Fetch GitHub delivery links (branch → PR → checks → review → ready_for_approval
 * → merged) so the control plane can show real PR delivery status for the
 * task → artifact → PR pipeline.
 */
export function useAgentOsDeliveryLinks() {
  return useQuery({
    queryKey: missionControlKeys.agentOsDeliveryLinks(),
    queryFn: async () => {
      const res = await dockerBackendApi.get<AgentOsGitHubDeliveryLink[]>(
        '/api/agent-os/github/delivery-links',
      );
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to fetch delivery links');
    },
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

export interface AgentOsResolveWorkSignalInput {
  signalId: string;
  resolvedBy: string;
}

/**
 * Resolve a detected Agent OS work signal (blocker) and refresh the shared
 * summary so the cleared blocker disappears from mission control.
 */
export function useAgentOsResolveWorkSignal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AgentOsResolveWorkSignalInput) => {
      const res = await dockerBackendApi.patch<AgentOsWorkSignal>(
        `/api/agent-os/work-signals/${input.signalId}/status`,
        { status: 'resolved', resolvedBy: input.resolvedBy },
      );
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to resolve work signal');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: missionControlKeys.agentOsSummary(),
      });
    },
  });
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
