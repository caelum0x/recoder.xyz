/**
 * MessageThread - Support for conversation threads and message hierarchy
 *
 * Features:
 * - Nested reply threads
 * - Branch conversations
 * - Thread collapse/expand
 * - Thread navigation
 */

import { memo, useState, useCallback, useMemo } from 'react';
import { atom, map } from 'nanostores';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';

// Types
export interface ThreadMessage {
  id: string;
  parentId: string | null;
  content: string;
  role: 'user' | 'assistant';
  createdAt: Date;
  threadId?: string;
  replyCount?: number;
  isThreadRoot?: boolean;
}

export interface Thread {
  id: string;
  rootMessageId: string;
  messages: ThreadMessage[];
  isCollapsed: boolean;
  depth: number;
}

// Thread store using nanostores
export const threadStore = map<{
  threads: Record<string, Thread>;
  activeThreadId: string | null;
  expandedThreads: Set<string>;
}>({
  threads: {},
  activeThreadId: null,
  expandedThreads: new Set(),
});

// Thread actions
export const threadActions = {
  createThread: (rootMessage: ThreadMessage): string => {
    const threadId = `thread_${Date.now()}`;
    const thread: Thread = {
      id: threadId,
      rootMessageId: rootMessage.id,
      messages: [rootMessage],
      isCollapsed: false,
      depth: 0,
    };

    threadStore.setKey('threads', {
      ...threadStore.get().threads,
      [threadId]: thread,
    });

    return threadId;
  },

  addReply: (threadId: string, message: ThreadMessage): void => {
    const threads = threadStore.get().threads;
    const thread = threads[threadId];
    if (!thread) return;

    threadStore.setKey('threads', {
      ...threads,
      [threadId]: {
        ...thread,
        messages: [...thread.messages, message],
      },
    });
  },

  toggleThread: (threadId: string): void => {
    const threads = threadStore.get().threads;
    const thread = threads[threadId];
    if (!thread) return;

    threadStore.setKey('threads', {
      ...threads,
      [threadId]: {
        ...thread,
        isCollapsed: !thread.isCollapsed,
      },
    });
  },

  setActiveThread: (threadId: string | null): void => {
    threadStore.setKey('activeThreadId', threadId);
  },

  expandThread: (threadId: string): void => {
    const expanded = new Set(threadStore.get().expandedThreads);
    expanded.add(threadId);
    threadStore.setKey('expandedThreads', expanded);
  },

  collapseThread: (threadId: string): void => {
    const expanded = new Set(threadStore.get().expandedThreads);
    expanded.delete(threadId);
    threadStore.setKey('expandedThreads', expanded);
  },
};

// Thread indicator component
interface ThreadIndicatorProps {
  replyCount: number;
  isExpanded: boolean;
  onToggle: () => void;
}

export const ThreadIndicator = memo(function ThreadIndicator({
  replyCount,
  isExpanded,
  onToggle,
}: ThreadIndicatorProps) {
  if (replyCount === 0) return null;

  return (
    <button
      onClick={onToggle}
      className={classNames(
        'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs',
        'transition-colors duration-150',
        'hover:bg-bolt-elements-background-depth-3',
        isExpanded
          ? 'text-blue-400 bg-blue-500/10'
          : 'text-bolt-elements-textSecondary'
      )}
    >
      <div className={classNames(
        'transition-transform duration-200',
        isExpanded ? 'i-ph:caret-down' : 'i-ph:caret-right'
      )} />
      <div className="i-ph:chat-circle-dots" />
      <span>{replyCount} {replyCount === 1 ? 'reply' : 'replies'}</span>
    </button>
  );
});

// Reply button component
interface ReplyButtonProps {
  onReply: () => void;
  className?: string;
}

export const ReplyButton = memo(function ReplyButton({
  onReply,
  className,
}: ReplyButtonProps) {
  return (
    <button
      onClick={onReply}
      className={classNames(
        'flex items-center gap-1 px-2 py-1 rounded-md text-xs',
        'text-bolt-elements-textTertiary',
        'hover:text-bolt-elements-textSecondary',
        'hover:bg-bolt-elements-background-depth-3',
        'transition-colors duration-150',
        className
      )}
      title="Reply to this message"
    >
      <div className="i-ph:arrow-bend-up-left" />
      <span>Reply</span>
    </button>
  );
});

// Thread line connector
interface ThreadLineProps {
  depth: number;
  isLast: boolean;
}

export const ThreadLine = memo(function ThreadLine({
  depth,
  isLast,
}: ThreadLineProps) {
  if (depth === 0) return null;

  return (
    <div className="absolute left-0 top-0 bottom-0 flex">
      {Array.from({ length: depth }).map((_, i) => (
        <div
          key={i}
          className={classNames(
            'w-6 relative',
            i < depth - 1 && 'border-l border-bolt-elements-borderColor ml-3'
          )}
        >
          {i === depth - 1 && (
            <div
              className={classNames(
                'absolute left-0 top-6 w-4 border-l border-b border-bolt-elements-borderColor ml-3',
                isLast ? 'h-0 rounded-bl' : 'h-full'
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
});

// Single thread message
interface ThreadMessageItemProps {
  message: ThreadMessage;
  depth: number;
  isLast: boolean;
  onReply?: (messageId: string) => void;
  children?: React.ReactNode;
}

export const ThreadMessageItem = memo(function ThreadMessageItem({
  message,
  depth,
  isLast,
  onReply,
  children,
}: ThreadMessageItemProps) {
  const isUser = message.role === 'user';

  return (
    <div className={classNames('relative', depth > 0 && 'pl-6')}>
      <ThreadLine depth={depth} isLast={isLast} />

      <div
        className={classNames(
          'relative p-3 rounded-lg',
          'transition-colors duration-150',
          isUser
            ? 'bg-bolt-elements-messages-background ml-auto max-w-[80%]'
            : 'bg-bolt-elements-background-depth-2'
        )}
      >
        {/* Message header */}
        <div className="flex items-center gap-2 mb-1 text-xs text-bolt-elements-textTertiary">
          <span className={isUser ? 'text-blue-400' : 'text-orange-400'}>
            {isUser ? 'You' : 'Assistant'}
          </span>
          <span>
            {message.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* Message content */}
        <div className="text-bolt-elements-textPrimary text-sm">
          {message.content}
        </div>

        {/* Thread actions */}
        <div className="flex items-center gap-2 mt-2">
          {onReply && (
            <ReplyButton onReply={() => onReply(message.id)} />
          )}
          {message.replyCount !== undefined && message.replyCount > 0 && (
            <ThreadIndicator
              replyCount={message.replyCount}
              isExpanded={false}
              onToggle={() => {}}
            />
          )}
        </div>
      </div>

      {/* Child messages */}
      {children}
    </div>
  );
});

// Thread view component
interface ThreadViewProps {
  threadId: string;
  onReply?: (threadId: string, parentMessageId: string) => void;
  onClose?: () => void;
}

export const ThreadView = memo(function ThreadView({
  threadId,
  onReply,
  onClose,
}: ThreadViewProps) {
  const state = useStore(threadStore);
  const thread = state.threads[threadId];

  if (!thread) return null;

  // Build message tree
  const messageTree = useMemo(() => {
    const map = new Map<string | null, ThreadMessage[]>();

    for (const msg of thread.messages) {
      const parentId = msg.parentId;
      if (!map.has(parentId)) {
        map.set(parentId, []);
      }
      map.get(parentId)!.push(msg);
    }

    return map;
  }, [thread.messages]);

  // Render message recursively
  const renderMessage = (message: ThreadMessage, depth: number, isLast: boolean): React.ReactNode => {
    const children = messageTree.get(message.id) || [];

    return (
      <ThreadMessageItem
        key={message.id}
        message={message}
        depth={depth}
        isLast={isLast && children.length === 0}
        onReply={onReply ? (msgId) => onReply(threadId, msgId) : undefined}
      >
        {children.map((child, index) =>
          renderMessage(child, depth + 1, index === children.length - 1)
        )}
      </ThreadMessageItem>
    );
  };

  const rootMessages = messageTree.get(null) || [];

  return (
    <div className="flex flex-col h-full bg-bolt-elements-background-depth-1 rounded-lg border border-bolt-elements-borderColor">
      {/* Thread header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-bolt-elements-borderColor">
        <div className="flex items-center gap-2">
          <div className="i-ph:chat-circle-dots text-bolt-elements-textSecondary" />
          <span className="font-medium text-bolt-elements-textPrimary">Thread</span>
          <span className="text-xs text-bolt-elements-textTertiary">
            {thread.messages.length} messages
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary"
          >
            <div className="i-ph:x text-lg" />
          </button>
        )}
      </div>

      {/* Thread messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {rootMessages.map((message, index) =>
          renderMessage(message, 0, index === rootMessages.length - 1)
        )}
      </div>
    </div>
  );
});

// Thread panel for sidebar view
interface ThreadPanelProps {
  className?: string;
}

export const ThreadPanel = memo(function ThreadPanel({
  className,
}: ThreadPanelProps) {
  const state = useStore(threadStore);
  const activeThreadId = state.activeThreadId;

  const handleClose = useCallback(() => {
    threadActions.setActiveThread(null);
  }, []);

  if (!activeThreadId) return null;

  return (
    <div className={classNames('w-80 border-l border-bolt-elements-borderColor', className)}>
      <ThreadView
        threadId={activeThreadId}
        onClose={handleClose}
      />
    </div>
  );
});

// Hook for thread management
export function useThread(threadId?: string) {
  const state = useStore(threadStore);
  const thread = threadId ? state.threads[threadId] : null;

  const createThread = useCallback((rootMessage: ThreadMessage) => {
    return threadActions.createThread(rootMessage);
  }, []);

  const addReply = useCallback((message: ThreadMessage) => {
    if (threadId) {
      threadActions.addReply(threadId, message);
    }
  }, [threadId]);

  const toggleExpand = useCallback(() => {
    if (threadId) {
      threadActions.toggleThread(threadId);
    }
  }, [threadId]);

  return {
    thread,
    createThread,
    addReply,
    toggleExpand,
    isExpanded: thread ? !thread.isCollapsed : false,
  };
}

export default ThreadView;
