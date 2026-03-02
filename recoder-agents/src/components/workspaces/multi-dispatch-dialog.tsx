'use client';

import { useState } from 'react';
import { Loader2, Zap, GitBranch, ArrowRightLeft, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAgentTeamStore, type AgentTeamMember } from '@/stores/agent-team-store';
import { useMultiDispatch } from '@/hooks/tasks/use-multi-dispatch';

interface MultiDispatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onDispatched?: (dispatchId: string) => void;
}

const PATTERNS = [
  { id: 'direct' as const, label: 'Direct', icon: Zap, description: 'Send to selected agents independently' },
  { id: 'fan-out' as const, label: 'Fan-out', icon: GitBranch, description: 'Split work across agents, merge results' },
  { id: 'pipeline' as const, label: 'Pipeline', icon: ArrowRightLeft, description: 'Chain agents sequentially' },
  { id: 'competitive' as const, label: 'Competitive', icon: Trophy, description: 'All agents compete, best result wins' },
];

export function MultiDispatchDialog({
  open,
  onOpenChange,
  workspaceId,
  onDispatched,
}: MultiDispatchDialogProps) {
  const agents = useAgentTeamStore((s) => s.agents);
  const multiDispatch = useMultiDispatch();

  const [prompt, setPrompt] = useState('');
  const [autoRoute, setAutoRoute] = useState(true);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [pattern, setPattern] = useState<'direct' | 'fan-out' | 'pipeline' | 'competitive'>('direct');

  const toggleAgent = (agentId: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId],
    );
  };

  const handleDispatch = async () => {
    if (!prompt.trim()) return;

    const record = await multiDispatch.mutateAsync({
      wsId: workspaceId,
      prompt: prompt.trim(),
      autoRoute,
      agentIds: autoRoute ? undefined : selectedAgents,
      orchestrationPattern: pattern,
    });

    onDispatched?.(record.dispatchId);
    onOpenChange(false);
    setPrompt('');
    setSelectedAgents([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Multi-Agent Dispatch</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Prompt */}
          <div>
            <Label>Task Prompt</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the task for your agents..."
              className="mt-1.5 min-h-[80px]"
            />
          </div>

          {/* Orchestration pattern */}
          <div>
            <Label className="mb-2 block">Orchestration Pattern</Label>
            <div className="grid grid-cols-2 gap-2">
              {PATTERNS.map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.id}
                    className={cn(
                      'flex items-start gap-2 p-3 rounded-lg border text-left transition-colors',
                      pattern === p.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-accent/30',
                    )}
                    onClick={() => setPattern(p.id)}
                  >
                    <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-sm font-medium">{p.label}</span>
                      <p className="text-[10px] text-muted-foreground">{p.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Agent selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Agent Selection</Label>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Auto-route</Label>
                <Switch checked={autoRoute} onCheckedChange={setAutoRoute} />
              </div>
            </div>

            {!autoRoute && (
              <div className="space-y-1 max-h-40 overflow-y-auto border rounded-lg p-2">
                {agents.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    No agents in workspace
                  </p>
                ) : (
                  agents.map((agent) => (
                    <AgentCheckbox
                      key={agent.agentId}
                      agent={agent}
                      checked={selectedAgents.includes(agent.agentId)}
                      onToggle={() => toggleAgent(agent.agentId)}
                    />
                  ))
                )}
              </div>
            )}
          </div>

          <Button
            onClick={handleDispatch}
            disabled={!prompt.trim() || multiDispatch.isPending || (!autoRoute && selectedAgents.length === 0)}
            className="w-full"
          >
            {multiDispatch.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            Dispatch to {autoRoute ? 'Auto-selected' : `${selectedAgents.length}`} Agent{selectedAgents.length !== 1 ? 's' : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AgentCheckbox({
  agent,
  checked,
  onToggle,
}: {
  agent: AgentTeamMember;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-accent/30 rounded-md cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={onToggle} />
      <span className="text-sm">{agent.name}</span>
      <span className="text-[10px] text-muted-foreground ml-auto">{agent.platform}</span>
    </label>
  );
}
