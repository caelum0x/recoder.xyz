'use client';

import { useState, useRef, type KeyboardEvent } from 'react';
import { Send, ChevronDown, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { useAgentTeamStore } from '@/stores/agent-team-store';
import { useDispatchTask } from '@/hooks/tasks/use-task-dispatch';
import { MentionAutocomplete } from './mention-autocomplete';

interface TaskDispatchInputProps {
  channelId: string;
  workspaceId: string;
  placeholder?: string;
}

type RoutingMode = 'auto' | string;
type OrchestrationPattern = 'direct' | 'fan-out' | 'pipeline' | 'competitive';

export function TaskDispatchInput({ channelId, workspaceId, placeholder }: TaskDispatchInputProps) {
  const [text, setText] = useState('');
  const [routingMode, setRoutingMode] = useState<RoutingMode>('auto');
  const [pattern, setPattern] = useState<OrchestrationPattern>('direct');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dispatchTask = useDispatchTask();
  const agents = useAgentTeamStore((s) => s.agents);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    await dispatchTask.mutateAsync({
      prompt: trimmed,
      agentId: routingMode === 'auto' ? undefined : routingMode,
      workspaceId,
      metadata: { channelId, orchestrationPattern: pattern },
    });

    setText('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }

    if (e.key === '@') {
      setShowMentions(true);
      setMentionQuery('');
    }
  };

  const handleInput = (value: string) => {
    setText(value);

    // Track @ mentions
    const lastAt = value.lastIndexOf('@');
    if (lastAt >= 0 && showMentions) {
      setMentionQuery(value.slice(lastAt + 1));
    } else {
      setShowMentions(false);
    }
  };

  const handleMentionSelect = (agentId: string, agentName: string) => {
    const lastAt = text.lastIndexOf('@');
    if (lastAt >= 0) {
      setText(text.slice(0, lastAt) + `@${agentName} `);
    }
    setShowMentions(false);
    textareaRef.current?.focus();
  };

  const selectedAgentName =
    routingMode === 'auto'
      ? 'Auto-route'
      : agents.find((a) => a.agentId === routingMode)?.name ?? routingMode;

  return (
    <div className="relative">
      {/* Mention autocomplete */}
      {showMentions && (
        <div className="absolute bottom-full left-0 mb-1 w-64 z-10">
          <MentionAutocomplete
            query={mentionQuery}
            onSelect={handleMentionSelect}
            onClose={() => setShowMentions(false)}
          />
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? 'Dispatch a task or send a message...'}
            className="min-h-[40px] max-h-[200px] resize-none pr-24 text-sm"
            rows={1}
          />
          <div className="absolute right-2 bottom-1.5 flex items-center gap-1">
            {/* Agent selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground">
                  <Zap className="h-3 w-3 mr-1" />
                  {selectedAgentName}
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs">Route to</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setRoutingMode('auto')}>
                  Auto-route (recommended)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {agents.map((agent) => (
                  <DropdownMenuItem
                    key={agent.agentId}
                    onClick={() => setRoutingMode(agent.agentId)}
                  >
                    <span className="truncate">{agent.name}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{agent.platform}</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Pattern</DropdownMenuLabel>
                {(['direct', 'fan-out', 'pipeline', 'competitive'] as const).map((p) => (
                  <DropdownMenuItem
                    key={p}
                    onClick={() => setPattern(p)}
                    className={pattern === p ? 'bg-accent' : ''}
                  >
                    {p}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Button
          size="icon"
          onClick={handleSend}
          disabled={!text.trim() || dispatchTask.isPending}
          className="h-10 w-10 shrink-0"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
