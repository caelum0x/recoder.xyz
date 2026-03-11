'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createSkillNode,
  getSkillTreeNodes,
  unlockSkill,
  deleteSkillNode,
  awardXP,
  getXPEvents,
  getSkillProgress,
  type SkillTreeNode,
  type SkillXPEvent,
  type SkillProgress,
  type UnlockSkillResult,
  type CreateSkillNodeData,
  type AwardXPData,
} from '@/lib/api/agent-skill-trees';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const skillTreeKeys = {
  all: ['agent-skill-trees'] as const,
  nodes: (agentId: string) => [...skillTreeKeys.all, 'nodes', agentId] as const,
  xpEvents: (agentId: string) => [...skillTreeKeys.all, 'xp-events', agentId] as const,
  progress: (agentId: string) => [...skillTreeKeys.all, 'progress', agentId] as const,
} as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * List skill tree nodes for an agent.
 */
export function useSkillTreeNodes(agentId: string) {
  return useQuery<SkillTreeNode[]>({
    queryKey: skillTreeKeys.nodes(agentId),
    queryFn: () => getSkillTreeNodes(agentId),
    enabled: Boolean(agentId),
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
}

/**
 * Create a new skill tree node.
 */
export function useCreateSkillNode() {
  const queryClient = useQueryClient();
  return useMutation<SkillTreeNode, Error, { agentId: string; data: CreateSkillNodeData }>({
    mutationFn: ({ agentId, data }) => createSkillNode(agentId, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: skillTreeKeys.nodes(variables.agentId) });
    },
  });
}

/**
 * Unlock a skill (checks XP and level, deducts XP).
 */
export function useUnlockSkill() {
  const queryClient = useQueryClient();
  return useMutation<UnlockSkillResult, Error, { agentId: string; skillId: string }>({
    mutationFn: ({ agentId, skillId }) => unlockSkill(agentId, skillId),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: skillTreeKeys.nodes(variables.agentId) });
      queryClient.invalidateQueries({ queryKey: skillTreeKeys.progress(variables.agentId) });
    },
  });
}

/**
 * Delete a skill tree node.
 */
export function useDeleteSkillNode() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { agentId: string; skillId: string }>({
    mutationFn: ({ agentId, skillId }) => deleteSkillNode(agentId, skillId),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: skillTreeKeys.nodes(variables.agentId) });
    },
  });
}

/**
 * Award XP to an agent and update progress.
 */
export function useAwardXP() {
  const queryClient = useQueryClient();
  return useMutation<SkillProgress, Error, { agentId: string; data: AwardXPData }>({
    mutationFn: ({ agentId, data }) => awardXP(agentId, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: skillTreeKeys.progress(variables.agentId) });
      queryClient.invalidateQueries({ queryKey: skillTreeKeys.xpEvents(variables.agentId) });
    },
  });
}

/**
 * List XP events for an agent.
 */
export function useXPEvents(agentId: string, limit?: number) {
  return useQuery<SkillXPEvent[]>({
    queryKey: skillTreeKeys.xpEvents(agentId),
    queryFn: () => getXPEvents(agentId, limit),
    enabled: Boolean(agentId),
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
}

/**
 * Get skill progress (XP, level, skills unlocked) for an agent.
 */
export function useSkillProgress(agentId: string) {
  return useQuery<SkillProgress>({
    queryKey: skillTreeKeys.progress(agentId),
    queryFn: () => getSkillProgress(agentId),
    enabled: Boolean(agentId),
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
}

export type {
  SkillTreeNode,
  SkillXPEvent,
  SkillProgress,
  UnlockSkillResult,
  CreateSkillNodeData,
  AwardXPData,
};
