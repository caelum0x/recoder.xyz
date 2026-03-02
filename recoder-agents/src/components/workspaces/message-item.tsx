'use client';

import { memo, useState } from 'react';
import { MessageSquare, ArrowRight, ShieldCheck, ChevronDown, ChevronRight, FileDown, FileCode } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { ChannelMessage } from '@/stores/channel-store';

const PLATFORM_COLORS: Record<string, string> = {
  claude_code: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  codex: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cursor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  windsurf: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  replit: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  recoder_web: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  custom: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

const PLATFORM_LABELS: Record<string, string> = {
  claude_code: 'Claude',
  codex: 'Codex',
  cursor: 'Cursor',
  windsurf: 'Windsurf',
  replit: 'Replit',
  recoder_web: 'Recoder',
  custom: 'Agent',
};

const TASK_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

interface Artifact {
  type: 'image' | 'code' | 'file';
  url?: string;
  filename?: string;
  language?: string;
  content?: string;
}

interface MessageItemProps {
  message: ChannelMessage;
  isCompact?: boolean;
  onThreadClick?: (messageId: string) => void;
  threadMessages?: ChannelMessage[];
}

export const MessageItem = memo(function MessageItem({
  message,
  isCompact,
  onThreadClick,
  threadMessages,
}: MessageItemProps) {
  const [isThreadOpen, setIsThreadOpen] = useState(false);

  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (message.type === 'system') {
    return (
      <div className="flex items-center gap-2 py-1 px-4">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">{message.text}</span>
        <div className="h-px flex-1 bg-border" />
      </div>
    );
  }

  if (message.type === 'handoff') {
    return (
      <div className="flex items-center gap-2 py-2 px-4 bg-amber-50/50 dark:bg-amber-950/10 rounded-md mx-4 my-1">
        <ArrowRight className="h-4 w-4 text-amber-600" />
        <span className="text-sm text-amber-700 dark:text-amber-400">{message.text}</span>
        <span className="text-xs text-muted-foreground ml-auto">{time}</span>
      </div>
    );
  }

  if (message.type === 'approval') {
    return (
      <div className="flex items-center gap-2 py-2 px-4 bg-blue-50/50 dark:bg-blue-950/10 rounded-md mx-4 my-1">
        <ShieldCheck className="h-4 w-4 text-blue-600" />
        <span className="text-sm text-blue-700 dark:text-blue-400">{message.text}</span>
        <span className="text-xs text-muted-foreground ml-auto">{time}</span>
      </div>
    );
  }

  const platformColor = PLATFORM_COLORS[message.senderPlatform] ?? PLATFORM_COLORS.custom;
  const platformLabel = PLATFORM_LABELS[message.senderPlatform] ?? 'Agent';
  const taskStatus = message.metadata?.taskStatus as string | undefined;
  const taskId = message.metadata?.taskId as string | undefined;
  const artifacts = message.metadata?.artifacts as Artifact[] | undefined;

  const handleThreadToggle = () => {
    if (!isThreadOpen && onThreadClick) {
      onThreadClick(message.id);
    }
    setIsThreadOpen((prev) => !prev);
  };

  return (
    <div className={cn('group px-4 py-1.5 hover:bg-accent/30 transition-colors', isCompact && 'py-0.5')}>
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-xs font-medium shrink-0 mt-0.5">
          {message.senderName.slice(0, 2).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{message.senderName}</span>
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', platformColor)}>
              {platformLabel}
            </span>
            <span className="text-xs text-muted-foreground">{time}</span>
            {/* Task status badge */}
            {taskId && taskStatus && (
              <Badge
                className={cn(
                  'text-[10px] px-1.5 py-0 h-4 rounded-full border-none',
                  TASK_STATUS_COLORS[taskStatus] ?? TASK_STATUS_COLORS.pending,
                )}
              >
                {taskStatus}
              </Badge>
            )}
          </div>

          {/* Content */}
          <div className="text-sm mt-0.5 whitespace-pre-wrap break-words">{message.text}</div>

          {/* Artifacts */}
          {artifacts && artifacts.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {artifacts.map((artifact, idx) => (
                <ArtifactRenderer key={idx} artifact={artifact} />
              ))}
            </div>
          )}

          {/* Thread replies toggle */}
          {message.replyCount != null && message.replyCount > 0 && (
            <button
              onClick={handleThreadToggle}
              className="flex items-center gap-1 text-xs text-primary hover:underline mt-1"
            >
              {isThreadOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <MessageSquare className="h-3 w-3" />
              {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
            </button>
          )}

          {/* Expanded thread replies */}
          {isThreadOpen && threadMessages && threadMessages.length > 0 && (
            <div className="ml-2 mt-1 pl-3 border-l-2 border-muted space-y-1">
              {threadMessages.map((reply) => {
                const replyTime = new Date(reply.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const replyPlatformColor =
                  PLATFORM_COLORS[reply.senderPlatform] ?? PLATFORM_COLORS.custom;
                const replyPlatformLabel =
                  PLATFORM_LABELS[reply.senderPlatform] ?? 'Agent';
                return (
                  <div key={reply.id} className="py-1">
                    <div className="flex items-center gap-1.5">
                      <div className="h-5 w-5 rounded bg-muted flex items-center justify-center text-[9px] font-medium shrink-0">
                        {reply.senderName.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="font-medium text-xs">{reply.senderName}</span>
                      <span
                        className={cn(
                          'text-[9px] px-1 py-0 rounded-full font-medium',
                          replyPlatformColor,
                        )}
                      >
                        {replyPlatformLabel}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{replyTime}</span>
                    </div>
                    <div className="text-xs mt-0.5 whitespace-pre-wrap break-words pl-[26px]">
                      {reply.text}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------
 * Artifact renderers
 * ----------------------------------------------------------------*/

function ArtifactRenderer({ artifact }: { artifact: Artifact }) {
  if (artifact.type === 'image' && artifact.url) {
    return (
      <img
        src={artifact.url}
        alt={artifact.filename ?? 'artifact'}
        className="max-w-[200px] rounded-md border object-cover"
        loading="lazy"
      />
    );
  }

  if (artifact.type === 'code') {
    return (
      <div className="w-full max-w-md rounded-md border bg-muted/50 overflow-hidden">
        {artifact.filename && (
          <div className="flex items-center gap-1.5 px-3 py-1 border-b bg-muted text-xs text-muted-foreground">
            <FileCode className="h-3 w-3" />
            <span>{artifact.filename}</span>
            {artifact.language && (
              <span className="ml-auto text-[10px] opacity-60">{artifact.language}</span>
            )}
          </div>
        )}
        <pre className="p-3 text-xs overflow-x-auto">
          <code>{artifact.content ?? ''}</code>
        </pre>
      </div>
    );
  }

  if (artifact.type === 'file' && artifact.url) {
    return (
      <a
        href={artifact.url}
        download={artifact.filename}
        className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/30 hover:bg-muted/60 transition-colors text-xs"
      >
        <FileDown className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="truncate">{artifact.filename ?? 'Download file'}</span>
      </a>
    );
  }

  return null;
}
