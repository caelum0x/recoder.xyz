import { useLoaderData, useNavigate, useLocation } from '@remix-run/react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { atom } from 'nanostores';
import type { Message } from 'ai';
import { toast } from 'react-toastify';
import { workbenchStore, ensureContainerExists, clearContainerState } from '~/lib/stores/workbench';
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
import * as chatSessions from '~/lib/stores/chat-sessions';
import type { ChatSessionMetadata } from '~/lib/stores/chat-sessions';

// Re-export ensureContainerExists for backward compatibility
export { ensureContainerExists } from '~/lib/stores/workbench';

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
    // Also clear container state from centralized location
    clearContainerState(projectId);
  } else {
    restoredProjectIds.clear();
    fileRestorationPromises.clear();
    // Also clear container state from centralized location
    clearContainerState();
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

// ==================== SESSION MANAGEMENT API ====================

/**
 * Load all chat sessions for the current user
 * Populates the chat-sessions store
 */
export async function loadAllSessions(limit: number = 50): Promise<ChatSessionMetadata[]> {
  chatSessions.setLoading(true);
  chatSessions.setError(null);

  try {
    const user = getCurrentUser();
    const anonymousId = !user ? getOrCreateAnonymousId() : undefined;

    const params = new URLSearchParams();
    if (user?.id) params.set('userId', user.id);
    if (anonymousId) params.set('anonymousId', anonymousId);
    params.set('limit', String(limit));

    const response = await fetch(`/api/chat-history?${params}`);

    if (!response.ok) {
      throw new Error(`Failed to load sessions: ${response.status}`);
    }

    const result = await response.json() as { success: boolean; data?: any[] };

    if (!result.success || !result.data) {
      return [];
    }

    // Convert to session metadata and update store
    const sessions = result.data.map(chatSessions.apiResponseToMetadata);
    chatSessions.setSessions(sessions);

    return sessions;
  } catch (error) {
    console.error('Failed to load sessions:', error);
    chatSessions.setError(error instanceof Error ? error.message : 'Failed to load sessions');
    return [];
  } finally {
    chatSessions.setLoading(false);
  }
}

/**
 * Load sessions for a specific project
 */
export async function loadProjectSessions(projectId: string): Promise<ChatSessionMetadata[]> {
  // First load all sessions, then filter
  const allSessions = await loadAllSessions(100);
  return allSessions.filter(s => s.projectId === projectId);
}

/**
 * Create a new chat session
 */
export async function createNewSession(projectId?: string): Promise<string | null> {
  try {
    const user = getCurrentUser();
    const anonymousId = !user ? getOrCreateAnonymousId() : undefined;

    // Generate new session ID
    const newId = Date.now().toString();
    const urlId = newId;

    // Create session metadata
    const metadata: ChatSessionMetadata = {
      id: newId,
      urlId,
      projectId,
      title: 'New Conversation',
      messageCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isArchived: false,
      isFavorite: false,
      source: 'web',
    };

    // Add to store
    chatSessions.setSession(metadata);
    chatSessions.setActiveSession(newId);

    // Clear current chat state for new session
    clearSessionState();
    chatId.set(newId);

    return urlId;
  } catch (error) {
    console.error('Failed to create new session:', error);
    return null;
  }
}

/**
 * Rename a chat session (persisted to database)
 */
export async function renameSessionPersistent(sessionId: string, newTitle: string): Promise<boolean> {
  try {
    // Update local store immediately
    chatSessions.renameSession(sessionId, newTitle);

    // Get session urlId for API call
    const session = chatSessions.getSession(sessionId);
    if (!session) return false;

    // Persist to database - re-save with new title
    const user = getCurrentUser();
    const anonymousId = !user ? getOrCreateAnonymousId() : undefined;

    const response = await fetch('/api/chat-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user?.id,
        anonymousId,
        urlId: session.urlId,
        title: newTitle,
        description: newTitle,
        messages: [], // Empty - just updating metadata
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to rename session:', error);
    return false;
  }
}

/**
 * Delete a chat session (persisted to database)
 */
export async function deleteSessionPersistent(sessionId: string): Promise<boolean> {
  try {
    // Delete from database
    const response = await fetch('/api/chat-history', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });

    if (response.ok) {
      // Remove from local store
      chatSessions.removeSession(sessionId);

      // Clear active session if deleted
      if (chatSessions.activeSessionId.get() === sessionId) {
        chatSessions.setActiveSession(null);
      }

      return true;
    }

    return false;
  } catch (error) {
    console.error('Failed to delete session:', error);
    return false;
  }
}

/**
 * Archive a chat session
 */
export async function archiveSessionPersistent(sessionId: string): Promise<boolean> {
  try {
    chatSessions.archiveSession(sessionId);
    // Note: In a full implementation, this would persist to the database
    // For now, archived state is local-only
    return true;
  } catch (error) {
    console.error('Failed to archive session:', error);
    return false;
  }
}

/**
 * Duplicate a chat session
 */
export async function duplicateSession(sessionId: string): Promise<string | null> {
  try {
    const session = chatSessions.getSession(sessionId);
    if (!session) return null;

    // Create a new session with same metadata
    const newId = Date.now().toString();
    const newMetadata: ChatSessionMetadata = {
      ...session,
      id: newId,
      urlId: newId,
      title: `${session.title} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    chatSessions.setSession(newMetadata);
    return newId;
  } catch (error) {
    console.error('Failed to duplicate session:', error);
    return null;
  }
}

/**
 * Search across all conversations
 */
export function searchConversations(
  query: string,
  options?: {
    projectId?: string;
    includeArchived?: boolean;
    limit?: number;
  }
): Array<{ session: ChatSessionMetadata; score: number; matches: string[] }> {
  return chatSessions.searchSessions(query, options);
}

/**
 * Export a conversation as markdown
 */
export async function exportConversation(sessionId: string): Promise<void> {
  const session = chatSessions.getSession(sessionId);
  if (!session) {
    toast.error('Session not found');
    return;
  }

  try {
    // Load full messages for export
    const params = new URLSearchParams();
    params.set('urlId', session.urlId);

    const response = await fetch(`/api/chat-history?${params}`);
    if (!response.ok) {
      throw new Error('Failed to load conversation');
    }

    const result = await response.json() as { success: boolean; data?: any[] };
    const messages = result.data?.[0]?.messages || [];

    // Export as markdown
    chatSessions.exportSessionAsMarkdown(session, messages);
    toast.success('Conversation exported successfully');
  } catch (error) {
    console.error('Failed to export conversation:', error);
    toast.error('Failed to export conversation');
  }
}

/**
 * Export multiple conversations
 */
export async function exportMultipleConversations(sessionIds: string[]): Promise<void> {
  const sessions: Array<{ metadata: ChatSessionMetadata; messages: Message[] }> = [];

  for (const sessionId of sessionIds) {
    const session = chatSessions.getSession(sessionId);
    if (!session) continue;

    try {
      const params = new URLSearchParams();
      params.set('urlId', session.urlId);

      const response = await fetch(`/api/chat-history?${params}`);
      if (!response.ok) continue;

      const result = await response.json() as { success: boolean; data?: any[] };
      const messages = result.data?.[0]?.messages || [];

      sessions.push({ metadata: session, messages });
    } catch (error) {
      console.error(`Failed to load session ${sessionId}:`, error);
    }
  }

  if (sessions.length === 0) {
    toast.error('No conversations to export');
    return;
  }

  chatSessions.exportMultipleSessionsAsMarkdown(sessions);
  toast.success(`Exported ${sessions.length} conversations`);
}

/**
 * Get all unique tags across sessions
 */
export function getAllTags(): string[] {
  const sessions = Object.values(chatSessions.sessionsMap.get());
  const tagSet = new Set<string>();

  for (const session of sessions) {
    if (session.tags) {
      session.tags.forEach(tag => tagSet.add(tag));
    }
  }

  return Array.from(tagSet).sort();
}

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

async function markContainerReady(projectId: string) {
  try {
    const { workbenchStore } = await import('~/lib/stores/workbench');
    workbenchStore.setContainerReady(true);
    console.log('✅ [markContainerReady] Container marked as ready');

    // 🔧 AUTO-FIX: Check for errors after dev server starts
    // Run in background so we don't block the UI
    checkAndAutoFixErrors(projectId).catch(err => {
      console.warn('⚠️ [AutoFix] Background error check failed:', err);
    });
  } catch (e) {
    console.warn('Could not set container ready:', e);
  }
}

async function startDevServerOnly(projectId: string): Promise<boolean> {
  try {
    const state = await checkWorkspaceHasFiles(projectId);
    if (state.devServerRunning) {
      await markContainerReady(projectId);
      return true;
    }
  } catch (e) {
    // Ignore and try to start anyway
  }

  try {
    // Mark install complete so ActionRunner doesn't re-trigger install on new messages
    markNpmInstallComplete();

    const devResult = await dockerPost<{ ready?: boolean; port?: number }>(`/api/exec/${projectId}`, {
      command: 'bun run dev -- --port 5173 --host 0.0.0.0',
      cwd: '/workspace',
      background: true
    });

    console.log('✅ [startDevServerOnly] Dev server started in background');

    if (devResult.ready) {
      console.log(`✅ [startDevServerOnly] Dev server confirmed ready on port ${devResult.port}`);
      await markContainerReady(projectId);
      return true;
    }

    // Dev server started but not ready yet - poll the health endpoint
    console.log('⏳ [startDevServerOnly] Dev server building, polling for ready state...');
    const maxWaitMs = 45000;
    const pollInterval = 2000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const health = await dockerGet<{ ports?: Array<{ port: number; responding: boolean }> }>(
          `/api/preview/${projectId}/health`,
          { timeout: 10000 }
        );
        const readyPort = health.ports?.find(p => p.responding);
        if (readyPort) {
          console.log(`✅ [startDevServerOnly] Dev server ready on port ${readyPort.port}`);
          await markContainerReady(projectId);
          return true;
        }
      } catch {
        // Health check failed, continue polling
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Timeout - mark ready anyway so user can see error in preview
    console.warn('⚠️ [startDevServerOnly] Health check timeout, marking ready anyway');
    await markContainerReady(projectId);
    return true;
  } catch (err) {
    console.warn('⚠️ [startDevServerOnly] Failed to start dev server:', err);
    return false;
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
      
      const markReady = async () => {
        await markContainerReady(projectId);
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
              const health = await dockerGet<{ ports?: Array<{ port: number; responding: boolean }> }>(`/api/preview/${projectId}/health`, { timeout: 10000, skipRetry: true });
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
 * Check if container workspace already has files (persistent volume)
 * Returns true if files exist, false if restoration is needed
 */
async function checkWorkspaceHasFiles(projectId: string): Promise<{ hasFiles: boolean; hasPackageJson: boolean; devServerRunning: boolean }> {
  try {
    const result = await dockerGet<{
      hasFiles: boolean;
      fileCount: number;
      hasPackageJson: boolean;
      devServerRunning: boolean;
    }>(`/api/workspace-state/${projectId}`, { timeout: 10000 });
    
    return {
      hasFiles: result?.hasFiles || false,
      hasPackageJson: result?.hasPackageJson || false,
      devServerRunning: result?.devServerRunning || false,
    };
  } catch (e) {
    // Container might not exist yet - needs restoration
    return { hasFiles: false, hasPackageJson: false, devServerRunning: false };
  }
}

/**
 * Restore files to Docker container when loading a past chat
 * 🚀 OPTIMIZED: 
 * - Checks if workspace already has files (persistent volume) - SKIPS restoration if so
 * - Creates directories first, then writes files in parallel batches
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
        return false;
      }

      // 🚀 BULLETPROOF: Check if workspace volume already has files
      // This prevents re-restoring files on every page refresh
      const workspaceState = await checkWorkspaceHasFiles(projectId);
      
      if (workspaceState.hasFiles && workspaceState.hasPackageJson) {
        // Files already exist in persistent volume - skip restoration
        restoredProjectIds.add(projectId);
        
        // If dev server is already running, we're fully ready
        if (workspaceState.devServerRunning) {
          workbenchStore.setContainerReady(true);
        }
        
        return true;
      }

      // Filter out node_modules and other generated files that shouldn't be restored
      const filesToRestore = Object.entries(fileSnapshot).filter(([path]) => {
        const lowerPath = path.toLowerCase();
        return !lowerPath.includes('node_modules') && 
               !lowerPath.includes('.git/') &&
               !lowerPath.includes('package-lock.json') &&
               !lowerPath.includes('yarn.lock') &&
               !lowerPath.includes('pnpm-lock.yaml') &&
               !lowerPath.includes('bun.lockb');
      });
    
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

        // Normalize accidental workspace prefix (prevents /workspace/workspace/...)
        if (normalizedPath.startsWith('/workspace/')) {
          normalizedPath = normalizedPath.replace('/workspace/', '');
        } else if (normalizedPath.startsWith('workspace/')) {
          normalizedPath = normalizedPath.replace('workspace/', '');
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
          // Directory creation failed - continue anyway
        }
      }

      // 🚀 OPTIMIZATION: Write files in parallel batches (10 at a time for speed)
      const BATCH_SIZE = 10;
      let filesWritten = 0;
      for (let i = 0; i < normalizedFiles.length; i += BATCH_SIZE) {
        const batch = normalizedFiles.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async ({ fullPath, content }) => {
          try {
            await dockerPost<{ success: boolean }>(`/api/file/${projectId}`, { path: fullPath, content });
            filesWritten++;
          } catch (e) {
            // File write failed - continue with other files
          }
        }));
      }
    
      restoredProjectIds.add(projectId);
      return true;
    } catch (error) {
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
      const handleLoadedChat = async (chat: ChatHistoryItem): Promise<void> => {
        // Mark workbench as restored chat with the file paths AND messageIds from snapshot
        // This prevents ActionRunner from re-creating files that already exist
        // But allows NEW messages (after restoration) to create files normally
        const restoredFilePaths = chat.fileSnapshot ? Object.keys(chat.fileSnapshot) : [];
        const restoredMessageIds = chat.messages
          .filter(m => m.role === 'assistant')
          .map(m => m.id);
        workbenchStore.markAsRestoredChat(restoredFilePaths, restoredMessageIds);

        // Set state first
        setInitialMessages(chat.messages);
        setUrlId(chat.urlId);
        description.set(chat.description);
        chatId.set(chat.id);

        // Restore fileSnapshot to workbench AFTER state is set
        // Use setTimeout to ensure component is fully mounted AND WebContainer is ready
        if (chat.fileSnapshot && Object.keys(chat.fileSnapshot).length > 0) {
          setTimeout(async () => {
            try {
              // Update files store directly with the file snapshot
              const currentFiles = workbenchStore.files.get();
              const updatedFiles = { ...currentFiles };

              Object.entries(chat.fileSnapshot!).forEach(([path, content]) => {
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
              const projectId = chat.urlId || chat.id || mixedId;
              console.log(`📂 [useChatHistory] Restoring past chat files to Docker, projectId: ${projectId}`);

              // Check if package.json exists
              const hasPackageJson = Object.keys(chat.fileSnapshot!).some(path =>
                path.endsWith('package.json') || path === '/home/project/package.json'
              );

              // First restore files (this also creates the container)
              const dockerRestored = await restoreFilesToDocker(projectId, chat.fileSnapshot!);

              if (dockerRestored) {
                console.log('✅ [useChatHistory] Files restored to Docker container');

                // ✅ FIX: Reset restored chat flag AFTER restoration completes
                // so that new user messages get fresh ActionRunners without
                // the "skip npm install/dev" behavior.
                workbenchStore.resetRestoredChatFlag();

                // Check if install/dev server is needed BEFORE running it
                if (hasPackageJson) {
                  // If dev server is already running, just mark ready
                  try {
                    const state = await checkWorkspaceHasFiles(projectId);
                    if (state.devServerRunning) {
                      await markContainerReady(projectId);
                      return;
                    }
                  } catch {
                    // continue to install/dev start checks below
                  }

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
                      startDevServerOnly(projectId).catch(err => {
                        console.warn('⚠️ [useChatHistory] start dev server failed:', err);
                      });
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
                  checkAndAutoFixErrors(projectId).catch(err => {
                    console.warn('⚠️ [useChatHistory] Auto-fix failed:', err);
                  });
                }, 2000);
              } else {
                console.warn('⚠️ [useChatHistory] File restoration failed, skipping bun install');
                // Reset flag even on failure — don't poison new messages
                workbenchStore.resetRestoredChatFlag();
              }

              // console.log('✅ [useChatHistory] Workbench files restored successfully:', Object.keys(updatedFiles).length, 'files');
            } catch (error) {
              console.error('❌ [useChatHistory] Failed to restore workbench files:', error);
              // Reset flag on error so new messages aren't blocked
              workbenchStore.resetRestoredChatFlag();
              toast.error('Failed to restore project files');
            }
          }, 300); // 🚀 OPTIMIZATION: Reduced from 500ms to 300ms
        } else {
          // No fileSnapshot to restore — reset flag immediately
          workbenchStore.resetRestoredChatFlag();
        }

        // Safety net: if the restored-chat flag is still true after 15s, force-reset it.
        // This catches edge cases where restoration hangs or takes an unexpected path.
        setTimeout(() => {
          if (workbenchStore.isRestoredChat()) {
            console.warn('⚠️ [useChatHistory] Restored chat flag still set after 15s, force-resetting');
            workbenchStore.resetRestoredChatFlag();
          }
        }, 15000);

        // Set ready LAST
        setReady(true);
      };

      // Try loading from database first, then fallback to IndexedDB
      loadChatFromDatabase(mixedId)
        .then(async (dbChat): Promise<ChatHistoryItem | { success: boolean } | null> => {
          if (dbChat && dbChat.messages.length > 0) {
            // console.log('✅ Loaded chat from database:', dbChat.id);
            await handleLoadedChat(dbChat);
            return { success: true }; // ← FIXED: Return success marker to skip next .then()
          }

          // Fallback to IndexedDB
          if (db) {
            return await getMessages(db, mixedId);
          }
          return null;
        })
        .then(async (storedMessages: ChatHistoryItem | { success: boolean } | null) => {
          // Skip if database already loaded successfully
          if (storedMessages && typeof storedMessages === 'object' && 'success' in storedMessages) {
            // console.log('✅ Database load already handled, skipping IndexedDB fallback');
            return; // ← Don't navigate to home!
          }

          if (storedMessages && typeof storedMessages === 'object' && 'messages' in storedMessages && storedMessages.messages && storedMessages.messages.length > 0) {
            // console.log('✅ Loaded chat from IndexedDB:', storedMessages.id);
            await handleLoadedChat(storedMessages as ChatHistoryItem);
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

        // Update session store with latest metadata
        const firstUserMsg = messages.find(m => m.role === 'user');
        const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant');

        const sessionMetadata: ChatSessionMetadata = {
          id: finalChatId,
          urlId: finalUrlId,
          projectId: currentProjectId,
          title: finalDescription || 'Untitled Chat',
          description: finalDescription,
          messageCount: messages.length,
          createdAt: new Date().toISOString(), // Will be overwritten by existing session
          updatedAt: new Date().toISOString(),
          isArchived: false,
          isFavorite: false,
          source: 'web',
          firstUserMessage: firstUserMsg?.content.substring(0, 100),
          lastAssistantMessage: lastAssistantMsg?.content.substring(0, 100),
        };

        // Update or create session in store
        const existingSession = chatSessions.getSession(finalChatId);
        if (existingSession) {
          // Preserve existing metadata, update counts and timestamps
          chatSessions.updateSessionMetadata(finalChatId, {
            messageCount: messages.length,
            firstUserMessage: firstUserMsg?.content.substring(0, 100),
            lastAssistantMessage: lastAssistantMsg?.content.substring(0, 100),
          });
        } else {
          chatSessions.setSession(sessionMetadata);
        }

        // Set as active session
        chatSessions.setActiveSession(finalChatId);
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
