'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, GitBranch, Loader2, Copy, FileDiff, FolderTree, Eye } from 'lucide-react';
import { dockerBackendApi } from '@/lib/docker-backend-api';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';

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
  runtime?: {
    filesChanged?: string[];
    artifacts?: TaskArtifact[];
  } | null;
}

interface TaskDetailDialogProps {
  taskId: string | null;
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

export function TaskDetailDialog({ taskId, open, onOpenChange }: TaskDetailDialogProps) {
  const queryClient = useQueryClient();
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

  const diffArtifact = findDiffArtifact(data?.runtime?.artifacts);
  const changedFiles = data?.review?.worktree?.changedFiles?.length
    ? data.review.worktree.changedFiles
    : data?.review?.merge?.changedFiles?.length
      ? data.review.merge.changedFiles
      : data?.runtime?.filesChanged ?? [];
  const previewUrls = data?.task.result?.preview?.map((preview) => preview.url).filter(Boolean) ?? [];

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
                  <Eye className="h-4 w-4" />
                  Preview URLs
                </div>
                {previewUrls.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No preview URLs attached to this task.</p>
                ) : (
                  <div className="space-y-2">
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
