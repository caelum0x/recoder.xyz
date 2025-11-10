import { useLoaderData, useNavigate, useLocation } from '@remix-run/react';
import { useState, useEffect, useRef } from 'react';
import { atom } from 'nanostores';
import type { Message } from 'ai';
import { toast } from 'react-toastify';
import { workbenchStore } from '~/lib/stores/workbench';
import { getMessages, getNextId, getUrlId, openDatabase, setMessages } from './db';
import { getCurrentUser } from '~/utils/auth-utils';
import { getOrCreateAnonymousId } from '~/utils/anonymous-id';

export interface ChatHistoryItem {
  id: string;
  urlId?: string;
  description?: string;
  messages: Message[];
  timestamp: string;
  fileSnapshot?: Record<string, string>;
}

const persistenceEnabled = import.meta.env.VITE_DISABLE_PERSISTENCE !== 'true';

// Lazy initialization to avoid global scope async operations (Cloudflare Workers requirement)
let db: Awaited<ReturnType<typeof openDatabase>> | undefined;
let dbPromise: Promise<Awaited<ReturnType<typeof openDatabase>> | undefined> | undefined;

function getDatabase() {
  if (!persistenceEnabled) {
    return Promise.resolve(undefined);
  }
  
  if (!dbPromise) {
    dbPromise = openDatabase().catch((error) => {
      console.error('Failed to initialize database:', error);
      return undefined;
    });
    dbPromise.then((result) => {
      db = result;
    });
  }
  
  return dbPromise;
}

// Export a getter function to access the database (for compatibility with existing code)
export function getDB() {
  return db;
}

// Export async getter for new code that needs to ensure DB is initialized
export async function ensureDB() {
  await getDatabase();
  return db;
}

export const chatId = atom<string | undefined>(undefined);
export const description = atom<string | undefined>(undefined);

// Flag to enable/disable database saving
// Database operations happen via API calls, so this should be enabled when persistence is enabled
const USE_DATABASE = persistenceEnabled;

/**
 * Clear all session state - call this when starting a new conversation
 * This prevents session contamination between chats
 */
export function clearSessionState() {
  console.log('🧹 [clearSessionState] Clearing all session state atoms');
  chatId.set(undefined);
  description.set(undefined);
  // Clear workbench artifact list to prevent artifact ID contamination
  // firstArtifact is a getter that returns artifactIdList[0], so clear the array
  if (workbenchStore.artifactIdList.length > 0) {
    workbenchStore.artifactIdList = [];
    console.log('🧹 [clearSessionState] Cleared artifact ID list');
  }
}

// Initialize database on first import (but don't await - lazy load)
getDatabase().then(() => {
  console.log('🔧 [Persistence] Configuration:', {
    VITE_DISABLE_PERSISTENCE: import.meta.env.VITE_DISABLE_PERSISTENCE,
    persistenceEnabled,
    USE_DATABASE,
    dbInitialized: !!db,
  });
});

/**
 * Save chat to database API with retry logic
 */
async function saveChatToDatabase(
  urlId: string,
  messages: Message[],
  desc?: string,
  artifactId?: string,
  fileSnapshot?: Record<string, string>
): Promise<boolean> {
  if (!USE_DATABASE) {
    console.log('⚠️ [saveChatToDatabase] Database saving disabled (USE_DATABASE=false)');
    return false;
  }

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const user = getCurrentUser();
      const anonymousId = !user ? getOrCreateAnonymousId() : undefined;

      const fileCount = fileSnapshot ? Object.keys(fileSnapshot).length : 0;

      console.log(`💾 [saveChatToDatabase] Attempt ${attempt}/${maxRetries} - Preparing to save:`, {
        userId: user?.id,
        anonymousId,
        urlId,
        messageCount: messages.length,
        fileCount,
        descLength: desc?.length || 0,
        hasArtifact: !!artifactId,
      });

      const payload = {
        userId: user?.id,
        anonymousId,
        urlId,
        title: desc?.substring(0, 100),
        description: desc,
        messages,
        artifactId,
        fileSnapshot: fileSnapshot || {}, // Include file snapshot in metadata
      };

      console.log(`📤 [saveChatToDatabase] Sending request to /api/chat-history (attempt ${attempt})`);

      const response = await fetch('/api/chat-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      console.log('📥 [saveChatToDatabase] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const error = await response.json() as { error?: string };
        console.error(`❌ [saveChatToDatabase] Database save error (attempt ${attempt}):`, error);
        throw new Error(error.error || 'Failed to save to database');
      }

      const result = await response.json() as { success: boolean; data?: { sessionId: string; urlId: string } };
      console.log('✅ [saveChatToDatabase] Chat saved to database successfully!', {
        success: result.success,
        sessionId: result.data?.sessionId,
        urlId: result.data?.urlId,
        fileCount,
        attempt,
      });
      return true;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`❌ [saveChatToDatabase] Attempt ${attempt}/${maxRetries} failed:`, lastError.message);

      // If not the last attempt, wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s...
        console.log(`⏳ [saveChatToDatabase] Waiting ${delayMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  // All retries failed
  console.error('❌ [saveChatToDatabase] All retry attempts exhausted:', lastError?.message);
  if (lastError instanceof Error) {
    console.error('❌ [saveChatToDatabase] Final error details:', lastError.message, lastError.stack);
  }
  return false;
}

/**
 * Load chat from database API
 */
async function loadChatFromDatabase(mixedId: string): Promise<ChatHistoryItem | null> {
  if (!USE_DATABASE) {
    return null;
  }

  try {
    const user = getCurrentUser();
    const anonymousId = !user ? getOrCreateAnonymousId() : undefined;

    const params = new URLSearchParams();
    if (user?.id) params.set('userId', user.id);
    if (anonymousId) params.set('anonymousId', anonymousId);
    params.set('urlId', mixedId);

    console.log('📂 [loadChatFromDatabase] Loading chat:', mixedId);

    const response = await fetch(`/api/chat-history?${params}`);

    if (!response.ok) {
      throw new Error('Failed to load from database');
    }

    const result = await response.json() as { success: boolean; data?: any[] };
    const { data } = result;

    if (data && data.length > 0) {
      const chat = data[0];

      // Return chat data with fileSnapshot
      // Workbench restoration will happen in useEffect after component mounts
      return {
        id: chat.id,
        urlId: chat.urlId,
        description: chat.description,
        messages: chat.messages || [],
        timestamp: chat.timestamp,
        fileSnapshot: chat.fileSnapshot, // Pass fileSnapshot through
      };
    }

    return null;
  } catch (error) {
    console.error('❌ Database load failed:', error);
    return null;
  }
}

export function useChatHistory() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: mixedId } = useLoaderData<{ id?: string }>();

  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [ready, setReady] = useState<boolean>(false);
  const [urlId, setUrlId] = useState<string | undefined>();
  const previousPathRef = useRef<string>(location.pathname);

  // Clear session state when navigating to home page (new conversation)
  useEffect(() => {
    const currentPath = location.pathname;
    const previousPath = previousPathRef.current;

    // Detect navigation from chat to home or between different chats
    if (currentPath === '/' && previousPath !== '/') {
      console.log('🏠 [useChatHistory] Navigated to home - clearing session state');
      clearSessionState();
      setUrlId(undefined);
      setInitialMessages([]);
      setReady(false); // ← Force re-mount to ensure clean state
    } else if (currentPath.startsWith('/chat/') && previousPath.startsWith('/chat/') && currentPath !== previousPath) {
      console.log('🔄 [useChatHistory] Navigated between chats - clearing for fresh load');
      clearSessionState();
      setUrlId(undefined);
      // DON'T clear initialMessages or ready - the React key prop will force remount
      // and the useEffect will load fresh data which updates the component
    }

    previousPathRef.current = currentPath;
  }, [location.pathname]);

  useEffect(() => {
    if (!persistenceEnabled) {
      setReady(true);
      return;
    }

    // Initialize database if needed
    const initAndLoad = async () => {
      await getDatabase();
      
      if (!db && !USE_DATABASE) {
        setReady(true);

        if (persistenceEnabled) {
          console.warn('Chat persistence is unavailable - database not initialized');
        }

        return;
      }

      if (mixedId) {
      // Try loading from database first, then fallback to IndexedDB
      loadChatFromDatabase(mixedId)
        .then((dbChat) => {
          if (dbChat && dbChat.messages.length > 0) {
            console.log('✅ Loaded chat from database:', dbChat.id);
            
            // Set state first
            setInitialMessages(dbChat.messages);
            setUrlId(dbChat.urlId);
            description.set(dbChat.description);
            chatId.set(dbChat.id);
            
            // Restore fileSnapshot to workbench AFTER state is set
            // Use setTimeout to ensure component is fully mounted AND WebContainer is ready
            if (dbChat.fileSnapshot && Object.keys(dbChat.fileSnapshot).length > 0) {
              console.log('📂 [useChatHistory] Scheduling workbench restoration:',
                Object.keys(dbChat.fileSnapshot).length, 'files');

              setTimeout(() => {
                console.log('🔄 [useChatHistory] Restoring files to workbench...');

                try {
                  // Update files store directly with the file snapshot
                  const currentFiles = workbenchStore.files.get();
                  const updatedFiles = { ...currentFiles };

                  Object.entries(dbChat.fileSnapshot!).forEach(([path, content]) => {
                    updatedFiles[path] = {
                      type: 'file',
                      content: content as string,
                      isBinary: false,
                    };
                  });

                  workbenchStore.files.set(updatedFiles);
                  workbenchStore.setDocuments(updatedFiles);
                  workbenchStore.showWorkbench.set(true);
                  console.log('✅ [useChatHistory] Workbench files restored successfully:', Object.keys(updatedFiles).length, 'files');
                } catch (error) {
                  console.error('❌ [useChatHistory] Failed to restore workbench files:', error);
                  toast.error('Failed to restore project files');
                }
              }, 500); // Increased from 100ms to 500ms to allow WebContainer initialization
            }
            
            // Set ready LAST
            setReady(true);
            return { success: true }; // ← FIXED: Return success marker to skip next .then()
          }

          // Fallback to IndexedDB
          if (db) {
            return getMessages(db, mixedId);
          }
          return null;
        })
        .then((storedMessages) => {
          // Skip if database already loaded successfully
          if (storedMessages && typeof storedMessages === 'object' && 'success' in storedMessages) {
            console.log('✅ Database load already handled, skipping IndexedDB fallback');
            return; // ← Don't navigate to home!
          }

          if (storedMessages && storedMessages.messages && storedMessages.messages.length > 0) {
            console.log('✅ Loaded chat from IndexedDB:', storedMessages.id);
            setInitialMessages(storedMessages.messages);
            setUrlId(storedMessages.urlId);
            description.set(storedMessages.description);
            chatId.set(storedMessages.id);
            setReady(true);
          } else {
            console.warn('No messages found for chat:', mixedId);
            navigate(`/`, { replace: true });
            setReady(true);
          }
        })
        .catch((error) => {
          console.error('Failed to load chat history:', error);
          toast.error('Failed to load chat history');
          setReady(true);
        });
      } else {
        setReady(true);
      }
    };

    initAndLoad();
  }, [mixedId, navigate]);

  return {
    ready: !mixedId || ready,
    initialMessages,
    storeMessageHistory: async (messages: Message[]) => {
      if (messages.length === 0) {
        console.log('⚠️ Not storing history: no messages');
        return;
      }

      // CRITICAL: Prevent session contamination - if we're on home page, force clear state
      const currentPath = window.location.pathname;
      if (currentPath === '/' && urlId) {
        console.warn('⚠️ [useChatHistory] Session contamination detected! urlId exists on home page:', urlId);
        console.log('🧹 [useChatHistory] Force clearing contaminated state');
        setUrlId(undefined);
        clearSessionState();
        // Don't save - this is contaminated data from a previous session
        return;
      }

      console.log('💾 [useChatHistory] Storing chat history:', messages.length, 'messages');
      console.log('📊 [useChatHistory] Current state:', {
        chatId: chatId.get(),
        urlId,
        description: description.get(),
        hasFirstArtifact: !!workbenchStore.firstArtifact,
        persistenceEnabled,
        USE_DATABASE,
        currentPath,
      });

      const { firstArtifact } = workbenchStore;

      // Ensure database is initialized
      await getDatabase();

      // ALWAYS create chat ID if not set (removed initialMessages.length check to fix session contamination)
      // This ensures every conversation gets a fresh ID, even if user navigated from another chat
      if (!chatId.get()) {
        try {
          if (db) {
            const nextId = await getNextId(db);
            chatId.set(nextId);
            console.log('🆔 [useChatHistory] Created new chat ID from DB:', nextId);
          } else {
            const newId = Date.now().toString();
            chatId.set(newId);
            console.log('🆔 [useChatHistory] Created timestamp-based chat ID:', newId);
          }
        } catch (error) {
          // CRITICAL FIX: Ensure chatId is ALWAYS set even if DB fails
          const fallbackId = Date.now().toString();
          chatId.set(fallbackId);
          console.warn('⚠️ [useChatHistory] DB error, using fallback chat ID:', fallbackId, error);
        }
      } else {
        console.log('🆔 [useChatHistory] Using existing chat ID:', chatId.get());
      }

      // Set URL ID from artifact or chat ID
      // CRITICAL: Track urlId locally to avoid React state race condition
      let currentUrlId = urlId;

      if (!currentUrlId && firstArtifact?.id) {
        try {
          const newUrlId = db ? await getUrlId(db, firstArtifact.id) : firstArtifact.id;
          navigateChat(newUrlId);
          setUrlId(newUrlId);
          currentUrlId = newUrlId; // ← Store locally to avoid race condition
          console.log('🔗 [useChatHistory] Set URL ID from artifact:', newUrlId);
        } catch (error) {
          // Fallback: use artifact ID directly if getUrlId fails
          console.warn('⚠️ [useChatHistory] getUrlId failed, using artifact ID directly:', error);
          navigateChat(firstArtifact.id);
          setUrlId(firstArtifact.id);
          currentUrlId = firstArtifact.id;
        }
      } else if (!currentUrlId && chatId.get()) {
        // If no artifact but we have a chat ID, use that as URL ID
        const chatIdValue = chatId.get()!;
        navigateChat(chatIdValue);
        setUrlId(chatIdValue);
        currentUrlId = chatIdValue; // ← Store locally to avoid race condition
        console.log('🔗 [useChatHistory] Set URL ID from chat ID:', chatIdValue);
      }

      // CRITICAL FIX: Final safety net - if STILL no urlId, use chatId as absolute fallback
      if (!currentUrlId) {
        const finalChatId = chatId.get();
        if (finalChatId) {
          console.warn('⚠️ [useChatHistory] No urlId set, using chatId as final fallback:', finalChatId);
          navigateChat(finalChatId);
          setUrlId(finalChatId);
          currentUrlId = finalChatId;
        }
      }

      // Set description from artifact title or generate one
      if (!description.get()) {
        if (firstArtifact?.title) {
          description.set(firstArtifact.title);
          console.log('📝 [useChatHistory] Set description from artifact:', firstArtifact.title);
        } else if (messages.length > 0) {
          // Use first user message as description
          const firstUserMsg = messages.find(m => m.role === 'user');
          if (firstUserMsg) {
            const desc = firstUserMsg.content.substring(0, 60) + (firstUserMsg.content.length > 60 ? '...' : '');
            description.set(desc);
            console.log('📝 [useChatHistory] Set description from first message:', desc);
          }
        }
      }

      const finalChatId = chatId.get();
      const finalUrlId = currentUrlId; // ← Use local variable instead of state
      const finalDescription = description.get();

      if (!finalChatId || !finalUrlId) {
        console.error('❌ [useChatHistory] Cannot save: missing chat ID or URL ID', {
          finalChatId,
          finalUrlId,
        });
        return;
      }

      // Get workbench files snapshot - capture ALL file content
      const workbenchFiles = workbenchStore.files.get();
      const fileSnapshot: Record<string, string> = {};
      let fileCount = 0;
      let totalSize = 0;

      for (const [path, file] of Object.entries(workbenchFiles)) {
        if (file?.type === 'file' && file.content) {
          // Store the complete file content - don't truncate
          fileSnapshot[path] = file.content;
          fileCount++;
          totalSize += file.content.length;
        }
      }

      console.log('💾 [useChatHistory] Saving to storage:', {
        chatId: finalChatId,
        urlId: finalUrlId,
        description: finalDescription,
        messageCount: messages.length,
        fileCount,
        totalFileSize: `${(totalSize / 1024).toFixed(2)} KB`,
        hasArtifact: !!firstArtifact,
        willTryDatabase: USE_DATABASE,
        files: Object.keys(fileSnapshot).slice(0, 5).join(', ') + (fileCount > 5 ? '...' : ''),
      });

      // Don't modify the messages - save them as-is
      const enhancedMessages = messages;

      // Try database first with file snapshot
      const dbSaved = await saveChatToDatabase(
        finalUrlId,
        enhancedMessages,
        finalDescription,
        firstArtifact?.id,
        fileSnapshot
      );

      if (dbSaved) {
        console.log('✅ [useChatHistory] Chat history saved to database successfully!');
      }

      // Fallback to IndexedDB if database fails or not available
      if (!dbSaved && db) {
        try {
          await setMessages(db, finalChatId as string, messages, finalUrlId, finalDescription);
          console.log('✅ [useChatHistory] Chat history saved to IndexedDB (fallback)');
        } catch (error) {
          console.error('❌ [useChatHistory] Failed to save chat history to IndexedDB:', error);
          throw error;
        }
      }

      console.log('📊 [useChatHistory] Save complete. Database:', dbSaved ? 'YES' : 'NO', 'IndexedDB:', (!dbSaved && db) ? 'YES' : 'NO');
    },
  };
}

function navigateChat(nextId: string) {
  /**
   * FIXME: Using the intended navigate function causes a rerender for <Chat /> that breaks the app.
   *
   * `navigate(`/chat/${nextId}`, { replace: true });`
   */
  const url = new URL(window.location.href);
  url.pathname = `/chat/${nextId}`;

  window.history.replaceState({}, '', url);
}
