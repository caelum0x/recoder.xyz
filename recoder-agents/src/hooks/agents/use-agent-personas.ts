'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listPersonas,
  createPersona,
  getPersona,
  updatePersona,
  deletePersona,
  getAgentPersona,
  assignPersona,
  removePersonaAssignment,
  type AgentPersona,
  type PersonaAssignment,
  type CreatePersonaData,
  type UpdatePersonaData,
  type AssignPersonaData,
} from '@/lib/api/agent-personas';

const personasKey = ['agent-personas'] as const;
const personaKey = (personaId: string) => ['agent-persona', personaId] as const;
const agentPersonaKey = (agentId: string) => ['agent-persona-assignment', agentId] as const;

export function usePersonas() {
  return useQuery<AgentPersona[]>({
    queryKey: personasKey,
    queryFn: () => listPersonas(),
    staleTime: 30_000,
  });
}

export function usePersona(personaId: string) {
  return useQuery<AgentPersona>({
    queryKey: personaKey(personaId),
    queryFn: () => getPersona(personaId),
    staleTime: 30_000,
    enabled: !!personaId,
  });
}

export function useCreatePersona() {
  const queryClient = useQueryClient();

  return useMutation<AgentPersona, Error, CreatePersonaData>({
    mutationFn: (data) => createPersona(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: personasKey });
    },
  });
}

export function useUpdatePersona() {
  const queryClient = useQueryClient();

  return useMutation<AgentPersona, Error, { personaId: string; data: UpdatePersonaData }>({
    mutationFn: ({ personaId, data }) => updatePersona(personaId, data),
    onSuccess: (_, { personaId }) => {
      queryClient.invalidateQueries({ queryKey: personasKey });
      queryClient.invalidateQueries({ queryKey: personaKey(personaId) });
    },
  });
}

export function useDeletePersona() {
  const queryClient = useQueryClient();

  return useMutation<{ deleted: boolean }, Error, string>({
    mutationFn: (personaId) => deletePersona(personaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: personasKey });
    },
  });
}

export function useAgentPersona(agentId: string) {
  return useQuery<PersonaAssignment>({
    queryKey: agentPersonaKey(agentId),
    queryFn: () => getAgentPersona(agentId),
    staleTime: 30_000,
    enabled: !!agentId,
    retry: false,
  });
}

export function useAssignPersona(agentId: string) {
  const queryClient = useQueryClient();

  return useMutation<PersonaAssignment, Error, AssignPersonaData>({
    mutationFn: (data) => assignPersona(agentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentPersonaKey(agentId) });
      queryClient.invalidateQueries({ queryKey: personasKey });
    },
  });
}

export function useRemovePersonaAssignment(agentId: string) {
  const queryClient = useQueryClient();

  return useMutation<{ deleted: boolean }, Error, void>({
    mutationFn: () => removePersonaAssignment(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentPersonaKey(agentId) });
      queryClient.invalidateQueries({ queryKey: personasKey });
    },
  });
}
