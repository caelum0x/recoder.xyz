import { create } from 'zustand';

export interface ChannelMessage {
  id: string;
  channelId: string;
  threadId: string;
  senderId: string;
  senderName: string;
  senderPlatform: string;
  text: string;
  mentions: string[];
  timestamp: string;
  replyCount?: number;
  type?: 'message' | 'system' | 'handoff' | 'approval';
  metadata?: Record<string, unknown>;
}

export interface Channel {
  id: string;
  name: string;
  scope: 'public' | 'agent-to-agent' | 'direct';
  memberAgentIds: string[];
  createdAt: string;
}

interface ChannelState {
  channels: Channel[];
  activeChannelId: string | null;
  unreadCounts: Record<string, number>;
  typingAgents: Record<string, string[]>;
  messages: Record<string, ChannelMessage[]>;

  setChannels: (channels: Channel[]) => void;
  setActiveChannel: (id: string | null) => void;
  addMessage: (channelId: string, message: ChannelMessage) => void;
  setMessages: (channelId: string, messages: ChannelMessage[]) => void;
  incrementUnread: (channelId: string) => void;
  clearUnread: (channelId: string) => void;
  setTypingAgents: (channelId: string, agents: string[]) => void;
  addChannel: (channel: Channel) => void;
  removeChannel: (channelId: string) => void;
}

export const useChannelStore = create<ChannelState>()((set) => ({
  channels: [],
  activeChannelId: null,
  unreadCounts: {},
  typingAgents: {},
  messages: {},

  setChannels: (channels) => set({ channels }),
  setActiveChannel: (activeChannelId) => set({ activeChannelId }),

  addMessage: (channelId, message) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: [...(state.messages[channelId] ?? []), message],
      },
    })),

  setMessages: (channelId, messages) =>
    set((state) => ({
      messages: { ...state.messages, [channelId]: messages },
    })),

  incrementUnread: (channelId) =>
    set((state) => ({
      unreadCounts: {
        ...state.unreadCounts,
        [channelId]: (state.unreadCounts[channelId] ?? 0) + 1,
      },
    })),

  clearUnread: (channelId) =>
    set((state) => ({
      unreadCounts: { ...state.unreadCounts, [channelId]: 0 },
    })),

  setTypingAgents: (channelId, agents) =>
    set((state) => ({
      typingAgents: { ...state.typingAgents, [channelId]: agents },
    })),

  addChannel: (channel) =>
    set((state) => ({
      channels: [...state.channels, channel],
    })),

  removeChannel: (channelId) =>
    set((state) => ({
      channels: state.channels.filter((ch) => ch.id !== channelId),
    })),
}));

// Optimized selectors
export const useActiveChannelId = () =>
  useChannelStore((state) => state.activeChannelId);
export const useActiveChannel = () =>
  useChannelStore((state) =>
    state.channels.find((ch) => ch.id === state.activeChannelId),
  );
export const useChannelMessages = (channelId: string) =>
  useChannelStore((state) => state.messages[channelId] ?? []);
export const useUnreadCount = (channelId: string) =>
  useChannelStore((state) => state.unreadCounts[channelId] ?? 0);
