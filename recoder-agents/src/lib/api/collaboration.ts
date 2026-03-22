import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Collaborator {
  id: string;
  thread_id: string;
  user_id: string;
  email?: string;
  role: 'viewer' | 'editor' | 'admin';
  invited_by: string;
  accepted_at?: string;
  created_at: string;
}

export interface AgentAccess {
  id: string;
  agent_id: string;
  user_id: string;
  email?: string;
  role: 'user' | 'editor' | 'admin';
  granted_by: string;
  created_at: string;
}

export interface SharedWithMeResponse {
  shared_threads: Array<{
    thread_id: string;
    thread_title: string;
    role: string;
    shared_by: string;
    shared_at: string;
  }>;
  shared_agents: Array<{
    agent_id: string;
    agent_name: string;
    role: string;
    shared_by: string;
    shared_at: string;
  }>;
}

// ---------------------------------------------------------------------------
// Thread collaboration
// ---------------------------------------------------------------------------

export async function shareThread(
  threadId: string,
  email: string,
  role: 'viewer' | 'editor',
): Promise<Collaborator> {
  try {
    const response = await backendApi.post<Collaborator>(
      `/collaboration/threads/${threadId}/share`,
      { email, role },
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'share thread', resource: 'collaboration' });
    throw error;
  }
}

export async function getThreadCollaborators(
  threadId: string,
): Promise<Collaborator[]> {
  try {
    const response = await backendApi.get<Collaborator[]>(
      `/collaboration/threads/${threadId}/collaborators`,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get thread collaborators', resource: 'collaboration' });
    throw error;
  }
}

export async function removeThreadCollaborator(
  threadId: string,
  collaboratorId: string,
): Promise<void> {
  try {
    const response = await backendApi.delete(
      `/collaboration/threads/${threadId}/collaborators/${collaboratorId}`,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
  } catch (error) {
    handleApiError(error, { operation: 'remove collaborator', resource: 'collaboration' });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Agent team access
// ---------------------------------------------------------------------------

export async function shareAgent(
  agentId: string,
  email: string,
  role: 'user' | 'editor' | 'admin',
): Promise<AgentAccess> {
  try {
    const response = await backendApi.post<AgentAccess>(
      `/collaboration/agents/${agentId}/share`,
      { email, role },
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'share agent', resource: 'collaboration' });
    throw error;
  }
}

export async function getAgentTeam(agentId: string): Promise<AgentAccess[]> {
  try {
    const response = await backendApi.get<AgentAccess[]>(
      `/collaboration/agents/${agentId}/team`,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get agent team', resource: 'collaboration' });
    throw error;
  }
}

export async function removeAgentAccess(
  agentId: string,
  accessId: string,
): Promise<void> {
  try {
    const response = await backendApi.delete(
      `/collaboration/agents/${agentId}/team/${accessId}`,
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
  } catch (error) {
    handleApiError(error, { operation: 'remove agent access', resource: 'collaboration' });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Shared-with-me
// ---------------------------------------------------------------------------

export async function getSharedWithMe(): Promise<SharedWithMeResponse> {
  try {
    const response = await backendApi.get<SharedWithMeResponse>(
      '/collaboration/shared-with-me',
      { showErrors: true },
    );
    if (response.error) throw new Error(`Error: ${response.error.message}`);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get shared items', resource: 'collaboration' });
    throw error;
  }
}
