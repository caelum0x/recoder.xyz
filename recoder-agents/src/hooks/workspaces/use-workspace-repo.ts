'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSessionAccessToken } from '@/lib/auth/session-token';
import { resolveDockerBackendUrl } from '@/lib/runtime-urls';

const DOCKER_BACKEND_URL = resolveDockerBackendUrl();

export interface GitRemote {
  name: string;
  url: string;
}

export interface GitStatusResponse {
  branch?: string;
  isRepo?: boolean;
  isClean?: boolean;
  staged?: string[];
  modified?: string[];
  untracked?: string[];
  ahead?: number;
  behind?: number;
}

export interface PullRequestSummary {
  number: number;
  url: string;
  state: string;
  title: string;
  head?: string;
  base?: string;
  draft?: boolean;
  author?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PullRequestDetail {
  pullRequest: {
    number: number;
    url: string;
    state: string;
    title: string;
    body?: string;
    head?: string;
    base?: string;
    draft?: boolean;
    merged?: boolean;
    mergeable?: boolean | null;
    mergeableState?: string | null;
    author?: string;
    createdAt?: string;
    updatedAt?: string;
    additions?: number;
    deletions?: number;
    changedFiles?: number;
  };
  reviews: Array<{
    user?: string;
    state?: string;
    submittedAt?: string;
  }>;
  checks: Array<{
    name?: string;
    status?: string;
    conclusion?: string | null;
  }>;
  repo?: {
    owner: string;
    repo: string;
  };
}

export interface WorkspaceRepoSnapshot {
  status: GitStatusResponse;
  remotes: GitRemote[];
  origin: GitRemote | null;
  isConnected: boolean;
}

const workspaceRepoKeys = {
  root: ['workspace-repo'] as const,
  snapshot: (projectId: string) => [...workspaceRepoKeys.root, 'snapshot', projectId] as const,
  pullRequests: (projectId: string, state: string) =>
    [...workspaceRepoKeys.root, 'pull-requests', projectId, state] as const,
  pullRequest: (projectId: string, prNumber: number) =>
    [...workspaceRepoKeys.root, 'pull-request', projectId, prNumber] as const,
};

async function requestGit<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await getSessionAccessToken().catch(() => null);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${DOCKER_BACKEND_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload?.error === 'string'
        ? payload.error
        : typeof payload?.error?.message === 'string'
          ? payload.error.message
          : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return payload as T;
}

export function useWorkspaceRepoSnapshot(projectId: string | null) {
  return useQuery({
    queryKey: workspaceRepoKeys.snapshot(projectId ?? ''),
    queryFn: async (): Promise<WorkspaceRepoSnapshot> => {
      if (!projectId) {
        throw new Error('Project ID is required');
      }

      const [status, remotesResponse] = await Promise.all([
        requestGit<GitStatusResponse>('GET', `/api/git/${projectId}/status`),
        requestGit<{ remotes: GitRemote[] }>('GET', `/api/git/${projectId}/remotes`),
      ]);

      const remotes = remotesResponse.remotes ?? [];
      const origin = remotes.find((remote) => remote.name === 'origin') ?? null;

      return {
        status,
        remotes,
        origin,
        isConnected: Boolean(origin),
      };
    },
    enabled: !!projectId,
    staleTime: 15_000,
  });
}

export function useCloneWorkspaceRepo(projectId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      url: string;
      branch?: string;
      token?: string;
      depth?: number;
    }) => {
      if (!projectId) {
        throw new Error('Project ID is required');
      }

      return requestGit<{ success: true }>('POST', `/api/git/${projectId}/clone`, input);
    },
    onSuccess: async () => {
      if (!projectId) return;
      await queryClient.invalidateQueries({ queryKey: workspaceRepoKeys.snapshot(projectId) });
    },
  });
}

export function useWorkspacePullRequests(
  projectId: string | null,
  githubToken: string,
  state: 'open' | 'closed' | 'all' = 'open',
) {
  return useQuery({
    queryKey: workspaceRepoKeys.pullRequests(projectId ?? '', state),
    queryFn: async (): Promise<PullRequestSummary[]> => {
      if (!projectId) {
        throw new Error('Project ID is required');
      }
      if (!githubToken.trim()) {
        throw new Error('GitHub token is required');
      }

      const result = await requestGit<{ pullRequests: PullRequestSummary[] }>(
        'GET',
        `/api/git/${projectId}/pull-requests?state=${state}&token=${encodeURIComponent(githubToken.trim())}`,
      );
      return result.pullRequests ?? [];
    },
    enabled: !!projectId && !!githubToken.trim(),
    staleTime: 15_000,
  });
}

export function useWorkspacePullRequestDetail(
  projectId: string | null,
  githubToken: string,
  prNumber: number | null,
) {
  return useQuery({
    queryKey: workspaceRepoKeys.pullRequest(projectId ?? '', prNumber ?? 0),
    queryFn: async (): Promise<PullRequestDetail> => {
      if (!projectId || !prNumber) {
        throw new Error('Project ID and PR number are required');
      }
      if (!githubToken.trim()) {
        throw new Error('GitHub token is required');
      }

      return requestGit<PullRequestDetail>(
        'GET',
        `/api/git/${projectId}/pull-request/${prNumber}?token=${encodeURIComponent(githubToken.trim())}`,
      );
    },
    enabled: !!projectId && !!prNumber && !!githubToken.trim(),
    staleTime: 15_000,
  });
}

export function useCreateWorkspacePullRequest(projectId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      token: string;
      title: string;
      body?: string;
      base?: string;
      head?: string;
      draft?: boolean;
      taskId?: string;
    }) => {
      if (!projectId) {
        throw new Error('Project ID is required');
      }

      return requestGit<{
        pullRequest: PullRequestSummary;
        taskAttachment?: { attached: boolean; taskId?: string; error?: string };
      }>('POST', `/api/git/${projectId}/pull-request`, input);
    },
    onSuccess: async () => {
      if (!projectId) return;
      await queryClient.invalidateQueries({ queryKey: workspaceRepoKeys.snapshot(projectId) });
      await queryClient.invalidateQueries({ queryKey: [...workspaceRepoKeys.root, 'pull-requests', projectId] });
    },
  });
}
