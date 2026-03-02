'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAgentTeamStore } from '@/stores/agent-team-store';
import { useCreateChannel } from '@/hooks/channels/use-channels';

interface CreateChannelDialogProps {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ChannelScope = 'public' | 'agent-to-agent' | 'direct';

export function CreateChannelDialog({
  workspaceId,
  open,
  onOpenChange,
}: CreateChannelDialogProps) {
  const [name, setName] = useState('');
  const [scope, setScope] = useState<ChannelScope>('public');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);

  const agents = useAgentTeamStore((s) => s.agents);
  const createChannel = useCreateChannel();

  const handleCreate = () => {
    if (!name.trim()) return;

    createChannel.mutate(
      {
        name: name.trim().toLowerCase().replace(/\s+/g, '-'),
        scope,
        memberAgentIds: selectedAgentIds.length > 0 ? selectedAgentIds : undefined,
        workspaceId,
      },
      {
        onSuccess: () => {
          setName('');
          setScope('public');
          setSelectedAgentIds([]);
          onOpenChange(false);
        },
      },
    );
  };

  const toggleAgent = (agentId: string) => {
    setSelectedAgentIds((prev) =>
      prev.includes(agentId)
        ? prev.filter((id) => id !== agentId)
        : [...prev, agentId],
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Channel</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Channel name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Channel Name</label>
            <Input
              placeholder="feature-discussion"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
              }}
            />
            {name && (
              <p className="text-xs text-muted-foreground">
                Will be created as <span className="font-mono">#{name.trim().toLowerCase().replace(/\s+/g, '-')}</span>
              </p>
            )}
          </div>

          {/* Scope selector */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Scope</label>
            <Select value={scope} onValueChange={(v) => setScope(v as ChannelScope)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="agent-to-agent">Agent-to-Agent</SelectItem>
                <SelectItem value="direct">Direct</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {scope === 'public' && 'Visible to all workspace members and agents.'}
              {scope === 'agent-to-agent' && 'Private channel for agent-to-agent communication.'}
              {scope === 'direct' && 'Direct message channel between specific members.'}
            </p>
          </div>

          {/* Agent multi-select */}
          {agents.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Member Agents (optional)</label>
              <div className="border rounded-md max-h-40 overflow-y-auto">
                {agents.map((agent) => {
                  const selected = selectedAgentIds.includes(agent.agentId);
                  return (
                    <button
                      key={agent.agentId}
                      type="button"
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 text-sm w-full text-left hover:bg-accent/50 transition-colors',
                        selected && 'bg-accent text-accent-foreground',
                      )}
                      onClick={() => toggleAgent(agent.agentId)}
                    >
                      <div
                        className={cn(
                          'h-3 w-3 rounded-sm border flex items-center justify-center',
                          selected && 'bg-primary border-primary',
                        )}
                      >
                        {selected && (
                          <svg
                            className="h-2 w-2 text-primary-foreground"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className="truncate">{agent.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{agent.platform}</span>
                    </button>
                  );
                })}
              </div>
              {selectedAgentIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedAgentIds.length} agent{selectedAgentIds.length !== 1 ? 's' : ''} selected
                </p>
              )}
            </div>
          )}

          {/* Error message */}
          {createChannel.isError && (
            <p className="text-sm text-destructive">
              {createChannel.error instanceof Error
                ? createChannel.error.message
                : 'Failed to create channel'}
            </p>
          )}

          {/* Create button */}
          <Button
            className="w-full"
            onClick={handleCreate}
            disabled={!name.trim() || createChannel.isPending}
          >
            {createChannel.isPending ? 'Creating...' : 'Create Channel'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
