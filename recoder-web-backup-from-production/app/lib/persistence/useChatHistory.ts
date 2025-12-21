import { useLoaderData, useNavigate } from '@remix-run/react';
import { useState, useEffect } from 'react';
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
}

const persistenceEnabled = import.meta.env.VITE_DISABLE_PERSISTENCE !== 'true';

export const db = persistenceEnabled ? await openDatabase() : undefined;

export const chatId = atom<string | undefined>(undefined);
export const description = atom<string | undefined>(undefined);

// Flag to enable/disable database saving
// Database operations happen via API calls, so this should be enabled when persistence is enabled
const USE_DATABASE = persistenceEnabled;

// LOG REMOVED

/**
 * Save chat to database API
 */
async function saveChatToDatabase(
  urlId: string,
  messages: Message[],
  desc?: string,
  artifactId?: string,
  fileSnapshot?: Record<string, string>
): Promise<boolean> {
  if (!USE_DATABASE) {
    // LOG REMOVED
    return false;
  }

  try {
    const user = getCurrentUser();
    const anonymousId = !user ? getOrCreateAnonymousId() : undefined;

    const fileCount = fileSnapshot ? Object.keys(fileSnapshot).length : 0;

    // LOG REMOVED

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

    // LOG REMOVED

    const response = await fetch('/api/chat-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // LOG REMOVED

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ [saveChatToDatabase] Database save error:', error);
      throw new Error(error.error || 'Failed to save to database');
    }

    const result = await response.json();
    // LOG REMOVED
    return true;
  } catch (error) {
    console.error('❌ [saveChatToDatabase] Database save failed:', error);
    if (error instanceof Error) {
      console.error('❌ [saveChatToDatabase] Error details:', error.message, error.stack);
    }
    return false;
  }
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

    // LOG REMOVED

    const response = await fetch(`/api/chat-history?${params}`);

    if (!response.ok) {
      throw new Error('Failed to load from database');
    }

    const { data } = await response.json();

    if (data && data.length > 0) {
      const chat = data[0];

      // Restore file snapshot to workbench if available
      if (chat.fileSnapshot && Object.keys(chat.fileSnapshot).length > 0) {
        // LOG REMOVED

        // Import files into workbench
        Object.entries(chat.fileSnapshot).forEach(([path, content]) => {
          workbenchStore.setFile(path, {
            type: 'file',
            content: content as string,
            isBinary: false,
          });
        });

        workbenchStore.showWorkbench.set(true);
      }

      return {
        id: chat.id,
        urlId: chat.urlId,
        description: chat.description,
        messages: chat.messages || [],
        timestamp: chat.timestamp,
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
  const { id: mixedId } = useLoaderData<{ id?: string }>();

  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [ready, setReady] = useState<boolean>(false);
  const [urlId, setUrlId] = useState<string | undefined>();

  useEffect(() => {
    if (!persistenceEnabled) {
      setReady(true);
      return;
    }

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
            // LOG REMOVED
            setInitialMessages(dbChat.messages);
            setUrlId(dbChat.urlId);
            description.set(dbChat.description);
            chatId.set(dbChat.id);
            setReady(true);
            return;
          }

          // Fallback to IndexedDB
          if (db) {
            return getMessages(db, mixedId);
          }
          return null;
        })
        .then((storedMessages) => {
          if (storedMessages && storedMessages.messages.length > 0) {
            // LOG REMOVED
            setInitialMessages(storedMessages.messages);
            setUrlId(storedMessages.urlId);
            description.set(storedMessages.description);
            chatId.set(storedMessages.id);
          } else if (!initialMessages.length) {
            console.warn('No messages found for chat:', mixedId);
            navigate(`/`, { replace: true });
          }

          setReady(true);
        })
        .catch((error) => {
          console.error('Failed to load chat history:', error);
          toast.error('Failed to load chat history');
          setReady(true);
        });
    } else {
      setReady(true);
    }
  }, [mixedId, navigate]);

  return {
    ready: !mixedId || ready,
    initialMessages,
    storeMessageHistory: async (messages: Message[]) => {
      if (messages.length === 0) {
        // LOG REMOVED
        return;
      }

      // LOG REMOVED
      // LOG REMOVED

      const { firstArtifact } = workbenchStore;

      // Set chat ID immediately if not set
      if (initialMessages.length === 0 && !chatId.get()) {
        if (db) {
          const nextId = await getNextId(db);
          chatId.set(nextId);
          // LOG REMOVED
        } else {
          chatId.set(Date.now().toString());
          // LOG REMOVED
        }
      }

      // Set URL ID from artifact or chat ID
      if (!urlId && firstArtifact?.id) {
        const newUrlId = db ? await getUrlId(db, firstArtifact.id) : firstArtifact.id;
        navigateChat(newUrlId);
        setUrlId(newUrlId);
        // LOG REMOVED
      } else if (!urlId && chatId.get()) {
        // If no artifact but we have a chat ID, use that as URL ID
        const chatIdValue = chatId.get()!;
        navigateChat(chatIdValue);
        setUrlId(chatIdValue);
        // LOG REMOVED
      }

      // Set description from artifact title or generate one
      if (!description.get()) {
        if (firstArtifact?.title) {
          description.set(firstArtifact.title);
          // LOG REMOVED
        } else if (messages.length > 0) {
          // Use first user message as description
          const firstUserMsg = messages.find(m => m.role === 'user');
          if (firstUserMsg) {
            const desc = firstUserMsg.content.substring(0, 60) + (firstUserMsg.content.length > 60 ? '...' : '');
            description.set(desc);
            // LOG REMOVED
          }
        }
      }

      const finalChatId = chatId.get();
      const finalUrlId = urlId;
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

      // LOG REMOVED

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
        // LOG REMOVED
      }

      // Fallback to IndexedDB if database fails or not available
      if (!dbSaved && db) {
        try {
          await setMessages(db, finalChatId as string, messages, finalUrlId, finalDescription);
          // LOG REMOVED
        } catch (error) {
          console.error('❌ [useChatHistory] Failed to save chat history to IndexedDB:', error);
          throw error;
        }
      }

      // LOG REMOVED
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
