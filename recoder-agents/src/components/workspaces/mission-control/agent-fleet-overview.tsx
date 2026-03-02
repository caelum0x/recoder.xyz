'use client';

import { useAgentTeamStore } from '@/stores/agent-team-store';
import { AgentStatusCard } from '../agent-status-card';

interface AgentFleetOverviewProps {
  onAgentClick?: (agentId: string) => void;
}

export function AgentFleetOverview({ onAgentClick }: AgentFleetOverviewProps) {
  const agents = useAgentTeamStore((s) => s.agents);

  const online = agents.filter((a) => a.status !== 'offline');
  const offline = agents.filter((a) => a.status === 'offline');

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium">Agent Fleet</h3>
        <span className="text-xs text-muted-foreground">
          {online.length} online / {agents.length} total
        </span>
      </div>

      {agents.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">
          No agents in this workspace
        </p>
      ) : (
        <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {online.map((agent) => (
            <AgentStatusCard
              key={agent.agentId}
              agent={agent}
              onClick={() => onAgentClick?.(agent.agentId)}
            />
          ))}
          {offline.map((agent) => (
            <AgentStatusCard
              key={agent.agentId}
              agent={agent}
              onClick={() => onAgentClick?.(agent.agentId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
