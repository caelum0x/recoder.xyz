'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Brain,
  Boxes,
  CheckCircle2,
  Clock,
  FileText,
  GitPullRequest,
  RefreshCw,
  ShieldCheck,
  TerminalSquare,
  Workflow,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useCapabilities } from '@/hooks/use-capabilities';
import { useWorkspaces } from '@/hooks/workspaces/use-workspaces';
import {
  useAgentOsApprovalDecision,
  useAgentOsSummary,
  useControlPlaneSnapshot,
  type AgentOsApprovalSummary,
  type AgentOsDeliveryArtifact,
  type AgentOsRunSummary,
  type AgentOsWorkSignal,
} from '@/hooks/workspaces/use-mission-control';
import { OssComponentRegistry } from '@/components/oss';
import { RunTimeline } from '@/components/agent-os/run-timeline';
import { useAuth } from '@/components/AuthProvider';

type AgentOsTask = Record<string, unknown> & {
  id?: string;
  taskId?: string;
  prompt?: string;
  state?: string;
  assignee_agent_id?: string;
  instructions?: {
    sourceFiles?: Array<{ path?: string; sha?: string }>;
    verificationCommands?: string[];
    forbiddenActions?: string[];
    approvalGates?: Array<{
      approvalId?: string;
      status?: string;
      reason?: string;
    }>;
    memoryRefs?: Array<{ memoryId?: string; title?: string; scope?: string }>;
    compilerVersion?: string;
    compiledAt?: string;
  } | null;
  memoryCandidates?: Array<{
    id?: string;
    candidateId?: string;
    title?: string;
    status?: string;
    scope?: string;
  }>;
  runtime?: {
    artifactCount?: number;
    previewCount?: number;
    logCount?: number;
    evidenceCount?: number;
  } | null;
};

function countTaskArtifacts(tasks: AgentOsTask[]): number {
  return tasks.reduce(
    (sum, task) => sum + (task.runtime?.artifactCount ?? 0),
    0,
  );
}

function countMemoryCandidates(tasks: AgentOsTask[]): number {
  return tasks.reduce(
    (sum, task) => sum + (task.memoryCandidates?.length ?? 0),
    0,
  );
}

function latestInstructionTask(tasks: AgentOsTask[]): AgentOsTask | null {
  return tasks.find((task) => task.instructions) ?? null;
}

function filterByTaskIds<T extends { taskId: string }>(
  items: T[],
  taskIds: Set<string>,
): T[] {
  if (taskIds.size === 0) return items;
  return items.filter((item) => taskIds.has(item.taskId));
}

function sortRunsByUpdatedAt(runs: AgentOsRunSummary[]): AgentOsRunSummary[] {
  return [...runs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function deliveryArtifactLabel(artifact: AgentOsDeliveryArtifact): string {
  if (artifact.kind === 'pull_request') {
    return artifact.number
      ? `PR #${artifact.number}`
      : artifact.repository || artifact.artifactId;
  }
  if (artifact.kind === 'preview') {
    return artifact.environment
      ? `${artifact.provider ?? 'preview'}:${artifact.environment}`
      : artifact.provider || artifact.artifactId;
  }
  return artifact.passed === false ? 'verification failed' : 'verification';
}

function StateBadge({ state }: { state?: string }) {
  const normalized = state || 'unknown';
  const isActive = normalized === 'working' || normalized === 'input-required';
  const isDone = normalized === 'completed';
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded px-2 py-0.5 text-[11px] capitalize',
        isActive &&
          'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
        isDone &&
          'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      )}
    >
      {normalized.replace(/-/g, ' ')}
    </Badge>
  );
}

function SignalSeverityBadge({
  severity,
}: {
  severity: AgentOsWorkSignal['severity'];
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded px-2 py-0.5 text-[11px]',
        severity === 'critical' &&
          'border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-400',
        severity === 'high' &&
          'border-orange-500/50 bg-orange-500/10 text-orange-600 dark:text-orange-400',
        severity === 'medium' &&
          'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400',
        severity === 'low' &&
          'border-sky-500/50 bg-sky-500/10 text-sky-600 dark:text-sky-400',
      )}
    >
      {severity}
    </Badge>
  );
}

function StatTile({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof Activity;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

export function AgentOsControlPlane() {
  const { data: workspacesData, isLoading: workspacesLoading } =
    useWorkspaces();
  const workspaces = workspacesData?.workspaces ?? [];
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const {
    data: snapshot,
    isLoading: snapshotLoading,
    refetch,
    isFetching,
  } = useControlPlaneSnapshot(workspaceId);
  const { data: agentOsSummary } = useAgentOsSummary();
  const { data: capabilities } = useCapabilities();
  const { user } = useAuth();
  const approvalDecision = useAgentOsApprovalDecision();

  const decidingApprovalId = approvalDecision.isPending
    ? approvalDecision.variables?.approvalId
    : undefined;
  const decideApproval = (
    approval: AgentOsApprovalSummary,
    decision: 'approved' | 'rejected',
  ) => {
    if (approvalDecision.isPending) return;
    approvalDecision.mutate({
      approvalId: approval.approvalId,
      decision,
      decidedBy: user?.email || user?.id || 'agent-os-operator',
      runId: approval.runId,
    });
  };
  const isPendingApproval = (status: string) =>
    status === 'pending' || status === 'escalated';

  useEffect(() => {
    if (!workspaceId && workspaces[0]?.workspaceId) {
      setWorkspaceId(workspaces[0].workspaceId);
    }
  }, [workspaceId, workspaces]);

  const tasks = useMemo(
    () => (snapshot?.tasks ?? []) as AgentOsTask[],
    [snapshot?.tasks],
  );
  const instructionTask = latestInstructionTask(tasks);
  const instructionTasks = tasks.filter((task) => task.instructions).length;
  const memoryCandidateCount = countMemoryCandidates(tasks);
  const artifactCount = countTaskArtifacts(tasks);
  const previewCount = tasks.reduce(
    (sum, task) => sum + (task.runtime?.previewCount ?? 0),
    0,
  );
  const taskIds = useMemo(() => {
    return new Set(
      tasks
        .flatMap((task) => [task.id, task.taskId])
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    );
  }, [tasks]);
  const instructionBundles = useMemo(() => {
    const bundles = agentOsSummary?.instructionBundles ?? [];
    return filterByTaskIds(bundles, taskIds);
  }, [agentOsSummary?.instructionBundles, taskIds]);
  const instructionBundleArtifacts = useMemo(() => {
    const artifacts = agentOsSummary?.instructionBundleArtifacts ?? [];
    return filterByTaskIds(artifacts, taskIds);
  }, [agentOsSummary?.instructionBundleArtifacts, taskIds]);
  const agentOsRuns = useMemo(() => {
    return sortRunsByUpdatedAt(
      filterByTaskIds(agentOsSummary?.runs ?? [], taskIds),
    );
  }, [agentOsSummary?.runs, taskIds]);
  const selectedRun = useMemo(
    () => agentOsRuns.find((run) => run.runId === selectedRunId) ?? null,
    [agentOsRuns, selectedRunId],
  );
  useEffect(() => {
    if (agentOsRuns.length === 0) {
      if (selectedRunId !== null) setSelectedRunId(null);
      return;
    }
    const stillVisible = agentOsRuns.some((run) => run.runId === selectedRunId);
    if (!stillVisible) {
      setSelectedRunId(agentOsRuns[0]?.runId ?? null);
    }
  }, [agentOsRuns, selectedRunId]);
  const agentOsApprovals = useMemo(() => {
    return filterByTaskIds(agentOsSummary?.approvals ?? [], taskIds);
  }, [agentOsSummary?.approvals, taskIds]);
  const runtimeEvidence = useMemo(() => {
    return filterByTaskIds(agentOsSummary?.runtimeEvidence ?? [], taskIds);
  }, [agentOsSummary?.runtimeEvidence, taskIds]);
  const deliveryArtifacts = useMemo(() => {
    return filterByTaskIds(agentOsSummary?.deliveryArtifacts ?? [], taskIds);
  }, [agentOsSummary?.deliveryArtifacts, taskIds]);
  const pullRequestArtifacts = deliveryArtifacts.filter(
    (artifact) => artifact.kind === 'pull_request',
  );
  const previewArtifacts = deliveryArtifacts.filter(
    (artifact) => artifact.kind === 'preview',
  );
  const verificationArtifacts = deliveryArtifacts.filter(
    (artifact) => artifact.kind === 'verification',
  );
  const verificationCommands =
    instructionTask?.instructions?.verificationCommands?.filter(Boolean) ?? [];
  const forbiddenActions =
    instructionTask?.instructions?.forbiddenActions?.filter(Boolean) ?? [];
  const sourceFiles = instructionTask?.instructions?.sourceFiles ?? [];
  const workSignals = useMemo(() => {
    const signals = agentOsSummary?.workSignals ?? [];
    if (!workspaceId) return signals;
    return signals.filter(
      (signal) => !signal.spaceId || signal.spaceId === workspaceId,
    );
  }, [agentOsSummary?.workSignals, workspaceId]);
  const openWorkSignals = workSignals.filter(
    (signal) => signal.status === 'open',
  );

  if (workspacesLoading) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6">
        <Skeleton className="h-20 w-full rounded-lg" />
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Workflow className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Agent OS</h1>
            <p className="text-sm text-muted-foreground">
              Control-plane state for identity, routing, policy, compiled
              instructions, approvals, artifacts, and memory review.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={workspaceId ?? ''}
            onChange={(event) => setWorkspaceId(event.target.value || null)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
            aria-label="Workspace"
          >
            {workspaces.length === 0 ? (
              <option value="">No workspace</option>
            ) : (
              workspaces.map((workspace) => (
                <option
                  key={workspace.workspaceId}
                  value={workspace.workspaceId}
                >
                  {workspace.name || workspace.workspaceId}
                </option>
              ))
            )}
          </select>
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={!workspaceId || isFetching}
          >
            <RefreshCw
              className={cn('mr-2 h-4 w-4', isFetching && 'animate-spin')}
            />
            Refresh
          </Button>
        </div>
      </header>

      {!workspaceId ? (
        <Card>
          <CardHeader>
            <CardTitle>No workspace selected</CardTitle>
            <CardDescription>
              Create or select a Space before Agent OS can show control-plane
              state.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : snapshotLoading ? (
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <StatTile
              label="Agents"
              value={snapshot?.summary.onlineAgents ?? 0}
              detail={`${snapshot?.summary.totalAgents ?? 0} registered, ${snapshot?.summary.pairedBridgeSessions ?? 0} paired bridge sessions`}
              icon={Boxes}
            />
            <StatTile
              label="Compiled Runs"
              value={instructionBundles.length || instructionTasks}
              detail={`${instructionBundleArtifacts.length} durable instruction artifacts, ${sourceFiles.length} source refs on latest task`}
              icon={FileText}
            />
            <StatTile
              label="Approvals"
              value={snapshot?.summary.pendingApprovals ?? 0}
              detail={`${snapshot?.summary.totalApprovals ?? 0} total approval records`}
              icon={ShieldCheck}
            />
            <StatTile
              label="Artifacts"
              value={artifactCount}
              detail={`${previewCount} previews, ${memoryCandidateCount} memory candidates`}
              icon={GitPullRequest}
            />
            <StatTile
              label="Work Signals"
              value={openWorkSignals.length}
              detail={`${workSignals.length} tracked blockers from Agent OS detectors`}
              icon={AlertTriangle}
            />
          </section>

          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Runtime Registry</CardTitle>
                <CardDescription>
                  Connected agents plus configured coding runtimes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  {(snapshot?.agents ?? []).slice(0, 8).map((agent) => (
                    <div key={agent.agentId} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">
                          {agent.name || agent.agentId}
                        </p>
                        <StateBadge state={agent.status} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {agent.platform || 'custom'}
                      </p>
                      <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">
                        {(agent.capabilities ?? []).join(', ') ||
                          'No capabilities reported'}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border">
                  <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                    Configured runtimes
                  </div>
                  <div className="grid gap-2 p-3 sm:grid-cols-2">
                    {(capabilities?.codingRuntimes.catalog ?? [])
                      .slice(0, 8)
                      .map((runtime) => (
                        <div
                          key={runtime.type}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span className="truncate">{runtime.label}</span>
                          <Badge
                            variant={runtime.available ? 'default' : 'outline'}
                            className="rounded px-2 py-0.5 text-[11px]"
                          >
                            {runtime.available ? 'ready' : 'off'}
                          </Badge>
                        </div>
                      ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Work Signals</CardTitle>
                <CardDescription>
                  Detected blockers with agent-ready handoff actions.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {openWorkSignals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No open work signals for this workspace.
                  </p>
                ) : (
                  openWorkSignals.slice(0, 6).map((signal) => (
                    <div
                      key={signal.signalId}
                      className="rounded-lg border p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {signal.title}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {signal.detectedReason.replace(/_/g, ' ')} from{' '}
                            {signal.source.replace(/_/g, ' ')}
                          </p>
                        </div>
                        <SignalSeverityBadge severity={signal.severity} />
                      </div>
                      <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">
                        {signal.recommendedNextAction}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <OssComponentRegistry components={agentOsSummary?.ossComponents} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Launch Timeline Evidence
              </CardTitle>
              <CardDescription>
                Agent OS API records for the paid-user path: run state,
                runtime evidence, PR, preview, verification, and approval.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-4">
              <section className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Runs
                </p>
                {agentOsRuns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No Agent OS runs visible yet.
                  </p>
                ) : (
                  agentOsRuns.slice(0, 4).map((run) => (
                    <button
                      key={run.runId}
                      type="button"
                      onClick={() => setSelectedRunId(run.runId)}
                      aria-pressed={selectedRunId === run.runId}
                      className={cn(
                        'w-full rounded border px-3 py-2 text-left transition-colors hover:bg-muted/50',
                        selectedRunId === run.runId &&
                          'border-primary/50 bg-primary/5 ring-1 ring-primary/30',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {run.title || run.taskId}
                        </span>
                        <StateBadge state={run.state} />
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {run.artifactCount} artifacts ·{' '}
                        {run.runtimeEvidenceCount} evidence ·{' '}
                        {run.approvalCount} approvals
                      </p>
                    </button>
                  ))
                )}
              </section>

              <section className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Delivery
                </p>
                {deliveryArtifacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No PR, preview, or verification artifacts visible yet.
                  </p>
                ) : (
                  deliveryArtifacts.slice(0, 5).map((artifact) => (
                    <div
                      key={artifact.artifactId}
                      className="rounded border px-3 py-2 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        {artifact.url ? (
                          <a
                            href={artifact.url}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate font-medium underline-offset-4 hover:underline"
                          >
                            {deliveryArtifactLabel(artifact)}
                          </a>
                        ) : (
                          <span className="truncate font-medium">
                            {deliveryArtifactLabel(artifact)}
                          </span>
                        )}
                        <Badge
                          variant="outline"
                          className="shrink-0 rounded px-2 py-0.5 text-[11px]"
                        >
                          {artifact.kind.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {artifact.repository ||
                          artifact.provider ||
                          artifact.createdBy}
                      </p>
                    </div>
                  ))
                )}
              </section>

              <section className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Runtime Evidence
                </p>
                {runtimeEvidence.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No runtime evidence records visible yet.
                  </p>
                ) : (
                  runtimeEvidence.slice(0, 5).map((evidence) => (
                    <div
                      key={evidence.evidenceId}
                      className="rounded border px-3 py-2 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">
                          {evidence.title}
                        </span>
                        <Badge
                          variant="outline"
                          className="shrink-0 rounded px-2 py-0.5 text-[11px]"
                        >
                          {evidence.status}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {evidence.command ||
                          evidence.runtimeId ||
                          evidence.kind}
                      </p>
                    </div>
                  ))
                )}
              </section>

              <section className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Approval Gate
                </p>
                {approvalDecision.isError ? (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {approvalDecision.error instanceof Error
                      ? approvalDecision.error.message
                      : 'Approval decision failed.'}
                  </p>
                ) : null}
                {agentOsApprovals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No Agent OS approvals visible yet.
                  </p>
                ) : (
                  agentOsApprovals.slice(0, 5).map((approval) => (
                    <div
                      key={approval.approvalId}
                      className="rounded border px-3 py-2 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">
                          {approval.requiredAt.replace(/_/g, ' ')}
                        </span>
                        <Badge
                          variant="outline"
                          className="shrink-0 rounded px-2 py-0.5 text-[11px]"
                        >
                          {approval.status}
                        </Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {approval.reason}
                      </p>
                      {isPendingApproval(approval.status) ? (
                        <div className="mt-2 flex items-center gap-2">
                          <Button
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={approvalDecision.isPending}
                            onClick={() => decideApproval(approval, 'approved')}
                          >
                            {decidingApprovalId === approval.approvalId
                              ? 'Saving…'
                              : 'Approve'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            disabled={approvalDecision.isPending}
                            onClick={() => decideApproval(approval, 'rejected')}
                          >
                            Reject
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </section>
              <div className="rounded border bg-muted/30 px-3 py-2 text-xs text-muted-foreground lg:col-span-4">
                Coverage: {agentOsRuns.length} runs ·{' '}
                {runtimeEvidence.length} runtime evidence ·{' '}
                {pullRequestArtifacts.length} PR artifacts ·{' '}
                {previewArtifacts.length} previews ·{' '}
                {verificationArtifacts.length} verification artifacts ·{' '}
                {agentOsApprovals.length} approvals.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Run Timeline</CardTitle>
              <CardDescription>
                Chronological task → instruction bundle → artifact → PR →
                preview → runtime evidence → approval history for the selected
                run, read from shared Agent OS run history.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RunTimeline
                runId={selectedRun?.runId ?? null}
                runTitle={selectedRun?.title || selectedRun?.taskId}
              />
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Instruction Provenance
                </CardTitle>
                <CardDescription>
                  Durable bundle artifacts plus source, memory, policy, and
                  verification refs.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Instruction artifacts
                  </p>
                  <div className="mt-2 space-y-2">
                    {instructionBundleArtifacts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No instruction bundle artifact records visible yet.
                      </p>
                    ) : (
                      instructionBundleArtifacts.slice(0, 5).map((artifact) => (
                        <div
                          key={artifact.artifactId}
                          className="rounded border px-3 py-2 text-xs"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate font-medium">
                              {artifact.bundleId ?? artifact.artifactId}
                            </span>
                            <Badge
                              variant="outline"
                              className="shrink-0 rounded px-2 py-0.5 text-[11px]"
                            >
                              {artifact.runtime ?? 'runtime'}
                            </Badge>
                          </div>
                          <div className="mt-2 grid gap-1 text-muted-foreground sm:grid-cols-2">
                            <span className="truncate">
                              task {artifact.taskId}
                            </span>
                            <span className="truncate">
                              by {artifact.createdBy}
                            </span>
                            <span className="truncate">
                              {artifact.path ?? 'inline artifact content'}
                            </span>
                            <code className="truncate">
                              {artifact.contentHash ?? 'no content hash'}
                            </code>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Source files
                  </p>
                  <div className="mt-2 space-y-2">
                    {sourceFiles.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No compiled instruction bundle visible yet.
                      </p>
                    ) : (
                      sourceFiles.slice(0, 5).map((source) => (
                        <div
                          key={`${source.path}:${source.sha}`}
                          className="flex items-center justify-between gap-2 rounded border px-3 py-2 text-xs"
                        >
                          <span className="truncate">{source.path}</span>
                          <code className="shrink-0 text-muted-foreground">
                            {source.sha?.slice(0, 8)}
                          </code>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Verification
                    </p>
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {verificationCommands.length === 0 ? (
                        <li>No verification commands attached.</li>
                      ) : (
                        verificationCommands
                          .slice(0, 4)
                          .map((command) => <li key={command}>{command}</li>)
                      )}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Policy
                    </p>
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {forbiddenActions.length === 0 ? (
                        <li>No forbidden actions attached.</li>
                      ) : (
                        forbiddenActions
                          .slice(0, 4)
                          .map((action) => <li key={action}>{action}</li>)
                      )}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Task Runs</CardTitle>
                <CardDescription>
                  Recent tasks with compiled instructions, verification, and
                  artifact evidence.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No tasks in this workspace yet.
                  </p>
                ) : (
                  tasks.slice(0, 8).map((task) => (
                    <div key={task.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {task.prompt || task.id}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {task.assignee_agent_id || 'unassigned'}
                          </p>
                        </div>
                        <StateBadge state={task.state} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {task.instructions ? 'bundle' : 'no bundle'}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <TerminalSquare className="h-3 w-3" />
                          {task.instructions?.verificationCommands?.length ??
                            0}{' '}
                          verify
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Brain className="h-3 w-3" />
                          {task.memoryCandidates?.length ?? 0} memory
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {task.runtime?.evidenceCount ?? 0} evidence
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Approvals And Memory
                </CardTitle>
                <CardDescription>
                  Human gates and reviewed memory updates attached to run
                  history.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <section>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Approval waits
                  </p>
                  <div className="mt-2 space-y-2">
                    {(snapshot?.approvals ?? []).filter(
                      (approval) =>
                        approval.status === 'pending' ||
                        approval.status === 'escalated',
                    ).length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No approval waits.
                      </p>
                    ) : (
                      (snapshot?.approvals ?? [])
                        .filter(
                          (approval) =>
                            approval.status === 'pending' ||
                            approval.status === 'escalated',
                        )
                        .slice(0, 5)
                        .map((approval) => (
                          <div
                            key={approval.approvalId as string}
                            className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm"
                          >
                            <span className="truncate">
                              {String(
                                approval.action || approval.approvalId || '',
                              )}
                            </span>
                            <Badge
                              variant="outline"
                              className="rounded px-2 py-0.5 text-[11px]"
                            >
                              {approval.status as string}
                            </Badge>
                          </div>
                        ))
                    )}
                  </div>
                </section>
                <section>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Memory candidates
                  </p>
                  <div className="mt-2 space-y-2">
                    {tasks.flatMap((task) => task.memoryCandidates ?? [])
                      .length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No reviewed memory candidates pending.
                      </p>
                    ) : (
                      tasks
                        .flatMap((task) => task.memoryCandidates ?? [])
                        .slice(0, 5)
                        .map((candidate) => (
                          <div
                            key={candidate.candidateId || candidate.id}
                            className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm"
                          >
                            <span className="truncate">
                              {candidate.title ||
                                candidate.candidateId ||
                                candidate.id}
                            </span>
                            <Badge
                              variant="outline"
                              className="rounded px-2 py-0.5 text-[11px]"
                            >
                              {candidate.status || 'pending'}
                            </Badge>
                          </div>
                        ))
                    )}
                  </div>
                </section>
                <section>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Handoff state
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    {(snapshot?.handoffs ?? []).length} handoff records in this
                    workspace
                  </div>
                </section>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
