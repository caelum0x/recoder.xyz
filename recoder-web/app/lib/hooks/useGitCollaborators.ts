/**
 * useGitCollaborators — Hook for managing GitHub repository collaborators.
 * Lists, invites, and removes collaborators. Also manages pending invitations.
 */

import { useState, useCallback, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { dockerGet, dockerPost, dockerDelete } from '~/lib/services/docker-api';

export interface GitHubCollaborator {
  id: number;
  login: string;
  avatarUrl: string;
  role: string;
  permissions: {
    admin: boolean;
    push: boolean;
    pull: boolean;
    maintain?: boolean;
    triage?: boolean;
  };
}

export interface GitHubInvitation {
  id: number;
  login: string;
  avatarUrl: string;
  permission: string;
  createdAt: string;
}

export interface GitHubRepoInfo {
  owner: string;
  repo: string;
}

export type PermissionLevel = 'pull' | 'triage' | 'push' | 'maintain' | 'admin';

interface UseGitCollaboratorsReturn {
  // State
  isGitHubRepo: boolean;
  repoInfo: GitHubRepoInfo | null;
  collaborators: GitHubCollaborator[];
  invitations: GitHubInvitation[];
  isLoading: boolean;
  error: string | null;

  // Token management (stored in localStorage)
  token: string | null;
  setToken: (token: string) => void;
  clearToken: () => void;

  // Actions
  refresh: () => Promise<void>;
  invite: (username: string, permission?: PermissionLevel) => Promise<boolean>;
  remove: (username: string) => Promise<boolean>;
  cancelInvitation: (invitationId: number) => Promise<boolean>;
}

const GITHUB_TOKEN_KEY = 'recoder:github-token';

export function useGitCollaborators(): UseGitCollaboratorsReturn {
  const projectId = useStore(workbenchStore.projectId);

  const [repoInfo, setRepoInfo] = useState<GitHubRepoInfo | null>(null);
  const [collaborators, setCollaborators] = useState<GitHubCollaborator[]>([]);
  const [invitations, setInvitations] = useState<GitHubInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setTokenState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(GITHUB_TOKEN_KEY);
  });

  const setToken = useCallback((t: string) => {
    localStorage.setItem(GITHUB_TOKEN_KEY, t);
    setTokenState(t);
  }, []);

  const clearToken = useCallback(() => {
    localStorage.removeItem(GITHUB_TOKEN_KEY);
    setTokenState(null);
    setCollaborators([]);
    setInvitations([]);
  }, []);

  // Check if repo is a GitHub repo
  useEffect(() => {
    if (!projectId) return;
    (async () => {
      try {
        const data = await dockerGet<{ data: { github: GitHubRepoInfo | null } }>(`/api/git/${projectId}/github-repo`);
        setRepoInfo(data?.data?.github || null);
      } catch {
        setRepoInfo(null);
      }
    })();
  }, [projectId]);

  const refresh = useCallback(async () => {
    if (!projectId || !token || !repoInfo) return;
    setIsLoading(true);
    setError(null);

    try {
      const [collabData, invData] = await Promise.all([
        dockerGet<{ data: { collaborators: GitHubCollaborator[] } }>(
          `/api/git/${projectId}/collaborators?token=${encodeURIComponent(token)}`
        ),
        dockerGet<{ data: { invitations: GitHubInvitation[] } }>(
          `/api/git/${projectId}/invitations?token=${encodeURIComponent(token)}`
        ),
      ]);

      setCollaborators(collabData?.data?.collaborators || []);
      setInvitations(invData?.data?.invitations || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load collaborators');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, token, repoInfo]);

  // Auto-load when token and repo are available
  useEffect(() => {
    if (token && repoInfo && projectId) {
      refresh();
    }
  }, [token, repoInfo, projectId]);

  const invite = useCallback(async (username: string, permission: PermissionLevel = 'push'): Promise<boolean> => {
    if (!projectId || !token) return false;
    setError(null);

    try {
      await dockerPost(`/api/git/${projectId}/collaborators`, {
        token,
        username,
        permission,
      });
      await refresh();
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to invite collaborator');
      return false;
    }
  }, [projectId, token, refresh]);

  const remove = useCallback(async (username: string): Promise<boolean> => {
    if (!projectId || !token) return false;
    setError(null);

    try {
      await dockerDelete(
        `/api/git/${projectId}/collaborators/${encodeURIComponent(username)}?token=${encodeURIComponent(token)}`
      );
      await refresh();
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to remove collaborator');
      return false;
    }
  }, [projectId, token, refresh]);

  const cancelInvitation = useCallback(async (invitationId: number): Promise<boolean> => {
    if (!projectId || !token) return false;
    setError(null);

    try {
      await dockerDelete(
        `/api/git/${projectId}/invitations/${invitationId}?token=${encodeURIComponent(token)}`
      );
      await refresh();
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to cancel invitation');
      return false;
    }
  }, [projectId, token, refresh]);

  return {
    isGitHubRepo: !!repoInfo,
    repoInfo,
    collaborators,
    invitations,
    isLoading,
    error,
    token,
    setToken,
    clearToken,
    refresh,
    invite,
    remove,
    cancelInvitation,
  };
}
