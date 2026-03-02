'use client';

import { useInteropEnabled } from '../use-interop-enabled';
import { ChannelList } from './channel-list';
import { ThreadView } from './thread-view';
import { MessageList } from './message-list';
import { MessageComposer } from './message-composer';
import { useAMBStore } from './amb-store';
import { useEffect } from 'react';
import { Radio } from 'lucide-react';

export function AMBPanel() {
  const { enabled } = useInteropEnabled();
  const { selectedChannelId, selectedThreadId, disconnectSSE } = useAMBStore();

  useEffect(() => {
    return () => {
      disconnectSSE();
    };
  }, [disconnectSSE]);

  if (!enabled) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <Radio className="mx-auto text-zinc-600" size={32} />
          <p className="text-sm text-zinc-500">Agent Messaging Bus</p>
          <p className="text-xs text-zinc-600">Coming soon. Enable the interop feature flag to access.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-zinc-950">
      {/* Channel sidebar */}
      <div className="w-48 shrink-0">
        <ChannelList />
      </div>

      {/* Thread sidebar */}
      <div className="w-52 shrink-0">
        <ThreadView />
      </div>

      {/* Messages area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800">
          <Radio size={14} className="text-green-500" />
          <span className="text-xs font-medium text-zinc-300">
            {selectedChannelId && selectedThreadId
              ? 'Live'
              : selectedChannelId
                ? 'Select a thread'
                : 'Agent Messaging Bus'
            }
          </span>
        </div>

        {/* Message list */}
        <div className="flex-1 overflow-hidden">
          <MessageList />
        </div>

        {/* Composer */}
        <MessageComposer />
      </div>
    </div>
  );
}
