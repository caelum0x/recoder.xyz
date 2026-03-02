'use client';

import { useState } from 'react';
import { MessageSquare, Plus } from 'lucide-react';
import { useAMBStore } from './amb-store';

export function ThreadView() {
  const { threads, selectedChannelId, selectedThreadId, selectThread, createThread } = useAMBStore();
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const handleCreate = async () => {
    if (!newTitle.trim() || !selectedChannelId) return;
    await createThread(selectedChannelId, newTitle.trim());
    setNewTitle('');
    setShowCreate(false);
  };

  if (!selectedChannelId) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-zinc-500">
        Select a channel
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full border-r border-zinc-800">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Threads</span>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>

      {showCreate && (
        <div className="p-2 border-b border-zinc-800 space-y-1.5">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Thread title"
            className="w-full px-2 py-1 text-xs bg-zinc-900 border border-zinc-700 rounded text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button
            onClick={handleCreate}
            disabled={!newTitle.trim()}
            className="w-full px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded text-zinc-200 transition-colors"
          >
            Create Thread
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {threads.length === 0 && (
          <div className="px-3 py-4 text-xs text-zinc-500 text-center">
            No threads yet
          </div>
        )}
        {threads.map((t) => (
          <button
            key={t.id}
            onClick={() => selectThread(t.id)}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
              selectedThreadId === t.id
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
            }`}
          >
            <MessageSquare size={14} className="shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="truncate">{t.title}</div>
              <div className="text-[10px] text-zinc-500">
                {t.messageCount} message{t.messageCount !== 1 ? 's' : ''}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
