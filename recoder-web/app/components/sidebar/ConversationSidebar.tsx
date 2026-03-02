/**
 * ConversationSidebar - Enhanced chat history sidebar with session management
 *
 * Features:
 * - List all conversations for current project
 * - Create new conversation
 * - Delete/archive conversations
 * - Search across conversations
 * - Rename conversations inline
 * - Export conversations as markdown
 * - Favorite conversations
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { Link, useNavigate } from '@remix-run/react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import { IconButton } from '~/components/ui/IconButton';
import { Dialog, DialogButton, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import {
  filteredSessions,
  searchQuery,
  setSearchQuery,
  isLoading,
  sessionsError,
  renamingSessionId,
  startRenaming,
  stopRenaming,
  sessionStats,
  favoriteSessions,
  recentSessions,
  toggleFavorite,
  showArchived,
  toggleShowArchived,
  type ChatSessionMetadata,
} from '~/lib/stores/chat-sessions';
import {
  loadAllSessions,
  renameSessionPersistent,
  deleteSessionPersistent,
  archiveSessionPersistent,
  exportConversation,
  createNewSession,
} from '~/lib/persistence/useChatHistory';
import { binDates } from './date-binning';

interface ConversationSidebarProps {
  projectId?: string;
  onClose?: () => void;
  className?: string;
}

export function ConversationSidebar({ projectId, onClose, className = '' }: ConversationSidebarProps) {
  const navigate = useNavigate();
  const sessions = useStore(filteredSessions);
  const query = useStore(searchQuery);
  const loading = useStore(isLoading);
  const error = useStore(sessionsError);
  const renamingId = useStore(renamingSessionId);
  const stats = useStore(sessionStats);
  const favorites = useStore(favoriteSessions);
  const recent = useStore(recentSessions);
  const archived = useStore(showArchived);

  const [dialogContent, setDialogContent] = useState<{
    type: 'delete' | 'archive';
    session: ChatSessionMetadata;
  } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load sessions on mount
  useEffect(() => {
    loadAllSessions(100);
  }, []);

  // Focus search input when pressing Cmd+K or Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCreateNew = useCallback(async () => {
    const urlId = await createNewSession(projectId);
    if (urlId) {
      navigate('/');
    }
  }, [projectId, navigate]);

  const handleDelete = useCallback(async (session: ChatSessionMetadata) => {
    const success = await deleteSessionPersistent(session.id);
    if (success) {
      toast.success('Conversation deleted');
    } else {
      toast.error('Failed to delete conversation');
    }
    setDialogContent(null);
  }, []);

  const handleArchive = useCallback(async (session: ChatSessionMetadata) => {
    const success = await archiveSessionPersistent(session.id);
    if (success) {
      toast.success('Conversation archived');
    } else {
      toast.error('Failed to archive conversation');
    }
    setDialogContent(null);
  }, []);

  const handleExport = useCallback(async (session: ChatSessionMetadata) => {
    await exportConversation(session.id);
  }, []);

  const handleToggleFavorite = useCallback((sessionId: string) => {
    toggleFavorite(sessionId);
    toast.success('Favorite updated');
  }, []);

  // Group sessions by date
  const groupedSessions = binDates(
    sessions.map(s => ({
      id: s.id,
      urlId: s.urlId,
      description: s.title,
      messages: [],
      timestamp: s.updatedAt,
    }))
  );

  return (
    <div className={`flex flex-col h-full bg-recoder-elements-background-depth-2 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-recoder-elements-borderColor">
        <h2 className="text-lg font-semibold text-recoder-elements-textPrimary">Conversations</h2>
        <div className="flex items-center gap-2">
          <IconButton
            icon="i-ph:plus"
            onClick={handleCreateNew}
            title="New conversation"
            className="text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary"
          />
          {onClose && (
            <IconButton
              icon="i-ph:x"
              onClick={onClose}
              title="Close"
              className="text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary"
            />
          )}
        </div>
      </div>

      {/* Search */}
      <div className="p-4 border-b border-recoder-elements-borderColor">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 i-ph:magnifying-glass text-recoder-elements-textTertiary" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search conversations... (Cmd+K)"
            value={query}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-lg text-recoder-elements-textPrimary placeholder:text-recoder-elements-textTertiary focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {query && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 i-ph:x text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary"
            />
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 py-2 flex items-center gap-4 text-xs text-recoder-elements-textTertiary border-b border-recoder-elements-borderColor">
        <span>{stats.total} total</span>
        <span>{stats.favorites} favorites</span>
        <button
          onClick={toggleShowArchived}
          className={`hover:text-recoder-elements-textSecondary ${archived ? 'text-recoder-elements-textTertiary' : ''}`}
        >
          {archived ? 'Hide' : 'Show'} {stats.archived} archived
        </button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center p-8">
            <span className="i-ph:spinner animate-spin text-2xl text-recoder-elements-textTertiary" />
          </div>
        )}

        {error && (
          <div className="p-4 text-center text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div className="p-8 text-center text-recoder-elements-textTertiary">
            {query ? 'No conversations match your search' : 'No conversations yet'}
          </div>
        )}

        {!loading && !error && sessions.length > 0 && (
          <DialogRoot open={dialogContent !== null}>
            {/* Favorites Section */}
            {!query && favorites.length > 0 && (
              <div className="mb-4">
                <div className="px-4 py-2 text-xs font-medium text-recoder-elements-textTertiary uppercase tracking-wider bg-recoder-elements-background-depth-2 sticky top-0 z-10">
                  Favorites
                </div>
                {favorites.map((session) => (
                  <ConversationItem
                    key={session.id}
                    session={session}
                    isRenaming={renamingId === session.id}
                    onStartRename={() => startRenaming(session.id)}
                    onStopRename={stopRenaming}
                    onDelete={() => setDialogContent({ type: 'delete', session })}
                    onArchive={() => setDialogContent({ type: 'archive', session })}
                    onExport={() => handleExport(session)}
                    onToggleFavorite={() => handleToggleFavorite(session.id)}
                  />
                ))}
              </div>
            )}

            {/* Recent or All Sessions */}
            {groupedSessions.map(({ category, items }) => (
              <div key={category} className="mb-4">
                <div className="px-4 py-2 text-xs font-medium text-recoder-elements-textTertiary uppercase tracking-wider bg-recoder-elements-background-depth-2 sticky top-0 z-10">
                  {category}
                </div>
                {items.map((item) => {
                  const session = sessions.find(s => s.id === item.id);
                  if (!session) return null;

                  return (
                    <ConversationItem
                      key={session.id}
                      session={session}
                      isRenaming={renamingId === session.id}
                      onStartRename={() => startRenaming(session.id)}
                      onStopRename={stopRenaming}
                      onDelete={() => setDialogContent({ type: 'delete', session })}
                      onArchive={() => setDialogContent({ type: 'archive', session })}
                      onExport={() => handleExport(session)}
                      onToggleFavorite={() => handleToggleFavorite(session.id)}
                    />
                  );
                })}
              </div>
            ))}

            {/* Dialogs */}
            <Dialog onBackdrop={() => setDialogContent(null)} onClose={() => setDialogContent(null)}>
              {dialogContent?.type === 'delete' && (
                <>
                  <DialogTitle>Delete Conversation?</DialogTitle>
                  <DialogDescription asChild>
                    <div>
                      <p>
                        You are about to delete <strong>{dialogContent.session.title}</strong>.
                      </p>
                      <p className="mt-1">This action cannot be undone.</p>
                    </div>
                  </DialogDescription>
                  <div className="px-5 pb-4 bg-recoder-elements-background-depth-2 flex gap-2 justify-end">
                    <DialogButton type="secondary" onClick={() => setDialogContent(null)}>
                      Cancel
                    </DialogButton>
                    <DialogButton
                      type="danger"
                      onClick={() => handleDelete(dialogContent.session)}
                    >
                      Delete
                    </DialogButton>
                  </div>
                </>
              )}
              {dialogContent?.type === 'archive' && (
                <>
                  <DialogTitle>Archive Conversation?</DialogTitle>
                  <DialogDescription asChild>
                    <div>
                      <p>
                        Archive <strong>{dialogContent.session.title}</strong>?
                      </p>
                      <p className="mt-1">You can view archived conversations by toggling the filter.</p>
                    </div>
                  </DialogDescription>
                  <div className="px-5 pb-4 bg-recoder-elements-background-depth-2 flex gap-2 justify-end">
                    <DialogButton type="secondary" onClick={() => setDialogContent(null)}>
                      Cancel
                    </DialogButton>
                    <DialogButton
                      type="primary"
                      onClick={() => handleArchive(dialogContent.session)}
                    >
                      Archive
                    </DialogButton>
                  </div>
                </>
              )}
            </Dialog>
          </DialogRoot>
        )}
      </div>
    </div>
  );
}

// ==================== CONVERSATION ITEM ====================

interface ConversationItemProps {
  session: ChatSessionMetadata;
  isRenaming: boolean;
  onStartRename: () => void;
  onStopRename: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onExport: () => void;
  onToggleFavorite: () => void;
}

function ConversationItem({
  session,
  isRenaming,
  onStartRename,
  onStopRename,
  onDelete,
  onArchive,
  onExport,
  onToggleFavorite,
}: ConversationItemProps) {
  const [hovering, setHovering] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleRenameSubmit = useCallback(async () => {
    if (editTitle.trim() && editTitle !== session.title) {
      await renameSessionPersistent(session.id, editTitle.trim());
    }
    onStopRename();
  }, [session.id, session.title, editTitle, onStopRename]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      setEditTitle(session.title);
      onStopRename();
    }
  }, [handleRenameSubmit, session.title, onStopRename]);

  return (
    <div
      className={`group relative px-4 py-2 hover:bg-recoder-elements-background-depth-2 transition-colors ${
        session.isArchived ? 'opacity-60' : ''
      }`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="flex items-start gap-2">
        {/* Favorite indicator */}
        <button
          onClick={(e) => {
            e.preventDefault();
            onToggleFavorite();
          }}
          className={`mt-1 flex-shrink-0 ${
            session.isFavorite
              ? 'i-ph:star-fill text-yellow-400'
              : 'i-ph:star text-recoder-elements-textTertiary hover:text-yellow-400'
          }`}
          title={session.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        />

        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <input
              ref={inputRef}
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={handleKeyDown}
              className="w-full px-2 py-1 bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded text-recoder-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <Link
              to={`/chat/${session.urlId}`}
              className="block text-recoder-elements-textPrimary hover:text-recoder-elements-textPrimary truncate"
            >
              {session.title}
            </Link>
          )}

          <div className="flex items-center gap-2 mt-1 text-xs text-recoder-elements-textTertiary">
            <span>{session.messageCount} messages</span>
            {session.source === 'cli' && (
              <span className="px-1 py-0.5 bg-recoder-elements-background-depth-2 rounded">CLI</span>
            )}
            {session.isArchived && (
              <span className="px-1 py-0.5 bg-recoder-elements-background-depth-2 rounded">Archived</span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <AnimatePresence>
          {hovering && !isRenaming && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1"
            >
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onStartRename();
                }}
                className="p-1 i-ph:pencil text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary"
                title="Rename"
              />
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onExport();
                }}
                className="p-1 i-ph:download text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary"
                title="Export as Markdown"
              />
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onArchive();
                }}
                className="p-1 i-ph:archive text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary"
                title="Archive"
              />
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onDelete();
                }}
                className="p-1 i-ph:trash text-recoder-elements-textTertiary hover:text-red-400"
                title="Delete"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default ConversationSidebar;
