/**
 * useVercel — React hook for Vercel integration.
 * Handles connection, project linking, deployment history, and deploying.
 */

import { useState, useCallback, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { dockerGet, dockerPost, dockerDelete } from '~/lib/services/docker-api';
import { workbenchStore } from '~/lib/stores/workbench';

// ── Types ──────────────────────────────────────────────────────────

export interface VercelTeam {
  id: string;
  slug: string;
  name: string;
}

export interface VercelProject {
  id: string;
  name: string;
  framework: string | null;
}

export interface VercelDeployment {
  uid: string;
  url: string;
  state: string;
  createdAt: number;
  target: string | null;
  readyState: string;
}

export interface VercelProjectLink {
  vercelProjectId: string;
  vercelProjectName: string;
  vercelTeamId: string | null;
  vercelDeploymentUrl: string | null;
}

// ── Hook ───────────────────────────────────────────────────────────

export function useVercel() {
  const projectId = useStore(workbenchStore.projectId);

  const [isConnected, setIsConnected] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [teams, setTeams] = useState<VercelTeam[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [projects, setProjects] = useState<VercelProject[]>([]);
  const [linkedProject, setLinkedProject] = useState<VercelProjectLink | null>(null);
  const [deployments, setDeployments] = useState<VercelDeployment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);

  // Check connection status on mount
  useEffect(() => {
    checkStatus();
  }, []);

  // Load linked project when projectId changes
  useEffect(() => {
    if (projectId) {
      loadLinkedProject();
    }
  }, [projectId]);

  const checkStatus = useCallback(async () => {
    try {
      const data = await dockerGet<{
        connected: boolean;
        username?: string;
        teams?: VercelTeam[];
      }>('/api/integrations/vercel/status');
      setIsConnected(data.connected);
      setUsername(data.username || null);
      setTeams(data.teams || []);
    } catch {
      setIsConnected(false);
    }
  }, []);

  const connect = useCallback(async (token: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const data = await dockerPost<{
        username: string;
        teams: VercelTeam[];
      }>('/api/integrations/vercel/connect', { token });
      setIsConnected(true);
      setUsername(data.username);
      setTeams(data.teams || []);
      return true;
    } catch {
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await dockerDelete('/api/integrations/vercel/disconnect');
      setIsConnected(false);
      setUsername(null);
      setTeams([]);
      setProjects([]);
      setLinkedProject(null);
      setDeployments([]);
    } catch {
      // ignore
    }
  }, []);

  const loadProjects = useCallback(async (teamId?: string | null) => {
    setIsLoading(true);
    try {
      const query = teamId ? `?teamId=${teamId}` : '';
      const data = await dockerGet<{ projects: VercelProject[] }>(
        `/api/integrations/vercel/projects${query}`,
      );
      setProjects(data.projects || []);
    } catch {
      setProjects([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadLinkedProject = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await dockerGet<{ link: VercelProjectLink | null }>(
        `/api/integrations/vercel/${projectId}/link`,
      );
      setLinkedProject(data.link);
      if (data.link) {
        loadDeployments();
      }
    } catch {
      setLinkedProject(null);
    }
  }, [projectId]);

  const linkProject = useCallback(async (
    vercelProjectId: string,
    vercelProjectName: string,
    vercelTeamId?: string | null,
  ) => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      await dockerPost(`/api/integrations/vercel/${projectId}/link`, {
        vercelProjectId,
        vercelProjectName,
        vercelTeamId: vercelTeamId || null,
      });
      await loadLinkedProject();
    } finally {
      setIsLoading(false);
    }
  }, [projectId, loadLinkedProject]);

  const unlinkProject = useCallback(async () => {
    if (!projectId) return;
    try {
      await dockerDelete(`/api/integrations/vercel/${projectId}/unlink`);
      setLinkedProject(null);
      setDeployments([]);
    } catch {
      // ignore
    }
  }, [projectId]);

  const loadDeployments = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await dockerGet<{
        deployments: VercelDeployment[];
        deploymentUrl: string | null;
      }>(`/api/integrations/vercel/${projectId}/deployments`);
      setDeployments(data.deployments || []);
    } catch {
      // ignore
    }
  }, [projectId]);

  const deploy = useCallback(async (options?: {
    target?: string;
    buildDir?: string;
  }): Promise<{ url: string } | null> => {
    if (!projectId) return null;
    setIsDeploying(true);
    try {
      const data = await dockerPost<{
        deploymentId: string;
        url: string;
        readyState: string;
      }>(`/api/integrations/vercel/${projectId}/deploy`, {
        target: options?.target || 'production',
        buildDir: options?.buildDir || 'dist',
      }, { timeout: 120000 });
      await loadDeployments();
      return { url: data.url };
    } catch {
      return null;
    } finally {
      setIsDeploying(false);
    }
  }, [projectId, loadDeployments]);

  const createProject = useCallback(async (
    name: string,
    framework?: string,
  ): Promise<VercelProject | null> => {
    setIsLoading(true);
    try {
      const data = await dockerPost<{ project: VercelProject }>(
        '/api/integrations/vercel/projects',
        { name, framework, teamId: selectedTeamId },
      );
      await loadProjects(selectedTeamId);
      return data.project;
    } catch {
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [selectedTeamId, loadProjects]);

  const detectFramework = useCallback(async (): Promise<string | null> => {
    if (!projectId) return null;
    try {
      const data = await dockerGet<{ framework: string | null }>(
        `/api/integrations/vercel/${projectId}/detect-framework`,
      );
      return data.framework;
    } catch {
      return null;
    }
  }, [projectId]);

  return {
    isConnected,
    username,
    teams,
    selectedTeamId,
    setSelectedTeamId,
    projects,
    linkedProject,
    deployments,
    isLoading,
    isDeploying,

    connect,
    disconnect,
    loadProjects,
    linkProject,
    unlinkProject,
    createProject,
    deploy,
    loadDeployments,
    detectFramework,
    checkStatus,
  };
}
