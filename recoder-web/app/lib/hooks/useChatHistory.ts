/**
 * Chat History Hook
 * Manages saving and loading chat history from database
 */

import { useEffect, useState, useCallback } from 'react';
import type { Message } from 'ai';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ChatHistory');

export interface ChatHistorySession {
  id: string;
  user_id?: string;
  anonymous_id?: string;
  title?: string;
  description?: string;
  url_id: string;
  total_messages: number;
  last_message_at?: Date;
  project_id?: string;
  artifact_id?: string;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
  messages?: Message[];
}

interface UseChatHistoryOptions {
  userId?: string;
  userEmail?: string;
  userName?: string;
  anonymousId?: string;
  autoLoad?: boolean;
}

export function useChatHistory(options: UseChatHistoryOptions = {}) {
  const { userId, userEmail, userName, anonymousId, autoLoad = true } = options;
  const [history, setHistory] = useState<ChatHistorySession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Generate anonymous ID if not provided
  const effectiveAnonymousId = anonymousId || getOrCreateAnonymousId();

  /**
   * Load chat history from database
   */
  const loadHistory = useCallback(async () => {
    if (!userId && !effectiveAnonymousId) {
      logger.warn('[useChatHistory] No userId or anonymousId provided');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (userId) params.set('userId', userId);
      if (userEmail) params.set('userEmail', userEmail);
      if (userName) params.set('userName', userName);
      if (effectiveAnonymousId) params.set('anonymousId', effectiveAnonymousId);
      params.set('limit', '50');

      logger.info('[useChatHistory] Loading history with params:', Object.fromEntries(params));

      const response = await fetch(`/api/chat-history?${params}`);
      const data = (await response.json()) as { success: boolean; data?: ChatHistorySession[]; error?: string };

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load chat history');
      }

      logger.info('[useChatHistory] History loaded:', data.data?.length || 0, 'sessions');
      setHistory(data.data || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load chat history';
      logger.error('[useChatHistory] Load error:', errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [userId, userEmail, userName, effectiveAnonymousId]);

  /**
   * Save or update a chat session
   */
  const saveSession = useCallback(async (sessionData: {
    urlId: string;
    title?: string;
    description?: string;
    messages: Message[];
    artifactId?: string;
  }) => {
    try {
      logger.info('[useChatHistory] Saving session:', sessionData.urlId);

      const response = await fetch('/api/chat-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          userEmail,
          userName,
          anonymousId: effectiveAnonymousId,
          urlId: sessionData.urlId,
          title: sessionData.title,
          description: sessionData.description,
          messages: sessionData.messages,
          artifactId: sessionData.artifactId,
        }),
      });

      const data = (await response.json()) as { success: boolean; data?: { id: string; sessionId: string; urlId: string }; error?: string };

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save chat');
      }

      logger.info('[useChatHistory] Session saved successfully:', data.data?.id);
      setCurrentSessionId(data.data?.id || null);

      // Reload history to reflect changes
      await loadHistory();

      return data.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save chat';
      logger.error('[useChatHistory] Save error:', errorMessage);
      throw err;
    }
  }, [userId, userEmail, userName, effectiveAnonymousId, loadHistory]);

  /**
   * Load messages for a specific session
   */
  const loadSession = useCallback(async (sessionId: string) => {
    try {
      logger.info('[useChatHistory] Loading session:', sessionId);

      const response = await fetch(`/api/chat-history/${sessionId}`);
      const data = (await response.json()) as { success: boolean; data?: ChatHistorySession; error?: string };

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load session');
      }

      logger.info('[useChatHistory] Session loaded:', data.data?.messages?.length || 0, 'messages');
      return data.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load session';
      logger.error('[useChatHistory] Load session error:', errorMessage);
      throw err;
    }
  }, []);

  /**
   * Delete a chat session
   */
  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      logger.info('[useChatHistory] Deleting session:', sessionId);

      const response = await fetch(`/api/chat-history/${sessionId}`, {
        method: 'DELETE',
      });

      const data = (await response.json()) as { success: boolean; error?: string };

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete session');
      }

      logger.info('[useChatHistory] Session deleted successfully');

      // Reload history
      await loadHistory();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete session';
      logger.error('[useChatHistory] Delete error:', errorMessage);
      throw err;
    }
  }, [loadHistory]);

  /**
   * Claim anonymous sessions for a logged-in user
   */
  const claimAnonymousSessions = useCallback(async (newUserId: string) => {
    if (!effectiveAnonymousId) {
      logger.warn('[useChatHistory] No anonymous ID to claim');
      return;
    }

    try {
      logger.info('[useChatHistory] Claiming anonymous sessions for user:', newUserId);

      const response = await fetch('/api/chat-history/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: newUserId,
          userEmail,
          userName,
          anonymousId: effectiveAnonymousId,
        }),
      });

      const data = (await response.json()) as { success: boolean; data?: { claimed: number }; error?: string };

      if (!response.ok) {
        throw new Error(data.error || 'Failed to claim sessions');
      }

      logger.info('[useChatHistory] Sessions claimed:', data.data?.claimed || 0);

      // Reload history with new user ID
      await loadHistory();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to claim sessions';
      logger.error('[useChatHistory] Claim error:', errorMessage);
      throw err;
    }
  }, [effectiveAnonymousId, userEmail, userName, loadHistory]);

  // Auto-load on mount
  useEffect(() => {
    if (autoLoad) {
      loadHistory();
    }
  }, [autoLoad, loadHistory]);

  return {
    history,
    loading,
    error,
    currentSessionId,
    loadHistory,
    saveSession,
    loadSession,
    deleteSession,
    claimAnonymousSessions,
    anonymousId: effectiveAnonymousId,
  };
}

/**
 * Get or create anonymous ID
 */
function getOrCreateAnonymousId(): string {
  const key = 'recoder_anonymous_id';
  let anonymousId = localStorage.getItem(key);

  if (!anonymousId) {
    anonymousId = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem(key, anonymousId);
    logger.info('[useChatHistory] Created new anonymous ID:', anonymousId);
  }

  return anonymousId;
}
