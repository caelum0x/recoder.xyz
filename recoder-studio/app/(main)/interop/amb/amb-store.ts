/**
 * @module amb-store
 *
 * Zustand store for Agent Messaging Bus state management.
 */

import { create } from 'zustand';

const API_BASE = process.env.NEXT_PUBLIC_DOCKER_BACKEND_URL || 'http://localhost:7777';

export interface AMBChannel {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  memberCount: number;
  createdAt: string;
}

export interface AMBThread {
  id: string;
  channelId: string;
  title: string;
  createdBy: string;
  messageCount: number;
  createdAt: string;
}

export interface AMBMessage {
  id: string;
  threadId: string;
  agentId: string;
  content: string;
  mentions: string[];
  createdAt: string;
}

export interface AMBAgent {
  agentId: string;
  name: string;
  platform: string;
  status?: string;
}

interface AMBState {
  channels: AMBChannel[];
  selectedChannelId: string | null;
  threads: AMBThread[];
  selectedThreadId: string | null;
  messages: AMBMessage[];
  agents: AMBAgent[];
  loading: boolean;
  error: string | null;
  sseSource: EventSource | null;

  fetchChannels: () => Promise<void>;
  fetchThreads: (channelId: string) => Promise<void>;
  fetchMessages: (channelId: string, threadId: string) => Promise<void>;
  fetchAgents: () => Promise<void>;
  selectChannel: (channelId: string) => void;
  selectThread: (threadId: string) => void;
  sendMessage: (channelId: string, threadId: string, agentId: string, content: string) => Promise<void>;
  createChannel: (name: string, description?: string) => Promise<void>;
  createThread: (channelId: string, title: string) => Promise<void>;
  connectSSE: (channelId: string) => void;
  disconnectSSE: () => void;
}

export const useAMBStore = create<AMBState>((set, get) => ({
  channels: [],
  selectedChannelId: null,
  threads: [],
  selectedThreadId: null,
  messages: [],
  agents: [],
  loading: false,
  error: null,
  sseSource: null,

  fetchChannels: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/api/a2a/channels`);
      if (!res.ok) throw new Error(`Failed to fetch channels: ${res.status}`);
      const json = await res.json();
      const channels = (json.data?.channels ?? []).map((channel: any) => ({
        id: channel.id,
        name: channel.name,
        description: channel.description,
        createdBy: channel.memberAgentIds?.[0] ?? 'unknown',
        memberCount: Array.isArray(channel.memberAgentIds) ? channel.memberAgentIds.length : 0,
        createdAt: channel.createdAt,
      }));
      set({ channels, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch channels', loading: false });
    }
  },

  fetchThreads: async (channelId: string) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/api/a2a/channels/${channelId}/threads`);
      if (!res.ok) throw new Error(`Failed to fetch threads: ${res.status}`);
      const json = await res.json();
      const threads = (json.data?.threads ?? []).map((thread: any) => ({
        id: thread.id,
        channelId: thread.channelId,
        title: thread.title,
        createdBy: 'unknown',
        messageCount: 0,
        createdAt: thread.createdAt,
      }));
      set({ threads, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch threads', loading: false });
    }
  },

  fetchMessages: async (channelId: string, threadId: string) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/api/a2a/channels/${channelId}/threads/${threadId}/messages`);
      if (!res.ok) throw new Error(`Failed to fetch messages: ${res.status}`);
      const json = await res.json();
      const messages = (json.data?.messages ?? []).map((message: any) => ({
        id: message.id,
        threadId: message.threadId,
        agentId: message.senderAgentId,
        content: message.text,
        mentions: Array.isArray(message.mentions) ? message.mentions : [],
        createdAt: message.createdAt,
      }));
      set({ messages, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch messages', loading: false });
    }
  },

  fetchAgents: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/a2a/agents`);
      if (!res.ok) return;
      const json = await res.json();
      const agents = (json.data?.agents ?? []).map((agent: any) => ({
        agentId: agent.identity?.id ?? '',
        name: agent.identity?.name ?? agent.identity?.id ?? 'Unknown Agent',
        platform: agent.identity?.platform ?? 'custom',
        status: agent.status,
      })).filter((agent: AMBAgent) => agent.agentId);
      set({ agents });
    } catch {
      // Non-critical
    }
  },

  selectChannel: (channelId: string) => {
    const { disconnectSSE, fetchThreads, connectSSE } = get();
    disconnectSSE();
    set({ selectedChannelId: channelId, selectedThreadId: null, threads: [], messages: [] });
    fetchThreads(channelId);
    connectSSE(channelId);
  },

  selectThread: (threadId: string) => {
    const { selectedChannelId, fetchMessages } = get();
    set({ selectedThreadId: threadId, messages: [] });
    if (selectedChannelId) {
      fetchMessages(selectedChannelId, threadId);
    }
  },

  sendMessage: async (channelId: string, threadId: string, agentId: string, content: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/a2a/channels/${channelId}/threads/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderAgentId: agentId, text: content }),
      });
      if (!res.ok) throw new Error(`Failed to send: ${res.status}`);
      const json = await res.json();
      if (json.data) {
        const mapped = {
          id: json.data.id,
          threadId: json.data.threadId,
          agentId: json.data.senderAgentId,
          content: json.data.text,
          mentions: Array.isArray(json.data.mentions) ? json.data.mentions : [],
          createdAt: json.data.createdAt,
        };
        set((state) => ({ messages: [...state.messages, mapped] }));
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to send message' });
    }
  },

  createChannel: async (name: string, description?: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/a2a/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          scope: 'channel',
          memberAgentIds: ['studio-user'],
          metadata: description ? { description } : undefined,
        }),
      });
      if (!res.ok) throw new Error(`Failed to create channel: ${res.status}`);
      const { fetchChannels } = get();
      await fetchChannels();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create channel' });
    }
  },

  createThread: async (channelId: string, title: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/a2a/channels/${channelId}/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, createdBy: 'studio-user' }),
      });
      if (!res.ok) throw new Error(`Failed to create thread: ${res.status}`);
      const { fetchThreads } = get();
      await fetchThreads(channelId);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create thread' });
    }
  },

  connectSSE: (channelId: string) => {
    const { sseSource } = get();
    if (sseSource) sseSource.close();

    try {
      const source = new EventSource(`${API_BASE}/api/a2a/channels/${channelId}/stream`);

      source.addEventListener('message.new', (event) => {
        try {
          const parsed = JSON.parse(event.data);
          const message = parsed.message;
          if (!message) return;
          const { selectedThreadId } = get();
          if (message.threadId === selectedThreadId) {
            const mapped = {
              id: message.id,
              threadId: message.threadId,
              agentId: message.senderAgentId,
              content: message.text,
              mentions: Array.isArray(message.mentions) ? message.mentions : [],
              createdAt: message.createdAt,
            };
            set((state) => ({
              messages: state.messages.some((m) => m.id === mapped.id)
                ? state.messages
                : [...state.messages, mapped],
            }));
          }
        } catch {
          // Ignore parse errors
        }
      });

      source.addEventListener('thread.created', () => {
        const { selectedChannelId, fetchThreads } = get();
        if (selectedChannelId) fetchThreads(selectedChannelId);
      });

      source.onerror = () => {
        // SSE will auto-reconnect
      };

      set({ sseSource: source });
    } catch {
      // SSE not available
    }
  },

  disconnectSSE: () => {
    const { sseSource } = get();
    if (sseSource) {
      sseSource.close();
      set({ sseSource: null });
    }
  },
}));
