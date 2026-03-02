'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Hash, Loader2, ChevronUp, AlertTriangle, X } from 'lucide-react';
import { useChannelMessages } from '@/hooks/channels/use-channels';
import { useChannelSSE } from '@/hooks/channels/use-channel-sse';
import { useChannelStore, type ChannelMessage } from '@/stores/channel-store';
import { useWorkspaceSSEConflicts } from '@/hooks/channels/use-workspace-sse-conflicts';
import { dockerBackendApi } from '@/lib/docker-backend-api';
import { MessageItem } from './message-item';
import { TaskDispatchInput } from './task-dispatch-input';

interface ConflictWarning {
  id: string;
  files: string[];
  agentA: string;
  agentB: string;
  timestamp: string;
}

const VISIBLE_MESSAGE_LIMIT = 200;

interface ChannelViewProps {
  channelId: string | null;
  channelName: string;
  workspaceId: string;
}

export function ChannelView({ channelId, channelName, workspaceId }: ChannelViewProps) {
  const { isLoading } = useChannelMessages(channelId);
  useChannelSSE(channelId);
  const allMessages = useChannelStore((s) => (channelId ? s.messages[channelId] ?? [] : []));
  const clearUnread = useChannelStore((s) => s.clearUnread);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showAll, setShowAll] = useState(false);
  const [threadReplies, setThreadReplies] = useState<Record<string, ChannelMessage[]>>({});
  const wasNearBottomRef = useRef(true);
  const [conflictWarnings, setConflictWarnings] = useState<ConflictWarning[]>([]);

  // Handle worktree conflict events from workspace SSE
  const handleConflictEvent = useCallback((event: Record<string, unknown>) => {
    const data = event.data as Record<string, unknown> | undefined;
    if (!data) return;

    const warning: ConflictWarning = {
      id: (event.id as string) ?? `conflict_${Date.now()}`,
      files: (data.files as string[]) ?? [],
      agentA: (data.agentA as string) ?? (data.sourceAgent as string) ?? 'unknown',
      agentB: (data.agentB as string) ?? (data.targetAgent as string) ?? 'unknown',
      timestamp: (event.timestamp as string) ?? new Date().toISOString(),
    };

    setConflictWarnings((prev) => [...prev, warning]);
  }, []);

  useWorkspaceSSEConflicts(workspaceId, handleConflictEvent);

  const dismissConflict = useCallback((id: string) => {
    setConflictWarnings((prev) => prev.filter((w) => w.id !== id));
  }, []);

  // Determine visible messages: last N unless "show all" is toggled
  const hasMore = allMessages.length > VISIBLE_MESSAGE_LIMIT && !showAll;
  const visibleMessages = useMemo(() => {
    if (showAll || allMessages.length <= VISIBLE_MESSAGE_LIMIT) return allMessages;
    return allMessages.slice(-VISIBLE_MESSAGE_LIMIT);
  }, [allMessages, showAll]);

  // Clear unread when viewing channel
  useEffect(() => {
    if (channelId) clearUnread(channelId);
  }, [channelId, clearUnread]);

  // Track whether user is near the bottom of the scroll container
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const threshold = 80; // px from bottom
    wasNearBottomRef.current =
      container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  }, []);

  // Auto-scroll to bottom on new messages only if user was already near bottom
  useEffect(() => {
    if (wasNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [allMessages.length]);

  // Reset showAll and conflicts when channel changes
  useEffect(() => {
    setShowAll(false);
    setThreadReplies({});
    setConflictWarnings([]);
  }, [channelId]);

  // Fetch thread replies for a given message
  const handleThreadClick = useCallback(
    async (messageId: string) => {
      if (!channelId) return;
      // Only fetch if not already loaded
      if (threadReplies[messageId]) return;
      try {
        const res = await dockerBackendApi.get<{ messages: ChannelMessage[] }>(
          `/api/a2a/channels/${channelId}/threads/${messageId}/messages`,
        );
        if (res.success && res.data) {
          setThreadReplies((prev) => ({ ...prev, [messageId]: res.data!.messages }));
        }
      } catch {
        // Silently fail - thread won't expand
      }
    },
    [channelId, threadReplies],
  );

  if (!channelId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Select a channel to start
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Channel header */}
      <div className="border-b px-6 py-3 flex items-center gap-2 shrink-0">
        <Hash className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-medium text-sm">{channelName}</h2>
      </div>

      {/* Conflict warnings */}
      {conflictWarnings.length > 0 && (
        <div className="px-4 pt-2 space-y-1.5 shrink-0">
          {conflictWarnings.map((warning) => (
            <div
              key={warning.id}
              className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2"
            >
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  Merge conflict detected
                </p>
                <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-0.5">
                  {warning.files.length > 0
                    ? warning.files.join(', ')
                    : 'files'}{' '}
                  between <span className="font-medium">{warning.agentA}</span> and{' '}
                  <span className="font-medium">{warning.agentB}</span>
                </p>
              </div>
              <button
                onClick={() => dismissConflict(warning.id)}
                className="text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto py-2"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : allMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <Hash className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <h3 className="text-sm font-medium">Welcome to #{channelName}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              This is the start of the channel. Dispatch a task or send a message to get started.
            </p>
          </div>
        ) : (
          <>
            {/* Load earlier messages button */}
            {hasMore && (
              <div className="flex justify-center py-2">
                <button
                  onClick={() => setShowAll(true)}
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 hover:bg-accent/40 px-3 py-1.5 rounded-md transition-colors"
                >
                  <ChevronUp className="h-3 w-3" />
                  Load earlier messages ({allMessages.length - VISIBLE_MESSAGE_LIMIT} hidden)
                </button>
              </div>
            )}
            {visibleMessages.map((msg) => (
              <MessageItem
                key={msg.id}
                message={msg}
                onThreadClick={handleThreadClick}
                threadMessages={threadReplies[msg.id]}
              />
            ))}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-4 shrink-0">
        <TaskDispatchInput
          channelId={channelId}
          workspaceId={workspaceId}
          placeholder={`Message #${channelName}`}
        />
      </div>
    </div>
  );
}
