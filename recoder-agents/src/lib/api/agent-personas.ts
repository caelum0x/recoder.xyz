import { backendApi } from '@/lib/api-client';

export type PersonaTone =
  | 'professional'
  | 'casual'
  | 'friendly'
  | 'formal'
  | 'technical'
  | 'creative';

export interface AgentPersona {
  id: string;
  user_id: string;
  persona_name: string;
  description: string | null;
  tone: PersonaTone;
  personality_traits: string[];
  communication_style: string | null;
  language_preferences: Record<string, unknown>;
  custom_instructions: string | null;
  avatar_emoji: string;
  is_active: boolean;
  assignment_count?: number;
  created_at: string;
  updated_at: string;
}

export interface PersonaAssignment {
  id: string;
  user_id: string;
  agent_id: string;
  persona_id: string;
  override_instructions: string | null;
  assigned_at: string;
  // joined persona fields
  persona_name?: string;
  description?: string | null;
  tone?: PersonaTone;
  personality_traits?: string[];
  communication_style?: string | null;
  language_preferences?: Record<string, unknown>;
  custom_instructions?: string | null;
  avatar_emoji?: string;
  is_active?: boolean;
}

export interface CreatePersonaData {
  persona_name: string;
  description?: string;
  tone?: PersonaTone;
  personality_traits?: string[];
  communication_style?: string;
  language_preferences?: Record<string, unknown>;
  custom_instructions?: string;
  avatar_emoji?: string;
}

export interface UpdatePersonaData {
  persona_name?: string;
  description?: string;
  tone?: PersonaTone;
  personality_traits?: string[];
  communication_style?: string;
  language_preferences?: Record<string, unknown>;
  custom_instructions?: string;
  avatar_emoji?: string;
  is_active?: boolean;
}

export interface AssignPersonaData {
  persona_id: string;
  override_instructions?: string;
}

export const listPersonas = async (): Promise<AgentPersona[]> => {
  const response = await backendApi.get<AgentPersona[]>('/personas', { showErrors: true });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const createPersona = async (data: CreatePersonaData): Promise<AgentPersona> => {
  const response = await backendApi.post<AgentPersona>('/personas', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getPersona = async (personaId: string): Promise<AgentPersona> => {
  const response = await backendApi.get<AgentPersona>(`/personas/${personaId}`, {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updatePersona = async (
  personaId: string,
  data: UpdatePersonaData,
): Promise<AgentPersona> => {
  const response = await backendApi.patch<AgentPersona>(`/personas/${personaId}`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deletePersona = async (personaId: string): Promise<{ deleted: boolean }> => {
  const response = await backendApi.delete(`/personas/${personaId}`);
  if (response.error) throw new Error(response.error.message);
  return response.data as { deleted: boolean };
};

export const getAgentPersona = async (agentId: string): Promise<PersonaAssignment> => {
  const response = await backendApi.get<PersonaAssignment>(`/agents/${agentId}/persona`, {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const assignPersona = async (
  agentId: string,
  data: AssignPersonaData,
): Promise<PersonaAssignment> => {
  const response = await backendApi.post<PersonaAssignment>(`/agents/${agentId}/persona`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const removePersonaAssignment = async (
  agentId: string,
): Promise<{ deleted: boolean }> => {
  const response = await backendApi.delete(`/agents/${agentId}/persona`);
  if (response.error) throw new Error(response.error.message);
  return response.data as { deleted: boolean };
};
