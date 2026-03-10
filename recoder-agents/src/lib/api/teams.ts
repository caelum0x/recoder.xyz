import { backendApi } from '@/lib/api-client';

export interface Team {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  my_role: string;
  member_count: number;
  created_at: string;
}

export interface TeamDetail extends Team {
  members: TeamMember[];
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  email: string | null;
  role: string;
  invited_at: string;
  accepted_at: string | null;
}

export const getTeams = async (): Promise<Team[]> => {
  const response = await backendApi.get<Team[]>('/teams', { showErrors: false });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const createTeam = async (data: { name: string; description?: string }): Promise<Team> => {
  const response = await backendApi.post<Team>('/teams', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getTeamDetail = async (teamId: string): Promise<TeamDetail> => {
  const response = await backendApi.get<TeamDetail>(`/teams/${teamId}`, { showErrors: false });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateTeam = async (teamId: string, data: { name?: string; description?: string }): Promise<Team> => {
  const response = await backendApi.patch<Team>(`/teams/${teamId}`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteTeam = async (teamId: string) => {
  const response = await backendApi.delete(`/teams/${teamId}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const inviteMember = async (teamId: string, email: string, role: string = 'member') => {
  const response = await backendApi.post(`/teams/${teamId}/invite`, { email, role });
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const removeMember = async (teamId: string, userId: string) => {
  const response = await backendApi.delete(`/teams/${teamId}/members/${userId}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
};

export const updateMemberRole = async (teamId: string, userId: string, role: string) => {
  const response = await backendApi.patch(`/teams/${teamId}/members/${userId}`, { role });
  if (response.error) throw new Error(response.error.message);
  return response.data;
};
