'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Send } from 'lucide-react';
import { useAMBStore } from './amb-store';

export function MessageComposer() {
  const { selectedChannelId, selectedThreadId, agents, sendMessage, fetchAgents } = useAMBStore();
  const [text, setText] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionIdx, setMentionIdx] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const filteredAgents = agents.filter((a) =>
    a.agentId.toLowerCase().includes(mentionFilter.toLowerCase()) ||
    a.name.toLowerCase().includes(mentionFilter.toLowerCase())
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);

    // Detect @mention trigger
    const cursor = e.target.selectionStart;
    const before = val.slice(0, cursor);
    const atMatch = before.match(/@(\w*)$/);

    if (atMatch) {
      setShowMentions(true);
      setMentionFilter(atMatch[1]);
      setMentionIdx(0);
    } else {
      setShowMentions(false);
    }
  }, []);

  const insertMention = useCallback((agentId: string) => {
    const cursor = inputRef.current?.selectionStart ?? text.length;
    const before = text.slice(0, cursor);
    const after = text.slice(cursor);
    const atPos = before.lastIndexOf('@');

    if (atPos >= 0) {
      const newText = before.slice(0, atPos) + `@${agentId} ` + after;
      setText(newText);
    }

    setShowMentions(false);
    inputRef.current?.focus();
  }, [text]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showMentions && filteredAgents.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIdx((i) => Math.min(i + 1, filteredAgents.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredAgents[mentionIdx].agentId);
        return;
      }
      if (e.key === 'Escape') {
        setShowMentions(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [showMentions, filteredAgents, mentionIdx, insertMention]);

  const handleSend = async () => {
    if (!text.trim() || !selectedChannelId || !selectedThreadId) return;
    const content = text.trim();
    setText('');
    await sendMessage(selectedChannelId, selectedThreadId, 'studio-user', content);
  };

  const disabled = !selectedChannelId || !selectedThreadId;

  return (
    <div className="relative border-t border-zinc-800 p-3">
      {showMentions && filteredAgents.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 mb-1 bg-zinc-900 border border-zinc-700 rounded-md shadow-lg max-h-40 overflow-y-auto">
          {filteredAgents.map((agent, i) => (
            <button
              key={agent.agentId}
              onClick={() => insertMention(agent.agentId)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                i === mentionIdx ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800/50'
              }`}
            >
              <span className="font-medium text-zinc-200">@{agent.agentId}</span>
              <span className="text-zinc-500">{agent.name}</span>
              <span className="ml-auto text-[10px] text-zinc-600">{agent.platform}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? 'Select a channel and thread first' : 'Type a message... (@mention agents)'}
          rows={1}
          className="flex-1 resize-none px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-md text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
          style={{ minHeight: '36px', maxHeight: '120px' }}
        />
        <button
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          className="p-2 rounded-md bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-200 transition-colors"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
