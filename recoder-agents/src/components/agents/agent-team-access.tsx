'use client';

import { useState } from 'react';
import { Users, X, Crown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAgentTeam, useShareAgent, useRemoveAgentAccess } from '@/hooks/agents/use-agent-team';

interface AgentTeamAccessProps {
  agentId: string;
  ownerId?: string;
}

const roleBadgeClass = (role: string) => {
  switch (role) {
    case 'admin':
      return 'bg-purple-500/15 text-purple-600 dark:text-purple-400';
    case 'editor':
      return 'bg-blue-500/15 text-blue-600 dark:text-blue-400';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

export function AgentTeamAccess({ agentId, ownerId }: AgentTeamAccessProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'user' | 'editor' | 'admin'>('user');
  const { data: team, isLoading } = useAgentTeam(agentId);
  const shareAgent = useShareAgent();
  const removeAccess = useRemoveAgentAccess();

  const handleShare = () => {
    if (!email.trim()) return;
    shareAgent.mutate(
      { agentId, email: email.trim(), role },
      { onSuccess: () => setEmail('') },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleShare();
    }
  };

  return (
    <div className="space-y-4">
      {/* Share input */}
      <div className="flex items-center gap-2">
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 h-9 rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring/30 min-w-0"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'user' | 'editor' | 'admin')}
          className="h-9 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-ring cursor-pointer"
        >
          <option value="user">User</option>
          <option value="editor">Editor</option>
          <option value="admin">Admin</option>
        </select>
        <button
          onClick={handleShare}
          disabled={!email.trim() || shareAgent.isPending}
          className={cn(
            'h-9 px-4 rounded-lg text-sm font-medium transition-all active:scale-[0.98] shrink-0',
            'bg-foreground text-background hover:bg-foreground/90',
            'disabled:opacity-40 disabled:pointer-events-none',
          )}
        >
          {shareAgent.isPending ? 'Sharing...' : 'Share'}
        </button>
      </div>

      {/* Team list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-14 rounded-full ml-auto" />
            </div>
          ))}
        </div>
      ) : !team || team.length === 0 ? (
        <div className="py-8 text-center">
          <Users className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">No team members yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Share this agent with others by entering their email above
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {team.map((member) => {
            const isOwner = ownerId && member.user_id === ownerId;
            return (
              <div
                key={member.id}
                className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/40 group"
              >
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <span className="text-xs font-medium uppercase">
                    {(member.email || member.user_id)?.[0] || '?'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{member.email || member.user_id}</p>
                </div>
                {isOwner && (
                  <div className="flex items-center gap-1 text-amber-500 shrink-0">
                    <Crown className="h-3 w-3" />
                    <span className="text-[10px] font-medium">Owner</span>
                  </div>
                )}
                <span
                  className={cn(
                    'text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0',
                    roleBadgeClass(member.role),
                  )}
                >
                  {member.role}
                </span>
                {!isOwner && (
                  <button
                    onClick={() =>
                      removeAccess.mutate({ agentId: member.agent_id, accessId: member.id })
                    }
                    className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-1 rounded hover:bg-muted"
                    title="Remove access"
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
