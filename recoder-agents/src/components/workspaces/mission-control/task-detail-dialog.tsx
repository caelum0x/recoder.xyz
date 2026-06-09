'use client';

import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ExternalLink,
  GitBranch,
  Loader2,
  Copy,
  FileDiff,
  FolderTree,
  GitPullRequest,
  ShieldCheck,
} from 'lucide-react';
import { dockerBackendApi } from '@/lib/docker-backend-api';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import { useWorkspace } from '@/hooks/workspaces/use-workspaces';

interface TaskArtifact {
  key: string;
  artifact_type: string;
  mime_type: string;
  content: string;
  path?: string;
}

interface TaskContextData {
  task: {
    id: string;
    state: string;
    result?: {
      preview?: Array<{ url: string }>;
    } | null;
  };
  timeline?: Array<{
    at?: string | null;
    type?: string | null;
    title?: string | null;
    detail?: string | null;
    href?: string | null;
    files?: string[];
  }>;
  links?: {
    approval?: {
      approvalId?: string | null;
      status?: string | null;
      action?: string | null;
      resolvedBy?: string | null;
      source?: string | null;
      grantedBy?: string | null;
    } | null;
  };
  review?: {
    worktree?: {
      isolated?: boolean;
      reviewReady?: boolean;
      branchName?: string | null;
      baseBranch?: string | null;
      worktreePath?: string | null;
      changedFiles?: string[];
    } | null;
    handoff?: {
      status?: string | null;
      intent?: string | null;
      reviewTarget?: string | null;
      reviewPath?: string | null;
      assignedBy?: string | null;
    } | null;
    merge?: {
      status?: string | null;
      branchName?: string | null;
      baseBranch?: string | null;
      suggestedAction?: string | null;
      changedFiles?: string[];
    } | null;
    history?: Array<{
      at?: string | null;
      type?: string | null;
      actor?: string | null;
      status?: string | null;
      note?: string | null;
      branchName?: string | null;
      baseBranch?: string | null;
      reviewTarget?: string | null;
      reviewPath?: string | null;
      suggestedAction?: string | null;
    }>;
  } | null;
  delivery?: {
    githubIssue?: {
      issueUrl?: string | null;
      issueNumber?: number | null;
      title?: string | null;
      repo?: string | null;
      state?: string | null;
      labels?: string[];
    } | null;
    githubPullRequest?: {
      projectId?: string | null;
      repo?: string | null;
      prUrl?: string | null;
      prNumber?: number | null;
      state?: string | null;
      title?: string | null;
      head?: string | null;
      base?: string | null;
      draft?: boolean | null;
    } | null;
    previewDeployment?: {
      deploymentId?: string | null;
      projectId?: string | null;
      protectionMode?: string | null;
      protectedPreviewUrl?: string | null;
      basePreviewUrl?: string | null;
      edgeHost?: string | null;
      branchName?: string | null;
      prUrl?: string | null;
      prNumber?: number | null;
    } | null;
  } | null;
  runtime?: {
    filesChanged?: string[];
    artifacts?: TaskArtifact[];
  } | null;
}

interface TaskDetailDialogProps {
  taskId: string | null;
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function findDiffArtifact(artifacts: TaskArtifact[] | undefined): TaskArtifact | null {
  if (!artifacts || artifacts.length === 0) return null;
  return (
    artifacts.find((artifact) => artifact.artifact_type === 'patch') ??
    artifacts.find((artifact) => artifact.key.endsWith('.diff')) ??
    null
  );
}

export function TaskDetailDialog({ taskId, workspaceId, open, onOpenChange }: TaskDetailDialogProps) {
  const queryClient = useQueryClient();
  const { data: workspace } = useWorkspace(workspaceId);
  const { data, isLoading, error } = useQuery({
    queryKey: ['mission-control', 'task-context', taskId ?? ''],
    queryFn: async () => {
      const res = await dockerBackendApi.get<TaskContextData>(`/api/a2a/tasks/${taskId}/context`);
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to fetch task context');
    },
    enabled: open && !!taskId,
  });

  const copyToClipboard = async (label: string, value: string | null | undefined) => {
    if (!value) {
      toast.error(`No ${label.toLowerCase()} available`);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}`);
    }
  };

  const updateReviewMutation = useMutation({
    mutationFn: async (input: {
      reason: string;
      metadataPatch: Record<string, unknown>;
      successMessage: string;
    }) => {
      if (!taskId) {
        throw new Error('Task ID is required');
      }

      const res = await dockerBackendApi.post(
        `/api/a2a/tasks/${taskId}/metadata`,
        {
          metadataPatch: input.metadataPatch,
          reason: input.reason,
          triggeredBy: 'recoder-agents-mission-control',
        },
      );

      if (!res.success) {
        throw new Error(res.error?.message || 'Failed to update task review state');
      }

      return input.successMessage;
    },
    onSuccess: async (message) => {
      toast.success(message);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mission-control', 'task-context', taskId ?? ''] }),
        queryClient.invalidateQueries({ queryKey: ['mission-control'] }),
      ]);
    },
    onError: (mutationError) => {
      toast.error(mutationError instanceof Error ? mutationError.message : 'Failed to update review state');
    },
  });

  const createPreviewMutation = useMutation({
    mutationFn: async () => {
      if (!taskId) {
        throw new Error('Task ID is required');
      }
      if (!workspace?.projectId) {
        throw new Error('Workspace project ID is required');
      }

      const res = await dockerBackendApi.post(`/api/a2a/tasks/${taskId}/preview-deploy`, {
        projectId: workspace.projectId,
        branchName:
          data?.review?.worktree?.branchName ??
          data?.delivery?.githubPullRequest?.head ??
          data?.delivery?.previewDeployment?.branchName ??
          undefined,
        prUrl: data?.delivery?.githubPullRequest?.prUrl ?? undefined,
        prNumber: data?.delivery?.githubPullRequest?.prNumber ?? undefined,
        protectionMode: 'signed',
        createdBy: 'recoder-agents-mission-control',
      });

      if (!res.success) {
        throw new Error(res.error?.message || 'Failed to create preview deployment');
      }

      return res.data;
    },
    onSuccess: async () => {
      toast.success('Protected preview created');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mission-control', 'task-context', taskId ?? ''] }),
        queryClient.invalidateQueries({ queryKey: ['mission-control'] }),
      ]);
    },
    onError: (mutationError) => {
      toast.error(mutationError instanceof Error ? mutationError.message : 'Failed to create preview deployment');
    },
  });

  const diffArtifact = findDiffArtifact(data?.runtime?.artifacts);
  const changedFiles = data?.review?.worktree?.changedFiles?.length
    ? data.review.worktree.changedFiles
    : data?.review?.merge?.changedFiles?.length
      ? data.review.merge.changedFiles
      : data?.runtime?.filesChanged ?? [];
  const previewUrls = Array.from(
    new Set(
      [
        ...(data?.task.result?.preview?.map((preview) => preview.url).filter(Boolean) ?? []),
        data?.delivery?.previewDeployment?.protectedPreviewUrl ?? null,
        data?.delivery?.previewDeployment?.basePreviewUrl ?? null,
      ].filter((value): value is string => typeof value === 'string' && value.length > 0),
    ),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Task Detail
          </DialogTitle>
          <DialogDescription>
            Review branch, merge state, changed files, previews, and diff artifact for this Space task.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
            {(error as Error).message}
          </div>
        ) : data ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded bg-blue-500/10 px-2 py-1 text-blue-300">task:{data.task.id}</span>
              <span className="rounded bg-emerald-500/10 px-2 py-1 text-emerald-300">state:{data.task.state}</span>
              {data.review?.merge?.status ? (
                <span className="rounded bg-orange-500/10 px-2 py-1 text-orange-300">
                  merge:{data.review.merge.status}
                </span>
              ) : null}
              {data.review?.worktree?.reviewReady ? (
                <span className="rounded bg-lime-500/10 px-2 py-1 text-lime-300">review-ready</span>
              ) : null}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-lg border p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <GitPullRequest className="h-4 w-4" />
                  Delivery
                </div>
                <div className="space-y-4 text-sm">
                  <div className="space-y-2">
                    <p className="font-medium">Linked Issue</p>
                    {data.delivery?.githubIssue?.issueUrl ? (
                      <>
                        <div>
                          <span className="text-muted-foreground">Title:</span>{' '}
                          <span>{data.delivery.githubIssue.title ?? '—'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Repo:</span>{' '}
                          <span className="font-mono">{data.delivery.githubIssue.repo ?? '—'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Number:</span>{' '}
                          <span>#{data.delivery.githubIssue.issueNumber ?? '—'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">State:</span>{' '}
                          <span>{data.delivery.githubIssue.state ?? '—'}</span>
                        </div>
                        {data.delivery.githubIssue.labels?.length ? (
                          <div className="flex flex-wrap gap-2">
                            {data.delivery.githubIssue.labels.map((label) => (
                              <span key={label} className="rounded bg-muted px-2 py-0.5 text-xs">
                                {label}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void copyToClipboard('Issue URL', data.delivery?.githubIssue?.issueUrl)}
                          >
                            <Copy className="mr-1 h-3.5 w-3.5" />
                            Copy issue URL
                          </Button>
                          <Button asChild type="button" size="sm" variant="outline">
                            <a href={data.delivery.githubIssue.issueUrl} target="_blank" rel="noreferrer">
                              <ExternalLink className="mr-1 h-3.5 w-3.5" />
                              Open issue
                            </a>
                          </Button>
                        </div>
                      </>
                    ) : (
                      <p className="text-muted-foreground">No GitHub issue linked to this task.</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="font-medium">Pull Request</p>
                    {data.delivery?.githubPullRequest?.prUrl ? (
                      <>
                        <div>
                          <span className="text-muted-foreground">Title:</span>{' '}
                          <span>{data.delivery.githubPullRequest.title ?? '—'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Repo:</span>{' '}
                          <span className="font-mono">{data.delivery.githubPullRequest.repo ?? '—'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Number:</span>{' '}
                          <span>#{data.delivery.githubPullRequest.prNumber ?? '—'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">State:</span>{' '}
                          <span>{data.delivery.githubPullRequest.state ?? '—'}</span>
                          {data.delivery.githubPullRequest.draft ? ' · draft' : ''}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Branch:</span>{' '}
                          <span className="font-mono">
                            {data.delivery.githubPullRequest.head ?? '—'} → {data.delivery.githubPullRequest.base ?? '—'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void copyToClipboard('PR URL', data.delivery?.githubPullRequest?.prUrl)}
                          >
                            <Copy className="mr-1 h-3.5 w-3.5" />
                            Copy PR URL
                          </Button>
                          <Button asChild type="button" size="sm" variant="outline">
                            <a href={data.delivery.githubPullRequest.prUrl} target="_blank" rel="noreferrer">
                              <ExternalLink className="mr-1 h-3.5 w-3.5" />
                              Open PR
                            </a>
                          </Button>
                        </div>
                      </>
                    ) : (
                      <p className="text-muted-foreground">No GitHub pull request attached to this task.</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="font-medium">Approval</p>
                    {data.links?.approval ? (
                      <>
                        <div>
                          <span className="text-muted-foreground">Status:</span>{' '}
                          <span>{data.links.approval.status ?? '—'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Action:</span>{' '}
                          <span>{data.links.approval.action ?? '—'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Approval ID:</span>{' '}
                          <span className="font-mono">{data.links.approval.approvalId ?? '—'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Resolved by:</span>{' '}
                          <span>{data.links.approval.resolvedBy ?? data.links.approval.grantedBy ?? '—'}</span>
                        </div>
                      </>
                    ) : (
                      <p className="text-muted-foreground">No approval linked to this task.</p>
                    )}
                  </div>
                </div>
              </section>

              <section className="rounded-lg border p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <GitBranch className="h-4 w-4" />
                  Review Lane
                </div>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Branch:</span>{' '}
                    <span className="font-mono">{data.review?.worktree?.branchName ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Base:</span>{' '}
                    <span className="font-mono">{data.review?.worktree?.baseBranch ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Worktree:</span>{' '}
                    <span className="break-all font-mono">{data.review?.worktree?.worktreePath ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Suggested action:</span>{' '}
                    <span>{data.review?.merge?.suggestedAction ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Review status:</span>{' '}
                    <span>{data.review?.handoff?.status ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Merge status:</span>{' '}
                    <span>{data.review?.merge?.status ?? '—'}</span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void copyToClipboard('Review branch', data.review?.worktree?.branchName)}
                  >
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    Copy branch
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void copyToClipboard('Worktree path', data.review?.worktree?.worktreePath)}
                  >
                    <FolderTree className="mr-1 h-3.5 w-3.5" />
                    Copy path
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={updateReviewMutation.isPending}
                    onClick={() =>
                      updateReviewMutation.mutate({
                        reason: 'Mission Control marked review as accepted',
                        successMessage: 'Review marked accepted',
                        metadataPatch: {
                          handoff: {
                            ...(data.review?.handoff ?? {}),
                            status: 'review-accepted',
                          },
                          merge: {
                            ...(data.review?.merge ?? {}),
                            status: 'ready-to-merge',
                            suggestedAction: 'merge-worktree-branch',
                          },
                        },
                      })
                    }
                  >
                    {updateReviewMutation.isPending ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Mark review accepted
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={updateReviewMutation.isPending}
                    onClick={() =>
                      updateReviewMutation.mutate({
                        reason: 'Mission Control requested merge handoff',
                        successMessage: 'Merge requested',
                        metadataPatch: {
                          merge: {
                            ...(data.review?.merge ?? {}),
                            status: 'merge-requested',
                            suggestedAction: 'merge-worktree-branch',
                          },
                        },
                      })
                    }
                  >
                    {updateReviewMutation.isPending ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Request merge
                  </Button>
                </div>
              </section>

              <section className="rounded-lg border p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck className="h-4 w-4" />
                  Preview Deployment
                </div>
                <div className="mb-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={createPreviewMutation.isPending || !workspace?.projectId}
                    onClick={() => createPreviewMutation.mutate()}
                  >
                    {createPreviewMutation.isPending ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    {data.delivery?.previewDeployment ? 'Refresh protected preview' : 'Create protected preview'}
                  </Button>
                  {!workspace?.projectId ? (
                    <span className="text-xs text-muted-foreground">
                      Workspace project ID is required before creating a preview.
                    </span>
                  ) : null}
                </div>
                {previewUrls.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No preview URLs attached to this task.</p>
                ) : (
                  <div className="space-y-3">
                    {data.delivery?.previewDeployment ? (
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Protection:</span>{' '}
                          <span>{data.delivery.previewDeployment.protectionMode ?? '—'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Project:</span>{' '}
                          <span className="font-mono">{data.delivery.previewDeployment.projectId ?? '—'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Branch:</span>{' '}
                          <span className="font-mono">{data.delivery.previewDeployment.branchName ?? '—'}</span>
                        </div>
                      </div>
                    ) : null}
                    {previewUrls.map((url) => (
                      <div key={url} className="flex items-center gap-2 text-sm">
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate text-primary hover:underline"
                        >
                          {url}
                        </a>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => void copyToClipboard('Preview URL', url)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button asChild type="button" size="sm" variant="ghost">
                          <a href={url} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <section className="rounded-lg border p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <GitBranch className="h-4 w-4" />
                Task Timeline
              </div>
              {data.timeline?.length ? (
                <div className="space-y-2">
                  {data.timeline.map((entry, index) => (
                    <div
                      key={`${entry.at ?? "entry"}-${entry.type ?? "type"}-${index}`}
                      className="rounded-md bg-muted/40 p-3 text-xs"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-muted px-2 py-0.5 font-medium">
                          {entry.title ?? entry.type ?? "timeline.event"}
                        </span>
                        {entry.at ? (
                          <span className="text-muted-foreground">
                            {new Date(entry.at).toLocaleString()}
                          </span>
                        ) : null}
                      </div>
                      {entry.detail ? (
                        <p className="mt-2 text-muted-foreground">{entry.detail}</p>
                      ) : null}
                      {entry.href ? (
                        <div className="mt-2">
                          <a
                            href={entry.href}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            Open link
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      ) : null}
                      {entry.files?.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {entry.files.map((file) => (
                            <span key={file} className="rounded bg-background px-2 py-1 font-mono">
                              {file}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No timeline entries yet.</p>
              )}
            </section>

            <section className="rounded-lg border p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <FolderTree className="h-4 w-4" />
                Changed Files
              </div>
              {changedFiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">No changed files captured for this task.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {changedFiles.map((file) => (
                    <span key={file} className="rounded bg-muted px-2 py-1 font-mono text-xs">
                      {file}
                    </span>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-lg border p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <GitBranch className="h-4 w-4" />
                Review History
              </div>
              {data.review?.history?.length ? (
                <div className="space-y-2">
                  {data.review.history.map((entry, index) => (
                    <div key={`${entry.at ?? 'entry'}-${index}`} className="rounded-md bg-muted/40 p-3 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-muted px-2 py-0.5 font-medium">
                          {entry.type ?? 'review.event'}
                        </span>
                        {entry.status ? (
                          <span className="rounded bg-orange-500/10 px-2 py-0.5 text-orange-300">
                            {entry.status}
                          </span>
                        ) : null}
                        {entry.at ? (
                          <span className="text-muted-foreground">
                            {new Date(entry.at).toLocaleString()}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 space-y-1 text-muted-foreground">
                        {entry.actor ? <p>actor: {entry.actor}</p> : null}
                        {entry.branchName ? <p>branch: {entry.branchName}</p> : null}
                        {entry.baseBranch ? <p>base: {entry.baseBranch}</p> : null}
                        {entry.reviewTarget ? <p>target: {entry.reviewTarget}</p> : null}
                        {entry.reviewPath ? <p className="break-all">path: {entry.reviewPath}</p> : null}
                        {entry.suggestedAction ? <p>action: {entry.suggestedAction}</p> : null}
                        {entry.note ? <p>{entry.note}</p> : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No review history entries yet.</p>
              )}
            </section>

            <section className="rounded-lg border p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <FileDiff className="h-4 w-4" />
                Diff Artifact
              </div>
              {diffArtifact?.content ? (
                <pre className="max-h-[420px] overflow-auto rounded-md bg-muted/50 p-3 text-xs whitespace-pre-wrap font-mono">
                  {diffArtifact.content}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">No diff artifact available for this task.</p>
              )}
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
