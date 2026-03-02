'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Hash, Plus, Settings, BarChart3, MessageSquare, Lock, Users, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useChannelStore, type Channel } from '@/stores/channel-store';
import { useAgentTeamStore } from '@/stores/agent-team-store';
import { useDeleteChannel } from '@/hooks/channels/use-channels';
import { CreateChannelDialog } from './create-channel-dialog';

interface ChannelSidebarProps {
  workspaceId: string;
  workspaceName: string;
}

export function ChannelSidebar({ workspaceId, workspaceName }: ChannelSidebarProps) {
  const router = useRouter();
  const params = useParams();
  const activeChannelId = params.channelId as string | undefined;

  const channels = useChannelStore((s) => s.channels);
  const unreadCounts = useChannelStore((s) => s.unreadCounts);
  const agents = useAgentTeamStore((s) => s.agents);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Channel | null>(null);
  const deleteChannel = useDeleteChannel();

  const publicChannels = channels.filter((ch) => ch.scope === 'public');
  const agentChannels = channels.filter((ch) => ch.scope === 'agent-to-agent');
  const directChannels = channels.filter((ch) => ch.scope === 'direct');

  const navigateToChannel = (channelId: string) => {
    router.push(`/workspaces/${workspaceId}/channels/${channelId}`);
  };

  return (
    <div className="w-64 border-r bg-card/50 flex flex-col h-full shrink-0">
      {/* Workspace header */}
      <div className="p-4 border-b">
        <h2 className="font-semibold text-sm truncate">{workspaceName}</h2>
        <div className="flex items-center gap-1 mt-1">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-xs text-muted-foreground">
            {agents.filter((a) => a.status !== 'offline').length} online
          </span>
        </div>
      </div>

      {/* Navigation */}
      <div className="p-2 space-y-0.5 border-b">
        <button
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-accent/50 w-full"
          onClick={() => router.push(`/workspaces/${workspaceId}`)}
        >
          <MessageSquare className="h-4 w-4" />
          General
        </button>
        <button
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-accent/50 w-full"
          onClick={() => router.push(`/workspaces/${workspaceId}/mission-control`)}
        >
          <BarChart3 className="h-4 w-4" />
          Mission Control
        </button>
        <button
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-accent/50 w-full"
          onClick={() => router.push(`/workspaces/${workspaceId}/settings`)}
        >
          <Settings className="h-4 w-4" />
          Settings
        </button>
      </div>

      {/* Channels */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* Public channels */}
        <ChannelSection
          title="Channels"
          channels={publicChannels}
          activeId={activeChannelId}
          unreadCounts={unreadCounts}
          onSelect={navigateToChannel}
          onDelete={(ch) => setDeleteTarget(ch)}
          icon={<Hash className="h-3.5 w-3.5" />}
          onAddClick={() => setCreateOpen(true)}
        />

        {/* Agent-to-agent channels */}
        {agentChannels.length > 0 && (
          <ChannelSection
            title="Agent Channels"
            channels={agentChannels}
            activeId={activeChannelId}
            unreadCounts={unreadCounts}
            onSelect={navigateToChannel}
            onDelete={(ch) => setDeleteTarget(ch)}
            icon={<Users className="h-3.5 w-3.5" />}
            onAddClick={() => setCreateOpen(true)}
          />
        )}

        {/* Direct messages */}
        {directChannels.length > 0 && (
          <ChannelSection
            title="Direct Messages"
            channels={directChannels}
            activeId={activeChannelId}
            unreadCounts={unreadCounts}
            onSelect={navigateToChannel}
            onDelete={(ch) => setDeleteTarget(ch)}
            icon={<Lock className="h-3.5 w-3.5" />}
          />
        )}

        {/* Online agents */}
        <div className="mt-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-1">
            Agents
          </h3>
          {agents.length === 0 ? (
            <p className="text-xs text-muted-foreground px-3 py-1">No agents yet</p>
          ) : (
            agents.map((agent) => (
              <div
                key={agent.agentId}
                className="flex items-center gap-2 px-3 py-1 text-sm"
              >
                <div
                  className={cn(
                    'h-2 w-2 rounded-full',
                    agent.status === 'online' && 'bg-green-500',
                    agent.status === 'working' && 'bg-blue-500 animate-pulse',
                    agent.status === 'idle' && 'bg-yellow-500',
                    agent.status === 'error' && 'bg-red-500',
                    agent.status === 'offline' && 'bg-gray-400',
                  )}
                />
                <span className="truncate text-muted-foreground">{agent.name}</span>
                {agent.status === 'working' && (
                  <span className="text-[10px] text-blue-500 ml-auto shrink-0">working</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Create channel dialog */}
      <CreateChannelDialog
        workspaceId={workspaceId}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      {/* Delete channel confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Channel</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-semibold">#{deleteTarget?.name}</span>?
              This will permanently remove the channel and all its messages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  deleteChannel.mutate(
                    { channelId: deleteTarget.id, workspaceId },
                    {
                      onSuccess: () => {
                        // If we were viewing the deleted channel, navigate away
                        if (activeChannelId === deleteTarget.id) {
                          router.push(`/workspaces/${workspaceId}`);
                        }
                        setDeleteTarget(null);
                      },
                    },
                  );
                }
              }}
              disabled={deleteChannel.isPending}
            >
              {deleteChannel.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ChannelSection({
  title,
  channels,
  activeId,
  unreadCounts,
  onSelect,
  onDelete,
  icon,
  onAddClick,
}: {
  title: string;
  channels: Channel[];
  activeId?: string;
  unreadCounts: Record<string, number>;
  onSelect: (id: string) => void;
  onDelete?: (channel: Channel) => void;
  icon: React.ReactNode;
  onAddClick?: () => void;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between px-3 mb-0.5">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </h3>
        {onAddClick && (
          <button
            onClick={onAddClick}
            className="text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {channels.map((ch) => {
        const unread = unreadCounts[ch.id] ?? 0;
        const isGeneral = ch.name === 'general';
        return (
          <div
            key={ch.id}
            className={cn(
              'group flex items-center gap-2 px-3 py-1 rounded-md text-sm w-full hover:bg-accent/50 transition-colors',
              activeId === ch.id && 'bg-accent text-accent-foreground',
              unread > 0 && 'font-medium',
            )}
          >
            <button
              className="flex items-center gap-2 flex-1 min-w-0"
              onClick={() => onSelect(ch.id)}
            >
              {icon}
              <span className="truncate">{ch.name}</span>
            </button>
            {unread > 0 && (
              <span className="text-[10px] bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 min-w-[18px] text-center shrink-0">
                {unread}
              </span>
            )}
            {!isGeneral && onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(ch);
                }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
                title={`Delete #${ch.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
