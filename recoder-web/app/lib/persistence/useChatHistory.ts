import { useLoaderData, useNavigate, useLocation } from '@remix-run/react';
import { useState, useEffect, useRef } from 'react';
import { atom } from 'nanostores';
import type { Message } from 'ai';
import { toast } from 'react-toastify';
import { workbenchStore } from '~/lib/stores/workbench';
import { getMessages, getNextId, getUrlId, openDatabase, setMessages } from './db';
import { getCurrentUser, getCurrentUserAsync, initSession } from '~/utils/auth-utils';
import { useAuth } from '~/lib/contexts/AuthContext';
import { getOrCreateAnonymousId } from '~/utils/anonymous-id';
import { getCurrentUserId } from '~/lib/stores/user';
import { resetGlobalActionState, markNpmInstallComplete } from '~/lib/runtime/action-runner';
import { fetchProjectErrors } from '~/lib/hooks/useErrors';
import { formatErrorsForAI } from '~/lib/services/auto-fix';
import { canAutoFix, setAutoFixing } from '~/lib/stores/errors';
import { dockerPost, dockerGet, DOCKER_URL } from '~/lib/services/docker-api';

// 🔒 Global flags to coordinate npm install across components
// These are module-level to prevent race conditions between different instances
let globalNpmInstallRunning = false;
let globalNpmInstallPromise: Promise<void> | null = null;

/**
 * 🔧 AUTO-FIX: Check for build errors and automatically trigger AI fix
 * Called after dev server starts to catch errors early
 */
async function checkAndAutoFixErrors(projectId: string): Promise<void> {
  // Wait a bit for dev server to fully initialize and show errors
  await new Promise(resolve => setTimeout(resolve, 3000));

  try {
    console.log('🔍 [AutoFix] Checking for build errors...');
    const errorResponse = await fetchProjectErrors(projectId);

    if (!errorResponse) {
      console.log('✅ [AutoFix] No errors detected');
      return;
    }

    const { errors, hasBlockingErrors } = errorResponse;

    if (!hasBlockingErrors || errors.length === 0) {
      console.log('✅ [AutoFix] No blocking errors');
      return;
    }

    // Check if we can still auto-fix (haven't exceeded max attempts)
    if (!canAutoFix()) {
      console.warn('⚠️ [AutoFix] Max auto-fix attempts reached, skipping');
      return;
    }

    console.log(`🔧 [AutoFix] Found ${errors.length} errors, triggering automatic fix...`);

    // Format errors for AI
    const prompt = formatErrorsForAI(errors);

    // Set auto-fixing state
    setAutoFixing(true);

    // Dispatch event to trigger AI fix (Chat.client.tsx listens for this)
    window.dispatchEvent(new CustomEvent('recoder:fix-errors', {
      detail: { prompt, automatic: true }
    }));

    console.log('🚀 [AutoFix] Automatic fix triggered');
  } catch (err) {
    console.error('❌ [AutoFix] Error checking for build errors:', err);
  }
}

// 🔒 Global container creation coordination - prevents duplicate container creation
const containerCreationPromises = new Map<string, Promise<boolean>>();

// 🔒 Global file restoration coordination - prevents duplicate restoration on HMR
const fileRestorationPromises = new Map<string, Promise<boolean>>();
const restoredProjectIds = new Set<string>();

/**
 * Clear restoration state for a project (call when navigating away)
 */
export function clearRestorationState(projectId?: string) {
  if (projectId) {
    restoredProjectIds.delete(projectId);
    fileRestorationPromises.delete(projectId);
    containerCreationPromises.delete(projectId);
  } else {
    restoredProjectIds.clear();
    fileRestorationPromises.clear();
    containerCreationPromises.clear();
  }
}

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
  // Reset container ready state
  workbenchStore.resetContainerReady();
  // Clear workbench artifact list to prevent artifact ID contamination
  // firstArtifact is a getter that returns artifactIdList[0], so clear the array
  if (workbenchStore.artifactIdList.length > 0) {
    workbenchStore.artifactIdList = [];
    // console.log('🧹 [clearSessionState] Cleared artifact ID list');
  }
}

// Initialize database on first import (but don't await - lazy load)
// SSR guard - only initialize in browser environment
if (typeof window !== 'undefined') {
  getDatabase().then(() => {
    // Database initialized
  });
}

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
  source?: 'web' | 'cli',
  authUser?: { id: string; email: string; name?: string | null } | null
): Promise<boolean> {
  if (!USE_DATABASE) {
    // console.log('⚠️ [saveChatToDatabase] Database saving disabled (USE_DATABASE=false)');
    return false;
  }

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Use passed authUser from React context, fallback to async fetch
      const user = authUser || await getCurrentUserAsync();
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

/**
 * Run bun install with coordination to prevent concurrent runs
 * 🚀 OPTIMIZED: Uses bun for faster installs (no peer dep issues)
 */
async function runNpmInstallWithCoordination(projectId: string): Promise<boolean> {
  // If already running, wait for it to complete
  if (globalNpmInstallRunning && globalNpmInstallPromise) {
    console.log('⏳ [runInstallWithCoordination] bun install already running, waiting...');
    await globalNpmInstallPromise;
    return true;
  }

  if (globalNpmInstallRunning) {
    console.log('⏭️ [runInstallWithCoordination] bun install already in progress, skipping');
    return false;
  }

  globalNpmInstallRunning = true;

  globalNpmInstallPromise = (async () => {
    try {
      // 🚀 OPTIMIZATION: Check if node_modules is valid before cleaning
      const checkResult = await dockerPost<{ output?: string }>(`/api/exec/${projectId}`, { command: 'test -d /workspace/node_modules/.bin && echo "valid" || echo "invalid"' });
      const isValid = checkResult.output?.includes('valid');

      if (!isValid) {
        console.log('🧹 [runInstallWithCoordination] Cleaning invalid node_modules...');
        await dockerPost(`/api/exec/${projectId}`, { command: 'rm -rf node_modules package-lock.json bun.lockb' });
      }

      // 🚀 OPTIMIZATION: Use bun for faster installs - --force handles peer deps
      console.log('📦 [runInstallWithCoordination] Running bun install...');
      let result: { output?: string; error?: string };

      try {
        result = await dockerPost<{ output?: string; error?: string }>(`/api/exec/${projectId}`, { command: 'bun install --force' });
      } catch (error) {
        console.warn('⚠️ [runInstallWithCoordination] bun install request failed, trying npm fallback...');
        try {
          result = await dockerPost<{ output?: string; error?: string }>(`/api/exec/${projectId}`, { command: 'npm install --legacy-peer-deps --prefer-offline --no-audit --no-fund' });
        } catch (npmError) {
          console.warn('⚠️ [runInstallWithCoordination] Install request failed');
          return;
        }
      }

      // Check for bun/npm errors
      if (result.error || result.output?.includes('error:') || result.output?.includes('npm ERR!')) {
        console.warn('⚠️ [runInstallWithCoordination] Install had errors:', result.error || result.output?.substring(0, 200));
        // Try npm fallback if bun failed
        if (!result.output?.includes('npm ERR!')) {
          console.log('📦 [runInstallWithCoordination] Trying npm fallback...');
          try {
            await dockerPost<{ output?: string; error?: string }>(`/api/exec/${projectId}`, { command: 'npm install --legacy-peer-deps --prefer-offline --no-audit --no-fund' });
            console.log('✅ [runInstallWithCoordination] npm fallback succeeded');
          } catch (e) {
            console.warn('⚠️ [runInstallWithCoordination] npm fallback failed');
          }
        }
      } else {
        console.log('✅ [runInstallWithCoordination] bun install completed');
      }

      // Mark install as complete globally so ActionRunner knows
      markNpmInstallComplete();

      // 🚀 OPTIMIZATION: Automatically start dev server after install
      console.log('🚀 [runInstallWithCoordination] Starting dev server...');
      
      // Helper to mark container ready and trigger auto-fix
      const markReady = async () => {
        try {
          const { workbenchStore } = await import('~/lib/stores/workbench');
          workbenchStore.setContainerReady(true);
          console.log('✅ [runInstallWithCoordination] Container marked as ready');

          // 🔧 AUTO-FIX: Check for errors after dev server starts
          // Run in background so we don't block the UI
          checkAndAutoFixErrors(projectId).catch(err => {
            console.warn('⚠️ [AutoFix] Background error check failed:', err);
          });
        } catch (e) {
          console.warn('Could not set container ready:', e);
        }
      };
      
      try {
        const devResult = await dockerPost<{ ready?: boolean; port?: number }>(`/api/exec/${projectId}`, {
          command: 'bun run dev -- --port 5173 --host 0.0.0.0',
          cwd: '/workspace',
          background: true
        });

        console.log('✅ [runInstallWithCoordination] Dev server started in background');

        if (devResult.ready) {
          console.log(`✅ [runInstallWithCoordination] Dev server confirmed ready on port ${devResult.port}`);
          await markReady();
        } else {
          // Dev server started but not ready yet - poll the health endpoint
          console.log('⏳ [runInstallWithCoordination] Dev server building, polling for ready state...');
          const maxWaitMs = 45000;
          const pollInterval = 2000;
          const startTime = Date.now();
          
          while (Date.now() - startTime < maxWaitMs) {
            try {
              const health = await dockerGet<{ ports?: Array<{ port: number; responding: boolean }> }>(`/api/preview/${projectId}/health`);
              const readyPort = health.ports?.find(p => p.responding);
              if (readyPort) {
                console.log(`✅ [runInstallWithCoordination] Dev server ready on port ${readyPort.port}`);
                await markReady();
                return;
              }
            } catch {
              // Health check failed, continue polling
            }
            await new Promise(resolve => setTimeout(resolve, pollInterval));
          }
          
          // Timeout - mark ready anyway so user can see error in preview
          console.warn('⚠️ [runInstallWithCoordination] Dev server health check timeout, marking ready anyway');
          await markReady();
        }
      } catch (err) {
        console.warn('⚠️ [runInstallWithCoordination] Dev server start failed:', err);
        await markReady(); // Mark ready anyway so UI isn't stuck
      }
    } catch (error: any) {
      console.error('❌ [runInstallWithCoordination] Install failed:', error);
    } finally {
      globalNpmInstallRunning = false;
      globalNpmInstallPromise = null;
    }
  })();

  await globalNpmInstallPromise;
  return true;
}

/**
 * Ensure container exists with coordination to prevent race conditions.
 * Multiple callers (terminal, file restore) share the same promise.
 * @exported for use by terminal.ts
 */
export async function ensureContainerExists(projectId: string): Promise<boolean> {
  // If already creating this container, wait for the existing promise
  const existingPromise = containerCreationPromises.get(projectId);
  if (existingPromise) {
    console.log('⏳ [ensureContainerExists] Waiting for existing container creation...');
    return existingPromise;
  }

  // Create new promise for this container
  const createPromise = (async (): Promise<boolean> => {
    try {
      const userId = getCurrentUserId();
      console.log('🐳 [ensureContainerExists] Creating container for', projectId);

      await dockerPost<{ success: boolean }>('/api/container', { projectId, userId });

      console.log('✅ [ensureContainerExists] Container ready');
      return true;
    } catch (error: any) {
      console.error('❌ [ensureContainerExists] Error:', error.message);
      return false;
    } finally {
      // Clean up after completion
      containerCreationPromises.delete(projectId);
    }
  })();

  containerCreationPromises.set(projectId, createPromise);
  return createPromise;
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

  // 🔒 Skip if already restored (prevents duplicate restoration on HMR)
  if (restoredProjectIds.has(projectId)) {
    console.log(`⏭️ [restoreFilesToDocker] Already restored ${projectId}, skipping`);
    return true;
  }

  // 🔒 Wait for existing restoration if in progress
  const existingPromise = fileRestorationPromises.get(projectId);
  if (existingPromise) {
    console.log(`⏳ [restoreFilesToDocker] Waiting for existing restoration of ${projectId}...`);
    return existingPromise;
  }

  // Create restoration promise
  const restorePromise = (async (): Promise<boolean> => {
    try {
      // Use coordinated container creation to avoid race conditions with terminal
      const containerReady = await ensureContainerExists(projectId);
      if (!containerReady) {
        console.error('❌ [restoreFilesToDocker] Container not available');
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
      try {
        await dockerPost<{ output?: string }>(`/api/exec/${projectId}`, { command: mkdirCmd });
      } catch (e) {
        console.warn('[restoreFilesToDocker] mkdir failed:', e);
      }
    }

    // 🚀 OPTIMIZATION: Write files in parallel batches (5 at a time to avoid overwhelming)
    const BATCH_SIZE = 5;
    let filesWritten = 0;
    for (let i = 0; i < normalizedFiles.length; i += BATCH_SIZE) {
      const batch = normalizedFiles.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async ({ fullPath, content }) => {
        try {
          await dockerPost<{ success: boolean }>(`/api/file/${projectId}`, { path: fullPath, content });
          filesWritten++;
        } catch (e) {
          console.warn(`Failed to write file: ${fullPath}`, e);
        }
      }));
    }
    console.log(`📁 [restoreFilesToDocker] Wrote ${filesWritten}/${normalizedFiles.length} files`);
    
      console.log(`✅ [restoreFilesToDocker] Files restored successfully`);
      restoredProjectIds.add(projectId);
      return true;
    } catch (error) {
      console.error('❌ [restoreFilesToDocker] Failed:', error);
      return false;
    } finally {
      fileRestorationPromises.delete(projectId);
    }
  })();

  fileRestorationPromises.set(projectId, restorePromise);
  return restorePromise;
}

export function useChatHistory() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: mixedId, projectId } = useLoaderData<{ id?: string; projectId?: string }>();
  const { user } = useAuth(); // Get authenticated user from context

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
      clearRestorationState(); // Clear file restoration locks
      setUrlId(undefined);
      setInitialMessages([]);
      setReady(false); // ← Force re-mount to ensure clean state
    } else if (currentPath.startsWith('/chat/') && previousPath.startsWith('/chat/') && currentPath !== previousPath) {
      // console.log('🔄 [useChatHistory] Navigated between chats - clearing for fresh load');
      clearSessionState();
      clearRestorationState(); // Clear file restoration locks for new chat
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
        .then(async (dbChat): Promise<ChatHistoryItem | { success: boolean } | null> => {
          if (dbChat && dbChat.messages.length > 0) {
            // console.log('✅ Loaded chat from database:', dbChat.id);

            // Mark workbench as restored chat with the file paths from snapshot
            // This prevents ActionRunner from re-creating files that already exist
            const restoredFilePaths = dbChat.fileSnapshot ? Object.keys(dbChat.fileSnapshot) : [];
            workbenchStore.markAsRestoredChat(restoredFilePaths);

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

                  // 🚀 OPTIMIZATION: Restore files FIRST, then run npm install
                  // Use the urlId as projectId for consistency
                  const projectId = dbChat.urlId || dbChat.id || mixedId;
                  console.log(`📂 [useChatHistory] Restoring past chat files to Docker, projectId: ${projectId}`);

                  // Check if package.json exists
                  const hasPackageJson = Object.keys(dbChat.fileSnapshot!).some(path =>
                    path.endsWith('package.json') || path === '/home/project/package.json'
                  );

                  // First restore files (this also creates the container)
                  const dockerRestored = await restoreFilesToDocker(projectId, dbChat.fileSnapshot!);

                  if (dockerRestored) {
                    console.log('✅ [useChatHistory] Files restored to Docker container');

                    // Check if install is needed BEFORE running it
                    if (hasPackageJson) {
                      // Check if node_modules exists and is recent
                      try {
                        const checkResult = await dockerPost<{ output?: string }>(`/api/exec/${projectId}`, { command: 'test -d node_modules && find node_modules -maxdepth 0 -mtime -1' });

                        if (!checkResult.output?.trim()) {
                          console.log('📦 [useChatHistory] Running bun install after file restoration...');
                          runNpmInstallWithCoordination(projectId).catch(err => {
                            console.warn('⚠️ [useChatHistory] bun install failed:', err);
                          });
                        } else {
                          console.log('⚡ [useChatHistory] Skipping install - node_modules is recent');
                        }
                      } catch (e) {
                        console.log('📦 [useChatHistory] Running bun install after file restoration...');
                        runNpmInstallWithCoordination(projectId).catch(err => {
                          console.warn('⚠️ [useChatHistory] bun install failed:', err);
                        });
                      }
                    }

                    // Trigger auto-fix after restoration
                    setTimeout(() => {
                      window.dispatchEvent(new CustomEvent('recoder:fix-errors'));
                    }, 2000);
                  } else {
                    console.warn('⚠️ [useChatHistory] File restoration failed, skipping bun install');
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
            return await getMessages(db, mixedId);
          }
          return null;
        })
        .then((storedMessages: ChatHistoryItem | { success: boolean } | null) => {
          // Skip if database already loaded successfully
          if (storedMessages && typeof storedMessages === 'object' && 'success' in storedMessages) {
            // console.log('✅ Database load already handled, skipping IndexedDB fallback');
            return; // ← Don't navigate to home!
          }

          if (storedMessages && typeof storedMessages === 'object' && 'messages' in storedMessages && storedMessages.messages && storedMessages.messages.length > 0) {
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
      // Pass the authenticated user from React context
      const dbSaved = await saveChatToDatabase(
        finalUrlId,
        enhancedMessages,
        finalDescription,
        firstArtifact?.id,
        fileSnapshot,
        currentProjectId,
        'web', // Mark as web source
        user // Pass authenticated user from context
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
