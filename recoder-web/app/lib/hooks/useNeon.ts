/**
 * useNeon — React hook for Neon PostgreSQL integration.
 * Handles connection, project/branch management, linking, and env variable injection.
 */

import { useState, useCallback, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { dockerGet, dockerPost, dockerDelete } from '~/lib/services/docker-api';
import { workbenchStore } from '~/lib/stores/workbench';

// ── Types ──────────────────────────────────────────────────────────

export interface NeonProject {
  id: string;
  name: string;
  region_id: string;
  org_id?: string;
}

export interface NeonBranch {
  id: string;
  name: string;
  project_id: string;
  parent_id?: string;
  created_at: string;
  default: boolean;
}

export interface NeonProjectCreated {
  project: NeonProject;
  connectionUri: string;
  developmentBranchId: string;
  previewBranchId: string;
}

export interface ProjectNeonLink {
  projectId: string;
  developmentBranchId: string;
  previewBranchId?: string;
}

// ── Hook ───────────────────────────────────────────────────────────

export function useNeon() {
  const projectId = useStore(workbenchStore.projectId);

  const [isConnected, setIsConnected] = useState(false);
  const [projects, setProjects] = useState<NeonProject[]>([]);
  const [branches, setBranches] = useState<NeonBranch[]>([]);
  const [linkedProject, setLinkedProject] = useState<ProjectNeonLink | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Check connection status on mount
  useEffect(() => {
    checkConnection();
  }, []);

  // Check link status when projectId changes
  useEffect(() => {
    if (projectId && isConnected) {
      checkProjectLink();
    }
  }, [projectId, isConnected]);

  const checkConnection = useCallback(async () => {
    try {
      const data = await dockerGet<{ projects: NeonProject[] }>(
        '/api/integrations/neon/projects',
      );
      setProjects(data.projects || []);
      setIsConnected(true);
    } catch {
      setIsConnected(false);
    }
  }, []);

  const checkProjectLink = useCallback(async () => {
    if (!projectId) return;
    try {
      // Try getting connection URI — will fail if not linked
      await dockerGet(`/api/integrations/neon/${projectId}/connection-uri`);
      setLinkedProject({ projectId: '', developmentBranchId: '' }); // placeholder
    } catch {
      setLinkedProject(null);
    }
  }, [projectId]);

  const connect = useCallback(async (apiKey: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      await dockerPost('/api/integrations/neon/connect', { apiKey });
      const data = await dockerGet<{ projects: NeonProject[] }>(
        '/api/integrations/neon/projects',
      );
      setProjects(data.projects || []);
      setIsConnected(true);
      return true;
    } catch {
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await dockerDelete('/api/integrations/neon/disconnect');
    } catch {
      // ignore
    }
    setIsConnected(false);
    setProjects([]);
    setBranches([]);
    setLinkedProject(null);
  }, []);

  const refreshProjects = useCallback(async () => {
    if (!isConnected) return;
    try {
      const data = await dockerGet<{ projects: NeonProject[] }>(
        '/api/integrations/neon/projects',
      );
      setProjects(data.projects || []);
    } catch {
      // ignore
    }
  }, [isConnected]);

  const refreshBranches = useCallback(async () => {
    if (!isConnected || !linkedProject) return;
    try {
      const data = await dockerGet<{ branches: NeonBranch[] }>(
        `/api/integrations/neon/projects/${linkedProject.projectId}/branches`,
      );
      setBranches(data.branches || []);
    } catch {
      // ignore
    }
  }, [isConnected, linkedProject]);

  const createProject = useCallback(async (name: string): Promise<NeonProjectCreated> => {
    setIsLoading(true);
    try {
      const result = await dockerPost<NeonProjectCreated>(
        '/api/integrations/neon/projects',
        { name },
      );
      await refreshProjects();
      return result;
    } finally {
      setIsLoading(false);
    }
  }, [refreshProjects]);

  const linkProject = useCallback(async (
    neonProjectId: string,
    devBranchId: string,
    previewBranchId?: string,
  ) => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      await dockerPost(`/api/integrations/neon/${projectId}/link`, {
        neonProjectId,
        developmentBranchId: devBranchId,
        previewBranchId,
      });
      setLinkedProject({ projectId: neonProjectId, developmentBranchId: devBranchId, previewBranchId });

      // Load branches for the linked project
      const data = await dockerGet<{ branches: NeonBranch[] }>(
        `/api/integrations/neon/projects/${neonProjectId}/branches`,
      );
      setBranches(data.branches || []);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const unlinkProject = useCallback(async () => {
    if (!projectId) return;
    try {
      await dockerDelete(`/api/integrations/neon/${projectId}/unlink`);
      setLinkedProject(null);
      setBranches([]);
    } catch {
      // ignore
    }
  }, [projectId]);

  const setContainerEnv = useCallback(async (branchId?: string) => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      await dockerPost(`/api/integrations/neon/${projectId}/set-env`, {
        branchId,
      });
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const createBranch = useCallback(async (name: string, parentId: string): Promise<NeonBranch> => {
    if (!projectId) throw new Error('No project');
    setIsLoading(true);
    try {
      const data = await dockerPost<{ branch: NeonBranch }>(
        `/api/integrations/neon/${projectId}/branches`,
        { name, parentBranchId: parentId },
      );
      await refreshBranches();
      return data.branch;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, refreshBranches]);

  const deleteBranch = useCallback(async (branchId: string) => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      await dockerDelete(`/api/integrations/neon/${projectId}/branches/${branchId}`);
      await refreshBranches();
    } finally {
      setIsLoading(false);
    }
  }, [projectId, refreshBranches]);

  const restoreBranch = useCallback(async (branchId: string, timestamp: string) => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      await dockerPost(
        `/api/integrations/neon/${projectId}/branches/${branchId}/restore`,
        { timestamp },
      );
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  return {
    isConnected,
    connect,
    disconnect,
    projects,
    branches,
    linkedProject,
    createProject,
    linkProject,
    unlinkProject,
    setContainerEnv,
    createBranch,
    deleteBranch,
    restoreBranch,
    isLoading,
    refreshProjects,
    refreshBranches,
  };
}
