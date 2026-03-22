import { backendApi } from '@/lib/api-client';

export interface Workspace {
  id: string;
  workspace_name: string;
  description?: string;
  color: string;
  icon: string;
  agent_ids: string[];
  thread_ids: string[];
  is_default: boolean;
  member_count?: number;
  agent_count?: number;
  thread_count?: number;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceActivity {
  id: string;
  workspace_id: string;
  activity_type: string;
  entity_type?: string;
  entity_id?: string;
  description?: string;
  occurred_at: string;
}

export async function listWorkspaces() {
  const response = await backendApi.get<Workspace[]>('/workspaces');
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function getWorkspace(id: string) {
  const response = await backendApi.get<Workspace>(`/workspaces/${id}`);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function createWorkspace(data: {
  workspace_name: string;
  description?: string;
  color?: string;
  icon?: string;
  is_default?: boolean;
}) {
  const response = await backendApi.post<Workspace>('/workspaces', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function updateWorkspace(id: string, data: Partial<Workspace>) {
  const response = await backendApi.patch<Workspace>(`/workspaces/${id}`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function deleteWorkspace(id: string) {
  const response = await backendApi.delete(`/workspaces/${id}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
}

export async function addAgentToWorkspace(workspaceId: string, agentId: string) {
  const response = await backendApi.post(`/workspaces/${workspaceId}/agents`, { agent_id: agentId });
  if (response.error) throw new Error(response.error.message);
  return response.data;
}

export async function removeAgentFromWorkspace(workspaceId: string, agentId: string) {
  const response = await backendApi.delete(`/workspaces/${workspaceId}/agents/${agentId}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
}

export async function addThreadToWorkspace(workspaceId: string, threadId: string) {
  const response = await backendApi.post(`/workspaces/${workspaceId}/threads`, { thread_id: threadId });
  if (response.error) throw new Error(response.error.message);
  return response.data;
}

export async function removeThreadFromWorkspace(workspaceId: string, threadId: string) {
  const response = await backendApi.delete(`/workspaces/${workspaceId}/threads/${threadId}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
}

export async function recordWorkspaceActivity(
  workspaceId: string,
  data: {
    activity_type: string;
    entity_type?: string;
    entity_id?: string;
    description?: string;
  },
) {
  const response = await backendApi.post<WorkspaceActivity>(
    `/workspaces/${workspaceId}/activity`,
    data,
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function listWorkspaceActivity(workspaceId: string, limit = 50) {
  const response = await backendApi.get<WorkspaceActivity[]>(
    `/workspaces/${workspaceId}/activity?limit=${limit}`,
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}
