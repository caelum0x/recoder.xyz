import { motion, type Variants } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { useStore } from '@nanostores/react';
import { Dialog, DialogButton, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { IconButton } from '~/components/ui/IconButton';
import { ThemeSwitch } from '~/components/ui/ThemeSwitch';
import { getDB, deleteById, getAll, chatId, type ChatHistoryItem } from '~/lib/persistence';
import {
  loadAllSessions,
  renameSessionPersistent,
  deleteSessionPersistent,
  exportConversation,
  searchConversations,
} from '~/lib/persistence/useChatHistory';
import {
  filteredSessions,
  searchQuery,
  setSearchQuery,
  isLoading as sessionsLoading,
  toggleFavorite,
  renamingSessionId,
  startRenaming,
  stopRenaming,
  type ChatSessionMetadata,
} from '~/lib/stores/chat-sessions';
import { cubicEasingFn } from '~/utils/easings';
import { logger } from '~/utils/logger';
import { showSmartError, showQuickError } from '~/lib/errors/toast-error';
import { getCurrentUser } from '~/utils/auth-utils';
import { getOrCreateAnonymousId } from '~/utils/anonymous-id';
import { HistoryItem } from './HistoryItem';
import { EnhancedHistoryItem } from './EnhancedHistoryItem';
import { binDates } from './date-binning';
import { ProjectsList } from './ProjectsList';

const menuVariants = {
  closed: {
    opacity: 0,
    visibility: 'hidden',
    left: '-150px',
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
  open: {
    opacity: 1,
    visibility: 'initial',
    left: 0,
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
} satisfies Variants;

type DialogContent = { type: 'delete'; item: ChatHistoryItem } | null;

// Use enhanced session management via chat-sessions store
const USE_ENHANCED_SESSIONS = true;

export function Menu() {
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [list, setList] = useState<ChatHistoryItem[]>([]);
  const [open, setOpen] = useState(false);
  const [dialogContent, setDialogContent] = useState<DialogContent>(null);
  const [loadingFromDb, setLoadingFromDb] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Enhanced session management stores
  const sessions = useStore(filteredSessions);
  const query = useStore(searchQuery);
  const loading = useStore(sessionsLoading);

  const loadEntries = useCallback(async () => {
    setLoadingFromDb(true);

    try {
      // Use enhanced session management
      if (USE_ENHANCED_SESSIONS) {
        await loadAllSessions(100);
        setLoadingFromDb(false);
        return;
      }

      // Fallback to IndexedDB if database has no data
      const db = getDB();
      if (db) {
        const indexedDBChats = await getAll(db);
        const filtered = indexedDBChats.filter((item) => item.urlId && item.description);
        setList(filtered);
      } else {
        setList([]);
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
      showSmartError(error instanceof Error ? error : new Error(String(error)));

      // Final fallback to IndexedDB
      const db = getDB();
      if (db) {
        try {
          const indexedDBChats = await getAll(db);
          const filtered = indexedDBChats.filter((item) => item.urlId && item.description);
          setList(filtered);
        } catch (e) {
          console.error('Final fallback failed:', e);
          setList([]);
        }
      } else {
        setList([]);
      }
    } finally {
      setLoadingFromDb(false);
    }
  }, []);

  const deleteItem = useCallback(async (event: React.UIEvent, item: ChatHistoryItem) => {
    event.preventDefault();

    if (USE_ENHANCED_SESSIONS) {
      // Use enhanced delete with persistence
      const success = await deleteSessionPersistent(item.id);
      if (success) {
        toast.success('Conversation deleted');
      } else {
        toast.error('Failed to delete conversation');
      }
    } else {
      try {
        // Try deleting from database first
        await fetch('/api/chat-history', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: item.id }),
        });
      } catch (error) {
        console.error('Failed to delete from database:', error);
      }

      // Also delete from IndexedDB if it exists there
      const db = getDB();
      if (db) {
        try {
          await deleteById(db, item.id);
        } catch (error) {
          console.error('Failed to delete from IndexedDB:', error);
        }
      }

      // Reload list
      loadEntries();
    }

    // If this was the current chat, redirect to home
    if (chatId.get() === item.id) {
      window.location.pathname = '/';
    }
  }, [loadEntries]);

  const closeDialog = () => {
    setDialogContent(null);
  };

  useEffect(() => {
    if (open) {
      loadEntries();
    }
  }, [open, loadEntries]);

  // Listen for modal state changes
  useEffect(() => {
    function handleModalOpen() {
      setIsModalOpen(true);
    }

    function handleModalClose() {
      setIsModalOpen(false);
    }

    // Listen for modal events
    window.addEventListener('modal-opened', handleModalOpen);
    window.addEventListener('modal-closed', handleModalClose);

    // Also detect if there are any modal overlays present
    const checkForModals = () => {
      // Look for modal elements with specific patterns
      const modalOverlays = document.querySelectorAll('.fixed.inset-0, [class*="fixed inset-0"]');
      const createProjectText = document.querySelector('h2');
      const hasCreateProjectModal = createProjectText?.textContent?.includes('Create Project');
      
      setIsModalOpen(modalOverlays.length > 0 || hasCreateProjectModal || false);
    };

    // Check for modals on mount and periodically
    checkForModals();
    const modalCheckInterval = setInterval(checkForModals, 500);

    return () => {
      window.removeEventListener('modal-opened', handleModalOpen);
      window.removeEventListener('modal-closed', handleModalClose);
      clearInterval(modalCheckInterval);
    };
  }, []);

  useEffect(() => {
    const enterThreshold = 40;
    const exitThreshold = 40;

    function onMouseMove(event: MouseEvent) {
      if (event.pageX < enterThreshold) {
        setOpen(true);
      }

      // Don't close sidebar if a modal is open
      if (isModalOpen) {
        return;
      }

      if (menuRef.current && event.clientX > menuRef.current.getBoundingClientRect().right + exitThreshold) {
        setOpen(false);
      }
    }

    // Listen for toggle event from header button
    function handleToggleEvent() {
      setOpen((prev) => !prev);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('toggle-history', handleToggleEvent);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('toggle-history', handleToggleEvent);
    };
  }, [isModalOpen]);

  return (
    <>
      {/* Sidebar Menu */}
      <motion.div
        ref={menuRef}
        initial="closed"
        animate={open ? 'open' : 'closed'}
        variants={menuVariants}
        className="flex flex-col side-menu fixed top-0 w-[350px] h-full bg-bolt-elements-background-depth-2 border-r rounded-r-3xl border-bolt-elements-borderColor z-sidebar shadow-xl text-sm"
      >
        <div className="flex items-center justify-end h-[var(--header-height)] px-4">
          <IconButton
            icon="i-ph:x"
            onClick={() => setOpen(false)}
            title="Close menu"
            className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
          />
        </div>
      <div className="flex-1 flex flex-col h-full w-full overflow-hidden">
        <div className="p-4">
          <a
            href="/"
            className="flex gap-2 items-center bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 rounded-md p-2 transition-colors"
          >
            <span className="inline-block i-bolt:chat scale-110" />
            Start new chat
          </a>
        </div>

        {/* Search input */}
        {USE_ENHANCED_SESSIONS && (
          <div className="px-4 pb-2">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 i-ph:magnifying-glass text-bolt-elements-textTertiary" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search chats..."
                value={query}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-1.5 text-sm bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {query && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 i-ph:x text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
                />
              )}
            </div>
          </div>
        )}

        <div className="text-bolt-elements-textPrimary font-medium pl-6 pr-5 my-2">Your Chats</div>
        <div className="flex-1 overflow-scroll pl-4 pr-5 pb-5">
          {(loadingFromDb || loading) && (
            <div className="pl-2 text-bolt-elements-textTertiary flex items-center gap-2">
              <div className="i-ph:spinner animate-spin" />
              Loading...
            </div>
          )}

          {/* Enhanced sessions view */}
          {USE_ENHANCED_SESSIONS && !loading && sessions.length === 0 && (
            <div className="pl-2 text-bolt-elements-textTertiary">
              {query ? 'No conversations match your search' : 'No previous conversations'}
            </div>
          )}

          {/* Legacy list view (fallback) */}
          {!USE_ENHANCED_SESSIONS && !loadingFromDb && list.length === 0 && (
            <div className="pl-2 text-bolt-elements-textTertiary">No previous conversations</div>
          )}

          <DialogRoot open={dialogContent !== null}>
            {/* Enhanced sessions rendering */}
            {USE_ENHANCED_SESSIONS && sessions.length > 0 && (
              <>
                {binDates(
                  sessions.map(s => ({
                    id: s.id,
                    urlId: s.urlId,
                    description: s.title,
                    messages: [],
                    timestamp: s.updatedAt,
                  }))
                ).map(({ category, items }) => (
                  <div key={category} className="mt-4 first:mt-0 space-y-1">
                    <div className="text-bolt-elements-textTertiary sticky top-0 z-1 bg-bolt-elements-background-depth-2 pl-2 pt-2 pb-1">
                      {category}
                    </div>
                    {items.map((item) => {
                      const session = sessions.find(s => s.id === item.id);
                      if (!session) return null;
                      return (
                        <EnhancedHistoryItem
                          key={session.id}
                          session={session}
                          onDelete={() => setDialogContent({
                            type: 'delete',
                            item: {
                              id: session.id,
                              urlId: session.urlId,
                              description: session.title,
                              messages: [],
                              timestamp: session.updatedAt,
                            }
                          })}
                        />
                      );
                    })}
                  </div>
                ))}
              </>
            )}

            {/* Legacy rendering */}
            {!USE_ENHANCED_SESSIONS && binDates(list).map(({ category, items }) => (
              <div key={category} className="mt-4 first:mt-0 space-y-1">
                <div className="text-bolt-elements-textTertiary sticky top-0 z-1 bg-bolt-elements-background-depth-2 pl-2 pt-2 pb-1">
                  {category}
                </div>
                {items.map((item) => (
                  <HistoryItem key={item.id} item={item} onDelete={() => setDialogContent({ type: 'delete', item })} />
                ))}
              </div>
            ))}

            <Dialog onBackdrop={closeDialog} onClose={closeDialog}>
              {dialogContent?.type === 'delete' && (
                <>
                  <DialogTitle>Delete Chat?</DialogTitle>
                  <DialogDescription asChild>
                    <div>
                      <p>
                        You are about to delete <strong>{dialogContent.item.description}</strong>.
                      </p>
                      <p className="mt-1">Are you sure you want to delete this chat?</p>
                    </div>
                  </DialogDescription>
                  <div className="px-5 pb-4 bg-bolt-elements-background-depth-2 flex gap-2 justify-end">
                    <DialogButton type="secondary" onClick={closeDialog}>
                      Cancel
                    </DialogButton>
                    <DialogButton
                      type="danger"
                      onClick={(event) => {
                        deleteItem(event, dialogContent.item);
                        closeDialog();
                      }}
                    >
                      Delete
                    </DialogButton>
                  </div>
                </>
              )}
            </Dialog>
          </DialogRoot>
        </div>
        <div className="flex items-center border-t border-bolt-elements-borderColor p-4">
          <ThemeSwitch className="ml-auto" />
        </div>
      </div>
      </motion.div>
    </>
  );
}
