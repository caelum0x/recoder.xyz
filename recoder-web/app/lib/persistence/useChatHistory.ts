import { useLoaderData, useNavigate, useLocation } from '@remix-run/react';
import { useState, useEffect, useRef } from 'react';
import { atom } from 'nanostores';
import type { Message } from 'ai';
import { toast } from 'react-toastify';
import { workbenchStore } from '~/lib/stores/workbench';
import { getMessages, getNextId, getUrlId, openDatabase, setMessages } from './db';
import { getCurrentUser } from '~/utils/auth-utils';
import { getOrCreateAnonymousId } from '~/utils/anonymous-id';
import { getCurrentUserId } from '~/lib/stores/user';
import { resetGlobalActionState } from '~/lib/runtime/action-runner';

// 🔒 Global flags to coordinate npm install across components
// These are module-level to prevent race conditions between different instances
let globalNpmInstallRunning = false;
let globalNpmInstallPromise: Promise<void> | null = null;

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
 * Reset global npm install flags - call this when starting a new conversation
 */
export function resetNpmInstallFlags() {
  globalNpmInstallRunning = false;
  globalNpmInstallPromise = null;
}

/**
 * Clear all session state - call this when starting a new conversation
 * This prevents session contamination between chats
 */
export function clearSessionState() {
  // console.log('🧹 [clearSessionState] Clearing all session state atoms');
  chatId.set(undefined);
  description.set(undefined);
  // Reset all global action flags (npm install, auto-install, etc.)
  resetNpmInstallFlags();
  resetGlobalActionState(); // Also reset ActionRunner's global state
  // Reset workbench restored chat flag
  workbenchStore.resetRestoredChatFlag();
  // Clear workbench artifact list to prevent artifact ID contamination
  // firstArtifact is a getter that returns artifactIdList[0], so clear the array
  if (workbenchStore.artifactIdList.length > 0) {
    workbenchStore.artifactIdList = [];
    // console.log('🧹 [clearSessionState] Cleared artifact ID list');
  }
}

// Initialize database on first import (but don't await - lazy load)
getDatabase().then(() => {
  // Database initialized
});

/**
 * Save chat to database API with retry logic
 */
async function saveChatToDatabase(
  urlId: string,
  messages: Message[],
  desc?: string,
  artifactId?: string,
  fileSnapshot?: Record<string, string>,
  projectId?: string,
  source?: 'web' | 'cli'
): Promise<boolean> {
  if (!USE_DATABASE) {
    // console.log('⚠️ [saveChatToDatabase] Database saving disabled (USE_DATABASE=false)');
    return false;
  }

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const user = getCurrentUser();
      const anonymousId = !user ? getOrCreateAnonymousId() : undefined;

      const fileCount = fileSnapshot ? Object.keys(fileSnapshot).length : 0;

      const payload = {
        userId: user?.id,
        anonymousId,
        urlId,
        title: desc?.substring(0, 100),
        description: desc,
        messages,
        artifactId,
        fileSnapshot: fileSnapshot || {},
        projectId,
        source: source || 'web',
      };

      // console.log(`📤 [saveChatToDatabase] Sending request to /api/chat-history (attempt ${attempt})`);

      const response = await fetch('/api/chat-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // console.log('📥 [saveChatToDatabase] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const error = await response.json() as { error?: string };
        console.error(`❌ [saveChatToDatabase] Database save error (attempt ${attempt}):`, error);
        throw new Error(error.error || 'Failed to save to database');
      }

      const result = await response.json() as { success: boolean; data?: { sessionId: string; urlId: string } };
      return true;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`❌ [saveChatToDatabase] Attempt ${attempt}/${maxRetries} failed:`, lastError.message);

      // If not the last attempt, wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s...
        // console.log(`⏳ [saveChatToDatabase] Waiting ${delayMs}ms before retry...`);
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

    // console.log('📂 [loadChatFromDatabase] Loading chat:', mixedId);

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

const DOCKER_URL = import.meta.env.VITE_DOCKER_BACKEND_URL || null;

/**
 * Run npm install with coordination to prevent concurrent runs
 * 🚀 OPTIMIZED: Uses fast npm options and automatically starts dev server
 */
async function runNpmInstallWithCoordination(projectId: string): Promise<boolean> {
  // If already running, wait for it to complete
  if (globalNpmInstallRunning && globalNpmInstallPromise) {
    console.log('⏳ [runNpmInstallWithCoordination] npm install already running, waiting...');
    await globalNpmInstallPromise;
    return true;
  }
  
  if (globalNpmInstallRunning) {
    console.log('⏭️ [runNpmInstallWithCoordination] npm install already in progress, skipping');
    return false;
  }
  
  globalNpmInstallRunning = true;
  
  globalNpmInstallPromise = (async () => {
    try {
      // 🚀 OPTIMIZATION: Check if node_modules is valid before cleaning
      const checkRes = await fetch(`${DOCKER_URL}/api/exec/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'test -d /workspace/node_modules/.bin && echo "valid" || echo "invalid"' }),
        signal: AbortSignal.timeout(5000),
      });
      
      const checkResult = await checkRes.json() as { output?: string };
      const isValid = checkResult.output?.includes('valid');
      
      if (!isValid) {
        console.log('🧹 [runNpmInstallWithCoordination] Cleaning invalid node_modules...');
        await fetch(`${DOCKER_URL}/api/exec/${projectId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: 'rm -rf node_modules package-lock.json' }),
          signal: AbortSignal.timeout(30000),
        });
      }
      
      // 🚀 OPTIMIZATION: Use faster npm install options
      console.log('📦 [runNpmInstallWithCoordination] Running optimized npm install...');
      const installRes = await fetch(`${DOCKER_URL}/api/exec/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'npm install --prefer-offline --no-audit --no-fund --loglevel=error' }),
        signal: AbortSignal.timeout(120000), // 2 minute timeout for install
      });
      
      if (!installRes.ok) {
        console.warn('⚠️ [runNpmInstallWithCoordination] npm install request failed');
        return;
      }
      
      const result = await installRes.json() as { output?: string; error?: string };
      if (result.error) {
        console.warn('⚠️ [runNpmInstallWithCoordination] npm install error:', result.error);
      } else {
        console.log('✅ [runNpmInstallWithCoordination] npm install completed');
        
        // 🚀 OPTIMIZATION: Automatically start dev server after npm install
        console.log('🚀 [runNpmInstallWithCoordination] Starting dev server...');
        fetch(`${DOCKER_URL}/api/exec/${projectId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            command: 'npm run dev -- --port 5173 --host 0.0.0.0', 
            cwd: '/workspace',
            background: true 
          }),
        }).then((devRes) => {
          if (devRes.ok) {
            console.log('✅ [runNpmInstallWithCoordination] Dev server started in background');
          }
        }).catch((err) => {
          console.warn('⚠️ [runNpmInstallWithCoordination] Dev server start failed:', err);
        });
      }
    } catch (error) {
      console.error('❌ [runNpmInstallWithCoordination] npm install failed:', error);
    } finally {
      globalNpmInstallRunning = false;
      globalNpmInstallPromise = null;
    }
  })();
  
  await globalNpmInstallPromise;
  return true;
}

/**
 * Restore files to Docker container when loading a past chat
 * 🚀 OPTIMIZED: Creates directories first, then writes files in parallel batches
 * NOTE: npm install is handled separately with coordination
 */
async function restoreFilesToDocker(
  projectId: string, 
  fileSnapshot: Record<string, string>
): Promise<boolean> {
  if (!DOCKER_URL || !fileSnapshot || Object.keys(fileSnapshot).length === 0) {
    return false;
  }
  
  try {
    // First ensure container exists
    const userId = getCurrentUserId();
    const containerRes = await fetch(`${DOCKER_URL}/api/container`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, userId }),
      signal: AbortSignal.timeout(10000),
    });
    
    if (!containerRes.ok) {
      console.error('Failed to create Docker container for file restoration');
      return false;
    }
    
    // Filter out node_modules and other generated files that shouldn't be restored
    const filesToRestore = Object.entries(fileSnapshot).filter(([path]) => {
      const lowerPath = path.toLowerCase();
      return !lowerPath.includes('node_modules') && 
             !lowerPath.includes('.git/') &&
             !lowerPath.includes('package-lock.json') &&
             !lowerPath.includes('yarn.lock') &&
             !lowerPath.includes('pnpm-lock.yaml');
    });
    
    console.log(`📦 [restoreFilesToDocker] Restoring ${filesToRestore.length} files to container...`);
    
    // 🚀 OPTIMIZATION: Collect all unique directories first
    const directories = new Set<string>();
    const normalizedFiles: Array<{ fullPath: string; content: string }> = [];
    
    for (const [path, content] of filesToRestore) {
      // Normalize path - remove leading /home/project if present
      let normalizedPath = path;
      if (path.startsWith('/home/project/')) {
        normalizedPath = path.replace('/home/project/', '');
      } else if (path.startsWith('/home/project')) {
        normalizedPath = path.replace('/home/project', '');
      }
      
      const fullPath = normalizedPath.startsWith('/') ? `/workspace${normalizedPath}` : `/workspace/${normalizedPath}`;
      normalizedFiles.push({ fullPath, content });
      
      // Track directory
      const dir = fullPath.split('/').slice(0, -1).join('/');
      if (dir && dir !== '/workspace') {
        directories.add(dir);
      }
    }
    
    // 🚀 OPTIMIZATION: Create all directories in one command
    if (directories.size > 0) {
      const mkdirCmd = `mkdir -p ${Array.from(directories).map(d => `"${d}"`).join(' ')}`;
      await fetch(`${DOCKER_URL}/api/exec/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: mkdirCmd }),
      });
    }
    
    // 🚀 OPTIMIZATION: Write files in parallel batches (5 at a time to avoid overwhelming)
    const BATCH_SIZE = 5;
    for (let i = 0; i < normalizedFiles.length; i += BATCH_SIZE) {
      const batch = normalizedFiles.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async ({ fullPath, content }) => {
        const writeRes = await fetch(`${DOCKER_URL}/api/file/${projectId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: fullPath, content }),
        });
        if (!writeRes.ok) {
          console.warn(`Failed to write file: ${fullPath}`);
        }
      }));
    }
    
    console.log(`✅ [restoreFilesToDocker] Files restored successfully`);
    return true;
  } catch (error) {
    console.error('❌ [restoreFilesToDocker] Failed:', error);
    return false;
  }
}

export function useChatHistory() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: mixedId, projectId } = useLoaderData<{ id?: string; projectId?: string }>();

  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [ready, setReady] = useState<boolean>(false);
  const [urlId, setUrlId] = useState<string | undefined>();
  const [currentProjectId, setCurrentProjectId] = useState<string | undefined>(projectId);
  const previousPathRef = useRef<string>(location.pathname);

  // Clear session state when navigating to home page (new conversation)
  useEffect(() => {
    const currentPath = location.pathname;
    const previousPath = previousPathRef.current;

    // Detect navigation from chat to home or between different chats
    if (currentPath === '/' && previousPath !== '/') {
      // console.log('🏠 [useChatHistory] Navigated to home - clearing session state');
      clearSessionState();
      setUrlId(undefined);
      setInitialMessages([]);
      setReady(false); // ← Force re-mount to ensure clean state
    } else if (currentPath.startsWith('/chat/') && previousPath.startsWith('/chat/') && currentPath !== previousPath) {
      // console.log('🔄 [useChatHistory] Navigated between chats - clearing for fresh load');
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
            // console.log('✅ Loaded chat from database:', dbChat.id);
            
            // Mark workbench as restored chat - this prevents ActionRunner from auto-installing
            workbenchStore.markAsRestoredChat();
            
            // Set state first
            setInitialMessages(dbChat.messages);
            setUrlId(dbChat.urlId);
            description.set(dbChat.description);
            chatId.set(dbChat.id);
            
            // Restore fileSnapshot to workbench AFTER state is set
            // Use setTimeout to ensure component is fully mounted AND WebContainer is ready
            if (dbChat.fileSnapshot && Object.keys(dbChat.fileSnapshot).length > 0) {
              setTimeout(async () => {
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
                  
                  // 🚀 OPTIMIZATION: Restore files AND run npm install in PARALLEL
                  // Use the urlId as projectId for consistency
                  const projectId = dbChat.urlId || dbChat.id || mixedId;
                  console.log(`📂 [useChatHistory] Restoring past chat files to Docker, projectId: ${projectId}`);
                  
                  // Check if package.json exists before starting parallel operations
                  const hasPackageJson = Object.keys(dbChat.fileSnapshot!).some(path => 
                    path.endsWith('package.json') || path === '/home/project/package.json'
                  );
                  
                  // Start file restoration
                  const fileRestorePromise = restoreFilesToDocker(projectId, dbChat.fileSnapshot!);
                  
                  // If has package.json, start npm install in parallel (after brief delay for files to start writing)
                  let npmInstallPromise: Promise<boolean> | null = null;
                  if (hasPackageJson) {
                    console.log('📦 [useChatHistory] Starting npm install in parallel with file restoration...');
                    // Small delay to ensure package.json is written first
                    npmInstallPromise = new Promise((resolve) => setTimeout(resolve, 500))
                      .then(() => runNpmInstallWithCoordination(projectId));
                  }
                  
                  // Wait for both operations
                  const [dockerRestored] = await Promise.all([
                    fileRestorePromise,
                    npmInstallPromise || Promise.resolve(false)
                  ]);
                  
                  if (dockerRestored) {
                    console.log('✅ [useChatHistory] Files restored to Docker container');
                  }
                  
                  // console.log('✅ [useChatHistory] Workbench files restored successfully:', Object.keys(updatedFiles).length, 'files');
                } catch (error) {
                  console.error('❌ [useChatHistory] Failed to restore workbench files:', error);
                  toast.error('Failed to restore project files');
                }
              }, 300); // 🚀 OPTIMIZATION: Reduced from 500ms to 300ms
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
            // console.log('✅ Database load already handled, skipping IndexedDB fallback');
            return; // ← Don't navigate to home!
          }

          if (storedMessages && storedMessages.messages && storedMessages.messages.length > 0) {
            // console.log('✅ Loaded chat from IndexedDB:', storedMessages.id);
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
        // console.log('⚠️ Not storing history: no messages');
        return;
      }

      // CRITICAL: Prevent session contamination - if we're on home page, force clear state
      const currentPath = window.location.pathname;
      if (currentPath === '/' && urlId) {
        console.warn('⚠️ [useChatHistory] Session contamination detected! urlId exists on home page:', urlId);
        // console.log('🧹 [useChatHistory] Force clearing contaminated state');
        setUrlId(undefined);
        clearSessionState();
        // Don't save - this is contaminated data from a previous session
        return;
      }

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
            // console.log('🆔 [useChatHistory] Created new chat ID from DB:', nextId);
          } else {
            const newId = Date.now().toString();
            chatId.set(newId);
            // console.log('🆔 [useChatHistory] Created timestamp-based chat ID:', newId);
          }
        } catch (error) {
          // CRITICAL FIX: Ensure chatId is ALWAYS set even if DB fails
          const fallbackId = Date.now().toString();
          chatId.set(fallbackId);
          console.warn('⚠️ [useChatHistory] DB error, using fallback chat ID:', fallbackId, error);
        }
      } else {
        // console.log('🆔 [useChatHistory] Using existing chat ID:', chatId.get());
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
          // console.log('🔗 [useChatHistory] Set URL ID from artifact:', newUrlId);
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
        // console.log('🔗 [useChatHistory] Set URL ID from chat ID:', chatIdValue);
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
          // console.log('📝 [useChatHistory] Set description from artifact:', firstArtifact.title);
        } else if (messages.length > 0) {
          // Use first user message as description
          const firstUserMsg = messages.find(m => m.role === 'user');
          if (firstUserMsg) {
            const desc = firstUserMsg.content.substring(0, 60) + (firstUserMsg.content.length > 60 ? '...' : '');
            description.set(desc);
            // console.log('📝 [useChatHistory] Set description from first message:', desc);
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

      // Don't modify the messages - save them as-is
      const enhancedMessages = messages;

      // Try database first with file snapshot
      // Always mark chats from recoder-web as 'web' source
      const dbSaved = await saveChatToDatabase(
        finalUrlId,
        enhancedMessages,
        finalDescription,
        firstArtifact?.id,
        fileSnapshot,
        currentProjectId,
        'web' // Mark as web source
      );

      if (dbSaved) {
        // console.log('✅ [useChatHistory] Chat history saved to database successfully!');
      }

      // Fallback to IndexedDB if database fails or not available
      if (!dbSaved && db) {
        try {
          await setMessages(db, finalChatId as string, messages, finalUrlId, finalDescription);
          // console.log('✅ [useChatHistory] Chat history saved to IndexedDB (fallback)');
        } catch (error) {
          console.error('❌ [useChatHistory] Failed to save chat history to IndexedDB:', error);
          throw error;
        }
      }

      // console.log('📊 [useChatHistory] Save complete. Database:', dbSaved ? 'YES' : 'NO', 'IndexedDB:', (!dbSaved && db) ? 'YES' : 'NO');
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
