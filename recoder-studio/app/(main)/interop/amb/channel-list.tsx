'use client';

import { useEffect, useState } from 'react';
import { Hash, Plus, Users } from 'lucide-react';
import { useAMBStore } from './amb-store';

export function ChannelList() {
  const { channels, selectedChannelId, fetchChannels, selectChannel, createChannel } = useAMBStore();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createChannel(newName.trim(), newDesc.trim() || undefined);
    setNewName('');
    setNewDesc('');
    setShowCreate(false);
  };

  return (
    <div className="flex flex-col h-full border-r border-zinc-800">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Channels</span>
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
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Channel name"
            className="w-full px-2 py-1 text-xs bg-zinc-900 border border-zinc-700 rounded text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <input
            type="text"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            className="w-full px-2 py-1 text-xs bg-zinc-900 border border-zinc-700 rounded text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="w-full px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded text-zinc-200 transition-colors"
          >
            Create
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {channels.length === 0 && (
          <div className="px-3 py-4 text-xs text-zinc-500 text-center">
            No channels yet
          </div>
        )}
        {channels.map((ch) => (
          <button
            key={ch.id}
            onClick={() => selectChannel(ch.id)}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
              selectedChannelId === ch.id
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
            }`}
          >
            <Hash size={14} className="shrink-0" />
            <span className="truncate flex-1">{ch.name}</span>
            <span className="flex items-center gap-0.5 text-xs text-zinc-500">
              <Users size={10} />
              {ch.memberCount}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
