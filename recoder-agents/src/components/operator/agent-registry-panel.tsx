'use client';

import { Bot, CircleDot, Clock, Layers, RotateCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAgentRegistry, type AgentWithHealth } from '@/hooks/operator/use-agent-registry';
import { formatRelative } from './format-relative';

function AgentRow({ agent }: { agent: AgentWithHealth }) {
  const online = agent.health?.online ?? false;
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
        <Bot className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{agent.identity?.name || agent.identity?.id}</span>
          <Badge
            variant="outline"
            className={cn(
              'flex items-center gap-1 px-1.5 py-0 text-[10px]',
              online
                ? 'border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-700/50 dark:bg-zinc-800/40 dark:text-zinc-300',
            )}
          >
            <CircleDot className="h-2.5 w-2.5" />
            {online ? 'online' : 'offline'}
          </Badge>
          {agent.tier && (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-muted-foreground">
              {agent.tier}
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span className="font-mono">{agent.identity?.platform}</span>
          <span className="text-muted-foreground/40">|</span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            seen {formatRelative(agent.health?.lastHeartbeat || agent.durable?.lastReconnectAt, 'never')}
          </span>
          {(agent.durable?.reconnectCount ?? 0) > 0 && (
            <>
              <span className="text-muted-foreground/40">|</span>
              <span className="flex items-center gap-1">
                <RotateCw className="h-3 w-3" />
                {agent.durable.reconnectCount} reconnect{agent.durable.reconnectCount === 1 ? '' : 's'}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function AgentRegistryPanel() {
  const { data: agents, isLoading, isError, error } = useAgentRegistry();

  const online = (agents ?? []).filter((a) => a.health?.online).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Layers className="h-4 w-4 text-muted-foreground" />
          Workspace Agents
        </CardTitle>
        {agents && (
          <span className="text-xs text-muted-foreground">
            {online} online / {agents.length} registered
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <p className="py-4 text-center text-xs text-muted-foreground">Loading agents…</p>}
        {isError && (
          <p className="py-4 text-center text-xs text-red-500">
            {error instanceof Error ? error.message : 'Failed to load agents'}
          </p>
        )}
        {!isLoading && !isError && (agents?.length ?? 0) === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">No agents registered</p>
        )}
        {(agents ?? []).map((agent) => (
          <AgentRow key={agent.identity?.id} agent={agent} />
        ))}
      </CardContent>
    </Card>
  );
}
