import { useState, useEffect } from 'react';
import { useNavigate } from '@remix-run/react';

interface ChatSession {
  id: string;
  url_id: string;
  title: string;
  description?: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
  file_count?: number;
}

type FilterType = 'all' | 'cli' | 'web';

export function ChatHistoryList() {
  const [filter, setFilter] = useState<FilterType>('all');
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadChats();
  }, []);

  async function loadChats() {
    try {
      const userId = localStorage.getItem('recoder_userId') || 'dev-user-123';
      const response = await fetch(`/api/chat-history?userId=${userId}&limit=100`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to load chat history: ${response.status}`);
      }

      const data = await response.json() as { success: boolean; data?: ChatSession[]; error?: string };

      if (data.success && data.data) {
        setChats(data.data);
      } else {
        throw new Error(data.error || 'Failed to load chats');
      }
    } catch (err) {
      console.error('[ChatHistoryList] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load chats');
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    }
    return date.toLocaleDateString();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-bolt-elements-textSecondary">
          <div className="i-ph:spinner animate-spin text-xl" />
          <span>Loading chat history...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
        <p className="text-red-500">⚠️ {error}</p>
        <button onClick={loadChats} className="mt-2 text-sm text-red-400 hover:text-red-300 underline">
          Try again
        </button>
      </div>
    );
  }

  const isCLIChat = (chat: ChatSession) => chat.url_id?.startsWith('cli-');
  const filteredChats = chats.filter(chat => {
    if (filter === 'all') return true;
    if (filter === 'cli') return isCLIChat(chat);
    if (filter === 'web') return !isCLIChat(chat);
    return true;
  });

  const cliCount = chats.filter(isCLIChat).length;
  const webCount = chats.length - cliCount;

  if (chats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center p-6">
        <div className="w-16 h-16 rounded-full bg-bolt-elements-background-depth-3 flex items-center justify-center mb-4">
          <div className="i-ph:chat-circle text-3xl text-bolt-elements-textSecondary" />
        </div>
        <h3 className="text-lg font-semibold text-bolt-elements-textPrimary mb-2">No chat history yet</h3>
        <p className="text-bolt-elements-textSecondary text-sm max-w-md">
          Start a conversation to see your chats here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-bolt-elements-borderColor pb-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            filter === 'all'
              ? 'bg-bolt-elements-item-backgroundActive text-bolt-elements-textPrimary'
              : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
          }`}
        >
          All ({chats.length})
        </button>
        <button
          onClick={() => setFilter('cli')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
            filter === 'cli'
              ? 'bg-bolt-elements-item-backgroundActive text-bolt-elements-textPrimary'
              : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
          }`}
        >
          <div className="i-ph:terminal text-sm" />
          CLI ({cliCount})
        </button>
        <button
          onClick={() => setFilter('web')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
            filter === 'web'
              ? 'bg-bolt-elements-item-backgroundActive text-bolt-elements-textPrimary'
              : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
          }`}
        >
          <div className="i-ph:globe text-sm" />
          Web ({webCount})
        </button>
      </div>

      <div className="text-sm text-bolt-elements-textSecondary">
        {filteredChats.length} conversation{filteredChats.length !== 1 ? 's' : ''}
      </div>

      {filteredChats.length === 0 && (
        <div className="text-center py-8 text-bolt-elements-textSecondary">
          No {filter === 'cli' ? 'CLI' : 'web'} chats found
        </div>
      )}

      {filteredChats.map((chat) => (
        <button
          key={chat.id}
          onClick={() => navigate(`/chat/${chat.url_id}`)}
          className="w-full text-left p-4 rounded-lg bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-item-backgroundActive border border-bolt-elements-borderColor transition-all duration-200 group hover:shadow-md"
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {isCLIChat(chat) ? (
                <div className="flex-shrink-0 px-2 py-0.5 bg-purple-500/20 border border-purple-500/30 rounded text-xs font-medium text-purple-400 flex items-center gap-1">
                  <div className="i-ph:terminal text-xs" />
                  CLI
                </div>
              ) : (
                <div className="flex-shrink-0 px-2 py-0.5 bg-blue-500/20 border border-blue-500/30 rounded text-xs font-medium text-blue-400 flex items-center gap-1">
                  <div className="i-ph:globe text-xs" />
                  Web
                </div>
              )}
              <h3 className="text-base font-medium text-bolt-elements-textPrimary truncate group-hover:text-blue-400 transition-colors">
                {chat.title || 'Untitled Chat'}
              </h3>
            </div>
            <div className="flex items-center gap-1 text-xs text-bolt-elements-textSecondary ml-3 flex-shrink-0">
              <div className="i-ph:clock text-xs" />
              <span>{formatDate(chat.updated_at || chat.created_at)}</span>
            </div>
          </div>

          {chat.description && (
            <p className="text-sm text-bolt-elements-textSecondary mb-3 line-clamp-2">{chat.description}</p>
          )}

          <div className="flex items-center gap-4 text-xs text-bolt-elements-textTertiary">
            {chat.message_count !== undefined && chat.message_count > 0 && (
              <span className="flex items-center gap-1.5">
                <div className="i-ph:chat-circle text-xs" />
                <span>{chat.message_count} message{chat.message_count !== 1 ? 's' : ''}</span>
              </span>
            )}
            {chat.file_count !== undefined && chat.file_count > 0 && (
              <span className="flex items-center gap-1.5">
                <div className="i-ph:file-text text-xs" />
                <span>{chat.file_count} file{chat.file_count !== 1 ? 's' : ''}</span>
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
