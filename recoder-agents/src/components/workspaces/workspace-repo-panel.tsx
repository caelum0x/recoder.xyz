'use client';

import React from 'react';
import { useMemo, useState } from 'react';
import { ExternalLink, FolderGit2, GitBranch, GitPullRequest, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCloneWorkspaceRepo,
  useCreateWorkspacePullRequest,
  useWorkspacePullRequestDetail,
  useWorkspacePullRequests,
  useWorkspaceRepoSnapshot,
} from '@/hooks/workspaces/use-workspace-repo';
import { useTaskPipeline } from '@/hooks/workspaces/use-mission-control';
import { toast } from '@/lib/toast';
import { dockerBackendApi } from '@/lib/docker-backend-api';

interface WorkspaceRepoPanelProps {
  projectId: string;
  workspaceId: string;
}

interface WorkspaceTask {
  id: string;
  prompt?: string;
  state?: string;
  review?: {
    worktree?: {
      branchName?: string | null;
    } | null;
    merge?: {
      branchName?: string | null;
    } | null;
  } | null;
}

export function WorkspaceRepoPanel({ projectId, workspaceId }: WorkspaceRepoPanelProps) {
  const [githubToken, setGithubToken] = useState('');
  const [cloneUrl, setCloneUrl] = useState('');
  const [cloneBranch, setCloneBranch] = useState('');
  const [prTitle, setPrTitle] = useState('');
  const [prBody, setPrBody] = useState('');
  const [sourceBranch, setSourceBranch] = useState('');
  const [baseBranch, setBaseBranch] = useState('main');
  const [prTaskId, setPrTaskId] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string>('none');
  const [issueUrl, setIssueUrl] = useState('');
  const [issueTitle, setIssueTitle] = useState('');
  const [issueLabels, setIssueLabels] = useState('');
  const [linkingIssue, setLinkingIssue] = useState(false);
  const [selectedPrNumber, setSelectedPrNumber] = useState<number | null>(null);

  const repoSnapshot = useWorkspaceRepoSnapshot(projectId);
  const cloneRepo = useCloneWorkspaceRepo(projectId);
  const taskPipeline = useTaskPipeline(workspaceId);
  const pullRequests = useWorkspacePullRequests(projectId, githubToken, 'open');
  const pullRequestDetail = useWorkspacePullRequestDetail(projectId, githubToken, selectedPrNumber);
  const createPullRequest = useCreateWorkspacePullRequest(projectId);

  const origin = repoSnapshot.data?.origin;
  const status = repoSnapshot.data?.status;
  const changedFileCount = useMemo(() => {
    const modified = status?.modified?.length ?? 0;
    const staged = status?.staged?.length ?? 0;
    const untracked = status?.untracked?.length ?? 0;
    return modified + staged + untracked;
  }, [status]);
  const tasks = (taskPipeline.data ?? []) as unknown as WorkspaceTask[];
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const selectedTaskBranch =
    selectedTask?.review?.worktree?.branchName ??
    selectedTask?.review?.merge?.branchName ??
    null;
  const effectiveTaskId = prTaskId.trim() || (selectedTaskId !== 'none' ? selectedTaskId : '');
  const effectiveHead = sourceBranch.trim() || selectedTaskBranch || undefined;

  const handleClone = async () => {
    try {
      await cloneRepo.mutateAsync({
        url: cloneUrl.trim(),
        branch: cloneBranch.trim() || undefined,
        token: githubToken.trim() || undefined,
      });
      toast.success('Repository connected');
      setCloneUrl('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to connect repository');
    }
  };

  const handleCreatePr = async () => {
    try {
      const result = await createPullRequest.mutateAsync({
        token: githubToken.trim(),
        title: prTitle.trim(),
        body: prBody.trim() || undefined,
        taskId: effectiveTaskId || undefined,
        head: effectiveHead,
        base: baseBranch.trim() || undefined,
      });

      toast.success(
        result.taskAttachment?.attached
          ? 'Pull request created and attached to task'
          : 'Pull request created',
      );
      setPrTitle('');
      setPrBody('');
      setSourceBranch('');
      setSelectedPrNumber(result.pullRequest.number);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create pull request');
    }
  };

  const handleLinkIssue = async () => {
    if (!effectiveTaskId) {
      toast.error('Select or enter a task ID first');
      return;
    }
    if (!issueUrl.trim()) {
      toast.error('Issue URL is required');
      return;
    }

    const issueNumberMatch = issueUrl.match(/\/issues\/(\d+)(?:$|[?#/])/);
    const issueNumber = issueNumberMatch ? Number(issueNumberMatch[1]) : null;
    const repoMatch = issueUrl.match(/github\.com\/([^/]+\/[^/]+)\/issues\//);
    const repo = repoMatch ? repoMatch[1] : null;
    const labels = issueLabels.split(',').map((value) => value.trim()).filter(Boolean);

    setLinkingIssue(true);
    try {
      await dockerBackendApi.post(`/api/a2a/tasks/${effectiveTaskId}/artifacts`, {
        artifacts: [
          {
            key: issueNumber ? `github-issue-${issueNumber}` : `github-issue-${Date.now()}`,
            artifact_type: 'custom',
            mime_type: 'application/json',
            content: JSON.stringify({
              type: 'github_issue',
              issueUrl: issueUrl.trim(),
              issueNumber,
              title: issueTitle.trim() || undefined,
              repo,
              labels,
            }),
            metadata: {
              type: 'github_issue',
              issueUrl: issueUrl.trim(),
              issueNumber,
              title: issueTitle.trim() || undefined,
              repo,
              labels,
            },
          },
        ],
        reason: 'GitHub issue linked from workspace settings',
        triggeredBy: 'recoder-agents-workspace-settings',
      });

      await dockerBackendApi.post(`/api/a2a/tasks/${effectiveTaskId}/metadata`, {
        metadataPatch: {
          githubIssue: {
            issueUrl: issueUrl.trim(),
            issueNumber,
            title: issueTitle.trim() || undefined,
            repo,
            state: 'open',
            labels,
          },
        },
        reason: 'GitHub issue linked from workspace settings',
        triggeredBy: 'recoder-agents-workspace-settings',
      });

      toast.success('GitHub issue linked to task');
      setIssueUrl('');
      setIssueTitle('');
      setIssueLabels('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to link GitHub issue');
    } finally {
      setLinkingIssue(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-4 space-y-5">
      <div className="flex items-center gap-2">
        <FolderGit2 className="h-4 w-4 text-muted-foreground" />
        <div>
          <h3 className="text-sm font-medium">Repository & Pull Requests</h3>
          <p className="text-xs text-muted-foreground">
            Connect a GitHub repo, inspect branch state, and create or inspect pull requests for this workspace project.
          </p>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/20 p-3 text-sm">
        <div>
          <span className="text-muted-foreground">Project ID:</span>{' '}
          <span className="font-mono">{projectId}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-4">
          <span>
            <span className="text-muted-foreground">Branch:</span>{' '}
            <span className="font-mono">{status?.branch ?? '—'}</span>
          </span>
          <span>
            <span className="text-muted-foreground">Changed files:</span>{' '}
            <span>{changedFileCount}</span>
          </span>
          <span>
            <span className="text-muted-foreground">Repo connected:</span>{' '}
            <span>{repoSnapshot.data?.isConnected ? 'yes' : 'no'}</span>
          </span>
        </div>
        {origin ? (
          <div className="mt-2 break-all">
            <span className="text-muted-foreground">Origin:</span>{' '}
            <span className="font-mono text-xs">{origin.url}</span>
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="workspace-github-token">GitHub token</Label>
        <Input
          id="workspace-github-token"
          type="password"
          value={githubToken}
          onChange={(event) => setGithubToken(event.target.value)}
          placeholder="ghp_... or fine-grained GitHub token"
        />
        <p className="text-xs text-muted-foreground">
          Used for clone/push/PR API calls from this page. It is kept only in local component state.
        </p>
      </div>

      {!repoSnapshot.data?.isConnected ? (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <GitBranch className="h-4 w-4" />
            Connect GitHub repo
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_180px]">
            <div className="space-y-1">
              <Label htmlFor="workspace-clone-url">Repository URL</Label>
              <Input
                id="workspace-clone-url"
                value={cloneUrl}
                onChange={(event) => setCloneUrl(event.target.value)}
                placeholder="https://github.com/owner/repo.git"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="workspace-clone-branch">Branch</Label>
              <Input
                id="workspace-clone-branch"
                value={cloneBranch}
                onChange={(event) => setCloneBranch(event.target.value)}
                placeholder="main"
              />
            </div>
          </div>
          <Button
            type="button"
            onClick={handleClone}
            disabled={cloneRepo.isPending || !cloneUrl.trim()}
          >
            {cloneRepo.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Connect repo
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border p-3">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <GitPullRequest className="h-4 w-4" />
              Open pull request
            </div>
            <div className="grid gap-3">
              <div className="space-y-1">
                <Label htmlFor="workspace-pr-task-select">Attach to workspace task</Label>
                <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
                  <SelectTrigger id="workspace-pr-task-select">
                    <SelectValue placeholder="Select a task (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No task selected</SelectItem>
                    {tasks.map((task) => (
                      <SelectItem key={task.id} value={task.id}>
                        {(task.prompt?.trim() || task.id).slice(0, 80)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTask ? (
                  <p className="text-xs text-muted-foreground">
                    Task state: {selectedTask.state ?? 'unknown'}
                    {selectedTaskBranch ? ` · linked branch: ${selectedTaskBranch}` : ''}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Optional: attach the PR to a workspace task so it appears in shared run history.
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="workspace-pr-title">PR title</Label>
                <Input
                  id="workspace-pr-title"
                  value={prTitle}
                  onChange={(event) => setPrTitle(event.target.value)}
                  placeholder="Add repo workflow support"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="workspace-pr-task">Attach to task ID (optional)</Label>
                <Input
                  id="workspace-pr-task"
                  value={prTaskId}
                  onChange={(event) => setPrTaskId(event.target.value)}
                  placeholder="task_..."
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="workspace-pr-head">Source branch</Label>
                  <Input
                    id="workspace-pr-head"
                    value={sourceBranch}
                    onChange={(event) => setSourceBranch(event.target.value)}
                    placeholder={selectedTaskBranch ?? status?.branch ?? 'feature/my-branch'}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="workspace-pr-base">Base branch</Label>
                  <Input
                    id="workspace-pr-base"
                    value={baseBranch}
                    onChange={(event) => setBaseBranch(event.target.value)}
                    placeholder="main"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="workspace-pr-body">PR body (optional)</Label>
                <textarea
                  id="workspace-pr-body"
                  value={prBody}
                  onChange={(event) => setPrBody(event.target.value)}
                  placeholder="Summary, review notes, rollout details..."
                  className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none"
                />
              </div>
              <Button
                type="button"
                onClick={handleCreatePr}
                disabled={createPullRequest.isPending || !prTitle.trim() || !githubToken.trim()}
              >
                {createPullRequest.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create PR
              </Button>
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="h-4 w-4" />
              Link GitHub issue to task
            </div>
            <div className="grid gap-3">
              <div className="space-y-1">
                <Label htmlFor="workspace-issue-url">Issue URL</Label>
                <Input
                  id="workspace-issue-url"
                  value={issueUrl}
                  onChange={(event) => setIssueUrl(event.target.value)}
                  placeholder="https://github.com/owner/repo/issues/123"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="workspace-issue-title">Issue title (optional)</Label>
                <Input
                  id="workspace-issue-title"
                  value={issueTitle}
                  onChange={(event) => setIssueTitle(event.target.value)}
                  placeholder="Fix launch-gate task linkage"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="workspace-issue-labels">Labels (optional)</Label>
                <Input
                  id="workspace-issue-labels"
                  value={issueLabels}
                  onChange={(event) => setIssueLabels(event.target.value)}
                  placeholder="launch-gate, github"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleLinkIssue}
                disabled={linkingIssue || !effectiveTaskId || !issueUrl.trim()}
              >
                {linkingIssue ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Link issue to task
              </Button>
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="h-4 w-4" />
                Pull requests
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void pullRequests.refetch();
                  if (selectedPrNumber) void pullRequestDetail.refetch();
                }}
                disabled={!githubToken.trim() || pullRequests.isFetching}
              >
                {pullRequests.isFetching ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                )}
                Refresh
              </Button>
            </div>

            {!githubToken.trim() ? (
              <p className="text-sm text-muted-foreground">
                Enter a GitHub token to load PR review and check state.
              </p>
            ) : pullRequests.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading pull requests…
              </div>
            ) : pullRequests.error ? (
              <p className="text-sm text-red-400">{pullRequests.error.message}</p>
            ) : !pullRequests.data?.length ? (
              <p className="text-sm text-muted-foreground">No open pull requests found for the connected repo.</p>
            ) : (
              <div className="space-y-2">
                {pullRequests.data.map((pr) => (
                  <button
                    key={pr.number}
                    type="button"
                    className={`w-full rounded-md border p-3 text-left transition-colors ${
                      selectedPrNumber === pr.number ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
                    }`}
                    onClick={() => setSelectedPrNumber(pr.number)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{pr.title}</p>
                        <p className="text-xs text-muted-foreground">
                          #{pr.number} · {pr.state}
                          {pr.draft ? ' · draft' : ''}
                        </p>
                      </div>
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </div>
            )}

            {selectedPrNumber && pullRequestDetail.data ? (
              <div className="mt-4 rounded-lg border bg-muted/20 p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{pullRequestDetail.data.pullRequest.title}</p>
                    <p className="text-xs text-muted-foreground">
                      #{pullRequestDetail.data.pullRequest.number} · {pullRequestDetail.data.pullRequest.state}
                      {pullRequestDetail.data.pullRequest.mergeableState
                        ? ` · mergeable: ${pullRequestDetail.data.pullRequest.mergeableState}`
                        : ''}
                    </p>
                  </div>
                  {pullRequestDetail.data.pullRequest.url ? (
                    <Button asChild type="button" size="sm" variant="outline">
                      <a href={pullRequestDetail.data.pullRequest.url} target="_blank" rel="noreferrer">
                        <ExternalLink className="mr-1 h-3.5 w-3.5" />
                        Open
                      </a>
                    </Button>
                  ) : null}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Reviews</p>
                    <div className="space-y-1">
                      {pullRequestDetail.data.reviews.length ? (
                        pullRequestDetail.data.reviews.map((review, index) => (
                          <div key={`${review.user ?? 'review'}-${index}`} className="rounded bg-background px-2 py-1 text-xs">
                            {(review.user ?? 'unknown')} · {review.state ?? 'unknown'}
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground">No review events.</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Checks</p>
                    <div className="space-y-1">
                      {pullRequestDetail.data.checks.length ? (
                        pullRequestDetail.data.checks.map((check, index) => (
                          <div key={`${check.name ?? 'check'}-${index}`} className="rounded bg-background px-2 py-1 text-xs">
                            {(check.name ?? 'check')} · {check.status ?? 'unknown'}
                            {check.conclusion ? ` · ${check.conclusion}` : ''}
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground">No CI checks reported.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
