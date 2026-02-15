/**
 * useSupabase — React hook for Supabase integration.
 * Handles connection, project listing, linking, SQL execution, and edge function deployment.
 */

import { useState, useCallback, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { dockerGet, dockerPost, dockerDelete } from '~/lib/services/docker-api';
import { workbenchStore } from '~/lib/stores/workbench';

// ── Types ──────────────────────────────────────────────────────────

export interface SupabaseOrganization {
  id: string;
  name: string;
  slug: string;
}

export interface SupabaseProject {
  id: string;
  name: string;
  region: string;
  organization_id: string;
  status: string;
}

export interface SupabaseBranch {
  id: string;
  name: string;
  is_default: boolean;
  project_ref: string;
}

export interface SupabaseApiKey {
  name: string;
  api_key: string;
}

export interface ProjectSupabaseLink {
  projectId: string;
  organizationSlug: string;
}

export interface SupabaseLogEntry {
  id: string;
  timestamp: number;
  event_message: string;
}

// ── Hook ───────────────────────────────────────────────────────────

export function useSupabase() {
  const projectId = useStore(workbenchStore.projectId);

  const [isConnected, setIsConnected] = useState(false);
  const [organizations, setOrganizations] = useState<SupabaseOrganization[]>([]);
  const [projects, setProjects] = useState<SupabaseProject[]>([]);
  const [branches, setBranches] = useState<SupabaseBranch[]>([]);
  const [linkedProject, setLinkedProject] = useState<ProjectSupabaseLink | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Check connection status on mount
  useEffect(() => {
    checkConnection();
  }, []);

  // Check if linked when projectId changes
  useEffect(() => {
    if (projectId && isConnected) {
      checkProjectLink();
    }
  }, [projectId, isConnected]);

  const checkConnection = useCallback(async () => {
    try {
      const data = await dockerGet<{ organizations: SupabaseOrganization[] }>(
        '/api/integrations/supabase/organizations',
      );
      setOrganizations(data.organizations || []);
      setIsConnected(true);
      // Also load projects
      const pData = await dockerGet<{ projects: SupabaseProject[] }>(
        '/api/integrations/supabase/projects',
      );
      setProjects(pData.projects || []);
    } catch {
      setIsConnected(false);
    }
  }, []);

  const checkProjectLink = useCallback(async () => {
    if (!projectId) return;
    try {
      // The schema endpoint will fail if not linked — use that as a check
      await dockerGet(`/api/integrations/supabase/${projectId}/schema`);
      // If we get here, it's linked (we don't get the link data directly, but we know it works)
      setLinkedProject({ projectId: '', organizationSlug: '' }); // placeholder
    } catch {
      setLinkedProject(null);
    }
  }, [projectId]);

  const connect = useCallback(async (accessToken: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const data = await dockerPost<{ organizations: SupabaseOrganization[] }>(
        '/api/integrations/supabase/connect',
        { accessToken },
      );
      setOrganizations(data.organizations || []);
      setIsConnected(true);
      // Load projects
      const pData = await dockerGet<{ projects: SupabaseProject[] }>(
        '/api/integrations/supabase/projects',
      );
      setProjects(pData.projects || []);
      return true;
    } catch {
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await dockerDelete('/api/integrations/supabase/disconnect');
    } catch {
      // ignore
    }
    setIsConnected(false);
    setOrganizations([]);
    setProjects([]);
    setBranches([]);
    setLinkedProject(null);
  }, []);

  const refreshProjects = useCallback(async () => {
    if (!isConnected) return;
    try {
      const data = await dockerGet<{ projects: SupabaseProject[] }>(
        '/api/integrations/supabase/projects',
      );
      setProjects(data.projects || []);
    } catch {
      // ignore
    }
  }, [isConnected]);

  const refreshBranches = useCallback(async (supabaseProjectId: string) => {
    if (!isConnected) return;
    try {
      const data = await dockerGet<{ branches: SupabaseBranch[] }>(
        `/api/integrations/supabase/projects/${supabaseProjectId}/branches`,
      );
      setBranches(data.branches || []);
    } catch {
      // ignore
    }
  }, [isConnected]);

  const linkProject = useCallback(async (supabaseProjectId: string, orgSlug: string) => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      await dockerPost(`/api/integrations/supabase/${projectId}/link`, {
        supabaseProjectId,
        organizationSlug: orgSlug,
      });
      setLinkedProject({ projectId: supabaseProjectId, organizationSlug: orgSlug });
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const unlinkProject = useCallback(async () => {
    if (!projectId) return;
    try {
      await dockerDelete(`/api/integrations/supabase/${projectId}/unlink`);
      setLinkedProject(null);
    } catch {
      // ignore
    }
  }, [projectId]);

  const executeQuery = useCallback(async (sql: string): Promise<unknown> => {
    if (!projectId) throw new Error('No project');
    return dockerPost(`/api/integrations/supabase/${projectId}/sql`, { query: sql });
  }, [projectId]);

  const getSchema = useCallback(async (): Promise<string> => {
    if (!projectId) throw new Error('No project');
    const data = await dockerGet<{ schema: string }>(`/api/integrations/supabase/${projectId}/schema`);
    return data.schema;
  }, [projectId]);

  const deployFunctions = useCallback(async (): Promise<Array<{ name: string; status: string }>> => {
    if (!projectId) throw new Error('No project');
    const data = await dockerPost<{ deployed: Array<{ name: string; status: string }> }>(
      `/api/integrations/supabase/${projectId}/deploy-functions`,
    );
    return data.deployed;
  }, [projectId]);

  const getEdgeLogs = useCallback(async (): Promise<SupabaseLogEntry[]> => {
    if (!projectId) throw new Error('No project');
    const data = await dockerGet<{ logs: SupabaseLogEntry[] }>(
      `/api/integrations/supabase/${projectId}/edge-logs`,
    );
    return data.logs;
  }, [projectId]);

  return {
    isConnected,
    connect,
    disconnect,
    organizations,
    projects,
    branches,
    linkedProject,
    linkProject,
    unlinkProject,
    executeQuery,
    getSchema,
    deployFunctions,
    getEdgeLogs,
    isLoading,
    refreshProjects,
    refreshBranches,
  };
}
