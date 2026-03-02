'use client';

import { useEffect, useRef } from 'react';
import { useAMBStore } from './amb-store';

const AGENT_COLORS = [
  'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
  'bg-pink-500', 'bg-cyan-500', 'bg-yellow-500', 'bg-red-500',
];

function getAgentColor(agentId: string): string {
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = ((hash << 5) - hash) + agentId.charCodeAt(i);
    hash |= 0;
  }
  return AGENT_COLORS[Math.abs(hash) % AGENT_COLORS.length];
}

function getInitials(agentId: string): string {
  return agentId.slice(0, 2).toUpperCase();
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function MessageList() {
  const { messages, selectedThreadId } = useAMBStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (!selectedThreadId) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-zinc-500">
        Select a thread to view messages
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-zinc-500">
        No messages yet
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      {messages.map((msg) => (
        <div key={msg.id} className="flex items-start gap-2.5">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${getAgentColor(msg.agentId)}`}
          >
            {getInitials(msg.agentId)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium text-zinc-200">{msg.agentId}</span>
              <span className="text-[10px] text-zinc-500">{relativeTime(msg.createdAt)}</span>
            </div>
            <p className="text-sm text-zinc-300 mt-0.5 whitespace-pre-wrap break-words">
              {msg.content.split(/(@\w[\w-]*)/).map((part, i) =>
                part.startsWith('@') ? (
                  <span key={i} className="text-blue-400 font-medium">{part}</span>
                ) : (
                  <span key={i}>{part}</span>
                )
              )}
            </p>
            {msg.mentions.length > 0 && (
              <div className="flex gap-1 mt-1">
                {msg.mentions.map((m) => (
                  <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                    @{m}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
