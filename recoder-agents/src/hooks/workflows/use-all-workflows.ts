'use client';

import { useMemo, useCallback } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useAgents } from '@/hooks/agents/use-agents';
import { workflowApi, type Workflow } from '@/lib/api/workflows';
import { workflowKeys } from './use-workflows';

export interface WorkflowWithAgent extends Workflow {
  agent_name: string;
}

/**
 * Workspace-level aggregation of every agent's workflows.
 *
 * The backend exposes workflows per-agent (`/workflows/agent/:id`), so this
 * hook fans out one query per agent and flattens the results into a single
 * list, decorating each workflow with its owning agent's name. Used by the
 * top-level `/workflows` management page.
 */
export function useAllWorkflows() {
  const { data: agentsData, isLoading: agentsLoading } = useAgents();

  const agents = useMemo(() => agentsData?.agents ?? [], [agentsData]);

  const results = useQueries({
    queries: agents.map((agent) => ({
      queryKey: workflowKeys.list(agent.agent_id),
      queryFn: () => workflowApi.list(agent.agent_id),
      enabled: !!agent.agent_id,
      staleTime: 30_000,
    })),
  });

  const workflows = useMemo<WorkflowWithAgent[]>(() => {
    const nameById = new Map(agents.map((a) => [a.agent_id, a.name]));
    return results.flatMap((result, index) => {
      const list = (result.data as Workflow[] | undefined) ?? [];
      const fallbackName = agents[index]?.name ?? 'Unknown agent';
      return list.map((workflow) => ({
        ...workflow,
        agent_name: nameById.get(workflow.agent_id) ?? fallbackName,
      }));
    });
  }, [results, agents]);

  const refetch = useCallback(() => {
    results.forEach((result) => void result.refetch());
  }, [results]);

  return {
    workflows,
    agents,
    isLoading: agentsLoading || (agents.length > 0 && results.some((r) => r.isLoading)),
    isError: results.some((r) => r.isError),
    refetch,
  };
}
