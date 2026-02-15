import { useEffect, useState } from 'react';
import { Link } from '@remix-run/react';
import { getCurrentUser } from '~/utils/auth-utils';
import { getOrCreateAnonymousId } from '~/utils/anonymous-id';
import type { Message } from 'ai';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('ChatHistoryList');

interface ChatSessionItem {
  id: string;
  urlId: string;
  title?: string;
  description?: string;
  totalMessages: number;
  lastMessageAt?: string;
  createdAt: string;
  updatedAt: string;
  source?: 'web' | 'cli';
  projectId?: string;
  artifactId?: string;
  metadata?: Record<string, any>;
}

type FilterTab = 'all' | 'web' | 'cli';

export function ChatHistoryList() {
  const [chats, setChats] = useState<ChatSessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  useEffect(() => {
    loadChatHistory();
  }, []);

  const loadChatHistory = async () => {
    try {
      setLoading(true);
      setError(null);

      const user = getCurrentUser();
      const anonymousId = !user ? getOrCreateAnonymousId() : undefined;

      const params = new URLSearchParams();
      if (user?.id) params.set('userId', user.id);
      if (anonymousId) params.set('anonymousId', anonymousId);
      params.set('limit', '100');

      const response = await fetch(`/api/chat-history?${params}`);

      if (!response.ok) {
        throw new Error('Failed to load chat history');
      }

      const result = await response.json() as { success: boolean; data?: any[] };

      if (result.success && result.data) {
        // Infer source from metadata or projectId
        const enrichedChats = result.data.map((chat: any) => ({
          ...chat,
          source: inferChatSource(chat),
        }));

        setChats(enrichedChats);
      }
    } catch (err) {
      logger.error('Failed to load chat history:', err);
      setError(err instanceof Error ? err.message : 'Failed to load chat history');
    } finally {
      setLoading(false);
    }
  };

  const inferChatSource = (chat: any): 'web' | 'cli' => {
    // If metadata indicates CLI source
    if (chat.metadata?.source === 'cli') return 'cli';
    if (chat.metadata?.cliVersion) return 'cli';

    // If projectId exists, likely from CLI
    if (chat.projectId) return 'cli';

    // Default to web
    return 'web';
  };

  const filteredChats = chats.filter((chat) => {
    if (activeFilter === 'all') return true;
    return chat.source === activeFilter;
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  const getSourceBadge = (source: 'web' | 'cli') => {
    if (source === 'cli') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
          <span className="i-ph:terminal mr-1" />
          CLI
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
        <span className="i-ph:globe mr-1" />
        Web
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-3">
          <div className="i-ph:spinner-gap text-4xl text-bolt-elements-textSecondary animate-spin mx-auto" />
          <p className="text-bolt-elements-textSecondary">Loading chat history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-3 max-w-md">
          <div className="i-ph:warning-circle text-4xl text-red-400 mx-auto" />
          <p className="text-red-400 font-medium">Failed to load chat history</p>
          <p className="text-sm text-bolt-elements-textSecondary">{error}</p>
          <button
            onClick={loadChatHistory}
            className="px-4 py-2 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded-lg hover:bg-bolt-elements-button-primary-backgroundHover transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-bolt-elements-borderColor pb-4">
        <button
          onClick={() => setActiveFilter('all')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeFilter === 'all'
              ? 'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text'
              : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive'
          }`}
        >
          All ({chats.length})
        </button>
        <button
          onClick={() => setActiveFilter('web')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeFilter === 'web'
              ? 'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text'
              : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive'
          }`}
        >
          <span className="i-ph:globe mr-2" />
          Web ({chats.filter(c => c.source === 'web').length})
        </button>
        <button
          onClick={() => setActiveFilter('cli')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeFilter === 'cli'
              ? 'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text'
              : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive'
          }`}
        >
          <span className="i-ph:terminal mr-2" />
          CLI ({chats.filter(c => c.source === 'cli').length})
        </button>
      </div>

      {/* Chat List */}
      {filteredChats.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <div className="i-ph:chat-circle-dots text-5xl text-bolt-elements-textSecondary opacity-50 mx-auto" />
          <p className="text-bolt-elements-textSecondary text-lg">
            {activeFilter === 'all'
              ? 'No chats yet. Start a conversation!'
              : `No ${activeFilter === 'cli' ? 'CLI' : 'web'} chats found.`}
          </p>
          <Link
            to="/"
            className="inline-block px-6 py-3 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded-lg hover:bg-bolt-elements-button-primary-backgroundHover transition-colors"
          >
            Start New Chat
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredChats.map((chat) => (
            <Link
              key={chat.id}
              to={`/chat/${chat.urlId}`}
              className="block p-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 hover:border-bolt-elements-borderColor transition-all group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    {getSourceBadge(chat.source || 'web')}
                    <span className="text-xs text-bolt-elements-textSecondary">
                      {formatDate(chat.updatedAt)}
                    </span>
                  </div>
                  <h3 className="text-bolt-elements-textPrimary font-medium mb-1 truncate group-hover:text-bolt-elements-textPrimary">
                    {chat.title || chat.description || 'Untitled Chat'}
                  </h3>
                  {chat.description && chat.title !== chat.description && (
                    <p className="text-sm text-bolt-elements-textSecondary line-clamp-2">
                      {chat.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-bolt-elements-textSecondary">
                    <span className="flex items-center gap-1">
                      <span className="i-ph:chat-circle-dots" />
                      {chat.totalMessages} messages
                    </span>
                    {chat.artifactId && (
                      <span className="flex items-center gap-1">
                        <span className="i-ph:code" />
                        Has code
                      </span>
                    )}
                    {chat.projectId && (
                      <span className="flex items-center gap-1">
                        <span className="i-ph:folder" />
                        Project
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <span className="i-ph:arrow-right text-bolt-elements-textSecondary group-hover:text-bolt-elements-textPrimary group-hover:translate-x-1 transition-all" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Stats Footer */}
      {filteredChats.length > 0 && (
        <div className="pt-6 border-t border-bolt-elements-borderColor">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 rounded-lg bg-bolt-elements-background-depth-2">
              <div className="text-2xl font-bold text-bolt-elements-textPrimary">
                {chats.length}
              </div>
              <div className="text-xs text-bolt-elements-textSecondary mt-1">Total Chats</div>
            </div>
            <div className="p-4 rounded-lg bg-bolt-elements-background-depth-2">
              <div className="text-2xl font-bold text-blue-400">
                {chats.filter(c => c.source === 'web').length}
              </div>
              <div className="text-xs text-bolt-elements-textSecondary mt-1">Web Chats</div>
            </div>
            <div className="p-4 rounded-lg bg-bolt-elements-background-depth-2">
              <div className="text-2xl font-bold text-purple-400">
                {chats.filter(c => c.source === 'cli').length}
              </div>
              <div className="text-xs text-bolt-elements-textSecondary mt-1">CLI Chats</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
