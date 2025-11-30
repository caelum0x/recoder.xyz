import { motion, type Variants } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { Dialog, DialogButton, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { IconButton } from '~/components/ui/IconButton';
import { ThemeSwitch } from '~/components/ui/ThemeSwitch';
import { getDB, deleteById, getAll, chatId, type ChatHistoryItem } from '~/lib/persistence';
import { cubicEasingFn } from '~/utils/easings';
import { logger } from '~/utils/logger';
import { showSmartError, showQuickError } from '~/lib/errors/toast-error';
import { getCurrentUser } from '~/utils/auth-utils';
import { getOrCreateAnonymousId } from '~/utils/anonymous-id';
import { HistoryItem } from './HistoryItem';
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

/**
 * Load chat history from database API
 */
async function loadHistoryFromDatabase(): Promise<ChatHistoryItem[]> {
  try {
    const user = getCurrentUser();
    const anonymousId = !user ? getOrCreateAnonymousId() : undefined;

    const params = new URLSearchParams();
    if (user?.id) params.set('userId', user.id);
    if (anonymousId) params.set('anonymousId', anonymousId);
    params.set('limit', '50');

    console.log('📋 [loadHistoryFromDatabase] Loading chat history...', { 
      userId: user?.id, 
      anonymousId,
      hasUser: !!user,
      hasAnonymousId: !!anonymousId,
    });

    const url = `/api/chat-history?${params}`;
    console.log('📋 [loadHistoryFromDatabase] Fetching:', url);

    const response = await fetch(url);

    console.log('📋 [loadHistoryFromDatabase] Response:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [loadHistoryFromDatabase] Failed to load:', errorText);
      throw new Error(`Failed to load from database: ${response.status}`);
    }

    const result = await response.json();
    const { data, success } = result;
    
    console.log('📋 [loadHistoryFromDatabase] Result:', {
      success,
      itemCount: data?.length || 0,
      hasData: !!data,
    });

    if (!success || !data) {
      console.warn('⚠️ [loadHistoryFromDatabase] No data in response');
      return [];
    }

    console.log(`✅ [loadHistoryFromDatabase] Loaded ${data.length} chats from database`);

    // Convert database format to ChatHistoryItem format
    return data.map((item: any) => ({
      id: item.id,
      urlId: item.urlId,
      description: item.description || 'Untitled Chat',
      messages: [], // Don't load messages until needed
      timestamp: item.timestamp,
    }));
  } catch (error) {
    console.error('❌ [loadHistoryFromDatabase] Failed to load from database:', error);
    if (error instanceof Error) {
      console.error('❌ [loadHistoryFromDatabase] Error details:', error.message);
    }
    return [];
  }
}

export function Menu() {
  const menuRef = useRef<HTMLDivElement>(null);
  const [list, setList] = useState<ChatHistoryItem[]>([]);
  const [open, setOpen] = useState(false);
  const [dialogContent, setDialogContent] = useState<DialogContent>(null);
  const [loadingFromDb, setLoadingFromDb] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadEntries = useCallback(async () => {
    console.log('📋 [Menu.loadEntries] Starting to load chat history...');
    setLoadingFromDb(true);

    try {
      // Try loading from database first
      console.log('📋 [Menu.loadEntries] Attempting database load...');
      const dbChats = await loadHistoryFromDatabase();

      console.log('📋 [Menu.loadEntries] Database returned:', dbChats.length, 'chats');

      if (dbChats.length > 0) {
        const filtered = dbChats.filter((item) => item.urlId && item.description);
        console.log('📋 [Menu.loadEntries] After filtering:', filtered.length, 'chats');
        setList(filtered);
        setLoadingFromDb(false);
        return;
      }

      // Fallback to IndexedDB if database has no data
      console.log('📋 [Menu.loadEntries] No database chats, trying IndexedDB fallback...');
      const db = getDB();
      if (db) {
        console.log('📋 [Menu.loadEntries] IndexedDB available, loading...');
        const indexedDBChats = await getAll(db);
        console.log('📋 [Menu.loadEntries] IndexedDB returned:', indexedDBChats.length, 'chats');
        const filtered = indexedDBChats.filter((item) => item.urlId && item.description);
        console.log('📋 [Menu.loadEntries] After filtering:', filtered.length, 'chats');
        setList(filtered);
      } else {
        console.log('📋 [Menu.loadEntries] No IndexedDB available, setting empty list');
        setList([]);
      }
    } catch (error) {
      console.error('❌ [Menu.loadEntries] Failed to load chat history:', error);
      showSmartError(error);
      
      // Final fallback to IndexedDB
      console.log('📋 [Menu.loadEntries] Error occurred, final IndexedDB fallback...');
      const db = getDB();
      if (db) {
        try {
          const indexedDBChats = await getAll(db);
          console.log('📋 [Menu.loadEntries] Final fallback got:', indexedDBChats.length, 'chats');
          const filtered = indexedDBChats.filter((item) => item.urlId && item.description);
          setList(filtered);
        } catch (e) {
          console.error('❌ [Menu.loadEntries] Final fallback failed:', e);
          setList([]);
        }
      } else {
        console.log('📋 [Menu.loadEntries] No IndexedDB for fallback');
        setList([]);
      }
    } finally {
      setLoadingFromDb(false);
      console.log('📋 [Menu.loadEntries] Load complete');
    }
  }, []);

  const deleteItem = useCallback(async (event: React.UIEvent, item: ChatHistoryItem) => {
    event.preventDefault();

    try {
      // Try deleting from database first
      const response = await fetch('/api/chat-history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: item.id }),
      });

      if (response.ok) {
        console.log('✅ Deleted chat from database');
      }
    } catch (error) {
      console.error('Failed to delete from database:', error);
    }

    // Also delete from IndexedDB if it exists there
    const db = getDB();
    if (db) {
      try {
        await deleteById(db, item.id);
        console.log('✅ Deleted chat from IndexedDB');
      } catch (error) {
        console.error('Failed to delete from IndexedDB:', error);
      }
    }

    // Reload list
    loadEntries();

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
        className="flex flex-col side-menu fixed top-0 w-[350px] h-full bg-bolt-elements-background-depth-2 border-r rounded-r-3xl border-bolt-elements-borderColor z-sidebar shadow-xl shadow-bolt-elements-sidebar-dropdownShadow text-sm"
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
            className="flex gap-2 items-center bg-bolt-elements-sidebar-buttonBackgroundDefault text-bolt-elements-sidebar-buttonText hover:bg-bolt-elements-sidebar-buttonBackgroundHover rounded-md p-2 transition-theme"
          >
            <span className="inline-block i-bolt:chat scale-110" />
            Start new chat
          </a>
        </div>
        <div className="px-4 mb-2">
          <ProjectsList />
        </div>
        <div className="text-bolt-elements-textPrimary font-medium pl-6 pr-5 my-2">Your Chats</div>
        <div className="flex-1 overflow-scroll pl-4 pr-5 pb-5">
          {loadingFromDb && (
            <div className="pl-2 text-bolt-elements-textTertiary flex items-center gap-2">
              <div className="i-ph:spinner animate-spin" />
              Loading...
            </div>
          )}
          {!loadingFromDb && list.length === 0 && (
            <div className="pl-2 text-bolt-elements-textTertiary">No previous conversations</div>
          )}
          <DialogRoot open={dialogContent !== null}>
            {binDates(list).map(({ category, items }) => (
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
