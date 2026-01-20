/**
 * Chat History Hook
 * Manages saving and loading chat history from database
 */

import { useEffect, useState, useCallback } from 'react';
import type { Message } from 'ai';

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
  anonymousId?: string;
  autoLoad?: boolean;
}

export function useChatHistory(options: UseChatHistoryOptions = {}) {
  const { userId, anonymousId, autoLoad = true } = options;
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
      console.warn('[useChatHistory] No userId or anonymousId provided');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (userId) params.set('userId', userId);
      if (effectiveAnonymousId) params.set('anonymousId', effectiveAnonymousId);
      params.set('limit', '50');

      console.log('[useChatHistory] Loading history with params:', Object.fromEntries(params));

      const response = await fetch(`/api/chat-history?${params}`);
      const data = (await response.json()) as { success: boolean; data?: ChatHistorySession[]; error?: string };

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load chat history');
      }

      console.log('[useChatHistory] History loaded:', data.data?.length || 0, 'sessions');
      setHistory(data.data || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load chat history';
      console.error('[useChatHistory] Load error:', errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [userId, effectiveAnonymousId]);

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
      console.log('[useChatHistory] Saving session:', sessionData.urlId);

      const response = await fetch('/api/chat-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
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

      console.log('[useChatHistory] Session saved successfully:', data.data?.id);
      setCurrentSessionId(data.data?.id || null);

      // Reload history to reflect changes
      await loadHistory();

      return data.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save chat';
      console.error('[useChatHistory] Save error:', errorMessage);
      throw err;
    }
  }, [userId, effectiveAnonymousId, loadHistory]);

  /**
   * Load messages for a specific session
   */
  const loadSession = useCallback(async (sessionId: string) => {
    try {
      console.log('[useChatHistory] Loading session:', sessionId);

      const response = await fetch(`/api/chat-history/${sessionId}`);
      const data = (await response.json()) as { success: boolean; data?: ChatHistorySession; error?: string };

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load session');
      }

      console.log('[useChatHistory] Session loaded:', data.data?.messages?.length || 0, 'messages');
      return data.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load session';
      console.error('[useChatHistory] Load session error:', errorMessage);
      throw err;
    }
  }, []);

  /**
   * Delete a chat session
   */
  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      console.log('[useChatHistory] Deleting session:', sessionId);

      const response = await fetch(`/api/chat-history/${sessionId}`, {
        method: 'DELETE',
      });

      const data = (await response.json()) as { success: boolean; error?: string };

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete session');
      }

      console.log('[useChatHistory] Session deleted successfully');

      // Reload history
      await loadHistory();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete session';
      console.error('[useChatHistory] Delete error:', errorMessage);
      throw err;
    }
  }, [loadHistory]);

  /**
   * Claim anonymous sessions for a logged-in user
   */
  const claimAnonymousSessions = useCallback(async (newUserId: string) => {
    if (!effectiveAnonymousId) {
      console.warn('[useChatHistory] No anonymous ID to claim');
      return;
    }

    try {
      console.log('[useChatHistory] Claiming anonymous sessions for user:', newUserId);

      const response = await fetch('/api/chat-history/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: newUserId,
          anonymousId: effectiveAnonymousId,
        }),
      });

      const data = (await response.json()) as { success: boolean; data?: { claimed: number }; error?: string };

      if (!response.ok) {
        throw new Error(data.error || 'Failed to claim sessions');
      }

      console.log('[useChatHistory] Sessions claimed:', data.data?.claimed || 0);

      // Reload history with new user ID
      await loadHistory();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to claim sessions';
      console.error('[useChatHistory] Claim error:', errorMessage);
      throw err;
    }
  }, [effectiveAnonymousId, loadHistory]);

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
    console.log('[useChatHistory] Created new anonymous ID:', anonymousId);
  }

  return anonymousId;
}
