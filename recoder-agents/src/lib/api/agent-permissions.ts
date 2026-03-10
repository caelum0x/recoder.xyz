import { backendApi } from '@/lib/api-client';

export interface AgentRole {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  permissions: string[];
  is_system: boolean;
  created_at: string;
}

export interface AgentRoleAssignment {
  id: string;
  user_id: string;
  agent_id: string;
  role_id: string;
  assigned_by: string | null;
  granted_at: string;
  expires_at: string | null;
  role_name: string;
  role_description: string | null;
  permissions: string[];
  is_system: boolean;
}

export interface PermissionAuditEntry {
  id: string;
  user_id: string;
  agent_id: string;
  action: string;
  permission_required: string | null;
  was_allowed: boolean;
  context: Record<string, unknown>;
  created_at: string;
}

// ── Roles CRUD ──────────────────────────────────────────────────────────

export const listRoles = async (): Promise<AgentRole[]> => {
  const response = await backendApi.get<AgentRole[]>('/roles', { showErrors: false });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const createRole = async (data: {
  name: string;
  description?: string;
  permissions: string[];
}): Promise<AgentRole> => {
  const response = await backendApi.post<AgentRole>('/roles', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateRole = async (
  roleId: string,
  data: { name?: string; description?: string; permissions?: string[] }
): Promise<AgentRole> => {
  const response = await backendApi.patch<AgentRole>(`/roles/${roleId}`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteRole = async (roleId: string) => {
  const response = await backendApi.delete(`/roles/${roleId}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const seedRoles = async (): Promise<{ status: string; roles: AgentRole[] }> => {
  const response = await backendApi.post<{ status: string; roles: AgentRole[] }>('/roles/seed', {});
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

// ── Role Assignments ────────────────────────────────────────────────────

export const listAgentRoles = async (agentId: string): Promise<AgentRoleAssignment[]> => {
  const response = await backendApi.get<AgentRoleAssignment[]>(
    `/agents/${agentId}/roles`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const assignRole = async (
  agentId: string,
  data: { role_id: string; expires_at?: string }
): Promise<AgentRoleAssignment> => {
  const response = await backendApi.post<AgentRoleAssignment>(`/agents/${agentId}/roles`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const removeRoleAssignment = async (agentId: string, assignmentId: string) => {
  const response = await backendApi.delete(`/agents/${agentId}/roles/${assignmentId}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

// ── Permission Audit ────────────────────────────────────────────────────

export const getPermissionAudit = async (
  agentId: string,
  params?: { limit?: number; offset?: number }
): Promise<PermissionAuditEntry[]> => {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));
  const qs = query.toString() ? `?${query.toString()}` : '';
  const response = await backendApi.get<PermissionAuditEntry[]>(
    `/agents/${agentId}/permissions/audit${qs}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
